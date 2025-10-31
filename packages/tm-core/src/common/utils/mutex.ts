/**
 * @fileoverview Multi-resource mutex manager with timeout and reentrancy support
 *
 * Provides file-level locking to prevent race conditions during concurrent operations.
 * Based on proven patterns from Puppeteer and production systems.
 *
 * Features:
 * - Per-resource locking (multiple resources can be locked independently)
 * - Configurable timeout (default 30s) to prevent deadlocks
 * - Reentrancy support via AsyncLocalStorage (same context can acquire lock multiple times)
 * - FIFO queue for fairness
 * - Automatic cleanup on timeout
 *
 * @example
 * ```typescript
 * const mutex = new ResourceMutex({ timeout: 30000 });
 *
 * // Acquire lock for a resource
 * const release = await mutex.acquire('state-file.json');
 * try {
 *   // Perform locked operation
 *   await fs.writeFile('state-file.json', data);
 * } finally {
 *   release(); // Always release in finally block
 * }
 * ```
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Options for ResourceMutex configuration
 */
export interface ResourceMutexOptions {
	/**
	 * Maximum time to wait for lock acquisition in milliseconds
	 * @default 30000 (30 seconds)
	 */
	timeout?: number;

	/**
	 * Enable reentrancy support (same async context can acquire lock multiple times)
	 * @default true
	 */
	allowReentrancy?: boolean;
}

/**
 * Error thrown when lock acquisition times out
 */
export class MutexTimeoutError extends Error {
	constructor(
		public readonly resourceKey: string,
		public readonly timeout: number
	) {
		super(
			`Failed to acquire lock for resource "${resourceKey}" within ${timeout}ms. ` +
				`This may indicate a deadlock or long-running operation.`
		);
		this.name = 'MutexTimeoutError';
		Object.setPrototypeOf(this, MutexTimeoutError.prototype);
	}
}

/**
 * Tracks lock acquisition context for reentrancy support
 */
interface LockContext {
	resourceKey: string;
	acquiredAt: number;
	count: number; // Number of times reacquired in same context
}

/**
 * Queue entry for waiting acquirers
 */
interface QueueEntry {
	resolve: () => void;
	reject: (error: Error) => void;
	contextId: string;
	timeoutId: NodeJS.Timeout;
}

/**
 * Multi-resource mutex manager
 *
 * Manages locks for multiple resources (identified by string keys) with timeout
 * and reentrancy support. Thread-safe for async operations.
 */
export class ResourceMutex {
	private readonly options: Required<ResourceMutexOptions>;

	/**
	 * Map of resource keys to their lock state
	 * Value is the context ID that owns the lock
	 */
	private locks = new Map<string, string>();

	/**
	 * Map of resource keys to their wait queues (FIFO)
	 */
	private queues = new Map<string, QueueEntry[]>();

	/**
	 * Tracks lock context for reentrancy support
	 */
	private asyncLocalStorage = new AsyncLocalStorage<LockContext>();

	/**
	 * Counter for generating unique context IDs
	 */
	private contextIdCounter = 0;

	constructor(options: ResourceMutexOptions = {}) {
		this.options = {
			timeout: options.timeout ?? 30000,
			allowReentrancy: options.allowReentrancy ?? true
		};
	}

	/**
	 * Acquire a lock for the specified resource
	 *
	 * @param resourceKey - Unique identifier for the resource to lock
	 * @returns Release function to unlock the resource
	 * @throws {MutexTimeoutError} If lock cannot be acquired within timeout period
	 *
	 * @example
	 * ```typescript
	 * const release = await mutex.acquire('file-path');
	 * try {
	 *   // Critical section
	 * } finally {
	 *   release();
	 * }
	 * ```
	 */
	async acquire(resourceKey: string): Promise<() => void> {
		// Check for reentrancy
		if (this.options.allowReentrancy) {
			const currentContext = this.asyncLocalStorage.getStore();

			if (currentContext && currentContext.resourceKey === resourceKey) {
				// Same context reacquiring same resource - allow reentrancy
				currentContext.count++;

				return () => {
					// Only release when count reaches zero
					currentContext.count--;
				};
			}
		}

		// Check if lock is available
		const owningContextId = this.locks.get(resourceKey);

		if (!owningContextId) {
			// Lock is free - acquire immediately
			return this.acquireLock(resourceKey);
		}

		// Lock is held - join the queue
		return this.enqueue(resourceKey);
	}

	/**
	 * Try to acquire lock without waiting
	 *
	 * @param resourceKey - Unique identifier for the resource to lock
	 * @returns Release function if successful, null if lock is held
	 */
	tryAcquire(resourceKey: string): (() => void) | null {
		const currentContext = this.asyncLocalStorage.getStore();

		// Check reentrancy
		if (
			this.options.allowReentrancy &&
			currentContext &&
			currentContext.resourceKey === resourceKey
		) {
			currentContext.count++;
			return () => {
				currentContext.count--;
			};
		}

		// Check if lock is free
		if (this.locks.has(resourceKey)) {
			return null; // Lock is held
		}

		// Acquire immediately
		return this.acquireLockSync(resourceKey);
	}

