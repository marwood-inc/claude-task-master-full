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
import {
	GitHubValidationService,
	type ValidationResult
} from './services/github-validation.service.js';
import {
	GitHubAuthService,
	type TokenValidationResult,
	type PermissionCheckResult
} from './services/github-auth.service.js';
import { GitHubClient } from './clients/github-client.js';
import type { Task } from '../../common/types/index.js';
import type { GitHubSettings } from '../../common/interfaces/configuration.interface.js';
import type {
	ConflictInfo,
	ConflictResolution,
	ConflictField,
	FieldConflict,
	TimestampAnalysis,
	ConflictResolutionStrategy as InternalConflictResolutionStrategy
} from './types/github-conflict-types.js';
import type { SyncConflict } from './types/github-types.js';

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
	[key: string]: unknown;
}

/**
 * Repository access verification result
 */
export interface RepositoryAccessResult {
	accessible: boolean;
	permissions?: {
		admin: boolean;
		push: boolean;
		pull: boolean;
	};
	error?: string;
}

/**
 * Comprehensive GitHub configuration validation result
 * Returned by configureGitHubWithValidation for CLI display
 */
export interface ConfigureGitHubResult {
	/** Overall success status */
	success: boolean;
	/** Token validation result */
	tokenValidation: TokenValidationResult;
	/** Repository access verification result */
	repoAccess: RepositoryAccessResult;
	/** Token permissions check result */
	permissions: PermissionCheckResult;
}

/**
 * Integration Domain - Unified API for external system integration
 */
export class IntegrationDomain {
	private exportService: ExportService;
	private configManager: ConfigManager;

	// Cached stateless services (lazy initialization)
	// These services have no mutable state and can be safely reused across operations.
	// Caching improves performance by avoiding repeated instantiation while maintaining thread-safety
	// in Node.js's single-threaded execution model.
	private fieldMapper?: GitHubFieldMapper;
	private resilienceService?: GitHubResilienceService;
	private validationService?: GitHubValidationService;
	private authService?: GitHubAuthService;

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
	 * Validate GitHub sync options
	 * Primary validation method for CLI/MCP sync commands
	 *
	 * @param options - Sync options to validate
	 * @returns Validation result with errors, warnings, and metadata
	 * @example
	 * const result = tmCore.integration.validateGitHubSyncOptions({ mode: 'one-way' });
	 * if (!result.valid) {
	 *   console.error(result.errors);
	 * }
	 */
	validateGitHubSyncOptions(
		options: import('./services/github-validation.service.js').GitHubSyncOptions
	): ValidationResult {
		const config = this.configManager.getConfig().github;
		return this.getValidationService().validateSyncOptions(options, config);
	}



	/**
	 * Get GitHub validation service for advanced use cases
	 * Allows direct access to validation service for specialized validation needs
	 *
	 * @returns GitHubValidationService instance
	 * @example
	 * const validator = tmCore.integration.getGitHubValidationService();
	 * const result = validator.validateSyncOptions(options);
	 */
	getGitHubValidationService(): GitHubValidationService {
		return this.getValidationService();
	}

	/**
	 * Get GitHub config service for configuration management
	 * Provides access to configuration operations including feature serialization
	 *
	 * @returns GitHubConfigService instance
	 * @example
	 * const configService = tmCore.integration.getGitHubConfigService();
	 * const enabled = configService.serializeFeatures(features);
	 */
	getGitHubConfigService(): GitHubConfigService {
		return this.createGitHubConfigService();
	}

