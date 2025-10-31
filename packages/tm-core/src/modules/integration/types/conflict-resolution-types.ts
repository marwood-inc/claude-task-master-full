/**
 * Conflict Resolution Types
 *
 * Type definitions for interactive and automated conflict resolution mechanisms.
 *
 * @module conflict-resolution-types
 */

import type { ConflictField, ConflictInfo, ConflictResolution, ConflictResolutionStrategy } from './github-conflict-types.js';

/**
 * Analysis result for a conflict with resolution options
 *
 * @remarks
 * Provides comprehensive analysis of a conflict including available
 * resolution strategies, risk assessment, and formatted diffs.
 *
 * @example
 * ```typescript
 * const analysis: ConflictAnalysis = {
 *   conflict: conflictInfo,
 *   availableStrategies: ['manual', 'timestamp_based'],
 *   recommendedStrategy: 'manual',
 *   canAutoResolve: false,
 *   riskLevel: 'medium',
 *   fieldDiffs: [titleDiff, descriptionDiff],
 * };
 * ```
 */
export interface ConflictAnalysis {
	/** The conflict being analyzed */
	readonly conflict: ConflictInfo;

	/** Strategies available for this conflict */
	readonly availableStrategies: readonly ConflictResolutionStrategy[];

	/** Recommended strategy based on conflict characteristics */
	readonly recommendedStrategy: ConflictResolutionStrategy;

	/** Whether this conflict can be auto-resolved safely */
	readonly canAutoResolve: boolean;

	/** Risk level of applying auto-resolution */
	readonly riskLevel: 'low' | 'medium' | 'high';

	/** Formatted diffs for each field */
	readonly fieldDiffs: readonly FieldDiffDisplay[];
}

/**
 * Display type for field diffs
 *
 * @remarks
 * - `text-diff`: Line-by-line diff for text content (title, description)
 * - `value-comparison`: Side-by-side value comparison (status, priority)
 * - `list-diff`: Array/list comparison with add/remove highlighting (labels, dependencies)
 */
export type DiffDisplayType = 'text-diff' | 'value-comparison' | 'list-diff';

/**
 * Diff display for a single field
 *
 * @remarks
 * Provides formatted diff information ready for CLI/UI display.
 *
 * @example
 * ```typescript
 * const diff: FieldDiffDisplay = {
 *   field: 'title',
 *   localValue: 'Implement feature X',
 *   remoteValue: 'Implement Feature X (updated)',
 *   baseValue: 'Implement feature X',
 *   diffLines: [
 *     { type: 'unchanged', content: 'Implement feature X' },
 *     { type: 'add', content: ' (updated)' },
 *   ],
 *   displayType: 'text-diff',
 * };
 * ```
 */
export interface FieldDiffDisplay {
	/** Field being compared */
	readonly field: ConflictField;

	/** Local value (formatted for display) */
	readonly localValue: string;

	/** Remote value (formatted for display) */
	readonly remoteValue: string;

	/** Base value if available (formatted for display) */
	readonly baseValue?: string;

	/** Line-by-line diff (for text fields) */
	readonly diffLines?: readonly DiffLine[];

	/** How this diff should be displayed */
	readonly displayType: DiffDisplayType;
}

/**
 * Individual diff line (for text-based diffs)
 *
 * @remarks
 * Represents a single line in a text diff, tagged with its change type.
 *
 * @example
 * ```typescript
 * const lines: DiffLine[] = [
 *   { type: 'unchanged', content: 'First line', lineNumber: 1 },
 *   { type: 'remove', content: 'Old text', lineNumber: 2 },
 *   { type: 'add', content: 'New text' },
 * ];
 * ```
 */
export interface DiffLine {
	/** Type of change for this line */
	readonly type: 'add' | 'remove' | 'unchanged';

	/** Line content */
	readonly content: string;

	/** Line number (in original/final document) */
	readonly lineNumber?: number;
}

/**
 * Result of applying a resolution
 *
 * @remarks
 * Contains the outcome of resolving a conflict, including success status,
 * applied values, and any errors or warnings.
 *
 * @example
 * ```typescript
 * const result: ResolutionResult = {
 *   success: true,
 *   conflict: conflictInfo,
 *   resolution: conflictResolution,
 *   appliedValues: {
 *     title: 'Final Title',
 *     description: 'Final Description',
 *   },
 *   warnings: ['Timestamp difference < 60s, possible concurrent edit'],
 * };
 * ```
 */
export interface ResolutionResult {
	/** Whether the resolution was successful */
	readonly success: boolean;

	/** The conflict that was resolved */
	readonly conflict: ConflictInfo;

	/** The resolution that was applied */
	readonly resolution: ConflictResolution;

