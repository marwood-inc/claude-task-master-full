# PR Review Toolkit Agents - Troubleshooting Guide

## Problem: Agents Failing Immediately

**Symptoms:**
- Agents complete in 1-3 seconds
- 0 tool uses reported
- 0 tokens consumed
- No actual review output

**Example of failure:**
```
● pr-review-toolkit:code-reviewer(Review code quality for tasks 1-17)
  ⎿  Done (0 tool uses · 0 tokens · 1.8s)
```

## Root Cause

The pr-review-toolkit agents require **specific file context** to review. They cannot work with vague prompts like "Review code quality for tasks 1-17".

According to the agent descriptions:
> "The agent needs to know which files to focus on for the review. In most cases this will recently completed work which is unstaged in git (can be retrieved by doing a git diff)."

When agents don't receive this required context, they fail during initialization before doing any work.

## Solution: Proper Agent Invocation

### Method 1: Review Uncommitted Changes (Most Common)

```bash
# 1. First, get the git diff to see what changed
git diff --name-only

# 2. Invoke the code-reviewer with file context
```

Then use Task tool with a detailed prompt:

```
Review the following uncommitted changes:

Files changed:
- apps/cli/src/utils/error-categorizer.ts
- apps/cli/src/utils/enhanced-error-display.ts
- packages/tm-core/src/modules/integration/integration-domain.ts

Focus on:
- Code quality and maintainability
- Adherence to project patterns (business logic in tm-core)
- Error handling completeness
- Type safety

Git diff shows 247 additions in error-categorizer.ts, 166 additions in enhanced-error-display.ts.
```

### Method 2: Review Specific Commit Range

```bash
# 1. Get the diff for specific commits
git diff HEAD~5..HEAD --name-only

# 2. Get detailed stats
git diff HEAD~5..HEAD --stat

# 3. Invoke agent with this context
```

Example prompt:
```
Review changes from commits HEAD~5..HEAD:

Changed files (31 files, +4854, -537):
- apps/cli/src/commands/github/sync.command.ts (+167, -167)
- apps/cli/src/commands/github/configure.command.ts (+303, -303)
- apps/cli/src/utils/ (new error handling files)
- packages/tm-core/src/modules/integration/integration-domain.ts (+766, -537)

Focus on:
- GitHub sync implementation correctness
- Error handling patterns
- Test coverage
```

### Method 3: Review Staged Changes

```bash
# 1. Check what's staged
git diff --cached --name-only

# 2. Get stats
git diff --cached --stat

# 3. Invoke agent with staged changes context
```

## Individual Agent Usage

### code-reviewer
**Purpose:** General code quality, style, and architecture review

**Example:**
```
Review the error handling implementation in:
- apps/cli/src/utils/error-categorizer.ts
- apps/cli/src/utils/enhanced-error-display.ts
- apps/cli/src/utils/retry-prompt-handler.ts

Check for:
- Proper error categorization logic
- User-friendly error messages
- Retry logic safety
- Adherence to tm-core architecture (no business logic in CLI)
```

### pr-test-analyzer
**Purpose:** Test coverage and quality assessment

**Example:**
```
Analyze test coverage for the new error handling utilities:

Implementation files:
- apps/cli/src/utils/error-categorizer.ts (247 lines)
- apps/cli/src/utils/enhanced-error-display.ts (166 lines)

Test files:
- apps/cli/src/utils/error-categorizer.spec.ts (215 lines)
- apps/cli/src/utils/enhanced-error-display.spec.ts (219 lines)

Focus on:
- Coverage completeness
- Edge case testing
- Integration test needs
```

### silent-failure-hunter
**Purpose:** Find silent failures and inadequate error handling

**Example:**
```
Hunt for silent failures in GitHub sync implementation:

Files to analyze:
- apps/cli/src/commands/github/sync.command.ts
- packages/tm-core/src/modules/integration/integration-domain.ts
- packages/tm-core/src/services/github-sync-state.service.ts

Look for:
- Try-catch blocks that might swallow errors
- Missing error propagation
- Async operations without proper error handling
- Network calls without timeout or retry logic
```

### type-design-analyzer
**Purpose:** Analyze TypeScript type design quality

**Example:**
```
Analyze type design for GitHub sync features:

Files:
- packages/tm-core/src/modules/integration/types/github-sync-state-types.ts
- apps/cli/src/utils/cli-error-types.ts

Focus on:
- Type safety and encapsulation
- Invariant expression
- Discriminated unions for state management
- Proper use of readonly/const
```

### comment-analyzer
**Purpose:** Verify documentation accuracy and completeness

**Example:**
```
Analyze documentation for the IntegrationDomain:

File: packages/tm-core/src/modules/integration/integration-domain.ts

The file has comprehensive JSDoc comments. Verify:
- Comments accurately reflect implementation
- Examples are valid
- Edge cases are documented
- No stale TODO comments
```

