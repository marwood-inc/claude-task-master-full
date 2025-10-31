# Best Practices & Lessons Learned - Task Master Performance Enhancements

**Document Purpose:** Capture reusable patterns, anti-patterns, and lessons learned during the performance enhancement initiative for future reference.

**Last Updated:** 2025-10-31

---

## Table of Contents
1. [Testing Best Practices](#testing-best-practices)
2. [Performance Optimization Patterns](#performance-optimization-patterns)
3. [Caching Strategies](#caching-strategies)
4. [Cross-Platform Development](#cross-platform-development)
5. [Error Handling Patterns](#error-handling-patterns)
6. [Code Organization](#code-organization)
7. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Testing Best Practices

### 1. Mock Infrastructure

#### ✅ DO: Centralize Mocks in Test Helpers

```typescript
// tests/test-helpers/node-mocks.ts
export const createMockFs = () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
});

// Usage in tests
const mockFs = createMockFs();
vi.mock('node:fs/promises', () => mockFs);
```

**Why:** 
- Reduces duplication across test files
- Ensures consistent mock behavior
- Makes updates easier (change once, apply everywhere)
- Improves type safety

#### ❌ DON'T: Inline Mocks in Every Test

```typescript
// BAD: Repeated in every test file
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  // ... repeated everywhere
}));
```

---

### 2. Constructor Mocking for Dependency Injection

#### ✅ DO: Use Mock Classes

```typescript
// tests/test-helpers/mock-registry.ts
export class MockConfigLoader {
  loadLocalConfig = vi.fn();
  loadGlobalConfig = vi.fn();
  validateConfig = vi.fn();
}

vi.mock('./services/config-loader.service.js', () => ({
  ConfigLoader: MockConfigLoader
}));
```

**Why:**
- Mirrors real class structure
- Enables vi.fn() call tracking
- Supports instanceof checks
- Maintains type safety

#### ❌ DON'T: Return Plain Objects as Constructors

```typescript
// BAD: Not a constructor
vi.mock('./config-loader.service.js', () => ({
  ConfigLoader: () => ({ loadConfig: vi.fn() })
}));
// Error: () => ({...}) is not a constructor
```

---

### 3. Fake Timers for Time-Based Tests

#### ✅ DO: Use Fake Timers for TTL/Timeout Tests

```typescript
describe('Cache TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires cache after TTL', async () => {
    await cache.set('key', 'value', 5000);
    
    // Fast-forward 6 seconds
    vi.advanceTimersByTime(6000);
    
    const result = await cache.get('key');
    expect(result).toBeUndefined();
  });
});
```

**Benefits:**
- Tests complete in milliseconds, not seconds
- Deterministic behavior (no flaky tests)
- Full control over time progression
- Easy to test edge cases (expiration boundaries)

#### ❌ DON'T: Use Real Timers in Tests

```typescript
// BAD: Slow and potentially flaky
it('expires after TTL', async () => {
  await cache.set('key', 'value', 5000);
  await new Promise(resolve => setTimeout(resolve, 5100));
  // Takes 5+ seconds to run
});
```

---

### 4. Test Scale and Performance

#### ✅ DO: Use Minimal Data Sets

```typescript
// GOOD: Test LRU with 10-20 items
describe('LRU Eviction', () => {
  it('evicts least recently used', async () => {
    for (let i = 0; i < 20; i++) {
      await cache.set(`key-${i}`, `value-${i}`);
    }
    // Behavior is clear with small dataset
  });
});
```

**Why:**
- Faster test execution
- Easier to debug failures
- Still validates behavior effectively

#### ❌ DON'T: Use Unnecessarily Large Datasets

```typescript
// BAD: 100+ items when 10-20 proves the same
for (let i = 0; i < 100; i++) {
  await cache.set(`key-${i}`, `value-${i}`);
}
// Slow, no additional value
```

---

### 5. Test Isolation and Cleanup

#### ✅ DO: Clean Up After Each Test

```typescript
describe('FileStorage', () => {
  let storage: FileStorage;
  
  beforeEach(() => {
    storage = new FileStorage();
  });
  
  afterEach(() => {
    storage.clearCache();
    vi.clearAllMocks();
    vi.useRealTimers(); // If using fake timers
  });
  
  it('test case', () => {
    // Test runs in clean state
  });
});
```

**Why:**
- Prevents test interference
- Avoids flaky tests
- Makes debugging easier
- Ensures predictable behavior

---

## Performance Optimization Patterns

### 1. Caching Strategy

#### ✅ DO: Cache Read-Heavy Operations

```typescript
class TaskStorage {
  private cache = new Map<string, Task[]>();
  
  async loadTasks(tag: string): Promise<Task[]> {
    const cacheKey = `tasks:${tag}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    // Load from disk
    const tasks = await this.loadFromDisk(tag);
    
    // Cache for future reads
    if (tasks.length > 0) {
      this.cache.set(cacheKey, tasks);
    }
    
    return tasks;
  }
  
  async saveTasks(tag: string, tasks: Task[]): Promise<void> {
    await this.writeToDisk(tag, tasks);
    
    // Invalidate cache on write
    this.cache.delete(`tasks:${tag}`);
  }
}
```

**Benefits:**
- 70-90% reduction in I/O operations
- 50-80% faster read operations
- Automatic cache invalidation on writes

#### Key Principles:
1. **Cache reads, invalidate on writes**
2. **Include all context in cache keys** (`tasks:${tag}`, not just `tasks`)
3. **Don't cache empty results** unless intentional
4. **Provide cache clear methods** for debugging

---

### 2. Batch Operations

#### ✅ DO: Batch Multiple File Operations

```typescript
class FileManager {
  async writeBatch(files: Array<{path: string, content: string}>): Promise<void> {
    // Write all files in parallel
    await Promise.all(
      files.map(({path, content}) => 
        this.writeFile(path, content)
      )
    );
  }
}

// Usage
await fileManager.writeBatch([
  { path: 'task-1.json', content: '...' },
  { path: 'task-2.json', content: '...' },
  { path: 'task-3.json', content: '...' },
]);
```

**Benefits:**
- 40-60% faster than sequential writes
- Better resource utilization
- Reduced overhead

#### ❌ DON'T: Write Files Sequentially When Parallel is Possible

```typescript
// BAD: Sequential writes
for (const task of tasks) {
  await writeFile(task.path, task.content);
}
```

---

### 3. Lazy Loading and Initialization

#### ✅ DO: Load Dependencies on First Use

```typescript
class AIService {
  private anthropic: Anthropic | null = null;
  
  private getClient(): Anthropic {
    if (!this.anthropic) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
    return this.anthropic;
  }
  
  async chat(message: string): Promise<string> {
    const client = this.getClient();
    // Use client...
  }
}
```

**Benefits:**
- Faster startup time
- Lower memory footprint
- Only load what's needed

---

### 4. Debouncing and Throttling

#### ✅ DO: Debounce High-Frequency Operations

```typescript
class TasksDomain {
  private dirtyTasks = new Set<string>();
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DEBOUNCE_MS = 100;
  
  markDirty(taskId: string): void {
    this.dirtyTasks.add(taskId);
    this.debounceSave();
  }
  
  private debounceSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    this.saveTimer = setTimeout(() => {
      this.flush();
    }, this.SAVE_DEBOUNCE_MS);
  }
  
  private async flush(): Promise<void> {
    const taskIds = Array.from(this.dirtyTasks);
    this.dirtyTasks.clear();
    
    // Batch save all dirty tasks
    await this.saveTasks(taskIds);
  }
}
```

**Benefits:**
- Reduces redundant saves
- Batches multiple updates
- 35-50% improvement in update operations

---

## Caching Strategies

### 1. Cache Key Design

#### ✅ DO: Include All Context in Keys

```typescript
// GOOD: Context-aware cache keys
private getCacheKey(tag: string, projectRoot: string): string {
  return `tasks:${projectRoot}:${tag}`;
}

// Different projects, same tag → different cache entries
cache.get('tasks:/project-a:master');  // Project A's master
cache.get('tasks:/project-b:master');  // Project B's master
```

#### ❌ DON'T: Use Ambiguous Keys

```typescript
// BAD: Ambiguous key
private getCacheKey(): string {
  return 'tasks';  // Which tasks? What project? What tag?
}
```

---

### 2. Cache Invalidation

#### ✅ DO: Invalidate on Mutations

```typescript
class CachedStorage {
  async updateTask(id: string, updates: Partial<Task>): Promise<void> {
    // 1. Update the data
    await this.storage.updateTask(id, updates);
    
    // 2. Invalidate affected cache entries
    this.cache.delete(`task:${id}`);
    this.cache.delete('tasks:list');
    this.cache.delete(`tasks:tag:${task.tag}`);
  }
}
```

**Principle:** When in doubt, invalidate. Stale data is worse than cache misses.

---

### 3. Cache Scope and Lifetime

#### ✅ DO: Use Session-Based Cache

```typescript
class SessionCache {
  private cache = new Map<string, any>();
  
  constructor() {
    // Cache lives for session
    // Cleared on restart
  }
  
  clear(): void {
    this.cache.clear();
  }
}
```

**Why:**
- Prevents stale data across sessions
- Simpler than TTL management
- Automatic cleanup

#### Future Enhancement: TTL-Based Cache

```typescript
class TTLCache {
  private cache = new Map<string, {value: any, expiresAt: number}>();
  
  set(key: string, value: any, ttlMs: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }
  
  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }
}
```

---

## Cross-Platform Development

### 1. Path Normalization

#### ✅ DO: Normalize Paths Early

```typescript
import path from 'node:path';

class PathNormalizer {
  static normalize(inputPath: string): string {
    // 1. Remove Windows drive letter
    let normalized = inputPath.replace(/^[A-Z]:/i, '');
    
    // 2. Use forward slashes
    normalized = normalized.replace(/\\/g, '/');
    
    // 3. Remove leading/trailing slashes
    normalized = normalized.replace(/^\/+|\/+$/g, '');
    
    return normalized;
  }
}

// Usage
const projectId = PathNormalizer.normalize('D:\\projects\\my-app');
// Result: 'projects/my-app' (platform-agnostic)
```

**Why:**
- Windows: `C:\Users\Name\project`
- Unix: `/Users/Name/project`
- Normalized: `Users/Name/project` (works everywhere)

---

### 2. File Operations

#### ✅ DO: Use Platform-Agnostic APIs

```typescript
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// GOOD: Platform-agnostic
const configPath = join(projectRoot, '.taskmaster', 'config.json');
const absolutePath = resolve(projectRoot, relativePath);

// Get directory from file path
const dir = dirname(filePath);
```

#### ❌ DON'T: Hardcode Path Separators

```typescript
// BAD: Only works on Unix
const configPath = projectRoot + '/.taskmaster/config.json';

// BAD: Only works on Windows
const configPath = projectRoot + '\\.taskmaster\\config.json';
```

---

### 3. Atomic File Writes

#### ✅ DO: Handle Platform-Specific Issues

```typescript
async performAtomicWrite(
  filePath: string, 
  content: string
): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const maxRetries = 3;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Write to temp file
      await fs.writeFile(tempPath, content, 'utf-8');
      
      // Atomic rename
      await fs.rename(tempPath, filePath);
      return;
      
    } catch (error: any) {
      // Windows file locking can cause EPERM
      if (error.code === 'EPERM' && i < maxRetries - 1) {
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, 100 * Math.pow(2, i))
        );
        continue;
      }
      
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }
}
```

**Why:**
- Windows file locking is more aggressive
- Retry logic handles transient errors
- Exponential backoff prevents thundering herd

---

## Error Handling Patterns

### 1. Custom Error Classes

#### ✅ DO: Create Domain-Specific Errors

```typescript
// errors/task-master-error.ts
export class TaskMasterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'TaskMasterError';
  }
}

