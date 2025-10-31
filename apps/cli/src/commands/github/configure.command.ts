/**
 * @fileoverview GitHub Configure Command
 * Interactive setup for GitHub integration with Task Master
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora, { type Ora } from 'ora';
import { ConfigManager, type GitHubSettings } from '@tm/core';
import { GitHubAuthService } from '@tm/core';
import { CommandActionWrapper } from '../../utils/command-action-wrapper.js';

/**
 * Result type from configure command
 */
export interface ConfigureResult {
	success: boolean;
	configured: boolean;
	settings?: GitHubSettings;
	message?: string;
}

/**
 * GitHubConfigureCommand for interactive GitHub integration setup
 * This is a thin presentation layer over @tm/core's ConfigManager and GitHubAuthService
 */
export class GitHubConfigureCommand extends Command {
	private configManager!: ConfigManager;
	private authService: GitHubAuthService;
	private lastResult?: ConfigureResult;

	constructor(name?: string) {
		super(name || 'configure');

		// Initialize auth service
		this.authService = new GitHubAuthService();

		// Configure the command
		this.description('Configure GitHub integration for Task Master')
			.option('-t, --token <token>', 'GitHub personal access token')
			.option('-o, --owner <owner>', 'Repository owner (username or organization)')
			.option('-r, --repo <repo>', 'Repository name')
			.option(
				'--subtask-mode <mode>',
				'How to handle subtasks: checklist or separate-issues',
				'checklist'
			)
			.option(
				'--conflict-resolution <strategy>',
				'Conflict resolution strategy: prefer-local, prefer-remote, or manual',
				'manual'
			)
			.option(
				'--sync-direction <direction>',
				'Sync direction: to-github, from-github, or bidirectional',
				'bidirectional'
			)
			.option('--auto-sync', 'Enable automatic synchronization', false)
			.option(
				'-y, --yes',
				'Accept all defaults and skip interactive prompts',
				false
			)
			.addHelpText(
				'after',
				`
${chalk.bold('Examples:')}
  $ tm github configure                     # Interactive configuration
  $ tm github configure --token ghp_xxx     # Provide token directly
  $ tm github configure -y                  # Non-interactive with defaults

${chalk.bold('Notes:')}
  - You can also set GITHUB_TOKEN environment variable instead of providing --token
  - Token requires 'repo' and 'user' scopes for full functionality
  - Repository owner and name are required for GitHub integration
`
			);

		// Set the action
		this.action(async (options) => {
			await this.executeConfigure(options);
		});
	}

