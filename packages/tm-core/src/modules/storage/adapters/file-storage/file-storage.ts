/**
 * @fileoverview Refactored file-based storage implementation for Task Master
 */

import type {
	Task,
	TaskMetadata,
	TaskStatus
} from '../../../../common/types/index.js';
import type {
	IStorage,
	StorageStats,
	UpdateStatusResult,
	LoadTasksOptions
} from '../../../../common/interfaces/storage.interface.js';
import { FormatHandler } from './format-handler.js';
import { FileOperations } from './file-operations.js';
import { PathResolver } from './path-resolver.js';
import { ComplexityReportManager } from '../../../reports/managers/complexity-report-manager.js';
import { getLogger } from '../../../../common/logger/factory.js';
import {
	CacheNamespace,
	CacheKeyBuilder,
	CacheManager,
	LRUCacheStrategy,
	isCacheMiss,
	type CacheMetrics
} from '../../../../common/cache/index.js';
import {
	WriteQueueManager,
	type WriteQueueMetrics
} from '../../../../common/write-queue/index.js';

/**
 * Cache entry structure
 */
interface CacheEntry {
	tasks: Task[];
}

/**
 * Task index entry for fast lookups
 */
interface TaskIndexEntry {
	id: string;
	position: number;
	tag: string;
	parentId?: string;
}

/**
 * Performance optimization flags (for benchmarking comparison)
 * Set TM_DISABLE_OPTIMIZATIONS=true to test baseline performance
 */
const PERFORMANCE_CONFIG = {
	useTaskIndex: process.env.TM_DISABLE_OPTIMIZATIONS !== 'true',
	useWriteThroughCache: process.env.TM_DISABLE_OPTIMIZATIONS !== 'true',
	useOptimizedCache: process.env.TM_DISABLE_OPTIMIZATIONS !== 'true'
};

/**
 * File-based storage implementation using a single tasks.json file with separated concerns
 * Now with clean cache architecture and write queue batching using dependency injection
 */
export class FileStorage implements IStorage {
	private formatHandler: FormatHandler;
	private fileOps: FileOperations;
	private pathResolver: PathResolver;
	private complexityManager: ComplexityReportManager;
	private cacheManager: CacheManager;
	private writeQueueManager: WriteQueueManager;
	private readonly CACHE_TTL = PERFORMANCE_CONFIG.useOptimizedCache ? 60000 : 5000; // 60s optimized, 5s baseline
	private logger = getLogger('FileStorage');
	
	// Task index for O(1) lookups instead of O(n) linear search (can be disabled for comparison)
	private taskIndex: Map<string, TaskIndexEntry> = new Map();
	private indexLastBuilt: number = 0;
	private readonly INDEX_TTL = 30000; // 30 seconds
	
	// Track active tag for cache management
	private activeTag: string | null = null;

	constructor(
		projectPath: string,
		cacheManager?: CacheManager,
		writeQueueManager?: WriteQueueManager
	) {
		this.formatHandler = new FormatHandler();
		this.pathResolver = new PathResolver(projectPath);
		this.complexityManager = new ComplexityReportManager(projectPath);

		// Use injected cache or create default
		this.cacheManager = cacheManager || this.createDefaultCache();

		// Use injected write queue or create default
		this.writeQueueManager =
			writeQueueManager || this.createDefaultWriteQueue();

		// Create FileOperations with write queue
		this.fileOps = new FileOperations(this.writeQueueManager);
	}

	/**
	 * Create default write queue configuration
	 */
	private createDefaultWriteQueue(): WriteQueueManager {
		return new WriteQueueManager({
			cacheManager: this.cacheManager,
			config: {
				maxWaitTime: 150, // 150ms flush interval
				maxBatchSize: 10, // Flush after 10 writes
				maxRetries: 3,
				enableMetrics: true,
				enableAutoFlush: true
			}
		});
	}

