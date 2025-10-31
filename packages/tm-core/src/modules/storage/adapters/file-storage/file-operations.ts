/**
 * @fileoverview File operations with atomic writes and locking
 */

import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import type { FileStorageData } from './format-handler.js';
import { getLogger } from '../../../../common/logger/factory.js';
import {
	TaskMasterError,
	ERROR_CODES
} from '../../../../common/errors/task-master-error.js';

/**
 * Handles atomic file operations with locking mechanism
 */
export class FileOperations {
	private fileLocks: Map<string, Promise<void>> = new Map();

	// Retry configuration constants
	private static readonly MAX_RETRIES = 3;
	private static readonly BASE_RETRY_DELAY_MS = 50;
	private static readonly MAX_RETRY_DELAY_MS = 1000;
	private static readonly BACKOFF_MULTIPLIER = 2;
	private static readonly JITTER_FACTOR = 0.1;
	private static readonly RETRYABLE_ERROR_CODES = new Set([
		'EPERM',
		'EBUSY',
		'ENOENT',
		'EACCES',
		'EAGAIN'
	]);

	// Logger instance
	private logger = getLogger('FileOperations');

	/**
	 * Read and parse JSON file
	 */
	async readJson(filePath: string): Promise<any> {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return JSON.parse(content);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				throw error; // Re-throw ENOENT for caller to handle
			}
			if (error instanceof SyntaxError) {
				throw new TaskMasterError(
					`Invalid JSON in file ${filePath}`,
					ERROR_CODES.JSON_PARSE_ERROR,
					{
						operation: 'readJson',
						resource: filePath,
						details: { parseError: error.message }
					},
					error
				);
			}
			throw new TaskMasterError(
				`Failed to read file ${filePath}`,
				ERROR_CODES.FILE_READ_ERROR,
				{
					operation: 'readJson',
					resource: filePath,
					details: { errorCode: error?.code }
				},
				error
			);
		}
	}

	/**
	 * Write JSON file with atomic operation and locking
	 */
	async writeJson(
		filePath: string,
		data: FileStorageData | any
	): Promise<void> {
		// Use file locking to prevent concurrent writes
		const lockKey = filePath;
		const existingLock = this.fileLocks.get(lockKey);

		if (existingLock) {
			await existingLock;
		}

		const lockPromise = this.performAtomicWrite(filePath, data);
		this.fileLocks.set(lockKey, lockPromise);

		try {
			await lockPromise;
		} finally {
			this.fileLocks.delete(lockKey);
		}
	}

	/**
	 * Perform atomic write operation using temporary file with retry logic
	 * Retries on transient file system errors with exponential backoff
	 */
	private async performAtomicWrite(filePath: string, data: any): Promise<void> {
		const tempPath = `${filePath}.tmp`;
		let lastError: Error | undefined;
		let hasLoggedRetry = false;

		// Loop: initial attempt (0) + MAX_RETRIES attempts
		for (let attempt = 0; attempt <= FileOperations.MAX_RETRIES; attempt++) {
			try {
				// Write to temp file first
				const content = JSON.stringify(data, null, 2);
				await fs.writeFile(tempPath, content, 'utf-8');

				// Atomic rename
				await fs.rename(tempPath, filePath);

				// Log successful retry completion if retry was attempted
				if (hasLoggedRetry) {
					this.logger.info(
						`File write to ${filePath} succeeded after retry (attempt ${attempt + 1}/${
							FileOperations.MAX_RETRIES + 1
						})`
					);
				}

				// Success - exit
				return;
			} catch (error: any) {
				lastError = error;

				// Check if error is retryable
				if (!this.isRetryableError(error)) {
					// Not retryable - clean up and throw immediately
					try {
						await fs.unlink(tempPath);
					} catch {
						// Ignore cleanup errors
					}
					throw new TaskMasterError(
						`Failed to write file ${filePath}: ${error?.message ?? String(error)}`,
						ERROR_CODES.FILE_WRITE_ERROR,
						{
							operation: 'performAtomicWrite',
							resource: filePath,
							details: { errorCode: error?.code }
						},
						error
					);
				}

				// Check if we should retry (still have attempts left)
				if (attempt < FileOperations.MAX_RETRIES) {
					// Log warning on first retry only
					if (!hasLoggedRetry) {
						this.logger.warn(
							`File write failed with ${error.code} for ${filePath}, ` +
								`retrying with exponential backoff (attempt ${attempt + 1}/${
									FileOperations.MAX_RETRIES + 1
								})`
						);
						hasLoggedRetry = true;
					}

					// Calculate delay and wait (use attempt+1 for exponential calculation)
					const delay = this.calculateBackoffDelay(attempt + 1);
					await this.sleep(delay);
				}
			}
		}

		// All retries exhausted - clean up and throw
		try {
			await fs.unlink(tempPath);
		} catch {
			// Ignore cleanup errors
		}

		this.logger.error(
			`Failed to write file ${filePath} after ${
				FileOperations.MAX_RETRIES + 1
			} attempts. ` + `Final error: ${lastError?.message ?? String(lastError)}`
		);

		throw new TaskMasterError(
			`Failed to write file ${filePath} after ${
				FileOperations.MAX_RETRIES + 1
			} attempts`,
			ERROR_CODES.FILE_WRITE_ERROR,
			{
				operation: 'performAtomicWrite',
				resource: filePath,
				details: {
					attempts: FileOperations.MAX_RETRIES + 1,
					finalError: lastError?.message,
					errorCode: (lastError as any)?.code
				}
			},
			lastError
		);
	}

	/**
	 * Check if error is retryable based on error code
	 */
	private isRetryableError(error: unknown): boolean {
		const code = (error as NodeJS.ErrnoException)?.code;
		return code
			? FileOperations.RETRYABLE_ERROR_CODES.has(code)
			: false;
	}

	/**
	 * Calculate exponential backoff delay with jitter
	 * Copied from base-provider.ts for consistency
	 */
	private calculateBackoffDelay(attempt: number): number {
		const exponentialDelay =
			FileOperations.BASE_RETRY_DELAY_MS *
			FileOperations.BACKOFF_MULTIPLIER ** (attempt - 1);
		const clampedDelay = Math.min(
			exponentialDelay,
			FileOperations.MAX_RETRY_DELAY_MS
		);

		// Add jitter to prevent thundering herd (±10%)
		const jitter =
			clampedDelay *
			FileOperations.JITTER_FACTOR *
			(Math.random() - 0.5) *
			2;

		return Math.round(clampedDelay + jitter);
	}

	/**
	 * Sleep utility for retry delays
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Check if file exists
	 */
	async exists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get file stats
	 */
	async getStats(filePath: string) {
		return fs.stat(filePath);
	}

	/**
	 * Read directory contents
	 */
	async readDir(dirPath: string): Promise<string[]> {
		return fs.readdir(dirPath);
	}

	/**
	 * Create directory recursively
	 */
	async ensureDir(dirPath: string): Promise<void> {
		try {
			await fs.mkdir(dirPath, { recursive: true });
		} catch (error: any) {
			throw new TaskMasterError(
				`Failed to create directory ${dirPath}`,
				ERROR_CODES.FILE_WRITE_ERROR,
				{
					operation: 'ensureDir',
					resource: dirPath,
					details: { errorCode: error?.code }
				},
				error
			);
		}
	}

	/**
	 * Delete file
	 */
	async deleteFile(filePath: string): Promise<void> {
		try {
			await fs.unlink(filePath);
		} catch (error: any) {
			if (error.code !== 'ENOENT') {
				throw new TaskMasterError(
					`Failed to delete file ${filePath}`,
					ERROR_CODES.FILE_WRITE_ERROR,
					{
						operation: 'deleteFile',
						resource: filePath,
						details: { errorCode: error?.code }
					},
					error
				);
			}
		}
	}

	/**
	 * Rename/move file
	 */
	async moveFile(oldPath: string, newPath: string): Promise<void> {
		try {
			await fs.rename(oldPath, newPath);
		} catch (error: any) {
			throw new TaskMasterError(
				`Failed to move file from ${oldPath} to ${newPath}`,
				ERROR_CODES.FILE_WRITE_ERROR,
				{
					operation: 'moveFile',
					resource: oldPath,
					details: { destination: newPath, errorCode: error?.code }
				},
				error
			);
		}
	}

	/**
	 * Copy file
	 */
	async copyFile(srcPath: string, destPath: string): Promise<void> {
		try {
			await fs.copyFile(srcPath, destPath);
		} catch (error: any) {
			throw new TaskMasterError(
				`Failed to copy file from ${srcPath} to ${destPath}`,
				ERROR_CODES.FILE_WRITE_ERROR,
				{
					operation: 'copyFile',
					resource: srcPath,
					details: { destination: destPath, errorCode: error?.code }
				},
				error
			);
		}
	}

	/**
	 * Clean up all pending file operations
	 */
	async cleanup(): Promise<void> {
		const locks = Array.from(this.fileLocks.values());
		if (locks.length > 0) {
			await Promise.all(locks);
		}
		this.fileLocks.clear();
	}
}
