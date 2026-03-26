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
  - normalized recovery inspection surfaces above raw replay task metadata
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

- additive replay lifecycle activities are now landed for approval-blocked
  dispatch storage, approve/reroute/retry replay attempts, replay outcomes,
  and startup recovery; keep future control-plane work building on that shared
  inspectability path rather than inventing a second replay log
- core-owned recovery read routes now normalize pending dispatch, stored
  dispatch replay, workflow-continuation replay, and latest replay activity
  into one inspectable surface; future operator/control-plane work should build
  on that read model instead of re-parsing raw task metadata blobs
- `GET /api/core/tasks/{taskId}` now also exposes a derived inspection read
  model with latest run/outcome/checkpoint pointers plus governance/workflow
  summaries, so future product surfaces can inspect task state without
  hydrating the full core snapshot
- `GET /api/core/tasks/{taskId}/records` now exposes the grouped task-scoped
  approval-binding, run, trace, checkpoint, outcome, and activity rows, so
  future control-plane or recovery tooling can inspect exact task history
  without client-side re-filtering of the whole core store
- `GET /api/core/tasks/{taskId}/timeline` now exposes a normalized
  chronological task narrative across those same record families, so later
  operator/recovery consumers can read one task-scoped history seam without
  manually stitching raw rows into timeline order or category buckets
- `GET /api/core/operator-inbox` now exposes an actionable task list built on
  top of the existing task-scoped control-plane, timeline, and recovery read
  models, so later operator consumers can discover "what needs attention" plus
  the latest normalized task event without separately joining multiple routes
- `GET /api/core/control-plane/tasks` plus
  `GET /api/core/tasks/{taskId}/control-plane` now expose stable task-scoped
  approval actions, retry/acknowledge actions, workflow recommendation
  summaries, and operator-attention classification on top of the existing core
  write seams, so future control-plane work can consume one task-level read
  model instead of stitching together recovery, inspection, and records views
- those non-UI operator inspection list routes now also expose additive query
  filters plus summary counts, so later operator automation can facet inbox,
  control-plane, and recovery queues without hydrating the whole core snapshot
  or reimplementing the same filtering semantics client-side
- those same operator/recovery list routes now also support
  `workflowUnresolvedTarget` plus `hasUnresolvedWorkflowTargets`, and summarize
  `withUnresolvedWorkflowTargetsCount`, so missing-target continuation work can
  be faceted by the specific unresolved target instead of only by the coarse
  `no_valid_targets` bucket
- blocked `max_continuations` workflow continuation replay is now landed
  through the existing operator `retry` seam and startup recovery path; keep
  deeper workflow-continuation guard blocks on that same product-owned replay
  metadata pattern instead of inventing a parallel loop; `max_dispatches`,
  `max_target_visits`, and `anti_ping_pong` continuation-stage blocks now also
  persist retryable replay snapshots when a concrete continuation source plus
  targets already exist, recommendation-only handoffs can now also persist a
  retryable `no_valid_targets` replay snapshot when a structured
  `workflowRecommendation` exists but no active participant currently matches
  it, while retry can now keep that replay `blocked` plus ready until a
  matching participant becomes active, chat-side assignment recovery can now
  also resume that replay when a matching cat becomes active again, the same
  recovery path now appends additive replay activity with
  `resumeReason=target_recovered`, core recovery routes now also project/filter
  that normalized latest replay resume reason, recommendation-driven
  `parallel` replay now also waits for every candidate target in the stored
  workflow recommendation before auto-resuming a blocked fan-out, blocked
  `no_valid_targets` snapshots now also preserve the recommendation-owned
  workflow stage/shape instead of collapsing to `sequential`, and the same seam can also
  re-resolve stale stored targets from the persisted
  `workflowRecommendation` payload when the
  original target identities are no longer active, while broader group replan
  or
  converge-stage continuation still remains
- startup recovery now also finalizes stranded room-workflow `activeTurn`
  snapshots into blocked terminal history before the app starts serving
  requests, so shared task/run/timeline read models do not keep phantom
  in-flight execution after restart
- converge-stage richer planning once group/branch policies land
- future export of the orchestrator execution contract to other product
  surfaces once Team 3 / Team 6 consume it directly
