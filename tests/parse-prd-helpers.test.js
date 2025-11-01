/**
 * Tests for PRD preprocessing functionality
 */

import { describe, it, expect } from '@jest/globals';
import { preprocessPRD } from '../scripts/modules/task-manager/parse-prd/parse-prd-helpers.js';

describe('preprocessPRD', () => {
	describe('RPG method wrapper removal', () => {
		it('should remove <rpg-method> wrapper', () => {
			const input = `<rpg-method>
# Repository Planning Graph (RPG) Method - PRD Template

This template teaches you how to create PRDs...
</rpg-method>

---

<overview>
## Problem Statement
Actual problem description here.
</overview>`;

			const result = preprocessPRD(input);

			expect(result).not.toContain('<rpg-method>');
			expect(result).not.toContain('Repository Planning Graph');
			expect(result).toContain('Actual problem description');
		});

		it('should handle missing <rpg-method> wrapper gracefully', () => {
			const input = `<overview>
## Problem Statement
No RPG wrapper here.
</overview>`;

			const result = preprocessPRD(input);

			expect(result).toBe(input.trim());
		});
	});

	describe('Instruction block removal', () => {
		it('should remove single instruction block', () => {
			const input = `<overview>
<instruction>
Start with the problem, not the solution. Be specific about:
- What pain point exists?
- Who experiences it?
</instruction>

## Problem Statement
Actual problem here.
</overview>`;

			const result = preprocessPRD(input);

			expect(result).not.toContain('<instruction>');
			expect(result).not.toContain('Start with the problem');
			expect(result).toContain('Actual problem here');
		});

		it('should remove multiple instruction blocks', () => {
			const input = `<overview>
<instruction>
First instruction block.
</instruction>

## Problem Statement
Content 1.

</overview>

<functional-decomposition>
<instruction>
Second instruction block.
</instruction>

## Capability Tree
Content 2.
</functional-decomposition>`;

			const result = preprocessPRD(input);

			expect(result).not.toContain('<instruction>');
			expect(result).not.toContain('First instruction');
			expect(result).not.toContain('Second instruction');
			expect(result).toContain('Content 1');
			expect(result).toContain('Content 2');
		});
	});

	describe('Example block removal', () => {
		it('should remove good examples', () => {
			const input = `<functional-decomposition>
<example type="good">
Capability: Data Validation
  Feature: Schema validation
    - Description: Validate JSON payloads
</example>

## Capability Tree
### Capability: Actual Capability
</functional-decomposition>`;

			const result = preprocessPRD(input);

			expect(result).not.toContain('<example');
			expect(result).not.toContain('Data Validation');
			expect(result).not.toContain('Schema validation');
			expect(result).toContain('Actual Capability');
		});

		it('should remove bad examples', () => {
			const input = `<structural-decomposition>
<example type="bad">
Capability: validation.js
  (Problem: This is a FILE, not a CAPABILITY.)
</example>

## Module Definitions
### Module: Actual Module
</structural-decomposition>`;

			const result = preprocessPRD(input);

			expect(result).not.toContain('<example');
			expect(result).not.toContain('validation.js');
			expect(result).toContain('Actual Module');
		});

		it('should remove multiple example blocks', () => {
			const input = `<dependency-graph>
<example type="good">
Foundation Layer:
  - error-handling: No dependencies
</example>

<example type="bad">
- validation: Depends on API
- API: Depends on validation
(Problem: Circular dependency)
</example>

## Dependency Chain
### Foundation Layer
- **error-handling**: No deps
</dependency-graph>`;

			const result = preprocessPRD(input);

			expect(result).not.toContain('<example');
			expect(result).not.toContain('Circular dependency');
			expect(result).toContain('Foundation Layer');
			expect(result).toContain('error-handling');
		});
	});

	describe('Task Master integration section removal', () => {
		it('should remove <task-master-integration> section', () => {
			const input = `<overview>
## Problem Statement
Actual problem.
</overview>

<task-master-integration>
# How Task Master Uses This PRD

When you run \`task-master parse-prd\`, the parser:
1. Extracts capabilities
2. Extracts features
...

## Tips for Best Results
- Spend time on dependency graph
- Keep features atomic
</task-master-integration>`;

			const result = preprocessPRD(input);

			expect(result).not.toContain('<task-master-integration>');
			expect(result).not.toContain('How Task Master Uses');
			expect(result).not.toContain('Tips for Best Results');
			expect(result).toContain('Actual problem');
		});
	});

	describe('Content preservation', () => {
		it('should preserve overview content', () => {
			const input = `<overview>
<instruction>Remove this</instruction>

## Problem Statement
Critical user pain points here.

## Target Users
Developer personas and workflows.

## Success Metrics
80% task completion via autopilot.
</overview>`;

			const result = preprocessPRD(input);

			expect(result).toContain('Critical user pain points');
			expect(result).toContain('Developer personas');
			expect(result).toContain('80% task completion');
		});

		it('should preserve functional decomposition content', () => {
			const input = `<functional-decomposition>
<instruction>Remove this</instruction>

## Capability Tree

### Capability: Data Validation
Validates incoming data.

#### Feature: Schema validation
- **Description**: Validate JSON payloads against schemas
- **Inputs**: JSON object, schema
- **Outputs**: Validation result
- **Behavior**: Check types and constraints
</functional-decomposition>`;

			const result = preprocessPRD(input);

			expect(result).toContain('Capability: Data Validation');
			expect(result).toContain('Schema validation');
			expect(result).toContain('Validate JSON payloads');
			expect(result).toContain('**Inputs**: JSON object, schema');
		});

		it('should preserve dependency graph content', () => {
			const input = `<dependency-graph>
<instruction>Remove this</instruction>

## Dependency Chain

### Foundation Layer (Phase 0)
- **error-handling**: Provides error utilities
- **config-manager**: Manages configuration

### Data Layer (Phase 1)
- **schema-validator**: Depends on [error-handling]
- **data-ingestion**: Depends on [schema-validator, config-manager]
</dependency-graph>`;

			const result = preprocessPRD(input);

			expect(result).toContain('Foundation Layer');
			expect(result).toContain('error-handling');
			expect(result).toContain('Depends on [error-handling]');
			expect(result).toContain('Depends on [schema-validator, config-manager]');
		});

		it('should preserve implementation roadmap content', () => {
			const input = `<implementation-roadmap>
<instruction>Remove this</instruction>

## Development Phases

### Phase 0: Foundation
**Goal**: Establish core utilities

**Entry Criteria**: Clean repository

**Tasks**:
- [ ] Implement error handling (depends on: none)
  - Acceptance criteria: All error types covered
  - Test strategy: Unit test each error type

**Exit Criteria**: Foundation modules importable

**Delivers**: Error handling and config system
</implementation-roadmap>`;

			const result = preprocessPRD(input);

			expect(result).toContain('Phase 0: Foundation');
			expect(result).toContain('Establish core utilities');
			expect(result).toContain('Implement error handling');
			expect(result).toContain('Acceptance criteria: All error types covered');
		});

		it('should preserve test strategy content', () => {
			const input = `<test-strategy>
<instruction>Remove this</instruction>

## Test Pyramid
Unit tests: 70%
Integration: 20%
E2E: 10%

## Coverage Requirements
- Line coverage: 80% minimum
- Branch coverage: 75% minimum

## Critical Test Scenarios

### Data Validation Module
**Happy path**:
- Valid data passes all checks

**Edge cases**:
- Empty strings, null values
</test-strategy>`;

			const result = preprocessPRD(input);

			expect(result).toContain('Test Pyramid');
			expect(result).toContain('Line coverage: 80% minimum');
			expect(result).toContain('Valid data passes all checks');
		});
	});

	describe('Whitespace cleanup', () => {
		it('should clean up excessive newlines', () => {
			const input = `<overview>
## Problem Statement


Content here.



More content.
</overview>`;

			const result = preprocessPRD(input);

			// Should have max 2 consecutive newlines
			expect(result).not.toContain('\n\n\n');
			expect(result).toContain('Content here');
			expect(result).toContain('More content');
		});

		it('should trim leading and trailing whitespace', () => {
			const input = `

<overview>
## Problem Statement
Content here.
</overview>

`;

			const result = preprocessPRD(input);

			expect(result).toBe('<overview>\n## Problem Statement\nContent here.\n</overview>');
		});
	});

	describe('Edge cases', () => {
		it('should handle empty input', () => {
			const result = preprocessPRD('');
			expect(result).toBe('');
		});

		it('should handle input with no RPG scaffolding', () => {
			const input = `# Regular PRD

## Problem
Some problem.

## Solution
Some solution.`;

			const result = preprocessPRD(input);

			// Should pass through unchanged
			expect(result).toBe(input);
		});

		it('should handle nested tags gracefully', () => {
			const input = `<overview>
<instruction>
This has <example type="good">nested tags</example> inside.
</instruction>

## Problem Statement
Actual content.
</overview>`;

			const result = preprocessPRD(input);

			// Both instruction and nested example should be removed
			expect(result).not.toContain('<instruction>');
			expect(result).not.toContain('<example');
			expect(result).toContain('Actual content');
		});

		it('should handle malformed tags', () => {
			const input = `<overview>
<instruction>
Unclosed instruction block

## Problem Statement
Content here.
</overview>`;

			const result = preprocessPRD(input);

			// Should still preserve content even with malformed tags
			expect(result).toContain('Content here');
		});
	});

	describe('Token reduction estimate', () => {
		it('should significantly reduce content size', () => {
			const input = `<rpg-method>
${'#'.repeat(2000)} Large template introduction
</rpg-method>

---

<overview>
<instruction>${'x'.repeat(500)}</instruction>

## Problem Statement
${'Actual content. '.repeat(50)}
</overview>

<functional-decomposition>
<instruction>${'y'.repeat(500)}</instruction>
<example type="good">${'z'.repeat(300)}</example>

## Capability Tree
${'Real requirements. '.repeat(50)}
</functional-decomposition>

<task-master-integration>
${'Meta docs. '.repeat(200)}
</task-master-integration>`;

			const result = preprocessPRD(input);

			// Original has ~5300+ chars of scaffolding + ~1700 chars of content
			// Result should have only ~1700 chars of content
			const reductionPercent =
				((input.length - result.length) / input.length) * 100;

			expect(reductionPercent).toBeGreaterThan(50);
			expect(result).toContain('Actual content');
			expect(result).toContain('Real requirements');
			expect(result).not.toContain('Large template introduction');
			expect(result).not.toContain('Meta docs');
		});
	});
});
