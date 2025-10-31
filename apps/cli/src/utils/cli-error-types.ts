/**
 * @fileoverview CLI Error Types and Exit Codes
 * Categorized error types for CLI error handling with specific exit codes
 */

/**
 * Categorized error type for CLI error handling
 * Maps to specific exit codes and user guidance
 */
export enum CliErrorType {
	VALIDATION = 'validation',
	NETWORK = 'network',
	AUTHENTICATION = 'authentication',
	RATE_LIMIT = 'rate-limit',
	AUTHORIZATION = 'authorization',
	UNKNOWN = 'unknown'
}

/**
 * Exit codes for CLI commands
 * Following POSIX conventions for semantic exit codes
 */
export const CLI_EXIT_CODES = {
	SUCCESS: 0,
	GENERIC_ERROR: 1,
	VALIDATION_ERROR: 2,
	NETWORK_ERROR: 3,
	AUTHENTICATION_ERROR: 4,
	RATE_LIMIT_ERROR: 5
} as const;

/**
 * Categorized CLI error with type and exit code
 * Provides all information needed for CLI error handling
 */
export interface CategorizedCliError {
	/** Error type category */
	type: CliErrorType;
	/** Raw error message */
	message: string;
	/** User-friendly error message */
	userMessage: string;
	/** Semantic exit code */
	exitCode: number;
	/** Whether error can be retried */
	isRetryable: boolean;
	/** Whether error is transient (network, rate-limit) */
	isTransient: boolean;
	/** Original error object for debugging */
	originalError?: Error;
}
