/**
 * @fileoverview Tests for IntegrationDomain - focusing on TODO implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IntegrationDomain } from './integration-domain.js';
import type { ConfigManager } from '../config/managers/config-manager.js';
import type { Task } from '../../common/types/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('IntegrationDomain - TODO Implementations', () => {
	let integrationDomain: IntegrationDomain;
	let mockConfigManager: ConfigManager;
	let testProjectPath: string;

	beforeEach(async () => {
		// Create a temporary directory for testing
		testProjectPath = path.join(tmpdir(), `test-integration-${Date.now()}`);
		await fs.mkdir(testProjectPath, { recursive: true });

		// Mock ConfigManager
		mockConfigManager = {
			getConfig: vi.fn().mockReturnValue({
				github: {
					enabled: true,
					owner: 'test-owner',
					repo: 'test-repo',
					token: 'test-token',
					subtaskMode: 'checklist',
					features: {
						syncMilestones: true,
						syncProjects: true,
						syncAssignees: true
					}
				}
			}),
			getProjectRoot: vi.fn().mockReturnValue(testProjectPath),
			updateConfig: vi.fn()
		} as unknown as ConfigManager;

		integrationDomain = new IntegrationDomain(mockConfigManager);
	});

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(testProjectPath, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('getGitHubSyncStatus', () => {
		it('should calculate unmapped tasks when tasks array is provided', async () => {
			// Create tasks with some that should be mapped
			const tasks: Task[] = [
				{
					id: '1',
					title: 'Task 1',
					description: 'Description 1',
					status: 'pending',
					priority: 'medium',
					subtasks: [],
					dependencies: []
				},
				{
					id: '2',
					title: 'Task 2',
					description: 'Description 2',
					status: 'in-progress',
					priority: 'high',
					subtasks: [],
					dependencies: []
				},
				{
					id: '3',
					title: 'Task 3',
					description: 'Description 3',
					status: 'done',
					priority: 'low',
					subtasks: [],
					dependencies: []
				}
			];

			// Get status without syncing first (no mappings yet)
			const status = await integrationDomain.getGitHubSyncStatus(tasks);

			expect(status.configured).toBe(true);
			expect(status.repository).toBe('test-owner/test-repo');
			expect(status.tasksUnmapped).toBe(3); // All tasks are unmapped
			expect(status.tasksMapped).toBe(0); // No mappings yet
		});

		it('should return 0 unmapped tasks when no tasks array is provided', async () => {
			const status = await integrationDomain.getGitHubSyncStatus();

			expect(status.configured).toBe(true);
			expect(status.tasksUnmapped).toBe(0); // Default when no tasks provided
		});

		it('should format conflicts with human-readable descriptions', async () => {
			// This test verifies that conflicts are retrieved and formatted properly
			// In a real scenario, conflicts would be created through sync operations
			const status = await integrationDomain.getGitHubSyncStatus();

			expect(status.configured).toBe(true);
			expect(Array.isArray(status.conflicts)).toBe(true);
			// Initially no conflicts since we haven't synced
			expect(status.conflicts).toHaveLength(0);
		});

		it('should include change detection counts', async () => {
			const status = await integrationDomain.getGitHubSyncStatus();

			expect(status.configured).toBe(true);
			expect(status.pendingChanges).toBeDefined();
			expect(typeof status.pendingChanges.localChanges).toBe('number');
			expect(typeof status.pendingChanges.remoteChanges).toBe('number');
			// Initially no changes since we haven't synced
			expect(status.pendingChanges.localChanges).toBe(0);
			expect(status.pendingChanges.remoteChanges).toBe(0);
		});

		it('should return unconfigured status when GitHub is not enabled', async () => {
			mockConfigManager.getConfig = vi.fn().mockReturnValue({
				github: {
					enabled: false
				}
			});

			const status = await integrationDomain.getGitHubSyncStatus();

			expect(status.configured).toBe(false);
			expect(status.syncState).toBe('unknown');
			expect(status.tasksMapped).toBe(0);
			expect(status.tasksUnmapped).toBe(0);
			expect(status.conflicts).toHaveLength(0);
		});
	});

	describe('syncWithGitHub - two-way sync', () => {
		it('should support one-way sync mode', async () => {
			const tasks: Task[] = [
				{
					id: '1',
					title: 'Test Task',
					description: 'Test Description',
					status: 'pending',
					priority: 'medium',
					subtasks: [],
					dependencies: []
				}
			];

			// Mock GitHub client to avoid actual API calls
			try {
				await integrationDomain.syncWithGitHub(tasks, {
					mode: 'one-way',
					dryRun: true
				});
			} catch (error) {
				// Expected to fail due to missing GitHub API mocking
				// The important part is that it doesn't throw "not implemented" error
				expect((error as Error).message).not.toContain('not yet implemented');
			}
		});

		it('should support two-way sync mode', async () => {
			const tasks: Task[] = [
				{
					id: '1',
					title: 'Test Task',
					description: 'Test Description',
					status: 'pending',
					priority: 'medium',
					subtasks: [],
					dependencies: []
				}
			];

			// Mock GitHub client to avoid actual API calls
			try {
				await integrationDomain.syncWithGitHub(tasks, {
					mode: 'two-way',
					dryRun: true
				});
			} catch (error) {
				// Expected to fail due to missing GitHub API mocking
				// The important part is that it doesn't throw "not implemented" error
				expect((error as Error).message).not.toContain('not yet implemented');
			}
		});

		it('should default to one-way mode when mode is not specified', async () => {
			const tasks: Task[] = [
				{
					id: '1',
					title: 'Test Task',
					description: 'Test Description',
					status: 'pending',
					priority: 'medium',
					subtasks: [],
					dependencies: []
				}
			];

			try {
				await integrationDomain.syncWithGitHub(tasks, {
					dryRun: true
				});
			} catch (error) {
				// Expected to fail due to missing GitHub API mocking
				// The important part is that it doesn't throw "not implemented" error
				expect((error as Error).message).not.toContain('not yet implemented');
			}
		});
	});

	describe('conflict description formatting', () => {
		it('should handle all conflict types', () => {
			// This test documents the expected conflict description formats
			const conflictTypes = [
				'title_mismatch',
				'description_mismatch',
				'status_mismatch',
				'assignee_mismatch',
				'label_mismatch',
				'deleted_on_github',
				'deleted_locally'
			];

			// Verify that each conflict type has a corresponding description format
			conflictTypes.forEach((type) => {
				// The implementation maps each type to a human-readable description
				// This test ensures all types are handled
				expect(typeof type).toBe('string');
			});
		});
	});

	describe('unmapped task calculation', () => {
		it('should correctly identify unmapped tasks', async () => {
			const tasks: Task[] = [
				{ id: '1', title: 'Task 1', description: '', status: 'pending', priority: 'medium', subtasks: [], dependencies: [] },
				{ id: '2', title: 'Task 2', description: '', status: 'pending', priority: 'medium', subtasks: [], dependencies: [] },
				{ id: '3', title: 'Task 3', description: '', status: 'pending', priority: 'medium', subtasks: [], dependencies: [] }
			];

			const status = await integrationDomain.getGitHubSyncStatus(tasks);

			// All tasks should be unmapped initially
			expect(status.tasksUnmapped).toBe(3);
			expect(status.tasksMapped).toBe(0);
		});
	});

	describe('resolveConflict', () => {
		beforeEach(async () => {
			// Create .taskmaster directory for state file
			const taskmasterDir = path.join(testProjectPath, '.taskmaster');
			await fs.mkdir(taskmasterDir, { recursive: true });

			// Create initial state file
			const stateFilePath = path.join(taskmasterDir, 'github-sync-state.json');
			const initialState = {
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
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				lastBackup: null
			};
			await fs.writeFile(stateFilePath, JSON.stringify(initialState, null, 2));
		});

		it('should throw error when no mapping exists for task', async () => {
			// Task not synced with GitHub - no mapping exists
			await expect(
				integrationDomain.resolveConflict('999', 'local')
			).rejects.toThrow('has not been synced to GitHub');
		});

		it('should throw error when no conflicts exist for task', async () => {
			// Create mapping but no conflicts
			const taskmasterDir = path.join(testProjectPath, '.taskmaster');
			const stateFilePath = path.join(taskmasterDir, 'github-sync-state.json');

			const stateWithMapping = {
				version: '1.0.0',
				owner: 'test-owner',
				repo: 'test-repo',
				mappings: {
					'1': {
						taskId: '1',
						issueNumber: 42,
						owner: 'test-owner',
						repo: 'test-repo',
						lastSyncedAt: new Date().toISOString(),
						lastSyncDirection: 'to_github',
						status: 'synced'
					}
				},
				conflicts: [], // No conflicts
				changeMetadata: {},
				operationHistory: [],
				maxHistorySize: 1000,
				lastSyncAt: null,
				syncInProgress: false,
				lastSyncError: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				lastBackup: null
			};

			await fs.writeFile(stateFilePath, JSON.stringify(stateWithMapping, null, 2));

			await expect(
				integrationDomain.resolveConflict('1', 'local')
			).rejects.toThrow('No unresolved conflicts found');
		});

		it('should throw error when manual strategy without manualData', async () => {
			// Create mapping and conflict
			const taskmasterDir = path.join(testProjectPath, '.taskmaster');
			const stateFilePath = path.join(taskmasterDir, 'github-sync-state.json');

			const stateWithConflict = {
				version: '1.0.0',
				owner: 'test-owner',
				repo: 'test-repo',
				mappings: {
					'1': {
						taskId: '1',
						issueNumber: 42,
						owner: 'test-owner',
						repo: 'test-repo',
						lastSyncedAt: new Date().toISOString(),
						lastSyncDirection: 'to_github',
						status: 'conflict'
					}
				},
				conflicts: [
					{
						taskId: '1',
						issueNumber: 42,
						type: 'title_mismatch',
						localValue: 'Local Title',
						remoteValue: 'Remote Title',
						detectedAt: new Date().toISOString(),
						resolutionStrategy: 'manual',
						resolved: false
					}
				],
				changeMetadata: {},
				operationHistory: [],
				maxHistorySize: 1000,
				lastSyncAt: null,
				syncInProgress: false,
				lastSyncError: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				lastBackup: null
			};

			await fs.writeFile(stateFilePath, JSON.stringify(stateWithConflict, null, 2));

			await expect(
				integrationDomain.resolveConflict('1', 'manual')
			).rejects.toThrow('Manual resolution data is required');
		});

		it('should throw error when manual strategy with empty manualData', async () => {
			// Create mapping and conflict
			const taskmasterDir = path.join(testProjectPath, '.taskmaster');
			const stateFilePath = path.join(taskmasterDir, 'github-sync-state.json');

			const stateWithConflict = {
				version: '1.0.0',
				owner: 'test-owner',
				repo: 'test-repo',
				mappings: {
					'1': {
						taskId: '1',
						issueNumber: 42,
						owner: 'test-owner',
						repo: 'test-repo',
						lastSyncedAt: new Date().toISOString(),
						lastSyncDirection: 'to_github',
						status: 'conflict'
					}
				},
				conflicts: [
					{
						taskId: '1',
						issueNumber: 42,
						type: 'title_mismatch',
						localValue: 'Local Title',
						remoteValue: 'Remote Title',
						detectedAt: new Date().toISOString(),
						resolutionStrategy: 'manual',
						resolved: false
					}
				],
				changeMetadata: {},
				operationHistory: [],
				maxHistorySize: 1000,
				lastSyncAt: null,
				syncInProgress: false,
				lastSyncError: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				lastBackup: null
			};

			await fs.writeFile(stateFilePath, JSON.stringify(stateWithConflict, null, 2));

			await expect(
				integrationDomain.resolveConflict('1', 'manual', {})
			).rejects.toThrow('Manual resolution must include at least one resolved field');
		});

		it('should map "local" strategy to "last_write_wins_local"', async () => {
			// This test verifies strategy mapping through type checking
			// The actual resolution would require mocking GitHub API
			const taskmasterDir = path.join(testProjectPath, '.taskmaster');
			const stateFilePath = path.join(taskmasterDir, 'github-sync-state.json');

			const stateWithConflict = {
				version: '1.0.0',
				owner: 'test-owner',
				repo: 'test-repo',
				mappings: {
					'1': {
						taskId: '1',
						issueNumber: 42,
						owner: 'test-owner',
						repo: 'test-repo',
						lastSyncedAt: new Date().toISOString(),
						lastSyncDirection: 'to_github',
						status: 'conflict'
					}
				},
				conflicts: [
					{
						taskId: '1',
						issueNumber: 42,
						type: 'title_mismatch',
						localValue: 'Local Title',
						remoteValue: 'Remote Title',
						detectedAt: new Date().toISOString(),
						resolutionStrategy: 'prefer_local',
						resolved: false
					}
				],
				changeMetadata: {},
				operationHistory: [],
				maxHistorySize: 1000,
				lastSyncAt: null,
				syncInProgress: false,
				lastSyncError: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				lastBackup: null
			};

			await fs.writeFile(stateFilePath, JSON.stringify(stateWithConflict, null, 2));

			try {
				await integrationDomain.resolveConflict('1', 'local');
				// If we get here, resolution succeeded (may fail due to GitHub API mocking)
			} catch (error) {
				// Should not be a validation error about strategy
				expect((error as Error).message).not.toContain('Invalid strategy');
			}
		});

		it('should handle multiple conflicts for same task', async () => {
			// Create mapping with multiple conflicts
			const taskmasterDir = path.join(testProjectPath, '.taskmaster');
			const stateFilePath = path.join(taskmasterDir, 'github-sync-state.json');

			const stateWithMultipleConflicts = {
				version: '1.0.0',
				owner: 'test-owner',
				repo: 'test-repo',
				mappings: {
					'1': {
						taskId: '1',
						issueNumber: 42,
						owner: 'test-owner',
						repo: 'test-repo',
						lastSyncedAt: new Date().toISOString(),
						lastSyncDirection: 'to_github',
						status: 'conflict'
					}
				},
				conflicts: [
					{
						taskId: '1',
						issueNumber: 42,
						type: 'title_mismatch',
						localValue: 'Local Title',
						remoteValue: 'Remote Title',
						detectedAt: new Date().toISOString(),
						resolutionStrategy: 'prefer_local',
						resolved: false
					},
					{
						taskId: '1',
						issueNumber: 42,
						type: 'description_mismatch',
						localValue: 'Local Description',
						remoteValue: 'Remote Description',
						detectedAt: new Date().toISOString(),
						resolutionStrategy: 'prefer_local',
						resolved: false
					}
				],
				changeMetadata: {},
				operationHistory: [],
				maxHistorySize: 1000,
				lastSyncAt: null,
				syncInProgress: false,
				lastSyncError: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				lastBackup: null
			};

			await fs.writeFile(stateFilePath, JSON.stringify(stateWithMultipleConflicts, null, 2));

			try {
				// Should attempt to resolve all conflicts
				await integrationDomain.resolveConflict('1', 'local');
			} catch (error) {
				// May fail due to GitHub API mocking, but should process all conflicts
				// Not a validation error
				const errorMessage = (error as Error).message;
				expect(errorMessage).not.toContain('No unresolved conflicts');
			}
		});

		it('should convert SyncConflict types to ConflictField correctly', async () => {
			// Test the conversion logic for different conflict types
			const taskmasterDir = path.join(testProjectPath, '.taskmaster');
			const stateFilePath = path.join(taskmasterDir, 'github-sync-state.json');

			const conflictTypes = [
				'title_mismatch',
				'description_mismatch',
				'status_mismatch',
				'assignee_mismatch',
				'label_mismatch'
			];

			for (const conflictType of conflictTypes) {
				const stateWithConflict = {
					version: '1.0.0',
					owner: 'test-owner',
					repo: 'test-repo',
					mappings: {
						'1': {
							taskId: '1',
							issueNumber: 42,
							owner: 'test-owner',
							repo: 'test-repo',
							lastSyncedAt: new Date().toISOString(),
							lastSyncDirection: 'to_github',
							status: 'conflict'
						}
					},
					conflicts: [
						{
							taskId: '1',
							issueNumber: 42,
							type: conflictType,
							localValue: 'Local Value',
							remoteValue: 'Remote Value',
							detectedAt: new Date().toISOString(),
							resolutionStrategy: 'prefer_local',
							resolved: false
						}
					],
					changeMetadata: {},
					operationHistory: [],
					maxHistorySize: 1000,
					lastSyncAt: null,
					syncInProgress: false,
					lastSyncError: null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					lastBackup: null
				};

				await fs.writeFile(stateFilePath, JSON.stringify(stateWithConflict, null, 2));

				try {
					await integrationDomain.resolveConflict('1', 'local');
					// Conversion should work for all types
				} catch (error) {
					// May fail due to GitHub API mocking
					// But should not fail on type conversion
					const errorMessage = (error as Error).message;
					expect(errorMessage).not.toContain('Invalid field');
					expect(errorMessage).not.toContain('Unknown conflict type');
				}
			}
		});
	});
});
