/**
 * GitHub Field Mapping and Transformation Service
 * Maps between Task Master tasks and GitHub issues, handling field transformations
 */

import type { Task, TaskStatus, TaskPriority, Subtask } from '../../../common/types/index.js';
import type {
	GitHubIssue,
	GitHubIssueUpdate,
	GitHubLabel
} from '../types/github-types.js';
import { getLogger } from '../../../common/logger/index.js';

const logger = getLogger('GitHubFieldMapper');

/**
 * Mapping configuration for field transformations
 */
export interface FieldMappingConfig {
	/**
	 * Prefix for Task Master labels (e.g., 'tm-')
	 * Helps distinguish Task Master-generated labels
	 */
	labelPrefix?: string;

	/**
	 * Whether to include Task Master metadata in issue body
	 */
	includeMetadata?: boolean;

	/**
	 * Custom status mappings (Task Master status -> GitHub state)
	 */
	statusMappings?: Partial<Record<TaskStatus, 'open' | 'closed'>>;

	/**
	 * Custom priority label names
	 */
	priorityLabels?: Partial<Record<TaskPriority, string>>;
}

/**
 * Default mapping configuration
 */
const DEFAULT_CONFIG: Required<FieldMappingConfig> = {
	labelPrefix: 'tm-',
	includeMetadata: true,
	statusMappings: {
		'pending': 'open',
		'in-progress': 'open',
		'review': 'open',
		'blocked': 'open',
		'deferred': 'open',
		'done': 'closed',
		'completed': 'closed',
		'cancelled': 'closed'
	},
	priorityLabels: {
		'low': 'priority: low',
		'medium': 'priority: medium',
		'high': 'priority: high',
		'critical': 'priority: critical'
	}
};

/**
 * GitHub Field Mapper Service
 * Handles bidirectional transformation between Task Master and GitHub entities
 */
export class GitHubFieldMapper {
	private config: Required<FieldMappingConfig>;

	constructor(config?: FieldMappingConfig) {
		this.config = {
			...DEFAULT_CONFIG,
			...config,
			statusMappings: {
				...DEFAULT_CONFIG.statusMappings,
				...config?.statusMappings
			},
			priorityLabels: {
				...DEFAULT_CONFIG.priorityLabels,
				...config?.priorityLabels
			}
		};

		logger.debug('GitHubFieldMapper initialized', { config: this.config });
	}

	/**
	 * Map Task Master task to GitHub issue creation data
	 */
	taskToIssueCreate(task: Task): {
		title: string;
		body: string;
		labels: string[];
		assignees?: string[];
		milestone?: number;
	} {
		logger.debug('Mapping task to GitHub issue create', { taskId: task.id });

		const body = this.buildIssueBody(task);
		const labels = this.buildIssueLabels(task);

		return {
			title: task.title,
			body,
			labels,
			assignees: task.assignee ? [task.assignee] : undefined
		};
	}

	/**
	 * Map Task Master task to GitHub issue update data
	 */
	taskToIssueUpdate(task: Task): GitHubIssueUpdate {
		logger.debug('Mapping task to GitHub issue update', { taskId: task.id });

		const state = this.mapTaskStatusToGitHubState(task.status);
		const body = this.buildIssueBody(task);
		const labels = this.buildIssueLabels(task);

		return {
			title: task.title,
			body,
			state,
			labels,
			assignees: task.assignee ? [task.assignee] : []
		};
	}

	/**
	 * Map GitHub issue to Task Master task data
	 */
	issueToTask(issue: GitHubIssue, existingTask?: Partial<Task>): Partial<Task> {
		logger.debug('Mapping GitHub issue to task', { issueNumber: issue.number });

		// Parse metadata from issue body if present
		const metadata = this.parseIssueMetadata(issue.body || '');
		const description = this.extractDescriptionFromBody(issue.body || '');

		// Map GitHub state to Task Master status
		const status = this.mapGitHubStateToTaskStatus(
			issue.state,
			issue.labels,
			existingTask?.status
		);

		// Extract priority from labels
		const priority = this.extractPriorityFromLabels(issue.labels, existingTask?.priority);

		// Extract tags from labels (excluding priority and status labels)
		const tags = this.extractTagsFromLabels(issue.labels);

		// Get assignee (primary)
		const assignee = issue.assignees?.[0]?.login;

		return {
			title: issue.title,
			description: description || issue.title,
			status,
			priority,
			assignee,
			tags,
			// Preserve existing task fields if available
			details: metadata.details || existingTask?.details || '',
			testStrategy: metadata.testStrategy || existingTask?.testStrategy || '',
			dependencies: metadata.dependencies || existingTask?.dependencies || [],
			subtasks: existingTask?.subtasks || []
		};
	}

