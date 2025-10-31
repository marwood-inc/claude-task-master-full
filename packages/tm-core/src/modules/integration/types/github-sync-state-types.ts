/**
 * @fileoverview Type definitions for GitHub Sync State management
 * Persistent tracking system for task-issue mappings and sync history
 */

import type { SyncMapping, SyncConflict } from './github-types.js';

/**
 * Individual sync operation record for audit trail
 */
export interface SyncOperationRecord {
	/** Unique operation ID */
	operationId: string;

	/** Task ID involved in the sync */
	taskId: string;

	/** GitHub issue number involved */
	issueNumber: number;

	/** Operation type */
	operationType:
		| 'create_issue'
		| 'update_issue'
		| 'create_task'
		| 'update_task'
		| 'resolve_conflict';

	/** Sync direction for this operation */
	direction: 'to_github' | 'from_github' | 'bidirectional';

	/** Operation timestamp */
	timestamp: string;

	/** Whether the operation succeeded */
	success: boolean;

	/** Error message if operation failed */
	error?: string;

	/** Additional operation metadata */
	metadata?: Record<string, unknown>;
}

/**
 * Change detection metadata
 * Tracks local and remote timestamps for conflict detection
 */
export interface ChangeMetadata {
	/** Task ID */
	taskId: string;

	/** GitHub issue number */
	issueNumber: number;

	/** Local task last updated timestamp */
	localUpdatedAt: string;

	/** Remote issue last updated timestamp */
	remoteUpdatedAt: string;

	/** Last time we checked for changes */
	lastCheckedAt: string;

	/** Whether changes were detected since last sync */
	hasLocalChanges: boolean;

	/** Whether remote changes were detected */
	hasRemoteChanges: boolean;

	/** Hash of task content for quick change detection */
	localContentHash?: string;

	/** Hash of issue content for quick change detection */
	remoteContentHash?: string;
}

/**
 * Backup metadata for state file recovery
 */
export interface StateBackupMetadata {
	/** Backup file path */
	backupPath: string;

	/** When the backup was created */
	createdAt: string;

	/** Number of mappings in the backup */
	mappingCount: number;

	/** State file version at backup time */
	version: string;
}

/**
 * Complete GitHub Sync State file structure
 * Stored in .taskmaster/github-sync-state.json
 */
export interface GitHubSyncStateFile {
	/** Schema version for migration support */
	version: string;

	/** Repository owner */
	owner: string;

	/** Repository name */
	repo: string;

	/** All task-to-issue mappings */
	mappings: Record<string, SyncMapping>;

	/** All unresolved conflicts */
	conflicts: SyncConflict[];

	/** Change detection metadata for all mappings */
	changeMetadata: Record<string, ChangeMetadata>;

	/** Sync operation history (limited to last N operations) */
	operationHistory: SyncOperationRecord[];

	/** Maximum number of operations to keep in history */
	maxHistorySize: number;

	/** Last sync timestamp */
	lastSyncAt: string | null;

	/** Whether sync is currently in progress */
	syncInProgress: boolean;

	/** Last sync error (if any) */
	lastSyncError: string | null;

	/** Timestamp when state file was created */
	createdAt: string;

	/** Timestamp when state file was last updated */
	updatedAt: string;

	/** Backup metadata (if backup exists) */
	lastBackup: StateBackupMetadata | null;
}

/**
 * Options for state file operations
 */
export interface StateFileOptions {
	/** Whether to create a backup before operations */
	createBackup?: boolean;

	/** Whether to validate state file schema */
	validateSchema?: boolean;

	/** Whether to recover from backup on corruption */
	autoRecoverFromBackup?: boolean;

	/** Maximum age of operation history to keep (in days) */
	maxHistoryAgeDays?: number;
}

/**
 * Result of state file operation
 */
export interface StateFileOperationResult {
	/** Whether the operation succeeded */
	success: boolean;

	/** Error message if operation failed */
	error?: string;

	/** Whether a backup was created */
	backupCreated?: boolean;

	/** Whether recovery from backup was performed */
	recoveryPerformed?: boolean;

	/** Any warnings generated during the operation */
	warnings?: string[];
}

/**
 * Statistics about the sync state
 */
export interface SyncStateStats {
	/** Total number of mappings */
	totalMappings: number;

	/** Number of synced mappings */
	syncedMappings: number;

	/** Number of pending mappings */
	pendingMappings: number;

	/** Number of conflict mappings */
	conflictMappings: number;

	/** Number of error mappings */
	errorMappings: number;

	/** Total number of unresolved conflicts */
	unresolvedConflicts: number;

	/** Number of operations in history */
	operationHistoryCount: number;

	/** Last sync timestamp */
	lastSyncAt: string | null;

