/**
 * GitHub Rate Limiting and Resilience Service
 * Implements retry logic, circuit breaker, and rate limit handling
 */

import { getLogger } from '../../../common/logger/index.js';
import { GitHubRateLimitError } from '../clients/github-client.js';

const logger = getLogger('GitHubResilience');

/**
 * Configuration for resilience strategies
 */
export interface ResilienceConfig {
	/**
	 * Maximum number of retry attempts
	 * @default 3
	 */
	maxRetries?: number;

	/**
	 * Initial delay in milliseconds for exponential backoff
	 * @default 1000
	 */
	initialDelayMs?: number;

	/**
	 * Maximum delay in milliseconds for exponential backoff
	 * @default 60000
	 */
	maxDelayMs?: number;

	/**
	 * Backoff multiplier for exponential backoff
	 * @default 2
	 */
	backoffMultiplier?: number;

	/**
	 * Add random jitter to delays (0-1, where 0.2 = 20% jitter)
	 * @default 0.1
	 */
	jitterFactor?: number;

	/**
	 * Circuit breaker: number of failures before opening circuit
	 * @default 5
	 */
	circuitBreakerThreshold?: number;

	/**
	 * Circuit breaker: time in milliseconds before trying to close circuit
	 * @default 60000
	 */
	circuitBreakerResetMs?: number;

	/**
	 * Whether to automatically handle rate limit errors
	 * @default true
	 */
	autoHandleRateLimits?: boolean;

	/**
	 * Minimum time to wait before rate limit resets (ms)
	 * @default 60000
	 */
	minRateLimitWaitMs?: number;

	/**
	 * Maximum time to wait before rate limit resets (ms)
	 * @default 3600000 (1 hour)
	 */
	maxRateLimitWaitMs?: number;
}

/**
 * Default resilience configuration
 */
const DEFAULT_CONFIG: Required<ResilienceConfig> = {
	maxRetries: 3,
	initialDelayMs: 1000,
	maxDelayMs: 60000,
	backoffMultiplier: 2,
	jitterFactor: 0.1,
	circuitBreakerThreshold: 5,
	circuitBreakerResetMs: 60000,
	autoHandleRateLimits: true,
	minRateLimitWaitMs: 60000,
	maxRateLimitWaitMs: 3600000
};

/**
 * Circuit breaker states
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Retry statistics for monitoring
 */
export interface RetryStats {
	totalAttempts: number;
	successfulAttempts: number;
	failedAttempts: number;
	retriedAttempts: number;
	rateLimitHits: number;
	circuitBreakerTrips: number;
	averageRetryCount: number;
}

/**
 * GitHub Resilience Service
 * Handles rate limiting, retries, and circuit breaking
 */
export class GitHubResilienceService {
	private config: Required<ResilienceConfig>;
	private circuitState: CircuitState = 'closed';
	private failureCount: number = 0;
	private lastFailureTime: number = 0;
	private nextCircuitResetTime: number = 0;

	// Statistics tracking
	private stats: RetryStats = {
		totalAttempts: 0,
		successfulAttempts: 0,
		failedAttempts: 0,
		retriedAttempts: 0,
		rateLimitHits: 0,
		circuitBreakerTrips: 0,
		averageRetryCount: 0
	};

	constructor(config?: ResilienceConfig) {
		this.config = {
			...DEFAULT_CONFIG,
			...config
		};

		logger.debug('GitHubResilienceService initialized', { config: this.config });
	}

