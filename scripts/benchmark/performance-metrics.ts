/**
 * @fileoverview Performance Metrics Collection Module for Task Master Benchmarking
 *
 * This module provides comprehensive performance metrics collection capabilities
 * for measuring and analyzing Task Master's file storage operations.
 */

/**
 * Represents a single timing measurement
 */
export interface TimingMeasurement {
	operation: string;
	duration: number;
	timestamp: number;
	metadata?: Record<string, any>;
}

/**
 * Represents a file I/O operation record
 */
export interface FileIORecord {
	operation: 'read' | 'write';
	path: string;
	timestamp: number;
	size?: number;
}

/**
 * Represents a memory snapshot
 */
export interface MemorySnapshot {
	timestamp: number;
	heapUsed: number;
	heapTotal: number;
	external: number;
	rss: number;
}

/**
 * Represents cache statistics
 */
export interface CacheStats {
	hits: number;
	misses: number;
	hitRate: number;
	missRate: number;
	totalOperations: number;
}

/**
 * Statistical summary of timing measurements
 */
export interface TimingStats {
	count: number;
	min: number;
	max: number;
	mean: number;
	median: number;
	p95: number;
	p99: number;
	stdDev: number;
}

/**
 * Complete performance report
 */
export interface PerformanceReport {
	duration: number;
	fileIO: {
		reads: number;
		writes: number;
		total: number;
	};
	timings: Record<string, TimingStats>;
	memory: {
		initial: MemorySnapshot;
		final: MemorySnapshot;
		peak: MemorySnapshot;
		samples: number;
	};
	cache: CacheStats;
}

/**
 * Performance Metrics Collection Class
 *
 * Provides methods to collect, analyze, and report on various performance metrics
 * including file I/O, operation timings, memory usage, and cache efficiency.
 */
export class PerformanceMetrics {
	private startTime: number = 0;
	private endTime: number = 0;
	private timings: TimingMeasurement[] = [];
	private fileIORecords: FileIORecord[] = [];
	private memorySnapshots: MemorySnapshot[] = [];
	private cacheHits: number = 0;
	private cacheMisses: number = 0;
	private isCollecting: boolean = false;
	private memoryInterval: NodeJS.Timeout | null = null;
	private readonly memoryIntervalMs: number;

	/**
	 * Create a new PerformanceMetrics collector
	 * @param memoryIntervalMs - Interval in milliseconds for automatic memory sampling (default: 100ms)
	 */
	constructor(memoryIntervalMs: number = 100) {
		this.memoryIntervalMs = memoryIntervalMs;
	}

	/**
	 * Start metrics collection
	 */
	start(): void {
		if (this.isCollecting) {
			throw new Error('Metrics collection already started');
		}

		this.isCollecting = true;
		this.startTime = Date.now();
		this.timings = [];
		this.fileIORecords = [];
		this.memorySnapshots = [];
		this.cacheHits = 0;
		this.cacheMisses = 0;

		// Take initial memory snapshot
		this.recordMemorySnapshot();

		// Start automatic memory sampling
		this.memoryInterval = setInterval(() => {
			this.recordMemorySnapshot();
		}, this.memoryIntervalMs);
	}

	/**
	 * Stop metrics collection
	 */
	stop(): void {
		if (!this.isCollecting) {
			throw new Error('Metrics collection not started');
		}

		this.endTime = Date.now();
		this.isCollecting = false;

		// Stop automatic memory sampling
		if (this.memoryInterval) {
			clearInterval(this.memoryInterval);
			this.memoryInterval = null;
		}

		// Take final memory snapshot
		this.recordMemorySnapshot();
	}

	/**
	 * Check if metrics collection is active
	 */
	isActive(): boolean {
		return this.isCollecting;
	}

	/**
	 * Record a timing measurement for an operation
	 * @param operation - Name of the operation
	 * @param duration - Duration in milliseconds
	 * @param metadata - Optional metadata about the operation
	 */
	recordTiming(operation: string, duration: number, metadata?: Record<string, any>): void {
		this.timings.push({
			operation,
			duration,
			timestamp: Date.now(),
			metadata
		});
	}

