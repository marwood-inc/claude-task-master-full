/**
 * @fileoverview Dataset Size Testing Framework
 *
 * Tests file storage performance across different dataset sizes (small, medium, large)
 * to measure scalability and identify performance bottlenecks.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PerformanceMetrics, type PerformanceReport } from './performance-metrics.js';
import {
	generateDatasetBySize,
	calculateDatasetStats,
	formatDatasetStats,
	validateDataset,
	DATASET_CONFIGS,
	type DatasetSize,
	type DatasetConfig
} from './dataset-generator.js';
import type { Task } from '../../packages/tm-core/src/common/types/index.js';

/**
 * Test configuration
 */
export interface DatasetTestConfig {
	size: DatasetSize;
	testIterations: number;
	warmupIterations: number;
	enableCaching: boolean;
}

/**
 * Test results for a single dataset size
 */
export interface DatasetTestResult {
	config: DatasetTestConfig;
	datasetConfig: DatasetConfig;
	datasetStats: ReturnType<typeof calculateDatasetStats>;
	performanceReport: PerformanceReport;
	operations: {
		loadAllTasks: {
			iterations: number;
			avgDuration: number;
			minDuration: number;
			maxDuration: number;
		};
		loadSingleTask: {
			iterations: number;
			avgDuration: number;
			minDuration: number;
			maxDuration: number;
		};
		loadSingleSubtask: {
			iterations: number;
			avgDuration: number;
			minDuration: number;
			maxDuration: number;
		};
		saveTasks: {
			iterations: number;
			avgDuration: number;
			minDuration: number;
			maxDuration: number;
		};
	};
}

/**
 * Comparison of test results across dataset sizes
 */
export interface DatasetComparisonReport {
	results: Record<DatasetSize, DatasetTestResult>;
	scalabilityAnalysis: {
		loadAllTasks: {
			smallToMedium: number;
			mediumToLarge: number;
			smallToLarge: number;
		};
		loadSingleTask: {
			smallToMedium: number;
			mediumToLarge: number;
			smallToLarge: number;
		};
		fileIO: {
			smallToMedium: number;
			mediumToLarge: number;
			smallToLarge: number;
		};
	};
	recommendations: string[];
}

/**
 * Dataset Size Testing Framework
 */
export class DatasetSizeTester {
	private testDir: string;
	private metrics: PerformanceMetrics;

	/**
	 * Create a new dataset size tester
	 * @param testDir - Directory for test data files
	 */
	constructor(testDir: string) {
		this.testDir = testDir;
		this.metrics = new PerformanceMetrics(50);
	}

	/**
	 * Setup test environment
	 */
	async setup(): Promise<void> {
		// Create test directory if it doesn't exist
		await fs.mkdir(this.testDir, { recursive: true });

		// Clean up any existing test files
		const files = await fs.readdir(this.testDir);
		for (const file of files) {
			if (file.endsWith('.json')) {
				await fs.unlink(path.join(this.testDir, file));
			}
		}
	}

	/**
	 * Cleanup test environment
	 */
	async cleanup(): Promise<void> {
		// Remove test files
		try {
			const files = await fs.readdir(this.testDir);
			for (const file of files) {
				if (file.endsWith('.json')) {
					await fs.unlink(path.join(this.testDir, file));
				}
			}
		} catch (error) {
			// Ignore errors during cleanup
		}
	}

