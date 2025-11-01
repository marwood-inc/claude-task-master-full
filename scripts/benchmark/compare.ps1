#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Compare baseline vs optimized performance

.DESCRIPTION
    Runs benchmarks with and without performance optimizations to measure improvement

.EXAMPLE
    .\scripts\benchmark\compare.ps1
    
.EXAMPLE
    .\scripts\benchmark\compare.ps1 -DatasetOnly
#>

param(
    [switch]$DatasetOnly,
    [switch]$WorkloadOnly
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "PERFORMANCE COMPARISON: Baseline vs Optimized" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Determine benchmark command
$benchmarkCmd = if ($DatasetOnly) {
    "npm run benchmark:dataset"
} elseif ($WorkloadOnly) {
    "npm run benchmark:workload"
} else {
    "npm run benchmark"
}

# Create comparison directory
$comparisonDir = "benchmark-results\comparison-$(Get-Date -Format 'yyyy-MM-ddTHH-mm-ss')"
New-Item -ItemType Directory -Path $comparisonDir -Force | Out-Null

Write-Host "Results will be saved to: $comparisonDir`n" -ForegroundColor Yellow

# Run baseline (optimizations disabled)
Write-Host "========================================" -ForegroundColor Green
Write-Host "PHASE 1: Running BASELINE benchmarks" -ForegroundColor Green
Write-Host "  - Cache: 100 entries, 5s TTL, 50MB" -ForegroundColor Gray
Write-Host "  - Task Index: DISABLED (O(n) search)" -ForegroundColor Gray
Write-Host "  - Write-Through Cache: DISABLED" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Green

$env:TM_DISABLE_OPTIMIZATIONS = "true"
try {
    Invoke-Expression $benchmarkCmd | Tee-Object -FilePath "$comparisonDir\baseline.txt"
} finally {
    Remove-Item Env:\TM_DISABLE_OPTIMIZATIONS
}

Write-Host "`n✓ Baseline complete`n" -ForegroundColor Green

# Run optimized
Write-Host "========================================" -ForegroundColor Blue
Write-Host "PHASE 2: Running OPTIMIZED benchmarks" -ForegroundColor Blue
Write-Host "  - Cache: 500 entries, 60s TTL, 100MB" -ForegroundColor Gray
Write-Host "  - Task Index: ENABLED (O(1) lookups)" -ForegroundColor Gray
Write-Host "  - Write-Through Cache: ENABLED" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Blue

Invoke-Expression $benchmarkCmd | Tee-Object -FilePath "$comparisonDir\optimized.txt"

Write-Host "`n✓ Optimized complete`n" -ForegroundColor Blue

# Generate comparison report
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "COMPARISON RESULTS" -ForegroundColor Magenta
Write-Host "========================================`n" -ForegroundColor Magenta

# Extract key metrics
function Extract-Metrics {
    param([string]$FilePath)
    
    $content = Get-Content $FilePath -Raw
    
    # Extract cache hit rates
    $cacheHits = @{}
    if ($content -match "CLI List Pattern.*?cache hit rate \((\d+\.\d+)%\)") {
        $cacheHits["CLI List"] = $matches[1]
    }
    if ($content -match "CLI Show Pattern.*?cache hit rate \((\d+\.\d+)%\)") {
        $cacheHits["CLI Show"] = $matches[1]
    }
    if ($content -match "MCP Mixed Pattern.*?cache hit rate \((\d+\.\d+)%\)") {
        $cacheHits["MCP Mixed"] = $matches[1]
    }
    
    # Extract throughput
    $throughput = @{}
    if ($content -match "Best Throughput:\s+\w+-\w+ \((\d+\.\d+) ops/sec\)") {
        $throughput["Best"] = $matches[1]
    }
    
    # Extract response times
    $responseTime = @{}
    if ($content -match "Best Response Time:\s+\w+-\w+ \((\d+\.\d+)ms\)") {
        $responseTime["Best"] = $matches[1]
    }
    
    return @{
        CacheHits = $cacheHits
        Throughput = $throughput
        ResponseTime = $responseTime
    }
}

$baselineMetrics = Extract-Metrics "$comparisonDir\baseline.txt"
$optimizedMetrics = Extract-Metrics "$comparisonDir\optimized.txt"

# Display comparison
Write-Host "Cache Hit Rates:" -ForegroundColor Yellow
foreach ($pattern in $baselineMetrics.CacheHits.Keys) {
    $baseline = [double]$baselineMetrics.CacheHits[$pattern]
    $optimized = [double]$optimizedMetrics.CacheHits[$pattern]
    $improvement = $optimized - $baseline
    
    Write-Host "  $pattern" -NoNewline
    Write-Host "`t$baseline%" -NoNewline -ForegroundColor Red
    Write-Host " → " -NoNewline
    Write-Host "$optimized%" -NoNewline -ForegroundColor Green
    Write-Host " (+$($improvement)%)" -ForegroundColor Cyan
}

Write-Host "`nThroughput:" -ForegroundColor Yellow
if ($baselineMetrics.Throughput.Best -and $optimizedMetrics.Throughput.Best) {
    $baseline = [double]$baselineMetrics.Throughput.Best
    $optimized = [double]$optimizedMetrics.Throughput.Best
    $improvement = (($optimized - $baseline) / $baseline * 100).ToString("F1")
    
    Write-Host "  Best: " -NoNewline
    Write-Host "$baseline ops/sec" -NoNewline -ForegroundColor Red
    Write-Host " → " -NoNewline
    Write-Host "$optimized ops/sec" -NoNewline -ForegroundColor Green
    Write-Host " (+$improvement%)" -ForegroundColor Cyan
}

Write-Host "`nResponse Time:" -ForegroundColor Yellow
if ($baselineMetrics.ResponseTime.Best -and $optimizedMetrics.ResponseTime.Best) {
    $baseline = [double]$baselineMetrics.ResponseTime.Best
    $optimized = [double]$optimizedMetrics.ResponseTime.Best
    $improvement = (($baseline - $optimized) / $baseline * 100).ToString("F1")
    
    Write-Host "  Best: " -NoNewline
    Write-Host "$($baseline)ms" -NoNewline -ForegroundColor Red
    Write-Host " → " -NoNewline
    Write-Host "$($optimized)ms" -NoNewline -ForegroundColor Green
    Write-Host " (-$improvement%)" -ForegroundColor Cyan
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "Full results saved to:" -ForegroundColor White
Write-Host "  Baseline:  $comparisonDir\baseline.txt" -ForegroundColor Gray
Write-Host "  Optimized: $comparisonDir\optimized.txt" -ForegroundColor Gray
Write-Host "`nTo view side-by-side:" -ForegroundColor White
Write-Host "  code --diff $comparisonDir\baseline.txt $comparisonDir\optimized.txt" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor Magenta
