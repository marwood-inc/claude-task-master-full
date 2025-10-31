/**
 * @fileoverview GitHub Sync State Service
 * Manages persistent tracking of task-issue mappings and sync history
 * with conflict detection and atomic file operations
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { SyncMapping, SyncConflict } from '../types/github-types.js';
import type {
	GitHubSyncStateFile,
	StateFileOptions,
	StateFileOperationResult,
	SyncOperationRecord,
	ChangeMetadata,
	SyncStateStats
} from '../types/github-sync-state-types.js';

/**
 * Default state file options
 */
const DEFAULT_STATE_OPTIONS: Required<StateFileOptions> = {
	createBackup: true,
	validateSchema: true,
	autoRecoverFromBackup: true,
	maxHistoryAgeDays: 30
};

/**
 * GitHubSyncStateService
 * Manages .taskmaster/github-sync-state.json file with:
 * - Task-to-issue mappings
 * - Sync timestamps and conflict markers
 * - Fast lookup by task ID
 * - Atomic file operations for concurrent access
 * - Sync operation history for debugging
 * - Change detection via timestamp comparison
 * - State file corruption recovery
 */
export class GitHubSyncStateService {
	private readonly projectPath: string;
	private readonly owner: string;
	private readonly repo: string;
	private readonly options: Required<StateFileOptions>;

	/**
	 * File locks for atomic operations
	 * Maps file paths to promises to ensure sequential access
	 */
	private fileLocks: Map<string, Promise<void>> = new Map();

	/**
	 * Current version of the state file schema
	 */
	private static readonly SCHEMA_VERSION = '1.0.0';

	/**
	 * Default maximum number of operations to keep in history
	 */
	private static readonly DEFAULT_MAX_HISTORY = 1000;

	/**
	 * State file name
	 */
	private static readonly STATE_FILE_NAME = 'github-sync-state.json';

	constructor(
		projectPath: string,
		owner: string,
		repo: string,
		options: StateFileOptions = {}
	) {
		this.projectPath = projectPath;
		this.owner = owner;
		this.repo = repo;
		this.options = { ...DEFAULT_STATE_OPTIONS, ...options };
	}

	/**
	 * Initialize the sync state file if it doesn't exist
	 */
	async initialize(): Promise<StateFileOperationResult> {
		const filePath = this.getStateFilePath();
		const exists = await this.fileExists(filePath);

		if (exists) {
			return { success: true };
		}

		// Create empty state and save it
		const emptyState = this.createEmptyState();
		return await this.saveState(emptyState);
	}

	/**
	 * Get a mapping by task ID
	 * @param taskId - Task ID to look up
	 * @returns The sync mapping if found, null otherwise
	 */
	async getMapping(taskId: string): Promise<SyncMapping | null> {
		const state = await this.loadState();
		return state.mappings[taskId] || null;
	}

	/**
	 * Get all mappings
	 * @returns All sync mappings
	 */
	async getAllMappings(): Promise<SyncMapping[]> {
		const state = await this.loadState();
		return Object.values(state.mappings);
	}

	/**
	 * Get mapping by issue number
	 * @param issueNumber - GitHub issue number to look up
	 * @returns The sync mapping if found, null otherwise
	 */
	async getMappingByIssue(issueNumber: number): Promise<SyncMapping | null> {
		const state = await this.loadState();
		const mappings = Object.values(state.mappings);
		return (
			mappings.find((mapping) => mapping.issueNumber === issueNumber) || null
		);
	}

	/**
	 * Set or update a mapping
	 * @param mapping - Sync mapping to set
	 */
	async setMapping(mapping: SyncMapping): Promise<StateFileOperationResult> {
		return await this.modifyState((state) => {
			state.mappings[mapping.taskId] = mapping;
		});
	}

	/**
	 * Delete a mapping by task ID
	 * @param taskId - Task ID to delete
	 */
	async deleteMapping(taskId: string): Promise<StateFileOperationResult> {
		const state = await this.loadState();

		if (!state.mappings[taskId]) {
			return {
				success: false,
				error: `Mapping for task ${taskId} not found`
			};
		}

		delete state.mappings[taskId];

		// Also delete associated change metadata
		if (state.changeMetadata[taskId]) {
			delete state.changeMetadata[taskId];
		}

		return await this.saveState(state);
	}

	/**
	 * Get all unresolved conflicts
	 * @returns All unresolved conflicts
	 */
	async getConflicts(): Promise<SyncConflict[]> {
		const state = await this.loadState();
		return state.conflicts.filter((c) => !c.resolved);
	}

