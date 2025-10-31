/**
 * GitHub API client for Task Master integration
 * Provides abstraction over @octokit/rest for task-master specific operations
 */

import { Octokit } from '@octokit/rest';
import type { OctokitOptions } from '@octokit/core';
import { getLogger } from '../../../common/logger/index.js';

export interface GitHubClientConfig {
	/**
	 * GitHub personal access token for authentication
	 */
	auth: string;

	/**
	 * GitHub base URL (for GitHub Enterprise)
	 * @default 'https://api.github.com'
	 */
	baseUrl?: string;

	/**
	 * Request timeout in milliseconds
	 * @default 30000
	 */
	timeout?: number;

	/**
	 * Custom Octokit options
	 */
	octokitOptions?: Partial<OctokitOptions>;
}

export class GitHubAuthenticationError extends Error {
	constructor(message: string, public readonly code: string) {
		super(message);
		this.name = 'GitHubAuthenticationError';
	}
}

export class GitHubRateLimitError extends Error {
	constructor(
		message: string,
		public readonly resetAt: Date,
		public readonly limit: number,
		public readonly remaining: number
	) {
		super(message);
		this.name = 'GitHubRateLimitError';
	}
}

export class GitHubAPIError extends Error {
	constructor(
		message: string,
		public readonly statusCode: number,
		public readonly code?: string
	) {
		super(message);
		this.name = 'GitHubAPIError';
	}
}

/**
 * GitHub client for Task Master integrations
 * Handles authentication, rate limiting, and error handling
 */
export class GitHubClient {
	private octokit: Octokit;
	private logger = getLogger('GitHubClient');
	private config: Required<
		Pick<GitHubClientConfig, 'auth' | 'baseUrl' | 'timeout'>
	>;

	constructor(config: GitHubClientConfig) {
		this.config = {
			auth: config.auth,
			baseUrl: config.baseUrl ?? 'https://api.github.com',
			timeout: config.timeout ?? 30000
		};

		// Initialize Octokit with configuration
		this.octokit = new Octokit({
			auth: this.config.auth,
			baseUrl: this.config.baseUrl,
			request: {
				timeout: this.config.timeout
			},
			...config.octokitOptions
		});

		this.logger.info('GitHub client initialized', {
			baseUrl: this.config.baseUrl
		});
	}

	/**
	 * Get the underlying Octokit instance
	 * Use with caution - prefer using GitHubClient methods
	 */
	getOctokit(): Octokit {
		return this.octokit;
	}

	/**
	 * Test authentication by fetching the authenticated user
	 * @returns The authenticated user information
	 * @throws {GitHubAuthenticationError} If authentication fails
	 */
	async testAuthentication(): Promise<{
		login: string;
		id: number;
		name: string | null;
		email: string | null;
	}> {
		try {
			this.logger.debug('Testing GitHub authentication');

			const { data } = await this.octokit.rest.users.getAuthenticated();

			this.logger.info('Successfully authenticated', {
				login: data.login
			});

			return {
				login: data.login,
				id: data.id,
				name: data.name,
				email: data.email
			};
		} catch (error) {
			this.handleError(error, 'Authentication failed');
			throw error; // TypeScript needs this
		}
	}

	/**
	 * Get current rate limit status
	 * @returns Rate limit information
	 */
	async getRateLimit(): Promise<{
		limit: number;
		remaining: number;
		reset: Date;
		used: number;
	}> {
		try {
			const { data } = await this.octokit.rest.rateLimit.get();
			const core = data.resources.core;

			return {
				limit: core.limit,
				remaining: core.remaining,
				reset: new Date(core.reset * 1000),
				used: core.used
			};
		} catch (error) {
			this.handleError(error, 'Failed to get rate limit');
			throw error; // TypeScript needs this
		}
	}

	/**
	 * Handle Octokit errors and convert to typed exceptions
	 */
	private handleError(error: unknown, context: string): never {
		this.logger.error(context, error);

		// Handle RequestError from Octokit
		if (error && typeof error === 'object' && 'status' in error) {
			const octokitError = error as {
				status: number;
				message: string;
				response?: {
					data?: {
						message?: string;
						errors?: Array<{ message: string }>;
					};
					headers?: {
						'x-ratelimit-limit'?: string;
						'x-ratelimit-remaining'?: string;
						'x-ratelimit-reset'?: string;
					};
				};
			};

			// Authentication errors (401, 403)
			if (octokitError.status === 401 || octokitError.status === 403) {
				throw new GitHubAuthenticationError(
					octokitError.response?.data?.message ||
						octokitError.message ||
						'Authentication failed',
					octokitError.status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN'
				);
			}

			// Rate limit errors
			if (
				octokitError.status === 403 &&
				octokitError.response?.headers?.['x-ratelimit-remaining'] === '0'
			) {
				const resetTimestamp = parseInt(
					octokitError.response.headers['x-ratelimit-reset'] || '0',
					10
				);
				const limit = parseInt(
					octokitError.response.headers['x-ratelimit-limit'] || '0',
					10
				);

				throw new GitHubRateLimitError(
					'GitHub API rate limit exceeded',
					new Date(resetTimestamp * 1000),
					limit,
					0
				);
			}

			// Generic API errors
			throw new GitHubAPIError(
				octokitError.response?.data?.message ||
					octokitError.message ||
					'GitHub API error',
				octokitError.status
			);
		}

		// Unknown errors
		throw new GitHubAPIError(
			error instanceof Error ? error.message : 'Unknown error occurred',
			500
		);
	}

	/**
	 * Verify repository access
	 * @param owner Repository owner (username or organization)
	 * @param repo Repository name
	 * @returns Repository information if accessible
	 * @throws {GitHubAPIError} If repository is not accessible
	 */
	async verifyRepositoryAccess(
		owner: string,
		repo: string
	): Promise<{
		id: number;
		name: string;
		fullName: string;
		private: boolean;
		permissions: {
			admin: boolean;
			push: boolean;
			pull: boolean;
		};
	}> {
		try {
			this.logger.debug('Verifying repository access', { owner, repo });

			const { data } = await this.octokit.rest.repos.get({
				owner,
				repo
			});

			this.logger.info('Repository access verified', {
				fullName: data.full_name
			});

			return {
				id: data.id,
				name: data.name,
				fullName: data.full_name,
				private: data.private,
				permissions: {
					admin: data.permissions?.admin ?? false,
					push: data.permissions?.push ?? false,
					pull: data.permissions?.pull ?? false
				}
			};
		} catch (error) {
			this.handleError(error, 'Failed to verify repository access');
		}
	}
}
