/**
 * @fileoverview LRU cache strategy with namespace support and metrics
 */

import { LRUCache } from 'lru-cache';
import type {
	ICacheStrategy,
	CacheEntryOptions,
	CacheMetrics,
	InvalidationScope,
	NamespaceMetrics
} from '../interfaces/cache-strategy.interface.js';
import { CACHE_MISS, type CacheResult } from '../cache-sentinel.js';
import { CacheKeyBuilder } from '../cache-namespace.js';
import { getLogger } from '../../logger/index.js';

/**
 * Extended cache entry with metadata
 */
interface ExtendedCacheEntry<V> {
	value: V;
	timestamp: number;
	namespace?: string;
	tags?: string[];
	size: number;
}

/**
 * Configuration for LRU cache strategy
 */
export interface LRUCacheStrategyConfig {
	/** Maximum number of cache entries */
	maxEntries: number;
	/** Default TTL in milliseconds */
	ttl: number;
	/** Whether to update age on get operations */
	updateAgeOnGet?: boolean;
	/** Whether to update age on has operations */
	updateAgeOnHas?: boolean;
	/** Maximum memory usage in bytes (0 = unlimited) */
	maxMemory?: number;
	/** Enable detailed metrics tracking */
	enableMetrics?: boolean;
}

/**
 * LRU cache strategy implementation with comprehensive metrics and selective invalidation
 */
export class LRUCacheStrategy<V = any> implements ICacheStrategy<string, V> {
	private cache: LRUCache<string, ExtendedCacheEntry<V>>;
	private logger = getLogger('LRUCacheStrategy');

	// Metrics tracking
	private metrics = {
		hits: 0,
		misses: 0,
		evictions: 0,
		namespaceMetrics: new Map<string, NamespaceMetrics>()
	};

	private config: Required<LRUCacheStrategyConfig>;

	constructor(config: LRUCacheStrategyConfig) {
		this.config = {
			updateAgeOnGet: false,
			updateAgeOnHas: false,
			maxMemory: 0,
			enableMetrics: true,
			...config
		};

		this.cache = new LRUCache<string, ExtendedCacheEntry<V>>({
			max: this.config.maxEntries,
			ttl: this.config.ttl,
			updateAgeOnGet: this.config.updateAgeOnGet,
			updateAgeOnHas: this.config.updateAgeOnHas,
			// LRU eviction callback for metrics
			dispose: (value, key) => {
				this.metrics.evictions++;
				this.trackNamespaceEviction(value.namespace);
				this.logger.debug(`Evicted cache entry: ${key}`);
			}
		});
	}

	get(key: string): CacheResult<V> {
		const entry = this.cache.get(key);

		if (entry !== undefined) {
			if (this.config.enableMetrics) {
				this.metrics.hits++;
				this.trackNamespaceHit(entry.namespace);
			}
			this.logger.debug(`Cache hit: ${key}`);
			return entry.value;
		}

		if (this.config.enableMetrics) {
			this.metrics.misses++;
			this.trackNamespaceMiss(this.extractNamespace(key));
		}
		this.logger.debug(`Cache miss: ${key}`);
		return CACHE_MISS;
	}

	set(key: string, value: V, options?: CacheEntryOptions): void {
		const size = this.estimateSize(value);
		const namespace = options?.namespace || this.extractNamespace(key);

		// Memory-based eviction check
		if (this.config.maxMemory > 0) {
			const currentMemory = this.estimateMemory();
			if (currentMemory + size > this.config.maxMemory) {
				this.evictByMemory(size);
			}
		}

		const entry: ExtendedCacheEntry<V> = {
			value,
			timestamp: Date.now(),
			namespace,
			tags: options?.tags,
			size
		};

		// Use custom TTL if provided
		if (options?.ttl !== undefined) {
			this.cache.set(key, entry, { ttl: options.ttl });
		} else {
			this.cache.set(key, entry);
		}

		this.trackNamespaceSize(namespace, 1);
		this.logger.debug(
			`Cache set: ${key} (namespace: ${namespace}, size: ${size} bytes)`
		);
	}

	has(key: string): boolean {
		return this.cache.has(key);
	}

	delete(key: string): boolean {
		const entry = this.cache.get(key);
		const deleted = this.cache.delete(key);

		if (deleted && entry) {
			this.trackNamespaceSize(entry.namespace, -1);
		}

		return deleted;
	}

