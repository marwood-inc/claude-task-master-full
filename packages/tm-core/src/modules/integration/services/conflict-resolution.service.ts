/**
 * Conflict Resolution Service
 *
 * Handles interactive and automated conflict resolution for GitHub sync operations.
 *
 * @module conflict-resolution.service
 */

import type { ConfigManager } from '../../../config/config-manager.js';
import type { GitHubSyncStateService } from './github-sync-state.service.js';
import type { GitHubConfigService } from './github-config.service.js';
import type {
	ConflictInfo,
	ConflictResolution,
	ConflictResolutionStrategy,
	FieldConflict,
	ConflictField,
} from '../types/github-conflict-types.js';
import type {
	ConflictAnalysis,
	FieldDiffDisplay,
	DiffLine,
	ResolutionResult,
	BatchResolutionOptions,
	BatchResolutionResult,
	ValidationResult,
	PreviewResult,
	ResolutionHistory,
	ConflictState,
	DiffDisplayType,
} from '../types/conflict-resolution-types.js';
import { randomUUID } from 'node:crypto';

/**
 * Service for resolving conflicts between local tasks and remote GitHub issues
 *
 * @example
 * ```typescript
 * const service = new ConflictResolutionService(configManager, syncStateService, githubConfigService);
 * const analysis = await service.analyzeConflict(conflict);
 * const resolution = // ... user provides resolution
 * const result = await service.resolveConflict(conflict, resolution);
 * ```
 */
export class ConflictResolutionService {
	constructor(
		private readonly configManager: ConfigManager,
		private readonly syncStateService: GitHubSyncStateService,
		private readonly githubConfigService: GitHubConfigService,
	) {}

	/**
	 * Analyze a conflict and prepare resolution options
	 *
	 * @param conflict - The conflict to analyze
	 * @returns Analysis with available strategies and formatted diffs
	 */
	async analyzeConflict(conflict: ConflictInfo): Promise<ConflictAnalysis> {
		// Determine available strategies based on conflict characteristics
		const availableStrategies = this.determineAvailableStrategies(conflict);

		// Get recommended strategy
		const recommendedStrategy = this.getRecommendedStrategy(conflict);

		// Calculate risk level
		const riskLevel = this.calculateRiskLevel(conflict);

		// Generate field diffs
		const fieldDiffs = conflict.fieldConflicts.map((fc) => this.generateFieldDiff(fc));

		return {
			conflict,
			availableStrategies,
			recommendedStrategy,
			canAutoResolve: conflict.canAutoResolve,
			riskLevel,
			fieldDiffs,
		};
	}

	/**
	 * Generate a formatted diff display for a field conflict
	 *
	 * @param fieldConflict - The field conflict to format
	 * @returns Formatted diff display
	 */
	generateFieldDiff(fieldConflict: FieldConflict): FieldDiffDisplay {
		const { field, localValue, remoteValue, baseValue } = fieldConflict;

		// Format values as strings
		const localStr = this.formatValue(localValue);
		const remoteStr = this.formatValue(remoteValue);
		const baseStr = baseValue !== undefined ? this.formatValue(baseValue) : undefined;

		// Determine display type
		const displayType = this.determineDisplayType(field, localValue, remoteValue);

		// Generate diff lines for text-based diffs
		let diffLines: DiffLine[] | undefined;
		if (displayType === 'text-diff') {
			diffLines = this.generateTextDiff(localStr, remoteStr, baseStr);
		}

		return {
			field,
			localValue: localStr,
			remoteValue: remoteStr,
			baseValue: baseStr,
			diffLines,
			displayType,
		};
	}

