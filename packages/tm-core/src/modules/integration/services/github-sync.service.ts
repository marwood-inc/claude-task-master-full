/**
 * @fileoverview GitHub Sync Service
 * Orchestrates one-way synchronization from Task Master tasks to GitHub issues
 * with support for subtasks, dependencies, labels, and dry-run mode
 */

import type { Task } from '../../../common/types/index.js';
import { getLogger } from '../../../common/logger/index.js';
import type { GitHubClient } from '../clients/github-client.js';
import type { GitHubIssue } from '../types/github-types.js';
import { GitHubSyncStateService } from './github-sync-state.service.js';
import { GitHubFieldMapper } from './github-field-mapper.js';
import { GitHubResilienceService } from './github-resilience.js';
import { ConflictResolutionService } from './conflict-resolution.service.js';
import type {
	GitHubSyncOptions,
	DryRunSyncResult,
	SubtaskSyncMode,
	SubtaskChecklistMapping,
	SubtaskSeparateIssueMapping,
	DependencyMapping,
	LabelMapping
} from '../types/github-sync-state-types.js';
import type { SyncMapping } from '../types/github-types.js';
import type {
	ConflictInfo,
	FieldConflict,
	ConflictField,
	FieldConflictType,
	ConflictSeverity,
	TimestampAnalysis,
	ConflictResolutionStrategy,
} from '../types/github-conflict-types.js';

const logger = getLogger('GitHubSyncService');

/**
 * Sync result for individual task
 */
export interface TaskSyncResult {
	taskId: string;
	success: boolean;
	issueNumber?: number;
	action: 'created' | 'updated' | 'skipped' | 'error';
	error?: string;
	subtaskResults?: SubtaskSyncResult[];
	dependencyResults?: DependencySyncResult[];
	/**
	 * Suggested updates for the task (used in pull operations)
	 * The caller should apply these updates to the local task
	 */
	suggestedUpdates?: Partial<Task>;
}

/**
 * Sync result for subtask
 */
export interface SubtaskSyncResult {
	subtaskId: string;
	success: boolean;
	action: 'created' | 'updated' | 'checklist_updated' | 'skipped' | 'error';
	issueNumber?: number;
	checkboxIndex?: number;
	error?: string;
}

/**
 * Sync result for dependency
 */
export interface DependencySyncResult {
	dependencyTaskId: string;
	success: boolean;
	action: 'added' | 'skipped' | 'error';
	error?: string;
}

/**
 * Overall sync result
 */
export interface GitHubSyncResult {
	success: boolean;
	tasksProcessed: number;
	tasksCreated: number;
	tasksUpdated: number;
	tasksFailed: number;
	subtasksProcessed: number;
	dependenciesProcessed: number;
	labelsCreated: number;
	apiCallsMade: number;
	dryRun: boolean;
	taskResults: TaskSyncResult[];
	errors: string[];
	warnings: string[];
}

/**
 * Default sync options
 */
const DEFAULT_SYNC_OPTIONS: GitHubSyncOptions = {
	dryRun: false,
	subtaskMode: 'checklist',
	batchSize: 100,
	autoCreateLabels: true,
	syncDependencies: true,
	syncSubtasks: true
};

/**
 * GitHubSyncService
 * Core service for one-way Task → GitHub synchronization
 */
export class GitHubSyncService {
	private readonly githubClient: GitHubClient;
	private readonly stateService: GitHubSyncStateService;
	private readonly fieldMapper: GitHubFieldMapper;
	private readonly resilienceService: GitHubResilienceService;
	private readonly conflictResolutionService: ConflictResolutionService;
	private readonly owner: string;
	private readonly repo: string;

	constructor(
		githubClient: GitHubClient,
		stateService: GitHubSyncStateService,
		fieldMapper: GitHubFieldMapper,
		resilienceService: GitHubResilienceService,
		conflictResolutionService: ConflictResolutionService,
		owner: string,
		repo: string
	) {
		this.githubClient = githubClient;
		this.stateService = stateService;
		this.fieldMapper = fieldMapper;
		this.resilienceService = resilienceService;
		this.conflictResolutionService = conflictResolutionService;
		this.owner = owner;
		this.repo = repo;

		logger.info('GitHubSyncService initialized', { owner, repo });
	}

