/**
 * @fileoverview Realistic Workload Simulation Suite
 *
 * Simulates real-world usage patterns for Task Master including:
 * - CLI repeated command patterns (list, show, update status)
 * - MCP tool usage patterns (get_tasks, get_task, set_task_status)
 * - Mixed workload scenarios
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PerformanceMetrics, type PerformanceReport } from './performance-metrics.js';
import { generateDatasetBySize, type DatasetSize } from './dataset-generator.js';
import type { Task } from '../../packages/tm-core/src/common/types/index.js';

/**
 * Workload pattern types
 */
export type WorkloadPattern = 'cli-list' | 'cli-show' | 'cli-update' | 'mcp-mixed' | 'heavy-read' | 'heavy-write';

/**
 * Workload configuration
 */
export interface WorkloadConfig {
	name: string;
	pattern: WorkloadPattern;
	duration: number; // Duration in milliseconds
	datasetSize: DatasetSize;
	description: string;
	operations: {
		listTasks: number;
		showTask: number;
		updateStatus: number;
		saveTasks: number;
	};
}

/**
 * Workload test result
 */
export interface WorkloadResult {
	config: WorkloadConfig;
	performanceReport: PerformanceReport;
	operations: {
		executed: number;
		errored: number;
		successRate: number;
	};
	throughput: {
		operationsPerSecond: number;
		avgResponseTime: number;
	};
}

/**
 * Predefined workload patterns
 */
export const WORKLOAD_PATTERNS: Record<string, Omit<WorkloadConfig, 'duration' | 'datasetSize'>> = {
	'cli-list': {
		name: 'CLI List Pattern',
		pattern: 'cli-list',
		description: 'Repeated task-master list commands (common user workflow)',
		operations: {
			listTasks: 80,
			showTask: 15,
			updateStatus: 5,
			saveTasks: 0
		}
	},
	'cli-show': {
		name: 'CLI Show Pattern',
		pattern: 'cli-show',
		description: 'Frequent task-master show <id> commands (detailed task inspection)',
		operations: {
			listTasks: 20,
			showTask: 70,
			updateStatus: 10,
			saveTasks: 0
		}
	},
	'cli-update': {
		name: 'CLI Update Pattern',
		pattern: 'cli-update',
		description: 'Active development with frequent status updates',
		operations: {
			listTasks: 30,
			showTask: 20,
			updateStatus: 40,
			saveTasks: 10
		}
	},
	'mcp-mixed': {
		name: 'MCP Mixed Pattern',
		pattern: 'mcp-mixed',
		description: 'MCP server usage with balanced operations',
		operations: {
			listTasks: 40,
			showTask: 40,
			updateStatus: 15,
			saveTasks: 5
		}
	},
	'heavy-read': {
		name: 'Heavy Read Pattern',
		pattern: 'heavy-read',
		description: 'Read-heavy workload (analysis, reporting)',
		operations: {
			listTasks: 60,
			showTask: 40,
			updateStatus: 0,
			saveTasks: 0
		}
	},
	'heavy-write': {
		name: 'Heavy Write Pattern',
		pattern: 'heavy-write',
		description: 'Write-heavy workload (rapid task updates)',
		operations: {
			listTasks: 10,
			showTask: 10,
			updateStatus: 60,
			saveTasks: 20
		}
	}
};

/**
 * Workload Simulator
 */
export class WorkloadSimulator {
	private testDir: string;
	private metrics: PerformanceMetrics;
	private tasks: Task[] = [];
	private testFilePath: string = '';

	/**
	 * Create a new workload simulator
	 * @param testDir - Directory for test data files
	 */
	constructor(testDir: string) {
		this.testDir = testDir;
		this.metrics = new PerformanceMetrics(50);
	}

	/**
	 * Setup simulator
	 */
	async setup(datasetSize: DatasetSize): Promise<void> {
		// Create test directory
		await fs.mkdir(this.testDir, { recursive: true });

		// Generate dataset
		this.tasks = generateDatasetBySize(datasetSize);

		// Create test file
		this.testFilePath = path.join(this.testDir, `workload-test-${datasetSize}.json`);
		await this.saveTasks();
	}

	/**
	 * Cleanup simulator
	 */
	async cleanup(): Promise<void> {
		try {
			if (this.testFilePath) {
				await fs.unlink(this.testFilePath);
			}
		} catch (error) {
			// Ignore cleanup errors
		}
	}