	/**
	 * Run performance tests for a specific dataset size
	 */
	async testDatasetSize(config: DatasetTestConfig): Promise<DatasetTestResult> {
		const datasetConfig = DATASET_CONFIGS[config.size];

		// Generate dataset
		const tasks = generateDatasetBySize(config.size);
		const datasetStats = calculateDatasetStats(tasks);

		// Validate dataset
		const validation = validateDataset(tasks);
		if (!validation.valid) {
			throw new Error(
				`Dataset validation failed: ${validation.errors.join(', ')}`
			);
		}

		// Create test file path
		const testFilePath = path.join(
			this.testDir,
			`tasks-${config.size}.json`
		);

		// Start metrics collection
		this.metrics.reset();
		this.metrics.start();

		// Write initial dataset
		await this.metrics.measureAsync('initial-save', async () => {
			const data = {
				tasks,
				metadata: {
					version: '1.0.0',
					lastModified: new Date().toISOString(),
					taskCount: tasks.length,
					completedCount: tasks.filter(t => t.status === 'done').length,
					tags: ['master']
				}
			};
			await fs.writeFile(testFilePath, JSON.stringify(data, null, 2), 'utf-8');
			this.metrics.recordFileIO('write', testFilePath);
		});

		// Warmup iterations
		for (let i = 0; i < config.warmupIterations; i++) {
			await this.loadTasksFromFile(testFilePath);
		}

		// Test: Load all tasks repeatedly
		const loadAllDurations: number[] = [];
		for (let i = 0; i < config.testIterations; i++) {
			const duration = await this.measureLoadAll(testFilePath, config.enableCaching);
			loadAllDurations.push(duration);
		}

		// Test: Load single task
		const loadSingleDurations: number[] = [];
		const testTaskIds = [
			'1',
			String(Math.floor(tasks.length / 2)),
			String(tasks.length)
		];

		for (let i = 0; i < config.testIterations; i++) {
			for (const taskId of testTaskIds) {
				const duration = await this.measureLoadSingle(
					testFilePath,
					taskId,
					config.enableCaching
				);
				loadSingleDurations.push(duration);
			}
		}

		// Test: Load subtasks
		const loadSubtaskDurations: number[] = [];
		const testSubtaskIds = ['1.1', '2.1', '3.1'];

		for (let i = 0; i < config.testIterations; i++) {
			for (const subtaskId of testSubtaskIds) {
				const duration = await this.measureLoadSubtask(
					testFilePath,
					subtaskId,
					config.enableCaching
				);
				loadSubtaskDurations.push(duration);
			}
		}

		// Test: Save tasks
		const saveDurations: number[] = [];
		for (let i = 0; i < Math.min(config.testIterations, 5); i++) {
			// Limit save iterations
			const duration = await this.measureSave(testFilePath, tasks);
			saveDurations.push(duration);
		}

		// Stop metrics collection
		this.metrics.stop();

		// Generate performance report
		const performanceReport = this.metrics.generateReport();

		// Calculate operation statistics
		const result: DatasetTestResult = {
			config,
			datasetConfig,
			datasetStats,
			performanceReport,
			operations: {
				loadAllTasks: {
					iterations: loadAllDurations.length,
					avgDuration:
						loadAllDurations.reduce((a, b) => a + b, 0) /
						loadAllDurations.length,
					minDuration: Math.min(...loadAllDurations),
					maxDuration: Math.max(...loadAllDurations)
				},
				loadSingleTask: {
					iterations: loadSingleDurations.length,
					avgDuration:
						loadSingleDurations.reduce((a, b) => a + b, 0) /
						loadSingleDurations.length,
					minDuration: Math.min(...loadSingleDurations),
					maxDuration: Math.max(...loadSingleDurations)
				},
				loadSingleSubtask: {
					iterations: loadSubtaskDurations.length,
					avgDuration:
						loadSubtaskDurations.reduce((a, b) => a + b, 0) /
						loadSubtaskDurations.length,
					minDuration: Math.min(...loadSubtaskDurations),
					maxDuration: Math.max(...loadSubtaskDurations)
				},
				saveTasks: {
					iterations: saveDurations.length,
					avgDuration:
						saveDurations.reduce((a, b) => a + b, 0) /
						saveDurations.length,
					minDuration: Math.min(...saveDurations),
					maxDuration: Math.max(...saveDurations)
				}
			}
		};

		return result;
	}

	/**
	 * Measure time to load all tasks
	 */
	private async measureLoadAll(
		filePath: string,
		useCache: boolean
	): Promise<number> {
		const start = Date.now();
		await this.loadTasksFromFile(filePath);
		const duration = Date.now() - start;

		if (useCache) {
			this.metrics.recordCacheHit();
		} else {
			this.metrics.recordCacheMiss();
		}

		return duration;
	}

	/**
	 * Measure time to load a single task
	 */
	private async measureLoadSingle(
		filePath: string,
		taskId: string,
		useCache: boolean
	): Promise<number> {
		const start = Date.now();
		await this.loadSingleTaskFromFile(filePath, taskId);
		const duration = Date.now() - start;

		if (useCache) {
			this.metrics.recordCacheHit();
		} else {
			this.metrics.recordCacheMiss();
		}

		return duration;
	}

