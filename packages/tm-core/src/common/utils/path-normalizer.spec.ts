import { describe, it, expect } from 'vitest';
import {
	normalizeProjectPath,
	denormalizeProjectPath,
	isValidNormalizedPath,
	hasWindowsDriveLetter,
	stripDriveLetter
} from './path-normalizer.js';

describe('Path Normalizer (base64url encoding)', () => {
	describe('hasWindowsDriveLetter', () => {
		it('should detect Windows drive letters', () => {
			expect(hasWindowsDriveLetter('C:\\Users\\test')).toBe(true);
			expect(hasWindowsDriveLetter('D:\\Projects\\app')).toBe(true);
			expect(hasWindowsDriveLetter('E:/mixed/path')).toBe(true);
			expect(hasWindowsDriveLetter('c:\\lowercase')).toBe(true);
		});

		it('should return false for paths without drive letters', () => {
			expect(hasWindowsDriveLetter('/Users/test/project')).toBe(false);
			expect(hasWindowsDriveLetter('./relative/path')).toBe(false);
			expect(hasWindowsDriveLetter('relative/path')).toBe(false);
			expect(hasWindowsDriveLetter('')).toBe(false);
		});

		it('should return false for paths with colon not in drive position', () => {
			expect(hasWindowsDriveLetter('/path:with:colons')).toBe(false);
			expect(hasWindowsDriveLetter('file://path')).toBe(false);
		});
	});

	describe('stripDriveLetter', () => {
		it('should strip Windows drive letters', () => {
			expect(stripDriveLetter('C:\\Users\\test\\project')).toBe('\\Users\\test\\project');
			expect(stripDriveLetter('D:\\Projects\\app')).toBe('\\Projects\\app');
			expect(stripDriveLetter('E:/mixed/path')).toBe('/mixed/path');
			expect(stripDriveLetter('c:\\lowercase')).toBe('\\lowercase');
		});

		it('should return path unchanged if no drive letter', () => {
			expect(stripDriveLetter('/Users/test/project')).toBe('/Users/test/project');
			expect(stripDriveLetter('./relative/path')).toBe('./relative/path');
			expect(stripDriveLetter('relative/path')).toBe('relative/path');
			expect(stripDriveLetter('')).toBe('');
		});

		it('should handle edge cases', () => {
			expect(stripDriveLetter('C:')).toBe('');
			expect(stripDriveLetter('C:/')).toBe('/');
			expect(stripDriveLetter('C:\\')).toBe('\\');
		});
	});

	describe('normalizeProjectPath', () => {
		it('should encode Unix paths to base64url', () => {
			const input = '/Users/test/projects/myapp';
			const normalized = normalizeProjectPath(input);

			// Should be valid base64url (only A-Z, a-z, 0-9, -, _)
			expect(/^[A-Za-z0-9_-]+$/.test(normalized)).toBe(true);
			// Should not contain slashes
			expect(normalized).not.toContain('/');
			expect(normalized).not.toContain('\\');
		});

		it('should encode Windows paths to base64url', () => {
			const input = 'C:\\Users\\test\\projects\\myapp';
			const normalized = normalizeProjectPath(input);

			// Should be valid base64url
			expect(/^[A-Za-z0-9_-]+$/.test(normalized)).toBe(true);
			expect(normalized).not.toContain('/');
			expect(normalized).not.toContain('\\');
		});

		it('should encode paths with hyphens (preserving them for round-trip)', () => {
			const input = '/projects/my-app';
			const normalized = normalizeProjectPath(input);

			// Should be valid base64url
			expect(/^[A-Za-z0-9_-]+$/.test(normalized)).toBe(true);
			// Hyphens in base64url are from encoding, not original path
			expect(isValidNormalizedPath(normalized)).toBe(true);
		});

		it('should encode paths with special characters', () => {
			const input = '/projects/myapp (v2)';
			const normalized = normalizeProjectPath(input);

			// Should be valid base64url
			expect(/^[A-Za-z0-9_-]+$/.test(normalized)).toBe(true);
		});

		it('should encode relative paths', () => {
			const input = './projects/app';
			const normalized = normalizeProjectPath(input);

			// Should be valid base64url
			expect(/^[A-Za-z0-9_-]+$/.test(normalized)).toBe(true);
		});

		it('should handle empty string', () => {
			const input = '';
			const expected = '';
			expect(normalizeProjectPath(input)).toBe(expected);
		});

		it('should encode single directory', () => {
			const input = 'project';
			const normalized = normalizeProjectPath(input);

			// Should be valid base64url
			expect(/^[A-Za-z0-9_-]+$/.test(normalized)).toBe(true);
		});

		it('should encode paths with multiple consecutive slashes', () => {
			const input = '/Users//test///project';
			const normalized = normalizeProjectPath(input);

			// Should be valid base64url
			expect(/^[A-Za-z0-9_-]+$/.test(normalized)).toBe(true);
		});
	});

	describe('denormalizeProjectPath', () => {
		it('should decode base64url back to original path', () => {
			const original = '/Users/test/projects/myapp';
			const normalized = normalizeProjectPath(original);
			const denormalized = denormalizeProjectPath(normalized);

			expect(denormalized).toBe(original);
		});

		it('should decode base64url for Windows paths (without drive letter)', () => {
			const original = 'C:\\Users\\test\\project';
			const normalized = normalizeProjectPath(original);
			const denormalized = denormalizeProjectPath(normalized);

			// Drive letter is stripped, so we expect the path without it
			expect(denormalized).toBe('\\Users\\test\\project');
		});

		it('should handle empty string', () => {
			const input = '';
			const expected = '';
			expect(denormalizeProjectPath(input)).toBe(expected);
		});

		it('should preserve hyphens in directory names (no longer a limitation!)', () => {
			const original = '/projects/my-app';
			const normalized = normalizeProjectPath(original);
			const denormalized = denormalizeProjectPath(normalized);

			// With base64url, hyphens are preserved correctly
			expect(denormalized).toBe(original);
		});

		it('should handle invalid base64url gracefully', () => {
			// Invalid base64url - should return the input as fallback
			const invalid = 'not@valid#base64url';
			const result = denormalizeProjectPath(invalid);

			// Should return input unchanged for backward compatibility
			expect(result).toBe(invalid);
		});
	});

	describe('isValidNormalizedPath', () => {
		it('should return true for valid base64url strings', () => {
			// Valid base64url characters: A-Z, a-z, 0-9, -, _
			expect(isValidNormalizedPath('VXNlcnMtdGVzdC1wcm9qZWN0')).toBe(true);
			expect(isValidNormalizedPath('abc123_-ABC')).toBe(true);
		});

		it('should return true for base64url with hyphens and underscores', () => {
			expect(isValidNormalizedPath('test-path_encoded')).toBe(true);
		});

		it('should return false for paths with slashes', () => {
			expect(isValidNormalizedPath('Users/test/project')).toBe(false);
		});

		it('should return false for paths with backslashes', () => {
			expect(isValidNormalizedPath('Users\\test\\project')).toBe(false);
		});

		it('should return true for empty string', () => {
			expect(isValidNormalizedPath('')).toBe(true);
		});

		it('should return false for strings with special characters not in base64url', () => {
			// Base64url only allows: A-Z, a-z, 0-9, -, _
			expect(isValidNormalizedPath('my-app (v2)')).toBe(false); // parentheses and spaces not allowed
			expect(isValidNormalizedPath('test@example')).toBe(false); // @ not allowed
			expect(isValidNormalizedPath('test+value')).toBe(false); // + not allowed
		});

		it('should validate normalized paths correctly', () => {
			const path = '/Users/test/my-app';
			const normalized = normalizeProjectPath(path);
			expect(isValidNormalizedPath(normalized)).toBe(true);
		});
	});

	describe('Round-trip conversion', () => {
		it('should perfectly preserve ALL Unix paths (including those with hyphens)', () => {
			const originalPaths = [
				'/Users/test/projects/myapp',
				'/root/deep/nested/path',
				'./relative/path',
				'/projects/my-app', // Now works correctly!
				'/path/with-multiple-hyphens/in-names'
			];

			for (const original of originalPaths) {
				const normalized = normalizeProjectPath(original);
				const denormalized = denormalizeProjectPath(normalized);

				// Perfect round-trip with base64url encoding
				expect(denormalized).toBe(original);
			}
		});

		it('should preserve Windows paths without drive letters', () => {
			const testCases = [
				{ original: 'C:\\Users\\test\\project', expected: '\\Users\\test\\project' },
				{ original: 'D:\\Projects\\my-app', expected: '\\Projects\\my-app' },
				{ original: 'E:\\path\\with-hyphens\\test', expected: '\\path\\with-hyphens\\test' }
			];

			for (const { original, expected } of testCases) {
				const normalized = normalizeProjectPath(original);
				const denormalized = denormalizeProjectPath(normalized);

				// Drive letters are stripped for cross-drive consistency
				expect(denormalized).toBe(expected);
			}
		});

		it('should preserve paths with special characters', () => {
			const originalPaths = [
				'/projects/my app (v2)',
				'/path/with spaces/test',
				'/path/with-dashes-and_underscores',
				'/path/with.dots.and-dashes'
			];

			for (const original of originalPaths) {
				const normalized = normalizeProjectPath(original);
				const denormalized = denormalizeProjectPath(normalized);

				// Perfect round-trip for all special characters
				expect(denormalized).toBe(original);
			}
		});

		it('should handle mixed slashes and preserve exact path structure', () => {
			const original = '/Users/test\\mixed/path';
			const normalized = normalizeProjectPath(original);
			const denormalized = denormalizeProjectPath(normalized);

			// Exact preservation of mixed slashes
			expect(denormalized).toBe(original);
		});

		it('should preserve multiple consecutive slashes', () => {
			const original = '/Users//test///project';
			const normalized = normalizeProjectPath(original);
			const denormalized = denormalizeProjectPath(normalized);

			// Exact preservation of all slashes
			expect(denormalized).toBe(original);
		});
	});

	describe('Cross-platform consistency', () => {
		it('should produce filesystem-safe normalized output for all platforms', () => {
			const unixPath = '/Users/test/project';
			const windowsPath = 'C:\\Users\\test\\project';

			const normalizedUnix = normalizeProjectPath(unixPath);
			const normalizedWindows = normalizeProjectPath(windowsPath);

			// Both should be valid base64url (no slashes or backslashes)
			expect(normalizedUnix).not.toContain('/');
			expect(normalizedUnix).not.toContain('\\');
			expect(normalizedWindows).not.toContain('/');
			expect(normalizedWindows).not.toContain('\\');

			// Both should be valid base64url format
			expect(isValidNormalizedPath(normalizedUnix)).toBe(true);
			expect(isValidNormalizedPath(normalizedWindows)).toBe(true);
		});

		it('should produce different normalized outputs for Unix vs Windows paths', () => {
			// Unix and Windows paths are different (/ vs \), so should produce different encoded values
			const unixPath = '/Users/test/project';
			const windowsPath = 'C:\\Users\\test\\project';

			const normalizedUnix = normalizeProjectPath(unixPath);
			const normalizedWindows = normalizeProjectPath(windowsPath);

			// Different path separators produce different outputs
			expect(normalizedUnix).not.toBe(normalizedWindows);

			// Both should denormalize correctly (Windows without drive letter)
			expect(denormalizeProjectPath(normalizedUnix)).toBe(unixPath);
			expect(denormalizeProjectPath(normalizedWindows)).toBe('\\Users\\test\\project');
		});

		it('should produce identical normalized outputs for same path on different Windows drives', () => {
			// Different Windows drives with same path should normalize to same value
			const pathOnC = 'C:\\Users\\test\\project';
			const pathOnD = 'D:\\Users\\test\\project';
			const pathOnE = 'E:\\Users\\test\\project';

			const normalizedC = normalizeProjectPath(pathOnC);
			const normalizedD = normalizeProjectPath(pathOnD);
			const normalizedE = normalizeProjectPath(pathOnE);

			// All should produce the same normalized value (drive letter stripped)
			expect(normalizedC).toBe(normalizedD);
			expect(normalizedD).toBe(normalizedE);

			// All should denormalize to the same value (without drive letter)
			const expected = '\\Users\\test\\project';
			expect(denormalizeProjectPath(normalizedC)).toBe(expected);
			expect(denormalizeProjectPath(normalizedD)).toBe(expected);
			expect(denormalizeProjectPath(normalizedE)).toBe(expected);
		});

		it('should handle Unicode characters in paths', () => {
			const unicodePaths = [
				'/Users/测试/project',
				'/Users/test/プロジェクト',
				'/Users/тест/project'
			];

			for (const original of unicodePaths) {
				const normalized = normalizeProjectPath(original);
				const denormalized = denormalizeProjectPath(normalized);

				// Perfect round-trip for Unicode
				expect(denormalized).toBe(original);
				expect(isValidNormalizedPath(normalized)).toBe(true);
			}
		});
	});
});