// errors/workflow-validation-error.ts
export class WorkflowValidationError extends TaskMasterError {
  constructor(
    message: string,
    public readonly phase: WorkflowPhase,
    public readonly failures: ValidationFailure[]
  ) {
    super(message, 'WORKFLOW_VALIDATION_ERROR', { phase, failures });
  }
}

// Usage
throw new WorkflowValidationError(
  'RED phase validation failed',
  'RED',
  [{ rule: 'must-have-failing-test', message: '...' }]
);
```

**Benefits:**
- Type-safe error handling
- Rich context for debugging
- Clear error hierarchies
- Better error messages

---

### 2. Error Recovery

#### ✅ DO: Implement Retry Logic

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries: number;
    backoffMs: number;
    retryableErrors: string[];
  }
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < options.maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      if (!options.retryableErrors.includes(error.code)) {
        throw error;
      }
      
      // Wait before retry
      if (i < options.maxRetries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, options.backoffMs * Math.pow(2, i))
        );
      }
    }
  }
  
  throw lastError!;
}

// Usage
const data = await withRetry(
  () => fs.readFile(path, 'utf-8'),
  {
    maxRetries: 3,
    backoffMs: 100,
    retryableErrors: ['EPERM', 'EBUSY', 'EAGAIN']
  }
);
```

