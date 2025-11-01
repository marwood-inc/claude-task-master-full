#!/usr/bin/env node
/**
 * Standalone test for PRD preprocessor - function only
 */

import fs from 'fs';
import chalk from 'chalk';

/**
 * Preprocess PRD content to remove instructional scaffolding
 */
function preprocessPRD(prdContent) {
	let processed = prdContent;

	// 1. Remove <rpg-method> wrapper
	processed = processed.replace(
		/<rpg-method>[\s\S]*?<\/rpg-method>\n*(?:---\n*)?/,
		''
	);

	// 2. Remove <instruction> blocks
	processed = processed.replace(/<instruction>[\s\S]*?<\/instruction>\n*/g, '');

	// 3. Remove <example> blocks
	processed = processed.replace(/<example[^>]*>[\s\S]*?<\/example>\n*/g, '');

	// 4. Remove <task-master-integration> section
	processed = processed.replace(
		/<task-master-integration>[\s\S]*?<\/task-master-integration>/,
		''
	);

	// 5. Clean up excessive newlines
	processed = processed.replace(/\n{3,}/g, '\n\n');

	return processed.trim();
}

console.log(chalk.bold('\n🧪 Testing PRD Preprocessor\n'));

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

// Test 1: Remove RPG wrapper
runTest('Test 1: Remove <rpg-method> wrapper', () => {
	const input = `<rpg-method>
# Repository Planning Graph (RPG) Method
Teaching content here...
</rpg-method>

---

<overview>
## Problem Statement
Actual problem.
</overview>`;

	const result = preprocessPRD(input);
	return (
		!result.includes('<rpg-method>') &&
		!result.includes('Teaching content') &&
		result.includes('Actual problem')
	);
});

// Test 2: Remove instruction blocks
runTest('Test 2: Remove <instruction> blocks', () => {
	const input = `<overview>
<instruction>
How to write this section...
</instruction>

## Problem Statement
Real content here.
</overview>`;

	const result = preprocessPRD(input);
	return (
		!result.includes('<instruction>') &&
		!result.includes('How to write') &&
		result.includes('Real content')
	);
});

// Test 3: Remove example blocks
runTest('Test 3: Remove <example> blocks', () => {
	const input = `<functional-decomposition>
<example type="good">
Example capability here...
</example>

## Capability Tree
### Capability: Real Capability
</functional-decomposition>`;

	const result = preprocessPRD(input);
	return (
		!result.includes('<example') &&
		!result.includes('Example capability') &&
		result.includes('Real Capability')
	);
});

// Test 4: Remove task-master-integration
runTest('Test 4: Remove <task-master-integration> section', () => {
	const input = `<overview>
## Problem
Real problem.
</overview>

<task-master-integration>
How Task Master uses this...
</task-master-integration>`;

	const result = preprocessPRD(input);
	return (
		!result.includes('<task-master-integration>') &&
		!result.includes('How Task Master uses') &&
		result.includes('Real problem')
	);
});

// Test 5: Preserve important content
runTest('Test 5: Preserve dependency graph content', () => {
	const input = `<dependency-graph>
<instruction>Remove this</instruction>

## Dependency Chain

### Foundation Layer (Phase 0)
- **error-handling**: No dependencies
- **config-manager**: No dependencies

### Data Layer (Phase 1)
- **schema-validator**: Depends on [error-handling]
</dependency-graph>`;

	const result = preprocessPRD(input);
	return (
		!result.includes('<instruction>') &&
		result.includes('Foundation Layer') &&
		result.includes('error-handling') &&
		result.includes('Depends on [error-handling]')
	);
});

// Test 6: Whitespace cleanup
runTest('Test 6: Clean up excessive whitespace', () => {
	const input = `<overview>


Content 1.



Content 2.


</overview>`;

	const result = preprocessPRD(input);
	return !result.includes('\n\n\n');
});

// Test 7: Multiple instruction and example blocks
runTest('Test 7: Remove multiple blocks throughout document', () => {
	const input = `<overview>
<instruction>First instruction</instruction>
Content 1
</overview>

<functional-decomposition>
<instruction>Second instruction</instruction>
<example type="good">Good example</example>
<example type="bad">Bad example</example>
Content 2
</functional-decomposition>

<dependency-graph>
<instruction>Third instruction</instruction>
Content 3
</dependency-graph>`;

	const result = preprocessPRD(input);
	return (
		!result.includes('<instruction>') &&
		!result.includes('<example') &&
		result.includes('Content 1') &&
		result.includes('Content 2') &&
		result.includes('Content 3')
	);
});

// Test 8: Real RPG template
runTest('Test 8: Process actual RPG template', () => {
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
		console.log(`  Reduction: ${chalk.bold.green(reduction.toFixed(1) + '%')}`);

		// Check that key sections are removed
		const sectionsRemoved =
			!rpgResult.includes('<rpg-method>') &&
			!rpgResult.includes('<instruction>') &&
			!rpgResult.includes('<example') &&
			!rpgResult.includes('<task-master-integration>');

		if (sectionsRemoved) {
			console.log(chalk.green('  ✓ All scaffolding removed'));
		} else {
			console.log(chalk.yellow('  ! Some scaffolding remains:'));
			if (rpgResult.includes('<rpg-method>'))
				console.log('    - <rpg-method> still present');
			if (rpgResult.includes('<instruction>'))
				console.log('    - <instruction> still present');
			if (rpgResult.includes('<example'))
				console.log('    - <example> still present');
			if (rpgResult.includes('<task-master-integration>'))
				console.log('    - <task-master-integration> still present');
		}

		return reduction > 50 && sectionsRemoved;
	} catch (err) {
		console.log(chalk.red(`  Error: ${err.message}`));
		return false;
	}
});

// Test 9: Standard PRD template (should pass through unchanged)
runTest('Test 9: Standard PRD template (no preprocessing needed)', () => {
	try {
		const standardTemplate = fs.readFileSync(
			'assets/example_prd.txt',
			'utf-8'
		);
		const standardResult = preprocessPRD(standardTemplate);

		const originalSize = standardTemplate.length;
		const processedSize = standardResult.length;

		console.log(`  Original size: ${originalSize.toLocaleString()} chars`);
		console.log(`  Processed size: ${processedSize.toLocaleString()} chars`);

		// Standard template should be unchanged
		const unchanged = originalSize === processedSize;

		if (unchanged) {
			console.log(
				chalk.green('  ✓ Template passed through unchanged (as expected)')
			);
		} else {
			console.log(
				chalk.yellow(
					`  ! Template was modified (${((originalSize - processedSize) / originalSize * 100).toFixed(1)}% change)`
				)
			);
		}

		// Verify content is preserved
		const contentPreserved =
			standardResult.includes('<context>') &&
			standardResult.includes('<PRD>') &&
			standardResult.includes('Core Features') &&
			standardResult.includes('Technical Architecture');

		if (contentPreserved) {
			console.log(chalk.green('  ✓ All content preserved'));
		} else {
			console.log(chalk.red('  ✗ Some content missing'));
		}

		return unchanged && contentPreserved;
	} catch (err) {
		console.log(chalk.red(`  Error: ${err.message}`));
		return false;
	}
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
			'\n✨ All tests passed! The preprocessor is working correctly.'
		)
	);
}

process.exit(failCount > 0 ? 1 : 0);
