/**
 * GitHub Configuration Service
 * Provides convenient access to GitHub integration configuration
 */

import { ConfigManager } from '../../config/managers/config-manager.js';
import type { GitHubSettings } from '../../../common/interfaces/configuration.interface.js';
import { getLogger } from '../../../common/logger/index.js';

/**
 * Result of configuration validation
 */
export interface GitHubConfigValidation {
	/** Whether the configuration is valid */
	valid: boolean;
	/** Validation errors */
	errors: string[];
	/** Validation warnings */
	warnings: string[];
	/** Whether GitHub integration is enabled */
	enabled: boolean;
	/** Whether minimum required fields are present */
	hasRequiredFields: boolean;
}

/**
 * Service for managing GitHub integration configuration
 * Provides a clean abstraction over ConfigManager for GitHub-specific operations
 */
export class GitHubConfigService {
	private logger = getLogger('GitHubConfigService');
	private configManager: ConfigManager;

	/**
	 * Create a new GitHubConfigService
	 * @param configManager - ConfigManager instance for accessing configuration
	 */
	constructor(configManager: ConfigManager) {
		this.configManager = configManager;
	}

	/**
	 * Get the current GitHub configuration
	 * @returns GitHub settings or undefined if not configured
	 */
	getConfig(): GitHubSettings | undefined {
		const config = this.configManager.getConfig();
		return config.github;
	}

	/**
	 * Check if GitHub integration is configured
	 * @returns True if GitHub integration is configured and enabled
	 */
	isConfigured(): boolean {
		const githubConfig = this.getConfig();
		return githubConfig !== undefined && githubConfig.enabled === true;
	}

	/**
	 * Check if GitHub integration is enabled
	 * @returns True if enabled, false otherwise
	 */
	isEnabled(): boolean {
		const githubConfig = this.getConfig();
		return githubConfig?.enabled ?? false;
	}

	/**
	 * Get the configured GitHub token
	 * Checks configuration first, then falls back to GITHUB_TOKEN environment variable
	 * @returns GitHub token or undefined
	 */
	getToken(): string | undefined {
		const githubConfig = this.getConfig();
		return githubConfig?.token || process.env.GITHUB_TOKEN;
	}

	/**
	 * Get repository owner
	 * @returns Repository owner or undefined
	 */
	getOwner(): string | undefined {
		const githubConfig = this.getConfig();
		return githubConfig?.owner;
	}

	/**
	 * Get repository name
	 * @returns Repository name or undefined
	 */
	getRepo(): string | undefined {
		const githubConfig = this.getConfig();
		return githubConfig?.repo;
	}

	/**
	 * Get full repository identifier (owner/repo)
	 * @returns Repository identifier or undefined if not fully configured
	 */
	getRepositoryIdentifier(): string | undefined {
		const owner = this.getOwner();
		const repo = this.getRepo();
		if (owner && repo) {
			return `${owner}/${repo}`;
		}
		return undefined;
	}

	/**
	 * Get subtask mode
	 * @returns Subtask mode (checklist or separate-issues)
	 */
	getSubtaskMode(): 'checklist' | 'separate-issues' {
		const githubConfig = this.getConfig();
		return githubConfig?.subtaskMode ?? 'checklist';
	}

	/**
	 * Get conflict resolution strategy
	 * @returns Conflict resolution strategy
	 */
	getConflictResolution(): 'prefer-local' | 'prefer-remote' | 'manual' {
		const githubConfig = this.getConfig();
		return githubConfig?.conflictResolution ?? 'manual';
	}

	/**
	 * Get sync direction
	 * @returns Sync direction
	 */
	getSyncDirection(): 'to-github' | 'from-github' | 'bidirectional' {
		const githubConfig = this.getConfig();
		return githubConfig?.syncDirection ?? 'bidirectional';
	}

	/**
	 * Check if auto-sync is enabled
	 * @returns True if auto-sync is enabled
	 */
	isAutoSyncEnabled(): boolean {
		const githubConfig = this.getConfig();
		return githubConfig?.autoSync ?? false;
	}

	/**
	 * Get feature flags
	 * @returns Feature flags configuration
	 */
	getFeatures(): GitHubSettings['features'] {
		const githubConfig = this.getConfig();
		return (
			githubConfig?.features ?? {
				syncMilestones: false,
				syncProjects: false,
				syncAssignees: false,
				syncLabels: true
			}
		);
	}

	/**
	 * Check if a specific feature is enabled
	 * @param feature - Feature name to check
	 * @returns True if the feature is enabled
	 */
	isFeatureEnabled(
		feature: keyof GitHubSettings['features']
	): boolean {
		const features = this.getFeatures();
		return features[feature] ?? false;
	}

	/**
	 * Update GitHub configuration
	 * @param updates - Partial GitHub settings to update
	 */
	async updateConfig(updates: Partial<GitHubSettings>): Promise<void> {
		this.logger.info('Updating GitHub configuration', { updates });

		const currentConfig = this.getConfig();
		const newConfig: GitHubSettings = {
			...currentConfig,
			...updates,
			// Merge features separately to avoid overwriting entire object
			features: {
				...(currentConfig?.features ?? {}),
				...(updates.features ?? {})
			}
		} as GitHubSettings;

		await this.configManager.updateConfig({
			github: newConfig
		});

		this.logger.info('GitHub configuration updated successfully');
	}

	/**
	 * Enable GitHub integration
	 */
	async enable(): Promise<void> {
		await this.updateConfig({ enabled: true });
	}

	/**
	 * Disable GitHub integration
	 */
	async disable(): Promise<void> {
		await this.updateConfig({ enabled: false });
	}

