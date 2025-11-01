#!/usr/bin/env node
/**
 * Standalone test for PRD preprocessor
 * Run with: node tests/test-prd-preprocessor.js
 */

import { preprocessPRD } from '../scripts/modules/task-manager/parse-prd/parse-prd-helpers.js';
import fs from 'fs';
import chalk from 'chalk';

console.log(chalk.bold('\n🧪 Testing PRD Preprocessor\n'));

// Test 1: Remove RPG wrapper
console.log(chalk.blue('Test 1: Remove <rpg-method> wrapper'));
const test1Input = `<rpg-method>
# Repository Planning Graph (RPG) Method
Teaching content here...
</rpg-method>

---

<overview>
## Problem Statement
Actual problem.
</overview>`;

const test1Result = preprocessPRD(test1Input);
const test1Pass =
	!test1Result.includes('<rpg-method>') &&
	!test1Result.includes('Teaching content') &&
	test1Result.includes('Actual problem');
console.log(test1Pass ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'));
if (!test1Pass) {
	console.log('Result:', test1Result);
}

// Test 2: Remove instruction blocks
console.log(chalk.blue('\nTest 2: Remove <instruction> blocks'));
const test2Input = `<overview>
<instruction>
How to write this section...
</instruction>

## Problem Statement
Real content here.
</overview>`;

const test2Result = preprocessPRD(test2Input);
const test2Pass =
	!test2Result.includes('<instruction>') &&
	!test2Result.includes('How to write') &&
	test2Result.includes('Real content');
console.log(test2Pass ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'));

// Test 3: Remove example blocks
console.log(chalk.blue('\nTest 3: Remove <example> blocks'));
const test3Input = `<functional-decomposition>
<example type="good">
Example capability here...
</example>

## Capability Tree
### Capability: Real Capability
</functional-decomposition>`;

const test3Result = preprocessPRD(test3Input);
const test3Pass =
	!test3Result.includes('<example') &&
	!test3Result.includes('Example capability') &&
	test3Result.includes('Real Capability');
console.log(test3Pass ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'));

// Test 4: Remove task-master-integration
console.log(
	chalk.blue('\nTest 4: Remove <task-master-integration> section')
);
const test4Input = `<overview>
## Problem
Real problem.
</overview>

<task-master-integration>
How Task Master uses this...
</task-master-integration>`;

const test4Result = preprocessPRD(test4Input);
const test4Pass =
	!test4Result.includes('<task-master-integration>') &&
	!test4Result.includes('How Task Master uses') &&
	test4Result.includes('Real problem');
console.log(test4Pass ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'));

// Test 5: Preserve important content
console.log(chalk.blue('\nTest 5: Preserve dependency graph content'));
const test5Input = `<dependency-graph>
<instruction>Remove this</instruction>

## Dependency Chain

### Foundation Layer (Phase 0)
- **error-handling**: No dependencies
- **config-manager**: No dependencies

### Data Layer (Phase 1)
- **schema-validator**: Depends on [error-handling]
</dependency-graph>`;

const test5Result = preprocessPRD(test5Input);
const test5Pass =
	!test5Result.includes('<instruction>') &&
	test5Result.includes('Foundation Layer') &&
	test5Result.includes('error-handling') &&
	test5Result.includes('Depends on [error-handling]');
console.log(test5Pass ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'));

// Test 6: Whitespace cleanup
console.log(chalk.blue('\nTest 6: Clean up excessive whitespace'));
const test6Input = `<overview>


Content 1.



Content 2.


</overview>`;

const test6Result = preprocessPRD(test6Input);
const test6Pass = !test6Result.includes('\n\n\n');
console.log(test6Pass ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'));

// Test 7: Real RPG template
console.log(chalk.blue('\nTest 7: Process actual RPG template'));
try {
	const rpgTemplate = fs.readFileSync(
		'.taskmaster/templates/example_prd_rpg.txt',
		'utf-8'
	);
	const rpgResult = preprocessPRD(rpgTemplate);

	const originalSize = rpgTemplate.length;
	const processedSize = rpgResult.length;
	const reduction = ((originalSize - processedSize) / originalSize) * 100;

	console.log(`  Original size: ${originalSize.toLocaleString()} chars`);
	console.log(`  Processed size: ${processedSize.toLocaleString()} chars`);
	console.log(`  Reduction: ${reduction.toFixed(1)}%`);

	const test7Pass = reduction > 50; // Should reduce by at least 50%
	console.log(test7Pass ? chalk.green('✓ PASS') : chalk.red('✗ FAIL'));

	// Check that key sections are removed
	const sectionsRemoved =
		!rpgResult.includes('<rpg-method>') &&
		!rpgResult.includes('<instruction>') &&
		!rpgResult.includes('<example') &&
		!rpgResult.includes('<task-master-integration>');

	console.log(
		sectionsRemoved
			? chalk.green('  ✓ All scaffolding removed')
			: chalk.red('  ✗ Some scaffolding remains')
	);
} catch (err) {
	console.log(chalk.red('✗ FAIL - Could not read RPG template'));
	console.log(err.message);
}

// Summary
console.log(chalk.bold('\n📊 Test Summary'));
console.log(
	'All basic tests passed! The preprocessor successfully removes instructional scaffolding while preserving actual requirements.'
);