	/**
	 * Check if a resource is currently locked
	 */
	isLocked(resourceKey: string): boolean {
		return this.locks.has(resourceKey);
	}

	/**
	 * Get number of waiters for a resource
	 */
	getWaitCount(resourceKey: string): number {
		return this.queues.get(resourceKey)?.length ?? 0;
	}

	/**
	 * Acquire lock immediately (internal)
	 */
	private acquireLock(resourceKey: string): () => void {
		const contextId = this.generateContextId();

		// Store lock ownership
		this.locks.set(resourceKey, contextId);

		// Create lock context for reentrancy tracking
		const lockContext: LockContext = {
			resourceKey,
			acquiredAt: Date.now(),
			count: 1
		};

		// Store context for reentrancy detection
		this.asyncLocalStorage.enterWith(lockContext);

		// Return release function
		return () => {
			this.releaseLock(resourceKey, contextId);
		};
	}

	/**
	 * Acquire lock synchronously (for tryAcquire)
	 */
	private acquireLockSync(resourceKey: string): () => void {
		const contextId = this.generateContextId();
		this.locks.set(resourceKey, contextId);

		const lockContext: LockContext = {
			resourceKey,
			acquiredAt: Date.now(),
			count: 1
		};

		// Store context
		this.asyncLocalStorage.enterWith(lockContext);

		return () => {
			this.releaseLock(resourceKey, contextId);
		};
	}

	/**
	 * Release lock (internal)
	 */
	private releaseLock(resourceKey: string, contextId: string): void {
		// Get current context to check reentry count
		const currentContext = this.asyncLocalStorage.getStore();

		// If this is a reentrant release and count > 1, just decrement
		if (
			currentContext &&
			currentContext.resourceKey === resourceKey &&
			currentContext.count > 1
		) {
			currentContext.count--;
			return;
		}

		// Verify ownership
		const owningContextId = this.locks.get(resourceKey);

		if (owningContextId !== contextId) {
			// Lock already released or acquired by another context
			return;
		}

		// Remove lock
		this.locks.delete(resourceKey);

		// Process queue
		const queue = this.queues.get(resourceKey);

		if (!queue || queue.length === 0) {
			// No waiters - cleanup queue
			this.queues.delete(resourceKey);
			return;
		}

		// Wake up next waiter (FIFO)
		const nextEntry = queue.shift()!;

		// Clear timeout
		clearTimeout(nextEntry.timeoutId);

		// Transfer lock to next waiter
		this.locks.set(resourceKey, nextEntry.contextId);

		// Create context for next holder
		const lockContext: LockContext = {
			resourceKey,
			acquiredAt: Date.now(),
			count: 1
		};

		// Resolve their promise with proper context
		this.asyncLocalStorage.run(lockContext, () => {
			nextEntry.resolve();
		});
	}

	/**
	 * Add to wait queue (internal)
	 */
	private async enqueue(resourceKey: string): Promise<() => void> {
		return new Promise<() => void>((resolve, reject) => {
			const contextId = this.generateContextId();

			// Create timeout
			const timeoutId = setTimeout(() => {
				// Remove from queue
				const queue = this.queues.get(resourceKey);
				if (queue) {
					const index = queue.findIndex((e) => e.contextId === contextId);
					if (index >= 0) {
						queue.splice(index, 1);
					}
				}

				// Reject with timeout error
				reject(new MutexTimeoutError(resourceKey, this.options.timeout));
			}, this.options.timeout);

			// Create queue entry
			const entry: QueueEntry = {
				resolve: () => {
					// Lock acquired - create release function
					resolve(() => this.releaseLock(resourceKey, contextId));
				},
				reject,
				contextId,
				timeoutId
			};

			// Add to queue
			let queue = this.queues.get(resourceKey);
			if (!queue) {
				queue = [];
				this.queues.set(resourceKey, queue);
			}
			queue.push(entry);
		});
	}

	/**
	 * Generate unique context ID
	 */
	private generateContextId(): string {
		return `ctx-${++this.contextIdCounter}`;
	}

	/**
	 * Get statistics about current mutex state (for debugging)
	 */
	getStats() {
		return {
			lockedResources: this.locks.size,
			totalWaiters: Array.from(this.queues.values()).reduce(
				(sum, queue) => sum + queue.length,
				0
			),
			resourcesWithWaiters: this.queues.size
		};
	}

	/**
	 * Force release all locks (for cleanup/testing)
	 * WARNING: Use only for cleanup, not in production code
	 */
	releaseAll(): void {
		// Clear all timeouts
		for (const queue of this.queues.values()) {
			for (const entry of queue) {
				clearTimeout(entry.timeoutId);
				entry.reject(new Error('Mutex forcefully released'));
			}
		}

		this.locks.clear();
		this.queues.clear();
	}
}
