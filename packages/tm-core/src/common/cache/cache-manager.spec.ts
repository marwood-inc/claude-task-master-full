/**
 * @fileoverview Unit tests for CacheManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager, type CacheEvent } from './cache-manager.js';
import type { ICacheStrategy, CacheMetrics } from './interfaces/cache-strategy.interface.js';
import { CACHE_MISS } from './cache-sentinel.js';

/**
 * Mock cache strategy for testing
 */
class MockCacheStrategy implements ICacheStrategy {
	storage = new Map<string, any>();
	getCallCount = 0;
	setCallCount = 0;
	invalidateCallCount = 0;
	clearCallCount = 0;
	invalidatedEntries = 0;

	get(key: string) {
		this.getCallCount++;
		return this.storage.get(key) ?? CACHE_MISS;
	}

	set(key: string, value: any, options?: any): void {
		this.setCallCount++;
		this.storage.set(key, value);
	}

	has(key: string): boolean {
		return this.storage.has(key);
	}

	delete(key: string): boolean {
		return this.storage.delete(key);
	}

	invalidate(scope: any): number {
		this.invalidateCallCount++;
		const count = this.invalidatedEntries;
		this.invalidatedEntries = 0;
		return count;
	}

	clear(): void {
		this.clearCallCount++;
		this.storage.clear();
	}

	getMetrics(): CacheMetrics {
		return {
			hits: this.getCallCount,
			misses: 0,
			hitRate: 1.0,
			size: this.storage.size,
			maxSize: 100,
			evictions: 0,
			memoryUsage: 0
		};
	}

	estimateMemory(): number {
		return 0;
	}
}

