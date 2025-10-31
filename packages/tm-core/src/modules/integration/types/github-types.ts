/**
 * Comprehensive TypeScript type definitions for GitHub entities
 * Used for Task Master GitHub integration
 */

/**
 * GitHub Issue type
 * Represents a GitHub issue with all relevant fields for syncing
 */
export interface GitHubIssue {
	/** GitHub issue ID */
	id: number;

	/** GitHub issue number (repository-specific) */
	number: number;

	/** Issue title */
	title: string;

	/** Issue body/description (markdown) */
	body: string | null;

	/** Issue state (open, closed) */
	state: 'open' | 'closed';

	/** Labels attached to the issue */
	labels: GitHubLabel[];

	/** Assigned users */
	assignees: GitHubUser[];

	/** Milestone attached to the issue */
	milestone: GitHubMilestone | null;

	/** Issue creator */
	user: GitHubUser;

	/** HTML URL to the issue */
	html_url: string;

	/** Creation timestamp */
	created_at: string;

	/** Last update timestamp */
	updated_at: string;

	/** Close timestamp (if closed) */
	closed_at: string | null;

	/** Whether the issue is locked */
	locked: boolean;

	/** Lock reason (if locked) */
	active_lock_reason: string | null;
}

/**
 * GitHub Label type
 * Represents a label that can be attached to issues
 */
export interface GitHubLabel {
	/** Label ID */
	id: number;

	/** Label name */
	name: string;

	/** Label color (hex code without #) */
	color: string;

	/** Label description */
	description: string | null;

	/** Whether this is a default label */
	default: boolean;
}

/**
 * GitHub User type
 * Represents a GitHub user (for assignees, creators, etc.)
 */
export interface GitHubUser {
	/** User ID */
	id: number;

	/** Username/login */
	login: string;

	/** Avatar URL */
	avatar_url: string;

	/** Profile URL */
	html_url: string;

	/** User type (User, Bot, etc.) */
	type: string;
}

/**
 * GitHub Milestone type
 * Represents a milestone for grouping issues
 */
export interface GitHubMilestone {
	/** Milestone ID */
	id: number;

	/** Milestone number (repository-specific) */
	number: number;

	/** Milestone title */
	title: string;

	/** Milestone description */
	description: string | null;

	/** Milestone state (open, closed) */
	state: 'open' | 'closed';

	/** Open issues count */
	open_issues: number;

	/** Closed issues count */
	closed_issues: number;

	/** Due date */
	due_on: string | null;

	/** Creation timestamp */
	created_at: string;

	/** Last update timestamp */
	updated_at: string;

	/** Close timestamp (if closed) */
	closed_at: string | null;
}

/**
 * Sync mapping type
 * Maps Task Master tasks to GitHub issues
 */
export interface SyncMapping {
	/** Task Master task ID */
	taskId: string;

	/** GitHub issue number */
	issueNumber: number;

	/** GitHub repository owner */
	owner: string;

	/** GitHub repository name */
	repo: string;

	/** Last sync timestamp */
	lastSyncedAt: string;

	/** Last sync direction */
	lastSyncDirection: 'to_github' | 'from_github' | 'bidirectional';

	/** Sync status */
	status: 'synced' | 'pending' | 'conflict' | 'error';
}

/**
 * Sync conflict type
 * Represents a conflict between Task Master and GitHub
 */
export interface SyncConflict {
	/** Task Master task ID */
	taskId: string;

	/** GitHub issue number */
	issueNumber: number;

	/** Conflict type */
	type:
		| 'title_mismatch'
		| 'description_mismatch'
		| 'status_mismatch'
		| 'assignee_mismatch'
		| 'label_mismatch'
		| 'deleted_on_github'
		| 'deleted_locally';

	/** Task Master value */
	localValue: unknown;

	/** GitHub value */
	remoteValue: unknown;

	/** When the conflict was detected */
	detectedAt: string;

	/** Conflict resolution strategy */
	resolutionStrategy: 'prefer_local' | 'prefer_remote' | 'manual' | 'merge';

