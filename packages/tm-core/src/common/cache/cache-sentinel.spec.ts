/**
 * @fileoverview Tests for cache sentinel value pattern
 */

import { describe, it, expect } from 'vitest';
import { CACHE_MISS, isCacheMiss, isCacheHit } from './cache-sentinel.js';

describe('Cache Sentinel', () => {
	describe('CACHE_MISS symbol', () => {
		it('should be a global symbol', () => {
			expect(typeof CACHE_MISS).toBe('symbol');
			expect(Symbol.keyFor(CACHE_MISS)).toBe('tm-cache-miss');
		});

		it('should be consistent across multiple imports', () => {
			const symbol1 = Symbol.for('tm-cache-miss');
			const symbol2 = Symbol.for('tm-cache-miss');
			expect(symbol1).toBe(symbol2);
			expect(symbol1).toBe(CACHE_MISS);
		});

		it('should be unique and not equal to other values', () => {
			expect(CACHE_MISS).not.toBe(null);
			expect(CACHE_MISS).not.toBe(undefined);
			expect(CACHE_MISS).not.toBe(false);
			expect(CACHE_MISS).not.toBe(0);
			expect(CACHE_MISS).not.toBe('');
			expect(CACHE_MISS).not.toEqual([]);
			expect(CACHE_MISS).not.toEqual({});
		});
	});

	describe('isCacheMiss type guard', () => {
		it('should return true for CACHE_MISS', () => {
			expect(isCacheMiss(CACHE_MISS)).toBe(true);
		});

		it('should return false for null', () => {
			expect(isCacheMiss(null)).toBe(false);
		});

		it('should return false for undefined', () => {
			expect(isCacheMiss(undefined)).toBe(false);
		});

		it('should return false for empty string', () => {
			expect(isCacheMiss('')).toBe(false);
		});

		it('should return false for empty array', () => {
			expect(isCacheMiss([])).toBe(false);
		});

		it('should return false for empty object', () => {
			expect(isCacheMiss({})).toBe(false);
		});

		it('should return false for false boolean', () => {
			expect(isCacheMiss(false)).toBe(false);
		});

		it('should return false for zero', () => {
			expect(isCacheMiss(0)).toBe(false);
		});

		it('should return false for valid values', () => {
			expect(isCacheMiss('data')).toBe(false);
			expect(isCacheMiss([1, 2, 3])).toBe(false);
			expect(isCacheMiss({ key: 'value' })).toBe(false);
			expect(isCacheMiss(true)).toBe(false);
			expect(isCacheMiss(42)).toBe(false);
		});
	});

	describe('isCacheHit type guard', () => {
		it('should return false for CACHE_MISS', () => {
			expect(isCacheHit(CACHE_MISS)).toBe(false);
		});

		it('should return true for null', () => {
			expect(isCacheHit(null)).toBe(true);
		});

		it('should return true for undefined', () => {
			expect(isCacheHit(undefined)).toBe(true);
		});

		it('should return true for empty string', () => {
			expect(isCacheHit('')).toBe(true);
		});

		it('should return true for empty array', () => {
			expect(isCacheHit([])).toBe(true);
		});

		it('should return true for empty object', () => {
			expect(isCacheHit({})).toBe(true);
		});

		it('should return true for false boolean', () => {
			expect(isCacheHit(false)).toBe(true);
		});

		it('should return true for zero', () => {
			expect(isCacheHit(0)).toBe(true);
		});

		it('should return true for valid values', () => {
			expect(isCacheHit('data')).toBe(true);
			expect(isCacheHit([1, 2, 3])).toBe(true);
			expect(isCacheHit({ key: 'value' })).toBe(true);
			expect(isCacheHit(true)).toBe(true);
			expect(isCacheHit(42)).toBe(true);
		});
	});

	describe('Type safety in TypeScript', () => {
		it('should narrow types correctly with isCacheMiss', () => {
			const result: string | typeof CACHE_MISS = Math.random() > 0.5 ? 'data' : CACHE_MISS;

			if (isCacheMiss(result)) {
				// TypeScript should know result is CacheMiss here
				expect(result).toBe(CACHE_MISS);
			} else {
				// TypeScript should know result is string here
				expect(typeof result).toBe('string');
			}
		});

		it('should narrow types correctly with isCacheHit', () => {
			const result: number | typeof CACHE_MISS = Math.random() > 0.5 ? 42 : CACHE_MISS;

			if (isCacheHit(result)) {
				// TypeScript should know result is number here
				expect(typeof result).toBe('number');
			} else {
				// TypeScript should know result is CacheMiss here
				expect(result).toBe(CACHE_MISS);
			}
		});
	});

	describe('Real-world cache scenarios', () => {
		it('should handle cache miss and falsy value correctly', () => {
			// Simulating a cache get operation
			const cache = new Map<string, any>();

			// Cache miss
			const missingValue = cache.get('missing') ?? CACHE_MISS;
			expect(isCacheMiss(missingValue)).toBe(true);

			// Cached empty array (should NOT be cache miss)
			cache.set('empty-array', []);
			const emptyArray = cache.get('empty-array') ?? CACHE_MISS;
			expect(isCacheMiss(emptyArray)).toBe(false);
			expect(Array.isArray(emptyArray)).toBe(true);
			expect(emptyArray).toEqual([]);

			// Cached null (should NOT be cache miss)
			cache.set('null-value', null);
			const nullValue = cache.get('null-value') ?? CACHE_MISS;
			expect(isCacheMiss(nullValue)).toBe(false);
			expect(nullValue).toBeNull();

			// Cached empty string (should NOT be cache miss)
			cache.set('empty-string', '');
			const emptyString = cache.get('empty-string') ?? CACHE_MISS;
			expect(isCacheMiss(emptyString)).toBe(false);
			expect(emptyString).toBe('');
		});

		it('should work with conditional logic', () => {
			function fetchFromCache(key: string): string | typeof CACHE_MISS {
				const cache = new Map([[  'key1', 'value1' ], ['key2', '']]);
				const result = cache.get(key);
				return result !== undefined ? result : CACHE_MISS;
			}

			// Cache hit with valid value
			const result1 = fetchFromCache('key1');
			if (!isCacheMiss(result1)) {
				expect(result1).toBe('value1');
			} else {
				throw new Error('Should not be cache miss');
			}

			// Cache hit with empty string
			const result2 = fetchFromCache('key2');
			if (!isCacheMiss(result2)) {
				expect(result2).toBe('');
			} else {
				throw new Error('Should not be cache miss');
			}

			// Cache miss
			const result3 = fetchFromCache('key3');
			if (isCacheMiss(result3)) {
				expect(result3).toBe(CACHE_MISS);
			} else {
				throw new Error('Should be cache miss');
			}
		});
	});
});
