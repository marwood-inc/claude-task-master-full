# Task Master AI Specialized Agent Setup

## What Was Created

A specialized agent system for the Task Master AI codebase has been created with the following components:

### 1. Agent Definition
**File**: `.claude/agents/task-master-specialist.md`

A comprehensive agent with deep knowledge of:
- Task Master AI architecture patterns
- Business logic separation rules (tm-core vs CLI/MCP)
- Test placement and structure
- Monorepo organization
- GitHub integration features
- Common anti-patterns to avoid

### 2. Agent Documentation
**File**: `.claude/agents/README.md`

Complete guide covering:
- Available agents
- Usage methods
- Examples of common scenarios
- Benefits of using the specialist agent

### 3. Slash Command
**File**: `.claude/commands/tm-specialist.md`

Quick access command for invoking the specialist agent.

## How to Use

### Method 1: Slash Command (Recommended)

```bash
/tm-specialist I need to add GitHub webhook support. Where should this go?
```

The slash command automatically loads the specialist agent context and processes your request.

### Method 2: Direct Reference

In any Claude Code conversation:

```
@.claude/agents/task-master-specialist.md

I'm implementing a new task export feature. Can you review my approach?
```

### Method 3: Natural Language

```
Load the Task Master specialist agent and help me implement the GitHub label mapping feature
```

## Common Use Cases

### 1. Starting a New Feature

```
/tm-specialist I need to implement bidirectional GitHub sync. Help me plan the architecture.
```

**Expected guidance**:
- Domain methods in `packages/tm-core/src/domains/github-domain.ts`
- Services in `packages/tm-core/src/services/github/`
- CLI commands in `apps/cli/src/commands/github/`
- MCP tools in `apps/mcp/src/tools/github/`

### 2. Code Review

```
/tm-specialist Review this code for architecture violations:

[paste your code]
```

**Expected guidance**:
- Identifies business logic in wrong layer
- Suggests refactoring to tm-core
- Points out duplication opportunities

### 3. Test Placement

```
/tm-specialist Where should I put tests for the GitHub sync conflict resolver?
```

**Expected guidance**:
- Unit tests: `packages/tm-core/src/services/github/conflict-resolver.spec.ts`
- Integration tests: `packages/tm-core/tests/integration/github/sync.test.ts`
- Test structure and patterns

### 4. Architecture Questions

```
/tm-specialist Should GitHub API token validation go in CLI or tm-core?
```

**Expected answer**:
- tm-core (it's business logic)
- Specific file: `packages/tm-core/src/services/github/auth-service.ts`
- Both CLI and MCP call the same tm-core method

### 5. Debugging Architecture Issues

```
/tm-specialist I have duplicate code in CLI and MCP for parsing task IDs. How do I fix this?
```

**Expected guidance**:
- Extract to tm-core domain method
- Update CLI to call tm-core method
- Update MCP to call same tm-core method
- Single source of truth achieved

## What the Agent Knows

### Architecture Rules
- ✅ Business logic in `packages/tm-core/`
- ✅ Thin presentation layers in `apps/cli/` and `apps/mcp/`
- ✅ Single source of truth - no duplication
- ❌ Business logic in CLI/MCP
- ❌ Duplicate implementations

### Technology Stack
- TypeScript with strict mode
- Vitest for testing
- Commander.js for CLI
- MCP SDK for MCP server
- Octokit for GitHub integration

### Project Structure
- Monorepo with npm workspaces
- Packages: tm-core
- Apps: cli, mcp, docs, extension
- Task Master's own task tracking in `.taskmaster/`

### Testing Patterns
- Tests alongside source (`.spec.ts`)
- Integration tests in `tests/integration/`
- Synchronous tests by default
- `.ts` extension always

### Development Workflow
- Uses Task Master for its own development
- Atomic commits per subtask
- Squash commits for main tasks
- Task ID references in commits

## Benefits

Using the specialist agent ensures:

1. **Consistent Architecture**: All features follow the same patterns
2. **No Duplication**: Business logic centralized in tm-core
3. **Faster Development**: Clear guidance on where code belongs
4. **Better Code Reviews**: Catches issues before they're committed
5. **Easier Onboarding**: New contributors learn patterns quickly
6. **Maintainability**: Clean separation of concerns

## Examples from Real Features

### GitHub Integration (Current Branch: feat/github-sync)

**Correct Architecture**:
```
packages/tm-core/src/
  ├── domains/github-domain.ts          # Public API
  └── services/github/
      ├── sync-service.ts               # Sync logic
      ├── conflict-resolver.ts          # Conflict detection
      ├── label-mapper.ts               # Label mapping
      └── auth-service.ts               # Authentication

apps/cli/src/commands/github/
  ├── sync.ts                           # Calls tmCore.github.sync()
  ├── configure.ts                      # Calls tmCore.github.configure()
  └── status.ts                         # Calls tmCore.github.getStatus()

apps/mcp/src/tools/github/
  ├── sync-tasks.ts                     # Calls tmCore.github.sync()
  ├── configure-github.ts               # Calls tmCore.github.configure()
  └── github-status.ts                  # Calls tmCore.github.getStatus()
```

## Integration with Task Master Workflow

The specialist agent understands that this project uses Task Master AI for its own development:

```bash
# The agent knows these commands
task-master list
task-master show <id>
task-master update-subtask --id=<id> --prompt="implementation notes"
task-master set-status --id=<id> --status=done
```

It can guide you through the Task Master workflow while implementing features.

## Updating the Agent

When patterns evolve or new guidelines are established:

1. Update `.claude/agents/task-master-specialist.md`
2. Include concrete examples
3. Add to anti-patterns section if needed
4. Update this AGENT_SETUP.md document
5. Commit changes to repository

## Feedback and Improvements

If you find the agent giving incorrect guidance:

1. Check if the pattern has changed
2. Update the agent definition
3. Document the change
4. Share with the team

---

## Quick Reference

**Invoke agent**: `/tm-specialist <your question>`

**Common questions**:
- "Where does this logic belong?"
- "How should I structure this feature?"
- "Where do I put these tests?"
- "Is this the correct architecture?"
- "How do I avoid duplicating this code?"

**Remember**: The agent enforces clean architecture. If it suggests moving code to tm-core, there's a good architectural reason!

---

**Status**: ✅ Agent system fully configured and ready to use

**Created**: 2025-10-31

**Last Updated**: 2025-10-31