	/**
	 * Measure time to load a subtask
	 */
	private async measureLoadSubtask(
		filePath: string,
		subtaskId: string,
		useCache: boolean
	): Promise<number> {
		const start = Date.now();
		await this.loadSubtaskFromFile(filePath, subtaskId);
		const duration = Date.now() - start;

		if (useCache) {
			this.metrics.recordCacheHit();
		} else {
			this.metrics.recordCacheMiss();
		}

		return duration;
	}

	/**
	 * Measure time to save tasks
	 */
	private async measureSave(filePath: string, tasks: Task[]): Promise<number> {
		const start = Date.now();
		const data = {
			tasks,
			metadata: {
				version: '1.0.0',
				lastModified: new Date().toISOString(),
				taskCount: tasks.length,
				completedCount: tasks.filter(t => t.status === 'done').length,
				tags: ['master']
			}
		};
		await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
		this.metrics.recordFileIO('write', filePath);
		return Date.now() - start;
	}

	/**
	 * Load tasks from file (simulates FileStorage.loadTasks)
	 */
	private async loadTasksFromFile(filePath: string): Promise<Task[]> {
		const content = await fs.readFile(filePath, 'utf-8');
		this.metrics.recordFileIO('read', filePath);

		const data = JSON.parse(content);
		return data.tasks || [];
	}

	/**
	 * Load single task from file (simulates FileStorage.loadTask for regular tasks)
	 */
	private async loadSingleTaskFromFile(
		filePath: string,
		taskId: string
	): Promise<Task | null> {
		const tasks = await this.loadTasksFromFile(filePath);
		return tasks.find(t => String(t.id) === taskId) || null;
	}

	/**
	 * Load subtask from file (simulates FileStorage.loadTask for subtasks)
	 */
	private async loadSubtaskFromFile(
		filePath: string,
		subtaskId: string
	): Promise<Task | null> {
		const [parentId, subId] = subtaskId.split('.');
		const tasks = await this.loadTasksFromFile(filePath);
		const parent = tasks.find(t => String(t.id) === parentId);

		if (!parent || !parent.subtasks) {
			return null;
		}

		const subtask = parent.subtasks.find(st => String(st.id) === subId);
		return subtask ? ({ ...subtask, id: subtaskId } as any) : null;
	}

	/**
	 * Run tests across multiple dataset sizes and generate comparison report
	 */
	async runComparisonTests(
		sizes: DatasetSize[],
		testIterations: number = 10,
		warmupIterations: number = 3
	): Promise<DatasetComparisonReport> {
		await this.setup();

		const results: Record<string, DatasetTestResult> = {};

		for (const size of sizes) {
			const config: DatasetTestConfig = {
				size,
				testIterations,
				warmupIterations,
				enableCaching: false
			};

			console.log(`\nTesting ${size} dataset...`);
			results[size] = await this.testDatasetSize(config);
			console.log(`✓ Completed ${size} dataset`);
		}

		await this.cleanup();

		// Calculate scalability analysis
		const scalabilityAnalysis = this.calculateScalability(results, sizes);

		// Generate recommendations
		const recommendations = this.generateRecommendations(
			results,
			scalabilityAnalysis
		);

		return {
			results: results as Record<DatasetSize, DatasetTestResult>,
			scalabilityAnalysis,
			recommendations
		};
	}

