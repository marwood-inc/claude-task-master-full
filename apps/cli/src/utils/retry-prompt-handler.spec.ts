/**
 * @fileoverview Unit tests for RetryPromptHandler
 * Tests automatic retry logic and exponential backoff
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RetryPromptHandler } from './retry-prompt-handler.js';
import { CliErrorType, type CategorizedCliError } from './cli-error-types.js';

describe('RetryPromptHandler', () => {
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
	});

	describe('handleRetry', () => {
		it('should not retry non-retryable errors', async () => {
			const error: CategorizedCliError = {
				type: CliErrorType.VALIDATION,
				message: 'Validation failed',
				userMessage: 'Invalid input',
				exitCode: 2,
				isRetryable: false,
				isTransient: false
			};

			const result = await RetryPromptHandler.handleRetry(error, 1);

			expect(result.shouldRetry).toBe(false);
			expect(result.delayMs).toBe(0);
			expect(result.userInitiated).toBe(false);
		});

		it('should auto-retry transient errors within max attempts', async () => {
			const error: CategorizedCliError = {
				type: CliErrorType.NETWORK,
				message: 'Connection failed',
				userMessage: 'Network error',
				exitCode: 3,
				isRetryable: true,
				isTransient: true
			};

			const result = await RetryPromptHandler.handleRetry(error, 1, {
				maxAutoRetries: 2,
				initialDelayMs: 1000,
				backoffMultiplier: 2
			});

			expect(result.shouldRetry).toBe(true);
			expect(result.delayMs).toBe(1000); // First retry: 1000ms
			expect(result.userInitiated).toBe(false);
		});

		it('should use exponential backoff for retries', async () => {
			const error: CategorizedCliError = {
				type: CliErrorType.NETWORK,
				message: 'Connection failed',
				userMessage: 'Network error',
				exitCode: 3,
				isRetryable: true,
				isTransient: true
			};

			// First attempt (attemptNumber=1): 1000 * 2^0 = 1000ms
			const result1 = await RetryPromptHandler.handleRetry(error, 1, {
				maxAutoRetries: 3,
				initialDelayMs: 1000,
				backoffMultiplier: 2
			});
			expect(result1.delayMs).toBe(1000);

			// Second attempt (attemptNumber=2): 1000 * 2^1 = 2000ms
			const result2 = await RetryPromptHandler.handleRetry(error, 2, {
				maxAutoRetries: 3,
				initialDelayMs: 1000,
				backoffMultiplier: 2
			});
			expect(result2.delayMs).toBe(2000);

			// Third attempt (attemptNumber=3): 1000 * 2^2 = 4000ms
			const result3 = await RetryPromptHandler.handleRetry(error, 3, {
				maxAutoRetries: 3,
				initialDelayMs: 1000,
				backoffMultiplier: 2
			});
			expect(result3.delayMs).toBe(4000);
		});

		it('should stop auto-retrying after maxAutoRetries', async () => {
			const error: CategorizedCliError = {
				type: CliErrorType.NETWORK,
				message: 'Connection failed',
				userMessage: 'Network error',
				exitCode: 3,
				isRetryable: true,
				isTransient: true
			};

			// Mock user declining retry
			vi.mock('inquirer', () => ({
				default: {
					prompt: vi.fn().mockResolvedValue({ retry: false })
				}
			}));

			const result = await RetryPromptHandler.handleRetry(error, 3, {
				maxAutoRetries: 2,
				initialDelayMs: 1000,
				backoffMultiplier: 2
			});

			// Should not auto-retry (exceeded maxAutoRetries)
			// Would prompt user, but in test env with CI=true, should return false
			expect(result.shouldRetry).toBe(false);
		});
	});

	describe('exponential backoff calculation', () => {
		it('should calculate correct delays', async () => {
			const error: CategorizedCliError = {
				type: CliErrorType.NETWORK,
				message: 'Connection failed',
				userMessage: 'Network error',
				exitCode: 3,
				isRetryable: true,
				isTransient: true
			};

			const config = {
				maxAutoRetries: 5,
				initialDelayMs: 500,
				backoffMultiplier: 3
			};

			// Attempt 1: 500 * 3^0 = 500ms
			const r1 = await RetryPromptHandler.handleRetry(error, 1, config);
			expect(r1.delayMs).toBe(500);

			// Attempt 2: 500 * 3^1 = 1500ms
			const r2 = await RetryPromptHandler.handleRetry(error, 2, config);
			expect(r2.delayMs).toBe(1500);

			// Attempt 3: 500 * 3^2 = 4500ms
			const r3 = await RetryPromptHandler.handleRetry(error, 3, config);
			expect(r3.delayMs).toBe(4500);
		});
	});

	describe('sleep utility', () => {
		it('should wait for specified milliseconds', async () => {
			const start = Date.now();
			await RetryPromptHandler.sleep(100);
			const elapsed = Date.now() - start;

			// Allow some tolerance for timing
			expect(elapsed).toBeGreaterThanOrEqual(95);
			expect(elapsed).toBeLessThan(150);
		});
	});

	describe('CI environment handling', () => {
		let originalCI: string | undefined;

		beforeEach(() => {
			originalCI = process.env.CI;
		});

		afterEach(() => {
			if (originalCI === undefined) {
				delete process.env.CI;
			} else {
				process.env.CI = originalCI;
			}
		});

		it('should not prompt in CI environment', async () => {
			process.env.CI = 'true';

			const error: CategorizedCliError = {
				type: CliErrorType.NETWORK,
				message: 'Connection failed',
				userMessage: 'Network error',
				exitCode: 3,
				isRetryable: true,
				isTransient: false // Not transient, would normally prompt
			};

			const result = await RetryPromptHandler.handleRetry(error, 1, {
				maxAutoRetries: 0
			});

			expect(result.shouldRetry).toBe(false);
			expect(result.userInitiated).toBe(false);
		});
	});
});
