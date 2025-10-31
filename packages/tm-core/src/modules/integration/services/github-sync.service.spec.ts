/**
 * @fileoverview Unit tests for GitHubSyncService
 * Tests core synchronization logic with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubSyncService } from './github-sync.service.js';
import type { Task } from '../../../common/types/index.js';
import type { GitHubClient } from '../clients/github-client.js';
import type { GitHubSyncStateService } from './github-sync-state.service.js';
import type { GitHubFieldMapper } from './github-field-mapper.js';
import type { GitHubResilienceService } from './github-resilience.js';
import type { SyncMapping } from '../types/github-types.js';

describe('GitHubSyncService', () => {
	let service: GitHubSyncService;
	let mockGitHubClient: any;
	let mockStateService: any;
	let mockFieldMapper: any;
	let mockResilienceService: any;

	const owner = 'test-owner';
	const repo = 'test-repo';

	beforeEach(() => {
		// Mock GitHub client
		mockGitHubClient = {
			createIssue: vi.fn(),
			updateIssue: vi.fn(),
			listLabels: vi.fn(),
			createLabel: vi.fn()
		};

		// Mock state service
		mockStateService = {
			getMapping: vi.fn(),
			setMapping: vi.fn(),
			markSyncInProgress: vi.fn(),
			markSyncComplete: vi.fn(),
			recordOperation: vi.fn()
		};

		// Mock field mapper
		mockFieldMapper = {
			taskToIssueCreate: vi.fn(),
			taskToIssueUpdate: vi.fn(),
			getDefaultLabels: vi.fn(),
			getSuggestedStatusLabels: vi.fn()
		};

		// Mock resilience service
		mockResilienceService = {
			executeWithRetry: vi.fn()
		};

		service = new GitHubSyncService(
			mockGitHubClient as unknown as GitHubClient,
			mockStateService as unknown as GitHubSyncStateService,
			mockFieldMapper as unknown as GitHubFieldMapper,
			mockResilienceService as unknown as GitHubResilienceService,
			owner,
			repo
		);
	});

	describe('syncToGitHub', () => {
		it('should create new issue for unmapped task', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test Description',
				status: 'pending',
				priority: 'medium',
				dependencies: [],
				subtasks: [],
				tags: []
			};

			// Mock no existing mapping
			mockStateService.getMapping.mockResolvedValue(null);

			// Mock field mapper
			mockFieldMapper.taskToIssueCreate.mockReturnValue({
				title: task.title,
				body: task.description,
				labels: ['tm-status:pending', 'priority: medium'],
				assignees: []
			});

			// Mock label operations
			mockFieldMapper.getDefaultLabels.mockReturnValue([]);
			mockFieldMapper.getSuggestedStatusLabels.mockReturnValue([]);
			mockResilienceService.executeWithRetry.mockImplementation((fn) => fn());
			mockGitHubClient.listLabels.mockResolvedValue([]);

			// Mock issue creation
			mockGitHubClient.createIssue.mockResolvedValue({
				number: 123,
				title: task.title,
				body: task.description
			});

			// Execute sync
			const result = await service.syncToGitHub([task]);

			// Verify
			expect(result.success).toBe(true);
			expect(result.tasksProcessed).toBe(1);
			expect(result.tasksCreated).toBe(1);
			expect(result.tasksUpdated).toBe(0);
			expect(result.tasksFailed).toBe(0);

			expect(mockGitHubClient.createIssue).toHaveBeenCalledWith(
				owner,
				repo,
				expect.objectContaining({
					title: task.title,
					body: task.description
				})
			);

			expect(mockStateService.setMapping).toHaveBeenCalledWith(
				expect.objectContaining({
					taskId: task.id,
					issueNumber: 123
				})
			);

			expect(mockStateService.markSyncInProgress).toHaveBeenCalled();
			expect(mockStateService.markSyncComplete).toHaveBeenCalled();
		});

		it('should update existing issue for mapped task', async () => {
			const task: Task = {
				id: '1',
				title: 'Updated Task',
				description: 'Updated Description',
				status: 'in-progress',
				priority: 'high',
				dependencies: [],
				subtasks: [],
				tags: []
			};

			const existingMapping: SyncMapping = {
				taskId: task.id,
				issueNumber: 456,
				owner,
				repo,
				lastSyncedAt: new Date().toISOString(),
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			// Mock existing mapping
			mockStateService.getMapping.mockResolvedValue(existingMapping);

			// Mock field mapper
			mockFieldMapper.taskToIssueUpdate.mockReturnValue({
				title: task.title,
				body: task.description,
				state: 'open',
				labels: ['tm-status:in-progress', 'priority: high'],
				assignees: []
			});

			// Mock label operations
			mockFieldMapper.getDefaultLabels.mockReturnValue([]);
			mockFieldMapper.getSuggestedStatusLabels.mockReturnValue([]);
			mockResilienceService.executeWithRetry.mockImplementation((fn) => fn());
			mockGitHubClient.listLabels.mockResolvedValue([]);

			// Mock issue update
			mockGitHubClient.updateIssue.mockResolvedValue({
				number: 456,
				title: task.title,
				body: task.description
			});

			// Execute sync
			const result = await service.syncToGitHub([task]);

			// Verify
			expect(result.success).toBe(true);
			expect(result.tasksProcessed).toBe(1);
			expect(result.tasksCreated).toBe(0);
			expect(result.tasksUpdated).toBe(1);
			expect(result.tasksFailed).toBe(0);

			expect(mockGitHubClient.updateIssue).toHaveBeenCalledWith(
				owner,
				repo,
				456,
				expect.objectContaining({
					title: task.title,
					body: task.description
				})
			);

			expect(mockStateService.setMapping).toHaveBeenCalled();
		});

		it('should handle sync with subtasks in checklist mode', async () => {
			const task: Task = {
				id: '1',
				title: 'Task with Subtasks',
				description: 'Description',
				status: 'in-progress',
				priority: 'medium',
				dependencies: [],
				subtasks: [
					{
						id: '1.1',
						title: 'Subtask 1',
						description: 'Subtask 1 desc',
						status: 'done'
					},
					{
						id: '1.2',
						title: 'Subtask 2',
						description: 'Subtask 2 desc',
						status: 'pending'
					}
				],
				tags: []
			};

			mockStateService.getMapping.mockResolvedValue(null);
			mockFieldMapper.taskToIssueCreate.mockReturnValue({
				title: task.title,
				body: task.description + '\n\n## Subtasks\n\n- [x] Subtask 1\n- [ ] Subtask 2',
				labels: [],
				assignees: []
			});

			mockFieldMapper.getDefaultLabels.mockReturnValue([]);
			mockFieldMapper.getSuggestedStatusLabels.mockReturnValue([]);
			mockResilienceService.executeWithRetry.mockImplementation((fn) => fn());
			mockGitHubClient.listLabels.mockResolvedValue([]);
			mockGitHubClient.createIssue.mockResolvedValue({
				number: 123,
				title: task.title
			});

			const result = await service.syncToGitHub([task], { subtaskMode: 'checklist' });

			expect(result.success).toBe(true);
			expect(result.subtasksProcessed).toBe(2);
		});

		it('should handle sync with dependencies', async () => {
			const task: Task = {
				id: '2',
				title: 'Task with Dependencies',
				description: 'Description',
				status: 'pending',
				priority: 'medium',
				dependencies: ['1'],
				subtasks: [],
				tags: []
			};

			const depMapping: SyncMapping = {
				taskId: '1',
				issueNumber: 100,
				owner,
				repo,
				lastSyncedAt: new Date().toISOString(),
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			mockStateService.getMapping.mockImplementation((taskId: string) => {
				if (taskId === '1') return Promise.resolve(depMapping);
				return Promise.resolve(null);
			});

			mockFieldMapper.taskToIssueCreate.mockReturnValue({
				title: task.title,
				body: task.description,
				labels: [],
				assignees: []
			});

			mockFieldMapper.getDefaultLabels.mockReturnValue([]);
			mockFieldMapper.getSuggestedStatusLabels.mockReturnValue([]);
			mockResilienceService.executeWithRetry.mockImplementation((fn) => fn());
			mockGitHubClient.listLabels.mockResolvedValue([]);
			mockGitHubClient.createIssue.mockResolvedValue({
				number: 200,
				title: task.title
			});

			const result = await service.syncToGitHub([task]);

			expect(result.success).toBe(true);
			expect(mockGitHubClient.createIssue).toHaveBeenCalledWith(
				owner,
				repo,
				expect.objectContaining({
					body: expect.stringContaining('Depends on #100')
				})
			);
		});

		it('should handle dry-run mode without making API calls', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test Description',
				status: 'pending',
				priority: 'medium',
				dependencies: [],
				subtasks: [],
				tags: []
			};

			mockStateService.getMapping.mockResolvedValue(null);
			mockFieldMapper.taskToIssueCreate.mockReturnValue({
				title: task.title,
				body: task.description,
				labels: [],
				assignees: []
			});

			const result = await service.syncToGitHub([task], { dryRun: true });

			expect(result.success).toBe(true);
			expect(result.dryRun).toBe(true);
			expect(result.tasksProcessed).toBe(1);
			expect(mockGitHubClient.createIssue).not.toHaveBeenCalled();
			expect(mockStateService.markSyncInProgress).not.toHaveBeenCalled();
		});

		it('should handle errors and record failed tasks', async () => {
			const task: Task = {
				id: '1',
				title: 'Test Task',
				description: 'Test Description',
				status: 'pending',
				priority: 'medium',
				dependencies: [],
				subtasks: [],
				tags: []
			};

			mockStateService.getMapping.mockResolvedValue(null);
			mockFieldMapper.taskToIssueCreate.mockReturnValue({
				title: task.title,
				body: task.description,
				labels: [],
				assignees: []
			});

			mockFieldMapper.getDefaultLabels.mockReturnValue([]);
			mockFieldMapper.getSuggestedStatusLabels.mockReturnValue([]);
			mockResilienceService.executeWithRetry.mockImplementation((fn) => fn());
			mockGitHubClient.listLabels.mockResolvedValue([]);
			mockGitHubClient.createIssue.mockRejectedValue(new Error('API Error'));

			const result = await service.syncToGitHub([task]);

			expect(result.success).toBe(false);
			expect(result.tasksFailed).toBe(1);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(mockStateService.recordOperation).toHaveBeenCalledWith(
				expect.objectContaining({
					success: false,
					error: 'API Error'
				})
			);
		});

		it('should batch process large number of tasks', async () => {
			const tasks: Task[] = Array.from({ length: 250 }, (_, i) => ({
				id: `${i + 1}`,
				title: `Task ${i + 1}`,
				description: `Description ${i + 1}`,
				status: 'pending' as const,
				priority: 'medium' as const,
				dependencies: [],
				subtasks: [],
				tags: []
			}));

			mockStateService.getMapping.mockResolvedValue(null);
			mockFieldMapper.taskToIssueCreate.mockReturnValue({
				title: 'Task',
				body: 'Description',
				labels: [],
				assignees: []
			});

			mockFieldMapper.getDefaultLabels.mockReturnValue([]);
			mockFieldMapper.getSuggestedStatusLabels.mockReturnValue([]);
			mockResilienceService.executeWithRetry.mockImplementation((fn) => fn());
			mockGitHubClient.listLabels.mockResolvedValue([]);
			mockGitHubClient.createIssue.mockImplementation((owner, repo, data) =>
				Promise.resolve({ number: 1, title: data.title })
			);

			const result = await service.syncToGitHub(tasks, { batchSize: 100 });

			expect(result.success).toBe(true);
			expect(result.tasksProcessed).toBe(250);
			expect(result.tasksCreated).toBe(250);
		});
	});

	describe('previewSync', () => {
		it('should preview changes for new and existing tasks', async () => {
			const tasks: Task[] = [
				{
					id: '1',
					title: 'New Task',
					description: 'Description',
					status: 'pending',
					priority: 'medium',
					dependencies: [],
					subtasks: [],
					tags: []
				},
				{
					id: '2',
					title: 'Existing Task',
					description: 'Description',
					status: 'in-progress',
					priority: 'high',
					dependencies: ['1'],
					subtasks: [{ id: '2.1', title: 'Subtask', description: 'Desc', status: 'pending' }],
					tags: []
				}
			];

			mockStateService.getMapping.mockImplementation((taskId: string) => {
				if (taskId === '2') {
					return Promise.resolve({
						taskId: '2',
						issueNumber: 456,
						owner,
						repo,
						lastSyncedAt: new Date().toISOString(),
						lastSyncDirection: 'to_github',
						status: 'synced'
					});
				}
				if (taskId === '1') {
					return Promise.resolve({
						taskId: '1',
						issueNumber: 123,
						owner,
						repo,
						lastSyncedAt: new Date().toISOString(),
						lastSyncDirection: 'to_github',
						status: 'synced'
					});
				}
				return Promise.resolve(null);
			});

			const preview = await service.previewSync(tasks);

			expect(preview.tasksToCreate).toEqual([]);
			expect(preview.tasksToUpdate).toEqual(['1', '2']);
			expect(preview.subtasksToSync.length).toBe(1);
			expect(preview.dependenciesToAdd.length).toBe(1);
			expect(preview.estimatedApiCalls).toBeGreaterThan(0);
		});
	});
});
