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
import { FileStorage } from '../../packages/tm-core/src/modules/storage/adapters/file-storage/file-storage.js';

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
		loadPaginated: {
			iterations: number;
			avgDuration: number;
			minDuration: number;
			maxDuration: number;
		};
		loadSingleTaskRepeated: {
			iterations: number;
			avgDuration: number;
			minDuration: number;
			maxDuration: number;
		};
		updateTaskStatus: {
			iterations: number;
			avgDuration: number;
			minDuration: number;
			maxDuration: number;
		};
		updateTaskMetadata: {
			iterations: number;
			avgDuration: number;
			minDuration: number;
			maxDuration: number;
		};
		updateSubtaskStatus: {
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
		updateTaskStatus: {
			smallToMedium: number;
			mediumToLarge: number;
			smallToLarge: number;
		};
		updateTaskMetadata: {
			smallToMedium: number;
			mediumToLarge: number;
			smallToLarge: number;
		};
		saveTasks: {
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
	private storage: FileStorage | null = null;

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

		// Initialize FileStorage
		this.storage = new FileStorage(this.testDir);
		await this.storage.initialize();

		// Start metrics collection
		this.metrics.reset();
		this.metrics.start();

		// Write initial dataset using FileStorage
		await this.metrics.measureAsync('initial-save', async () => {
			await this.storage!.saveTasks(tasks, 'master');
		});

		// Warmup iterations using FileStorage
		for (let i = 0; i < config.warmupIterations; i++) {
			await this.storage.loadTasks('master');
		}

		// Test: Load all tasks repeatedly
		const loadAllDurations: number[] = [];
		for (let i = 0; i < config.testIterations; i++) {
			const duration = await this.measureLoadAll();
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
				const duration = await this.measureLoadSingle(taskId);
				loadSingleDurations.push(duration);
			}
		}

		// Test: Load subtasks
		const loadSubtaskDurations: number[] = [];
		const testSubtaskIds = ['1.1', '2.1', '3.1'];

		for (let i = 0; i < config.testIterations; i++) {
			for (const subtaskId of testSubtaskIds) {
				const duration = await this.measureLoadSubtask(subtaskId);
				loadSubtaskDurations.push(duration);
			}
		}

		// Test: Save tasks
		const saveDurations: number[] = [];
		for (let i = 0; i < Math.min(config.testIterations, 5); i++) {
			// Limit save iterations
			const duration = await this.measureSave(tasks);
			saveDurations.push(duration);
		}

		// Test: Paginated loading (100 tasks per page)
		const loadPaginatedDurations: number[] = [];
		for (let i = 0; i < config.testIterations; i++) {
			const duration = await this.measureLoadPaginated(100);
			loadPaginatedDurations.push(duration);
		}

		// Test: Repeated single task lookups (tests index performance)
		const repeatedTaskId = tasks[0]?.id;
		const loadRepeatedDurations: number[] = [];
		if (repeatedTaskId) {
			for (let i = 0; i < config.testIterations * 3; i++) {
				const duration = await this.measureLoadSingle(String(repeatedTaskId));
				loadRepeatedDurations.push(duration);
			}
		}

		// Test: Update task status
		const updateStatusDurations: number[] = [];
		const statusUpdates: Array<'pending' | 'in-progress' | 'done'> = ['in-progress', 'done', 'pending'];
		for (let i = 0; i < config.testIterations; i++) {
			for (const taskId of testTaskIds) {
				const status = statusUpdates[i % statusUpdates.length];
				const duration = await this.measureUpdateStatus(taskId, status);
				updateStatusDurations.push(duration);
			}
		}

		// Test: Update task metadata
		const updateMetadataDurations: number[] = [];
		for (let i = 0; i < config.testIterations; i++) {
			for (const taskId of testTaskIds) {
				const duration = await this.measureUpdateMetadata(taskId, {
					priority: i % 2 === 0 ? 'high' : 'low',
					tags: [`tag-${i}`]
				});
				updateMetadataDurations.push(duration);
			}
		}

		// Test: Update subtask status
		const updateSubtaskStatusDurations: number[] = [];
		for (let i = 0; i < config.testIterations; i++) {
			for (const subtaskId of testSubtaskIds) {
				const status = statusUpdates[i % statusUpdates.length];
				const duration = await this.measureUpdateSubtaskStatus(subtaskId, status);
				updateSubtaskStatusDurations.push(duration);
			}
		}

		// Stop metrics collection
		this.metrics.stop();

		// Get cache metrics from FileStorage
		if (this.storage) {
			const cacheMetrics = this.storage.getCacheMetrics();
			this.metrics.recordCacheStats(cacheMetrics.hits, cacheMetrics.misses);
		}

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
				},
				loadPaginated: {
					iterations: loadPaginatedDurations.length,
					avgDuration:
						loadPaginatedDurations.length > 0
							? loadPaginatedDurations.reduce((a, b) => a + b, 0) /
							  loadPaginatedDurations.length
							: 0,
					minDuration: loadPaginatedDurations.length > 0 ? Math.min(...loadPaginatedDurations) : 0,
					maxDuration: loadPaginatedDurations.length > 0 ? Math.max(...loadPaginatedDurations) : 0
				},
				loadSingleTaskRepeated: {
					iterations: loadRepeatedDurations.length,
					avgDuration:
						loadRepeatedDurations.length > 0
							? loadRepeatedDurations.reduce((a, b) => a + b, 0) /
							  loadRepeatedDurations.length
							: 0,
					minDuration: loadRepeatedDurations.length > 0 ? Math.min(...loadRepeatedDurations) : 0,
					maxDuration: loadRepeatedDurations.length > 0 ? Math.max(...loadRepeatedDurations) : 0
				},
				updateTaskStatus: {
					iterations: updateStatusDurations.length,
					avgDuration:
						updateStatusDurations.length > 0
							? updateStatusDurations.reduce((a, b) => a + b, 0) /
							  updateStatusDurations.length
							: 0,
					minDuration: updateStatusDurations.length > 0 ? Math.min(...updateStatusDurations) : 0,
					maxDuration: updateStatusDurations.length > 0 ? Math.max(...updateStatusDurations) : 0
				},
				updateTaskMetadata: {
					iterations: updateMetadataDurations.length,
					avgDuration:
						updateMetadataDurations.length > 0
							? updateMetadataDurations.reduce((a, b) => a + b, 0) /
							  updateMetadataDurations.length
							: 0,
					minDuration: updateMetadataDurations.length > 0 ? Math.min(...updateMetadataDurations) : 0,
					maxDuration: updateMetadataDurations.length > 0 ? Math.max(...updateMetadataDurations) : 0
				},
				updateSubtaskStatus: {
					iterations: updateSubtaskStatusDurations.length,
					avgDuration:
						updateSubtaskStatusDurations.length > 0
							? updateSubtaskStatusDurations.reduce((a, b) => a + b, 0) /
							  updateSubtaskStatusDurations.length
							: 0,
					minDuration: updateSubtaskStatusDurations.length > 0 ? Math.min(...updateSubtaskStatusDurations) : 0,
					maxDuration: updateSubtaskStatusDurations.length > 0 ? Math.max(...updateSubtaskStatusDurations) : 0
				}
			}
		};

		return result;
	}

	/**
	 * Measure time to load all tasks
	 */
	private async measureLoadAll(): Promise<number> {
		if (!this.storage) throw new Error('Storage not initialized');
		const start = performance.now();
		await this.storage.loadTasks('master');
		return performance.now() - start;
	}

	/**
	 * Measure time to load a single task
	 */
	private async measureLoadSingle(taskId: string): Promise<number> {
		if (!this.storage) throw new Error('Storage not initialized');
		const start = performance.now();
		await this.storage.loadTask(taskId, 'master');
		return performance.now() - start;
	}

	/**
	 * Measure time to load a subtask
	 */
	private async measureLoadSubtask(subtaskId: string): Promise<number> {
		if (!this.storage) throw new Error('Storage not initialized');
		const start = performance.now();
		await this.storage.loadTask(subtaskId, 'master');
		return performance.now() - start;
	}

	/**
	 * Measure time to save tasks
	 */
	private async measureSave(tasks: Task[]): Promise<number> {
		if (!this.storage) throw new Error('Storage not initialized');
		const start = performance.now();
		await this.storage.saveTasks(tasks, 'master');
		return performance.now() - start;
	}

	/**
	 * Measure time to load tasks with pagination
	 */
	private async measureLoadPaginated(pageSize: number): Promise<number> {
		if (!this.storage) throw new Error('Storage not initialized');
		const start = performance.now();
		
		// Load all tasks in paginated batches
		let offset = 0;
		let totalLoaded = 0;
		
		while (true) {
			const batch = await this.storage.loadTasks('master', {
				limit: pageSize,
				offset: offset
			});
			
			if (batch.length === 0) break;
			
			totalLoaded += batch.length;
			offset += pageSize;
		}
		
		return performance.now() - start;
	}

	/**
	 * Measure time to update task status
	 */
	private async measureUpdateStatus(
		taskId: string,
		status: 'pending' | 'in-progress' | 'done'
	): Promise<number> {
		if (!this.storage) throw new Error('Storage not initialized');
		const start = performance.now();
		await this.storage.updateTaskStatus(taskId, status, 'master');
		return performance.now() - start;
	}

	/**
	 * Measure time to update task metadata
	 */
	private async measureUpdateMetadata(
		taskId: string,
		updates: { priority?: 'low' | 'medium' | 'high' | 'critical'; tags?: string[] }
	): Promise<number> {
		if (!this.storage) throw new Error('Storage not initialized');
		const start = performance.now();
		await this.storage.updateTask(taskId, updates, 'master');
		return performance.now() - start;
	}

	/**
	 * Measure time to update subtask status
	 */
	private async measureUpdateSubtaskStatus(
		subtaskId: string,
		status: 'pending' | 'in-progress' | 'done'
	): Promise<number> {
		if (!this.storage) throw new Error('Storage not initialized');
		const start = performance.now();
		await this.storage.updateTaskStatus(subtaskId, status, 'master');
		return performance.now() - start;
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
			updateTaskStatus: {
				smallToMedium: medium
					? percentChange(
							small.operations.updateTaskStatus.avgDuration,
							medium.operations.updateTaskStatus.avgDuration
					  )
					: 0,
				mediumToLarge:
					medium && large
						? percentChange(
								medium.operations.updateTaskStatus.avgDuration,
								large.operations.updateTaskStatus.avgDuration
						  )
						: 0,
				smallToLarge: large
					? percentChange(
							small.operations.updateTaskStatus.avgDuration,
							large.operations.updateTaskStatus.avgDuration
					  )
					: 0
			},
			updateTaskMetadata: {
				smallToMedium: medium
					? percentChange(
							small.operations.updateTaskMetadata.avgDuration,
							medium.operations.updateTaskMetadata.avgDuration
					  )
					: 0,
				mediumToLarge:
					medium && large
						? percentChange(
								medium.operations.updateTaskMetadata.avgDuration,
								large.operations.updateTaskMetadata.avgDuration
						  )
						: 0,
				smallToLarge: large
					? percentChange(
							small.operations.updateTaskMetadata.avgDuration,
							large.operations.updateTaskMetadata.avgDuration
					  )
					: 0
			},
			saveTasks: {
				smallToMedium: medium
					? percentChange(
							small.operations.saveTasks.avgDuration,
							medium.operations.saveTasks.avgDuration
					  )
					: 0,
				mediumToLarge:
					medium && large
						? percentChange(
								medium.operations.saveTasks.avgDuration,
								large.operations.saveTasks.avgDuration
						  )
						: 0,
				smallToLarge: large
					? percentChange(
							small.operations.saveTasks.avgDuration,
							large.operations.saveTasks.avgDuration
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

		// Check loadAllTasks scalability with pagination comparison
		const largeResult = results['large'];
		const smallResult = results['small'];
		
		// Check if performance is near-zero (excellent caching)
		const largeLoadTime = largeResult?.operations.loadAllTasks.avgDuration || 0;
		const smallLoadTime = smallResult?.operations.loadAllTasks.avgDuration || 0;
		
		if (largeLoadTime < 1 && smallLoadTime < 1) {
			recommendations.push(
				'✓ LoadAllTasks performance is excellent across all dataset sizes (cache hit rate ~100%).'
			);
		} else if (scalability.loadAllTasks.smallToLarge > 1000) {
			// Compare with paginated loading
			if (largeResult) {
				const paginatedAvg = largeResult.operations.loadPaginated.avgDuration;
				const allAtOnceAvg = largeResult.operations.loadAllTasks.avgDuration;
				
				if (paginatedAvg > 0 && allAtOnceAvg > 0 && paginatedAvg < allAtOnceAvg) {
					const improvement = ((allAtOnceAvg - paginatedAvg) / allAtOnceAvg * 100).toFixed(1);
					recommendations.push(
						`✓ Pagination reduces load time by ${improvement}% for large datasets. Use { limit, offset } options.`
					);
				} else {
					recommendations.push(
						'⚠️  LoadAllTasks shows poor scalability (>1000% increase). Consider implementing pagination or lazy loading.'
					);
				}
			}
		} else if (scalability.loadAllTasks.smallToLarge > 500) {
			recommendations.push(
				'⚠️  LoadAllTasks scalability is concerning (>500% increase). Monitor performance with larger datasets.'
			);
		} else {
			recommendations.push(
				'✓ LoadAllTasks scales acceptably across dataset sizes.'
			);
		}

		// Check loadSingleTask performance with index benefit
		if (largeResult && largeResult.operations.loadSingleTaskRepeated.iterations > 0) {
			const firstLoad = largeResult.operations.loadSingleTask.avgDuration;
			const repeatedLoad = largeResult.operations.loadSingleTaskRepeated.avgDuration;
			const cacheHitRate = largeResult.performanceReport.cache.hitRate;
			
			if (firstLoad > 0 && repeatedLoad >= 0) {
				const indexSpeedup = ((firstLoad - repeatedLoad) / firstLoad * 100).toFixed(1);
				
				if (repeatedLoad < firstLoad * 0.5) {
					recommendations.push(
						`✓ Task index provides ${indexSpeedup}% speedup on repeated lookups.`
					);
				} else if (repeatedLoad < 1 && firstLoad < 1) {
					recommendations.push(
						'✓ Task lookup performance is excellent (cache hit rate ~100%).'
					);
				} else if (scalability.loadSingleTask.smallToLarge > 200) {
					// Check if it's a cache issue
					if (cacheHitRate < 0.85) {
						const targetCacheSize = Math.ceil(largeResult.datasetStats.totalTasks * 1.5);
						recommendations.push(
							`⚠️  LoadSingleTask degradation (${scalability.loadSingleTask.smallToLarge.toFixed(0)}%) due to low cache hit rate (${(cacheHitRate * 100).toFixed(1)}%). Increase cache from 500 to ${targetCacheSize} entries.`
						);
					} else {
						recommendations.push(
							`⚠️  LoadSingleTask shows ${scalability.loadSingleTask.smallToLarge.toFixed(0)}% degradation. Index provides ${indexSpeedup}% speedup but file I/O dominates. Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%.`
						);
					}
				}
			}
		} else if (scalability.loadSingleTask.smallToLarge > 200) {
			recommendations.push(
				'⚠️  LoadSingleTask shows degradation with dataset size. Consider implementing an index or early-exit optimization.'
			);
		} else if (scalability.loadSingleTask.smallToLarge < 50) {
			recommendations.push(
				'✓ LoadSingleTask performance is excellent - likely already optimized.'
			);
		}

		// Check memory usage with actionable advice
		if (largeResult) {
			const memoryGrowth =
				largeResult.performanceReport.memory.peak.heapUsed -
				largeResult.performanceReport.memory.initial.heapUsed;
			const peakMB = (largeResult.performanceReport.memory.peak.heapUsed / (1024 * 1024)).toFixed(0);
			
			if (memoryGrowth > 200 * 1024 * 1024) {
				// 200MB growth
				recommendations.push(
					`⚠️  Significant memory usage (${peakMB} MB peak). Consider pagination for datasets >10K items or increase maxMemory cache limit.`
				);
			} else if (memoryGrowth > 100 * 1024 * 1024) {
				// 100MB growth
				recommendations.push(
					`✓ Memory usage acceptable (${peakMB} MB peak) for ${largeResult.datasetStats.totalItems} items.`
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

		if (result.operations.loadPaginated.iterations > 0) {
			lines.push('Load Paginated (100 per page):');
			lines.push(`  Iterations: ${result.operations.loadPaginated.iterations}`);
			lines.push(`  Average:    ${result.operations.loadPaginated.avgDuration.toFixed(2)}ms`);
			lines.push(`  Min:        ${result.operations.loadPaginated.minDuration.toFixed(2)}ms`);
			lines.push(`  Max:        ${result.operations.loadPaginated.maxDuration.toFixed(2)}ms`);
			const improvement = result.operations.loadAllTasks.avgDuration > 0
				? ((result.operations.loadAllTasks.avgDuration - result.operations.loadPaginated.avgDuration) / 
				   result.operations.loadAllTasks.avgDuration * 100).toFixed(1)
				: '0';
			lines.push(`  vs Load All: ${improvement}% faster`);
			lines.push('');
		}

		if (result.operations.loadSingleTaskRepeated.iterations > 0) {
			lines.push('Load Single Task (Repeated - tests index):');
			lines.push(`  Iterations: ${result.operations.loadSingleTaskRepeated.iterations}`);
			lines.push(`  Average:    ${result.operations.loadSingleTaskRepeated.avgDuration.toFixed(2)}ms`);
			lines.push(`  Min:        ${result.operations.loadSingleTaskRepeated.minDuration.toFixed(2)}ms`);
			lines.push(`  Max:        ${result.operations.loadSingleTaskRepeated.maxDuration.toFixed(2)}ms`);
			const speedup = result.operations.loadSingleTask.avgDuration > 0
				? ((result.operations.loadSingleTask.avgDuration - result.operations.loadSingleTaskRepeated.avgDuration) / 
				   result.operations.loadSingleTask.avgDuration * 100).toFixed(1)
				: '0';
			lines.push(`  Index Speedup: ${speedup}%`);
			lines.push('');
		}

		if (result.operations.updateTaskStatus.iterations > 0) {
			lines.push('Update Task Status:');
			lines.push(`  Iterations: ${result.operations.updateTaskStatus.iterations}`);
			lines.push(`  Average:    ${result.operations.updateTaskStatus.avgDuration.toFixed(2)}ms`);
			lines.push(`  Min:        ${result.operations.updateTaskStatus.minDuration.toFixed(2)}ms`);
			lines.push(`  Max:        ${result.operations.updateTaskStatus.maxDuration.toFixed(2)}ms`);
			lines.push('');
		}

		if (result.operations.updateTaskMetadata.iterations > 0) {
			lines.push('Update Task Metadata:');
			lines.push(`  Iterations: ${result.operations.updateTaskMetadata.iterations}`);
			lines.push(`  Average:    ${result.operations.updateTaskMetadata.avgDuration.toFixed(2)}ms`);
			lines.push(`  Min:        ${result.operations.updateTaskMetadata.minDuration.toFixed(2)}ms`);
			lines.push(`  Max:        ${result.operations.updateTaskMetadata.maxDuration.toFixed(2)}ms`);
			lines.push('');
		}

		if (result.operations.updateSubtaskStatus.iterations > 0) {
			lines.push('Update Subtask Status:');
			lines.push(`  Iterations: ${result.operations.updateSubtaskStatus.iterations}`);
			lines.push(`  Average:    ${result.operations.updateSubtaskStatus.avgDuration.toFixed(2)}ms`);
			lines.push(`  Min:        ${result.operations.updateSubtaskStatus.minDuration.toFixed(2)}ms`);
			lines.push(`  Max:        ${result.operations.updateSubtaskStatus.maxDuration.toFixed(2)}ms`);
			lines.push('');
		}

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

		lines.push('Update Task Status (% change):');
		lines.push(`  Small → Medium: ${report.scalabilityAnalysis.updateTaskStatus.smallToMedium.toFixed(1)}%`);
		lines.push(`  Medium → Large: ${report.scalabilityAnalysis.updateTaskStatus.mediumToLarge.toFixed(1)}%`);
		lines.push(`  Small → Large:  ${report.scalabilityAnalysis.updateTaskStatus.smallToLarge.toFixed(1)}%`);
		lines.push('');

		lines.push('Update Task Metadata (% change):');
		lines.push(`  Small → Medium: ${report.scalabilityAnalysis.updateTaskMetadata.smallToMedium.toFixed(1)}%`);
		lines.push(`  Medium → Large: ${report.scalabilityAnalysis.updateTaskMetadata.mediumToLarge.toFixed(1)}%`);
		lines.push(`  Small → Large:  ${report.scalabilityAnalysis.updateTaskMetadata.smallToLarge.toFixed(1)}%`);
		lines.push('');

		lines.push('Save Tasks (% change):');
		lines.push(`  Small → Medium: ${report.scalabilityAnalysis.saveTasks.smallToMedium.toFixed(1)}%`);
		lines.push(`  Medium → Large: ${report.scalabilityAnalysis.saveTasks.mediumToLarge.toFixed(1)}%`);
		lines.push(`  Small → Large:  ${report.scalabilityAnalysis.saveTasks.smallToLarge.toFixed(1)}%`);
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
