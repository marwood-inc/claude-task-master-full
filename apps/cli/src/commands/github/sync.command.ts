/**
 * @fileoverview GitHub Sync Command
 * Synchronizes Task Master tasks with GitHub issues
 * This is a thin presentation layer over @tm/core's GitHub integration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createTmCore, type TmCore } from '@tm/core';
import { displayError } from '../../utils/error-handler.js';
import {
	GitHubSyncProgress,
	SyncResultFormatter,
	ErrorGuidance
} from '../../utils/github-sync-progress.js';

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
		try {
			// Validate options
			if (!this.validateOptions(options)) {
				process.exit(1);
			}

			// Initialize tm-core
			const progress = new GitHubSyncProgress('Initializing Task Master...');
			await this.initializeCore(options.project || process.cwd());
			progress.succeed('Task Master initialized');

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

			const coreResult = await this.tmCore!.integration.syncWithGitHub(tasks, {
				mode: options.mode || 'one-way',
				dryRun: options.dryRun || false,
				force: options.force || false,
				subtaskMode: options.subtaskMode,
				repo: options.repo
			});

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
		} catch (error) {
			// Display error with guidance
			console.log(); // Empty line for spacing
			ErrorGuidance.displayWithGuidance(error as Error);
			process.exit(1);
		}
	}

	/**
	 * Validate command options
	 */
	private validateOptions(options: GitHubSyncCommandOptions): boolean {
		// Validate mode
		if (options.mode && !['one-way', 'two-way'].includes(options.mode)) {
			console.error(chalk.red(`Invalid mode: ${options.mode}`));
			console.error(chalk.gray('Valid modes: one-way, two-way'));
			return false;
		}

		// Validate subtask mode
		if (
			options.subtaskMode &&
			!['checklist', 'separate-issues'].includes(options.subtaskMode)
		) {
			console.error(chalk.red(`Invalid subtask mode: ${options.subtaskMode}`));
			console.error(chalk.gray('Valid modes: checklist, separate-issues'));
			return false;
		}

		// Validate repo format if provided
		if (options.repo && !options.repo.includes('/')) {
			console.error(chalk.red(`Invalid repo format: ${options.repo}`));
			console.error(chalk.gray('Expected format: owner/repo'));
			return false;
		}

		return true;
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
