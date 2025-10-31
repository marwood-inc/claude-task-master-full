# Task 6 Implementation Plan - Remaining Subtasks

## Overview
This document provides detailed implementation guidance for completing subtasks 6.3, 6.4, and 6.5 of Task 6: Implement Two-Way Sync with Conflict Handling.

## ✅ Completed Subtasks

### Subtask 6.1: GitHubSyncStateService Core Functionality ✓
- **Location**: `packages/tm-core/src/modules/integration/services/github-sync-state.service.ts`
- **Tests**: `packages/tm-core/src/modules/integration/services/github-sync-state.service.spec.ts`
- **Status**: ✅ Complete (38 tests passing)
- **Commit**: `feat(subtask-6.1)`

### Subtask 6.2: Bidirectional Change Detection Mechanism ✓
- **Location**: `packages/tm-core/src/modules/integration/services/github-change-detection.service.ts`
- **Types**: `packages/tm-core/src/modules/integration/types/github-change-detection-types.ts`
- **Tests**: `packages/tm-core/src/modules/integration/services/github-change-detection.service.spec.ts`
- **Status**: ✅ Complete (10 tests passing)
- **Commit**: `feat(subtask-6.2)`

---

## 🚧 Remaining Subtasks

### Subtask 6.3: GitHubConflictResolver Interactive System

**Objective**: Create comprehensive conflict detection and resolution mechanism with interactive CLI prompts.

#### File Structure
```
packages/tm-core/src/modules/integration/
├── services/
│   ├── github-conflict-resolver.service.ts        # Main service (CREATE)
│   └── github-conflict-resolver.service.spec.ts   # Tests (CREATE)
└── types/
    ├── github-conflict-types.ts                    # Already exists ✓
    └── conflict-resolution-types.ts                # Already exists ✓
```

#### Implementation Requirements

##### 1. Core Service Structure
```typescript
// packages/tm-core/src/modules/integration/services/github-conflict-resolver.service.ts

import inquirer from 'inquirer';
import type { Task } from '../../../common/types/index.js';
import type { GitHubIssue } from '../types/github-types.js';
import type {
    ConflictInfo,
    ConflictResolution,
    ConflictResolutionStrategy,
    FieldConflict
} from '../types/github-conflict-types.js';
import type {
    ConflictAnalysis,
    ResolutionResult,
    BatchResolutionResult,
    BatchResolutionOptions,
    ResolutionHistory,
    ValidationResult,
    PreviewResult
} from '../types/conflict-resolution-types.js';
import { GitHubChangeDetectionService } from './github-change-detection.service.js';
import { GitHubSyncStateService } from './github-sync-state.service.js';
import { getLogger } from '../../../common/logger/index.js';

const logger = getLogger('GitHubConflictResolverService');

export class GitHubConflictResolverService {
    constructor(
        private readonly changeDetectionService: GitHubChangeDetectionService,
        private readonly stateService: GitHubSyncStateService
    ) {
        logger.info('GitHubConflictResolverService initialized');
    }

    /**
     * Detect conflicts between task and issue
     */
    async detectConflicts(
        task: Task,
        issue: GitHubIssue
    ): Promise<ConflictInfo | null> {
        // Use changeDetectionService to detect changes
        // Build ConflictInfo with field-level details
        // Return null if no conflicts
    }

    /**
     * Analyze a conflict and provide resolution options
     */
    async analyzeConflict(conflict: ConflictInfo): Promise<ConflictAnalysis> {
        // Determine available strategies
        // Recommend best strategy
        // Calculate risk level
        // Generate field diffs
    }

    /**
     * Resolve conflict interactively via CLI prompts
     */
    async resolveInteractive(conflict: ConflictInfo): Promise<ResolutionResult> {
        // Display conflict details
        // Show diff visualization
        // Prompt user for resolution strategy
        // For manual strategy, prompt field-by-field
        // Apply resolution
        // Record in state service
    }

    /**
     * Resolve conflict automatically with specified strategy
     */
    async resolveAutomatic(
        conflict: ConflictInfo,
        strategy: ConflictResolutionStrategy
    ): Promise<ResolutionResult> {
        // Apply resolution based on strategy
        // Validate before applying
        // Record resolution
    }

    /**
     * Resolve multiple conflicts in batch
     */
    async resolveBatch(
        conflicts: ConflictInfo[],
        options?: BatchResolutionOptions
    ): Promise<BatchResolutionResult> {
        // Process conflicts one by one or in parallel
        // Handle errors based on options.stopOnError
        // Aggregate results
    }

    /**
     * Validate a proposed resolution
     */
    async validateResolution(
        conflict: ConflictInfo,
        resolution: ConflictResolution
    ): Promise<ValidationResult> {
        // Check if resolution fields match conflict fields
        // Validate resolution values
        // Check for logical conflicts
    }

    /**
     * Preview resolution effects without applying
     */
    async previewResolution(
        conflict: ConflictInfo,
        resolution: ConflictResolution
    ): Promise<PreviewResult> {
        // Calculate what values will be applied
        // Generate impact descriptions
    }

    /**
     * Undo a previous resolution
     */
    async undoResolution(historyId: string): Promise<ResolutionResult> {
        // Load resolution history from state service
        // Restore previous state
        // Update state service
    }

    /**
     * Get resolution history for a task
     */
    async getResolutionHistory(taskId: string): Promise<ResolutionHistory[]> {
        // Query state service for resolution history
    }

    // Private helper methods

    /**
     * Display conflict diff in CLI
     */
    private displayConflictDiff(conflict: ConflictInfo): void {
        // Format and display field conflicts
        // Use colors for visual distinction
        // Show local vs remote values
    }

    /**
     * Prompt user for resolution strategy
     */
    private async promptForStrategy(
        availableStrategies: ConflictResolutionStrategy[]
    ): Promise<ConflictResolutionStrategy> {
        // Use inquirer to prompt
    }

    /**
     * Prompt user for field-by-field resolution
     */
    private async promptForFieldResolution(
        fieldConflict: FieldConflict
    ): Promise<unknown> {
        // Display field diff
        // Prompt user to choose local or remote
    }

    /**
     * Apply resolution strategy
     */
    private applyStrategy(
        conflict: ConflictInfo,
        strategy: ConflictResolutionStrategy
    ): ConflictResolution {
        // Implement strategy logic
        switch (strategy) {
            case 'last_write_wins_local':
                // Return all local values
            case 'last_write_wins_remote':
                // Return all remote values
            case 'timestamp_based':
                // Compare timestamps per field
            case 'manual':
                // Already handled via interactive prompt
            case 'auto_merge':
                // Attempt 3-way merge where possible
        }
    }

    /**
     * Record resolution in state service
     */
    private async recordResolution(
        conflict: ConflictInfo,
        resolution: ConflictResolution,
        result: ResolutionResult
    ): Promise<void> {
        // Create resolution history record
        // Store in state service
        // Update conflict status
    }
}
```

