/**
 * @fileoverview Delegation Helper for Background Agent Routing
 * Emits delegation metadata when Task Master operations should be
 * automatically handled by the specialist agent.
 */

/**
 * Delegation context information
 */
export interface DelegationContext {
	/** Command being executed (e.g., 'list', 'show', 'next') */
	command: string;
	/** Full command with arguments */
	fullCommand?: string;
	/** Active tag from git or config */
	tag?: string;
	/** Whether this is a Task Master command */
	isTaskMasterCommand: boolean;
	/** Whether delegation should be triggered */
	shouldDelegate: boolean;
	/** Reason for delegation decision */
	reason?: string;
	/** Target agent for delegation */
	targetAgent?: string;
}

/**
 * Delegation metadata emitted for background agent routing
 */
export interface DelegationMetadata {
	/** Timestamp of delegation decision */
	timestamp: Date;
	/** Delegation context */
	context: DelegationContext;
	/** Delegation configuration */
	config: {
		/** Background agent descriptor path */
		descriptorPath: string;
		/** Target agent name */
		agentName: string;
		/** Priority level */
		priority: 'high' | 'medium' | 'low';
	};
}

/**
 * List of Task Master command verbs that trigger delegation
 */
const TASK_MASTER_COMMANDS = [
	'list',
	'show',
	'next',
	'expand',
	'update',
	'update-task',
	'update-subtask',
	'set-status',
	'analyze-complexity',
	'complexity-report',
	'add-task',
	'add-dependency',
	'move',
	'validate-dependencies',
	'generate'
];

/**
 * Tags that trigger automatic delegation
 */
const DELEGATION_TAGS = ['taskmaster', 'task-master'];

/**
 * Check if a command should trigger background agent delegation
 * @param command - Command name or full command string
 * @param tag - Optional tag from git or project metadata
 * @returns Delegation context
 */
export function shouldDelegateToSpecialist(
	command: string,
	tag?: string
): DelegationContext {
	// Trim whitespace and extract command verb
	const trimmedCommand = command.trim();

	// Remove 'task-master' prefix if present and extract verb
	const withoutPrefix = trimmedCommand.replace(/^task-master\s+/, '');
	const commandVerb = withoutPrefix.split(/\s+/)[0];

	// Check if it's a Task Master command
	const isTaskMasterCommand = TASK_MASTER_COMMANDS.includes(commandVerb);

	// Check if tag matches delegation triggers
	const hasMatchingTag = tag ? DELEGATION_TAGS.includes(tag.toLowerCase()) : false;

	// Determine if delegation should occur
	const shouldDelegate = isTaskMasterCommand || hasMatchingTag;

	// Determine reason
	let reason: string | undefined;
	if (isTaskMasterCommand && hasMatchingTag) {
		reason = 'Task Master command with taskmaster tag';
	} else if (isTaskMasterCommand) {
		reason = 'Task Master command detected';
	} else if (hasMatchingTag) {
		reason = 'Taskmaster tag detected';
	}

	return {
		command: commandVerb,
		fullCommand: command,
		tag,
		isTaskMasterCommand,
		shouldDelegate,
		reason,
		targetAgent: shouldDelegate ? 'task-master-specialist' : undefined
	};
}

/**
 * Emit delegation metadata for background agent routing
 * @param command - Command being executed
 * @param tag - Optional tag from git or config
 * @returns Delegation metadata if delegation should occur, null otherwise
 */
export function emitDelegationMetadata(
	command: string,
	tag?: string
): DelegationMetadata | null {
	const context = shouldDelegateToSpecialist(command, tag);

	if (!context.shouldDelegate) {
		return null;
	}

	return {
		timestamp: new Date(),
		context,
		config: {
			descriptorPath: '.claude/background-agents/task-master-specialist.json',
			agentName: 'task-master-specialist',
			priority: 'high'
		}
	};
}

/**
 * Get active tag from git config or Task Master config
 * @param projectRoot - Project root directory
 * @returns Active tag if found
 */
export async function getActiveTag(projectRoot: string): Promise<string | undefined> {
	try {
		// Try git config first
		const { execSync } = await import('child_process');
		const gitTag = execSync('git config task-master.tag', {
			cwd: projectRoot,
			encoding: 'utf8'
		}).trim();

		if (gitTag) {
			return gitTag;
		}
	} catch {
		// Git config not set, try Task Master config
	}

	try {
		// Try Task Master config
		const { readFile } = await import('fs/promises');
		const { join } = await import('path');
		const configPath = join(projectRoot, '.taskmaster', 'config.json');
		const configContent = await readFile(configPath, 'utf8');
		const config = JSON.parse(configContent);

		return config.activeTag;
	} catch {
		// No active tag found
		return undefined;
	}
}

/**
 * Check if delegation is enabled in settings
 * @returns Whether delegation is enabled
 */
export function isDelegationEnabled(): boolean {
	// For now, delegation is in specification phase
	// Return false until Claude Code implements background agent support
	return false;
}

/**
 * Get delegation configuration
 * @returns Delegation configuration if available
 */
export interface DelegationConfig {
	enabled: boolean;
	descriptorPath: string;
	debug: boolean;
}

export async function getDelegationConfig(): Promise<DelegationConfig | null> {
	try {
		const { readFile } = await import('fs/promises');
		const { join } = await import('path');

		// Try to read local settings
		const settingsPath = join(process.cwd(), '.claude', 'settings.local.json');
		const settingsContent = await readFile(settingsPath, 'utf8');
		const settings = JSON.parse(settingsContent);

		// Check for backgroundAgents configuration
		// (This field is not yet supported in Claude Code schema)
		const bgAgents = settings.backgroundAgents?.taskMasterSpecialist;
		if (bgAgents) {
			return {
				enabled: bgAgents.enabled ?? false,
				descriptorPath: bgAgents.descriptorPath ?? '.claude/background-agents/task-master-specialist.json',
				debug: bgAgents.debug ?? false
			};
		}
	} catch {
		// Settings not found or invalid
	}

	return null;
}