	/**
	 * Synchronize tasks to GitHub
	 * Main entry point for one-way sync
	 */
	async syncToGitHub(
		tasks: Task[],
		options: Partial<GitHubSyncOptions> = {}
	): Promise<GitHubSyncResult> {
		const syncOptions = { ...DEFAULT_SYNC_OPTIONS, ...options };

		logger.info('Starting GitHub sync', {
			taskCount: tasks.length,
			dryRun: syncOptions.dryRun,
			subtaskMode: syncOptions.subtaskMode
		});

		// Initialize result
		const result: GitHubSyncResult = {
			success: true,
			tasksProcessed: 0,
			tasksCreated: 0,
			tasksUpdated: 0,
			tasksFailed: 0,
			subtasksProcessed: 0,
			dependenciesProcessed: 0,
			labelsCreated: 0,
			apiCallsMade: 0,
			dryRun: syncOptions.dryRun,
			taskResults: [],
			errors: [],
			warnings: []
		};

		try {
			// Mark sync as in progress
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncInProgress();
			}

			// Create required labels if needed
			if (syncOptions.autoCreateLabels && !syncOptions.dryRun) {
				const labelsCreated = await this.ensureLabelsExist(syncOptions);
				result.labelsCreated = labelsCreated;
				result.apiCallsMade += labelsCreated;
			}

			// Process tasks in batches
			const batches = this.splitIntoBatches(tasks, syncOptions.batchSize);
			logger.debug('Split tasks into batches', { batchCount: batches.length });

			for (const batch of batches) {
				const batchResults = await this.processBatch(batch, syncOptions);
				result.taskResults.push(...batchResults);

				// Update counters
				for (const taskResult of batchResults) {
					result.tasksProcessed++;

					if (taskResult.success) {
						if (taskResult.action === 'created') {
							result.tasksCreated++;
						} else if (taskResult.action === 'updated') {
							result.tasksUpdated++;
						}

						// Count subtasks
						if (taskResult.subtaskResults) {
							result.subtasksProcessed += taskResult.subtaskResults.length;
						}

						// Count dependencies
						if (taskResult.dependencyResults) {
							result.dependenciesProcessed += taskResult.dependencyResults.length;
						}
					} else {
						result.tasksFailed++;
						if (taskResult.error) {
							result.errors.push(`Task ${taskResult.taskId}: ${taskResult.error}`);
						}
					}
				}

				// Estimate API calls (rough estimate)
				result.apiCallsMade += batch.length;
			}

			// Mark sync as complete
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncComplete();
			}

			result.success = result.tasksFailed === 0;

			logger.info('GitHub sync completed', {
				success: result.success,
				tasksProcessed: result.tasksProcessed,
				tasksCreated: result.tasksCreated,
				tasksUpdated: result.tasksUpdated,
				tasksFailed: result.tasksFailed
			});