	/**
	 * Add a conflict
	 * @param conflict - Conflict to add
	 */
	async addConflict(conflict: SyncConflict): Promise<StateFileOperationResult> {
		const state = await this.loadState();

		// Check if conflict already exists
		const existingIndex = state.conflicts.findIndex(
			(c) =>
				c.taskId === conflict.taskId &&
				c.issueNumber === conflict.issueNumber &&
				c.type === conflict.type
		);

		if (existingIndex >= 0) {
			// Update existing conflict
			state.conflicts[existingIndex] = conflict;
		} else {
			// Add new conflict
			state.conflicts.push(conflict);
		}

		return await this.saveState(state);
	}

	/**
	 * Resolve a conflict
	 * @param taskId - Task ID of the conflict
	 * @param issueNumber - Issue number of the conflict
	 */
	async resolveConflict(
		taskId: string,
		issueNumber: number
	): Promise<StateFileOperationResult> {
		const state = await this.loadState();

		const conflictIndex = state.conflicts.findIndex(
			(c) => c.taskId === taskId && c.issueNumber === issueNumber
		);

		if (conflictIndex === -1) {
			return {
				success: false,
				error: `Conflict not found for task ${taskId} and issue ${issueNumber}`
			};
		}

		// Mark conflict as resolved
		state.conflicts[conflictIndex].resolved = true;

		return await this.saveState(state);
	}

	/**
	 * Record a sync operation
	 * @param operation - Operation record to add
	 */
	async recordOperation(
		operation: Omit<SyncOperationRecord, 'operationId' | 'timestamp'>
	): Promise<StateFileOperationResult> {
		return await this.modifyState((state) => {
			// Create full operation record
			const fullOperation: SyncOperationRecord = {
				...operation,
				operationId: randomUUID(),
				timestamp: new Date().toISOString()
			};

			// Add to history
			state.operationHistory.push(fullOperation);

			// Trim history if it exceeds max size
			if (state.operationHistory.length > state.maxHistorySize) {
				state.operationHistory = state.operationHistory.slice(
					-state.maxHistorySize
				);
			}
		});
	}

	/**
	 * Get sync operation history
	 * @param limit - Maximum number of operations to return
	 * @returns Recent sync operations
	 */
	async getOperationHistory(limit?: number): Promise<SyncOperationRecord[]> {
		const state = await this.loadState();

		if (limit) {
			return state.operationHistory.slice(-limit);
		}

		return state.operationHistory;
	}

	/**
	 * Get change metadata for a task
	 * @param taskId - Task ID to look up
	 * @returns Change metadata if found, null otherwise
	 */
	async getChangeMetadata(taskId: string): Promise<ChangeMetadata | null> {
		throw new Error('Not implemented - will be implemented in subtask 3.3');
	}

	/**
	 * Update change metadata
	 * @param metadata - Change metadata to update
	 */
	async updateChangeMetadata(
		metadata: ChangeMetadata
	): Promise<StateFileOperationResult> {
		throw new Error('Not implemented - will be implemented in subtask 3.3');
	}

	/**
	 * Detect changes by comparing timestamps
	 * @param taskId - Task ID to check
	 * @param localUpdatedAt - Local task updated timestamp
	 * @param remoteUpdatedAt - Remote issue updated timestamp
	 * @returns Whether changes were detected
	 */
	async detectChanges(
		taskId: string,
		localUpdatedAt: string,
		remoteUpdatedAt: string
	): Promise<{ hasLocalChanges: boolean; hasRemoteChanges: boolean }> {
		throw new Error('Not implemented - will be implemented in subtask 3.3');
	}

	/**
	 * Mark sync as in progress
	 */
	async markSyncInProgress(): Promise<StateFileOperationResult> {
		const state = await this.loadState();
		state.syncInProgress = true;
		return await this.saveState(state);
	}

	/**
	 * Mark sync as complete
	 * @param error - Error message if sync failed
	 */
	async markSyncComplete(
		error?: string
	): Promise<StateFileOperationResult> {
		const state = await this.loadState();
		state.syncInProgress = false;
		state.lastSyncAt = new Date().toISOString();
		state.lastSyncError = error || null;
		return await this.saveState(state);
	}

