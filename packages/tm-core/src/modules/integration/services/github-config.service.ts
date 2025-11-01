/**
 * GitHub Configuration Service
 * Provides convenient access to GitHub integration configuration
 */

import { ConfigManager } from '../../config/managers/config-manager.js';
import type { GitHubSettings } from '../../../common/interfaces/configuration.interface.js';
import { getLogger } from '../../../common/logger/index.js';
import {
	GitHubValidationService,
	type ValidationResult
} from './github-validation.service.js';

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
	private validationService: GitHubValidationService;

	/**
	 * Create a new GitHubConfigService
	 * @param configManager - ConfigManager instance for accessing configuration
	 */
	constructor(configManager: ConfigManager) {
		this.configManager = configManager;
		this.validationService = new GitHubValidationService();
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
	 * Delegates to GitHubValidationService for comprehensive validation
	 * @returns Validation result (legacy format for backward compatibility)
	 * @deprecated Use validateDetailed() for enhanced validation with error codes and suggestions
	 */
	validate(): GitHubConfigValidation {
		const config = this.getConfig();

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

		// Delegate to validation service
		const result = this.validationService.validateConfig(config);

		// Add disabled warning if not enabled (not part of validation service logic)
		const warnings = [...result.warnings.map((w) => w.message)];
		if (!enabled) {
			warnings.push('GitHub integration is disabled');
		}

		// Convert to legacy format for backward compatibility
		return {
			valid: result.valid,
			errors: result.errors.map((e) => e.message),
			warnings,
			enabled,
			hasRequiredFields: result.errors.length === 0
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

	/**
	 * Serialize features object to array of enabled feature names
	 * Converts feature flags object to array format for CLI/UI display
	 *
	 * @param features - Feature flags object
	 * @returns Array of enabled feature names
	 * @example
	 * serializeFeatures({ syncLabels: true, syncMilestones: false })
	 * // Returns: ['syncLabels']
	 */
	serializeFeatures(features: GitHubSettings['features']): string[] {
		const enabled: string[] = [];
		if (features.syncMilestones) enabled.push('syncMilestones');
		if (features.syncProjects) enabled.push('syncProjects');
		if (features.syncAssignees) enabled.push('syncAssignees');
		if (features.syncLabels) enabled.push('syncLabels');
		return enabled;
	}

	/**
	 * Deserialize array of feature names to features object
	 * Converts string array from CLI/UI to feature flags object
	 *
	 * @param selectedFeatures - Array of selected feature names
	 * @returns Feature flags object with boolean values
	 * @throws Error if invalid feature names provided
	 * @example
	 * deserializeFeatures(['syncLabels', 'syncMilestones'])
	 * // Returns: { syncLabels: true, syncMilestones: true, syncProjects: false, syncAssignees: false }
	 */
	deserializeFeatures(selectedFeatures: string[]): GitHubSettings['features'] {
		const validKeys = [
			'syncMilestones',
			'syncProjects',
			'syncAssignees',
			'syncLabels'
		];

		// Validate feature names
		for (const feature of selectedFeatures) {
			if (!validKeys.includes(feature)) {
				throw new Error(
					`Invalid feature: "${feature}". Valid features: ${validKeys.join(', ')}`
				);
			}
		}

		return {
			syncMilestones: selectedFeatures.includes('syncMilestones'),
			syncProjects: selectedFeatures.includes('syncProjects'),
			syncAssignees: selectedFeatures.includes('syncAssignees'),
			syncLabels: selectedFeatures.includes('syncLabels')
		};
	}

	/**
	 * Validate configuration and return detailed result
	 * Uses GitHubValidationService for enhanced validation details
	 *
	 * @returns Detailed validation result with errors, warnings, and metadata
	 */
	validateDetailed(): ValidationResult {
		const config = this.getConfig();

		if (!config) {
			return {
				valid: false,
				errors: [
					{
						code: 'NO_CONFIG',
						message: 'GitHub configuration not found',
						suggestion: 'Run "tm github configure" to set up GitHub integration'
					}
				],
				warnings: [],
				metadata: {
					validatedAspects: ['existence'],
					timestamp: new Date().toISOString()
				}
			};
		}

		return this.validationService.validateConfig(config);
	}
}
