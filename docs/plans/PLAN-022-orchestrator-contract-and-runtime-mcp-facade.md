# PLAN-022: Orchestrator Contract and Runtime MCP Facade

## Summary

Land the first contract-first orchestration seam in `cats` and the first
runtime-owned MCP facade in `cats-runtime` without rewriting the existing chat
orchestration loop or making MCP the only runtime interface.

The follow-on execution-loop and recovery slice now continues in
[PLAN-023](./PLAN-023-orchestrator-execution-loop-and-recovery.md).

## Scope

### `cats`

- add `src/platform/orchestration/*` as the product-owned planning/dispatch
  contract layer
- expose additive Chat API routes for:
  - `POST /api/orchestrator/plan`
  - `POST /api/orchestrator/dispatch`
  - `GET /api/orchestrator/channels/{channelId}/execution-loop`
- keep actual room execution on the existing `routeChannelMessage()` path
- surface existing approval/operator-action seams instead of inventing a second
  core schema

### `cats-runtime`

- add `src/mcp/*` as the runtime-owned MCP facade module
- expose `POST /mcp` JSON-RPC handling
- support:
  - `initialize`
  - `tools/list`
  - `tools/call`
- ship a first curated tool slice for:
  - runtime summary
  - session list/observe
  - workspace audit
  - delivery audit

## Non-Goals

- replacing direct product API calls with MCP
- rewriting Chat renderer state or product workflow core
- redesigning runtime session discipline or provider compatibility
- turning MCP into a full standalone process manager in this slice

## Design Notes

- `cats` owns orchestrator intent and tool-intent planning metadata.
- `cats-runtime` owns tool execution/read-model exposure through MCP.
- `POST /api/orchestrator/dispatch` should embed the pre-dispatch plan plus
  post-dispatch execution-loop snapshot so downstream consumers can correlate
  planning and execution without re-deriving state client-side.
  - The returned plan should be explicitly labeled as a pre-dispatch snapshot so
    consumers do not read volatile fields like `sessionId` as post-dispatch truth.
- MCP tool results should always carry structured JSON in addition to a short
  text summary.

## Validation

- `cd cats-platform && npm test`
- `cd cats-runtime && npm test`

## Follow-up Watchpoints

- richer `mcpProfile -> toolIntent` registries once more product profiles land
- session-control MCP tools once downstream orchestrators need mutation paths
- possible future export of the orchestrator plan/dispatch contract to a shared
  platform package when another product surface consumes it
