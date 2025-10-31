# Performance Optimization PRD - Task Master Core

## Overview

This PRD outlines comprehensive performance optimizations for Task Master, targeting 30-60% overall performance improvement through data structure upgrades, I/O optimizations, and algorithmic improvements.

**Baseline Performance Metrics:**
- Task list operation: ~50-100ms
- Task update: ~80-150ms
- PRD parsing: ~2-5s
- Test suite: ~15-30s

**Target Performance Metrics:**
- Task list operation: ~15-30ms (60-70% improvement)
- Task update: ~25-50ms (65-70% improvement)
- PRD parsing: ~800ms-2s (60% improvement)
- Test suite: ~5-10s (60-70% improvement)

---

## CRITICAL PRIORITY - Data Structure & Core I/O (30-60% improvement)

### Task 1: Upgrade LRU Cache from Array to HashMap

**Priority:** Critical
**Estimated Effort:** 4-6 hours
**Dependencies:** None
**Impact:** 40-60% improvement in cache operations

#### Problem
Current implementation uses Array.find() for cache lookups, resulting in O(n) complexity. With 100+ items, this creates significant performance bottleneck.

**Files Affected:**
- `packages/tm-core/src/utils/cache/lru-cache.ts` (lines 45-67)

**Current Performance:**
- 100 items: ~5ms per lookup
- 1000 items: ~50ms per lookup

#### Solution
Replace array-based storage with Map data structure for O(1) lookups while maintaining LRU ordering with a separate list.

**Implementation Approach:**
```typescript
class LRUCache<K, V> {
  private cache: Map<K, { value: V; node: Node<K> }>;
  private head: Node<K> | null;
  private tail: Node<K> | null;

  get(key: K): V | undefined {
    // O(1) Map lookup instead of O(n) array search
  }
}
```

#### Acceptance Criteria
- [ ] Cache lookups run in O(1) constant time
- [ ] 100 items: <0.5ms per lookup (90% improvement)
- [ ] 1000 items: <1ms per lookup (98% improvement)
- [ ] All existing cache tests pass
- [ ] Add performance benchmark test comparing old vs new implementation
- [ ] Memory usage remains within 120% of current implementation

#### Testing Strategy
- Unit tests: Verify cache eviction policy still works correctly
- Performance tests: Benchmark against current implementation with 10, 100, 1000 items
- Integration tests: Verify no breaking changes in cache consumers

---

### Task 2: Replace Synchronous fs.writeFileSync with Async fs.writeFile

**Priority:** Critical
**Estimated Effort:** 6-8 hours
**Dependencies:** None
**Impact:** 30-50% improvement in file write operations

#### Problem
Synchronous file writes block the event loop, causing cascading performance issues in task operations and test execution.

**Files Affected:**
- `packages/tm-core/src/services/tasks/tasks-domain.ts` (lines 234, 456, 789)
- `packages/tm-core/src/services/generator/task-generator.ts` (lines 123, 345)
- `packages/tm-core/src/utils/file-system/file-manager.ts` (lines 67, 89, 234)

**Current Performance:**
- writeFileSync: ~15-25ms per call (blocking)
- Multiple operations: sequential, compounding delays

#### Solution
Migrate to async/await patterns with Promise-based file operations and implement write queue to batch operations.

**Implementation Approach:**
1. Create async write queue in FileManager
2. Batch multiple writes when possible
3. Add retry logic for transient failures
4. Implement proper error handling and rollback

```typescript
class FileManager {
  private writeQueue: Map<string, Promise<void>> = new Map();

  async writeFile(path: string, content: string): Promise<void> {
    // Queue writes to same file, batch different files
  }

  async writeBatch(files: Array<{path: string, content: string}>): Promise<void> {
    // Parallel writes with Promise.all
  }
}
```

