/**
 * @fileoverview GitHub Command - parent command for GitHub integration
 * Provides subcommands for GitHub configuration and synchronization
 */

import { Command } from 'commander';
import { GitHubConfigureCommand } from './github/configure.command.js';

/**
 * GitHubCommand - Main command for GitHub integration
 * This command serves as a parent for GitHub-related subcommands
 */
export class GitHubCommand extends Command {
	constructor(name?: string) {
		super(name || 'github');

		// Configure the command
		this.description('GitHub integration commands');

		// Add subcommands
		this.addCommand(new GitHubConfigureCommand());

		// Default action shows help
		this.action(() => {
			this.help();
		});
	}
}
