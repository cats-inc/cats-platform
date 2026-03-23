# PLAN-023: Orchestrator Execution Loop and Recovery Contract

## Summary

Promote the existing `cats` orchestrator seam from a contract-only wrapper into
the first product-owned execution-loop contract that reflects real room
workflow execution, approval gates, recovery actions, and the Team 6 runtime
MCP tool plane.

## Scope

- extend `src/platform/orchestration/*` with:
  - checkpoint-driven execution-plan read models
  - machine-readable approval and recovery action templates
  - frozen runtime MCP tool-plane metadata for Team 6 alignment
- keep actual execution on the existing `routeChannelMessage()` path
- gate `POST /api/orchestrator/dispatch` when owner approval is still pending
- project multi-step room workflow state into:
  - `POST /api/orchestrator/plan`
  - `POST /api/orchestrator/dispatch`
  - `GET /api/orchestrator/channels/{channelId}/execution-loop`

## Non-Goals

- rewriting the room-routing engine
- introducing a second approval or operator-action schema
- moving runtime policy, provider control, or MCP execution into `cats`
- changing Chat renderer visuals

## Design Notes

- `cats` keeps product-owned semantics:
  - dispatch intent
  - approval/recovery loop state
  - room-workflow execution summary
- `cats-runtime` remains the runtime/tool boundary:
  - `cats` only consumes the frozen MCP tool plane through `/api/runtime/mcp`
- pre-dispatch plans should expose a multi-step skeleton:
  - initial dispatch
  - checkpoint-driven handoff loop
  - outcome reporting
- post-dispatch snapshots should expose executed steps derived from the real
  room workflow turn and operator/run-inspector state
- approval and retry/acknowledge actions must point back to the existing
  `/api/core/approvals` and `/api/core/operator-actions` seams

## Validation

- `cd cats && npm test`

## Follow-up Watchpoints

- automatic resume after approval or retry decisions
- converge-stage richer planning once group/branch policies land
- future export of the orchestrator execution contract to other product
  surfaces once Team 3 / Team 6 consume it directly
