/**
 * @fileoverview File operations with atomic writes and locking
 */

import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { ResourceMutex } from '../../../../common/utils/mutex.js';
import type { FileStorageData } from './format-handler.js';

/**
 * Configuration options for FileOperations
 */
export interface FileOperationsOptions {
	/**
	 * Timeout for acquiring file locks in milliseconds
	 * @default 30000 (30 seconds)
	 */
	mutexTimeout?: number;

	/**
	 * Optional logger for debug-level logging
	 */
	logger?: {
		debug: (message: string, meta?: any) => void;
		warn: (message: string, meta?: any) => void;
		error: (message: string, meta?: any) => void;
	};
}

/**
 * Handles atomic file operations with mutex-based locking
 */
export class FileOperations {
	private readonly mutex: ResourceMutex;
	private readonly logger?: FileOperationsOptions['logger'];

	constructor(options?: FileOperationsOptions) {
		// Initialize mutex with configurable timeout (default 30s like GitHubSyncStateService)
		this.mutex = new ResourceMutex({
			timeout: options?.mutexTimeout ?? 30000
		});
		this.logger = options?.logger;
	}

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
				throw new Error(`Invalid JSON in file ${filePath}: ${error.message}`);
			}
			throw new Error(`Failed to read file ${filePath}: ${error.message}`);
		}
	}

	/**
	 * Write JSON file with mutex-protected atomic operation
	 */
	async writeJson(
		filePath: string,
		data: FileStorageData | any
	): Promise<void> {
		this.logger?.debug('Acquiring mutex for writeJson', { filePath });
		const release = await this.mutex.acquire(filePath);

		try {
			this.logger?.debug('Mutex acquired, performing write', { filePath });
			await this.performAtomicWrite(filePath, data);
			this.logger?.debug('Write completed successfully', { filePath });
		} catch (error: any) {
			this.logger?.error('Write failed', { filePath, error: error.message });
			throw error;
		} finally {
			release();
			this.logger?.debug('Mutex released', { filePath });
		}
	}

	/**
	 * Perform atomic write operation using temporary file
	 */
	private async performAtomicWrite(filePath: string, data: any): Promise<void> {
		const tempPath = `${filePath}.tmp`;

		try {
			// Write to temp file first
			const content = JSON.stringify(data, null, 2);
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

			throw new Error(`Failed to write file ${filePath}: ${error.message}`);
		}
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
	 * Create directory recursively with mutex protection
	 */
	async ensureDir(dirPath: string): Promise<void> {
		this.logger?.debug('Acquiring mutex for ensureDir', { dirPath });
		const release = await this.mutex.acquire(dirPath);

		try {
			this.logger?.debug('Mutex acquired, creating directory', { dirPath });
			await fs.mkdir(dirPath, { recursive: true });
			this.logger?.debug('Directory created successfully', { dirPath });
		} catch (error: any) {
			this.logger?.error('Directory creation failed', {
				dirPath,
				error: error.message
			});
			throw new Error(
				`Failed to create directory ${dirPath}: ${error.message}`
			);
		} finally {
			release();
			this.logger?.debug('Mutex released', { dirPath });
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
				throw new Error(`Failed to delete file ${filePath}: ${error.message}`);
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
			throw new Error(
				`Failed to move file from ${oldPath} to ${newPath}: ${error.message}`
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
			throw new Error(
				`Failed to copy file from ${srcPath} to ${destPath}: ${error.message}`
			);
		}
	}

	/**
	 * Clean up all pending file operations
	 */
	async cleanup(): Promise<void> {
		const stats = this.mutex.getStats();
		if (stats.lockedResources > 0 || stats.totalWaiters > 0) {
			this.logger?.warn('Cleanup called with active operations', {
				lockedResources: stats.lockedResources,
				waiters: stats.totalWaiters
			});
		}
		this.logger?.debug('FileOperations cleanup completed');
	}
}