	/**
	 * Run workload simulation
	 */
	async runWorkload(config: WorkloadConfig): Promise<WorkloadResult> {
		await this.setup(config.datasetSize);

		this.metrics.reset();
		this.metrics.start();

		const startTime = Date.now();
		let totalOperations = 0;
		let erroredOperations = 0;

		// Calculate total operations from percentages
		const totalPercentage =
			config.operations.listTasks +
			config.operations.showTask +
			config.operations.updateStatus +
			config.operations.saveTasks;

		// Run workload for the specified duration
		while (Date.now() - startTime < config.duration) {
			// Select operation based on percentage weights
			const rand = Math.random() * totalPercentage;
			let cumulative = 0;

			try {
				if (rand < (cumulative += config.operations.listTasks)) {
					await this.executeListTasks();
				} else if (rand < (cumulative += config.operations.showTask)) {
					await this.executeShowTask();
				} else if (rand < (cumulative += config.operations.updateStatus)) {
					await this.executeUpdateStatus();
				} else {
					await this.executeSaveTasks();
				}
				totalOperations++;
			} catch (error) {
				erroredOperations++;
				totalOperations++;
			}

			// Small delay to prevent CPU saturation
			await new Promise(resolve => setTimeout(resolve, 1));
		}

		this.metrics.stop();

		const performanceReport = this.metrics.generateReport();
		const actualDuration = Date.now() - startTime;

		await this.cleanup();

		return {
			config,
			performanceReport,
			operations: {
				executed: totalOperations,
				errored: erroredOperations,
				successRate: totalOperations > 0 ? (totalOperations - erroredOperations) / totalOperations : 0
			},
			throughput: {
				operationsPerSecond: totalOperations / (actualDuration / 1000),
				avgResponseTime: actualDuration / totalOperations
			}
		};
	}

	/**
	 * Execute list tasks operation (simulates FileStorage.loadTasks)
	 */
	private async executeListTasks(): Promise<void> {
		await this.metrics.measureAsync('list-tasks', async () => {
			const content = await fs.readFile(this.testFilePath, 'utf-8');
			this.metrics.recordFileIO('read', this.testFilePath);
			const data = JSON.parse(content);
			return data.tasks || [];
		});
	}

	/**
	 * Execute show task operation (simulates FileStorage.loadTask)
	 */
	private async executeShowTask(): Promise<void> {
		// Pick random task ID
		const randomIndex = Math.floor(Math.random() * this.tasks.length);
		const taskId = String(this.tasks[randomIndex].id);

		await this.metrics.measureAsync('show-task', async () => {
			const content = await fs.readFile(this.testFilePath, 'utf-8');
			this.metrics.recordFileIO('read', this.testFilePath);
			const data = JSON.parse(content);
			const tasks = data.tasks || [];
			return tasks.find((t: Task) => String(t.id) === taskId);
		});
	}

	/**
	 * Execute update status operation (simulates FileStorage.updateTaskStatus)
	 */
	private async executeUpdateStatus(): Promise<void> {
		// Pick random task ID
		const randomIndex = Math.floor(Math.random() * this.tasks.length);
		const taskId = String(this.tasks[randomIndex].id);
		const newStatus = ['pending', 'in-progress', 'done'][Math.floor(Math.random() * 3)];

		await this.metrics.measureAsync('update-status', async () => {
			// Read
			const content = await fs.readFile(this.testFilePath, 'utf-8');
			this.metrics.recordFileIO('read', this.testFilePath);
			const data = JSON.parse(content);

			// Update (in-memory only for simulation)
			const tasks = data.tasks || [];
			const task = tasks.find((t: Task) => String(t.id) === taskId);
			if (task) {
				task.status = newStatus as any;
			}

			// Note: We don't actually write back to avoid slowing down the simulation
			// In real usage, this would be a write operation
		});
	}

	/**
	 * Execute save tasks operation (simulates FileStorage.saveTasks)
	 */
	private async executeSaveTasks(): Promise<void> {
		await this.metrics.measureAsync('save-tasks', async () => {
			await this.saveTasks();
		});
	}