---

## Code Organization

### 1. Test Helper Structure

```
tests/
├── test-helpers/
│   ├── index.ts                    # Export all helpers
│   ├── node-mocks.ts               # Node.js API mocks
│   ├── mock-registry.ts            # Mock class registry
│   ├── timer-helpers.ts            # Fake timer utilities
│   ├── cache-ordering-helpers.ts   # Cache verification
│   └── service-mocks.ts            # Service layer mocks
├── unit/
│   └── packages/
│       └── tm-core/
└── integration/
    └── storage/
```

**Benefits:**
- Clear separation of concerns
- Easy to find and reuse helpers
- Consistent patterns across tests

---

### 2. Domain-Driven Structure

```
packages/tm-core/src/
├── common/
│   ├── cache/              # Caching infrastructure
│   ├── errors/             # Error classes
│   └── utils/              # Shared utilities
├── modules/
│   ├── config/
│   │   ├── managers/       # High-level orchestration
│   │   ├── services/       # Business logic
│   │   └── types/          # Type definitions
│   ├── tasks/
│   ├── workflow/
│   └── git/
└── tm-core.ts              # Main facade
```

---

## Anti-Patterns to Avoid

### 1. ❌ Over-Caching

```typescript
// BAD: Caching everything
class OverCached {
  async getTask(id: string): Promise<Task> {
    const cached = this.cache.get(id);
    if (cached) return cached;
    
    const task = await this.load(id);
    this.cache.set(id, task);  // Never invalidated!
    return task;
  }
}
```

