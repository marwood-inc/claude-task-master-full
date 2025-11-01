/**
 * GitHub Validation Service
 * Consolidates ALL validation logic for GitHub integration
 * Provides comprehensive validation with detailed error reporting
 */

import { getLogger } from '../../../common/logger/index.js';
import type { GitHubSettings } from '../../../common/interfaces/configuration.interface.js';

/**
 * Validation error with context and actionable information
 */
export interface ValidationError {
	/** Error code for programmatic handling */
	code: string;
	/** Human-readable message */
	message: string;
	/** Field that failed validation */
	field?: string;
	/** Expected value/format */
	expected?: string;
	/** Actual received value */
	actual?: string;
	/** Suggested fix */
	suggestion?: string;
}

/**
 * Validation warning for non-critical issues
 */
export interface ValidationWarning {
	/** Warning code */
	code: string;
	/** Warning message */
	message: string;
	/** Affected field */
	field?: string;
	/** Severity level */
	severity: 'low' | 'medium' | 'high';
}

/**
 * Comprehensive validation result structure
 */
export interface ValidationResult {
	/** Whether validation passed (no errors) */
	valid: boolean;
	/** Critical errors that prevent operation */
	errors: ValidationError[];
	/** Non-critical warnings */
	warnings: ValidationWarning[];
	/** Validation metadata */
	metadata: {
		/** Which aspects were validated */
		validatedAspects: string[];
		/** Timestamp of validation */
		timestamp: string;
		/** Configuration state at validation time */
		configSnapshot?: Partial<GitHubSettings>;
	};
}

/**
 * GitHub sync options for validation
 */
export interface GitHubSyncOptions {
	mode?: 'one-way' | 'two-way';
	dryRun?: boolean;
	force?: boolean;
	subtaskMode?: 'checklist' | 'separate-issues';
	repo?: string;
}

/**
 * GitHub Validation Service
 * Consolidates all validation logic for GitHub integration
 * Provides structured validation results with detailed errors and warnings
 */
export class GitHubValidationService {
	private logger = getLogger('GitHubValidationService');

	/**
	 * Validate GitHub sync options
	 * Primary method for validating CLI/MCP sync command parameters
	 *
	 * @param options - Sync options to validate
	 * @param config - Current GitHub configuration for context
	 * @returns Validation result with errors and warnings
	 */
	validateSyncOptions(
		options: GitHubSyncOptions,
		config?: GitHubSettings
	): ValidationResult {
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];
		const validatedAspects: string[] = [];

		// Validate mode
		if (options.mode !== undefined) {
			validatedAspects.push('mode');
			if (options.mode !== 'one-way' && options.mode !== 'two-way') {
				errors.push({
					code: 'INVALID_SYNC_MODE',
					message: `Invalid sync mode: "${options.mode}"`,
					field: 'mode',
					expected: '"one-way" or "two-way"',
					actual: options.mode,
					suggestion:
						'Use "one-way" for push-only or "two-way" for bidirectional sync'
				});
			}
		}

		// Validate subtaskMode
		if (options.subtaskMode !== undefined) {
			validatedAspects.push('subtaskMode');
			if (
				options.subtaskMode !== 'checklist' &&
				options.subtaskMode !== 'separate-issues'
			) {
				errors.push({
					code: 'INVALID_SUBTASK_MODE',
					message: `Invalid subtask mode: "${options.subtaskMode}"`,
					field: 'subtaskMode',
					expected: '"checklist" or "separate-issues"',
					actual: options.subtaskMode,
					suggestion:
						'Use "checklist" for inline checklists or "separate-issues" for individual issues'
				});
			}
		}

		// Validate repo format (if provided)
		if (options.repo !== undefined) {
			validatedAspects.push('repo');
			const repoValidation = this.validateRepoFormat(options.repo);
			errors.push(...repoValidation.errors);
			warnings.push(...repoValidation.warnings);
		}

