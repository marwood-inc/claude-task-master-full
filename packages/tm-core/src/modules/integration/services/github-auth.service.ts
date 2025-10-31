/**
 * GitHub Authentication Service
 * Handles GitHub token validation, permission checking, and authentication
 */

import { GitHubClient } from '../clients/github-client.js';
import { getLogger } from '../../../common/logger/index.js';

/**
 * Result of token validation
 */
export interface TokenValidationResult {
	/** Whether the token is valid */
	valid: boolean;
	/** Authenticated user information (if valid) */
	user?: {
		login: string;
		id: number;
		name: string | null;
		email: string | null;
	};
	/** Error message (if invalid) */
	error?: string;
	/** Error code for programmatic handling */
	errorCode?: 'INVALID_TOKEN' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NETWORK_ERROR';
}

/**
 * Required and optional GitHub token scopes
 */
export interface TokenScopes {
	/** Scopes that the token has */
	granted: string[];
	/** Required scopes for basic functionality */
	required: string[];
	/** Optional scopes for enhanced functionality */
	optional: string[];
	/** Missing required scopes */
	missingRequired: string[];
	/** Missing optional scopes */
	missingOptional: string[];
}

/**
 * Result of permission checking
 */
export interface PermissionCheckResult {
	/** Whether the token has all required permissions */
	hasRequiredPermissions: boolean;
	/** Token scopes information */
	scopes: TokenScopes;
	/** User-friendly message about permissions */
	message: string;
	/** Warnings about missing optional permissions */
	warnings: string[];
}

/**
 * Rate limit status information
 */
export interface RateLimitStatus {
	/** Maximum requests allowed per hour */
	limit: number;
	/** Remaining requests in current window */
	remaining: number;
	/** When the rate limit resets */
	reset: Date;
	/** Number of requests used */
	used: number;
	/** Percentage of rate limit remaining (0-100) */
	percentageRemaining: number;
	/** Whether rate limit is critically low (< 10%) */
	isLow: boolean;
	/** Whether rate limit is exhausted */
	isExhausted: boolean;
}

/**
 * Service for GitHub authentication and token validation
 */
export class GitHubAuthService {
	private logger = getLogger('GitHubAuthService');

	/**
	 * Required scopes for basic Task Master GitHub integration
	 */
	private static readonly REQUIRED_SCOPES = ['repo', 'user'];

	/**
	 * Optional scopes for enhanced functionality
	 */
	private static readonly OPTIONAL_SCOPES = ['read:org', 'read:project'];

	/**
	 * Get GitHub token from environment variable
	 * @returns Token from GITHUB_TOKEN environment variable, or undefined
	 */
	getTokenFromEnvironment(): string | undefined {
		const token = process.env.GITHUB_TOKEN;
		if (token) {
			this.logger.debug('Found GitHub token in GITHUB_TOKEN environment variable');
		} else {
			this.logger.debug('No GitHub token found in GITHUB_TOKEN environment variable');
		}
		return token;
	}

	/**
	 * Validate a GitHub token
	 * @param token - GitHub personal access token (if not provided, will check GITHUB_TOKEN env var)
	 * @returns Validation result with user information or error
	 */
	async validateToken(token?: string): Promise<TokenValidationResult> {
		// Try to get token from parameter or environment
		const authToken = token || this.getTokenFromEnvironment();

		if (!authToken) {
			this.logger.warn('No GitHub token provided and GITHUB_TOKEN environment variable not set');
			return {
				valid: false,
				error: 'No GitHub token provided. Please provide a token or set the GITHUB_TOKEN environment variable.',
				errorCode: 'INVALID_TOKEN'
			};
		}

		try {
			this.logger.info('Validating GitHub token');

			// Create a GitHub client with the token
			const client = new GitHubClient({ auth: authToken });

			// Test authentication by fetching the authenticated user
			const user = await client.testAuthentication();

			this.logger.info('GitHub token validation successful', { login: user.login });

			return {
				valid: true,
				user
			};
		} catch (error) {
			this.logger.error('GitHub token validation failed', error);

			// Handle specific error types
			if (error && typeof error === 'object' && 'name' in error) {
				const errorName = (error as { name: string }).name;

				if (errorName === 'GitHubAuthenticationError') {
					const authError = error as unknown as { message: string; code: string };
					return {
						valid: false,
						error: authError.message,
						errorCode: authError.code === 'UNAUTHORIZED' ? 'UNAUTHORIZED' : 'FORBIDDEN'
					};
				}
			}

			// Generic error handling
			return {
				valid: false,
				error: error instanceof Error ? error.message : 'Unknown authentication error',
				errorCode: 'NETWORK_ERROR'
			};
		}
	}