	/**
	 * Execute the configure command
	 */
	private async executeConfigure(options: {
		token?: string;
		owner?: string;
		repo?: string;
		subtaskMode?: string;
		conflictResolution?: string;
		syncDirection?: string;
		autoSync?: boolean;
		yes?: boolean;
	}): Promise<void> {
		// Wrap configure logic with error handling and retry support
		await CommandActionWrapper.executeWithErrorHandling(
			async () => {
				const spinner: Ora = ora();

				// Initialize config manager
				this.configManager = await ConfigManager.create(process.cwd());

				console.log(
					chalk.bold.cyan('\n━━━ GitHub Integration Configuration ━━━\n')
				);

				// Get current configuration if exists
				const currentConfig = this.configManager.getConfig();
				const existingGitHubConfig = currentConfig.github;

				// Determine if we're doing interactive or non-interactive setup
				const isInteractive = !options.yes;

				let githubSettings: GitHubSettings;

				if (isInteractive) {
					githubSettings = await this.interactiveSetup(
						options,
						existingGitHubConfig
					);
				} else {
					githubSettings = await this.nonInteractiveSetup(
						options,
						existingGitHubConfig
					);
				}

				// Validate the token and get user info
				spinner.start('Validating GitHub token...');

				const validation = await this.authService.validateToken(
					githubSettings.token
				);

				if (!validation.valid) {
					spinner.fail('Token validation failed');
					console.log(chalk.red(`\n✗ ${validation.error}`));
					console.log(
						chalk.yellow(
							'\nPlease provide a valid GitHub personal access token with repo and user scopes.'
						)
					);
					console.log(
						chalk.blue(
							'Create a token at: https://github.com/settings/tokens/new'
						)
					);

					this.lastResult = {
						success: false,
						configured: false,
						message: validation.error
					};

					// Throw error to trigger error handler (will exit with code 4)
					throw new Error(`Authentication failed: ${validation.error}`);
				}

				spinner.succeed(
					`Authenticated as ${chalk.cyan(validation.user!.login)}`
				);

				// Verify repository access if owner and repo are provided
				if (githubSettings.owner && githubSettings.repo) {
					spinner.start(
						`Verifying access to ${githubSettings.owner}/${githubSettings.repo}...`
					);

					const repoAccess = await this.authService.verifyRepositoryAccess(
						githubSettings.token!,
						githubSettings.owner,
						githubSettings.repo
					);

					if (!repoAccess.accessible) {
						spinner.fail('Repository access verification failed');
						console.log(chalk.red(`\n✗ ${repoAccess.error}`));
						console.log(
							chalk.yellow(
								'\nPlease ensure the repository exists and you have access to it.'
							)
						);

						this.lastResult = {
							success: false,
							configured: false,
							message: repoAccess.error
						};

						// Throw error to trigger error handler (will exit with code 4)
						throw new Error(`Authorization failed: ${repoAccess.error}`);
					}

					const permissions = repoAccess.permissions!;
					spinner.succeed('Repository access verified');

					// Display permissions
					console.log(chalk.dim('  Permissions:'));
					console.log(
						chalk.dim(
							`    • Admin: ${permissions.admin ? chalk.green('✓') : chalk.red('✗')}`
						)
					);
					console.log(
						chalk.dim(
							`    • Push: ${permissions.push ? chalk.green('✓') : chalk.red('✗')}`
						)
					);
					console.log(
						chalk.dim(
							`    • Pull: ${permissions.pull ? chalk.green('✓') : chalk.red('✗')}`
						)
					);

					// Warn if no push access
					if (!permissions.push) {
						console.log(
							chalk.yellow(
								'\n⚠ Warning: You do not have push access to this repository.'
							)
						);
						console.log(
							chalk.yellow(
								'   GitHub sync will be read-only (can pull but not push).'
							)
						);
					}
				}

				// Check token permissions
				spinner.start('Checking token permissions...');
				const permissionCheck = await this.authService.checkPermissions(
					githubSettings.token
				);
				spinner.stop();

				if (!permissionCheck.hasRequiredPermissions) {
					console.log(
						chalk.yellow('\n⚠ Warning: ' + permissionCheck.message)
					);
				} else {
					console.log(chalk.green('\n✓ ' + permissionCheck.message));
				}

				// Display warnings if any
				if (permissionCheck.warnings.length > 0) {
					console.log(chalk.dim('\nPermission warnings:'));
					permissionCheck.warnings.forEach((warning: string) => {
						console.log(chalk.yellow(`  • ${warning}`));
					});
				}

				// Save configuration
				spinner.start('Saving configuration...');

				await this.configManager.updateConfig({
					github: githubSettings
				});

				spinner.succeed('Configuration saved successfully');

				// Display summary
				this.displayConfigurationSummary(githubSettings);

				this.lastResult = {
					success: true,
					configured: true,
					settings: githubSettings,
					message: 'GitHub integration configured successfully'
				};

				console.log(
					chalk.green(
						'\n✓ GitHub integration is now configured and ready to use!'
					)
				);
				console.log(
					chalk.dim(
						'\nRun `tm github sync` to synchronize your tasks with GitHub issues.'
					)
				);
			},
			{
				commandName: 'configure',
				maxRetries: 1,
				enableAutoRetry: true
			}
		);
	}