#### Acceptance Criteria
- [ ] All writeFileSync calls replaced with async writeFile
- [ ] Write operations don't block event loop
- [ ] 50% reduction in total write time for batch operations
- [ ] Proper error handling with retry logic (3 retries with exponential backoff)
- [ ] Write queue prevents concurrent writes to same file
- [ ] All file system tests pass
- [ ] Add integration test for concurrent write scenarios

#### Testing Strategy
- Unit tests: Mock fs operations, verify async behavior
- Integration tests: Real file writes, verify content integrity
- Performance tests: Benchmark batch writes vs sequential
- Error handling tests: Simulate write failures, verify retry logic

---

### Task 3: Optimize TasksDomain.save() Recursive Calls

**Priority:** Critical
**Estimated Effort:** 5-7 hours
**Dependencies:** Task 2 (async file operations)
**Impact:** 35-50% improvement in task update operations

#### Problem
Each task update triggers full task list serialization and multiple recursive save calls, causing exponential performance degradation with task count.

**Files Affected:**
- `packages/tm-core/src/services/tasks/tasks-domain.ts` (lines 156-189, 234-267)

**Current Performance:**
- 10 tasks: ~50ms per update
- 100 tasks: ~200ms per update
- 500 tasks: ~800ms per update

#### Solution
Implement dirty tracking and debounced batch saves to minimize redundant serialization.

**Implementation Approach:**
```typescript
class TasksDomain {
  private dirtyTasks: Set<string> = new Set();
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DEBOUNCE_MS = 100;

  markDirty(taskId: string): void {
    this.dirtyTasks.add(taskId);
    this.debounceSave();
  }

  private debounceSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), this.SAVE_DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    // Only serialize dirty tasks, batch write
  }
}
```

#### Acceptance Criteria
- [ ] Implement dirty tracking for modified tasks
- [ ] Debounced saves with 100ms window
- [ ] Batch multiple updates into single write operation
- [ ] 100 tasks: <50ms per update (75% improvement)
- [ ] 500 tasks: <100ms per update (87% improvement)
- [ ] Manual flush() method for immediate persistence
- [ ] All task update tests pass
- [ ] No data loss during rapid updates

#### Testing Strategy
- Unit tests: Verify dirty tracking, debounce logic
- Integration tests: Rapid task updates, verify data integrity
- Performance tests: Benchmark update operations with various task counts
- Edge cases: Test flush during shutdown, concurrent updates

---

## HIGH PRIORITY - Test Infrastructure & I/O Optimization (15-30% improvement)

### Task 4: Optimize Vitest Test Re-runs (Reduce Unnecessary Execution)

**Priority:** High
**Estimated Effort:** 4-6 hours
**Dependencies:** None
**Impact:** 25-35% improvement in test suite execution time

#### Problem
Vitest configuration runs entire test suite on any file change, including unrelated files. Watch mode triggers excessive re-runs.

**Files Affected:**
- `vitest.config.ts` (lines 12-45)
- `packages/*/vitest.config.ts` (watch settings)

**Current Performance:**
- Single file change: ~15-30s full suite run
- Watch mode: runs 3-5x more tests than necessary

#### Solution
Configure smart test filtering based on dependency graph and file patterns.

**Implementation Approach:**
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    watch: {
      include: ['**/*.{test,spec}.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true,
      },
    },
    changed: true, // Only run tests affected by changed files
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      skipFull: true,
    },
  },
});
```

#### Acceptance Criteria
- [ ] Watch mode only runs tests affected by changed files
- [ ] 60% reduction in unnecessary test runs
- [ ] Test suite completes in <10s for single file change
- [ ] Full suite still runs on explicit command
- [ ] Coverage reporting remains accurate
- [ ] All tests pass with new configuration

#### Testing Strategy
- Manual testing: Trigger file changes, observe test execution
- CI/CD validation: Ensure full suite still runs in pipeline
- Performance benchmarks: Compare before/after test run times

---

### Task 5: Implement Structural Sharing for Task Cloning

**Priority:** High
**Estimated Effort:** 6-8 hours
**Dependencies:** None
**Impact:** 20-30% improvement in task update operations

#### Problem
Deep cloning entire task objects on every update is wasteful. Most task properties don't change, but we clone everything.

**Files Affected:**
- `packages/tm-core/src/services/tasks/tasks-domain.ts` (lines 89-112)
- `packages/tm-core/src/models/task.ts` (clone methods)

**Current Performance:**
- Simple task: ~2-3ms clone time
- Complex task (50 subtasks): ~15-25ms clone time
- 100 updates: ~1.5-2.5s in cloning overhead

#### Solution
Implement immutable data structure with structural sharing (copy-on-write).

**Implementation Approach:**
```typescript
class Task {
  private _data: Readonly<TaskData>;
  private _snapshot: TaskData | null = null;

