# PLAN-099: Phase-Scoped Work Tool Surface Rollout

> Implementation plan for Cats-owned supervised Work tools that capture
> Chat/Telegram todos as Work Items and let Boss Cat triage and start work.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Completed |
| **Owner** | Codex |
| **Reviewer** | TBD |

## Related Spec

[SPEC-109: Phase-Scoped Work Tool Surface](../specs/SPEC-109-phase-scoped-work-tool-surface.md)

## Overview

Roll out the Work tool surface in small slices. The first slice should prove
that strong Cats can capture Work Items from Chat or Telegram through a
supervised tool boundary without starting execution. Later slices add triage,
Boss Cat execution preparation, and external issue tracker bindings.

## Implementation Phases

### Phase 1: Registry and Contract Skeleton

- [x] Task 1.1: Add Work tool entries to `docs/tool-calls.md`.
- [x] Task 1.2: Define TypeScript contract types for phase-scoped Work tools.
- [x] Task 1.3: Add supervised tool manifests for read-only proposal and
      local-state capture tools.
- [x] Task 1.4: Add schema validation helpers and error code constants.
- [x] Task 1.5: Add tests proving tools are filtered by phase, policy, and
      capability profile.

**Deliverables**: Registered tool names, manifests, validation scaffolding, and
policy-surface tests. No runtime model is using the tools yet.

### Phase 2: Intake Capture Delegate

- [x] Task 2.1: Implement a product-owned `work.item.propose_split` delegate
      that returns structured candidate Work Items without writing Core.
- [x] Task 2.2: Implement `work.item.capture` through the supervised boundary.
- [x] Task 2.3: Persist captured Work Items with source provenance metadata and
      idempotency keys.
- [x] Task 2.4: Emit tool-boundary evidence and Work Activity records for
      accepted/rejected capture attempts.
- [x] Task 2.5: Add tests for single capture, multi-item split proposal,
      idempotent retry, weak/unknown rejection, and source metadata.

**Deliverables**: Strong Cats can request intake capture through a supervised
tool path; capture writes only Work Items, not Tasks/Runs.

### Phase 3: Chat and Telegram Wiring

- [x] Task 3.1: Extend provider-agent observations so strong single-target Cats
      can receive policy-filtered intake tools when natural product-intent mode
      permits.
- [x] Task 3.2: Feed accepted tool results into the Chat message stream as
      owner-visible acknowledgement sidecars.
- [x] Task 3.3: Apply the same source-context builder to Telegram-originated
      messages.
- [x] Task 3.4: Preserve existing slash-mode `/work` and `/code` behavior while
      routing new natural-language capture through the shared tool surface.
- [x] Task 3.5: Add tests for web Chat and Telegram parity without writing
      live dev-state records.

**Deliverables**: Chat/Telegram natural-language todos can create visible Work
Items through the same contract.

### Phase 4: Triage Tools

- [x] Task 4.1: Implement `work.project.lookup` as a bounded read-only tool.
- [x] Task 4.2: Implement `work.project.create` with project-intent validation.
- [x] Task 4.3: Implement `work.item.update` with planning-status bounds.
- [x] Task 4.4: Implement `work.item.assign_project`.
- [x] Task 4.5: Add Work Graph projection tests for captured and triaged items.

**Deliverables**: Boss Cat and approved strong Cats can organize captured Work
without starting execution.

### Phase 5: Boss Cat Execution Preparation

- [x] Task 5.1: Add an execution-preparation phase resolver for owner requests
      such as "Boss Cat, start working through these".
- [x] Task 5.2: Implement `work.item.prepare_execution` as a no-side-effect
      proposal tool.
- [x] Task 5.3: Implement `work.task.create_from_work_item` behind existing
      supervision and approval gates.
- [x] Task 5.4: Ensure Task creation links through `WorkItem.taskId` and keeps
      WorkItem source provenance intact.
- [x] Task 5.5: Add tests proving capture and execution cannot occur in the
      same assistant turn without an owner-visible acknowledgement boundary.

**Deliverables**: Boss Cat can convert selected Work Items into supervised
execution plans and Tasks without bypassing policy gates.

### Phase 6: External Tracker Binding

