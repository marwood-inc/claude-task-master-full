#!/usr/bin/env node
/**
 * Test incremental PRD detection and context summarization
 */

import { detectIncrementalPRD, summarizeTasksForContext } from '../scripts/modules/task-manager/parse-prd/parse-prd-helpers.js';
import chalk from 'chalk';

console.log(chalk.bold('\n🧪 Testing Incremental PRD Detection\n'));

let passCount = 0;
let failCount = 0;

function runTest(name, test) {
	console.log(chalk.blue(name));
	const result = test();
	if (result) {
		console.log(chalk.green('✓ PASS\n'));
		passCount++;
	} else {
		console.log(chalk.red('✗ FAIL\n'));
		failCount++;
	}
	return result;
}

// ===== DETECTION TESTS =====

runTest('Test 1: Detect task ID reference with hash (#123)', () => {
	const prd = `
# PRD: Enhance Authentication
Build upon existing authentication system (see Task #12).
Add OAuth support.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 2: Detect lowercase task reference (task #45)', () => {
	const prd = `
# PRD: Add Dashboard
This builds on the analytics work from task #45.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 3: Detect "builds on" keyword', () => {
	const prd = `
# PRD: Phase 2 Features
This builds on the foundation established in Phase 1.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 4: Detect "extends" keyword', () => {
	const prd = `
# PRD: Enhanced API
This extends the current API implementation.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 5: Detect "Phase 2" pattern', () => {
	const prd = `
# PRD: Phase 2 Enhancements
Building incrementally on Phase 1.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 6: Detect "existing task" phrase', () => {
	const prd = `
# PRD: Improvements
Enhance the existing task management system.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 7: Detect "current implementation"', () => {
	const prd = `
# PRD: Optimization
Improve the current implementation of the cache layer.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 8: Detect "already implemented"', () => {
	const prd = `
# PRD: Additional Features
Work with the database layer already implemented.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 9: Self-contained PRD should NOT be detected', () => {
	const prd = `
# PRD: New Feature
Build a completely new user management system.
No dependencies on other work.
`;
	return detectIncrementalPRD(prd) === false;
});

runTest('Test 10: Empty PRD should NOT be detected', () => {
	const prd = '';
	return detectIncrementalPRD(prd) === false;
});

runTest('Test 11: Case insensitive detection (BUILDS ON)', () => {
	const prd = `
# PRD
This BUILDS ON existing work.
`;
	return detectIncrementalPRD(prd) === true;
});

runTest('Test 12: Multiple task ID references', () => {
	const prd = `
# PRD
Requires Tasks #1, #5, and #12 to be complete.
`;
	return detectIncrementalPRD(prd) === true;
});

// ===== SUMMARIZATION TESTS =====

runTest('Test 13: Summarize single task', () => {
	const tasks = [
		{
			id: 1,
			title: 'Setup project',
			status: 'completed',
			dependencies: []
		}
	];
	const summary = summarizeTasksForContext(tasks);
	return (
		summary === 'Task #1: Setup project (completed)' && summary.length < 100
	);
});

runTest('Test 14: Summarize task with dependencies', () => {
	const tasks = [
		{
			id: 5,
			title: 'Build API',
			status: 'in-progress',
			dependencies: [1, 2]
		}
	];
	const summary = summarizeTasksForContext(tasks);
	return (
		summary.includes('Task #5') &&
		summary.includes('in-progress') &&
		summary.includes('[depends on: 1, 2]')
	);
});

runTest('Test 15: Summarize multiple tasks', () => {
	const tasks = [
		{ id: 1, title: 'Task A', status: 'completed', dependencies: [] },
		{ id: 2, title: 'Task B', status: 'pending', dependencies: [1] },
		{ id: 3, title: 'Task C', status: 'in-progress', dependencies: [1, 2] }
	];
	const summary = summarizeTasksForContext(tasks);
	const lines = summary.split('\n');
	return (
		lines.length === 3 &&
		summary.includes('Task #1') &&
		summary.includes('Task #2') &&
		summary.includes('Task #3')
	);
});

runTest('Test 16: Empty task array returns empty string', () => {
	const summary = summarizeTasksForContext([]);
	return summary === '';
});

runTest('Test 17: Null/undefined tasks returns empty string', () => {
	return (
		summarizeTasksForContext(null) === '' &&
		summarizeTasksForContext(undefined) === ''
	);
});

runTest('Test 18: Token efficiency check', () => {
	const tasks = [
		{
			id: 10,
			title: 'Complex task with lots of details',
			description:
				'Very long description that would normally take up many tokens...',
			status: 'pending',
			dependencies: [1, 2, 3],
			details: 'Implementation details go here...',
			testStrategy: 'Test strategy details...'
		}
	];
	const summary = summarizeTasksForContext(tasks);

	// Summary should NOT include description, details, or testStrategy
	return (
		!summary.includes('Very long description') &&
		!summary.includes('Implementation details') &&
		!summary.includes('Test strategy') &&
		summary.includes('Task #10') &&
		summary.includes('[depends on: 1, 2, 3]')
	);
});

// ===== EDGE CASES =====

runTest('Test 19: Hash in markdown heading (#) should NOT trigger', () => {
	const prd = `
# Overview
## Problem Statement
### Key Features
`;
	// These are markdown headings, not task IDs
	// Our regex requires #\d+ (hash followed by digits)
	return detectIncrementalPRD(prd) === false;
});

runTest('Test 20: URL with hash fragment should NOT trigger', () => {
	const prd = `
# PRD
See https://example.com/docs#section for details.
`;
	// URL fragments aren't task IDs
	return detectIncrementalPRD(prd) === false;
});

runTest('Test 21: Hex color codes should NOT trigger', () => {
	const prd = `
# PRD
Use color #123456 for the button.
`;
	// Color codes have letters after the hash
	return detectIncrementalPRD(prd) === false;
});

runTest('Test 22: GitHub issue reference should trigger (acceptable)', () => {
	const prd = `
# PRD
Fixes issue #42 on GitHub.
`;
	// This could be a false positive, but it's acceptable
	// PRD shouldn't typically reference GitHub issues anyway
	return detectIncrementalPRD(prd) === true;
});

// Summary
console.log(chalk.bold('\n📊 Test Summary'));
console.log(`Total tests: ${passCount + failCount}`);
console.log(chalk.green(`Passed: ${passCount}`));
if (failCount > 0) {
	console.log(chalk.red(`Failed: ${failCount}`));
} else {
	console.log(
		chalk.bold.green(
			'\n✨ All tests passed! Incremental PRD detection is working correctly.'
		)
	);
}

process.exit(failCount > 0 ? 1 : 0);
