/**
 * @fileoverview Tests for ResourceMutex
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceMutex, MutexTimeoutError } from './mutex.js';

// Helper function to create a delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('ResourceMutex', () => {
	let mutex: ResourceMutex;

	beforeEach(() => {
		mutex = new ResourceMutex({ timeout: 100 }); // Short timeout for tests
	});

	describe('basic locking', () => {
		it('should acquire and release lock', async () => {
			const release = await mutex.acquire('resource1');

			expect(mutex.isLocked('resource1')).toBe(true);

			release();

			expect(mutex.isLocked('resource1')).toBe(false);
		});

		it('should allow independent locks on different resources', async () => {
			const release1 = await mutex.acquire('resource1');
			const release2 = await mutex.acquire('resource2');

			expect(mutex.isLocked('resource1')).toBe(true);
			expect(mutex.isLocked('resource2')).toBe(true);

			release1();
			release2();
		});

		it('should serialize access to same resource', async () => {
			const order: number[] = [];

			// First operation acquires lock
			const release1 = await mutex.acquire('resource1');
			order.push(1);

			// Second operation should wait
			const promise2 = mutex.acquire('resource1').then((release) => {
				order.push(2);
				release();
			});

			// Verify second operation is waiting
			expect(order).toEqual([1]);
			expect(mutex.getWaitCount('resource1')).toBe(1);

			// Release first lock
			release1();

			// Wait for second operation
			await promise2;

			// Verify execution order
			expect(order).toEqual([1, 2]);
		});
	});

	describe('queue behavior', () => {
		it('should maintain FIFO order with multiple waiters', async () => {
			const order: number[] = [];

			// Acquire lock
			const release1 = await mutex.acquire('resource1');

			// Queue two more acquirers
			const promise2 = mutex.acquire('resource1').then((release) => {
				order.push(2);
				release();
			});

			const promise3 = mutex.acquire('resource1').then((release) => {
				order.push(3);
				release();
			});

			// Verify they're waiting
			expect(mutex.getWaitCount('resource1')).toBe(2);

			// Release first lock
			order.push(1);
			release1();

			// Wait for queued acquirers
			await promise2;
			await promise3;

			// Verify FIFO order
			expect(order).toEqual([1, 2, 3]);
		});

		it('should handle concurrent operations correctly', async () => {
			let counter = 0;

			// Simulate 10 concurrent operations that increment counter
			const operations = Array.from({ length: 10 }, async () => {
				const release = await mutex.acquire('counter');
				try {
					const current = counter;
					// Simulate async work
					await delay(1);
					counter = current + 1;
				} finally {
					release();
				}
			});

			await Promise.all(operations);

			// Without mutex, this would be < 10 due to race conditions
			expect(counter).toBe(10);
		});

		it('should report accurate wait count', async () => {
			const release1 = await mutex.acquire('resource1');

			// Add multiple waiters
			const promise2 = mutex.acquire('resource1');
			const promise3 = mutex.acquire('resource1');
			const promise4 = mutex.acquire('resource1');

			expect(mutex.getWaitCount('resource1')).toBe(3);

			// Release and let one waiter proceed
			release1();
			const release2 = await promise2;

			expect(mutex.getWaitCount('resource1')).toBe(2);

			// Cleanup
			release2();
			const release3 = await promise3;
			release3();
			const release4 = await promise4;
			release4();
		});
	});

	describe('timeout behavior', () => {
		it('should timeout if lock not released within timeout period', async () => {
			// Acquire lock and never release
			await mutex.acquire('resource1');

			// Second acquirer should timeout
			await expect(mutex.acquire('resource1')).rejects.toThrow(
				MutexTimeoutError
			);
		});

		it('should include resource key in timeout error', async () => {
			await mutex.acquire('my-file.json');

			try {
				await mutex.acquire('my-file.json');
				expect.fail('Should have thrown timeout error');
			} catch (error: any) {
				expect(error).toBeInstanceOf(MutexTimeoutError);
				expect(error.message).toContain('my-file.json');
				expect(error.message).toContain('100ms');
				expect(error.resourceKey).toBe('my-file.json');
				expect(error.timeout).toBe(100);
			}
		});

		it('should cleanup timeout on successful acquisition', async () => {
			const release1 = await mutex.acquire('resource1');

			// Queue a waiter
			const promise2 = mutex.acquire('resource1');

			// Release quickly (before timeout)
			await delay(10);
			release1();

			// Should acquire without timeout
			const release2 = await promise2;
			expect(mutex.isLocked('resource1')).toBe(true);

			release2();
		});

		it('should remove timed-out waiter from queue', async () => {
			const release1 = await mutex.acquire('resource1');

			// Queue a waiter that will timeout
			const promise2 = mutex.acquire('resource1').catch(() => {
				// Ignore timeout error
			});

			// Wait for timeout
			await delay(150);

			// Waiter should be removed from queue
			expect(mutex.getWaitCount('resource1')).toBe(0);

			release1();
			await promise2;
		});
	});

	describe('tryAcquire', () => {
		it('should acquire lock if available', () => {
			const release = mutex.tryAcquire('resource1');

			expect(release).not.toBeNull();
			expect(mutex.isLocked('resource1')).toBe(true);

			release?.();
		});

		it('should return null if lock is held', async () => {
			await mutex.acquire('resource1');

			const result = mutex.tryAcquire('resource1');

			expect(result).toBeNull();
		});

		it('should not wait for lock', async () => {
			const release1 = await mutex.acquire('resource1');

			// tryAcquire should return immediately
			const startTime = Date.now();
			const result = mutex.tryAcquire('resource1');
			const duration = Date.now() - startTime;

			expect(result).toBeNull();
			expect(duration).toBeLessThan(10); // Should be nearly instant

			release1();
		});
	});

	describe('reentrancy', () => {
		it('should allow same async context to reacquire lock', async () => {
			const release1 = await mutex.acquire('resource1');

			// Same context should be able to reacquire
			const release2 = await mutex.acquire('resource1');

			expect(mutex.isLocked('resource1')).toBe(true);

			// Release reentrant acquisition (doesn't actually release)
			release2();
			expect(mutex.isLocked('resource1')).toBe(true);

			// Release original acquisition
			release1();
			expect(mutex.isLocked('resource1')).toBe(false);
		});

		it('should work with nested async function calls', async () => {
			async function outerOperation() {
				const release = await mutex.acquire('file1');
				try {
					await innerOperation();
				} finally {
					release();
				}
			}

			async function innerOperation() {
				const release = await mutex.acquire('file1'); // Should not deadlock
				try {
					// Do work
					expect(mutex.isLocked('file1')).toBe(true);
				} finally {
					release();
				}
			}

			await expect(outerOperation()).resolves.not.toThrow();
		});

		it('should handle multiple levels of reentrancy', async () => {
			const release1 = await mutex.acquire('resource1');
			const release2 = await mutex.acquire('resource1');
			const release3 = await mutex.acquire('resource1');

			expect(mutex.isLocked('resource1')).toBe(true);

			// Release in reverse order
			release3();
			expect(mutex.isLocked('resource1')).toBe(true);

			release2();
			expect(mutex.isLocked('resource1')).toBe(true);

			release1();
			expect(mutex.isLocked('resource1')).toBe(false);
		});

		it('should support tryAcquire with reentrancy', async () => {
			const release1 = await mutex.acquire('resource1');

			// tryAcquire should succeed for same context
			const release2 = mutex.tryAcquire('resource1');

			expect(release2).not.toBeNull();
			expect(mutex.isLocked('resource1')).toBe(true);

			release2?.();
			expect(mutex.isLocked('resource1')).toBe(true);

			release1();
			expect(mutex.isLocked('resource1')).toBe(false);
		});
	});

	describe('statistics', () => {
		it('should provide accurate stats', async () => {
			const release1 = await mutex.acquire('resource1');
			const release2 = await mutex.acquire('resource2');

			// Queue some waiters
			void mutex.acquire('resource1');
			void mutex.acquire('resource1');
			void mutex.acquire('resource2');

			// Small delay to ensure promises are queued
			await delay(5);

			const stats = mutex.getStats();

			expect(stats.lockedResources).toBe(2);
			expect(stats.totalWaiters).toBe(3);
			expect(stats.resourcesWithWaiters).toBe(2);

			release1();
			release2();
		});

		it('should update stats after releases', async () => {
			const release1 = await mutex.acquire('resource1');

			expect(mutex.getStats().lockedResources).toBe(1);

			release1();

			expect(mutex.getStats().lockedResources).toBe(0);
			expect(mutex.getStats().totalWaiters).toBe(0);
		});
	});

	describe('releaseAll', () => {
		it('should force release all locks', async () => {
			const release1 = await mutex.acquire('resource1');
			const release2 = await mutex.acquire('resource2');

			// Queue some waiters
			const promise3 = mutex.acquire('resource1').catch(() => {
				// Expect rejection
			});
			const promise4 = mutex.acquire('resource2').catch(() => {
				// Expect rejection
			});

			await delay(5);

			mutex.releaseAll();

			expect(mutex.getStats().lockedResources).toBe(0);
			expect(mutex.getStats().totalWaiters).toBe(0);

			await promise3;
			await promise4;

			// Original releases should be no-ops
			release1();
			release2();
		});

		it('should reject all waiting acquirers', async () => {
			await mutex.acquire('resource1');

			const errors: Error[] = [];

			// Queue multiple waiters
			const promises = Array.from({ length: 5 }, () =>
				mutex.acquire('resource1').catch((error) => {
					errors.push(error);
				})
			);

			await delay(5);

			mutex.releaseAll();

			await Promise.all(promises);

			expect(errors).toHaveLength(5);
			errors.forEach((error) => {
				expect(error.message).toContain('forcefully released');
			});
		});
	});

	describe('edge cases', () => {
		it('should handle rapid acquire/release cycles', async () => {
			const iterations = 100;

			for (let i = 0; i < iterations; i++) {
				const release = await mutex.acquire('resource1');
				release();
			}

			expect(mutex.isLocked('resource1')).toBe(false);
			expect(mutex.getWaitCount('resource1')).toBe(0);
		});

		it('should handle release called multiple times', async () => {
			const release = await mutex.acquire('resource1');

			release();
			release(); // Second call should be no-op
			release(); // Third call should be no-op

			expect(mutex.isLocked('resource1')).toBe(false);
		});

		it('should handle errors during locked operations', async () => {
			async function faultyOperation() {
				const release = await mutex.acquire('resource1');
				try {
					throw new Error('Operation failed');
				} finally {
					release();
				}
			}

			await expect(faultyOperation()).rejects.toThrow('Operation failed');

			// Lock should be released despite error
			expect(mutex.isLocked('resource1')).toBe(false);
		});

		it('should handle concurrent acquire and release', async () => {
			const operations = Array.from({ length: 20 }, async (_, i) => {
				const release = await mutex.acquire('resource1');
				try {
					await delay(1);
				} finally {
					release();
				}
			});

			await Promise.all(operations);

			expect(mutex.isLocked('resource1')).toBe(false);
			expect(mutex.getWaitCount('resource1')).toBe(0);
		});
	});

	describe('disabled reentrancy', () => {
		beforeEach(() => {
			mutex = new ResourceMutex({
				timeout: 100,
				allowReentrancy: false
			});
		});

		it('should block reentrant acquisition when disabled', async () => {
			const release1 = await mutex.acquire('resource1');

			// Attempt reentrant acquisition should timeout
			await expect(mutex.acquire('resource1')).rejects.toThrow(
				MutexTimeoutError
			);

			release1();
		});

		it('should not allow tryAcquire reentrancy when disabled', async () => {
			const release1 = await mutex.acquire('resource1');

			const result = mutex.tryAcquire('resource1');

			expect(result).toBeNull();

			release1();
		});
	});
});