- [x] Task 6.1: Define the MVP external Work binding metadata shape.
- [x] Task 6.2: Implement `work.external.link_issue` for manual URL/id binding.
- [x] Task 6.3: Add read-side projection fields for linked external issues.
- [x] Task 6.4: Add one adapter spike for GitHub Issues or Gitea import/export.
- [x] Task 6.5: Defer bidirectional sync until conflict policy and credential
      handling have a dedicated follow-up ADR/SPEC.

**Deliverables**: Work Items can link to external issues without making
external trackers the Cats system of record.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/tool-calls.md` | Modify | Register Work tool contracts as they land |
| `docs/agent-control-surfaces.md` | Modify | Cross-link Work tool surface when implementation begins |
| `src/platform/supervision/*` | Modify/Create | Register and gate Work supervised tools |
| `src/products/work/shared/*` | Create/Modify | Tool contract types and metadata helpers |
| `src/products/work/api/*` | Modify/Create | Product-owned delegates for Work mutations |
| `src/products/chat/state/runtime-dispatch/*` | Modify | Expose intake tools to strong Cats in bounded observations |
| `src/platform/transports/telegram/*` | Modify | Preserve Telegram source context for intake tools |
| `tests/*` | Create/Modify | Contract, policy, Chat, Telegram, and Work projection coverage |

## Technical Decisions

- Work tools are Cats-owned supervised tools first; MCP exposure is optional
  and later.
- Capture tools write Work Items only. They do not write Tasks, Missions, Runs,
  or runtime sessions.
- External tracker support starts with local bindings, not bidirectional sync.
- MVP metadata uses existing open-ended Core metadata instead of adding new
  Core fields.
- Weak/unknown Cats fail closed for mutating Work tools.

## Testing Strategy

- **Unit Tests**: Tool schema validation, phase filtering, idempotency keys,
  status bounds, metadata normalization.
- **Integration Tests**: Supervised tool boundary applies/rejects capture and
  triage requests against an isolated `MemoryCoreStore`.
- **Chat Tests**: Strong Cat observations include only the allowed intake tools;
  weak/unknown Cats do not receive mutating tools.
- **Telegram Tests**: Telegram-originated messages preserve transport source
  metadata and produce the same Work Item shape as web Chat.
- **Work Projection Tests**: Captured and triaged Work Items appear in Work
  list/detail/graph projections without fake Project anchors.
- **Manual Testing**: Use existing state or isolated test stores only; do not
  write demo Work Items into the user's persisted dev state without explicit
  approval.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Models over-create Work Items from casual chat | High | Require phase, strong-Cat gate, source context, and confirmation where mode demands it |
| Capture silently starts execution | High | Keep intake tools unable to create Tasks/Runs; test same-turn separation |
| Tool surface becomes broad CRUD | High | Register phase-scoped tools and enforce status/field bounds |
| External tracker sync dominates scope | Medium | Start with link/import/export bindings; defer bidirectional sync |
| Duplicate captures on retry | Medium | Use source-message and logical-item idempotency keys |
| Telegram group messages mutate shared work unexpectedly | Medium | Keep stricter confirmation as an open policy question before broad rollout |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-13 | Follow-up slice added Work tool descriptions to `toolIntent` manifests so plan responses and runtime metadata expose what each allowed Work tool does, not only its name. |
| 2026-05-13 | Follow-up slice expanded `work-memory` prompt roster text with explicit Work Item and Project capabilities so strong-model context states what the profile can do. |
| 2026-05-13 | Follow-up slice added Cat tool profiles to orchestrator prompt rosters so strong-model routing context can see which Cats are carrying `work-memory` capability posture. |
| 2026-05-13 | Follow-up slice surfaced existing Cat tool profiles in the Chat Add Cat panel so operators can distinguish `work-memory` Cats before assigning them. |
| 2026-05-13 | Follow-up slice exposed the Cat tool profile selector in the Chat Add Cat panel so Work-oriented Cats can be created directly from chat drafts and rooms. |
| 2026-05-13 | Follow-up slice removed the stale `/api/orchestrator` PUT legacy alias from docs and 405 Allow headers so the resource contract matches the implemented GET/PATCH surface. |
| 2026-05-13 | Follow-up slice added API regression coverage for unsupported `POST /api/cats` MCP profiles so create and update Cat writes share the same bounded rejection path. |
| 2026-05-13 | Follow-up slice consolidated Cats and settings Cats renderer profile view-support behind one shared registry so UI MCP profile labels stay aligned as profiles expand. |
| 2026-05-13 | Follow-up slice added API regressions for unsupported channel and global orchestrator MCP profile writes so all product profile entry points return bounded `400 bad_request` responses. |
| 2026-05-13 | Follow-up slice centralized remaining source MCP profile literals on `src/shared/catMcpProfiles.ts` and updated the Work tool-intent architecture boundary test for the shared registry. |
| 2026-05-13 | Follow-up slice synced MCP/API docs after channel and global orchestrator writes were moved onto the same MCP profile allow-list as Cats. |
| 2026-05-13 | Follow-up slice extended MCP profile validation to channel creation and global orchestrator updates so Cat, channel, and orchestrator product entries share the same profile allow-list. |
| 2026-05-13 | Follow-up slice documented the Cat MCP profile allow-list in the MCP guide, API docs, and SPEC-021 so future profiles go through the shared registry and product resolver. |
| 2026-05-13 | Follow-up slice added API regression coverage proving unsupported Cat MCP profile PATCH requests return a bounded `400 bad_request` response. |
| 2026-05-13 | Follow-up slice added a shared Cat MCP profile registry and model guards so Cat create/update accepts only supported `chat-memory` and `work-memory` profile ids. |
| 2026-05-13 | Follow-up slice surfaced Cat tool profile labels in Chat execution side panels and Cat inspect surfaces so direct-lane Work Cats remain visible outside settings. |
| 2026-05-13 | Follow-up slice surfaced Cat tool profile labels in the registry list so `work-memory` Cats are visible without opening the detail panel. |
| 2026-05-13 | Follow-up slice added create-time Cat tool profile selection so new Work-oriented Cats can be created with `work-memory` directly while `chat-memory` remains the implicit default. |
| 2026-05-13 | Follow-up slice exposed the Cat MCP/tool profile selector in Cats settings and entity detail panels so operators can switch Cats between `chat-memory` and `work-memory` without direct API calls. |
| 2026-05-13 | Follow-up slice blocked product-owned Work `tools/call` requests at `POST /api/runtime/mcp` before the runtime proxy, preserving the supervised Work boundary while MCP execution remains pending. |
| 2026-05-13 | Follow-up slice added Cat MCP profile mutation support so `PATCH /api/cats/:id` and model helpers can switch Cats onto `work-memory`, with channel read-model projection coverage. |
| 2026-05-13 | Follow-up slice synced control-surface and MCP docs with the landed `work-memory` planner/runtime-dispatch intent path while keeping Work MCP execution explicitly pending. |
| 2026-05-13 | Follow-up slice forwarded matched Work `toolIntent` into runtime dispatch `sendMessage` context metadata so the runtime/MCP adapter can see the same product-scoped Work tool posture; unmatched Work-memory turns omit the metadata. |
| 2026-05-13 | Follow-up slice added planner coverage for Boss Cat `work-memory` execution-preparation intent so explicit Work Item start requests surface `work.item.prepare_execution` and `work.task.create_from_work_item`. |
| 2026-05-13 | Follow-up slice added API-level orchestrator plan coverage proving `work-memory` Cats return Work triage tool intent through `POST /api/orchestrator/plan`, not only the direct planner unit seam. |
| 2026-05-13 | Follow-up slice wired Chat's orchestrator planner surface to project product-owned `work-memory` tool intent for explicit Work triage and external tracker binding turns, while suppressing generic runtime tools for unmatched Work-memory turns. |
| 2026-05-13 | Follow-up slice expanded Work `work-memory` tool-intent coverage across execution-preparation and external tracker binding phases, including read-only versus narrow-write allowed-tool projections. |
| 2026-05-13 | Follow-up slice added an architecture boundary regression so Work's `work-memory` tool-intent projection remains product-owned and platform orchestration does not import Work product internals. |
| 2026-05-13 | Follow-up slice added a product-owned `work-memory` tool-intent projection that maps Work phase, capability profile, and policy scope into runtime-facing Work tool names without wiring runtime MCP execution yet. |
| 2026-05-13 | Follow-up slice validated provider-agent observation policy dials and policy object shape so strong models only see supported supervision posture values. |
| 2026-05-13 | Follow-up slice hardened provider-agent observation summaries so malformed entries, unsupported fields, oversized source refs, and non-scalar values return validation errors without leaking prompt-visible payloads. |
| 2026-05-13 | Follow-up slice made provider-agent observation validation robust against malformed object fields and malformed tool arrays so contract checks return errors instead of throwing. |
| 2026-05-13 | Follow-up slice rejected unsupported provider-agent observation tool descriptor and manifest fields so product-built tool catalogs cannot leak extra prompt-visible metadata. |
| 2026-05-13 | Follow-up slice rejected unsupported nested provider-agent fields on targets, schema refs, and delegation budgets so model-authored object shapes stay exact through validation. |
| 2026-05-13 | Follow-up slice rejected unsupported model-authored fields on provider-agent decisions and semantic-plan steps so hidden scratchpads or server-resolved ids are not retained outside the contract. |
| 2026-05-13 | Follow-up slice guarded provider-agent semantic-plan step entries so malformed runtime JSON returns validation errors instead of throwing inside the validator. |
| 2026-05-13 | Follow-up slice validated provider-agent semantic-plan step targets so model-authored plan steps cannot carry unchecked runtime or worker-tool targets. |
| 2026-05-13 | Follow-up slice tightened provider-agent runtime decision parsing so strong-model responses must be exactly one JSON object, rejecting markdown or prose-wrapped decisions before policy gating. |
| 2026-05-13 | Follow-up slice hardened provider-agent tool descriptor and manifest validation so malformed model-visible tool catalog entries return bounded observation errors instead of entering prompts unchecked. |
| 2026-05-13 | Follow-up slice hardened provider-agent observation array validation so malformed tool catalogs, refs, summaries, invariants, or fallback lists return contract errors instead of throwing. |
| 2026-05-13 | Follow-up slice validated provider-agent expected output schema refs and required them to match the selected tool manifest output schema when supplied. |
| 2026-05-13 | Follow-up slice validated provider-agent addressable targets and required `tool_request` decisions to target the matching `worker_tool`. |
| 2026-05-13 | Follow-up slice blocked credential-bearing external tracker URLs from URL inference and Chat phase matching so unsafe links do not trigger model-visible binding tools. |
| 2026-05-13 | Follow-up slice rejected credential-bearing external tracker URLs at the Work tool surface and metadata builder so bindings cannot persist user:pass URLs. |
| 2026-05-13 | Follow-up slice validated provider-agent semantic-plan dependency graphs so `dependsOn` only references known, non-repeated, non-self steps. |
| 2026-05-13 | Follow-up slice validated provider-agent delegation/recovery summaries and delegation budgets so model-authored control decisions stay bounded and structured. |
| 2026-05-13 | Follow-up slice bounded provider-agent decision, plan, step, and rejected-action identifiers so model-authored ids cannot become oversized record payloads. |
| 2026-05-13 | Follow-up slice bounded provider-agent semantic-plan step counts and dependency lists so model-authored plans stay compact and type-safe. |
| 2026-05-13 | Follow-up slice guarded provider-agent semantic-plan steps against non-array runtime JSON, returning invalid-decision errors instead of crashing validation. |
| 2026-05-13 | Follow-up slice made provider-agent string validation runtime-JSON safe so malformed model decisions return contract errors instead of throwing type errors. |
| 2026-05-13 | Follow-up slice hardened provider-agent runtime JSON validation for task, summary, decision, step-action, and delegation enum values, rejecting unknown decision kinds as errors. |
| 2026-05-13 | Follow-up slice added Chat Work sidecar target checks so provider-agent tool requests must target the matching `worker_tool`. |
| 2026-05-13 | Follow-up slice carried Chat Work Project lookup `includeArchived` scope into result metadata and covered archived Project lookup. |
| 2026-05-13 | Follow-up slice bounded provider-agent recovery `correctedInput` with the same JSON argument-object limits used for tool inputs. |
| 2026-05-13 | Follow-up slice required provider-agent tool inputs to be JSON argument objects before applying bounded JSON limits. |
| 2026-05-13 | Follow-up slice made Chat Work provider-agent sidecars reject unexpected model-supplied input fields instead of silently ignoring server-resolved ids. |
| 2026-05-13 | Follow-up slice bounded provider-agent `tool_request.input` and semantic-plan step `input` as JSON-compatible values before tool routing. |
| 2026-05-13 | Follow-up slice moved `work.external.link_issue` `externalUpdatedAt` timestamp validation into the tool input validator so malformed tracker timestamps fail as schema errors. |
| 2026-05-13 | Follow-up slice made phase-scoped Work tool input validators reject unknown caller fields so model-supplied extras cannot be silently ignored. |
| 2026-05-13 | Follow-up slice synced the tool-call registry with provider-agent observation bounds for descriptors, summaries, context refs, invariants, budgets, and fallbacks. |
| 2026-05-13 | Follow-up slice synced ADR-105/SPEC-109 status to accepted and active/MVP implemented, documenting landed tool surfaces and remaining runtime/MCP/external-sync follow-ups. |
| 2026-05-13 | Follow-up slice validated provider-agent allowed fallback surfaces so recovery decisions only see supported, unique fallbacks that include the active policy fallback. |
| 2026-05-13 | Follow-up slice validated provider-agent observation budgets so strong-model seams always carry a positive hard-stop execution envelope. |
| 2026-05-13 | Follow-up slice bounded provider-agent observation summary counts and keys, closing another model-visible prompt expansion path. |
| 2026-05-13 | Follow-up slice bounded provider-agent observation `contextRefs` and `invariants` arrays so metadata-only prompt inputs stay compact. |
| 2026-05-13 | Follow-up slice bounded provider-agent tool descriptor reasons so model-visible tool metadata cannot become an unbounded prompt side channel. |
| 2026-05-13 | Follow-up slice locked Chat `cat_tool` intake observations to expose read-only `work.item.propose_split` hints while keeping direct capture hidden from model decisions. |
| 2026-05-13 | Follow-up slice locked Chat provider-agent Work observations to carry tool input hints for execution preparation, external binding, and triage actions. |
| 2026-05-13 | Follow-up slice added full Work observation coverage for provider-agent input hints, including intake read-only proposal versus narrow-write capture exposure. |
| 2026-05-13 | Follow-up slice locked the provider-agent runtime prompt contract so model-visible observations preserve Work tool input hints without exposing raw conversation content. |
| 2026-05-13 | Follow-up slice bounded provider-agent tool input hints in the observation validator so tool guidance stays compact and cannot become a raw prompt side channel. |
| 2026-05-13 | Follow-up slice added bounded `inputHints` to provider-agent Work tool descriptors so strong models can see allowed request fields directly in observations while server-side validation remains authoritative. |
| 2026-05-13 | Follow-up slice hardened Chat Work triage mutating sidecars to re-check owner intent cues before applying provider-agent `work.project.create`, `work.item.update`, or `work.item.assign_project` decisions. |
| 2026-05-13 | Follow-up slice added retry-dispatch coverage for provider-agent Work triage update sidecars, so rerunning an owner message preserves the same supervised Work write path. |
| 2026-05-13 | Follow-up slice added Telegram parity coverage for Chat provider-agent Work triage tool requests, preserving Telegram transport binding metadata while updating local Work Items. |
| 2026-05-13 | Follow-up slice exposed and executed explicit Chat provider-agent `work.item.assign_project` requests for local Work Item and Project refs, re-resolving both ids from owner text before writing Core. |
| 2026-05-13 | Follow-up slice exposed and executed explicit Chat provider-agent `work.item.update` requests for local Work Item refs, using server-resolved Work Item ids and bounded planning fields only. |
| 2026-05-13 | Follow-up slice exposed and executed explicit Chat provider-agent `work.project.create` requests through the Work triage delegate, with server-resolved conversation scope and bounded Project fields. |
| 2026-05-13 | Follow-up slice wired Chat provider-agent `work.project.lookup` tool requests into the Work triage delegate, returning bounded Project candidates without writing Core. |
| 2026-05-13 | Follow-up slice exposed read-only Work triage lookup in Chat provider-agent observations when owner text names explicit local Work refs, while keeping triage writes hidden under read-only policy. |
| 2026-05-13 | Follow-up slice aligned Chat provider-agent observation policy with explicit external binding tool exposure so local-state link/unlink turns carry a narrow-write policy instead of read-only dials. |
| 2026-05-13 | Follow-up slice wired Chat provider-agent `work.external.link_issue` / `work.external.unlink_issue` tool requests into the local Work binding delegate, re-resolving ids from owner text before writing Core metadata. |
| 2026-05-13 | Follow-up slice wired explicit external tracker binding requests into Chat provider-agent observations, exposing local-only link/unlink tools to strong Cats without leaking the raw external URL into observation refs. |
| 2026-05-13 | Follow-up slice added an explicit external tracker binding phase resolver for future Chat/Telegram tool exposure, matching only local Work refs plus supported external tracker URLs. |
| 2026-05-13 | Follow-up slice synced the tool-call registry after Work detail unlink UI landed for `work.external.unlink_issue`. |
| 2026-05-13 | Follow-up slice added Work Item and Project detail unlink actions for external tracker bindings, backed by the local-only unlink API and Work Graph refresh. |
| 2026-05-13 | Follow-up slice exposed `work.external.unlink_issue` through `DELETE /api/work/external-bindings` plus a renderer client, keeping unlink local-only and activity-audited. |
| 2026-05-13 | Follow-up slice added the supervised `work.external.unlink_issue` contract/delegate so incorrect external tracker bindings can be removed locally without contacting remote trackers. |
| 2026-05-13 | Follow-up slice synced API/tool-call docs for `POST /api/work/external-bindings`, manual UI binding, URL inference, GitHub adapter spike, and ADR-106's deferred automatic sync boundary. |
| 2026-05-13 | Follow-up slice added API-route coverage proving Project external tracker links persist metadata and emit project-scoped Activity evidence through `POST /api/work/external-bindings`. |
| 2026-05-13 | Follow-up slice added local external tracker URL inference so manual binding dialogs can prefill provider/type/id from common GitHub, GitLab, Bugzilla, Redmine, and Gitea URLs without remote calls. |
| 2026-05-13 | Follow-up slice added a Project detail manual external-tracker link dialog and factored Work Item/Project link creation through a shared Work external binding dialog. |
| 2026-05-13 | Follow-up slice added a Work Item detail manual external-tracker link dialog backed by the Work external binding API, refreshing Work Items and Work Graph after link creation. |
| 2026-05-13 | Phase 1 contract manifests, validation helpers, and policy/capability filtering tests landed in `4196128e4`. |
| 2026-05-13 | Phase 2 Work intake delegate implemented with split proposal, supervised capture, idempotent Core writes, source metadata, and isolated tests. |
| 2026-05-13 | Phase 3 source-context scaffolding added for Chat and Telegram observations; live runtime tool exposure and acknowledgement sidecars remain pending. |
| 2026-05-13 | Phase 3.1 exposed policy-filtered `work.item.propose_split` descriptors to strong single-target Cat observations; `work.item.capture` remains hidden behind narrow-write policy. |
| 2026-05-13 | Phase 3.2 added Chat/Telegram `work.item.propose_split` sidecars that use server-built source context, show candidate Work Items, and avoid durable Work writes. |
| 2026-05-13 | Phase 3 capture confirmation path added: owner choice on proposal sidecars calls the `work.item.capture` delegate and writes draft Work Items without direct model mutation. |
| 2026-05-13 | Phase 3.5 parity tests added for ordinary Chat decline and Telegram confirmed capture, all using isolated `MemoryChatStore` state. |
| 2026-05-13 | Phase 4.1 added read-only `work.project.lookup` contracts, triage delegate, and supervised boundary tests. |
| 2026-05-13 | Phase 4.2 added narrow-write `work.project.create` contracts, idempotent Project creation, audit Activity writes, and supervised boundary tests. |
| 2026-05-13 | Phase 4.3 added bounded `work.item.update` triage updates for title, summary, planning status, and triage metadata without execution side effects. |
| 2026-05-13 | Phase 4.4 added `work.item.assign_project` with non-archived Project prechecks, triage-status bounds, source-preserving Work Item updates, and supervised boundary tests. |
| 2026-05-13 | Phase 4.5 added Work Graph projection tests for newly captured orphan Work Items and triaged Work Items linked to Projects with Activity evidence anchors. |
| 2026-05-13 | Phase 5.1 added a pure execution-preparation phase resolver for Boss Cat requests over explicit, active, or visible Work Item refs without creating Tasks or Runs. |
| 2026-05-13 | Phase 5.2 added read-only `work.item.prepare_execution` proposals for selected Work Items with readiness, open questions, blockers, and no Core writes. |
| 2026-05-13 | Phase 5.3/5.4 added `work.task.create_from_work_item` to create pending-approval Tasks from ready Work Items, link `WorkItem.taskId`, preserve source metadata, and avoid Run/runtime start. |
| 2026-05-13 | Phase 5.5 added a same-run/action intake boundary guard so newly captured Work Items cannot become execution Tasks until a later owner-visible acknowledgement request. |
| 2026-05-13 | Phase 6.1 added the `externalWorkBindings` metadata shape, provider/type/sync enums, normalization, validation, and contract tests without external network calls. |
| 2026-05-13 | Phase 6.2 added `work.external.link_issue` for manual Work Item/Project metadata links with supervised narrow-write gating, idempotent retries, and no external API calls. |
| 2026-05-13 | Phase 6.3 projected valid external Work bindings onto Project and Work Item graph summaries while ignoring malformed metadata. |
| 2026-05-13 | Phase 6.4 added a GitHub Issues adapter spike with injectable fetch, Work import draft mapping, pull-request rejection, and export payload building without remote writes. |
| 2026-05-13 | Phase 6.5 added ADR-106, deferring automatic bidirectional external Work sync until credentials, conflict policy, remote write approval, and audit semantics have a dedicated design. |
| 2026-05-13 | Follow-up slice exposed read-only Boss Cat execution-preparation tools in Chat bounded observations when an explicit start/work-through request matches visible Work Items, while keeping Task creation hidden under read-only policy. |
| 2026-05-13 | Follow-up slice wired `work.item.prepare_execution` requests into Chat sidecars that use server-resolved visible Work Item refs and produce owner-visible proposals without creating Tasks or Work runs. |
| 2026-05-13 | Follow-up slice added owner-confirmed execution-preparation choices: confirming a Boss Cat proposal creates pending-approval Tasks from ready Work Items through `work.task.create_from_work_item` without starting new runtime runs. |
| 2026-05-13 | Follow-up slice hardened the Work supervised-run route so pending-approval Tasks cannot start queued or runtime-backed Work runs before owner approval. |
| 2026-05-13 | Follow-up slice made execution Tasks inherit Work Item assignees, or fall back to the Boss actor, so owner-approved Tasks have an actor for dispatch wakeups. |
| 2026-05-13 | Follow-up slice stamps execution Tasks with Work planning metadata (`productHint: work`, `strategyHint: pdca`) so downstream dispatch treats them as Work execution instead of generic chat. |
| 2026-05-13 | Follow-up slice added Work Task detail approval actions so pending Boss-created execution Tasks can be approved or rejected through the existing Core approval route before supervised runs start. |
| 2026-05-13 | Follow-up slice added a Work Task detail action that starts a supervised Work run for approved Boss-created execution Tasks and routes the owner into the run detail. |
| 2026-05-13 | Follow-up slice added Work Task detail paths to Boss execution-preparation transition metadata and Chat system messages so the owner can find the approval/start screen after Task creation. |
| 2026-05-13 | Follow-up slice added War Room approve/reject buttons for dashboard-projected task action envelopes, refreshing Work dashboard/task/graph data after decisions. |
| 2026-05-13 | Follow-up slice promoted the approved Work Task start action into the Task detail top bar so Chat-linked Tasks can be started without hunting through the Runs section. |
| 2026-05-13 | Follow-up slice made internal `/work`, `/chat`, and `/code` paths clickable in web message bodies so Boss-created Task paths in Chat system messages route back into the product. |
| 2026-05-13 | Follow-up slice changed internal message-body route links to React Router links so Chat-to-Work navigation stays inside the app shell. |
| 2026-05-13 | Follow-up slice added Telegram inline keyboard callback support for Work intake proposal sidecars so Telegram owners can confirm or ignore captured todos through the same Chat choice-response path. |
| 2026-05-13 | Follow-up slice added Telegram inline keyboard callback support for Boss Cat execution-preparation sidecars so owners can create pending-approval Tasks from Telegram through the existing choice-response path. |
| 2026-05-13 | Follow-up slice surfaced Work Graph external tracker bindings on Work Item detail pages with safe external links, making GitHub/Redmine/Bugzilla-style issue seams visible outside the top-down drawer. |
| 2026-05-13 | Follow-up slice carried external tracker binding summaries into the Work Item list projection and rendered compact tracker chips on the Work Items list. |
| 2026-05-13 | Follow-up slice carried Project external tracker binding summaries into Project list/detail surfaces with compact list chips and safe detail links. |
| 2026-05-13 | Follow-up slice added `POST /api/work/external-bindings` plus a renderer client so product surfaces can manually link Projects or Work Items to external tracker records through the Work API. |
| 2026-05-13 | Plan created with ADR-105 and SPEC-109 as the governing docs. |

---

*Created: 2026-05-13*
*Author: Codex*