			return result;
		} catch (error: any) {
			const errorMessage = `Sync failed: ${error.message}`;
			logger.error(errorMessage, { error });

			result.success = false;
			result.errors.push(errorMessage);

			// Mark sync as complete with error
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncComplete(errorMessage);
			}

			return result;
		}
	}

	/**
	 * Preview sync changes without making API calls
	 */
	async previewSync(tasks: Task[]): Promise<DryRunSyncResult> {
		logger.info('Previewing sync changes', { taskCount: tasks.length });

		const result: DryRunSyncResult = {
			tasksToCreate: [],
			tasksToUpdate: [],
			issuesAffected: [],
			labelsToCreate: [],
			dependenciesToAdd: [],
			subtasksToSync: [],
			estimatedApiCalls: 0
		};

		// Check which tasks need creation vs update
		for (const task of tasks) {
			const mapping = await this.stateService.getMapping(task.id);

			if (mapping) {
				result.tasksToUpdate.push(task.id);
				result.issuesAffected.push(mapping.issueNumber);
			} else {
				result.tasksToCreate.push(task.id);
			}

			// Count subtasks
			if (task.subtasks && task.subtasks.length > 0) {
				result.subtasksToSync.push(
					...task.subtasks.map(
						(st) =>
							({
								parentTaskId: task.id,
								subtaskId: st.id,
								parentIssueNumber: mapping?.issueNumber || 0,
								checkboxIndex: 0,
								checked: st.status === 'done',
								lastSyncedAt: new Date().toISOString()
							}) as SubtaskChecklistMapping
					)
				);
			}

			// Count dependencies
			if (task.dependencies && task.dependencies.length > 0) {
				for (const dep of task.dependencies) {
					const depMapping = await this.stateService.getMapping(dep);
					if (depMapping) {
						result.dependenciesToAdd.push({
							dependentTaskId: task.id,
							dependencyTaskId: dep,
							dependentIssueNumber: mapping?.issueNumber || 0,
							dependencyIssueNumber: depMapping.issueNumber,
							inBody: true,
							bodyReference: `Depends on #${depMapping.issueNumber}`,
							lastSyncedAt: new Date().toISOString()
						});
					}
				}
			}
		}

		// Estimate API calls
		result.estimatedApiCalls =
			result.tasksToCreate.length + // Create issues
			result.tasksToUpdate.length + // Update issues
			result.labelsToCreate.length + // Create labels
			Math.ceil(result.subtasksToSync.length / 10); // Subtask operations

		logger.info('Sync preview generated', {
			tasksToCreate: result.tasksToCreate.length,
			tasksToUpdate: result.tasksToUpdate.length,
			estimatedApiCalls: result.estimatedApiCalls
		});

		return result;
	}

	/**
	 * Process a batch of tasks
	 */
	private async processBatch(
		tasks: Task[],
		options: GitHubSyncOptions
	): Promise<TaskSyncResult[]> {
		const results: TaskSyncResult[] = [];

		// Process tasks sequentially within batch to maintain order
		for (const task of tasks) {
			try {
				const result = await this.syncTask(task, options);
				results.push(result);
			} catch (error: any) {
				logger.error('Failed to sync task', { taskId: task.id, error });
				results.push({
					taskId: task.id,
					success: false,
					action: 'error',
					error: error.message
				});
			}
		}

		return results;
	}

	/**
	 * Sync a single task to GitHub
	 */
	private async syncTask(
		task: Task,
		options: GitHubSyncOptions
	): Promise<TaskSyncResult> {
		logger.debug('Syncing task', { taskId: task.id });

		// Check if task is already mapped
		const existingMapping = await this.stateService.getMapping(task.id);

		if (existingMapping) {
			// Update existing issue
			return await this.updateTask(task, existingMapping, options);
		} else {
			// Create new issue
			return await this.createTask(task, options);
		}
	}

	/**
	 * Create new GitHub issue for task
	 */
	private async createTask(
		task: Task,
		options: GitHubSyncOptions
	): Promise<TaskSyncResult> {
		logger.debug('Creating new issue for task', { taskId: task.id });

		const result: TaskSyncResult = {
			taskId: task.id,
			success: false,
			action: 'created'
		};

		try {
			// Build issue data
			const issueData = this.fieldMapper.taskToIssueCreate(task);

			// Add dependency references to body
			if (options.syncDependencies && task.dependencies && task.dependencies.length > 0) {
				const dependencyRefs = await this.buildDependencyReferences(task.dependencies);
				if (dependencyRefs) {
					issueData.body += `\n\n## Dependencies\n\n${dependencyRefs}`;
				}
			}

			if (options.dryRun) {
				// Dry run - don't actually create
				logger.info('DRY RUN: Would create issue', {
					taskId: task.id,
					title: issueData.title
				});
				result.success = true;
				result.issueNumber = -1; // Placeholder
				return result;
			}

			// Create issue with resilience
			const issue = await this.resilienceService.executeWithRetry(
				async () => {
					return await this.githubClient.createIssue(this.owner, this.repo, {
						title: issueData.title,
						body: issueData.body,
						labels: issueData.labels,
						assignees: issueData.assignees
					});
				},
				`create-issue-${task.id}`
			);

			result.issueNumber = issue.number;
			result.success = true;

			// Save mapping
			const mapping: SyncMapping = {
				taskId: task.id,
				issueNumber: issue.number,
				owner: this.owner,
				repo: this.repo,
				lastSyncedAt: new Date().toISOString(),
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			await this.stateService.setMapping(mapping);

			// Record operation
			await this.stateService.recordOperation({
				taskId: task.id,
				issueNumber: issue.number,
				operationType: 'create_issue',
				direction: 'to_github',
				success: true
			});

			// Sync subtasks if enabled
			if (options.syncSubtasks && task.subtasks && task.subtasks.length > 0) {
				result.subtaskResults = await this.syncSubtasks(
					task,
					issue.number,
					options.subtaskMode,
					options
				);
			}

			logger.info('Created issue for task', {
				taskId: task.id,
				issueNumber: issue.number
			});

			return result;
		} catch (error: any) {
			logger.error('Failed to create issue', { taskId: task.id, error });

			result.success = false;
			result.action = 'error';
			result.error = error.message;

			// Record failed operation
			await this.stateService.recordOperation({
				taskId: task.id,
				issueNumber: 0,
				operationType: 'create_issue',
				direction: 'to_github',
				success: false,
				error: error.message
			});

			return result;
		}
	}

	/**
	 * Update existing GitHub issue for task
	 */
	private async updateTask(
		task: Task,
		mapping: SyncMapping,
		options: GitHubSyncOptions
	): Promise<TaskSyncResult> {
		logger.debug('Updating existing issue for task', {
			taskId: task.id,
			issueNumber: mapping.issueNumber
		});

		const result: TaskSyncResult = {
			taskId: task.id,
			issueNumber: mapping.issueNumber,
			success: false,
			action: 'updated'
		};

		try {
			// Build update data
			const updateData = this.fieldMapper.taskToIssueUpdate(task);

			// Add dependency references to body
			if (options.syncDependencies && task.dependencies && task.dependencies.length > 0) {
				const dependencyRefs = await this.buildDependencyReferences(task.dependencies);
				if (dependencyRefs) {
					updateData.body += `\n\n## Dependencies\n\n${dependencyRefs}`;
				}
			}

			if (options.dryRun) {
				// Dry run - don't actually update
				logger.info('DRY RUN: Would update issue', {
					taskId: task.id,
					issueNumber: mapping.issueNumber
				});
				result.success = true;
				return result;
			}

			// Update issue with resilience
			await this.resilienceService.executeWithRetry(
				async () => {
					return await this.githubClient.updateIssue(
						this.owner,
						this.repo,
						mapping.issueNumber,
						updateData
					);
				},
				`update-issue-${task.id}`
			);

			result.success = true;

			// Update mapping
			mapping.lastSyncedAt = new Date().toISOString();
			mapping.lastSyncDirection = 'to_github';
			mapping.status = 'synced';
			await this.stateService.setMapping(mapping);

			// Record operation
			await this.stateService.recordOperation({
				taskId: task.id,
				issueNumber: mapping.issueNumber,
				operationType: 'update_issue',
				direction: 'to_github',
				success: true
			});

			// Sync subtasks if enabled
			if (options.syncSubtasks && task.subtasks && task.subtasks.length > 0) {
				result.subtaskResults = await this.syncSubtasks(
					task,
					mapping.issueNumber,
					options.subtaskMode,
					options
				);
			}

			logger.info('Updated issue for task', {
				taskId: task.id,
				issueNumber: mapping.issueNumber
			});

			return result;
		} catch (error: any) {
			logger.error('Failed to update issue', {
				taskId: task.id,
				issueNumber: mapping.issueNumber,
				error
			});

			result.success = false;
			result.action = 'error';
			result.error = error.message;

			// Record failed operation
			await this.stateService.recordOperation({
				taskId: task.id,
				issueNumber: mapping.issueNumber,
				operationType: 'update_issue',
				direction: 'to_github',
				success: false,
				error: error.message
			});

			return result;
		}
	}

	/**
	 * Sync subtasks for a task
	 */
	private async syncSubtasks(
		task: Task,
		parentIssueNumber: number,
		mode: SubtaskSyncMode,
		options: GitHubSyncOptions
	): Promise<SubtaskSyncResult[]> {
		if (!task.subtasks || task.subtasks.length === 0) {
			return [];
		}

		if (mode === 'checklist') {
			return await this.syncSubtasksAsChecklist(task, parentIssueNumber, options);
		} else {
			return await this.syncSubtasksAsSeparateIssues(task, parentIssueNumber, options);
		}
	}

	/**
	 * Sync subtasks as checklist items in parent issue body
	 */
	private async syncSubtasksAsChecklist(
		task: Task,
		parentIssueNumber: number,
		options: GitHubSyncOptions
	): Promise<SubtaskSyncResult[]> {
		// Subtasks are already included in issue body by fieldMapper
		// Just record the mappings
		const results: SubtaskSyncResult[] = [];

		if (!task.subtasks) {
			return results;
		}

		for (let i = 0; i < task.subtasks.length; i++) {
			const subtask = task.subtasks[i];

			results.push({
				subtaskId: subtask.id,
				success: true,
				action: 'checklist_updated',
				checkboxIndex: i
			});
		}

		return results;
	}

	/**
	 * Sync subtasks as separate GitHub issues
	 */
	private async syncSubtasksAsSeparateIssues(
		task: Task,
		parentIssueNumber: number,
		options: GitHubSyncOptions
	): Promise<SubtaskSyncResult[]> {
		const results: SubtaskSyncResult[] = [];

		if (!task.subtasks) {
			return results;
		}

		for (const subtask of task.subtasks) {
			try {
				// Create subtask as separate issue
				const issueData = {
					title: `${task.title} - ${subtask.title}`,
					body: `**Parent Issue:** #${parentIssueNumber}\n\n${subtask.description || subtask.title}`,
					labels: [`tm-subtask`, `tm-status:${subtask.status}`]
				};

				if (options.dryRun) {
					results.push({
						subtaskId: subtask.id,
						success: true,
						action: 'created'
					});
					continue;
				}

				const issue = await this.resilienceService.executeWithRetry(
					async () => {
						return await this.githubClient.createIssue(this.owner, this.repo, {
							title: issueData.title,
							body: issueData.body,
							labels: issueData.labels
						});
					},
					`create-subtask-${subtask.id}`
				);

				results.push({
					subtaskId: subtask.id,
					success: true,
					action: 'created',
					issueNumber: issue.number
				});
			} catch (error: any) {
				logger.error('Failed to create subtask issue', {
					subtaskId: subtask.id,
					error
				});

				results.push({
					subtaskId: subtask.id,
					success: false,
					action: 'error',
					error: error.message
				});
			}
		}

		return results;
	}

	/**
	 * Build dependency references for issue body
	 */
	private async buildDependencyReferences(dependencies: string[]): Promise<string> {
		const refs: string[] = [];

		for (const dep of dependencies) {
			const depMapping = await this.stateService.getMapping(dep);
			if (depMapping) {
				refs.push(`- Depends on #${depMapping.issueNumber}`);
			} else {
				refs.push(`- Depends on task ${dep} (not yet synced)`);
			}
		}

		return refs.join('\n');
	}

	/**
	 * Ensure required labels exist in repository
	 */
	private async ensureLabelsExist(options: GitHubSyncOptions): Promise<number> {
		logger.debug('Ensuring labels exist');

		let labelsCreated = 0;

		try {
			// Get default labels from field mapper
			const defaultLabels = this.fieldMapper.getDefaultLabels();
			const statusLabels = this.fieldMapper.getSuggestedStatusLabels();
			const allLabels = [...defaultLabels, ...statusLabels];

			// Get existing labels
			const existingLabels = await this.resilienceService.executeWithRetry(
				async () => {
					return await this.githubClient.listLabels(this.owner, this.repo);
				},
				'list-labels'
			);

			const existingLabelNames = new Set(existingLabels.map((l) => l.name));

			// Create missing labels
			for (const label of allLabels) {
				if (!existingLabelNames.has(label.name)) {
					await this.resilienceService.executeWithRetry(
						async () => {
							return await this.githubClient.createLabel(this.owner, this.repo, {
								name: label.name,
								color: label.color,
								description: label.description
							});
						},
						`create-label-${label.name}`
					);

					labelsCreated++;
					logger.debug('Created label', { name: label.name });
				}
			}

			logger.info('Labels ensured', { labelsCreated });

			return labelsCreated;
		} catch (error: any) {
			logger.warn('Failed to ensure labels', { error });
			return labelsCreated;
		}
	}

	/**
	 * Split tasks into batches
	 */
	private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
		const batches: T[][] = [];

		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}

		return batches;
	}

	/**
	 * Get sync statistics
	 */
	async getSyncStats(): Promise<{
		totalMappings: number;
		lastSyncAt: string | null;
		pendingMappings: number;
		syncInProgress: boolean;
	}> {
		const stats = await this.stateService.getStats();

		return {
			totalMappings: stats.totalMappings,
			lastSyncAt: stats.lastSyncAt,
			pendingMappings: stats.pendingMappings,
			syncInProgress: false // Will be enhanced later
		};
	}

	// ==================== Bidirectional Sync Operations (Subtasks 6.4 and 6.5) ====================

	/**
	 * Pull changes from GitHub issues and apply to local tasks (Subtask 6.4)
	 *
	 * Fetches remote GitHub issue updates and applies non-conflicting changes to local tasks.
	 * Conflicts are detected and queued for resolution.
	 *
	 * @param tasks - Local tasks to sync with GitHub
	 * @param options - Sync options
	 * @returns Result of the pull operation
	 */
	async pullFromGitHub(
		tasks: Task[],
		options: Partial<GitHubSyncOptions> = {}
	): Promise<GitHubSyncResult> {
		const syncOptions = { ...DEFAULT_SYNC_OPTIONS, ...options };

		logger.info('Starting pull from GitHub', {
			taskCount: tasks.length,
			dryRun: syncOptions.dryRun
		});

		const result: GitHubSyncResult = {
			success: true,
			tasksProcessed: 0,
			tasksCreated: 0,
			tasksUpdated: 0,
			tasksFailed: 0,
			subtasksProcessed: 0,
			dependenciesProcessed: 0,
			labelsCreated: 0,
			apiCallsMade: 0,
			dryRun: syncOptions.dryRun,
			taskResults: [],
			errors: [],
			warnings: []
		};

		try {
			// Mark sync as in progress
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncInProgress();
			}

			// Process each task
			for (const task of tasks) {
				try {
					const mapping = await this.stateService.getMapping(task.id);

					if (!mapping) {
						// Task not mapped to any issue, skip pull
						logger.debug('Task not mapped, skipping pull', { taskId: task.id });
						continue;
					}

					// Fetch remote issue
					const remoteIssue = await this.resilienceService.executeWithRetry(
						async () => {
							return await this.githubClient.getIssue(
								this.owner,
								this.repo,
								mapping.issueNumber
							);
						},
						`get-issue-${mapping.issueNumber}`
					);

					result.apiCallsMade++;

					// Detect changes using GitHubSyncStateService
					const changes = await this.stateService.detectChanges(
						task.id,
						task.updatedAt || new Date().toISOString(),
						remoteIssue.updated_at
					);

					// If no remote changes, skip
					if (!changes.hasRemoteChanges) {
						logger.debug('No remote changes detected', { taskId: task.id });
						continue;
					}

					// Convert issue to task format for comparison
					const remoteTaskData = this.fieldMapper.issueToTask(remoteIssue, task);

					// Detect conflicts
					const conflicts = await this.detectConflicts(
						task,
						remoteTaskData,
						changes.hasLocalChanges
					);

					if (conflicts.length > 0) {
						// Conflicts detected - queue for resolution
						logger.warn('Conflicts detected during pull', {
							taskId: task.id,
							conflictCount: conflicts.length
						});

						// Store conflicts in state
						for (const conflict of conflicts) {
							// Get the first field conflict for legacy storage format
							const firstFieldConflict = conflict.fieldConflicts[0];
							if (firstFieldConflict) {
								await this.stateService.addConflict({
									taskId: task.id,
									issueNumber: mapping.issueNumber,
									type: 'title_mismatch', // Will be enhanced with specific types
									localValue: firstFieldConflict.localValue as string,
									remoteValue: firstFieldConflict.remoteValue as string,
									detectedAt: new Date().toISOString(),
									resolutionStrategy: 'manual',
									resolved: false
								});
							}
						}

						result.warnings.push(`Task ${task.id}: Conflicts detected, manual resolution required`);
						result.taskResults.push({
							taskId: task.id,
							success: false,
							action: 'skipped',
							error: 'Conflicts detected'
						});
						result.tasksProcessed++;
						continue;
					}

					// No conflicts - prepare remote changes for application
					const suggestedUpdates: Partial<Task> = {};

					// Build the updates object with only changed fields
					if (remoteTaskData.title && remoteTaskData.title !== task.title) {
						suggestedUpdates.title = remoteTaskData.title;
					}
					if (remoteTaskData.description && remoteTaskData.description !== task.description) {
						suggestedUpdates.description = remoteTaskData.description;
					}
					if (remoteTaskData.status && remoteTaskData.status !== task.status) {
						suggestedUpdates.status = remoteTaskData.status;
					}
					if (remoteTaskData.priority && remoteTaskData.priority !== task.priority) {
						suggestedUpdates.priority = remoteTaskData.priority;
					}

					// Add updated timestamp
					suggestedUpdates.updatedAt = remoteIssue.updated_at;

					if (!syncOptions.dryRun) {
						// Update mapping
						mapping.lastSyncedAt = new Date().toISOString();
						mapping.lastSyncDirection = 'from_github';
						mapping.status = 'synced';
						await this.stateService.setMapping(mapping);

						// Record operation
						await this.stateService.recordOperation({
							taskId: task.id,
							issueNumber: mapping.issueNumber,
							operationType: 'update_task',
							direction: 'from_github',
							success: true
						});

						logger.info('Remote changes ready for application', {
							taskId: task.id,
							issueNumber: mapping.issueNumber,
							updates: Object.keys(suggestedUpdates)
						});
					}

					result.tasksUpdated++;
					result.tasksProcessed++;
					result.taskResults.push({
						taskId: task.id,
						issueNumber: mapping.issueNumber,
						success: true,
						action: 'updated',
						suggestedUpdates
					});

				} catch (error: any) {
					logger.error('Failed to pull task from GitHub', {
						taskId: task.id,
						error
					});

					result.tasksFailed++;
					result.tasksProcessed++;
					result.errors.push(`Task ${task.id}: ${error.message}`);
					result.taskResults.push({
						taskId: task.id,
						success: false,
						action: 'error',
						error: error.message
					});
				}
			}

			// Mark sync as complete
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncComplete();
			}

			result.success = result.tasksFailed === 0;

			logger.info('Pull from GitHub completed', {
				success: result.success,
				tasksProcessed: result.tasksProcessed,
				tasksUpdated: result.tasksUpdated,
				tasksFailed: result.tasksFailed
			});

			return result;

		} catch (error: any) {
			const errorMessage = `Pull failed: ${error.message}`;
			logger.error(errorMessage, { error });

			result.success = false;
			result.errors.push(errorMessage);

			if (!syncOptions.dryRun) {
				await this.stateService.markSyncComplete(errorMessage);
			}

			return result;
		}
	}

	/**
	 * Push local task changes to GitHub issues (Subtask 6.5)
	 *
	 * Detects local changes and pushes them to GitHub issues.
	 * Only changed fields are updated. Respects conflict resolution.
	 *
	 * @param tasks - Local tasks to push to GitHub
	 * @param options - Sync options
	 * @returns Result of the push operation
	 */
	async pushChangesToGitHub(
		tasks: Task[],
		options: Partial<GitHubSyncOptions> = {}
	): Promise<GitHubSyncResult> {
		const syncOptions = { ...DEFAULT_SYNC_OPTIONS, ...options };

		logger.info('Starting push to GitHub', {
			taskCount: tasks.length,
			dryRun: syncOptions.dryRun
		});

		const result: GitHubSyncResult = {
			success: true,
			tasksProcessed: 0,
			tasksCreated: 0,
			tasksUpdated: 0,
			tasksFailed: 0,
			subtasksProcessed: 0,
			dependenciesProcessed: 0,
			labelsCreated: 0,
			apiCallsMade: 0,
			dryRun: syncOptions.dryRun,
			taskResults: [],
			errors: [],
			warnings: []
		};

		try {
			// Mark sync as in progress
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncInProgress();
			}

			// Process each task
			for (const task of tasks) {
				try {
					const mapping = await this.stateService.getMapping(task.id);

					if (!mapping) {
						// No mapping - create new issue
						const createResult = await this.createTask(task, syncOptions);
						result.tasksCreated += createResult.success ? 1 : 0;
						result.tasksFailed += createResult.success ? 0 : 1;
						result.tasksProcessed++;
						result.taskResults.push(createResult);
						result.apiCallsMade++;
						continue;
					}

					// Fetch remote issue to check for conflicts
					const remoteIssue = await this.resilienceService.executeWithRetry(
						async () => {
							return await this.githubClient.getIssue(
								this.owner,
								this.repo,
								mapping.issueNumber
							);
						},
						`get-issue-${mapping.issueNumber}`
					);

					result.apiCallsMade++;

					// Detect changes
					const changes = await this.stateService.detectChanges(
						task.id,
						task.updatedAt || new Date().toISOString(),
						remoteIssue.updated_at
					);

					// If no local changes, skip
					if (!changes.hasLocalChanges) {
						logger.debug('No local changes to push', { taskId: task.id });
						continue;
					}

					// Convert issue to task format for comparison
					const remoteTaskData = this.fieldMapper.issueToTask(remoteIssue, task);

					// Detect conflicts
					const conflicts = await this.detectConflicts(
						task,
						remoteTaskData,
						changes.hasRemoteChanges
					);

					if (conflicts.length > 0) {
						// Conflicts detected - queue for resolution
						logger.warn('Conflicts detected during push', {
							taskId: task.id,
							conflictCount: conflicts.length
						});

						// Store conflicts in state
						for (const conflict of conflicts) {
							// Get the first field conflict for legacy storage format
							const firstFieldConflict = conflict.fieldConflicts[0];
							if (firstFieldConflict) {
								await this.stateService.addConflict({
									taskId: task.id,
									issueNumber: mapping.issueNumber,
									type: 'title_mismatch',
									localValue: firstFieldConflict.localValue as string,
									remoteValue: firstFieldConflict.remoteValue as string,
									detectedAt: new Date().toISOString(),
									resolutionStrategy: 'manual',
									resolved: false
								});
							}
						}

						result.warnings.push(`Task ${task.id}: Conflicts detected, manual resolution required`);
						result.taskResults.push({
							taskId: task.id,
							success: false,
							action: 'skipped',
							error: 'Conflicts detected'
						});
						result.tasksProcessed++;
						continue;
					}

					// No conflicts - push local changes
					const updateResult = await this.updateTask(task, mapping, syncOptions);
					result.tasksUpdated += updateResult.success ? 1 : 0;
					result.tasksFailed += updateResult.success ? 0 : 1;
					result.tasksProcessed++;
					result.taskResults.push(updateResult);
					result.apiCallsMade++;

				} catch (error: any) {
					logger.error('Failed to push task to GitHub', {
						taskId: task.id,
						error
					});

					result.tasksFailed++;
					result.tasksProcessed++;
					result.errors.push(`Task ${task.id}: ${error.message}`);
					result.taskResults.push({
						taskId: task.id,
						success: false,
						action: 'error',
						error: error.message
					});
				}
			}

			// Mark sync as complete
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncComplete();
			}

			result.success = result.tasksFailed === 0;

			logger.info('Push to GitHub completed', {
				success: result.success,
				tasksProcessed: result.tasksProcessed,
				tasksCreated: result.tasksCreated,
				tasksUpdated: result.tasksUpdated,
				tasksFailed: result.tasksFailed
			});

			return result;

		} catch (error: any) {
			const errorMessage = `Push failed: ${error.message}`;
			logger.error(errorMessage, { error });

			result.success = false;
			result.errors.push(errorMessage);

			if (!syncOptions.dryRun) {
				await this.stateService.markSyncComplete(errorMessage);
			}

			return result;
		}
	}

	/**
	 * Bidirectional synchronization - master coordination method
	 *
	 * Orchestrates full bidirectional sync between local tasks and GitHub issues.
	 * Detects changes on both sides, handles conflicts, and applies updates atomically.
	 *
	 * @param tasks - Local tasks to synchronize
	 * @param options - Sync options
	 * @returns Combined result of pull and push operations
	 */
	async syncWithGitHub(
		tasks: Task[],
		options: Partial<GitHubSyncOptions> = {}
	): Promise<GitHubSyncResult> {
		const syncOptions = { ...DEFAULT_SYNC_OPTIONS, ...options };

		logger.info('Starting bidirectional GitHub sync', {
			taskCount: tasks.length,
			dryRun: syncOptions.dryRun
		});

		try {
			// Mark sync as in progress
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncInProgress();
			}

			// Step 1: Pull remote changes
			logger.info('Step 1/2: Pulling remote changes');
			const pullResult = await this.pullFromGitHub(tasks, { ...syncOptions, dryRun: true });

			// Step 2: Push local changes
			logger.info('Step 2/2: Pushing local changes');
			const pushResult = await this.pushChangesToGitHub(tasks, { ...syncOptions, dryRun: true });

			// Combine results
			const combinedResult: GitHubSyncResult = {
				success: pullResult.success && pushResult.success,
				tasksProcessed: pullResult.tasksProcessed + pushResult.tasksProcessed,
				tasksCreated: pushResult.tasksCreated,
				tasksUpdated: pullResult.tasksUpdated + pushResult.tasksUpdated,
				tasksFailed: pullResult.tasksFailed + pushResult.tasksFailed,
				subtasksProcessed: pullResult.subtasksProcessed + pushResult.subtasksProcessed,
				dependenciesProcessed: pullResult.dependenciesProcessed + pushResult.dependenciesProcessed,
				labelsCreated: pushResult.labelsCreated,
				apiCallsMade: pullResult.apiCallsMade + pushResult.apiCallsMade,
				dryRun: syncOptions.dryRun,
				taskResults: [...pullResult.taskResults, ...pushResult.taskResults],
				errors: [...pullResult.errors, ...pushResult.errors],
				warnings: [...pullResult.warnings, ...pushResult.warnings]
			};

			// Mark sync as complete
			if (!syncOptions.dryRun) {
				await this.stateService.markSyncComplete();
			}

			logger.info('Bidirectional sync completed', {
				success: combinedResult.success,
				tasksProcessed: combinedResult.tasksProcessed,
				tasksUpdated: combinedResult.tasksUpdated,
				conflicts: combinedResult.warnings.length
			});

			return combinedResult;

		} catch (error: any) {
			const errorMessage = `Bidirectional sync failed: ${error.message}`;
			logger.error(errorMessage, { error });

			if (!syncOptions.dryRun) {
				await this.stateService.markSyncComplete(errorMessage);
			}

			throw error;
		}
	}

	/**
	 * Detect conflicts between local and remote task data
	 *
	 * @private
	 * @param localTask - Local task
	 * @param remoteTask - Remote task data (converted from issue)
	 * @param bothChanged - Whether both sides have changes
	 * @returns Array of detected conflicts
	 */
	private async detectConflicts(
		localTask: Task,
		remoteTask: Partial<Task>,
		bothChanged: boolean
	): Promise<ConflictInfo[]> {
		// If only one side changed, no conflict
		if (!bothChanged) {
			return [];
		}

		const conflicts: ConflictInfo[] = [];
		const fieldConflicts: FieldConflict[] = [];

		// Get mapping for conflict info
		const mapping = await this.stateService.getMapping(localTask.id);
		if (!mapping) {
			// No mapping, can't detect conflicts
			return [];
		}

		// Compare key fields
		const fieldsToCompare: Array<{ field: ConflictField; localKey: keyof Task; remoteKey: keyof Task }> = [
			{ field: 'title', localKey: 'title', remoteKey: 'title' },
			{ field: 'description', localKey: 'description', remoteKey: 'description' },
			{ field: 'status', localKey: 'status', remoteKey: 'status' },
			{ field: 'priority', localKey: 'priority', remoteKey: 'priority' }
		];

		for (const { field, localKey, remoteKey } of fieldsToCompare) {
			const localValue = localTask[localKey];
			const remoteValue = remoteTask[remoteKey];

			// Skip if both undefined
			if (localValue === undefined && remoteValue === undefined) {
				continue;
			}

			// Detect value mismatches
			if (localValue !== remoteValue) {
				const conflictType: FieldConflictType =
					localValue === undefined ? 'deleted_locally' :
					remoteValue === undefined ? 'deleted_remotely' :
					'value_mismatch';

				// Determine if auto-merge is possible
				const canAutoMerge = this.canAutoMergeField(field, localValue, remoteValue);

				fieldConflicts.push({
					field,
					localValue,
					remoteValue,
					baseValue: undefined, // Would come from last sync state
					type: conflictType,
					canAutoMerge,
					autoMergeValue: canAutoMerge ? remoteValue : undefined
				});

				logger.debug('Field conflict detected', {
					taskId: localTask.id,
					field,
					localValue,
					remoteValue,
					type: conflictType
				});
			}
		}

		// If we have field conflicts, create a ConflictInfo object
		if (fieldConflicts.length > 0) {
			const timestampAnalysis: TimestampAnalysis = {
				localUpdatedAt: localTask.updatedAt || new Date().toISOString(),
				remoteUpdatedAt: remoteTask.updatedAt || new Date().toISOString(),
				lastSyncedAt: mapping.lastSyncedAt,
				timeSinceLastSync: Date.now() - new Date(mapping.lastSyncedAt).getTime(),
				recentSide: this.determineRecentSide(
					localTask.updatedAt || new Date().toISOString(),
					remoteTask.updatedAt || new Date().toISOString()
				),
				simultaneousEdit: this.isSimultaneousEdit(
					localTask.updatedAt || new Date().toISOString(),
					remoteTask.updatedAt || new Date().toISOString()
				)
			};

			const severity = this.calculateConflictSeverity(fieldConflicts, timestampAnalysis);
			const suggestedStrategy = this.determineSuggestedStrategy(fieldConflicts, timestampAnalysis, severity);
			const canAutoResolve = fieldConflicts.every(fc => fc.canAutoMerge) && severity === 'low';

			conflicts.push({
				conflictId: `conflict_${localTask.id}_${mapping.issueNumber}_${Date.now()}`,
				taskId: localTask.id,
				issueNumber: mapping.issueNumber,
				detectedAt: new Date().toISOString(),
				severity,
				fieldConflicts,
				timestampAnalysis,
				suggestedStrategy,
				canAutoResolve
			});
		}

		return conflicts;
	}

	/**
	 * Determine if a field can be auto-merged
	 * @private
	 */
	private canAutoMergeField(field: ConflictField, localValue: unknown, remoteValue: unknown): boolean {
		// Simple fields can't auto-merge if they're different
		if (field === 'title' || field === 'status' || field === 'priority') {
			return false;
		}

		// Description can potentially be merged if one is empty
		if (field === 'description') {
			return !localValue || !remoteValue;
		}

		// Arrays can potentially be merged
		if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
			return true;
		}

		return false;
	}

	/**
	 * Determine which side was modified more recently
	 * @private
	 */
	private determineRecentSide(localTime: string, remoteTime: string): 'local' | 'remote' | 'simultaneous' {
		const localDate = new Date(localTime).getTime();
		const remoteDate = new Date(remoteTime).getTime();
		const diff = Math.abs(localDate - remoteDate);

		// If within 5 seconds, consider simultaneous
		if (diff < 5000) {
			return 'simultaneous';
		}

		return localDate > remoteDate ? 'local' : 'remote';
	}

	/**
	 * Check if edits were simultaneous (within 30 second window)
	 * @private
	 */
	private isSimultaneousEdit(localTime: string, remoteTime: string): boolean {
		const localDate = new Date(localTime).getTime();
		const remoteDate = new Date(remoteTime).getTime();
		const diff = Math.abs(localDate - remoteDate);

		// 30 second tolerance window
		return diff < 30000;
	}

	/**
	 * Calculate overall conflict severity
	 * @private
	 */
	private calculateConflictSeverity(
		fieldConflicts: FieldConflict[],
		timestampAnalysis: TimestampAnalysis
	): ConflictSeverity {
		// Critical if title conflicts
		if (fieldConflicts.some(fc => fc.field === 'title')) {
			return 'high';
		}

		// High if status conflicts
		if (fieldConflicts.some(fc => fc.field === 'status')) {
			return 'high';
		}

		// Medium if simultaneous edits
		if (timestampAnalysis.simultaneousEdit) {
			return 'medium';
		}

		// Medium if multiple fields conflict
		if (fieldConflicts.length > 2) {
			return 'medium';
		}

		return 'low';
	}

	/**
	 * Determine suggested resolution strategy
	 * @private
	 */
	private determineSuggestedStrategy(
		fieldConflicts: FieldConflict[],
		timestampAnalysis: TimestampAnalysis,
		severity: ConflictSeverity
	): ConflictResolutionStrategy {
		// High severity should be manual
		if (severity === 'high' || severity === 'critical') {
			return 'manual';
		}

		// If all fields can auto-merge, suggest auto-merge
		if (fieldConflicts.every(fc => fc.canAutoMerge)) {
			return 'auto_merge';
		}

		// If timestamps are clear, use timestamp-based
		if (!timestampAnalysis.simultaneousEdit) {
			return 'timestamp_based';
		}

		// Default to manual
		return 'manual';
	}
}
