/**
 * @fileoverview Simple unit tests for GitHub client (core configuration and error classes)
 */

import { describe, it, expect } from 'vitest';
import {
	GitHubAuthenticationError,
	GitHubRateLimitError,
	GitHubAPIError
} from './github-client.js';

describe('GitHubClient Error Classes', () => {
	describe('GitHubAuthenticationError', () => {
		it('should create error with message and code', () => {
			const error = new GitHubAuthenticationError('Unauthorized', 'UNAUTHORIZED');
			expect(error.message).toBe('Unauthorized');
			expect(error.code).toBe('UNAUTHORIZED');
			expect(error.name).toBe('GitHubAuthenticationError');
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('GitHubRateLimitError', () => {
		it('should create error with rate limit information', () => {
			const resetDate = new Date();
			const error = new GitHubRateLimitError(
				'Rate limit exceeded',
				resetDate,
				5000,
				0
			);
			expect(error.message).toBe('Rate limit exceeded');
			expect(error.resetAt).toBe(resetDate);
			expect(error.limit).toBe(5000);
			expect(error.remaining).toBe(0);
			expect(error.name).toBe('GitHubRateLimitError');
			expect(error).toBeInstanceOf(Error);
		});
	});

	describe('GitHubAPIError', () => {
		it('should create error with status code and optional code', () => {
			const error = new GitHubAPIError('Not found', 404, 'NOT_FOUND');
			expect(error.message).toBe('Not found');
			expect(error.statusCode).toBe(404);
			expect(error.code).toBe('NOT_FOUND');
			expect(error.name).toBe('GitHubAPIError');
			expect(error).toBeInstanceOf(Error);
		});

		it('should create error without optional code', () => {
			const error = new GitHubAPIError('Server error', 500);
			expect(error.message).toBe('Server error');
			expect(error.statusCode).toBe(500);
			expect(error.code).toBeUndefined();
		});
	});
});