	/**
	 * Set the GitHub token
	 * @param token - GitHub personal access token
	 */
	async setToken(token: string): Promise<void> {
		await this.updateConfig({ token });
	}

	/**
	 * Set repository configuration
	 * @param owner - Repository owner
	 * @param repo - Repository name
	 */
	async setRepository(owner: string, repo: string): Promise<void> {
		await this.updateConfig({ owner, repo });
	}

	/**
	 * Set subtask mode
	 * @param mode - Subtask mode (checklist or separate-issues)
	 */
	async setSubtaskMode(mode: 'checklist' | 'separate-issues'): Promise<void> {
		await this.updateConfig({ subtaskMode: mode });
	}

	/**
	 * Set conflict resolution strategy
	 * @param strategy - Conflict resolution strategy
	 */
	async setConflictResolution(
		strategy: 'prefer-local' | 'prefer-remote' | 'manual'
	): Promise<void> {
		await this.updateConfig({ conflictResolution: strategy });
	}

	/**
	 * Set sync direction
	 * @param direction - Sync direction
	 */
	async setSyncDirection(
		direction: 'to-github' | 'from-github' | 'bidirectional'
	): Promise<void> {
		await this.updateConfig({ syncDirection: direction });
	}

	/**
	 * Enable or disable auto-sync
	 * @param enabled - Whether to enable auto-sync
	 */
	async setAutoSync(enabled: boolean): Promise<void> {
		await this.updateConfig({ autoSync: enabled });
	}

	/**
	 * Enable a specific feature
	 * @param feature - Feature name to enable
	 */
	async enableFeature(feature: keyof GitHubSettings['features']): Promise<void> {
		const features = this.getFeatures();
		features[feature] = true;
		await this.updateConfig({ features });
	}

	/**
	 * Disable a specific feature
	 * @param feature - Feature name to disable
	 */
	async disableFeature(feature: keyof GitHubSettings['features']): Promise<void> {
		const features = this.getFeatures();
		features[feature] = false;
		await this.updateConfig({ features });
	}

	/**
	 * Validate the current GitHub configuration
	 * @returns Validation result
	 */
	validate(): GitHubConfigValidation {
		const config = this.getConfig();
		const errors: string[] = [];
		const warnings: string[] = [];

		// Check if configuration exists
		if (!config) {
			return {
				valid: false,
				errors: ['GitHub configuration not found'],
				warnings: [],
				enabled: false,
				hasRequiredFields: false
			};
		}

		// Check if enabled
		const enabled = config.enabled ?? false;
		if (!enabled) {
			warnings.push('GitHub integration is disabled');
		}

		// Check required fields
		let hasRequiredFields = true;

		if (!config.token && !process.env.GITHUB_TOKEN) {
			errors.push(
				'GitHub token is required (provide in configuration or GITHUB_TOKEN environment variable)'
			);
			hasRequiredFields = false;
		}

		if (!config.owner) {
			errors.push('Repository owner is required');
			hasRequiredFields = false;
		}

		if (!config.repo) {
			errors.push('Repository name is required');
			hasRequiredFields = false;
		}

		// Validate subtask mode
		if (
			config.subtaskMode &&
			config.subtaskMode !== 'checklist' &&
			config.subtaskMode !== 'separate-issues'
		) {
			errors.push(
				'Invalid subtask mode (must be "checklist" or "separate-issues")'
			);
		}

		// Validate conflict resolution
		if (
			config.conflictResolution &&
			config.conflictResolution !== 'prefer-local' &&
			config.conflictResolution !== 'prefer-remote' &&
			config.conflictResolution !== 'manual'
		) {
			errors.push(
				'Invalid conflict resolution strategy (must be "prefer-local", "prefer-remote", or "manual")'
			);
		}

		// Validate sync direction
		if (
			config.syncDirection &&
			config.syncDirection !== 'to-github' &&
			config.syncDirection !== 'from-github' &&
			config.syncDirection !== 'bidirectional'
		) {
			errors.push(
				'Invalid sync direction (must be "to-github", "from-github", or "bidirectional")'
			);
		}

		// Check feature configuration
		if (config.features) {
			const allFeaturesDisabled = Object.values(config.features).every(
				(value) => value === false
			);
			if (allFeaturesDisabled) {
				warnings.push(
					'All features are disabled - GitHub sync may have limited functionality'
				);
			}
		}

		const valid = errors.length === 0;

		return {
			valid,
			errors,
			warnings,
			enabled,
			hasRequiredFields
		};
	}

	/**
	 * Clear GitHub configuration
	 * Removes all GitHub settings from the configuration
	 */
	async clearConfig(): Promise<void> {
		this.logger.info('Clearing GitHub configuration');
		await this.configManager.updateConfig({
			github: undefined
		});
		this.logger.info('GitHub configuration cleared');
	}

	/**
	 * Get a summary of the current configuration
	 * @returns Configuration summary as a plain object
	 */
	getSummary(): {
		configured: boolean;
		enabled: boolean;
		repository?: string;
		subtaskMode?: string;
		syncDirection?: string;
		conflictResolution?: string;
		autoSync: boolean;
		features: Record<string, boolean>;
	} {
		const config = this.getConfig();

		if (!config) {
			return {
				configured: false,
				enabled: false,
				autoSync: false,
				features: {}
			};
		}

		return {
			configured: true,
			enabled: config.enabled,
			repository: this.getRepositoryIdentifier(),
			subtaskMode: config.subtaskMode,
			syncDirection: config.syncDirection,
			conflictResolution: config.conflictResolution,
			autoSync: config.autoSync,
			features: config.features
		};
	}
}
