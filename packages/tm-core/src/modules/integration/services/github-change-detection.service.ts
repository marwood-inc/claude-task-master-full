/**
 * @fileoverview GitHub Change Detection Service
 * Implements bidirectional change detection between tasks and issues
 * with support for multiple detection strategies
 */

import crypto from 'node:crypto';
import type { Task } from '../../../common/types/index.js';
import type { GitHubIssue } from '../types/github-types.js';
import type {
	ChangeDetectionResult,
	BatchChangeDetectionResult,
	ChangeDetectionOptions,
	ChangeDetectionStrategy,
	FieldChange,
	FieldMapping
} from '../types/github-change-detection-types.js';
import type { GitHubClient } from '../clients/github-client.js';
import { GitHubSyncStateService } from './github-sync-state.service.js';
import { GitHubFieldMapper } from './github-field-mapper.js';
import { getLogger } from '../../../common/logger/index.js';

const logger = getLogger('GitHubChangeDetectionService');

/**
 * Default field mappings for comparison
 */
const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
	{ taskField: 'title', issueField: 'title' },
	{ taskField: 'description', issueField: 'body' },
	{ taskField: 'status', issueField: 'state' },
	{ taskField: 'priority', issueField: 'labels', transform: (labels: any) => labels },
	{ taskField: 'complexity', issueField: 'labels', transform: (labels: any) => labels }
];

/**
 * Default change detection options
 */
const DEFAULT_OPTIONS: Required<ChangeDetectionOptions> = {
	strategy: 'hybrid',
	fieldsToCompare: null, // null = all fields
	includeContentHashes: true,
	batchSize: 50
};

/**
 * GitHubChangeDetectionService
 * Provides bidirectional change detection capabilities
 */
export class GitHubChangeDetectionService {
	private readonly githubClient: GitHubClient;
	private readonly stateService: GitHubSyncStateService;
	private readonly fieldMapper: GitHubFieldMapper;
	private readonly owner: string;
	private readonly repo: string;

	constructor(
		githubClient: GitHubClient,
		stateService: GitHubSyncStateService,
		fieldMapper: GitHubFieldMapper,
		owner: string,
		repo: string
	) {
		this.githubClient = githubClient;
		this.stateService = stateService;
		this.fieldMapper = fieldMapper;
		this.owner = owner;
		this.repo = repo;

		logger.info('GitHubChangeDetectionService initialized', { owner, repo });
	}

	/**
	 * Detect changes for a single task-issue pair
	 */
	async detectChanges(
		task: Task,
		options: ChangeDetectionOptions = {}
	): Promise<ChangeDetectionResult | null> {
		const opts = { ...DEFAULT_OPTIONS, ...options };

		logger.debug('Detecting changes for task', {
			taskId: task.id,
			strategy: opts.strategy
		});

		// Get mapping for task
		const mapping = await this.stateService.getMapping(task.id);
		if (!mapping) {
			logger.debug('No mapping found for task', { taskId: task.id });
			return null;
		}

		// Fetch remote issue
		let issue: GitHubIssue;
		try {
			issue = await this.githubClient.getIssue(
				this.owner,
				this.repo,
				mapping.issueNumber
			);
		} catch (error: any) {
			logger.error('Failed to fetch issue for change detection', {
				taskId: task.id,
				issueNumber: mapping.issueNumber,
				error
			});
			throw new Error(
				`Failed to fetch issue ${mapping.issueNumber}: ${error.message}`
			);
		}

		// Get change metadata from state
		const changeMetadata = await this.stateService.getChangeMetadata(task.id);

		// Select detection strategy
		const strategy = opts.strategy;

		// Perform change detection based on strategy
		let result: ChangeDetectionResult;

		if (strategy === 'timestamp') {
			result = await this.detectChangesTimestamp(task, issue, mapping.lastSyncedAt);
		} else if (strategy === 'content-hash') {
			result = await this.detectChangesContentHash(task, issue, mapping.lastSyncedAt);
		} else if (strategy === 'field-by-field') {
			result = await this.detectChangesFieldByField(
				task,
				issue,
				mapping.lastSyncedAt,
				opts.fieldsToCompare
			);
		} else {
			// Hybrid: Use timestamp first, then field-by-field for conflicts
			result = await this.detectChangesHybrid(
				task,
				issue,
				mapping.lastSyncedAt,
				changeMetadata
			);
		}

		// Add content hashes if requested
		if (opts.includeContentHashes) {
			result.contentHashes = {
				local: this.calculateContentHash(task),
				remote: this.calculateContentHash(issue)
			};
		}

		logger.debug('Change detection completed', {
			taskId: task.id,
			hasChanges: result.hasChanges,
			hasConflicts: result.hasConflicts
		});

		return result;
	}

