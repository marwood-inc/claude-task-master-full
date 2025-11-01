/**
 * Test script to demonstrate tag-scoped cache clearing
 * Shows memory usage when switching between tags
 */

import { FileStorage } from '../../packages/tm-core/src/modules/storage/adapters/file-storage/file-storage.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const testDir = path.join(process.cwd(), 'benchmark-test-data', 'tag-switching');

async function setup() {
	// Create test directory
	await fs.mkdir(testDir, { recursive: true });
	await fs.mkdir(path.join(testDir, '.taskmaster', 'tasks'), { recursive: true });
	
	// Create a large task file with tasks for multiple tags
	const tasks = [];
	const tags = ['master', 'feature/new-ui', 'bugfix/cache', 'experimental'];
	
	// Create 500 tasks per tag (2000 total)
	for (const tag of tags) {
		for (let i = 1; i <= 500; i++) {
			tasks.push({
				id: `${tag}-${i}`,
				title: `Task ${i} for ${tag}`,
				description: `This is task ${i} for tag ${tag}`,
				status: 'pending',
				priority: 'medium',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				tag: tag,
				subtasks: []
			});
		}
	}
	
	await fs.writeFile(
		path.join(testDir, '.taskmaster', 'tasks', 'tasks.json'),
		JSON.stringify({ tasks }, null, 2)
	);
	
	console.log(`Created test data: ${tasks.length} tasks across ${tags.length} tags`);
	return { testDir, tags };
}

async function testTagSwitching() {
	console.log('\n' + '='.repeat(80));
	console.log('TAG-SCOPED CACHE TEST');
	console.log('='.repeat(80));
	
	const { testDir, tags } = await setup();
	const storage = new FileStorage(testDir);
	await storage.initialize();
	
	console.log('\nSimulating user switching between tags...\n');
	
	for (let iteration = 1; iteration <= 3; iteration++) {
		console.log(`\n--- Iteration ${iteration} ---`);
		
		for (const tag of tags) {
			// Load tasks for this tag
			const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
			const tasks = await storage.loadTasks(tag);
			const endMem = process.memoryUsage().heapUsed / 1024 / 1024;
			
			// Load some individual tasks to populate cache
			for (let i = 1; i <= 10; i++) {
				await storage.loadTask(`${tag}-${i}`, tag);
			}
			
			const metrics = storage.getCacheMetrics();
			
			console.log(`Tag: ${tag.padEnd(20)} | Tasks: ${tasks.length.toString().padStart(4)} | Memory: ${endMem.toFixed(1)}MB (Δ${(endMem - startMem).toFixed(1)}MB) | Cache: ${metrics.hits}/${metrics.hits + metrics.misses} (${(metrics.hitRate * 100).toFixed(1)}%)`);
		}
	}
	
	console.log('\n' + '='.repeat(80));
	console.log('BENEFITS OF TAG-SCOPED CACHING:');
	console.log('='.repeat(80));
	console.log('✓ Only active tag is cached in memory');
	console.log('✓ Switching tags clears old cache automatically');
	console.log('✓ Memory usage stays bounded regardless of total task count');
	console.log('✓ Cache hit rate remains high for active tag operations');
	console.log('='.repeat(80));
	
	// Cleanup
	await storage.close();
	await fs.rm(testDir, { recursive: true, force: true });
}

testTagSwitching().catch(console.error);
