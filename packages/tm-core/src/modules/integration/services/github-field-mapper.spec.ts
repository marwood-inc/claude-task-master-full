/**
 * Tests for GitHub Field Mapping Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GitHubFieldMapper } from './github-field-mapper.js';
import type { Task } from '../../../common/types/index.js';
import type { GitHubIssue, GitHubLabel } from '../types/github-types.js';

describe('GitHubFieldMapper', () => {
	let mapper: GitHubFieldMapper;

	beforeEach(() => {
		mapper = new GitHubFieldMapper();
	});

	describe('taskToIssueCreate', () => {
		it('should map basic task to issue create data', () => {
			const task: Task = {
				id: '1',
				title: 'Implement user authentication',
				description: 'Add JWT-based authentication',
				status: 'pending',
				priority: 'high',
				dependencies: [],
				details: 'Use bcrypt for hashing',
				testStrategy: 'Unit tests for auth functions',
				subtasks: []
			};

			const result = mapper.taskToIssueCreate(task);

			expect(result.title).toBe(task.title);
			expect(result.body).toContain(task.description);
			expect(result.body).toContain('Task Master Metadata');
			expect(result.labels).toContain('priority: high');
			expect(result.labels).toContain('tm-status:pending');
		});

		it('should include subtasks as checkboxes', () => {
			const task: Task = {
				id: '1',
				title: 'Main task',
				description: 'Main description',
				status: 'in-progress',
				priority: 'medium',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [
					{
						id: '1.1',
						parentId: '1',
						title: 'Subtask 1',
						description: 'First subtask',
						status: 'done',
						priority: 'medium',
						dependencies: [],
						details: '',
						testStrategy: ''
					},
					{
						id: '1.2',
						parentId: '1',
						title: 'Subtask 2',
						description: 'Second subtask',
						status: 'pending',
						priority: 'medium',
						dependencies: [],
						details: '',
						testStrategy: ''
					}
				]
			};

			const result = mapper.taskToIssueCreate(task);

			expect(result.body).toContain('## Subtasks');
			expect(result.body).toContain('[x] Subtask 1');
			expect(result.body).toContain('[ ] Subtask 2');
		});

		it('should include assignee if present', () => {
			const task: Task = {
				id: '1',
				title: 'Task with assignee',
				description: 'Description',
				status: 'pending',
				priority: 'low',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [],
				assignee: 'johndoe'
			};

			const result = mapper.taskToIssueCreate(task);

			expect(result.assignees).toEqual(['johndoe']);
		});

		it('should include complexity label if present', () => {
			const task: Task = {
				id: '1',
				title: 'Complex task',
				description: 'Description',
				status: 'pending',
				priority: 'medium',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [],
				complexity: 'complex'
			};

			const result = mapper.taskToIssueCreate(task);

			expect(result.labels).toContain('tm-complexity:complex');
		});

		it('should include task tags as labels', () => {
			const task: Task = {
				id: '1',
				title: 'Tagged task',
				description: 'Description',
				status: 'pending',
				priority: 'medium',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [],
				tags: ['frontend', 'ui', 'accessibility']
			};

			const result = mapper.taskToIssueCreate(task);

			expect(result.labels).toContain('frontend');
			expect(result.labels).toContain('ui');
			expect(result.labels).toContain('accessibility');
		});
	});

	describe('taskToIssueUpdate', () => {
		it('should map task to issue update data', () => {
			const task: Task = {
				id: '1',
				title: 'Updated task',
				description: 'Updated description',
				status: 'done',
				priority: 'critical',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: []
			};

			const result = mapper.taskToIssueUpdate(task);

			expect(result.title).toBe(task.title);
			expect(result.state).toBe('closed');
			expect(result.labels).toContain('priority: critical');
			expect(result.labels).toContain('tm-status:done');
		});

		it('should map different statuses to GitHub states correctly', () => {
			const statuses: Array<[string, 'open' | 'closed']> = [
				['pending', 'open'],
				['in-progress', 'open'],
				['review', 'open'],
				['blocked', 'open'],
				['done', 'closed'],
				['completed', 'closed'],
				['cancelled', 'closed']
			];

			for (const [status, expectedState] of statuses) {
				const task: Task = {
					id: '1',
					title: 'Test',
					description: 'Test',
					status: status as any,
					priority: 'medium',
					dependencies: [],
					details: '',
					testStrategy: '',
					subtasks: []
				};

				const result = mapper.taskToIssueUpdate(task);
				expect(result.state).toBe(expectedState);
			}
		});
	});

	describe('issueToTask', () => {
		it('should map basic GitHub issue to task', () => {
			const issue: GitHubIssue = {
				id: 123,
				number: 1,
				title: 'GitHub issue',
				body: 'Issue description',
				state: 'open',
				labels: [
					{
						id: 1,
						name: 'priority: high',
						color: 'D93F0B',
						description: 'High priority',
						default: false
					}
				],
				assignees: [],
				milestone: null,
				user: {
					id: 1,
					login: 'testuser',
					avatar_url: 'https://example.com/avatar.png',
					html_url: 'https://github.com/testuser',
					type: 'User'
				},
				html_url: 'https://github.com/owner/repo/issues/1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			const result = mapper.issueToTask(issue);

			expect(result.title).toBe(issue.title);
			expect(result.description).toBe('Issue description');
			expect(result.priority).toBe('high');
			expect(result.status).toBe('pending');
		});

		it('should extract Task Master metadata from issue body', () => {
			const issue: GitHubIssue = {
				id: 123,
				number: 1,
				title: 'Issue with metadata',
				body: `Description text

<!-- Task Master Metadata
{
  "taskId": "1",
  "details": "Implementation details",
  "testStrategy": "Test strategy",
  "dependencies": ["2", "3"]
}
-->`,
				state: 'open',
				labels: [],
				assignees: [],
				milestone: null,
				user: {
					id: 1,
					login: 'testuser',
					avatar_url: 'https://example.com/avatar.png',
					html_url: 'https://github.com/testuser',
					type: 'User'
				},
				html_url: 'https://github.com/owner/repo/issues/1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			const result = mapper.issueToTask(issue);

			expect(result.details).toBe('Implementation details');
			expect(result.testStrategy).toBe('Test strategy');
			expect(result.dependencies).toEqual(['2', '3']);
			expect(result.description).toBe('Description text');
		});

		it('should respect status label if present', () => {
			const issue: GitHubIssue = {
				id: 123,
				number: 1,
				title: 'Issue',
				body: 'Description',
				state: 'open',
				labels: [
					{
						id: 1,
						name: 'tm-status:in-progress',
						color: '0075CA',
						description: 'In progress',
						default: false
					}
				],
				assignees: [],
				milestone: null,
				user: {
					id: 1,
					login: 'testuser',
					avatar_url: 'https://example.com/avatar.png',
					html_url: 'https://github.com/testuser',
					type: 'User'
				},
				html_url: 'https://github.com/owner/repo/issues/1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			const result = mapper.issueToTask(issue);

			expect(result.status).toBe('in-progress');
		});

		it('should extract assignee from GitHub assignees', () => {
			const issue: GitHubIssue = {
				id: 123,
				number: 1,
				title: 'Issue',
				body: 'Description',
				state: 'open',
				labels: [],
				assignees: [
					{
						id: 1,
						login: 'johndoe',
						avatar_url: 'https://example.com/avatar.png',
						html_url: 'https://github.com/johndoe',
						type: 'User'
					}
				],
				milestone: null,
				user: {
					id: 1,
					login: 'testuser',
					avatar_url: 'https://example.com/avatar.png',
					html_url: 'https://github.com/testuser',
					type: 'User'
				},
				html_url: 'https://github.com/owner/repo/issues/1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			const result = mapper.issueToTask(issue);

			expect(result.assignee).toBe('johndoe');
		});

		it('should extract tags from non-system labels', () => {
			const issue: GitHubIssue = {
				id: 123,
				number: 1,
				title: 'Issue',
				body: 'Description',
				state: 'open',
				labels: [
					{
						id: 1,
						name: 'priority: high',
						color: 'D93F0B',
						description: 'High priority',
						default: false
					},
					{
						id: 2,
						name: 'tm-status:pending',
						color: 'D4C5F9',
						description: 'Pending',
						default: false
					},
					{
						id: 3,
						name: 'frontend',
						color: '1D76DB',
						description: 'Frontend work',
						default: false
					},
					{
						id: 4,
						name: 'bug',
						color: 'D73A4A',
						description: 'Bug',
						default: false
					}
				],
				assignees: [],
				milestone: null,
				user: {
					id: 1,
					login: 'testuser',
					avatar_url: 'https://example.com/avatar.png',
					html_url: 'https://github.com/testuser',
					type: 'User'
				},
				html_url: 'https://github.com/owner/repo/issues/1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			const result = mapper.issueToTask(issue);

			expect(result.tags).toEqual(['frontend', 'bug']);
		});

		it('should preserve existing task fields when provided', () => {
			const issue: GitHubIssue = {
				id: 123,
				number: 1,
				title: 'Updated title',
				body: 'Updated description',
				state: 'open',
				labels: [],
				assignees: [],
				milestone: null,
				user: {
					id: 1,
					login: 'testuser',
					avatar_url: 'https://example.com/avatar.png',
					html_url: 'https://github.com/testuser',
					type: 'User'
				},
				html_url: 'https://github.com/owner/repo/issues/1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			const existingTask: Partial<Task> = {
				details: 'Existing details',
				testStrategy: 'Existing test strategy',
				subtasks: [
					{
						id: '1.1',
						parentId: '1',
						title: 'Existing subtask',
						description: 'Description',
						status: 'pending',
						priority: 'medium',
						dependencies: [],
						details: '',
						testStrategy: ''
					}
				]
			};

			const result = mapper.issueToTask(issue, existingTask);

			expect(result.details).toBe('Existing details');
			expect(result.testStrategy).toBe('Existing test strategy');
			expect(result.subtasks).toHaveLength(1);
		});
	});

	describe('getDefaultLabels', () => {
		it('should return default priority labels', () => {
			const labels = mapper.getDefaultLabels();

			expect(labels).toHaveLength(4);
			expect(labels.map((l) => l.name)).toEqual([
				'priority: low',
				'priority: medium',
				'priority: high',
				'priority: critical'
			]);
		});
	});

	describe('getSuggestedStatusLabels', () => {
		it('should return suggested status labels', () => {
			const labels = mapper.getSuggestedStatusLabels();

			expect(labels.length).toBeGreaterThan(0);
			expect(labels[0].name).toContain('tm-status:');
		});
	});

	describe('configuration', () => {
		it('should use custom configuration', () => {
			const customMapper = new GitHubFieldMapper({
				labelPrefix: 'custom-',
				priorityLabels: {
					high: 'high-priority'
				}
			});

			const task: Task = {
				id: '1',
				title: 'Task',
				description: 'Description',
				status: 'pending',
				priority: 'high',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: []
			};

			const result = customMapper.taskToIssueCreate(task);

			expect(result.labels).toContain('high-priority');
			expect(result.labels).toContain('custom-status:pending');
		});

		it('should update configuration dynamically', () => {
			mapper.updateConfig({
				labelPrefix: 'new-'
			});

			const config = mapper.getConfig();
			expect(config.labelPrefix).toBe('new-');
		});
	});

	describe('edge cases', () => {
		it('should handle null or empty issue body', () => {
			const issue: GitHubIssue = {
				id: 123,
				number: 1,
				title: 'Issue',
				body: null,
				state: 'open',
				labels: [],
				assignees: [],
				milestone: null,
				user: {
					id: 1,
					login: 'testuser',
					avatar_url: 'https://example.com/avatar.png',
					html_url: 'https://github.com/testuser',
					type: 'User'
				},
				html_url: 'https://github.com/owner/repo/issues/1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			const result = mapper.issueToTask(issue);

			expect(result.description).toBe('Issue');
		});

		it('should handle malformed metadata in issue body', () => {
			const issue: GitHubIssue = {
				id: 123,
				number: 1,
				title: 'Issue',
				body: `Description

<!-- Task Master Metadata
{invalid json}
-->`,
				state: 'open',
				labels: [],
				assignees: [],
				milestone: null,
				user: {
					id: 1,
					login: 'testuser',
					avatar_url: 'https://example.com/avatar.png',
					html_url: 'https://github.com/testuser',
					type: 'User'
				},
				html_url: 'https://github.com/owner/repo/issues/1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			const result = mapper.issueToTask(issue);

			expect(result.description).toBe('Description');
			// When metadata parsing fails, it returns empty object, so details will be undefined or empty string
			expect(result.details).toBeFalsy();
		});

		it('should handle empty arrays gracefully', () => {
			const task: Task = {
				id: '1',
				title: 'Task',
				description: 'Description',
				status: 'pending',
				priority: 'medium',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [],
				tags: []
			};

			const result = mapper.taskToIssueCreate(task);

			expect(result.labels).not.toHaveLength(0); // Should still have priority and status labels
		});
	});
});