##### 2. Resolution Strategy Implementation

**last_write_wins_local**:
```typescript
// Prefer all local task values
const resolution: ConflictResolution = {
    strategy: 'last_write_wins_local',
    resolvedAt: new Date().toISOString(),
    resolvedFields: conflict.fields.reduce((acc, fc) => ({
        ...acc,
        [fc.field]: fc.localValue
    }), {})
};
```

**last_write_wins_remote**:
```typescript
// Prefer all remote issue values
const resolution: ConflictResolution = {
    strategy: 'last_write_wins_remote',
    resolvedAt: new Date().toISOString(),
    resolvedFields: conflict.fields.reduce((acc, fc) => ({
        ...acc,
        [fc.field]: fc.remoteValue
    }), {})
};
```

**timestamp_based**:
```typescript
// Compare local vs remote timestamps per field
// Use most recent value for each field
const resolution: ConflictResolution = {
    strategy: 'timestamp_based',
    resolvedAt: new Date().toISOString(),
    resolvedFields: conflict.fields.reduce((acc, fc) => {
        const useLocal = new Date(conflict.localUpdatedAt) > new Date(conflict.remoteUpdatedAt);
        return {
            ...acc,
            [fc.field]: useLocal ? fc.localValue : fc.remoteValue
        };
    }, {})
};
```

**manual**:
```typescript
// Prompt user for each field
for (const fieldConflict of conflict.fields) {
    const { choice } = await inquirer.prompt([{
        type: 'list',
        name: 'choice',
        message: `Conflict in ${fieldConflict.field}:`,
        choices: [
            {
                name: `Local: ${JSON.stringify(fieldConflict.localValue)}`,
                value: 'local'
            },
            {
                name: `Remote: ${JSON.stringify(fieldConflict.remoteValue)}`,
                value: 'remote'
            },
            {
                name: 'Custom (enter value)',
                value: 'custom'
            }
        ]
    }]);

    if (choice === 'local') {
        resolvedFields[fieldConflict.field] = fieldConflict.localValue;
    } else if (choice === 'remote') {
        resolvedFields[fieldConflict.field] = fieldConflict.remoteValue;
    } else {
        // Prompt for custom value
        const { customValue } = await inquirer.prompt([{
            type: 'input',
            name: 'customValue',
            message: `Enter custom value for ${fieldConflict.field}:`
        }]);
        resolvedFields[fieldConflict.field] = customValue;
    }
}
```

##### 3. Diff Visualization