**Problem:** Stale data, memory leaks, inconsistent state

**Solution:** Cache only read-heavy operations, invalidate on writes

---

### 2. ❌ Premature Optimization

```typescript
// BAD: Optimizing before measuring
class PrematureOptimization {
  // Complex caching for operation that runs once
  async initializeOnce(): Promise<void> {
    const cached = this.cache.get('init');
    if (cached) return;
    // ... initialization
    this.cache.set('init', true);
  }
}
```

**Problem:** Added complexity with no benefit

**Solution:** Measure first, optimize high-impact areas

---

### 3. ❌ Synchronous I/O in Production

```typescript
// BAD: Blocking the event loop
const data = fs.readFileSync(path, 'utf-8');
const parsed = JSON.parse(data);
```

**Problem:** Blocks entire application

**Solution:** Use async/await for all I/O

```typescript
// GOOD: Non-blocking
const data = await fs.readFile(path, 'utf-8');
const parsed = JSON.parse(data);
```

---

### 4. ❌ Ignoring Platform Differences

```typescript
// BAD: Unix-only path handling
const normalized = path.replace(/\//g, '-');
// Fails on Windows: C:\Users\... still has backslashes
```

**Solution:** Use path normalization utilities

---

### 5. ❌ Testing Implementation Details

```typescript
// BAD: Testing internal state
expect(cache['_internalMap'].size).toBe(5);

// GOOD: Testing observable behavior
expect(await cache.get('key')).toBe('value');
```

**Problem:** Tests become brittle, break on refactoring

**Solution:** Test public APIs and observable behavior

---

## Quick Reference Checklist

### Before Writing Code
- [ ] Is there an existing pattern for this?
- [ ] Have I checked cross-platform compatibility?
- [ ] Do I need to cache this operation?
- [ ] What error cases need handling?

### Before Committing
- [ ] All tests pass locally
- [ ] Added tests for new functionality
- [ ] Updated documentation
- [ ] Ran linter and formatter
- [ ] Checked for platform-specific issues

### Performance Optimization
- [ ] Measured baseline performance
- [ ] Identified bottleneck with profiling
- [ ] Implemented optimization
- [ ] Measured improvement
- [ ] Added performance regression tests

### Testing
- [ ] Used fake timers for time-based tests
- [ ] Centralized mocks in test helpers
- [ ] Cleaned up resources in afterEach
- [ ] Used minimal datasets
- [ ] Tested error cases

---

## Conclusion

These best practices were learned through implementing performance enhancements for Task Master. They represent real-world solutions to common problems and should be applied consistently across the codebase.

**Key Takeaways:**

1. **Test infrastructure is critical** - Invest in good testing tools
2. **Cache intelligently** - Cache reads, invalidate on writes
3. **Think cross-platform** - Windows is different from Unix
4. **Handle errors gracefully** - Retry transient failures
5. **Measure before optimizing** - Profile to find real bottlenecks

---

**Next Steps:**

1. Review this document before starting new features
2. Update with new patterns as they emerge
3. Share lessons learned with the team
4. Incorporate into code review checklist

---

*This is a living document. Please update it as you discover new patterns or encounter new challenges.*
