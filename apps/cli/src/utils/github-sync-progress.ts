/**
 * @fileoverview GitHub Sync Progress Tracking Utilities
 * Provides progress tracking and user feedback for GitHub sync operations
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

/**
 * Sync phase for progress tracking
 */
export type SyncPhase =
	| 'initializing'
	| 'fetching-tasks'
	| 'fetching-issues'
	| 'detecting-changes'
	| 'resolving-conflicts'
	| 'syncing-to-github'
	| 'syncing-from-github'
	| 'updating-state'
	| 'complete';

/**
 * Progress step information
 */
export interface ProgressStep {
	phase: SyncPhase;
	current: number;
	total: number;
	message: string;
	detail?: string;
}

/**
 * GitHub sync progress tracker
 * Provides visual feedback for long-running sync operations
 */
export class GitHubSyncProgress {
	private spinner: Ora;
	private currentPhase: SyncPhase = 'initializing';
	private startTime: number = Date.now();

	constructor(initialMessage: string = 'Initializing sync...') {
		this.spinner = ora(initialMessage).start();
	}

	/**
	 * Update progress to a new phase
	 */
	updatePhase(phase: SyncPhase, message: string, detail?: string): void {
		this.currentPhase = phase;
		const progressText = detail ? `${message} ${chalk.dim(`(${detail})`)}` : message;
		this.spinner.text = progressText;
	}

	/**
	 * Update progress with step information
	 */
	updateStep(step: ProgressStep): void {
		this.currentPhase = step.phase;
		const progressBar = this.createProgressBar(step.current, step.total);
		const progressText = `${step.message} ${progressBar} ${chalk.dim(`(${step.current}/${step.total})`)}`;
		const fullText = step.detail
			? `${progressText}\n  ${chalk.dim(step.detail)}`
			: progressText;
		this.spinner.text = fullText;
	}

	/**
	 * Mark current operation as successful
	 */
	succeed(message: string): void {
		const elapsed = this.getElapsedTime();
		this.spinner.succeed(`${message} ${chalk.dim(`(${elapsed})`)}`);
	}

	/**
	 * Mark current operation as failed
	 */
	fail(message: string): void {
		const elapsed = this.getElapsedTime();
		this.spinner.fail(`${message} ${chalk.dim(`(${elapsed})`)}`);
	}

	/**
	 * Mark current operation as warning
	 */
	warn(message: string): void {
		const elapsed = this.getElapsedTime();
		this.spinner.warn(`${message} ${chalk.dim(`(${elapsed})`)}`);
	}

	/**
	 * Mark current operation as info
	 */
	info(message: string): void {
		const elapsed = this.getElapsedTime();
		this.spinner.info(`${message} ${chalk.dim(`(${elapsed})`)}`);
	}

	/**
	 * Stop the spinner without marking status
	 */
	stop(): void {
		this.spinner.stop();
	}

	/**
	 * Get the current spinner instance
	 */
	getSpinner(): Ora {
		return this.spinner;
	}

	/**
	 * Create a text-based progress bar
	 */
	private createProgressBar(current: number, total: number): string {
		const width = 20;
		const percentage = Math.min(current / total, 1);
		const filled = Math.floor(width * percentage);
		const empty = width - filled;

		const bar = chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
		const percent = Math.floor(percentage * 100);

		return `[${bar}] ${percent}%`;
	}

	/**
	 * Get elapsed time since start
	 */
	private getElapsedTime(): string {
		const elapsed = Date.now() - this.startTime;
		const seconds = Math.floor(elapsed / 1000);
		const ms = elapsed % 1000;

		if (seconds > 0) {
			return `${seconds}.${Math.floor(ms / 100)}s`;
		}
		return `${ms}ms`;
	}
}

/**
 * Sync result summary formatter
 */
export class SyncResultFormatter {
	/**
	 * Display sync summary
	 */
	static displaySummary(result: {
		success: boolean;
		tasksProcessed: number;
		tasksCreated: number;
		tasksUpdated: number;
		tasksFailed: number;
		dryRun: boolean;
	}): void {
		console.log(chalk.bold.cyan('\n━━━ Sync Summary ━━━\n'));

		if (result.dryRun) {
			console.log(chalk.yellow('🔍 DRY RUN - No changes were made\n'));
		}

		// Overall status
		const statusIcon = result.success ? chalk.green('✓') : chalk.red('✗');
		const statusText = result.success ? 'Sync Successful' : 'Sync Failed';
		console.log(chalk.bold(`${statusIcon} ${statusText}\n`));

		// Statistics
		console.log(chalk.dim('Statistics:'));
		console.log(chalk.dim(`  Processed: ${result.tasksProcessed}`));
		console.log(chalk.dim(`  Created:   ${result.tasksCreated}`));
		console.log(chalk.dim(`  Updated:   ${result.tasksUpdated}`));

		if (result.tasksFailed > 0) {
			console.log(chalk.red(`  Failed:    ${result.tasksFailed}`));
		}
	}

