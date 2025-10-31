/**
 * @fileoverview Integration Domain Facade
 * Public API for integration with external systems
 */

import type { ConfigManager } from '../config/managers/config-manager.js';
import { AuthManager } from '../auth/managers/auth-manager.js';
import { ExportService } from './services/export.service.js';
import type {
	ExportTasksOptions,
	ExportResult
} from './services/export.service.js';
import { GitHubSyncService } from './services/github-sync.service.js';
import { GitHubSyncStateService } from './services/github-sync-state.service.js';
import { GitHubFieldMapper } from './services/github-field-mapper.js';
import { GitHubResilienceService } from './services/github-resilience.js';
import { ConflictResolutionService } from './services/conflict-resolution.service.js';
import { GitHubConfigService } from './services/github-config.service.js';
import { GitHubClient } from './clients/github-client.js';
import type { Task } from '../../common/types/index.js';
import type { GitHubSettings } from '../../common/interfaces/configuration.interface.js';

/**
 * GitHub sync options for CLI layer
 */
export interface GitHubSyncOptions {
	mode?: 'one-way' | 'two-way';
	dryRun?: boolean;
	force?: boolean;
	subtaskMode?: 'checklist' | 'separate-issues';
	repo?: string;
}

/**
 * GitHub sync status result for CLI layer
 */
export interface GitHubSyncStatusResult {
	configured: boolean;
	repository?: string;
	lastSyncTime?: string;
	syncState: 'in-sync' | 'out-of-sync' | 'syncing' | 'unknown';
	tasksMapped: number;
	tasksUnmapped: number;
	conflicts: Array<{
		taskId: string;
		issueNumber: number;
		conflictType: string;
		description: string;
	}>;
	pendingChanges: {
		localChanges: number;
		remoteChanges: number;
	};
}

/**
 * Conflict resolution strategy
 */
export type ConflictResolutionStrategy = 'local' | 'remote' | 'manual';

/**
 * Manual conflict resolution data
 */
export interface ManualConflictResolution {
	title?: string;
	description?: string;
	status?: string;
	priority?: string;
	[key: string]: any;
}

/**
 * Integration Domain - Unified API for external system integration
 */
export class IntegrationDomain {
	private exportService: ExportService;
	private configManager: ConfigManager;

	constructor(configManager: ConfigManager) {
		this.configManager = configManager;

		// Get singleton AuthManager instance
		const authManager = AuthManager.getInstance();
		this.exportService = new ExportService(configManager, authManager);
	}

	// ========== Export Operations ==========

	/**
	 * Export tasks to external systems (e.g., Hamster briefs)
	 */
	async exportTasks(options: ExportTasksOptions): Promise<ExportResult> {
		return this.exportService.exportTasks(options);
	}

	// ========== GitHub Integration Operations ==========

	/**
	 * Synchronize tasks with GitHub issues
	 * @param tasks Tasks to synchronize
	 * @param options Sync options
	 */
	async syncWithGitHub(
		tasks: Task[],
		options: GitHubSyncOptions = {}
	): Promise<any> {
		// Get GitHub configuration
		const config = this.configManager.getConfig();
		const githubSettings = config.github;

		if (!githubSettings?.enabled) {
			throw new Error(
				'GitHub integration is not configured. Run `tm github configure` first.'
			);
		}

		// Validate required settings
		if (!githubSettings.owner || !githubSettings.repo) {
			throw new Error(
				'GitHub owner and repository not configured. Run `tm github configure` first.'
			);
		}

		// Override repo if provided in options
		let owner: string = githubSettings.owner;
		let repo: string = githubSettings.repo;

		if (options.repo) {
			const [ownerOverride, repoOverride] = options.repo.split('/');
			if (!ownerOverride || !repoOverride) {
				throw new Error('Invalid repo format. Expected: owner/repo');
			}
			owner = ownerOverride;
			repo = repoOverride;
		}

		// Validate token exists
		if (!githubSettings.token) {
			throw new Error(
				'GitHub token is missing. Run `tm github configure` first.'
			);
		}

		// Initialize GitHub services with correct constructor signatures
		const githubClient = new GitHubClient({
			auth: githubSettings.token
		});

		const projectPath = this.configManager.getProjectRoot();
		const stateService = new GitHubSyncStateService(
			projectPath,
			owner,
			repo,
			{
				createBackup: true,
				validateSchema: true,
				autoRecoverFromBackup: true,
				maxHistoryAgeDays: 30
			}
		);

		const fieldMapper = new GitHubFieldMapper();
		const resilienceService = new GitHubResilienceService();
		const githubConfigService = new GitHubConfigService(this.configManager);
		const conflictResolutionService = new ConflictResolutionService(
			this.configManager,
			stateService,
			githubConfigService
		);

		const syncService = new GitHubSyncService(
			githubClient,
			stateService,
			fieldMapper,
			resilienceService,
			conflictResolutionService,
			owner,
			repo
		);

		// Build sync options
		const defaultSubtaskMode = githubSettings.subtaskMode || 'checklist';
		const subtaskMode = options.subtaskMode || defaultSubtaskMode;

		const syncOptions = {
			dryRun: options.dryRun || false,
			subtaskMode: subtaskMode,
			autoCreateLabels: true,
			syncDependencies: true,
			syncSubtasks: true
		};

		// Perform sync based on mode
		const mode = options.mode || 'one-way';

		if (mode === 'one-way') {
			// One-way sync: Task Master → GitHub
			return syncService.syncToGitHub(tasks, syncOptions);
		} else {
			// Two-way sync: Bidirectional
			return syncService.syncWithGitHub(tasks, syncOptions);
		}
	}

