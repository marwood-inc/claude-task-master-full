/**
 * @fileoverview Integration module exports
 * GitHub API integration and sync state management
 */

// GitHub types
export type {
	GitHubIssue,
	GitHubLabel,
	GitHubUser,
	GitHubMilestone,
	GitHubProject,
	GitHubComment,
	GitHubIssueUpdate,
	GitHubLabelUpdate,
	GitHubMilestoneUpdate,
	SyncMapping,
	SyncConflict,
	SyncState,
	SyncOptions,
	SyncResult
} from './types/github-types.js';

// GitHub sync state types
export type {
	GitHubSyncStateFile,
	SyncOperationRecord,
	ChangeMetadata,
	StateBackupMetadata,
	StateFileOptions,
	StateFileOperationResult,
	SyncStateStats
} from './types/github-sync-state-types.js';

// Services
export { GitHubAuthService } from './services/github-auth.service.js';
export type {
	TokenValidationResult,
	TokenScopes,
	PermissionCheckResult,
	RateLimitStatus
} from './services/github-auth.service.js';
export { GitHubConfigService } from './services/github-config.service.js';
export type { GitHubConfigValidation } from './services/github-config.service.js';
export { GitHubSyncStateService } from './services/github-sync-state.service.js';
export { GitHubFieldMapper } from './services/github-field-mapper.js';

// Clients
export { GitHubClient } from './clients/github-client.js';
