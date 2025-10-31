import type { TDDPhase, TestResult } from '../types.js';
import type { TestResultValidator } from '../services/test-result-validator.js';

/**
 * Context for phase validation
 */
export interface PhaseValidationContext {
	testResults: TestResult;
	previousTestResults?: TestResult;
	phase: TDDPhase;
	hasValidator: boolean;
}

/**
 * Response from phase validation
 */
export interface PhaseValidationResponse {
	valid: boolean;
	errors: string[];
	warnings?: string[];
	suggestions?: string[];
	shouldThrow: boolean;
}

/**
 * Orchestrates validation logic for TDD phase transitions
 *
 * This class provides a unified validation interface that:
 * 1. **Guards against critical errors** - Empty test suites are always rejected
 * 2. **Enables graceful degradation** - Works with or without TestResultValidator
 * 3. **Simplifies orchestration** - Single method with consistent response format
 * 4. **Provides decision support** - shouldThrow flag guides error handling
 *
 * The class exists as a wrapper (not redundant) because it:
 * - Adds pre-validation checks (empty test suite) before delegating
 * - Provides fallback validation when TestResultValidator unavailable
 * - Normalizes response format for workflow orchestration
 * - Decouples orchestrator from validation implementation details
 *
 * @example
 * ```typescript
 * const validator = new PhaseValidator();
 * const result = validator.validatePhase({
 *   testResults: { total: 5, passed: 0, failed: 5, skipped: 0, phase: 'RED' },
 *   phase: 'RED',
 *   hasValidator: true
 * }, testResultValidator);
 *
 * if (!result.valid && result.shouldThrow) {
 *   throw new WorkflowValidationError({ ...result, phase, testResults });
 * }
 * ```
 */
export class PhaseValidator {
	/**
	 * Validate test results for a TDD phase transition
	 *
	 * @param context - Validation context including test results and phase
	 * @param validator - Optional TestResultValidator for enhanced validation
	 * @returns Validation response with errors, warnings, and suggestions
	 */
	validatePhase(
		context: PhaseValidationContext,
		validator?: TestResultValidator
	): PhaseValidationResponse {
		// Empty test suite is always critical - cannot validate
		if (context.testResults.total === 0) {
			return {
				valid: false,
				errors: ['Cannot validate with empty test suite'],
				suggestions: ['Add at least one test before continuing'],
				shouldThrow: true
			};
		}

		// If validator is configured, use enhanced validation
		if (validator) {
			const result = validator.validatePhase(context.testResults, {
				phase: context.phase,
				previousTestCount: context.previousTestResults?.total
			});

			return {
				valid: result.valid,
				errors: result.errors,
				warnings: result.warnings,
				suggestions: result.suggestions,
				shouldThrow: !result.valid
			};
		}

		// Fallback to basic semantic validation
		return this.validateBasicSemantics(context);
	}

	/**
	 * Basic semantic validation without TestResultValidator
	 *
	 * @param context - Validation context
	 * @returns Validation response
	 */
	private validateBasicSemantics(
		context: PhaseValidationContext
	): PhaseValidationResponse {
		const errors: string[] = [];
		const warnings: string[] = [];
		const suggestions: string[] = [];

		if (context.phase === 'RED') {
			// RED phase should have failures (warning if not, allows "feature already implemented")
			if (context.testResults.failed === 0) {
				warnings.push('No failing tests found in RED phase');
				suggestions.push('Write failing tests first to follow TDD workflow');
			}
		} else if (context.phase === 'GREEN') {
			// GREEN phase must have zero failures
			if (context.testResults.failed > 0) {
				errors.push('GREEN phase must have zero failures');
				suggestions.push('Fix implementation to make all tests pass');
			}

			// GREEN phase must have at least one passing test
			if (context.testResults.passed === 0) {
				errors.push('GREEN phase must have at least one passing test');
				suggestions.push('Ensure tests exist and implementation makes them pass');
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			suggestions,
			shouldThrow: errors.length > 0
		};
	}
}
