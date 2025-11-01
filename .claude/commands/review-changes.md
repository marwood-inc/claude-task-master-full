Review uncommitted code changes using pr-review-toolkit agents with proper context.

**IMPORTANT:** This command prepares and provides the necessary context for pr-review-toolkit agents to work correctly.

## Steps:

### 1. Gather Change Context

First, collect information about what changed:

```bash
# Get list of changed files
git diff --name-only

# Get statistics
git diff --stat

# Get detailed diff for specific files if needed
git diff <file>
```

### 2. Prepare Review Context

Based on the git diff output, prepare a detailed context including:
- Specific file names that changed
- Line counts (+additions, -deletions)
- Brief description of what each file does
- Focus areas for review

### 3. Invoke Agents with Context

Use the Task tool to invoke agents ONE AT A TIME with the prepared context.

**Example for code-reviewer:**
```
Review the following uncommitted changes:

Changed files:
- apps/cli/src/utils/error-categorizer.ts (+247 lines)
- apps/cli/src/utils/error-categorizer.spec.ts (+215 lines)
- apps/cli/src/utils/enhanced-error-display.ts (+166 lines)
- apps/cli/src/utils/enhanced-error-display.spec.ts (+219 lines)

These files implement:
- Error categorization for CLI commands (Network, Auth, Validation, etc.)
- Enhanced error display with colors and actionable messages
- Comprehensive test suites for both utilities

Focus on:
1. Error categorization logic correctness
2. Test coverage completeness
3. User experience of error messages
4. Architecture compliance (CLI utils vs tm-core logic)
```

### 4. Review Agents Available

- **code-reviewer**: General code quality and architecture
- **pr-test-analyzer**: Test coverage analysis
- **silent-failure-hunter**: Error handling completeness
- **type-design-analyzer**: TypeScript type quality
- **comment-analyzer**: Documentation accuracy

### 5. Address Findings

After each agent review:
- Note any high-priority issues
- Fix problems before committing
- Update tests if needed

## Usage Examples

### Review Current Changes
```
/review-changes
```

### Review Specific Commit Range
```
/review-changes HEAD~3..HEAD
```

## Important Notes

- **DO NOT** invoke all agents in parallel without context - they will fail
- **ALWAYS** include specific file names in the review prompt
- **ALWAYS** include git diff statistics
- **FOCUS** each agent on relevant aspects (tests for pr-test-analyzer, types for type-design-analyzer, etc.)

## See Also

- `.claude/PR_REVIEW_AGENTS_GUIDE.md` - Comprehensive troubleshooting guide
- `.claude/agents/task-master-specialist.md` - For architecture reviews

## Troubleshooting

If agents complete immediately with 0 tool uses:
1. Check that you provided specific file names
2. Verify you included git diff statistics
3. Ensure prompt specifies what to focus on
4. Read `.claude/PR_REVIEW_AGENTS_GUIDE.md` for detailed help
