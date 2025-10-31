/**
 * @fileoverview Integration tests for FileOperations concurrent access patterns
 * Tests mutex locking, timeout handling, and atomicity guarantees
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileOperations } from '../../../src/modules/storage/adapters/file-storage/file-operations.js';
import { MutexTimeoutError } from '../../../src/common/utils/mutex.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('FileOperations - Concurrency Integration Tests', () => {
	let tmpDir: string;
	let fileOps: FileOperations;

	beforeEach(async () => {
		// Create unique temp directory for each test
		tmpDir = path.join(os.tmpdir(), `file-ops-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
		await fs.mkdir(tmpDir, { recursive: true });

		// Initialize FileOperations with shorter timeout for faster tests
		fileOps = new FileOperations({
			mutexTimeout: 5000 // 5 seconds for tests
		});
	});

	afterEach(async () => {
		// Clean up
		await fileOps.cleanup();
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('Concurrent writeJson operations', () => {
		it('should handle concurrent writes to same file without data loss', async () => {
			const filePath = path.join(tmpDir, 'concurrent.json');
			const iterations = 20;

			// Launch 20 concurrent writes
			const writes = Array.from({ length: iterations }, (_, i) =>
				fileOps.writeJson(filePath, { value: i, timestamp: Date.now() })
			);

			await Promise.all(writes);

			// Verify file is valid JSON and contains a write
			const content = await fs.readFile(filePath, 'utf-8');
			const data = JSON.parse(content); // Should not throw

			expect(data).toHaveProperty('value');
			expect(data.value).toBeGreaterThanOrEqual(0);
			expect(data.value).toBeLessThan(iterations);
			expect(data).toHaveProperty('timestamp');
		});

		it('should handle parallel writes to different files without blocking', async () => {
			const fileCount = 5;
			const files = Array.from({ length: fileCount }, (_, i) =>
				path.join(tmpDir, `file-${i}.json`)
			);

			const startTime = Date.now();

			// Write to 5 different files in parallel
			await Promise.all(
				files.map((file, i) => fileOps.writeJson(file, { id: i, data: 'test' }))
			);

			const elapsed = Date.now() - startTime;

			// Should complete quickly since different files don't block each other
			expect(elapsed).toBeLessThan(2000); // Heuristic: < 2s for 5 small writes

			// Verify all files exist and contain correct data
			for (let i = 0; i < fileCount; i++) {
				const content = await fs.readFile(files[i], 'utf-8');
				const data = JSON.parse(content);
				expect(data.id).toBe(i);
			}
		});
	});

	describe('Timeout handling', () => {
		it('should throw MutexTimeoutError when lock cannot be acquired within timeout', async () => {
			const filePath = path.join(tmpDir, 'timeout-test.json');

			// Create FileOperations with very short timeout
			const shortTimeoutOps = new FileOperations({ mutexTimeout: 100 });

			// Manually acquire lock to simulate long-running operation
			const release = await (shortTimeoutOps as any).mutex.acquire(filePath);

			try {
				// Attempt to write should timeout
				await expect(
					shortTimeoutOps.writeJson(filePath, { data: 'test' })
				).rejects.toThrow(MutexTimeoutError);
			} finally {
				// Clean up
				release();
				await shortTimeoutOps.cleanup();
			}
		});
	});

	describe('ensureDir concurrency', () => {
		it('should handle concurrent directory creation without race conditions', async () => {
			const dirPath = path.join(tmpDir, 'concurrent-dir', 'nested', 'deep');

			// Launch 10 concurrent ensureDir calls for same path
			const creates = Array.from({ length: 10 }, () =>
				fileOps.ensureDir(dirPath)
			);

			// All should succeed without errors
			await Promise.all(creates);

			// Verify directory exists
			const stats = await fs.stat(dirPath);
			expect(stats.isDirectory()).toBe(true);
		});

		it('should handle concurrent directory creation for different paths', async () => {
			const dirs = Array.from({ length: 5 }, (_, i) =>
				path.join(tmpDir, `dir-${i}`, 'nested')
			);

			const startTime = Date.now();

			await Promise.all(dirs.map((dir) => fileOps.ensureDir(dir)));

			const elapsed = Date.now() - startTime;

			// Should complete quickly since different directories don't block
			expect(elapsed).toBeLessThan(2000);

			// Verify all directories exist
			for (const dir of dirs) {
				const stats = await fs.stat(dir);
				expect(stats.isDirectory()).toBe(true);
			}
		});
	});

	describe('Error recovery', () => {
		it('should release lock even when write operation fails', async () => {
			const filePath = path.join(tmpDir, 'error-test.json');

			// Create invalid data that will fail JSON.stringify
			const circularRef: any = {};
			circularRef.self = circularRef;

			// First write should fail
			await expect(
				fileOps.writeJson(filePath, circularRef)
			).rejects.toThrow();

			// Verify lock was released - next operation should succeed
			await fileOps.writeJson(filePath, { valid: true });

			const content = await fs.readFile(filePath, 'utf-8');
			expect(JSON.parse(content)).toEqual({ valid: true });
		});
	});

	describe('Logger integration', () => {
		it('should call logger when provided', async () => {
			const logs: Array<{ level: string; message: string; meta?: any }> = [];

			const loggedOps = new FileOperations({
				mutexTimeout: 5000,
				logger: {
					debug: (message: string, meta?: any) => logs.push({ level: 'debug', message, meta }),
					warn: (message: string, meta?: any) => logs.push({ level: 'warn', message, meta }),
					error: (message: string, meta?: any) => logs.push({ level: 'error', message, meta })
				}
			});

			const filePath = path.join(tmpDir, 'logged.json');
			await loggedOps.writeJson(filePath, { test: true });

			// Verify debug logs were called
			expect(logs.some((l) => l.message.includes('Acquiring mutex'))).toBe(true);
			expect(logs.some((l) => l.message.includes('Mutex acquired'))).toBe(true);
			expect(logs.some((l) => l.message.includes('Write completed'))).toBe(true);
			expect(logs.some((l) => l.message.includes('Mutex released'))).toBe(true);

			await loggedOps.cleanup();
		});

		it('should work without logger (backward compatibility)', async () => {
			// Create without logger option
			const noLogOps = new FileOperations();

			const filePath = path.join(tmpDir, 'nolog.json');
			await noLogOps.writeJson(filePath, { test: 1 });

			const content = await fs.readFile(filePath, 'utf-8');
			expect(JSON.parse(content)).toEqual({ test: 1 });

			await noLogOps.cleanup();
		});
	});

	describe('Cleanup behavior', () => {
		it('should warn when cleanup is called with active locks', async () => {
			const logs: Array<{ level: string; message: string; meta?: any }> = [];

			const warningOps = new FileOperations({
				logger: {
					debug: (msg, meta) => logs.push({ level: 'debug', message: msg, meta }),
					warn: (msg, meta) => logs.push({ level: 'warn', message: msg, meta }),
					error: (msg, meta) => logs.push({ level: 'error', message: msg, meta })
				}
			});

			const filePath = path.join(tmpDir, 'cleanup-test.json');

			// Manually acquire lock
			const release = await (warningOps as any).mutex.acquire(filePath);

			try {
				// Call cleanup while lock is held
				await warningOps.cleanup();

				// Should have logged a warning
				expect(logs.some((l) => l.level === 'warn' && l.message.includes('active operations'))).toBe(true);
			} finally {
				release();
			}
		});
	});

	describe('Performance baseline', () => {
		it('should complete 100 concurrent writes to different files within reasonable time', async () => {
			const fileCount = 100;
			const filePaths = Array.from({ length: fileCount }, (_, i) =>
				path.join(tmpDir, `perf-${i}.json`)
			);

			const startTime = Date.now();

			await Promise.all(
				filePaths.map((fp, i) => fileOps.writeJson(fp, { index: i, data: 'test' }))
			);

			const duration = Date.now() - startTime;

			// Should complete in reasonable time (< 10 seconds)
			// Even with locking, parallel writes to different files are fast
			expect(duration).toBeLessThan(10000);

			// Verify all files were written correctly
			const sampleFile = path.join(tmpDir, 'perf-50.json');
			const content = await fs.readFile(sampleFile, 'utf-8');
			expect(JSON.parse(content)).toEqual({ index: 50, data: 'test' });
		}, 15000); // Extended timeout for this performance test
	});
});