	/**
	 * Display detailed errors
	 */
	static displayErrors(errors: string[]): void {
		if (errors.length === 0) return;

		console.log(chalk.bold.red('\n━━━ Errors ━━━\n'));
		errors.forEach((error, index) => {
			console.log(chalk.red(`${index + 1}. ${error}`));
		});
	}

	/**
	 * Display warnings
	 */
	static displayWarnings(warnings: string[]): void {
		if (warnings.length === 0) return;

		console.log(chalk.bold.yellow('\n━━━ Warnings ━━━\n'));
		warnings.forEach((warning, index) => {
			console.log(chalk.yellow(`${index + 1}. ${warning}`));
		});
	}

	/**
	 * Display actionable next steps
	 */
	static displayNextSteps(result: {
		success: boolean;
		tasksFailed: number;
		conflicts?: number;
	}): void {
		console.log(chalk.bold('\n━━━ Next Steps ━━━\n'));

		if (!result.success) {
			if (result.tasksFailed > 0) {
				console.log(
					chalk.dim(
						'• Review errors above and fix any issues in your tasks or GitHub configuration'
					)
				);
				console.log(
					chalk.dim('• Run ' + chalk.cyan('tm github status') + ' to check sync state')
				);
				console.log(
					chalk.dim('• Retry sync after fixing issues')
				);
			}

			if (result.conflicts && result.conflicts > 0) {
				console.log(
					chalk.dim(
						'• Resolve conflicts manually or use ' +
							chalk.cyan('--force') +
							' to override'
					)
				);
			}
		} else {
			console.log(
				chalk.dim('• Run ' + chalk.cyan('tm github status') + ' to view sync state')
			);
			console.log(
				chalk.dim('• Continue working on tasks with ' + chalk.cyan('tm next'))
			);
		}
	}
}

/**
 * Error message formatter with actionable guidance
 */
export class ErrorGuidance {
	/**
	 * Get actionable guidance for common errors
	 */
	static getGuidance(error: Error | string): string {
		const errorMessage = typeof error === 'string' ? error : error.message;
		const lowerError = errorMessage.toLowerCase();

		// Authentication errors
		if (lowerError.includes('unauthorized') || lowerError.includes('401')) {
			return (
				'Authentication failed. Please check:\n' +
				`  • Run ${chalk.cyan('tm github configure')} to update your token\n` +
				'  • Ensure your GitHub token has required scopes (repo, user)\n' +
				'  • Check if the token has expired'
			);
		}

		// Rate limiting
		if (lowerError.includes('rate limit') || lowerError.includes('403')) {
			return (
				'GitHub API rate limit exceeded. Please:\n' +
				'  • Wait for the rate limit to reset\n' +
				'  • Use a token with higher rate limits\n' +
				'  • Reduce the number of tasks being synced at once'
			);
		}

		// Network errors
		if (
			lowerError.includes('network') ||
			lowerError.includes('enotfound') ||
			lowerError.includes('timeout')
		) {
			return (
				'Network connection error. Please:\n' +
				'  • Check your internet connection\n' +
				'  • Verify GitHub is accessible\n' +
				'  • Try again in a moment'
			);
		}

		// Permission errors
		if (lowerError.includes('permission') || lowerError.includes('forbidden')) {
			return (
				'Permission denied. Please check:\n' +
				'  • Ensure you have write access to the repository\n' +
				'  • Verify your token has the required scopes\n' +
				`  • Run ${chalk.cyan('tm github configure')} to check settings`
			);
		}

		// Repository not found
		if (lowerError.includes('not found') || lowerError.includes('404')) {
			return (
				'Repository or resource not found. Please:\n' +
				'  • Verify the repository exists\n' +
				'  • Check the repository name in your configuration\n' +
				`  • Run ${chalk.cyan('tm github configure')} to update settings`
			);
		}

		// Configuration errors
		if (lowerError.includes('not configured') || lowerError.includes('configuration')) {
			return (
				'GitHub integration not configured. Please:\n' +
				`  • Run ${chalk.cyan('tm github configure')} to set up integration\n` +
				'  • Provide a valid GitHub token and repository'
			);
		}

		// Conflict errors
		if (lowerError.includes('conflict')) {
			return (
				'Sync conflicts detected. Please:\n' +
				`  • Run ${chalk.cyan('tm github status')} to review conflicts\n` +
				'  • Resolve conflicts manually\n' +
				`  • Use ${chalk.cyan('--force')} to override (caution: may lose data)`
			);
		}

		// Generic guidance
		return (
			'An error occurred during sync. Please:\n' +
			`  • Run ${chalk.cyan('tm github status')} to check sync state\n` +
			`  • Review the error message above\n` +
			`  • Try again or contact support if the issue persists`
		);
	}

	/**
	 * Display error with guidance
	 */
	static displayWithGuidance(error: Error | string): void {
		const errorMessage = typeof error === 'string' ? error : error.message;

		console.log(chalk.red.bold('\n━━━ Error ━━━\n'));
		console.log(chalk.red(errorMessage));

		const guidance = this.getGuidance(error);
		console.log(chalk.yellow(`\n${guidance}`));
	}
}