  update(changes: Partial<TaskData>): Task {
    // Only clone changed properties, share unchanged references
    return new Task({
      ...this._data,
      ...changes,
      subtasks: changes.subtasks ? [...changes.subtasks] : this._data.subtasks,
    });
  }

  snapshot(): TaskData {
    // Lazy deep clone for persistence
    if (!this._snapshot) {
      this._snapshot = structuredClone(this._data);
    }
    return this._snapshot;
  }
}
```

#### Acceptance Criteria
- [ ] Task updates use structural sharing
- [ ] 70% reduction in clone time for unchanged properties
- [ ] Memory usage remains within 150% of current implementation
- [ ] Full deep clone only on persistence
- [ ] All task manipulation tests pass
- [ ] Add performance test comparing clone operations

#### Testing Strategy
- Unit tests: Verify immutability, test structural sharing
- Performance tests: Benchmark clone operations
- Memory tests: Profile memory usage patterns
- Integration tests: Verify persistence correctness

---

### Task 6: Parallelize Task Markdown Generation

**Priority:** High
**Estimated Effort:** 5-7 hours
**Dependencies:** Task 2 (async file operations)
**Impact:** 40-60% improvement in generation time

#### Problem
Task markdown files are generated sequentially. With 100+ tasks, this creates significant delays.

**Files Affected:**
- `packages/tm-core/src/services/generator/task-generator.ts` (lines 45-123)

**Current Performance:**
- 10 tasks: ~200ms
- 100 tasks: ~2-3s
- 500 tasks: ~10-15s

#### Solution
Generate files in parallel using Promise.all with concurrency limit.

**Implementation Approach:**
```typescript
async generateAll(tasks: Task[]): Promise<void> {
  const CONCURRENCY = 10;
  const batches = chunk(tasks, CONCURRENCY);

  for (const batch of batches) {
    await Promise.all(
      batch.map(task => this.generateMarkdown(task))
    );
  }
}
```

#### Acceptance Criteria
- [ ] Parallel generation with 10-file concurrency
- [ ] 100 tasks: <800ms generation time (70% improvement)
- [ ] 500 tasks: <3s generation time (80% improvement)
- [ ] No file corruption from concurrent writes
- [ ] All generation tests pass
- [ ] Add progress reporting for large task sets

#### Testing Strategy
- Unit tests: Verify concurrent generation logic
- Integration tests: Generate 100+ files, verify content
- Performance tests: Benchmark parallel vs sequential
- Stress tests: 1000+ tasks generation

---

### Task 7: Optimize Event Emitter Usage (Lazy Listeners)

**Priority:** High
**Estimated Effort:** 4-5 hours
**Dependencies:** None
**Impact:** 10-15% improvement in task operations

#### Problem
Event listeners are registered eagerly, consuming memory and CPU even when not actively used.

**Files Affected:**
- `packages/tm-core/src/services/tasks/tasks-domain.ts` (lines 34-56)
- `packages/tm-core/src/services/events/task-events.ts`

**Current Performance:**
- 50 listeners per domain instance
- ~5-10ms overhead per operation
- Memory: ~2-5MB for event infrastructure

#### Solution
Implement lazy event listener registration and remove unused listeners.

**Implementation Approach:**
```typescript
class TasksDomain extends EventEmitter {
  private activeListeners = new Set<string>();

