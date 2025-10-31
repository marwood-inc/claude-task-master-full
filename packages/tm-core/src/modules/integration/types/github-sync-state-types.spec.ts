/**
 * @fileoverview Tests for GitHub Sync State Types
 */

import { describe, it, expect } from 'vitest';
import type {
	GitHubSyncStateFile,
	SyncOperationRecord,
	ChangeMetadata,
	StateBackupMetadata,
	StateFileOptions,
	StateFileOperationResult,
	SyncStateStats
} from './github-sync-state-types.js';
import type { SyncMapping, SyncConflict } from './github-types.js';

describe('GitHubSyncStateTypes', () => {
	describe('GitHubSyncStateFile', () => {
		it('should have correct structure for empty state', () => {
			const emptyState: GitHubSyncStateFile = {
				version: '1.0.0',
				owner: 'test-owner',
				repo: 'test-repo',
				mappings: {},
				conflicts: [],
				changeMetadata: {},
				operationHistory: [],
				maxHistorySize: 1000,
				lastSyncAt: null,
				syncInProgress: false,
				lastSyncError: null,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
				lastBackup: null
			};

			expect(emptyState.version).toBe('1.0.0');
			expect(emptyState.owner).toBe('test-owner');
			expect(emptyState.repo).toBe('test-repo');
			expect(Object.keys(emptyState.mappings)).toHaveLength(0);
			expect(emptyState.conflicts).toHaveLength(0);
			expect(emptyState.syncInProgress).toBe(false);
		});

		it('should support mappings as record', () => {
			const mapping: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner: 'test-owner',
				repo: 'test-repo',
				lastSyncedAt: '2024-01-01T00:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			const state: GitHubSyncStateFile = {
				version: '1.0.0',
				owner: 'test-owner',
				repo: 'test-repo',
				mappings: {
					'1': mapping
				},
				conflicts: [],
				changeMetadata: {},
				operationHistory: [],
				maxHistorySize: 1000,
				lastSyncAt: null,
				syncInProgress: false,
				lastSyncError: null,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
				lastBackup: null
			};

			expect(state.mappings['1']).toBe(mapping);
			expect(state.mappings['1'].taskId).toBe('1');
		});
	});

	describe('SyncOperationRecord', () => {
		it('should have correct structure', () => {
			const operation: SyncOperationRecord = {
				operationId: 'op-123',
				taskId: '1',
				issueNumber: 123,
				operationType: 'create_issue',
				direction: 'to_github',
				timestamp: '2024-01-01T00:00:00Z',
				success: true
			};

			expect(operation.operationType).toBe('create_issue');
			expect(operation.success).toBe(true);
			expect(operation.error).toBeUndefined();
		});

		it('should support error field', () => {
			const operation: SyncOperationRecord = {
				operationId: 'op-123',
				taskId: '1',
				issueNumber: 123,
				operationType: 'update_issue',
				direction: 'to_github',
				timestamp: '2024-01-01T00:00:00Z',
				success: false,
				error: 'Network error'
			};

			expect(operation.success).toBe(false);
			expect(operation.error).toBe('Network error');
		});

		it('should support metadata field', () => {
			const operation: SyncOperationRecord = {
				operationId: 'op-123',
				taskId: '1',
				issueNumber: 123,
				operationType: 'resolve_conflict',
				direction: 'bidirectional',
				timestamp: '2024-01-01T00:00:00Z',
				success: true,
				metadata: {
					resolutionStrategy: 'prefer_local',
					conflictType: 'title_mismatch'
				}
			};

			expect(operation.metadata).toBeDefined();
			expect(operation.metadata?.resolutionStrategy).toBe('prefer_local');
		});
	});

	describe('ChangeMetadata', () => {
		it('should track local and remote timestamps', () => {
			const metadata: ChangeMetadata = {
				taskId: '1',
				issueNumber: 123,
				localUpdatedAt: '2024-01-01T10:00:00Z',
				remoteUpdatedAt: '2024-01-01T09:00:00Z',
				lastCheckedAt: '2024-01-01T11:00:00Z',
				hasLocalChanges: true,
				hasRemoteChanges: false
			};

			expect(metadata.hasLocalChanges).toBe(true);
			expect(metadata.hasRemoteChanges).toBe(false);
		});

		it('should support content hashes', () => {
			const metadata: ChangeMetadata = {
				taskId: '1',
				issueNumber: 123,
				localUpdatedAt: '2024-01-01T10:00:00Z',
				remoteUpdatedAt: '2024-01-01T09:00:00Z',
				lastCheckedAt: '2024-01-01T11:00:00Z',
				hasLocalChanges: false,
				hasRemoteChanges: false,
				localContentHash: 'abc123',
				remoteContentHash: 'abc123'
			};

			expect(metadata.localContentHash).toBe('abc123');
			expect(metadata.remoteContentHash).toBe('abc123');
		});
	});

	describe('StateBackupMetadata', () => {
		it('should have correct structure', () => {
			const backup: StateBackupMetadata = {
				backupPath: '.taskmaster/backups/github-sync-state-2024-01-01.json',
				createdAt: '2024-01-01T00:00:00Z',
				mappingCount: 50,
				version: '1.0.0'
			};

			expect(backup.mappingCount).toBe(50);
			expect(backup.version).toBe('1.0.0');
		});
	});

	describe('StateFileOptions', () => {
		it('should support all optional fields', () => {
			const options: StateFileOptions = {
				createBackup: true,
				validateSchema: true,
				autoRecoverFromBackup: true,
				maxHistoryAgeDays: 30
			};

			expect(options.createBackup).toBe(true);
			expect(options.maxHistoryAgeDays).toBe(30);
		});

		it('should allow empty options', () => {
			const options: StateFileOptions = {};

			expect(options).toBeDefined();
		});
	});

	describe('StateFileOperationResult', () => {
		it('should represent successful operation', () => {
			const result: StateFileOperationResult = {
				success: true,
				backupCreated: true
			};

			expect(result.success).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('should represent failed operation with error', () => {
			const result: StateFileOperationResult = {
				success: false,
				error: 'File corruption detected',
				recoveryPerformed: true,
				warnings: ['Backup was older than expected']
			};

			expect(result.success).toBe(false);
			expect(result.error).toBe('File corruption detected');
			expect(result.recoveryPerformed).toBe(true);
			expect(result.warnings).toHaveLength(1);
		});
	});

	describe('SyncStateStats', () => {
		it('should provide comprehensive statistics', () => {
			const stats: SyncStateStats = {
				totalMappings: 100,
				syncedMappings: 80,
				pendingMappings: 15,
				conflictMappings: 3,
				errorMappings: 2,
				unresolvedConflicts: 3,
				operationHistoryCount: 500,
				lastSyncAt: '2024-01-01T00:00:00Z',
				fileSizeBytes: 51200,
				needsCleanup: true
			};

			expect(stats.totalMappings).toBe(100);
			expect(stats.syncedMappings).toBe(80);
			expect(stats.needsCleanup).toBe(true);
		});
	});
});