	/**
	 * Apply a resolution to a conflict
	 *
	 * @param conflict - The conflict to resolve
	 * @param resolution - The resolution to apply
	 * @returns Result of the resolution
	 */
	async resolveConflict(
		conflict: ConflictInfo,
		resolution: ConflictResolution,
	): Promise<ResolutionResult> {
		// Validate the resolution
		const validation = this.validateResolution(conflict, resolution);
		if (!validation.valid) {
			return {
				success: false,
				conflict,
				resolution,
				appliedValues: {},
				errors: validation.errors,
				warnings: validation.warnings,
			};
		}

		try {
			// Record resolution history before applying
			await this.recordResolution(conflict, resolution);

			// Apply the resolution (this will be implemented in subtask 5.3 with actual sync logic)
			const appliedValues = resolution.resolvedFields;

			// Mark conflict as resolved in sync state
			await this.markConflictResolved(conflict.conflictId, resolution);

			return {
				success: true,
				conflict,
				resolution,
				appliedValues,
				warnings: validation.warnings,
			};
		} catch (error) {
			return {
				success: false,
				conflict,
				resolution,
				appliedValues: {},
				errors: [error instanceof Error ? error.message : String(error)],
			};
		}
	}

	/**
	 * Resolve multiple conflicts in batch
	 *
	 * @param conflicts - Array of conflicts to resolve
	 * @param strategy - Strategy to apply to all conflicts
	 * @param options - Batch resolution options
	 * @returns Batch resolution result
	 */
	async resolveConflicts(
		conflicts: ConflictInfo[],
		strategy: ConflictResolutionStrategy,
		options?: BatchResolutionOptions,
	): Promise<BatchResolutionResult> {
		const results: ResolutionResult[] = [];
		const errors: Array<{ conflict: ConflictInfo; error: string }> = [];

		for (const conflict of conflicts) {
			try {
				// Generate resolution based on strategy (will be enhanced in subtask 5.3)
				const resolution = this.generateResolutionForStrategy(conflict, strategy);

				// Apply resolution
				const result = await this.resolveConflict(conflict, resolution);
				results.push(result);

				// Stop on error if configured
				if (options?.stopOnError && !result.success) {
					break;
				}
			} catch (error) {
				errors.push({
					conflict,
					error: error instanceof Error ? error.message : String(error),
				});

				if (options?.stopOnError) {
					break;
				}
			}
		}

		// Calculate statistics
		const resolved = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length + errors.length;
		const skipped = conflicts.length - (resolved + failed);

		return {
			totalConflicts: conflicts.length,
			resolved,
			failed,
			skipped,
			results,
			errors,
		};
	}

	/**
	 * Validate a proposed resolution
	 *
	 * @param conflict - The conflict being resolved
	 * @param resolution - The proposed resolution
	 * @returns Validation result
	 */
	validateResolution(conflict: ConflictInfo, resolution: ConflictResolution): ValidationResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		// Validate all resolved fields are part of the conflict
		for (const field of Object.keys(resolution.resolvedFields)) {
			if (!conflict.fieldConflicts.some((fc) => fc.field === field)) {
				errors.push(`Field "${field}" is not part of the conflict`);
			}
		}

		// Validate strategy is appropriate for conflict
		if (resolution.strategy === 'auto_merge' && !conflict.canAutoResolve) {
			errors.push('Auto-merge strategy not available for this conflict');
		}

		// Warn if timestamp difference is very small (possible concurrent edit)
		if (conflict.timestampAnalysis.simultaneousEdit) {
			warnings.push('Modifications were nearly simultaneous, review carefully');
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}

	/**
	 * Preview a resolution without applying it
	 *
	 * @param conflict - The conflict to preview
	 * @param resolution - The resolution to preview
	 * @returns Preview result
	 */
	async previewResolution(
		conflict: ConflictInfo,
		resolution: ConflictResolution,
	): Promise<PreviewResult> {
		const impacts: string[] = [];

		// Generate impact descriptions for each resolved field
		for (const [field, value] of Object.entries(resolution.resolvedFields)) {
			impacts.push(`${field} will be set to: ${this.formatValue(value)}`);
		}

		// Add sync impacts
		impacts.push(`Task #${conflict.taskId} will be updated in local database`);
		impacts.push(`GitHub issue #${conflict.issueNumber} will be updated`);
		impacts.push(`Conflict will be marked as resolved`);
		impacts.push(`Sync timestamp will be updated`);

		return {
			conflict,
			resolution,
			willApply: resolution.resolvedFields,
			impacts,
		};
	}

