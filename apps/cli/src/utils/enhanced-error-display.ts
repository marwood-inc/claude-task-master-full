/**
 * @fileoverview Enhanced Error Display
 * Displays errors with specific exit codes and contextual guidance
 * Provides type-specific actionable advice for users
 */

import chalk from 'chalk';
import { ErrorCategorizer } from './error-categorizer.js';
import {
	CliErrorType,
	type CategorizedCliError
} from './cli-error-types.js';

/**
 * Enhanced error display with exit codes and specific guidance
 * Replaces generic displayError for commands with sophisticated error handling
 */
export class EnhancedErrorDisplay {
	/**
	 * Display error with specific exit code and contextual guidance
	 * Then exit with appropriate code unless skipExit is true
	 *
	 * @param error - Error to display
	 * @param skipExit - Skip calling process.exit (for testing)
	 * @returns Never returns (calls process.exit)
	 */
	static displayAndExit(error: unknown, skipExit: boolean = false): never {
		const categorized = ErrorCategorizer.categorize(error);

		// Display error header with exit code
		this.displayErrorHeader(categorized);

		// Display specific guidance based on error type
		this.displayTypeSpecificGuidance(categorized);

		// Exit with specific code
		if (!skipExit) {
			process.exit(categorized.exitCode);
		}

		// TypeScript requires this for 'never' return type
		throw new Error('Should not reach here');
	}

	/**
	 * Display error without exiting (for use in retry loops)
	 * Shows error information but allows caller to handle exit
	 *
	 * @param error - Error to display
	 * @returns Categorized error for further handling
	 */
	static display(error: unknown): CategorizedCliError {
		const categorized = ErrorCategorizer.categorize(error);
		this.displayErrorHeader(categorized);
		this.displayTypeSpecificGuidance(categorized);
		return categorized;
	}

	/**
	 * Display error header with type and exit code
	 */
	private static displayErrorHeader(error: CategorizedCliError): void {
		console.log(); // Spacing
		console.log(chalk.bold.red('━━━ ERROR ━━━'));
		console.log(chalk.red(`${error.userMessage}`));
		console.log(chalk.dim(`[Exit code: ${error.exitCode}]`));
		console.log();
	}

	/**
	 * Display type-specific guidance
	 * Provides actionable next steps for each error category
	 */
	private static displayTypeSpecificGuidance(
		error: CategorizedCliError
	): void {
		let guidance = '';

		switch (error.type) {
			case CliErrorType.VALIDATION:
				guidance =
					'Please check your input and try again:\n' +
					'  • Verify all required options are provided\n' +
					'  • Check the command help: use --help flag\n' +
					'  • Review the error message for specific details';
				break;

			case CliErrorType.AUTHENTICATION:
				guidance =
					'Authentication failed. Please:\n' +
					'  • Run: ' +
					chalk.cyan('tm github configure') +
					'\n' +
					'  • Verify your GitHub token is valid\n' +
					'  • Ensure token has required scopes (repo, user)\n' +
					'  • Create a new token at: ' +
					chalk.blue('https://github.com/settings/tokens/new');
				break;

			case CliErrorType.AUTHORIZATION:
				guidance =
					'Permission denied. Please:\n' +
					'  • Verify you have access to the repository\n' +
					'  • Check token permissions: ' +
					chalk.cyan('tm github configure') +
					'\n' +
					'  • Ensure you have push access for sync operations\n' +
					'  • Contact the repository owner if you need access';
				break;

			case CliErrorType.NETWORK:
				guidance =
					'Network connection failed. Please:\n' +
					'  • Check your internet connection\n' +
					'  • Verify GitHub is accessible at ' +
					chalk.blue('https://github.com') +
					'\n' +
					'  • Check GitHub status at ' +
					chalk.blue('https://www.githubstatus.com') +
					'\n' +
					'  • Wait a moment and try again';
				break;

			case CliErrorType.RATE_LIMIT:
				guidance =
					'GitHub API rate limit exceeded. Please:\n' +
					'  • Wait for the rate limit to reset\n' +
					'  • Use a personal access token (higher limits)\n' +
					'  • Reduce the number of tasks in sync\n' +
					'  • Consider upgrading to GitHub Pro for higher limits';
				break;

			case CliErrorType.UNKNOWN:
				guidance =
					'An unexpected error occurred:\n' +
					'  • Check the error details above\n' +
					'  • Run with ' +
					chalk.cyan('DEBUG=true') +
					' for more information\n' +
					'  • Contact support if issue persists\n' +
					'  • Check documentation at ' +
					chalk.blue('https://docs.task-master.dev');
				break;
		}

		console.log(chalk.yellow(`\n${guidance}`));
		console.log(); // Spacing
	}

	/**
	 * Format error for logging (with sanitization for production)
	 * Includes full error details for debugging
	 *
	 * @param error - Categorized error
	 * @returns Formatted error string for logs
	 */
	static formatForLogging(error: CategorizedCliError): string {
		let formatted = `[${error.type}:${error.exitCode}] ${error.message}`;

		if (error.originalError?.stack) {
			formatted += `\n${error.originalError.stack}`;
		}

		return formatted;
	}
}
