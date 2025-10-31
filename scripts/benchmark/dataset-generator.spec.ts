/**
 * @fileoverview Tests for Dataset Generator
 */

import { describe, it, expect } from 'vitest';
import {
	generateDatasetBySize,
	calculateDatasetStats,
	validateDataset,
	DATASET_CONFIGS
} from './dataset-generator.js';

describe('Dataset Generator', () => {
	describe('dataset generation', () => {
		it('should generate small dataset', () => {
			const tasks = generateDatasetBySize('small');
			expect(tasks).toHaveLength(DATASET_CONFIGS.small.taskCount);
			expect(tasks[0].subtasks).toHaveLength(DATASET_CONFIGS.small.subtasksPerTask);
		});

		it('should generate medium dataset', () => {
			const tasks = generateDatasetBySize('medium');
			expect(tasks).toHaveLength(DATASET_CONFIGS.medium.taskCount);
		});

		it('should generate large dataset', () => {
			const tasks = generateDatasetBySize('large');
			expect(tasks).toHaveLength(DATASET_CONFIGS.large.taskCount);
		});

		it('should generate valid task structure', () => {
			const tasks = generateDatasetBySize('small');
			const task = tasks[0];

			expect(task).toHaveProperty('id');
			expect(task).toHaveProperty('title');
			expect(task).toHaveProperty('description');
			expect(task).toHaveProperty('status');
			expect(task).toHaveProperty('priority');
			expect(task).toHaveProperty('subtasks');
			expect(Array.isArray(task.subtasks)).toBe(true);
		});

		it('should generate unique task IDs', () => {
			const tasks = generateDatasetBySize('medium');
			const ids = new Set(tasks.map(t => t.id));
			expect(ids.size).toBe(tasks.length);
		});

		it('should generate valid subtask structure', () => {
			const tasks = generateDatasetBySize('small');
			const subtask = tasks[0].subtasks[0];

			expect(subtask).toHaveProperty('id');
			expect(subtask).toHaveProperty('parentId');
			expect(subtask).toHaveProperty('title');
			expect(subtask).toHaveProperty('status');
			expect(String(subtask.parentId)).toBe(String(tasks[0].id));
		});
	});

	describe('dataset statistics', () => {
		it('should calculate accurate statistics', () => {
			const tasks = generateDatasetBySize('small');
			const stats = calculateDatasetStats(tasks);

			expect(stats.totalTasks).toBe(DATASET_CONFIGS.small.taskCount);
			expect(stats.totalSubtasks).toBe(
				DATASET_CONFIGS.small.taskCount * DATASET_CONFIGS.small.subtasksPerTask
			);
			expect(stats.averageSubtasksPerTask).toBe(
				DATASET_CONFIGS.small.subtasksPerTask
			);
		});

		it('should track status distribution', () => {
			const tasks = generateDatasetBySize('medium');
			const stats = calculateDatasetStats(tasks);

			expect(stats.statusDistribution).toBeDefined();
			expect(Object.keys(stats.statusDistribution).length).toBeGreaterThan(0);

			const totalStatusCount = Object.values(stats.statusDistribution).reduce(
				(sum, count) => sum + count,
				0
			);
			expect(totalStatusCount).toBe(stats.totalTasks);
		});

		it('should track priority distribution', () => {
			const tasks = generateDatasetBySize('medium');
			const stats = calculateDatasetStats(tasks);

			expect(stats.priorityDistribution).toBeDefined();
			expect(Object.keys(stats.priorityDistribution).length).toBeGreaterThan(0);

			const totalPriorityCount = Object.values(
				stats.priorityDistribution
			).reduce((sum, count) => sum + count, 0);
			expect(totalPriorityCount).toBe(stats.totalTasks);
		});
	});

	describe('dataset validation', () => {
		it('should validate correct dataset', () => {
			const tasks = generateDatasetBySize('small');
			const validation = validateDataset(tasks);

			expect(validation.valid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect duplicate task IDs', () => {
			const tasks = generateDatasetBySize('small');
			tasks[1].id = tasks[0].id; // Create duplicate

			const validation = validateDataset(tasks);

			expect(validation.valid).toBe(false);
			expect(validation.errors.some(e => e.includes('Duplicate'))).toBe(true);
		});

		it('should detect incorrect subtask parent IDs', () => {
			const tasks = generateDatasetBySize('small');
			tasks[0].subtasks[0].parentId = '999' as any; // Invalid parent

			const validation = validateDataset(tasks);

			expect(validation.valid).toBe(false);
			expect(validation.errors.some(e => e.includes('parentId'))).toBe(true);
		});

		it('should detect duplicate subtask IDs within a task', () => {
			const tasks = generateDatasetBySize('small');
			tasks[0].subtasks[1].id = tasks[0].subtasks[0].id; // Create duplicate

			const validation = validateDataset(tasks);

			expect(validation.valid).toBe(false);
			expect(validation.errors.some(e => e.includes('Duplicate subtask'))).toBe(
				true
			);
		});
	});

	describe('dataset configs', () => {
		it('should have all dataset size configurations', () => {
			expect(DATASET_CONFIGS.small).toBeDefined();
			expect(DATASET_CONFIGS.medium).toBeDefined();
			expect(DATASET_CONFIGS.large).toBeDefined();
			expect(DATASET_CONFIGS['extra-large']).toBeDefined();
		});

		it('should have realistic task counts', () => {
			expect(DATASET_CONFIGS.small.taskCount).toBe(10);
			expect(DATASET_CONFIGS.medium.taskCount).toBe(100);
			expect(DATASET_CONFIGS.large.taskCount).toBe(500);
			expect(DATASET_CONFIGS['extra-large'].taskCount).toBe(1000);
		});
	});
});