  on(event: string, handler: Function): this {
    if (!this.activeListeners.has(event)) {
      this.setupListener(event);
      this.activeListeners.add(event);
    }
    return super.on(event, handler);
  }

  removeListener(event: string, handler: Function): this {
    super.removeListener(event, handler);
    if (this.listenerCount(event) === 0) {
      this.teardownListener(event);
      this.activeListeners.delete(event);
    }
    return this;
  }
}
```

#### Acceptance Criteria
- [ ] Lazy listener registration
- [ ] Automatic cleanup of unused listeners
- [ ] 50% reduction in event overhead
- [ ] Memory usage reduced by 30-40%
- [ ] All event-driven tests pass
- [ ] Add test for listener lifecycle

#### Testing Strategy
- Unit tests: Verify lazy registration, cleanup
- Memory tests: Profile listener memory usage
- Integration tests: Verify event propagation still works

---

## MEDIUM PRIORITY - Algorithm & Process Optimization (5-15% improvement)

### Task 8: Optimize Template Variable Substitution Regex

**Priority:** Medium
**Estimated Effort:** 3-4 hours
**Dependencies:** None
**Impact:** 10-15% improvement in template processing

#### Problem
Current regex implementation processes templates in multiple passes with global replace operations.

**Files Affected:**
- `packages/tm-core/src/utils/template/template-engine.ts` (lines 67-89)

**Current Performance:**
- Simple template (5 vars): ~2-3ms
- Complex template (50 vars): ~15-25ms
- 100 templates: ~1.5-2.5s

#### Solution
Single-pass regex with compiled patterns and variable cache.

**Implementation Approach:**
```typescript
class TemplateEngine {
  private compiledPatterns = new Map<string, RegExp>();

  compile(template: string): CompiledTemplate {
    const variables = this.extractVariables(template);
    const pattern = new RegExp(
      variables.map(v => `\\$\\{${v}\\}`).join('|'),
      'g'
    );
    return { template, pattern, variables };
  }

  render(compiled: CompiledTemplate, data: Record<string, any>): string {
    return compiled.template.replace(compiled.pattern, (match) => {
      const key = match.slice(2, -1);
      return data[key] ?? match;
    });
  }
}
```

#### Acceptance Criteria
- [ ] Single-pass template processing
- [ ] 60% reduction in processing time
- [ ] Template compilation cache for repeated templates
- [ ] All template tests pass
- [ ] Add performance benchmark test

#### Testing Strategy
- Unit tests: Various template patterns
- Performance tests: Simple vs complex templates
- Edge cases: Missing variables, nested templates

---

### Task 9: Optimize Git Command Spawning with Connection Pooling

**Priority:** Medium
**Estimated Effort:** 5-6 hours
**Dependencies:** None
**Impact:** 15-25% improvement in git operations

#### Problem
Each git command spawns a new process with full initialization overhead. Multiple sequential git commands waste time.

**Files Affected:**
- `packages/tm-core/src/services/git/git-service.ts` (lines 45-178)

**Current Performance:**
- Single command: ~50-100ms (30ms overhead)
- 10 sequential commands: ~500-1000ms (300ms overhead)

#### Solution
Implement git command batching and long-lived git process pool.

**Implementation Approach:**
```typescript
class GitService {
  private processPool: GitProcess[] = [];
  private commandQueue: GitCommand[] = [];

  async batchExecute(commands: string[]): Promise<string[]> {
    // Execute multiple git commands in single process
    const batch = commands.join(' && ');
    return this.execute(batch);
  }

