/**
 * @fileoverview Dataset Generator for Performance Testing
 *
 * Generates synthetic task datasets of various sizes for benchmarking
 * file storage operations with realistic task structures.
 */

import type { Task } from '../../packages/tm-core/src/common/types/index.js';

/**
 * Dataset size configurations
 */
export type DatasetSize = 'small' | 'medium' | 'large' | 'extra-large';

/**
 * Dataset configuration
 */
export interface DatasetConfig {
	size: DatasetSize;
	taskCount: number;
	subtasksPerTask: number;
	description: string;
}

/**
 * Predefined dataset configurations
 */
export const DATASET_CONFIGS: Record<DatasetSize, DatasetConfig> = {
	small: {
		size: 'small',
		taskCount: 40,
		subtasksPerTask: 3,
		description: '40 tasks with 3 subtasks each (160 total items)'
	},
	medium: {
		size: 'medium',
		taskCount: 400,
		subtasksPerTask: 5,
		description: '400 tasks with 5 subtasks each (2400 total items)'
	},
	large: {
		size: 'large',
		taskCount: 2000,
		subtasksPerTask: 7,
		description: '2000 tasks with 7 subtasks each (16000 total items)'
	},
	'extra-large': {
		size: 'extra-large',
		taskCount: 4000,
		subtasksPerTask: 10,
		description: '4000 tasks with 10 subtasks each (44000 total items)'
	}
};

/**
 * Task status distribution
 */
const STATUS_DISTRIBUTION = {
	pending: 0.4,
	'in-progress': 0.3,
	done: 0.2,
	blocked: 0.05,
	deferred: 0.05
};

/**
 * Priority distribution
 */
const PRIORITY_DISTRIBUTION = {
	low: 0.3,
	medium: 0.5,
	high: 0.15,
	critical: 0.05
};

/**
 * Sample task titles for variety
 */
const TASK_TITLE_TEMPLATES = [
	'Implement {feature} for {component}',
	'Refactor {component} to improve {aspect}',
	'Add {feature} support to {component}',
	'Fix {issue} in {component}',
	'Optimize {aspect} in {component}',
	'Update {component} documentation',
	'Create tests for {feature}',
	'Migrate {component} to {technology}',
	'Integrate {service} with {component}',
	'Design {feature} architecture'
];

const FEATURES = [
	'authentication',
	'caching',
	'logging',
	'validation',
	'error handling',
	'configuration',
	'monitoring',
	'reporting',
	'analytics',
	'notifications'
];

const COMPONENTS = [
	'API',
	'database layer',
	'UI components',
	'service layer',
	'middleware',
	'controllers',
	'models',
	'utilities',
	'CLI',
	'MCP server'
];

const ASPECTS = [
	'performance',
	'security',
	'maintainability',
	'scalability',
	'reliability',
	'testability',
	'usability',
	'accessibility'
];

const ISSUES = [
	'memory leak',
	'race condition',
	'null pointer',
	'validation bug',
	'edge case',
	'performance regression',
	'type error',
	'concurrency issue'
];

const TECHNOLOGIES = [
	'TypeScript',
	'React',
	'Node.js',
	'PostgreSQL',
	'Redis',
	'GraphQL',
	'WebSockets',
	'Docker'
];

const SERVICES = [
	'authentication service',
	'email service',
	'payment gateway',
	'notification service',
	'analytics service',
	'logging service',
	'cache service',
	'storage service'
];

/**
 * Generate a random task title
 */
function generateTaskTitle(index: number): string {
	const template =
		TASK_TITLE_TEMPLATES[index % TASK_TITLE_TEMPLATES.length];
	const feature = FEATURES[Math.floor(Math.random() * FEATURES.length)];
	const component = COMPONENTS[Math.floor(Math.random() * COMPONENTS.length)];
	const aspect = ASPECTS[Math.floor(Math.random() * ASPECTS.length)];
	const issue = ISSUES[Math.floor(Math.random() * ISSUES.length)];
	const technology =
		TECHNOLOGIES[Math.floor(Math.random() * TECHNOLOGIES.length)];
	const service = SERVICES[Math.floor(Math.random() * SERVICES.length)];

	return template
		.replace('{feature}', feature)
		.replace('{component}', component)
		.replace('{aspect}', aspect)
		.replace('{issue}', issue)
		.replace('{technology}', technology)
		.replace('{service}', service);
}