	/**
	 * Save tasks to file
	 */
	private async saveTasks(): Promise<void> {
		const data = {
			tasks: this.tasks,
			metadata: {
				version: '1.0.0',
				lastModified: new Date().toISOString(),
				taskCount: this.tasks.length,
				completedCount: this.tasks.filter(t => t.status === 'done').length,
				tags: ['master']
			}
		};
		await fs.writeFile(this.testFilePath, JSON.stringify(data, null, 2), 'utf-8');
		this.metrics.recordFileIO('write', this.testFilePath);
	}

	/**
	 * Run multiple workload patterns and generate comparison
	 */
	async runWorkloadComparison(
		patterns: WorkloadPattern[],
		duration: number,
		datasetSize: DatasetSize
	): Promise<WorkloadComparisonReport> {
		const results: Record<string, WorkloadResult> = {};

		for (const pattern of patterns) {
			const baseConfig = WORKLOAD_PATTERNS[pattern];
			const config: WorkloadConfig = {
				...baseConfig,
				duration,
				datasetSize
			};

			console.log(`\nRunning ${baseConfig.name}...`);
			results[pattern] = await this.runWorkload(config);
			console.log(`✓ Completed ${baseConfig.name}`);
		}

		return {
			results: results as Record<WorkloadPattern, WorkloadResult>,
			summary: this.generateComparisonSummary(results)
		};
	}

	/**
	 * Generate comparison summary
	 */
	private generateComparisonSummary(
		results: Record<string, WorkloadResult>
	): WorkloadComparisonSummary {
		const patterns = Object.keys(results);

		// Find best and worst performers
		let bestThroughput = { pattern: '', value: 0 };
		let worstThroughput = { pattern: '', value: Infinity };
		let bestResponseTime = { pattern: '', value: Infinity };
		let worstResponseTime = { pattern: '', value: 0 };

		for (const [pattern, result] of Object.entries(results)) {
			if (result.throughput.operationsPerSecond > bestThroughput.value) {
				bestThroughput = { pattern, value: result.throughput.operationsPerSecond };
			}
			if (result.throughput.operationsPerSecond < worstThroughput.value) {
				worstThroughput = { pattern, value: result.throughput.operationsPerSecond };
			}
			if (result.throughput.avgResponseTime < bestResponseTime.value) {
				bestResponseTime = { pattern, value: result.throughput.avgResponseTime };
			}
			if (result.throughput.avgResponseTime > worstResponseTime.value) {
				worstResponseTime = { pattern, value: result.throughput.avgResponseTime };
			}
		}

		return {
			bestThroughput,
			worstThroughput,
			bestResponseTime,
			worstResponseTime,
			recommendations: this.generateWorkloadRecommendations(results)
		};
	}

	/**
	 * Generate recommendations based on workload results
	 */
	private generateWorkloadRecommendations(results: Record<string, WorkloadResult>): string[] {
		const recommendations: string[] = [];

		for (const [pattern, result] of Object.entries(results)) {
			const config = result.config;

			// Check success rate
			if (result.operations.successRate < 0.95) {
				recommendations.push(
					`⚠️  ${config.name}: Low success rate (${(result.operations.successRate * 100).toFixed(1)}%). Investigate error handling.`
				);
			}

			// Check throughput
			if (result.throughput.operationsPerSecond < 10) {
				recommendations.push(
					`⚠️  ${config.name}: Low throughput (${result.throughput.operationsPerSecond.toFixed(1)} ops/sec). Consider optimization.`
				);
			}

			// Check response time
			if (result.throughput.avgResponseTime > 100) {
				recommendations.push(
					`⚠️  ${config.name}: High avg response time (${result.throughput.avgResponseTime.toFixed(1)}ms). Implement caching.`
				);
			}

			// Check file I/O
			if (result.performanceReport.fileIO.total > result.operations.executed * 2) {
				recommendations.push(
					`⚠️  ${config.name}: High file I/O ratio. Caching could reduce disk access.`
				);
			}

			// Check cache effectiveness for read-heavy patterns
			if (config.operations.listTasks + config.operations.showTask > 60) {
				const cacheHitRate = result.performanceReport.cache.hitRate;
				if (cacheHitRate < 0.5) {
					recommendations.push(
						`⚠️  ${config.name}: Read-heavy pattern with low cache hit rate (${(cacheHitRate * 100).toFixed(1)}%). Increase cache size or TTL.`
					);
				} else if (cacheHitRate > 0.8) {
					recommendations.push(
						`✓ ${config.name}: Excellent cache hit rate (${(cacheHitRate * 100).toFixed(1)}%).`
					);
				}
			}
		}

		if (recommendations.length === 0) {
			recommendations.push('✓ All workload patterns performing within acceptable parameters.');
		}

		return recommendations;
	}

