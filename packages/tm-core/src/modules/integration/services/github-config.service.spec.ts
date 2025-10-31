/**
 * Tests for GitHub Configuration Service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitHubConfigService } from './github-config.service.js';
import { ConfigManager } from '../../config/managers/config-manager.js';
import type { GitHubSettings } from '../../../common/interfaces/configuration.interface.js';

// Mock ConfigManager
vi.mock('../../config/managers/config-manager.js');

describe('GitHubConfigService', () => {
	let service: GitHubConfigService;
	let mockConfigManager: any;
	let originalEnv: NodeJS.ProcessEnv;

	const mockGitHubConfig: GitHubSettings = {
		enabled: true,
		token: 'test-token-123',
		owner: 'test-owner',
		repo: 'test-repo',
		subtaskMode: 'checklist',
		conflictResolution: 'manual',
		syncDirection: 'bidirectional',
		autoSync: false,
		features: {
			syncMilestones: true,
			syncProjects: false,
			syncAssignees: true,
			syncLabels: true
		}
	};

	beforeEach(() => {
		// Save original environment
		originalEnv = { ...process.env };
		delete process.env.GITHUB_TOKEN;

		// Create mock ConfigManager
		mockConfigManager = {
			getConfig: vi.fn(),
			updateConfig: vi.fn().mockResolvedValue(undefined)
		};

		service = new GitHubConfigService(mockConfigManager);
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Restore environment
		process.env = originalEnv;
	});

	describe('getConfig', () => {
		it('should return GitHub configuration', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			const result = service.getConfig();

			expect(result).toEqual(mockGitHubConfig);
		});

		it('should return undefined when no GitHub configuration exists', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			const result = service.getConfig();

			expect(result).toBeUndefined();
		});
	});

	describe('isConfigured', () => {
		it('should return true when GitHub is configured and enabled', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.isConfigured()).toBe(true);
		});

		it('should return false when GitHub is configured but disabled', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, enabled: false }
			});

			expect(service.isConfigured()).toBe(false);
		});

		it('should return false when GitHub is not configured', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			expect(service.isConfigured()).toBe(false);
		});
	});

	describe('isEnabled', () => {
		it('should return true when enabled', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.isEnabled()).toBe(true);
		});

		it('should return false when disabled', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, enabled: false }
			});

			expect(service.isEnabled()).toBe(false);
		});
	});

	describe('getToken', () => {
		it('should return token from configuration', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.getToken()).toBe('test-token-123');
		});

		it('should return token from environment variable when not in config', () => {
			process.env.GITHUB_TOKEN = 'env-token-456';
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, token: undefined }
			});

			expect(service.getToken()).toBe('env-token-456');
		});

		it('should prefer config token over environment variable', () => {
			process.env.GITHUB_TOKEN = 'env-token-456';
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.getToken()).toBe('test-token-123');
		});
	});

	describe('getOwner and getRepo', () => {
		it('should return owner and repo', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.getOwner()).toBe('test-owner');
			expect(service.getRepo()).toBe('test-repo');
		});

		it('should return undefined when not configured', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			expect(service.getOwner()).toBeUndefined();
			expect(service.getRepo()).toBeUndefined();
		});
	});

	describe('getRepositoryIdentifier', () => {
		it('should return owner/repo format', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.getRepositoryIdentifier()).toBe('test-owner/test-repo');
		});

		it('should return undefined when owner or repo is missing', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, repo: undefined }
			});

			expect(service.getRepositoryIdentifier()).toBeUndefined();
		});
	});

	describe('getSubtaskMode', () => {
		it('should return configured subtask mode', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.getSubtaskMode()).toBe('checklist');
		});

		it('should return default checklist mode when not configured', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			expect(service.getSubtaskMode()).toBe('checklist');
		});
	});

	describe('getConflictResolution', () => {
		it('should return configured conflict resolution', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.getConflictResolution()).toBe('manual');
		});

		it('should return default manual when not configured', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			expect(service.getConflictResolution()).toBe('manual');
		});
	});

	describe('getSyncDirection', () => {
		it('should return configured sync direction', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.getSyncDirection()).toBe('bidirectional');
		});

		it('should return default bidirectional when not configured', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			expect(service.getSyncDirection()).toBe('bidirectional');
		});
	});

	describe('isAutoSyncEnabled', () => {
		it('should return configured auto-sync value', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			expect(service.isAutoSyncEnabled()).toBe(false);
		});

		it('should return false when not configured', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			expect(service.isAutoSyncEnabled()).toBe(false);
		});
	});

	describe('getFeatures', () => {
		it('should return configured features', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			const features = service.getFeatures();

			expect(features.syncMilestones).toBe(true);
			expect(features.syncProjects).toBe(false);
			expect(features.syncAssignees).toBe(true);
			expect(features.syncLabels).toBe(true);
		});

		it('should return default features when not configured', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			const features = service.getFeatures();

			expect(features.syncMilestones).toBe(false);
			expect(features.syncProjects).toBe(false);
			expect(features.syncAssignees).toBe(false);
			expect(features.syncLabels).toBe(true);
		});
	});

	describe('isFeatureEnabled', () => {
		beforeEach(() => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});
		});

		it('should return true for enabled features', () => {
			expect(service.isFeatureEnabled('syncMilestones')).toBe(true);
			expect(service.isFeatureEnabled('syncLabels')).toBe(true);
		});

		it('should return false for disabled features', () => {
			expect(service.isFeatureEnabled('syncProjects')).toBe(false);
		});
	});

	describe('updateConfig', () => {
		it('should update GitHub configuration', async () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			await service.updateConfig({
				subtaskMode: 'separate-issues'
			});

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					subtaskMode: 'separate-issues'
				})
			});
		});

		it('should merge features separately', async () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			await service.updateConfig({
				features: {
					syncProjects: true
				} as any
			});

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					features: expect.objectContaining({
						syncProjects: true,
						syncMilestones: true // original value
					})
				})
			});
		});
	});

	describe('enable and disable', () => {
		beforeEach(() => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});
		});

		it('should enable GitHub integration', async () => {
			await service.enable();

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					enabled: true
				})
			});
		});

		it('should disable GitHub integration', async () => {
			await service.disable();

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					enabled: false
				})
			});
		});
	});

	describe('setters', () => {
		beforeEach(() => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});
		});

		it('should set token', async () => {
			await service.setToken('new-token');

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					token: 'new-token'
				})
			});
		});

		it('should set repository', async () => {
			await service.setRepository('new-owner', 'new-repo');

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					owner: 'new-owner',
					repo: 'new-repo'
				})
			});
		});

		it('should set subtask mode', async () => {
			await service.setSubtaskMode('separate-issues');

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					subtaskMode: 'separate-issues'
				})
			});
		});
	});

	describe('enableFeature and disableFeature', () => {
		beforeEach(() => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});
		});

		it('should enable a feature', async () => {
			await service.enableFeature('syncProjects');

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					features: expect.objectContaining({
						syncProjects: true
					})
				})
			});
		});

		it('should disable a feature', async () => {
			await service.disableFeature('syncLabels');

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: expect.objectContaining({
					features: expect.objectContaining({
						syncLabels: false
					})
				})
			});
		});
	});

	describe('validate', () => {
		it('should return valid for properly configured GitHub', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			const validation = service.validate();

			expect(validation.valid).toBe(true);
			expect(validation.errors).toHaveLength(0);
			expect(validation.enabled).toBe(true);
			expect(validation.hasRequiredFields).toBe(true);
		});

		it('should return error when configuration is missing', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			const validation = service.validate();

			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain('GitHub configuration not found');
		});

		it('should return warning when disabled', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, enabled: false }
			});

			const validation = service.validate();

			expect(validation.warnings).toContain('GitHub integration is disabled');
		});

		it('should return error when token is missing', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, token: undefined }
			});

			const validation = service.validate();

			expect(validation.valid).toBe(false);
			expect(validation.errors.some((e) => e.includes('token'))).toBe(true);
		});

		it('should validate with environment token', () => {
			process.env.GITHUB_TOKEN = 'env-token';
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, token: undefined }
			});

			const validation = service.validate();

			expect(validation.valid).toBe(true);
			expect(validation.hasRequiredFields).toBe(true);
		});

		it('should return error when owner is missing', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, owner: undefined }
			});

			const validation = service.validate();

			expect(validation.valid).toBe(false);
			expect(validation.errors.some((e) => e.includes('owner'))).toBe(true);
		});

		it('should return error when repo is missing', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: { ...mockGitHubConfig, repo: undefined }
			});

			const validation = service.validate();

			expect(validation.valid).toBe(false);
			expect(validation.errors.some((e) => e.includes('name'))).toBe(true);
		});
	});

	describe('clearConfig', () => {
		it('should clear GitHub configuration', async () => {
			await service.clearConfig();

			expect(mockConfigManager.updateConfig).toHaveBeenCalledWith({
				github: undefined
			});
		});
	});

	describe('getSummary', () => {
		it('should return configuration summary', () => {
			mockConfigManager.getConfig.mockReturnValue({
				github: mockGitHubConfig
			});

			const summary = service.getSummary();

			expect(summary.configured).toBe(true);
			expect(summary.enabled).toBe(true);
			expect(summary.repository).toBe('test-owner/test-repo');
			expect(summary.subtaskMode).toBe('checklist');
			expect(summary.autoSync).toBe(false);
		});

		it('should return unconfigured summary when no config exists', () => {
			mockConfigManager.getConfig.mockReturnValue({});

			const summary = service.getSummary();

			expect(summary.configured).toBe(false);
			expect(summary.enabled).toBe(false);
			expect(summary.repository).toBeUndefined();
		});
	});
});
