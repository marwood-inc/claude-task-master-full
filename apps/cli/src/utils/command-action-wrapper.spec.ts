/**
 * @fileoverview Unit tests for CommandActionWrapper
 * Tests retry loop and error handling orchestration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandActionWrapper } from './command-action-wrapper.js';
import { TaskMasterError, ERROR_CODES } from '@tm/core';

describe('CommandActionWrapper', () => {
	let processExitSpy: ReturnType<typeof vi.spyOn>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		process.env.CI = 'true'; // Prevent interactive prompts
	});

	afterEach(() => {
		processExitSpy.mockRestore();
		consoleLogSpy.mockRestore();
		consoleErrorSpy.mockRestore();
		delete process.env.CI;
	});

	describe('executeWithErrorHandling', () => {
		it('should execute action successfully on first attempt', async () => {
			const action = vi.fn().mockResolvedValue('success');

			const result = await CommandActionWrapper.executeWithErrorHandling(
				action,
				{ commandName: 'test' }
			);

			expect(result).toBe('success');
			expect(action).toHaveBeenCalledTimes(1);
			expect(processExitSpy).not.toHaveBeenCalled();
		});

		it('should retry transient errors automatically', async () => {
			const action = vi
				.fn()
				.mockRejectedValueOnce(
					new TaskMasterError('Network error', ERROR_CODES.NETWORK_ERROR)
				)
				.mockResolvedValueOnce('success');

			const result = await CommandActionWrapper.executeWithErrorHandling(
				action,
				{
					commandName: 'test',
					maxRetries: 2,
					enableAutoRetry: true
				}
			);

			expect(result).toBe('success');
			expect(action).toHaveBeenCalledTimes(2);
		});

		it('should stop retrying after maxRetries exhausted', async () => {
			const action = vi.fn().mockRejectedValue(
				new TaskMasterError('Network error', ERROR_CODES.NETWORK_ERROR)
			);

			await expect(
				CommandActionWrapper.executeWithErrorHandling(action, {
					commandName: 'test',
					maxRetries: 2,
					enableAutoRetry: true
				})
			).rejects.toThrow();

			// Initial attempt + 2 retries = 3 attempts
			// Then safety check prevents more than maxRetries + 3 total
			expect(action.mock.calls.length).toBeLessThanOrEqual(5);
			expect(processExitSpy).toHaveBeenCalled();
		});

		it('should not retry non-retryable errors', async () => {
			const action = vi.fn().mockRejectedValue(
				new TaskMasterError('Invalid input', ERROR_CODES.VALIDATION_ERROR)
			);

			await expect(
				CommandActionWrapper.executeWithErrorHandling(action, {
					commandName: 'test',
					maxRetries: 2
				})
			).rejects.toThrow();

			expect(action).toHaveBeenCalledTimes(1);
			expect(processExitSpy).toHaveBeenCalled();
		});

		it('should call onError callback when provided', async () => {
			const onError = vi.fn();
			const error = new Error('Test error');
			const action = vi.fn().mockRejectedValue(error);

			await expect(
				CommandActionWrapper.executeWithErrorHandling(action, {
					commandName: 'test',
					maxRetries: 0,
					onError
				})
			).rejects.toThrow();

			expect(onError).toHaveBeenCalledWith(error);
		});

		it('should enforce maximum total attempts safety limit', async () => {
			const action = vi.fn().mockRejectedValue(
				new TaskMasterError('Network error', ERROR_CODES.NETWORK_ERROR)
			);

			await expect(
				CommandActionWrapper.executeWithErrorHandling(action, {
					commandName: 'test',
					maxRetries: 2 // maxRetries=2, safety allows maxRetries+3=5 total
				})
			).rejects.toThrow();

			// Should stop at safety limit: maxRetries (2) + 3 = 5 attempts
			expect(action.mock.calls.length).toBeLessThanOrEqual(5);
		});

		it('should handle errors thrown as strings', async () => {
			const action = vi.fn().mockRejectedValue('String error');

			await expect(
				CommandActionWrapper.executeWithErrorHandling(action, {
					commandName: 'test',
					maxRetries: 0
				})
			).rejects.toThrow();

			expect(processExitSpy).toHaveBeenCalled();
		});

		it('should increment attempt number correctly', async () => {
			const action = vi
				.fn()
				.mockRejectedValueOnce(
					new TaskMasterError('Network error', ERROR_CODES.NETWORK_ERROR)
				)
				.mockRejectedValueOnce(
					new TaskMasterError('Network error', ERROR_CODES.NETWORK_ERROR)
				)
				.mockResolvedValueOnce('success');

			const result = await CommandActionWrapper.executeWithErrorHandling(
				action,
				{
					commandName: 'test',
					maxRetries: 3
				}
			);

			expect(result).toBe('success');
			expect(action).toHaveBeenCalledTimes(3);
		});
	});
});
