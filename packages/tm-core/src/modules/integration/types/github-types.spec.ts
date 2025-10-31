/**
 * @fileoverview Tests for GitHub type definitions
 * These tests mainly ensure types compile correctly and have proper structure
 */

import { describe, it, expect } from 'vitest';
import type {
	GitHubIssue,
	GitHubLabel,
	GitHubUser,
	GitHubMilestone,
	GitHubProject,
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

describe('GitHub Types', () => {
	describe('GitHubLabel', () => {
		it('should allow valid label objects', () => {
			const label: GitHubLabel = {
				id: 1,
				name: 'bug',
				color: 'ff0000',
				description: 'Bug report',
				default: true
			};

			expect(label.name).toBe('bug');
			expect(label.color).toBe('ff0000');
		});

		it('should allow null description', () => {
			const label: GitHubLabel = {
				id: 1,
				name: 'enhancement',
				color: '00ff00',
				description: null,
				default: false
			};

			expect(label.description).toBeNull();
		});
	});

	describe('GitHubUser', () => {
		it('should allow valid user objects', () => {
			const user: GitHubUser = {
				id: 12345,
				login: 'testuser',
				avatar_url: 'https://github.com/avatars/testuser',
				html_url: 'https://github.com/testuser',
				type: 'User'
			};

			expect(user.login).toBe('testuser');
			expect(user.type).toBe('User');
		});
	});

	describe('GitHubMilestone', () => {
		it('should allow valid milestone objects', () => {
			const milestone: GitHubMilestone = {
				id: 1,
				number: 1,
				title: 'v1.0',
				description: 'First release',
				state: 'open',
				open_issues: 5,
				closed_issues: 10,
				due_on: '2024-12-31T23:59:59Z',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-06-01T00:00:00Z',
				closed_at: null
			};

			expect(milestone.title).toBe('v1.0');
			expect(milestone.state).toBe('open');
		});
	});

	describe('GitHubIssue', () => {
		it('should allow valid issue objects', () => {
			const user: GitHubUser = {
				id: 1,
				login: 'testuser',
				avatar_url: 'https://github.com/avatars/testuser',
				html_url: 'https://github.com/testuser',
				type: 'User'
			};

			const issue: GitHubIssue = {
				id: 12345,
				number: 42,
				title: 'Test issue',
				body: 'This is a test',
				state: 'open',
				labels: [],
				assignees: [],
				milestone: null,
				user,
				html_url: 'https://github.com/owner/repo/issues/42',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-06-01T00:00:00Z',
				closed_at: null,
				locked: false,
				active_lock_reason: null
			};

			expect(issue.number).toBe(42);
			expect(issue.state).toBe('open');
		});
	});

	describe('SyncMapping', () => {
		it('should allow valid sync mapping objects', () => {
			const mapping: SyncMapping = {
				taskId: '1.2.3',
				issueNumber: 42,
				owner: 'testowner',
				repo: 'testrepo',
				lastSyncedAt: '2024-06-01T00:00:00Z',
				lastSyncDirection: 'to_github',
				status: 'synced'
			};

			expect(mapping.taskId).toBe('1.2.3');
			expect(mapping.issueNumber).toBe(42);
			expect(mapping.status).toBe('synced');
		});
	});

	describe('SyncConflict', () => {
		it('should allow valid conflict objects', () => {
			const conflict: SyncConflict = {
				taskId: '1.2.3',
				issueNumber: 42,
				type: 'title_mismatch',
				localValue: 'Local title',
				remoteValue: 'Remote title',
				detectedAt: '2024-06-01T00:00:00Z',
				resolutionStrategy: 'manual',
				resolved: false
			};

			expect(conflict.type).toBe('title_mismatch');
			expect(conflict.resolved).toBe(false);
		});
	});

	describe('SyncState', () => {
		it('should allow valid sync state objects', () => {
			const state: SyncState = {
				owner: 'testowner',
				repo: 'testrepo',
				mappings: [],
				conflicts: [],
				lastSyncAt: null,
				syncInProgress: false,
				lastSyncError: null
			};

			expect(state.owner).toBe('testowner');
			expect(state.syncInProgress).toBe(false);
		});
	});

	describe('SyncOptions', () => {
		it('should allow valid sync options', () => {
			const options: SyncOptions = {
				direction: 'bidirectional',
				createMissing: true,
				updateExisting: true,
				conflictResolution: 'prefer_local',
				syncLabels: true,
				syncAssignees: true,
				syncMilestones: true,
				syncComments: false,
				batchSize: 50,
				dryRun: false
			};

			expect(options.direction).toBe('bidirectional');
			expect(options.batchSize).toBe(50);
		});
	});

	describe('SyncResult', () => {
		it('should allow valid sync result objects', () => {
			const result: SyncResult = {
				success: true,
				tasksSynced: 10,
				issuesSynced: 10,
				newMappings: 5,
				updatedMappings: 5,
				conflictsDetected: 2,
				conflictsResolved: 1,
				errors: [],
				warnings: [],
				durationMs: 5000,
				startedAt: '2024-06-01T00:00:00Z',
				completedAt: '2024-06-01T00:00:05Z'
			};

			expect(result.success).toBe(true);
			expect(result.tasksSynced).toBe(10);
		});

		it('should allow errors and warnings', () => {
			const result: SyncResult = {
				success: false,
				tasksSynced: 8,
				issuesSynced: 8,
				newMappings: 4,
				updatedMappings: 4,
				conflictsDetected: 2,
				conflictsResolved: 0,
				errors: [
					{
						taskId: '1.2.3',
						issueNumber: 42,
						error: 'Failed to sync',
						timestamp: '2024-06-01T00:00:03Z'
					}
				],
				warnings: [
					{
						taskId: '1.2.4',
						message: 'Issue has uncommitted changes'
					}
				],
				durationMs: 3000,
				startedAt: '2024-06-01T00:00:00Z',
				completedAt: '2024-06-01T00:00:03Z'
			};

			expect(result.errors).toHaveLength(1);
			expect(result.warnings).toHaveLength(1);
		});
	});

	describe('Update Types', () => {
		it('should allow partial issue updates', () => {
			const update: GitHubIssueUpdate = {
				title: 'Updated title'
			};

			expect(update.title).toBe('Updated title');
		});

		it('should allow partial label updates', () => {
			const update: GitHubLabelUpdate = {
				color: '00ff00',
				description: 'Updated description'
			};

			expect(update.color).toBe('00ff00');
		});

		it('should allow partial milestone updates', () => {
			const update: GitHubMilestoneUpdate = {
				state: 'closed'
			};

			expect(update.state).toBe('closed');
		});
	});
});
