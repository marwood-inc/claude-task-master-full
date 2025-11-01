import { describe, it, expect, beforeEach } from 'vitest';
import { GitHubValidationService } from './github-validation.service.js';
import type {
	GitHubSyncOptions,
	ValidationResult
} from './github-validation.service.js';
import type { GitHubSettings } from '../../../common/interfaces/configuration.interface.js';

describe('GitHubValidationService', () => {
	let service: GitHubValidationService;

	beforeEach(() => {
		service = new GitHubValidationService();
	});

	describe('validateSyncOptions', () => {
		describe('mode validation', () => {
			it('should accept valid one-way mode', () => {
				const options: GitHubSyncOptions = { mode: 'one-way' };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
				expect(result.metadata.validatedAspects).toContain('mode');
			});

			it('should accept valid two-way mode', () => {
				const options: GitHubSyncOptions = { mode: 'two-way' };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it('should reject invalid mode', () => {
				const options = { mode: 'invalid' } as GitHubSyncOptions;
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0]).toMatchObject({
					code: 'INVALID_SYNC_MODE',
					field: 'mode',
					expected: '"one-way" or "two-way"',
					actual: 'invalid'
				});
				expect(result.errors[0].suggestion).toBeDefined();
			});
		});

		describe('subtaskMode validation', () => {
			it('should accept valid checklist mode', () => {
				const options: GitHubSyncOptions = { subtaskMode: 'checklist' };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
				expect(result.metadata.validatedAspects).toContain('subtaskMode');
			});

			it('should accept valid separate-issues mode', () => {
				const options: GitHubSyncOptions = { subtaskMode: 'separate-issues' };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it('should reject invalid subtask mode', () => {
				const options = { subtaskMode: 'invalid' } as GitHubSyncOptions;
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0]).toMatchObject({
					code: 'INVALID_SUBTASK_MODE',
					field: 'subtaskMode',
					expected: '"checklist" or "separate-issues"',
					actual: 'invalid'
				});
			});
		});

		describe('repo format validation', () => {
			it('should accept valid repo format', () => {
				const options: GitHubSyncOptions = { repo: 'owner/repo' };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
				expect(result.metadata.validatedAspects).toContain('repo');
			});

			it('should reject repo without slash', () => {
				const options: GitHubSyncOptions = { repo: 'invalidrepo' };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0]).toMatchObject({
					code: 'INVALID_REPO_FORMAT',
					field: 'repo',
					actual: 'invalidrepo'
				});
			});

			it('should reject repo with empty owner', () => {
				const options: GitHubSyncOptions = { repo: '/repo' };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].code).toBe('INVALID_REPO_FORMAT');
			});

			it('should reject repo with empty name', () => {
				const options: GitHubSyncOptions = { repo: 'owner/' };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(false);
				expect(result.errors).toHaveLength(1);
			});
		});

		describe('context-aware validation', () => {
			it('should warn when force is used with manual conflict resolution', () => {
				const options: GitHubSyncOptions = { force: true };
				const config: Partial<GitHubSettings> = {
					conflictResolution: 'manual'
				} as GitHubSettings;

				const result = service.validateSyncOptions(options, config as GitHubSettings);

				expect(result.valid).toBe(true);
				expect(result.warnings).toHaveLength(1);
				expect(result.warnings[0]).toMatchObject({
					code: 'FORCE_WITH_MANUAL_RESOLUTION',
					field: 'force',
					severity: 'high'
				});
			});

			it('should warn when dryRun is used with force', () => {
				const options: GitHubSyncOptions = { dryRun: true, force: true };
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(true);
				expect(result.warnings).toHaveLength(1);
				expect(result.warnings[0]).toMatchObject({
					code: 'DRY_RUN_WITH_FORCE',
					severity: 'low'
				});
			});

			it('should include config snapshot in metadata when provided', () => {
				const options: GitHubSyncOptions = { mode: 'one-way' };
				const config: Partial<GitHubSettings> = {
					subtaskMode: 'checklist',
					conflictResolution: 'manual'
				} as GitHubSettings;

				const result = service.validateSyncOptions(options, config as GitHubSettings);

				expect(result.metadata.configSnapshot).toBeDefined();
				expect(result.metadata.configSnapshot?.subtaskMode).toBe('checklist');
				expect(result.metadata.configSnapshot?.conflictResolution).toBe(
					'manual'
				);
			});
		});

		describe('edge cases', () => {
			it('should accept empty options', () => {
				const options: GitHubSyncOptions = {};
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it('should validate multiple errors at once', () => {
				const options = {
					mode: 'invalid',
					subtaskMode: 'wrong',
					repo: 'badformat'
				} as GitHubSyncOptions;
				const result = service.validateSyncOptions(options);

				expect(result.valid).toBe(false);
				expect(result.errors.length).toBeGreaterThanOrEqual(3);
			});

			it('should include timestamp in metadata', () => {
				const options: GitHubSyncOptions = { mode: 'one-way' };
				const result = service.validateSyncOptions(options);

				expect(result.metadata.timestamp).toBeDefined();
				expect(new Date(result.metadata.timestamp)).toBeInstanceOf(Date);
			});
		});
	});

	describe('validateConfig', () => {
		const validConfig: GitHubSettings = {
			enabled: true,
			token: 'ghp_test123',
			owner: 'testowner',
			repo: 'testrepo',
			subtaskMode: 'checklist',
			conflictResolution: 'manual',
			syncDirection: 'bidirectional',
			autoSync: false,
			features: {
				syncMilestones: true,
				syncProjects: false,
				syncAssignees: false,
				syncLabels: true
			}
		};

		it('should validate complete valid configuration', () => {
			const result = service.validateConfig(validConfig);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.metadata.validatedAspects).toContain('token');
			expect(result.metadata.validatedAspects).toContain('owner');
			expect(result.metadata.validatedAspects).toContain('repo');
		});

		it('should reject missing owner', () => {
			const config = { ...validConfig, owner: '' };
			const result = service.validateConfig(config);

			expect(result.valid).toBe(false);
			const ownerError = result.errors.find((e) => e.code === 'MISSING_OWNER');
			expect(ownerError).toBeDefined();
			expect(ownerError?.suggestion).toBeDefined();
		});

		it('should reject missing repo', () => {
			const config = { ...validConfig, repo: '' };
			const result = service.validateConfig(config);

			expect(result.valid).toBe(false);
			const repoError = result.errors.find((e) => e.code === 'MISSING_REPO');
			expect(repoError).toBeDefined();
		});

		it('should reject invalid subtaskMode', () => {
			const config = { ...validConfig, subtaskMode: 'invalid' as any };
			const result = service.validateConfig(config);

			expect(result.valid).toBe(false);
			const error = result.errors.find((e) => e.code === 'INVALID_SUBTASK_MODE');
			expect(error).toBeDefined();
			expect(error?.actual).toBe('invalid');
		});

		it('should reject invalid conflictResolution', () => {
			const config = { ...validConfig, conflictResolution: 'invalid' as any };
			const result = service.validateConfig(config);

			expect(result.valid).toBe(false);
			const error = result.errors.find(
				(e) => e.code === 'INVALID_CONFLICT_RESOLUTION'
			);
			expect(error).toBeDefined();
		});

		it('should reject invalid syncDirection', () => {
			const config = { ...validConfig, syncDirection: 'invalid' as any };
			const result = service.validateConfig(config);

			expect(result.valid).toBe(false);
			const error = result.errors.find(
				(e) => e.code === 'INVALID_SYNC_DIRECTION'
			);
			expect(error).toBeDefined();
		});

		it('should warn when all features are disabled', () => {
			const config = {
				...validConfig,
				features: {
					syncMilestones: false,
					syncProjects: false,
					syncAssignees: false,
					syncLabels: false
				}
			};
			const result = service.validateConfig(config);

			expect(result.valid).toBe(true);
			expect(result.warnings).toHaveLength(1);
			expect(result.warnings[0]).toMatchObject({
				code: 'ALL_FEATURES_DISABLED',
				severity: 'high'
			});
		});

		it('should include config snapshot in metadata', () => {
			const result = service.validateConfig(validConfig);

			expect(result.metadata.configSnapshot).toBeDefined();
			expect(result.metadata.configSnapshot).toEqual(validConfig);
		});
	});

	describe('validateFeatures', () => {
		it('should validate correct feature structure', () => {
			const features: GitHubSettings['features'] = {
				syncMilestones: true,
				syncProjects: false,
				syncAssignees: false,
				syncLabels: true
			};

			const result = service.validateFeatures(features);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should reject missing feature keys', () => {
			const features = {
				syncMilestones: true,
				syncProjects: false
			} as any;

			const result = service.validateFeatures(features);

			expect(result.valid).toBe(false);
			const error = result.errors.find(
				(e) => e.code === 'MISSING_FEATURE_KEYS'
			);
			expect(error).toBeDefined();
			expect(error?.message).toContain('syncAssignees');
			expect(error?.message).toContain('syncLabels');
		});

		it('should reject non-boolean feature values', () => {
			const features = {
				syncMilestones: true,
				syncProjects: 'yes',
				syncAssignees: false,
				syncLabels: 1
			} as any;

			const result = service.validateFeatures(features);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThanOrEqual(2);

			const projectError = result.errors.find(
				(e) => e.field === 'features.syncProjects'
			);
			expect(projectError).toBeDefined();
			expect(projectError?.code).toBe('INVALID_FEATURE_VALUE');
		});
	});

	describe('validateOrThrow', () => {
		it('should not throw for valid result', () => {
			const result: ValidationResult = {
				valid: true,
				errors: [],
				warnings: [],
				metadata: {
					validatedAspects: ['test'],
					timestamp: new Date().toISOString()
				}
			};

			expect(() => service.validateOrThrow(result)).not.toThrow();
		});

		it('should throw for invalid result', () => {
			const result: ValidationResult = {
				valid: false,
				errors: [
					{
						code: 'TEST_ERROR',
						message: 'Test error message',
						field: 'testField'
					}
				],
				warnings: [],
				metadata: {
					validatedAspects: ['test'],
					timestamp: new Date().toISOString()
				}
			};

			expect(() => service.validateOrThrow(result)).toThrow(
				'GitHub validation failed'
			);
			expect(() => service.validateOrThrow(result)).toThrow(
				'[testField] Test error message'
			);
		});

		it('should throw with multiple error messages', () => {
			const result: ValidationResult = {
				valid: false,
				errors: [
					{
						code: 'ERROR_1',
						message: 'First error',
						field: 'field1'
					},
					{
						code: 'ERROR_2',
						message: 'Second error',
						field: 'field2'
					}
				],
				warnings: [],
				metadata: {
					validatedAspects: ['test'],
					timestamp: new Date().toISOString()
				}
			};

			expect(() => service.validateOrThrow(result)).toThrow('First error');
			expect(() => service.validateOrThrow(result)).toThrow('Second error');
		});
	});
});
