# Task 11: Cache Architecture Completion Checklist

**Status**: 70% Complete (WIP commit: ad8d7980)
**Branch**: `chore/performance-enhancements`
**Next Session Goal**: Complete FileStorage refactoring + Testing

---

## ✅ Completed (Current Session)

### Cache Architecture Foundation
- [x] Created `cache-strategy.interface.ts` with comprehensive interfaces
  - ICacheStrategy, CacheMetrics, InvalidationScope, NamespaceMetrics
  - CacheEntryOptions for flexible configuration

- [x] Implemented `lru-cache-strategy.ts`
  - Namespace-aware metrics tracking
  - Memory-based eviction (50MB limit)
  - Selective invalidation (namespace/tag/pattern)
  - Automatic TTL handling

- [x] Implemented `cache-manager.ts` facade
  - Monitoring hooks
  - Convenience methods (invalidateTag, invalidateNamespace, invalidatePattern)
  - Event emission for observability

- [x] Updated exports in `common/cache/index.ts`
- [x] Created `strategies/index.ts` barrel export

### FileStorage Partial Refactoring
- [x] Updated imports to use CacheManager
- [x] Modified constructor for dependency injection
- [x] Added `createDefaultCache()` factory method
- [x] Refactored `loadTasks()` method - COMPLETE
- [x] Updated `close()` to clear cache
- [x] Added `getCacheMetrics()` public method
- [x] Removed redundant `isCacheValid()` method
- [x] Added `invalidateCacheForTag()` for selective invalidation
- [x] Removed redundant `timestamp` field from CacheEntry interface

---

## 📋 Next Session: Systematic Completion

### Phase 1: Complete FileStorage Refactoring (30 min)

#### Step 1.1: Update `loadSingleTask()` method
**Location**: `file-storage.ts:244-310`
**Changes needed**:
```typescript
// Line 259: Replace
const cachedEntry = this.taskCache.get(cacheKey);
if (cachedEntry && this.isCacheValid(cachedEntry)) {

// With:
const cachedResult = this.cacheManager.get<CacheEntry>(cacheKey);
if (!isCacheMiss(cachedResult)) {
```

```typescript
// Lines 279-282, 293-296, 302-305: Replace
this.taskCache.set(cacheKey, {
    tasks: enrichedTasks,
    timestamp: Date.now()
});

// With:
this.cacheManager.set(
    cacheKey,
    { tasks: enrichedTasks },
    {
        namespace: CacheNamespace.Task,
        tags: [resolvedTag]
    }
);
```

**Test after**: Verify single task loading still works

---

#### Step 1.2: Update `saveTasks()` method
**Location**: `file-storage.ts:~437`
**Changes needed**:
```typescript
// Line 437: Replace
this.invalidateCache();

// With:
const resolvedTag = tag || 'master';
this.invalidateCacheForTag(resolvedTag);
```

**Test after**: Verify cache invalidation after saves

---

#### Step 1.3: Update `deleteTag()` method
**Location**: `file-storage.ts:~741, ~748`
**Changes needed**:
```typescript
// Lines 741, 748: Replace
this.invalidateCache();

// With:
this.invalidateCacheForTag(tag);
```

**Test after**: Verify tag deletion clears correct cache entries

---

#### Step 1.4: Update `renameTag()` method
**Location**: `file-storage.ts:~781, ~798`
**Changes needed**:
```typescript
// Lines 781, 798: Replace
this.invalidateCache();

// With:
this.invalidateCacheForTag(oldTag);
this.invalidateCacheForTag(newTag);
```

**Test after**: Verify tag rename invalidates both old and new tag caches

---

#### Step 1.5: Remove old cache references
**Search for**: `this.taskCache`
**Action**: Ensure all references are removed/replaced
**Files**: Only `file-storage.ts` should be affected

---

### Phase 2: Unit Tests for Cache Components (45 min)

#### Step 2.1: Create `lru-cache-strategy.spec.ts`
**Location**: `packages/tm-core/src/common/cache/strategies/lru-cache-strategy.spec.ts`

**Test coverage**:
```typescript
describe('LRUCacheStrategy', () => {
  describe('Basic Operations', () => {
    it('should return CACHE_MISS for non-existent keys');
    it('should store and retrieve values');
    it('should respect TTL expiration with fake timers');
    it('should delete entries');
    it('should check if key exists');
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when max entries reached');
    it('should maintain LRU order');
    it('should not evict entries within capacity');
  });

  describe('Memory-Based Eviction', () => {
    it('should evict when memory limit exceeded');
    it('should estimate memory usage accurately');
    it('should free enough memory for new entries');
  });

  describe('Selective Invalidation', () => {
    it('should invalidate by namespace');
    it('should invalidate by tag');
    it('should invalidate by pattern');
    it('should invalidate all with scope.all');
    it('should return count of invalidated entries');
  });

  describe('Metrics', () => {
    it('should track hits and misses');
    it('should calculate hit rate correctly');
    it('should track evictions');
    it('should track namespace-specific metrics');
    it('should reset namespace metrics on clear');
  });
});
```