	/** State file size in bytes */
	fileSizeBytes: number;

	/** Whether state file needs cleanup */
	needsCleanup: boolean;
}

/**
 * Subtask synchronization mode
 * Determines how subtasks are represented in GitHub
 */
export type SubtaskSyncMode = 'checklist' | 'separate_issues';

/**
 * Subtask mapping for checklist mode
 * Tracks subtask as checkbox item in parent issue body
 */
export interface SubtaskChecklistMapping {
	/** Parent task ID */
	parentTaskId: string;

	/** Subtask ID */
	subtaskId: string;

	/** Parent GitHub issue number */
	parentIssueNumber: number;

	/** Checkbox index in parent issue body */
	checkboxIndex: number;

	/** Whether checkbox is checked */
	checked: boolean;

	/** Last synced timestamp */
	lastSyncedAt: string;
}

/**
 * Subtask mapping for separate-issues mode
 * Tracks subtask as child GitHub issue
 */
export interface SubtaskSeparateIssueMapping {
	/** Parent task ID */
	parentTaskId: string;

	/** Subtask ID */
	subtaskId: string;

	/** Parent GitHub issue number */
	parentIssueNumber: number;

	/** Child GitHub issue number */
	childIssueNumber: number;

	/** Last synced timestamp */
	lastSyncedAt: string;
}

/**
 * Task dependency mapping
 * Maps Task Master dependencies to GitHub issue references
 */
export interface DependencyMapping {
	/** Dependent task ID (depends on another task) */
	dependentTaskId: string;

	/** Dependency task ID (the task that is depended upon) */
	dependencyTaskId: string;

	/** Dependent GitHub issue number */
	dependentIssueNumber: number;

	/** Dependency GitHub issue number */
	dependencyIssueNumber: number;

	/** Whether dependency reference is in issue body */
	inBody: boolean;

	/** Body reference format (e.g., "Depends on #123") */
	bodyReference?: string;

	/** Last synced timestamp */
	lastSyncedAt: string;
}

/**
 * Label mapping configuration
 * Maps Task Master statuses/priorities to GitHub labels
 */
export interface LabelMapping {
	/** Task Master field type */
	field: 'status' | 'priority' | 'complexity';

	/** Task Master field value */
	value: string;

	/** Corresponding GitHub label name */
	labelName: string;

	/** GitHub label color (hex without #) */
	labelColor?: string;

	/** Whether label should be created if it doesn't exist */
	autoCreate: boolean;
}

/**
 * Sync options for one-way Task → GitHub sync
 */
export interface GitHubSyncOptions {
	/** Whether this is a dry-run (preview changes without API calls) */
	dryRun: boolean;

	/** Subtask synchronization mode */
	subtaskMode: SubtaskSyncMode;

	/** Batch size for API operations (default: 100) */
	batchSize: number;

	/** Whether to create labels automatically */
	autoCreateLabels: boolean;

	/** Custom label mappings (overrides defaults) */
	customLabelMappings?: LabelMapping[];

	/** Whether to sync dependencies as issue references */
	syncDependencies: boolean;

	/** Whether to sync subtasks */
	syncSubtasks: boolean;
}

/**
 * Dry-run sync result
 * Preview of changes that would be made
 */
export interface DryRunSyncResult {
	/** Tasks that would create new issues */
	tasksToCreate: string[];

	/** Tasks that would update existing issues */
	tasksToUpdate: string[];

	/** Issues that would be affected */
	issuesAffected: number[];

	/** Labels that would be created */
	labelsToCreate: string[];

	/** Dependencies that would be added */
	dependenciesToAdd: DependencyMapping[];

	/** Subtasks that would be synced */
	subtasksToSync: (SubtaskChecklistMapping | SubtaskSeparateIssueMapping)[];

	/** Total number of API calls that would be made */
	estimatedApiCalls: number;
}

/**
 * Extended sync state file with Task 4 requirements
 * Extends GitHubSyncStateFile with subtask, dependency, and label mappings
 */
export interface ExtendedGitHubSyncState extends GitHubSyncStateFile {
	/** Subtask synchronization mode */
	subtaskMode: SubtaskSyncMode;

	/** Subtask checklist mappings (for checklist mode) */
	subtaskChecklistMappings: Record<string, SubtaskChecklistMapping>;

	/** Subtask separate issue mappings (for separate-issues mode) */
	subtaskSeparateIssueMappings: Record<string, SubtaskSeparateIssueMapping>;

	/** Task dependency mappings */
	dependencyMappings: DependencyMapping[];

	/** Label mappings configuration */
	labelMappings: LabelMapping[];

	/** Last sync options used */
	lastSyncOptions: GitHubSyncOptions | null;
}
