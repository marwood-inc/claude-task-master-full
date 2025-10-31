/**
 * GitHub Conflict Detection and Resolution Types
 *
 * This module defines comprehensive type definitions for detecting and resolving
 * conflicts during bidirectional synchronization between Task Master tasks and GitHub issues.
 *
 * @module github-conflict-types
 */

/**
 * Fields that can have conflicts during synchronization
 *
 * @example
 * ```typescript
 * const conflictField: ConflictField = 'title';
 * ```
 */
export type ConflictField =
	| 'title'
	| 'description'
	| 'status'
	| 'priority'
	| 'labels'
	| 'assignee'
	| 'dependencies'
	| 'subtasks'
	| 'milestone';

/**
 * Types of field-level conflicts
 *
 * @remarks
 * - `value_mismatch`: Field values differ between local and remote
 * - `deleted_locally`: Field was removed in local task
 * - `deleted_remotely`: Field was removed in remote issue
 * - `added_locally`: Field was added in local task
 * - `added_remotely`: Field was added in remote issue
 * - `structural_change`: Complex structural modification (e.g., subtask reordering)
 */
export type FieldConflictType =
	| 'value_mismatch'
	| 'deleted_locally'
	| 'deleted_remotely'
	| 'added_locally'
	| 'added_remotely'
	| 'structural_change';

/**
 * Conflict severity levels
 *
 * @remarks
 * - `low`: Auto-resolvable conflicts with minimal risk
 * - `medium`: Requires user confirmation before resolution
 * - `high`: Manual resolution required
 * - `critical`: Potential for data loss, requires careful review
 */
export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Conflict resolution strategies
 *
 * @remarks
 * - `last_write_wins_local`: Always prefer local task changes
 * - `last_write_wins_remote`: Always prefer remote issue changes
 * - `timestamp_based`: Use most recent timestamp per field
 * - `manual`: Require explicit user selection
 * - `auto_merge`: Attempt automatic 3-way merge
 *
 * @example
 * ```typescript
 * const strategy: ConflictResolutionStrategy = 'timestamp_based';
 * ```
 */
export type ConflictResolutionStrategy =
	| 'last_write_wins_local'
	| 'last_write_wins_remote'
	| 'timestamp_based'
	| 'manual'
	| 'auto_merge';

/**
 * Individual field-level conflict information
 *
 * @remarks
 * Represents a conflict for a specific field with local and remote values,
 * along with metadata for resolution decisions.
 *
 * @example
 * ```typescript
 * const fieldConflict: FieldConflict = {
 *   field: 'title',
 *   localValue: 'Local Task Title',
 *   remoteValue: 'Remote Issue Title',
 *   baseValue: 'Original Title',
 *   type: 'value_mismatch',
 *   canAutoMerge: false,
 * };
 * ```
 */
export interface FieldConflict {
	/** Field that has conflict */
	readonly field: ConflictField;

	/** Local (Task Master) value */
	readonly localValue: unknown;

	/** Remote (GitHub) value */
	readonly remoteValue: unknown;

	/** Last synced value (baseline for 3-way merge) */
	readonly baseValue?: unknown;

	/** Conflict type */
	readonly type: FieldConflictType;

	/** Whether this field can be auto-merged */
	readonly canAutoMerge: boolean;

	/** Auto-merge result (if applicable) */
	readonly autoMergeValue?: unknown;
}

/**
 * Timestamp analysis for conflict context
 *
 * @remarks
 * Provides detailed temporal analysis of when changes occurred,
 * helping determine appropriate resolution strategies.
 *
 * @example
 * ```typescript
 * const analysis: TimestampAnalysis = {
 *   localUpdatedAt: '2025-10-31T12:00:00Z',
 *   remoteUpdatedAt: '2025-10-31T11:59:00Z',
 *   lastSyncedAt: '2025-10-31T10:00:00Z',
 *   timeSinceLastSync: 7200000, // 2 hours in ms
 *   recentSide: 'local',
 *   simultaneousEdit: false,
 * };
 * ```
 */
export interface TimestampAnalysis {
	/** Local task last updated timestamp (ISO 8601) */
	readonly localUpdatedAt: string;

	/** Remote issue last updated timestamp (ISO 8601) */
	readonly remoteUpdatedAt: string;

	/** Last sync timestamp - baseline (ISO 8601) */
	readonly lastSyncedAt: string;

	/** Time elapsed since last sync (milliseconds) */
	readonly timeSinceLastSync: number;

	/** Which side was modified more recently */
	readonly recentSide: 'local' | 'remote' | 'simultaneous';

