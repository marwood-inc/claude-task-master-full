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
			subtaskMode: subtaskMode as any,  // Type assertion to handle enum mismatch
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
			// TODO: Implement two-way sync when pull functionality is ready
			throw new Error('Two-way sync is not yet implemented');
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
	 */
	async getGitHubSyncStatus(): Promise<GitHubSyncStatusResult> {
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
		const conflicts: any[] = [];
		// TODO: Implement detailed conflict retrieval
		const formattedConflicts = conflicts.map((conflict) => ({
			taskId: conflict.taskId || 'unknown',
			issueNumber: conflict.issueNumber || 0,
			conflictType: conflict.type || 'unknown',
			description: conflict.details || 'Conflict detected'
		}));

		return {
			configured: true,
			repository: `${owner}/${repo}`,
			lastSyncTime: stats.lastSyncAt ?? undefined,
			syncState,
			tasksMapped: stats.totalMappings,
			tasksUnmapped: 0, // TODO: Calculate from task list
			conflicts: formattedConflicts,
			pendingChanges: {
				localChanges: 0, // TODO: Implement change detection
				remoteChanges: 0 // TODO: Implement change detection
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
}
