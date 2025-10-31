/**
 * @fileoverview Cache utilities barrel export
 *
 * Central export point for all cache-related utilities including:
 * - Cache sentinel value pattern for unambiguous cache miss detection
 * - Cache namespace system for collision-free key management
 * - Cache strategy interfaces and implementations
 * - Cache manager for high-level operations
 */

// Cache sentinel exports
export {
	CACHE_MISS,
	isCacheMiss,
	isCacheHit,
	type CacheMiss,
	type CacheResult
} from './cache-sentinel.js';

// Cache namespace exports
export {
	CacheNamespace,
	CacheKeyBuilder,
	NAMESPACE_DELIMITER,
	type ParsedCacheKey
} from './cache-namespace.js';

// Cache strategy interface exports
export type {
	ICacheStrategy,
	CacheMetrics,
	CacheEntryOptions,
	InvalidationScope,
	NamespaceMetrics
} from './interfaces/cache-strategy.interface.js';

// Cache manager exports
export {
	CacheManager,
	type CacheManagerConfig,
	type CacheEvent,
	type CacheMonitoringHook
} from './cache-manager.js';

// Cache strategy exports
export { LRUCacheStrategy, type LRUCacheStrategyConfig } from './strategies/index.js';