```typescript
private displayConflictDiff(conflict: ConflictInfo): void {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🔀 CONFLICT DETECTED`);
    console.log(`Task: ${conflict.taskId} ↔ Issue: #${conflict.issueNumber}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    for (const fieldConflict of conflict.fields) {
        console.log(`📝 Field: ${fieldConflict.field}`);
        console.log(`   Local:  ${JSON.stringify(fieldConflict.localValue)}`);
        console.log(`   Remote: ${JSON.stringify(fieldConflict.remoteValue)}`);
        console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
```

##### 4. Testing Strategy

```typescript
// packages/tm-core/src/modules/integration/services/github-conflict-resolver.service.spec.ts

describe('GitHubConflictResolverService', () => {
    describe('detectConflicts', () => {
        it('should detect title conflict');
        it('should detect multiple field conflicts');
        it('should return null when no conflicts');
    });

    describe('analyzeConflict', () => {
        it('should recommend manual strategy for high-risk conflicts');
        it('should recommend auto-merge for low-risk conflicts');
        it('should calculate correct risk level');
    });

    describe('resolveAutomatic', () => {
        it('should resolve with last_write_wins_local strategy');
        it('should resolve with last_write_wins_remote strategy');
        it('should resolve with timestamp_based strategy');
    });

    describe('resolveInteractive', () => {
        it('should prompt user and resolve conflict', async () => {
            // Mock inquirer prompts
            vi.spyOn(inquirer, 'prompt').mockResolvedValueOnce({
                strategy: 'manual'
            }).mockResolvedValueOnce({
                choice: 'local'
            });

            const result = await service.resolveInteractive(mockConflict);
            expect(result.success).toBe(true);
        });
    });

    describe('resolveBatch', () => {
        it('should resolve multiple conflicts');
        it('should stop on error when configured');
        it('should continue on error when configured');
    });

    describe('undoResolution', () => {
        it('should restore previous state');
        it('should update resolution history');
    });

    describe('validateResolution', () => {
        it('should validate correct resolution');
        it('should detect invalid field');
        it('should detect type mismatch');
    });

    describe('previewResolution', () => {
        it('should show what will be applied');
        it('should list impacts');
    });
});
```

##### 5. Integration Points

- **Import into GitHubSyncService**: The conflict resolver will be used during bidirectional sync
- **State Service**: Record all resolutions for audit and undo
- **Change Detection Service**: Detect conflicts before resolution
- **Update module exports**: Add to `packages/tm-core/src/modules/integration/index.ts`

##### 6. Acceptance Criteria

- ✅ Detect conflicts for all task fields
- ✅ Support all 5 resolution strategies
- ✅ Interactive CLI prompts with inquirer
- ✅ Clear diff visualization
- ✅ Undo capability with history tracking
- ✅ Batch resolution support
- ✅ Validation before applying
- ✅ Comprehensive test coverage (>90%)

---

### Subtask 6.4: Remote Synchronization Pull Mechanism

**Objective**: Create robust system for pulling and applying remote GitHub issue changes to local tasks.

#### File Structure
```
packages/tm-core/src/modules/integration/
└── services/
    ├── github-sync.service.ts                     # Extend existing
    └── github-remote-pull.service.ts              # New service (CREATE)
```

#### Implementation Requirements

##### 1. Core Service Structure

```typescript
// packages/tm-core/src/modules/integration/services/github-remote-pull.service.ts

import type { Task } from '../../../common/types/index.js';
import type { GitHubIssue } from '../types/github-types.js';
import { GitHubClient } from '../clients/github-client.js';
import { GitHubSyncStateService } from './github-sync-state.service.js';
import { GitHubChangeDetectionService } from './github-change-detection.service.js';
import { GitHubConflictResolverService } from './github-conflict-resolver.service.js';
import { GitHubFieldMapper } from './github-field-mapper.js';
import { getLogger } from '../../../common/logger/index.js';

const logger = getLogger('GitHubRemotePullService');

export interface PullOptions {
    /** Whether to automatically resolve conflicts */
    autoResolveConflicts?: boolean;

    /** Conflict resolution strategy for auto-resolve */
    conflictStrategy?: ConflictResolutionStrategy;

    /** Whether to create tasks for new issues */
    createTasksForNewIssues?: boolean;

    /** Batch size for pulling issues */
    batchSize?: number;

    /** Dry run mode */
    dryRun?: boolean;
}

export interface PullResult {
    success: boolean;
    tasksUpdated: number;
    tasksCreated: number;
    conflictsDetected: number;
    conflictsResolved: number;
    errors: string[];
    warnings: string[];
}

export class GitHubRemotePullService {
    constructor(
        private readonly githubClient: GitHubClient,
        private readonly stateService: GitHubSyncStateService,
        private readonly changeDetectionService: GitHubChangeDetectionService,
        private readonly conflictResolver: GitHubConflictResolverService,
        private readonly fieldMapper: GitHubFieldMapper,
        private readonly owner: string,
        private readonly repo: string
    ) {
        logger.info('GitHubRemotePullService initialized', { owner, repo });
    }

    /**
     * Pull all remote changes from GitHub issues
     */
    async pullAllChanges(options: PullOptions = {}): Promise<PullResult> {
        // 1. Get all mappings from state service
        // 2. Fetch all corresponding GitHub issues
        // 3. Detect changes for each task-issue pair
        // 4. Apply non-conflicting changes
        // 5. Handle conflicts based on options
        // 6. Return aggregated results
    }

    /**
     * Pull changes for specific task
     */
    async pullTaskChanges(taskId: string, options: PullOptions = {}): Promise<PullResult> {
        // 1. Get mapping for task
        // 2. Fetch GitHub issue
        // 3. Detect changes
        // 4. Apply or resolve conflicts
    }

    /**
     * Pull changes for multiple tasks
     */
    async pullTasksBatch(taskIds: string[], options: PullOptions = {}): Promise<PullResult> {
        // Process in batches for efficiency
    }

    /**
     * Discover and create tasks for new GitHub issues
     */
    async discoverNewIssues(options: PullOptions = {}): Promise<PullResult> {
        // 1. Fetch all issues from GitHub
        // 2. Compare with existing mappings
        // 3. Create tasks for unmapped issues
    }

    // Private helper methods

    /**
     * Apply remote changes to local task (non-conflicting)
     */
    private async applyRemoteChanges(
        task: Task,
        issue: GitHubIssue,
        changes: ChangeDetectionResult
    ): Promise<void> {
        // 1. Convert issue fields to task fields
        // 2. Update task in database
        // 3. Update sync metadata
    }

    /**
     * Handle conflict during pull
     */
    private async handleConflict(
        task: Task,
        issue: GitHubIssue,
        conflict: ConflictInfo,
        options: PullOptions
    ): Promise<ResolutionResult> {
        if (options.autoResolveConflicts && options.conflictStrategy) {
            return await this.conflictResolver.resolveAutomatic(
                conflict,
                options.conflictStrategy
            );
        } else {
            return await this.conflictResolver.resolveInteractive(conflict);
        }
    }

    /**
     * Create local task from GitHub issue
     */
    private async createTaskFromIssue(issue: GitHubIssue): Promise<Task> {
        // Convert GitHub issue to Task format
        // Use fieldMapper
    }
}
```

##### 2. Key Algorithms

**Pull All Changes**:
```typescript
async pullAllChanges(options: PullOptions = {}): Promise<PullResult> {
    const result: PullResult = {
        success: true,
        tasksUpdated: 0,
        tasksCreated: 0,
        conflictsDetected: 0,
        conflictsResolved: 0,
        errors: [],
        warnings: []
    };

    // Get all mappings
    const mappings = await this.stateService.getAllMappings();

    // Process in batches
    const batches = this.splitIntoBatches(mappings, options.batchSize || 50);

    for (const batch of batches) {
        for (const mapping of batch) {
            try {
                // Fetch issue
                const issue = await this.githubClient.getIssue(
                    this.owner,
                    this.repo,
                    mapping.issueNumber
                );

                // Detect changes
                const changes = await this.changeDetectionService.detectChanges(
                    task,
                    { strategy: 'hybrid' }
                );

                if (!changes || !changes.hasRemoteChanges) {
                    continue; // No remote changes
                }

                if (changes.hasConflicts) {
                    result.conflictsDetected++;

                    // Detect conflict details
                    const conflict = await this.conflictResolver.detectConflicts(
                        task,
                        issue
                    );

                    if (conflict) {
                        // Resolve conflict
                        const resolution = await this.handleConflict(
                            task,
                            issue,
                            conflict,
                            options
                        );

                        if (resolution.success) {
                            result.conflictsResolved++;
                            result.tasksUpdated++;
                        }
                    }
                } else {
                    // No conflicts - apply changes directly
                    await this.applyRemoteChanges(task, issue, changes);
                    result.tasksUpdated++;
                }
            } catch (error: any) {
                result.errors.push(`Task ${mapping.taskId}: ${error.message}`);
            }
        }
    }

    result.success = result.errors.length === 0;
    return result;
}
```

**Discover New Issues**:
```typescript
async discoverNewIssues(options: PullOptions = {}): Promise<PullResult> {
    const result: PullResult = {
        success: true,
        tasksUpdated: 0,
        tasksCreated: 0,
        conflictsDetected: 0,
        conflictsResolved: 0,
        errors: [],
        warnings: []
    };

    // Fetch all issues from GitHub
    const issues = await this.githubClient.listIssues(this.owner, this.repo);

    // Get existing mappings
    const mappings = await this.stateService.getAllMappings();
    const mappedIssueNumbers = new Set(
        mappings.map(m => m.issueNumber)
    );

    // Find unmapped issues
    const newIssues = issues.filter(
        issue => !mappedIssueNumbers.has(issue.number)
    );

    if (!options.createTasksForNewIssues) {
        result.warnings.push(
            `Found ${newIssues.length} unmapped issues. Set createTasksForNewIssues=true to import.`
        );
        return result;
    }

    // Create tasks for new issues
    for (const issue of newIssues) {
        try {
            if (!options.dryRun) {
                const task = await this.createTaskFromIssue(issue);

                // Create mapping
                await this.stateService.setMapping({
                    taskId: task.id,
                    issueNumber: issue.number,
                    owner: this.owner,
                    repo: this.repo,
                    lastSyncedAt: new Date().toISOString(),
                    lastSyncDirection: 'from_github',
                    status: 'synced'
                });

                result.tasksCreated++;
            }
        } catch (error: any) {
            result.errors.push(`Issue #${issue.number}: ${error.message}`);
        }
    }

    result.success = result.errors.length === 0;
    return result;
}
```

##### 3. Testing Strategy

```typescript
describe('GitHubRemotePullService', () => {
    describe('pullAllChanges', () => {
        it('should pull all remote changes');
        it('should handle conflicts with auto-resolve');
        it('should handle conflicts with manual resolve');
        it('should skip tasks with no remote changes');
        it('should handle API errors gracefully');
    });

    describe('pullTaskChanges', () => {
        it('should pull changes for single task');
        it('should detect and resolve conflicts');
        it('should update task in database');
    });

    describe('discoverNewIssues', () => {
        it('should find unmapped issues');
        it('should create tasks for new issues');
        it('should create mappings for new tasks');
    });

    describe('applyRemoteChanges', () => {
        it('should convert issue fields to task fields');
        it('should update task updatedAt timestamp');
        it('should record operation in state');
    });
});
```

##### 4. Acceptance Criteria

- ✅ Pull changes for all mapped tasks
- ✅ Pull changes for specific task
- ✅ Detect and handle conflicts
- ✅ Auto-resolve conflicts with strategy
- ✅ Manual resolution via interactive prompts
- ✅ Discover new unmapped issues
- ✅ Create tasks for new issues
- ✅ Atomic operations with rollback
- ✅ Comprehensive error handling
- ✅ Test coverage >90%

---

### Subtask 6.5: Local Task Push and Synchronization Strategy

**Objective**: Create mechanism for pushing local task changes to GitHub issues with intelligent updates.

#### File Structure
```
packages/tm-core/src/modules/integration/
└── services/
    ├── github-sync.service.ts                     # Extend existing
    └── github-local-push.service.ts               # New service (CREATE)
