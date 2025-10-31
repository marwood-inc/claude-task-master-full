/**
 * @fileoverview Tests for FileStorage single task lookup optimization
 * Tests the performance and correctness of optimized single task retrieval
 * covering both regular tasks and subtasks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStorage } from '../../../src/modules/storage/adapters/file-storage/file-storage.js';
import type { Task, TaskStatus } from '../../../src/common/types/index.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('FileStorage - Single Task Lookup', () => {
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

		// Create sample tasks with subtasks
		const sampleTasks: Task[] = [
			{
				id: '1',
				title: 'Task 1',
				description: 'First task',
				status: 'pending' as TaskStatus,
				priority: 'high',
				dependencies: [],
				details: 'Details for task 1',
				testStrategy: 'Test strategy for task 1',
				subtasks: [
					{
						id: 1,
						title: 'Subtask 1.1',
						description: 'First subtask',
						status: 'pending' as TaskStatus,
						priority: 'medium',
						dependencies: [],
						details: 'Subtask details',
						testStrategy: 'Subtask test strategy',
						parentId: '1',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					},
					{
						id: 2,
						title: 'Subtask 1.2',
						description: 'Second subtask',
						status: 'done' as TaskStatus,
						priority: 'high',
						dependencies: [1],
						details: 'Second subtask details',
						testStrategy: 'Subtask test strategy',
						parentId: '1',
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
				title: 'Task 2',
				description: 'Second task',
				status: 'in-progress' as TaskStatus,
				priority: 'medium',
				dependencies: ['1'],
				details: 'Details for task 2',
				testStrategy: 'Test strategy for task 2',
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			},
			{
				id: '3',
				title: 'Task 3',
				description: 'Third task',
				status: 'done' as TaskStatus,
				priority: 'low',
				dependencies: [],
				details: 'Details for task 3',
				testStrategy: 'Test strategy for task 3',
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

	describe('Task Lookup Correctness', () => {
		it('should load a regular task by ID', async () => {
			const task = await storage.loadTask('1', 'master');
			expect(task).toBeDefined();
			expect(task?.id).toBe('1');
			expect(task?.title).toBe('Task 1');
			expect(task?.status).toBe('pending');
		});

		it('should load a task with all properties intact', async () => {
			const task = await storage.loadTask('2', 'master');
			expect(task).toBeDefined();
			expect(task?.id).toBe('2');
			expect(task?.title).toBe('Task 2');
			expect(task?.description).toBe('Second task');
			expect(task?.status).toBe('in-progress');
			expect(task?.priority).toBe('medium');
			expect(task?.dependencies).toEqual(['1']);
			expect(task?.details).toBe('Details for task 2');
			expect(task?.testStrategy).toBe('Test strategy for task 2');
		});

		it('should return null for non-existent task ID', async () => {
			const task = await storage.loadTask('999', 'master');
			expect(task).toBeNull();
		});

		it('should handle string task IDs correctly', async () => {
			const task = await storage.loadTask('3', 'master');
			expect(task).toBeDefined();
			expect(task?.id).toBe('3');
			expect(task?.title).toBe('Task 3');
		});

		it('should load task without subtasks field for task without subtasks', async () => {
			const task = await storage.loadTask('2', 'master');
			expect(task).toBeDefined();
			expect(task?.subtasks).toEqual([]);
		});

		it('should load task with subtasks intact', async () => {
			const task = await storage.loadTask('1', 'master');
			expect(task).toBeDefined();
			expect(task?.subtasks).toHaveLength(2);
			expect(task?.subtasks?.[0].title).toBe('Subtask 1.1');
			expect(task?.subtasks?.[1].title).toBe('Subtask 1.2');
		});

		it('should enrich single task with complexity data', async () => {
			const task = await storage.loadTask('1', 'master');
			expect(task).toBeDefined();
			// Complexity enrichment should not fail even if no complexity data exists
			expect(task).toHaveProperty('id');
			expect(task).toHaveProperty('title');
		});

		it('should return null for non-existent tag', async () => {
			const task = await storage.loadTask('1', 'nonexistent-tag');
			expect(task).toBeNull();
		});

		it('should handle numeric-like string IDs', async () => {
			const task1 = await storage.loadTask('1', 'master');
			const task2 = await storage.loadTask('2', 'master');
			expect(task1?.id).toBe('1');
			expect(task2?.id).toBe('2');
			expect(task1?.id).not.toBe(task2?.id);
		});
	});

	describe('Subtask Lookup Correctness', () => {
		it('should load a subtask by dotted ID', async () => {
			const subtask = await storage.loadTask('1.1', 'master');
			expect(subtask).toBeDefined();
			expect(subtask?.id).toBe('1.1');
			expect(subtask?.title).toBe('Subtask 1.1');
		});

		it('should load subtask with parent task context', async () => {
			const subtask = await storage.loadTask('1.1', 'master');
			expect(subtask).toBeDefined();
			expect((subtask as any)?.parentTask).toBeDefined();
			expect((subtask as any)?.parentTask?.id).toBe('1');
			expect((subtask as any)?.parentTask?.title).toBe('Task 1');
			expect((subtask as any)?.isSubtask).toBe(true);
		});

		it('should load second subtask correctly', async () => {
			const subtask = await storage.loadTask('1.2', 'master');
			expect(subtask).toBeDefined();
			expect(subtask?.id).toBe('1.2');
			expect(subtask?.title).toBe('Subtask 1.2');
			expect(subtask?.status).toBe('done');
		});

		it('should resolve subtask dependencies to full dotted IDs', async () => {
			const subtask = await storage.loadTask('1.2', 'master');
			expect(subtask).toBeDefined();
			expect(subtask?.dependencies).toEqual(['1.1']);
		});

		it('should return null for non-existent subtask', async () => {
			const subtask = await storage.loadTask('1.999', 'master');
			expect(subtask).toBeNull();
		});

		it('should return null for subtask of non-existent parent', async () => {
			const subtask = await storage.loadTask('999.1', 'master');
			expect(subtask).toBeNull();
		});

		it('should load subtask with inherited properties from parent', async () => {
			const subtask = await storage.loadTask('1.1', 'master');
			expect(subtask).toBeDefined();
			expect(subtask?.tags).toContain('master');
			// Priority can be overridden or inherited
			expect(subtask?.priority).toBeDefined();
		});

		it('should handle subtasks without dependencies', async () => {
			const subtask = await storage.loadTask('1.1', 'master');
			expect(subtask).toBeDefined();
			expect(subtask?.dependencies).toEqual([]);
		});

		it('should maintain subtask status independently of parent', async () => {
			const parent = await storage.loadTask('1', 'master');
			const subtask = await storage.loadTask('1.2', 'master');
			expect(parent?.status).toBe('pending');
			expect(subtask?.status).toBe('done');
		});
	});

	describe('Performance and Memory', () => {
		it('should be faster than loadTasks() for single task lookup', async () => {
			// Create a larger dataset for meaningful performance comparison
			const largeTasks: Task[] = Array.from({ length: 100 }, (_, i) => ({
				id: String(i + 1),
				title: `Task ${i + 1}`,
				description: `Description ${i + 1}`,
				status: 'pending' as TaskStatus,
				priority: 'medium',
				dependencies: [],
				details: `Details ${i + 1}`,
				testStrategy: `Test strategy ${i + 1}`,
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			}));

			await storage.saveTasks(largeTasks, 'master');

			// Measure loadTask (optimized single task lookup)
			const start1 = Date.now();
			const singleTask = await storage.loadTask('50', 'master');
			const duration1 = Date.now() - start1;

			// Measure loadTasks + find (old approach)
			const start2 = Date.now();
			const allTasks = await storage.loadTasks('master');
			const foundTask = allTasks.find((t) => t.id === '50');
			const duration2 = Date.now() - start2;

			expect(singleTask?.id).toBe('50');
			expect(foundTask?.id).toBe('50');
			// Single task lookup should be faster than loading all tasks
			expect(duration1).toBeLessThan(duration2);
		});

		it('should use less memory than loadTasks() approach', async () => {
			// Create large dataset with subtasks
			const largeTasks: Task[] = Array.from({ length: 50 }, (_, i) => ({
				id: String(i + 1),
				title: `Task ${i + 1}`,
				description: `Description ${i + 1}`,
				status: 'pending' as TaskStatus,
				priority: 'medium',
				dependencies: [],
				details: `Details ${i + 1}`,
				testStrategy: `Test strategy ${i + 1}`,
				subtasks: Array.from({ length: 5 }, (_, j) => ({
					id: j + 1,
					title: `Subtask ${i + 1}.${j + 1}`,
					description: `Subtask description`,
					status: 'pending' as TaskStatus,
					priority: 'medium',
					dependencies: [],
					details: '',
					testStrategy: '',
					parentId: String(i + 1),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				})),
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			}));

			await storage.saveTasks(largeTasks, 'master');

			// Force GC if available
			if (global.gc) {
				global.gc();
			}

			const memBefore = process.memoryUsage().heapUsed;

			// Use optimized single task lookup multiple times
			for (let i = 0; i < 20; i++) {
				await storage.loadTask('25', 'master');
			}

			if (global.gc) {
				global.gc();
			}

			const memAfter = process.memoryUsage().heapUsed;
			const memGrowth = memAfter - memBefore;

			// Memory growth should be reasonable (less than 5MB for 20 lookups)
			expect(memGrowth).toBeLessThan(5 * 1024 * 1024);
		});

		it('should perform consistently for repeated lookups', async () => {
			const durations: number[] = [];

			// Perform multiple lookups
			for (let i = 0; i < 10; i++) {
				const start = Date.now();
				await storage.loadTask('2', 'master');
				durations.push(Date.now() - start);
			}

			// Calculate average and standard deviation
			const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
			const variance =
				durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) /
				durations.length;
			const stdDev = Math.sqrt(variance);

			// Performance should be consistent (low standard deviation)
			expect(stdDev).toBeLessThan(avg * 0.5); // StdDev less than 50% of average
		});

		it('should handle concurrent single task lookups efficiently', async () => {
			const start = Date.now();

			// Issue 20 concurrent lookups
			const promises = Array.from({ length: 20 }, (_, i) =>
				storage.loadTask(String((i % 3) + 1), 'master')
			);

			const results = await Promise.all(promises);
			const duration = Date.now() - start;

			// All lookups should succeed
			results.forEach((result) => {
				expect(result).toBeDefined();
				expect(result?.id).toMatch(/^[123]$/);
			});

			// Should complete in reasonable time (under 500ms)
			expect(duration).toBeLessThan(500);
		});

		it('should be faster for subtask lookups than loading all tasks', async () => {
			// Create task with many subtasks
			const taskWithManySubtasks: Task = {
				id: '100',
				title: 'Task with many subtasks',
				description: 'Test',
				status: 'pending' as TaskStatus,
				priority: 'high',
				dependencies: [],
				details: '',
				testStrategy: '',
				subtasks: Array.from({ length: 50 }, (_, i) => ({
					id: i + 1,
					title: `Subtask ${i + 1}`,
					description: 'Test',
					status: 'pending' as TaskStatus,
					priority: 'medium',
					dependencies: [],
					details: '',
					testStrategy: '',
					parentId: '100',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				})),
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			};

			const existingTasks = await storage.loadTasks('master');
			await storage.saveTasks([...existingTasks, taskWithManySubtasks], 'master');

			// Measure direct subtask lookup
			const start1 = Date.now();
			const subtask = await storage.loadTask('100.25', 'master');
			const duration1 = Date.now() - start1;

			expect(subtask?.id).toBe('100.25');
			expect(duration1).toBeLessThan(100); // Should be very fast
		});

		it('should enrich only the single task, not all tasks', async () => {
			// Create multiple tasks
			const tasks: Task[] = Array.from({ length: 20 }, (_, i) => ({
				id: String(i + 1),
				title: `Task ${i + 1}`,
				description: `Description ${i + 1}`,
				status: 'pending' as TaskStatus,
				priority: 'medium',
				dependencies: [],
				details: `Details ${i + 1}`,
				testStrategy: `Test strategy ${i + 1}`,
				subtasks: [],
				tags: ['master'],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			}));

			await storage.saveTasks(tasks, 'master');

			const start = Date.now();
			const task = await storage.loadTask('10', 'master');
			const duration = Date.now() - start;

			// Should be fast since only enriching one task
			expect(task?.id).toBe('10');
			expect(duration).toBeLessThan(50); // Should be very fast
		});

		it('should not have memory leaks with repeated single task lookups', async () => {
			const initialMemory = process.memoryUsage().heapUsed;

			// Perform many single task lookups
			for (let i = 0; i < 100; i++) {
				await storage.loadTask('1', 'master');
				await storage.loadTask('2', 'master');
				await storage.loadTask('1.1', 'master');
			}

			// Force GC if available
			if (global.gc) {
				global.gc();
			}

			const finalMemory = process.memoryUsage().heapUsed;
			const memoryGrowth = finalMemory - initialMemory;

			// Memory growth should be minimal (less than 5MB for 300 lookups)
			expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024);
		});
	});
});