	/**
	 * Synchronize tasks to GitHub (one-way push)
	 * Simplified method for pushing local tasks to GitHub without bidirectional sync
	 * @param tasks Tasks to push to GitHub
	 * @param options Sync options (optional)
	 */
	async syncToGitHub(
		tasks: Task[],
		options: Partial<GitHubSyncOptions> = {}
	): Promise<any> {
		// Delegate to syncWithGitHub with mode forced to 'one-way'
		return this.syncWithGitHub(tasks, { ...options, mode: 'one-way' });
	}

	/**
	 * Resolve a conflict between local and remote task states
	 * @param taskId Task ID with the conflict
	 * @param strategy Resolution strategy ('local', 'remote', or 'manual')
	 * @param manualData Manual resolution data (required if strategy is 'manual')
	 */
	async resolveConflict(
		taskId: string,
		strategy: ConflictResolutionStrategy,
		manualData?: ManualConflictResolution
	): Promise<void> {
		// Get GitHub configuration
		const config = this.configManager.getConfig();
		const githubSettings = config.github;

		if (!githubSettings?.enabled) {
			throw new Error(
				'GitHub integration is not configured. Run `tm github configure` first.'
			);
		}

		// Validate required settings
		if (!githubSettings.owner || !githubSettings.repo) {
			throw new Error(
				'GitHub owner and repository not configured. Run `tm github configure` first.'
			);
		}

		// Initialize services with correct constructor signatures
		const projectPath = this.configManager.getProjectRoot();
		const owner: string = githubSettings.owner;
		const repo: string = githubSettings.repo;

		const stateService = new GitHubSyncStateService(
			projectPath,
			owner,
			repo,
			{
				createBackup: true,
				validateSchema: true,
				autoRecoverFromBackup: true,
				maxHistoryAgeDays: 30
			}
		);

		const githubConfigService = new GitHubConfigService(this.configManager);
		const conflictResolutionService = new ConflictResolutionService(
			this.configManager,
			stateService,
			githubConfigService
		);

		// Resolve the conflict based on strategy
		if (strategy === 'manual' && !manualData) {
			throw new Error('Manual resolution data is required for manual strategy');
		}

		// Create conflict info for resolution
		const conflictInfo: any = {
			taskId,
			issueNumber: 0, // Will be looked up by service
			conflictType: 'manual',
			localData: {},
			remoteData: {},
			strategy
		};

		await conflictResolutionService.resolveConflict(conflictInfo, strategy as any);
	}

	/**
	 * Configure GitHub integration settings
	 * @param settings Partial GitHub settings to update
	 */
	async configureGitHub(settings: Partial<GitHubSettings>): Promise<void> {
		// Get current configuration
		const config = this.configManager.getConfig();

		// Merge with existing GitHub settings
		const updatedGitHubSettings: GitHubSettings = {
			...(config.github || {}),
			...settings,
			enabled: settings.enabled !== undefined ? settings.enabled : true
		} as GitHubSettings;

		// Update configuration
		await this.configManager.updateConfig({
			github: updatedGitHubSettings
		});
	}

