import { describe, it, expect } from 'vitest';
import { WorkflowValidationError } from './workflow-validation-error.js';
import {
	TaskMasterError,
	ERROR_CODES
} from '../../../common/errors/task-master-error.js';
import type { ValidationErrorDetails } from './workflow-validation-error.js';

describe('WorkflowValidationError', () => {
	describe('constructor', () => {
		it('should create error with valid ValidationErrorDetails', () => {
			const details: ValidationErrorDetails = {
				errors: ['RED phase must have at least one failing test'],
				warnings: ['Consider adding more test coverage'],
				suggestions: ['Write failing tests first to follow TDD workflow'],
				phase: 'RED',
				testResults: { total: 5, passed: 5, failed: 0, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error).toBeInstanceOf(WorkflowValidationError);
			expect(error).toBeInstanceOf(TaskMasterError);
			expect(error).toBeInstanceOf(Error);
			expect(error.details).toEqual(details);
			expect(error.phase).toBe('RED');
		});

		it('should set correct error name', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test error'],
				phase: 'GREEN',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.name).toBe('WorkflowValidationError');
		});

		it('should set correct error code', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test error'],
				phase: 'GREEN',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.code).toBe(ERROR_CODES.WORKFLOW_VALIDATION_ERROR);
		});

		it('should format message with phase and first error', () => {
			const details: ValidationErrorDetails = {
				errors: ['First error', 'Second error'],
				phase: 'RED',
				testResults: { total: 5, passed: 0, failed: 5, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.message).toBe('Validation failed in RED phase: First error');
		});

		it('should handle empty errors array with unknown error message', () => {
			const details: ValidationErrorDetails = {
				errors: [],
				phase: 'GREEN',
				testResults: { total: 5, passed: 5, failed: 0, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.message).toBe('Validation failed in GREEN phase: Unknown error');
		});

		it('should handle details without warnings and suggestions', () => {
			const details: ValidationErrorDetails = {
				errors: ['Critical error'],
				phase: 'COMMIT',
				testResults: { total: 10, passed: 10, failed: 0, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.details.warnings).toBeUndefined();
			expect(error.details.suggestions).toBeUndefined();
		});
	});

	describe('TaskMasterError integration', () => {
		it('should include validation details in error context', () => {
			const details: ValidationErrorDetails = {
				errors: ['Error 1', 'Error 2'],
				warnings: ['Warning 1'],
				suggestions: ['Suggestion 1'],
				phase: 'RED',
				testResults: { total: 5, passed: 0, failed: 5, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.context.details).toBeDefined();
			expect(error.context.details.errors).toEqual(details.errors);
			expect(error.context.details.warnings).toEqual(details.warnings);
			expect(error.context.details.suggestions).toEqual(details.suggestions);
			expect(error.context.details.testResults).toEqual(details.testResults);
		});

		it('should set operation context to workflowValidation', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test error'],
				phase: 'GREEN',
				testResults: { total: 1, passed: 1, failed: 0, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.context.operation).toBe('workflowValidation');
		});

		it('should provide user-friendly message in context', () => {
			const details: ValidationErrorDetails = {
				errors: ['Error 1', 'Error 2'],
				phase: 'RED',
				testResults: { total: 5, passed: 0, failed: 5, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.context.userMessage).toBe('Workflow validation failed: Error 1, Error 2');
		});

		it('should inherit getUserMessage method from TaskMasterError', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test error'],
				phase: 'GREEN',
				testResults: { total: 1, passed: 1, failed: 0, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);
			const userMessage = error.getUserMessage();

			expect(userMessage).toBe('Workflow validation failed: Test error');
		});

		it('should support toJSON serialization', () => {
			const details: ValidationErrorDetails = {
				errors: ['Serialization test'],
				phase: 'RED',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);
			const json = error.toJSON();

			expect(json.name).toBe('WorkflowValidationError');
			expect(json.code).toBe(ERROR_CODES.WORKFLOW_VALIDATION_ERROR);
			expect(json.message).toContain('Validation failed in RED phase');
			expect(json.context).toBeDefined();
		});

		it('should support toString method', () => {
			const details: ValidationErrorDetails = {
				errors: ['toString test'],
				phase: 'GREEN',
				testResults: { total: 1, passed: 1, failed: 0, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);
			const stringified = error.toString();

			expect(stringified).toContain('WorkflowValidationError');
			expect(stringified).toContain(ERROR_CODES.WORKFLOW_VALIDATION_ERROR);
			expect(stringified).toContain('workflowValidation');
		});
	});

	describe('instanceof checks', () => {
		it('should pass instanceof WorkflowValidationError', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test'],
				phase: 'RED',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error instanceof WorkflowValidationError).toBe(true);
		});

		it('should pass instanceof TaskMasterError', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test'],
				phase: 'RED',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error instanceof TaskMasterError).toBe(true);
		});

		it('should pass instanceof Error', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test'],
				phase: 'RED',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error instanceof Error).toBe(true);
		});
	});

	describe('different TDD phases', () => {
		it('should handle RED phase errors', () => {
			const details: ValidationErrorDetails = {
				errors: ['RED phase validation failed'],
				phase: 'RED',
				testResults: { total: 1, passed: 1, failed: 0, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.phase).toBe('RED');
			expect(error.message).toContain('RED phase');
		});

		it('should handle GREEN phase errors', () => {
			const details: ValidationErrorDetails = {
				errors: ['GREEN phase validation failed'],
				phase: 'GREEN',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.phase).toBe('GREEN');
			expect(error.message).toContain('GREEN phase');
		});

		it('should handle COMMIT phase errors', () => {
			const details: ValidationErrorDetails = {
				errors: ['COMMIT phase validation failed'],
				phase: 'COMMIT',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.phase).toBe('COMMIT');
			expect(error.message).toContain('COMMIT phase');
		});
	});

	describe('complex validation scenarios', () => {
		it('should handle multiple errors', () => {
			const details: ValidationErrorDetails = {
				errors: [
					'No failing tests in RED phase',
					'Test count is zero',
					'Coverage below threshold'
				],
				phase: 'RED',
				testResults: { total: 0, passed: 0, failed: 0, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.details.errors).toHaveLength(3);
			expect(error.message).toContain('No failing tests in RED phase');
		});

		it('should handle warnings and suggestions together', () => {
			const details: ValidationErrorDetails = {
				errors: ['Critical error'],
				warnings: ['Warning 1', 'Warning 2'],
				suggestions: ['Try this', 'Or try that'],
				phase: 'GREEN',
				testResults: { total: 5, passed: 4, failed: 1, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			expect(error.details.warnings).toHaveLength(2);
			expect(error.details.suggestions).toHaveLength(2);
		});

		it('should preserve all test result fields', () => {
			const testResults = {
				total: 100,
				passed: 95,
				failed: 3,
				skipped: 2,
				phase: 'GREEN' as const
			};

			const details: ValidationErrorDetails = {
				errors: ['Some failures remain'],
				phase: 'GREEN',
				testResults
			};

			const error = new WorkflowValidationError(details);

			expect(error.details.testResults).toEqual(testResults);
		});
	});

	describe('backward compatibility', () => {
		it('should maintain details property for backward compatibility', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test'],
				phase: 'RED',
				testResults: { total: 1, passed: 0, failed: 1, skipped: 0, phase: 'RED' }
			};

			const error = new WorkflowValidationError(details);

			// Direct access to details property should work (backward compatibility)
			expect(error.details).toBeDefined();
			expect(error.details.errors).toEqual(details.errors);
			expect(error.details.phase).toBe(details.phase);
			expect(error.details.testResults).toEqual(details.testResults);
		});

		it('should maintain phase property for backward compatibility', () => {
			const details: ValidationErrorDetails = {
				errors: ['Test'],
				phase: 'GREEN',
				testResults: { total: 1, passed: 1, failed: 0, skipped: 0, phase: 'GREEN' }
			};

			const error = new WorkflowValidationError(details);

			// Direct access to phase property should work (backward compatibility)
			expect(error.phase).toBe('GREEN');
		});
	});
});
