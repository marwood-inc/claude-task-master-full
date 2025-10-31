/**
 * @fileoverview GitHub Status Command
 * Displays GitHub sync status, conflicts, and mapping information
 * This is a thin presentation layer over @tm/core's GitHub integration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { createTmCore, type TmCore } from '@tm/core';
import { displayError } from '../../utils/error-handler.js';

/**
 * Options interface for the status command
 */
export interface GitHubStatusCommandOptions {
	format?: 'text' | 'json';
	project?: string;
}

/**
 * Conflict information
 */
export interface ConflictInfo {
	taskId: string;
	issueNumber: number;
	conflictType: string;
	description: string;
}

/**
 * Result type from status command
 */
export interface GitHubStatusResult {
	configured: boolean;
	repository?: string;
	lastSyncTime?: string;
	syncState: 'in-sync' | 'out-of-sync' | 'syncing' | 'unknown';
	tasksMapped: number;
	tasksUnmapped: number;
	conflicts: ConflictInfo[];
	pendingChanges: {
		localChanges: number;
		remoteChanges: number;
	};
}

/**
 * GitHubStatusCommand for viewing sync status and conflicts
 * This is a thin presentation layer over @tm/core's GitHub sync state service
 */
export class GitHubStatusCommand extends Command {
	private tmCore?: TmCore;
	private lastResult?: GitHubStatusResult;

	constructor(name?: string) {
		super(name || 'status');

		// Configure the command
		this.description('Show GitHub sync status and conflicts')
			.option(
				'-f, --format <format>',
				'Output format (text, json)',
				'text'
			)
			.option('-p, --project <path>', 'Project root directory', process.cwd())
			.addHelpText(
				'after',
				`
${chalk.bold('Examples:')}
  $ tm github status                # Show sync status
  $ tm github status --format json  # Show status as JSON

${chalk.bold('Information Displayed:')}
  • GitHub configuration status
  • Last sync timestamp
  • Sync state (in-sync, out-of-sync, syncing)
  • Tasks mapped to GitHub issues
  • Tasks not yet mapped
  • Conflicts requiring resolution
  • Pending local and remote changes

${chalk.bold('Notes:')}
  - Use this command to check sync status before running sync
  - Conflicts must be resolved before syncing
  - Configure GitHub integration with 'tm github configure' first
`
			);

		// Set the action
		this.action(async (options: GitHubStatusCommandOptions) => {
			await this.executeStatus(options);
		});
	}

	/**
	 * Execute the status command
	 */
	private async executeStatus(
		options: GitHubStatusCommandOptions
	): Promise<void> {
		const spinner: Ora = ora();

		try {
			// Validate options
			if (!this.validateOptions(options)) {
				process.exit(1);
			}

			// Initialize tm-core
			spinner.start('Initializing Task Master...');
			await this.initializeCore(options.project || process.cwd());
			spinner.succeed('Task Master initialized');

			// Fetch GitHub sync status
			spinner.start('Fetching GitHub sync status...');

			const result = await this.tmCore!.integration.getGitHubSyncStatus();

			this.lastResult = result;

			spinner.succeed('Status retrieved');

			// Display results
			this.displayResults(result, options);
		} catch (error) {
			spinner.fail('Failed to fetch status');
			displayError(error);
			process.exit(1);
		}
	}