/**
 * Get a random item based on weighted distribution
 */
function weightedRandom<T extends string>(
	distribution: Record<T, number>
): T {
	const rand = Math.random();
	let cumulative = 0;

	for (const [key, weight] of Object.entries(distribution)) {
		cumulative += weight;
		if (rand <= cumulative) {
			return key as T;
		}
	}

	return Object.keys(distribution)[0] as T;
}

/**
 * Generate a synthetic task
 */
function generateTask(
	id: number,
	subtaskCount: number,
	totalTasks: number
): Task {
	const status = weightedRandom(STATUS_DISTRIBUTION);
	const priority = weightedRandom(PRIORITY_DISTRIBUTION);
	const now = new Date().toISOString();

	// Generate dependencies (20% chance of having dependencies)
	const dependencies: string[] = [];
	if (Math.random() < 0.2 && id > 1) {
		const depCount = Math.floor(Math.random() * 2) + 1;
		for (let i = 0; i < depCount; i++) {
			const depId = Math.max(1, id - Math.floor(Math.random() * 5) - 1);
			if (depId < id && !dependencies.includes(String(depId))) {
				dependencies.push(String(depId));
			}
		}
	}

	const task: Task = {
		id: String(id),
		title: generateTaskTitle(id),
		description: `This is a generated task ${id} for performance testing. It simulates a realistic task structure with various properties and relationships.`,
		status,
		priority,
		dependencies,
		details: `Detailed implementation notes for task ${id}. This includes technical requirements, architecture decisions, and implementation guidelines that would typically be found in a real task.`,
		testStrategy: `Test strategy for task ${id}: Unit tests, integration tests, and end-to-end tests should cover all functionality. Include edge cases and error scenarios.`,
		tags: ['performance-test', `batch-${Math.floor(id / 10)}`, priority],
		createdAt: now,
		updatedAt: now,
		subtasks: []
	};

	// Add complexity if task number allows
	if (id % 3 === 0) {
		task.complexity = Math.floor(Math.random() * 8) + 1;
	}

	// Generate subtasks
	for (let i = 1; i <= subtaskCount; i++) {
		const subtaskStatus = weightedRandom(STATUS_DISTRIBUTION);

		// Subtask dependencies (30% chance of depending on previous subtasks)
		const subtaskDeps: number[] = [];
		if (Math.random() < 0.3 && i > 1) {
			subtaskDeps.push(i - 1);
		}

		task.subtasks.push({
			id: i,
			parentId: String(id),
			title: `Subtask ${i} of task ${id}`,
			description: `Implementation step ${i} for task ${id}. This subtask focuses on a specific aspect of the parent task.`,
			status: subtaskStatus,
			priority: task.priority,
			dependencies: subtaskDeps,
			details: `Specific implementation details for subtask ${id}.${i}. Include code examples, API references, and technical specifications.`,
			testStrategy: `Unit tests should verify the functionality of subtask ${id}.${i}. Mock dependencies as needed.`,
			createdAt: now,
			updatedAt: now
		});
	}

	return task;
}

/**
 * Generate a dataset of tasks
 */
export function generateDataset(config: DatasetConfig): Task[] {
	const tasks: Task[] = [];

	for (let i = 1; i <= config.taskCount; i++) {
		tasks.push(generateTask(i, config.subtasksPerTask, config.taskCount));
	}

	return tasks;
}

/**
 * Generate a dataset by size name
 */
export function generateDatasetBySize(size: DatasetSize): Task[] {
	const config = DATASET_CONFIGS[size];
	return generateDataset(config);
}

/**
 * Get dataset statistics
 */
export interface DatasetStats {
	totalTasks: number;
	totalSubtasks: number;
	totalItems: number;
	statusDistribution: Record<string, number>;
	priorityDistribution: Record<string, number>;
	tasksWithDependencies: number;
	tasksWithComplexity: number;
	averageSubtasksPerTask: number;
}

