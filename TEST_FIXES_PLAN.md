# Test Fixes Plan - Performance Enhancements Branch

## Executive Summary
- **Total Failing Tests**: 159 out of 640
- **Failing Test Files**: 150 out of 165
- **Success Rate**: 75.2% (481 passing tests)
- **Primary Issues**: Vitest mocking setup, Windows path handling, cache TTL implementation

---

## Priority 1: Critical Mocking Infrastructure (Affects 50+ tests)

### Issue 1.1: Vitest Mock Functions Not Available
**Affected Files**: 
- `config-loader.service.spec.ts`
- `config-persistence.service.spec.ts`
- `runtime-state-manager.service.spec.ts`

**Problem**: 
```typescript
vi.mocked(fs.readFile).mockResolvedValue(...)
// Error: mockResolvedValue is not a function
```

**Root Cause**: The `vi.mocked()` utility may not be properly typing the mocked functions, or the fs/promises module isn't being mocked correctly.

**Solutions**:
1. **Option A - Use vi.spyOn instead**:
   ```typescript
   vi.spyOn(fs, 'readFile').mockResolvedValue(...)
   ```

2. **Option B - Manual mock casting**:
   ```typescript
   (fs.readFile as Mock).mockResolvedValue(...)
   ```

3. **Option C - Update mock setup**:
   ```typescript
   vi.mock('node:fs/promises', () => ({
     readFile: vi.fn(),
     writeFile: vi.fn(),
     mkdir: vi.fn(),
     // ... etc
   }))
   ```

**Recommendation**: Use Option C - Properly mock the entire module with vi.fn() for all methods used.

---

### Issue 1.2: Constructor Mocking Issues
**Affected Files**: 
- `config-manager.spec.ts` (13 failures)

**Problem**:
```typescript
TypeError: () => ({...}) is not a constructor
// When trying to instantiate ConfigLoader, ConfigMerger, RuntimeStateManager
```

**Root Cause**: Mock factories returning object literals instead of constructors.

**Solution**:
```typescript
vi.mock('./services/config-loader.service.js', () => ({
  ConfigLoader: vi.fn().mockImplementation(() => ({
    loadLocalConfig: vi.fn(),
    loadGlobalConfig: vi.fn(),
    // ... all methods
  }))
}))
```

**Alternative**: Use actual classes with mocked methods:
```typescript
class MockConfigLoader {
  loadLocalConfig = vi.fn()
  loadGlobalConfig = vi.fn()
}

vi.mock('./services/config-loader.service.js', () => ({
  ConfigLoader: MockConfigLoader
}))
```

---

## Priority 2: Business Logic Fixes (Affects 8 tests)

### Issue 2.1: Template Engine Missing Variables
**Affected File**: `template-engine.test.ts`

**Problem**: 
- Expected: `"Hello {{name}}"` (preserve placeholder)
- Received: `"Hello "` (removes placeholder)

**Current Behavior**: Template engine removes placeholders when variables are missing.

**Expected Behavior**: Template engine should preserve placeholders for missing variables.

**Location**: `packages/tm-core/src/modules/git/services/template-engine.ts`

**Fix**:
```typescript
render(context: string, variables: Record<string, any>, template: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    // If variable exists, replace it
    if (key in variables && variables[key] !== undefined) {
      return String(variables[key]);
    }
    // If variable doesn't exist, keep the placeholder
    return match;
  });
}
```

---

### Issue 2.2: Workflow State Manager Path Sanitization
**Affected File**: `workflow-state-manager.spec.ts`

**Problem**: Windows drive letters being incorrectly processed
- Expected: `-Volumes-Workspace-...`
- Received: `-D-Volumes-Workspace-...`