	/**
	 * Execute an async operation with retry and resilience logic
	 */
	async executeWithRetry<T>(
		operation: () => Promise<T>,
		context?: string
	): Promise<T> {
		// Check circuit breaker
		this.checkCircuitBreaker();

		let lastError: Error | undefined;
		let attempt = 0;

		while (attempt <= this.config.maxRetries) {
			try {
				this.stats.totalAttempts++;

				// Execute the operation
				const result = await operation();

				// Success - record and reset failure count
				this.stats.successfulAttempts++;
				this.onSuccess();

				// Update average retry count
				if (attempt > 0) {
					this.stats.retriedAttempts++;
					this.updateAverageRetryCount(attempt);
				}

				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				attempt++;

				logger.debug('Operation failed', {
					context,
					attempt,
					maxRetries: this.config.maxRetries,
					error: lastError.message
				});

				// Handle rate limit errors specially
				if (this.isRateLimitError(lastError)) {
					this.stats.rateLimitHits++;

					if (this.config.autoHandleRateLimits) {
						await this.handleRateLimitError(lastError as GitHubRateLimitError);
						continue; // Don't count as retry attempt
					}
				}

				// If we've exhausted retries, throw
				if (attempt > this.config.maxRetries) {
					this.stats.failedAttempts++;
					this.onFailure();
					throw lastError;
				}

				// Determine if error is retryable
				if (!this.isRetryableError(lastError)) {
					this.stats.failedAttempts++;
					this.onFailure();
					throw lastError;
				}

				// Calculate delay with exponential backoff and jitter
				const delay = this.calculateDelay(attempt);

				logger.info('Retrying operation after delay', {
					context,
					attempt,
					delayMs: delay
				});

				// Wait before retrying
				await this.sleep(delay);
			}
		}

		// Should never reach here, but TypeScript needs it
		this.stats.failedAttempts++;
		this.onFailure();
		throw lastError!;
	}

	/**
	 * Execute multiple operations in parallel with rate limit awareness
	 * Automatically throttles to prevent hitting rate limits
	 */
	async executeBatch<T>(
		operations: Array<() => Promise<T>>,
		options?: {
			concurrency?: number;
			delayBetweenBatches?: number;
		}
	): Promise<T[]> {
		const concurrency = options?.concurrency ?? 5;
		const delayBetweenBatches = options?.delayBetweenBatches ?? 100;

		const results: T[] = [];
		const chunks: Array<Array<() => Promise<T>>> = [];

		// Split operations into chunks
		for (let i = 0; i < operations.length; i += concurrency) {
			chunks.push(operations.slice(i, i + concurrency));
		}

		logger.debug('Executing batch operations', {
			totalOperations: operations.length,
			chunks: chunks.length,
			concurrency
		});

		// Execute chunks sequentially, with delay between chunks
		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];

			// Execute chunk operations in parallel with retry
			const chunkResults = await Promise.all(
				chunk.map((op) => this.executeWithRetry(op, `batch-${i}`))
			);

			results.push(...chunkResults);

