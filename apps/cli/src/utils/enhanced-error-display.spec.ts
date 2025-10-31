/**
 * @fileoverview Unit tests for EnhancedErrorDisplay
 * Tests error display formatting and guidance generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedErrorDisplay } from './enhanced-error-display.js';
import { TaskMasterError, ERROR_CODES } from '@tm/core';
import { CliErrorType, CLI_EXIT_CODES } from './cli-error-types.js';

describe('EnhancedErrorDisplay', () => {
	let processExitSpy: ReturnType<typeof vi.spyOn>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		processExitSpy.mockRestore();
		consoleLogSpy.mockRestore();
	});

	describe('displayAndExit', () => {
		it('should exit with correct code for validation errors', () => {
			const error = new TaskMasterError(
				'Invalid input',
				ERROR_CODES.VALIDATION_ERROR
			);

			expect(() =>
				EnhancedErrorDisplay.displayAndExit(error, false)
			).toThrow();

			expect(processExitSpy).toHaveBeenCalledWith(
				CLI_EXIT_CODES.VALIDATION_ERROR
			);
		});

		it('should exit with correct code for network errors', () => {
			const error = new TaskMasterError(
				'Connection failed',
				ERROR_CODES.NETWORK_ERROR
			);

			expect(() =>
				EnhancedErrorDisplay.displayAndExit(error, false)
			).toThrow();

			expect(processExitSpy).toHaveBeenCalledWith(
				CLI_EXIT_CODES.NETWORK_ERROR
			);
		});

		it('should exit with correct code for authentication errors', () => {
			const error = new TaskMasterError(
				'Invalid token',
				ERROR_CODES.AUTHENTICATION_ERROR
			);

			expect(() =>
				EnhancedErrorDisplay.displayAndExit(error, false)
			).toThrow();

			expect(processExitSpy).toHaveBeenCalledWith(
				CLI_EXIT_CODES.AUTHENTICATION_ERROR
			);
		});

		it('should exit with correct code for rate limit errors', () => {
			const error = new TaskMasterError(
				'Rate limit exceeded',
				ERROR_CODES.RATE_LIMIT_ERROR
			);

			expect(() =>
				EnhancedErrorDisplay.displayAndExit(error, false)
			).toThrow();

			expect(processExitSpy).toHaveBeenCalledWith(
				CLI_EXIT_CODES.RATE_LIMIT_ERROR
			);
		});

		it('should skip exit when skipExit is true', () => {
			const error = new Error('Test error');

			expect(() =>
				EnhancedErrorDisplay.displayAndExit(error, true)
			).toThrow('Should not reach here');

			expect(processExitSpy).not.toHaveBeenCalled();
		});

		it('should display error header', () => {
			const error = new Error('Test error');

			expect(() =>
				EnhancedErrorDisplay.displayAndExit(error, true)
			).toThrow();

			expect(consoleLogSpy).toHaveBeenCalled();
		});
	});

	describe('display', () => {
		it('should display error without exiting', () => {
			const error = new TaskMasterError(
				'Test error',
				ERROR_CODES.VALIDATION_ERROR
			);

			const result = EnhancedErrorDisplay.display(error);

			expect(result.type).toBe(CliErrorType.VALIDATION);
			expect(processExitSpy).not.toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalled();
		});

		it('should return categorized error', () => {
			const error = new Error('Network error: ECONNREFUSED');

			const result = EnhancedErrorDisplay.display(error);

			expect(result.type).toBe(CliErrorType.NETWORK);
			expect(result.exitCode).toBe(CLI_EXIT_CODES.NETWORK_ERROR);
		});
	});

	describe('formatForLogging', () => {
		it('should format error with type and exit code', () => {
			const error = new TaskMasterError(
				'Test error',
				ERROR_CODES.VALIDATION_ERROR
			);
			const categorized = EnhancedErrorDisplay.display(error);

			const formatted = EnhancedErrorDisplay.formatForLogging(categorized);

			expect(formatted).toContain('validation');
			expect(formatted).toContain('2');
			expect(formatted).toContain('Test error');
		});

		it('should include stack trace when available', () => {
			const error = new Error('Test error with stack');
			const categorized = EnhancedErrorDisplay.display(error);

			const formatted = EnhancedErrorDisplay.formatForLogging(categorized);

			expect(formatted).toContain('Error: Test error with stack');
			expect(formatted.includes('at ')).toBe(true);
		});

		it('should handle errors without stack trace', () => {
			const error = { message: 'Plain object error' };
			const categorized = EnhancedErrorDisplay.display(error);

			const formatted = EnhancedErrorDisplay.formatForLogging(categorized);

			expect(formatted).toBeTruthy();
			expect(formatted).toContain('unknown');
		});
	});

	describe('type-specific guidance', () => {
		it('should display validation error guidance', () => {
			const error = new TaskMasterError(
				'Invalid input',
				ERROR_CODES.VALIDATION_ERROR
			);

			EnhancedErrorDisplay.display(error);

			const calls = consoleLogSpy.mock.calls.flat().join(' ');
			expect(calls).toContain('--help');
		});

		it('should display authentication error guidance', () => {
			const error = new TaskMasterError(
				'Invalid token',
				ERROR_CODES.AUTHENTICATION_ERROR
			);

			EnhancedErrorDisplay.display(error);

			const calls = consoleLogSpy.mock.calls.flat().join(' ');
			expect(calls).toContain('tm github configure');
			expect(calls).toContain('github.com/settings/tokens');
		});

		it('should display network error guidance', () => {
			const error = new TaskMasterError(
				'Connection failed',
				ERROR_CODES.NETWORK_ERROR
			);

			EnhancedErrorDisplay.display(error);

			const calls = consoleLogSpy.mock.calls.flat().join(' ');
			expect(calls).toContain('internet connection');
			expect(calls).toContain('githubstatus.com');
		});

		it('should display rate limit error guidance', () => {
			const error = new TaskMasterError(
				'Rate limit exceeded',
				ERROR_CODES.RATE_LIMIT_ERROR
			);

			EnhancedErrorDisplay.display(error);

			const calls = consoleLogSpy.mock.calls.flat().join(' ');
			expect(calls).toContain('rate limit');
			expect(calls).toContain('personal access token');
		});
	});
});