	/** Whether the conflict has been resolved */
	resolved: boolean;
}

/**
 * Sync state type
 * Represents the overall sync state for a repository
 */
export interface SyncState {
	/** Repository owner */
	owner: string;

	/** Repository name */
	repo: string;

	/** All sync mappings */
	mappings: SyncMapping[];

	/** All unresolved conflicts */
	conflicts: SyncConflict[];

	/** Last sync timestamp */
	lastSyncAt: string | null;

	/** Whether sync is currently in progress */
	syncInProgress: boolean;

	/** Last sync error (if any) */
	lastSyncError: string | null;
}

/**
 * Sync options type
 * Configuration options for sync operations
 */
export interface SyncOptions {
	/** Sync direction */
	direction: 'to_github' | 'from_github' | 'bidirectional';

	/** Whether to create new issues for unsynced tasks */
	createMissing: boolean;

	/** Whether to update existing issues */
	updateExisting: boolean;

	/** Conflict resolution strategy */
	conflictResolution: 'prefer_local' | 'prefer_remote' | 'manual' | 'merge';

	/** Whether to sync labels */
	syncLabels: boolean;

	/** Whether to sync assignees */
	syncAssignees: boolean;

	/** Whether to sync milestones */
	syncMilestones: boolean;

	/** Whether to sync comments */
	syncComments: boolean;

	/** Maximum number of issues to sync in one batch */
	batchSize: number;

	/** Whether to perform a dry run (no actual changes) */
	dryRun: boolean;
}

/**
 * Sync result type
 * Result of a sync operation
 */
export interface SyncResult {
	/** Whether the sync was successful */
	success: boolean;

	/** Number of tasks synced */
	tasksSynced: number;

	/** Number of issues synced */
	issuesSynced: number;

	/** Number of new mappings created */
	newMappings: number;

	/** Number of mappings updated */
	updatedMappings: number;

	/** Number of conflicts detected */
	conflictsDetected: number;

	/** Number of conflicts resolved */
	conflictsResolved: number;

	/** Errors encountered during sync */
	errors: Array<{
		taskId?: string;
		issueNumber?: number;
		error: string;
		timestamp: string;
	}>;

	/** Warnings generated during sync */
	warnings: Array<{
		taskId?: string;
		issueNumber?: number;
		message: string;
	}>;

	/** Sync duration in milliseconds */
	durationMs: number;

	/** Timestamp when sync started */
	startedAt: string;

	/** Timestamp when sync completed */
	completedAt: string;
}

/**
 * GitHub Project type
 * Represents a GitHub Project (v2)
 */
export interface GitHubProject {
	/** Project ID */
	id: string;

	/** Project number */
	number: number;

	/** Project title */
	title: string;

	/** Project description */
	description: string | null;

	/** Project state (open, closed) */
	state: 'open' | 'closed';

	/** Project URL */
	url: string;

	/** Creation timestamp */
	createdAt: string;

	/** Last update timestamp */
	updatedAt: string;
}

/**
 * GitHub Comment type
 * Represents a comment on an issue
 */
export interface GitHubComment {
	/** Comment ID */
	id: number;

	/** Comment body (markdown) */
	body: string;

	/** Comment author */
	user: GitHubUser;

	/** Creation timestamp */
	created_at: string;

	/** Last update timestamp */
	updated_at: string;

	/** HTML URL to the comment */
	html_url: string;
}

/**
 * Partial types for updates
 */

export type GitHubIssueUpdate = Partial<
	Pick<GitHubIssue, 'title' | 'body' | 'state'> & {
		labels: string[];
		assignees: string[];
		milestone: number | null;
	}
>;

export type GitHubLabelUpdate = Partial<
	Pick<GitHubLabel, 'name' | 'color' | 'description'>
>;

export type GitHubMilestoneUpdate = Partial<
	Pick<GitHubMilestone, 'title' | 'description' | 'state' | 'due_on'>
>;
