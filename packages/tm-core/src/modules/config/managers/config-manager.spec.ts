/**
 * @fileoverview Integration tests for ConfigManager
 * Tests the orchestration of all configuration services
 *
 * This test suite demonstrates the factory-based mocking pattern:
 * - Centralized mock creation via test-helpers
 * - Type-safe mock access via MockRegistry
 * - Zero duplication across tests
 * - Easy override for specific test cases
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigManager } from './config-manager.js';
import { DEFAULT_CONFIG_VALUES } from '../../../common/interfaces/configuration.interface.js';

// Import factory functions and mock utilities
import {
	createMockConfigLoader,
	createMockConfigMerger,
	createMockRuntimeStateManager,
	createMockConfigPersistence,
	createMockEnvironmentConfigProvider,
	type ConfigManagerMocks,
	MockRegistry,
	createRegisteredMocks
} from '../../../../tests/test-helpers/index.js';

// Create type-safe mock registry
const mockRegistry = new MockRegistry<ConfigManagerMocks>();

// Set up all service mocks with registry integration
const serviceMocks = createRegisteredMocks(mockRegistry, {
	loader: {
		factory: (overrides?: Record<string, any>) =>
			createMockConfigLoader({
				getDefaultConfig: vi.fn().mockReturnValue({
					models: { main: 'default-model', fallback: 'fallback-model' },
					storage: { type: 'file' },
					version: '1.0.0'
				}),
				...overrides
			}),
		className: 'ConfigLoader'
	},
	merger: {
		factory: (overrides?: Record<string, any>) =>
			createMockConfigMerger({
				merge: vi.fn().mockReturnValue({
					models: { main: 'merged-model', fallback: 'fallback-model' },
					storage: { type: 'file' }
				}),
				...overrides
			}),
		className: 'ConfigMerger'
	},
	stateManager: {
		factory: createMockRuntimeStateManager,
		className: 'RuntimeStateManager'
	},
	persistence: {
		factory: createMockConfigPersistence,
		className: 'ConfigPersistence'
	},
	envProvider: {
		factory: createMockEnvironmentConfigProvider,
		className: 'EnvironmentConfigProvider'
	}
});

// Apply mocks at module level
vi.mock('../services/config-loader.service.js', () => serviceMocks.loader);
vi.mock('../services/config-merger.service.js', () => ({
	...serviceMocks.merger,
	CONFIG_PRECEDENCE: {
		DEFAULTS: 0,
		GLOBAL: 1,
		LOCAL: 2,
		ENVIRONMENT: 3
	}
}));
vi.mock('../services/runtime-state-manager.service.js', () => serviceMocks.stateManager);
vi.mock('../services/config-persistence.service.js', () => serviceMocks.persistence);
vi.mock('../services/environment-config-provider.service.js', () => serviceMocks.envProvider);

describe('ConfigManager', () => {
	let manager: ConfigManager;
	const testProjectRoot = '/test/project';
	const originalEnv = { ...process.env };

	beforeEach(async () => {
		vi.clearAllMocks();
		mockRegistry.clear(); // Clear registry for fresh mocks

		// Clear environment variables
		Object.keys(process.env).forEach((key) => {
			if (key.startsWith('TASKMASTER_')) {
				delete process.env[key];
			}
		});

		// Create manager instance (triggers mock registration)
		manager = await ConfigManager.create(testProjectRoot);
	});

	afterEach(() => {
		mockRegistry.clear(); // Defensive clearing in case of exceptions
		vi.restoreAllMocks();
		process.env = { ...originalEnv };
	});

	// Helper to get mocks with type safety
	const getMocks = () => mockRegistry.getAll();

	describe('creation', () => {
		it('should initialize all services when created', () => {
			// Verify all services are registered
			expect(mockRegistry.has('loader')).toBe(true);
			expect(mockRegistry.has('merger')).toBe(true);
			expect(mockRegistry.has('stateManager')).toBe(true);
			expect(mockRegistry.has('persistence')).toBe(true);
			expect(mockRegistry.has('envProvider')).toBe(true);
		});
	});

	describe('create (factory method)', () => {
		it('should create and initialize manager', async () => {
			const createdManager = await ConfigManager.create(testProjectRoot);

			expect(createdManager).toBeInstanceOf(ConfigManager);
			expect(createdManager.getConfig()).toBeDefined();
		});
	});

	describe('initialization (via create)', () => {
		it('should load and merge all configuration sources', () => {
			const { loader, merger, stateManager, envProvider } = getMocks();

			// Verify loading sequence
			expect(merger.clearSources).toHaveBeenCalled();
			expect(loader.getDefaultConfig).toHaveBeenCalled();
			expect(loader.loadGlobalConfig).toHaveBeenCalled();
			expect(loader.loadLocalConfig).toHaveBeenCalled();
			expect(envProvider.loadConfig).toHaveBeenCalled();
			expect(merger.merge).toHaveBeenCalled();
			expect(stateManager.loadState).toHaveBeenCalled();
		});

		it('should add sources with correct precedence during creation', () => {
			const { merger } = getMocks();

			// Check that sources were added with correct precedence
			expect(merger.addSource).toHaveBeenCalledWith(
				expect.objectContaining({
					name: 'defaults',
					precedence: 0
				})
			);

			// Note: local and env sources may not be added if they don't exist
			// The mock setup determines what gets called
		});
	});

	describe('configuration access', () => {
		// Manager is already initialized in the main beforeEach

		it('should return merged configuration', () => {
			const config = manager.getConfig();
			expect(config).toEqual({
				models: { main: 'merged-model', fallback: 'fallback-model' },
				storage: { type: 'file' }
			});
		});

		it('should return storage configuration', () => {
			const storage = manager.getStorageConfig();
			expect(storage).toEqual({
				type: 'file',
				basePath: testProjectRoot,
				apiConfigured: false
			});
		});

		it('should return API storage configuration when configured', async () => {
			// Use the registered mock and configure its merge behavior
			const { merger } = getMocks();

			merger.merge.mockReturnValue({
				storage: {
					type: 'api',
					apiEndpoint: 'https://api.example.com',
					apiAccessToken: 'token123'
				}
			});

			// Re-initialize to apply the new merge result
			await (manager as any).initialize();

			const storage = manager.getStorageConfig();
			expect(storage).toEqual({
				type: 'api',
				apiEndpoint: 'https://api.example.com',
				apiAccessToken: 'token123',
				basePath: testProjectRoot,
				apiConfigured: true
			});
		});

		it('should return model configuration', () => {
			const models = manager.getModelConfig();
			expect(models).toEqual({
				main: 'merged-model',
				fallback: 'fallback-model'
			});
		});

		it('should return default models when not configured', () => {
			// Update the mock for current instance
			const { merger } = getMocks();
			merger.merge.mockReturnValue({});
			// Force re-merge
			(manager as any).config = merger.merge();

			const models = manager.getModelConfig();
			expect(models).toEqual({
				main: DEFAULT_CONFIG_VALUES.MODELS.MAIN,
				fallback: DEFAULT_CONFIG_VALUES.MODELS.FALLBACK
			});
		});

		it('should return response language', () => {
			const language = manager.getResponseLanguage();
			expect(language).toBe('English');
		});

		it('should return custom response language', () => {
			// Update config for current instance
			(manager as any).config = {
				custom: { responseLanguage: 'Spanish' }
			};

			const language = manager.getResponseLanguage();
			expect(language).toBe('Spanish');
		});

		it('should return project root', () => {
			expect(manager.getProjectRoot()).toBe(testProjectRoot);
		});

		it('should check if API is explicitly configured', () => {
			expect(manager.isApiExplicitlyConfigured()).toBe(false);
		});

		it('should detect when API is explicitly configured', () => {
			// Update config for current instance
			(manager as any).config = {
				storage: {
					type: 'api',
					apiEndpoint: 'https://api.example.com',
					apiAccessToken: 'token'
				}
			};

			expect(manager.isApiExplicitlyConfigured()).toBe(true);
		});
	});

	describe('runtime state', () => {
		// Manager is already initialized in the main beforeEach

		it('should get active tag from state manager', () => {
			const tag = manager.getActiveTag();
			expect(tag).toBe('master');
		});

		it('should set active tag through state manager', async () => {
			const { stateManager } = getMocks();

			await manager.setActiveTag('feature-branch');

			expect(stateManager.setCurrentTag).toHaveBeenCalledWith('feature-branch');
		});
	});

	describe('configuration updates', () => {
		// Manager is already initialized in the main beforeEach

		it('should update configuration and save', async () => {
			const { persistence } = getMocks();

			const updates = {
				models: { main: 'new-model', fallback: 'fallback-model' }
			};
			await manager.updateConfig(updates);

			expect(persistence.saveConfig).toHaveBeenCalled();
		});

		it('should re-initialize after update to maintain precedence', async () => {
			const { merger } = getMocks();
			merger.clearSources.mockClear();

			await manager.updateConfig({ custom: { test: 'value' } });

			expect(merger.clearSources).toHaveBeenCalled();
		});

		it('should set response language', async () => {
			const { persistence } = getMocks();

			await manager.setResponseLanguage('French');

			expect(persistence.saveConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					custom: { responseLanguage: 'French' }
				})
			);
		});

		it('should save configuration with options', async () => {
			const { persistence } = getMocks();

			await manager.saveConfig();

			expect(persistence.saveConfig).toHaveBeenCalledWith(expect.any(Object), {
				createBackup: true,
				atomic: true
			});
		});
	});

	describe('utilities', () => {
		// Manager is already initialized in the main beforeEach

		it('should reset configuration to defaults', async () => {
			const { persistence, stateManager } = getMocks();

			await manager.reset();

			expect(persistence.deleteConfig).toHaveBeenCalled();
			expect(stateManager.clearState).toHaveBeenCalled();
		});

		it('should re-initialize after reset', async () => {
			const { merger } = getMocks();
			merger.clearSources.mockClear();

			await manager.reset();

			expect(merger.clearSources).toHaveBeenCalled();
		});

		it('should get configuration sources for debugging', () => {
			const { merger } = getMocks();
			const mockSources = [{ name: 'test', config: {}, precedence: 1 }];
			merger.getSources.mockReturnValue(mockSources);

			const sources = manager.getConfigSources();

			expect(sources).toEqual(mockSources);
		});
	});

	describe('error handling', () => {
		it('should handle missing services gracefully', async () => {
			const { loader } = getMocks();

			// Even if a service fails, manager should still work
			loader.loadLocalConfig.mockRejectedValue(new Error('File error'));

			// Creating a new manager should not throw even if service fails
			await expect(
				ConfigManager.create(testProjectRoot)
			).resolves.not.toThrow();
		});
	});
});
