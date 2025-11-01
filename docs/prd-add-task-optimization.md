# Product Requirements Document: Add-Task Performance Optimization

<context>
## Overview
The current `add-task` command in Task Master experiences significant latency (15-35 seconds) when creating tasks via the MCP server, primarily due to extensive context gathering and large AI API payloads (118K+ input tokens). This PRD outlines optimizations to reduce task creation time to under 5 seconds while maintaining intelligent task generation quality.

### Problem Statement
Users experience frustrating delays when creating tasks through the MCP interface, with the first attempt often appearing to hang, leading to duplicate task creation. Performance analysis reveals three main bottlenecks:
1. **Context Gathering** (~2-5 seconds): Semantic search and dependency graph building for all tasks
2. **Large AI Payloads** (~10-25 seconds): 118K input tokens sent to Claude Sonnet API
3. **Inefficient Model Selection** (~10-15 seconds): Using expensive models for simple tasks

### Success Metrics
- Task creation time reduced from 15-35s to under 5s (85% improvement)
- Token usage reduced by 70% (118K → ~35K tokens)
- Maintain or improve task generation quality
- Zero breaking changes to existing functionality

## Core Features

### 1. Smart Context Gathering
**What it does:** Intelligently reduces context collection based on task list size and complexity

**Why it's important:** Context gathering accounts for 15-30% of total latency and often collects unnecessary data

**How it works:**
- Skip semantic search for task lists < 50 items
- Only gather context for direct dependencies, not full dependency graphs
- Implement lazy loading of task complexity data
- Cache frequently accessed context between requests

### 2. Adaptive Model Selection
**What it does:** Automatically selects the optimal AI model based on task complexity

**Why it's important:** Using Claude Sonnet for simple tasks wastes 10-15 seconds when Haiku would suffice

**How it works:**
- Use Claude Haiku (fast, cheap) for tasks without `--research` flag
- Use Claude Sonnet only when explicitly requested
- Implement token budget limits to prevent oversized prompts
- Add fast-path for manual task creation (skip AI entirely)

### 3. Prompt Optimization
**What it does:** Reduces token usage through smarter prompt construction

**Why it's important:** Smaller prompts mean faster API responses and lower costs

**How it works:**
- Summarize large context instead of including verbatim
- Remove redundant task information
- Implement progressive context loading (start small, expand if needed)
- Use structured data formats instead of verbose descriptions

### 4. Response Streaming
**What it does:** Provides immediate feedback while AI generates task details

**Why it's important:** Improves perceived performance and prevents timeout confusion

**How it works:**
- Stream partial task data as it's generated
- Display progress indicators for each phase
- Allow cancellation of in-progress generation
- Cache intermediate results

### 5. Background Processing
**What it does:** Returns task ID immediately, enriches details in background

**Why it's important:** Unblocks user workflow while maintaining data quality

**How it works:**
- Create minimal task immediately with basic details
- Queue AI enrichment (implementation details, test strategy)
- Notify when enrichment completes
- Provide option to skip enrichment entirely

## User Experience

### User Personas
1. **CLI Power User:** Wants fast task creation, willing to trade some AI features for speed
2. **MCP Integration User:** Expects responsive interface, gets frustrated by delays
3. **Team Lead:** Needs batch task creation, values consistency over individual task optimization

### Key User Flows

#### Fast Path (New Default)
```
1. User: "Add task: Fix login bug"
2. System: Creates minimal task immediately (<1s)
3. System: Displays task ID and basic info
4. Background: Enriches details with AI (5-10s)
5. System: Notifies when enrichment complete
```

#### Detailed Path (Opt-in)
```
1. User: "Add task --research: Implement OAuth"
2. System: Displays "Gathering context..."
3. System: Shows progress bar for AI generation
4. System: Streams task details as generated
5. System: Complete task created (8-12s)
```

#### Manual Path (Zero AI)
```
1. User: "Add task --title='Fix bug' --description='...'"
2. System: Creates task from provided data (<0.5s)
3. Done - no AI involved
```