```

#### Implementation Requirements

##### 1. Core Service Structure

```typescript
// packages/tm-core/src/modules/integration/services/github-local-push.service.ts

import type { Task } from '../../../common/types/index.js';
import type { GitHubIssue, GitHubIssueUpdate } from '../types/github-types.js';
import { GitHubClient } from '../clients/github-client.js';
import { GitHubSyncStateService } from './github-sync-state.service.js';
import { GitHubChangeDetectionService } from './github-change-detection.service.js';
import { GitHubConflictResolverService } from './github-conflict-resolver.service.js';
import { GitHubFieldMapper } from './github-field-mapper.js';
import { getLogger } from '../../../common/logger/index.js';

const logger = getLogger('GitHubLocalPushService');

export interface PushOptions {
    /** Whether to automatically resolve conflicts */
    autoResolveConflicts?: boolean;

    /** Conflict resolution strategy for auto-resolve */
    conflictStrategy?: ConflictResolutionStrategy;

    /** Whether to create issues for unmapped tasks */
    createIssuesForUnmappedTasks?: boolean;

    /** Only push changed fields (delta sync) */
    deltaSyncOnly?: boolean;

    /** Batch size for pushing tasks */
    batchSize?: number;

    /** Dry run mode */
    dryRun?: boolean;
}

