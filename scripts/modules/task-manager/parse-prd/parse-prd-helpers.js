/**
 * Helper functions for PRD parsing
 */

import fs from 'fs';
import path from 'path';
import boxen from 'boxen';
import chalk from 'chalk';
import { ensureTagMetadata, findTaskById } from '../../utils.js';
import { displayParsePrdSummary } from '../../../../src/ui/parse-prd.js';
import { TimeoutManager } from '../../../../src/utils/timeout-manager.js';
import { displayAiUsageSummary } from '../../ui.js';
import { getPromptManager } from '../../prompt-manager.js';
import { getDefaultPriority } from '../../config-manager.js';

/**
 * Estimate token count from text
 * @param {string} text - Text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
	// Common approximation: ~4 characters per token for English
	return Math.ceil(text.length / 4);
}

/**
 * Preprocess PRD content to remove instructional scaffolding
 * Strips RPG template boilerplate while preserving actual requirements
 * @param {string} prdContent - Raw PRD content
 * @returns {string} Preprocessed PRD content
 */
export function preprocessPRD(prdContent) {
	let processed = prdContent;

	// 1. Remove <rpg-method> wrapper (template introduction)
	processed = processed.replace(
		/<rpg-method>[\s\S]*?<\/rpg-method>\n*(?:---\n*)?/,
		''
	);

	// 2. Remove <instruction> blocks (how to write content)
	processed = processed.replace(/<instruction>[\s\S]*?<\/instruction>\n*/g, '');

	// 3. Remove <example> blocks (good/bad pattern examples)
	processed = processed.replace(/<example[^>]*>[\s\S]*?<\/example>\n*/g, '');

	// 4. Remove <task-master-integration> section (meta-documentation)
	processed = processed.replace(
		/<task-master-integration>[\s\S]*?<\/task-master-integration>/,
		''
	);

	// 5. Clean up excessive newlines (leave max 2 consecutive)
	processed = processed.replace(/\n{3,}/g, '\n\n');

	return processed.trim();
}

/**
 * Detect if PRD is incremental (builds on existing tasks)
 * @param {string} prdContent - PRD content to analyze
 * @returns {boolean} True if PRD appears to reference existing work
 */
export function detectIncrementalPRD(prdContent) {
	// Pattern 1: Direct task ID references
	// Match: #123, Task #123, task #123 (1-4 digits, typical task IDs)
	// Don't match: #123456 (hex colors - too many digits)
	// Require word boundary or whitespace before #, and no more digits after
	const taskIdPattern = /(?:^|\s|task\s+)#(\d{1,4})(?!\d)/gi;
	if (taskIdPattern.test(prdContent)) {
		return true;
	}

	// Pattern 2: Incremental keywords (case-insensitive)
	const incrementalKeywords = [
		/\bbuilds?\s+on\b/i,
		/\bextends?\b/i,
		/\bphase\s+\d+/i,
		/\bincremental/i,
		/\bexisting\s+task/i,
		/\bcurrent\s+implementation/i,
		/\bprevious\s+work/i,
		/\balready\s+implemented/i,
		/\benhance\s+existing/i,
		/\bimprove\s+existing/i,
		/\badd\s+to\s+existing/i
	];

	return incrementalKeywords.some((pattern) => pattern.test(prdContent));
}

/**
 * Summarize existing tasks for context
 * @param {Array} tasks - Array of task objects
 * @returns {string} Summarized task list
 */
export function summarizeTasksForContext(tasks) {
	if (!tasks || tasks.length === 0) {
		return '';
	}

	return tasks
		.map((task) => {
			const deps =
				task.dependencies?.length > 0
					? ` [depends on: ${task.dependencies.join(', ')}]`
					: '';
			return `Task #${task.id}: ${task.title} (${task.status})${deps}`;
		})
		.join('\n');
}

/**
 * Read and validate PRD content
 * @param {string} prdPath - Path to PRD file
 * @param {Object} options - Options object
 * @param {boolean} options.noPreprocess - Skip preprocessing (for testing/debugging)
 * @returns {string} PRD content (preprocessed by default)
 * @throws {Error} If file is empty or cannot be read
 */
export function readPrdContent(prdPath, options = {}) {
	const prdContent = fs.readFileSync(prdPath, 'utf8');
	if (!prdContent) {
		throw new Error(`Input file ${prdPath} is empty or could not be read.`);
	}

	// Preprocess by default unless explicitly disabled
	if (options.noPreprocess) {
		return prdContent;
	}

	return preprocessPRD(prdContent);
}

/**
 * Load existing tasks from file
 * @param {string} tasksPath - Path to tasks file
 * @param {string} targetTag - Target tag to load from
 * @returns {{tasks: Array, nextId: number}} Existing tasks and next ID
 */