	/**
	 * Build GitHub issue body from task
	 */
	private buildIssueBody(task: Task): string {
		let body = task.description;

		if (this.config.includeMetadata) {
			const metadata: Record<string, any> = {
				taskId: task.id
			};

			if (task.details) {
				metadata.details = task.details;
			}

			if (task.testStrategy) {
				metadata.testStrategy = task.testStrategy;
			}

			if (task.dependencies && task.dependencies.length > 0) {
				metadata.dependencies = task.dependencies;
			}

			if (task.effort) {
				metadata.effort = task.effort;
			}

			if (task.complexity) {
				metadata.complexity = task.complexity;
			}

			// Add metadata as HTML comment to preserve it but hide from rendered view
			const metadataComment = `\n\n<!-- Task Master Metadata\n${JSON.stringify(metadata, null, 2)}\n-->`;
			body += metadataComment;
		}

		// Add subtasks section if present
		if (task.subtasks && task.subtasks.length > 0) {
			body += '\n\n## Subtasks\n\n';
			for (const subtask of task.subtasks) {
				const checkbox = subtask.status === 'done' || subtask.status === 'completed' ? '[x]' : '[ ]';
				body += `- ${checkbox} ${subtask.title}\n`;
			}
		}

		return body;
	}

	/**
	 * Build GitHub issue labels from task
	 */
	private buildIssueLabels(task: Task): string[] {
		const labels: string[] = [];

		// Add priority label
		const priorityLabel = this.config.priorityLabels[task.priority];
		if (priorityLabel) {
			labels.push(priorityLabel);
		}

		// Add status label
		const statusLabel = `${this.config.labelPrefix}status:${task.status}`;
		labels.push(statusLabel);

		// Add task tags as labels
		if (task.tags && task.tags.length > 0) {
			labels.push(...task.tags);
		}

		// Add complexity label if present
		if (task.complexity) {
			const complexityLabel = `${this.config.labelPrefix}complexity:${task.complexity}`;
			labels.push(complexityLabel);
		}

		return labels;
	}

	/**
	 * Map Task Master status to GitHub state
	 */
	private mapTaskStatusToGitHubState(status: TaskStatus): 'open' | 'closed' {
		return this.config.statusMappings[status] || 'open';
	}

	/**
	 * Map GitHub state to Task Master status
	 */
	private mapGitHubStateToTaskStatus(
		state: 'open' | 'closed',
		labels: GitHubLabel[],
		existingStatus?: TaskStatus
	): TaskStatus {
		// Check for status label
		const statusLabel = labels.find(
			(label) => label.name.startsWith(this.config.labelPrefix + 'status:')
		);

		if (statusLabel) {
			const status = statusLabel.name.replace(this.config.labelPrefix + 'status:', '') as TaskStatus;
			return status;
		}

		// If no status label, use GitHub state mapping
		if (state === 'closed') {
			return existingStatus === 'cancelled' ? 'cancelled' : 'done';
		}

		// Default to existing status or pending
		return existingStatus || 'pending';
	}

	/**
	 * Extract priority from GitHub labels
	 */
	private extractPriorityFromLabels(
		labels: GitHubLabel[],
		existingPriority?: TaskPriority
	): TaskPriority {
		// Find priority label
		for (const [priority, labelName] of Object.entries(this.config.priorityLabels)) {
			if (labels.some((label) => label.name === labelName)) {
				return priority as TaskPriority;
			}
		}

		// Default to existing priority or medium
		return existingPriority || 'medium';
	}

