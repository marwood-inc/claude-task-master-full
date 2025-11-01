/**
 * @fileoverview Pagination performance testing
 * Tests memory usage and performance when using pagination vs loading all tasks
 */

import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { FileStorage } from '../../packages/tm-core/src/modules/storage/adapters/file-storage/file-storage.js';
import { generateDatasetBySize, type DatasetSize } from './dataset-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PaginationTestResult {
	datasetSize: number;
	withoutPagination: {
		memoryMB: number;
		loadTimeMs: number;
		peakMemoryMB: number;
	};
	withPagination: {
		pageSize: number;
		memoryMB: number;
		loadTimeMs: number;
		peakMemoryMB: number;
		totalPages: number;
	};
	memorySavings: {
		absoluteMB: number;
		percentReduction: number;
	};
}

/**
 * Get memory usage in MB
 */
function getMemoryUsageMB(): number {
	const usage = process.memoryUsage();
	return usage.heapUsed / 1024 / 1024;
}

/**
 * Force garbage collection if available
 */
function forceGC(): void {
	if (global.gc) {
		global.gc();
	}
}

/**
 * Test loading tasks without pagination
 */
async function testWithoutPagination(storage: FileStorage): Promise<{
	memoryMB: number;
	loadTimeMs: number;
	peakMemoryMB: number;
	total: number;
}> {
	forceGC();
	const startMemory = getMemoryUsageMB();
	let peakMemory = startMemory;

	const startTime = performance.now();
	const tasks = await storage.loadTasks('master');
	const endTime = performance.now();

	const endMemory = getMemoryUsageMB();
	peakMemory = Math.max(peakMemory, endMemory);

	return {
		memoryMB: endMemory - startMemory,
		loadTimeMs: endTime - startTime,
		peakMemoryMB: peakMemory,
		total: tasks.length
	};
}

/**
 * Test loading tasks with pagination
 */
async function testWithPagination(
	storage: FileStorage,
	pageSize: number,
	totalTasks: number
): Promise<{
	memoryMB: number;
	loadTimeMs: number;
	peakMemoryMB: number;
	totalPages: number;
}> {
	forceGC();
	const startMemory = getMemoryUsageMB();
	let peakMemory = startMemory;

	const totalPages = Math.ceil(totalTasks / pageSize);
	const startTime = performance.now();

	// Load first page only (typical use case)
	await storage.loadTasks('master', {
		limit: pageSize,
		offset: 0
	});

	const endTime = performance.now();
	const endMemory = getMemoryUsageMB();
	peakMemory = Math.max(peakMemory, endMemory);

	return {
		memoryMB: endMemory - startMemory,
		loadTimeMs: endTime - startTime,
		peakMemoryMB: peakMemory,
		totalPages
	};
}

/**
 * Run pagination test for a specific dataset
 */