**Root Cause**: Path sanitization not properly handling Windows drive letters (e.g., `D:\`).

**Location**: `packages/tm-core/src/modules/workflow/managers/workflow-state-manager.ts`

**Fix**:
```typescript
private getProjectIdentifier(projectRoot: string): string {
  // Remove Windows drive letter (C:, D:, etc.) before sanitization
  let sanitized = projectRoot.replace(/^[A-Z]:/i, '');
  
  // Replace path separators and special chars with dashes
  sanitized = sanitized.replace(/[/\\:]/g, '-');
  
  // Replace other special characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9-]/g, '-');
  
  // Collapse multiple dashes
  sanitized = sanitized.replace(/-+/g, '-');
  
  // Remove leading/trailing dashes
  sanitized = sanitized.replace(/^-+|-+$/g, '');
  
  return sanitized;
}
```

---

### Issue 2.3: Workflow Orchestrator Validation
**Affected File**: `workflow-orchestrator.test.ts`

**Problem**: RED phase validation not throwing expected errors.

**Expected**: `throw new TaskMasterError('RED phase must have at least one failing test')`

**Investigation Needed**: 
1. Check if validation is being called
2. Check if condition logic is correct
3. Verify error is being thrown properly

**Location**: `packages/tm-core/src/modules/workflow/orchestrators/workflow-orchestrator.ts`

---

## Priority 3: Performance & Infrastructure (Affects 10 tests)

### Issue 3.1: Cache TTL Tests Timing Out
**Affected File**: `file-storage.spec.ts`

**Problem**: Tests timing out at 5000ms waiting for TTL expiration.

**Tests Affected**:
- "should expire cache after TTL"
- "should not reset TTL on cache hits"
- "should handle TTL expiration correctly over time"
- "should prevent stale reads after TTL expires"

**Root Cause**: Tests using real timers and waiting for actual TTL expiration (likely > 5 seconds).

**Solution**:
```typescript
import { vi } from 'vitest';

describe('TTL Expiration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should expire cache after TTL', async () => {
    const tasks1 = await storage.loadTasks('master');
    expect(tasks1).toBeDefined();

    // Fast-forward time past TTL
    vi.advanceTimersByTime(6000); // If TTL is 5000ms

    const tasks2 = await storage.loadTasks('master');
    // Should reload from disk, not cache
  });
});
```

---

### Issue 3.2: Empty Cache Results
**Affected File**: `file-storage.spec.ts`

**Problem**: Loading nonexistent tags returns cached data instead of empty array.

**Tests**:
- "should handle empty task list in cache"
- "should not cache errors"

**Root Cause**: Cache may be incorrectly caching empty results or not properly differentiating between tags.

**Fix Strategy**:
1. Ensure cache keys include tag name
2. Don't cache empty results
3. Properly handle cache misses

**Investigation**:
```typescript
// Check cache key generation
private getCacheKey(tag: string): string {
  return `tasks:${tag}`;
}

