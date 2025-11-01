/**
 * @fileoverview Hybrid write queue strategy with time + size triggers
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
	IWriteQueueStrategy,
	WriteOperation,
	FlushResult,
	WriteQueueMetrics,
	WriteQueueConfig
} from '../types.js';
import type { CacheManager } from '../../cache/cache-manager.js';
import { getLogger } from '../../logger/factory.js';
import {
	TaskMasterError,
	ERROR_CODES
} from '../../errors/task-master-error.js';

/**
 * Default write queue configuration
 */
const DEFAULT_CONFIG: WriteQueueConfig = {
	maxWaitTime: 150, // 150ms matches hybrid strategy
	maxBatchSize: 10,
	maxRetries: 3,
	enableMetrics: true,
	enableAutoFlush: true
};

/**
 * Hybrid write queue strategy with time + size triggers
 *
 * Features:
 * - Automatic flush on time threshold (150ms default)
 * - Automatic flush on size threshold (10 writes default)
 * - Parallel writes to different files
 * - Failed writes retry in next batch
 * - Batch cache invalidation
 * - Per-file metrics tracking
 *
 * @example
 * ```typescript
 * const queue = new HybridWriteQueueStrategy({ maxWaitTime: 200 });
 * await queue.enqueue({
 *   filePath: '/path/to/file.json',
 *   data: '{"key": "value"}',
 *   invalidationTags: ['master']
 * });
 * ```
 */
export class HybridWriteQueueStrategy implements IWriteQueueStrategy {
	private queue: Map<string, WriteOperation[]> = new Map(); // Keyed by filePath
	private flushTimer: NodeJS.Timeout | null = null;
	private isShuttingDown = false;
	private logger = getLogger('HybridWriteQueueStrategy');

	// Metrics tracking
	private totalQueued = 0;
	private totalFlushed = 0;
	private totalFailed = 0;
	private flushCount = 0;
	private totalQueueTime = 0;
	private fileMetrics = new Map<
		string,
		{
			queued: number;
			flushed: number;
			failed: number;
			lastFlushTime?: number;
		}
	>();

	private config: Required<WriteQueueConfig>;

	// Constants for resource management
	private static readonly MAX_FILE_METRICS = 1000; // Prevent unbounded growth

