/**
 * @fileoverview Types and interfaces for write queue system
 */

import type { CacheNamespace } from '../cache/index.js';

/**
 * Represents a single write operation to be queued
 */
export interface WriteOperation {
	/** Unique identifier for this write operation */
	id: string;

	/** Absolute file path */
	filePath: string;

	/** Data to write */
	data: string;

	/** Timestamp when operation was queued */
	queuedAt: number;

	/** Number of retry attempts */
	retryCount: number;

	/** Optional cache invalidation tags */
	invalidationTags?: string[];

	/** Optional cache namespace to invalidate */
	invalidationNamespace?: CacheNamespace;

	/** Promise resolve callback */
	resolve: (value: void | PromiseLike<void>) => void;

	/** Promise reject callback */
	reject: (reason?: any) => void;
}

/**
 * Result of a batch flush operation
 */
export interface FlushResult {
	/** Number of operations successfully written */
	successCount: number;

	/** Number of operations that failed */
	failureCount: number;

	/** Number of operations re-queued for retry */
	requeuedCount: number;

	/** File paths that were written */
	filesWritten: string[];

	/** Errors encountered during flush */
	errors: Array<{ operation: WriteOperation; error: Error }>;
}

/**
 * Metrics for write queue monitoring
 */
export interface WriteQueueMetrics {
	/** Total operations queued since start */
	totalQueued: number;

	/** Total operations successfully flushed */
	totalFlushed: number;

	/** Total operations failed */
	totalFailed: number;

	/** Current queue size */
	currentQueueSize: number;

	/** Number of batch flushes executed */
	flushCount: number;

	/** Average batch size */
	averageBatchSize: number;

	/** Average time in queue (ms) */
	averageQueueTime: number;

	/** Per-file metrics */
	fileMetrics: Map<
		string,
		{
			queued: number;
			flushed: number;
			failed: number;
			lastFlushTime?: number;
		}
	>;
}

/**
 * Configuration for write queue behavior
 */
export interface WriteQueueConfig {
	/** Maximum time before auto-flush (ms) */
	maxWaitTime: number;

	/** Maximum queue size before auto-flush */
	maxBatchSize: number;

	/** Maximum retries for failed writes */
	maxRetries: number;

	/** Enable/disable metrics collection */
	enableMetrics: boolean;

	/** Enable/disable auto-flush timers */
	enableAutoFlush: boolean;
}

/**
 * Abstract interface for write queue strategies
 */
export interface IWriteQueueStrategy {
	/**
	 * Queue a write operation
	 * @returns Promise that resolves when operation is flushed
	 */
	enqueue(
		operation: Omit<
			WriteOperation,
			'id' | 'queuedAt' | 'retryCount' | 'resolve' | 'reject'
		>
	): Promise<void>;

	/**
	 * Flush all queued operations
	 * @returns Result of flush operation
	 */
	flush(): Promise<FlushResult>;

	/**
	 * Get current queue metrics
	 */
	getMetrics(): WriteQueueMetrics;

	/**
	 * Clear all queued operations (for testing/cleanup)
	 */
	clear(): void;

	/**
	 * Shutdown queue and flush remaining operations
	 */
	shutdown(): Promise<FlushResult>;
}