async function runPaginationTest(
	datasetSize: DatasetSize,
	pageSize: number
): Promise<PaginationTestResult> {
	console.log(`\nTesting ${datasetSize} dataset...`);

	// Generate dataset
	const tasks = generateDatasetBySize(datasetSize);
	
	// Create temporary test directory
	const testDir = path.join(__dirname, '..', '..', 'benchmark-temp', `pagination-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
	mkdirSync(path.join(testDir, '.taskmaster', 'tasks'), { recursive: true });

	try {
		// Initialize storage and save tasks
		const storage = new FileStorage(testDir);
		await storage.saveTasks(tasks, 'master');

		// Test without pagination
		console.log('  Loading all tasks...');
		const withoutPagination = await testWithoutPagination(storage);

		// Wait a bit and clear
		await new Promise((resolve) => setTimeout(resolve, 100));
		forceGC();

		// Test with pagination
		console.log(`  Loading with pagination (page size: ${pageSize})...`);
		const withPagination = await testWithPagination(
			storage,
			pageSize,
			withoutPagination.total
		);

		// Calculate savings
		const memorySavings = {
			absoluteMB: withoutPagination.memoryMB - withPagination.memoryMB,
			percentReduction:
				((withoutPagination.memoryMB - withPagination.memoryMB) /
					withoutPagination.memoryMB) *
				100
		};

		return {
			datasetSize: withoutPagination.total,
			withoutPagination: {
				memoryMB: withoutPagination.memoryMB,
				loadTimeMs: withoutPagination.loadTimeMs,
				peakMemoryMB: withoutPagination.peakMemoryMB
			},
			withPagination: {
				pageSize,
				memoryMB: withPagination.memoryMB,
				loadTimeMs: withPagination.loadTimeMs,
				peakMemoryMB: withPagination.peakMemoryMB,
				totalPages: withPagination.totalPages
			},
			memorySavings
		};
	} finally {
		// Cleanup test directory
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}
}

/**
 * Format results for display
 */
function formatResults(results: PaginationTestResult[]): string {
	let output = '\n';
	output += '================================================================================\n';
	output += 'PAGINATION PERFORMANCE COMPARISON\n';
	output += '================================================================================\n\n';

	for (const result of results) {
		output += `Dataset Size: ${result.datasetSize} tasks\n`;
		output += '─'.repeat(80) + '\n\n';

		output += 'WITHOUT PAGINATION (Load All):\n';
		output += `  Memory Usage:     ${result.withoutPagination.memoryMB.toFixed(2)} MB\n`;
		output += `  Peak Memory:      ${result.withoutPagination.peakMemoryMB.toFixed(2)} MB\n`;
		output += `  Load Time:        ${result.withoutPagination.loadTimeMs.toFixed(2)} ms\n\n`;

		output += `WITH PAGINATION (Page Size: ${result.withPagination.pageSize}):\n`;
		output += `  Memory Usage:     ${result.withPagination.memoryMB.toFixed(2)} MB\n`;
		output += `  Peak Memory:      ${result.withPagination.peakMemoryMB.toFixed(2)} MB\n`;
		output += `  Load Time:        ${result.withPagination.loadTimeMs.toFixed(2)} ms\n`;
		output += `  Total Pages:      ${result.withPagination.totalPages}\n\n`;

		output += 'MEMORY SAVINGS:\n';
		output += `  Absolute:         ${result.memorySavings.absoluteMB.toFixed(2)} MB saved\n`;
		output += `  Percentage:       ${result.memorySavings.percentReduction.toFixed(1)}% reduction\n\n`;

		// Add recommendations
		if (result.datasetSize > 10000 && result.memorySavings.percentReduction < 30) {
			output += '⚠️  Consider using smaller page sizes for datasets >10K items\n';
		} else if (result.memorySavings.percentReduction > 50) {
			output += '✓ Excellent memory savings with pagination!\n';
		}

		output += '\n';
	}

	return output;
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
	console.log('Starting pagination performance tests...\n');

	const results: PaginationTestResult[] = [];

	// Test different dataset sizes with appropriate page sizes
	const tests: Array<{ dataset: DatasetSize; pageSize: number }> = [
		{ dataset: 'small', pageSize: 10 },
		{ dataset: 'medium', pageSize: 25 },
		{ dataset: 'large', pageSize: 50 }
	];

	for (const test of tests) {
		try {
			const result = await runPaginationTest(test.dataset, test.pageSize);
			results.push(result);
		} catch (error) {
			console.error(
				`Error testing ${test.dataset}:`,
				error instanceof Error ? error.message : error
			);
		}
	}

	// Format and display results
	const formattedResults = formatResults(results);
	console.log(formattedResults);

	// Save results
	const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
	const resultsDir = path.join(
		__dirname,
		'..',
		'..',
		'benchmark-results'
	);
	const jsonFile = path.join(
		resultsDir,
		`pagination-benchmark-${timestamp}.json`
	);
	const txtFile = path.join(
		resultsDir,
		`pagination-benchmark-${timestamp}.txt`
	);

	writeFileSync(jsonFile, JSON.stringify(results, null, 2));
	writeFileSync(txtFile, formattedResults);

	console.log('================================================================================');
	console.log('\nResults saved to:');
	console.log(`  JSON: ${jsonFile}`);
	console.log(`  Text: ${txtFile}`);
}

// Run tests
main().catch(console.error);
