/**
 * Service exports for integration module
 */

export { GitHubAuthService } from './github-auth.service.js';
export type {
	TokenValidationResult,
	TokenScopes,
	PermissionCheckResult,
	RateLimitStatus
} from './github-auth.service.js';

export { GitHubFieldMapper } from './github-field-mapper.js';
export type { FieldMappingConfig } from './github-field-mapper.js';

export {
	GitHubResilienceService,
	createResilienceService
} from './github-resilience.js';
export type { ResilienceConfig, RetryStats } from './github-resilience.js';

export { GitHubSyncService } from './github-sync.service.js';
export type {
	TaskSyncResult,
	SubtaskSyncResult,
	DependencySyncResult,
	GitHubSyncResult
} from './github-sync.service.js';

export { GitHubSyncStateService } from './github-sync-state.service.js';
export type {
	StateFileOptions,
	StateFileOperationResult,
	SyncStateStats
} from '../types/github-sync-state-types.js';
