/**
 * @fileoverview Mock utilities for Node.js built-in modules
 * Provides properly typed mocks for fs/promises, path, and other Node.js modules
 * that are commonly used across test files.
 *
 * Usage:
 * ```typescript
 * import { createFsMocks } from '../../../../../tests/test-helpers/index.js';
 *
 * // At module level, before describe blocks
 * const fsMocks = createFsMocks();
 * vi.mock('node:fs/promises', () => fsMocks);
 *
 * // In tests
 * it('should read file', async () => {
 *   fsMocks.readFile.mockResolvedValue('file contents');
 *   // ... test logic
 * });
 * ```
 */

import { vi } from 'vitest';
import type { MockedFunction } from 'vitest';

/**
 * Mocked fs/promises module with commonly used methods
 */
export interface FsPromisesMocks {
	readFile: MockedFunction<(path: string, encoding: string) => Promise<string>>;
	writeFile: MockedFunction<(path: string, data: string, encoding: string) => Promise<void>>;
	mkdir: MockedFunction<(path: string, options?: { recursive?: boolean }) => Promise<void>>;
	access: MockedFunction<(path: string) => Promise<void>>;
	unlink: MockedFunction<(path: string) => Promise<void>>;
	rm: MockedFunction<(path: string, options?: { recursive?: boolean; force?: boolean }) => Promise<void>>;
	rename: MockedFunction<(oldPath: string, newPath: string) => Promise<void>>;
	readdir: MockedFunction<(path: string) => Promise<string[]>>;
	stat: MockedFunction<(path: string) => Promise<any>>;
}

/**
 * Mocked path module with commonly used methods
 */
export interface PathMocks {
	join: MockedFunction<(...paths: string[]) => string>;
	resolve: MockedFunction<(...paths: string[]) => string>;
	dirname: MockedFunction<(path: string) => string>;
	basename: MockedFunction<(path: string, ext?: string) => string>;
	normalize: MockedFunction<(path: string) => string>;
	sep: string;
}

/**
 * Creates mocked fs/promises functions with proper typing
 * All functions are vi.fn() instances that can be configured per test
 *
 * @returns Object with mocked fs/promises functions
 *
 * @example
 * ```typescript
 * const fsMocks = createFsMocks();
 * vi.mock('node:fs/promises', () => fsMocks);
 *
 * // In test
 * fsMocks.readFile.mockResolvedValue('content');
 * ```
 */
export function createFsMocks(): FsPromisesMocks {
	return {
		readFile: vi.fn<[string, string], Promise<string>>(),
		writeFile: vi.fn<[string, string, string], Promise<void>>(),
		mkdir: vi.fn<[string, { recursive?: boolean }?], Promise<void>>(),
		access: vi.fn<[string], Promise<void>>(),
		unlink: vi.fn<[string], Promise<void>>(),
		rm: vi.fn<[string, { recursive?: boolean; force?: boolean }?], Promise<void>>(),
		rename: vi.fn<[string, string], Promise<void>>(),
		readdir: vi.fn<[string], Promise<string[]>>(),
		stat: vi.fn<[string], Promise<any>>()
	};
}

/**
 * Creates mocked path functions with proper typing
 * Includes basic implementations for common operations
 *
 * @returns Object with mocked path functions
 *
 * @example
 * ```typescript
 * const pathMocks = createPathMocks();
 * vi.mock('node:path', () => pathMocks);
 *
 * // In test
 * pathMocks.join.mockReturnValue('/custom/path');
 * ```
 */
export function createPathMocks(): PathMocks {
	return {
		join: vi.fn<string[], string>().mockImplementation((...paths) => paths.join('/')),
		resolve: vi.fn<string[], string>().mockImplementation((...paths) => {
			// Simple implementation for testing
			const resolved = paths.join('/').replace(/\/+/g, '/');
			return resolved.startsWith('/') ? resolved : '/' + resolved;
		}),
		dirname: vi.fn<[string], string>().mockImplementation((p) => {
			const parts = p.split('/');
			parts.pop();
			return parts.join('/') || '/';
		}),
		basename: vi.fn<[string, string?], string>().mockImplementation((p, ext) => {
			const base = p.split('/').pop() || '';
			if (ext && base.endsWith(ext)) {
				return base.slice(0, -ext.length);
			}
			return base;
		}),
		normalize: vi.fn<[string], string>().mockImplementation((p) => {
			return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
		}),
		sep: '/'
	};
}

/**
 * Creates a complete mock for node:fs module with promises submodule
 * Use this when mocking 'node:fs' instead of 'node:fs/promises'
 *
 * @returns Object with promises property containing fs/promises mocks
 *
 * @example
 * ```typescript
 * vi.mock('node:fs', () => createNodeFsMock());
 *
 * import fs from 'node:fs/promises';
 * // fs.readFile is now mocked
 * ```
 */
export function createNodeFsMock() {
	return {
		promises: createFsMocks()
	};
}

/**
 * Helper to directly mock 'node:fs/promises' without the wrapper
 * Use this when importing from 'node:fs/promises'
 *
 * @returns Direct mocks for fs/promises functions
 *
 * @example
 * ```typescript
 * vi.mock('node:fs/promises', () => createFsPromisesMock());
 *
 * import fs from 'node:fs/promises';
 * // fs.readFile is now mocked
 * ```
 */
export function createFsPromisesMock() {
	return createFsMocks();
}