## Creating a Slash Command for Easy Review

Create `.claude/commands/review-changes.md`:

```markdown
Review uncommitted code changes using pr-review-toolkit agents.

Steps:
1. Get list of changed files with `git diff --name-only` and `git diff --stat`
2. Launch code-reviewer agent with file context and statistics
3. Launch pr-test-analyzer agent for test coverage check
4. Launch silent-failure-hunter agent for error handling check
5. Summarize findings and recommendations
```

## Best Practices

### ✅ DO
- Always include specific file names in the prompt
- Provide git diff statistics (lines added/removed)
- Specify what to focus on
- Review related files together (implementation + tests)
- Use after completing a logical chunk of work

### ❌ DON'T
- Use vague prompts like "review everything"
- Invoke without git diff context
- Try to review unrelated changes together
- Invoke all agents in parallel without preparing context
- Use for reviewing only JSON or config file changes

## Workflow Integration

### After Completing a Subtask

```bash
# 1. Check what you changed
git diff --stat

# 2. If substantial code changes, review them
# Prepare detailed prompt with file list and focus areas

# 3. Use Task tool with specific agent and context

# 4. Address any issues found

# 5. Commit when review is clean
```

### Before Creating a PR

```bash
# 1. Get full diff since branching
git diff main..HEAD --stat

# 2. Review all changes systematically
# Use each agent with appropriate file groupings

# 3. Address all high-priority issues

# 4. Create PR with confidence
```

## Common Error Patterns

### Pattern 1: Agent Completes Too Quickly (0 tool uses, 0 tokens)
**Cause:** Missing file context in prompt
**Solution:** Add explicit file list and git diff stats

### Pattern 2: Agent Returns Generic Advice
**Cause:** Prompt too vague or broad
**Solution:** Focus on specific files and concerns

### Pattern 3: Multiple Agents Fail
**Cause:** Same root issue - no file context
**Solution:** Prepare context once, use for all agent invocations

### Pattern 4: "Tool names must be unique" Error
**Cause:** pr-review-toolkit plugin configuration issue
**Solution:** This is a bug in the plugin itself. Workaround options:
1. Use manual code review instead of agents
2. Use the zen MCP tools for code review (`mcp__zen__codereview`)
3. Use the task-master-specialist agent for architecture reviews
4. Report issue to Claude Code team

**Alternative: Use Zen MCP for Code Review**

If pr-review-toolkit agents are not working, use the zen MCP server's codereview tool:

```
Use mcp__zen__codereview to review the error handling implementation.

Files to review:
- apps/cli/src/utils/error-categorizer.ts
- apps/cli/src/utils/enhanced-error-display.ts
- apps/cli/src/utils/command-action-wrapper.ts
- apps/cli/src/utils/retry-prompt-handler.ts

Focus on architecture, error handling correctness, and code quality.
```

## Integration with Task Master Workflow

When using Task Master, integrate reviews into your subtask workflow:

```bash
# Complete implementation
task-master set-status --id=17.3 --status=done

# Review the changes
# [Use agents with proper context]

# Update with review findings
task-master update-subtask --id=17.3 --prompt="Code review findings: ..."

# Commit
git add .
git commit -m "feat(subtask-17.3): Implement feature [reviewed]"
```

## Troubleshooting Checklist

When agents fail immediately, check:

- [ ] Did you include specific file names?
- [ ] Did you provide git diff context?
- [ ] Did you specify what to focus on?
- [ ] Are the files you're reviewing actual code (not just JSON)?
- [ ] Is your prompt detailed enough?

## Example: Successful Review Session

```
# Check changes
git diff --name-only
# Output:
# apps/cli/src/utils/error-categorizer.ts
# apps/cli/src/utils/error-categorizer.spec.ts

git diff --stat
# Output:
# apps/cli/src/utils/error-categorizer.ts      | 247 ++++++++++
# apps/cli/src/utils/error-categorizer.spec.ts | 215 +++++++++

# Now use Task tool with code-reviewer:
Prompt:
"Review the new error categorization utility:

Implementation: apps/cli/src/utils/error-categorizer.ts (247 lines added)
Tests: apps/cli/src/utils/error-categorizer.spec.ts (215 lines added)

Focus on:
1. Error categorization logic correctness
2. Test coverage completeness
3. Integration with existing CLI error handling
4. Adherence to architecture (should this be in tm-core?)

The utility categorizes CLI errors into: Network, Authentication, Validation,
FileSystem, Git, GitHub API, and Unknown categories."

# Agent will now have sufficient context to provide meaningful review
```

## Summary

**Key Takeaway:** pr-review-toolkit agents need detailed file context to work. Always include:
1. Specific file names
2. Git diff statistics
3. Focus areas
4. Implementation context

Without this information, agents fail immediately with 0 tool uses.