	/**
	 * Get sync state statistics
	 * @returns Statistics about the sync state
	 */
	async getStats(): Promise<SyncStateStats> {
		const state = await this.loadState();
		const filePath = this.getStateFilePath();

		// Count mappings by status
		const mappings = Object.values(state.mappings);
		const syncedMappings = mappings.filter((m) => m.status === 'synced').length;
		const pendingMappings = mappings.filter((m) => m.status === 'pending')
			.length;
		const conflictMappings = mappings.filter((m) => m.status === 'conflict')
			.length;
		const errorMappings = mappings.filter((m) => m.status === 'error').length;

		// Get file size
		let fileSizeBytes = 0;
		try {
			const stats = await fs.stat(filePath);
			fileSizeBytes = stats.size;
		} catch {
			// File might not exist yet
		}

		// Determine if cleanup is needed
		const needsCleanup =
			state.operationHistory.length >= state.maxHistorySize * 0.9 ||
			state.conflicts.filter((c) => c.resolved).length > 100;

		return {
			totalMappings: mappings.length,
			syncedMappings,
			pendingMappings,
			conflictMappings,
			errorMappings,
			unresolvedConflicts: state.conflicts.filter((c) => !c.resolved).length,
			operationHistoryCount: state.operationHistory.length,
			lastSyncAt: state.lastSyncAt,
			fileSizeBytes,
			needsCleanup
		};
	}

	/**
	 * Cleanup old operation history
	 * @param maxAgeDays - Maximum age of operations to keep
	 */
	async cleanupHistory(maxAgeDays?: number): Promise<StateFileOperationResult> {
		const state = await this.loadState();
		const ageDays = maxAgeDays || this.options.maxHistoryAgeDays;
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - ageDays);

		// Filter out old operations
		const originalCount = state.operationHistory.length;
		state.operationHistory = state.operationHistory.filter((op) => {
			const opDate = new Date(op.timestamp);
			return opDate >= cutoffDate;
		});

		// Remove resolved conflicts
		state.conflicts = state.conflicts.filter((c) => !c.resolved);

		const removedCount = originalCount - state.operationHistory.length;

		const result = await this.saveState(state);

