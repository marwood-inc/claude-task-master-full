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

		// Override repo if provided in options
		let owner = githubSettings.owner;
		let repo = githubSettings.repo;

		if (options.repo) {
			const [ownerOverride, repoOverride] = options.repo.split('/');
			if (!ownerOverride || !repoOverride) {
				throw new Error('Invalid repo format. Expected: owner/repo');
			}
			owner = ownerOverride;
			repo = repoOverride;
		}

		// Initialize GitHub services
		const githubClient = new GitHubClient(githubSettings.token, owner, repo);
		const stateService = new GitHubSyncStateService(
			githubClient,
			owner,
			repo,
			this.configManager
		);
		const fieldMapper = new GitHubFieldMapper();
		const resilienceService = new GitHubResilienceService(githubClient);
		const conflictResolutionService = new ConflictResolutionService(
			stateService,
			fieldMapper
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
		const syncOptions = {
			dryRun: options.dryRun || false,
			subtaskMode: options.subtaskMode || githubSettings.subtaskMode || 'checklist',
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

		// Initialize state service
		const githubClient = new GitHubClient(
			githubSettings.token,
			githubSettings.owner,
			githubSettings.repo
		);
		const stateService = new GitHubSyncStateService(
			githubClient,
			githubSettings.owner,
			githubSettings.repo,
			this.configManager
		);

		// Load state
		const state = await stateService.loadState();

		// Calculate statistics
		const tasksMapped = state.mappings.size;
		const conflicts = Array.from(state.conflicts.values());
		const conflictCount = conflicts.length;

		// Determine sync state
		let syncState: GitHubSyncStatusResult['syncState'] = 'unknown';
		if (state.status === 'in_progress') {
			syncState = 'syncing';
		} else if (conflictCount > 0) {
			syncState = 'out-of-sync';
		} else if (tasksMapped > 0) {
			syncState = 'in-sync';
		}

		// Format conflicts for CLI
		const formattedConflicts = conflicts.map((conflict) => ({
			taskId: conflict.taskId,
			issueNumber: conflict.issueNumber,
			conflictType: conflict.conflictType,
			description: conflict.description
		}));

		return {
			configured: true,
			repository: `${githubSettings.owner}/${githubSettings.repo}`,
			lastSyncTime: state.lastSyncedAt,
			syncState,
			tasksMapped,
			tasksUnmapped: 0, // TODO: Calculate from task list
			conflicts: formattedConflicts,
			pendingChanges: {
				localChanges: 0, // TODO: Implement change detection
				remoteChanges: 0 // TODO: Implement change detection
			}
		};
	}
}
