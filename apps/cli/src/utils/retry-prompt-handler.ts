/**
 * @fileoverview Retry Prompt Handler
 * Handles automatic retry with exponential backoff and user prompts
 * Determines when to retry automatically vs when to prompt user
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { type CategorizedCliError } from './cli-error-types.js';

/**
 * Configuration for automatic retry behavior
 */
export interface AutoRetryConfig {
	/** Maximum automatic retries before prompting user */
	maxAutoRetries: number;
	/** Initial delay in milliseconds */
	initialDelayMs: number;
	/** Backoff multiplier for exponential backoff */
	backoffMultiplier: number;
}

/**
 * Retry result with decision and delay
 */
export interface RetryResult {
	/** Whether to retry the operation */
	shouldRetry: boolean;
	/** Delay in milliseconds before retry */
	delayMs: number;
	/** Whether retry was user-initiated (vs automatic) */
	userInitiated: boolean;
}

/**
 * Handles retry prompts and automatic retry logic for CLI commands
 * Implements exponential backoff and user interaction
 */
export class RetryPromptHandler {
	private static readonly DEFAULT_CONFIG: AutoRetryConfig = {
		maxAutoRetries: 2,
		initialDelayMs: 1000,
		backoffMultiplier: 2
	};

	/**
	 * Determine if should retry based on error and show appropriate prompt
	 * Uses exponential backoff for automatic retries, then prompts user
	 *
	 * @param error - Categorized error to handle
	 * @param attemptNumber - Current attempt number (1-indexed)
	 * @param config - Optional retry configuration
	 * @returns Retry decision with delay information
	 */
	static async handleRetry(
		error: CategorizedCliError,
		attemptNumber: number,
		config?: Partial<AutoRetryConfig>
	): Promise<RetryResult> {
		const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

		// Not retryable - fail immediately
		if (!error.isRetryable) {
			return { shouldRetry: false, delayMs: 0, userInitiated: false };
		}

		// Auto-retry with exponential backoff for transient errors
		if (error.isTransient && attemptNumber <= finalConfig.maxAutoRetries) {
			const delayMs = this.calculateExponentialBackoff(
				attemptNumber,
				finalConfig.initialDelayMs,
				finalConfig.backoffMultiplier
			);

			console.log();
			console.log(
				chalk.yellow(
					`Attempt ${attemptNumber}/${finalConfig.maxAutoRetries + 1} failed. ` +
						`Retrying in ${Math.ceil(delayMs / 1000)} seconds...`
				)
			);

			return { shouldRetry: true, delayMs, userInitiated: false };
		}

		// Exhausted auto-retries or permanent error - prompt user
		return this.promptUserForRetry(error, attemptNumber);
	}

	/**
	 * Prompt user if they want to retry after failure
	 * Provides context-specific guidance based on error type
	 */
	private static async promptUserForRetry(
		error: CategorizedCliError,
		attemptNumber: number
	): Promise<RetryResult> {
		console.log();
		console.log(chalk.red.bold('Error:'), error.userMessage);

		const guidance = this.getRetryGuidance(error);
		if (guidance) {
			console.log(chalk.yellow(`\n${guidance}`));
		}

		// Skip prompt in CI/CD environments
		if (process.env.CI) {
			console.log(
				chalk.dim('\nRunning in CI environment - not prompting for retry')
			);
			return { shouldRetry: false, delayMs: 0, userInitiated: false };
		}

		const answer = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'retry',
				message: 'Would you like to retry?',
				default: error.isTransient ? true : false
			}
		]);

		if (answer.retry) {
			console.log(chalk.cyan('\nRetrying...'));
			return { shouldRetry: true, delayMs: 0, userInitiated: true };
		}

		return { shouldRetry: false, delayMs: 0, userInitiated: false };
	}

	/**
	 * Get actionable guidance for retryable errors
	 * Provides specific advice based on error type
	 */
	private static getRetryGuidance(
		error: CategorizedCliError
	): string | null {
		switch (error.type) {
			case 'network':
				return (
					'This appears to be a temporary network issue.\n' +
					'  • Check your internet connection\n' +
					'  • Verify GitHub is accessible\n' +
					'  • Try again in a moment'
				);

			case 'rate-limit':
				return (
					'GitHub API rate limit has been exceeded.\n' +
					'  • Wait for the rate limit to reset\n' +
					'  • Use a token with higher rate limits (GitHub Pro)\n' +
					'  • Reduce the number of tasks being synced'
				);

			default:
				return null;
		}
	}

	/**
	 * Calculate exponential backoff delay
	 * Implements standard exponential backoff: initialDelay * multiplier^(attempt-1)
	 *
	 * @param attemptNumber - Current attempt number (1-indexed)
	 * @param initialDelayMs - Initial delay in milliseconds
	 * @param multiplier - Backoff multiplier
	 * @returns Calculated delay in milliseconds
	 */
	private static calculateExponentialBackoff(
		attemptNumber: number,
		initialDelayMs: number,
		multiplier: number
	): number {
		return initialDelayMs * Math.pow(multiplier, attemptNumber - 1);
	}

	/**
	 * Wait for specified milliseconds
	 * Promise-based sleep utility
	 *
	 * @param ms - Milliseconds to wait
	 */
	static sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
