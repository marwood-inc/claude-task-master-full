/**
 * @fileoverview Test prompt generation service with AI integration
 * Constructs AI prompts for test generation
 */

import type { ConfigManager } from '../../config/managers/config-manager.js';
import type {
	TestPromptData,
	TestDetailLevel,
	TestType,
	TestFramework
} from '../types/test-generation.types.js';

/**
 * Service for generating test prompts for AI
 */
export class TestPromptService {
	// @ts-expect-error - ConfigManager will be used for future config-based prompt customization
	constructor(private _configManager: ConfigManager) {}

	/**
	 * Build AI prompt for test generation
	 */
	buildPrompt(promptData: TestPromptData): string {
		const systemPrompt = this.buildSystemPrompt(promptData.framework);
		const taskContext = this.buildTaskContext(promptData);
		const requirements = this.buildRequirements(promptData);
		const instructions = this.buildInstructions(promptData.detailLevel, promptData.testType);
		const outputFormat = this.buildOutputFormat(promptData.framework);

		return `${systemPrompt}

${taskContext}

${requirements}

${instructions}

${outputFormat}`;
	}

	/**
	 * Build system prompt
	 */
	private buildSystemPrompt(framework: TestFramework): string {
		return `You are an expert test engineer specializing in ${framework} for TypeScript/JavaScript.
Your task is to generate production-ready, comprehensive test files that follow best practices.

Key principles:
- Write clean, readable test code
- Follow ${framework} conventions and idioms
- Use descriptive test names
- Cover happy paths, edge cases, and error conditions
- Mock external dependencies appropriately
- Include proper setup and teardown where needed`;
	}

	/**
	 * Build task context section
	 */
	private buildTaskContext(data: TestPromptData): string {
		const { task, analysis } = data;

		let context = `# Task Information

Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}
Status: ${task.status}
Priority: ${task.priority || 'normal'}`;

		if (task.details) {
			context += `\n\n## Details\n${task.details}`;
		}

		if (task.testStrategy) {
			context += `\n\n## Test Strategy\n${task.testStrategy}`;
		}

		if (task.subtasks && task.subtasks.length > 0) {
			context += `\n\n## Subtasks`;
			task.subtasks.forEach(st => {
				context += `\n- ${st.title}${st.description ? `: ${st.description}` : ''}`;
			});
		}

		if (analysis.testableComponents.length > 0) {
			context += `\n\n## Testable Components`;
			analysis.testableComponents.forEach(comp => {
				context += `\n- ${comp}`;
			});
		}

		return context;
	}

	/**
	 * Build requirements section
	 */
	private buildRequirements(data: TestPromptData): string {
		const { analysis, framework, detailLevel, testType, additionalContext } = data;

		let reqs = `# Test Requirements

- Framework: ${framework}
- Test Type: ${testType}
- Detail Level: ${detailLevel}
- Complexity: ${analysis.complexity.level} (score: ${analysis.complexity.score}/100)`;

		if (analysis.mockRequirements.length > 0) {
			reqs += `\n- Mock Requirements: ${analysis.mockRequirements.join(', ')}`;
		}

		if (analysis.importPaths.length > 0) {
			reqs += `\n- Potential Import Paths: ${analysis.importPaths.join(', ')}`;
		}

		if (additionalContext) {
			reqs += `\n\n## Additional Context\n${additionalContext}`;
		}

		return reqs;
	}

	/**
	 * Build instructions based on detail level and test type
	 */
	private buildInstructions(detailLevel: TestDetailLevel, testType: TestType): string {
		const baseInstructions = `# Instructions

Generate a complete ${testType} test file following these guidelines:`;

		const detailInstructions = this.getDetailLevelInstructions(detailLevel);
		const typeInstructions = this.getTestTypeInstructions(testType);

		return `${baseInstructions}\n\n${detailInstructions}\n\n${typeInstructions}`;
	}

	/**
	 * Get instructions for detail level
	 */
	private getDetailLevelInstructions(level: TestDetailLevel): string {
		switch (level) {
			case 'minimal':
				return `## Minimal Coverage
- Focus on 1-3 basic test cases per function
- Cover happy paths only
- Simple assertions
- No complex mocking
- Keep tests concise and straightforward`;

			case 'comprehensive':
				return `## Comprehensive Coverage
- Test all major functionality and edge cases
- Include error handling tests
- Mock external dependencies properly
- Test both success and failure scenarios
- Include integration tests if appropriate
- Test boundary conditions
- Add negative test cases
- Cover all code paths`;

			case 'standard':
			default:
				return `## Standard Coverage
- Test main functionality paths
- Include basic error handling
- Mock key external dependencies
- Cover typical use cases
- Test important edge cases
- Balance between coverage and maintainability`;
		}
	}

	/**
	 * Get instructions for test type
	 */
	private getTestTypeInstructions(testType: TestType): string {
		switch (testType) {
			case 'integration':
				return `## Integration Test Guidelines
- Test interactions between multiple modules
- Use real dependencies where appropriate
- Test API endpoints or service interactions
- Include database interactions if applicable
- Test data flow through the system
- Verify state changes across components`;

			case 'unit':
			default:
				return `## Unit Test Guidelines
- Test individual functions/methods in isolation
- Mock all external dependencies
- Focus on one unit of functionality per test
- Test inputs, outputs, and side effects
- Verify error conditions and exceptions
- Keep tests fast and independent`;
		}
	}

	/**
	 * Build output format instructions
	 */
	private buildOutputFormat(framework: TestFramework): string {
		const importExample =
			framework === 'vitest'
				? "import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';"
				: "import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';";

		return `# Output Format

Generate ONLY the test file code. Do not include explanations or commentary.

Structure your test file as follows:
1. Imports at the top
2. ${importExample}
3. Import the code under test
4. Import any required mocks or utilities
5. Main describe block for the test suite
6. Nested describe blocks for related tests
7. Individual test cases with descriptive names

Use TypeScript and include proper type annotations.
Follow ${framework} best practices and conventions.

Output the complete test file now:`;
	}

	/**
	 * Get maximum tokens for AI generation based on detail level
	 */
	getMaxTokens(detailLevel: TestDetailLevel): number {
		switch (detailLevel) {
			case 'minimal':
				return 1000;
			case 'comprehensive':
				return 4000;
			default:
				return 2000;
		}
	}

	/**
	 * Get temperature for AI generation
	 */
	getTemperature(): number {
		// Lower temperature for more consistent, predictable code generation
		return 0.3;
	}
}
