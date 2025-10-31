/**
 * @fileoverview Fake timer utilities for time-based testing
 * Provides helpers for using Vitest's fake timers to test time-dependent code
 * without actually waiting for real time to pass.
 *
 * Usage:
 * ```typescript
 * import { setupFakeTimers, advanceTime } from '../../../../../tests/test-helpers/index.js';
 *
 * describe('Cache TTL', () => {
 *   setupFakeTimers();
 *
 *   it('should expire after TTL', async () => {
 *     cache.set('key', 'value', { ttl: 5000 });
 *     await advanceTime(5100);
 *     expect(cache.get('key')).toBeNull();
 *   });
 * });
 * ```
 */

import { beforeEach, afterEach, vi } from 'vitest';

/**
 * Sets up fake timers that automatically clean up after each test
 * Call this at the describe level to apply to all tests in the suite
 *
 * @example
 * ```typescript
 * describe('My Suite', () => {
 *   setupFakeTimers();
 *
 *   it('test with fake timers', async () => {
 *     setTimeout(() => { /* ... *\/ }, 1000);
 *     await advanceTime(1000);
 *     // Timer has fired
 *   });
 * });
 * ```
 */
export function setupFakeTimers(): void {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});
}

/**
 * Advances fake timers by the specified number of milliseconds
 * Asynchronously processes all timers that should fire in that time period
 *
 * @param ms - Number of milliseconds to advance
 * @returns Promise that resolves when all timers have been processed
 *
 * @example
 * ```typescript
 * setTimeout(() => callback(), 1000);
 * await advanceTime(1000);
 * expect(callback).toHaveBeenCalled();
 * ```
 */
export async function advanceTime(ms: number): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
}

/**
 * Advances timers to the next pending timer
 * Useful when you don't know the exact delay but want to trigger the next scheduled event
 *
 * @returns Promise that resolves when the next timer has been processed
 *
 * @example
 * ```typescript
 * setTimeout(() => callback1(), 1000);
 * setTimeout(() => callback2(), 5000);
 *
 * await advanceToNextTimer();
 * expect(callback1).toHaveBeenCalled();
 * expect(callback2).not.toHaveBeenCalled();
 * ```
 */
export async function advanceToNextTimer(): Promise<void> {
	await vi.advanceTimersToNextTimerAsync();
}

/**
 * Runs all pending timers until there are no more scheduled
 * Useful for exhausting all async operations
 *
 * @returns Promise that resolves when all timers have been processed
 *
 * @example
 * ```typescript
 * setTimeout(() => callback1(), 1000);
 * setTimeout(() => callback2(), 5000);
 *
 * await advanceAllTimers();
 * expect(callback1).toHaveBeenCalled();
 * expect(callback2).toHaveBeenCalled();
 * ```
 */
export async function advanceAllTimers(): Promise<void> {
	await vi.runAllTimersAsync();
}

/**
 * Helper specifically for cache TTL tests
 * Advances time past the TTL with a small buffer to ensure expiration
 *
 * @param ttlMs - The TTL value in milliseconds
 * @param bufferMs - Additional time to advance past TTL (default: 100ms)
 * @returns Promise that resolves when time has been advanced
 *
 * @example
 * ```typescript
 * cache.set('key', 'value', { ttl: 5000 });
 * await advancePastTTL(5000);
 * expect(cache.get('key')).toBeNull(); // Should be expired
 * ```
 */
export async function advancePastTTL(ttlMs: number, bufferMs: number = 100): Promise<void> {
	await advanceTime(ttlMs + bufferMs);
}

/**
 * Gets the current fake time
 * Useful for assertions about when things happened
 *
 * @returns Current fake time in milliseconds since epoch
 *
 * @example
 * ```typescript
 * const startTime = getCurrentTime();
 * await advanceTime(1000);
 * expect(getCurrentTime() - startTime).toBe(1000);
 * ```
 */
export function getCurrentTime(): number {
	return Date.now();
}

/**
 * Runs only currently pending timers without advancing time
 * Useful for testing recursive timer scenarios
 *
 * @returns Promise that resolves when pending timers have run
 *
 * @example
 * ```typescript
 * function recursiveTimer() {
 *   setTimeout(() => {
 *     callback();
 *     recursiveTimer(); // Schedules another timer
 *   }, 1000);
 * }
 *
 * recursiveTimer();
 * await runPendingTimers(); // Runs first timer only
 * ```
 */
export async function runPendingTimers(): Promise<void> {
	await vi.runOnlyPendingTimersAsync();
}
