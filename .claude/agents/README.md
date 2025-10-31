# Task Master AI Agents

This directory contains specialized agents for working with the Task Master AI codebase.

## Available Agents

### Task Master Specialist (`task-master-specialist.md`)

A specialized agent with deep knowledge of the Task Master AI architecture, patterns, and best practices.

**Use when**:
- Starting work on a new feature
- Reviewing code for architecture violations
- Uncertain about where to place logic (tm-core vs CLI/MCP)
- Writing tests
- Implementing GitHub integration features
- Need guidance on the monorepo structure

**Key capabilities**:
- Enforces business logic separation (tm-core vs presentation layers)
- Guides proper test placement and writing
- Understands Task Master's own workflow
- Knows GitHub integration architecture
- Catches common anti-patterns

## How to Use Agents

### Method 1: Direct Reference in Prompts

Simply reference the agent in your conversation:

```
@.claude/agents/task-master-specialist.md

I need to implement a new feature for syncing GitHub labels. Where should this logic go?
```

### Method 2: Load Agent Context

When working on Task Master features, load the specialist agent context:

```
Load the Task Master specialist agent and help me implement the GitHub sync feature
```

### Method 3: Create Custom Slash Commands

Create `.claude/commands/tm-specialist.md`:

```markdown
Load the Task Master specialist agent context from @.claude/agents/task-master-specialist.md and assist with the following: $ARGUMENTS
```

Then use: `/tm-specialist <your question>`

## Agent Guidelines

The Task Master Specialist agent will:

1. **Enforce Architecture Rules**:
   - ALL business logic in `packages/tm-core/`
   - Thin presentation layers in `apps/cli/` and `apps/mcp/`
   - Single source of truth - no duplication

2. **Guide Test Placement**:
   - Unit tests alongside source
   - Integration tests in `tests/integration/`
   - Synchronous tests by default

3. **Review Code Quality**:
   - Catch architecture violations
   - Identify duplicated logic
   - Suggest refactoring to tm-core

4. **Provide Context**:
   - Explain existing patterns
   - Show examples from codebase
   - Guide implementation approach

## Examples

### Example 1: New Feature Implementation

**Question**: "I need to add a feature to export tasks to GitHub Issues. Where should I start?"

**Agent Response**:
- Design domain methods in `packages/tm-core/src/domains/github-domain.ts`
- Implement GitHub API logic in `packages/tm-core/src/services/github/export-service.ts`
- Create CLI command in `apps/cli/src/commands/github/export.ts`
- Create MCP tool in `apps/mcp/src/tools/github/export-tasks.ts`
- Both CLI and MCP call the same tm-core domain method

### Example 2: Architecture Review

**Question**: "I wrote a helper function in the CLI to parse GitHub issue URLs. Is this correct?"

**Agent Response**:
- ❌ Incorrect placement - parsing is business logic
- Move to `packages/tm-core/src/services/github/url-parser.ts`
- CLI should call `tmCore.github.parseIssueUrl(url)` instead
- This allows MCP to use the same logic without duplication

### Example 3: Test Guidance

**Question**: "Where should I put tests for the GitHub sync service?"

**Agent Response**:
- Unit tests: `packages/tm-core/src/services/github/sync-service.spec.ts`
- Integration tests: `packages/tm-core/tests/integration/github/sync.test.ts`
- Use `.ts` extension, not `.js`
- Make tests synchronous unless testing actual async operations

## Benefits

Using the Task Master Specialist agent ensures:

- ✅ Consistent architecture across the codebase
- ✅ No duplication between CLI and MCP
- ✅ Proper test placement and structure
- ✅ Faster onboarding for new contributors
- ✅ Catches issues before code review
- ✅ Maintains clean separation of concerns

## Contributing

When updating the specialist agent:

1. Keep architecture rules front and center
2. Provide concrete examples (✅ and ❌)
3. Include code snippets showing correct patterns
4. Update with new patterns as they emerge
5. Reference actual files in the codebase

---

**Note**: The specialist agent is a knowledge resource, not a replacement for understanding the codebase. Use it as a guide while you learn the patterns.