	/**
	 * Create default cache configuration with LRU strategy
	 */
	private createDefaultCache(): CacheManager {
		const strategy = new LRUCacheStrategy({
			maxEntries: PERFORMANCE_CONFIG.useOptimizedCache ? 3000 : 100, // Increased to 3000 for large datasets (16K+ items)
			ttl: this.CACHE_TTL,
			updateAgeOnGet: false,
			updateAgeOnHas: false,
			maxMemory: PERFORMANCE_CONFIG.useOptimizedCache ? 300 * 1024 * 1024 : 50 * 1024 * 1024, // 300MB for large datasets
			enableMetrics: true
		});

		return new CacheManager({
			strategy,
			enableMonitoring: false // Can be enabled for debugging
		});
	}

	/**
	 * Initialize storage by creating necessary directories
	 */
	async initialize(): Promise<void> {
		await this.fileOps.ensureDir(this.pathResolver.getTasksDir());
	}

	/**
	 * Close storage and cleanup resources
	 * Flushes write queue and clears cache
	 */
	async close(): Promise<void> {
		this.cacheManager.clear();
		// cleanup() already flushes the queue via shutdown(), no need to flush twice
		await this.fileOps.cleanup();
	}

	/**
	 * Get the storage type
	 */
	getStorageType(): 'file' {
		return 'file';
	}

	/**
	 * Get the current brief name (not applicable for file storage)
	 * @returns null (file storage doesn't use briefs)
	 */
	getCurrentBriefName(): null {
		return null;
	}

