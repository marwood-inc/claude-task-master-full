/**
 * @fileoverview Cache sentinel value pattern for unambiguous cache miss detection
 *
 * This module provides a type-safe mechanism to distinguish between:
 * - Cache miss (value not in cache)
 * - Cached falsy values (null, empty string, empty array, false, 0)
 *
 * Using a global Symbol ensures cross-realm compatibility and type safety.
 */

/**
 * Global cache miss sentinel value
 *
 * Using Symbol.for() ensures the symbol is registered in the global symbol registry,
 * making it consistent across different module realms and hot reloads.
 *
 * @example
 * ```typescript
 * const result = cache.get('key');
 * if (result === CACHE_MISS) {
 *   // Cache miss - fetch fresh data
 * } else {
 *   // Cache hit - result may be null, [], "", 0, false, etc.
 *   return result;
 * }
 * ```
 */
export const CACHE_MISS = Symbol.for('tm-cache-miss');

/**
 * Type representing the cache miss sentinel value
 */
export type CacheMiss = typeof CACHE_MISS;

/**
 * Type representing a cache result that may be a hit or miss
 *
 * @template T - The expected type of the cached value
 */
export type CacheResult<T> = T | CacheMiss;

/**
 * Type guard to check if a cache result is a cache miss
 *
 * @param value - The cache result to check
 * @returns true if the value is a cache miss, false otherwise
 *
 * @example
 * ```typescript
 * const result = cache.get('key');
 * if (isCacheMiss(result)) {
 *   console.log('Cache miss - need to fetch');
 * } else {
 *   // TypeScript knows result is T here
 *   console.log('Cache hit:', result);
 * }
 * ```
 */
export function isCacheMiss<T>(value: CacheResult<T>): value is CacheMiss {
	return value === CACHE_MISS;
}

/**
 * Type guard to check if a cache result is a cache hit
 *
 * @param value - The cache result to check
 * @returns true if the value is a cache hit, false otherwise
 *
 * @example
 * ```typescript
 * const result = cache.get('key');
 * if (isCacheHit(result)) {
 *   // TypeScript knows result is T here
 *   console.log('Got cached value:', result);
 * }
 * ```
 */
export function isCacheHit<T>(value: CacheResult<T>): value is T {
	return value !== CACHE_MISS;
}