### UI/UX Considerations
- Clear progress indicators for each phase
- Ability to cancel long-running operations
- Smart defaults that optimize for speed
- Options to customize speed vs. quality tradeoff
- Telemetry display shows actual time breakdown

</context>

<PRD>
## Technical Architecture

### System Components

#### 1. Context Gatherer Optimizer
**Location:** `scripts/modules/utils/contextGatherer.js`

**Enhancements:**
- Add `smartMode` option that analyzes task list size
- Implement context budget limits (max tokens)
- Cache dependency graphs for reuse
- Lazy load complexity reports only when needed

**Configuration:**
```javascript
{
  enableSmartContext: true,
  contextBudgetTokens: 10000,
  skipSemanticSearchThreshold: 50,
  cacheContextMinutes: 5
}
```

#### 2. Model Selection Service
**Location:** `scripts/modules/ai-services-unified.js`

**New Component:**
```javascript
class ModelSelector {
  selectModel(options) {
    if (options.research) return 'claude-sonnet-4';
    if (options.tokenBudget > 50000) return 'claude-sonnet-4';
    if (options.contextSize > 20) return 'claude-sonnet-3.5';
    return 'claude-haiku-4'; // Default fast path
  }
}
```

#### 3. Progressive Task Creator
**Location:** `scripts/modules/task-manager/add-task.js`

**Modes:**
- `immediate`: Create basic task, enrich in background
- `standard`: Optimized AI generation with smart context (new default)
- `detailed`: Full context gathering with research model
- `manual`: No AI, direct creation

#### 4. Response Streaming Layer
**New Component:** `scripts/modules/streaming/task-stream.js`

**Features:**
- SSE (Server-Sent Events) for progress updates
- Partial result caching
- Cancellation support
- Fallback to traditional mode for unsupported clients

### Data Models

#### TaskCreationRequest
```typescript
interface TaskCreationRequest {
  prompt?: string;
  title?: string;
  description?: string;
  mode: 'immediate' | 'standard' | 'detailed' | 'manual';
  useResearch?: boolean;
  contextBudget?: number;
  dependencies?: number[];
  priority?: TaskPriority;
}
```

#### TaskCreationResponse
```typescript
interface TaskCreationResponse {
  taskId: number;
  status: 'complete' | 'enriching' | 'pending';
  task: Task;
  enrichmentJobId?: string;
  telemetry: {
    contextGatherMs: number;
    aiGenerationMs: number;
    totalMs: number;
    tokensUsed: number;
    modelUsed: string;
  };
}
```

### APIs and Integrations

#### Configuration API
```javascript
// Add to config-manager.js
getOptimizationSettings(projectRoot) {
  return {
    enableFastPath: true,
    defaultMode: 'standard',
    contextBudgetTokens: 10000,
    preferredModel: 'haiku',
    enableStreaming: false // Phase 2
  };
}
```

#### MCP Server Updates
```typescript
// Add streaming support to MCP tools
{
  name: "mcp_task-master-a_add_task",
  parameters: {
    mode: "immediate" | "standard" | "detailed" | "manual",
    streamProgress: boolean
  }
}
```

### Infrastructure Requirements
- No new infrastructure (optimizations only)
- Backward compatible with existing storage
- Optional feature flags for gradual rollout
- Telemetry enhancement to track optimization impact

## Development Roadmap

### Phase 1: Quick Wins (Week 1)
**Goal:** Achieve 40% performance improvement with minimal changes

**Scope:**
1. **Smart Context Gathering**
   - Add task count threshold check (< 50 skip semantic search)
   - Implement context budget limits
   - Cache dependency graphs
   - **Estimated Impact:** 2-5s reduction

2. **Adaptive Model Selection**
   - Default to Haiku instead of Sonnet
   - Only use Sonnet with `--research` flag
   - **Estimated Impact:** 10-15s reduction