	/**
	 * Interactive setup with prompts
	 */
	private async interactiveSetup(
		options: {
			token?: string;
			owner?: string;
			repo?: string;
			subtaskMode?: string;
			conflictResolution?: string;
			syncDirection?: string;
			autoSync?: boolean;
		},
		existingConfig?: GitHubSettings
	): Promise<GitHubSettings> {
		console.log(
			chalk.dim(
				'This wizard will guide you through setting up GitHub integration.\n'
			)
		);

		// Check for environment variable token
		const envToken = this.authService.getTokenFromEnvironment();
		if (envToken) {
			console.log(
				chalk.cyan('ℹ Found GitHub token in GITHUB_TOKEN environment variable\n')
			);
		}

		const answers = await inquirer.prompt([
			{
				type: 'password',
				name: 'token',
				message: 'GitHub Personal Access Token:',
				when: !options.token && !envToken,
				default: existingConfig?.token,
				validate: (input: string) => {
					if (!input || input.trim() === '') {
						return 'Token is required. Create one at https://github.com/settings/tokens/new';
					}
					return true;
				}
			},
			{
				type: 'input',
				name: 'owner',
				message: 'Repository Owner (username or organization):',
				when: !options.owner,
				default: existingConfig?.owner,
				validate: (input: string) => {
					if (!input || input.trim() === '') {
						return 'Repository owner is required';
					}
					return true;
				}
			},
			{
				type: 'input',
				name: 'repo',
				message: 'Repository Name:',
				when: !options.repo,
				default: existingConfig?.repo,
				validate: (input: string) => {
					if (!input || input.trim() === '') {
						return 'Repository name is required';
					}
					return true;
				}
			},
			{
				type: 'list',
				name: 'subtaskMode',
				message: 'How should subtasks be handled in GitHub?',
				when: !options.subtaskMode,
				default: existingConfig?.subtaskMode || 'checklist',
				choices: [
					{
						name: 'Checklist - Subtasks as checklist items in issue body',
						value: 'checklist'
					},
					{
						name: 'Separate Issues - Each subtask as a separate GitHub issue',
						value: 'separate-issues'
					}
				]
			},
			{
				type: 'list',
				name: 'syncDirection',
				message: 'Sync direction:',
				when: !options.syncDirection,
				default: existingConfig?.syncDirection || 'bidirectional',
				choices: [
					{
						name: 'Bidirectional - Sync both ways',
						value: 'bidirectional'
					},
					{
						name: 'To GitHub - Only push to GitHub',
						value: 'to-github'
					},
					{
						name: 'From GitHub - Only pull from GitHub',
						value: 'from-github'
					}
				]
			},
			{
				type: 'list',
				name: 'conflictResolution',
				message: 'How should conflicts be resolved?',
				when: !options.conflictResolution,
				default: existingConfig?.conflictResolution || 'manual',
				choices: [
					{
						name: 'Manual - Prompt me to resolve conflicts',
						value: 'manual'
					},
					{
						name: 'Prefer Local - Use local (Task Master) changes',
						value: 'prefer-local'
					},
					{
						name: 'Prefer Remote - Use remote (GitHub) changes',
						value: 'prefer-remote'
					}
				]
			},
			{
				type: 'confirm',
				name: 'autoSync',
				message: 'Enable automatic synchronization on task updates?',
				when: options.autoSync === undefined,
				default: existingConfig?.autoSync || false
			},
			{
				type: 'checkbox',
				name: 'features',
				message: 'Which features would you like to enable?',
				default: existingConfig
					? this.getEnabledFeatures(existingConfig.features)
					: ['syncLabels'],
				choices: [
					{ name: 'Sync Labels', value: 'syncLabels', checked: true },
					{ name: 'Sync Milestones', value: 'syncMilestones' },
					{ name: 'Sync Projects', value: 'syncProjects' },
					{ name: 'Sync Assignees', value: 'syncAssignees' }
				]
			}
		]);

		// Build the settings object
		const settings: GitHubSettings = {
			enabled: true,
			token: options.token || envToken || answers.token,
			owner: options.owner || answers.owner,
			repo: options.repo || answers.repo,
			subtaskMode:
				(options.subtaskMode as 'checklist' | 'separate-issues') ||
				answers.subtaskMode,
			conflictResolution:
				(options.conflictResolution as
					| 'prefer-local'
					| 'prefer-remote'
					| 'manual') || answers.conflictResolution,
			syncDirection:
				(options.syncDirection as
					| 'to-github'
					| 'from-github'
					| 'bidirectional') || answers.syncDirection,
			autoSync: options.autoSync ?? answers.autoSync,
			features: this.parseFeatures(answers.features || [])
		};

		return settings;
	}

