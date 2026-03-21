# MCP Configuration Guide

> Planning notes for how this project expects to use Model Context Protocol
> (MCP).

## Overview

MCP (Model Context Protocol) is the tool-facing protocol this project plans to
use for orchestrator-style agents. In the accepted architecture, MCP is not the
primary app integration boundary. Product services still use direct
`cats-runtime` APIs. MCP is the additional tool surface that lets an
orchestrator call runtime capabilities without binding directly to provider
adapters or CLI details.

## MCP Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Host                              │
│         (Claude Desktop, Cursor, ChatGPT, etc.)         │
└────────────────────────┬────────────────────────────────┘
                         │ JSON-RPC
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    MCP Client                            │
│              (Discovers & invokes servers)               │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │MCP Server│   │MCP Server│   │MCP Server│
   │(Database)│   │  (API)   │   │ (Files)  │
   └──────────┘   └──────────┘   └──────────┘
```

## Current Project Stance

- `cats-runtime` remains the main runtime boundary for all product code.
- `cats` product services should continue to call `cats-runtime` through
  direct HTTP or SDK-style APIs.
- A future `cats-runtime` MCP facade should expose a curated tool set for
  orchestrators.
- `cats` should not require MCP just to render Chat or Work surfaces.

## Planned MCP Tool Scope

The exact tool names are still to be finalized, but the intended scope is:

- session or worker creation
- dispatching or routing work
- querying run status or worker status
- cancellation or interruption
- artifact or output retrieval
- safe escalation or approval handoff hooks where runtime context is needed

MCP should not become a back door around product-owned permissions,
conversations, or approval state. Those remain inside `cats` and
`Cats Core v1`.

## Configuration

### Claude Desktop

Location: `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "project-name": {
      "command": "python",
      "args": ["-m", "mcp_server"],
      "cwd": "C:/path/to/project",
      "env": {
        "DATABASE_URL": "postgresql://localhost/db"
      }
    }
  }
}
```

### Cursor IDE

Location: `.cursor/mcp.json` (project root)

```json
{
  "mcpServers": {
    "project-name": {
      "command": "node",
      "args": ["./mcp-server/index.js"]
    }
  }
}
```

## Common MCP Servers

### Database Access

```json
{
  "database": {
    "command": "uvx",
    "args": ["mcp-server-sqlite", "--db-path", "./data/database.db"]
  }
}
```

### File System

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@anthropic/mcp-filesystem", "./src"]
  }
}
```

### GitHub

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@anthropic/mcp-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

## Project-Specific Configuration

The project does not ship a validated MCP server command today. When the
`cats-runtime` MCP facade lands, this section should be replaced with the real
command, arguments, and environment contract.

Until then:

- treat any MCP examples here as planning-only
- do not document a fake production command
- keep product services on the direct runtime API path

## Security Considerations

- Never commit MCP configs with hardcoded secrets
- Use environment variables for sensitive data
- Limit server permissions to minimum required
- Review server code before enabling

## Resources

- [MCP Documentation](https://modelcontextprotocol.io)
- [MCP GitHub](https://github.com/modelcontextprotocol)
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers)

---

*Last updated: 2026-03-16*