	/**
	 * Get GitHub sync status
	 * @param tasks Optional array of tasks to calculate unmapped count
	 */
	async getGitHubSyncStatus(tasks?: Task[]): Promise<GitHubSyncStatusResult> {
		// Get GitHub configuration
		const config = this.configManager.getConfig();
		const githubSettings = config.github;

		if (!githubSettings?.enabled) {
			return {
				configured: false,
				syncState: 'unknown',
				tasksMapped: 0,
				tasksUnmapped: 0,
				conflicts: [],
				pendingChanges: {
					localChanges: 0,
					remoteChanges: 0
				}
			};
		}

		// Validate required settings
		if (!githubSettings.owner || !githubSettings.repo) {
			throw new Error(
				'GitHub owner and repository not configured. Run `tm github configure` first.'
			);
		}

		// Initialize state service with correct constructor signature
		const projectPath = this.configManager.getProjectRoot();
		const owner: string = githubSettings.owner;
		const repo: string = githubSettings.repo;

		const stateService = new GitHubSyncStateService(
			projectPath,
			owner,
			repo,
			{
				createBackup: true,
				validateSchema: true,
				autoRecoverFromBackup: true,
				maxHistoryAgeDays: 30
			}
		);

		// Get synchronization statistics
		const stats = await stateService.getStats();

		// Determine sync state
		let syncState: GitHubSyncStatusResult['syncState'] = 'unknown';
		// Note: Check if there are any mappings to determine sync state
		if (stats.totalMappings > 0) {
			syncState = 'in-sync';
		}

		// Get conflicts for detailed reporting
		const conflicts = await stateService.getConflicts();
		const formattedConflicts = conflicts.map((conflict) => {
			// Generate human-readable description based on conflict type
			let description = 'Conflict detected';
			switch (conflict.type) {
				case 'title_mismatch':
					description = `Title differs: local="${conflict.localValue}" vs remote="${conflict.remoteValue}"`;
					break;
				case 'description_mismatch':
					description = 'Description has been modified in both Task Master and GitHub';
					break;
				case 'status_mismatch':
					description = `Status differs: local="${conflict.localValue}" vs remote="${conflict.remoteValue}"`;
					break;
				case 'assignee_mismatch':
					description = 'Assignees differ between Task Master and GitHub';
					break;
				case 'label_mismatch':
					description = 'Labels differ between Task Master and GitHub';
					break;
				case 'deleted_on_github':
					description = 'Task exists locally but issue was deleted on GitHub';
					break;
				case 'deleted_locally':
					description = 'Issue exists on GitHub but task was deleted locally';
					break;
				default:
					description = `Conflict of type: ${conflict.type}`;
			}

			return {
				taskId: conflict.taskId,
				issueNumber: conflict.issueNumber,
				conflictType: conflict.type,
				description
			};
		});

		// Calculate unmapped tasks if tasks array is provided
		let tasksUnmapped = 0;
		if (tasks) {
			const mappings = await stateService.getAllMappings();
			const mappedTaskIds = new Set(Object.keys(mappings));
			tasksUnmapped = tasks.filter(task => !mappedTaskIds.has(task.id)).length;
		}

		// Get change counts from change metadata
		const allChangeMetadata = await stateService.getAllChangeMetadata();
		const localChanges = allChangeMetadata.filter(meta => meta.hasLocalChanges).length;
		const remoteChanges = allChangeMetadata.filter(meta => meta.hasRemoteChanges).length;

		return {
			configured: true,
			repository: `${owner}/${repo}`,
			lastSyncTime: stats.lastSyncAt ?? undefined,
			syncState,
			tasksMapped: stats.totalMappings,
			tasksUnmapped,
			conflicts: formattedConflicts,
			pendingChanges: {
				localChanges,
				remoteChanges
			}
		};
	}

	// ========== Milestone Management Operations ==========