	/** Whether modifications were likely simultaneous (within tolerance window) */
	readonly simultaneousEdit: boolean;
}

/**
 * Conflict resolution result
 *
 * @remarks
 * Contains the outcome of resolving a conflict, including which strategy
 * was used and the final resolved values.
 *
 * @example
 * ```typescript
 * const resolution: ConflictResolution = {
 *   strategy: 'manual',
 *   resolvedAt: '2025-10-31T13:00:00Z',
 *   resolvedFields: {
 *     title: 'Merged Title',
 *     description: 'Merged Description',
 *   },
 *   automatic: false,
 *   resolvedBy: 'user@example.com',
 *   notes: 'Chose to keep local title but remote description',
 * };
 * ```
 */
export interface ConflictResolution {
	/** Resolution strategy used */
	readonly strategy: ConflictResolutionStrategy;

	/** When the conflict was resolved (ISO 8601) */
	readonly resolvedAt: string;

	/** Resolved values for each field */
	readonly resolvedFields: Partial<Record<ConflictField, unknown>>;

	/** Whether resolution was automatic */
	readonly automatic: boolean;

	/** User who resolved (if manual) */
	readonly resolvedBy?: string;

	/** Resolution notes or rationale */
	readonly notes?: string;
}

/**
 * Enhanced conflict information with field-level granularity
 *
 * @remarks
 * Comprehensive conflict representation that includes all details needed
 * for both automatic and manual conflict resolution.
 *
 * @example
 * ```typescript
 * const conflictInfo: ConflictInfo = {
 *   conflictId: 'conflict_task1_issue42_20251031',
 *   taskId: '1',
 *   issueNumber: 42,
 *   detectedAt: '2025-10-31T12:30:00Z',
 *   severity: 'medium',
 *   fieldConflicts: [
 *     {
 *       field: 'title',
 *       localValue: 'Local Title',
 *       remoteValue: 'Remote Title',
 *       type: 'value_mismatch',
 *       canAutoMerge: false,
 *     },
 *   ],
 *   timestampAnalysis: {
 *     localUpdatedAt: '2025-10-31T12:00:00Z',
 *     remoteUpdatedAt: '2025-10-31T11:59:00Z',
 *     lastSyncedAt: '2025-10-31T10:00:00Z',
 *     timeSinceLastSync: 7200000,
 *     recentSide: 'local',
 *     simultaneousEdit: false,
 *   },
 *   suggestedStrategy: 'timestamp_based',
 *   canAutoResolve: true,
 * };
 * ```
 */
export interface ConflictInfo {
	/** Conflict unique identifier */
	readonly conflictId: string;

	/** Task ID involved */
	readonly taskId: string;

	/** GitHub issue number involved */
	readonly issueNumber: number;

	/** When the conflict was detected (ISO 8601) */
	readonly detectedAt: string;

	/** Severity level of the conflict */
	readonly severity: ConflictSeverity;

	/** Individual field conflicts */
	readonly fieldConflicts: readonly FieldConflict[];

	/** Timestamp analysis */
	readonly timestampAnalysis: TimestampAnalysis;

	/** Suggested resolution strategy */
	readonly suggestedStrategy: ConflictResolutionStrategy;

	/** Whether auto-resolution is possible */
	readonly canAutoResolve: boolean;

	/** Resolution metadata (if resolved) */
	readonly resolution?: ConflictResolution;
}

/**
 * Complete conflict detection result
 *
 * @remarks
 * Aggregates all detected conflicts with overall statistics and metadata
 * to facilitate batch processing and reporting.
 *
 * @example
 * ```typescript
 * const result: ConflictDetectionResult = {
 *   hasConflicts: true,
 *   conflictCount: 2,
 *   conflicts: [conflictInfo1, conflictInfo2],
 *   overallSeverity: 'high',
 *   canAutoResolveAll: false,
 *   detectedAt: '2025-10-31T12:30:00Z',
 * };
 * ```
 */
export interface ConflictDetectionResult {
	/** Whether conflicts were detected */
	readonly hasConflicts: boolean;

	/** Number of conflicts found */
	readonly conflictCount: number;

	/** Detailed conflict information */
	readonly conflicts: readonly ConflictInfo[];

	/** Overall severity (highest among conflicts) */
	readonly overallSeverity: ConflictSeverity;

	/** Whether all conflicts can be auto-resolved */
	readonly canAutoResolveAll: boolean;

	/** Detection timestamp (ISO 8601) */
	readonly detectedAt: string;
}
