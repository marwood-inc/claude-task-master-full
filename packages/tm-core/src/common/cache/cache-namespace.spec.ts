/**
 * @fileoverview Tests for cache namespace system
 */

import { describe, it, expect } from 'vitest';
import {
	CacheNamespace,
	CacheKeyBuilder,
	NAMESPACE_DELIMITER
} from './cache-namespace.js';

describe('Cache Namespace', () => {
	describe('CacheNamespace enum', () => {
		it('should define all required namespaces', () => {
			expect(CacheNamespace.Storage).toBe('storage');
			expect(CacheNamespace.Task).toBe('task');
			expect(CacheNamespace.Complexity).toBe('complexity');
			expect(CacheNamespace.Metadata).toBe('metadata');
		});
	});

	describe('NAMESPACE_DELIMITER', () => {
		it('should be a colon', () => {
			expect(NAMESPACE_DELIMITER).toBe(':');
		});
	});

	describe('CacheKeyBuilder.build', () => {
		it('should build key with namespace and identifier', () => {
			const key = CacheKeyBuilder.build(CacheNamespace.Storage, 'master');
			expect(key).toBe('storage:master');
		});

		it('should build key with namespace, identifier, and tag', () => {
			const key = CacheKeyBuilder.build(
				CacheNamespace.Storage,
				'master',
				'{"status":"pending"}'
			);
			expect(key).toBe('storage:master:{"status":"pending"}');
		});

		it('should handle empty tag', () => {
			const key1 = CacheKeyBuilder.build(CacheNamespace.Task, '1', '');
			const key2 = CacheKeyBuilder.build(CacheNamespace.Task, '1');
			expect(key1).toBe('task:1');
			expect(key2).toBe('task:1');
			expect(key1).toBe(key2);
		});

		it('should handle null tag', () => {
			const key = CacheKeyBuilder.build(CacheNamespace.Task, '1', null as any);
			expect(key).toBe('task:1');
		});

		it('should handle undefined tag', () => {
			const key = CacheKeyBuilder.build(CacheNamespace.Task, '1', undefined);
			expect(key).toBe('task:1');
		});

		it('should create unique keys for different namespaces', () => {
			const storageKey = CacheKeyBuilder.build(
				CacheNamespace.Storage,
				'master',
				'options'
			);
			const taskKey = CacheKeyBuilder.build(
				CacheNamespace.Task,
				'master',
				'options'
			);
			expect(storageKey).not.toBe(taskKey);
			expect(storageKey).toBe('storage:master:options');
			expect(taskKey).toBe('task:master:options');
		});

		it('should handle complex tag values', () => {
			const complexTag = JSON.stringify({
				status: 'pending',
				priority: 'high',
				nested: { key: 'value' }
			});
			const key = CacheKeyBuilder.build(
				CacheNamespace.Storage,
				'master',
				complexTag
			);
			expect(key).toContain('storage:master:');
			expect(key).toContain('"status":"pending"');
		});
	});

	describe('CacheKeyBuilder.parse', () => {
		it('should parse key with namespace and identifier', () => {
			const parsed = CacheKeyBuilder.parse('storage:master');
			expect(parsed).toEqual({
				namespace: 'storage',
				identifier: 'master',
				tag: undefined
			});
		});

		it('should parse key with namespace, identifier, and tag', () => {
			const parsed = CacheKeyBuilder.parse('storage:master:{"status":"pending"}');
			expect(parsed).toEqual({
				namespace: 'storage',
				identifier: 'master',
				tag: '{"status":"pending"}'
			});
		});

		it('should handle tag with multiple delimiters', () => {
			const parsed = CacheKeyBuilder.parse('task:1.2:master:additional');
			expect(parsed).toEqual({
				namespace: 'task',
				identifier: '1.2',
				tag: 'master:additional'
			});
		});

		it('should throw error for invalid key format', () => {
			expect(() => CacheKeyBuilder.parse('invalid')).toThrow(
				'Invalid cache key format'
			);
			expect(() => CacheKeyBuilder.parse('')).toThrow(
				'Invalid cache key format'
			);
		});

		it('should roundtrip build and parse', () => {
			const original = {
				namespace: CacheNamespace.Storage,
				identifier: 'master',
				tag: '{"status":"done"}'
			};

			const key = CacheKeyBuilder.build(
				original.namespace,
				original.identifier,
				original.tag
			);
			const parsed = CacheKeyBuilder.parse(key);

			expect(parsed.namespace).toBe(original.namespace);
			expect(parsed.identifier).toBe(original.identifier);
			expect(parsed.tag).toBe(original.tag);
		});
	});

	describe('CacheKeyBuilder.isInNamespace', () => {
		it('should return true for keys in the namespace', () => {
			const storageKey = 'storage:master:options';
			expect(
				CacheKeyBuilder.isInNamespace(storageKey, CacheNamespace.Storage)
			).toBe(true);
		});

		it('should return false for keys not in the namespace', () => {
			const storageKey = 'storage:master:options';
			expect(
				CacheKeyBuilder.isInNamespace(storageKey, CacheNamespace.Task)
			).toBe(false);
		});

		it('should handle keys without tags', () => {
			const taskKey = 'task:1';
			expect(
				CacheKeyBuilder.isInNamespace(taskKey, CacheNamespace.Task)
			).toBe(true);
			expect(
				CacheKeyBuilder.isInNamespace(taskKey, CacheNamespace.Storage)
			).toBe(false);
		});

		it('should not match partial namespace names', () => {
			const key = 'taskstorage:data';
			expect(
				CacheKeyBuilder.isInNamespace(key, CacheNamespace.Task)
			).toBe(false);
			expect(
				CacheKeyBuilder.isInNamespace(key, CacheNamespace.Storage)
			).toBe(false);
		});
	});

	describe('CacheKeyBuilder.getKeysInNamespace', () => {
		const keys = [
			'storage:master:{}',
			'storage:dev:{}',
			'task:1:master',
			'task:2:master',
			'complexity:5:master',
			'metadata:tags'
		];

		it('should filter keys by namespace', () => {
			const storageKeys = CacheKeyBuilder.getKeysInNamespace(
				keys,
				CacheNamespace.Storage
			);
			expect(storageKeys).toHaveLength(2);
			expect(storageKeys).toContain('storage:master:{}');
			expect(storageKeys).toContain('storage:dev:{}');
		});

		it('should return empty array for namespace with no keys', () => {
			const keys = ['storage:master:{}', 'task:1:master'];
			const metadataKeys = CacheKeyBuilder.getKeysInNamespace(
				keys,
				CacheNamespace.Metadata
			);
			expect(metadataKeys).toHaveLength(0);
		});

		it('should handle empty input array', () => {
			const result = CacheKeyBuilder.getKeysInNamespace(
				[],
				CacheNamespace.Storage
			);
			expect(result).toEqual([]);
		});

		it('should filter multiple namespaces correctly', () => {
			const taskKeys = CacheKeyBuilder.getKeysInNamespace(
				keys,
				CacheNamespace.Task
			);
			const complexityKeys = CacheKeyBuilder.getKeysInNamespace(
				keys,
				CacheNamespace.Complexity
			);

			expect(taskKeys).toHaveLength(2);
			expect(complexityKeys).toHaveLength(1);
			expect(taskKeys).toContain('task:1:master');
			expect(taskKeys).toContain('task:2:master');
			expect(complexityKeys).toContain('complexity:5:master');
		});
	});

	describe('Namespace isolation', () => {
		it('should prevent key collisions across namespaces', () => {
			const storageKey = CacheKeyBuilder.build(
				CacheNamespace.Storage,
				'1',
				'master'
			);
			const taskKey = CacheKeyBuilder.build(
				CacheNamespace.Task,
				'1',
				'master'
			);

			expect(storageKey).not.toBe(taskKey);

			// Simulate cache storage
			const cache = new Map<string, any>();
			cache.set(storageKey, ['all', 'tasks']);
			cache.set(taskKey, { id: '1', title: 'Task 1' });

			expect(cache.get(storageKey)).toEqual(['all', 'tasks']);
			expect(cache.get(taskKey)).toEqual({ id: '1', title: 'Task 1' });
		});

		it('should support pattern-based invalidation by namespace', () => {
			const cache = new Map<string, any>();

			// Add keys from different namespaces
			cache.set('storage:master:{}', ['task1', 'task2']);
			cache.set('storage:dev:{}', ['task3']);
			cache.set('task:1:master', { id: '1' });
			cache.set('task:2:master', { id: '2' });

			// Invalidate all storage keys
			const allKeys = Array.from(cache.keys());
			const storageKeys = CacheKeyBuilder.getKeysInNamespace(
				allKeys,
				CacheNamespace.Storage
			);

			for (const key of storageKeys) {
				cache.delete(key);
			}

			// Storage keys should be gone
			expect(cache.has('storage:master:{}')).toBe(false);
			expect(cache.has('storage:dev:{}')).toBe(false);

			// Task keys should still exist
			expect(cache.has('task:1:master')).toBe(true);
			expect(cache.has('task:2:master')).toBe(true);
		});
	});

	describe('Real-world usage scenarios', () => {
		it('should handle FileStorage cache keys', () => {
			const tag = 'master';
			const options = { status: 'pending' };
			const key = CacheKeyBuilder.build(
				CacheNamespace.Storage,
				tag,
				JSON.stringify(options)
			);

			expect(key).toBe('storage:master:{"status":"pending"}');

			const parsed = CacheKeyBuilder.parse(key);
			expect(parsed.namespace).toBe('storage');
			expect(parsed.identifier).toBe('master');
			expect(JSON.parse(parsed.tag!)).toEqual(options);
		});

		it('should handle single task cache keys', () => {
			const taskId = '1.2';
			const tag = 'master';
			const key = CacheKeyBuilder.build(CacheNamespace.Task, taskId, tag);

			expect(key).toBe('task:1.2:master');

			const parsed = CacheKeyBuilder.parse(key);
			expect(parsed.namespace).toBe('task');
			expect(parsed.identifier).toBe('1.2');
			expect(parsed.tag).toBe('master');
		});

		it('should handle complexity report cache keys', () => {
			const taskId = '5';
			const tag = 'master';
			const key = CacheKeyBuilder.build(
				CacheNamespace.Complexity,
				taskId,
				tag
			);

			expect(key).toBe('complexity:5:master');
		});
	});
});