	/**
	 * Get suggested resolution for a conflict based on analysis
	 *
	 * @param conflict - The conflict to suggest resolution for
	 * @returns Suggested resolution
	 */
	getSuggestedResolution(conflict: ConflictInfo): ConflictResolution {
		const strategy = conflict.suggestedStrategy;
		return this.generateResolutionForStrategy(conflict, strategy);
	}

	/**
	 * Determine available resolution strategies for a conflict
	 *
	 * @private
	 */
	private determineAvailableStrategies(conflict: ConflictInfo): ConflictResolutionStrategy[] {
		const strategies: ConflictResolutionStrategy[] = ['manual'];

		// Timestamp-based is available if we have timestamp info
		if (conflict.timestampAnalysis) {
			strategies.push('timestamp_based');
		}

		// Last-write-wins strategies always available
		strategies.push('last_write_wins_local', 'last_write_wins_remote');

		// Auto-merge only if conflict supports it
		if (conflict.canAutoResolve) {
			strategies.push('auto_merge');
		}

		return strategies;
	}

	/**
	 * Get recommended strategy based on conflict characteristics
	 *
	 * @private
	 */
	private getRecommendedStrategy(conflict: ConflictInfo): ConflictResolutionStrategy {
		// Use suggested strategy from conflict analysis
		if (conflict.suggestedStrategy) {
			return conflict.suggestedStrategy;
		}

		// High severity conflicts should use manual resolution
		if (conflict.severity === 'high' || conflict.severity === 'critical') {
			return 'manual';
		}

		// If timestamps are clear, use timestamp-based
		if (conflict.timestampAnalysis && !conflict.timestampAnalysis.simultaneousEdit) {
			return 'timestamp_based';
		}

		// Default to manual for safety
		return 'manual';
	}

	/**
	 * Calculate risk level for auto-resolution
	 *
	 * @private
	 */
	private calculateRiskLevel(conflict: ConflictInfo): 'low' | 'medium' | 'high' {
		// High/critical severity = high risk
		if (conflict.severity === 'high' || conflict.severity === 'critical') {
			return 'high';
		}

		// Simultaneous edits = medium risk
		if (conflict.timestampAnalysis.simultaneousEdit) {
			return 'medium';
		}

		// Low severity + clear timestamps = low risk
		if (conflict.severity === 'low') {
			return 'low';
		}

		return 'medium';
	}

	/**
	 * Determine appropriate display type for a field
	 *
	 * @private
	 */
	private determineDisplayType(
		field: ConflictField,
		localValue: unknown,
		remoteValue: unknown,
	): DiffDisplayType {
		// Arrays/lists use list-diff
		if (Array.isArray(localValue) || Array.isArray(remoteValue)) {
			return 'list-diff';
		}

		// Long text fields use text-diff
		if (
			field === 'description' ||
			(typeof localValue === 'string' &&
				typeof remoteValue === 'string' &&
				(localValue.length > 100 || remoteValue.length > 100))
		) {
			return 'text-diff';
		}

		// Default to value-comparison
		return 'value-comparison';
	}

	/**
	 * Generate line-by-line text diff
	 *
	 * @private
	 */
	private generateTextDiff(local: string, remote: string, base?: string): DiffLine[] {
		// Simple line-based diff implementation
		const localLines = local.split('\n');
		const remoteLines = remote.split('\n');

		const diffLines: DiffLine[] = [];
		const maxLines = Math.max(localLines.length, remoteLines.length);

		for (let i = 0; i < maxLines; i++) {
			const localLine = localLines[i];
			const remoteLine = remoteLines[i];

			if (localLine === remoteLine) {
				if (localLine !== undefined) {
					diffLines.push({ type: 'unchanged', content: localLine, lineNumber: i + 1 });
				}
			} else {
				if (localLine !== undefined) {
					diffLines.push({ type: 'remove', content: localLine, lineNumber: i + 1 });
				}
				if (remoteLine !== undefined) {
					diffLines.push({ type: 'add', content: remoteLine });
				}
			}
		}

		return diffLines;
	}

