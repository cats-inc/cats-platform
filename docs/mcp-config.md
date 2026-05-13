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
- `cats-runtime` now exposes an additive MCP facade with authoritative
  execution at `POST /mcp`, plus the `cats-runtime-mcp` stdio proxy for
  stdio-only hosts.
- `cats` should not require MCP just to render Chat or Work surfaces.
- `cats` now also exposes contract-first orchestration routes for direct
  product consumers:
  - `POST /api/orchestrator/plan`
  - `POST /api/orchestrator/dispatch`
  - `GET /api/orchestrator/channels/{channelId}/execution-loop`

## Current MCP Tool Scope

The current `cats-runtime` MCP facade ships this curated tool slice:

- `runtime_summary`
- `list_sessions`
- `observe_session`
- `create_session`
- `send_message`
- `fork_session`
- `audit_workspace`
- `audit_delivery_target`
- `init_workspace`
- `commit_changes`

MCP should not become a back door around product-owned permissions,
conversations, or approval state. Those remain inside `cats` and
`Cats Core v1`.

Cats Work now defines a product-owned phase-scoped tool observation and
`work-memory` intent helper for intake, triage, execution preparation, and
external tracker binding. Strong Cats and Boss Cat can be shown the allowed
manifests and invariants through bounded observations. Chat's orchestrator
planner also projects explicit Work triage / external binding / Boss execution
requests into `toolIntent`, and runtime dispatch forwards the matched
`toolIntent` in `sendMessage.context.metadata.toolIntent`.

Those Work tools are still not executable through `POST /api/runtime/mcp`.
The runtime MCP endpoint now rejects product-owned Work `tools/call` requests
before proxying to `cats-runtime`, so Work mutations cannot bypass the
supervised Work boundary while the product-owned MCP adapter remains pending.

## Cat MCP Profiles

Cat-level `mcpProfile` is a product-owned selector, not an open provider flag.
The current supported IDs live in `src/shared/catMcpProfiles.ts`:

| Profile | Meaning |
|---------|---------|
| `chat-memory` | Default Chat memory posture. Persisted `null` Cat values are treated as this default by the UI. |
| `work-memory` | Work-oriented posture that lets Chat planning project phase-scoped Work `toolIntent` for explicit intake, triage, external binding, and Boss execution-preparation turns. |

`POST /api/cats` and `PATCH /api/cats/{catId}` reject unsupported Cat
`mcpProfile` IDs with `400 bad_request`. Add new product profiles through the
shared registry and the corresponding product-owned resolver rather than
passing arbitrary strings through the API.

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
tool-intent metadata, runtime MCP tool-plane metadata, and execution-loop
snapshots while still dispatching work through the existing
`cats -> cats-runtime` direct API path.

The orchestrator contract now freezes the Team 6 MCP read-tool schema inside
`runtimeToolPlane`:

- `productSurfacePath: "/api/runtime/mcp"`
- `runtimeSurfacePath: "/mcp"`
- `protocol: "jsonrpc_2_0_http"`
- `schemaVersion: 1`
- tool names:
  - `runtime_summary`
  - `list_sessions`
  - `observe_session`
  - `audit_workspace`
  - `audit_delivery_target`

This keeps `cats` aligned to the runtime-owned tool plane without inventing a
second runtime control surface.

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

For stdio hosts, the same tool plane is available through:

```text
cats-runtime-mcp
```

or a local build:

```text
node build/runtime/bin/mcp.js
```

Notes:

- direct product APIs remain the primary app integration boundary
- MCP is additive and aimed at orchestrator/tool hosts
- prefer direct `POST /mcp` when the host can use HTTP JSON-RPC
- `cats-runtime-mcp` now proxies to an already-running primary `cats-runtime`
  and does not create a second independent runtime core
- set `CATS_RUNTIME_MCP_PROXY_URL` explicitly when the stdio host should target
  a non-default runtime address

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

*Last updated: 2026-03-29*