	/**
	 * Calculate scalability metrics
	 */
	private calculateScalability(
		results: Record<string, DatasetTestResult>,
		sizes: DatasetSize[]
	): DatasetComparisonReport['scalabilityAnalysis'] {
		const percentChange = (base: number, current: number): number => {
			if (base === 0) return 0;
			return ((current - base) / base) * 100;
		};

		const small = results['small'];
		const medium = results['medium'];
		const large = results['large'];

		return {
			loadAllTasks: {
				smallToMedium: medium
					? percentChange(
							small.operations.loadAllTasks.avgDuration,
							medium.operations.loadAllTasks.avgDuration
					  )
					: 0,
				mediumToLarge:
					medium && large
						? percentChange(
								medium.operations.loadAllTasks.avgDuration,
								large.operations.loadAllTasks.avgDuration
						  )
						: 0,
				smallToLarge: large
					? percentChange(
							small.operations.loadAllTasks.avgDuration,
							large.operations.loadAllTasks.avgDuration
					  )
					: 0
			},
			loadSingleTask: {
				smallToMedium: medium
					? percentChange(
							small.operations.loadSingleTask.avgDuration,
							medium.operations.loadSingleTask.avgDuration
					  )
					: 0,
				mediumToLarge:
					medium && large
						? percentChange(
								medium.operations.loadSingleTask.avgDuration,
								large.operations.loadSingleTask.avgDuration
						  )
						: 0,
				smallToLarge: large
					? percentChange(
							small.operations.loadSingleTask.avgDuration,
							large.operations.loadSingleTask.avgDuration
					  )
					: 0
			},
			fileIO: {
				smallToMedium: medium
					? percentChange(
							small.performanceReport.fileIO.total,
							medium.performanceReport.fileIO.total
					  )
					: 0,
				mediumToLarge:
					medium && large
						? percentChange(
								medium.performanceReport.fileIO.total,
								large.performanceReport.fileIO.total
						  )
						: 0,
				smallToLarge: large
					? percentChange(
							small.performanceReport.fileIO.total,
							large.performanceReport.fileIO.total
					  )
					: 0
			}
		};
	}

	/**
	 * Generate performance recommendations
	 */
	private generateRecommendations(
		results: Record<string, DatasetTestResult>,
		scalability: DatasetComparisonReport['scalabilityAnalysis']
	): string[] {
		const recommendations: string[] = [];

		// Check loadAllTasks scalability
		if (scalability.loadAllTasks.smallToLarge > 1000) {
			recommendations.push(
				'⚠️  LoadAllTasks shows poor scalability (>1000% increase). Consider implementing pagination or lazy loading.'
			);
		} else if (scalability.loadAllTasks.smallToLarge > 500) {
			recommendations.push(
				'⚠️  LoadAllTasks scalability is concerning (>500% increase). Monitor performance with larger datasets.'
			);
		} else {
			recommendations.push(
				'✓ LoadAllTasks scales acceptably across dataset sizes.'
			);
		}

		// Check loadSingleTask performance
		if (scalability.loadSingleTask.smallToLarge > 200) {
			recommendations.push(
				'⚠️  LoadSingleTask shows degradation with dataset size. Consider implementing an index or early-exit optimization.'
			);
		} else if (scalability.loadSingleTask.smallToLarge < 50) {
			recommendations.push(
				'✓ LoadSingleTask performance is excellent - likely already optimized.'
			);
		}

		// Check file I/O
		const largeResult = results['large'];
		if (largeResult && largeResult.performanceReport.fileIO.total > 1000) {
			recommendations.push(
				'⚠️  High file I/O count detected. Implement caching to reduce disk access.'
			);
		}

		// Check memory usage
		if (largeResult) {
			const memoryGrowth =
				largeResult.performanceReport.memory.peak.heapUsed -
				largeResult.performanceReport.memory.initial.heapUsed;
			if (memoryGrowth > 100 * 1024 * 1024) {
				// 100MB
				recommendations.push(
					'⚠️  Significant memory growth detected. Review memory management and consider streaming for large datasets.'
				);
			}
		}

		return recommendations;
	}

