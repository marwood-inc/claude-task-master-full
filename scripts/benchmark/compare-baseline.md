# Performance Comparison: Before vs After Caching Optimizations

## How to Run Baseline Comparison

### Option 1: Temporarily Disable Optimizations (Quick)

1. **Edit `file-storage.ts` to disable optimizations:**
   ```typescript
   // Temporarily change these values:
   private readonly CACHE_TTL = 5000; // Change from 60000 back to 5000
   
   // In createDefaultCache():
   max: 100,              // Change from 500 back to 100
   maxSize: 50_000_000,   // Change from 100_000_000 back to 50_000_000
   
   // Comment out task index:
   // private taskIndex: Map<string, TaskIndexEntry> = new Map();
   // Comment out all index-related code in loadSingleTask(), saveTasks(), etc.
   
   // In saveTasks(), use cache invalidation instead of write-through:
   this.taskCache.delete(cacheKey); // Instead of this.taskCache.set(...)
   ```

2. **Run baseline benchmark:**
   ```bash
   npm run benchmark -- --dataset-only > benchmark-baseline.txt
   ```

3. **Restore optimizations and run comparison:**
   ```bash
   # Revert file-storage.ts changes
   npm run benchmark -- --dataset-only > benchmark-optimized.txt
   ```

4. **Compare results:**
   ```bash
   # View side-by-side
   code --diff benchmark-baseline.txt benchmark-optimized.txt
   ```

### Option 2: Use Git Worktree (More Thorough)

1. **Create a worktree for baseline testing:**
   ```bash
   git worktree add ../baseline-test 34bee032
   cd ../baseline-test
   npm install
   
   # Copy your benchmark scripts
   cp -r ../chore/performance-enhancements/scripts/benchmark .
   # Add benchmark scripts to package.json
   ```

2. **Run baseline there, optimized version in main worktree**

### Option 3: Feature Flag (Recommended for Future)

Add a config option to toggle optimizations:

```typescript
// file-storage.ts
private readonly USE_OPTIMIZATIONS = process.env.TM_NO_CACHE !== 'true';

// Then conditionally enable features
if (this.USE_OPTIMIZATIONS) {
  // Use task index
  // Use write-through caching
  // Use larger cache
} else {
  // Use baseline settings
}
```

Then run:
```bash
TM_NO_CACHE=true npm run benchmark > baseline.txt
npm run benchmark > optimized.txt
```

## Expected Improvements

Based on your optimizations:

### Cache Configuration
- **CACHE_TTL**: 5s → 60s (12x increase)
- **Max entries**: 100 → 500 (5x increase)
- **Max memory**: 50MB → 100MB (2x increase)

### Architecture Changes
- **Task Index**: O(n) findIndex → O(1) Map lookup
- **Write-Through Caching**: Invalidation → Update on write
- **Pagination**: Added limit/offset support

### Expected Results
- **Cache hit rate**: 0-20% → 94-99%
- **LoadAllTasks**: Should see massive improvement on large datasets
- **LoadSingleTask**: 71.9% speedup with index
- **Throughput**: Should be 3-10x higher
