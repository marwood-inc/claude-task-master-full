/**
 * GitHub API client for Task Master integration
 * Provides abstraction over @octokit/rest for task-master specific operations
 */

import { Octokit } from '@octokit/rest';
import type { OctokitOptions } from '@octokit/core';
import { getLogger } from '../../../common/logger/index.js';
import type {
	GitHubIssue,
	GitHubLabel,
	GitHubMilestone,
	GitHubIssueUpdate,
	GitHubLabelUpdate,
	GitHubMilestoneUpdate
} from '../types/index.js';

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

	// ==================== Issue Operations ====================

	/**
	 * Create a new GitHub issue
	 */
	async createIssue(
		owner: string,
		repo: string,
		data: {
			title: string;
			body?: string;
			labels?: string[];
			assignees?: string[];
			milestone?: number;
		}
	): Promise<GitHubIssue> {
		try {
			this.logger.debug('Creating issue', { owner, repo, title: data.title });

			const { data: issue } = await this.octokit.rest.issues.create({
				owner,
				repo,
				...data
			});

			this.logger.info('Issue created', {
				number: issue.number,
				title: issue.title
			});

			return issue as GitHubIssue;
		} catch (error) {
			this.handleError(error, 'Failed to create issue');
		}
	}

	/**
	 * Get a GitHub issue by number
	 */
	async getIssue(
		owner: string,
		repo: string,
		issueNumber: number
	): Promise<GitHubIssue> {
		try {
			this.logger.debug('Getting issue', { owner, repo, issueNumber });

			const { data } = await this.octokit.rest.issues.get({
				owner,
				repo,
				issue_number: issueNumber
			});

			return data as GitHubIssue;
		} catch (error) {
			this.handleError(error, `Failed to get issue #${issueNumber}`);
		}
	}

	/**
	 * Update a GitHub issue
	 */
	async updateIssue(
		owner: string,
		repo: string,
		issueNumber: number,
		data: GitHubIssueUpdate
	): Promise<GitHubIssue> {
		try {
			this.logger.debug('Updating issue', { owner, repo, issueNumber });

			const { data: issue } = await this.octokit.rest.issues.update({
				owner,
				repo,
				issue_number: issueNumber,
				...data
			});

			this.logger.info('Issue updated', {
				number: issue.number,
				title: issue.title
			});

			return issue as GitHubIssue;
		} catch (error) {
			this.handleError(error, `Failed to update issue #${issueNumber}`);
		}
	}

	/**
	 * List issues in a repository
	 */
	async listIssues(
		owner: string,
		repo: string,
		options?: {
			state?: 'open' | 'closed' | 'all';
			labels?: string;
			sort?: 'created' | 'updated' | 'comments';
			direction?: 'asc' | 'desc';
			since?: string;
			per_page?: number;
			page?: number;
		}
	): Promise<GitHubIssue[]> {
		try {
			this.logger.debug('Listing issues', { owner, repo, options });

			const { data } = await this.octokit.rest.issues.listForRepo({
				owner,
				repo,
				...options
			});

			return data as GitHubIssue[];
		} catch (error) {
			this.handleError(error, 'Failed to list issues');
		}
	}

	// ==================== Label Operations ====================

	/**
	 * Create a new label
	 */
	async createLabel(
		owner: string,
		repo: string,
		data: {
			name: string;
			color: string;
			description?: string;
		}
	): Promise<GitHubLabel> {
		try {
			this.logger.debug('Creating label', { owner, repo, name: data.name });

			const { data: label } = await this.octokit.rest.issues.createLabel({
				owner,
				repo,
				...data
			});

			this.logger.info('Label created', { name: label.name });

			return label as GitHubLabel;
		} catch (error) {
			this.handleError(error, 'Failed to create label');
		}
	}

	/**
	 * Get a label by name
	 */
	async getLabel(
		owner: string,
		repo: string,
		name: string
	): Promise<GitHubLabel> {
		try {
			this.logger.debug('Getting label', { owner, repo, name });

			const { data } = await this.octokit.rest.issues.getLabel({
				owner,
				repo,
				name
			});

			return data as GitHubLabel;
		} catch (error) {
			this.handleError(error, `Failed to get label "${name}"`);
		}
	}

	/**
	 * Update a label
	 */
	async updateLabel(
		owner: string,
		repo: string,
		name: string,
		data: GitHubLabelUpdate
	): Promise<GitHubLabel> {
		try {
			this.logger.debug('Updating label', { owner, repo, name });

			const updateData: {
				owner: string;
				repo: string;
				name: string;
				new_name?: string;
				color?: string;
				description?: string;
			} = {
				owner,
				repo,
				name
			};

			if (data.new_name) updateData.new_name = data.new_name;
			if (data.color) updateData.color = data.color;
			if (data.description !== undefined && data.description !== null) {
				updateData.description = data.description;
			}

			const { data: label } = await this.octokit.rest.issues.updateLabel(updateData);

			this.logger.info('Label updated', { name: label.name });

			return label as GitHubLabel;
		} catch (error) {
			this.handleError(error, `Failed to update label "${name}"`);
		}
	}

	/**
	 * Delete a label
	 */
	async deleteLabel(owner: string, repo: string, name: string): Promise<void> {
		try {
			this.logger.debug('Deleting label', { owner, repo, name });

			await this.octokit.rest.issues.deleteLabel({
				owner,
				repo,
				name
			});

			this.logger.info('Label deleted', { name });
		} catch (error) {
			this.handleError(error, `Failed to delete label "${name}"`);
		}
	}

	/**
	 * List all labels in a repository
	 */
	async listLabels(
		owner: string,
		repo: string,
		options?: {
			per_page?: number;
			page?: number;
		}
	): Promise<GitHubLabel[]> {
		try {
			this.logger.debug('Listing labels', { owner, repo });

			const { data } = await this.octokit.rest.issues.listLabelsForRepo({
				owner,
				repo,
				...options
			});

			return data as GitHubLabel[];
		} catch (error) {
			this.handleError(error, 'Failed to list labels');
		}
	}

	// ==================== Milestone Operations ====================

	/**
	 * Create a new milestone
	 */
	async createMilestone(
		owner: string,
		repo: string,
		data: {
			title: string;
			state?: 'open' | 'closed';
			description?: string;
			due_on?: string;
		}
	): Promise<GitHubMilestone> {
		try {
			this.logger.debug('Creating milestone', { owner, repo, title: data.title });

			const { data: milestone } = await this.octokit.rest.issues.createMilestone(
				{
					owner,
					repo,
					...data
				}
			);

			this.logger.info('Milestone created', { title: milestone.title });

			return milestone as GitHubMilestone;
		} catch (error) {
			this.handleError(error, 'Failed to create milestone');
		}
	}

	/**
	 * Get a milestone by number
	 */
	async getMilestone(
		owner: string,
		repo: string,
		milestoneNumber: number
	): Promise<GitHubMilestone> {
		try {
			this.logger.debug('Getting milestone', { owner, repo, milestoneNumber });

			const { data } = await this.octokit.rest.issues.getMilestone({
				owner,
				repo,
				milestone_number: milestoneNumber
			});

			return data as GitHubMilestone;
		} catch (error) {
			this.handleError(error, `Failed to get milestone #${milestoneNumber}`);
		}
	}

	/**
	 * Update a milestone
	 */
	async updateMilestone(
		owner: string,
		repo: string,
		milestoneNumber: number,
		data: GitHubMilestoneUpdate
	): Promise<GitHubMilestone> {
		try {
			this.logger.debug('Updating milestone', { owner, repo, milestoneNumber });

			const updateData: {
				owner: string;
				repo: string;
				milestone_number: number;
				title?: string;
				state?: 'open' | 'closed';
				description?: string;
				due_on?: string;
			} = {
				owner,
				repo,
				milestone_number: milestoneNumber
			};

			if (data.title) updateData.title = data.title;
			if (data.state) updateData.state = data.state;
			if (data.description !== undefined && data.description !== null) {
				updateData.description = data.description;
			}
			if (data.due_on !== undefined && data.due_on !== null) {
				updateData.due_on = data.due_on;
			}

			const { data: milestone } = await this.octokit.rest.issues.updateMilestone(
				updateData
			);

			this.logger.info('Milestone updated', { title: milestone.title });

			return milestone as GitHubMilestone;
		} catch (error) {
			this.handleError(error, `Failed to update milestone #${milestoneNumber}`);
		}
	}

	/**
	 * Delete a milestone
	 */
	async deleteMilestone(
		owner: string,
		repo: string,
		milestoneNumber: number
	): Promise<void> {
		try {
			this.logger.debug('Deleting milestone', { owner, repo, milestoneNumber });

			await this.octokit.rest.issues.deleteMilestone({
				owner,
				repo,
				milestone_number: milestoneNumber
			});

			this.logger.info('Milestone deleted', { milestoneNumber });
		} catch (error) {
			this.handleError(error, `Failed to delete milestone #${milestoneNumber}`);
		}
	}

	/**
	 * List all milestones in a repository
	 */
	async listMilestones(
		owner: string,
		repo: string,
		options?: {
			state?: 'open' | 'closed' | 'all';
			sort?: 'due_on' | 'completeness';
			direction?: 'asc' | 'desc';
			per_page?: number;
			page?: number;
		}
	): Promise<GitHubMilestone[]> {
		try {
			this.logger.debug('Listing milestones', { owner, repo });

			const { data } = await this.octokit.rest.issues.listMilestones({
				owner,
				repo,
				...options
			});

			return data as GitHubMilestone[];
		} catch (error) {
			this.handleError(error, 'Failed to list milestones');
		}
	}

	// ==================== Project Board Operations (Classic Projects v1) ====================

	/**
	 * List repository projects (classic)
	 */
	async listRepoProjects(
		owner: string,
		repo: string,
		options?: {
			state?: 'open' | 'closed' | 'all';
			per_page?: number;
			page?: number;
		}
	): Promise<any[]> {
		try {
			this.logger.debug('Listing repository projects', { owner, repo });

			const { data } = await this.octokit.rest.projects.listForRepo({
				owner,
				repo,
				state: options?.state,
				per_page: options?.per_page,
				page: options?.page
			});

			return data;
		} catch (error) {
			this.handleError(error, 'Failed to list repository projects');
		}
	}

	/**
	 * Get a project by ID
	 */
	async getProject(projectId: number): Promise<any> {
		try {
			this.logger.debug('Getting project', { projectId });

			const { data } = await this.octokit.rest.projects.get({
				project_id: projectId
			});

			return data;
		} catch (error) {
			this.handleError(error, `Failed to get project #${projectId}`);
		}
	}

	/**
	 * List columns in a project
	 */
	async listProjectColumns(projectId: number): Promise<any[]> {
		try {
			this.logger.debug('Listing project columns', { projectId });

			const { data } = await this.octokit.rest.projects.listColumns({
				project_id: projectId
			});

			return data;
		} catch (error) {
			this.handleError(error, `Failed to list columns for project #${projectId}`);
		}
	}

	/**
	 * Get a column by ID
	 */
	async getProjectColumn(columnId: number): Promise<any> {
		try {
			this.logger.debug('Getting project column', { columnId });

			const { data } = await this.octokit.rest.projects.getColumn({
				column_id: columnId
			});

			return data;
		} catch (error) {
			this.handleError(error, `Failed to get column #${columnId}`);
		}
	}

	/**
	 * List cards in a project column
	 */
	async listProjectColumnCards(
		columnId: number,
		options?: {
			archived_state?: 'all' | 'archived' | 'not_archived';
			per_page?: number;
			page?: number;
		}
	): Promise<any[]> {
		try {
			this.logger.debug('Listing column cards', { columnId });

			const { data } = await this.octokit.rest.projects.listCards({
				column_id: columnId,
				archived_state: options?.archived_state,
				per_page: options?.per_page,
				page: options?.page
			});

			return data;
		} catch (error) {
			this.handleError(error, `Failed to list cards for column #${columnId}`);
		}
	}

	/**
	 * Create a project card for an issue
	 */
	async createProjectCard(
		columnId: number,
		contentId: number,
		contentType: 'Issue' | 'PullRequest'
	): Promise<any> {
		try {
			this.logger.debug('Creating project card', {
				columnId,
				contentId,
				contentType
			});

			const { data } = await this.octokit.rest.projects.createCard({
				column_id: columnId,
				content_id: contentId,
				content_type: contentType
			});

			this.logger.info('Project card created', {
				cardId: data.id,
				columnId
			});

			return data;
		} catch (error) {
			this.handleError(
				error,
				`Failed to create card for ${contentType} #${contentId}`
			);
		}
	}

	/**
	 * Move a project card to a different column
	 */
	async moveProjectCard(
		cardId: number,
		position: 'top' | 'bottom' | `after:${number}`,
		columnId?: number
	): Promise<any> {
		try {
			this.logger.debug('Moving project card', { cardId, position, columnId });

			const moveParams: {
				card_id: number;
				position: string;
				column_id?: number;
			} = {
				card_id: cardId,
				position
			};

			if (columnId !== undefined) {
				moveParams.column_id = columnId;
			}

			const { data } = await this.octokit.rest.projects.moveCard(moveParams);

			this.logger.info('Project card moved', {
				cardId,
				newColumnId: columnId
			});

			return data;
		} catch (error) {
			this.handleError(error, `Failed to move card #${cardId}`);
		}
	}

	/**
	 * Delete a project card
	 */
	async deleteProjectCard(cardId: number): Promise<void> {
		try {
			this.logger.debug('Deleting project card', { cardId });

			await this.octokit.rest.projects.deleteCard({
				card_id: cardId
			});

			this.logger.info('Project card deleted', { cardId });
		} catch (error) {
			this.handleError(error, `Failed to delete card #${cardId}`);
		}
	}

	/**
	 * Get a project card by ID
	 */
	async getProjectCard(cardId: number): Promise<any> {
		try {
			this.logger.debug('Getting project card', { cardId });

			const { data } = await this.octokit.rest.projects.getCard({
				card_id: cardId
			});

			return data;
		} catch (error) {
			this.handleError(error, `Failed to get card #${cardId}`);
		}
	}

	/**
	 * Find project card for an issue
	 * Helper method to find if an issue already has a card in a project
	 */
	async findProjectCardForIssue(
		projectId: number,
		issueId: number
	): Promise<any | null> {
		try {
			this.logger.debug('Finding project card for issue', { projectId, issueId });

			// Get all columns in the project
			const columns = await this.listProjectColumns(projectId);

			// Search each column for a card with this issue
			for (const column of columns) {
				const cards = await this.listProjectColumnCards(column.id);

				for (const card of cards) {
					// Check if this card is for our issue
					if (card.content_url && card.content_url.includes(`/issues/${issueId}`)) {
						return card;
					}
				}
			}

			return null;
		} catch (error) {
			this.logger.warn('Failed to find project card for issue', error);
			return null;
		}
	}

	// ==================== Assignee Operations ====================

	/**
	 * Validate username exists
	 * Checks if a username is valid and exists on GitHub
	 */
	async validateUsername(username: string): Promise<boolean> {
		try {
			this.logger.debug('Validating username', { username });

			await this.octokit.rest.users.getByUsername({
				username
			});

			return true;
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error) {
				const octokitError = error as { status: number };
				if (octokitError.status === 404) {
					this.logger.debug('Username not found', { username });
					return false;
				}
			}

			// Re-throw other errors
			this.handleError(error, `Failed to validate username "${username}"`);
		}
	}

	/**
	 * Add assignees to an issue
	 */
	async addAssignees(
		owner: string,
		repo: string,
		issueNumber: number,
		assignees: string[]
	): Promise<any> {
		try {
			this.logger.debug('Adding assignees to issue', {
				owner,
				repo,
				issueNumber,
				assignees
			});

			const { data } = await this.octokit.rest.issues.addAssignees({
				owner,
				repo,
				issue_number: issueNumber,
				assignees
			});

			this.logger.info('Assignees added', {
				issueNumber,
				assignees
			});

			return data;
		} catch (error) {
			this.handleError(
				error,
				`Failed to add assignees to issue #${issueNumber}`
			);
		}
	}

	/**
	 * Remove assignees from an issue
	 */
	async removeAssignees(
		owner: string,
		repo: string,
		issueNumber: number,
		assignees: string[]
	): Promise<any> {
		try {
			this.logger.debug('Removing assignees from issue', {
				owner,
				repo,
				issueNumber,
				assignees
			});

			const { data } = await this.octokit.rest.issues.removeAssignees({
				owner,
				repo,
				issue_number: issueNumber,
				assignees
			});

			this.logger.info('Assignees removed', {
				issueNumber,
				assignees
			});

			return data;
		} catch (error) {
			this.handleError(
				error,
				`Failed to remove assignees from issue #${issueNumber}`
			);
		}
	}
}
