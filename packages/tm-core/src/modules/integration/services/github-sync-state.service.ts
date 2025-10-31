/**
 * @fileoverview GitHub Sync State Service
 * Manages persistent tracking of task-issue mappings and sync history
 * with conflict detection and atomic file operations
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SyncMapping, SyncConflict } from '../types/github-types.js';
import type {
	GitHubSyncStateFile,
	StateFileOptions,
	StateFileOperationResult,
	SyncOperationRecord,
	ChangeMetadata,
	SyncStateStats,
	StateBackupMetadata
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
 * Maximum number of backup files to retain
 */
const MAX_BACKUP_RETENTION = 10;

/**
 * Backup directory name
 */
const BACKUP_DIR_NAME = 'backups/github-sync';

/**
 * Zod schema for validating sync state files
 */
const SyncMappingSchema = z.object({
	taskId: z.string(),
	issueNumber: z.number(),
	owner: z.string(),
	repo: z.string(),
	lastSyncedAt: z.string(),
	lastSyncDirection: z.enum(['to_github', 'from_github', 'bidirectional']),
	status: z.enum(['synced', 'pending', 'conflict', 'error'])
});

const SyncConflictSchema = z.object({
	taskId: z.string(),
	issueNumber: z.number(),
	type: z.enum([
		'title_mismatch',
		'description_mismatch',
		'status_mismatch',
		'assignee_mismatch',
		'label_mismatch',
		'deleted_on_github',
		'deleted_locally'
	]),
	localValue: z.unknown(),
	remoteValue: z.unknown(),
	detectedAt: z.string(),
	resolutionStrategy: z.enum(['prefer_local', 'prefer_remote', 'manual', 'merge']),
	resolved: z.boolean()
});

const ChangeMetadataSchema = z.object({
	taskId: z.string(),
	issueNumber: z.number(),
	localUpdatedAt: z.string(),
	remoteUpdatedAt: z.string(),
	lastCheckedAt: z.string(),
	hasLocalChanges: z.boolean(),
	hasRemoteChanges: z.boolean(),
	localContentHash: z.string().optional(),
	remoteContentHash: z.string().optional()
});

const SyncOperationRecordSchema = z.object({
	operationId: z.string(),
	taskId: z.string(),
	issueNumber: z.number(),
	operationType: z.enum([
		'create_issue',
		'update_issue',
		'create_task',
		'update_task',
		'resolve_conflict'
	]),
	direction: z.enum(['to_github', 'from_github', 'bidirectional']),
	timestamp: z.string(),
	success: z.boolean(),
	error: z.string().optional(),
	metadata: z.record(z.unknown()).optional()
});

const StateBackupMetadataSchema = z.object({
	backupPath: z.string(),
	createdAt: z.string(),
	mappingCount: z.number(),
	version: z.string()
});

