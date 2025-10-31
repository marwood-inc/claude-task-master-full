/**
 * GitHub Conflict Resolver
 *
 * Facade for conflict resolution that provides a simplified interface
 * for resolving conflicts during GitHub synchronization.
 *
 * This is the core business logic layer. Interactive CLI prompts belong in @tm/cli.
 *
 * @module github-conflict-resolver
 */

import type { ConflictResolutionService } from './conflict-resolution.service.js';
import type {
	ConflictInfo,
	ConflictResolution,
	ConflictResolutionStrategy,
} from '../types/github-conflict-types.js';
import type {
	ConflictAnalysis,
	ResolutionResult,
	BatchResolutionResult,
	ValidationResult,
	PreviewResult,
} from '../types/conflict-resolution-types.js';

/**
 * GitHubConflictResolver
 *
 * Provides a simplified, task-oriented interface for conflict resolution
 * during GitHub synchronization operations.
 *
 * @remarks
 * This is a facade over ConflictResolutionService that provides convenience
 * methods specifically for GitHub sync workflows.
 *
 * @example
 * ```typescript
 * const resolver = new GitHubConflictResolver(conflictResolutionService);
 *
 * // Analyze and get recommended resolution
 * const analysis = await resolver.analyzeConflict(conflict);
 * const suggested = resolver.getSuggestedResolution(conflict);
 *
 * // Apply resolution
 * const result = await resolver.resolve(conflict, suggested);
 * ```
 */
export class GitHubConflictResolver {
	constructor(private readonly conflictResolutionService: ConflictResolutionService) {}

	/**
	 * Analyze a conflict and prepare resolution options
	 *
	 * @param conflict - The conflict to analyze
	 * @returns Analysis with available strategies and formatted diffs
	 *
	 * @example
	 * ```typescript
	 * const analysis = await resolver.analyzeConflict(conflict);
	 * console.log(`Recommended strategy: ${analysis.recommendedStrategy}`);
	 * console.log(`Can auto-resolve: ${analysis.canAutoResolve}`);
	 * ```
	 */
	async analyzeConflict(conflict: ConflictInfo): Promise<ConflictAnalysis> {
		return await this.conflictResolutionService.analyzeConflict(conflict);
	}

	/**
	 * Get suggested resolution for a conflict
	 *
	 * @param conflict - The conflict to get suggestion for
	 * @returns Suggested resolution based on analysis
	 *
	 * @example
	 * ```typescript
	 * const suggested = resolver.getSuggestedResolution(conflict);
	 * console.log(`Strategy: ${suggested.strategy}`);
	 * ```
	 */
	getSuggestedResolution(conflict: ConflictInfo): ConflictResolution {
		return this.conflictResolutionService.getSuggestedResolution(conflict);
	}

	/**
	 * Resolve a conflict with the given resolution
	 *
	 * @param conflict - The conflict to resolve
	 * @param resolution - The resolution to apply
	 * @returns Result of the resolution
	 *
	 * @example
	 * ```typescript
	 * const result = await resolver.resolve(conflict, resolution);
	 * if (result.success) {
	 *   console.log('Conflict resolved successfully');
	 * } else {
	 *   console.error('Resolution failed:', result.errors);
	 * }
	 * ```
	 */
	async resolve(conflict: ConflictInfo, resolution: ConflictResolution): Promise<ResolutionResult> {
		return await this.conflictResolutionService.resolveConflict(conflict, resolution);
	}

	/**
	 * Resolve multiple conflicts with the same strategy
	 *
	 * @param conflicts - Array of conflicts to resolve
	 * @param strategy - Strategy to apply to all conflicts
	 * @returns Batch resolution result
	 *
	 * @example
	 * ```typescript
	 * const result = await resolver.resolveMany(conflicts, 'timestamp_based');
	 * console.log(`Resolved: ${result.resolved}/${result.totalConflicts}`);
	 * ```
	 */
	async resolveMany(
		conflicts: ConflictInfo[],
		strategy: ConflictResolutionStrategy,
	): Promise<BatchResolutionResult> {
		return await this.conflictResolutionService.resolveConflicts(conflicts, strategy);
	}

	/**
	 * Auto-resolve conflicts that can be safely resolved automatically
	 *
	 * @param conflicts - Array of conflicts to auto-resolve
	 * @returns Batch resolution result with only auto-resolvable conflicts processed
	 *
	 * @example
	 * ```typescript
	 * const result = await resolver.autoResolve(conflicts);
	 * console.log(`Auto-resolved: ${result.resolved} conflicts`);
	 * const remaining = conflicts.filter((c, i) =>
	 *   !result.results[i]?.success
	 * );
	 * console.log(`Manual resolution needed for: ${remaining.length} conflicts`);
	 * ```
	 */
	async autoResolve(conflicts: ConflictInfo[]): Promise<BatchResolutionResult> {
		// Filter to only auto-resolvable conflicts
		const autoResolvable = conflicts.filter((c) => c.canAutoResolve);

		// Use suggested strategy for each (which will be auto_merge or timestamp_based)
		return await this.conflictResolutionService.resolveConflicts(
			autoResolvable,
			'auto_merge',
			{ stopOnError: false },
		);
	}

	/**
	 * Validate a proposed resolution without applying it
	 *
	 * @param conflict - The conflict being resolved
	 * @param resolution - The proposed resolution
	 * @returns Validation result
	 *
	 * @example
	 * ```typescript
	 * const validation = resolver.validate(conflict, resolution);
	 * if (!validation.valid) {
	 *   console.error('Invalid resolution:', validation.errors);
	 * }
	 * ```
	 */
	validate(conflict: ConflictInfo, resolution: ConflictResolution): ValidationResult {
		return this.conflictResolutionService.validateResolution(conflict, resolution);
	}

	/**
	 * Preview what will happen if a resolution is applied
	 *
	 * @param conflict - The conflict to preview
	 * @param resolution - The resolution to preview
	 * @returns Preview result showing what changes will be made
	 *
	 * @example
	 * ```typescript
	 * const preview = await resolver.preview(conflict, resolution);
	 * console.log('Changes that will be made:');
	 * preview.impacts.forEach(impact => console.log(`- ${impact}`));
	 * ```
	 */
	async preview(conflict: ConflictInfo, resolution: ConflictResolution): Promise<PreviewResult> {
		return await this.conflictResolutionService.previewResolution(conflict, resolution);
	}

	/**
	 * Undo a previously applied resolution
	 *
	 * @param historyId - ID of the resolution to undo
	 * @returns Result of the undo operation
	 *
	 * @example
	 * ```typescript
	 * const result = await resolver.undo('abc-123');
	 * if (result.success) {
	 *   console.log('Resolution undone successfully');
	 * }
	 * ```
	 */
	async undo(historyId: string): Promise<ResolutionResult> {
		return await this.conflictResolutionService.undoResolution(historyId);
	}

	/**
	 * Get resolution history for a conflict
	 *
	 * @param conflictId - ID of the conflict
	 * @returns Array of resolution history records
	 */
	async getHistory(conflictId: string) {
		return await this.conflictResolutionService.getResolutionHistory(conflictId);
	}

	/**
	 * Clear old resolution history
	 *
	 * @param olderThan - Optional date - clear history older than this
	 */
	async clearHistory(olderThan?: Date): Promise<void> {
		return await this.conflictResolutionService.clearResolutionHistory(olderThan);
	}
}
