# MCP Configuration Guide

> Runtime MCP usage for orchestrator-style agents in `cats`.

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
- `cats-runtime` now exposes a first-slice MCP facade at `POST /mcp`.
- `cats` should not require MCP just to render Chat or Work surfaces.
- `cats` now also exposes contract-first orchestration routes for direct
  product consumers:
  - `POST /api/orchestrator/plan`
  - `POST /api/orchestrator/dispatch`
  - `GET /api/orchestrator/channels/{channelId}/execution-loop`

## Current MCP Tool Scope

The current `cats-runtime` MCP facade ships the first curated tool slice:

- `runtime_summary`
- `list_sessions`
- `observe_session`
- `audit_workspace`
- `audit_delivery_target`

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

## Direct Product Routes

`cats` product code should keep using direct API routes, not the MCP facade.

The first orchestration routes are:

```text
POST /api/orchestrator/plan
POST /api/orchestrator/dispatch
GET  /api/orchestrator/channels/{channelId}/execution-loop
```

These routes return machine-readable room-turn planning, dispatch receipts,
tool-intent metadata, and execution-loop snapshots while still dispatching work
through the existing `cats -> cats-runtime` direct API path.

## Runtime MCP Endpoint

For orchestrator-style agents, use the runtime-owned MCP facade:

```text
POST http://127.0.0.1:3110/mcp
Authorization: Bearer <cats-runtime-api-key>   # when enabled
Content-Type: application/json
```

Example `initialize`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

Example `tools/list`:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

Example `tools/call`:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "observe_session",
    "arguments": {
      "sessionId": "session-123"
    }
  }
}
```

Notes:

- this slice is HTTP JSON-RPC, not a new standalone stdio binary
- direct product APIs remain the primary app integration boundary
- MCP is additive and aimed at orchestrator/tool hosts

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

*Last updated: 2026-03-23*