export interface PushResult {
    success: boolean;
    issuesUpdated: number;
    issuesCreated: number;
    conflictsDetected: number;
    conflictsResolved: number;
    errors: string[];
    warnings: string[];
}

export class GitHubLocalPushService {
    constructor(
        private readonly githubClient: GitHubClient,
        private readonly stateService: GitHubSyncStateService,
        private readonly changeDetectionService: GitHubChangeDetectionService,
        private readonly conflictResolver: GitHubConflictResolverService,
        private readonly fieldMapper: GitHubFieldMapper,
        private readonly owner: string,
        private readonly repo: string
    ) {
        logger.info('GitHubLocalPushService initialized', { owner, repo });
    }

    /**
     * Push all local changes to GitHub
     */
    async pushAllChanges(tasks: Task[], options: PushOptions = {}): Promise<PushResult> {
        // 1. Check each task for local changes
        // 2. Detect conflicts
        // 3. Resolve conflicts or skip
        // 4. Push non-conflicting changes
        // 5. Create issues for unmapped tasks if enabled
    }

    /**
     * Push changes for specific task
     */
    async pushTaskChanges(task: Task, options: PushOptions = {}): Promise<PushResult> {
        // 1. Get mapping
        // 2. Detect changes
        // 3. Handle conflicts
        // 4. Push changes
    }

