/**
 * @fileoverview GitHub Sync Command
 * Synchronizes Task Master tasks with GitHub issues
 * This is a thin presentation layer over @tm/core's GitHub integration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createTmCore, type TmCore } from '@tm/core';
import {
	GitHubSyncProgress,
	SyncResultFormatter
} from '../../utils/github-sync-progress.js';
import { CommandActionWrapper } from '../../utils/command-action-wrapper.js';
import { EnhancedErrorDisplay } from '../../utils/enhanced-error-display.js';

/**
 * Options interface for the sync command
 */
export interface GitHubSyncCommandOptions {
	mode?: 'one-way' | 'two-way';
	dryRun?: boolean;
	force?: boolean;
	subtaskMode?: 'checklist' | 'separate-issues';
	repo?: string;
	project?: string;
}

/**
 * Result type from sync command
 */
export interface GitHubSyncResult {
	success: boolean;
	mode: 'one-way' | 'two-way';
	tasksProcessed: number;
	tasksCreated: number;
	tasksUpdated: number;
	tasksFailed: number;
	errors: string[];
	warnings: string[];
	dryRun: boolean;
}

/**
 * GitHubSyncCommand for synchronizing tasks with GitHub issues
 * This is a thin presentation layer over @tm/core's GitHub sync service
 */
export class GitHubSyncCommand extends Command {
	private tmCore?: TmCore;
	private lastResult?: GitHubSyncResult;

	constructor(name?: string) {
		super(name || 'sync');

		// Configure the command
		this.description('Synchronize tasks with GitHub issues')
			.option(
				'-m, --mode <mode>',
				'Sync mode: one-way (to GitHub only) or two-way (bidirectional)',
				'one-way'
			)
			.option('--dry-run', 'Preview changes without making them', false)
			.option(
				'-f, --force',
				'Force sync even if conflicts are detected',
				false
			)
			.option(
				'--subtask-mode <mode>',
				'How to handle subtasks: checklist or separate-issues'
			)
			.option('--repo <repo>', 'Override repository (format: owner/repo)')
			.option('-p, --project <path>', 'Project root directory', process.cwd())
			.addHelpText(
				'after',
				`
${chalk.bold('Examples:')}
  $ tm github sync                          # One-way sync (Task Master → GitHub)
  $ tm github sync --mode two-way           # Bidirectional sync
  $ tm github sync --dry-run                # Preview changes
  $ tm github sync --force                  # Force sync, ignoring conflicts
  $ tm github sync --subtask-mode checklist # Sync subtasks as checklists
  $ tm github sync --repo owner/repo        # Override repository

${chalk.bold('Modes:')}
  • one-way:  Pushes changes from Task Master to GitHub (default)
  • two-way:  Bidirectional sync (pulls from GitHub and pushes changes)

${chalk.bold('Subtask Modes:')}
  • checklist:        Subtasks as checklist items in issue body
  • separate-issues:  Each subtask as a separate GitHub issue

${chalk.bold('Notes:')}
  - Use --dry-run to preview changes before syncing
  - Two-way mode may prompt you to resolve conflicts
  - Configure GitHub integration with 'tm github configure' first
`
			);

		// Set the action
		this.action(async (options: GitHubSyncCommandOptions) => {
			await this.executeSync(options);
		});
	}

	/**
	 * Execute the sync command
	 */
	private async executeSync(options: GitHubSyncCommandOptions): Promise<void> {
		// Wrap sync logic with error handling and retry support
		await CommandActionWrapper.executeWithErrorHandling(
			async () => {
				// Initialize tm-core first (needed for validation)
				const progress = new GitHubSyncProgress('Initializing Task Master...');
				await this.initializeCore(options.project || process.cwd());
				progress.succeed('Task Master initialized');

				// Validate options using tm-core validation service
				if (!this.validateOptions(options)) {
					// Validation errors should exit with code 2
					EnhancedErrorDisplay.displayAndExit(
						new Error(`Invalid options provided`)
					);
				}

				// Display sync header
				this.displaySyncHeader(options);

				// Fetch tasks
				progress.updatePhase('fetching-tasks', 'Fetching tasks...');
				const taskList = await this.tmCore!.tasks.list();
				const tasks = taskList.tasks;

				progress.succeed(`Loaded ${tasks.length} tasks`);

				if (tasks.length === 0) {
					progress.warn('No tasks to sync');
					console.log(
						chalk.yellow(
							'\nNo tasks found. Add tasks with ' +
								chalk.cyan('tm add-task') +
								' or import from PRD.'
						)
					);
					return;
				}

				// Perform sync
				progress.updatePhase(
					'syncing-to-github',
					options.dryRun ? 'Previewing sync...' : 'Syncing to GitHub...'
				);

				const coreResult = await this.tmCore!.integration.syncWithGitHub(
					tasks,
					{
						mode: options.mode || 'one-way',
						dryRun: options.dryRun || false,
						force: options.force || false,
						subtaskMode: options.subtaskMode,
						repo: options.repo
					}
				);

				// Convert core result to CLI result
				const result: GitHubSyncResult = {
					success: coreResult.success,
					mode: options.mode || 'one-way',
					tasksProcessed: coreResult.tasksProcessed,
					tasksCreated: coreResult.tasksCreated,
					tasksUpdated: coreResult.tasksUpdated,
					tasksFailed: coreResult.tasksFailed,
					errors: coreResult.errors || [],
					warnings: coreResult.warnings || [],
					dryRun: coreResult.dryRun
				};

				this.lastResult = result;

				// Mark as complete
				if (result.success) {
					progress.succeed(
						result.dryRun
							? 'Dry run completed successfully'
							: 'Sync completed successfully'
					);
				} else {
					progress.fail('Sync completed with errors');
				}

				// Display results
				this.displayResults(result);
			},
			{
				commandName: 'sync',
				maxRetries: 2,
				enableAutoRetry: true
			}
		);
	}

