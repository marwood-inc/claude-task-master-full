# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

## Test Guidelines

### Test File Placement

- **Package & tests**: Place in `packages/<package-name>/src/<module>/<file>.spec.ts` or `apps/<app-name>/src/<module>/<file.spec.ts>` alongside source
- **Package integration tests**: Place in `packages/<package-name>/tests/integration/<module>/<file>.test.ts` or `apps/<app-name>/tests/integration/<module>/<file>.test.ts` alongside source
- **Isolated unit tests**: Use `tests/unit/packages/<package-name>/` only when parallel placement isn't possible
- **Test extension**: Always use `.ts` for TypeScript tests, never `.js`

### Synchronous Tests
- **NEVER use async/await in test functions** unless testing actual asynchronous operations
- Use synchronous top-level imports instead of dynamic `await import()`
- Test bodies should be synchronous whenever possible
- Example:
  ```typescript
  // ✅ CORRECT - Synchronous imports with .ts extension
  import { MyClass } from '../src/my-class.js';

  it('should verify behavior', () => {
    expect(new MyClass().property).toBe(value);
  });

  // ❌ INCORRECT - Async imports
  it('should verify behavior', async () => {
    const { MyClass } = await import('../src/my-class.js');
    expect(new MyClass().property).toBe(value);
  });
  ```

### Test Best Practices

#### Mock Infrastructure
- **Centralize mocks** in `tests/test-helpers/` for reusability
- **Use vi.fn()** for all mock methods to enable call tracking
- **Mock constructors properly** with vi.fn().mockImplementation()
- Example:
  ```typescript
  // tests/test-helpers/mock-registry.ts
  export class MockConfigLoader {
    loadLocalConfig = vi.fn();
    loadGlobalConfig = vi.fn();
  }
  
  vi.mock('./config-loader.service.js', () => ({
    ConfigLoader: MockConfigLoader
  }));
  ```

#### Fake Timers
- **ALWAYS use vi.useFakeTimers()** for time-based tests (TTL, timeouts, debouncing)
- Clean up with vi.useRealTimers() in afterEach()
- Example:
  ```typescript
  describe('Cache TTL', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    
    it('expires after TTL', async () => {
      await cache.set('key', 'value', 5000);
      vi.advanceTimersByTime(6000);
      expect(await cache.get('key')).toBeUndefined();
    });
  });
  ```

#### Test Data
- **Use minimal datasets** (10-20 items) to prove behavior
- **Separate performance tests** from correctness tests
- **Clean up after each test** with afterEach() hooks

#### Cross-Platform Testing
- **Test on Windows and Unix** for path handling
- **Use path.normalize()** from Node.js for consistency
- **Remove platform-specific prefixes** (Windows drive letters) early

## Performance Guidelines

### Caching
- **Cache read-heavy operations** with proper invalidation
- **Include context in cache keys**: `tasks:${tag}:${project}`
- **Invalidate on writes** to maintain consistency
- **Don't cache empty results** unless intentional

### File Operations
- **Use async/await** for all I/O operations
- **Batch parallel operations** with Promise.all()
- **Implement retry logic** for transient errors (EPERM, ENOENT)
- **Use exponential backoff** for retries

### Error Handling
- **Create domain-specific error classes** for better debugging
- **Include context** in error messages
- **Implement retry strategies** for transient failures
- Example:
  ```typescript
  export class WorkflowValidationError extends TaskMasterError {
    constructor(
      message: string,
      public readonly phase: WorkflowPhase,
      public readonly failures: ValidationFailure[]
    ) {
      super(message, 'WORKFLOW_VALIDATION_ERROR', { phase, failures });
    }
  }
  ```

## Architecture Guidelines

### Business Logic Separation

**CRITICAL RULE**: ALL business logic must live in `@tm/core`, NOT in presentation layers.

- **`@tm/core`** (packages/tm-core/):
  - Contains ALL business logic, domain models, services, and utilities
  - Provides clean facade APIs through domain objects (tasks, auth, workflow, git, config)
  - Houses all complexity - parsing, validation, transformations, calculations, etc.
  - Example: Task ID parsing, subtask extraction, status validation, dependency resolution

- **`@tm/cli`** (apps/cli/):
  - Thin presentation layer ONLY
  - Calls tm-core methods and displays results
  - Handles CLI-specific concerns: argument parsing, output formatting, user prompts
  - NO business logic, NO data transformations, NO calculations

- **`@tm/mcp`** (apps/mcp/):
  - Thin presentation layer ONLY
  - Calls tm-core methods and returns MCP-formatted responses
  - Handles MCP-specific concerns: tool schemas, parameter validation, response formatting
  - NO business logic, NO data transformations, NO calculations

- **`apps/extension`** (future):
  - Thin presentation layer ONLY
  - Calls tm-core methods and displays in VS Code UI
  - NO business logic

**Examples of violations to avoid:**

- ❌ Creating helper functions in CLI/MCP to parse task IDs → Move to tm-core
- ❌ Data transformation logic in CLI/MCP → Move to tm-core
- ❌ Validation logic in CLI/MCP → Move to tm-core
- ❌ Duplicating logic across CLI and MCP → Implement once in tm-core

**Correct approach:**
- ✅ Add method to TasksDomain: `tasks.get(taskId)` (automatically handles task and subtask IDs)
- ✅ CLI calls: `await tmCore.tasks.get(taskId)` (supports "1", "1.2", "HAM-123", "HAM-123.2")
- ✅ MCP calls: `await tmCore.tasks.get(taskId)` (same intelligent ID parsing)
- ✅ Single source of truth in tm-core

## Documentation Guidelines

- **Documentation location**: Write docs in `apps/docs/` (Mintlify site source), not `docs/`
- **Documentation URL**: Reference docs at https://docs.task-master.dev, not local file paths

## Changeset Guidelines

- When creating changesets, remember that it's user-facing, meaning we don't have to get into the specifics of the code, but rather mention what the end-user is getting or fixing from this changeset.