	invalidate(scope: InvalidationScope): number {
		let invalidatedCount = 0;

		if (scope.all) {
			invalidatedCount = this.cache.size;
			this.clear();
			return invalidatedCount;
		}

		const keysToDelete: string[] = [];

		for (const [key, entry] of this.cache.entries()) {
			let shouldDelete = false;

			// Namespace-based invalidation
			if (scope.namespace && entry.namespace === scope.namespace) {
				shouldDelete = true;
			}

			// Tag-based invalidation
			if (scope.tag && entry.tags?.includes(scope.tag)) {
				shouldDelete = true;
			}

			// Pattern-based invalidation
			if (scope.pattern && key.includes(scope.pattern)) {
				shouldDelete = true;
			}

			if (shouldDelete) {
				keysToDelete.push(key);
			}
		}

		keysToDelete.forEach((key) => this.delete(key));
		invalidatedCount = keysToDelete.length;

		if (invalidatedCount > 0) {
			this.logger.debug(
				`Invalidated ${invalidatedCount} cache entries`,
				scope
			);
		}

		return invalidatedCount;
	}

	clear(): void {
		this.cache.clear();
		this.metrics.namespaceMetrics.clear();
		this.logger.debug('Cache cleared');
	}

	getMetrics(): CacheMetrics {
		const total = this.metrics.hits + this.metrics.misses;
		const hitRate = total > 0 ? this.metrics.hits / total : 0;

		return {
			hits: this.metrics.hits,
			misses: this.metrics.misses,
			hitRate,
			size: this.cache.size,
			maxSize: this.config.maxEntries,
			evictions: this.metrics.evictions,
			memoryUsage: this.estimateMemory(),
			namespaceMetrics: new Map(this.metrics.namespaceMetrics)
		};
	}

	estimateMemory(): number {
		let total = 0;
		for (const entry of this.cache.values()) {
			total += entry.size;
		}
		return total;
	}

	/**
	 * Evict entries to free up memory
	 */
	private evictByMemory(requiredBytes: number): void {
		let freedBytes = 0;
		const entries = Array.from(this.cache.entries()).sort(
			(a, b) => a[1].timestamp - b[1].timestamp
		); // Oldest first

		for (const [key, entry] of entries) {
			if (freedBytes >= requiredBytes) break;
			this.cache.delete(key);
			freedBytes += entry.size;
			this.metrics.evictions++;
		}

		this.logger.debug(
			`Evicted ${freedBytes} bytes to accommodate new entry`
		);
	}

	/**
	 * Estimate size of a value in bytes
	 */
	private estimateSize(value: V): number {
		try {
			return JSON.stringify(value).length * 2; // UTF-16 encoding
		} catch {
			return 1000; // Fallback estimate
		}
	}

	/**
	 * Extract namespace from cache key
	 */
	private extractNamespace(key: string): string {
		try {
			const parsed = CacheKeyBuilder.parse(key);
			return parsed.namespace;
		} catch {
			return 'unknown';
		}
	}

	// Namespace metrics tracking methods
	private trackNamespaceHit(namespace?: string): void {
		if (!namespace) return;
		const metrics = this.getOrCreateNamespaceMetrics(namespace);
		metrics.hits++;
	}

	private trackNamespaceMiss(namespace?: string): void {
		if (!namespace) return;
		const metrics = this.getOrCreateNamespaceMetrics(namespace);
		metrics.misses++;
	}

	private trackNamespaceSize(namespace?: string, delta: number = 1): void {
		if (!namespace) return;
		const metrics = this.getOrCreateNamespaceMetrics(namespace);
		metrics.size += delta;
	}

	private trackNamespaceEviction(namespace?: string): void {
		if (!namespace) return;
		const metrics = this.getOrCreateNamespaceMetrics(namespace);
		metrics.evictions++;
		metrics.size = Math.max(0, metrics.size - 1);
	}

	private getOrCreateNamespaceMetrics(namespace: string): NamespaceMetrics {
		if (!this.metrics.namespaceMetrics.has(namespace)) {
			this.metrics.namespaceMetrics.set(namespace, {
				hits: 0,
				misses: 0,
				size: 0,
				evictions: 0
			});
		}
		return this.metrics.namespaceMetrics.get(namespace)!;
	}
}
