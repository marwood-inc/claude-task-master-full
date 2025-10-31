/**
 * @fileoverview Mock factories for service constructor testing
 * Provides properly constructed mock instances for service classes
 * that can be used with vi.mock() to replace class constructors.
 *
 * Usage:
 * ```typescript
 * import { createMockConfigLoader } from '../../../../../tests/test-helpers/index.js';
 *
 * vi.mock('../../services/config-loader.service.js', () => ({
 *   ConfigLoader: vi.fn().mockImplementation(() => createMockConfigLoader())
 * }));
 * ```
 */

import { vi } from 'vitest';
import type { MockedFunction } from 'vitest';

/**
 * Creates a mocked ConfigLoader instance with all methods pre-mocked
 * Includes sensible default implementations that can be overridden per test
 *
 * @param overrides - Optional partial mock to override default behavior
 * @returns Mocked ConfigLoader instance
 *
 * @example
 * ```typescript
 * const mockLoader = createMockConfigLoader({
 *   loadLocalConfig: vi.fn().mockResolvedValue({ models: { main: 'custom' } })
 * });
 * ```
 */
export function createMockConfigLoader(overrides?: Record<string, any>) {
	const mock = {
		getDefaultConfig: vi.fn().mockReturnValue({
			models: {
				main: 'claude-3-5-sonnet-20241022',
				fallback: 'claude-3-5-haiku-20241022'
			},
			storage: {
				type: 'file' as const,
				encoding: 'utf-8',
				enableBackup: false,
				maxBackups: 5,
				enableCompression: false,
				atomicOperations: true
			},
			version: '1.0.0'
		}),
		loadLocalConfig: vi.fn().mockResolvedValue(null),
		loadGlobalConfig: vi.fn().mockResolvedValue(null),
		hasLocalConfig: vi.fn().mockResolvedValue(false),
		hasGlobalConfig: vi.fn().mockResolvedValue(false)
	};

	return overrides ? { ...mock, ...overrides } : mock;
}

/**
 * Creates a mocked ConfigMerger instance with all methods pre-mocked
 *
 * @param overrides - Optional partial mock to override default behavior
 * @returns Mocked ConfigMerger instance
 *
 * @example
 * ```typescript
 * const mockMerger = createMockConfigMerger({
 *   merge: vi.fn().mockReturnValue({ custom: 'config' })
 * });
 * ```
 */
export function createMockConfigMerger(overrides?: Record<string, any>) {
	const mock = {
		addSource: vi.fn(),
		clearSources: vi.fn(),
		merge: vi.fn().mockReturnValue({
			models: {
				main: 'merged-model',
				fallback: 'fallback-model'
			},
			storage: {
				type: 'file' as const
			}
		}),
		getSources: vi.fn().mockReturnValue([]),
		hasSource: vi.fn().mockReturnValue(false),
		removeSource: vi.fn().mockReturnValue(false)
	};

	return overrides ? { ...mock, ...overrides } : mock;
}

/**
 * Creates a mocked RuntimeStateManager instance with all methods pre-mocked
 *
 * @param overrides - Optional partial mock to override default behavior
 * @returns Mocked RuntimeStateManager instance
 *
 * @example
 * ```typescript
 * const mockStateManager = createMockRuntimeStateManager({
 *   getCurrentTag: vi.fn().mockReturnValue('feature-branch')
 * });
 * ```
 */
export function createMockRuntimeStateManager(overrides?: Record<string, any>) {
	const mock = {
		loadState: vi.fn().mockResolvedValue({ activeTag: 'master' }),
		saveState: vi.fn().mockResolvedValue(undefined),
		getCurrentTag: vi.fn().mockReturnValue('master'),
		setCurrentTag: vi.fn().mockResolvedValue(undefined),
		getState: vi.fn().mockReturnValue({ activeTag: 'master' }),
		updateMetadata: vi.fn().mockResolvedValue(undefined),
		clearState: vi.fn().mockResolvedValue(undefined)
	};

	return overrides ? { ...mock, ...overrides } : mock;
}

/**
 * Creates a mocked ConfigPersistence instance with all methods pre-mocked
 *
 * @param overrides - Optional partial mock to override default behavior
 * @returns Mocked ConfigPersistence instance
 *
 * @example
 * ```typescript
 * const mockPersistence = createMockConfigPersistence({
 *   configExists: vi.fn().mockResolvedValue(true)
 * });
 * ```
 */
export function createMockConfigPersistence(overrides?: Record<string, any>) {
	const mock = {
		saveConfig: vi.fn().mockResolvedValue(undefined),
		configExists: vi.fn().mockResolvedValue(false),
		deleteConfig: vi.fn().mockResolvedValue(undefined),
		getBackups: vi.fn().mockResolvedValue([]),
		restoreFromBackup: vi.fn().mockResolvedValue(undefined)
	};

	return overrides ? { ...mock, ...overrides } : mock;
}

/**
 * Creates a mocked EnvironmentConfigProvider instance with all methods pre-mocked
 *
 * @param overrides - Optional partial mock to override default behavior
 * @returns Mocked EnvironmentConfigProvider instance
 *
 * @example
 * ```typescript
 * const mockEnvProvider = createMockEnvironmentConfigProvider({
 *   hasEnvVar: vi.fn().mockReturnValue(true)
 * });
 * ```
 */
export function createMockEnvironmentConfigProvider(overrides?: Record<string, any>) {
	const mock = {
		loadConfig: vi.fn().mockReturnValue({}),
		getRuntimeState: vi.fn().mockReturnValue({}),
		hasEnvVar: vi.fn().mockReturnValue(false),
		getAllTaskmasterEnvVars: vi.fn().mockReturnValue({}),
		addMapping: vi.fn(),
		getMappings: vi.fn().mockReturnValue([])
	};

	return overrides ? { ...mock, ...overrides } : mock;
}

/**
 * Convenience type for ConfigManager test mocks
 * Use with MockRegistry for type-safe mock access
 *
 * @example
 * ```typescript
 * import { MockRegistry } from './mock-registry.js';
 * import type { ConfigManagerMocks } from './service-mocks.js';
 *
 * const mockRegistry = new MockRegistry<ConfigManagerMocks>();
 * const { loader, merger } = mockRegistry.getAll();
 * ```
 */
export interface ConfigManagerMocks {
	loader: ReturnType<typeof createMockConfigLoader>;
	merger: ReturnType<typeof createMockConfigMerger>;
	stateManager: ReturnType<typeof createMockRuntimeStateManager>;
	persistence: ReturnType<typeof createMockConfigPersistence>;
	envProvider: ReturnType<typeof createMockEnvironmentConfigProvider>;
}