const GitHubSyncStateFileSchema = z.object({
	version: z.string(),
	owner: z.string(),
	repo: z.string(),
	mappings: z.record(z.string(), SyncMappingSchema),
	conflicts: z.array(SyncConflictSchema),
	changeMetadata: z.record(z.string(), ChangeMetadataSchema),
	operationHistory: z.array(SyncOperationRecordSchema),
	maxHistorySize: z.number(),
	lastSyncAt: z.string().nullable(),
	syncInProgress: z.boolean(),
	lastSyncError: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	lastBackup: StateBackupMetadataSchema.nullable()
});

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
		const state = await this.loadState();
		return state.changeMetadata[taskId] || null;
	}

	/**
	 * Update change metadata
	 * @param metadata: ChangeMetadata
	 */
	async updateChangeMetadata(
		metadata: ChangeMetadata
	): Promise<StateFileOperationResult> {
		return await this.modifyState((state) => {
			state.changeMetadata[metadata.taskId] = metadata;
		});
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
		const existingMetadata = await this.getChangeMetadata(taskId);

		let hasLocalChanges = false;
		let hasRemoteChanges = false;

		if (!existingMetadata) {
			// First time checking - assume both have changes
			hasLocalChanges = true;
			hasRemoteChanges = true;
		} else {
			// Compare timestamps to detect changes
			const localDate = new Date(localUpdatedAt);
			const remoteDate = new Date(remoteUpdatedAt);
			const lastLocalDate = new Date(existingMetadata.localUpdatedAt);
			const lastRemoteDate = new Date(existingMetadata.remoteUpdatedAt);

			hasLocalChanges = localDate > lastLocalDate;
			hasRemoteChanges = remoteDate > lastRemoteDate;
		}

		// Update metadata with new check
		const mapping = await this.getMapping(taskId);
		const newMetadata: ChangeMetadata = {
			taskId,
			issueNumber: mapping?.issueNumber || 0,
			localUpdatedAt,
			remoteUpdatedAt,
			lastCheckedAt: new Date().toISOString(),
			hasLocalChanges,
			hasRemoteChanges
		};

		await this.updateChangeMetadata(newMetadata);

		return { hasLocalChanges, hasRemoteChanges };
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
		const stateFilePath = this.getStateFilePath();
		const backupDir = this.getBackupDir();

		// Ensure backup directory exists
		await fs.mkdir(backupDir, { recursive: true });

		// Create backup filename with timestamp and UUID
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const uuid = randomUUID().split('-')[0]; // Use first segment for brevity
		const backupFileName = `github-sync-state-${timestamp}-${uuid}.json`;
		const backupPath = path.join(backupDir, backupFileName);

		// Copy state file to backup location
		await fs.copyFile(stateFilePath, backupPath);

		// Load current state to get mapping count
		const state = await this.loadState();
		const mappingCount = Object.keys(state.mappings).length;

		// Update state with backup metadata
		state.lastBackup = {
			backupPath,
			createdAt: new Date().toISOString(),
			mappingCount,
			version: GitHubSyncStateService.SCHEMA_VERSION
		};

		// Save updated state (without creating another backup to avoid recursion)
		await this.saveStateWithoutBackup(state);

		// Enforce retention policy
		await this.enforceBackupRetention();

		return backupPath;
	}

	/**
	 * Recover state from backup
	 * @param backupPath - Optional specific backup to recover from
	 */
	async recoverFromBackup(backupPath?: string): Promise<StateFileOperationResult> {
		const warnings: string[] = [];
		let selectedBackupPath: string;

		if (backupPath) {
			// Use explicit backup path
			selectedBackupPath = backupPath;

			// Verify backup exists
			const exists = await this.fileExists(selectedBackupPath);
			if (!exists) {
				return {
					success: false,
					error: `Backup file not found: ${selectedBackupPath}`
				};
			}
		} else {
			// Find the latest valid backup
			const latestBackup = await this.findLatestValidBackup();
			if (!latestBackup) {
				return {
					success: false,
					error: 'No valid backup files found'
				};
			}

			selectedBackupPath = latestBackup;
			warnings.push(
				`Auto-selected latest backup: ${path.basename(selectedBackupPath)}`
			);
		}

		try {
			// Read and validate backup file
			const backupContent = await fs.readFile(selectedBackupPath, 'utf-8');
			const backupState = JSON.parse(backupContent) as GitHubSyncStateFile;

			// Validate the backup using Zod schema
			const isValid = await this.validateStateFile(backupState);
			if (!isValid) {
				return {
					success: false,
					error: 'Backup file failed validation',
					warnings
				};
			}

			// Copy backup to primary state file location
			const stateFilePath = this.getStateFilePath();
			await fs.copyFile(selectedBackupPath, stateFilePath);

			// Reload and revalidate to ensure recovery succeeded
			const recoveredState = await this.loadStateWithoutLock();
			const revalidated = await this.validateStateFile(recoveredState);

			if (!revalidated) {
				return {
					success: false,
					error: 'Recovered state failed revalidation',
					warnings
				};
			}

			// Check if backup is older than previous backup
			if (backupState.lastBackup) {
				const backupAge = new Date(backupState.lastBackup.createdAt);
				const now = new Date();
				const daysDiff = (now.getTime() - backupAge.getTime()) / (1000 * 60 * 60 * 24);

				if (daysDiff > 1) {
					warnings.push(
						`Warning: Backup is ${Math.floor(daysDiff)} days old`
					);
				}
			}

			warnings.push('State successfully recovered from backup');

			return {
				success: true,
				recoveryPerformed: true,
				warnings
			};
		} catch (error: any) {
			return {
				success: false,
				error: `Failed to recover from backup: ${error.message}`,
				warnings
			};
		}
	}

	/**
	 * Validate state file schema
	 * @param state - State file to validate
	 * @returns Whether the state file is valid
	 */
	async validateStateFile(state: unknown): Promise<boolean> {
		try {
			// Use Zod schema for comprehensive validation
			GitHubSyncStateFileSchema.parse(state);
			return true;
		} catch (error: any) {
			// Log validation errors for debugging
			if (error instanceof z.ZodError) {
				const issues = error.issues.map((issue) => ({
					path: issue.path.join('.'),
					message: issue.message
				}));
				console.error('State file validation failed:', issues);
			}
			return false;
		}
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

			// Determine corruption type
			let corruptionType = 'unknown error';
			if (error instanceof SyntaxError) {
				corruptionType = 'JSON parse error (file truncated or malformed)';
			} else if (error.message?.includes('Invalid state file schema')) {
				corruptionType = 'schema validation failure';
			}

			// If auto-recovery is enabled, attempt recovery from backup
			if (this.options.autoRecoverFromBackup) {
				console.warn(
					`State file corrupted (${corruptionType}). Attempting auto-recovery...`
				);

				const recoveryResult = await this.recoverFromBackup();

				if (recoveryResult.success) {
					console.warn('Auto-recovery successful. State restored from backup.');

					// Re-load the recovered state
					const recoveredContent = await fs.readFile(filePath, 'utf-8');
					const recoveredState = JSON.parse(
						recoveredContent
					) as GitHubSyncStateFile;

					return recoveredState;
				} else {
					// Recovery failed, log high-severity warning
					console.error(
						`Auto-recovery failed: ${recoveryResult.error}. Creating empty state.`
					);
					console.error(
						'WARNING: All task-issue mappings lost. Re-run syncWithGitHub() to rebuild.'
					);

					// Return empty state as last resort
					return this.createEmptyState();
				}
			}

			throw new Error(`Failed to load state file (${corruptionType}): ${error.message}`);
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
			const result = await this.performAtomicWrite(filePath, state);
			return { success: true, backupCreated: result.backupCreated };
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
		state: GitHubSyncStateFile,
		createBackup: boolean = true
	): Promise<{ backupCreated: boolean }> {
		const tempPath = `${filePath}.tmp`;
		const dir = path.dirname(filePath);
		let backupCreated = false;

		try {
			// Ensure directory exists
			await fs.mkdir(dir, { recursive: true });

			// Create backup if enabled
			if (this.options.createBackup && createBackup) {
				const exists = await this.fileExists(filePath);
				if (exists) {
					try {
						await this.createBackupInternal(filePath);
						backupCreated = true;
					} catch (backupError: any) {
						// Log backup failure but continue with write
						console.warn(
							`Failed to create backup before write: ${backupError.message}`
						);
					}
				}
			}

			// Update timestamps
			state.updatedAt = new Date().toISOString();

			// Write to temp file first
			const content = JSON.stringify(state, null, 2);
			await fs.writeFile(tempPath, content, 'utf-8');

			// Atomic rename
			await fs.rename(tempPath, filePath);

			return { backupCreated };
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
			const result = await this.performAtomicWrite(filePath, state);

			return { success: true, backupCreated: result.backupCreated };
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

	/**
	 * Get the backup directory path
	 */
	private getBackupDir(): string {
		return path.join(this.getTaskmasterDir(), BACKUP_DIR_NAME);
	}

	/**
	 * Save state without creating a backup (to avoid recursion)
	 */
	private async saveStateWithoutBackup(
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
			const result = await this.performAtomicWrite(filePath, state, false);
			return { success: true, backupCreated: result.backupCreated };
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
	 * Create a backup without updating state metadata (internal use)
	 */
	private async createBackupInternal(stateFilePath: string): Promise<string> {
		const backupDir = this.getBackupDir();

		// Ensure backup directory exists
		await fs.mkdir(backupDir, { recursive: true });

		// Create backup filename with timestamp and UUID
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const uuid = randomUUID().split('-')[0];
		const backupFileName = `github-sync-state-${timestamp}-${uuid}.json`;
		const backupPath = path.join(backupDir, backupFileName);

		// Copy state file to backup location
		await fs.copyFile(stateFilePath, backupPath);

		// Enforce retention policy
		await this.enforceBackupRetention();

		return backupPath;
	}

	/**
	 * Find the latest valid backup file
	 */
	private async findLatestValidBackup(): Promise<string | null> {
		const backupDir = this.getBackupDir();

		try {
			// Check if backup directory exists
			const dirExists = await this.fileExists(backupDir);
			if (!dirExists) {
				return null;
			}

			// Read all backup files
			const files = await fs.readdir(backupDir);
			const backupFiles = files
				.filter((f) => f.startsWith('github-sync-state-') && f.endsWith('.json'))
				.map((f) => path.join(backupDir, f));

			if (backupFiles.length === 0) {
				return null;
			}

			// Sort by modification time (newest first)
			const filesWithStats = await Promise.all(
				backupFiles.map(async (file) => {
					const stats = await fs.stat(file);
					return { file, mtime: stats.mtime };
				})
			);

			filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

			// Validate backups in order until we find a valid one
			for (const { file } of filesWithStats) {
				try {
					const content = await fs.readFile(file, 'utf-8');
					const state = JSON.parse(content);
					const isValid = await this.validateStateFile(state);

					if (isValid) {
						return file;
					}
				} catch {
					// Skip invalid backups
					continue;
				}
			}

			return null;
		} catch (error: any) {
			console.error(`Failed to find latest backup: ${error.message}`);
			return null;
		}
	}

	/**
	 * Enforce backup retention policy
	 * Keeps only the most recent MAX_BACKUP_RETENTION backups
	 */
	private async enforceBackupRetention(): Promise<void> {
		const backupDir = this.getBackupDir();

		try {
			// Check if backup directory exists
			const dirExists = await this.fileExists(backupDir);
			if (!dirExists) {
				return;
			}

			// Read all backup files
			const files = await fs.readdir(backupDir);
			const backupFiles = files
				.filter((f) => f.startsWith('github-sync-state-') && f.endsWith('.json'))
				.map((f) => path.join(backupDir, f));

			// If we're under the limit, no need to clean up
			if (backupFiles.length <= MAX_BACKUP_RETENTION) {
				return;
			}

			// Sort by modification time (newest first)
			const filesWithStats = await Promise.all(
				backupFiles.map(async (file) => {
					const stats = await fs.stat(file);
					return { file, mtime: stats.mtime };
				})
			);

			filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

			// Delete old backups beyond retention limit
			const filesToDelete = filesWithStats.slice(MAX_BACKUP_RETENTION);

			for (const { file } of filesToDelete) {
				try {
					await fs.unlink(file);
				} catch (error: any) {
					console.warn(`Failed to delete old backup ${file}: ${error.message}`);
				}
			}

			// Also delete backups older than maxHistoryAgeDays
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - this.options.maxHistoryAgeDays);

			for (const { file, mtime } of filesWithStats) {
				if (mtime < cutoffDate) {
					try {
						await fs.unlink(file);
					} catch (error: any) {
						console.warn(
							`Failed to delete expired backup ${file}: ${error.message}`
						);
					}
				}
			}
		} catch (error: any) {
			console.warn(`Failed to enforce backup retention: ${error.message}`);
		}
	}
}
