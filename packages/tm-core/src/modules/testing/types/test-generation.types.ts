/**
 * @fileoverview Core types for test generation
 */

import type { Task } from '../../../common/types/index.js';

/**
 * Options for test generation
 */
export interface GenerateTestOptions {
	/** Source file path for test generation */
	sourceFile?: string;

	/** Task ID for task-based test generation */
	taskId?: string;

	/** Output directory (default: tests/) */
	outputDir?: string;

	/** Detail level: 'minimal' | 'standard' | 'comprehensive' */
	detailLevel?: TestDetailLevel;

	/** Test type: 'unit' | 'integration' | 'auto' */
	testType?: TestType;

	/** Use research model for AI (default: false) */
	useResearch?: boolean;

	/** Additional context for AI */
	additionalContext?: string;

	/** Overwrite existing test file (default: false) */
	overwrite?: boolean;

	/** Strategy for handling existing test files */
	strategy?: GenerateTestStrategy;

	/** Test framework (default: 'vitest') */
	framework?: TestFramework;

	/** Tag context for task operations */
	tag?: string;
}

/**
 * Test detail levels based on task complexity
 */
export type TestDetailLevel = 'minimal' | 'standard' | 'comprehensive';

/**
 * Test types
 */
export type TestType = 'unit' | 'integration' | 'auto';

/**
 * Supported test frameworks
 */
export type TestFramework = 'vitest' | 'jest' | 'mocha';

/**
 * Strategy for handling existing test files
 */
export type GenerateTestStrategy = 'overwrite' | 'append' | 'cancel';

/**
 * Result of test generation
 */
export interface GenerateTestResult {
	success: boolean;
	testFilePath?: string;
	testContent?: string;
	testCount?: number;
	error?: string;
	metadata: TestGenerationMetadata;
}

/**
 * Test generation metadata
 */
export interface TestGenerationMetadata {
	taskId?: string;
	sourceFile?: string;
	detailLevel: TestDetailLevel;
	testType: TestType;
	tokensUsed?: number;
	duration: number;
	timestamp: string;
}

/**
 * Task analysis result for test generation
 */
export interface TestAnalysisResult {
	task: Task;
	complexity: TaskComplexity;
	suggestedDetailLevel: TestDetailLevel;
	suggestedTestType: TestType;
	testableComponents: string[];
	mockRequirements: string[];
	importPaths: string[];
}

/**
 * Task complexity assessment
 */
export interface TaskComplexity {
	level: ComplexityLevel;
	score: number; // 0-100
	factors: ComplexityFactors;
}

/**
 * Complexity levels
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

/**
 * Factors contributing to complexity
 */
export interface ComplexityFactors {
	hasSubtasks: boolean;
	subtaskCount: number;
	hasDependencies: boolean;
	dependencyCount: number;
	hasTestStrategy: boolean;
	descriptionLength: number;
	detailsLength: number;
}

/**
 * AI prompt construction data
 */
export interface TestPromptData {
	task: Task;
	analysis: TestAnalysisResult;
	framework: TestFramework;
	detailLevel: TestDetailLevel;
	testType: TestType;
	additionalContext?: string;
}

/**
 * Test file entity
 */
export interface TestFileData {
	filePath: string;
	content: string;
	framework: TestFramework;
	testCount: number;
	imports: string[];
}

/**
 * Validation result for generated tests
 */
export interface TestValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

/**
 * Task context gathered for test generation
 */
export interface TaskContext {
	task: Task;
	analysis: TestAnalysisResult;
	relatedFiles: string[];
	dependencies: string[];
}

/**
 * Source file context for test generation
 */
export interface SourceContext {
	filePath: string;
	content: string;
	imports: string[];
	exports: string[];
}