	/** Values that were actually applied */
	readonly appliedValues: Partial<Record<ConflictField, unknown>>;

	/** Errors that occurred during resolution (if any) */
	readonly errors?: readonly string[];

	/** Warnings about the resolution (if any) */
	readonly warnings?: readonly string[];
}

/**
 * Options for batch conflict resolution
 *
 * @remarks
 * Controls behavior when resolving multiple conflicts at once.
 *
 * @example
 * ```typescript
 * const options: BatchResolutionOptions = {
 *   stopOnError: true,
 *   requireConfirmation: false,
 *   dryRun: false,
 * };
 * ```
 */
export interface BatchResolutionOptions {
	/** Stop batch processing if any resolution fails */
	readonly stopOnError?: boolean;

	/** Require user confirmation for each conflict */
	readonly requireConfirmation?: boolean;

	/** Preview changes without applying them */
	readonly dryRun?: boolean;
}

/**
 * Result of batch conflict resolution
 *
 * @remarks
 * Aggregates results from resolving multiple conflicts.
 *
 * @example
 * ```typescript
 * const batchResult: BatchResolutionResult = {
 *   totalConflicts: 10,
 *   resolved: 8,
 *   failed: 1,
 *   skipped: 1,
 *   results: [...resolutionResults],
 *   errors: [{ conflict: conflictInfo, error: 'Network error' }],
 * };
 * ```
 */
export interface BatchResolutionResult {
	/** Total number of conflicts processed */
	readonly totalConflicts: number;

	/** Number of conflicts successfully resolved */
	readonly resolved: number;

	/** Number of conflicts that failed */
	readonly failed: number;

	/** Number of conflicts skipped */
	readonly skipped: number;

	/** Individual resolution results */
	readonly results: readonly ResolutionResult[];

	/** Errors by conflict */
	readonly errors: readonly ConflictError[];
}

/**
 * Error information for a conflict
 */
export interface ConflictError {
	/** The conflict that failed */
	readonly conflict: ConflictInfo;

	/** Error message */
	readonly error: string;
}

/**
 * Validation result for a resolution
 *
 * @remarks
 * Indicates whether a proposed resolution is valid and provides
 * any validation errors or warnings.
 *
 * @example
 * ```typescript
 * const validation: ValidationResult = {
 *   valid: false,
 *   errors: ['Field "assignee" not part of conflict'],
 *   warnings: ['Resolution changes priority to unrecognized value'],
 * };
 * ```
 */
export interface ValidationResult {
	/** Whether the resolution is valid */
	readonly valid: boolean;

	/** Validation errors (prevent resolution if present) */
	readonly errors: readonly string[];

	/** Validation warnings (allow resolution but notify user) */
	readonly warnings: readonly string[];
}

/**
 * Preview result (shows what would happen)
 *
 * @remarks
 * Provides a preview of resolution effects without applying changes.
 *
 * @example
 * ```typescript
 * const preview: PreviewResult = {
 *   conflict: conflictInfo,
 *   resolution: conflictResolution,
 *   willApply: {
 *     title: 'New Title',
 *     status: 'in-progress',
 *   },
 *   impacts: [
 *     'Task title will be updated in local database',
 *     'GitHub issue #42 title will be updated',
 *     'Sync timestamp will be updated',
 *   ],
 * };
 * ```
 */
export interface PreviewResult {
	/** The conflict being previewed */
	readonly conflict: ConflictInfo;

	/** The resolution to preview */
	readonly resolution: ConflictResolution;

	/** Values that will be applied */
	readonly willApply: Partial<Record<ConflictField, unknown>>;

	/** Human-readable impact descriptions */
	readonly impacts: readonly string[];
}

/**
 * Resolution history record for undo support
 *
 * @remarks
 * Tracks resolution details for potential undo operations (subtask 5.4).
 */
export interface ResolutionHistory {
	/** Unique history entry ID */
	readonly historyId: string;

	/** Conflict that was resolved */
	readonly conflictId: string;

	/** Task ID involved */
	readonly taskId: string;

	/** GitHub issue number involved */
	readonly issueNumber: number;

	/** When the resolution was applied */
	readonly resolvedAt: string;

	/** The resolution that was applied */
	readonly resolution: ConflictResolution;

	/** Result of the resolution */
	readonly result: ResolutionResult;

	/** State before resolution (for undo) */
	readonly previousState: ConflictState;
}

/**
 * Captured conflict state for undo support
 */
export interface ConflictState {
	/** Task state at time of conflict */
	readonly taskState: Record<string, unknown>;

	/** Issue state at time of conflict */
	readonly issueState: Record<string, unknown>;

	/** Sync metadata state */
	readonly syncMetadata: Record<string, unknown>;
}
