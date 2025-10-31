/**
 * @fileoverview Test file writing service with error handling
 * Handles file system operations for test generation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { TaskMasterError, ERROR_CODES } from '../../../common/errors/index.js';
import type { TestFileData } from '../types/test-generation.types.js';

/**
 * Service for writing test files
 */
export class TestFileWriter {
	/**
	 * Write test file to disk
	 */
	async writeTestFile(
		testFile: TestFileData,
		overwrite: boolean = false
	): Promise<void> {
		try {
			// Check if file exists
			const exists = await this.fileExists(testFile.filePath);
			if (exists && !overwrite) {
				throw new TaskMasterError(
					`Test file already exists: ${testFile.filePath}`,
					ERROR_CODES.FILE_WRITE_ERROR,
					{
						filePath: testFile.filePath,
						hint: 'Use --overwrite flag to replace the existing file'
					}
				);
			}

			// Ensure directory exists
			const dir = path.dirname(testFile.filePath);
			await this.ensureDirectory(dir);

			// Write file
			await fs.writeFile(testFile.filePath, testFile.content, 'utf-8');
		} catch (error) {
			// Re-throw TaskMasterErrors as-is
			if (error instanceof TaskMasterError) {
				throw error;
			}

			// Wrap other errors
			throw new TaskMasterError(
				'Failed to write test file',
				ERROR_CODES.FILE_WRITE_ERROR,
				{ filePath: testFile.filePath },
				error as Error
			);
		}
	}

	/**
	 * Determine output path for test file
	 */
	determineOutputPath(
		projectRoot: string,
		taskId: string,
		customOutput?: string
	): string {
		if (customOutput) {
			// Use custom output if provided
			return path.isAbsolute(customOutput)
				? customOutput
				: path.join(projectRoot, customOutput);
		}

		// Generate path in tests/ directory
		// Format: tests/task-<id>.test.ts (e.g., task-1-2.test.ts for subtask 1.2)
		const sanitizedId = this.sanitizeTaskId(taskId);
		const fileName = `task-${sanitizedId}.test.ts`;
		return path.join(projectRoot, 'tests', fileName);
	}

	/**
	 * Ensure directory exists
	 */
	private async ensureDirectory(dirPath: string): Promise<void> {
		try {
			await fs.mkdir(dirPath, { recursive: true });
		} catch (error) {
			throw new TaskMasterError(
				'Failed to create test directory',
				ERROR_CODES.FILE_WRITE_ERROR,
				{ directory: dirPath },
				error as Error
			);
		}
	}

	/**
	 * Check if file exists (public API)
	 */
	async exists(filePath: string): Promise<boolean> {
		return this.fileExists(filePath);
	}

	/**
	 * Check if file exists (internal helper)
	 */
	private async fileExists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Sanitize task ID for file name
	 * Converts "1.2" to "1-2", "HAM-123" to "ham-123", etc.
	 */
	private sanitizeTaskId(taskId: string): string {
		return taskId.replace(/\./g, '-').replace(/[^a-z0-9-]/gi, '_').toLowerCase();
	}

	/**
	 * Extract test content from AI response
	 * Removes markdown code blocks if present
	 */
	extractTestCode(aiResponse: string): string {
		// Remove markdown code blocks
		const codeBlockPattern = /```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)\n```/;
		const match = aiResponse.match(codeBlockPattern);

		if (match) {
			return match[1].trim();
		}

		// If no code block found, return trimmed response
		return aiResponse.trim();
	}

	/**
	 * Count test cases in generated test content
	 */
	countTests(testContent: string): number {
		// Count occurrences of it('...') or test('...')
		const itPattern = /\b(?:it|test)\s*\(/g;
		const matches = testContent.match(itPattern);
		return matches ? matches.length : 0;
	}

	/**
	 * Extract imports from test content
	 */
	extractImports(testContent: string): string[] {
		const imports: string[] = [];
		const importPattern = /^import\s+.+\s+from\s+['"](.+?)['"];?$/gm;
		const matches = testContent.matchAll(importPattern);

		for (const match of matches) {
			if (match[1]) {
				imports.push(match[1]);
			}
		}

		return imports;
	}
}