export function loadExistingTasks(tasksPath, targetTag) {
	let existingTasks = [];
	let nextId = 1;

	if (!fs.existsSync(tasksPath)) {
		return { existingTasks, nextId };
	}

	try {
		const existingFileContent = fs.readFileSync(tasksPath, 'utf8');
		const allData = JSON.parse(existingFileContent);

		if (allData[targetTag]?.tasks && Array.isArray(allData[targetTag].tasks)) {
			existingTasks = allData[targetTag].tasks;
			if (existingTasks.length > 0) {
				nextId = Math.max(...existingTasks.map((t) => t.id || 0)) + 1;
			}
		}
	} catch (error) {
		// If we can't read the file or parse it, assume no existing tasks
		return { existingTasks: [], nextId: 1 };
	}

	return { existingTasks, nextId };
}

/**
 * Validate overwrite/append operations
 * @param {Object} params
 * @returns {void}
 * @throws {Error} If validation fails
 */
export function validateFileOperations({
	existingTasks,
	targetTag,
	append,
	force,
	isMCP,
	logger
}) {
	const hasExistingTasks = existingTasks.length > 0;

	if (!hasExistingTasks) {
		logger.report(
			`Tag '${targetTag}' is empty or doesn't exist. Creating/updating tag with new tasks.`,
			'info'
		);
		return;
	}

	if (append) {
		logger.report(
			`Append mode enabled. Found ${existingTasks.length} existing tasks in tag '${targetTag}'.`,
			'info'
		);
		return;
	}

	if (!force) {
		const errorMessage = `Tag '${targetTag}' already contains ${existingTasks.length} tasks. Use --force to overwrite or --append to add to existing tasks.`;
		logger.report(errorMessage, 'error');

		if (isMCP) {
			throw new Error(errorMessage);
		} else {
			console.error(chalk.red(errorMessage));
			process.exit(1);
		}
	}

	logger.report(
		`Force flag enabled. Overwriting existing tasks in tag '${targetTag}'.`,
		'debug'
	);
}

/**
 * Process and transform tasks with ID remapping
 * @param {Array} rawTasks - Raw tasks from AI
 * @param {number} startId - Starting ID for new tasks
 * @param {Array} existingTasks - Existing tasks for dependency validation
 * @param {string} defaultPriority - Default priority for tasks
 * @returns {Array} Processed tasks with remapped IDs
 */
export function processTasks(
	rawTasks,
	startId,
	existingTasks,
	defaultPriority
) {
	let currentId = startId;
	const taskMap = new Map();

	// First pass: assign new IDs and create mapping
	const processedTasks = rawTasks.map((task) => {
		const newId = currentId++;
		taskMap.set(task.id, newId);

		return {
			...task,
			id: newId,
			status: task.status || 'pending',
			priority: task.priority || defaultPriority,
			dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
			subtasks: task.subtasks || [],
			// Ensure all required fields have values
			title: task.title || '',
			description: task.description || '',
			details: task.details || '',
			testStrategy: task.testStrategy || ''
		};
	});

	// Second pass: remap dependencies
	processedTasks.forEach((task) => {
		task.dependencies = task.dependencies
			.map((depId) => taskMap.get(depId))
			.filter(
				(newDepId) =>
					newDepId != null &&
					newDepId < task.id &&
					(findTaskById(existingTasks, newDepId) ||
						processedTasks.some((t) => t.id === newDepId))
			);
	});

	return processedTasks;
}

/**
 * Save tasks to file with tag support
 * @param {string} tasksPath - Path to save tasks
 * @param {Array} tasks - Tasks to save
 * @param {string} targetTag - Target tag
 * @param {Object} logger - Logger instance
 */
export function saveTasksToFile(tasksPath, tasks, targetTag, logger) {
	// Create directory if it doesn't exist
	const tasksDir = path.dirname(tasksPath);
	if (!fs.existsSync(tasksDir)) {
		fs.mkdirSync(tasksDir, { recursive: true });
	}

	// Read existing file to preserve other tags
	let outputData = {};
	if (fs.existsSync(tasksPath)) {
		try {
			const existingFileContent = fs.readFileSync(tasksPath, 'utf8');
			outputData = JSON.parse(existingFileContent);
		} catch (error) {
			outputData = {};
		}
	}

	// Update only the target tag
	outputData[targetTag] = {
		tasks: tasks,
		metadata: {
			created:
				outputData[targetTag]?.metadata?.created || new Date().toISOString(),
			updated: new Date().toISOString(),
			description: `Tasks for ${targetTag} context`
		}
	};

	// Ensure proper metadata
	ensureTagMetadata(outputData[targetTag], {
		description: `Tasks for ${targetTag} context`
	});

	// Write back to file
	fs.writeFileSync(tasksPath, JSON.stringify(outputData, null, 2));

	logger.report(
		`Successfully saved ${tasks.length} tasks to ${tasksPath}`,
		'debug'
	);
}

/**
 * Build prompts for AI service
 * @param {Object} config - Configuration object
 * @param {string} prdContent - PRD content
 * @param {number} nextId - Next task ID
 * @param {Array} existingTasks - Existing tasks (for context if needed)
 * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
 */
