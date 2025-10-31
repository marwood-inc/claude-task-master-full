/**
 * Tests for GitHub Authentication Service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitHubAuthService } from './github-auth.service.js';
import { GitHubClient } from '../clients/github-client.js';

// Mock the GitHubClient
vi.mock('../clients/github-client.js');

describe('GitHubAuthService', () => {
	let service: GitHubAuthService;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		service = new GitHubAuthService();
		// Save original environment
		originalEnv = { ...process.env };
		// Clear GITHUB_TOKEN for tests
		delete process.env.GITHUB_TOKEN;
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv;
	});

	describe('getTokenFromEnvironment', () => {
		it('should return token from GITHUB_TOKEN environment variable', () => {
			process.env.GITHUB_TOKEN = 'test-token-123';
			const token = service.getTokenFromEnvironment();
			expect(token).toBe('test-token-123');
		});

		it('should return undefined when GITHUB_TOKEN is not set', () => {
			const token = service.getTokenFromEnvironment();
			expect(token).toBeUndefined();
		});

		it('should return empty string if GITHUB_TOKEN is empty', () => {
			process.env.GITHUB_TOKEN = '';
			const token = service.getTokenFromEnvironment();
			expect(token).toBe('');
		});
	});

	describe('validateToken', () => {
		it('should validate a valid token successfully', async () => {
			const mockUser = {
				login: 'testuser',
				id: 12345,
				name: 'Test User',
				email: 'test@example.com'
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						testAuthentication: vi.fn().mockResolvedValue(mockUser)
					}) as any
			);

			const result = await service.validateToken('valid-token');

			expect(result.valid).toBe(true);
			expect(result.user).toEqual(mockUser);
			expect(result.error).toBeUndefined();
		});

		it('should return error for invalid token', async () => {
			const mockError = {
				name: 'GitHubAuthenticationError',
				message: 'Bad credentials',
				code: 'UNAUTHORIZED'
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						testAuthentication: vi.fn().mockRejectedValue(mockError)
					}) as any
			);

			const result = await service.validateToken('invalid-token');

			expect(result.valid).toBe(false);
			expect(result.error).toBe('Bad credentials');
			expect(result.errorCode).toBe('UNAUTHORIZED');
		});

		it('should use GITHUB_TOKEN environment variable when no token provided', async () => {
			process.env.GITHUB_TOKEN = 'env-token-123';

			const mockUser = {
				login: 'testuser',
				id: 12345,
				name: 'Test User',
				email: 'test@example.com'
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						testAuthentication: vi.fn().mockResolvedValue(mockUser)
					}) as any
			);

			const result = await service.validateToken();

			expect(result.valid).toBe(true);
			expect(result.user).toEqual(mockUser);
		});

		it('should return error when no token provided and environment variable not set', async () => {
			const result = await service.validateToken();

			expect(result.valid).toBe(false);
			expect(result.error).toContain('No GitHub token provided');
			expect(result.errorCode).toBe('INVALID_TOKEN');
		});

		it('should handle network errors gracefully', async () => {
			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						testAuthentication: vi
							.fn()
							.mockRejectedValue(new Error('Network error'))
					}) as any
			);

			const result = await service.validateToken('valid-token');

			expect(result.valid).toBe(false);
			expect(result.error).toBe('Network error');
			expect(result.errorCode).toBe('NETWORK_ERROR');
		});

		it('should handle forbidden errors', async () => {
			const mockError = {
				name: 'GitHubAuthenticationError',
				message: 'Resource forbidden',
				code: 'FORBIDDEN'
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						testAuthentication: vi.fn().mockRejectedValue(mockError)
					}) as any
			);

			const result = await service.validateToken('token-with-limited-access');

			expect(result.valid).toBe(false);
			expect(result.error).toBe('Resource forbidden');
			expect(result.errorCode).toBe('FORBIDDEN');
		});
	});

	describe('checkPermissions', () => {
		it('should return error when no token provided', async () => {
			const result = await service.checkPermissions();

			expect(result.hasRequiredPermissions).toBe(false);
			expect(result.message).toContain('No GitHub token provided');
			expect(result.scopes.missingRequired).toEqual(['repo', 'user']);
		});

		it('should check permissions successfully with valid token', async () => {
			const mockUser = {
				login: 'testuser',
				id: 12345,
				name: 'Test User',
				email: 'test@example.com'
			};

			const mockOctokit = {
				rest: {
					repos: {
						listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] })
					},
					orgs: {
						listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] })
					}
				}
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						testAuthentication: vi.fn().mockResolvedValue(mockUser),
						getOctokit: vi.fn().mockReturnValue(mockOctokit)
					}) as any
			);

			const result = await service.checkPermissions('valid-token');

			expect(result.hasRequiredPermissions).toBe(true);
			expect(result.scopes.granted).toContain('repo');
			expect(result.scopes.granted).toContain('user');
			expect(result.scopes.missingRequired).toHaveLength(0);
		});

		it('should detect missing repo permissions', async () => {
			const mockUser = {
				login: 'testuser',
				id: 12345,
				name: 'Test User',
				email: 'test@example.com'
			};

			const mockOctokit = {
				rest: {
					repos: {
						listForAuthenticatedUser: vi
							.fn()
							.mockRejectedValue(new Error('Forbidden'))
					},
					orgs: {
						listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] })
					}
				}
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						testAuthentication: vi.fn().mockResolvedValue(mockUser),
						getOctokit: vi.fn().mockReturnValue(mockOctokit)
					}) as any
			);

			const result = await service.checkPermissions('limited-token');

			expect(result.hasRequiredPermissions).toBe(false);
			expect(result.scopes.missingRequired).toContain('repo');
			expect(result.warnings.length).toBeGreaterThan(0);
		});

		it('should detect optional organization permissions', async () => {
			const mockUser = {
				login: 'testuser',
				id: 12345,
				name: 'Test User',
				email: 'test@example.com'
			};

			const mockOctokit = {
				rest: {
					repos: {
						listForAuthenticatedUser: vi.fn().mockResolvedValue({ data: [] })
					},
					orgs: {
						listForAuthenticatedUser: vi
							.fn()
							.mockRejectedValue(new Error('No org access'))
					}
				}
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						testAuthentication: vi.fn().mockResolvedValue(mockUser),
						getOctokit: vi.fn().mockReturnValue(mockOctokit)
					}) as any
			);

			const result = await service.checkPermissions('valid-token');

			expect(result.hasRequiredPermissions).toBe(true);
			expect(result.scopes.granted).not.toContain('read:org');
			expect(result.scopes.missingOptional).toContain('read:org');
			expect(result.warnings.some(w => w.includes('organization'))).toBe(true);
		});
	});

	describe('getRateLimitStatus', () => {
		it('should throw error when no token provided', async () => {
			await expect(service.getRateLimitStatus()).rejects.toThrow(
				'No GitHub token provided'
			);
		});

		it('should return rate limit status successfully', async () => {
			const mockRateLimit = {
				limit: 5000,
				remaining: 4500,
				reset: new Date('2025-01-01T12:00:00Z'),
				used: 500
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						getRateLimit: vi.fn().mockResolvedValue(mockRateLimit)
					}) as any
			);

			const result = await service.getRateLimitStatus('valid-token');

			expect(result.limit).toBe(5000);
			expect(result.remaining).toBe(4500);
			expect(result.used).toBe(500);
			expect(result.percentageRemaining).toBe(90);
			expect(result.isLow).toBe(false);
			expect(result.isExhausted).toBe(false);
		});

		it('should detect low rate limit', async () => {
			const mockRateLimit = {
				limit: 5000,
				remaining: 400,
				reset: new Date('2025-01-01T12:00:00Z'),
				used: 4600
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						getRateLimit: vi.fn().mockResolvedValue(mockRateLimit)
					}) as any
			);

			const result = await service.getRateLimitStatus('valid-token');

			expect(result.percentageRemaining).toBe(8);
			expect(result.isLow).toBe(true);
			expect(result.isExhausted).toBe(false);
		});

		it('should detect exhausted rate limit', async () => {
			const mockRateLimit = {
				limit: 5000,
				remaining: 0,
				reset: new Date('2025-01-01T12:00:00Z'),
				used: 5000
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						getRateLimit: vi.fn().mockResolvedValue(mockRateLimit)
					}) as any
			);

			const result = await service.getRateLimitStatus('valid-token');

			expect(result.remaining).toBe(0);
			expect(result.isExhausted).toBe(true);
			expect(result.isLow).toBe(true);
		});

		it('should use GITHUB_TOKEN environment variable', async () => {
			process.env.GITHUB_TOKEN = 'env-token-123';

			const mockRateLimit = {
				limit: 5000,
				remaining: 4500,
				reset: new Date('2025-01-01T12:00:00Z'),
				used: 500
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						getRateLimit: vi.fn().mockResolvedValue(mockRateLimit)
					}) as any
			);

			const result = await service.getRateLimitStatus();

			expect(result.limit).toBe(5000);
		});
	});

	describe('verifyRepositoryAccess', () => {
		it('should verify repository access successfully', async () => {
			const mockRepoInfo = {
				id: 123,
				name: 'test-repo',
				fullName: 'owner/test-repo',
				private: false,
				permissions: {
					admin: true,
					push: true,
					pull: true
				}
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						verifyRepositoryAccess: vi.fn().mockResolvedValue(mockRepoInfo)
					}) as any
			);

			const result = await service.verifyRepositoryAccess(
				'valid-token',
				'owner',
				'test-repo'
			);

			expect(result.accessible).toBe(true);
			expect(result.permissions).toEqual({
				admin: true,
				push: true,
				pull: true
			});
			expect(result.error).toBeUndefined();
		});

		it('should handle repository access errors', async () => {
			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						verifyRepositoryAccess: vi
							.fn()
							.mockRejectedValue(new Error('Repository not found'))
					}) as any
			);

			const result = await service.verifyRepositoryAccess(
				'valid-token',
				'owner',
				'nonexistent-repo'
			);

			expect(result.accessible).toBe(false);
			expect(result.error).toBe('Repository not found');
			expect(result.permissions).toBeUndefined();
		});

		it('should detect limited permissions', async () => {
			const mockRepoInfo = {
				id: 123,
				name: 'test-repo',
				fullName: 'owner/test-repo',
				private: false,
				permissions: {
					admin: false,
					push: false,
					pull: true
				}
			};

			vi.mocked(GitHubClient).mockImplementation(
				() =>
					({
						verifyRepositoryAccess: vi.fn().mockResolvedValue(mockRepoInfo)
					}) as any
			);

			const result = await service.verifyRepositoryAccess(
				'valid-token',
				'owner',
				'test-repo'
			);

			expect(result.accessible).toBe(true);
			expect(result.permissions?.push).toBe(false);
			expect(result.permissions?.admin).toBe(false);
			expect(result.permissions?.pull).toBe(true);
		});
	});
});