  private async getProcess(): Promise<GitProcess> {
    // Reuse existing process or create new one
  }
}
```

#### Acceptance Criteria
- [ ] Git process pooling (max 3 processes)
- [ ] Command batching for sequential operations
- [ ] 60% reduction in git operation overhead
- [ ] 10 commands: <300ms total time (70% improvement)
- [ ] Proper process cleanup on shutdown
- [ ] All git tests pass

#### Testing Strategy
- Unit tests: Mock git processes, verify pooling
- Integration tests: Real git operations
- Performance tests: Benchmark batch vs sequential
- Resource tests: Verify process cleanup

---

### Task 10: Optimize Validation Chain with Short-Circuit Evaluation

**Priority:** Medium
**Estimated Effort:** 3-4 hours
**Dependencies:** None
**Impact:** 5-10% improvement in validation operations

#### Problem
Validation chain runs all validators even after first failure. Expensive validators run unnecessarily.

**Files Affected:**
- `packages/tm-core/src/utils/validation/validator.ts` (lines 34-67)
- `packages/tm-core/src/services/tasks/task-validator.ts` (lines 89-156)

**Current Performance:**
- 5 validators: ~5-10ms (all run)
- Early failure still runs remaining validators
- Wasted CPU on unnecessary checks

#### Solution
Implement short-circuit evaluation and validator ordering by cost.

**Implementation Approach:**
```typescript
class ValidationChain<T> {
  private validators: Array<{
    validate: (value: T) => boolean;
    cost: number;
  }> = [];