// Ensure we don't cache empty results
async loadTasks(tag: string): Promise<Task[]> {
  const cached = this.cache.get(this.getCacheKey(tag));
  if (cached) return cached;
  
  const tasks = await this.loadFromDisk(tag);
  
  // Only cache if we have results
  if (tasks.length > 0) {
    this.cache.set(this.getCacheKey(tag), tasks);
  }
  
  return tasks;
}
```

---

### Issue 3.3: LRU Eviction Test Timeout
**Affected File**: `file-storage.spec.ts`

**Test**: "should limit cache size with LRU eviction"

**Problem**: Test creates 100+ cache entries and times out.

**Solutions**:
1. Increase test timeout: 
   ```typescript
   it('should limit cache size', async () => {
     // ... test code
   }, 10000); // 10 second timeout
   ```

2. Reduce test scale:
   ```typescript
   // Instead of 100+, test with 10-20 entries
   for (let i = 0; i < 20; i++) {
     await storage.loadTasks(`tag-${i}`);
   }
   ```

---

### Issue 3.4: Atomic Write File Permissions
**Affected File**: `file-storage.spec.ts`

**Problem**: 
```
EPERM: operation not permitted, rename
ENOENT: no such file or directory, rename
```

**Root Cause**: Windows file locking or race conditions during atomic writes.

**Location**: `file-operations.ts`

**Solutions**:

1. **Add retry logic**:
```typescript
async performAtomicWrite(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const maxRetries = 3;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, filePath);
      return;
    } catch (error: any) {
      if (error.code === 'EPERM' && i < maxRetries - 1) {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}
```

2. **Use platform-specific atomic write**:
```typescript
if (process.platform === 'win32') {
  // Windows-specific atomic write
  await fs.writeFile(filePath, content);
} else {
  // Unix atomic rename
  await this.performAtomicWrite(filePath, content);
}
```

---

## Priority 4: Test Configuration Issues (Affects 3 tests)

### Issue 4.1: Environment Config Provider
**Affected File**: `environment-config-provider.service.spec.ts`

**Problems**:
1. Console.warn spy not being called
2. Assignment to constant variable

**Fix 1 - Console spy**:
```typescript
it('should validate storage type values', () => {
  process.env.TASKMASTER_STORAGE_TYPE = 'invalid';
  
  // Create a fresh provider instance AFTER setting env
  const provider = new EnvironmentConfigProvider(defaultMappings);
  const warnSpy = vi.spyOn(console, 'warn');
  
  const config = provider.loadConfig();
  
  expect(config).toEqual({});
  expect(warnSpy).toHaveBeenCalled();
});
```

**Fix 2 - Constant reassignment**:
```typescript
// Change from const to let
let customProvider: EnvironmentConfigProvider;

beforeEach(() => {
  customProvider = new EnvironmentConfigProvider([...]);
});

it('should work with custom validators', () => {
  // Now we can reassign
  customProvider = new EnvironmentConfigProvider([...]);
});
```

---

## Implementation Order

### Phase 1: Infrastructure (Days 1-2)
1. Fix vitest mock setup (Issue 1.1) - **Highest Impact**
2. Fix constructor mocking (Issue 1.2)
3. Fix environment config tests (Issue 4.1)

**Expected**: ~66 test failures resolved

### Phase 2: Business Logic (Day 3)
4. Fix template engine (Issue 2.1)
5. Fix path sanitization (Issue 2.2)
6. Fix workflow validation (Issue 2.3)

**Expected**: ~8 additional tests passing

### Phase 3: Performance Tests (Days 4-5)
7. Fix cache TTL timeouts (Issue 3.1)
8. Fix empty cache handling (Issue 3.2)
9. Fix LRU eviction timeout (Issue 3.3)
10. Fix atomic write issues (Issue 3.4)

**Expected**: ~10 additional tests passing

### Phase 4: Verification (Day 6)
11. Run full test suite
12. Document any remaining failures
13. Create follow-up tickets if needed

---

## Success Criteria

- [ ] All 640 tests passing
- [ ] No timeout failures
- [ ] All mocking working correctly
- [ ] Cross-platform compatibility (Windows + Unix)
- [ ] Cache behavior validated
- [ ] Performance tests stable

---

## Testing Strategy

### After Each Fix:
```bash
# Test specific file
npx vitest run packages/tm-core/src/modules/config/services/config-loader.service.spec.ts

# Test category
npx vitest run packages/tm-core/src/modules/config

# Full suite
npx vitest run
```

### Validation Checklist:
- [ ] Tests pass on Windows
- [ ] Tests pass on Unix/Linux
- [ ] No flaky tests (run 3 times)
- [ ] No memory leaks in cache tests
- [ ] Proper error messages

---

## Risk Assessment

**Low Risk** (Can fix independently):
- Template engine logic
- Path sanitization
- Test timeouts

**Medium Risk** (May have dependencies):
- Mock setup changes
- Cache behavior changes

**High Risk** (Could break other functionality):
- File operations atomic writes
- Constructor mocking (affects DI)

---

## Rollback Plan

If fixes introduce regressions:
1. Revert individual commits
2. Use feature flags for cache changes
3. Maintain backward compatibility for 1 version
4. Document breaking changes

---

## Notes

- Many failures are related to the same root cause (mocking setup)
- Windows-specific issues suggest need for CI on Windows
- Performance tests may need longer timeouts in CI environment
- Consider splitting large test files for better organization
