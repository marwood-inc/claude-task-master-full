/**
 * @fileoverview Write queue manager providing high-level write queue operations
 */

import type {
	IWriteQueueStrategy,
	FlushResult,
	WriteQueueMetrics,
	WriteQueueConfig
} from './types.js';
import { HybridWriteQueueStrategy } from './strategies/hybrid-write-queue-strategy.js';
import type { CacheManager } from '../cache/cache-manager.js';
import type { CacheNamespace } from '../cache/index.js';

/**
 * Options for WriteQueueManager initialization
 */
export interface WriteQueueManagerOptions {
	/** Custom strategy implementation (defaults to HybridWriteQueueStrategy) */
	strategy?: IWriteQueueStrategy;
	/** Cache manager for cache invalidation */
	cacheManager?: CacheManager;
	/** Write queue configuration */
	config?: Partial<WriteQueueConfig>;
}

/**
 * High-level facade for write queue operations
 *
 * Provides:
 * - Convenient write API
 * - Metrics monitoring
 * - Event hooks for observability
 * - Explicit flush control
 *
 * @example
 * ```typescript
 * const queueManager = new WriteQueueManager({
 *   cacheManager,
 *   config: { maxWaitTime: 200 }
 * });
 *
 * await queueManager.write('/path/to/file.json', data, {
 *   invalidationTags: ['master']
 * });
 *
 * const metrics = queueManager.getMetrics();
 * console.log(`Queue efficiency: ${metrics.averageBatchSize} writes/batch`);
 * ```
 */
export class WriteQueueManager {
	private readonly strategy: IWriteQueueStrategy;

	constructor(options: WriteQueueManagerOptions = {}) {
		this.strategy =
			options.strategy ||
			new HybridWriteQueueStrategy(
				{
					maxWaitTime: options.config?.maxWaitTime ?? 150,
					maxBatchSize: options.config?.maxBatchSize ?? 10,
					maxRetries: options.config?.maxRetries ?? 3,
					enableMetrics: options.config?.enableMetrics ?? true,
					enableAutoFlush: options.config?.enableAutoFlush ?? true
				},
				options.cacheManager
			);
	}

	/**
	 * Queue a write operation
	 *
	 * @param filePath - Absolute path to file
	 * @param data - Data to write
	 * @param options - Cache invalidation options
	 * @returns Promise that resolves when write completes
	 */
	async write(
		filePath: string,
		data: string,
		options?: {
			invalidationTags?: string[];
			invalidationNamespace?: CacheNamespace;
		}
	): Promise<void> {
		return this.strategy.enqueue({
			filePath,
			data,
			invalidationTags: options?.invalidationTags,
			invalidationNamespace: options?.invalidationNamespace
		});
	}

	/**
	 * Explicitly flush all queued writes
	 *
	 * Useful for:
	 * - Critical operations requiring immediate persistence
	 * - End of request/transaction boundaries
	 * - Testing scenarios
	 *
	 * @returns Result of flush operation
	 */
	async flushQueue(): Promise<FlushResult> {
		return this.strategy.flush();
	}

	/**
	 * Get current queue metrics
	 *
	 * Provides insights into:
	 * - Queue efficiency (batch sizes)
	 * - Performance (queue times)
	 * - Reliability (failure rates)
	 * - Per-file statistics
	 */
	getMetrics(): WriteQueueMetrics {
		return this.strategy.getMetrics();
	}

	/**
	 * Shutdown queue and flush remaining operations
	 *
	 * Should be called on application shutdown to ensure
	 * all queued writes are persisted
	 */
	async shutdown(): Promise<FlushResult> {
		return this.strategy.shutdown();
	}

	/**
	 * Clear queue (for testing)
	 */
	clear(): void {
		this.strategy.clear();
	}
}