3. **Prompt Optimization**
   - Remove duplicate task information from context
   - Summarize large contexts instead of full inclusion
   - **Estimated Impact:** 3-5s reduction (faster API processing)

**Deliverables:**
- Updated `contextGatherer.js` with smart mode
- Modified `add-task.js` to use Haiku by default
- Optimized prompt templates in `src/prompts/add-task.json`
- Configuration options for optimization settings
- Updated tests for new behavior

**Testing:**
- Benchmark with 40, 400, 2000 task datasets
- Verify task quality remains high with Haiku
- Confirm backward compatibility
- Measure token reduction

### Phase 2: Advanced Optimizations (Week 2)
**Goal:** Enable sub-5-second task creation with streaming support

**Scope:**
1. **Progressive Context Loading**
   - Start with minimal context
   - Add more only if AI requests clarification
   - Implement retry with expanded context

2. **Response Streaming**
   - Add streaming layer for progress updates
   - Implement partial result caching
   - Add cancellation support

3. **Background Enrichment**
   - Create minimal task immediately
   - Queue full enrichment job
   - Add notification system

**Deliverables:**
- Streaming infrastructure
- Background job queue
- Enhanced telemetry
- Progress UI components

### Phase 3: Intelligent Caching (Week 3)
**Goal:** Further optimize repeated operations

**Scope:**
1. **Context Cache**
   - Cache gathered context for 5 minutes
   - Invalidate on task file changes
   - Share cache across MCP sessions

2. **Similar Task Detection**
   - Detect similar recent tasks
   - Suggest reusing context/details
   - Learn from patterns

3. **Batch Operations**
   - Optimize for multiple task creation
   - Share context across batch
   - Parallel AI calls for independent tasks

**Deliverables:**
- Cache management system
- Pattern detection algorithm
- Batch optimization utilities

### Phase 4: JSONL Migration (Parallel Track)
**Goal:** Enable true pagination and streaming file access