export async function buildPrompts(
	config,
	prdContent,
	nextId,
	existingTasks = []
) {
	const promptManager = getPromptManager();
	const defaultTaskPriority =
		getDefaultPriority(config.projectRoot) || 'medium';

	// Build base parameters
	const promptParams = {
		research: config.research,
		numTasks: config.numTasks,
		nextId,
		prdContent,
		prdPath: config.prdPath,
		defaultTaskPriority,
		hasCodebaseAnalysis: config.hasCodebaseAnalysis(),
		projectRoot: config.projectRoot || ''
	};

	// Auto-detect if PRD is incremental and include context if needed
	if (detectIncrementalPRD(prdContent) && existingTasks.length > 0) {
		const taskSummary = summarizeTasksForContext(existingTasks);
		promptParams.existingTasksContext = `\n\nExisting tasks in this project (${existingTasks.length} total):\n${taskSummary}`;
	}

	return promptManager.loadPrompt('parse-prd', promptParams);
}

/**
 * Handle progress reporting for both CLI and MCP
 * @param {Object} params
 */
export async function reportTaskProgress({
	task,
	currentCount,
	totalTasks,
	estimatedTokens,
	progressTracker,
	reportProgress,
	priorityMap,
	defaultPriority,
	estimatedInputTokens
}) {
	const priority = task.priority || defaultPriority;
	const priorityIndicator = priorityMap[priority] || priorityMap.medium;

	// CLI progress tracker
	if (progressTracker) {
		progressTracker.addTaskLine(currentCount, task.title, priority);
		if (estimatedTokens) {
			progressTracker.updateTokens(estimatedInputTokens, estimatedTokens);
		}
	}

	// MCP progress reporting
	if (reportProgress) {
		try {
			const outputTokens = estimatedTokens
				? Math.floor(estimatedTokens / totalTasks)
				: 0;

			await reportProgress({
				progress: currentCount,
				total: totalTasks,
				message: `${priorityIndicator} Task ${currentCount}/${totalTasks} - ${task.title} | ~Output: ${outputTokens} tokens`
			});
		} catch (error) {
			// Ignore progress reporting errors
		}
	}
}

/**
 * Display completion summary for CLI
 * @param {Object} params
 */
export async function displayCliSummary({
	processedTasks,
	nextId,
	summary,
	prdPath,
	tasksPath,
	usedFallback,
	aiServiceResponse
}) {
	// Generate task file names
	const taskFilesGenerated = (() => {
		if (!Array.isArray(processedTasks) || processedTasks.length === 0) {
			return `task_${String(nextId).padStart(3, '0')}.txt`;
		}
		const firstNewTaskId = processedTasks[0].id;
		const lastNewTaskId = processedTasks[processedTasks.length - 1].id;
		if (processedTasks.length === 1) {
			return `task_${String(firstNewTaskId).padStart(3, '0')}.txt`;
		}
		return `task_${String(firstNewTaskId).padStart(3, '0')}.txt -> task_${String(lastNewTaskId).padStart(3, '0')}.txt`;
	})();

	displayParsePrdSummary({
		totalTasks: processedTasks.length,
		taskPriorities: summary.taskPriorities,
		prdFilePath: prdPath,
		outputPath: tasksPath,
		elapsedTime: summary.elapsedTime,
		usedFallback,
		taskFilesGenerated,
		actionVerb: summary.actionVerb
	});

	// Display telemetry
	if (aiServiceResponse?.telemetryData) {
		// For streaming, wait briefly to allow usage data to be captured
		if (aiServiceResponse.mainResult?.usage) {
			// Give the usage promise a short time to resolve
			await TimeoutManager.withSoftTimeout(
				aiServiceResponse.mainResult.usage,
				1000,
				undefined
			);
		}
		displayAiUsageSummary(aiServiceResponse.telemetryData, 'cli');
	}
}

/**
 * Display non-streaming CLI output
 * @param {Object} params
 */
export function displayNonStreamingCliOutput({
	processedTasks,
	research,
	finalTasks,
	tasksPath,
	aiServiceResponse
}) {
	console.log(
		boxen(
			chalk.green(
				`Successfully generated ${processedTasks.length} new tasks${research ? ' with research-backed analysis' : ''}. Total tasks in ${tasksPath}: ${finalTasks.length}`
			),
			{ padding: 1, borderColor: 'green', borderStyle: 'round' }
		)
	);

	console.log(
		boxen(
			chalk.white.bold('Next Steps:') +
				'\n\n' +
				`${chalk.cyan('1.')} Run ${chalk.yellow('task-master list')} to view all tasks\n` +
				`${chalk.cyan('2.')} Run ${chalk.yellow('task-master expand --id=<id>')} to break down a task into subtasks`,
			{
				padding: 1,
				borderColor: 'cyan',
				borderStyle: 'round',
				margin: { top: 1 }
			}
		)
	);

	if (aiServiceResponse?.telemetryData) {
		displayAiUsageSummary(aiServiceResponse.telemetryData, 'cli');
	}
}