**Import test helpers**:
- Use `setupFakeTimers()` from `tests/test-helpers/timer-helpers.ts`
- Use `CacheAccessTracker` from `tests/test-helpers/cache-ordering-helpers.ts`

---

#### Step 2.2: Create `cache-manager.spec.ts`
**Location**: `packages/tm-core/src/common/cache/cache-manager.spec.ts`

**Test coverage**:
```typescript
describe('CacheManager', () => {
  describe('Delegation', () => {
    it('should delegate get to strategy');
    it('should delegate set to strategy');
    it('should delegate invalidate to strategy');
    it('should delegate clear to strategy');
  });

  describe('Monitoring Hooks', () => {
    it('should call hooks on cache hit');
    it('should call hooks on cache miss');
    it('should call hooks on set');
    it('should call hooks on invalidation');
    it('should call hooks on clear');
    it('should handle hook errors gracefully');
  });

  describe('Convenience Methods', () => {
    it('should invalidate by namespace');
    it('should invalidate by tag');
    it('should invalidate by pattern');
  });
});
```

**Use MockCacheStrategy** for testing:
```typescript
class MockCacheStrategy implements ICacheStrategy {
  storage = new Map();
  getCallCount = 0;
  setCallCount = 0;

  get(key: string) {
    this.getCallCount++;
    return this.storage.get(key) ?? CACHE_MISS;
  }

  set(key: string, value: any) {
    this.setCallCount++;
    this.storage.set(key, value);
  }

  // ... other methods
}
```

---

### Phase 3: Update Integration Tests (30 min)

#### Step 3.1: Update `file-storage-cache.test.ts`
**Location**: `packages/tm-core/tests/integration/storage/file-storage-cache.test.ts`

**Add new test suites**:
```typescript
describe('FileStorage with CacheManager (Clean Architecture)', () => {
  describe('Cache Metrics', () => {
    it('should track cache hits across operations');
    it('should track cache misses');
    it('should calculate hit rate correctly');
    it('should track memory usage');
    it('should report namespace-specific metrics');
  });

  describe('Selective Invalidation', () => {
    it('should invalidate only specified tag on saveTasks');
    it('should invalidate only specified tag on deleteTag');
    it('should invalidate both tags on renameTag');
    it('should preserve cache for other tags');
    it('should invalidate by namespace');
  });

  describe('Dependency Injection', () => {
    it('should accept custom CacheManager in constructor');
    it('should use default cache if none provided');
    it('should allow monitoring hooks');
  });
});
```

#### Step 3.2: Verify existing tests still pass
**Run**: `npm test -- file-storage`
**Expected**: All existing tests should pass with new implementation
**Fix**: Any test failures related to cache behavior

---

### Phase 4: Performance Benchmarks (30 min)

#### Step 4.1: Create benchmark suite
**Location**: `packages/tm-core/benchmarks/cache-performance.bench.ts`

```typescript
import { bench, describe } from 'vitest';
import { FileStorage } from '../src/modules/storage/adapters/file-storage/file-storage.js';

describe('Cache Performance Benchmarks', () => {
  bench('cached read (100 operations)', async () => {
    // Benchmark cached reads
  });

  bench('cache miss read', async () => {
    // Benchmark cold reads
  });

  bench('write with selective invalidation', async () => {
    // Benchmark write operations
  });

  bench('cache metrics collection overhead', async () => {
    // Measure metrics overhead
  });
});
```

#### Step 4.2: Run benchmarks
**Command**: `npm run benchmark`
**Document**: Baseline performance metrics

---

### Phase 5: Documentation (20 min)

#### Step 5.1: Update CLAUDE.md
**Location**: `CLAUDE.md`
**Add section**: Cache Architecture Patterns

```markdown
## Cache Architecture

FileStorage uses a clean cache architecture with dependency injection:

### Components
- **ICacheStrategy**: Abstract interface for cache backends
- **LRUCacheStrategy**: Default LRU implementation with metrics
- **CacheManager**: High-level facade for cache operations

### Features
- Selective invalidation (tag/namespace/pattern-based)
- Comprehensive metrics (hits, misses, evictions, memory)
- Memory-based eviction (50MB limit)
- Namespace isolation prevents key collisions

### Usage
```typescript
// Default cache
const storage = new FileStorage(projectPath);

