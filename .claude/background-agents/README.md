# Background Agents Configuration

This directory contains configuration specifications for automatic background agent delegation in Task Master AI.

## Status

⚠️ **Implementation Pending**: The background agent delegation feature is currently specified but not yet implemented in Claude Code. The configuration files in this directory serve as specifications for the desired behavior.

## Task Master Specialist Background Agent

The `task-master-specialist.json` file defines how the Task Master specialist agent should be automatically invoked when:

1. **CLI Commands**: User runs Task Master commands (`task-master list`, `show`, `next`, etc.)
2. **Natural Language**: User mentions Task Master operations in prompts
3. **Task Tags**: Work is tagged with `taskmaster` in git or project metadata

## Configuration Files

- **task-master-specialist.json**: Complete specification for Task Master specialist background delegation
  - Trigger conditions (CLI patterns, natural language keywords, task tags)
  - Delegation targets and priorities
  - Required tools and permissions
  - Output formatting templates
  - Fallback rules and error handling
  - Integration points with git config, Task Master config, and CLI bridge

## Future Implementation

To fully implement this feature, the following components need to be developed:

1. **Claude Code Integration**: Support for `backgroundAgents` in `.claude/settings.json`
2. **Trigger Matcher**: Runtime system to detect trigger conditions
3. **Delegation Router**: Automatically invoke the specialist agent when triggered
4. **Bridge Implementation**: Tag-driven routing hooks in `packages/tm-bridge/`

## Usage (When Implemented)

Once implemented, the background agent will:
- Automatically handle Task Master operations without explicit invocation
- Provide consistent, formatted responses aligned with CLI output
- Suggest next actions based on task dependencies
- Track task progress and update status appropriately
- Gracefully handle errors with recovery suggestions

## Manual Usage (Current)

Until automatic delegation is implemented, use the specialist agent manually:

```bash
# Explicitly invoke the agent
@agent-taskmaster:task-master-specialist

# Or use standard Task Master CLI commands
task-master list
task-master show <id>
task-master next
```

## Related Files

- **Agent Definition**: `.claude/agents/task-master-specialist.md`
- **Architecture Docs**: `CLAUDE.md`, `.taskmaster/CLAUDE.md`
- **Setup Guide**: `.claude/AGENT_SETUP.md` (to be created in subtask 11.3)

---

Last Updated: 2025-10-31
Task Reference: Task 11 - Automate Task Master Specialist Delegation