	/**
	 * Format a value for display
	 *
	 * @private
	 */
	private formatValue(value: unknown): string {
		if (value === null || value === undefined) {
			return '(empty)';
		}

		if (Array.isArray(value)) {
			return value.join(', ');
		}

		if (typeof value === 'object') {
			return JSON.stringify(value, null, 2);
		}

		return String(value);
	}

	/**
	 * Generate resolution based on strategy (Enhanced for subtask 5.3)
	 *
	 * @private
	 */
	private generateResolutionForStrategy(
		conflict: ConflictInfo,
		strategy: ConflictResolutionStrategy,
	): ConflictResolution {
		const resolvedFields: Partial<Record<ConflictField, unknown>> = {};

		for (const fieldConflict of conflict.fieldConflicts) {
			let resolvedValue: unknown;

			switch (strategy) {
				case 'last_write_wins_local':
					resolvedValue = fieldConflict.localValue;
					break;

				case 'last_write_wins_remote':
					resolvedValue = fieldConflict.remoteValue;
					break;

				case 'timestamp_based':
					resolvedValue = this.resolveByTimestamp(fieldConflict, conflict);
					break;

				case 'auto_merge':
					resolvedValue = this.attemptAutoMerge(fieldConflict);
					break;

				case 'manual':
					// Manual resolution requires external input
					// Skip for now - will be provided by CLI layer
					continue;

				default:
					// Default to timestamp-based for unknown strategies
					resolvedValue = this.resolveByTimestamp(fieldConflict, conflict);
			}

			if (resolvedValue !== undefined) {
				resolvedFields[fieldConflict.field] = resolvedValue;
			}
		}

		return {
			strategy,
			resolvedAt: new Date().toISOString(),
			resolvedFields,
			automatic: strategy !== 'manual',
		};
	}

	/**
	 * Resolve a field by timestamp (most recent wins)
	 *
	 * @private
	 */
	private resolveByTimestamp(fieldConflict: FieldConflict, conflict: ConflictInfo): unknown {
		const { timestampAnalysis } = conflict;

		// Handle simultaneous edits - prefer remote for tie-breaking
		if (timestampAnalysis.simultaneousEdit) {
			return fieldConflict.remoteValue;
		}

		// Use most recent side
		return timestampAnalysis.recentSide === 'local'
			? fieldConflict.localValue
			: fieldConflict.remoteValue;
	}

	/**
	 * Attempt intelligent auto-merge for a field
	 *
	 * @remarks
	 * Auto-merge logic:
	 * - If one side unchanged from base: use the changed side
	 * - If both changed but compatible: attempt merge
	 * - If incompatible changes: fall back to timestamp-based
	 *
	 * @private
	 */
	private attemptAutoMerge(fieldConflict: FieldConflict): unknown {
		const { localValue, remoteValue, baseValue, canAutoMerge } = fieldConflict;

		// If can't auto-merge, return undefined (caller will handle)
		if (!canAutoMerge) {
			return undefined;
		}

		// If no base value, can't do 3-way merge - fall back to remote
		if (baseValue === undefined) {
			return remoteValue;
		}

		// Check if local is unchanged from base
		const localUnchanged = this.valuesEqual(localValue, baseValue);
		const remoteUnchanged = this.valuesEqual(remoteValue, baseValue);

		// If local unchanged, use remote
		if (localUnchanged && !remoteUnchanged) {
			return remoteValue;
		}

		// If remote unchanged, use local
		if (remoteUnchanged && !localUnchanged) {
			return localValue;
		}

		// Both changed - attempt merge based on field type
		return this.attemptFieldMerge(fieldConflict);
	}

	/**
	 * Attempt field-specific merge logic
	 *
	 * @private
	 */
	private attemptFieldMerge(fieldConflict: FieldConflict): unknown {
		const { field, localValue, remoteValue, baseValue } = fieldConflict;

		// Array fields (labels, dependencies, subtasks)
		if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
			return this.mergeArrays(
				localValue,
				remoteValue,
				Array.isArray(baseValue) ? baseValue : [],
			);
		}