	/**
	 * Measure and record the execution time of a synchronous function
	 * @param operation - Name of the operation
	 * @param fn - Function to measure
	 * @param metadata - Optional metadata
	 * @returns Result of the function
	 */
	measure<T>(operation: string, fn: () => T, metadata?: Record<string, any>): T {
		const start = Date.now();
		try {
			const result = fn();
			const duration = Date.now() - start;
			this.recordTiming(operation, duration, metadata);
			return result;
		} catch (error) {
			const duration = Date.now() - start;
			this.recordTiming(operation, duration, { ...metadata, error: true });
			throw error;
		}
	}

	/**
	 * Measure and record the execution time of an async function
	 * @param operation - Name of the operation
	 * @param fn - Async function to measure
	 * @param metadata - Optional metadata
	 * @returns Promise with result of the function
	 */
	async measureAsync<T>(
		operation: string,
		fn: () => Promise<T>,
		metadata?: Record<string, any>
	): Promise<T> {
		const start = Date.now();
		try {
			const result = await fn();
			const duration = Date.now() - start;
			this.recordTiming(operation, duration, metadata);
			return result;
		} catch (error) {
			const duration = Date.now() - start;
			this.recordTiming(operation, duration, { ...metadata, error: true });
			throw error;
		}
	}

	/**
	 * Record a file I/O operation
	 * @param operation - Type of operation ('read' or 'write')
	 * @param path - File path
	 * @param size - Optional file size in bytes
	 */
	recordFileIO(operation: 'read' | 'write', path: string, size?: number): void {
		this.fileIORecords.push({
			operation,
			path,
			timestamp: Date.now(),
			size
		});
	}

	/**
	 * Record a memory snapshot
	 */
	recordMemorySnapshot(): void {
		const mem = process.memoryUsage();
		this.memorySnapshots.push({
			timestamp: Date.now(),
			heapUsed: mem.heapUsed,
			heapTotal: mem.heapTotal,
			external: mem.external,
			rss: mem.rss
		});
	}

	/**
	 * Record a cache hit
	 */
	recordCacheHit(): void {
		this.cacheHits++;
	}

	/**
	 * Record a cache miss
	 */
	recordCacheMiss(): void {
		this.cacheMisses++;
	}

	/**
	 * Calculate cache statistics
	 */
	getCacheStats(): CacheStats {
		const total = this.cacheHits + this.cacheMisses;
		return {
			hits: this.cacheHits,
			misses: this.cacheMisses,
			hitRate: total > 0 ? this.cacheHits / total : 0,
			missRate: total > 0 ? this.cacheMisses / total : 0,
			totalOperations: total
		};
	}

	/**
	 * Calculate statistical summary for a set of timing measurements
	 * @param measurements - Array of timing measurements
	 */
	private calculateTimingStats(measurements: TimingMeasurement[]): TimingStats {
		if (measurements.length === 0) {
			return {
				count: 0,
				min: 0,
				max: 0,
				mean: 0,
				median: 0,
				p95: 0,
				p99: 0,
				stdDev: 0
			};
		}

		const durations = measurements.map(m => m.duration).sort((a, b) => a - b);
		const count = durations.length;
		const sum = durations.reduce((acc, d) => acc + d, 0);
		const mean = sum / count;

		// Calculate standard deviation
		const squaredDiffs = durations.map(d => Math.pow(d - mean, 2));
		const variance = squaredDiffs.reduce((acc, d) => acc + d, 0) / count;
		const stdDev = Math.sqrt(variance);

		return {
			count,
			min: durations[0],
			max: durations[count - 1],
			mean,
			median: calculatePercentile(durations, 0.5),
			p95: calculatePercentile(durations, 0.95),
			p99: calculatePercentile(durations, 0.99),
			stdDev
		};
	}