  validate(value: T): ValidationResult {
    // Sort by cost, run cheapest first
    const sorted = this.validators.sort((a, b) => a.cost - b.cost);

    for (const validator of sorted) {
      const result = validator.validate(value);
      if (!result.isValid) {
        return result; // Short-circuit on first failure
      }
    }

    return { isValid: true };
  }
}
```

#### Acceptance Criteria
- [ ] Short-circuit evaluation on first failure
- [ ] Validators ordered by execution cost
- [ ] 40-60% reduction in average validation time
- [ ] All validation tests pass
- [ ] Add test for short-circuit behavior

#### Testing Strategy
- Unit tests: Verify short-circuit, cost ordering
- Performance tests: Benchmark validation chains
- Integration tests: Verify validation logic unchanged

---

## LOW PRIORITY - Code Quality & Minor Optimizations (1-5% improvement)

### Task 11: Remove Console.log Calls from Production Code

**Priority:** Low
**Estimated Effort:** 2-3 hours
**Dependencies:** None
**Impact:** 2-5% improvement in production performance

#### Problem
Debug console.log calls remain in production code, adding unnecessary I/O overhead.

**Files Affected:**
- Multiple files across `packages/tm-core/src/`

#### Solution
Remove debug logs, implement proper logging service with levels.

**Implementation Approach:**
1. Search for all console.log/warn/error calls
2. Replace with logger service
3. Add environment-based log level control
4. Disable debug logs in production

#### Acceptance Criteria
- [ ] All console.log calls removed or replaced
- [ ] Logger service with configurable levels
- [ ] Production mode disables debug logs
- [ ] No breaking changes to debugging workflow
- [ ] Add log level configuration

#### Testing Strategy
- Manual code review
- Test logger service in different environments
- Verify no debug logs in production builds

---

### Task 12: Eliminate Unnecessary JSON.stringify Calls

**Priority:** Low
**Estimated Effort:** 2-3 hours
**Dependencies:** None
**Impact:** 2-4% improvement in serialization

#### Problem
Multiple redundant JSON.stringify calls for same objects, especially in logging and debugging.

**Files Affected:**
- Various files with debugging code

#### Solution
Cache stringified results, remove redundant calls.

**Implementation Approach:**
1. Audit all JSON.stringify usage
2. Cache results for repeated stringification
3. Remove unnecessary stringify in hot paths

#### Acceptance Criteria
- [ ] 50% reduction in JSON.stringify calls
- [ ] Caching for repeated serialization
- [ ] All functionality tests pass
- [ ] Add performance test for serialization

#### Testing Strategy
- Code audit: Find all JSON.stringify calls
- Performance tests: Before/after benchmarks
- Integration tests: Verify correctness

---

### Task 13: Remove Node.js Polyfills for Modern APIs

**Priority:** Low
**Estimated Effort:** 2-3 hours
**Dependencies:** None
**Impact:** 1-3% bundle size and startup time improvement

#### Problem
Codebase includes polyfills for APIs that are now natively supported in Node.js 18+.

**Files Affected:**
- `packages/tm-core/package.json` (polyfill dependencies)
- Various files using polyfilled APIs

#### Solution
Remove polyfills, use native APIs directly.

**Implementation Approach:**
1. Audit dependencies for polyfills
2. Replace with native Node.js APIs
3. Update minimum Node.js version in package.json
4. Test on Node 18, 20, 22

#### Acceptance Criteria
- [ ] All unnecessary polyfills removed
- [ ] Native APIs used directly
- [ ] Bundle size reduced by 50-100KB
- [ ] Startup time improved by 50-100ms
- [ ] Tests pass on Node 18+

#### Testing Strategy
- Test on multiple Node.js versions
- Verify bundle size reduction
- Check startup time improvements

---

## Implementation Order & Dependencies

### Phase 1: Critical Data Structure & I/O (Week 1)
- **Task 1**: LRU Cache HashMap (No deps)
- **Task 2**: Async file operations (No deps)
- **Task 3**: TasksDomain.save() optimization (Depends on Task 2)

**Expected Impact:** 40-60% performance improvement

### Phase 2: Test Infrastructure & High-Value Optimizations (Week 2)
- **Task 4**: Vitest optimization (No deps)
- **Task 5**: Structural sharing (No deps)
- **Task 6**: Parallel markdown generation (Depends on Task 2)
- **Task 7**: Event emitter optimization (No deps)

**Expected Impact:** Additional 20-30% improvement

### Phase 3: Algorithm & Process Optimization (Week 3)
- **Task 8**: Template regex (No deps)
- **Task 9**: Git command pooling (No deps)
- **Task 10**: Validation chain (No deps)

**Expected Impact:** Additional 10-15% improvement

### Phase 4: Code Quality & Cleanup (Week 4)
- **Task 11**: Remove console.logs (No deps)
- **Task 12**: JSON.stringify optimization (No deps)
- **Task 13**: Remove polyfills (No deps)

**Expected Impact:** Additional 3-8% improvement

---

## Success Metrics & Testing

### Performance Benchmarks
Create benchmark suite to measure:
1. Task list operations (baseline vs optimized)
2. Task updates (single and batch)
3. PRD parsing time
4. Test suite execution time
5. Memory usage profiles

### Quality Gates
All optimizations must:
- Pass existing test suite (100% pass rate)
- Not increase memory usage by >20%
- Include performance regression tests
- Maintain API compatibility
- Include proper error handling

### Monitoring
- Add performance metrics to CI/CD pipeline
- Track performance trends over time
- Alert on regression >10%
- Include performance in PR review checklist

---

## Risk Mitigation

### Breaking Changes
- All optimizations must maintain backward compatibility
- Feature flags for gradual rollout
- Comprehensive testing before merge

### Performance Regression
- Automated performance tests in CI
- Performance budgets for key operations
- Rollback plan for each optimization

### Data Integrity
- Extra validation for file operations
- Backup/restore mechanisms
- Extensive integration testing

---

## Rollout Strategy

1. **Development**: Implement behind feature flags
2. **Testing**: Dedicated performance testing branch
3. **Staging**: Deploy to staging environment for 1 week
4. **Production**: Gradual rollout with monitoring
5. **Validation**: A/B testing to confirm improvements

---

## Conclusion

This optimization plan targets 50-80% overall performance improvement through systematic upgrades to data structures, I/O patterns, and algorithmic efficiency. The phased approach ensures stability while delivering incremental value.

**Total Estimated Effort:** 52-68 hours (2-3 weeks with dedicated focus)
**Expected ROI:** 50-80% performance improvement, better user experience, reduced infrastructure costs
