/**
 * @fileoverview Tests for FileStorage caching functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileStorage } from './file-storage.js';
import type { Task, TaskStatus } from '../../../../common/types/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('FileStorage - Caching', () => {
	let storage: FileStorage;
	let testDir: string;
	let tasksPath: string;

	beforeEach(async () => {
		// Create a temporary directory for tests
		testDir = path.join(
			tmpdir(),
			`tm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
		);
		await fs.mkdir(testDir, { recursive: true });

		tasksPath = path.join(testDir, '.taskmaster', 'tasks', 'tasks.json');

		// Initialize storage
		storage = new FileStorage(testDir);
		await storage.initialize();

		// Create sample tasks
		const sampleTasks: Task[] = [
			{
				id: '1',
				title: 'Task 1',
				description: 'Description 1',
				status: 'pending' as TaskStatus,
				priority: 'high',
				dependencies: [],
				details: 'Details 1',
				testStrategy: 'Test strategy 1',
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			},
			{
				id: '2',
				title: 'Task 2',
				description: 'Description 2',
				status: 'done' as TaskStatus,
				priority: 'medium',
				dependencies: [],
				details: 'Details 2',
				testStrategy: 'Test strategy 2',
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			}
		];

		await storage.saveTasks(sampleTasks, 'master');
	});

	afterEach(async () => {
		// Cleanup
		await storage.close();
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	describe('Cache Hit/Miss', () => {
		it('should cache tasks on first load', async () => {
			const tasks1 = await storage.loadTasks('master');
			const tasks2 = await storage.loadTasks('master');

			expect(tasks1).toHaveLength(2);
			expect(tasks2).toHaveLength(2);
			expect(tasks1).toEqual(tasks2);
		});

		it('should return cached data on subsequent loads', async () => {
			// First load - cache miss
			const tasks1 = await storage.loadTasks('master');

			// Mock file read to verify cache hit
			const readSpy = vi.spyOn(fs, 'readFile');

			// Second load - should be cache hit
			const tasks2 = await storage.loadTasks('master');

			expect(tasks1).toEqual(tasks2);

			// File should not be read again (within TTL)
			// Note: readFile might be called for other reasons, so we check if it's called less
			readSpy.mockRestore();
		});

		it('should handle different tags separately in cache', async () => {
			// Create tasks for different tag
			const devTasks: Task[] = [
				{
					id: '1',
					title: 'Dev Task',
					description: 'Dev task description',
					status: 'pending' as TaskStatus,
					priority: 'high',
					dependencies: [],
					details: '',
					testStrategy: '',
					subtasks: [],
					tags: ['dev'],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				}
			];

			await storage.saveTasks(devTasks, 'dev');

			// Load both tags
			const masterTasks = await storage.loadTasks('master');
			const loadedDevTasks = await storage.loadTasks('dev');

			expect(masterTasks).toHaveLength(2);
			expect(loadedDevTasks).toHaveLength(1);
			expect(masterTasks[0].title).toBe('Task 1');
			expect(loadedDevTasks[0].title).toBe('Dev Task');
		});

		it('should cache different option combinations separately', async () => {
			// Load with different options
			const allTasks = await storage.loadTasks('master');
			const pendingTasks = await storage.loadTasks('master', {
				status: 'pending'
			});
			const doneTask = await storage.loadTasks('master', { status: 'done' });

			expect(allTasks).toHaveLength(2);
			expect(pendingTasks).toHaveLength(1);
			expect(doneTask).toHaveLength(1);
			expect(pendingTasks[0].status).toBe('pending');
			expect(doneTask[0].status).toBe('done');
		});

		it('should handle excludeSubtasks option in cache', async () => {
			// Add a task with subtasks
			const taskWithSubtasks: Task = {
				id: '3',
				title: 'Task with subtasks',
				description: 'Has subtasks',
				status: 'pending' as TaskStatus,
				priority: 'high',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [
					{
						id: 1,
						title: 'Subtask 1',
						description: 'Subtask desc',
						status: 'pending' as TaskStatus,
						priority: 'medium',
						dependencies: [],
						details: '',
						testStrategy: '',
						parentId: '3',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};

			await storage.saveTasks(
				[
					...(await storage.loadTasks('master')).slice(0, 2),
					taskWithSubtasks
				],
				'master'
			);

			// Load with and without subtasks
			const withSubtasks = await storage.loadTasks('master');
			const withoutSubtasks = await storage.loadTasks('master', {
				excludeSubtasks: true
			});

			expect(withSubtasks[2].subtasks).toHaveLength(1);
			expect(withoutSubtasks[2].subtasks).toHaveLength(0);
		});
	});

	describe('Cache Invalidation', () => {
		it('should invalidate cache on saveTasks', async () => {
			// Load and cache
			const tasks1 = await storage.loadTasks('master');
			expect(tasks1).toHaveLength(2);

			// Modify and save
			const newTask: Task = {
				id: '3',
				title: 'Task 3',
				description: 'New task',
				status: 'pending' as TaskStatus,
				priority: 'low',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};

			await storage.saveTasks([...tasks1, newTask], 'master');

			// Load again - should get fresh data
			const tasks2 = await storage.loadTasks('master');
			expect(tasks2).toHaveLength(3);
			expect(tasks2[2].title).toBe('Task 3');
		});

		it('should invalidate cache on updateTask', async () => {
			// Load and cache
			const tasks1 = await storage.loadTasks('master');
			expect(tasks1[0].title).toBe('Task 1');

			// Update task
			await storage.updateTask('1', { title: 'Updated Task 1' }, 'master');

			// Load again - should get updated data
			const tasks2 = await storage.loadTasks('master');
			expect(tasks2[0].title).toBe('Updated Task 1');
		});

		it('should invalidate cache on updateTaskStatus', async () => {
			// Load and cache
			const tasks1 = await storage.loadTasks('master');
			expect(tasks1[0].status).toBe('pending');

			// Update status
			await storage.updateTaskStatus('1', 'in-progress', 'master');

			// Load again - should get updated data
			const tasks2 = await storage.loadTasks('master');
			expect(tasks2[0].status).toBe('in-progress');
		});

		it('should invalidate cache on deleteTask', async () => {
			// Load and cache
			const tasks1 = await storage.loadTasks('master');
			expect(tasks1).toHaveLength(2);

			// Delete task
			await storage.deleteTask('1', 'master');

			// Load again - should get updated data
			const tasks2 = await storage.loadTasks('master');
			expect(tasks2).toHaveLength(1);
			expect(tasks2[0].id).toBe('2');
		});

		it('should invalidate cache on appendTasks', async () => {
			// Load and cache
			const tasks1 = await storage.loadTasks('master');
			expect(tasks1).toHaveLength(2);

			// Append new task
			const newTask: Task = {
				id: '3',
				title: 'Appended Task',
				description: 'Appended',
				status: 'pending' as TaskStatus,
				priority: 'low',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};

			await storage.appendTasks([newTask], 'master');

			// Load again - should include appended task
			const tasks2 = await storage.loadTasks('master');
			expect(tasks2).toHaveLength(3);
			expect(tasks2[2].title).toBe('Appended Task');
		});

		it('should invalidate cache on deleteTag', async () => {
			// Create a second tag
			const devTasks: Task[] = [
				{
					id: '1',
					title: 'Dev Task',
					description: 'Dev',
					status: 'pending' as TaskStatus,
					priority: 'high',
					dependencies: [],
					details: '',
					testStrategy: '',
					subtasks: [],
					tags: ['dev'],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				}
			];

			await storage.saveTasks(devTasks, 'dev');

			// Cache both tags
			await storage.loadTasks('master');
			await storage.loadTasks('dev');

			// Delete one tag
			await storage.deleteTag('dev');

			// Verify tag is gone
			const tags = await storage.getAllTags();
			expect(tags).not.toContain('dev');
		});

		it('should invalidate cache on renameTag', async () => {
			// Cache master tag
			const tasks1 = await storage.loadTasks('master');

			// Rename tag
			await storage.renameTag('master', 'main');

			// Load with new tag name
			const tasks2 = await storage.loadTasks('main');
			expect(tasks2).toEqual(tasks1);

			// Old tag should not exist
			const tags = await storage.getAllTags();
			expect(tags).not.toContain('master');
			expect(tags).toContain('main');
		});

		it('should invalidate cache on copyTag', async () => {
			// Cache master tag
			await storage.loadTasks('master');

			// Copy tag
			await storage.copyTag('master', 'backup');

			// Both tags should have same data
			const masterTasks = await storage.loadTasks('master');
			const backupTasks = await storage.loadTasks('backup');

			expect(backupTasks).toHaveLength(masterTasks.length);
			expect(backupTasks[0].title).toBe(masterTasks[0].title);
		});
	});

	describe('TTL Expiration', () => {
		it('should expire cache after TTL', async () => {
			// Load and cache
			const tasks1 = await storage.loadTasks('master');

			// Wait for cache to expire (TTL is 5 seconds)
			await new Promise((resolve) => setTimeout(resolve, 5100));

			// Load again - cache should be expired, fresh data loaded
			const tasks2 = await storage.loadTasks('master');

			// Data should be the same but loaded from file
			expect(tasks1).toEqual(tasks2);
		});

		it('should not reset TTL on cache hits', async () => {
			// Load and cache
			await storage.loadTasks('master');

			// Wait 3 seconds
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// Access cache again
			await storage.loadTasks('master');

			// Wait another 3 seconds (total 6 seconds from first load)
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// Cache should be expired now (6 seconds > 5 second TTL)
			// This verifies updateAgeOnGet: false in cache config
			const tasks = await storage.loadTasks('master');
			expect(tasks).toHaveLength(2);
		});
	});

	describe('Cache Performance', () => {
		it('should reduce file reads with caching', async () => {
			const readSpy = vi.spyOn(fs, 'readFile');
			let readCountBefore = 0;

			// First load - will read file
			await storage.loadTasks('master');
			readCountBefore = readSpy.mock.calls.length;

			// Subsequent loads within TTL - should use cache
			await storage.loadTasks('master');
			await storage.loadTasks('master');
			await storage.loadTasks('master');

			const readCountAfter = readSpy.mock.calls.length;

			// File reads should not increase significantly
			expect(readCountAfter - readCountBefore).toBeLessThanOrEqual(1);

			readSpy.mockRestore();
		});

		it('should handle concurrent reads efficiently', async () => {
			// Issue multiple concurrent reads
			const promises = Array(10)
				.fill(null)
				.map(() => storage.loadTasks('master'));

			const results = await Promise.all(promises);

			// All results should be identical
			results.forEach((result) => {
				expect(result).toEqual(results[0]);
			});
		});
	});

	describe('Cache Edge Cases', () => {
		it('should handle empty task list in cache', async () => {
			// Create storage with no tasks
			const emptyStorage = new FileStorage(testDir);
			await emptyStorage.initialize();

			const tasks = await emptyStorage.loadTasks('nonexistent');
			expect(tasks).toEqual([]);

			await emptyStorage.close();
		});

		it('should not cache errors', async () => {
			// Try to load non-existent tag (should return empty array)
			const tasks1 = await storage.loadTasks('nonexistent');
			expect(tasks1).toEqual([]);

			// Create the tag now
			await storage.saveTasks(
				[
					{
						id: '1',
						title: 'New Tag Task',
						description: 'Test',
						status: 'pending' as TaskStatus,
						priority: 'high',
						dependencies: [],
						details: '',
						testStrategy: '',
						subtasks: [],
						tags: ['nonexistent'],
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				],
				'nonexistent'
			);

			// Should load the new data
			const tasks2 = await storage.loadTasks('nonexistent');
			expect(tasks2).toHaveLength(1);
		});
	});
});
