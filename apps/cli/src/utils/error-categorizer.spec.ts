/**
 * @fileoverview Unit tests for ErrorCategorizer
 * Tests error categorization logic for various error types
 */

import { describe, it, expect } from 'vitest';
import { ErrorCategorizer } from './error-categorizer.js';
import { TaskMasterError, ERROR_CODES } from '@tm/core';
import { CliErrorType, CLI_EXIT_CODES } from './cli-error-types.js';

describe('ErrorCategorizer', () => {
	describe('TaskMasterError categorization', () => {
		it('should categorize validation errors correctly', () => {
			const error = new TaskMasterError(
				'Invalid task ID format',
				ERROR_CODES.VALIDATION_ERROR
			);

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.VALIDATION);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.VALIDATION_ERROR);
			expect(result.isRetryable).toBe(false);
			expect(result.isTransient).toBe(false);
		});

		it('should categorize network errors correctly', () => {
			const error = new TaskMasterError(
				'Network connection failed',
				ERROR_CODES.NETWORK_ERROR
			);

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.NETWORK);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.NETWORK_ERROR);
			expect(result.isRetryable).toBe(true);
			expect(result.isTransient).toBe(true);
		});

		it('should categorize authentication errors correctly', () => {
			const error = new TaskMasterError(
				'Invalid GitHub token',
				ERROR_CODES.AUTHENTICATION_ERROR
			);

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.AUTHENTICATION);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.AUTHENTICATION_ERROR);
			expect(result.isRetryable).toBe(false);
			expect(result.isTransient).toBe(false);
		});

		it('should categorize authorization errors correctly', () => {
			const error = new TaskMasterError(
				'Insufficient permissions',
				ERROR_CODES.AUTHORIZATION_ERROR
			);

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.AUTHORIZATION);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.AUTHORIZATION_ERROR);
			expect(result.isRetryable).toBe(false);
			expect(result.isTransient).toBe(false);
		});

		it('should categorize rate limit errors correctly', () => {
			const error = new TaskMasterError(
				'Rate limit exceeded',
				ERROR_CODES.RATE_LIMIT_ERROR
			);

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.RATE_LIMIT);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.RATE_LIMIT_ERROR);
			expect(result.isRetryable).toBe(true);
			expect(result.isTransient).toBe(false);
		});

		it('should categorize unknown TaskMasterError codes as unknown', () => {
			const error = new TaskMasterError('Unknown error', 'UNKNOWN_CODE');

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.UNKNOWN);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.GENERIC_ERROR);
		});
	});

	describe('Generic Error categorization', () => {
		it('should categorize network errors from message patterns', () => {
			const error = new Error('ECONNREFUSED: Connection refused');

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.NETWORK);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.NETWORK_ERROR);
			expect(result.isTransient).toBe(true);
		});

		it('should categorize timeout errors as network errors', () => {
			const error = new Error('Request timeout');

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.NETWORK);
			expect(result.isTransient).toBe(true);
		});

		it('should categorize authentication errors from message patterns', () => {
			const error = new Error('401 Unauthorized');

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.AUTHENTICATION);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.AUTHENTICATION_ERROR);
		});

		it('should categorize authorization errors from message patterns', () => {
			const error = new Error('403 Forbidden');

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.AUTHORIZATION);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.AUTHORIZATION_ERROR);
		});

		it('should categorize rate limit errors from message patterns', () => {
			const error = new Error('API rate limit exceeded');

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.RATE_LIMIT);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.RATE_LIMIT_ERROR);
		});

		it('should categorize unknown errors as unknown type', () => {
			const error = new Error('Something went wrong');

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.UNKNOWN);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.GENERIC_ERROR);
		});
	});

	describe('String error categorization', () => {
		it('should categorize string errors as unknown', () => {
			const error = 'String error message';

			const result = ErrorCategorizer.categorize(error);

			expect(result.type).toBe(CliErrorType.UNKNOWN);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.GENERIC_ERROR);
			expect(result.message).toBe('String error message');
		});
	});

	describe('Error properties', () => {
		it('should preserve original error', () => {
			const originalError = new Error('Test error');
			const result = ErrorCategorizer.categorize(originalError);

			expect(result.originalError).toBe(originalError);
		});

		it('should generate user-friendly messages', () => {
			const error = new TaskMasterError(
				'Invalid task ID',
				ERROR_CODES.VALIDATION_ERROR
			);

			const result = ErrorCategorizer.categorize(error);

			expect(result.userMessage).toBeTruthy();
			expect(result.userMessage).not.toBe(error.message);
		});

		it('should mark network errors as both retryable and transient', () => {
			const error = new Error('ECONNRESET');

			const result = ErrorCategorizer.categorize(error);

			expect(result.isRetryable).toBe(true);
			expect(result.isTransient).toBe(true);
		});

		it('should mark rate limit errors as retryable but not transient', () => {
			const error = new TaskMasterError(
				'Rate limit',
				ERROR_CODES.RATE_LIMIT_ERROR
			);

			const result = ErrorCategorizer.categorize(error);

			expect(result.isRetryable).toBe(true);
			expect(result.isTransient).toBe(false);
		});

		it('should mark validation errors as neither retryable nor transient', () => {
			const error = new TaskMasterError(
				'Invalid input',
				ERROR_CODES.VALIDATION_ERROR
			);

			const result = ErrorCategorizer.categorize(error);

			expect(result.isRetryable).toBe(false);
			expect(result.isTransient).toBe(false);
		});
	});
});
