/**
 * @fileoverview Unit tests for LRUCacheStrategy
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LRUCacheStrategy } from './lru-cache-strategy.js';
import { CACHE_MISS, isCacheMiss } from '../cache-sentinel.js';
import { CacheNamespace } from '../cache-namespace.js';

describe('LRUCacheStrategy', () => {
	let cache: LRUCacheStrategy<string>;

	beforeEach(() => {
		cache = new LRUCacheStrategy<string>({
			maxEntries: 10,
			ttl: 5000,
			updateAgeOnGet: false,
			updateAgeOnHas: false,
			maxMemory: 1024 * 1024, // 1MB for tests
			enableMetrics: true
		});
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('Basic Operations', () => {
		it('should return CACHE_MISS for non-existent keys', () => {
			const result = cache.get('non-existent');
			expect(isCacheMiss(result)).toBe(true);
			expect(result).toBe(CACHE_MISS);
		});

		it('should store and retrieve values', () => {
			cache.set('key1', 'value1');
			const result = cache.get('key1');

			expect(isCacheMiss(result)).toBe(false);
			expect(result).toBe('value1');
		});

		it('should respect TTL expiration with fake timers', () => {
			cache.set('key1', 'value1'); // TTL = 5000ms

			// Immediately after set - should exist
			expect(isCacheMiss(cache.get('key1'))).toBe(false);

			// Fast-forward just before expiration
			vi.advanceTimersByTime(4999);
			expect(isCacheMiss(cache.get('key1'))).toBe(false);

			// Fast-forward past expiration
			vi.advanceTimersByTime(2);
			expect(isCacheMiss(cache.get('key1'))).toBe(true);
		});

		it('should delete entries', () => {
			cache.set('key1', 'value1');
			expect(cache.has('key1')).toBe(true);

			const deleted = cache.delete('key1');
			expect(deleted).toBe(true);
			expect(cache.has('key1')).toBe(false);
		});

		it('should check if key exists', () => {
			expect(cache.has('key1')).toBe(false);

			cache.set('key1', 'value1');
			expect(cache.has('key1')).toBe(true);
		});

		it('should handle custom TTL per entry', () => {
			cache.set('short-lived', 'value1', { ttl: 1000 }); // 1 second
			cache.set('long-lived', 'value2', { ttl: 10000 }); // 10 seconds

			// Both exist initially
			expect(isCacheMiss(cache.get('short-lived'))).toBe(false);
			expect(isCacheMiss(cache.get('long-lived'))).toBe(false);

			// After 1.5 seconds - short-lived expires
			vi.advanceTimersByTime(1500);
			expect(isCacheMiss(cache.get('short-lived'))).toBe(true);
			expect(isCacheMiss(cache.get('long-lived'))).toBe(false);
		});
	});

	describe('LRU Eviction', () => {
		it('should evict least recently used when max entries reached', () => {
			// Fill cache to capacity (maxEntries = 10)
			for (let i = 0; i < 10; i++) {
				cache.set(`key${i}`, `value${i}`);
			}

			expect(cache.has('key0')).toBe(true);

			// Add 11th entry - should evict key0 (oldest)
			cache.set('key10', 'value10');

			expect(cache.has('key0')).toBe(false);
			expect(cache.has('key10')).toBe(true);
		});

		it('should maintain LRU order', () => {
			// Add 10 entries
			for (let i = 0; i < 10; i++) {
				cache.set(`key${i}`, `value${i}`);
			}

			// Access key0 (makes it most recently used)
			cache.get('key0');

			// Add new entry - should evict key1 (now oldest)
			cache.set('key10', 'value10');

			expect(cache.has('key0')).toBe(true); // Still exists (was accessed)
			expect(cache.has('key1')).toBe(false); // Evicted (oldest)
		});

		it('should not evict entries within capacity', () => {
			cache.set('key1', 'value1');
			cache.set('key2', 'value2');
			cache.set('key3', 'value3');

			const metrics = cache.getMetrics();
			expect(metrics.evictions).toBe(0);
			expect(metrics.size).toBe(3);
		});
	});

	describe('Memory-Based Eviction', () => {
		beforeEach(() => {
			// Create cache with small memory limit
			cache = new LRUCacheStrategy<string>({
				maxEntries: 100, // High entry limit
				ttl: 5000,
				maxMemory: 500, // Only 500 bytes
				enableMetrics: true
			});
		});

		it('should evict when memory limit exceeded', () => {
			// Add entries until memory limit hit
			cache.set('key1', 'x'.repeat(100)); // ~200 bytes
			cache.set('key2', 'x'.repeat(100)); // ~200 bytes

			// Both should exist
			expect(cache.has('key1')).toBe(true);
			expect(cache.has('key2')).toBe(true);

			// Add large entry that exceeds limit
			cache.set('key3', 'x'.repeat(200)); // ~400 bytes

			// Should have evicted key1 (oldest)
			expect(cache.has('key1')).toBe(false);
		});

		it('should estimate memory usage accurately', () => {
			cache.set('small', 'abc'); // ~6 bytes
			const memoryAfterSmall = cache.estimateMemory();

			cache.set('large', 'x'.repeat(100)); // ~200 bytes
			const memoryAfterLarge = cache.estimateMemory();

			expect(memoryAfterLarge).toBeGreaterThan(memoryAfterSmall);
			expect(memoryAfterLarge).toBeGreaterThan(200);
		});

		it('should free enough memory for new entries', () => {
			// Fill with small entries
			for (let i = 0; i < 5; i++) {
				cache.set(`key${i}`, 'x'.repeat(50)); // ~100 bytes each
			}

			// Add large entry requiring eviction of multiple entries
			cache.set('large', 'x'.repeat(300)); // ~600 bytes

			// Should have freed enough space
			expect(cache.has('large')).toBe(true);
		});
	});

	describe('Selective Invalidation', () => {
		beforeEach(() => {
			// Populate cache with namespace/tag variants
			cache.set('task:1:master', 'task1', {
				namespace: CacheNamespace.Task,
				tags: ['master']
			});
			cache.set('task:2:master', 'task2', {
				namespace: CacheNamespace.Task,
				tags: ['master']
			});
			cache.set('task:3:dev', 'task3', {
				namespace: CacheNamespace.Task,
				tags: ['dev']
			});
			cache.set('storage:data:master', 'storage1', {
				namespace: CacheNamespace.Storage,
				tags: ['master']
			});
		});

		it('should invalidate by namespace', () => {
			const count = cache.invalidate({ namespace: CacheNamespace.Task });

			expect(count).toBe(3); // task:1, task:2, task:3
			expect(cache.has('task:1:master')).toBe(false);
			expect(cache.has('task:2:master')).toBe(false);
			expect(cache.has('task:3:dev')).toBe(false);
			expect(cache.has('storage:data:master')).toBe(true); // Different namespace
		});

		it('should invalidate by tag', () => {
			const count = cache.invalidate({ tag: 'master' });

			expect(count).toBe(3); // task:1, task:2, storage:data
			expect(cache.has('task:1:master')).toBe(false);
			expect(cache.has('task:2:master')).toBe(false);
			expect(cache.has('task:3:dev')).toBe(true); // Different tag
			expect(cache.has('storage:data:master')).toBe(false);
		});

		it('should invalidate by pattern', () => {
			const count = cache.invalidate({ pattern: 'task:' });

			expect(count).toBe(3); // All task: keys
			expect(cache.has('task:1:master')).toBe(false);
			expect(cache.has('task:2:master')).toBe(false);
			expect(cache.has('task:3:dev')).toBe(false);
			expect(cache.has('storage:data:master')).toBe(true);
		});

		it('should invalidate all with scope.all', () => {
			const count = cache.invalidate({ all: true });

			expect(count).toBe(4); // All entries
			expect(cache.has('task:1:master')).toBe(false);
			expect(cache.has('task:2:master')).toBe(false);
			expect(cache.has('task:3:dev')).toBe(false);
			expect(cache.has('storage:data:master')).toBe(false);
		});

		it('should return count of invalidated entries', () => {
			const count1 = cache.invalidate({ tag: 'master' });
			expect(count1).toBe(3);

			const count2 = cache.invalidate({ tag: 'master' }); // Already invalidated
			expect(count2).toBe(0);
		});

		it('should clear all entries', () => {
			cache.clear();

			expect(cache.has('task:1:master')).toBe(false);
			expect(cache.has('storage:data:master')).toBe(false);
			expect(cache.getMetrics().size).toBe(0);
		});
	});

	describe('Metrics', () => {
		it('should track hits and misses', () => {
			cache.set('key1', 'value1');

			// Hit
			cache.get('key1');
			cache.get('key1');

			// Miss
			cache.get('non-existent');
			cache.get('another-miss');

			const metrics = cache.getMetrics();
			expect(metrics.hits).toBe(2);
			expect(metrics.misses).toBe(2);
		});

		it('should calculate hit rate correctly', () => {
			cache.set('key1', 'value1');

			cache.get('key1'); // hit
			cache.get('key1'); // hit
			cache.get('miss1'); // miss
			cache.get('miss2'); // miss

			const metrics = cache.getMetrics();
			expect(metrics.hitRate).toBe(0.5); // 2 hits / 4 total
		});

		it('should track evictions', () => {
			// Fill to capacity
			for (let i = 0; i < 10; i++) {
				cache.set(`key${i}`, `value${i}`);
			}

			expect(cache.getMetrics().evictions).toBe(0);

			// Trigger evictions
			cache.set('key10', 'value10');
			cache.set('key11', 'value11');

			const metrics = cache.getMetrics();
			expect(metrics.evictions).toBe(2);
		});

		it('should track namespace-specific metrics', () => {
			cache.set('task:1', 'v1', { namespace: CacheNamespace.Task });
			cache.set('storage:1', 'v2', { namespace: CacheNamespace.Storage });

			// Access task namespace
			cache.get('task:1'); // hit
			cache.get('task:2'); // miss

			// Access storage namespace
			cache.get('storage:1'); // hit

			const metrics = cache.getMetrics();
			const taskMetrics = metrics.namespaceMetrics?.get(CacheNamespace.Task);
			const storageMetrics = metrics.namespaceMetrics?.get(
				CacheNamespace.Storage
			);

			expect(taskMetrics?.hits).toBe(1);
			expect(taskMetrics?.misses).toBe(1);
			expect(storageMetrics?.hits).toBe(1);
			expect(storageMetrics?.misses).toBe(0);
		});

		it('should reset namespace metrics on clear', () => {
			cache.set('task:1', 'v1', { namespace: CacheNamespace.Task });
			cache.get('task:1'); // Register hit

			cache.clear();

			const metrics = cache.getMetrics();
			expect(metrics.namespaceMetrics?.size).toBe(0);
		});

		it('should report current size and max size', () => {
			cache.set('key1', 'value1');
			cache.set('key2', 'value2');

			const metrics = cache.getMetrics();
			expect(metrics.size).toBe(2);
			expect(metrics.maxSize).toBe(10);
		});

		it('should estimate memory usage', () => {
			cache.set('key1', 'small');
			const memoryBefore = cache.getMetrics().memoryUsage;

			cache.set('key2', 'x'.repeat(1000));
			const memoryAfter = cache.getMetrics().memoryUsage;

			expect(memoryAfter).toBeGreaterThan(memoryBefore);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty cache metrics', () => {
			const metrics = cache.getMetrics();

			expect(metrics.hits).toBe(0);
			expect(metrics.misses).toBe(0);
			expect(metrics.hitRate).toBe(0);
			expect(metrics.size).toBe(0);
		});

		it('should handle delete of non-existent key', () => {
			const deleted = cache.delete('non-existent');
			expect(deleted).toBe(false);
		});

		it('should handle invalidation with no matches', () => {
			const count = cache.invalidate({ tag: 'non-existent-tag' });
			expect(count).toBe(0);
		});

		it('should handle circular reference in size estimation', () => {
			const circular: any = { name: 'test' };
			circular.self = circular;

			// Should fallback to estimate
			expect(() => cache.set('circular', circular)).not.toThrow();
		});

		it('should handle metrics with no namespace', () => {
			// Set without namespace option
			cache.set('plain-key', 'value');
			cache.get('plain-key');

			const metrics = cache.getMetrics();
			expect(metrics.hits).toBe(1);
		});
	});
});
