# PLAN-054: Agent Missions, Managed Work, and Transport Bindings

> Roll the new agent/work/transport vocabulary into shared contracts,
> cross-product projections, and transport/direct-lane behavior without
> reopening the unified interaction engine.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-062: Agent Missions, Managed Work, and Transport Bindings](../specs/SPEC-062-agent-missions-and-transport-bindings.md)
- [ADR-063: Separate Managed Work, Agent Missions, Execution Runs, and Transport Bindings](../decisions/063-agent-missions-and-transport-bindings.md)
- [SPEC-058: Interaction Core and Domain Materialization](../specs/SPEC-058-interaction-core-and-domain-materialization.md)
- [SPEC-017: Telegram Inbox and Room Routing](../specs/SPEC-017-telegram-inbox-and-room-routing.md)
- [SPEC-018: Direct Cat Chat and Conversation Routing Layer](../specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-029: Companion Boxes, Ingestion, and Response Profiles](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [SPEC-040: Cats Work Team Templates and Work Intake](../specs/SPEC-040-cats-work-team-templates-and-work-intake.md)
- [SPEC-041: Cats Code v1 Local Builder Loop](../specs/SPEC-041-cats-code-v1-local-builder-loop.md)

## Overview

This plan introduces one stable vocabulary across Chat, Work, Code, Companion,
Guide/Boss capabilities, and external transports.

The rollout goal is:

- `Managed Work` stays operator-facing
- `Mission` and `Run` cover agent execution
- `Schedule / Trigger` covers launch conditions
- `Transport Binding` keeps Telegram/LINE identity outside conversation/session
  identity

## Implementation Phases

### Phase 1: Freeze Taxonomy and Ownership

- [ ] Task 1.1: Add shared terminology and architecture guidance for:
      - `Entity`
      - `Agent`
      - `Participant`
      - `Managed Work`
      - `Mission`
      - `Run`
      - `Schedule / Trigger`
      - `Transport Binding`
- [ ] Task 1.2: Freeze which product owns which canonical records:
      - Chat
      - Work
      - Code
      - shared/core/platform layers
- [ ] Task 1.3: Mark `job` as a non-preferred umbrella term in new product
      docs/contracts except where external systems already require it

**Deliverables**: one documented vocabulary and one ownership map

### Phase 2: Add Mission/Run/Schedule Contracts

- [ ] Task 2.1: Define first shared contract shapes for `Mission` and `Run`
- [ ] Task 2.2: Define linkage rules between:
      - managed-work records
      - missions
      - runs
      - conversations/turns/lanes
- [ ] Task 2.3: Define schedule/trigger metadata for cron, transport ingress,
      owner actions, and workflow continuation
- [ ] Task 2.4: Define provenance and idempotency rules for mission/run replay

**Deliverables**: shared execution vocabulary above the unified interaction
engine

### Phase 3: Add Transport Binding Contracts

- [ ] Task 3.1: Define `Transport Binding` separately from static
      `Bot Binding`
- [ ] Task 3.2: Define the mapping from transport binding into canonical
      direct-lane conversation identity
- [ ] Task 3.3: Define how inbound transport messages create or continue turns
      without leaking transport identity into runtime session identity
- [ ] Task 3.4: Add explicit observability fields for:
      - bot binding id
      - transport binding id
      - conversation id
      - session id

**Deliverables**: transport/direct-lane identity model that remains compatible
with Telegram and future transports

### Phase 4: Project Into Work, Code, and Companion

- [ ] Task 4.1: Define which mission types stay invisible/internal by default
- [ ] Task 4.2: Define promotion rules for when mission outcomes become
      Work-facing tasks, approvals, or review items
- [ ] Task 4.3: Define Code projections that distinguish:
      - task
      - mission
      - run
      - artifact
- [ ] Task 4.4: Define Companion projections for background analysis and review
      outcomes without turning every sweep into a backlog item

**Deliverables**: product-specific projections above one shared vocabulary

### Phase 5: Verification and Documentation Convergence

- [ ] Task 5.1: Add tests or validation notes proving transport binding is not
      conflated with session identity
- [ ] Task 5.2: Add coverage or schema checks proving missions/runs can exist
      without forced Work-task materialization
- [ ] Task 5.3: Update older Work/Code/Companion/Telegram docs and plans to use
      the frozen vocabulary consistently
- [ ] Task 5.4: Remove or narrow older loose uses of `job` where they conflict
      with the new vocabulary

**Deliverables**: converged docs and implementation-ready vocabulary

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/core/**` | Modify (additive) | Mission/run/schedule and transport-binding contracts when implementation starts |
| `src/platform/**` | Modify | Transport-binding, orchestration, and background-mission surfaces |
| `src/products/chat/**` | Modify | Direct-lane, Telegram, and mission-status projection |
| `src/products/work/**` | Modify | Managed-work projection and mission-promotion rules |
| `src/products/code/**` | Modify | Task vs mission vs run vs artifact projection |
| `tests/**` | Modify/Create | Identity-separation and mission/run projection coverage |
| `docs/**` | Modify | Vocabulary, architecture, and product-boundary docs |

## Technical Decisions

- Decision 1: `Managed Work` is operator-facing planning state, not a mirror of
  all agent execution.
- Decision 2: `Mission` bridges work/context to execution; `Run` is one attempt.
- Decision 3: `Transport Binding` sits outside the interaction core and must
  not be conflated with conversation or session identity.
- Decision 4: Companion, Guide Cat, Boss Cat, and future helpers must fit this
  vocabulary rather than inventing their own.

## Testing Strategy

- **Unit Tests**:
  mission/run identity helpers, transport-binding identity helpers, promotion
  rules
- **Integration Tests**:
  Telegram/direct-lane turn creation, mission-to-run lineage, Work-task
  promotion gates
- **Documentation/Design Verification**:
  terminology consistency across Chat, Work, Code, Companion, and transport
  docs

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Products keep using `task` and `job` interchangeably | High | Freeze vocabulary in docs and shared contracts first |
| Telegram/direct-lane identity still leaks through session ids | High | Add explicit transport-binding layer and observability fields |
| Work backlog becomes flooded with helper activity | High | Define promotion rules so only operator-manageable work becomes managed work |
| Background helpers invent product-local execution models | Medium | Require Guide/Companion/Code flows to reuse mission/run vocabulary |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created for agent missions, managed work, execution runs, and transport bindings |
| 2026-05-09 | Phase 1 (Freeze Taxonomy) recorded as already converged in `docs/terminology.md` (Entity / Agent / Participant / Conversational vs Operational vs Hybrid Agent / Managed Work / Mission / Run / Schedule + Trigger / Transport Binding all defined; `Job` flagged as overloaded legacy in favor of `Mission` / `Run`). Canonical record ownership lives in `CORE_CANONICAL_RECORD_FAMILIES` (`src/core/types.ts:21-34`) and the Managed Work / Execution layering in `docs/terminology.md` Managed Work and Execution Terms section. |
| 2026-05-09 | Phase 2 task 2.2 first slice landed: `src/core/missionLinkageValidation.ts` introduces `validateMissionLinkage` / `validateRunLinkage` / `validateCoreMissionRunLinkages` plus `findOrphanedMissionLinkages` and `findOrphanedRunLinkages` helpers that surface dangling references between missions/runs and their anchored records (`workItem`, `conversation`, `turn`, `lane`, `actor`, `task`, `parent run`, `metadata.runId`). Backed by `tests/mission-linkage-validation.test.ts`. |
| 2026-05-09 | Phase 2 task 2.3 first slice landed: `src/core/missionTriggers.ts` introduces canonical `MissionScheduleRule` (`cron`, `manual`) and `MissionTriggerEvent` (`cron`, `transport_ingress`, `owner_action`, `workflow_continuation`, `webhook`) shapes with `isMissionScheduleRule` / `isMissionTriggerEvent` validators and `withMissionTriggerEvent` / `withMissionScheduleRule` / `readMission*FromMetadata` helpers that store the rules under stable mission-metadata keys. Backed by `tests/mission-triggers.test.ts`. |
| 2026-05-09 | Shared mission/run status taxonomy landed: `src/core/missionStatus.ts` exports `MISSION_ACTIVE_STATUSES` / `MISSION_TERMINAL_STATUSES` / `MISSION_PRE_LAUNCH_STATUSES` / `RUN_ACTIVE_STATUSES` / `RUN_TERMINAL_STATUSES` and `isActive*` / `isTerminal*` / `isPreLaunchMission` / `isBlockedRun` predicates. `MyCatsProjection` now consumes `isActiveMission` from this module so projections cannot drift from the canonical classification. Backed by `tests/mission-status.test.ts`. |
| 2026-05-09 | Phase 2 task 2.4 first slice landed: `src/core/missionIdempotency.ts` introduces stable `metadata.idempotencyKey` keys for missions and runs plus `checkMissionIdempotency` / `checkRunIdempotency` / `findMission*ByIdempotencyKey` / `withMission*IdempotencyKey` helpers so replay-safe pipelines (cron tickers, transport ingress adapters, workflow continuations, webhooks, task checkouts) can dedupe on a stable key before issuing another upsert. Backed by `tests/mission-idempotency.test.ts`. |
| 2026-05-09 | Phase 3 task 3.4 first slice landed: `src/core/transportBindingObservability.ts` introduces `TransportBindingObservabilitySnapshot` consolidating bot binding hint (via `metadata.botBindingId`), transport binding identity (id / platform / direction / status / external thread key), bound conversation/participant/agent ids, and the matching SessionRecord identity (sessionId / runtimeKey / turnId / laneId / status). `buildTransportBindingObservabilitySnapshot` and `findSessionsForTransportBinding` keep durable transport identity separate from ephemeral runtime session identity. Backed by `tests/transport-binding-observability.test.ts`. |
| 2026-05-09 | Phase 4 tasks 4.1 / 4.2 first slice landed: `src/core/missionVisibility.ts` introduces `MissionVisibility` (`internal` / `work_facing` / `requires_review`), `classifyMissionVisibility`, and `suggestMissionPromotion` so projections and intake adapters share one rule for "should this mission appear on Work?" Work-anchored missions promote to the Work surface, terminal `failed` and explicitly review-flagged missions promote to a review inbox, drafts and completed background missions stay internal, and `metadata.visibility` overrides are honored above all inferred rules. Backed by `tests/mission-visibility.test.ts`. |
| 2026-05-09 | `CoreMissionRunProjectionItem` now carries `visibility` (computed via `classifyMissionVisibility`) and `CoreMissionRunProjectionQuery` accepts `visibilities?: MissionVisibility[]` so Work / Companion / Code surfaces can filter the shared mission projection without re-deriving the rule. Backed by `tests/mission-run-projection-visibility.test.ts` and verified that the legacy `tests/mission-run-projection.test.js` regression remains green after the additive change. |
| 2026-05-09 | Mission provenance summary landed: `src/core/missionProvenance.ts` exports `buildMissionProvenance` aggregating trigger event, schedule rule, parent mission link (`metadata.parentMissionId`), idempotency key, and intrinsic conversation/turn/lane source fields into one read-only summary; `findMissionLineage` walks the parent chain to the root with cycle and broken-link detection. `withMissionParentMissionId` / `readMissionParentMissionId` keep the parent metadata key consistent across producers. Backed by `tests/mission-provenance.test.ts`. |
| 2026-05-09 | Phase 3 task 3.2 first slice landed: `src/core/transportBindingDirectLane.ts` introduces `resolveTransportBindingDirectLane(core, bindingId)` returning a structured `TransportDirectLaneResolution` with status (`resolved` / `binding_not_found` / `no_conversation_linked` / `conversation_not_direct_lane` / `binding_disabled` / `binding_archived`) plus binding / conversation references and a human-readable reason. `resolveTransportTurnContextHint` returns the typed `{ conversationId, transportBindingId, conversationKind }` hint downstream canonical turn writes can adopt without re-resolving. `isDirectLaneConversationKind` keeps the direct-lane kind enum (currently just `direct_message`) in one place. Backed by `tests/transport-binding-direct-lane.test.ts`. |
| 2026-05-09 | One-stop mission inspection helper landed: `src/core/missionInspection.ts` exposes `inspectMission(core, missionId)` returning `MissionInspectionResult` that bundles the mission record, visibility classification, provenance summary, linkage diagnostics, managed-work record (when anchored), runs (matched by `mission.metadata.runId` and `run.metadata.missionId`), active and terminal run subsets, promotion decision, and parent-chain lineage. Useful for replay debug, audit tooling, and any UI that needs a coherent mission snapshot without composing six separate helper calls. Backed by `tests/mission-inspection.test.ts`. |
| 2026-05-09 | Symmetrical run inspection helper landed: `src/core/runInspection.ts` exposes `inspectRun(core, runId)` returning `RunInspectionResult` bundling the run record, lifecycle classification (`active` / `terminal` / `blocked`), idempotency key, linkage diagnostics, owning task / conversation, parent and child runs, orchestrator actor, owning mission (via `mission.metadata.runId`), missions back-referencing the run (via `run.metadata.missionId`), and the materialization records anchored on the run (traces, checkpoints, outcomes, artifacts). Backed by `tests/run-inspection.test.ts`. |

---

*Created: 2026-04-14*
*Author: Codex*