	/**
	 * Synchronize tasks with GitHub issues
	 * @param tasks Tasks to synchronize
	 * @param options Sync options
	 */
	async syncWithGitHub(
		tasks: Task[],
		options: GitHubSyncOptions = {}
	): Promise<any> {
		// Validate configuration and get credentials
		const { owner: defaultOwner, repo: defaultRepo, token } = this.validateGitHubConfig();

		// Handle repo override from options
		let owner = defaultOwner;
		let repo = defaultRepo;

		if (options.repo) {
			const [ownerOverride, repoOverride] = options.repo.split('/');
			if (!ownerOverride || !repoOverride) {
				throw new Error('Invalid repo format. Expected: owner/repo');
			}
			owner = ownerOverride;
			repo = repoOverride;
		}

		// Initialize GitHub services using shared helpers
		const githubClient = this.createGitHubClient(token);
		const stateService = this.createGitHubSyncStateService(owner, repo);
		const fieldMapper = this.getFieldMapper();
		const resilienceService = this.getResilienceService();
		const githubConfigService = this.createGitHubConfigService();
		const conflictResolutionService = this.createConflictResolutionService(
			stateService,
			githubConfigService
		);
		const syncService = this.createGitHubSyncService(
			githubClient,
			stateService,
			fieldMapper,
			resilienceService,
			conflictResolutionService,
			owner,
			repo
		);

		// Build sync options
		const config = this.configManager.getConfig();
		const defaultSubtaskMode = config.github?.subtaskMode || 'checklist';
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
		// Validate configuration
		const { owner, repo } = this.validateGitHubConfig();

		// Initialize services using shared helpers
		const stateService = this.createGitHubSyncStateService(owner, repo);

		// Lookup conflicts for this task from state
		const allConflicts = await stateService.getConflicts();
		const taskConflicts = allConflicts.filter((c) => c.taskId === taskId);

		// Check if task has mapping (synced with GitHub)
		const mapping = await stateService.getMapping(taskId);

		// Handle no mapping case
		if (!mapping) {
			throw new Error(
				`Task ${taskId} has not been synced to GitHub. Please run sync first.`
			);
		}

		// Validate conflicts exist
		if (taskConflicts.length === 0) {
			throw new Error(
				`No unresolved conflicts found for task ${taskId}. Use 'task-master github status' to view conflicts.`
			);
		}

		// Map simple strategy to internal strategy
		const mappedStrategy = this.mapSimpleStrategy(strategy);

		// Validate manual strategy requirements
		if (mappedStrategy === 'manual') {
			if (!manualData) {
				throw new Error('Manual resolution data is required for manual strategy');
			}

			// Validate manualData has at least one resolved field (not null or undefined)
			const resolvedFields = Object.keys(manualData).filter(
				(key) => manualData[key] !== undefined && manualData[key] !== null
			);
			if (resolvedFields.length === 0) {
				throw new Error(
					'Manual resolution must include at least one resolved field value'
				);
			}

			// Validate that all manual data keys are valid ConflictField values
			const validFields: ConflictField[] = [
				'title',
				'description',
				'status',
				'priority',
				'labels',
				'assignee',
				'dependencies',
				'subtasks',
				'milestone'
			];
			const invalidKeys = Object.keys(manualData).filter(
				(key) => !validFields.includes(key as ConflictField)
			);
			if (invalidKeys.length > 0) {
				throw new Error(
					`Invalid manual resolution fields: ${invalidKeys.join(', ')}. Valid fields are: ${validFields.join(', ')}`
				);
			}
		}

		// Initialize conflict resolution service using shared helpers
		const githubConfigService = this.createGitHubConfigService();
		const conflictResolutionService = this.createConflictResolutionService(
			stateService,
			githubConfigService
		);

		// Resolve all conflicts for this task with same strategy
		for (const syncConflict of taskConflicts) {
			// Convert SyncConflict to ConflictInfo
			const conflictInfo = this.convertToConflictInfo(syncConflict);

			// Build resolution object
			let resolution: ConflictResolution;

			if (mappedStrategy === 'manual' && manualData) {
				// Manual resolution - use provided data
				resolution = {
					strategy: mappedStrategy,
					resolvedAt: new Date().toISOString(),
					resolvedFields: manualData as Partial<Record<ConflictField, unknown>>,
					automatic: false
				};
			} else {
				// Automatic resolution - determine values based on strategy
				const resolvedFields: Partial<Record<ConflictField, unknown>> = {};

				for (const fieldConflict of conflictInfo.fieldConflicts) {
					if (mappedStrategy === 'last_write_wins_local') {
						resolvedFields[fieldConflict.field] = fieldConflict.localValue;
					} else if (mappedStrategy === 'last_write_wins_remote') {
						resolvedFields[fieldConflict.field] = fieldConflict.remoteValue;
					}
				}

				resolution = {
					strategy: mappedStrategy,
					resolvedAt: new Date().toISOString(),
					resolvedFields,
					automatic: true
				};
			}

			// Apply resolution
			const result = await conflictResolutionService.resolveConflict(
				conflictInfo,
				resolution
			);

			if (!result.success) {
				throw new Error(
					`Failed to resolve conflict for task ${taskId}: ${result.errors?.join(', ')}`
				);
			}

			// Mark as resolved in state
			await stateService.resolveConflict(taskId, syncConflict.issueNumber);
		}
	}

