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
		// Tests will be added in subtask 9.2
	});

	describe('Subtask Lookup Correctness', () => {
		// Tests will be added in subtask 9.2
	});

	describe('Performance and Memory', () => {
		// Tests will be added in subtask 9.3
	});
});
