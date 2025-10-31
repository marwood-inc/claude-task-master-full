/**
 * Type exports for GitHub integration
 */

export type {
	GitHubIssue,
	GitHubLabel,
	GitHubUser,
	GitHubMilestone,
	GitHubProject,
	GitHubProjectV2,
	GitHubProjectClassic,
	GitHubProjectColumn,
	GitHubProjectCard,
	GitHubComment,
	SyncMapping,
	SyncConflict,
	SyncState,
	SyncOptions,
	SyncResult,
	GitHubIssueUpdate,
	GitHubLabelUpdate,
	GitHubMilestoneUpdate
} from './github-types.js';

export type {
	ConflictField,
	FieldConflictType,
	ConflictSeverity,
	ConflictResolutionStrategy,
	FieldConflict,
	TimestampAnalysis,
	ConflictResolution,
	ConflictInfo,
	ConflictDetectionResult
} from './github-conflict-types.js';

export type {
	ConflictAnalysis,
	DiffDisplayType,
	FieldDiffDisplay,
	DiffLine,
	ResolutionResult,
	BatchResolutionOptions,
	BatchResolutionResult,
	ConflictError,
	ValidationResult,
	PreviewResult,
	ResolutionHistory,
	ConflictState
} from './conflict-resolution-types.js';
