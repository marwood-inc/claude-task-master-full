# Historical Note: Background Agents (Task 11)

⚠️ **This directory was created based on a misunderstanding of how Claude Code subagents work.**

## What We Learned

Task 11 attempted to create "background agents" with JSON descriptors and custom delegation infrastructure. However, Claude Code actually uses:

- **Markdown files with YAML frontmatter** in `.claude/agents/` (not JSON descriptors)
- **Built-in automatic delegation** (no custom infrastructure needed)
- **Simple configuration**: Just `name`, `description`, `tools`, and `model` fields

The good news: **Automatic delegation already works!** Claude Code has built-in proactive delegation based on task descriptions and subagent capabilities.

## Current Status

✅ **The task-master-specialist subagent is correctly configured** in `.claude/agents/task-master-specialist.md`

The specialist should automatically handle Task Master operations when you:
- Run task-master CLI commands (`list`, `show`, `next`, etc.)
- Request task information ("show me task 5", "what's next")
- Perform task analysis or planning

## What This Directory Contains

- **task-master-specialist.json**: Unused JSON descriptor (Claude Code doesn't use this format)
- This README: Historical note explaining the misunderstanding

## Correct Implementation

See the actual working subagent at:
- **Location**: `.claude/agents/task-master-specialist.md`
- **Format**: Markdown with YAML frontmatter
- **Documentation**: `.taskmaster/CLAUDE.md` (section "Claude Code Subagent Integration")

## Related Infrastructure

The following files were created for custom delegation routing but are unnecessary:
- `packages/tm-bridge/src/delegation-helper.ts` - Custom trigger detection (Claude Code has built-in)
- `packages/tm-bridge/src/delegation-helper.spec.ts` - Tests for unused code

These can be removed or repurposed for other uses.

## References

- **Official docs**: https://anthropic.mintlify.app/en/docs/claude-code/sub-agents.md
- **Review document**: `.taskmaster/docs/research/task-11-implementation-review.md`
- **Task reference**: Task 11 - Automate Task Master Specialist Delegation

---

**Key Takeaway**: Claude Code's built-in subagent system is simpler and more powerful than we expected. No custom infrastructure needed - just well-crafted Markdown files with clear descriptions.

Last Updated: 2025-10-31
