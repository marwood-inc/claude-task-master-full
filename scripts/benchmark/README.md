# Task Master Performance Benchmark Suite

Comprehensive benchmarking tools to measure and validate performance improvements across different dataset sizes and workload patterns.

## Overview

This suite provides three main components:

1. **Performance Metrics Collection** - Core metrics gathering infrastructure
2. **Dataset Size Testing** - Performance analysis across different data scales
3. **Workload Simulation** - Realistic usage pattern testing

## Quick Start

```bash
# Run all benchmarks
npm run benchmark

# Run only dataset size tests
npm run benchmark:dataset

# Run only workload simulations
npm run benchmark:workload
```

## Components

### 1. Performance Metrics (`performance-metrics.ts`)

Core module for collecting performance data:

- **Timing measurements** with statistical analysis (min, max, mean, median, p95, p99, stdDev)
- **File I/O tracking** (read/write operation counts)
- **Memory monitoring** with automatic snapshots
- **Cache statistics** (hit/miss ratios)
- **Report generation** (text and JSON formats)

**Usage Example:**

```typescript
import { PerformanceMetrics } from './performance-metrics.js';

const metrics = new PerformanceMetrics();
metrics.start();

// Measure operations
await metrics.measureAsync('loadTasks', async () => {
  return await storage.loadTasks();
});

metrics.stop();
const report = metrics.generateReport();
console.log(metrics.exportAsText(report));
```

### 2. Dataset Size Testing (`dataset-size-tester.ts`)

Tests performance across different dataset sizes:

- **Small**: 10 tasks with 3 subtasks (40 items)
- **Medium**: 100 tasks with 5 subtasks (600 items)
- **Large**: 500 tasks with 7 subtasks (4,000 items)
- **Extra-large**: 1000 tasks with 10 subtasks (11,000 items)

**Features:**
- Scalability analysis
- Performance degradation detection
- Automated optimization recommendations

**Usage Example:**

```typescript
import { DatasetSizeTester } from './dataset-size-tester.js';

const tester = new DatasetSizeTester('./test-data');
const report = await tester.runComparisonTests(
  ['small', 'medium', 'large'],
  10,  // test iterations
  3    // warmup iterations
);

console.log(tester.formatComparisonReport(report));
```

### 3. Workload Simulation (`workload-simulator.ts`)

Simulates real-world usage patterns:

**Patterns:**
- **CLI List** - Repeated `task-master list` commands (80% list, 15% show, 5% update)
- **CLI Show** - Frequent `task-master show <id>` (20% list, 70% show, 10% update)
- **CLI Update** - Active development (30% list, 20% show, 40% update, 10% save)
- **MCP Mixed** - Balanced MCP operations (40% list, 40% show, 15% update, 5% save)
- **Heavy Read** - Analysis workload (60% list, 40% show)
- **Heavy Write** - Rapid updates (10% list, 10% show, 60% update, 20% save)

**Usage Example:**

```typescript
import { WorkloadSimulator } from './workload-simulator.js';

const simulator = new WorkloadSimulator('./test-data');
const report = await simulator.runWorkloadComparison(
  ['cli-list', 'mcp-mixed', 'heavy-read'],
  5000,    // 5 seconds per pattern
  'medium' // dataset size
);

console.log(simulator.formatComparisonReport(report));
```

### 4. Dataset Generation (`dataset-generator.ts`)

Generates synthetic task datasets with realistic properties:

- Random task titles, descriptions, and content
- Weighted status and priority distributions
- Task dependencies (20% have dependencies)
- Complexity scores
- Subtask generation with dependencies

**Usage Example:**

```typescript
import { generateDatasetBySize, calculateDatasetStats } from './dataset-generator.js';

const tasks = generateDatasetBySize('medium');
const stats = calculateDatasetStats(tasks);
console.log(formatDatasetStats(stats));
```

## Metrics Measured

### Operation Metrics
- **loadTasks()** - Load all tasks performance
- **loadTask()** - Single task retrieval (regular tasks and subtasks)
- **saveTasks()** - Write performance

### System Metrics
- **File I/O** - Read/write operation counts
- **Memory** - Heap usage, peak memory, growth
- **Cache** - Hit/miss ratios, effectiveness

### Statistical Analysis
- Count, Min, Max, Mean, Median
- P95, P99 percentiles
- Standard deviation

## Performance Targets

Based on the test strategy from the main task:

- **70%+ reduction** in file I/O operations (with caching)
- **50%+ faster** single task retrieval (with optimization)
- **90%+ latency reduction** for cached reads

## Output

### JSON Reports
Complete machine-readable results with all metrics and statistics.

```json
{
  "duration": 1234,
  "fileIO": { "reads": 10, "writes": 2, "total": 12 },
  "cache": { "hits": 8, "misses": 2, "hitRate": 0.8 },
  "timings": {
    "loadTasks": {
      "count": 10,
      "mean": 45.2,
      "p95": 89.5,
      ...
    }
  }
}
```

### Text Reports
Human-readable formatted output with recommendations.

```
================================================================================
PERFORMANCE REPORT
================================================================================

Total Duration: 1.23s

File I/O Operations:
  Reads:  10
  Writes: 2
  Total:  12

Cache Statistics:
  Hits:       8
  Misses:     2
  Hit Rate:   80.00%

...
```

## Directory Structure

```
scripts/benchmark/
├── index.ts                      # Main entry point
├── performance-metrics.ts        # Core metrics collection
├── performance-metrics.spec.ts   # Metrics tests
├── dataset-generator.ts          # Synthetic data generation
├── dataset-generator.spec.ts     # Generator tests
├── dataset-size-tester.ts        # Dataset size testing framework
├── workload-simulator.ts         # Workload simulation suite
└── README.md                     # This file
```

## Integration with CI/CD

The benchmark suite can be integrated into CI/CD pipelines to detect performance regressions:

```yaml
# Example GitHub Actions workflow
- name: Run Performance Benchmarks
  run: npm run benchmark

- name: Check Performance Thresholds
  run: node scripts/check-performance-thresholds.js
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run benchmark tests only
npm test scripts/benchmark/*.spec.ts
```

### Adding New Metrics

1. Add metric collection in `PerformanceMetrics` class
2. Update `PerformanceReport` interface
3. Add formatting logic in `exportAsText()`
4. Update comparison logic if needed

### Adding New Workload Patterns

1. Add pattern configuration to `WORKLOAD_PATTERNS`
2. Define operation percentages
3. Run with `WorkloadSimulator`

## Best Practices

1. **Warmup iterations** - Always use warmup to stabilize JIT compilation
2. **Multiple iterations** - Run at least 10 iterations for statistical validity
3. **Isolated environment** - Run benchmarks on dedicated hardware
4. **Consistent conditions** - Same Node.js version, system load, etc.
5. **Baseline measurement** - Establish baseline before optimizations

## Troubleshooting

### High variance in results
- Increase warmup iterations
- Run more test iterations
- Check system load
- Close background applications

### Memory issues with large datasets
- Use streaming for extra-large datasets
- Reduce test iterations
- Monitor memory growth

### File I/O bottlenecks
- Check disk performance
- Use SSD for test data
- Consider RAM disk for extreme cases

## License

Same as the main Task Master project.