describe('CacheManager', () => {
	let mockStrategy: MockCacheStrategy;
	let cacheManager: CacheManager;

	beforeEach(() => {
		mockStrategy = new MockCacheStrategy();
		cacheManager = new CacheManager({
			strategy: mockStrategy,
			enableMonitoring: false
		});
	});

	describe('Delegation', () => {
		it('should delegate get to strategy', () => {
			mockStrategy.storage.set('key1', 'value1');

			const result = cacheManager.get('key1');

			expect(result).toBe('value1');
			expect(mockStrategy.getCallCount).toBe(1);
		});

		it('should delegate set to strategy', () => {
			cacheManager.set('key1', 'value1', { namespace: 'test' });

			expect(mockStrategy.setCallCount).toBe(1);
			expect(mockStrategy.storage.get('key1')).toBe('value1');
		});

		it('should delegate has to strategy', () => {
			mockStrategy.storage.set('key1', 'value1');

			const exists = cacheManager.has('key1');

			expect(exists).toBe(true);
			expect(cacheManager.has('key2')).toBe(false);
		});

		it('should delegate delete to strategy', () => {
			mockStrategy.storage.set('key1', 'value1');

			const deleted = cacheManager.delete('key1');

			expect(deleted).toBe(true);
			expect(mockStrategy.storage.has('key1')).toBe(false);
		});

		it('should delegate invalidate to strategy', () => {
			mockStrategy.invalidatedEntries = 5;

			const count = cacheManager.invalidate({ namespace: 'test' });

			expect(count).toBe(5);
			expect(mockStrategy.invalidateCallCount).toBe(1);
		});

		it('should delegate clear to strategy', () => {
			mockStrategy.storage.set('key1', 'value1');
			mockStrategy.storage.set('key2', 'value2');

			cacheManager.clear();

			expect(mockStrategy.clearCallCount).toBe(1);
			expect(mockStrategy.storage.size).toBe(0);
		});

		it('should delegate getMetrics to strategy', () => {
			const metrics = cacheManager.getMetrics();

			expect(metrics.size).toBe(0);
			expect(metrics.maxSize).toBe(100);
		});
	});

	describe('Monitoring Hooks', () => {
		beforeEach(() => {
			// Enable monitoring for these tests
			cacheManager = new CacheManager({
				strategy: mockStrategy,
				enableMonitoring: true
			});
		});

		it('should call hooks on cache hit', () => {
			const hookSpy = vi.fn();
			cacheManager.addMonitoringHook(hookSpy);

			mockStrategy.storage.set('key1', 'value1');
			cacheManager.get('key1');

			expect(hookSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'hit',
					key: 'key1',
					timestamp: expect.any(Number)
				})
			);
		});

		it('should call hooks on cache miss', () => {
			const hookSpy = vi.fn();
			cacheManager.addMonitoringHook(hookSpy);

			cacheManager.get('non-existent');

			expect(hookSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'miss',
					key: 'non-existent',
					timestamp: expect.any(Number)
				})
			);
		});

		it('should call hooks on set', () => {
			const hookSpy = vi.fn();
			cacheManager.addMonitoringHook(hookSpy);

			cacheManager.set('key1', 'value1');

			expect(hookSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'set',
					key: 'key1',
					timestamp: expect.any(Number)
				})
			);
		});

		it('should call hooks on invalidation', () => {
			const hookSpy = vi.fn();
			cacheManager.addMonitoringHook(hookSpy);

			mockStrategy.invalidatedEntries = 3;
			cacheManager.invalidate({ tag: 'test' });

			expect(hookSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'invalidate',
					scope: { tag: 'test' },
					timestamp: expect.any(Number),
					metadata: { count: 3 }
				})
			);
		});

		it('should call hooks on clear', () => {
			const hookSpy = vi.fn();
			cacheManager.addMonitoringHook(hookSpy);

			cacheManager.clear();

			expect(hookSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'clear',
					timestamp: expect.any(Number)
				})
			);
		});

		it('should handle hook errors gracefully', () => {
			const errorHook = vi.fn(() => {
				throw new Error('Hook error');
			});
			const successHook = vi.fn();

			cacheManager.addMonitoringHook(errorHook);
			cacheManager.addMonitoringHook(successHook);

			// Should not throw
			expect(() => cacheManager.get('key1')).not.toThrow();

			// Success hook should still be called
			expect(successHook).toHaveBeenCalled();
		});

		it('should support multiple monitoring hooks', () => {
			const hook1 = vi.fn();
			const hook2 = vi.fn();
			const hook3 = vi.fn();

			cacheManager.addMonitoringHook(hook1);
			cacheManager.addMonitoringHook(hook2);
			cacheManager.addMonitoringHook(hook3);

			cacheManager.set('key1', 'value1');

			expect(hook1).toHaveBeenCalledTimes(1);
			expect(hook2).toHaveBeenCalledTimes(1);
			expect(hook3).toHaveBeenCalledTimes(1);
		});

		it('should remove monitoring hooks', () => {
			const hook1 = vi.fn();
			const hook2 = vi.fn();

			cacheManager.addMonitoringHook(hook1);
			cacheManager.addMonitoringHook(hook2);

			cacheManager.removeMonitoringHook(hook1);

			cacheManager.get('key1');

			expect(hook1).not.toHaveBeenCalled();
			expect(hook2).toHaveBeenCalledTimes(1);
		});

		it('should not emit events when monitoring disabled', () => {
			cacheManager = new CacheManager({
				strategy: mockStrategy,
				enableMonitoring: false // Disabled
			});

			const hookSpy = vi.fn();
			cacheManager.addMonitoringHook(hookSpy);

			cacheManager.get('key1');
			cacheManager.set('key1', 'value1');
			cacheManager.clear();

			expect(hookSpy).not.toHaveBeenCalled();
		});
	});

	describe('Convenience Methods', () => {
		it('should invalidate by namespace', () => {
			mockStrategy.invalidatedEntries = 5;

			const count = cacheManager.invalidateNamespace('test-namespace');

			expect(count).toBe(5);
			expect(mockStrategy.invalidateCallCount).toBe(1);
		});

		it('should invalidate by tag', () => {
			mockStrategy.invalidatedEntries = 3;

			const count = cacheManager.invalidateTag('test-tag');

			expect(count).toBe(3);
			expect(mockStrategy.invalidateCallCount).toBe(1);
		});

		it('should invalidate by pattern', () => {
			mockStrategy.invalidatedEntries = 2;

			const count = cacheManager.invalidatePattern('task:*');

			expect(count).toBe(2);
			expect(mockStrategy.invalidateCallCount).toBe(1);
		});
	});

	describe('Type Safety', () => {
		it('should support generic type for get', () => {
			interface TestData {
				id: number;
				name: string;
			}

			const testData: TestData = { id: 1, name: 'test' };
			mockStrategy.storage.set('test-key', testData);

			const result = cacheManager.get<TestData>('test-key');

			// TypeScript should infer correct type
			if (result !== CACHE_MISS) {
				expect(result.id).toBe(1);
				expect(result.name).toBe('test');
			}
		});

		it('should support generic type for set', () => {
			interface TestData {
				id: number;
				name: string;
			}

			const testData: TestData = { id: 1, name: 'test' };
			cacheManager.set<TestData>('test-key', testData);

			const stored = mockStrategy.storage.get('test-key');
			expect(stored).toEqual(testData);
		});
	});

	describe('Integration', () => {
		it('should work end-to-end with mock strategy', () => {
			// Set values
			cacheManager.set('user:1', { name: 'Alice' });
			cacheManager.set('user:2', { name: 'Bob' });

			// Get values
			expect(cacheManager.get('user:1')).toEqual({ name: 'Alice' });
			expect(cacheManager.get('user:2')).toEqual({ name: 'Bob' });

			// Delete
			cacheManager.delete('user:1');
			expect(cacheManager.has('user:1')).toBe(false);
			expect(cacheManager.has('user:2')).toBe(true);

			// Clear
			cacheManager.clear();
			expect(cacheManager.has('user:2')).toBe(false);
		});

		it('should maintain correct call counts', () => {
			cacheManager.get('key1');
			cacheManager.get('key2');
			cacheManager.set('key3', 'value3');
			cacheManager.set('key4', 'value4');

			expect(mockStrategy.getCallCount).toBe(2);
			expect(mockStrategy.setCallCount).toBe(2);
		});
	});
});
