# Task Master AI - Copilot Instructions

Task Master AI is a task management system for AI-driven development that integrates with various AI coding tools via CLI and MCP (Model Context Protocol) server.

## Architecture Overview

### Core Domain-Driven Design Pattern
- **`@tm/core`** (packages/tm-core/): ALL business logic lives here via domain objects
  - Provides unified facade through `createTmCore()` factory
  - Domains: `tasks`, `auth`, `workflow`, `git`, `config`, `integration`
  - Example: `tmCore.tasks.get('1.2')` handles task/subtask ID parsing automatically
- **`@tm/cli`** (apps/cli/): Thin presentation layer calling tm-core methods
- **`@tm/mcp`** (apps/mcp/): MCP server tools calling same tm-core methods
- **`apps/extension`**: Future VS Code extension (also thin layer)

**Critical Rule**: NO business logic in presentation layers. Move any parsing, validation, or transformation logic to tm-core domains.

### Monorepo Structure
- **Turbo + npm workspaces** for build orchestration
- **tsdown** for TypeScript compilation (not tsc)
- **Biome** for formatting/linting (not ESLint/Prettier)
- **Jest** for testing with experimental VM modules
- **Changesets** for versioning (`npm run changeset`)

## Key Development Workflows

### Build & Test Commands
```bash
# Development
npm run dev                    # Watch mode compilation
npm run turbo:dev             # Turbo watch across packages
npm run turbo:build           # Build all packages

# Testing
npm run test                  # All tests with experimental VM modules
npm run test:unit             # Unit tests only
npm run test:integration      # Integration tests only
npm run test:e2e              # End-to-end tests

# Quality
npm run format               # Biome format
npm run deps:check           # Workspace dependency validation
```

### Task Master CLI Integration
The project uses its own task management system extensively:
```bash
task-master list              # View current tasks
task-master next              # Get next available task
task-master expand --id=<id>  # Break down complex tasks
task-master set-status --id=<id> --status=done
```

## Critical Project Patterns

### Import/Export Conventions
- **Always use `.js` extensions** in imports for compiled output compatibility
- **Subpath exports** in packages for clean module boundaries
- **Type-only imports** where appropriate: `import type { ... }`

### Tagged Task System
- Tasks are organized by tags (contexts) for parallel development
- Branch-specific task contexts: each Git branch can have isolated task scope
- Migration-friendly: existing projects use "master" tag automatically

### Error Handling Pattern
```typescript
import { TaskMasterError, ERROR_CODES } from '@tm/core';

throw new TaskMasterError(
  'Description of error', 
  ERROR_CODES.TASK_NOT_FOUND,
  { taskId, additionalContext }
);
```

### Test File Placement Rules
- **Package tests**: Place alongside source in `packages/<name>/src/<module>/<file>.spec.ts`
- **Integration tests**: Use `packages/<name>/tests/integration/`
- **Isolated tests**: Only use `tests/unit/` when parallel placement impossible
- **Always `.ts` extension** for TypeScript tests, never `.js`
- **Synchronous tests preferred** - avoid async/await unless testing actual async operations

### MCP Server Integration
- MCP tools expose tm-core functionality to AI agents
- Configuration via `.mcp.json` with environment variables
- Tools follow Zod schema validation pattern
- Server entry point: `dist/mcp-server.js`

## File Organization Patterns

### Configuration Files
- `.taskmaster/` directory for project-specific task data
- `.claude/` for Claude Code integration settings
- `.cursor/rules/` for comprehensive Cursor AI guidance
- Environment variables via `.env` (never commit real keys)

### Core Module Structure
```
packages/tm-core/src/
├── modules/           # Domain modules (tasks, auth, etc.)
├── common/           # Shared types, interfaces, errors
└── tm-core.ts        # Main facade class
```

### Apps Structure  
```
apps/
├── cli/              # Commander.js CLI interface
├── mcp/              # fastmcp server tools
├── docs/             # Mintlify documentation site
└── extension/        # Future VS Code extension
```

## Integration Points

### AI Provider Registry
- Supports multiple AI providers (Anthropic, OpenAI, Google, etc.)
- Provider-specific implementations in `src/ai-providers/`
- Unified interface through configuration system

### Documentation
- **Live docs**: https://docs.task-master.dev (Mintlify)
- **Source**: `apps/docs/` directory
- **Never reference local file paths** in user-facing docs

### Git Workflow Integration
- Task-specific branches: `task-001`, `task-004`
- Automated task status management with Git operations
- Branch protection on main with PR requirements

When working on this codebase, always consider the domain-driven architecture and ensure business logic stays in `@tm/core` while presentation layers remain thin facades.