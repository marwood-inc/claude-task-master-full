/**
 * @fileoverview Cache manager providing high-level cache operations
 */

import type {
	ICacheStrategy,
	CacheMetrics,
	InvalidationScope
} from './interfaces/cache-strategy.interface.js';
import type { CacheResult } from './cache-sentinel.js';
import { CACHE_MISS } from './cache-sentinel.js';
import { getLogger } from '../logger/index.js';

/**
 * Cache manager configuration
 */
export interface CacheManagerConfig {
	/** Cache strategy implementation */
	strategy: ICacheStrategy;
	/** Enable monitoring hooks */
	enableMonitoring?: boolean;
}

/**
 * Cache event for monitoring
 */
export interface CacheEvent {
	type: 'hit' | 'miss' | 'set' | 'invalidate' | 'clear';
	key?: string;
	scope?: InvalidationScope;
	timestamp: number;
	metadata?: Record<string, any>;
}

/**
 * Monitoring hook for cache operations
 */
export type CacheMonitoringHook = (event: CacheEvent) => void;

/**
 * Cache manager - provides unified cache access with monitoring
 */
export class CacheManager {
	private strategy: ICacheStrategy;
	private monitoringHooks: CacheMonitoringHook[] = [];
	private logger = getLogger('CacheManager');
	private config: Required<CacheManagerConfig>;

	constructor(config: CacheManagerConfig) {
		this.config = {
			enableMonitoring: false,
			...config
		};
		this.strategy = config.strategy;
	}

	/**
	 * Get value from cache
	 */
	get<V>(key: string): CacheResult<V> {
		const result = this.strategy.get(key);

		if (this.config.enableMonitoring) {
			this.emitEvent({
				type: result === CACHE_MISS ? 'miss' : 'hit',
				key,
				timestamp: Date.now()
			});
		}

		return result as CacheResult<V>;
	}

	/**
	 * Set value in cache
	 */
	set<V>(key: string, value: V, options?: any): void {
		this.strategy.set(key, value, options);

		if (this.config.enableMonitoring) {
			this.emitEvent({
				type: 'set',
				key,
				timestamp: Date.now()
			});
		}
	}

	/**
	 * Check if key exists
	 */
	has(key: string): boolean {
		return this.strategy.has(key);
	}

	/**
	 * Delete specific key
	 */
	delete(key: string): boolean {
		return this.strategy.delete(key);
	}

	/**
	 * Invalidate cache entries
	 */
	invalidate(scope: InvalidationScope): number {
		const count = this.strategy.invalidate(scope);

		if (this.config.enableMonitoring) {
			this.emitEvent({
				type: 'invalidate',
				scope,
				timestamp: Date.now(),
				metadata: { count }
			});
		}

		return count;
	}

	/**
	 * Invalidate by namespace
	 */
	invalidateNamespace(namespace: string): number {
		return this.invalidate({ namespace });
	}

	/**
	 * Invalidate by tag
	 */
	invalidateTag(tag: string): number {
		return this.invalidate({ tag });
	}

	/**
	 * Invalidate by pattern
	 */
	invalidatePattern(pattern: string): number {
		return this.invalidate({ pattern });
	}

	/**
	 * Clear all cache
	 */
	clear(): void {
		this.strategy.clear();

		if (this.config.enableMonitoring) {
			this.emitEvent({
				type: 'clear',
				timestamp: Date.now()
			});
		}
	}

	/**
	 * Get cache metrics
	 */
	getMetrics(): CacheMetrics {
		return this.strategy.getMetrics();
	}

	/**
	 * Add monitoring hook
	 */
	addMonitoringHook(hook: CacheMonitoringHook): void {
		this.monitoringHooks.push(hook);
	}

	/**
	 * Remove monitoring hook
	 */
	removeMonitoringHook(hook: CacheMonitoringHook): void {
		const index = this.monitoringHooks.indexOf(hook);
		if (index !== -1) {
			this.monitoringHooks.splice(index, 1);
		}
	}

	/**
	 * Emit monitoring event
	 */
	private emitEvent(event: CacheEvent): void {
		for (const hook of this.monitoringHooks) {
			try {
				hook(event);
			} catch (error) {
				this.logger.warn('Monitoring hook error:', error);
			}
		}
	}
}