    /**
     * Push changes for multiple tasks in batch
     */
    async pushTasksBatch(tasks: Task[], options: PushOptions = {}): Promise<PushResult> {
        // Process in batches
    }

    /**
     * Create GitHub issues for unmapped tasks
     */
    async createIssuesForUnmappedTasks(
        tasks: Task[],
        options: PushOptions = {}
    ): Promise<PushResult> {
        // 1. Filter unmapped tasks
        // 2. Create issues
        // 3. Create mappings
    }

    // Private helper methods

    /**
     * Calculate delta (only changed fields)
     */
    private calculateDelta(
        task: Task,
        issue: GitHubIssue,
        changes: ChangeDetectionResult
    ): Partial<GitHubIssueUpdate> {
        // Return only fields that changed locally
        const delta: Partial<GitHubIssueUpdate> = {};

        for (const fieldChange of changes.fieldChanges) {
            if (fieldChange.direction === 'local_only' || fieldChange.direction === 'both') {
                const issueField = this.fieldMapper.mapTaskFieldToIssueField(fieldChange.field);
                delta[issueField] = fieldChange.localValue;
            }
        }

        return delta;
    }

    /**
     * Push changes to GitHub issue (delta or full)
     */
    private async pushChangesToIssue(
        task: Task,
        issueNumber: number,
        changes: ChangeDetectionResult,
        options: PushOptions
    ): Promise<void> {
        if (options.deltaSyncOnly) {
            // Only send changed fields
            const issue = await this.githubClient.getIssue(
                this.owner,
                this.repo,
                issueNumber
            );
            const delta = this.calculateDelta(task, issue, changes);

            await this.githubClient.updateIssue(
                this.owner,
                this.repo,
                issueNumber,
                delta
            );
        } else {
            // Send all fields
            const updateData = this.fieldMapper.taskToIssueUpdate(task);

            await this.githubClient.updateIssue(
                this.owner,
                this.repo,
                issueNumber,
                updateData
            );
        }

        // Update sync metadata
        await this.stateService.updateChangeMetadata({
            taskId: task.id,
            issueNumber,
            localUpdatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
            remoteUpdatedAt: new Date().toISOString(),
            lastCheckedAt: new Date().toISOString(),
            hasLocalChanges: false,
            hasRemoteChanges: false
        });
    }

    /**
     * Handle conflict during push
     */
    private async handleConflict(
        task: Task,
        issue: GitHubIssue,
        conflict: ConflictInfo,
        options: PushOptions
    ): Promise<ResolutionResult> {
        if (options.autoResolveConflicts && options.conflictStrategy) {
            return await this.conflictResolver.resolveAutomatic(
                conflict,
                options.conflictStrategy
            );
        } else {
            return await this.conflictResolver.resolveInteractive(conflict);
        }
    }