	/**
	 * Generate a comprehensive performance report
	 */
	generateReport(): PerformanceReport {
		if (this.isCollecting) {
			throw new Error('Cannot generate report while collection is active. Call stop() first.');
		}

		// Group timings by operation
		const timingsByOperation = new Map<string, TimingMeasurement[]>();
		for (const timing of this.timings) {
			if (!timingsByOperation.has(timing.operation)) {
				timingsByOperation.set(timing.operation, []);
			}
			timingsByOperation.get(timing.operation)!.push(timing);
		}

		// Calculate stats for each operation
		const timings: Record<string, TimingStats> = {};
		for (const [operation, measurements] of timingsByOperation) {
			timings[operation] = this.calculateTimingStats(measurements);
		}

		// Calculate file I/O stats
		const reads = this.fileIORecords.filter(r => r.operation === 'read').length;
		const writes = this.fileIORecords.filter(r => r.operation === 'write').length;

		// Find peak memory usage
		const peakMemory = this.memorySnapshots.reduce((peak, snapshot) =>
			snapshot.heapUsed > peak.heapUsed ? snapshot : peak,
			this.memorySnapshots[0] || { timestamp: 0, heapUsed: 0, heapTotal: 0, external: 0, rss: 0 }
		);

		return {
			duration: this.endTime - this.startTime,
			fileIO: {
				reads,
				writes,
				total: reads + writes
			},
			timings,
			memory: {
				initial: this.memorySnapshots[0] || { timestamp: 0, heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
				final: this.memorySnapshots[this.memorySnapshots.length - 1] || { timestamp: 0, heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
				peak: peakMemory,
				samples: this.memorySnapshots.length
			},
			cache: this.getCacheStats()
		};
	}

	/**
	 * Export report as formatted text
	 */
	exportAsText(report: PerformanceReport): string {
		const lines: string[] = [];

		lines.push('='.repeat(80));
		lines.push('PERFORMANCE REPORT');
		lines.push('='.repeat(80));
		lines.push('');

		// Duration
		lines.push(`Total Duration: ${formatDuration(report.duration)}`);
		lines.push('');

		// File I/O
		lines.push('File I/O Operations:');
		lines.push(`  Reads:  ${report.fileIO.reads}`);
		lines.push(`  Writes: ${report.fileIO.writes}`);
		lines.push(`  Total:  ${report.fileIO.total}`);
		lines.push('');

		// Cache Stats
		lines.push('Cache Statistics:');
		lines.push(`  Hits:       ${report.cache.hits}`);
		lines.push(`  Misses:     ${report.cache.misses}`);
		lines.push(`  Hit Rate:   ${(report.cache.hitRate * 100).toFixed(2)}%`);
		lines.push(`  Miss Rate:  ${(report.cache.missRate * 100).toFixed(2)}%`);
		lines.push('');

		// Memory
		lines.push('Memory Usage:');
		lines.push(`  Initial Heap: ${formatBytes(report.memory.initial.heapUsed)}`);
		lines.push(`  Final Heap:   ${formatBytes(report.memory.final.heapUsed)}`);
		lines.push(`  Peak Heap:    ${formatBytes(report.memory.peak.heapUsed)}`);
		lines.push(`  Samples:      ${report.memory.samples}`);
		lines.push('');

		// Timings
		if (Object.keys(report.timings).length > 0) {
			lines.push('Operation Timings:');
			lines.push('');

			for (const [operation, stats] of Object.entries(report.timings)) {
				lines.push(`  ${operation}:`);
				lines.push(`    Count:  ${stats.count}`);
				lines.push(`    Min:    ${formatDuration(stats.min)}`);
				lines.push(`    Max:    ${formatDuration(stats.max)}`);
				lines.push(`    Mean:   ${formatDuration(stats.mean)}`);
				lines.push(`    Median: ${formatDuration(stats.median)}`);
				lines.push(`    P95:    ${formatDuration(stats.p95)}`);
				lines.push(`    P99:    ${formatDuration(stats.p99)}`);
				lines.push(`    StdDev: ${formatDuration(stats.stdDev)}`);
				lines.push('');
			}
		}

		lines.push('='.repeat(80));

		return lines.join('\n');
	}

	/**
	 * Export report as JSON
	 */
	exportAsJSON(report: PerformanceReport): string {
		return JSON.stringify(report, null, 2);
	}

	/**
	 * Reset all metrics (useful for running multiple benchmarks)
	 */
	reset(): void {
		if (this.isCollecting) {
			this.stop();
		}

		this.startTime = 0;
		this.endTime = 0;
		this.timings = [];
		this.fileIORecords = [];
		this.memorySnapshots = [];
		this.cacheHits = 0;
		this.cacheMisses = 0;
	}

	/**
	 * Get raw timing data for custom analysis
	 */
	getRawTimings(): TimingMeasurement[] {
		return [...this.timings];
	}

	/**
	 * Get raw file I/O data for custom analysis
	 */
	getRawFileIO(): FileIORecord[] {
		return [...this.fileIORecords];
	}

	/**
	 * Get raw memory snapshots for custom analysis
	 */
	getRawMemorySnapshots(): MemorySnapshot[] {
		return [...this.memorySnapshots];
	}
}

/**
 * Calculate percentile from sorted array
 * @param sortedArray - Array of numbers sorted in ascending order
 * @param percentile - Percentile to calculate (0-1)
 */
export function calculatePercentile(sortedArray: number[], percentile: number): number {
	if (sortedArray.length === 0) return 0;
	if (percentile <= 0) return sortedArray[0];
	if (percentile >= 1) return sortedArray[sortedArray.length - 1];

	const index = (sortedArray.length - 1) * percentile;
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const weight = index - lower;

	return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Format bytes as human-readable string
 * @param bytes - Number of bytes
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';

	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const k = 1024;
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format duration as human-readable string
 * @param ms - Duration in milliseconds
 */
export function formatDuration(ms: number): string {
	if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
	if (ms < 1000) return `${ms.toFixed(2)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Compare two performance reports
 * @param baseline - Baseline report
 * @param current - Current report
 */
export interface ComparisonResult {
	duration: {
		baseline: number;
		current: number;
		percentChange: number;
	};
	fileIO: {
		reads: { baseline: number; current: number; percentChange: number };
		writes: { baseline: number; current: number; percentChange: number };
		total: { baseline: number; current: number; percentChange: number };
	};
	cache: {
		hitRate: { baseline: number; current: number; percentChange: number };
	};
	timings: Record<string, {
		mean: { baseline: number; current: number; percentChange: number };
		p95: { baseline: number; current: number; percentChange: number };
	}>;
}

/**
 * Compare two performance reports
 */
export function compareReports(baseline: PerformanceReport, current: PerformanceReport): ComparisonResult {
	const percentChange = (base: number, curr: number): number => {
		if (base === 0) return curr === 0 ? 0 : 100;
		return ((curr - base) / base) * 100;
	};

	const result: ComparisonResult = {
		duration: {
			baseline: baseline.duration,
			current: current.duration,
			percentChange: percentChange(baseline.duration, current.duration)
		},
		fileIO: {
			reads: {
				baseline: baseline.fileIO.reads,
				current: current.fileIO.reads,
				percentChange: percentChange(baseline.fileIO.reads, current.fileIO.reads)
			},
			writes: {
				baseline: baseline.fileIO.writes,
				current: current.fileIO.writes,
				percentChange: percentChange(baseline.fileIO.writes, current.fileIO.writes)
			},
			total: {
				baseline: baseline.fileIO.total,
				current: current.fileIO.total,
				percentChange: percentChange(baseline.fileIO.total, current.fileIO.total)
			}
		},
		cache: {
			hitRate: {
				baseline: baseline.cache.hitRate,
				current: current.cache.hitRate,
				percentChange: percentChange(baseline.cache.hitRate, current.cache.hitRate)
			}
		},
		timings: {}
	};

	// Compare common operations
	for (const operation of Object.keys(baseline.timings)) {
		if (current.timings[operation]) {
			result.timings[operation] = {
				mean: {
					baseline: baseline.timings[operation].mean,
					current: current.timings[operation].mean,
					percentChange: percentChange(
						baseline.timings[operation].mean,
						current.timings[operation].mean
					)
				},
				p95: {
					baseline: baseline.timings[operation].p95,
					current: current.timings[operation].p95,
					percentChange: percentChange(
						baseline.timings[operation].p95,
						current.timings[operation].p95
					)
				}
			};
		}
	}

	return result;
}
