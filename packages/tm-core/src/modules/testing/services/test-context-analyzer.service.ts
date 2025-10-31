/**
 * @fileoverview Task analysis service for test context
 * Analyzes tasks to determine complexity and test requirements
 */

import type { Task } from '../../../common/types/index.js';
import type {
	TestAnalysisResult,
	TaskComplexity,
	TestDetailLevel,
	TestType,
	ComplexityFactors
} from '../types/test-generation.types.js';

/**
 * Service for analyzing tasks for test generation
 */
export class TestContextAnalyzer {
	/**
	 * Analyze task and determine test requirements
	 */
	analyzeTask(task: Task): TestAnalysisResult {
		const complexity = this.assessComplexity(task);
		const suggestedDetailLevel = this.determineDetailLevel(complexity);
		const suggestedTestType = this.determineTestType(task, complexity);
		const testableComponents = this.extractTestableComponents(task);
		const mockRequirements = this.identifyMockRequirements(task);
		const importPaths = this.extractImportPaths(task);

		return {
			task,
			complexity,
			suggestedDetailLevel,
			suggestedTestType,
			testableComponents,
			mockRequirements,
			importPaths
		};
	}

	/**
	 * Assess task complexity
	 */
	private assessComplexity(task: Task): TaskComplexity {
		const hasSubtasks = !!task.subtasks && task.subtasks.length > 0;
		const subtaskCount = task.subtasks?.length || 0;
		const hasDependencies = !!task.dependencies && task.dependencies.length > 0;
		const dependencyCount = task.dependencies?.length || 0;
		const hasTestStrategy = !!task.testStrategy;
		const descriptionLength = (task.description || '').length;
		const detailsLength = (task.details || '').length;

		const factors: ComplexityFactors = {
			hasSubtasks,
			subtaskCount,
			hasDependencies,
			dependencyCount,
			hasTestStrategy,
			descriptionLength,
			detailsLength
		};

		// Calculate complexity score (0-100)
		let score = 0;

		// Base complexity from description length
		if (descriptionLength + detailsLength < 200) score += 10;
		else if (descriptionLength + detailsLength < 500) score += 25;
		else if (descriptionLength + detailsLength < 1000) score += 40;
		else score += 60;

		// Subtask complexity
		if (subtaskCount === 0) score += 5;
		else if (subtaskCount <= 2) score += 15;
		else if (subtaskCount <= 5) score += 30;
		else score += 50;

		// Dependency complexity
		if (dependencyCount > 0) score += Math.min(dependencyCount * 5, 20);

		// Test strategy presence (reduces uncertainty)
		if (hasTestStrategy) score -= 10;

		// Normalize to 0-100
		score = Math.max(0, Math.min(100, score));

		// Determine level from score
		let level: 'simple' | 'moderate' | 'complex' = 'simple';
		if (score >= 70) level = 'complex';
		else if (score >= 40) level = 'moderate';

		return {
			level,
			score,
			factors
		};
	}

	/**
	 * Determine appropriate detail level based on complexity
	 */
	private determineDetailLevel(complexity: TaskComplexity): TestDetailLevel {
		if (complexity.score >= 70) return 'comprehensive';
		if (complexity.score >= 40) return 'standard';
		return 'minimal';
	}

	/**
	 * Determine appropriate test type based on task characteristics
	 */
	private determineTestType(task: Task, complexity: TaskComplexity): TestType {
		const text = `${task.title} ${task.description} ${task.details || ''}`.toLowerCase();

		// Look for integration keywords
		const integrationKeywords = [
			'integration',
			'api',
			'database',
			'http',
			'request',
			'response',
			'endpoint',
			'service',
			'external'
		];

		const hasIntegrationKeywords = integrationKeywords.some(keyword =>
			text.includes(keyword)
		);

		// Complex tasks with integration keywords suggest integration tests
		if (hasIntegrationKeywords && complexity.level !== 'simple') {
			return 'integration';
		}

		// Default to unit tests
		return 'unit';
	}

	/**
	 * Extract testable components from task
	 */
	private extractTestableComponents(task: Task): string[] {
		const components: string[] = [];

		// Extract from title
		if (task.title) {
			components.push(task.title);
		}

		// Extract from subtasks
		if (task.subtasks) {
			task.subtasks.forEach(st => {
				if (st.title) components.push(st.title);
			});
		}

		return components;
	}

	/**
	 * Identify mock requirements from task details
	 */
	private identifyMockRequirements(task: Task): string[] {
		const mocks: string[] = [];
		const text = `${task.description} ${task.details || ''}`.toLowerCase();

		// Common patterns that suggest mocking needs
		const patterns: Array<{ regex: RegExp; mock: string }> = [
			{ regex: /\bapi\b|http|fetch|axios|request/i, mock: 'HTTP client' },
			{ regex: /database|db|sql|postgres|mongo|prisma/i, mock: 'Database' },
			{ regex: /file\s*system|fs|read\s*file|write\s*file/i, mock: 'File system' },
			{
				regex: /auth|authentication|jwt|token|session/i,
				mock: 'Authentication service'
			},
			{ regex: /config|settings|environment/i, mock: 'Configuration' },
			{ regex: /logger|logging|log/i, mock: 'Logger' },
			{ regex: /cache|redis|memcached/i, mock: 'Cache' },
			{ regex: /queue|job|worker|background/i, mock: 'Queue/Worker' }
		];

		patterns.forEach(({ regex, mock }) => {
			if (regex.test(text)) {
				mocks.push(mock);
			}
		});

		return [...new Set(mocks)];
	}

	/**
	 * Extract potential import paths from task context
	 */
	private extractImportPaths(task: Task): string[] {
		const paths: string[] = [];
		const text = `${task.description} ${task.details || ''}`;

		// Look for file path patterns (e.g., src/modules/foo.ts)
		const pathPattern = /(?:^|\s)([a-z0-9-_/]+\.(?:ts|js|tsx|jsx))(?:\s|$)/gi;
		const matches = text.matchAll(pathPattern);

		for (const match of matches) {
			if (match[1]) paths.push(match[1]);
		}

		return [...new Set(paths)];
	}
}