    /**
     * Create GitHub issue from task
     */
    private async createIssueFromTask(task: Task): Promise<GitHubIssue> {
        const issueData = this.fieldMapper.taskToIssueCreate(task);

        return await this.githubClient.createIssue(
            this.owner,
            this.repo,
            issueData
        );
    }
}
```

##### 2. Key Algorithms

**Push All Changes**:
```typescript
async pushAllChanges(tasks: Task[], options: PushOptions = {}): Promise<PushResult> {
    const result: PushResult = {
        success: true,
        issuesUpdated: 0,
        issuesCreated: 0,
        conflictsDetected: 0,
        conflictsResolved: 0,
        errors: [],
        warnings: []
    };

    // Separate mapped and unmapped tasks
    const mappedTasks: Task[] = [];
    const unmappedTasks: Task[] = [];

    for (const task of tasks) {
        const mapping = await this.stateService.getMapping(task.id);
        if (mapping) {
            mappedTasks.push(task);
        } else {
            unmappedTasks.push(task);
        }
    }

    // Push changes for mapped tasks
    const batches = this.splitIntoBatches(mappedTasks, options.batchSize || 50);

    for (const batch of batches) {
        for (const task of batch) {
            try {
                const mapping = await this.stateService.getMapping(task.id);
                if (!mapping) continue;

                // Fetch current issue state
                const issue = await this.githubClient.getIssue(
                    this.owner,
                    this.repo,
                    mapping.issueNumber
                );

                // Detect changes
                const changes = await this.changeDetectionService.detectChanges(
                    task,
                    { strategy: 'hybrid' }
                );

                if (!changes || !changes.hasLocalChanges) {
                    continue; // No local changes
                }

                if (changes.hasConflicts) {
                    result.conflictsDetected++;

                    // Detect conflict details
                    const conflict = await this.conflictResolver.detectConflicts(
                        task,
                        issue
                    );

                    if (conflict) {
                        // Resolve conflict
                        const resolution = await this.handleConflict(
                            task,
                            issue,
                            conflict,
                            options
                        );

                        if (resolution.success) {
                            result.conflictsResolved++;
                            // Apply resolution and push
                            await this.pushChangesToIssue(
                                task,
                                mapping.issueNumber,
                                changes,
                                options
                            );
                            result.issuesUpdated++;
                        }
                    }
                } else {
                    // No conflicts - push changes directly
                    await this.pushChangesToIssue(
                        task,
                        mapping.issueNumber,
                        changes,
                        options
                    );
                    result.issuesUpdated++;
                }
            } catch (error: any) {
                result.errors.push(`Task ${task.id}: ${error.message}`);
            }
        }
    }

    // Create issues for unmapped tasks
    if (options.createIssuesForUnmappedTasks && unmappedTasks.length > 0) {
        const createResult = await this.createIssuesForUnmappedTasks(
            unmappedTasks,
            options
        );
        result.issuesCreated += createResult.issuesCreated;
        result.errors.push(...createResult.errors);
    }

    result.success = result.errors.length === 0;
    return result;
}
```

**Delta Sync**:
```typescript
private calculateDelta(
    task: Task,
    issue: GitHubIssue,
    changes: ChangeDetectionResult
): Partial<GitHubIssueUpdate> {
    const delta: Partial<GitHubIssueUpdate> = {};

    // Only include fields that changed locally
    for (const fieldChange of changes.fieldChanges) {
        if (fieldChange.direction === 'local_only' ||
            (fieldChange.direction === 'both' && fieldChange.isConflict)) {

            // Map task field to issue field
            switch (fieldChange.field) {
                case 'title':
                    delta.title = task.title;
                    break;
                case 'description':
                    delta.body = task.description;
                    break;
                case 'status':
                    delta.state = this.fieldMapper.mapTaskStatusToIssueState(task.status);
                    break;
                // ... other fields
            }
        }
    }

    return delta;
}
```

##### 3. Testing Strategy

```typescript
describe('GitHubLocalPushService', () => {
    describe('pushAllChanges', () => {
        it('should push all local changes');
        it('should handle conflicts with auto-resolve');
        it('should handle conflicts with manual resolve');
        it('should skip tasks with no local changes');
        it('should create issues for unmapped tasks when enabled');
    });

    describe('pushTaskChanges', () => {
        it('should push changes for single task');
        it('should detect and resolve conflicts');
        it('should update issue on GitHub');
    });

    describe('calculateDelta', () => {
        it('should only include changed fields');
        it('should handle title changes');
        it('should handle description changes');
        it('should handle status changes');
    });

    describe('createIssuesForUnmappedTasks', () => {
        it('should create issues for unmapped tasks');
        it('should create mappings for new issues');
        it('should record operations');
    });
});
```

##### 4. Acceptance Criteria

- ✅ Push changes for all tasks with local changes
- ✅ Push changes for specific task
- ✅ Delta sync (only changed fields)
- ✅ Full sync (all fields)
- ✅ Detect and handle conflicts
- ✅ Auto-resolve with strategy
- ✅ Manual resolution via prompts
- ✅ Create issues for unmapped tasks
- ✅ Respect conflict resolution rules
- ✅ Atomic operations
- ✅ Test coverage >90%

---

## Integration: Bidirectional Sync in GitHubSyncService

After completing all subtasks, update `GitHubSyncService` to orchestrate bidirectional sync:

```typescript
// packages/tm-core/src/modules/integration/services/github-sync.service.ts

export class GitHubSyncService {
    constructor(
        private readonly githubClient: GitHubClient,
        private readonly stateService: GitHubSyncStateService,
        private readonly changeDetectionService: GitHubChangeDetectionService,
        private readonly conflictResolver: GitHubConflictResolverService,
        private readonly remotePullService: GitHubRemotePullService,
        private readonly localPushService: GitHubLocalPushService,
        // ... other dependencies
    ) {}