	/**
	 * Detect changes for multiple task-issue pairs
	 */
	async detectChangesBatch(
		tasks: Task[],
		options: ChangeDetectionOptions = {}
	): Promise<BatchChangeDetectionResult> {
		const opts = { ...DEFAULT_OPTIONS, ...options };

		logger.info('Detecting changes for batch', {
			taskCount: tasks.length,
			strategy: opts.strategy
		});

		const result: BatchChangeDetectionResult = {
			totalChecked: 0,
			itemsWithChanges: 0,
			itemsWithLocalChanges: 0,
			itemsWithRemoteChanges: 0,
			itemsWithConflicts: 0,
			results: [],
			detectedAt: new Date().toISOString(),
			strategy: opts.strategy
		};

		// Process in batches for efficiency
		const batches = this.splitIntoBatches(tasks, opts.batchSize);

		for (const batch of batches) {
			const batchResults = await Promise.all(
				batch.map(async (task) => {
					try {
						return await this.detectChanges(task, options);
					} catch (error: any) {
						logger.warn('Failed to detect changes for task', {
							taskId: task.id,
							error
						});
						return null;
					}
				})
			);

			// Filter out null results and update counters
			for (const changeResult of batchResults) {
				if (changeResult) {
					result.totalChecked++;
					result.results.push(changeResult);

					if (changeResult.hasChanges) {
						result.itemsWithChanges++;
					}

					if (changeResult.hasLocalChanges) {
						result.itemsWithLocalChanges++;
					}

					if (changeResult.hasRemoteChanges) {
						result.itemsWithRemoteChanges++;
					}

					if (changeResult.hasConflicts) {
						result.itemsWithConflicts++;
					}
				}
			}
		}

		logger.info('Batch change detection completed', {
			totalChecked: result.totalChecked,
			itemsWithChanges: result.itemsWithChanges,
			itemsWithConflicts: result.itemsWithConflicts
		});

		return result;
	}

	/**
	 * Timestamp-based change detection
	 */
	private async detectChangesTimestamp(
		task: Task,
		issue: GitHubIssue,
		lastSyncedAt: string
	): Promise<ChangeDetectionResult> {
		const taskUpdatedAt = task.updatedAt || task.createdAt || new Date().toISOString();
		const issueUpdatedAt = issue.updated_at;

		const lastSyncDate = new Date(lastSyncedAt);
		const taskDate = new Date(taskUpdatedAt);
		const issueDate = new Date(issueUpdatedAt);

		const hasLocalChanges = taskDate > lastSyncDate;
		const hasRemoteChanges = issueDate > lastSyncDate;

		return {
			taskId: task.id,
			issueNumber: issue.number,
			hasChanges: hasLocalChanges || hasRemoteChanges,
			hasLocalChanges,
			hasRemoteChanges,
			hasConflicts: hasLocalChanges && hasRemoteChanges,
			fieldChanges: [], // Timestamp strategy doesn't provide field-level details
			localUpdatedAt: taskUpdatedAt,
			remoteUpdatedAt: issueUpdatedAt,
			lastSyncedAt,
			strategy: 'timestamp'
		};
	}

	/**
	 * Content hash-based change detection
	 */
	private async detectChangesContentHash(
		task: Task,
		issue: GitHubIssue,
		lastSyncedAt: string
	): Promise<ChangeDetectionResult> {
		const taskUpdatedAt = task.updatedAt || task.createdAt || new Date().toISOString();
		const issueUpdatedAt = issue.updated_at;

		// Get previous content hashes from metadata
		const metadata = await this.stateService.getChangeMetadata(task.id);

		const currentLocalHash = this.calculateContentHash(task);
		const currentRemoteHash = this.calculateContentHash(issue);

		const hasLocalChanges =
			!metadata?.localContentHash ||
			metadata.localContentHash !== currentLocalHash;

		const hasRemoteChanges =
			!metadata?.remoteContentHash ||
			metadata.remoteContentHash !== currentRemoteHash;

		return {
			taskId: task.id,
			issueNumber: issue.number,
			hasChanges: hasLocalChanges || hasRemoteChanges,
			hasLocalChanges,
			hasRemoteChanges,
			hasConflicts: hasLocalChanges && hasRemoteChanges,
			fieldChanges: [], // Hash strategy doesn't provide field-level details
			localUpdatedAt: taskUpdatedAt,
			remoteUpdatedAt: issueUpdatedAt,
			lastSyncedAt,
			strategy: 'content-hash',
			contentHashes: {
				local: currentLocalHash,
				remote: currentRemoteHash
			}
		};
	}