	/**
	 * Map simple CLI-friendly strategies to internal strategies
	 * @private
	 */
	private mapSimpleStrategy(
		strategy: ConflictResolutionStrategy
	): InternalConflictResolutionStrategy {
		// Map simple names to full strategy names
		if (strategy === 'local') return 'last_write_wins_local';
		if (strategy === 'remote') return 'last_write_wins_remote';
		return 'manual'; // strategy === 'manual'
	}

	/**
	 * Convert simple SyncConflict to enhanced ConflictInfo
	 * @private
	 */
	private convertToConflictInfo(syncConflict: SyncConflict): ConflictInfo {
		// Generate unique conflict ID
		const conflictId = `conflict_${syncConflict.taskId}_${syncConflict.issueNumber}_${Date.now()}`;

		// Map conflict type to field
		const fieldMap: Record<SyncConflict['type'], ConflictField> = {
			title_mismatch: 'title',
			description_mismatch: 'description',
			status_mismatch: 'status',
			assignee_mismatch: 'assignee',
			label_mismatch: 'labels',
			deleted_on_github: 'title', // Fallback to title for deletion conflicts
			deleted_locally: 'title' // Fallback to title for deletion conflicts
		};

		const field = fieldMap[syncConflict.type] || 'title';

		// Determine correct field conflict type based on sync conflict type
		let fieldConflictType: FieldConflict['type'];
		if (syncConflict.type === 'deleted_on_github') {
			fieldConflictType = 'deleted_remotely';
		} else if (syncConflict.type === 'deleted_locally') {
			fieldConflictType = 'deleted_locally';
		} else {
			fieldConflictType = 'value_mismatch';
		}

		// Build field conflict
		const fieldConflict: FieldConflict = {
			field,
			localValue: syncConflict.localValue,
			remoteValue: syncConflict.remoteValue,
			type: fieldConflictType,
			canAutoMerge: false
		};

		// Build timestamp analysis (minimal since SyncConflict has limited timestamp data)
		const timestampAnalysis: TimestampAnalysis = {
			localUpdatedAt: syncConflict.detectedAt,
			remoteUpdatedAt: syncConflict.detectedAt,
			lastSyncedAt: syncConflict.detectedAt,
			timeSinceLastSync: 0,
			recentSide: 'simultaneous',
			simultaneousEdit: true // Conservative assumption
		};

		// Map stored resolution strategy to suggested strategy
		let suggestedStrategy: InternalConflictResolutionStrategy = 'manual';
		if (syncConflict.resolutionStrategy === 'prefer_local') {
			suggestedStrategy = 'last_write_wins_local';
		} else if (syncConflict.resolutionStrategy === 'prefer_remote') {
			suggestedStrategy = 'last_write_wins_remote';
		}

		return {
			conflictId,
			taskId: syncConflict.taskId,
			issueNumber: syncConflict.issueNumber,
			detectedAt: syncConflict.detectedAt,
			severity: 'medium', // Default to medium severity
			fieldConflicts: [fieldConflict],
			timestampAnalysis,
			suggestedStrategy,
			canAutoResolve: syncConflict.resolutionStrategy !== 'manual'
		};
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
	 * Configure GitHub with comprehensive validation
	 * Validates token, repository access, and permissions before saving configuration
	 *
	 * This method orchestrates all GitHub configuration validation:
	 * 1. Validates the GitHub token and retrieves user information
	 * 2. Verifies repository access and permission levels
	 * 3. Checks token permissions and scopes
	 *
	 * Intended for interactive configuration workflows in CLI where detailed
	 * validation feedback is needed for display to users.
	 *
	 * @param token - GitHub personal access token
	 * @param owner - Repository owner (username or organization)
	 * @param repo - Repository name
	 * @returns Comprehensive validation result with token, repository, and permission information
	 *
	 * @example
	 * ```typescript
	 * const result = await tmCore.integration.configureGitHubWithValidation(
	 *   'ghp_xxxxx',
	 *   'myorg',
	 *   'myrepo'
	 * );
	 *
	 * if (result.success) {
	 *   console.log('Authenticated as:', result.tokenValidation.user.login);
	 *   console.log('Repository accessible:', result.repoAccess.accessible);
	 * } else {
	 *   console.error('Validation failed');
	 * }
	 * ```
	 */
	async configureGitHubWithValidation(
		token: string,
		owner: string,
		repo: string
	): Promise<ConfigureGitHubResult> {
		const authService = this.getAuthService();

		// 1. Validate token
		const tokenValidation = await authService.validateToken(token);

		// 2. Verify repository access
		const repoAccess = await authService.verifyRepositoryAccess(
			token,
			owner,
			repo
		);

		// 3. Check permissions
		const permissions = await authService.checkPermissions(token);

		// 4. Combine all results
		return {
			success: tokenValidation.valid && repoAccess.accessible,
			tokenValidation,
			repoAccess,
			permissions
		};
	}

	/**
	 * Get GitHub sync status
	 * @param tasks Optional array of tasks to calculate unmapped count
	 */
	async getGitHubSyncStatus(tasks?: Task[]): Promise<GitHubSyncStatusResult> {
		// Get GitHub configuration and check if enabled
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

		// Validate required settings (will throw if invalid)
		const { owner, repo } = this.validateGitHubConfig();

		// Initialize state service using shared helper
		const stateService = this.createGitHubSyncStateService(owner, repo);

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
		this.validateFeatureEnabled('Milestone sync', 'syncMilestones');

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
		this.validateFeatureEnabled('Milestone sync', 'syncMilestones');

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
		this.validateFeatureEnabled('Milestone sync', 'syncMilestones');

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
		// Validate configuration and get credentials
		const { owner, repo, token } = this.validateGitHubConfig();

		// Get optional baseUrl from config
		const config = this.configManager.getConfig();
		const baseUrl = config.github?.baseUrl;

		// Create client
		const client = new GitHubClient({
			auth: token,
			baseUrl
		});

		return {
			owner,
			repo,
			client
		};
	}

	/**
	 * Validate GitHub configuration is enabled and has required fields.
	 * @returns Validated configuration with owner, repo, and token
	 * @throws Error with user-friendly message if validation fails
	 * @private
	 */
	private validateGitHubConfig(): {
		owner: string;
		repo: string;
		token: string;
	} {
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

		return {
			owner: githubSettings.owner,
			repo: githubSettings.repo,
			token: githubSettings.token
		};
	}

	/**
	 * Check if a specific GitHub feature is enabled.
	 * @param featureName - Feature name for error message (e.g., "Milestone sync", "Projects sync")
	 * @param featureKey - Feature key in config (e.g., "syncMilestones", "syncProjects")
	 * @throws Error if feature is disabled
	 * @private
	 */
	private validateFeatureEnabled(
		featureName: string,
		featureKey: keyof GitHubSettings['features']
	): void {
		const config = this.configManager.getConfig();
		if (!config.github?.features?.[featureKey]) {
			throw new Error(
				`${featureName} is disabled. Enable it in GitHub settings.`
			);
		}
	}

	/**
	 * Validate GitHub usernames and throw if any are invalid
	 * @param client - GitHub client to use for validation
	 * @param assignees - Array of usernames to validate
	 * @throws Error if any usernames are invalid
	 * @private
	 */
	private async validateUsernamesOrThrow(
		client: GitHubClient,
		assignees: string[]
	): Promise<void> {
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
	}

	// ========== Service Initialization Helpers ==========

	/**
	 * Get cached field mapper instance (stateless service)
	 *
	 * Uses lazy initialization to create a singleton field mapper that transforms
	 * Task Master tasks to/from GitHub issues. Since the mapper has no mutable state,
	 * it's safe to reuse across all GitHub operations for better performance.
	 *
	 * @returns Cached GitHubFieldMapper instance
	 * @private
	 */
	private getFieldMapper(): GitHubFieldMapper {
		if (!this.fieldMapper) {
			this.fieldMapper = new GitHubFieldMapper();
		}
		return this.fieldMapper;
	}

	/**
	 * Get cached resilience service instance (stateless service)
	 *
	 * Uses lazy initialization to create a singleton resilience service that handles
	 * retry logic, circuit breaking, and rate limiting for GitHub API calls. Since the
	 * service maintains only operational statistics (not operation-specific state), it's
	 * safe to reuse across all operations.
	 *
	 * @returns Cached GitHubResilienceService instance
	 * @private
	 */
	private getResilienceService(): GitHubResilienceService {
		if (!this.resilienceService) {
			this.resilienceService = new GitHubResilienceService();
		}
		return this.resilienceService;
	}

	/**
	 * Get cached validation service instance (stateless service)
	 *
	 * Lazy initialization for GitHub validation service that validates sync options
	 * and configuration. Since the service is stateless (pure validation functions only),
	 * it's safe to reuse across all operations.
	 *
	 * @returns Cached GitHubValidationService instance
	 * @private
	 */
	private getValidationService(): GitHubValidationService {
		if (!this.validationService) {
			this.validationService = new GitHubValidationService();
		}
		return this.validationService;
	}

	/**
	 * Get cached auth service instance (stateless service)
	 *
	 * Lazy initialization for GitHub authentication service that validates tokens,
	 * checks permissions, and verifies repository access.
	 *
	 * **Caching Justification:**
	 * - GitHubAuthService is stateless (contains only pure validation functions)
	 * - No mutable state tracking (rate limits, session info, etc.)
	 * - Safe to reuse across all operations in single Node.js process
	 * - If stateful behavior is added in future, change to factory pattern (no caching)
	 *
	 * @returns Cached GitHubAuthService instance
	 * @private
	 */
	private getAuthService(): GitHubAuthService {
		if (!this.authService) {
			this.authService = new GitHubAuthService();
		}
		return this.authService;
	}

	/**
	 * Create GitHub client with authentication (stateful service)
	 *
	 * Creates a fresh GitHub API client instance for each operation. The client is stateful
	 * because it maintains authentication tokens and rate limit information specific to
	 * the current operation context.
	 *
	 * @param token - GitHub personal access token for authentication
	 * @returns Configured GitHubClient instance with authentication
	 * @private
	 */
	private createGitHubClient(token: string): GitHubClient {
		const config = this.configManager.getConfig();
		return new GitHubClient({
			auth: token,
			baseUrl: config.github?.baseUrl
		});
	}

	/**
	 * Create GitHub sync state service for managing persistent state (stateful service)
	 *
	 * Creates a fresh state service instance that manages task-to-issue mappings, conflict
	 * tracking, and sync history in the `.taskmaster/github-sync-state.json` file. Each
	 * instance is scoped to a specific repository (owner/repo), so fresh instances are
	 * created when the repository context changes.
	 *
	 * @param owner - Repository owner (username or organization)
	 * @param repo - Repository name
	 * @returns Configured GitHubSyncStateService instance for the specified repository
	 * @private
	 */
	private createGitHubSyncStateService(
		owner: string,
		repo: string
	): GitHubSyncStateService {
		const projectPath = this.configManager.getProjectRoot();
		return new GitHubSyncStateService(projectPath, owner, repo, {
			createBackup: true,
			validateSchema: true,
			autoRecoverFromBackup: true,
			maxHistoryAgeDays: 30
		});
	}

	/**
	 * Create GitHub config service for accessing GitHub settings (lightweight wrapper)
	 *
	 * Creates a fresh config service instance that provides convenient access to GitHub
	 * integration configuration. While lightweight, it's created fresh per operation to
	 * ensure configuration reads are always up-to-date.
	 *
	 * @returns Configured GitHubConfigService instance
	 * @private
	 */
	private createGitHubConfigService(): GitHubConfigService {
		return new GitHubConfigService(this.configManager);
	}

	/**
	 * Create conflict resolution service (stateful service)
	 *
	 * Creates a fresh conflict resolution service that analyzes and resolves sync conflicts
	 * between Task Master tasks and GitHub issues. The service depends on state and config
	 * services, and is created fresh to ensure it works with the current operation's context.
	 *
	 * @param stateService - State service instance for accessing conflict data
	 * @param githubConfigService - Config service instance for resolution strategy settings
	 * @returns Configured ConflictResolutionService instance
	 * @private
	 */
	private createConflictResolutionService(
		stateService: GitHubSyncStateService,
		githubConfigService: GitHubConfigService
	): ConflictResolutionService {
		return new ConflictResolutionService(
			this.configManager,
			stateService,
			githubConfigService
		);
	}

	/**
	 * Create GitHub sync service for orchestrating sync operations (stateful service)
	 *
	 * Creates a fresh sync service that orchestrates the entire GitHub synchronization process.
	 * This is the main orchestrator that coordinates all other services to perform one-way or
	 * bidirectional sync between Task Master tasks and GitHub issues. Created fresh per
	 * operation to ensure clean state and correct repository context.
	 *
	 * @param githubClient - GitHub API client for making API calls
	 * @param stateService - State service for managing mappings and conflicts
	 * @param fieldMapper - Field mapper for transforming tasks to/from issues
	 * @param resilienceService - Resilience service for retry logic and circuit breaking
	 * @param conflictResolutionService - Conflict resolution service for handling conflicts
	 * @param owner - Repository owner (username or organization)
	 * @param repo - Repository name
	 * @returns Configured GitHubSyncService instance ready to orchestrate sync operations
	 * @private
	 */
	private createGitHubSyncService(
		githubClient: GitHubClient,
		stateService: GitHubSyncStateService,
		fieldMapper: GitHubFieldMapper,
		resilienceService: GitHubResilienceService,
		conflictResolutionService: ConflictResolutionService,
		owner: string,
		repo: string
	): GitHubSyncService {
		return new GitHubSyncService(
			githubClient,
			stateService,
			fieldMapper,
			resilienceService,
			conflictResolutionService,
			owner,
			repo
		);
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
		this.validateFeatureEnabled('Projects sync', 'syncProjects');

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
		this.validateFeatureEnabled('Projects sync', 'syncProjects');

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
		this.validateFeatureEnabled('Projects sync', 'syncProjects');

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
		this.validateFeatureEnabled('Projects sync', 'syncProjects');

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
		this.validateFeatureEnabled('Assignee sync', 'syncAssignees');

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
		this.validateFeatureEnabled('Assignee sync', 'syncAssignees');

		// Validate all usernames first
		await this.validateUsernamesOrThrow(client, assignees);

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
		this.validateFeatureEnabled('Assignee sync', 'syncAssignees');

		// Validate all usernames first
		await this.validateUsernamesOrThrow(client, assignees);

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
		this.validateFeatureEnabled('Assignee sync', 'syncAssignees');

		return client.removeAssignees(owner, repo, issueNumber, assignees);
	}
}