/**
 * Calculate statistics for a dataset
 */
export function calculateDatasetStats(tasks: Task[]): DatasetStats {
	const stats: DatasetStats = {
		totalTasks: tasks.length,
		totalSubtasks: 0,
		totalItems: tasks.length,
		statusDistribution: {},
		priorityDistribution: {},
		tasksWithDependencies: 0,
		tasksWithComplexity: 0,
		averageSubtasksPerTask: 0
	};

	for (const task of tasks) {
		// Count subtasks
		stats.totalSubtasks += task.subtasks.length;
		stats.totalItems += task.subtasks.length;

		// Status distribution
		stats.statusDistribution[task.status] =
			(stats.statusDistribution[task.status] || 0) + 1;

		// Priority distribution
		stats.priorityDistribution[task.priority] =
			(stats.priorityDistribution[task.priority] || 0) + 1;

		// Dependencies
		if (task.dependencies && task.dependencies.length > 0) {
			stats.tasksWithDependencies++;
		}

		// Complexity
		if (task.complexity !== undefined) {
			stats.tasksWithComplexity++;
		}
	}

	stats.averageSubtasksPerTask =
		stats.totalTasks > 0 ? stats.totalSubtasks / stats.totalTasks : 0;

	return stats;
}

/**
 * Format dataset statistics as string
 */
export function formatDatasetStats(stats: DatasetStats): string {
	const lines: string[] = [];

	lines.push('Dataset Statistics:');
	lines.push(`  Total Tasks: ${stats.totalTasks}`);
	lines.push(`  Total Subtasks: ${stats.totalSubtasks}`);
	lines.push(`  Total Items: ${stats.totalItems}`);
	lines.push(
		`  Average Subtasks per Task: ${stats.averageSubtasksPerTask.toFixed(2)}`
	);
	lines.push(`  Tasks with Dependencies: ${stats.tasksWithDependencies}`);
	lines.push(`  Tasks with Complexity: ${stats.tasksWithComplexity}`);
	lines.push('');

	lines.push('Status Distribution:');
	for (const [status, count] of Object.entries(stats.statusDistribution)) {
		const percentage = ((count / stats.totalTasks) * 100).toFixed(1);
		lines.push(`  ${status}: ${count} (${percentage}%)`);
	}
	lines.push('');

	lines.push('Priority Distribution:');
	for (const [priority, count] of Object.entries(stats.priorityDistribution)) {
		const percentage = ((count / stats.totalTasks) * 100).toFixed(1);
		lines.push(`  ${priority}: ${count} (${percentage}%)`);
	}

	return lines.join('\n');
}

/**
 * Verify dataset integrity
 */
export interface DatasetValidation {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Validate dataset integrity
 */
export function validateDataset(tasks: Task[]): DatasetValidation {
	const validation: DatasetValidation = {
		valid: true,
		errors: [],
		warnings: []
	};

	const taskIds = new Set<string>();

	for (const task of tasks) {
		// Check for duplicate IDs
		if (taskIds.has(String(task.id))) {
			validation.errors.push(`Duplicate task ID: ${task.id}`);
			validation.valid = false;
		}
		taskIds.add(String(task.id));

		// Validate dependencies
		for (const depId of task.dependencies || []) {
			if (!taskIds.has(depId) && tasks.findIndex(t => String(t.id) === depId) === -1) {
				validation.warnings.push(
					`Task ${task.id} depends on non-existent task ${depId}`
				);
			}
		}

		// Check subtask IDs
		const subtaskIds = new Set<number>();
		for (const subtask of task.subtasks) {
			if (subtaskIds.has(subtask.id)) {
				validation.errors.push(
					`Duplicate subtask ID ${subtask.id} in task ${task.id}`
				);
				validation.valid = false;
			}
			subtaskIds.add(subtask.id);

			// Validate subtask parent ID
			if (String(subtask.parentId) !== String(task.id)) {
				validation.errors.push(
					`Subtask ${task.id}.${subtask.id} has incorrect parentId: ${subtask.parentId}`
				);
				validation.valid = false;
			}
		}
	}

	return validation;
}