	/**
	 * Format test results as text report
	 */
	formatResults(result: DatasetTestResult): string {
		const lines: string[] = [];

		lines.push('='.repeat(80));
		lines.push(`DATASET SIZE TEST RESULTS: ${result.config.size.toUpperCase()}`);
		lines.push('='.repeat(80));
		lines.push('');

		// Dataset info
		lines.push(formatDatasetStats(result.datasetStats));
		lines.push('');

		// Operations
		lines.push('Operation Performance:');
		lines.push('');

		lines.push('Load All Tasks:');
		lines.push(`  Iterations: ${result.operations.loadAllTasks.iterations}`);
		lines.push(`  Average:    ${result.operations.loadAllTasks.avgDuration.toFixed(2)}ms`);
		lines.push(`  Min:        ${result.operations.loadAllTasks.minDuration.toFixed(2)}ms`);
		lines.push(`  Max:        ${result.operations.loadAllTasks.maxDuration.toFixed(2)}ms`);
		lines.push('');

		lines.push('Load Single Task:');
		lines.push(`  Iterations: ${result.operations.loadSingleTask.iterations}`);
		lines.push(`  Average:    ${result.operations.loadSingleTask.avgDuration.toFixed(2)}ms`);
		lines.push(`  Min:        ${result.operations.loadSingleTask.minDuration.toFixed(2)}ms`);
		lines.push(`  Max:        ${result.operations.loadSingleTask.maxDuration.toFixed(2)}ms`);
		lines.push('');

		lines.push('Load Subtask:');
		lines.push(`  Iterations: ${result.operations.loadSingleSubtask.iterations}`);
		lines.push(`  Average:    ${result.operations.loadSingleSubtask.avgDuration.toFixed(2)}ms`);
		lines.push(`  Min:        ${result.operations.loadSingleSubtask.minDuration.toFixed(2)}ms`);
		lines.push(`  Max:        ${result.operations.loadSingleSubtask.maxDuration.toFixed(2)}ms`);
		lines.push('');

		lines.push('Save Tasks:');
		lines.push(`  Iterations: ${result.operations.saveTasks.iterations}`);
		lines.push(`  Average:    ${result.operations.saveTasks.avgDuration.toFixed(2)}ms`);
		lines.push(`  Min:        ${result.operations.saveTasks.minDuration.toFixed(2)}ms`);
		lines.push(`  Max:        ${result.operations.saveTasks.maxDuration.toFixed(2)}ms`);
		lines.push('');

		// Performance metrics
		lines.push('Performance Metrics:');
		lines.push(`  Total File I/O: ${result.performanceReport.fileIO.total}`);
		lines.push(`  Cache Hit Rate: ${(result.performanceReport.cache.hitRate * 100).toFixed(2)}%`);
		lines.push(`  Peak Memory:    ${this.formatBytes(result.performanceReport.memory.peak.heapUsed)}`);
		lines.push('');

		lines.push('='.repeat(80));

		return lines.join('\n');
	}

	/**
	 * Format comparison report
	 */
	formatComparisonReport(report: DatasetComparisonReport): string {
		const lines: string[] = [];

		lines.push('='.repeat(80));
		lines.push('DATASET SIZE COMPARISON REPORT');
		lines.push('='.repeat(80));
		lines.push('');

		// Scalability analysis
		lines.push('Scalability Analysis:');
		lines.push('');

		lines.push('Load All Tasks (% change):');
		lines.push(`  Small → Medium: ${report.scalabilityAnalysis.loadAllTasks.smallToMedium.toFixed(1)}%`);
		lines.push(`  Medium → Large: ${report.scalabilityAnalysis.loadAllTasks.mediumToLarge.toFixed(1)}%`);
		lines.push(`  Small → Large:  ${report.scalabilityAnalysis.loadAllTasks.smallToLarge.toFixed(1)}%`);
		lines.push('');

		lines.push('Load Single Task (% change):');
		lines.push(`  Small → Medium: ${report.scalabilityAnalysis.loadSingleTask.smallToMedium.toFixed(1)}%`);
		lines.push(`  Medium → Large: ${report.scalabilityAnalysis.loadSingleTask.mediumToLarge.toFixed(1)}%`);
		lines.push(`  Small → Large:  ${report.scalabilityAnalysis.loadSingleTask.smallToLarge.toFixed(1)}%`);
		lines.push('');

		lines.push('File I/O (% change):');
		lines.push(`  Small → Medium: ${report.scalabilityAnalysis.fileIO.smallToMedium.toFixed(1)}%`);
		lines.push(`  Medium → Large: ${report.scalabilityAnalysis.fileIO.mediumToLarge.toFixed(1)}%`);
		lines.push(`  Small → Large:  ${report.scalabilityAnalysis.fileIO.smallToLarge.toFixed(1)}%`);
		lines.push('');

		// Recommendations
		lines.push('Recommendations:');
		for (const rec of report.recommendations) {
			lines.push(`  ${rec}`);
		}
		lines.push('');

		lines.push('='.repeat(80));

		return lines.join('\n');
	}

	private formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const k = 1024;
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
	}
}