	/**
	 * Extract tags from GitHub labels (excluding system labels)
	 */
	private extractTagsFromLabels(labels: GitHubLabel[]): string[] {
		const systemLabels = new Set([
			...Object.values(this.config.priorityLabels),
			// Status labels will be filtered by prefix check
		]);

		return labels
			.filter((label) => {
				// Exclude priority labels
				if (systemLabels.has(label.name)) {
					return false;
				}

				// Exclude Task Master system labels (those with prefix)
				if (label.name.startsWith(this.config.labelPrefix)) {
					return false;
				}

				return true;
			})
			.map((label) => label.name);
	}

	/**
	 * Parse Task Master metadata from issue body
	 */
	private parseIssueMetadata(body: string): {
		taskId?: string;
		details?: string;
		testStrategy?: string;
		dependencies?: string[];
		effort?: number;
		complexity?: string | number;
	} {
		// Extract metadata from HTML comment
		const metadataMatch = body.match(/<!-- Task Master Metadata\n([\s\S]*?)\n-->/);

		if (!metadataMatch) {
			return {};
		}

		try {
			return JSON.parse(metadataMatch[1]);
		} catch (error) {
			logger.warn('Failed to parse Task Master metadata from issue body', { error });
			return {};
		}
	}

	/**
	 * Extract description from issue body (excluding metadata and subtasks)
	 */
	private extractDescriptionFromBody(body: string): string {
		// Remove metadata comment
		let description = body.replace(/<!-- Task Master Metadata[\s\S]*?-->/g, '');

		// Remove subtasks section
		description = description.replace(/\n\n## Subtasks\n\n[\s\S]*$/g, '');

		return description.trim();
	}

	/**
	 * Create default labels for a repository
	 * Returns labels that should be created in the GitHub repository
	 */
	getDefaultLabels(): Array<{
		name: string;
		color: string;
		description: string;
	}> {
		return [
			// Priority labels
			{
				name: this.config.priorityLabels.low,
				color: '0E8A16', // Green
				description: 'Low priority task'
			},
			{
				name: this.config.priorityLabels.medium,
				color: 'FBCA04', // Yellow
				description: 'Medium priority task'
			},
			{
				name: this.config.priorityLabels.high,
				color: 'D93F0B', // Orange
				description: 'High priority task'
			},
			{
				name: this.config.priorityLabels.critical,
				color: 'B60205', // Red
				description: 'Critical priority task'
			}
		];
	}

	/**
	 * Get suggested status labels
	 * These are optional labels that can be created for better status tracking
	 */
	getSuggestedStatusLabels(): Array<{
		name: string;
		color: string;
		description: string;
	}> {
		return [
			{
				name: `${this.config.labelPrefix}status:pending`,
				color: 'D4C5F9', // Light purple
				description: 'Task is pending'
			},
			{
				name: `${this.config.labelPrefix}status:in-progress`,
				color: '0075CA', // Blue
				description: 'Task is in progress'
			},
			{
				name: `${this.config.labelPrefix}status:review`,
				color: 'FFA500', // Orange
				description: 'Task is in review'
			},
			{
				name: `${this.config.labelPrefix}status:blocked`,
				color: 'E99695', // Light red
				description: 'Task is blocked'
			},
			{
				name: `${this.config.labelPrefix}status:deferred`,
				color: 'C2E0C6', // Light green
				description: 'Task is deferred'
			}
		];
	}

	/**
	 * Get the current mapping configuration
	 */
	getConfig(): Required<FieldMappingConfig> {
		return { ...this.config };
	}

	/**
	 * Update mapping configuration
	 */
	updateConfig(config: Partial<FieldMappingConfig>): void {
		this.config = {
			...this.config,
			...config,
			statusMappings: {
				...this.config.statusMappings,
				...config.statusMappings
			},
			priorityLabels: {
				...this.config.priorityLabels,
				...config.priorityLabels
			}
		};

		logger.info('GitHubFieldMapper configuration updated', { config: this.config });
	}
}