		// Text fields (description)
		if (field === 'description' && typeof localValue === 'string' && typeof remoteValue === 'string') {
			// For now, prefer remote for text conflicts
			// Advanced text merging could be added later
			return remoteValue;
		}

		// Scalar fields (title, status, priority) - prefer remote for safety
		return remoteValue;
	}

	/**
	 * Merge arrays intelligently (union of additions, respect deletions)
	 *
	 * @private
	 */
	private mergeArrays(local: unknown[], remote: unknown[], base: unknown[]): unknown[] {
		const baseSet = new Set(base.map((item) => JSON.stringify(item)));
		const localSet = new Set(local.map((item) => JSON.stringify(item)));
		const remoteSet = new Set(remote.map((item) => JSON.stringify(item)));

		// Items added in local or remote
		const localAdded = local.filter((item) => !baseSet.has(JSON.stringify(item)));
		const remoteAdded = remote.filter((item) => !baseSet.has(JSON.stringify(item)));

		// Items deleted in either
		const localDeleted = base.filter((item) => !localSet.has(JSON.stringify(item)));
		const remoteDeleted = base.filter((item) => !remoteSet.has(JSON.stringify(item)));

		// Start with base
		let merged = [...base];

		// Add local additions
		merged = [...merged, ...localAdded];

		// Add remote additions (deduplicated)
		for (const item of remoteAdded) {
			if (!merged.some((m) => JSON.stringify(m) === JSON.stringify(item))) {
				merged.push(item);
			}
		}

		// Remove items deleted in either side
		const deletedSet = new Set([...localDeleted, ...remoteDeleted].map((item) => JSON.stringify(item)));
		merged = merged.filter((item) => !deletedSet.has(JSON.stringify(item)));

		return merged;
	}

	/**
	 * Check if two values are equal (deep comparison)
	 *
	 * @private
	 */
	private valuesEqual(a: unknown, b: unknown): boolean {
		// Handle null/undefined
		if (a === b) return true;
		if (a === null || b === null) return false;
		if (a === undefined || b === undefined) return false;

		// Handle arrays
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return false;
			return a.every((item, index) => this.valuesEqual(item, b[index]));
		}

		// Handle objects
		if (typeof a === 'object' && typeof b === 'object') {
			return JSON.stringify(a) === JSON.stringify(b);
		}

		// Handle primitives
		return a === b;
	}

	/**
	 * Record resolution history for undo support (subtask 5.4)
	 *
	 * @private
	 */
	private async recordResolution(
		conflict: ConflictInfo,
		resolution: ConflictResolution,
	): Promise<void> {
		const history: ResolutionHistory = {
			historyId: randomUUID(),
			conflictId: conflict.conflictId,
			taskId: conflict.taskId,
			issueNumber: conflict.issueNumber,
			resolvedAt: resolution.resolvedAt,
			resolution,
			result: {
				success: true,
				conflict,
				resolution,
				appliedValues: resolution.resolvedFields,
			},
			previousState: await this.captureCurrentState(conflict),
		};

		// Store in sync state (implementation will be added with GitHubSyncStateService updates)
		// For now, just log that we would record this
		console.log('Would record resolution history:', history.historyId);
	}

	/**
	 * Capture current state for undo support (Enhanced for subtask 5.4)
	 *
	 * @private
	 */
	private async captureCurrentState(conflict: ConflictInfo): Promise<ConflictState> {
		// Capture current field values for all conflicting fields
		const taskState: Record<string, unknown> = {
			taskId: conflict.taskId,
			timestamp: new Date().toISOString(),
		};

		const issueState: Record<string, unknown> = {
			issueNumber: conflict.issueNumber,
			timestamp: new Date().toISOString(),
		};

		// Capture current values for each field in conflict
		for (const fieldConflict of conflict.fieldConflicts) {
			taskState[fieldConflict.field] = fieldConflict.localValue;
			issueState[fieldConflict.field] = fieldConflict.remoteValue;
		}

		// Capture sync metadata
		const syncMetadata: Record<string, unknown> = {
			conflictId: conflict.conflictId,
			detectedAt: conflict.detectedAt,
			severity: conflict.severity,
			capturedAt: new Date().toISOString(),
		};

		return {
			taskState,
			issueState,
			syncMetadata,
		};
	}

	/**
	 * Undo a resolution and restore previous state (New for subtask 5.4)
	 *
	 * @param historyId - ID of the resolution to undo
	 * @returns Result of the undo operation
	 */
	async undoResolution(historyId: string): Promise<ResolutionResult> {
		try {
			// Retrieve resolution history
			const history = await this.getResolutionHistoryById(historyId);
			if (!history) {
				throw new Error(`Resolution history not found: ${historyId}`);
			}

			// Restore previous state
			const { previousState, conflict } = history;

			// Apply previous task state
			for (const [field, value] of Object.entries(previousState.taskState)) {
				if (field !== 'taskId' && field !== 'timestamp') {
					// This would update the actual task
					console.log(`Would restore task field ${field} to:`, value);
				}
			}

			// Apply previous issue state
			for (const [field, value] of Object.entries(previousState.issueState)) {
				if (field !== 'issueNumber' && field !== 'timestamp') {
					// This would update the actual issue
					console.log(`Would restore issue field ${field} to:`, value);
				}
			}

			// Mark conflict as unresolved again
			await this.markConflictUnresolved(conflict.conflictId);

			// Remove from resolution history
			await this.removeResolutionHistory(historyId);

			return {
				success: true,
				conflict,
				resolution: history.resolution,
				appliedValues: previousState.taskState,
				warnings: ['Resolution has been undone - conflict is now unresolved again'],
			};
		} catch (error) {
			return {
				success: false,
				conflict: {} as ConflictInfo,
				resolution: {} as ConflictResolution,
				appliedValues: {},
				errors: [error instanceof Error ? error.message : String(error)],
			};
		}
	}

	/**
	 * Get resolution history by ID
	 *
	 * @param historyId - Resolution history ID
	 * @returns Resolution history or undefined
	 */
	async getResolutionHistoryById(historyId: string): Promise<ResolutionHistory | undefined> {
		// This would retrieve from sync state service
		// Placeholder for now
		console.log('Would retrieve resolution history:', historyId);
		return undefined;
	}

	/**
	 * Get all resolution history for a conflict
	 *
	 * @param conflictId - Conflict ID
	 * @returns Array of resolution history records
	 */
	async getResolutionHistory(conflictId: string): Promise<ResolutionHistory[]> {
		// This would retrieve from sync state service
		// Placeholder for now
		console.log('Would retrieve all resolution history for conflict:', conflictId);
		return [];
	}

	/**
	 * Clear resolution history
	 *
	 * @param olderThan - Optional date - clear history older than this date
	 */
	async clearResolutionHistory(olderThan?: Date): Promise<void> {
		// This would clear from sync state service
		console.log('Would clear resolution history', olderThan ? `older than ${olderThan}` : 'all');
	}

	/**
	 * Mark conflict as resolved in sync state
	 *
	 * @private
	 */
	private async markConflictResolved(
		conflictId: string,
		resolution: ConflictResolution,
	): Promise<void> {
		// This will integrate with GitHubSyncStateService
		// For now, placeholder implementation
		console.log('Marking conflict resolved:', conflictId, resolution.strategy);
	}

	/**
	 * Mark conflict as unresolved (for undo)
	 *
	 * @private
	 */
	private async markConflictUnresolved(conflictId: string): Promise<void> {
		// This will integrate with GitHubSyncStateService
		console.log('Marking conflict unresolved:', conflictId);
	}

	/**
	 * Remove resolution history record
	 *
	 * @private
	 */
	private async removeResolutionHistory(historyId: string): Promise<void> {
		// This will integrate with GitHubSyncStateService
		console.log('Removing resolution history:', historyId);
	}
}