			// Add delay between chunks (except for last chunk)
			if (i < chunks.length - 1 && delayBetweenBatches > 0) {
				await this.sleep(delayBetweenBatches);
			}
		}

		return results;
	}

	/**
	 * Check rate limit status before making requests
	 */
	async checkRateLimit(
		getRateLimitFn: () => Promise<{
			remaining: number;
			reset: Date;
			limit: number;
		}>
	): Promise<boolean> {
		try {
			const rateLimit = await getRateLimitFn();

			logger.debug('Rate limit status', {
				remaining: rateLimit.remaining,
				limit: rateLimit.limit,
				resetAt: rateLimit.reset
			});

			// If we're close to rate limit, wait
			if (rateLimit.remaining < 10) {
				const waitMs = Math.max(
					this.config.minRateLimitWaitMs,
					Math.min(
						rateLimit.reset.getTime() - Date.now(),
						this.config.maxRateLimitWaitMs
					)
				);

				logger.warn('Rate limit approaching, waiting for reset', {
					remaining: rateLimit.remaining,
					waitMs
				});

				await this.sleep(waitMs);
				return false;
			}

			return true;
		} catch (error) {
			logger.warn('Failed to check rate limit', { error });
			return true; // Proceed anyway
		}
	}

	/**
	 * Get current statistics
	 */
	getStats(): RetryStats {
		return { ...this.stats };
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.stats = {
			totalAttempts: 0,
			successfulAttempts: 0,
			failedAttempts: 0,
			retriedAttempts: 0,
			rateLimitHits: 0,
			circuitBreakerTrips: 0,
			averageRetryCount: 0
		};

		logger.debug('Statistics reset');
	}

	/**
	 * Get current circuit breaker state
	 */
	getCircuitState(): CircuitState {
		return this.circuitState;
	}

	/**
	 * Manually reset circuit breaker
	 */
	resetCircuitBreaker(): void {
		this.circuitState = 'closed';
		this.failureCount = 0;
		this.lastFailureTime = 0;
		this.nextCircuitResetTime = 0;

		logger.info('Circuit breaker manually reset');
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<ResilienceConfig>): void {
		this.config = {
			...this.config,
			...config
		};

		logger.info('Resilience configuration updated', { config: this.config });
	}

	// ==================== Private Methods ====================

	/**
	 * Check if circuit breaker allows requests
	 */
	private checkCircuitBreaker(): void {
		const now = Date.now();

		if (this.circuitState === 'open') {
			// Check if it's time to try half-open
			if (now >= this.nextCircuitResetTime) {
				this.circuitState = 'half-open';
				logger.info('Circuit breaker moving to half-open state');
			} else {
				const error = new Error('Circuit breaker is open');
				error.name = 'CircuitBreakerError';
				throw error;
			}
		}
	}

	/**
	 * Handle successful operation
	 */
	private onSuccess(): void {
		if (this.circuitState === 'half-open') {
			this.circuitState = 'closed';
			this.failureCount = 0;
			logger.info('Circuit breaker closed after successful request');
		}
	}

	/**
	 * Handle failed operation
	 */
	private onFailure(): void {
		this.failureCount++;
		this.lastFailureTime = Date.now();

		if (this.failureCount >= this.config.circuitBreakerThreshold) {
			this.circuitState = 'open';
			this.nextCircuitResetTime = Date.now() + this.config.circuitBreakerResetMs;
			this.stats.circuitBreakerTrips++;

			logger.warn('Circuit breaker opened due to failures', {
				failureCount: this.failureCount,
				resetAt: new Date(this.nextCircuitResetTime)
			});
		}
	}

	/**
	 * Check if error is a rate limit error
	 */
	private isRateLimitError(error: Error): boolean {
		return (
			error instanceof GitHubRateLimitError ||
			error.name === 'GitHubRateLimitError' ||
			error.message.includes('rate limit')
		);
	}

	/**
	 * Check if error is retryable
	 */
	private isRetryableError(error: Error): boolean {
		// Rate limit errors are handled separately
		if (this.isRateLimitError(error)) {
			return true;
		}

		// Network errors are retryable
		if (
			error.name === 'RequestError' ||
			error.message.includes('ECONNRESET') ||
			error.message.includes('Network error') ||
			error.message.includes('ETIMEDOUT') ||
			error.message.includes('ENOTFOUND')
		) {
			return true;
		}

		// 5xx server errors are retryable
		if ('statusCode' in error) {
			const statusCode = (error as any).statusCode;
			return statusCode >= 500 && statusCode < 600;
		}

		// 429 Too Many Requests (should be caught as rate limit, but just in case)
		if ('statusCode' in error && (error as any).statusCode === 429) {
			return true;
		}

		return false;
	}

	/**
	 * Handle rate limit error
	 */
	private async handleRateLimitError(error: GitHubRateLimitError): Promise<void> {
		const waitMs = Math.max(
			this.config.minRateLimitWaitMs,
			Math.min(
				error.resetAt.getTime() - Date.now(),
				this.config.maxRateLimitWaitMs
			)
		);

		logger.warn('Rate limit exceeded, waiting for reset', {
			resetAt: error.resetAt,
			waitMs
		});

		await this.sleep(waitMs);
	}

	/**
	 * Calculate delay for retry attempt with exponential backoff and jitter
	 */
	private calculateDelay(attempt: number): number {
		// Calculate exponential backoff
		const exponentialDelay = Math.min(
			this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1),
			this.config.maxDelayMs
		);

		// Add jitter
		const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
		const delay = exponentialDelay + jitter;

		return Math.floor(delay);
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Update average retry count
	 */
	private updateAverageRetryCount(retryCount: number): void {
		const totalRetries =
			this.stats.averageRetryCount * (this.stats.retriedAttempts - 1) + retryCount;
		this.stats.averageRetryCount = totalRetries / this.stats.retriedAttempts;
	}
}

/**
 * Create a resilience service with default configuration
 */
export function createResilienceService(
	config?: ResilienceConfig
): GitHubResilienceService {
	return new GitHubResilienceService(config);
}