	/**
	 * Non-interactive setup using options and defaults
	 */
	private async nonInteractiveSetup(
		options: {
			token?: string;
			owner?: string;
			repo?: string;
			subtaskMode?: string;
			conflictResolution?: string;
			syncDirection?: string;
			autoSync?: boolean;
		},
		existingConfig?: GitHubSettings
	): Promise<GitHubSettings> {
		// Get token from options, environment, or existing config
		const token =
			options.token ||
			this.authService.getTokenFromEnvironment() ||
			existingConfig?.token;

		if (!token) {
			throw new Error(
				'GitHub token is required. Provide --token or set GITHUB_TOKEN environment variable.'
			);
		}

		// Get owner and repo from options or existing config
		const owner = options.owner || existingConfig?.owner;
		const repo = options.repo || existingConfig?.repo;

		if (!owner || !repo) {
			throw new Error(
				'Repository owner and name are required. Provide --owner and --repo options.'
			);
		}

		const settings: GitHubSettings = {
			enabled: true,
			token,
			owner,
			repo,
			subtaskMode:
				(options.subtaskMode as 'checklist' | 'separate-issues') ||
				existingConfig?.subtaskMode ||
				'checklist',
			conflictResolution:
				(options.conflictResolution as
					| 'prefer-local'
					| 'prefer-remote'
					| 'manual') ||
				existingConfig?.conflictResolution ||
				'manual',
			syncDirection:
				(options.syncDirection as
					| 'to-github'
					| 'from-github'
					| 'bidirectional') ||
				existingConfig?.syncDirection ||
				'bidirectional',
			autoSync: options.autoSync ?? existingConfig?.autoSync ?? false,
			features: existingConfig?.features || {
				syncMilestones: false,
				syncProjects: false,
				syncAssignees: false,
				syncLabels: true
			}
		};

		return settings;
	}

	/**
	 * Get list of enabled features from settings
	 */
	private getEnabledFeatures(
		features: GitHubSettings['features']
	): string[] {
		const enabled: string[] = [];
		if (features.syncMilestones) enabled.push('syncMilestones');
		if (features.syncProjects) enabled.push('syncProjects');
		if (features.syncAssignees) enabled.push('syncAssignees');
		if (features.syncLabels) enabled.push('syncLabels');
		return enabled;
	}

	/**
	 * Parse features array into feature object
	 */
	private parseFeatures(
		selectedFeatures: string[]
	): GitHubSettings['features'] {
		return {
			syncMilestones: selectedFeatures.includes('syncMilestones'),
			syncProjects: selectedFeatures.includes('syncProjects'),
			syncAssignees: selectedFeatures.includes('syncAssignees'),
			syncLabels: selectedFeatures.includes('syncLabels')
		};
	}

	/**
	 * Display configuration summary
	 */
	private displayConfigurationSummary(settings: GitHubSettings): void {
		console.log(chalk.bold('\n━━━ Configuration Summary ━━━'));
		console.log(
			chalk.dim(`Repository:         ${settings.owner}/${settings.repo}`)
		);
		console.log(chalk.dim(`Subtask Mode:       ${settings.subtaskMode}`));
		console.log(chalk.dim(`Sync Direction:     ${settings.syncDirection}`));
		console.log(
			chalk.dim(`Conflict Resolution: ${settings.conflictResolution}`)
		);
		console.log(
			chalk.dim(
				`Auto Sync:          ${settings.autoSync ? 'Enabled' : 'Disabled'}`
			)
		);
		console.log(chalk.dim(`\nFeatures:`));
		console.log(
			chalk.dim(
				`  • Labels:     ${settings.features.syncLabels ? chalk.green('✓') : chalk.red('✗')}`
			)
		);
		console.log(
			chalk.dim(
				`  • Milestones: ${settings.features.syncMilestones ? chalk.green('✓') : chalk.red('✗')}`
			)
		);
		console.log(
			chalk.dim(
				`  • Projects:   ${settings.features.syncProjects ? chalk.green('✓') : chalk.red('✗')}`
			)
		);
		console.log(
			chalk.dim(
				`  • Assignees:  ${settings.features.syncAssignees ? chalk.green('✓') : chalk.red('✗')}`
			)
		);
	}

	/**
	 * Get the result of the last operation
	 */
	getLastResult(): ConfigureResult | undefined {
		return this.lastResult;
	}
}
