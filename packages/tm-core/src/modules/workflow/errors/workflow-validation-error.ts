import type { TDDPhase, TestResult } from '../types.js';
import {
	TaskMasterError,
	ERROR_CODES
} from '../../../common/errors/task-master-error.js';

/**
 * Details about a validation failure
 */
export interface ValidationErrorDetails {
	errors: string[];
	warnings?: string[];
	suggestions?: string[];
	phase: TDDPhase;
	testResults: TestResult;
}

/**
 * Error thrown when test result validation fails during TDD phase transitions
 *
 * This error extends TaskMasterError to provide rich error handling capabilities
 * including error codes, context, and serialization support.
 *
 * This error includes structured information about what went wrong and
 * how to fix it, making it easier for developers to understand and resolve
 * validation issues.
 *
 * @example
 * ```typescript
 * throw new WorkflowValidationError({
 *   errors: ['RED phase must have at least one failing test'],
 *   warnings: [],
 *   suggestions: ['Write failing tests first to follow TDD workflow'],
 *   phase: 'RED',
 *   testResults: { total: 5, passed: 5, failed: 0, skipped: 0, phase: 'RED' }
 * });
 * ```
 */
export class WorkflowValidationError extends TaskMasterError {
	public readonly details: ValidationErrorDetails;
	public readonly phase: TDDPhase;

	constructor(details: ValidationErrorDetails) {
		super(
			`Validation failed in ${details.phase} phase: ${details.errors[0] || 'Unknown error'}`,
			ERROR_CODES.WORKFLOW_VALIDATION_ERROR,
			{
				operation: 'workflowValidation',
				details: {
					errors: details.errors,
					warnings: details.warnings,
					suggestions: details.suggestions,
					testResults: details.testResults
				},
				userMessage: `Workflow validation failed: ${details.errors.join(', ')}`
			}
		);

		this.details = details;
		this.phase = details.phase;
		this.name = 'WorkflowValidationError';

		// Maintain prototype chain for instanceof checks
		Object.setPrototypeOf(this, WorkflowValidationError.prototype);
	}
}
