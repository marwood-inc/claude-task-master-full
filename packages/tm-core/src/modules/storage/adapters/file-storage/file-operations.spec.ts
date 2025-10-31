/**
 * @fileoverview Tests for FileOperations retry logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileOperations } from './file-operations.js';

// Mock fs/promises with proper vi.fn() pattern
vi.mock('node:fs/promises', () => ({
	default: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		rename: vi.fn(),
		unlink: vi.fn(),
		access: vi.fn(),
		stat: vi.fn(),
		readdir: vi.fn(),
		mkdir: vi.fn(),
		copyFile: vi.fn()
	}
}));

// Mock logger
vi.mock('../../../../common/logger/factory.js', () => ({
	getLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

import fs from 'node:fs/promises';

describe('FileOperations - Retry Logic', () => {
	let fileOps: FileOperations;

	beforeEach(() => {
		fileOps = new FileOperations();
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('performAtomicWrite - Success Cases', () => {
		it('should succeed on first attempt without retry', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockResolvedValue(undefined);

			await fileOps.writeJson(filePath, testData);

			expect(fs.writeFile).toHaveBeenCalledTimes(1);
			expect(fs.rename).toHaveBeenCalledTimes(1);
			expect(fs.writeFile).toHaveBeenCalledWith(
				'/test/file.json.tmp',
				JSON.stringify(testData, null, 2),
				'utf-8'
			);
			expect(fs.rename).toHaveBeenCalledWith(
				'/test/file.json.tmp',
				'/test/file.json'
			);
		});
	});

	describe('performAtomicWrite - Retry on EPERM', () => {
		it('should retry and succeed on second attempt after EPERM error', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const epermError = Object.assign(new Error('EPERM: operation not permitted'), {
				code: 'EPERM'
			});

			// First attempt fails, second succeeds
			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename)
				.mockRejectedValueOnce(epermError)
				.mockResolvedValueOnce(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);

			// Advance through first retry delay (~50ms with jitter)
			await vi.advanceTimersByTimeAsync(150);

			await writePromise;

			expect(fs.rename).toHaveBeenCalledTimes(2);
		});

		it('should retry and succeed on third attempt after two EPERM errors', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const epermError = Object.assign(new Error('EPERM: operation not permitted'), {
				code: 'EPERM'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename)
				.mockRejectedValueOnce(epermError)
				.mockRejectedValueOnce(epermError)
				.mockResolvedValueOnce(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);

			// Advance through first retry (~50ms)
			await vi.advanceTimersByTimeAsync(150);
			// Advance through second retry (~100ms)
			await vi.advanceTimersByTimeAsync(200);

			await writePromise;

			expect(fs.rename).toHaveBeenCalledTimes(3);
		});
	});

	describe('performAtomicWrite - Retry on Other Error Codes', () => {
		it('should retry on EBUSY error', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const ebusyError = Object.assign(new Error('EBUSY: resource busy'), {
				code: 'EBUSY'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename)
				.mockRejectedValueOnce(ebusyError)
				.mockResolvedValueOnce(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);
			await vi.advanceTimersByTimeAsync(150);
			await writePromise;

			expect(fs.rename).toHaveBeenCalledTimes(2);
		});

		it('should retry on ENOENT error', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const enoentError = Object.assign(new Error('ENOENT: no such file or directory'), {
				code: 'ENOENT'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename)
				.mockRejectedValueOnce(enoentError)
				.mockResolvedValueOnce(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);
			await vi.advanceTimersByTimeAsync(150);
			await writePromise;

			expect(fs.rename).toHaveBeenCalledTimes(2);
		});

		it('should retry on EACCES error', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const eaccesError = Object.assign(new Error('EACCES: permission denied'), {
				code: 'EACCES'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename)
				.mockRejectedValueOnce(eaccesError)
				.mockResolvedValueOnce(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);
			await vi.advanceTimersByTimeAsync(150);
			await writePromise;

			expect(fs.rename).toHaveBeenCalledTimes(2);
		});

		it('should retry on EAGAIN error', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const eagainError = Object.assign(new Error('EAGAIN: resource temporarily unavailable'), {
				code: 'EAGAIN'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename)
				.mockRejectedValueOnce(eagainError)
				.mockResolvedValueOnce(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);
			await vi.advanceTimersByTimeAsync(150);
			await writePromise;

			expect(fs.rename).toHaveBeenCalledTimes(2);
		});
	});

	describe('performAtomicWrite - Non-Retryable Errors', () => {
		it('should NOT retry on EINVAL error', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const einvalError = Object.assign(new Error('EINVAL: invalid argument'), {
				code: 'EINVAL'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockRejectedValue(einvalError);
			vi.mocked(fs.unlink).mockResolvedValue(undefined);

			await expect(fileOps.writeJson(filePath, testData)).rejects.toThrow(
				'Failed to write file /test/file.json: EINVAL: invalid argument'
			);

			// Should only attempt once (no retries)
			expect(fs.rename).toHaveBeenCalledTimes(1);
			// Should cleanup temp file
			expect(fs.unlink).toHaveBeenCalledWith('/test/file.json.tmp');
		});

		it('should NOT retry on EISDIR error', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const eisdirError = Object.assign(new Error('EISDIR: illegal operation on a directory'), {
				code: 'EISDIR'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockRejectedValue(eisdirError);
			vi.mocked(fs.unlink).mockResolvedValue(undefined);

			await expect(fileOps.writeJson(filePath, testData)).rejects.toThrow();

			expect(fs.rename).toHaveBeenCalledTimes(1);
		});
	});

	describe('performAtomicWrite - Retry Exhaustion', () => {
		it('should fail after exhausting all retry attempts', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const epermError = Object.assign(new Error('EPERM: operation not permitted'), {
				code: 'EPERM'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockRejectedValue(epermError);
			vi.mocked(fs.unlink).mockResolvedValue(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);

			// Advance through all retry delays
			await vi.advanceTimersByTimeAsync(150); // First retry (~50ms)
			await vi.advanceTimersByTimeAsync(200); // Second retry (~100ms)
			// Third attempt (no more retries after this)

			await expect(writePromise).rejects.toThrow(
				'Failed to write file /test/file.json after 4 attempts'
			);

			// Should have attempted 3 times
			expect(fs.rename).toHaveBeenCalledTimes(3);
			// Should cleanup temp file after exhaustion
			expect(fs.unlink).toHaveBeenCalledWith('/test/file.json.tmp');
		});
	});

	describe('performAtomicWrite - Backoff Delay Calculation', () => {
		it('should increase delay exponentially with each retry', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const epermError = Object.assign(new Error('EPERM: operation not permitted'), {
				code: 'EPERM'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockRejectedValue(epermError);
			vi.mocked(fs.unlink).mockResolvedValue(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);

			// First retry delay should be ~50ms ± 10% (45-55ms)
			await vi.advanceTimersByTimeAsync(40);
			expect(fs.rename).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(70);
			expect(fs.rename).toHaveBeenCalledTimes(2);

			// Second retry delay should be ~100ms ± 10% (90-110ms)
			await vi.advanceTimersByTimeAsync(85);
			expect(fs.rename).toHaveBeenCalledTimes(2);

			await vi.advanceTimersByTimeAsync(130);
			expect(fs.rename).toHaveBeenCalledTimes(3);

			await expect(writePromise).rejects.toThrow();
		});
	});

	describe('performAtomicWrite - Cleanup Behavior', () => {
		it('should cleanup temp file when non-retryable error occurs', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const einvalError = Object.assign(new Error('EINVAL: invalid argument'), {
				code: 'EINVAL'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockRejectedValue(einvalError);
			vi.mocked(fs.unlink).mockResolvedValue(undefined);

			await expect(fileOps.writeJson(filePath, testData)).rejects.toThrow();

			expect(fs.unlink).toHaveBeenCalledWith('/test/file.json.tmp');
			expect(fs.unlink).toHaveBeenCalledTimes(1);
		});

		it('should cleanup temp file after retry exhaustion', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const epermError = Object.assign(new Error('EPERM: operation not permitted'), {
				code: 'EPERM'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockRejectedValue(epermError);
			vi.mocked(fs.unlink).mockResolvedValue(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);

			await vi.advanceTimersByTimeAsync(150);
			await vi.advanceTimersByTimeAsync(200);

			await expect(writePromise).rejects.toThrow();

			expect(fs.unlink).toHaveBeenCalledWith('/test/file.json.tmp');
			expect(fs.unlink).toHaveBeenCalledTimes(1);
		});

		it('should ignore cleanup errors', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const epermError = Object.assign(new Error('EPERM: operation not permitted'), {
				code: 'EPERM'
			});
			const unlinkError = Object.assign(new Error('ENOENT: no such file'), {
				code: 'ENOENT'
			});

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockRejectedValue(epermError);
			vi.mocked(fs.unlink).mockRejectedValue(unlinkError);

			const writePromise = fileOps.writeJson(filePath, testData);

			await vi.advanceTimersByTimeAsync(150);
			await vi.advanceTimersByTimeAsync(200);

			// Should still throw the original error, not cleanup error
			await expect(writePromise).rejects.toThrow('EPERM');
			expect(fs.unlink).toHaveBeenCalled();
		});
	});

	describe('performAtomicWrite - writeFile Errors', () => {
		it('should retry when writeFile fails with EPERM', async () => {
			const testData = { test: 'data' };
			const filePath = '/test/file.json';
			const epermError = Object.assign(new Error('EPERM: operation not permitted'), {
				code: 'EPERM'
			});

			vi.mocked(fs.writeFile)
				.mockRejectedValueOnce(epermError)
				.mockResolvedValueOnce(undefined);
			vi.mocked(fs.rename).mockResolvedValue(undefined);

			const writePromise = fileOps.writeJson(filePath, testData);
			await vi.advanceTimersByTimeAsync(150);
			await writePromise;

			expect(fs.writeFile).toHaveBeenCalledTimes(2);
		});
	});

	describe('performAtomicWrite - Concurrent Writes', () => {
		it('should handle concurrent writes to same file with locking', async () => {
			const testData1 = { test: 'data1' };
			const testData2 = { test: 'data2' };
			const filePath = '/test/file.json';

			vi.mocked(fs.writeFile).mockResolvedValue(undefined);
			vi.mocked(fs.rename).mockResolvedValue(undefined);

			// Start two concurrent writes
			const write1 = fileOps.writeJson(filePath, testData1);
			const write2 = fileOps.writeJson(filePath, testData2);

			await Promise.all([write1, write2]);

			// Both should complete successfully (sequentially due to locking)
			expect(fs.writeFile).toHaveBeenCalledTimes(2);
			expect(fs.rename).toHaveBeenCalledTimes(2);
		});
	});
});
