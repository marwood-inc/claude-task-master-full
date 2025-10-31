/**
 * @fileoverview Type definitions for GitHub bidirectional change detection
 * Supports timestamp-based and content-based change detection strategies
 */

/**
 * Change detection strategy
 */
export type ChangeDetectionStrategy =
	| 'timestamp' // Compare last modified timestamps
	| 'content-hash' // Compare content hashes
	| 'field-by-field' // Deep comparison of all fields
	| 'hybrid'; // Combine timestamp and content hash

/**
 * Field change information
 */
export interface FieldChange {
	/** Field name that changed */
	field: string;

	/** Local value */
	localValue: unknown;

	/** Remote value */
	remoteValue: unknown;

	/** Whether this is a conflict (both sides changed) */
	isConflict: boolean;

	/** Change direction */
	direction: 'local_only' | 'remote_only' | 'both';
}

/**
 * Change detection result for a single task-issue pair
 */
export interface ChangeDetectionResult {
	/** Task ID */
	taskId: string;

	/** Issue number */
	issueNumber: number;

	/** Whether any changes were detected */
	hasChanges: boolean;

	/** Whether local changes were detected */
	hasLocalChanges: boolean;

	/** Whether remote changes were detected */
	hasRemoteChanges: boolean;

	/** Whether there are conflicting changes */
	hasConflicts: boolean;

	/** List of field changes */
	fieldChanges: FieldChange[];

	/** Local task last updated timestamp */
	localUpdatedAt: string;

	/** Remote issue last updated timestamp */
	remoteUpdatedAt: string;

	/** Last sync timestamp */
	lastSyncedAt: string;

	/** Strategy used for detection */
	strategy: ChangeDetectionStrategy;

	/** Content hashes (if using content-hash strategy) */
	contentHashes?: {
		local: string;
		remote: string;
	};
}

/**
 * Batch change detection result
 */
export interface BatchChangeDetectionResult {
	/** Total items checked */
	totalChecked: number;

	/** Items with changes */
	itemsWithChanges: number;

	/** Items with local changes only */
	itemsWithLocalChanges: number;

	/** Items with remote changes only */
	itemsWithRemoteChanges: number;

	/** Items with conflicts */
	itemsWithConflicts: number;

	/** Individual results */
	results: ChangeDetectionResult[];

	/** Detection timestamp */
	detectedAt: string;

	/** Strategy used */
	strategy: ChangeDetectionStrategy;
}

/**
 * Options for change detection
 */
export interface ChangeDetectionOptions {
	/** Detection strategy to use */
	strategy?: ChangeDetectionStrategy;

	/** Fields to compare (null = all fields) */
	fieldsToCompare?: string[] | null;

	/** Whether to include content hashes in result */
	includeContentHashes?: boolean;

	/** Batch size for concurrent checks */
	batchSize?: number;
}

/**
 * Field mapping for comparison
 * Maps task fields to issue fields
 */
export interface FieldMapping {
	/** Task field name */
	taskField: string;

	/** Issue field name */
	issueField: string;

	/** Transform function for comparison */
	transform?: (value: unknown) => unknown;

	/** Whether this field should be ignored during comparison */
	ignore?: boolean;
}
