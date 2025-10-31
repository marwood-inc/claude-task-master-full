/**
 * @fileoverview Error Categorizer
 * Maps errors to CLI error types with specific exit codes
 * Handles both TaskMasterError and generic Error instances
 */

import { TaskMasterError, ERROR_CODES } from '@tm/core';
import {
	CliErrorType,
	CLI_EXIT_CODES,
	type CategorizedCliError
} from './cli-error-types.js';

/**
 * Categorizes errors for CLI handling with specific exit codes
 * Maps error types to actionable categories and exit codes
 */
export class ErrorCategorizer {
	/**
	 * Categorize an error for CLI handling
	 * Returns categorized error with type, exit code, and retry information
	 *
	 * @param error - Error to categorize (TaskMasterError, Error, or unknown)
	 * @returns Categorized error with all CLI handling information
	 */
	static categorize(error: unknown): CategorizedCliError {
		if (error instanceof TaskMasterError) {
			return this.categorizeTmError(error);
		}

		if (error instanceof Error) {
			return this.categorizeGenericError(error);
		}

		return this.createUnknownError(String(error));
	}

	/**
	 * Categorize TaskMasterError by code
	 * Uses ERROR_CODES from tm-core for precise categorization
	 */
	private static categorizeTmError(
		error: TaskMasterError
	): CategorizedCliError {
		// Validation errors - not retryable
		if (
			error.is(ERROR_CODES.VALIDATION_ERROR) ||
			error.is(ERROR_CODES.SCHEMA_VALIDATION_ERROR) ||
			error.is(ERROR_CODES.TYPE_VALIDATION_ERROR) ||
			error.is(ERROR_CODES.INVALID_INPUT) ||
			error.is(ERROR_CODES.INVALID_CONFIGURATION)
		) {
			return {
				type: CliErrorType.VALIDATION,
				message: error.message,
				userMessage: error.getUserMessage(),
				exitCode: CLI_EXIT_CODES.VALIDATION_ERROR,
				isRetryable: false,
				isTransient: false,
				originalError: error
			};
		}

		// Network errors - retryable and transient
		if (error.is(ERROR_CODES.NETWORK_ERROR)) {
			return {
				type: CliErrorType.NETWORK,
				message: error.message,
				userMessage: error.getUserMessage() || 'Network connection failed',
				exitCode: CLI_EXIT_CODES.NETWORK_ERROR,
				isRetryable: true,
				isTransient: true,
				originalError: error
			};
		}

		// Authentication errors - not retryable
		if (error.is(ERROR_CODES.AUTHENTICATION_ERROR)) {
			return {
				type: CliErrorType.AUTHENTICATION,
				message: error.message,
				userMessage: error.getUserMessage() || 'Authentication failed',
				exitCode: CLI_EXIT_CODES.AUTHENTICATION_ERROR,
				isRetryable: false,
				isTransient: false,
				originalError: error
			};
		}

		// Authorization/permission errors - not retryable
		if (error.is(ERROR_CODES.AUTHORIZATION_ERROR)) {
			return {
				type: CliErrorType.AUTHORIZATION,
				message: error.message,
				userMessage: error.getUserMessage() || 'Permission denied',
				exitCode: CLI_EXIT_CODES.AUTHENTICATION_ERROR,
				isRetryable: false,
				isTransient: false,
				originalError: error
			};
		}

		// API errors - treat as network errors (potentially transient)
		if (error.is(ERROR_CODES.API_ERROR)) {
			return {
				type: CliErrorType.NETWORK,
				message: error.message,
				userMessage: error.getUserMessage() || 'API request failed',
				exitCode: CLI_EXIT_CODES.NETWORK_ERROR,
				isRetryable: true,
				isTransient: true,
				originalError: error
			};
		}

		// Generic fallback
		return {
			type: CliErrorType.UNKNOWN,
			message: error.message,
			userMessage: error.getUserMessage(),
			exitCode: CLI_EXIT_CODES.GENERIC_ERROR,
			isRetryable: false,
			isTransient: false,
			originalError: error
		};
	}

	/**
	 * Categorize generic Error by message analysis
	 * Detects error patterns for network, auth, rate-limit scenarios
	 */
	private static categorizeGenericError(error: Error): CategorizedCliError {
		const msg = error.message.toLowerCase();
		const name = error.name.toLowerCase();

		// Rate limit detection (from GitHubRateLimitError and error messages)
		if (
			name.includes('ratelimit') ||
			msg.includes('rate limit') ||
			msg.includes('429') ||
			msg.includes('too many requests')
		) {
			return {
				type: CliErrorType.RATE_LIMIT,
				message: error.message,
				userMessage: 'GitHub API rate limit exceeded',
				exitCode: CLI_EXIT_CODES.RATE_LIMIT_ERROR,
				isRetryable: true,
				isTransient: true,
				originalError: error
			};
		}

		// Network errors (connection, timeout, DNS)
		if (
			name === 'networkerror' ||
			name === 'requesterror' ||
			msg.includes('econnreset') ||
			msg.includes('etimedout') ||
			msg.includes('enotfound') ||
			msg.includes('network') ||
			msg.includes('timeout')
		) {
			return {
				type: CliErrorType.NETWORK,
				message: error.message,
				userMessage: 'Network connection error',
				exitCode: CLI_EXIT_CODES.NETWORK_ERROR,
				isRetryable: true,
				isTransient: true,
				originalError: error
			};
		}

		// Authentication by HTTP status or message
		if (
			msg.includes('401') ||
			msg.includes('unauthorized') ||
			msg.includes('authentication')
		) {
			return {
				type: CliErrorType.AUTHENTICATION,
				message: error.message,
				userMessage: 'Authentication failed',
				exitCode: CLI_EXIT_CODES.AUTHENTICATION_ERROR,
				isRetryable: false,
				isTransient: false,
				originalError: error
			};
		}

		// Authorization by HTTP status or message
		if (
			msg.includes('403') ||
			msg.includes('forbidden') ||
			msg.includes('permission')
		) {
			return {
				type: CliErrorType.AUTHORIZATION,
				message: error.message,
				userMessage: 'Permission denied',
				exitCode: CLI_EXIT_CODES.AUTHENTICATION_ERROR,
				isRetryable: false,
				isTransient: false,
				originalError: error
			};
		}

		// Validation errors
		if (
			msg.includes('validation') ||
			msg.includes('invalid') ||
			msg.includes('schema')
		) {
			return {
				type: CliErrorType.VALIDATION,
				message: error.message,
				userMessage: 'Invalid input or configuration',
				exitCode: CLI_EXIT_CODES.VALIDATION_ERROR,
				isRetryable: false,
				isTransient: false,
				originalError: error
			};
		}

		return this.createUnknownError(error.message, error);
	}

	/**
	 * Create unknown error category
	 * Fallback for unrecognized errors
	 */
	private static createUnknownError(
		message: string,
		originalError?: Error
	): CategorizedCliError {
		return {
			type: CliErrorType.UNKNOWN,
			message,
			userMessage: message,
			exitCode: CLI_EXIT_CODES.GENERIC_ERROR,
			isRetryable: false,
			isTransient: false,
			originalError
		};
	}
}
