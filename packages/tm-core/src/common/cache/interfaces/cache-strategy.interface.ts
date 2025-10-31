/**
 * @fileoverview Cache strategy interface for pluggable cache backends
 */

import type { CacheResult } from '../cache-sentinel.js';

/**
 * Cache invalidation scope options
 */
export interface InvalidationScope {
	/** Invalidate specific namespace */
	namespace?: string;
	/** Invalidate specific tag */
	tag?: string;
	/** Invalidate keys matching pattern */
	pattern?: string;
	/** Invalidate all cache entries */
	all?: boolean;
}

/**
 * Metrics for a specific namespace
 */
export interface NamespaceMetrics {
	hits: number;
	misses: number;
	size: number;
	evictions: number;
}

/**
 * Cache metrics data
 */
export interface CacheMetrics {
	/** Total cache hits */
	hits: number;
	/** Total cache misses */
	misses: number;
	/** Cache hit rate (0-1) */
	hitRate: number;
	/** Current cache size (number of entries) */
	size: number;
	/** Maximum cache capacity */
	maxSize: number;
	/** Total evictions performed */
	evictions: number;
	/** Estimated memory usage in bytes */
	memoryUsage: number;
	/** Namespace-specific metrics */
	namespaceMetrics?: Map<string, NamespaceMetrics>;
}

/**
 * Cache entry options
 */
export interface CacheEntryOptions {
	/** Time-to-live in milliseconds */
	ttl?: number;
	/** Tags for selective invalidation */
	tags?: string[];
	/** Namespace for key isolation */
	namespace?: string;
}

/**
 * Abstract cache strategy interface
 * Defines the contract for all cache implementations
 */
export interface ICacheStrategy<K = string, V = any> {
	/**
	 * Get value from cache
	 * @returns CacheResult<V> - Value or CACHE_MISS sentinel
	 */
	get(key: K): CacheResult<V>;

	/**
	 * Set value in cache
	 */
	set(key: K, value: V, options?: CacheEntryOptions): void;

	/**
	 * Check if key exists in cache (without affecting LRU order)
	 */
	has(key: K): boolean;

	/**
	 * Delete specific key
	 */
	delete(key: K): boolean;

	/**
	 * Invalidate cache entries based on scope
	 */
	invalidate(scope: InvalidationScope): number;

	/**
	 * Clear all cache entries
	 */
	clear(): void;

	/**
	 * Get current cache metrics
	 */
	getMetrics(): CacheMetrics;

	/**
	 * Estimate memory usage in bytes
	 */
	estimateMemory(): number;
}
