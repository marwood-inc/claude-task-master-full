# MCP Server Setup

This project uses MCP (Model Context Protocol) servers for enhanced functionality.

## Initial Setup

1. **Copy the example configuration:**
   ```bash
   cp .mcp.json.example .mcp.json
   ```

2. **Update paths in `.mcp.json`:**
   - Update the `zen` server paths to point to your local zen-mcp-server installation
   - The paths should be absolute paths to your local installation

3. **Set API keys:**

   The zen MCP server requires API keys for external services. These should be set as **environment variables** rather than hardcoded in the config file.

   Required environment variables:
   - `GEMINI_API_KEY` - For Google Gemini API access
   - `OPENAI_API_KEY` - For OpenAI API access
   - `XAI_API_KEY` - For xAI API access

   **Setting environment variables:**

   - **Windows (PowerShell):**
     ```powershell
     $env:GEMINI_API_KEY="your-key-here"
     $env:OPENAI_API_KEY="your-key-here"
     $env:XAI_API_KEY="your-key-here"
     ```

   - **Windows (CMD):**
     ```cmd
     set GEMINI_API_KEY=your-key-here
     set OPENAI_API_KEY=your-key-here
     set XAI_API_KEY=your-key-here
     ```

   - **Linux/macOS:**
     ```bash
     export GEMINI_API_KEY="your-key-here"
     export OPENAI_API_KEY="your-key-here"
     export XAI_API_KEY="your-key-here"
     ```

## Security Notes

- **Never commit `.mcp.json`** with real API keys or sensitive paths
- The `.mcp.json` file is ignored by git to prevent accidental commits
- Always use `.mcp.json.example` as a template for sharing configuration structure
- Store API keys in environment variables or a secure secrets manager

## Available MCP Servers

### task-master-ai
The Task Master AI MCP server provides task management functionality through the MCP protocol.

### zen
Advanced AI capabilities server with multiple model support. Requires API keys (set via environment variables).

### oraios/serena
Agent-based development assistant with semantic code tools.

## Troubleshooting

If MCP servers fail to connect:
1. Verify paths in `.mcp.json` are correct and absolute
2. Ensure required environment variables are set
3. Check that Python/Node.js dependencies are installed
4. Review Claude Code MCP logs for detailed error messages