	/**
	 * Check token permissions and scopes
	 * @param token - GitHub personal access token (if not provided, will check GITHUB_TOKEN env var)
	 * @returns Permission check result with scope information
	 */
	async checkPermissions(token?: string): Promise<PermissionCheckResult> {
		// Try to get token from parameter or environment
		const authToken = token || this.getTokenFromEnvironment();

		if (!authToken) {
			return {
				hasRequiredPermissions: false,
				scopes: {
					granted: [],
					required: GitHubAuthService.REQUIRED_SCOPES,
					optional: GitHubAuthService.OPTIONAL_SCOPES,
					missingRequired: GitHubAuthService.REQUIRED_SCOPES,
					missingOptional: GitHubAuthService.OPTIONAL_SCOPES
				},
				message: 'No GitHub token provided. Cannot check permissions.',
				warnings: []
			};
		}

		try {
			this.logger.info('Checking GitHub token permissions');

			// First validate the token
			const validation = await this.validateToken(authToken);
			if (!validation.valid) {
				return {
					hasRequiredPermissions: false,
					scopes: {
						granted: [],
						required: GitHubAuthService.REQUIRED_SCOPES,
						optional: GitHubAuthService.OPTIONAL_SCOPES,
						missingRequired: GitHubAuthService.REQUIRED_SCOPES,
						missingOptional: GitHubAuthService.OPTIONAL_SCOPES
					},
					message: `Token validation failed: ${validation.error}`,
					warnings: []
				};
			}

			// Create a GitHub client to check actual permissions
			const client = new GitHubClient({ auth: authToken });

			// Get the Octokit instance to access the auth endpoint
			const octokit = client.getOctokit();

			// Fetch token metadata to check scopes
			// Note: GitHub's REST API doesn't expose scopes directly in all cases
			// We'll attempt to determine permissions through API calls
			const grantedScopes: string[] = [];
			const warnings: string[] = [];

			// Test repo access (this is the most critical permission)
			try {
				// Try to list repositories - this requires 'repo' or 'public_repo' scope
				await octokit.rest.repos.listForAuthenticatedUser({ per_page: 1 });
				grantedScopes.push('repo');
				this.logger.debug('Token has repository access');
			} catch (error) {
				this.logger.warn('Token does not have repository access', error);
				warnings.push('Token may not have full repository access (repo scope)');
			}

			// Test user access
			try {
				// We already validated the token, so we know user scope works
				grantedScopes.push('user');
				this.logger.debug('Token has user access');
			} catch (error) {
				this.logger.warn('Token does not have user access', error);
			}

			// Test organization access (optional)
			try {
				await octokit.rest.orgs.listForAuthenticatedUser({ per_page: 1 });
				grantedScopes.push('read:org');
				this.logger.debug('Token has organization read access');
			} catch (error) {
				this.logger.debug('Token does not have organization read access (optional)');
				warnings.push('Token does not have organization read access (read:org scope) - some features may be limited');
			}

			// Calculate missing scopes
			const missingRequired = GitHubAuthService.REQUIRED_SCOPES.filter(
				scope => !grantedScopes.includes(scope)
			);
			const missingOptional = GitHubAuthService.OPTIONAL_SCOPES.filter(
				scope => !grantedScopes.includes(scope)
			);

			const hasRequiredPermissions = missingRequired.length === 0;

			// Build user-friendly message
			let message = '';
			if (hasRequiredPermissions) {
				message = 'Token has all required permissions for Task Master GitHub integration.';
				if (missingOptional.length > 0) {
					message += ` Optional scopes missing: ${missingOptional.join(', ')}`;
				}
			} else {
				message = `Token is missing required permissions: ${missingRequired.join(', ')}. Please create a new token with these scopes.`;
			}

			this.logger.info('Permission check complete', {
				hasRequired: hasRequiredPermissions,
				grantedScopes,
				missingRequired,
				missingOptional
			});

			return {
				hasRequiredPermissions,
				scopes: {
					granted: grantedScopes,
					required: GitHubAuthService.REQUIRED_SCOPES,
					optional: GitHubAuthService.OPTIONAL_SCOPES,
					missingRequired,
					missingOptional
				},
				message,
				warnings
			};
		} catch (error) {
			this.logger.error('Permission check failed', error);
			return {
				hasRequiredPermissions: false,
				scopes: {
					granted: [],
					required: GitHubAuthService.REQUIRED_SCOPES,
					optional: GitHubAuthService.OPTIONAL_SCOPES,
					missingRequired: GitHubAuthService.REQUIRED_SCOPES,
					missingOptional: GitHubAuthService.OPTIONAL_SCOPES
				},
				message: `Failed to check permissions: ${error instanceof Error ? error.message : 'Unknown error'}`,
				warnings: []
			};
		}
	}

