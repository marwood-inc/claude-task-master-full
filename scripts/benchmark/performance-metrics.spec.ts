/**
 * @fileoverview Tests for Performance Metrics Collection Module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	PerformanceMetrics,
	calculatePercentile,
	formatBytes,
	formatDuration,
	compareReports,
	type PerformanceReport
} from './performance-metrics.js';

describe('PerformanceMetrics', () => {
	let metrics: PerformanceMetrics;

	beforeEach(() => {
		metrics = new PerformanceMetrics(50); // 50ms interval for faster tests
	});

	afterEach(() => {
		if (metrics.isActive()) {
			metrics.stop();
		}
	});

	describe('lifecycle', () => {
		it('should start metrics collection', () => {
			metrics.start();
			expect(metrics.isActive()).toBe(true);
		});

		it('should stop metrics collection', () => {
			metrics.start();
			metrics.stop();
			expect(metrics.isActive()).toBe(false);
		});

		it('should throw error when starting twice', () => {
			metrics.start();
			expect(() => metrics.start()).toThrow('already started');
		});

		it('should throw error when stopping without starting', () => {
			expect(() => metrics.stop()).toThrow('not started');
		});

		it('should throw error when generating report while collecting', () => {
			metrics.start();
			expect(() => metrics.generateReport()).toThrow('while collection is active');
		});
	});

	describe('timing measurements', () => {
		it('should record timing measurements', () => {
			metrics.start();
			metrics.recordTiming('test-operation', 100);
			metrics.recordTiming('test-operation', 200);
			metrics.stop();

			const report = metrics.generateReport();
			expect(report.timings['test-operation'].count).toBe(2);
			expect(report.timings['test-operation'].min).toBe(100);
			expect(report.timings['test-operation'].max).toBe(200);
		});

		it('should measure synchronous functions', () => {
			metrics.start();
			const result = metrics.measure('sync-test', () => {
				return 42;
			});
			metrics.stop();

			expect(result).toBe(42);
			const report = metrics.generateReport();
			expect(report.timings['sync-test'].count).toBe(1);
		});

		it('should measure async functions', async () => {
			metrics.start();
			const result = await metrics.measureAsync('async-test', async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
				return 'done';
			});
			metrics.stop();

			expect(result).toBe('done');
			const report = metrics.generateReport();
			expect(report.timings['async-test'].count).toBe(1);
			expect(report.timings['async-test'].mean).toBeGreaterThanOrEqual(10);
		});

		it('should record timing even when function throws', () => {
			metrics.start();
			expect(() => {
				metrics.measure('error-test', () => {
					throw new Error('test error');
				});
			}).toThrow('test error');
			metrics.stop();

			const report = metrics.generateReport();
			expect(report.timings['error-test'].count).toBe(1);
		});
	});

	describe('file I/O tracking', () => {
		it('should record file I/O operations', () => {
			metrics.start();
			metrics.recordFileIO('read', '/path/to/file.json', 1024);
			metrics.recordFileIO('write', '/path/to/file.json', 2048);
			metrics.recordFileIO('read', '/path/to/other.json');
			metrics.stop();

			const report = metrics.generateReport();
			expect(report.fileIO.reads).toBe(2);
			expect(report.fileIO.writes).toBe(1);
			expect(report.fileIO.total).toBe(3);
		});
	});

	describe('cache statistics', () => {
		it('should track cache hits and misses', () => {
			metrics.start();
			metrics.recordCacheHit();
			metrics.recordCacheHit();
			metrics.recordCacheMiss();
			metrics.stop();

			const report = metrics.generateReport();
			expect(report.cache.hits).toBe(2);
			expect(report.cache.misses).toBe(1);
			expect(report.cache.hitRate).toBeCloseTo(0.6667, 4);
			expect(report.cache.missRate).toBeCloseTo(0.3333, 4);
		});

		it('should handle zero cache operations', () => {
			metrics.start();
			metrics.stop();

			const report = metrics.generateReport();
			expect(report.cache.hits).toBe(0);
			expect(report.cache.misses).toBe(0);
			expect(report.cache.hitRate).toBe(0);
			expect(report.cache.missRate).toBe(0);
		});
	});

	describe('memory tracking', () => {
		it('should record memory snapshots', async () => {
			metrics.start();
			await new Promise(resolve => setTimeout(resolve, 150)); // Wait for at least 3 samples
			metrics.stop();

			const report = metrics.generateReport();
			expect(report.memory.samples).toBeGreaterThanOrEqual(3);
			expect(report.memory.initial.heapUsed).toBeGreaterThan(0);
			expect(report.memory.final.heapUsed).toBeGreaterThan(0);
			expect(report.memory.peak.heapUsed).toBeGreaterThan(0);
		});
	});

	describe('report generation', () => {
		it('should generate complete performance report', () => {
			metrics.start();
			metrics.recordTiming('operation1', 100);
			metrics.recordFileIO('read', '/test.json');
			metrics.recordCacheHit();
			metrics.stop();

			const report = metrics.generateReport();

			expect(report.duration).toBeGreaterThanOrEqual(0);
			expect(report.fileIO.total).toBe(1);
			expect(report.cache.totalOperations).toBe(1);
			expect(Object.keys(report.timings)).toContain('operation1');
		});

		it('should export report as text', () => {
			metrics.start();
			metrics.recordTiming('test', 50);
			metrics.stop();

			const report = metrics.generateReport();
			const text = metrics.exportAsText(report);

			expect(text).toContain('PERFORMANCE REPORT');
			expect(text).toContain('File I/O Operations');
			expect(text).toContain('Cache Statistics');
			expect(text).toContain('Memory Usage');
			expect(text).toContain('Operation Timings');
		});

		it('should export report as JSON', () => {
			metrics.start();
			metrics.recordTiming('test', 50);
			metrics.stop();

			const report = metrics.generateReport();
			const json = metrics.exportAsJSON(report);
			const parsed = JSON.parse(json);

			expect(parsed.duration).toBeDefined();
			expect(parsed.fileIO).toBeDefined();
			expect(parsed.timings).toBeDefined();
		});
	});

	describe('reset functionality', () => {
		it('should reset all metrics', () => {
			metrics.start();
			metrics.recordTiming('test', 100);
			metrics.recordFileIO('read', '/test.json');
			metrics.recordCacheHit();
			metrics.stop();

			metrics.reset();
			metrics.start();
			metrics.stop();

			const report = metrics.generateReport();
			expect(report.fileIO.total).toBe(0);
			expect(report.cache.totalOperations).toBe(0);
			expect(Object.keys(report.timings).length).toBe(0);
		});
	});

	describe('raw data access', () => {
		it('should provide raw timing data', () => {
			metrics.start();
			metrics.recordTiming('test', 100, { foo: 'bar' });
			metrics.stop();

			const timings = metrics.getRawTimings();
			expect(timings).toHaveLength(1);
			expect(timings[0].operation).toBe('test');
			expect(timings[0].duration).toBe(100);
			expect(timings[0].metadata).toEqual({ foo: 'bar' });
		});

		it('should provide raw file I/O data', () => {
			metrics.start();
			metrics.recordFileIO('read', '/test.json', 1024);
			metrics.stop();

			const fileIO = metrics.getRawFileIO();
			expect(fileIO).toHaveLength(1);
			expect(fileIO[0].operation).toBe('read');
			expect(fileIO[0].path).toBe('/test.json');
			expect(fileIO[0].size).toBe(1024);
		});

		it('should provide raw memory snapshots', () => {
			metrics.start();
			metrics.recordMemorySnapshot();
			metrics.stop();

			const snapshots = metrics.getRawMemorySnapshots();
			expect(snapshots.length).toBeGreaterThan(0);
			expect(snapshots[0].heapUsed).toBeGreaterThan(0);
		});
	});
});

describe('utility functions', () => {
	describe('calculatePercentile', () => {
		it('should calculate percentiles correctly', () => {
			const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			expect(calculatePercentile(data, 0.5)).toBe(5.5);
			expect(calculatePercentile(data, 0.95)).toBe(9.55);
			expect(calculatePercentile(data, 0.99)).toBe(9.91);
		});

		it('should handle edge cases', () => {
			expect(calculatePercentile([], 0.5)).toBe(0);
			expect(calculatePercentile([5], 0.5)).toBe(5);
			expect(calculatePercentile([1, 2, 3], 0)).toBe(1);
			expect(calculatePercentile([1, 2, 3], 1)).toBe(3);
		});
	});

	describe('formatBytes', () => {
		it('should format bytes correctly', () => {
			expect(formatBytes(0)).toBe('0 B');
			expect(formatBytes(1024)).toBe('1.00 KB');
			expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
			expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
		});
	});

	describe('formatDuration', () => {
		it('should format duration correctly', () => {
			expect(formatDuration(0.5)).toBe('500.00μs');
			expect(formatDuration(50)).toBe('50.00ms');
			expect(formatDuration(5000)).toBe('5.00s');
		});
	});

	describe('compareReports', () => {
		it('should compare two reports correctly', () => {
			const baseline: PerformanceReport = {
				duration: 1000,
				fileIO: { reads: 10, writes: 5, total: 15 },
				timings: {
					'loadTasks': {
						count: 10,
						min: 50,
						max: 100,
						mean: 75,
						median: 75,
						p95: 95,
						p99: 99,
						stdDev: 10
					}
				},
				memory: {
					initial: { timestamp: 0, heapUsed: 1000000, heapTotal: 2000000, external: 0, rss: 5000000 },
					final: { timestamp: 1000, heapUsed: 1500000, heapTotal: 2000000, external: 0, rss: 5500000 },
					peak: { timestamp: 500, heapUsed: 1800000, heapTotal: 2000000, external: 0, rss: 6000000 },
					samples: 10
				},
				cache: { hits: 80, misses: 20, hitRate: 0.8, missRate: 0.2, totalOperations: 100 }
			};

			const current: PerformanceReport = {
				duration: 500,
				fileIO: { reads: 3, writes: 2, total: 5 },
				timings: {
					'loadTasks': {
						count: 10,
						min: 25,
						max: 50,
						mean: 37.5,
						median: 37.5,
						p95: 47.5,
						p99: 49.5,
						stdDev: 5
					}
				},
				memory: {
					initial: { timestamp: 0, heapUsed: 1000000, heapTotal: 2000000, external: 0, rss: 5000000 },
					final: { timestamp: 500, heapUsed: 1200000, heapTotal: 2000000, external: 0, rss: 5200000 },
					peak: { timestamp: 250, heapUsed: 1400000, heapTotal: 2000000, external: 0, rss: 5400000 },
					samples: 5
				},
				cache: { hits: 95, misses: 5, hitRate: 0.95, missRate: 0.05, totalOperations: 100 }
			};

			const comparison = compareReports(baseline, current);

			expect(comparison.duration.percentChange).toBeCloseTo(-50, 1);
			expect(comparison.fileIO.total.percentChange).toBeCloseTo(-66.67, 1);
			expect(comparison.cache.hitRate.percentChange).toBeCloseTo(18.75, 1);
			expect(comparison.timings['loadTasks'].mean.percentChange).toBeCloseTo(-50, 1);
		});
	});
});
