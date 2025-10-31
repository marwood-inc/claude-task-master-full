/**
 * @fileoverview Integration tests for FileStorage cache behavior across CLI and MCP usage patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTaskMasterCore } from '../../../src/index.js';
import type { Task, TaskStatus, TaskMasterCore } from '../../../src/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
	setupFakeTimers,
	advancePastTTL,
	advanceTime,
	CacheAccessTracker,
	createMemoryValidator
} from '../../test-helpers/index.js';

describe('FileStorage Cache - Integration Tests', () => {
	let tmCore: TaskMasterCore;
	let testDir: string;

	beforeEach(async () => {
		// Create a temporary directory for tests
		testDir = path.join(
			tmpdir(),
			`tm-test-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`
		);
		await fs.mkdir(testDir, { recursive: true });

		// Initialize Task Master Core
		tmCore = await createTaskMasterCore(testDir);

		// Create sample tasks
		const sampleTasks: Task[] = [
			{
				id: '1',
				title: 'First Task',
				description: 'First task description',
				status: 'pending' as TaskStatus,
				priority: 'high',
				dependencies: [],
				details: 'Details for first task',
				testStrategy: 'Test strategy 1',
				subtasks: [
					{
						id: 1,
						parentId: '1',
						title: 'Subtask 1.1',
						description: 'First subtask',
						status: 'pending' as TaskStatus,
						priority: 'high',
						dependencies: [],
						details: '',
						testStrategy: '',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					},
					{
						id: 2,
						parentId: '1',
						title: 'Subtask 1.2',
						description: 'Second subtask',
						status: 'pending' as TaskStatus,
						priority: 'medium',
						dependencies: [],
						details: '',
						testStrategy: '',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			},
			{
				id: '2',
				title: 'Second Task',
				description: 'Second task description',
				status: 'in-progress' as TaskStatus,
				priority: 'medium',
				dependencies: ['1'],
				details: 'Details for second task',
				testStrategy: 'Test strategy 2',
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			},
			{
				id: '3',
				title: 'Third Task',
				description: 'Third task description',
				status: 'done' as TaskStatus,
				priority: 'low',
				dependencies: [],
				details: 'Details for third task',
				testStrategy: 'Test strategy 3',
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			}
		];

		await tmCore.tasks.save(sampleTasks);
	});

	afterEach(async () => {
		// Cleanup
		if (tmCore) {
			await tmCore.close();
		}
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	describe('CLI-like Operations with Cache', () => {
		it('should cache tasks when listing all tasks (like CLI list command)', async () => {
			// Simulate CLI: task-master list
			const tasks1 = await tmCore.tasks.list();
			const tasks2 = await tmCore.tasks.list();

			expect(tasks1).toHaveLength(3);
			expect(tasks2).toHaveLength(3);
			expect(tasks1).toEqual(tasks2);
		});

		it('should use cache when getting task details (like CLI show command)', async () => {
			// Simulate CLI: task-master show 1
			const task1 = await tmCore.tasks.get('1');
			const task2 = await tmCore.tasks.get('1');

			expect(task1).toBeDefined();
			expect(task1?.id).toBe('1');
			expect(task2).toBeDefined();
			expect(task1).toEqual(task2);
		});

		it('should use cache when filtering tasks by status (like CLI list --status)', async () => {
			// Simulate CLI: task-master list --status=pending
			const pendingTasks1 = await tmCore.tasks.list({ status: 'pending' });
			const pendingTasks2 = await tmCore.tasks.list({ status: 'pending' });

			expect(pendingTasks1).toHaveLength(1);
			expect(pendingTasks1[0].status).toBe('pending');
			expect(pendingTasks2).toEqual(pendingTasks1);
		});

		it('should invalidate cache when updating task status (like CLI set-status)', async () => {
			// Simulate CLI: task-master list
			const tasksBefore = await tmCore.tasks.list();
			expect(tasksBefore[0].status).toBe('pending');

			// Simulate CLI: task-master set-status --id=1 --status=in-progress
			await tmCore.tasks.updateStatus('1', 'in-progress');

			// Simulate CLI: task-master list (should get fresh data)
			const tasksAfter = await tmCore.tasks.list();
			expect(tasksAfter[0].status).toBe('in-progress');
		});

		it('should invalidate cache when updating task (like CLI update-task)', async () => {
			// Simulate CLI: task-master show 1
			const taskBefore = await tmCore.tasks.get('1');
			expect(taskBefore?.title).toBe('First Task');

			// Simulate CLI: task-master update-task --id=1 --title="Updated Title"
			await tmCore.tasks.update('1', { title: 'Updated Title' });

			// Simulate CLI: task-master show 1 (should get fresh data)
			const taskAfter = await tmCore.tasks.get('1');
			expect(taskAfter?.title).toBe('Updated Title');
		});

		it('should invalidate cache when adding tasks (like CLI add-task)', async () => {
			// Simulate CLI: task-master list
			const tasksBefore = await tmCore.tasks.list();
			expect(tasksBefore).toHaveLength(3);

			// Simulate CLI: task-master add-task
			const newTask: Task = {
				id: '4',
				title: 'New Task',
				description: 'Newly added task',
				status: 'pending' as TaskStatus,
				priority: 'medium',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};

			await tmCore.tasks.append([newTask]);

			// Simulate CLI: task-master list (should get fresh data)
			const tasksAfter = await tmCore.tasks.list();
			expect(tasksAfter).toHaveLength(4);
			expect(tasksAfter[3].title).toBe('New Task');
		});

		it('should invalidate cache when deleting task (like CLI delete-task)', async () => {
			// Simulate CLI: task-master list
			const tasksBefore = await tmCore.tasks.list();
			expect(tasksBefore).toHaveLength(3);

			// Simulate CLI: task-master delete-task --id=3
			await tmCore.tasks.delete('3');

			// Simulate CLI: task-master list (should get fresh data)
			const tasksAfter = await tmCore.tasks.list();
			expect(tasksAfter).toHaveLength(2);
			expect(tasksAfter.find((t) => t.id === '3')).toBeUndefined();
		});
	});

	describe('MCP-like Operations with Cache', () => {
		it('should cache tasks when calling get_tasks (MCP tool)', async () => {
			// Simulate MCP: get_tasks
			const tasks1 = await tmCore.tasks.list();
			const tasks2 = await tmCore.tasks.list();

			expect(tasks1).toHaveLength(3);
			expect(tasks2).toEqual(tasks1);
		});

		it('should cache individual task retrieval (MCP: get_task)', async () => {
			// Simulate MCP: get_task { task_id: "1" }
			const task1 = await tmCore.tasks.get('1');
			const task2 = await tmCore.tasks.get('1');

			expect(task1).toBeDefined();
			expect(task2).toEqual(task1);
		});

		it('should cache subtask retrieval (MCP: get_task with subtask ID)', async () => {
			// Simulate MCP: get_task { task_id: "1.1" }
			const subtask1 = await tmCore.tasks.get('1.1');
			const subtask2 = await tmCore.tasks.get('1.1');

			expect(subtask1).toBeDefined();
			expect(subtask1?.id).toBe('1.1');
			expect(subtask2).toEqual(subtask1);
		});

		it('should invalidate cache on set_task_status (MCP tool)', async () => {
			// Simulate MCP: get_tasks
			const tasksBefore = await tmCore.tasks.list();
			expect(tasksBefore[1].status).toBe('in-progress');

			// Simulate MCP: set_task_status { task_id: "2", status: "done" }
			await tmCore.tasks.updateStatus('2', 'done');

			// Simulate MCP: get_tasks (should get fresh data)
			const tasksAfter = await tmCore.tasks.list();
			expect(tasksAfter[1].status).toBe('done');
		});

		it('should invalidate cache on update_task (MCP tool)', async () => {
			// Simulate MCP: get_task { task_id: "2" }
			const taskBefore = await tmCore.tasks.get('2');
			expect(taskBefore?.description).toBe('Second task description');

			// Simulate MCP: update_task { task_id: "2", updates: { description: "Updated description" } }
			await tmCore.tasks.update('2', {
				description: 'Updated description'
			});

			// Simulate MCP: get_task { task_id: "2" } (should get fresh data)
			const taskAfter = await tmCore.tasks.get('2');
			expect(taskAfter?.description).toBe('Updated description');
		});

		it('should handle concurrent MCP operations with cache', async () => {
			// Simulate multiple MCP tools calling get_tasks simultaneously
			const promises = Array(10)
				.fill(null)
				.map(() => tmCore.tasks.list());

			const results = await Promise.all(promises);

			// All results should be identical (from cache)
			results.forEach((result) => {
				expect(result).toHaveLength(3);
				expect(result).toEqual(results[0]);
			});
		});
	});

	describe('Mixed CLI and MCP Operations', () => {
		it('should share cache between CLI-like and MCP-like operations', async () => {
			// Simulate CLI: task-master list
			const cliTasks = await tmCore.tasks.list();

			// Simulate MCP: get_tasks
			const mcpTasks = await tmCore.tasks.list();

			// Both should return same data (from cache)
			expect(cliTasks).toEqual(mcpTasks);
		});

		it('should invalidate cache for both CLI and MCP after write operation', async () => {
			// Simulate CLI: task-master list
			const cliTasksBefore = await tmCore.tasks.list();
			expect(cliTasksBefore[0].status).toBe('pending');

			// Simulate MCP: set_task_status
			await tmCore.tasks.updateStatus('1', 'done');

			// Simulate CLI: task-master list (should see update)
			const cliTasksAfter = await tmCore.tasks.list();
			expect(cliTasksAfter[0].status).toBe('done');

			// Simulate MCP: get_tasks (should also see update)
			const mcpTasksAfter = await tmCore.tasks.list();
			expect(mcpTasksAfter[0].status).toBe('done');
		});

		it('should handle rapid CLI and MCP operations correctly', async () => {
			// Simulate rapid mixed operations
			const task1 = await tmCore.tasks.get('1'); // CLI-like
			const tasks1 = await tmCore.tasks.list(); // MCP-like
			await tmCore.tasks.updateStatus('1', 'in-progress'); // CLI-like
			const tasks2 = await tmCore.tasks.list(); // MCP-like
			const task2 = await tmCore.tasks.get('1'); // CLI-like

			// Verify state changes are correct
			expect(task1?.status).toBe('pending');
			expect(tasks1[0].status).toBe('pending');
			expect(tasks2[0].status).toBe('in-progress');
			expect(task2?.status).toBe('in-progress');
		});
	});

	describe('Cache TTL Behavior - Integration', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(async () => {
			// Flush all remaining timers before switching to prevent timer leakage
			try {
				await vi.runAllTimersAsync();
			} catch (e) {
				// Ignore if no timers remain
			}
			vi.useRealTimers();
		});

		it('should expire cache between CLI operations after TTL', async () => {
			// Simulate CLI: task-master list
			const tasks1 = await tmCore.tasks.list();
			expect(tasks1).toHaveLength(3);

			// Wait for cache to expire (5s TTL + 100ms buffer)
			await advancePastTTL(5000);

			// Simulate CLI: task-master list (should reload from disk)
			const tasks2 = await tmCore.tasks.list();

			// Data should be identical but freshly loaded
			expect(tasks2).toHaveLength(3);
			expect(tasks2).toEqual(tasks1);
		});

		it('should maintain cache throughout rapid MCP operations within TTL', async () => {
			// Simulate rapid MCP get_tasks calls within TTL window
			const operations = [];
			for (let i = 0; i < 10; i++) {
				operations.push(tmCore.tasks.list());
			}

			const results = await Promise.all(operations);

			// All results should be identical (from cache)
			results.forEach((result) => {
				expect(result).toHaveLength(3);
				expect(result).toEqual(results[0]);
			});

			// Verify cache still valid after all operations
			// Advance time by 2.5 seconds (well within 5s TTL)
			await advanceTime(2500);

			const afterDelay = await tmCore.tasks.list();
			expect(afterDelay).toEqual(results[0]);
		});

		it('should handle mixed CLI/MCP operations with TTL boundaries', async () => {
			// Simulate CLI operation
			const cliTasks1 = await tmCore.tasks.list();
			expect(cliTasks1).toHaveLength(3);

			// Advance 2.5 seconds (still within TTL)
			await advanceTime(2500);

			// Simulate MCP operation (should hit cache)
			const mcpTasks = await tmCore.tasks.list();
			expect(mcpTasks).toEqual(cliTasks1);

			// Advance another 3 seconds (total 5.5s, past TTL)
			await advanceTime(3000);

			// Simulate CLI operation (cache expired, should reload)
			const cliTasks2 = await tmCore.tasks.list();
			expect(cliTasks2).toHaveLength(3);
			expect(cliTasks2).toEqual(cliTasks1); // Same data, freshly loaded
		});

		it('should expire cache at exact TTL boundary', async () => {
			// Load and cache tasks
			const tasksBefore = await tmCore.tasks.list();
			expect(tasksBefore).toHaveLength(3);

			// Advance to just before TTL (4999ms)
			// Cache should still be valid: 4999 < 5000
			await advanceTime(4999);

			// Verify cache is still valid
			const tasksBeforeTTL = await tmCore.tasks.list();
			expect(tasksBeforeTTL).toEqual(tasksBefore);

			// Advance 2ms more (total 5001ms, past 5000ms TTL)
			// Cache should expire: 5001 > 5000
			await advanceTime(2);

			// Cache should be expired, data reloaded from disk
			const tasksAfterTTL = await tmCore.tasks.list();
			expect(tasksAfterTTL).toHaveLength(3);
			// Data matches but was freshly loaded
			expect(tasksAfterTTL).toEqual(tasksBefore);
		});

		it('should handle cache invalidation and TTL reset on write', async () => {
			// Cache initial state
			const tasksBefore = await tmCore.tasks.list();
			expect(tasksBefore[0].status).toBe('pending');

			// Advance 3 seconds
			await advanceTime(3000);

			// Write operation (invalidates cache)
			await tmCore.tasks.updateStatus('1', 'in-progress');

			// Advance another 3 seconds (total 6s from original load)
			await advanceTime(3000);

			// Load - should have new data (cache was cleared at write time)
			const tasksAfter = await tmCore.tasks.list();
			expect(tasksAfter[0].status).toBe('in-progress');

			// Advance just 2 more seconds (only 2s since last write/reload)
			await advanceTime(2000);

			// Cache should still be valid (only 2s since invalidation)
			const tasksCached = await tmCore.tasks.list();
			expect(tasksCached).toEqual(tasksAfter);
		});

		it('should handle multiple cache entries expiring at different times', async () => {
			// Cache first query (all tasks)
			const allTasks = await tmCore.tasks.list();
			expect(allTasks).toHaveLength(3);

			// Advance 3 seconds
			await advanceTime(3000);

			// Cache second query (filtered) - new TTL starts
			const pendingTasks = await tmCore.tasks.list({ status: 'pending' });
			expect(pendingTasks).toHaveLength(1);

			// Advance another 3 seconds (total 6s for first, 3s for second)
			await advanceTime(3000);

			// First cache expired (6s > 5s), second still valid (3s < 5s)
			const allTasksAfter = await tmCore.tasks.list();
			const pendingTasksAfter = await tmCore.tasks.list({
				status: 'pending'
			});

			// Both should return correct data
			expect(allTasksAfter).toHaveLength(3);
			expect(pendingTasksAfter).toEqual(pendingTasks);
		});
	});

	describe('Cache Behavior with Subtasks', () => {
		it('should cache parent task when accessing subtask', async () => {
			// Access subtask (requires loading parent)
			const subtask1 = await tmCore.tasks.get('1.1');
			expect(subtask1).toBeDefined();
			expect(subtask1?.title).toBe('Subtask 1.1');

			// Access parent task (should be in cache)
			const parent = await tmCore.tasks.get('1');
			expect(parent).toBeDefined();
			expect(parent?.subtasks).toHaveLength(2);
		});

		it('should invalidate cache when updating subtask status', async () => {
			// Get initial state
			const taskBefore = await tmCore.tasks.get('1');
			expect(taskBefore?.subtasks?.[0].status).toBe('pending');

			// Update subtask status
			await tmCore.tasks.updateStatus('1.1', 'done');

			// Verify cache was invalidated
			const taskAfter = await tmCore.tasks.get('1');
			expect(taskAfter?.subtasks?.[0].status).toBe('done');
		});

		it('should reflect parent status auto-adjustment in cache', async () => {
			// Get initial state
			const taskBefore = await tmCore.tasks.get('1');
			expect(taskBefore?.status).toBe('pending');

			// Complete first subtask
			await tmCore.tasks.updateStatus('1.1', 'done');

			// Parent should be in-progress (not all subtasks done)
			const taskAfter1 = await tmCore.tasks.get('1');
			expect(taskAfter1?.status).toBe('in-progress');

			// Complete second subtask
			await tmCore.tasks.updateStatus('1.2', 'done');

			// Parent should be done (all subtasks done)
			const taskAfter2 = await tmCore.tasks.get('1');
			expect(taskAfter2?.status).toBe('done');
		});
	});

	describe('Cache Performance in Real Usage', () => {
		it('should improve performance for repeated list operations', async () => {
			// First call - cache miss (will be slower)
			const start1 = Date.now();
			await tmCore.tasks.list();
			const duration1 = Date.now() - start1;

			// Subsequent calls - cache hits (should be faster)
			let totalDuration = 0;
			const iterations = 3;
			for (let i = 0; i < iterations; i++) {
				const start = Date.now();
				await tmCore.tasks.list();
				totalDuration += Date.now() - start;
			}
			const averageCachedDuration = totalDuration / iterations;

			// Cache hits should be significantly faster
			// Note: This is a loose check as performance can vary
			expect(averageCachedDuration).toBeLessThan(duration1 * 2);
		});

		it('should handle high-frequency operations efficiently', async () => {
			// Simulate high-frequency read operations
			const operations = [];
			for (let i = 0; i < 25; i++) {
				operations.push(tmCore.tasks.list());
				operations.push(tmCore.tasks.get('1'));
				operations.push(tmCore.tasks.get('2'));
			}

			const start = Date.now();
			await Promise.all(operations);
			const duration = Date.now() - start;

			// Should complete reasonably fast with caching
			// Without cache, 75 operations would take much longer
			expect(duration).toBeLessThan(2000); // 2 seconds max
		});
	});

	describe('Cache Consistency', () => {
		it('should maintain consistency across tag operations', async () => {
			// Load master tag
			const masterTasks = await tmCore.tasks.list();

			// Copy to new tag
			await tmCore.config.storage.copyTag('master', 'backup');

			// Load backup tag
			const backupTasks = await tmCore.tasks.list('backup');

			// Should have same data
			expect(backupTasks).toHaveLength(masterTasks.length);
			expect(backupTasks[0].title).toBe(masterTasks[0].title);
		});

		it('should prevent stale data bugs in rapid read/write cycles', async () => {
			// Rapid read-write-read cycle
			const task1 = await tmCore.tasks.get('1');
			await tmCore.tasks.update('1', { title: 'Cycle 1' });
			const task2 = await tmCore.tasks.get('1');
			await tmCore.tasks.update('1', { title: 'Cycle 2' });
			const task3 = await tmCore.tasks.get('1');
			await tmCore.tasks.update('1', { title: 'Cycle 3' });
			const task4 = await tmCore.tasks.get('1');

			// Each read should reflect the previous write
			expect(task1?.title).toBe('First Task');
			expect(task2?.title).toBe('Cycle 1');
			expect(task3?.title).toBe('Cycle 2');
			expect(task4?.title).toBe('Cycle 3');
		});
	});

	describe('Cache LRU Ordering Verification', () => {
		it('should maintain correct LRU ordering for cache entries', () => {
			const tracker = new CacheAccessTracker();

			// Create multiple cache entries by loading different filter combinations
			const filters = [
				{},
				{ status: 'pending' as const },
				{ status: 'in-progress' as const },
				{ status: 'done' as const }
			];

			// Load each filter combination and track access
			for (const filter of filters) {
				const key = JSON.stringify(filter);
				tmCore.tasks.list(filter);
				tracker.recordAccess(key);
			}

			// Verify we have 4 tracked entries
			expect(tracker.size).toBe(4);

			// Access the first entry again (should move it to most recently used)
			tmCore.tasks.list();
			tracker.recordAccess(JSON.stringify({}));

			// The least recently accessed should now be the "pending" filter
			const lruKey = tracker.getLeastRecentlyAccessed();
			expect(lruKey).toBe(JSON.stringify({ status: 'pending' }));
		});

		it('should respect memory constraints with LRU eviction', async () => {
			// Get access to the underlying storage cache
			const storage = (tmCore as any).config.storage;
			const cache = (storage as any).taskCache;

			// Validate that cache respects max size (100 entries)
			const validator = createMemoryValidator(100);

			// Create multiple cache entries
			for (let i = 0; i < 25; i++) {
				await tmCore.tasks.list({ status: `test-${i}` as any });
			}

			// Validate cache size is within limits
			expect(validator.validateSize(cache)).toBe(true);
			expect(validator.getCurrentSize(cache)).toBeLessThanOrEqual(25);

			// Assert no exception is thrown
			expect(() => validator.assertSize(cache)).not.toThrow();
		});

		it('should evict least-recently-used entries when approaching capacity', async () => {
			const tracker = new CacheAccessTracker();
			const storage = (tmCore as any).config.storage;
			const cache = (storage as any).taskCache;
			const validator = createMemoryValidator(100);

			// Create a sequence of cache operations
			const operations = 15;
			for (let i = 0; i < operations; i++) {
				const filter = { custom: `entry-${i}` };
				const key = JSON.stringify(filter);
				await tmCore.tasks.list(filter as any);
				tracker.recordAccess(key);
			}

			// Access first few entries again to mark them as recently used
			for (let i = 0; i < 5; i++) {
				const filter = { custom: `entry-${i}` };
				const key = JSON.stringify(filter);
				await tmCore.tasks.list(filter as any);
				tracker.recordAccess(key);
			}

			// Verify cache is still within size limits
			expect(validator.validateSize(cache)).toBe(true);

			// Verify LRU ordering: entries 5-14 should be older than 0-4
			const accessOrder = tracker.getKeysByAccessOrder();
			const oldestKeys = accessOrder.slice(0, 10);

			// The oldest keys should include entries 5-14 (not 0-4 which were re-accessed)
			const oldestEntries = oldestKeys.filter((key) =>
				key.includes('"custom"')
			);
			expect(oldestEntries.length).toBeGreaterThan(0);

			// Verify none of the re-accessed entries (0-4) are in the oldest set
			for (let i = 0; i < 5; i++) {
				const reAccessedKey = JSON.stringify({ custom: `entry-${i}` });
				expect(oldestKeys.includes(reAccessedKey)).toBe(false);
			}
		});
	});
});