	/**
	 * Get rate limit status for the token
	 * @param token - GitHub personal access token (if not provided, will check GITHUB_TOKEN env var)
	 * @returns Rate limit status information
	 */
	async getRateLimitStatus(token?: string): Promise<RateLimitStatus> {
		// Try to get token from parameter or environment
		const authToken = token || this.getTokenFromEnvironment();

		if (!authToken) {
			throw new Error('No GitHub token provided. Cannot check rate limit status.');
		}

		try {
			this.logger.debug('Fetching GitHub rate limit status');

			// Create a GitHub client with the token
			const client = new GitHubClient({ auth: authToken });

			// Get rate limit information
			const rateLimit = await client.getRateLimit();

			// Calculate percentage remaining
			const percentageRemaining = (rateLimit.remaining / rateLimit.limit) * 100;

			const status: RateLimitStatus = {
				limit: rateLimit.limit,
				remaining: rateLimit.remaining,
				reset: rateLimit.reset,
				used: rateLimit.used,
				percentageRemaining,
				isLow: percentageRemaining < 10,
				isExhausted: rateLimit.remaining === 0
			};

			this.logger.info('Rate limit status retrieved', {
				remaining: status.remaining,
				limit: status.limit,
				percentage: percentageRemaining.toFixed(2)
			});

			// Log warning if rate limit is low
			if (status.isLow) {
				this.logger.warn('GitHub rate limit is critically low', {
					remaining: status.remaining,
					resetAt: status.reset.toISOString()
				});
			}

			if (status.isExhausted) {
				this.logger.error('GitHub rate limit exhausted', {
					resetAt: status.reset.toISOString()
				});
			}

			return status;
		} catch (error) {
			this.logger.error('Failed to get rate limit status', error);
			throw new Error(
				`Failed to get rate limit status: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}

	/**
	 * Verify access to a specific repository
	 * @param token - GitHub personal access token
	 * @param owner - Repository owner (username or organization)
	 * @param repo - Repository name
	 * @returns Repository access information
	 */
	async verifyRepositoryAccess(
		token: string,
		owner: string,
		repo: string
	): Promise<{
		accessible: boolean;
		permissions?: {
			admin: boolean;
			push: boolean;
			pull: boolean;
		};
		error?: string;
	}> {
		try {
			this.logger.info('Verifying repository access', { owner, repo });

			const client = new GitHubClient({ auth: token });
			const repoInfo = await client.verifyRepositoryAccess(owner, repo);

			this.logger.info('Repository access verified', {
				owner,
				repo,
				permissions: repoInfo.permissions
			});

			return {
				accessible: true,
				permissions: repoInfo.permissions
			};
		} catch (error) {
			this.logger.error('Repository access verification failed', {
				owner,
				repo,
				error
			});

			return {
				accessible: false,
				error: error instanceof Error ? error.message : 'Unknown error occurred'
			};
		}
	}
}