	/**
	 * Validate command options using tm-core validation service
	 * Delegates to GitHubValidationService for comprehensive validation
	 *
	 * **Architecture Note**: This method demonstrates proper CLI-to-Core delegation:
	 * - ALL validation business logic lives in `@tm/core` (GitHubValidationService)
	 * - CLI layer only handles presentation (display formatting, colors, console output)
	 * - This pattern ensures validation logic is reused across CLI, MCP, and future UI clients
	 * - Single source of truth prevents logic duplication and ensures consistency
	 *
	 * @param options - CLI options to validate
	 * @returns true if valid (no errors), false if validation failed
	 * @requires tmCore must be initialized before calling this method
	 * @see GitHubValidationService.validateSyncOptions in @tm/core for business logic
	 */
	private validateOptions(options: GitHubSyncCommandOptions): boolean {
		// Delegate validation to tm-core (business logic)
		const result = this.tmCore.integration.validateGitHubSyncOptions({
			mode: options.mode,
			subtaskMode: options.subtaskMode,
			repo: options.repo,
			dryRun: options.dryRun,
			force: options.force
		});

		// Display errors (presentation logic)
		if (!result.valid) {
			result.errors.forEach((error) => {
				console.error(chalk.red(error.message));
				if (error.suggestion) {
					console.error(chalk.gray(`  → ${error.suggestion}`));
				}
			});
		}

		// Display warnings (non-blocking)
		if (result.warnings.length > 0) {
			result.warnings.forEach((warning) => {
				const severityColor =
					warning.severity === 'high'
						? chalk.yellow
						: warning.severity === 'medium'
							? chalk.yellowBright
							: chalk.gray;
				console.warn(severityColor(`⚠ ${warning.message}`));
			});
		}

		return result.valid;
	}

	/**
	 * Initialize TmCore
	 */
	private async initializeCore(projectRoot: string): Promise<void> {
		if (!this.tmCore) {
			this.tmCore = await createTmCore({ projectPath: projectRoot });
		}
	}

	/**
	 * Display sync header
	 */
	private displaySyncHeader(options: GitHubSyncCommandOptions): void {
		console.log(chalk.bold.cyan('\n━━━ GitHub Synchronization ━━━\n'));

		console.log(chalk.dim(`Mode:          ${options.mode || 'one-way'}`));
		console.log(
			chalk.dim(`Dry Run:       ${options.dryRun ? 'Yes' : 'No'}`)
		);
		if (options.subtaskMode) {
			console.log(chalk.dim(`Subtask Mode:  ${options.subtaskMode}`));
		}
		if (options.repo) {
			console.log(chalk.dim(`Repository:    ${options.repo}`));
		}

		console.log(); // Empty line
	}

	/**
	 * Display sync results
	 */
	private displayResults(result: GitHubSyncResult): void {
		// Display summary
		SyncResultFormatter.displaySummary(result);

		// Display errors
		if (result.errors.length > 0) {
			SyncResultFormatter.displayErrors(result.errors);
		}

		// Display warnings
		if (result.warnings.length > 0) {
			SyncResultFormatter.displayWarnings(result.warnings);
		}

		// Display next steps
		SyncResultFormatter.displayNextSteps({
			success: result.success,
			tasksFailed: result.tasksFailed
		});
	}

	/**
	 * Get the result of the last operation
	 */
	getLastResult(): GitHubSyncResult | undefined {
		return this.lastResult;
	}

	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		if (this.tmCore) {
			this.tmCore = undefined;
		}
	}
}
