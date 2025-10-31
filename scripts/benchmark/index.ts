#!/usr/bin/env node
/**
 * @fileoverview Main entry point for performance benchmarking suite
 *
 * Usage:
 *   npm run benchmark             # Run all benchmarks
 *   npm run benchmark:dataset     # Run dataset size tests only
 *   npm run benchmark:workload    # Run workload simulations only
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatasetSizeTester } from './dataset-size-tester.js';
import { WorkloadSimulator, WORKLOAD_PATTERNS, type WorkloadPattern } from './workload-simulator.js';
import type { DatasetSize } from './dataset-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main benchmark runner
 */
class BenchmarkRunner {
	private resultsDir: string;
	private testDir: string;

	constructor() {
		this.resultsDir = path.join(__dirname, '../../benchmark-results');
		this.testDir = path.join(__dirname, '../../benchmark-test-data');
	}

	/**
	 * Setup benchmark environment
	 */
	async setup(): Promise<void> {
		await fs.mkdir(this.resultsDir, { recursive: true });
		await fs.mkdir(this.testDir, { recursive: true });
	}

	/**
	 * Run dataset size benchmarks
	 */
	async runDatasetBenchmarks(): Promise<void> {
		console.log('\n' + '='.repeat(80));
		console.log('DATASET SIZE BENCHMARKS');
		console.log('='.repeat(80));

		const tester = new DatasetSizeTester(this.testDir);
		const sizes: DatasetSize[] = ['small', 'medium', 'large'];

		const report = await tester.runComparisonTests(sizes, 10, 3);

		// Save results
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const jsonPath = path.join(
			this.resultsDir,
			`dataset-benchmark-${timestamp}.json`
		);
		const textPath = path.join(
			this.resultsDir,
			`dataset-benchmark-${timestamp}.txt`
		);

		await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

		const textReport = this.formatDatasetReport(tester, report);
		await fs.writeFile(textPath, textReport);

		console.log('\n' + tester.formatComparisonReport(report));
		console.log(`\nResults saved to:`);
		console.log(`  JSON: ${jsonPath}`);
		console.log(`  Text: ${textPath}`);
	}

	/**
	 * Run workload simulations
	 */
	async runWorkloadBenchmarks(): Promise<void> {
		console.log('\n' + '='.repeat(80));
		console.log('WORKLOAD SIMULATIONS');
		console.log('='.repeat(80));

		const simulator = new WorkloadSimulator(this.testDir);
		const patterns: WorkloadPattern[] = [
			'cli-list',
			'cli-show',
			'cli-update',
			'mcp-mixed',
			'heavy-read'
		];

		const report = await simulator.runWorkloadComparison(
			patterns,
			5000, // 5 seconds per pattern
			'medium'
		);

		// Save results
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const jsonPath = path.join(
			this.resultsDir,
			`workload-benchmark-${timestamp}.json`
		);
		const textPath = path.join(
			this.resultsDir,
			`workload-benchmark-${timestamp}.txt`
		);

		await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

		const textReport = this.formatWorkloadReport(simulator, report);
		await fs.writeFile(textPath, textReport);

		console.log('\n' + simulator.formatComparisonReport(report));
		console.log(`\nResults saved to:`);
		console.log(`  JSON: ${jsonPath}`);
		console.log(`  Text: ${textPath}`);
	}

	/**
	 * Run all benchmarks
	 */
	async runAll(): Promise<void> {
		await this.setup();

		try {
			await this.runDatasetBenchmarks();
			await this.runWorkloadBenchmarks();

			console.log('\n' + '='.repeat(80));
			console.log('ALL BENCHMARKS COMPLETED');
			console.log('='.repeat(80));
			console.log(`\nResults directory: ${this.resultsDir}`);
		} catch (error: any) {
			console.error('\n❌ Benchmark failed:', error.message);
			if (error.stack) {
				console.error(error.stack);
			}
			process.exit(1);
		}
	}

	/**
	 * Format dataset benchmark report
	 */
	private formatDatasetReport(
		tester: DatasetSizeTester,
		report: any
	): string {
		const lines: string[] = [];

		lines.push('DATASET SIZE BENCHMARK REPORT');
		lines.push('Generated: ' + new Date().toISOString());
		lines.push('='.repeat(80));
		lines.push('');

		for (const [size, result] of Object.entries(report.results)) {
			lines.push(tester.formatResults(result as any));
			lines.push('');
		}

		lines.push(tester.formatComparisonReport(report));

		return lines.join('\n');
	}

	/**
	 * Format workload benchmark report
	 */
	private formatWorkloadReport(
		simulator: WorkloadSimulator,
		report: any
	): string {
		const lines: string[] = [];

		lines.push('WORKLOAD SIMULATION BENCHMARK REPORT');
		lines.push('Generated: ' + new Date().toISOString());
		lines.push('='.repeat(80));
		lines.push('');

		for (const [pattern, result] of Object.entries(report.results)) {
			lines.push(simulator.formatResult(result as any));
			lines.push('');
		}

		lines.push(simulator.formatComparisonReport(report));

		return lines.join('\n');
	}
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

const runner = new BenchmarkRunner();

(async () => {
	switch (command) {
		case 'dataset':
			await runner.setup();
			await runner.runDatasetBenchmarks();
			break;
		case 'workload':
			await runner.setup();
			await runner.runWorkloadBenchmarks();
			break;
		default:
			await runner.runAll();
	}
})();