// Custom cache (e.g., for testing)
const mockCache = new CacheManager({ strategy: mockStrategy });
const storage = new FileStorage(projectPath, mockCache);
```

### Metrics
```typescript
const metrics = storage.getCacheMetrics();
console.log(`Hit rate: ${(metrics.hitRate * 100).toFixed(2)}%`);
console.log(`Memory usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
```
```

#### Step 5.2: Create migration guide
**Location**: `.taskmaster/CACHE-MIGRATION-GUIDE.md`
**Content**: How to migrate other storage adapters to use CacheManager

---

### Phase 6: Quality Review & Testing (30 min)

#### Step 6.1: Run full test suite
```bash
npm test
```
**Expected**: All tests pass
**Fix**: Any failures

#### Step 6.2: Check TypeScript compilation
```bash
npm run build
```
**Expected**: No TypeScript errors
**Fix**: Type issues

#### Step 6.3: Run code reviewer agent
```bash
/pr-review-toolkit:review-pr code
```
**Review**: Agent feedback on code quality
**Fix**: Critical issues

#### Step 6.4: Check test coverage
```bash
npm run test:coverage
```
**Target**: >85% coverage for new cache code
**Add tests**: For uncovered code paths

---

## 🎯 Definition of Done

### Functionality
- [ ] All FileStorage methods use CacheManager (no `this.taskCache` references)
- [ ] Selective invalidation works correctly (tag-specific)
- [ ] Cache metrics accurately track hits/misses/evictions
- [ ] Memory-based eviction prevents unbounded growth
- [ ] All existing FileStorage tests pass

### Testing
- [ ] Unit tests for LRUCacheStrategy (>90% coverage)
- [ ] Unit tests for CacheManager (>90% coverage)
- [ ] Integration tests verify cache behavior
- [ ] Performance benchmarks establish baseline
- [ ] All tests pass on CI

### Documentation
- [ ] CLAUDE.md updated with cache architecture
- [ ] Inline JSDoc complete for all public APIs
- [ ] Migration guide created
- [ ] Benchmark results documented

### Quality
- [ ] TypeScript compiles without errors
- [ ] No ESLint warnings
- [ ] Code reviewer agent approves
- [ ] PR description complete with:
  - Summary of changes
  - Performance improvements
  - Breaking changes (if any)
  - Testing performed

---

## 📊 Performance Targets

### Cache Hit Rate
- **Target**: >80% hit rate for read-heavy workloads
- **Measure**: Run integration tests with metrics enabled

### Memory Usage
- **Target**: <50MB for 100 cached entries
- **Measure**: Check `getCacheMetrics().memoryUsage`

### Invalidation Performance
- **Before**: Global clear = O(n) for all entries
- **After**: Selective invalidation = O(k) for k affected entries
- **Target**: >60% reduction in unnecessary cache misses after writes

---

## 🚀 Commit Strategy

### Commit 1: Complete FileStorage refactoring
```
feat(task-11): Complete FileStorage migration to CacheManager

- Updated loadSingleTask, saveTasks, deleteTag, renameTag
- All methods now use CacheManager with selective invalidation
- Removed all legacy taskCache references
- Backward compatible via dependency injection

BREAKING CHANGE: FileStorage constructor now accepts optional CacheManager
```

### Commit 2: Add comprehensive tests
```
test(task-11): Add unit tests for cache components

- LRUCacheStrategy: 95% coverage
- CacheManager: 92% coverage
- Integration tests verify selective invalidation
- Performance benchmarks establish baseline
```

### Commit 3: Documentation & polish
```
docs(task-11): Document cache architecture

- Updated CLAUDE.md with cache patterns
- Added migration guide
- Documented performance improvements
- Added benchmark results
```

### Final: Mark task as done
```bash
task-master set-status --id=11.3 --status=done
task-master set-status --id=11.4 --status=in-progress
# ... continue with subtask 11.4 (benchmarks)
```

---

## ⚠️ Known Issues / Notes

### FileStorage Methods Still Using Old Cache (TO FIX):
1. **Line 259** in `loadSingleTask()`: `this.taskCache.get()`
2. **Line 279, 293, 302** in `loadSingleTask()`: `this.taskCache.set()` with timestamp
3. **Line 437** in `saveTasks()`: `this.invalidateCache()`
4. **Lines 741, 748** in `deleteTag()`: `this.invalidateCache()`
5. **Lines 781, 798** in `renameTag()`: `this.invalidateCache()`

### Test Helpers Available:
- `setupFakeTimers()` - For TTL testing
- `CacheAccessTracker` - For LRU ordering verification
- `createMemoryValidator()` - For memory constraint testing

### Patterns to Follow:
- Always use `isCacheMiss()` type guard after `cacheManager.get()`
- Always provide `namespace` and `tags` when calling `cacheManager.set()`
- Use `invalidateCacheForTag()` instead of global `clear()`

---

## 📞 Support

If you encounter issues:
1. Check this checklist for systematic approach
2. Review commit ad8d7980 for completed work
3. Refer to agent architecture blueprints in session context
4. Test incrementally - one method at a time

**Estimated time to completion**: 2.5-3 hours
**Current progress**: 70% complete
**Remaining**: 30% (FileStorage methods + testing + docs)
