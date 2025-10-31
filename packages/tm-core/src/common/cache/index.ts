/**
 * @fileoverview Cache utilities barrel export
 *
 * Central export point for all cache-related utilities including:
 * - Cache sentinel value pattern for unambiguous cache miss detection
 * - Cache namespace system for collision-free key management
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