		// Validate force flag with context
		if (options.force && config?.conflictResolution === 'manual') {
			validatedAspects.push('force');
			warnings.push({
				code: 'FORCE_WITH_MANUAL_RESOLUTION',
				message:
					'Using --force with manual conflict resolution may skip conflict prompts',
				field: 'force',
				severity: 'high'
			});
		}

		// Validate dry-run with force
		if (options.dryRun && options.force) {
			validatedAspects.push('dryRun');
			warnings.push({
				code: 'DRY_RUN_WITH_FORCE',
				message: '--force flag is ignored during dry-run',
				field: 'force',
				severity: 'low'
			});
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			metadata: {
				validatedAspects,
				timestamp: new Date().toISOString(),
				configSnapshot: config
					? {
							subtaskMode: config.subtaskMode,
							conflictResolution: config.conflictResolution
						}
					: undefined
			}
		};
	}

	/**
	 * Validate complete GitHub configuration
	 * Used during setup and configuration updates
	 *
	 * @param config - GitHub configuration to validate
	 * @returns Validation result
	 */
	validateConfig(config: GitHubSettings): ValidationResult {
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];
		const validatedAspects: string[] = [];

		// Validate token
		validatedAspects.push('token');
		const tokenValidation = this.validateToken(config.token);
		errors.push(...tokenValidation.errors);
		warnings.push(...tokenValidation.warnings);

		// Validate owner
		validatedAspects.push('owner');
		if (!config.owner || config.owner.trim() === '') {
			errors.push({
				code: 'MISSING_OWNER',
				message: 'Repository owner is required',
				field: 'owner',
				suggestion: 'Provide GitHub username or organization name'
			});
		}

		// Validate repo
		validatedAspects.push('repo');
		if (!config.repo || config.repo.trim() === '') {
			errors.push({
				code: 'MISSING_REPO',
				message: 'Repository name is required',
				field: 'repo',
				suggestion: 'Provide repository name (e.g., "my-project")'
			});
		}

		// Validate subtaskMode
		validatedAspects.push('subtaskMode');
		if (
			config.subtaskMode !== 'checklist' &&
			config.subtaskMode !== 'separate-issues'
		) {
			errors.push({
				code: 'INVALID_SUBTASK_MODE',
				message: `Invalid subtask mode: "${config.subtaskMode}"`,
				field: 'subtaskMode',
				expected: '"checklist" or "separate-issues"',
				actual: config.subtaskMode
			});
		}

		// Validate conflictResolution
		validatedAspects.push('conflictResolution');
		if (
			config.conflictResolution !== 'prefer-local' &&
			config.conflictResolution !== 'prefer-remote' &&
			config.conflictResolution !== 'manual'
		) {
			errors.push({
				code: 'INVALID_CONFLICT_RESOLUTION',
				message: `Invalid conflict resolution: "${config.conflictResolution}"`,
				field: 'conflictResolution',
				expected: '"prefer-local", "prefer-remote", or "manual"',
				actual: config.conflictResolution
			});
		}

		// Validate syncDirection
		validatedAspects.push('syncDirection');
		if (
			config.syncDirection !== 'to-github' &&
			config.syncDirection !== 'from-github' &&
			config.syncDirection !== 'bidirectional'
		) {
			errors.push({
				code: 'INVALID_SYNC_DIRECTION',
				message: `Invalid sync direction: "${config.syncDirection}"`,
				field: 'syncDirection',
				expected: '"to-github", "from-github", or "bidirectional"',
				actual: config.syncDirection
			});
		}

		// Validate features
		validatedAspects.push('features');
		const featuresValidation = this.validateFeatures(config.features);
		errors.push(...featuresValidation.errors);
		warnings.push(...featuresValidation.warnings);

		// Warn if all features disabled
		if (this.areAllFeaturesDisabled(config.features)) {
			warnings.push({
				code: 'ALL_FEATURES_DISABLED',
				message: 'All sync features are disabled - limited functionality',
				field: 'features',
				severity: 'high'
			});
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			metadata: {
				validatedAspects,
				timestamp: new Date().toISOString(),
				configSnapshot: config
			}
		};
	}

	/**
	 * Validate features object structure and values
	 * @param features - Features configuration
	 * @returns Validation result
	 */
	validateFeatures(features: GitHubSettings['features']): ValidationResult {
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];

		// Validate required feature keys
		const requiredKeys = [
			'syncMilestones',
			'syncProjects',
			'syncAssignees',
			'syncLabels'
		];

		const missingKeys = requiredKeys.filter((key) => !(key in features));
		if (missingKeys.length > 0) {
			errors.push({
				code: 'MISSING_FEATURE_KEYS',
				message: `Missing required feature keys: ${missingKeys.join(', ')}`,
				field: 'features',
				expected: requiredKeys.join(', ')
			});
		}

		// Validate all values are boolean
		for (const [key, value] of Object.entries(features)) {
			if (typeof value !== 'boolean') {
				errors.push({
					code: 'INVALID_FEATURE_VALUE',
					message: `Feature "${key}" must be boolean`,
					field: `features.${key}`,
					expected: 'true or false',
					actual: String(value)
				});
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			metadata: {
				validatedAspects: ['features'],
				timestamp: new Date().toISOString()
			}
		};
	}

	/**
	 * Validate token format and presence
	 * @param token - GitHub token (optional)
	 * @returns Validation result
	 * @private
	 */
	private validateToken(token?: string): ValidationResult {
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];

		if (!token || token.trim() === '') {
			// Check environment variable
			const envToken = process.env.GITHUB_TOKEN;
			if (!envToken) {
				errors.push({
					code: 'MISSING_TOKEN',
					message: 'GitHub token is required',
					field: 'token',
					suggestion:
						'Provide token in config or set GITHUB_TOKEN environment variable'
				});
			} else {
				warnings.push({
					code: 'USING_ENV_TOKEN',
					message: 'Using token from GITHUB_TOKEN environment variable',
					field: 'token',
					severity: 'low'
				});
			}
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			metadata: {
				validatedAspects: ['token'],
				timestamp: new Date().toISOString()
			}
		};
	}

	/**
	 * Validate repository format (owner/repo)
	 * @param repo - Repository string
	 * @returns Validation result
	 * @private
	 */
	private validateRepoFormat(repo: string): ValidationResult {
		const errors: ValidationError[] = [];
		const warnings: ValidationWarning[] = [];

		const parts = repo.split('/');
		if (parts.length !== 2 || !parts[0] || !parts[1]) {
			errors.push({
				code: 'INVALID_REPO_FORMAT',
				message: `Invalid repository format: "${repo}"`,
				field: 'repo',
				expected: '"owner/repo"',
				actual: repo,
				suggestion: 'Use format: owner/repo (e.g., "octocat/Hello-World")'
			});
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
			metadata: {
				validatedAspects: ['repo'],
				timestamp: new Date().toISOString()
			}
		};
	}

	/**
	 * Check if all features are disabled
	 * @param features - Features configuration
	 * @returns True if all disabled
	 * @private
	 */
	private areAllFeaturesDisabled(
		features: GitHubSettings['features']
	): boolean {
		return Object.values(features).every((value) => value === false);
	}

	/**
	 * Validate and throw if critical errors exist
	 * Helper for operations that cannot proceed with invalid config
	 *
	 * @param result - Validation result to check
	 * @throws Error with combined error messages if validation failed
	 */
	validateOrThrow(result: ValidationResult): void {
		if (!result.valid) {
			const errorMessages = result.errors
				.map((err) => `${err.field ? `[${err.field}] ` : ''}${err.message}`)
				.join('\n');

			throw new Error(`GitHub validation failed:\n${errorMessages}`);
		}
	}
}
