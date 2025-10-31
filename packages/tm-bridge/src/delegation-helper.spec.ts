import { describe, it, expect } from 'vitest';
import {
	shouldDelegateToSpecialist,
	emitDelegationMetadata,
	isDelegationEnabled,
	type DelegationContext
} from './delegation-helper.js';

describe('delegation-helper', () => {
	describe('shouldDelegateToSpecialist', () => {
		it('should delegate for Task Master list command', () => {
			const result = shouldDelegateToSpecialist('list');

			expect(result.shouldDelegate).toBe(true);
			expect(result.isTaskMasterCommand).toBe(true);
			expect(result.command).toBe('list');
			expect(result.targetAgent).toBe('task-master-specialist');
			expect(result.reason).toBe('Task Master command detected');
		});

		it('should delegate for Task Master show command', () => {
			const result = shouldDelegateToSpecialist('show');

			expect(result.shouldDelegate).toBe(true);
			expect(result.isTaskMasterCommand).toBe(true);
			expect(result.command).toBe('show');
		});

		it('should delegate for Task Master next command', () => {
			const result = shouldDelegateToSpecialist('next');

			expect(result.shouldDelegate).toBe(true);
			expect(result.isTaskMasterCommand).toBe(true);
		});

		it('should delegate for Task Master update commands', () => {
			const commands = ['update', 'update-task', 'update-subtask'];

			commands.forEach((cmd) => {
				const result = shouldDelegateToSpecialist(cmd);
				expect(result.shouldDelegate).toBe(true);
				expect(result.isTaskMasterCommand).toBe(true);
			});
		});

		it('should delegate for Task Master set-status command', () => {
			const result = shouldDelegateToSpecialist('set-status');

			expect(result.shouldDelegate).toBe(true);
			expect(result.isTaskMasterCommand).toBe(true);
		});

		it('should delegate for Task Master expand command', () => {
			const result = shouldDelegateToSpecialist('expand');

			expect(result.shouldDelegate).toBe(true);
			expect(result.isTaskMasterCommand).toBe(true);
		});

		it('should delegate for Task Master analyze commands', () => {
			const commands = ['analyze-complexity', 'complexity-report'];

			commands.forEach((cmd) => {
				const result = shouldDelegateToSpecialist(cmd);
				expect(result.shouldDelegate).toBe(true);
				expect(result.isTaskMasterCommand).toBe(true);
			});
		});

		it('should delegate when taskmaster tag is present', () => {
			const result = shouldDelegateToSpecialist('some-other-command', 'taskmaster');

			expect(result.shouldDelegate).toBe(true);
			expect(result.tag).toBe('taskmaster');
			expect(result.targetAgent).toBe('task-master-specialist');
			expect(result.reason).toBe('Taskmaster tag detected');
		});

		it('should delegate when task-master tag is present', () => {
			const result = shouldDelegateToSpecialist('random-command', 'task-master');

			expect(result.shouldDelegate).toBe(true);
			expect(result.tag).toBe('task-master');
		});

		it('should delegate with both command and tag', () => {
			const result = shouldDelegateToSpecialist('list', 'taskmaster');

			expect(result.shouldDelegate).toBe(true);
			expect(result.isTaskMasterCommand).toBe(true);
			expect(result.tag).toBe('taskmaster');
			expect(result.reason).toBe('Task Master command with taskmaster tag');
		});

		it('should NOT delegate for non-Task Master commands without tags', () => {
			const commands = ['build', 'test', 'deploy', 'random-command'];

			commands.forEach((cmd) => {
				const result = shouldDelegateToSpecialist(cmd);
				expect(result.shouldDelegate).toBe(false);
				expect(result.isTaskMasterCommand).toBe(false);
				expect(result.targetAgent).toBeUndefined();
			});
		});

		it('should NOT delegate when tag does not match', () => {
			const result = shouldDelegateToSpecialist('build', 'some-other-tag');

			expect(result.shouldDelegate).toBe(false);
			expect(result.tag).toBe('some-other-tag');
		});

		it('should handle full command strings correctly', () => {
			const result = shouldDelegateToSpecialist('task-master list --status pending');

			expect(result.shouldDelegate).toBe(true);
			expect(result.command).toBe('list');
			expect(result.fullCommand).toBe('task-master list --status pending');
		});

		it('should extract command verb from full command', () => {
			const result = shouldDelegateToSpecialist('show 42');

			expect(result.shouldDelegate).toBe(true);
			expect(result.command).toBe('show');
		});

		it('should be case-sensitive for command matching', () => {
			const result = shouldDelegateToSpecialist('LIST');

			// Command names are lowercase in the trigger list
			expect(result.shouldDelegate).toBe(false);
		});

		it('should be case-insensitive for tag matching', () => {
			const tags = ['TASKMASTER', 'TaskMaster', 'taskmaster', 'TASK-MASTER', 'task-master'];

			tags.forEach((tag) => {
				const result = shouldDelegateToSpecialist('build', tag);
				expect(result.shouldDelegate).toBe(true);
			});
		});
	});

	describe('emitDelegationMetadata', () => {
		it('should emit metadata for delegated commands', () => {
			const metadata = emitDelegationMetadata('list');

			expect(metadata).not.toBeNull();
			expect(metadata?.context.shouldDelegate).toBe(true);
			expect(metadata?.config.agentName).toBe('task-master-specialist');
			expect(metadata?.config.priority).toBe('high');
			expect(metadata?.timestamp).toBeInstanceOf(Date);
		});

		it('should include correct descriptor path', () => {
			const metadata = emitDelegationMetadata('show', 'taskmaster');

			expect(metadata?.config.descriptorPath).toBe('.claude/background-agents/task-master-specialist.json');
		});

		it('should return null for non-delegated commands', () => {
			const metadata = emitDelegationMetadata('build');

			expect(metadata).toBeNull();
		});

		it('should emit metadata when tag triggers delegation', () => {
			const metadata = emitDelegationMetadata('build', 'taskmaster');

			expect(metadata).not.toBeNull();
			expect(metadata?.context.tag).toBe('taskmaster');
		});
	});

	describe('isDelegationEnabled', () => {
		it('should return false (feature not yet implemented)', () => {
			const enabled = isDelegationEnabled();

			expect(enabled).toBe(false);
		});
	});

	describe('delegation context structure', () => {
		it('should have all required context fields', () => {
			const result = shouldDelegateToSpecialist('list', 'taskmaster');

			expect(result).toHaveProperty('command');
			expect(result).toHaveProperty('fullCommand');
			expect(result).toHaveProperty('tag');
			expect(result).toHaveProperty('isTaskMasterCommand');
			expect(result).toHaveProperty('shouldDelegate');
			expect(result).toHaveProperty('reason');
			expect(result).toHaveProperty('targetAgent');
		});
	});

	describe('edge cases', () => {
		it('should handle empty command strings', () => {
			const result = shouldDelegateToSpecialist('');

			expect(result.shouldDelegate).toBe(false);
			expect(result.command).toBe('');
		});

		it('should handle commands with extra whitespace', () => {
			const result = shouldDelegateToSpecialist('  list  ');

			expect(result.shouldDelegate).toBe(true);
			expect(result.command).toBe('list');  // Properly trimmed and extracted
		});

		it('should handle undefined tag gracefully', () => {
			const result = shouldDelegateToSpecialist('list', undefined);

			expect(result.shouldDelegate).toBe(true);
			expect(result.tag).toBeUndefined();
		});

		it('should handle empty tag gracefully', () => {
			const result = shouldDelegateToSpecialist('list', '');

			expect(result.shouldDelegate).toBe(true);
		});
	});
});
