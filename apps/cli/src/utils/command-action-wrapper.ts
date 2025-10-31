/**
 * @fileoverview Command Action Wrapper
 * Wraps command action methods with error handling, retry logic, and user prompts
 * Provides pragmatic error handling for CLI commands
 */

import { RetryPromptHandler } from './retry-prompt-handler.js';
import { ErrorCategorizer } from './error-categorizer.js';
import { EnhancedErrorDisplay } from './enhanced-error-display.js';

/**
 * Options for command action wrapper
 */
export interface CommandActionWrapperOptions {
	/** Command name for logging and error context */
	commandName: string;
	/** Maximum number of retry attempts (default: 2) */
	maxRetries?: number;
	/** Enable automatic retry with exponential backoff (default: true) */
	enableAutoRetry?: boolean;
	/** Optional error callback for logging */
	onError?: (error: Error) => void;
}

/**
 * Wraps command action methods with error handling, retry logic, and user prompts
 * Provides pragmatic error handling for CLI commands like sync and configure
 *
 * @example
 * ```typescript
 * await CommandActionWrapper.executeWithErrorHandling(
 *   async () => this.performSync(options),
 *   { commandName: 'sync', maxRetries: 3 }
 * );
 * ```
 */
export class CommandActionWrapper {
	/**
	 * Execute a command action with error handling and retry support
	 * Implements automatic retries, user prompts, and graceful error handling
	 *
	 * @param action - The async action to execute (command logic)
	 * @param options - Configuration for retry and error handling
	 * @returns Result from successful action execution
	 */
	static async executeWithErrorHandling<T>(
		action: () => Promise<T>,
		options: CommandActionWrapperOptions
	): Promise<T> {
		const maxRetries = options.maxRetries ?? 2;
		let attemptNumber = 1;

		while (true) {
			try {
				// Execute the command action
				return await action();
			} catch (error) {
				// Call error callback if provided
				if (options.onError && error instanceof Error) {
					options.onError(error);
				}

				// Categorize error for handling
				const categorized = ErrorCategorizer.categorize(error);

				// Check if should retry (auto or user prompt)
				const retryResult = await RetryPromptHandler.handleRetry(
					categorized,
					attemptNumber,
					{
						maxAutoRetries: maxRetries,
						initialDelayMs: 1000,
						backoffMultiplier: 2
					}
				);

				if (!retryResult.shouldRetry) {
					// No retry - display error and exit
					EnhancedErrorDisplay.displayAndExit(error);
				}

				// Wait before retrying (if delay specified)
				if (retryResult.delayMs > 0) {
					await RetryPromptHandler.sleep(retryResult.delayMs);
				}

				attemptNumber++;

				// Safety check to prevent infinite loops
				// Allow maxRetries automatic + 3 manual retries
				const maxTotalAttempts = maxRetries + 3;
				if (attemptNumber > maxTotalAttempts) {
					console.error(
						`\nFailed after ${maxTotalAttempts} attempts. Giving up.`
					);

					EnhancedErrorDisplay.displayAndExit(error);
				}
			}
		}
	}
}