		return {
			...result,
			warnings: removedCount > 0 ? [`Removed ${removedCount} old operations`] : []
		};
	}

	/**
	 * Create a backup of the state file
	 * @returns Path to the backup file
	 */
	async createBackup(): Promise<string> {
		throw new Error('Not implemented - will be implemented in subtask 3.4');
	}

	/**
	 * Recover state from backup
	 * @param backupPath - Optional specific backup to recover from
	 */
	async recoverFromBackup(backupPath?: string): Promise<StateFileOperationResult> {
		throw new Error('Not implemented - will be implemented in subtask 3.4');
	}

	/**
	 * Validate state file schema
	 * @param state - State file to validate
	 * @returns Whether the state file is valid
	 */
	async validateStateFile(state: unknown): Promise<boolean> {
		// Basic validation for now - full schema validation in subtask 3.4
		if (!state || typeof state !== 'object') {
			return false;
		}

		const s = state as any;

		// Check required fields
		if (
			!s.version ||
			!s.owner ||
			!s.repo ||
			!s.mappings ||
			!Array.isArray(s.conflicts) ||
			!s.changeMetadata ||
			!Array.isArray(s.operationHistory)
		) {
			return false;
		}

		return true;
	}

	/**
	 * Get the path to the state file
	 */
	private getStateFilePath(): string {
		return path.join(
			this.getTaskmasterDir(),
			GitHubSyncStateService.STATE_FILE_NAME
		);
	}

	/**
	 * Get the path to the taskmaster directory
	 */
	private getTaskmasterDir(): string {
		return path.join(this.projectPath, '.taskmaster');
	}

	/**
	 * Load the state file
	 */
	private async loadState(): Promise<GitHubSyncStateFile> {
		const filePath = this.getStateFilePath();

		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const state = JSON.parse(content) as GitHubSyncStateFile;

			// Validate schema if enabled
			if (this.options.validateSchema) {
				const isValid = await this.validateStateFile(state);
				if (!isValid) {
					throw new Error('Invalid state file schema');
				}
			}

			return state;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				// File doesn't exist, return empty state
				return this.createEmptyState();
			}

			// If it's a JSON parse error and auto-recovery is enabled
			if (
				error instanceof SyntaxError &&
				this.options.autoRecoverFromBackup
			) {
				// Will be implemented in subtask 3.4
				throw new Error(
					`State file corrupted: ${error.message}. Auto-recovery will be implemented in subtask 3.4`
				);
			}

			throw new Error(`Failed to load state file: ${error.message}`);
		}
	}

	/**
	 * Save the state file with atomic write operation
	 */
	private async saveState(
		state: GitHubSyncStateFile
	): Promise<StateFileOperationResult> {
		const filePath = this.getStateFilePath();
		const lockKey = filePath;

		// Create a promise that will be resolved when the write is complete
		let releaseLock: () => void;
		const lockPromise = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});

		// Wait for any existing lock
		const existingLock = this.fileLocks.get(lockKey);
		if (existingLock) {
			await existingLock;
		}

		// Set our lock
		this.fileLocks.set(lockKey, lockPromise);

		try {
			await this.performAtomicWrite(filePath, state);
			return { success: true };
		} catch (error: any) {
			return {
				success: false,
				error: error.message
			};
		} finally {
			// Release the lock
			this.fileLocks.delete(lockKey);
			releaseLock!();
		}
	}

	/**
	 * Perform atomic write operation using temporary file
	 */
	private async performAtomicWrite(
		filePath: string,
		state: GitHubSyncStateFile
	): Promise<void> {
		const tempPath = `${filePath}.tmp`;
		const dir = path.dirname(filePath);

		try {
			// Ensure directory exists
			await fs.mkdir(dir, { recursive: true });

			// Create backup if enabled
			if (this.options.createBackup) {
				const exists = await this.fileExists(filePath);
				if (exists) {
					// Backup will be fully implemented in subtask 3.4
					// For now, we'll just note that a backup should be created
				}
			}

			// Update timestamps
			state.updatedAt = new Date().toISOString();

			// Write to temp file first
			const content = JSON.stringify(state, null, 2);
			await fs.writeFile(tempPath, content, 'utf-8');

			// Atomic rename
			await fs.rename(tempPath, filePath);
		} catch (error: any) {
			// Clean up temp file if it exists
			try {
				await fs.unlink(tempPath);
			} catch {
				// Ignore cleanup errors
			}

			throw new Error(`Failed to write state file: ${error.message}`);
		}
	}

	/**
	 * Check if file exists
	 */
	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Modify state atomically with proper locking
	 * Ensures read-modify-write cycle is atomic
	 */
	private async modifyState(
		modifier: (state: GitHubSyncStateFile) => void
	): Promise<StateFileOperationResult> {
		const filePath = this.getStateFilePath();
		const lockKey = filePath;

		// Create a promise that will be resolved when the modification is complete
		let releaseLock: () => void;
		const lockPromise = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});

		// Wait for any existing lock
		const existingLock = this.fileLocks.get(lockKey);
		if (existingLock) {
			await existingLock;
		}

		// Set our lock
		this.fileLocks.set(lockKey, lockPromise);

		try {
			// Read current state within the lock
			const state = await this.loadStateWithoutLock();

			// Apply modification
			modifier(state);

			// Write state within the lock
			await this.performAtomicWrite(filePath, state);

			return { success: true };
		} catch (error: any) {
			return {
				success: false,
				error: error.message
			};
		} finally {
			// Release the lock
			this.fileLocks.delete(lockKey);
			releaseLock!();
		}
	}

	/**
	 * Load state without acquiring lock (for use within locked operations)
	 */
	private async loadStateWithoutLock(): Promise<GitHubSyncStateFile> {
		const filePath = this.getStateFilePath();

		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const state = JSON.parse(content) as GitHubSyncStateFile;

			// Validate schema if enabled
			if (this.options.validateSchema) {
				const isValid = await this.validateStateFile(state);
				if (!isValid) {
					throw new Error('Invalid state file schema');
				}
			}

			return state;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				// File doesn't exist, return empty state
				return this.createEmptyState();
			}

			throw new Error(`Failed to load state file: ${error.message}`);
		}
	}

	/**
	 * Create a new empty state file structure
	 */
	private createEmptyState(): GitHubSyncStateFile {
		const now = new Date().toISOString();
		return {
			version: GitHubSyncStateService.SCHEMA_VERSION,
			owner: this.owner,
			repo: this.repo,
			mappings: {},
			conflicts: [],
			changeMetadata: {},
			operationHistory: [],
			maxHistorySize: GitHubSyncStateService.DEFAULT_MAX_HISTORY,
			lastSyncAt: null,
			syncInProgress: false,
			lastSyncError: null,
			createdAt: now,
			updatedAt: now,
			lastBackup: null
		};
	}
}