	/**
	 * Create a GitHub milestone
	 * @param title Milestone title
	 * @param options Optional milestone properties
	 * @returns Created milestone
	 */
	async createMilestone(
		title: string,
		options?: {
			description?: string;
			dueOn?: string;
			state?: 'open' | 'closed';
		}
	): Promise<any> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		// Check if milestone feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncMilestones) {
			throw new Error(
				'Milestone sync is disabled. Enable it in GitHub settings.'
			);
		}

		return client.createMilestone(owner, repo, {
			title,
			description: options?.description,
			due_on: options?.dueOn,
			state: options?.state
		});
	}

	/**
	 * Get a GitHub milestone by number
	 * @param milestoneNumber Milestone number
	 * @returns Milestone details
	 */
	async getMilestone(milestoneNumber: number): Promise<any> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		return client.getMilestone(owner, repo, milestoneNumber);
	}

	/**
	 * Update a GitHub milestone
	 * @param milestoneNumber Milestone number
	 * @param updates Milestone updates
	 * @returns Updated milestone
	 */
	async updateMilestone(
		milestoneNumber: number,
		updates: {
			title?: string;
			description?: string;
			dueOn?: string;
			state?: 'open' | 'closed';
		}
	): Promise<any> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		// Check if milestone feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncMilestones) {
			throw new Error(
				'Milestone sync is disabled. Enable it in GitHub settings.'
			);
		}

		return client.updateMilestone(owner, repo, milestoneNumber, {
			title: updates.title,
			description: updates.description,
			due_on: updates.dueOn,
			state: updates.state
		});
	}

	/**
	 * Delete a GitHub milestone
	 * @param milestoneNumber Milestone number
	 */
	async deleteMilestone(milestoneNumber: number): Promise<void> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		// Check if milestone feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncMilestones) {
			throw new Error(
				'Milestone sync is disabled. Enable it in GitHub settings.'
			);
		}

		return client.deleteMilestone(owner, repo, milestoneNumber);
	}

	/**
	 * List milestones in the configured repository
	 * @param options List options
	 * @returns Array of milestones
	 */
	async listMilestones(options?: {
		state?: 'open' | 'closed' | 'all';
		sort?: 'due_on' | 'completeness';
		direction?: 'asc' | 'desc';
	}): Promise<any[]> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		return client.listMilestones(owner, repo, options);
	}

	/**
	 * Helper method to get GitHub client and repository info
	 * @private
	 */
	private async getGitHubClientAndRepo(): Promise<{
		owner: string;
		repo: string;
		client: GitHubClient;
	}> {
		const config = this.configManager.getConfig();
		const githubSettings = config.github;

		if (!githubSettings?.enabled) {
			throw new Error(
				'GitHub integration is not configured. Run `tm github configure` first.'
			);
		}

		if (!githubSettings.owner || !githubSettings.repo) {
			throw new Error(
				'GitHub owner and repository not configured. Run `tm github configure` first.'
			);
		}

		if (!githubSettings.token) {
			throw new Error(
				'GitHub token is missing. Run `tm github configure` first.'
			);
		}

		const client = new GitHubClient({
			auth: githubSettings.token,
			baseUrl: githubSettings.baseUrl
		});

		return {
			owner: githubSettings.owner,
			repo: githubSettings.repo,
			client
		};
	}

	// ========== Project Board Management Operations ==========

	/**
	 * List projects in the configured repository
	 * @param options List options
	 * @returns Array of projects
	 */
	async listProjects(options?: {
		state?: 'open' | 'closed' | 'all';
	}): Promise<any[]> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		// Check if projects feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncProjects) {
			throw new Error(
				'Projects sync is disabled. Enable it in GitHub settings.'
			);
		}

		return client.listRepoProjects(owner, repo, options);
	}

	/**
	 * Add an issue to a project board
	 * @param projectId Project ID
	 * @param issueNumber Issue number
	 * @param columnId Column ID to add the card to
	 * @returns Created project card
	 */
	async addIssueToProject(
		projectId: number,
		issueNumber: number,
		columnId: number
	): Promise<any> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		// Check if projects feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncProjects) {
			throw new Error(
				'Projects sync is disabled. Enable it in GitHub settings.'
			);
		}

		// Validate project exists (projectId used for validation)
		await client.getProject(projectId);

		// Get the issue to find its ID
		const issue = await client.getIssue(owner, repo, issueNumber);

		// Create a card for the issue
		return client.createProjectCard(columnId, issue.id, 'Issue');
	}

	/**
	 * Move an issue card to a different column
	 * @param cardId Card ID
	 * @param columnId Target column ID
	 * @param position Position in the column ('top', 'bottom')
	 * @returns Updated card
	 */
	async moveIssueCard(
		cardId: number,
		columnId: number,
		position: 'top' | 'bottom' = 'bottom'
	): Promise<any> {
		const { client } = await this.getGitHubClientAndRepo();

		// Check if projects feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncProjects) {
			throw new Error(
				'Projects sync is disabled. Enable it in GitHub settings.'
			);
		}

		return client.moveProjectCard(cardId, position, columnId);
	}

	/**
	 * Get project columns
	 * @param projectId Project ID
	 * @returns Array of columns
	 */
	async getProjectColumns(projectId: number): Promise<any[]> {
		const { client } = await this.getGitHubClientAndRepo();

		// Check if projects feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncProjects) {
			throw new Error(
				'Projects sync is disabled. Enable it in GitHub settings.'
			);
		}

		return client.listProjectColumns(projectId);
	}

	/**
	 * Find column ID by name
	 * @param projectId Project ID
	 * @param columnName Column name to find
	 * @returns Column ID or null if not found
	 */
	async findColumnByName(
		projectId: number,
		columnName: string
	): Promise<number | null> {
		const columns = await this.getProjectColumns(projectId);

		const column = columns.find(
			(col) => col.name.toLowerCase() === columnName.toLowerCase()
		);

		return column ? column.id : null;
	}

	// ========== Assignee Management Operations ==========

	/**
	 * Validate if a GitHub username exists
	 * @param username GitHub username
	 * @returns True if username exists
	 */
	async validateGitHubUsername(username: string): Promise<boolean> {
		const { client } = await this.getGitHubClientAndRepo();

		// Check if assignees feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncAssignees) {
			throw new Error(
				'Assignee sync is disabled. Enable it in GitHub settings.'
			);
		}

		return client.validateUsername(username);
	}

	/**
	 * Sync assignees to a GitHub issue
	 * @param issueNumber Issue number
	 * @param assignees Array of GitHub usernames
	 * @returns Updated issue
	 */
	async syncIssueAssignees(
		issueNumber: number,
		assignees: string[]
	): Promise<any> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		// Check if assignees feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncAssignees) {
			throw new Error(
				'Assignee sync is disabled. Enable it in GitHub settings.'
			);
		}

		// Validate all usernames first
		const validationResults = await Promise.all(
			assignees.map(async (username) => ({
				username,
				valid: await client.validateUsername(username)
			}))
		);

		const invalidUsernames = validationResults
			.filter((result) => !result.valid)
			.map((result) => result.username);

		if (invalidUsernames.length > 0) {
			throw new Error(
				`Invalid GitHub usernames: ${invalidUsernames.join(', ')}`
			);
		}

		// Get current issue to determine which assignees to add/remove
		const issue = await client.getIssue(owner, repo, issueNumber);
		const currentAssignees = issue.assignees.map((a: any) => a.login);

		// Determine changes
		const toAdd = assignees.filter((a) => !currentAssignees.includes(a));
		const toRemove = currentAssignees.filter((a: string) => !assignees.includes(a));

		// Apply changes
		if (toRemove.length > 0) {
			await client.removeAssignees(owner, repo, issueNumber, toRemove);
		}

		if (toAdd.length > 0) {
			return client.addAssignees(owner, repo, issueNumber, toAdd);
		}

		return issue;
	}

	/**
	 * Add assignees to a GitHub issue
	 * @param issueNumber Issue number
	 * @param assignees Array of GitHub usernames to add
	 * @returns Updated issue
	 */
	async addIssueAssignees(
		issueNumber: number,
		assignees: string[]
	): Promise<any> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		// Check if assignees feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncAssignees) {
			throw new Error(
				'Assignee sync is disabled. Enable it in GitHub settings.'
			);
		}

		// Validate all usernames first
		const validationResults = await Promise.all(
			assignees.map(async (username) => ({
				username,
				valid: await client.validateUsername(username)
			}))
		);

		const invalidUsernames = validationResults
			.filter((result) => !result.valid)
			.map((result) => result.username);

		if (invalidUsernames.length > 0) {
			throw new Error(
				`Invalid GitHub usernames: ${invalidUsernames.join(', ')}`
			);
		}

		return client.addAssignees(owner, repo, issueNumber, assignees);
	}

	/**
	 * Remove assignees from a GitHub issue
	 * @param issueNumber Issue number
	 * @param assignees Array of GitHub usernames to remove
	 * @returns Updated issue
	 */
	async removeIssueAssignees(
		issueNumber: number,
		assignees: string[]
	): Promise<any> {
		const { owner, repo, client } = await this.getGitHubClientAndRepo();

		// Check if assignees feature is enabled
		const config = this.configManager.getConfig();
		if (!config.github?.features?.syncAssignees) {
			throw new Error(
				'Assignee sync is disabled. Enable it in GitHub settings.'
			);
		}

		return client.removeAssignees(owner, repo, issueNumber, assignees);
	}
}
