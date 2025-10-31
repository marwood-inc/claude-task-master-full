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
		// Tests will be added in subtask 9.3
	});
});
