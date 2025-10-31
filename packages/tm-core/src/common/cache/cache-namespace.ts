/**
 * @fileoverview Cache namespace system for collision-free cache key management
 *
 * This module provides a formal namespace system to prevent cache key collisions
 * across different domains (storage, tasks, complexity reports, etc.).
 *
 * Format: <namespace>:<identifier>:<optional-tag>
 * Example: "storage:master:{"status":"pending"}"
 */

/**
 * Cache namespace enum defining isolated cache domains
 *
 * Each namespace represents a distinct cache domain with its own key space,
 * preventing collisions between different types of cached data.
 */
export enum CacheNamespace {
	/**
	 * Storage-level cache (full task lists with filters)
	 */
	Storage = 'storage',

	/**
	 * Individual task cache (single task lookups)
	 */
	Task = 'task',

	/**
	 * Complexity report cache
	 */
	Complexity = 'complexity',

	/**
	 * Metadata cache (tags, task counts, etc.)
	 */
	Metadata = 'metadata'
}

/**
 * Delimiter used to separate namespace components
 * Using ':' for clarity and compatibility with most systems
 */
export const NAMESPACE_DELIMITER = ':';

/**
 * Parsed cache key structure
 */
export interface ParsedCacheKey {
	/**
	 * The namespace domain
	 */
	namespace: string;

	/**
	 * The primary identifier (e.g., tag, task ID)
	 */
	identifier: string;

	/**
	 * Optional tag or additional qualifier
	 */
	tag?: string;
}

/**
 * Cache key builder utility for creating and parsing namespaced cache keys
 *
 * Provides type-safe cache key generation with consistent formatting
 * and collision prevention across different cache domains.
 */
export class CacheKeyBuilder {
	/**
	 * Build a namespaced cache key
	 *
	 * @param namespace - The cache namespace domain
	 * @param identifier - Primary identifier (tag, task ID, etc.)
	 * @param tag - Optional additional qualifier
	 * @returns Formatted cache key with namespace
	 *
	 * @example
	 * ```typescript
	 * // Storage cache with filter options
	 * const key = CacheKeyBuilder.build(
	 *   CacheNamespace.Storage,
	 *   'master',
	 *   '{"status":"pending"}'
	 * );
	 * // Result: "storage:master:{"status":"pending"}"
	 *
	 * // Single task cache
	 * const taskKey = CacheKeyBuilder.build(
	 *   CacheNamespace.Task,
	 *   '1.2',
	 *   'master'
	 * );
	 * // Result: "task:1.2:master"
	 * ```
	 */
	static build(
		namespace: CacheNamespace,
		identifier: string,
		tag?: string
	): string {
		const parts = [namespace, identifier];

		if (tag !== undefined && tag !== null && tag !== '') {
			parts.push(tag);
		}

		return parts.join(NAMESPACE_DELIMITER);
	}

	/**
	 * Parse a cache key into its components
	 *
	 * @param key - The cache key to parse
	 * @returns Parsed cache key structure
	 *
	 * @example
	 * ```typescript
	 * const parsed = CacheKeyBuilder.parse('storage:master:{"status":"done"}');
	 * console.log(parsed);
	 * // {
	 * //   namespace: 'storage',
	 * //   identifier: 'master',
	 * //   tag: '{"status":"done"}'
	 * // }
	 * ```
	 */
	static parse(key: string): ParsedCacheKey {
		const parts = key.split(NAMESPACE_DELIMITER);

		if (parts.length < 2) {
			throw new Error(
				`Invalid cache key format: ${key}. Expected format: <namespace>:<identifier>[:<tag>]`
			);
		}

		const [namespace, identifier, ...rest] = parts;
		const tag = rest.length > 0 ? rest.join(NAMESPACE_DELIMITER) : undefined;

		return {
			namespace,
			identifier,
			tag
		};
	}

	/**
	 * Check if a cache key belongs to a specific namespace
	 *
	 * @param key - The cache key to check
	 * @param namespace - The namespace to match
	 * @returns true if the key belongs to the namespace
	 *
	 * @example
	 * ```typescript
	 * const key = 'storage:master:{}';
	 * CacheKeyBuilder.isInNamespace(key, CacheNamespace.Storage); // true
	 * CacheKeyBuilder.isInNamespace(key, CacheNamespace.Task); // false
	 * ```
	 */
	static isInNamespace(key: string, namespace: CacheNamespace): boolean {
		return key.startsWith(`${namespace}${NAMESPACE_DELIMITER}`);
	}

	/**
	 * Get all keys in a namespace from a list of keys
	 *
	 * @param keys - Array of cache keys
	 * @param namespace - The namespace to filter by
	 * @returns Array of keys in the specified namespace
	 *
	 * @example
	 * ```typescript
	 * const keys = ['storage:master:{}', 'task:1:master', 'storage:dev:{}'];
	 * const storageKeys = CacheKeyBuilder.getKeysInNamespace(
	 *   keys,
	 *   CacheNamespace.Storage
	 * );
	 * // Result: ['storage:master:{}', 'storage:dev:{}']
	 * ```
	 */
	static getKeysInNamespace(
		keys: string[],
		namespace: CacheNamespace
	): string[] {
		return keys.filter((key) => this.isInNamespace(key, namespace));
	}
}