	/**
	 * Format workload result as text
	 */
	formatResult(result: WorkloadResult): string {
		const lines: string[] = [];

		lines.push('='.repeat(80));
		lines.push(`WORKLOAD SIMULATION RESULT: ${result.config.name.toUpperCase()}`);
		lines.push('='.repeat(80));
		lines.push('');

		// Configuration
		lines.push('Configuration:');
		lines.push(`  Pattern:      ${result.config.pattern}`);
		lines.push(`  Dataset Size: ${result.config.datasetSize}`);
		lines.push(`  Duration:     ${result.config.duration}ms`);
		lines.push(`  Description:  ${result.config.description}`);
		lines.push('');

		// Operations
		lines.push('Operations:');
		lines.push(`  Total Executed: ${result.operations.executed}`);
		lines.push(`  Errors:         ${result.operations.errored}`);
		lines.push(`  Success Rate:   ${(result.operations.successRate * 100).toFixed(2)}%`);
		lines.push('');

		// Throughput
		lines.push('Throughput:');
		lines.push(`  Operations/sec: ${result.throughput.operationsPerSecond.toFixed(2)}`);
		lines.push(`  Avg Response:   ${result.throughput.avgResponseTime.toFixed(2)}ms`);
		lines.push('');

		// Performance
		lines.push('Performance Metrics:');
		lines.push(`  File I/O:       ${result.performanceReport.fileIO.total}`);
		lines.push(`  Cache Hit Rate: ${(result.performanceReport.cache.hitRate * 100).toFixed(2)}%`);
		lines.push(`  Peak Memory:    ${this.formatBytes(result.performanceReport.memory.peak.heapUsed)}`);
		lines.push('');

		// Timing breakdown
		if (Object.keys(result.performanceReport.timings).length > 0) {
			lines.push('Operation Timings:');
			for (const [op, stats] of Object.entries(result.performanceReport.timings)) {
				lines.push(`  ${op}:`);
				lines.push(`    Count: ${stats.count}`);
				lines.push(`    Mean:  ${stats.mean.toFixed(2)}ms`);
				lines.push(`    P95:   ${stats.p95.toFixed(2)}ms`);
			}
			lines.push('');
		}

		lines.push('='.repeat(80));

		return lines.join('\n');
	}

	/**
	 * Format comparison report as text
	 */
	formatComparisonReport(report: WorkloadComparisonReport): string {
		const lines: string[] = [];

		lines.push('='.repeat(80));
		lines.push('WORKLOAD COMPARISON REPORT');
		lines.push('='.repeat(80));
		lines.push('');

		// Summary
		lines.push('Performance Summary:');
		lines.push(`  Best Throughput:     ${report.summary.bestThroughput.pattern} (${report.summary.bestThroughput.value.toFixed(2)} ops/sec)`);
		lines.push(`  Worst Throughput:    ${report.summary.worstThroughput.pattern} (${report.summary.worstThroughput.value.toFixed(2)} ops/sec)`);
		lines.push(`  Best Response Time:  ${report.summary.bestResponseTime.pattern} (${report.summary.bestResponseTime.value.toFixed(2)}ms)`);
		lines.push(`  Worst Response Time: ${report.summary.worstResponseTime.pattern} (${report.summary.worstResponseTime.value.toFixed(2)}ms)`);
		lines.push('');

		// Recommendations
		lines.push('Recommendations:');
		for (const rec of report.summary.recommendations) {
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

/**
 * Workload comparison report
 */
export interface WorkloadComparisonReport {
	results: Record<WorkloadPattern, WorkloadResult>;
	summary: WorkloadComparisonSummary;
}

/**
 * Workload comparison summary
 */
export interface WorkloadComparisonSummary {
	bestThroughput: { pattern: string; value: number };
	worstThroughput: { pattern: string; value: number };
	bestResponseTime: { pattern: string; value: number };
	worstResponseTime: { pattern: string; value: number };
	recommendations: string[];
}