	/**
	 * Validate command options
	 */
	private validateOptions(options: GitHubStatusCommandOptions): boolean {
		// Validate format
		if (options.format && !['text', 'json'].includes(options.format)) {
			console.error(chalk.red(`Invalid format: ${options.format}`));
			console.error(chalk.gray('Valid formats: text, json'));
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
	 * Display results based on format
	 */
	private displayResults(
		result: GitHubStatusResult,
		options: GitHubStatusCommandOptions
	): void {
		const format = options.format || 'text';

		switch (format) {
			case 'json':
				this.displayJson(result);
				break;

			case 'text':
			default:
				this.displayText(result);
				break;
		}
	}

	/**
	 * Display in JSON format
	 */
	private displayJson(result: GitHubStatusResult): void {
		console.log(JSON.stringify(result, null, 2));
	}

	/**
	 * Display in text format
	 */
	private displayText(result: GitHubStatusResult): void {
		console.log(chalk.bold.cyan('\n━━━ GitHub Sync Status ━━━\n'));

		// Configuration status
		console.log(
			chalk.bold('Configuration: ') +
				(result.configured
					? chalk.green('✓ Configured')
					: chalk.red('✗ Not configured'))
		);

		if (!result.configured) {
			console.log(
				chalk.yellow(
					'\nGitHub integration is not configured. Run ' +
						chalk.cyan('tm github configure') +
						' to set it up.'
				)
			);
			return;
		}

		// Repository info
		if (result.repository) {
			console.log(chalk.dim(`Repository:    ${result.repository}`));
		}

		// Last sync time
		if (result.lastSyncTime) {
			console.log(chalk.dim(`Last Sync:     ${result.lastSyncTime}`));
		}

		// Sync state
		const stateColor = this.getSyncStateColor(result.syncState);
		const stateText = this.getSyncStateText(result.syncState);
		console.log(chalk.bold(`\nSync State:    `) + stateColor(stateText));

		// Task mapping
		console.log(chalk.bold('\nTask Mapping:'));
		console.log(
			chalk.dim(
				`  Mapped:      ${result.tasksMapped} ${result.tasksMapped === 1 ? 'task' : 'tasks'}`
			)
		);
		console.log(
			chalk.dim(
				`  Unmapped:    ${result.tasksUnmapped} ${result.tasksUnmapped === 1 ? 'task' : 'tasks'}`
			)
		);

		// Pending changes
		console.log(chalk.bold('\nPending Changes:'));
		console.log(
			chalk.dim(
				`  Local:       ${result.pendingChanges.localChanges} ${result.pendingChanges.localChanges === 1 ? 'change' : 'changes'}`
			)
		);
		console.log(
			chalk.dim(
				`  Remote:      ${result.pendingChanges.remoteChanges} ${result.pendingChanges.remoteChanges === 1 ? 'change' : 'changes'}`
			)
		);

		// Conflicts
		if (result.conflicts.length > 0) {
			console.log(chalk.bold.red('\n⚠ Conflicts Detected:\n'));
			result.conflicts.forEach((conflict, index) => {
				console.log(
					chalk.yellow(
						`${index + 1}. Task ${conflict.taskId} (Issue #${conflict.issueNumber})`
					)
				);
				console.log(
					chalk.dim(`   Type: ${conflict.conflictType}`)
				);
				console.log(
					chalk.dim(`   ${conflict.description}`)
				);
			});

			console.log(
				chalk.yellow(
					'\nResolve conflicts before syncing or use --force to override.'
				)
			);
		} else {
			console.log(chalk.green('\n✓ No conflicts detected'));
		}

		// Next steps
		if (result.configured) {
			console.log(chalk.bold('\nNext Steps:'));
			if (result.conflicts.length > 0) {
				console.log(
					chalk.dim(
						`  • Resolve conflicts manually or run ${chalk.cyan('tm github sync --force')}`
					)
				);
			} else if (
				result.pendingChanges.localChanges > 0 ||
				result.pendingChanges.remoteChanges > 0
			) {
				console.log(
					chalk.dim(`  • Run ${chalk.cyan('tm github sync')} to synchronize`)
				);
			} else {
				console.log(chalk.dim('  • No actions needed - everything is in sync'));
			}
		}
	}

	/**
	 * Get color function for sync state
	 */
	private getSyncStateColor(
		state: GitHubStatusResult['syncState']
	): (text: string) => string {
		switch (state) {
			case 'in-sync':
				return chalk.green;
			case 'out-of-sync':
				return chalk.yellow;
			case 'syncing':
				return chalk.blue;
			case 'unknown':
			default:
				return chalk.gray;
		}
	}

	/**
	 * Get display text for sync state
	 */
	private getSyncStateText(state: GitHubStatusResult['syncState']): string {
		switch (state) {
			case 'in-sync':
				return '✓ In Sync';
			case 'out-of-sync':
				return '⚠ Out of Sync';
			case 'syncing':
				return '↻ Syncing...';
			case 'unknown':
			default:
				return '? Unknown';
		}
	}

	/**
	 * Get the result of the last operation
	 */
	getLastResult(): GitHubStatusResult | undefined {
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