    /**
     * Bidirectional sync: Pull remote changes, then push local changes
     */
    async syncWithGitHub(
        tasks: Task[],
        options: SyncOptions = {}
    ): Promise<BidirectionalSyncResult> {
        logger.info('Starting bidirectional sync', {
            taskCount: tasks.length
        });

        const result: BidirectionalSyncResult = {
            success: true,
            pullResult: null,
            pushResult: null,
            errors: [],
            warnings: []
        };

        try {
            // Mark sync as in progress
            await this.stateService.markSyncInProgress();

            // Step 1: Pull remote changes first
            result.pullResult = await this.remotePullService.pullAllChanges({
                autoResolveConflicts: options.autoResolveConflicts,
                conflictStrategy: options.conflictStrategy,
                createTasksForNewIssues: options.createTasksForNewIssues
            });

            if (!result.pullResult.success) {
                result.errors.push(...result.pullResult.errors);
            }

            // Step 2: Push local changes
            result.pushResult = await this.localPushService.pushAllChanges(tasks, {
                autoResolveConflicts: options.autoResolveConflicts,
                conflictStrategy: options.conflictStrategy,
                createIssuesForUnmappedTasks: options.createIssuesForUnmappedTasks,
                deltaSyncOnly: options.deltaSyncOnly
            });

            if (!result.pushResult.success) {
                result.errors.push(...result.pushResult.errors);
            }

            // Mark sync complete
            await this.stateService.markSyncComplete();

            result.success = result.errors.length === 0;

            logger.info('Bidirectional sync completed', {
                success: result.success,
                tasksUpdated: result.pullResult.tasksUpdated,
                issuesUpdated: result.pushResult.issuesUpdated
            });

            return result;
        } catch (error: any) {
            const errorMessage = `Bidirectional sync failed: ${error.message}`;
            logger.error(errorMessage, { error });

            result.success = false;
            result.errors.push(errorMessage);

            await this.stateService.markSyncComplete(errorMessage);

            return result;
        }
    }
}
```

---

## Testing Strategy

### Unit Tests
- Test each service in isolation with mocks
- Cover all public methods
- Test error handling paths
- Test edge cases

### Integration Tests
- Test full sync flow end-to-end
- Test conflict resolution flow
- Test with real GitHub API (use test repo)

### Test Coverage Goals
- **Minimum**: 85% coverage
- **Target**: 90%+ coverage
- **Critical paths**: 100% coverage (conflict resolution, data integrity)

---

## Commit Strategy

Follow the established pattern:

```bash
# After completing 6.3
git add packages/tm-core/src/modules/integration/services/github-conflict-resolver.service.ts
git add packages/tm-core/src/modules/integration/services/github-conflict-resolver.service.spec.ts
git add packages/tm-core/src/modules/integration/index.ts
git add .taskmaster/tasks/tasks.json
git add .taskmaster/tasks/task_006_feat-github-sync.txt
task-master set-status --id=6.3 --status=done
git commit -m "feat(subtask-6.3): Implement GitHubConflictResolver Interactive System

Subtask 6.3 is complete with comprehensive conflict resolution:
- Interactive CLI prompts using inquirer
- Support for 5 resolution strategies
- Clear diff visualization with field-level details
- Undo capability with resolution history
- Batch conflict resolution
- Comprehensive test coverage

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# After completing 6.4
task-master set-status --id=6.4 --status=done
git commit -m "feat(subtask-6.4): Implement Remote Synchronization Pull Mechanism

..."

# After completing 6.5
task-master set-status --id=6.5 --status=done
git commit -m "feat(subtask-6.5): Implement Local Task Push Synchronization

..."

# Finally, complete task 6
task-master set-status --id=6 --status=done
git commit -m "feat(task-6): Complete Two-Way Sync with Conflict Handling

All subtasks of Task 6 completed:
- 6.1: GitHubSyncStateService ✓
- 6.2: Bidirectional Change Detection ✓
- 6.3: Conflict Resolution System ✓
- 6.4: Remote Pull Mechanism ✓
- 6.5: Local Push Mechanism ✓

Full bidirectional sync now operational with conflict detection and resolution.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Dependencies Checklist

Ensure these are installed:
```bash
npm install inquirer
npm install --save-dev @types/inquirer
```

---

## Additional Resources

- **Inquirer Documentation**: https://github.com/SBoudrias/Inquirer.js
- **GitHub API Docs**: https://docs.github.com/en/rest
- **Conflict Resolution Patterns**: See existing types in `conflict-resolution-types.ts`

---

## Estimated Effort

- **Subtask 6.3**: 4-6 hours (conflict resolver with interactive prompts)
- **Subtask 6.4**: 3-4 hours (remote pull mechanism)
- **Subtask 6.5**: 3-4 hours (local push mechanism)
- **Total**: 10-14 hours

---

## Success Criteria

✅ All 5 subtasks of Task 6 completed
✅ Comprehensive test coverage (>90%)
✅ All tests passing
✅ Full bidirectional sync operational
✅ Conflict detection and resolution working
✅ Interactive CLI prompts functional
✅ Undo capability implemented
✅ Documentation complete

---

**End of Implementation Plan**