	constructor(
		config: Partial<WriteQueueConfig> = {},
		private readonly cacheManager?: CacheManager
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Enqueue a write operation
	 */
	async enqueue(
		operation: Omit<
			WriteOperation,
			'id' | 'queuedAt' | 'retryCount' | 'resolve' | 'reject'
		>
	): Promise<void> {
		if (this.isShuttingDown) {
			throw new TaskMasterError(
				'Write queue is shutting down',
				ERROR_CODES.FILE_WRITE_ERROR,
				{ operation: 'enqueue' }
			);
		}

		return new Promise<void>((resolve, reject) => {
			const writeOp: WriteOperation = {
				...operation,
				id: randomUUID(),
				queuedAt: Date.now(),
				retryCount: 0,
				resolve,
				reject
			};

			// Group by file path for parallel writes
			const filePath = path.normalize(operation.filePath);
			const fileQueue = this.queue.get(filePath) || [];
			fileQueue.push(writeOp);
			this.queue.set(filePath, fileQueue);

			// Update metrics
			if (this.config.enableMetrics) {
				this.totalQueued++;
				this.updateFileMetrics(filePath, 'queued');
			}

			// Check size threshold
			const totalQueueSize = this.getTotalQueueSize();
			if (totalQueueSize >= this.config.maxBatchSize) {
				this.logger.debug(
					`Size threshold reached (${totalQueueSize}), flushing immediately`
				);
				this.scheduleImmediateFlush();
			} else {
				this.scheduleTimedFlush();
			}
		});
	}

	/**
	 * Flush all queued operations
	 */
	async flush(): Promise<FlushResult> {
		this.clearFlushTimer();

		if (this.queue.size === 0) {
			return {
				successCount: 0,
				failureCount: 0,
				requeuedCount: 0,
				filesWritten: [],
				errors: []
			};
		}

		// Snapshot current queue and clear it
		const operationsToFlush = new Map(this.queue);
		this.queue.clear();

		// Execute writes in parallel for different files
		const flushPromises = Array.from(operationsToFlush.entries()).map(
			([filePath, operations]) =>
				this.flushFileOperations(filePath, operations)
		);

		const results = await Promise.all(flushPromises);

		// Aggregate results
		const aggregatedResult: FlushResult = {
			successCount: 0,
			failureCount: 0,
			requeuedCount: 0,
			filesWritten: [],
			errors: []
		};

		for (const result of results) {
			aggregatedResult.successCount += result.successCount;
			aggregatedResult.failureCount += result.failureCount;
			aggregatedResult.requeuedCount += result.requeuedCount;
			aggregatedResult.filesWritten.push(...result.filesWritten);
			aggregatedResult.errors.push(...result.errors);
		}

		// Update metrics
		if (this.config.enableMetrics) {
			this.flushCount++;
			this.totalFlushed += aggregatedResult.successCount;
			this.totalFailed += aggregatedResult.failureCount;
		}

		this.logger.debug(
			`Flushed batch: ${aggregatedResult.successCount} success, ${aggregatedResult.failureCount} failed, ${aggregatedResult.requeuedCount} requeued`
		);

		return aggregatedResult;
	}

	/**
	 * Flush all operations for a specific file
	 * Writes are sequential for same file, latest operation wins
	 */
	private async flushFileOperations(
		filePath: string,
		operations: WriteOperation[]
	): Promise<FlushResult> {
		const result: FlushResult = {
			successCount: 0,
			failureCount: 0,
			requeuedCount: 0,
			filesWritten: [],
			errors: []
		};

		try {
			// Sort by queue time (oldest first)
			operations.sort((a, b) => a.queuedAt - b.queuedAt);

			// Process each write sequentially (preserve order for same file)
			for (const operation of operations) {
			try {
				// Ensure directory exists
				await fs.mkdir(path.dirname(filePath), { recursive: true });

				// Execute write
				await fs.writeFile(filePath, operation.data, 'utf-8');

				// Invalidate cache
				if (this.cacheManager && operation.invalidationTags) {
					for (const tag of operation.invalidationTags) {
						this.cacheManager.invalidateTag(tag);
					}
				}

				if (this.cacheManager && operation.invalidationNamespace) {
					this.cacheManager.invalidateNamespace(
						operation.invalidationNamespace
					);
				}

				// Track success
				result.successCount++;
				if (!result.filesWritten.includes(filePath)) {
					result.filesWritten.push(filePath);
				}

				// Update metrics
				if (this.config.enableMetrics) {
					this.updateFileMetrics(filePath, 'flushed');
					this.totalQueueTime += Date.now() - operation.queuedAt;
				}

				// Resolve promise
				operation.resolve();
			} catch (error) {
				const writeError =
					error instanceof Error ? error : new Error(String(error));

				// Check if retriable
				if (
					this.isRetriableError(writeError) &&
					operation.retryCount < this.config.maxRetries
				) {
					// Re-queue for retry
					operation.retryCount++;
					const fileQueue = this.queue.get(filePath) || [];
					fileQueue.push(operation);
					this.queue.set(filePath, fileQueue);
					result.requeuedCount++;

					this.logger.debug(
						`Requeued write for ${filePath} (retry ${operation.retryCount}/${this.config.maxRetries})`
					);
				} else {
					// Max retries exceeded or non-retriable error
					result.failureCount++;
					result.errors.push({ operation, error: writeError });

					// Update metrics
					if (this.config.enableMetrics) {
						this.updateFileMetrics(filePath, 'failed');
					}

					// Reject promise
					operation.reject(
						new TaskMasterError(
							`Failed to write ${filePath} after ${operation.retryCount} retries: ${writeError.message}`,
							ERROR_CODES.FILE_WRITE_ERROR,
							{
								operation: 'flushFileOperations',
								resource: filePath,
								details: { retryCount: operation.retryCount }
							},
							writeError
						)
					);
				}
			}
			}
		} catch (outerError) {
			// Catastrophic error in flush logic itself (not write errors)
			const error =
				outerError instanceof Error
					? outerError
					: new Error(String(outerError));
			this.logger.error(
				`Catastrophic error in flushFileOperations for ${filePath}: ${error.message}`
			);

			// Reject all operations in this batch
			for (const operation of operations) {
				result.failureCount++;
				result.errors.push({ operation, error });
				operation.reject(error);
			}
		}

		return result;
	}

	/**
	 * Check if error is retriable (transient I/O errors)
	 */
	private isRetriableError(error: Error): boolean {
		const retriableCodes = ['EPERM', 'EBUSY', 'EAGAIN', 'ENOENT'];
		return retriableCodes.some((code) => error.message.includes(code));
	}

	/**
	 * Get current queue metrics
	 */
	getMetrics(): WriteQueueMetrics {
		const totalQueueSize = this.getTotalQueueSize();

		return {
			totalQueued: this.totalQueued,
			totalFlushed: this.totalFlushed,
			totalFailed: this.totalFailed,
			currentQueueSize: totalQueueSize,
			flushCount: this.flushCount,
			averageBatchSize:
				this.flushCount > 0 ? this.totalFlushed / this.flushCount : 0,
			averageQueueTime:
				this.totalFlushed > 0
					? this.totalQueueTime / this.totalFlushed
					: 0,
			fileMetrics: new Map(this.fileMetrics)
		};
	}

	/**
	 * Clear all queued operations
	 */
	clear(): void {
		this.clearFlushTimer();

		// Reject all pending operations
		for (const operations of this.queue.values()) {
			for (const op of operations) {
				op.reject(new Error('Write queue cleared'));
			}
		}

		this.queue.clear();
	}

	/**
	 * Shutdown queue and flush remaining operations
	 * Loops until queue is empty to handle re-queued operations
	 */
	async shutdown(): Promise<FlushResult> {
		this.isShuttingDown = true;
		this.clearFlushTimer();

		// Aggregate results from multiple flush iterations
		const aggregatedResult: FlushResult = {
			successCount: 0,
			failureCount: 0,
			requeuedCount: 0,
			filesWritten: [],
			errors: []
		};

		// Loop until queue is empty (handles re-queued operations)
		let maxIterations = 10; // Safety limit to prevent infinite loops
		while (this.queue.size > 0 && maxIterations > 0) {
			const result = await this.flush();
			aggregatedResult.successCount += result.successCount;
			aggregatedResult.failureCount += result.failureCount;
			aggregatedResult.requeuedCount += result.requeuedCount;
			aggregatedResult.filesWritten.push(...result.filesWritten);
			aggregatedResult.errors.push(...result.errors);

			// If nothing was requeued, we're done
			if (result.requeuedCount === 0) {
				break;
			}

			maxIterations--;
		}

		if (maxIterations === 0 && this.queue.size > 0) {
			this.logger.warn(
				`Shutdown reached max iterations with ${this.queue.size} operations still queued`
			);
		}

		return aggregatedResult;
	}

	/**
	 * Schedule immediate flush (size threshold reached)
	 */
	private scheduleImmediateFlush(): void {
		if (!this.config.enableAutoFlush || this.isShuttingDown) return;

		this.clearFlushTimer();
		// Use setImmediate for next event loop tick
		this.flushTimer = setTimeout(() => {
			void this.flush();
		}, 0);
	}

	/**
	 * Schedule timed flush (time threshold)
	 */
	private scheduleTimedFlush(): void {
		if (!this.config.enableAutoFlush || this.isShuttingDown) return;

		if (this.flushTimer) return; // Timer already running

		this.flushTimer = setTimeout(() => {
			void this.flush();
		}, this.config.maxWaitTime);
	}

	/**
	 * Clear flush timer
	 */
	private clearFlushTimer(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}

	/**
	 * Get total queue size across all files
	 */
	private getTotalQueueSize(): number {
		let size = 0;
		for (const operations of this.queue.values()) {
			size += operations.length;
		}
		return size;
	}

	/**
	 * Update per-file metrics with LRU eviction to prevent unbounded growth
	 */
	private updateFileMetrics(
		filePath: string,
		metric: 'queued' | 'flushed' | 'failed'
	): void {
		const metrics = this.fileMetrics.get(filePath) || {
			queued: 0,
			flushed: 0,
			failed: 0
		};

		metrics[metric]++;

		if (metric === 'flushed') {
			metrics.lastFlushTime = Date.now();
		}

		this.fileMetrics.set(filePath, metrics);

		// Enforce max size with LRU eviction (oldest entries first)
		if (this.fileMetrics.size > HybridWriteQueueStrategy.MAX_FILE_METRICS) {
			const oldestKey = this.fileMetrics.keys().next().value;
			if (oldestKey) {
				this.fileMetrics.delete(oldestKey);
			}
		}
	}
}