**Scope:**
- Implement JSONL storage format (Task #21/#22)
- One file per tag for efficient reads
- Streaming line-by-line parsing
- Migration utilities

**Note:** This is a separate track that will further improve performance long-term

## Logical Dependency Chain

### Foundation (Must Build First)
1. **Configuration System Enhancement**
   - Add optimization settings to config
   - Feature flags for gradual rollout
   - Telemetry tracking

2. **Smart Context Gatherer**
   - Core optimization logic
   - Required for all subsequent improvements
   - Can be tested independently

3. **Model Selection Service**
   - Determines which AI model to use
   - Affects all AI interactions
   - Simple, standalone component

### Progressive Enhancement (Build Upon Foundation)
4. **Adaptive Prompt Construction**
   - Uses smart context from #2
   - Uses model selection from #3
   - Optimizes based on chosen model

5. **Fast Path Mode**
   - Integrates #2, #3, #4
   - Provides immediate value
   - Can be default quickly

6. **Telemetry Enhancement**
   - Track performance improvements
   - Validate optimizations
   - Guide further work

### Advanced Features (Build on Stable Base)
7. **Response Streaming**
   - Requires stable fast path
   - Optional enhancement
   - Better UX, not required

8. **Background Enrichment**
   - Requires streaming infrastructure
   - Complex state management
   - Optional for power users

9. **Intelligent Caching**
   - Requires telemetry data
   - Learn from usage patterns
   - Long-term optimization

## Risks and Mitigations

### Technical Challenges

**Risk: Haiku produces lower quality task descriptions**
- **Mitigation:** A/B test with Sonnet, measure quality metrics
- **Fallback:** Allow per-user model preference
- **Monitoring:** Track user satisfaction, task edit rates

**Risk: Context caching causes stale data**
- **Mitigation:** Aggressive cache invalidation on task changes
- **Monitoring:** File watch for task.json modifications
- **Fallback:** Disable cache if issues detected

**Risk: Streaming adds complexity without user benefit**
- **Mitigation:** Make streaming opt-in initially
- **Testing:** User testing with MCP interface
- **Alternative:** Focus on total time reduction first

**Risk: Background enrichment confuses users**
- **Mitigation:** Clear UI indicators for enrichment status
- **Documentation:** Explain modes and tradeoffs
- **Option:** Allow disabling background mode

### MVP Scoping

**Must Have (Phase 1):**
- Smart context gathering (task count threshold)
- Haiku default model
- Basic prompt optimization
- Configuration options
- Backward compatibility

**Should Have (Phase 2):**
- Progressive context loading
- Detailed telemetry
- Response streaming foundation

**Nice to Have (Phase 3):**
- Intelligent caching
- Background enrichment
- Similar task detection

**Future:**
- JSONL storage format
- Multi-model ensemble
- Predictive context preloading

### Resource Constraints

**Development Time:**
- Phase 1: 1 week (critical path)
- Phase 2: 1 week (parallel with testing)
- Phase 3: 1 week (refinement)

**Testing Requirements:**
- Automated benchmarks for each optimization
- Manual testing with real workflows
- A/B testing for quality validation

**Documentation Needs:**
- Configuration guide
- Migration guide for users
- Performance tuning best practices

## Success Criteria

### Performance Metrics
- ✅ Task creation time < 5 seconds (90th percentile)
- ✅ Token usage reduced by 70%
- ✅ API costs reduced proportionally
- ✅ No increase in task quality issues

### User Experience Metrics
- ✅ Zero duplicate task creations due to timeouts
- ✅ 90% user satisfaction with response time
- ✅ Adoption of fast-path mode > 80%

### Technical Metrics
- ✅ 100% backward compatibility
- ✅ All tests passing
- ✅ No performance regression in other commands
- ✅ Telemetry accurately tracks optimizations

## Appendix

### Research Findings

**Token Analysis:**
- Current average: 118K input tokens
- Breakdown: 80K context, 30K prompts, 8K overhead
- Target: 35K input tokens (70% reduction)

**Model Performance Comparison:**
| Model | Avg Time | Cost per 1M tokens | Quality Score |
|-------|----------|-------------------|---------------|
| Sonnet-4 | 15-25s | $15 | 9.5/10 |
| Sonnet-3.5 | 10-15s | $3 | 9.0/10 |
| Haiku-4 | 2-5s | $1 | 8.0/10 |

**Context Usage Analysis:**
- Semantic search results: 60% unused
- Dependency context: 80% relevant
- File context: 20% referenced in output

### Technical Specifications

**Configuration Schema:**
```json
{
  "optimization": {
    "enableSmartContext": true,
    "defaultMode": "standard",
    "contextBudgetTokens": 10000,
    "skipSemanticSearchThreshold": 50,
    "modelPreference": {
      "default": "haiku",
      "research": "sonnet",
      "large": "sonnet"
    },
    "caching": {
      "enableContextCache": true,
      "ttlMinutes": 5,
      "maxCacheSize": 100
    },
    "streaming": {
      "enabled": false,
      "progressInterval": 500
    }
  }
}
```

**Telemetry Enhancement:**
```typescript
interface PerformanceTelemetry {
  phase: 'context' | 'ai' | 'save' | 'total';
  durationMs: number;
  tokensConsumed: number;
  optimizationsApplied: string[];
  cacheHit: boolean;
  modelUsed: string;
}
```

### Implementation Notes

**Backward Compatibility:**
- All optimizations behind feature flags
- Default behavior unchanged unless enabled
- Gradual rollout per user/project
- Opt-out available for conservative users

**Testing Strategy:**
- Unit tests for each optimization
- Integration tests for combined effects
- Performance regression tests
- A/B testing for quality validation
- User acceptance testing with MCP

**Monitoring:**
- Track performance metrics per optimization
- Monitor task quality indicators
- Alert on performance regressions
- Collect user feedback

</PRD>