	/**
	 * Field-by-field change detection
	 */
	private async detectChangesFieldByField(
		task: Task,
		issue: GitHubIssue,
		lastSyncedAt: string,
		fieldsToCompare: string[] | null = null
	): Promise<ChangeDetectionResult> {
		const taskUpdatedAt = task.updatedAt || task.createdAt || new Date().toISOString();
		const issueUpdatedAt = issue.updated_at;

		const fieldChanges: FieldChange[] = [];

		// Get field mappings to compare
		const mappingsToUse = fieldsToCompare
			? DEFAULT_FIELD_MAPPINGS.filter((m) =>
					fieldsToCompare.includes(m.taskField)
				)
			: DEFAULT_FIELD_MAPPINGS;

		// Compare each field
		for (const mapping of mappingsToUse) {
			if (mapping.ignore) {
				continue;
			}

			const localValue = this.getTaskFieldValue(task, mapping.taskField);
			const remoteValue = this.getIssueFieldValue(issue, mapping.issueField);

			// Apply transform if specified
			const transformedLocalValue = mapping.transform
				? mapping.transform(localValue)
				: localValue;
			const transformedRemoteValue = mapping.transform
				? mapping.transform(remoteValue)
				: remoteValue;

			// Compare values
			if (!this.areValuesEqual(transformedLocalValue, transformedRemoteValue)) {
				// Values are different - determine direction
				// For now, assume both changed (will be refined with sync history)
				fieldChanges.push({
					field: mapping.taskField,
					localValue: transformedLocalValue,
					remoteValue: transformedRemoteValue,
					isConflict: true, // Conservative: assume conflict
					direction: 'both'
				});
			}
		}

		const hasChanges = fieldChanges.length > 0;
		const hasConflicts = fieldChanges.some((fc) => fc.isConflict);

		// For now, if there are field changes, assume both sides changed
		// This will be refined in subtask 6.3 with conflict resolution
		const hasLocalChanges = hasChanges;
		const hasRemoteChanges = hasChanges;

		return {
			taskId: task.id,
			issueNumber: issue.number,
			hasChanges,
			hasLocalChanges,
			hasRemoteChanges,
			hasConflicts,
			fieldChanges,
			localUpdatedAt: taskUpdatedAt,
			remoteUpdatedAt: issueUpdatedAt,
			lastSyncedAt,
			strategy: 'field-by-field'
		};
	}

	/**
	 * Hybrid change detection (timestamp + field-by-field)
	 */
	private async detectChangesHybrid(
		task: Task,
		issue: GitHubIssue,
		lastSyncedAt: string,
		changeMetadata: any
	): Promise<ChangeDetectionResult> {
		// First, check timestamps for quick detection
		const timestampResult = await this.detectChangesTimestamp(
			task,
			issue,
			lastSyncedAt
		);

		// If no changes detected by timestamp, return early
		if (!timestampResult.hasChanges) {
			return {
				...timestampResult,
				strategy: 'hybrid'
			};
		}

		// If changes detected, do field-by-field comparison for details
		const fieldResult = await this.detectChangesFieldByField(
			task,
			issue,
			lastSyncedAt
		);

		return {
			...fieldResult,
			strategy: 'hybrid'
		};
	}

	/**
	 * Calculate content hash for change detection
	 */
	private calculateContentHash(data: unknown): string {
		// Serialize object to stable JSON string
		const jsonString = JSON.stringify(data, Object.keys(data).sort());

		// Calculate SHA-256 hash
		return crypto.createHash('sha256').update(jsonString).digest('hex');
	}

	/**
	 * Get task field value
	 */
	private getTaskFieldValue(task: Task, field: string): unknown {
		return (task as any)[field];
	}

	/**
	 * Get issue field value
	 */
	private getIssueFieldValue(issue: GitHubIssue, field: string): unknown {
		return (issue as any)[field];
	}

	/**
	 * Compare values for equality
	 */
	private areValuesEqual(a: unknown, b: unknown): boolean {
		// Handle null/undefined
		if (a === null && b === null) return true;
		if (a === undefined && b === undefined) return true;
		if (a === null || b === null) return false;
		if (a === undefined || b === undefined) return false;

		// Handle primitives
		if (typeof a !== 'object' || typeof b !== 'object') {
			return a === b;
		}

		// Handle arrays
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return false;

			// Sort arrays for comparison (order-independent)
			const sortedA = [...a].sort();
			const sortedB = [...b].sort();

			return sortedA.every((val, idx) => this.areValuesEqual(val, sortedB[idx]));
		}

		// Handle objects
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);

		if (keysA.length !== keysB.length) return false;

		return keysA.every((key) =>
			this.areValuesEqual((a as any)[key], (b as any)[key])
		);
	}

	/**
	 * Split items into batches
	 */
	private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
		const batches: T[][] = [];

		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}

		return batches;
	}
}
