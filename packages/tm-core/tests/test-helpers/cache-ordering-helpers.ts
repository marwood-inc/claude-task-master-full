/**
 * @fileoverview Helper utilities for validating LRU cache ordering and eviction behavior
 */

import type { LRUCache } from 'lru-cache';

/**
 * Represents a cache operation for tracking
 */
export interface CacheOperation {
	type: 'get' | 'set' | 'delete';
	key: string;
	timestamp: number;
}

/**
 * Tracks cache access order without modifying cache internals
 */
export class CacheAccessTracker {
	private accessLog: Map<string, number> = new Map();

	/**
	 * Record a cache access
	 */
	recordAccess(key: string, timestamp: number = Date.now()): void {
		this.accessLog.set(key, timestamp);
	}

	/**
	 * Get the least recently accessed key
	 */
	getLeastRecentlyAccessed(): string | null {
		if (this.accessLog.size === 0) return null;

		let oldestKey: string | null = null;
		let oldestTime = Infinity;

		for (const [key, timestamp] of this.accessLog.entries()) {
			if (timestamp < oldestTime) {
				oldestTime = timestamp;
				oldestKey = key;
			}
		}

		return oldestKey;
	}

	/**
	 * Get all keys sorted by access time (oldest first)
	 */
	getKeysByAccessOrder(): string[] {
		return Array.from(this.accessLog.entries())
			.sort(([, a], [, b]) => a - b)
			.map(([key]) => key);
	}

	/**
	 * Remove a key from tracking
	 */
	remove(key: string): void {
		this.accessLog.delete(key);
	}

	/**
	 * Clear all tracked accesses
	 */
	clear(): void {
		this.accessLog.clear();
	}

	/**
	 * Get the number of tracked keys
	 */
	get size(): number {
		return this.accessLog.size;
	}
}

/**
 * Validates that cache eviction follows LRU policy
 */
export function validateLRUEviction(
	evictedKey: string,
	tracker: CacheAccessTracker
): boolean {
	const leastRecentlyAccessed = tracker.getLeastRecentlyAccessed();
	return leastRecentlyAccessed === evictedKey;
}

/**
 * Creates a memory constraint validator for cache size
 */
export function createMemoryValidator(maxSize: number) {
	return {
		/**
		 * Validates that cache size doesn't exceed maximum
		 */
		validateSize(cache: LRUCache<string, any>): boolean {
			return cache.size <= maxSize;
		},

		/**
		 * Gets current cache size
		 */
		getCurrentSize(cache: LRUCache<string, any>): number {
			return cache.size;
		},

		/**
		 * Validates and throws if size exceeded
		 */
		assertSize(cache: LRUCache<string, any>): void {
			if (cache.size > maxSize) {
				throw new Error(
					`Cache size ${cache.size} exceeds maximum ${maxSize}`
				);
			}
		}
	};
}

/**
 * Tracks a sequence of cache operations
 */
export function trackCacheOperations(operations: CacheOperation[]): {
	accessOrder: string[];
	operationCount: number;
	uniqueKeys: Set<string>;
} {
	const tracker = new CacheAccessTracker();
	const uniqueKeys = new Set<string>();

	for (const op of operations) {
		if (op.type === 'get' || op.type === 'set') {
			tracker.recordAccess(op.key, op.timestamp);
			uniqueKeys.add(op.key);
		} else if (op.type === 'delete') {
			tracker.remove(op.key);
		}
	}

	return {
		accessOrder: tracker.getKeysByAccessOrder(),
		operationCount: operations.length,
		uniqueKeys
	};
}

/**
 * Verifies that LRU ordering is maintained across operations
 */
export function verifyLRUOrdering(
	cache: LRUCache<string, any>,
	expectedOrder: string[]
): boolean {
	const actualKeys = Array.from(cache.keys());

	// If cache has evicted entries, we only check that remaining entries
	// maintain their relative order
	if (actualKeys.length < expectedOrder.length) {
		// Find which keys from expected order are still in cache
		const remainingExpected = expectedOrder.filter((key) =>
			actualKeys.includes(key)
		);
		return JSON.stringify(actualKeys) === JSON.stringify(remainingExpected);
	}

	return JSON.stringify(actualKeys) === JSON.stringify(expectedOrder);
}

/**
 * Helper to create a sequence of cache operations for testing
 */
export function createCacheAccessSequence(
	keys: string[],
	baseTimestamp: number = Date.now()
): CacheOperation[] {
	return keys.map((key, index) => ({
		type: 'set' as const,
		key,
		timestamp: baseTimestamp + index * 100
	}));
}
