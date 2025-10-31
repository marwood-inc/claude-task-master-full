/**
 * @fileoverview Mock instance registry for integration tests
 * Provides type-safe access to mock service instances created by vi.mock()
 *
 * Problem: vi.mock() creates mocks at module level, but tests need to
 * access and configure specific mock instances. Using (obj as any).prop
 * loses type safety and is fragile.
 *
 * Solution: Registry pattern that captures mock instances during construction
 * and provides typed getters for test access.
 *
 * @example
 * ```typescript
 * // Define mock types
 * interface ServiceMocks {
 *   loader: ReturnType<typeof createMockConfigLoader>;
 *   merger: ReturnType<typeof createMockConfigMerger>;
 * }
 *
 * // Create registry
 * const registry = new MockRegistry<ServiceMocks>();
 *
 * // Set up mocks
 * const mocks = createRegisteredMocks(registry, {
 *   loader: { factory: createMockConfigLoader, className: 'ConfigLoader' },
 *   merger: { factory: createMockConfigMerger, className: 'ConfigMerger' }
 * });
 *
 * vi.mock('./config-loader.js', () => mocks.loader);
 * vi.mock('./config-merger.js', () => mocks.merger);
 *
 * // In tests - type-safe access!
 * const { loader, merger } = registry.getAll();
 * loader.loadLocalConfig.mockResolvedValue({ custom: 'config' });
 * ```
 */

import { vi } from 'vitest';
import type { MockedFunction } from 'vitest';

/**
 * Type-safe mock registry for a test suite
 * Captures mock instances created by vi.mock() constructors
 *
 * @template TMocks - Interface describing all mocks in the registry
 */
export class MockRegistry<TMocks extends Record<string, any>> {
	private mocks: Partial<TMocks> = {};

	/**
	 * Register a mock instance with a key
	 * Called by mock constructors during instantiation
	 *
	 * @param key - Registry key for this mock
	 * @param mock - The mock instance to register
	 * @returns The registered mock (for chaining)
	 */
	register<K extends keyof TMocks>(key: K, mock: TMocks[K]): TMocks[K] {
		this.mocks[key] = mock;
		return mock;
	}

	/**
	 * Get a registered mock with type safety
	 * Throws if mock hasn't been registered (helps catch setup issues)
	 *
	 * @param key - Registry key for the mock
	 * @returns The mock instance with full typing
	 * @throws Error if mock not found
	 */
	get<K extends keyof TMocks>(key: K): TMocks[K] {
		const mock = this.mocks[key];
		if (!mock) {
			throw new Error(
				`Mock '${String(key)}' not found. Ensure the service has been instantiated.`
			);
		}
		return mock;
	}

	/**
	 * Get all registered mocks
	 * Useful for destructuring in tests
	 *
	 * WARNING: Only call this after all mocks have been registered (after service instantiation).
	 * Prefer using get() for individual mocks if called before full registration.
	 *
	 * @returns Object containing all registered mocks
	 *
	 * @example
	 * ```typescript
	 * // After ConfigManager.create() completes
	 * const { loader, merger, persistence } = registry.getAll();
	 * ```
	 */
	getAll(): TMocks {
		// Type assertion is safe here because tests call this after instantiation
		// The MockRegistry pattern guarantees mocks are registered during construction
		return this.mocks as TMocks;
	}

	/**
	 * Clear all registered mocks
	 * Call in beforeEach to reset between tests
	 */
	clear(): void {
		this.mocks = {};
	}

	/**
	 * Check if a mock is registered
	 *
	 * @param key - Registry key to check
	 * @returns True if the mock is registered
	 */
	has<K extends keyof TMocks>(key: K): boolean {
		return key in this.mocks;
	}
}

/**
 * Configuration for a registered mock
 */
interface MockConfig<T> {
	/** Factory function that creates the mock instance */
	factory: (overrides?: Record<string, any>) => T;
	/** Class name for the mock (used in vi.mock() export) */
	className: string;
}

/**
 * Creates multiple vi.mock() compatible mocks with registry integration
 * Reduces boilerplate when setting up many mocks
 *
 * @param registry - Registry to store created mocks
 * @param configs - Map of mock configurations
 * @returns Object with mock exports for vi.mock() calls
 *
 * @example
 * ```typescript
 * const registry = new MockRegistry<ConfigMocks>();
 *
 * const mocks = createRegisteredMocks(registry, {
 *   loader: { factory: createMockConfigLoader, className: 'ConfigLoader' },
 *   merger: { factory: createMockConfigMerger, className: 'ConfigMerger' }
 * });
 *
 * vi.mock('./config-loader.js', () => mocks.loader);
 * vi.mock('./config-merger.js', () => mocks.merger);
 *
 * // Mocks are automatically registered during construction
 * const { loader } = registry.getAll();
 * ```
 */
export function createRegisteredMocks<TMocks extends Record<string, any>>(
	registry: MockRegistry<TMocks>,
	configs: {
		[K in keyof TMocks]: MockConfig<TMocks[K]>;
	}
): Record<keyof TMocks, Record<string, MockedFunction<any>>> {
	const result: any = {};

	for (const [key, config] of Object.entries(configs) as Array<
		[keyof TMocks, MockConfig<TMocks[keyof TMocks]>]
	>) {
		result[key] = {
			[config.className]: vi.fn().mockImplementation((overrides?: Record<string, any>) => {
				const mockInstance = config.factory(overrides);
				return registry.register(key, mockInstance);
			})
		};
	}

	return result;
}
