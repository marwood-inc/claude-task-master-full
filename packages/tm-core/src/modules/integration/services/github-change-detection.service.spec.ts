/**
 * @fileoverview Tests for GitHubChangeDetectionService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubChangeDetectionService } from './github-change-detection.service.js';
import type { Task } from '../../../common/types/index.js';
import type { GitHubIssue, SyncMapping } from '../types/github-types.js';
import type { GitHubClient } from '../clients/github-client.js';
import { GitHubSyncStateService } from './github-sync-state.service.js';
import { GitHubFieldMapper } from './github-field-mapper.js';

describe('GitHubChangeDetectionService', () => {
	let service: GitHubChangeDetectionService;
	let mockGithubClient: GitHubClient;
	let mockStateService: GitHubSyncStateService;
	let mockFieldMapper: GitHubFieldMapper;

	const owner = 'test-owner';
	const repo = 'test-repo';

	beforeEach(() => {
		// Create mocks
		mockGithubClient = {
			getIssue: vi.fn()
		} as any;

		mockStateService = {
			getMapping: vi.fn(),
			getChangeMetadata: vi.fn()
		} as any;

		mockFieldMapper = {} as any;

		service = new GitHubChangeDetectionService(
			mockGithubClient,
			mockStateService,
			mockFieldMapper,
			owner,
			repo
		);
	});

	describe('detectChanges', () => {
		it('should return null if no mapping exists', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test description',
				status: 'pending' as any,
				createdAt: '2024-01-01T00:00:00Z'
			};

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(null);

			const result = await service.detectChanges(task);

			expect(result).toBeNull();
		});

		it('should detect no changes when timestamps are same', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test description',
				status: 'pending' as any,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T10:00:00Z'
			};

			const issue: GitHubIssue = {
				number: 123,
				title: 'Test Task',
				body: 'Test description',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T10:00:00Z',
				html_url: 'https://github.com/test/repo/issues/123',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const mapping: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(mapping);
			vi.spyOn(mockGithubClient, 'getIssue').mockResolvedValue(issue);
			vi.spyOn(mockStateService, 'getChangeMetadata').mockResolvedValue(null);

			const result = await service.detectChanges(task, { strategy: 'timestamp' });

			expect(result).toBeDefined();
			expect(result?.hasChanges).toBe(false);
			expect(result?.hasLocalChanges).toBe(false);
			expect(result?.hasRemoteChanges).toBe(false);
			expect(result?.hasConflicts).toBe(false);
		});

		it('should detect local changes only', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test description',
				status: 'pending' as any,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T12:00:00Z' // After last sync
			};

			const issue: GitHubIssue = {
				number: 123,
				title: 'Test Task',
				body: 'Test description',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T09:00:00Z', // Before last sync
				html_url: 'https://github.com/test/repo/issues/123',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const mapping: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(mapping);
			vi.spyOn(mockGithubClient, 'getIssue').mockResolvedValue(issue);
			vi.spyOn(mockStateService, 'getChangeMetadata').mockResolvedValue(null);

			const result = await service.detectChanges(task, { strategy: 'timestamp' });

			expect(result).toBeDefined();
			expect(result?.hasChanges).toBe(true);
			expect(result?.hasLocalChanges).toBe(true);
			expect(result?.hasRemoteChanges).toBe(false);
			expect(result?.hasConflicts).toBe(false);
		});

		it('should detect remote changes only', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test description',
				status: 'pending' as any,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T09:00:00Z' // Before last sync
			};

			const issue: GitHubIssue = {
				number: 123,
				title: 'Test Task',
				body: 'Test description',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T12:00:00Z', // After last sync
				html_url: 'https://github.com/test/repo/issues/123',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const mapping: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(mapping);
			vi.spyOn(mockGithubClient, 'getIssue').mockResolvedValue(issue);
			vi.spyOn(mockStateService, 'getChangeMetadata').mockResolvedValue(null);

			const result = await service.detectChanges(task, { strategy: 'timestamp' });

			expect(result).toBeDefined();
			expect(result?.hasChanges).toBe(true);
			expect(result?.hasLocalChanges).toBe(false);
			expect(result?.hasRemoteChanges).toBe(true);
			expect(result?.hasConflicts).toBe(false);
		});

		it('should detect conflicts when both sides changed', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test description',
				status: 'pending' as any,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T12:00:00Z' // After last sync
			};

			const issue: GitHubIssue = {
				number: 123,
				title: 'Test Task',
				body: 'Test description',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T11:00:00Z', // After last sync
				html_url: 'https://github.com/test/repo/issues/123',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const mapping: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(mapping);
			vi.spyOn(mockGithubClient, 'getIssue').mockResolvedValue(issue);
			vi.spyOn(mockStateService, 'getChangeMetadata').mockResolvedValue(null);

			const result = await service.detectChanges(task, { strategy: 'timestamp' });

			expect(result).toBeDefined();
			expect(result?.hasChanges).toBe(true);
			expect(result?.hasLocalChanges).toBe(true);
			expect(result?.hasRemoteChanges).toBe(true);
			expect(result?.hasConflicts).toBe(true);
		});

		it('should detect field-level changes', async () => {
			const task: Task = {
				id: '1',
				title: 'Updated Task Title', // Changed
				description: 'Test description',
				status: 'pending' as any,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T10:00:00Z'
			};

			const issue: GitHubIssue = {
				number: 123,
				title: 'Test Task', // Original
				body: 'Test description',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T10:00:00Z',
				html_url: 'https://github.com/test/repo/issues/123',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const mapping: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(mapping);
			vi.spyOn(mockGithubClient, 'getIssue').mockResolvedValue(issue);
			vi.spyOn(mockStateService, 'getChangeMetadata').mockResolvedValue(null);

			const result = await service.detectChanges(task, {
				strategy: 'field-by-field'
			});

			expect(result).toBeDefined();
			expect(result?.hasChanges).toBe(true);
			expect(result?.fieldChanges.length).toBeGreaterThan(0);
			expect(result?.fieldChanges.some((fc) => fc.field === 'title')).toBe(true);
		});

		it('should use hybrid strategy by default', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test description',
				status: 'pending' as any,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T10:00:00Z'
			};

			const issue: GitHubIssue = {
				number: 123,
				title: 'Test Task',
				body: 'Test description',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T10:00:00Z',
				html_url: 'https://github.com/test/repo/issues/123',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const mapping: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(mapping);
			vi.spyOn(mockGithubClient, 'getIssue').mockResolvedValue(issue);
			vi.spyOn(mockStateService, 'getChangeMetadata').mockResolvedValue(null);

			const result = await service.detectChanges(task); // No strategy specified

			expect(result).toBeDefined();
			expect(result?.strategy).toBe('hybrid');
		});

		it('should include content hashes when requested', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test description',
				status: 'pending' as any,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T10:00:00Z'
			};

			const issue: GitHubIssue = {
				number: 123,
				title: 'Test Task',
				body: 'Test description',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T10:00:00Z',
				html_url: 'https://github.com/test/repo/issues/123',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const mapping: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(mapping);
			vi.spyOn(mockGithubClient, 'getIssue').mockResolvedValue(issue);
			vi.spyOn(mockStateService, 'getChangeMetadata').mockResolvedValue(null);

			const result = await service.detectChanges(task, {
				includeContentHashes: true
			});

			expect(result).toBeDefined();
			expect(result?.contentHashes).toBeDefined();
			expect(result?.contentHashes?.local).toBeTruthy();
			expect(result?.contentHashes?.remote).toBeTruthy();
		});
	});

	describe('detectChangesBatch', () => {
		it('should detect changes for multiple tasks', async () => {
			const tasks: Task[] = [
				{
					id: '1',
					title: 'Task 1',
					description: 'Description 1',
					status: 'pending' as any,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T12:00:00Z'
				},
				{
					id: '2',
					title: 'Task 2',
					description: 'Description 2',
					status: 'pending' as any,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T09:00:00Z'
				}
			];

			const issue1: GitHubIssue = {
				number: 123,
				title: 'Task 1',
				body: 'Description 1',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T09:00:00Z',
				html_url: 'https://github.com/test/repo/issues/123',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const issue2: GitHubIssue = {
				number: 124,
				title: 'Task 2',
				body: 'Description 2',
				state: 'open',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T12:00:00Z',
				html_url: 'https://github.com/test/repo/issues/124',
				user: {
					login: 'test-user',
					id: 1,
					avatar_url: '',
					url: ''
				},
				labels: []
			};

			const mapping1: SyncMapping = {
				taskId: '1',
				issueNumber: 123,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			const mapping2: SyncMapping = {
				taskId: '2',
				issueNumber: 124,
				owner,
				repo,
				lastSyncedAt: '2024-01-01T10:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			vi.spyOn(mockStateService, 'getMapping').mockImplementation(
				async (taskId: string) => {
					if (taskId === '1') return mapping1;
					if (taskId === '2') return mapping2;
					return null;
				}
			);

			vi.spyOn(mockGithubClient, 'getIssue').mockImplementation(
				async (owner: string, repo: string, issueNumber: number) => {
					if (issueNumber === 123) return issue1;
					if (issueNumber === 124) return issue2;
					throw new Error('Issue not found');
				}
			);

			vi.spyOn(mockStateService, 'getChangeMetadata').mockResolvedValue(null);

			const result = await service.detectChangesBatch(tasks, {
				strategy: 'timestamp'
			});

			expect(result.totalChecked).toBe(2);
			expect(result.itemsWithChanges).toBe(2);
			expect(result.results.length).toBe(2);

			// Task 1: local changes only
			const result1 = result.results.find((r) => r.taskId === '1');
			expect(result1?.hasLocalChanges).toBe(true);
			expect(result1?.hasRemoteChanges).toBe(false);

			// Task 2: remote changes only
			const result2 = result.results.find((r) => r.taskId === '2');
			expect(result2?.hasLocalChanges).toBe(false);
			expect(result2?.hasRemoteChanges).toBe(true);
		});

		it('should handle errors gracefully in batch', async () => {
			const tasks: Task[] = [
				{
					id: '1',
					title: 'Task 1',
					description: 'Description 1',
					status: 'pending' as any,
					createdAt: '2024-01-01T00:00:00Z',
					updatedAt: '2024-01-01T10:00:00Z'
				}
			];

			vi.spyOn(mockStateService, 'getMapping').mockResolvedValue(null);

			const result = await service.detectChangesBatch(tasks);

			// Should complete even with errors
			expect(result.totalChecked).toBe(0); // No mappings found
			expect(result.results.length).toBe(0);
		});
	});
});