	/**
	 * Get statistics about the storage
	 */
	async getStats(): Promise<StorageStats> {
		const filePath = this.pathResolver.getTasksPath();

		try {
			const stats = await this.fileOps.getStats(filePath);
			const data = await this.fileOps.readJson(filePath);
			const tags = this.formatHandler.extractTags(data);

			let totalTasks = 0;
			const tagStats = tags.map((tag) => {
				const tasks = this.formatHandler.extractTasks(data, tag);
				const taskCount = tasks.length;
				totalTasks += taskCount;

				return {
					tag,
					taskCount,
					lastModified: stats.mtime.toISOString()
				};
			});

			return {
				totalTasks,
				totalTags: tags.length,
				lastModified: stats.mtime.toISOString(),
				storageSize: 0, // Could calculate actual file sizes if needed
				tagStats
			};
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return {
					totalTasks: 0,
					totalTags: 0,
					lastModified: new Date().toISOString(),
					storageSize: 0,
					tagStats: []
				};
			}
			throw new Error(`Failed to get storage stats: ${error.message}`);
		}
	}

	/**
	 * Generate a cache key for a given tag and options combination using namespace system
	 */
	private getCacheKey(tag: string, options?: LoadTasksOptions): string {
		const optionsHash = JSON.stringify(options || {});
		return CacheKeyBuilder.build(CacheNamespace.Storage, tag, optionsHash);
	}

	/**
	 * Build task index for fast lookups
	 * Index maps task IDs to their position in the array for O(1) access
	 */
	private buildTaskIndex(tasks: Task[], tag: string): void {
		this.taskIndex.clear();
		tasks.forEach((task, index) => {
			this.taskIndex.set(String(task.id), {
				id: String(task.id),
				position: index,
				tag,
				parentId: task.parentId ? String(task.parentId) : undefined
			});
			
			// Index subtasks too
			if (task.subtasks && task.subtasks.length > 0) {
				task.subtasks.forEach((subtask) => {
					this.taskIndex.set(String(subtask.id), {
						id: String(subtask.id),
						position: index, // Parent task position
						tag,
						parentId: String(task.id)
					});
				});
			}
		});
		this.indexLastBuilt = Date.now();
		this.logger.debug(`Built index for ${this.taskIndex.size} tasks`);
	}

	/**
	 * Check if index is stale and needs rebuilding
	 */
	private isIndexStale(): boolean {
		return Date.now() - this.indexLastBuilt > this.INDEX_TTL;
	}

	/**
	 * Invalidate the task index (called when tasks are modified)
	 */
	private invalidateIndex(): void {
		this.taskIndex.clear();
		this.indexLastBuilt = 0;
		this.logger.debug('Task index invalidated');
	}

	/**
	 * Invalidate cache entries by tag (selective invalidation)
	 */
	private invalidateCacheForTag(tag: string): void {
		const count = this.cacheManager.invalidateTag(tag);
		this.logger.debug(`Invalidated ${count} cache entries for tag: ${tag}`);
	}

	/**
	 * Clear cache for inactive tags when switching to a new tag
	 * This keeps memory usage low by only caching the active tag
	 */
	private clearInactiveTagCache(newActiveTag: string): void {
		if (this.activeTag && this.activeTag !== newActiveTag) {
			this.logger.debug(`Switching from tag '${this.activeTag}' to '${newActiveTag}', clearing old cache`);
			this.invalidateCacheForTag(this.activeTag);
			this.taskIndex.clear(); // Clear index for old tag
		}
		this.activeTag = newActiveTag;
	}

	/**
	 * Get cache performance metrics
	 */
	getCacheMetrics(): CacheMetrics {
		return this.cacheManager.getMetrics();
	}

	/**
	 * Get write queue performance metrics
	 */
	getWriteQueueMetrics(): WriteQueueMetrics | undefined {
		return this.fileOps.getWriteMetrics();
	}

	/**
	 * Explicitly flush write queue
	 * Useful for ensuring all writes are persisted before critical operations
	 */
	async flushWrites(): Promise<void> {
		await this.fileOps.flushQueue();
	}

	/**
	 * Load tasks from the single tasks.json file for a specific tag
	 * Enriches tasks with complexity data from the complexity report
	 */
	async loadTasks(tag?: string, options?: LoadTasksOptions): Promise<Task[]> {
		const filePath = this.pathResolver.getTasksPath();
		const resolvedTag = tag || 'master';
		
		// Clear cache for inactive tags to save memory (only keep active tag cached)
		this.clearInactiveTagCache(resolvedTag);
		
		const cacheKey = this.getCacheKey(resolvedTag, options);

		// Check cache first
		const cachedResult = this.cacheManager.get<CacheEntry>(cacheKey);
		if (!isCacheMiss(cachedResult)) {
			this.logger.debug(`Cache hit for key: ${cacheKey}`);
			return cachedResult.tasks;
		}

		this.logger.debug(`Cache miss for key: ${cacheKey}`);

		try {
			const rawData = await this.fileOps.readJson(filePath);
			let tasks = this.formatHandler.extractTasks(rawData, resolvedTag);

			// Apply filters if provided
			if (options) {
				// Filter by status if specified
				if (options.status) {
					tasks = tasks.filter((task) => task.status === options.status);
				}

				// Exclude subtasks if specified
				if (options.excludeSubtasks) {
					tasks = tasks.map((task) => ({
						...task,
						subtasks: []
					}));
				}

				// Apply pagination if specified
				if (options.offset !== undefined || options.limit !== undefined) {
					const offset = options.offset || 0;
					const limit = options.limit || tasks.length;
					tasks = tasks.slice(offset, offset + limit);
					this.logger.debug(`Pagination applied: offset=${offset}, limit=${limit}, returned=${tasks.length}`);
				}
			}

			const enrichedTasks = await this.enrichTasksWithComplexity(
				tasks,
				resolvedTag
			);

			// Cache the result with namespace and tags for selective invalidation
			this.cacheManager.set(
				cacheKey,
				{ tasks: enrichedTasks },
				{
					namespace: CacheNamespace.Storage,
					tags: [resolvedTag]
				}
			);

			return enrichedTasks;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return []; // File doesn't exist, return empty array
			}
			throw new Error(`Failed to load tasks: ${error.message}`);
		}
	}

	/**
	 * Load a single regular task by ID with early-exit parsing and caching
	 * Optimized to avoid processing all tasks when fetching a single task
	 * @private
	 */
	private async loadSingleTask(
		taskId: string,
		tag?: string
	): Promise<Task | null> {
		const filePath = this.pathResolver.getTasksPath();
		const resolvedTag = tag || 'master';
		
		// Clear cache for inactive tags to save memory
		this.clearInactiveTagCache(resolvedTag);

		// Generate cache key for single task
		const cacheKey = CacheKeyBuilder.build(
			CacheNamespace.Task,
			taskId,
			resolvedTag
		);

		// Check cache first
		const cachedResult = this.cacheManager.get<CacheEntry>(cacheKey);
		if (!isCacheMiss(cachedResult)) {
			this.logger.debug(`Single task cache hit: ${cacheKey}`);
			return cachedResult.tasks[0] || null;
		}

		this.logger.debug(`Single task cache miss: ${cacheKey}`);

		try {
			// Read and parse the raw data
			const rawData = await this.fileOps.readJson(filePath);
			const tasks = this.formatHandler.extractTasks(rawData, resolvedTag);

			// Build or refresh index if optimizations enabled
			if (PERFORMANCE_CONFIG.useTaskIndex && (this.taskIndex.size === 0 || this.isIndexStale())) {
				this.buildTaskIndex(tasks, resolvedTag);
			}

			// Use index for O(1) lookup if enabled, otherwise fallback to linear search
			const indexEntry = PERFORMANCE_CONFIG.useTaskIndex ? this.taskIndex.get(String(taskId)) : null;
			let targetTask: Task | null = null;

			if (indexEntry) {
				if (indexEntry.parentId) {
					// This is a subtask - get from parent's subtasks
					const parentTask = tasks[indexEntry.position];
					if (parentTask?.subtasks) {
						const subtask = parentTask.subtasks.find(
							(st) => String(st.id) === String(taskId)
						);
						// Convert subtask to task-like structure for return
						targetTask = subtask ? (subtask as any) : null;
					}
				} else {
					// Regular task - direct access via index
					targetTask = tasks[indexEntry.position];
				}
			} else if (!PERFORMANCE_CONFIG.useTaskIndex) {
				// Baseline: use O(n) linear search
				targetTask = tasks.find((t) => String(t.id) === String(taskId)) || null;
			}

			if (!targetTask) {
				// Cache the null result to avoid repeated lookups
				this.cacheManager.set(
				cacheKey,
				{ tasks: [] },
				{
					namespace: CacheNamespace.Task,
					tags: [resolvedTag]
				}
			);
				return null;
			}

			// Enrich only the found task with complexity data
			const enrichedTasks = await this.enrichTasksWithComplexity(
				[targetTask],
				resolvedTag
			);

			// Cache the result
			this.cacheManager.set(
				cacheKey,
				{ tasks: enrichedTasks },
				{
					namespace: CacheNamespace.Task,
					tags: [resolvedTag]
				}
			);

			return enrichedTasks[0] || null;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				// Cache the ENOENT result to avoid repeated file system checks
				this.cacheManager.set(
				cacheKey,
				{ tasks: [] },
				{
					namespace: CacheNamespace.Task,
					tags: [resolvedTag]
				}
			);
				return null; // File doesn't exist
			}
			throw new Error(`Failed to load task: ${error.message}`);
		}
	}

	/**
	 * Load a subtask by ID from the tasks array
	 * Handles subtasks with dotted notation (like "1.2")
	 * @private
	 */
	private loadSubtask(taskId: string, tasks: Task[]): Task | null {
		const [parentId, subtaskId] = taskId.split('.');
		const parentTask = tasks.find((t) => String(t.id) === parentId);

		if (!parentTask || !parentTask.subtasks) {
			return null;
		}

		const subtask = parentTask.subtasks.find(
			(st) => String(st.id) === subtaskId
		);
		if (!subtask) {
			return null;
		}

		const toFullSubId = (maybeDotId: string | number): string => {
			const depId = String(maybeDotId);
			return depId.includes('.') ? depId : `${parentTask.id}.${depId}`;
		};
		const resolvedDependencies =
			subtask.dependencies?.map((dep) => toFullSubId(dep)) ?? [];

		// Return a Task-like object for the subtask with the full dotted ID
		// Following the same pattern as findTaskById in utils.js
		const subtaskResult = {
			...subtask,
			id: taskId, // Use the full dotted ID
			title: subtask.title || `Subtask ${subtaskId}`,
			description: subtask.description || '',
			status: subtask.status || 'pending',
			priority: subtask.priority || parentTask.priority || 'medium',
			dependencies: resolvedDependencies,
			details: subtask.details || '',
			testStrategy: subtask.testStrategy || '',
			subtasks: [],
			tags: parentTask.tags || [],
			assignee: subtask.assignee || parentTask.assignee,
			complexity: subtask.complexity || parentTask.complexity,
			createdAt: subtask.createdAt || parentTask.createdAt,
			updatedAt: subtask.updatedAt || parentTask.updatedAt,
			// Add reference to parent task for context (like utils.js does)
			parentTask: {
				id: parentTask.id,
				title: parentTask.title,
				status: parentTask.status
			},
			isSubtask: true
		};

		return subtaskResult;
	}

	/**
	 * Load a single task by ID from the tasks.json file
	 * Handles both regular tasks and subtasks (with dotted notation like "1.2")
	 * Optimized to avoid loading all tasks for regular task lookups
	 */
	async loadTask(taskId: string, tag?: string): Promise<Task | null> {
		// Check if this is a subtask (contains a dot)
		if (taskId.includes('.')) {
			// Subtasks require parent context, so we need to load all tasks
			const tasks = await this.loadTasks(tag);
			return this.loadSubtask(taskId, tasks);
		}

		// For regular tasks, use the optimized single-task loader
		return this.loadSingleTask(taskId, tag);
	}

	/**
	 * Save tasks for a specific tag in the single tasks.json file
	 */
	async saveTasks(tasks: Task[], tag?: string): Promise<void> {
		const filePath = this.pathResolver.getTasksPath();
		const resolvedTag = tag || 'master';

		// Ensure directory exists
		await this.fileOps.ensureDir(this.pathResolver.getTasksDir());

		// Normalize tasks before saving
		const normalizedTasks = this.normalizeTaskIds(tasks);

		// Get existing data from the file
		let existingData: any = {};
		try {
			existingData = await this.fileOps.readJson(filePath);
		} catch (error: any) {
			if (error.code !== 'ENOENT') {
				throw new Error(`Failed to read existing tasks: ${error.message}`);
			}
			// File doesn't exist, start with empty data
		}

		// Create metadata for this tag
		const metadata: TaskMetadata = {
			version: '1.0.0',
			lastModified: new Date().toISOString(),
			taskCount: tasks.length,
			completedCount: tasks.filter((t) => t.status === 'done').length,
			tags: [resolvedTag]
		};

		// Update the specific tag in the existing data structure
		if (
			this.formatHandler.detectFormat(existingData) === 'legacy' ||
			Object.keys(existingData).some(
				(key) => key !== 'tasks' && key !== 'metadata'
			)
		) {
			// Legacy format - update/add the tag
			existingData[resolvedTag] = {
				tasks: normalizedTasks,
				metadata
			};
		} else if (resolvedTag === 'master') {
			// Standard format for master tag
			existingData = {
				tasks: normalizedTasks,
				metadata
			};
		} else {
			// Convert to legacy format when adding non-master tags
			const masterTasks = existingData.tasks || [];
			const masterMetadata = existingData.metadata || metadata;

			existingData = {
				master: {
					tasks: masterTasks,
					metadata: masterMetadata
				},
				[resolvedTag]: {
					tasks: normalizedTasks,
					metadata
				}
			};
		}

		// Write the updated file with cache invalidation tag
		await this.fileOps.writeJson(filePath, existingData, {
			invalidationTags: [resolvedTag]
		});

		// Write-through cache: Update cache with new data instead of invalidating
		// This keeps individual task caches valid and improves hit rate
		const loadAllCacheKey = this.getCacheKey(resolvedTag);
		const enrichedTasks = await this.enrichTasksWithComplexity(
			normalizedTasks,
			resolvedTag
		);
		
		// Update the full task list cache
		this.cacheManager.set(
			loadAllCacheKey,
			{ tasks: enrichedTasks },
			{
				namespace: CacheNamespace.Storage,
				tags: [resolvedTag]
			}
		);

		// Update individual task caches (write-through caching) - only if optimization enabled
		if (PERFORMANCE_CONFIG.useWriteThroughCache) {
			for (const task of enrichedTasks) {
				const taskCacheKey = CacheKeyBuilder.build(
					CacheNamespace.Task,
					String(task.id),
					resolvedTag
				);
				this.cacheManager.set(
					taskCacheKey,
					{ tasks: [task] },
					{
						namespace: CacheNamespace.Task,
						tags: [resolvedTag]
					}
				);
			}
		} else {
			// Baseline: invalidate individual task caches (forces reload from disk)
			for (const task of enrichedTasks) {
				const taskCacheKey = CacheKeyBuilder.build(
					CacheNamespace.Task,
					String(task.id),
					resolvedTag
				);
				this.cacheManager.delete(taskCacheKey);
			}
		}

		// Rebuild the task index with new data
		this.buildTaskIndex(enrichedTasks, resolvedTag);
	}

	/**
	 * Normalize task IDs - keep Task IDs as strings, Subtask IDs as numbers
	 */
	private normalizeTaskIds(tasks: Task[]): Task[] {
		return tasks.map((task) => ({
			...task,
			id: String(task.id), // Task IDs are strings
			dependencies: task.dependencies?.map((dep) => String(dep)) || [],
			subtasks:
				task.subtasks?.map((subtask) => ({
					...subtask,
					id: Number(subtask.id), // Subtask IDs are numbers
					parentId: String(subtask.parentId) // Parent ID is string (Task ID)
				})) || []
		}));
	}

	/**
	 * Check if the tasks file exists
	 */
	async exists(_tag?: string): Promise<boolean> {
		const filePath = this.pathResolver.getTasksPath();
		return this.fileOps.exists(filePath);
	}

	/**
	 * Get all available tags from the single tasks.json file
	 */
	async getAllTags(): Promise<string[]> {
		try {
			const filePath = this.pathResolver.getTasksPath();
			const data = await this.fileOps.readJson(filePath);
			return this.formatHandler.extractTags(data);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return []; // File doesn't exist
			}
			throw new Error(`Failed to get tags: ${error.message}`);
		}
	}

	/**
	 * Load metadata from the single tasks.json file for a specific tag
	 */
	async loadMetadata(tag?: string): Promise<TaskMetadata | null> {
		const filePath = this.pathResolver.getTasksPath();
		const resolvedTag = tag || 'master';

		try {
			const rawData = await this.fileOps.readJson(filePath);
			return this.formatHandler.extractMetadata(rawData, resolvedTag);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return null;
			}
			throw new Error(`Failed to load metadata: ${error.message}`);
		}
	}

	/**
	 * Save metadata (stored with tasks)
	 */
	async saveMetadata(_metadata: TaskMetadata, tag?: string): Promise<void> {
		const tasks = await this.loadTasks(tag);
		await this.saveTasks(tasks, tag);
	}

	/**
	 * Append tasks to existing storage
	 */
	async appendTasks(tasks: Task[], tag?: string): Promise<void> {
		const existingTasks = await this.loadTasks(tag);
		const allTasks = [...existingTasks, ...tasks];
		await this.saveTasks(allTasks, tag);
		// Cache is invalidated by saveTasks
	}

	/**
	 * Update a specific task
	 */
	async updateTask(
		taskId: string,
		updates: Partial<Task>,
		tag?: string
	): Promise<void> {
		const tasks = await this.loadTasks(tag);
		const taskIndex = tasks.findIndex((t) => String(t.id) === String(taskId));

		if (taskIndex === -1) {
			throw new Error(`Task ${taskId} not found`);
		}

		tasks[taskIndex] = {
			...tasks[taskIndex],
			...updates,
			id: String(taskId) // Keep consistent with normalizeTaskIds
		};
		await this.saveTasks(tasks, tag);
		// Cache is invalidated by saveTasks
	}

	/**
	 * Update task with AI-powered prompt
	 * For file storage, this should NOT be called - client must handle AI processing first
	 */
	async updateTaskWithPrompt(
		_taskId: string,
		_prompt: string,
		_tag?: string,
		_options?: { useResearch?: boolean; mode?: 'append' | 'update' | 'rewrite' }
	): Promise<void> {
		throw new Error(
			'File storage does not support updateTaskWithPrompt. ' +
				'Client-side AI logic must process the prompt before calling updateTask().'
		);
	}

	/**
	 * Update task or subtask status by ID - handles file storage logic with parent/subtask relationships
	 */
	async updateTaskStatus(
		taskId: string,
		newStatus: TaskStatus,
		tag?: string
	): Promise<UpdateStatusResult> {
		const tasks = await this.loadTasks(tag);

		// Check if this is a subtask (contains a dot)
		if (taskId.includes('.')) {
			return this.updateSubtaskStatusInFile(tasks, taskId, newStatus, tag);
		}

		// Handle regular task update
		const taskIndex = tasks.findIndex((t) => String(t.id) === String(taskId));

		if (taskIndex === -1) {
			throw new Error(`Task ${taskId} not found`);
		}

		const oldStatus = tasks[taskIndex].status;
		if (oldStatus === newStatus) {
			return {
				success: true,
				oldStatus,
				newStatus,
				taskId: String(taskId)
			};
		}

		tasks[taskIndex] = {
			...tasks[taskIndex],
			status: newStatus,
			updatedAt: new Date().toISOString()
		};

		await this.saveTasks(tasks, tag);
		// Cache is invalidated by saveTasks

		return {
			success: true,
			oldStatus,
			newStatus,
			taskId: String(taskId)
		};
	}

	/**
	 * Update subtask status within file storage - handles parent status auto-adjustment
	 */
	private async updateSubtaskStatusInFile(
		tasks: Task[],
		subtaskId: string,
		newStatus: TaskStatus,
		tag?: string
	): Promise<UpdateStatusResult> {
		// Parse the subtask ID to get parent ID and subtask ID
		const parts = subtaskId.split('.');
		if (parts.length !== 2) {
			throw new Error(
				`Invalid subtask ID format: ${subtaskId}. Expected format: parentId.subtaskId`
			);
		}

		const [parentId, subIdRaw] = parts;
		const subId = subIdRaw.trim();
		if (!/^\d+$/.test(subId)) {
			throw new Error(
				`Invalid subtask ID: ${subId}. Subtask ID must be a positive integer.`
			);
		}
		const subtaskNumericId = Number(subId);

		// Find the parent task
		const parentTaskIndex = tasks.findIndex(
			(t) => String(t.id) === String(parentId)
		);

		if (parentTaskIndex === -1) {
			throw new Error(`Parent task ${parentId} not found`);
		}

		const parentTask = tasks[parentTaskIndex];

		// Find the subtask within the parent task
		const subtaskIndex = parentTask.subtasks.findIndex(
			(st) => st.id === subtaskNumericId || String(st.id) === subId
		);

		if (subtaskIndex === -1) {
			throw new Error(
				`Subtask ${subtaskId} not found in parent task ${parentId}`
			);
		}

		const oldStatus = parentTask.subtasks[subtaskIndex].status || 'pending';
		if (oldStatus === newStatus) {
			return {
				success: true,
				oldStatus,
				newStatus,
				taskId: subtaskId
			};
		}

		const now = new Date().toISOString();

		// Update the subtask status
		parentTask.subtasks[subtaskIndex] = {
			...parentTask.subtasks[subtaskIndex],
			status: newStatus,
			updatedAt: now
		};

		// Auto-adjust parent status based on subtask statuses
		const subs = parentTask.subtasks;
		let parentNewStatus = parentTask.status;
		if (subs.length > 0) {
			const norm = (s: any) => s.status || 'pending';
			const isDoneLike = (s: any) => {
				const st = norm(s);
				return st === 'done' || st === 'completed';
			};
			const allDone = subs.every(isDoneLike);
			const anyInProgress = subs.some((s) => norm(s) === 'in-progress');
			const anyDone = subs.some(isDoneLike);
			const allPending = subs.every((s) => norm(s) === 'pending');

			if (allDone) parentNewStatus = 'done';
			else if (anyInProgress || anyDone) parentNewStatus = 'in-progress';
			else if (allPending) parentNewStatus = 'pending';
		}

		// Always bump updatedAt; update status only if changed
		tasks[parentTaskIndex] = {
			...parentTask,
			...(parentNewStatus !== parentTask.status
				? { status: parentNewStatus }
				: {}),
			updatedAt: now
		};

		await this.saveTasks(tasks, tag);
		// Cache is invalidated by saveTasks

		return {
			success: true,
			oldStatus,
			newStatus,
			taskId: subtaskId
		};
	}

	/**
	 * Delete a task
	 */
	async deleteTask(taskId: string, tag?: string): Promise<void> {
		const tasks = await this.loadTasks(tag);
		const filteredTasks = tasks.filter((t) => String(t.id) !== String(taskId));

		if (filteredTasks.length === tasks.length) {
			throw new Error(`Task ${taskId} not found`);
		}

		await this.saveTasks(filteredTasks, tag);
		// Cache is invalidated by saveTasks
	}

	/**
	 * Delete a tag from the single tasks.json file
	 */
	async deleteTag(tag: string): Promise<void> {
		const filePath = this.pathResolver.getTasksPath();

		try {
			const existingData = await this.fileOps.readJson(filePath);

			if (this.formatHandler.detectFormat(existingData) === 'legacy') {
				// Legacy format - remove the tag key
				if (tag in existingData) {
					delete existingData[tag];
					await this.fileOps.writeJson(filePath, existingData, {
						invalidationTags: [tag]
					});
				} else {
					throw new Error(`Tag ${tag} not found`);
				}
			} else if (tag === 'master') {
				// Standard format - delete the entire file for master tag
				await this.fileOps.deleteFile(filePath);
				this.invalidateCacheForTag(tag);
			} else {
				throw new Error(`Tag ${tag} not found in standard format`);
			}
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				throw new Error(`Tag ${tag} not found - file doesn't exist`);
			}
			throw error;
		}
	}

	/**
	 * Rename a tag within the single tasks.json file
	 */
	async renameTag(oldTag: string, newTag: string): Promise<void> {
		const filePath = this.pathResolver.getTasksPath();

		try {
			const existingData = await this.fileOps.readJson(filePath);

			if (this.formatHandler.detectFormat(existingData) === 'legacy') {
				// Legacy format - rename the tag key
				if (oldTag in existingData) {
					existingData[newTag] = existingData[oldTag];
					delete existingData[oldTag];

					// Update metadata tags array
					if (existingData[newTag].metadata) {
						existingData[newTag].metadata.tags = [newTag];
					}

					await this.fileOps.writeJson(filePath, existingData, {
						invalidationTags: [oldTag, newTag]
					});
				} else {
					throw new Error(`Tag ${oldTag} not found`);
				}
			} else if (oldTag === 'master') {
				// Convert standard format to legacy when renaming master
				const masterTasks = existingData.tasks || [];
				const masterMetadata = existingData.metadata || {};

				const newData = {
					[newTag]: {
						tasks: masterTasks,
						metadata: { ...masterMetadata, tags: [newTag] }
					}
				};

				await this.fileOps.writeJson(filePath, newData, {
					invalidationTags: [oldTag, newTag]
				});
			} else {
				throw new Error(`Tag ${oldTag} not found in standard format`);
			}
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				throw new Error(`Tag ${oldTag} not found - file doesn't exist`);
			}
			throw error;
		}
	}

	/**
	 * Copy a tag within the single tasks.json file
	 */
	async copyTag(sourceTag: string, targetTag: string): Promise<void> {
		const tasks = await this.loadTasks(sourceTag);

		if (tasks.length === 0) {
			throw new Error(`Source tag ${sourceTag} not found or has no tasks`);
		}

		await this.saveTasks(tasks, targetTag);
		// Cache is invalidated by saveTasks
	}

	/**
	 * Enrich tasks with complexity data from the complexity report
	 * Private helper method called by loadTasks()
	 */
	private async enrichTasksWithComplexity(
		tasks: Task[],
		tag: string
	): Promise<Task[]> {
		// Get all task IDs for bulk lookup
		const taskIds = tasks.map((t) => t.id);

		// Load complexity data for all tasks at once (more efficient)
		const complexityMap = await this.complexityManager.getComplexityForTasks(
			taskIds,
			tag
		);

		// If no complexity data found, return tasks as-is
		if (complexityMap.size === 0) {
			return tasks;
		}

		// Enrich each task with its complexity data
		return tasks.map((task) => {
			const complexityData = complexityMap.get(String(task.id));
			if (!complexityData) {
				return task;
			}

			// Merge complexity data into the task
			return {
				...task,
				complexity: complexityData.complexityScore,
				recommendedSubtasks: complexityData.recommendedSubtasks,
				expansionPrompt: complexityData.expansionPrompt,
				complexityReasoning: complexityData.complexityReasoning
			};
		});
	}
}

// Export as default for convenience
export default FileStorage;
