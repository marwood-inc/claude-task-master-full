/**
 * Tests for GitHub Resilience Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubResilienceService } from './github-resilience.js';
import { GitHubRateLimitError } from '../clients/github-client.js';

describe('GitHubResilienceService', () => {
	let service: GitHubResilienceService;

	beforeEach(() => {
		service = new GitHubResilienceService({
			maxRetries: 3,
			initialDelayMs: 10, // Short delays for testing
			maxDelayMs: 100,
			backoffMultiplier: 2,
			jitterFactor: 0,
			circuitBreakerThreshold: 3,
			circuitBreakerResetMs: 100,
			autoHandleRateLimits: true,
			minRateLimitWaitMs: 10,
			maxRateLimitWaitMs: 1000
		});
	});

	describe('executeWithRetry', () => {
		it('should execute operation successfully on first try', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			const result = await service.executeWithRetry(operation);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should retry on retryable errors', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error('Network error'))
				.mockRejectedValueOnce(new Error('Network error'))
				.mockResolvedValue('success');

			const result = await service.executeWithRetry(operation);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(3);
		});

		it('should respect max retries', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Network error'));

			await expect(service.executeWithRetry(operation)).rejects.toThrow(
				'Network error'
			);

			// 1 initial + 3 retries
			expect(operation).toHaveBeenCalledTimes(4);
		});

		it('should not retry on non-retryable errors', async () => {
			const nonRetryableError = new Error('Not found');
			(nonRetryableError as any).statusCode = 404;

			const operation = vi.fn().mockRejectedValue(nonRetryableError);

			await expect(service.executeWithRetry(operation)).rejects.toThrow(
				'Not found'
			);

			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should handle rate limit errors automatically', async () => {
			const resetAt = new Date(Date.now() + 100);
			const rateLimitError = new GitHubRateLimitError(
				'Rate limit exceeded',
				resetAt,
				5000,
				0
			);

			const operation = vi
				.fn()
				.mockRejectedValueOnce(rateLimitError)
				.mockResolvedValue('success');

			const result = await service.executeWithRetry(operation);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(2);

			const stats = service.getStats();
			expect(stats.rateLimitHits).toBe(1);
		});

		it('should update statistics correctly', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error('Network error'))
				.mockResolvedValue('success');

			await service.executeWithRetry(operation);

			const stats = service.getStats();
			expect(stats.totalAttempts).toBe(2);
			expect(stats.successfulAttempts).toBe(1);
			expect(stats.retriedAttempts).toBe(1);
		});

		it('should track failed attempts', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Network error'));

			await expect(service.executeWithRetry(operation)).rejects.toThrow();

			const stats = service.getStats();
			expect(stats.failedAttempts).toBe(1);
			expect(stats.totalAttempts).toBe(4); // 1 initial + 3 retries
		});
	});

	describe('circuit breaker', () => {
		it('should open circuit after threshold failures', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Server error'));

			// Fail 3 times to open circuit
			for (let i = 0; i < 3; i++) {
				await expect(service.executeWithRetry(operation)).rejects.toThrow();
			}

			expect(service.getCircuitState()).toBe('open');

			const stats = service.getStats();
			expect(stats.circuitBreakerTrips).toBe(1);

			// Next attempt should immediately fail with circuit breaker error
			await expect(service.executeWithRetry(operation)).rejects.toThrow(
				'Circuit breaker is open'
			);
		});

		it('should move to half-open after reset time', async () => {
			const operation = vi
				.fn()
				.mockRejectedValue(new Error('Server error'));

			// Open circuit
			for (let i = 0; i < 3; i++) {
				await expect(service.executeWithRetry(operation)).rejects.toThrow();
			}

			expect(service.getCircuitState()).toBe('open');

			// Wait for circuit reset time
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Circuit should move to half-open on next attempt
			// But will fail because operation still fails
			await expect(service.executeWithRetry(operation)).rejects.toThrow(
				'Server error'
			);

			expect(service.getCircuitState()).toBe('open'); // Back to open after failed half-open attempt
		});

		it('should close circuit after successful half-open request', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Server error'));

			// Open circuit
			for (let i = 0; i < 3; i++) {
				await expect(service.executeWithRetry(operation)).rejects.toThrow();
			}

			expect(service.getCircuitState()).toBe('open');

			// Wait for circuit reset time
			await new Promise((resolve) => setTimeout(resolve, 150));

			// Now make operation succeed
			operation.mockResolvedValue('success');

			const result = await service.executeWithRetry(operation);

			expect(result).toBe('success');
			expect(service.getCircuitState()).toBe('closed');
		});

		it('should allow manual circuit reset', async () => {
			const operation = vi.fn().mockRejectedValue(new Error('Server error'));

			// Open circuit
			for (let i = 0; i < 3; i++) {
				await expect(service.executeWithRetry(operation)).rejects.toThrow();
			}

			expect(service.getCircuitState()).toBe('open');

			// Manually reset
			service.resetCircuitBreaker();

			expect(service.getCircuitState()).toBe('closed');

			// Should be able to make requests again
			operation.mockResolvedValue('success');
			const result = await service.executeWithRetry(operation);
			expect(result).toBe('success');
		});
	});

	describe('executeBatch', () => {
		it('should execute operations in batches', async () => {
			const operations = Array.from({ length: 10 }, (_, i) =>
				vi.fn().mockResolvedValue(`result-${i}`)
			);

			const results = await service.executeBatch(
				operations.map((op) => () => op()),
				{ concurrency: 3, delayBetweenBatches: 10 }
			);

			expect(results).toHaveLength(10);
			expect(results[0]).toBe('result-0');
			expect(results[9]).toBe('result-9');
		});

		it('should handle failures in batch operations', async () => {
			const operations = [
				vi.fn().mockResolvedValue('success-1'),
				vi
					.fn()
					.mockRejectedValueOnce(new Error('Network error'))
					.mockResolvedValue('success-2'),
				vi.fn().mockResolvedValue('success-3')
			];

			const results = await service.executeBatch(
				operations.map((op) => () => op()),
				{ concurrency: 2 }
			);

			expect(results).toHaveLength(3);
			expect(results[0]).toBe('success-1');
			expect(results[1]).toBe('success-2'); // Retried successfully
			expect(results[2]).toBe('success-3');
		});

		it('should throttle batch execution', async () => {
			const startTime = Date.now();
			const operations = Array.from({ length: 6 }, () =>
				vi.fn().mockResolvedValue('success')
			);

			await service.executeBatch(
				operations.map((op) => () => op()),
				{ concurrency: 2, delayBetweenBatches: 50 }
			);

			const duration = Date.now() - startTime;

			// With concurrency 2, 6 operations = 3 batches
			// Delay between 2 batches = 2 * 50ms = 100ms
			expect(duration).toBeGreaterThanOrEqual(100);
		});
	});

	describe('checkRateLimit', () => {
		it('should return true when rate limit is sufficient', async () => {
			const getRateLimitFn = vi.fn().mockResolvedValue({
				remaining: 4000,
				limit: 5000,
				reset: new Date(Date.now() + 3600000)
			});

			const result = await service.checkRateLimit(getRateLimitFn);

			expect(result).toBe(true);
		});

		it('should wait when rate limit is low', async () => {
			const getRateLimitFn = vi.fn().mockResolvedValue({
				remaining: 5,
				limit: 5000,
				reset: new Date(Date.now() + 100)
			});

			const startTime = Date.now();
			const result = await service.checkRateLimit(getRateLimitFn);
			const duration = Date.now() - startTime;

			expect(result).toBe(false);
			expect(duration).toBeGreaterThanOrEqual(10); // minRateLimitWaitMs
		});

		it('should handle rate limit check failure gracefully', async () => {
			const getRateLimitFn = vi.fn().mockRejectedValue(new Error('API error'));

			const result = await service.checkRateLimit(getRateLimitFn);

			expect(result).toBe(true); // Proceed anyway
		});
	});

	describe('statistics', () => {
		it('should track retry statistics', async () => {
			const operation = vi
				.fn()
				.mockRejectedValueOnce(new Error('Network error'))
				.mockRejectedValueOnce(new Error('Network error'))
				.mockResolvedValue('success');

			await service.executeWithRetry(operation);

			const stats = service.getStats();
			expect(stats.totalAttempts).toBe(3);
			expect(stats.successfulAttempts).toBe(1);
			expect(stats.retriedAttempts).toBe(1);
			expect(stats.averageRetryCount).toBe(2);
		});

		it('should reset statistics', async () => {
			const operation = vi.fn().mockResolvedValue('success');

			await service.executeWithRetry(operation);
			await service.executeWithRetry(operation);

			let stats = service.getStats();
			expect(stats.totalAttempts).toBe(2);

			service.resetStats();

			stats = service.getStats();
			expect(stats.totalAttempts).toBe(0);
			expect(stats.successfulAttempts).toBe(0);
		});
	});

	describe('configuration', () => {
		it('should use custom configuration', () => {
			const customService = new GitHubResilienceService({
				maxRetries: 5,
				initialDelayMs: 500
			});

			// Configuration is private, but we can test behavior
			expect(customService).toBeDefined();
		});

		it('should update configuration dynamically', async () => {
			service.updateConfig({
				maxRetries: 1
			});

			const operation = vi.fn().mockRejectedValue(new Error('Network error'));

			await expect(service.executeWithRetry(operation)).rejects.toThrow();

			// Should only try twice (1 initial + 1 retry)
			expect(operation).toHaveBeenCalledTimes(2);
		});
	});

	describe('exponential backoff', () => {
		it('should apply exponential backoff between retries', async () => {
			const delays: number[] = [];
			const startTimes: number[] = [];

			const operation = vi.fn().mockImplementation(() => {
				startTimes.push(Date.now());
				if (startTimes.length < 4) {
					return Promise.reject(new Error('Network error'));
				}
				return Promise.resolve('success');
			});

			await service.executeWithRetry(operation);

			// Calculate delays between attempts
			for (let i = 1; i < startTimes.length; i++) {
				delays.push(startTimes[i] - startTimes[i - 1]);
			}

			// Delays should increase (exponential backoff)
			// First delay ~10ms, second ~20ms, third ~40ms
			expect(delays[0]).toBeGreaterThanOrEqual(8);
			expect(delays[1]).toBeGreaterThanOrEqual(delays[0]);
			expect(delays[2]).toBeGreaterThanOrEqual(delays[1]);
		});
	});

	describe('error classification', () => {
		it('should retry on 5xx errors', async () => {
			const serverError = new Error('Internal server error');
			(serverError as any).statusCode = 500;

			const operation = vi
				.fn()
				.mockRejectedValueOnce(serverError)
				.mockResolvedValue('success');

			const result = await service.executeWithRetry(operation);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(2);
		});

		it('should not retry on 4xx errors (except 429)', async () => {
			const clientError = new Error('Not found');
			(clientError as any).statusCode = 404;

			const operation = vi.fn().mockRejectedValue(clientError);

			await expect(service.executeWithRetry(operation)).rejects.toThrow(
				'Not found'
			);

			expect(operation).toHaveBeenCalledTimes(1);
		});

		it('should retry on network errors', async () => {
			const networkError = new Error('ECONNRESET');

			const operation = vi
				.fn()
				.mockRejectedValueOnce(networkError)
				.mockResolvedValue('success');

			const result = await service.executeWithRetry(operation);

			expect(result).toBe('success');
			expect(operation).toHaveBeenCalledTimes(2);
		});
	});
});
