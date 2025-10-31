/**
 * @fileoverview Test Generation Service - Core orchestration for AI-powered test generation
 */

import type { ConfigManager } from '../../config/managers/config-manager.js';
import type { TaskService } from '../../tasks/services/task-service.js';
import type { IAIProvider } from '../../ai/interfaces/ai-provider.interface.js';
import type {
	GenerateTestOptions,
	GenerateTestResult,
	TaskContext,
	TestGenerationMetadata
} from '../types/test-generation.types.js';
import { TestContextAnalyzer } from './test-context-analyzer.service.js';
import { TestPromptService } from './test-prompt.service.js';
import { TestFileWriter } from './test-file-writer.service.js';
import { TaskMasterError, ERROR_CODES } from '../../../common/errors/index.js';

/**
 * Service for orchestrating test generation
 */
export class TestGenerationService {
	private contextAnalyzer: TestContextAnalyzer;
	private promptService: TestPromptService;
	private fileWriter: TestFileWriter;

	constructor(
		private configManager: ConfigManager,
		private taskService: TaskService,
		private aiProvider: IAIProvider
	) {
		this.contextAnalyzer = new TestContextAnalyzer();
		this.promptService = new TestPromptService(configManager);
		this.fileWriter = new TestFileWriter();
	}

	/**
	 * Generate test file for a task
	 */
	async generateTestForTask(
		options: GenerateTestOptions
	): Promise<GenerateTestResult> {
		const startTime = Date.now();

		try {
			// Gather context
			const context = await this.gatherTaskContext(
				options.taskId!,
				options.tag
			);

			// Build AI prompt
			const prompt = await this.promptService.buildPrompt({
				task: context.task,
				analysis: context.analysis,
				framework: options.framework || 'vitest',
				detailLevel: options.detailLevel || 'standard',
				testType: options.testType || 'auto',
				additionalContext: options.additionalContext
			});

			// Call AI
			const testCode = await this.callAIForTestGeneration(prompt, {
				useResearch: options.useResearch
			});

			// Determine output path
			const projectRoot = this.configManager.getProjectRoot();
			const outputPath = this.fileWriter.determineOutputPath(
				projectRoot,
				options.taskId!,
				options.outputDir
			);

			// Check if file exists
			const fileExists = await this.fileWriter.exists(outputPath);
			if (fileExists && !options.overwrite && options.strategy !== 'overwrite') {
				throw new TaskMasterError(
					'Test file already exists. Use --overwrite or specify strategy.',
					ERROR_CODES.FILE_WRITE_ERROR,
					{ filePath: outputPath }
				);
			}

			// Write test file
			await this.fileWriter.writeTestFile(
				{
					filePath: outputPath,
					content: testCode,
					framework: options.framework || 'vitest',
					testCount: this.extractTestCount(testCode),
					imports: this.fileWriter.extractImports(testCode)
				},
				options.overwrite || options.strategy === 'overwrite'
			);

			const metadata: TestGenerationMetadata = {
				taskId: options.taskId,
				detailLevel: options.detailLevel || 'standard',
				testType: options.testType || 'auto',
				duration: Date.now() - startTime,
				timestamp: new Date().toISOString()
			};

			return {
				success: true,
				testFilePath: outputPath,
				testContent: testCode,
				testCount: this.extractTestCount(testCode),
				metadata
			};
		} catch (error: any) {
			return {
				success: false,
				error: error.message,
				metadata: {
					taskId: options.taskId,
					detailLevel: options.detailLevel || 'standard',
					testType: options.testType || 'auto',
					duration: Date.now() - startTime,
					timestamp: new Date().toISOString()
				}
			};
		}
	}

	/**
	 * Gather context from task
	 */
	private async gatherTaskContext(
		taskId: string,
		tag?: string
	): Promise<TaskContext> {
		// Get task
		const task = await this.taskService.getTask(taskId, tag);
		if (!task) {
			throw new TaskMasterError(
				`Task ${taskId} not found`,
				ERROR_CODES.TASK_NOT_FOUND,
				{ taskId }
			);
		}

		// Analyze task
		const analysis = await this.contextAnalyzer.analyzeTask(task);

		// TODO: Gather related files and dependencies (future enhancement)
		const relatedFiles: string[] = [];
		const dependencies: string[] = [];

		return {
			task,
			analysis,
			relatedFiles,
			dependencies
		};
	}

	/**
	 * Call AI provider for test generation
	 */
	private async callAIForTestGeneration(
		prompt: string,
		_options: { useResearch?: boolean }
	): Promise<string> {
		try {
			const response = await this.aiProvider.generateCompletion(prompt, {
				maxTokens: 2000,
				temperature: 0.3
				// TODO: Add useResearch support when AIProvider interface supports it
				// useResearch: options.useResearch
			});

			return this.extractTestCode(response.content);
		} catch (error: any) {
			throw new TaskMasterError(
				'AI test generation failed',
				ERROR_CODES.API_ERROR,
				{ error: error.message }
			);
		}
	}

	/**
	 * Extract test code from AI response
	 */
	private extractTestCode(content: string): string {
		// Extract from markdown code blocks if present
		const codeBlockMatch = content.match(/```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/);
		if (codeBlockMatch) {
			return codeBlockMatch[1].trim();
		}
		return content.trim();
	}

	/**
	 * Extract test count from generated code
	 */
	private extractTestCount(code: string): number {
		// Count test/it blocks
		const testMatches = code.match(/\b(test|it)\s*\(/g);
		return testMatches ? testMatches.length : 0;
	}
}
