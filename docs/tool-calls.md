# Tool Call Registry

> Central registry for Cats-owned agent/runtime tool call contracts.

## Purpose

This document is the discoverability surface for tool calls exposed to agents,
runtime bridges, or product-owned automation. It is a child registry of
[agent-control-surfaces.md](./agent-control-surfaces.md). A tool call must not
live only in an individual SPEC file. Feature specs may explain why a tool
exists and define deep domain behavior, but this registry owns the stable list
of tool names, channels, caller visibility, implementation entry points, and
schema summaries.

`docs/api.md` remains the public HTTP API document. Tool calls belong here
unless they are also exposed as HTTP routes; in that case the HTTP route must be
documented in `docs/api.md` and cross-linked from this registry.

## Update Rules

Update this document whenever a Cats-owned tool call is added, renamed, removed,
or changes its caller-visible contract.

Each entry should include:

- tool name
- owning product or platform layer
- status
- channel
- intended caller
- implementation entry point
- related SPEC / ADR / PLAN
- input and output shape summary
- server-resolved fields that callers must not send
- persistence and activity side effects
- idempotency rule
- notable error codes

The canonical executable schema should live in TypeScript near the tool
implementation when possible. This registry should summarize and link to it
rather than duplicating every validation branch.

## Channels

| Channel | Meaning | Public HTTP API? |
|---------|---------|------------------|
| `runtime_tool` | Tool appears in a runtime session tool catalog and is callable by an agent / assistant through the runtime loop. | No |
| `runtime_bridge_delegate` | Server-side runtime bridge code calls an internal product delegate when it observes a known output. | No |
| `product_internal_delegate` | Product UI or service code calls an in-process delegate, not a user-facing HTTP route. | No |
| `mcp_tool` | Tool is exposed through an MCP facade. | No, unless the same operation also has an HTTP route |
| `http_route` | Tool-like operation is exposed as a product HTTP endpoint. | Yes |

## Registry

| Tool | Owner | Status | Channel | Caller | Contract |
|------|-------|--------|---------|--------|----------|
| `cats.runtime.session.create` | Platform supervision | Implemented | `product_internal_delegate` | Platform runtime wrapper | [Runtime Supervision Tools](#runtime-supervision-tools) |
| `cats.runtime.message.send` | Platform supervision | Implemented | `product_internal_delegate` | Platform runtime wrapper | [Runtime Supervision Tools](#runtime-supervision-tools) |
| `cats.lifecycle.run.spawn` | Platform supervision | Implemented | `product_internal_delegate` / future `runtime_tool` | Supervised run agent / Work delegate | [Lifecycle Tools](#lifecycle-tools) |
| `work.context.lookup` | Cats Work | Implemented test vertical slice | `product_internal_delegate` / future `runtime_tool` | Work supervised agent | [Work Supervised Tools](#work-supervised-tools) |
| `work.local_note.apply` | Cats Work | Implemented test vertical slice | `product_internal_delegate` / future `runtime_tool` | Work supervised agent | [Work Supervised Tools](#work-supervised-tools) |
| `work.approval_gated.apply` | Cats Work | Implemented test vertical slice | `product_internal_delegate` / future `runtime_tool` | Work supervised agent | [Work Supervised Tools](#work-supervised-tools) |
| `work.sop.classify_text_batch` | Cats Work | Implemented test vertical slice | `product_internal_delegate` / worker tool | Work SOP worker | [Work Supervised Tools](#work-supervised-tools) |
| `work.sop.ask_weak` | Cats Work | Implemented test vertical slice | `product_internal_delegate` / worker tool | Work SOP worker | [Work Supervised Tools](#work-supervised-tools) |
| `work.item.propose_split` | Cats Work | Product delegate, strong-Cat observation descriptor, and Chat sidecar executor implemented; runtime adapter tool loop pending | `product_internal_delegate` / future `runtime_tool` | Strong Cat / Boss Cat intake | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `work.item.capture` | Cats Work | Product delegate and owner-confirmed Chat sidecar capture implemented; direct model/runtime exposure pending | `product_internal_delegate` / future `runtime_tool` | Owner-confirmed intake / future Strong Cat / Boss Cat intake | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `work.item.update` | Cats Work | Product delegate implemented; live observation exposure pending | `product_internal_delegate` / future `runtime_tool` | Strong Cat / Boss Cat triage with narrow-write grant | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `work.item.assign_project` | Cats Work | Product delegate implemented; live observation exposure pending | `product_internal_delegate` / future `runtime_tool` | Strong Cat / Boss Cat triage with narrow-write grant | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `work.item.prepare_execution` | Cats Work | Product delegate implemented; live observation exposure pending | `product_internal_delegate` / future `runtime_tool` | Boss Cat execution preparation with read-only grant | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `work.task.create_from_work_item` | Cats Work | Product delegate implemented; live observation exposure pending | `product_internal_delegate` / future `runtime_tool` | Boss Cat execution preparation with narrow-write grant | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `work.external.link_issue` | Cats Work | Product delegate implemented; external API sync/import pending | `product_internal_delegate` / future `runtime_tool` | Owner-approved strong Cat / Boss Cat / product UI with narrow-write grant | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `work.project.lookup` | Cats Work | Product delegate implemented; live observation exposure pending | `product_internal_delegate` / future `runtime_tool` | Strong Cat / Boss Cat triage | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `work.project.create` | Cats Work | Product delegate implemented; live observation exposure pending | `product_internal_delegate` / future `runtime_tool` | Strong Cat / Boss Cat triage with narrow-write grant | [Phase-Scoped Work Tools](#phase-scoped-work-tools) |
| `declare_artifact` | Cats Code | Active-session onboarding, submit route, materialization, activity, runtime execution helper, assistant-effect processor, live dispatch persistence, and local tool-result projection wired; live tool-result loop pending | `runtime_tool` first; bridge/user delegates later | Code assistant / runtime bridge / Code UI import flow | [Declare Artifact](#declare_artifact) |
| `show_in_canvas` | Cats Code | Planned by SPEC-101 / PLAN-090 | `runtime_tool` plus product-internal delegate | Code assistant / product delegates that want to request canvas navigation | [Artifact Canvas Tools](#artifact-canvas-tools) |
| `clear_canvas` | Cats Code | Planned by SPEC-101 / PLAN-090 | `runtime_tool` plus product-internal delegate | Code assistant / product delegates that want to request parent-surface navigation | [Artifact Canvas Tools](#artifact-canvas-tools) |

## Supervised Tool Contract

Platform-supervised tools share the `SupervisedToolManifest` and
`ToolResult<T>` contract from `src/platform/supervision/contracts.ts`.
Invocation crosses `src/platform/supervision/toolBoundary.ts`, which applies
manifest authorization, policy scope, approval, rejection, and evidence.

Tool result statuses are:

- `applied`
- `pending_approval`
- `rejected`

These tools are part of the broader agent control surface registry described in
[agent-control-surfaces.md](./agent-control-surfaces.md).

## Runtime Supervision Tools

| Tool | Implementation | Blocking | Side effect | Approval | Evidence | Notes |
|------|----------------|----------|-------------|----------|----------|-------|
| `cats.runtime.session.create` | `src/platform/supervision/runtimeBoundary.ts` | `blocking` | `expensive` | `policy` | `summary` | Creates a `cats-runtime` session through the supervised runtime wrapper. |
| `cats.runtime.message.send` | `src/platform/supervision/runtimeBoundary.ts` | `blocking` | `expensive` | `policy` | `summary` | Sends a message to an existing `cats-runtime` session through the supervised runtime wrapper. |

Both tools stamp `RuntimeSupervisionContext` metadata into the runtime request.
They are implementation tools for platform runtime calls, not public HTTP APIs.

## Lifecycle Tools

| Tool | Implementation | Blocking | Side effect | Approval | Evidence | Notes |
|------|----------------|----------|-------------|----------|----------|-------|
| `cats.lifecycle.run.spawn` | `src/platform/supervision/lifecycleTools.ts` | `async` | `local_state` | `policy` | `summary` | Spawns a managed child run under parent-run ancestry and budget caps. |

`status: 'applied'` for this async lifecycle tool means the child run or
lifecycle request was created; it does not mean the child work completed.

## Work Supervised Tools

These are first-slice Work supervision tools used to prove policy, evidence,
approval, cancellation, and weak-worker boundaries.

| Tool | Implementation | Side effect | Approval | Evidence | Notes |
|------|----------------|-------------|----------|----------|-------|
| `work.context.lookup` | `src/platform/supervision/workSupervisedTools.ts` | `none` | `never` | `summary` | Reads Work context projection data. |
| `work.local_note.apply` | `src/platform/supervision/workSupervisedTools.ts` | `local_state` | `policy` | `summary` | Applies a local draft note for a Work run. |
| `work.approval_gated.apply` | `src/platform/supervision/workSupervisedTools.ts` | `external_visible` | `always` | `summary` | Applies a mutation only after operator approval. |
| `work.sop.classify_text_batch` | `src/platform/supervision/workSupervisedTools.ts` | `none` | `never` | `summary` | Classifies a small text batch through a strict SOP worker shell. |
| `work.sop.ask_weak` | `src/platform/supervision/workSupervisedTools.ts` | `none` | `never` | `summary` | Asks a weak worker through a schema-required SOP shell and bounded budget. |

## Phase-Scoped Work Tools

These Work tools are the first contract slice from
[ADR-105](./decisions/105-adopt-phase-scoped-work-tool-surface.md),
[SPEC-109](./specs/SPEC-109-phase-scoped-work-tool-surface.md), and
[PLAN-099](./plans/PLAN-099-phase-scoped-work-tool-surface-rollout.md). They
are product-owned supervised tool contracts for Chat/Telegram Work intake. The
product delegate and bounded Chat/Telegram source-context refs exist.
`work.item.propose_split` is now advertised as a policy-filtered descriptor in
strong single-target Cat observations when natural product-intent mode permits.
Provider-agent `tool_request` decisions for that tool are handled by the Chat
dispatch sidecar executor, which rebuilds source context server-side before
running the product delegate. Proposal sidecars expose an owner confirmation
choice; confirmed choices call the `work.item.capture` delegate server-side and
write draft Work Items. Runtime adapter tool-result loops, MCP exposure, and
direct `work.item.capture` observation exposure are still pending.

Implementation entry point:
`src/products/work/shared/workToolSurface.ts` for contracts and
`src/products/work/shared/workIntakeSourceContext.ts` for bounded source refs.
`src/products/work/state/workIntakeDelegate.ts` owns the product intake
delegate. `src/products/work/state/workTriageDelegate.ts` owns the bounded
Project lookup/create triage delegates.
`src/products/work/state/workExecutionPreparationDelegate.ts` owns the
read-only Boss Cat execution-preparation proposal delegate.
`src/products/work/state/workExecutionTaskDelegate.ts` owns the pending-approval
Task creation delegate. `src/products/work/state/workExternalBindingDelegate.ts`
owns manual external issue binding writes, and
`src/products/chat/state/workIntakeSourceContext.ts` maps Chat and Telegram
turns onto the shared source context.

| Tool | Phase | Side effect | Approval | Evidence | Notes |
|------|-------|-------------|----------|----------|-------|
| `work.item.propose_split` | `intake` | `none` | `never` | `summary` | Proposes candidate Work Items from one owner Chat or Telegram source. It does not write Core. |
| `work.item.capture` | `intake` | `local_state` | `policy` | `summary` | Captures one draft or planned Work Item from owner-provided source text. It must not create Tasks, Missions, Runs, or runtime sessions. |
| `work.item.update` | `triage` | `local_state` | `policy` | `summary` | Applies bounded updates to one existing Work Item in a triage-editable status. It may update title, summary, planning status, and triage metadata only; it must not create Tasks, Missions, Runs, runtime sessions, or Project links. |
| `work.item.assign_project` | `triage` | `local_state` | `policy` | `summary` | Attaches one existing triage-editable Work Item to one existing non-archived Project while preserving source provenance. It must not create Projects, Tasks, Missions, Runs, or runtime sessions. |
| `work.item.prepare_execution` | `execution_preparation` | `none` | `never` | `summary` | Proposes Task-ready execution payloads for selected Work Items. It returns readiness, open questions, blockers, and proposed Task title/summary without writing Core. |
| `work.task.create_from_work_item` | `execution_preparation` | `local_state` | `policy` | `summary` | Creates one pending-approval Task from one ready Work Item and links it through `WorkItem.taskId`. It does not create Runs or runtime sessions. |
| `work.external.link_issue` | `external_tracker_binding` | `local_state` | `policy` | `summary` | Manually links one Work Item or Project to an external issue/ticket/project by writing local metadata only. It does not call external tracker APIs. |
| `work.project.lookup` | `triage` | `none` | `never` | `summary` | Looks up bounded Project matches for Work Item triage. It returns project ids, titles, planning status, summary/repo/conversation refs, and linked Work Item counts. |
| `work.project.create` | `triage` | `local_state` | `policy` | `summary` | Creates one planned/active/paused Project during triage. It writes only a Project and one audit Activity; it must not create Work Items, Tasks, Missions, Runs, or runtime sessions. |

Caller-visible intake fields are intentionally bounded: title, summary,
source reference, Work Item kind, priority hint, draft/planned status,
suggested Project title, and open questions. Callers must not supply
server-resolved fields such as `workItemId`, `projectId`, `taskId`,
`missionId`, `runId`, actor ids, or timestamps. Current validation helpers
reject execution statuses such as `in_progress`, `completed`, `cancelled`, and
`archived` for intake capture.

Caller-visible triage update fields are `workItemId`, `title`, `summary`,
`status`, Work Item kind, priority hint, assignment hint, and open questions.
The `workItemId` is a bounded handle selected from Cats Work context; Project
ids, Task ids, Mission ids, Run ids, owner actor ids, assigned actor ids, and
timestamps remain server-resolved. Triage status changes are bounded to
`draft`, `planned`, `ready`, and `blocked`; `in_progress`, `completed`,
`cancelled`, and `archived` remain outside this phase.

Caller-visible Project assignment fields are `workItemId`, `projectId`, and an
optional note. Both ids must come from bounded Cats Work context. The delegate
rejects archived Projects and Work Items outside triage-editable statuses.

Caller-visible execution-preparation fields are `workItemIds`, optional
`executionGoal`, and optional `maxItems`. The delegate accepts only
`draft`, `planned`, `ready`, and `blocked` Work Items and returns proposals
with readiness (`ready`, `needs_triage`, or `blocked`), proposed Task
title/summary, open questions, blockers, and Project anchor when present.
It does not create Tasks, Missions, Runs, Activities, runtime sessions, or
Work Item links.

Caller-visible Task creation fields are `workItemId`, optional `title`,
optional `summary`, and optional `approvalNote`. The Work Item must already be
`ready`. Task ids, Run ids, actor ids, assignment ids, approval state, and
timestamps remain server-resolved. The delegate creates a deterministic
pending-approval Task, writes an approval binding against the Work Item, links
`WorkItem.taskId`, preserves the Work Item's source metadata, and emits an
approval-requested Activity. Runtime checkout and Run creation remain separate
approval-gated execution steps. Work Items captured by intake in the same
supervised run/action are rejected until a later owner-visible acknowledgement
boundary starts a separate execution-preparation request.

Caller-visible external binding fields are `localKind`, `localId`, `provider`,
optional `externalType`, `externalId`, optional `externalUrl`, optional
`syncDirection`, optional `externalUpdatedAt`, and optional `note`. The MVP
provider set is `github`, `gitlab`, `gitea`, `redmine`, and `bugzilla`; the
delegate writes the `externalWorkBindings` metadata key on the Work Item or
Project and emits one Activity for material changes. It does not read from or
write to external services. The Work Graph projection exposes valid local
bindings on Project and Work Item summaries as `externalBindings[]` so Cockpit,
System Map, and model observations can show external issue links without
reading raw metadata bags. The first GitHub Issues adapter spike maps a single
issue into a Work Item import draft and builds future create-issue payloads
through an injectable fetch boundary; it performs no remote writes.

Caller-visible triage lookup fields are `query`, `limit`, and
`includeArchived`. Caller-visible triage create fields are `title`, `summary`,
`status`, `repoPath`, and `primaryConversationId`; create status is bounded to
`planned`, `active`, or `paused`. Project ids and counts are always
server-resolved.

## `declare_artifact`

Declares that a Code-session output is worth recording as an Artifact. It is not
a transcript command; runtime tool calls are the primary path, and the Code API
also exposes the authoritative declaration submit route for product-owned
callers.

| Field | Value |
|-------|-------|
| Owning product | Cats Code |
| Current status | Code-origin active sessions receive the onboarding block at session create and runtime context metadata at session create / message send. Returned `declare_artifact` `tool_use` segments are observed, materialized through the Code delegate, persisted to Core, projected into local `tool_result` segments, and checked by structured finalization enforcement for `artifactClaims[]`. Runtime tool-result delivery back to the assistant remains pending. |
| First channel | `runtime_tool` |
| Tool name | `declare_artifact` |
| Implementation entry point | `src/products/code/shared/artifactDeclaration.ts` |
| Active-session wiring | `src/products/code/state/runtimeArtifactTooling.ts` |
| Finalization helper | `src/products/code/state/sessionFinalization.ts` |
| Related SPEC | [SPEC-092](./specs/SPEC-092-code-artifact-declaration-contract.md) |
| Related ADR | [ADR-088](./decisions/088-use-structured-artifact-declarations-for-code-materialization.md) |
| Related PLAN | [PLAN-081](./plans/PLAN-081-code-artifact-declaration-rollout.md) |

### Caller-Visible Input

The agent-visible runtime tool schema exposes only:

- `declarationId: string`
- `label: string`
- `title: string`
- `location: { kind, value? }`
- `summary?: string | null`
- `metadata?: Record<string, unknown>`

Supported `location.kind` values:

- `none`
- `local_path`
- `url`
- `inline_summary`
- `external_ref`

Server-resolved fields are not caller-visible and must not be supplied with
non-null values:

- `producer.*`
- authoritative `conversationId`
- authoritative `taskId`
- authoritative `runId`
- authoritative `workspaceKey`
- `anchors.*`
- `coreKind`
- `requestedDisposition`
- `requestedStatus`

Supplying a non-null server-resolved field rejects the call with
`artifact_producer_field_not_allowed`.

### Active-Session Wiring

Runtime invocation enrichment is registered through the platform runtime
invocation-enricher registry. Chat calls the platform registry and does not
import Code artifact tooling directly. Enrichers run in ascending `priority`
order, with equal priorities ordered by id. Products should use the exported
priority bands (`EARLY = -100`, `NORMAL = 0`, `POST_PROCESS = 100`) rather than
inventing ad hoc values. Enrichers return partial contributions only; the
platform merges those contributions onto the original runtime invocation so a
product hook cannot accidentally drop provider/model/workspace fields. Context
contributions are merged by platform contract: labels append with
de-duplication, metadata merges by top-level key, workspace fields merge
shallowly, `undefined` means "leave unchanged", and `instructions: null`
explicitly clears the outgoing instruction text. Context fields do not accept
`null` clear semantics. Metadata same-key sub-objects are replaced wholesale
rather than deep-merged; multiple enrichers writing the same metadata key must
coordinate on a shared shape. Metadata values must be structured-cloneable.
Each enricher receives a cloned view of the current invocation context, so
accidental mutation cannot alter later enrichers or the final invocation.
Enricher contributions are also structured-clone validated before merge, so a
non-cloneable metadata value is attributed to the enricher that returned it
rather than to a later hook that happened to receive the merged context.
Assistant metadata contributions are stored under each enricher id rather than
flattened into Chat metadata.

When a chat/channel originates from Cats Code (`originSurface = "code"`),
activation of `+New code`, `+Team code`, or a `+Peer code` member channel
enriches the runtime session-create request with:

- the SPEC-092 onboarding block, including
  `codeArtifactDeclaration.onboardingBlockVersion`;
- runtime context metadata at `metadata.codeArtifactDeclaration` with the
  tool name, schema version, onboarding version, agent-visible field list,
  producer labels, finalization envelope name, source channel id/title, and
  workspace path when known.

Each runtime message send repeats the lightweight context metadata so observers
can identify the active Code artifact contract, but it does not resend the full
onboarding block. The first implementation relies on the session-create system
prompt retaining the onboarding block; resume / compaction re-injection remains
the follow-up path from SPEC-092 / PLAN-081.

The current Cats Platform receiver also preserves `toolArgs` on runtime
`tool_use` segments and records same-turn `declare_artifact` observations as
`runtimeAssistantMetadata["cats-code.artifact-declaration"].codeArtifactToolCalls`
metadata on the terminal assistant segment. These observations are shape
summaries only.

`src/products/code/state/runtimeArtifactExecution.ts` is the first native
runtime execution helper. Given Code-origin channel metadata, observed runtime
segments, and server-resolved producer / anchor context, it executes
`declare_artifact` calls through the same Code materialization delegate used by
the HTTP submit route and returns `CodeArtifactToolResult` values. This helper
is registered behind the platform assistant-effect processor registry, so
runtime surfaces can apply artifact side effects without importing Code
internals. The chat runtime dispatch loop invokes that registry after a runtime
message result and applies artifact side effects with `coreStore.updateCore`,
so concurrent dispatches operate on the latest Core snapshot instead of
overwriting one another with stale snapshots. Assistant-effect processors expose
a turn predicate, so ordinary assistant text replies do not open a Core write
when no product-owned tool call is present. Accepted / rejected declaration
results are recorded in assistant-message metadata under
`runtimeAssistantMetadata["cats-code.artifact-declaration"].codeArtifactToolResults`.
The same results are also projected into local runtime `tool_result` segments
so the persisted turn has a `tool_use` -> `tool_result` trace. These projected
segments are not yet sent back to the assistant through a live runtime
tool-result loop. The Code finalization gate is now registered at visible
response commit time for structured `artifactClaims[]`. Runtime adapters can
deliver that envelope as a `finalization` stream event or in
`result.finalization` / `result.finalizationEnvelope`; unmatched claims block the
assistant response before it is appended. Text heuristics are still not used.

### Output Summary

The scaffold exposes two related result shapes:

- `CodeArtifactToolShapeResult` is used by the current no-flow helper after
  local shape validation only. It never claims server acceptance.
- `CodeArtifactToolResult` is reserved for the wired declaration path after
  server validation / materialization has accepted or rejected the declaration.

```ts
type CodeArtifactToolShapeResult =
  | {
      status: 'shape_ok';
      declarationId: string;
      input: CodeArtifactToolInput;
    }
  | {
      status: 'rejected';
      error: {
        code: CodeArtifactDeclarationErrorCode;
        message: string;
        details?: unknown;
      };
    };

type CodeArtifactToolResult =
  | {
      status: 'accepted';
      declarationId: string;
      disposition: 'record' | 'candidate';
      artifactId?: string | null;
      artifactStatus?: 'draft' | 'ready' | 'published' | null;
    }
  | {
      status: 'rejected';
      error: {
        code: CodeArtifactDeclarationErrorCode;
        message: string;
        details?: unknown;
      };
    };
```

`shape_ok` means only that the agent-visible payload is locally normalized and
passed context-free checks such as required fields, location format, and
metadata bounds. It does **not** mean anchors, workspace containment,
idempotency, producer identity, policy, or Core persistence succeeded.

For `local_path`, the current helper performs context-free lexical
normalization only: separators are normalized, `.` / `..` segments are
collapsed, and URL-like / null-byte values are rejected. The normalized output
marks the location with **two** internal verification fields:

- `verification.workspaceContainment = 'unverified'` — must be cleared by the
  server materialization path after validating the path against the resolved
  workspace.
- `verification.pathCaseCanonicalization = 'unverified'` — must be cleared by
  the server after applying the host-OS case rule (Windows lowercases the
  drive letter and the entire path; Linux/macOS keeps case). The context-free
  helper preserves drive-letter case verbatim because it does not know the
  host OS.

Both markers are internal, not caller-visible (the agent-visible tool input
schema does not declare `verification`, and the normalizer reads only `kind`
and `value` so any agent-supplied `verification` is silently dropped). They
must be cleared independently by the server.

URL values are canonicalized through the platform `URL` constructor (which
adds a trailing slash for origin-only URLs such as `http://127.0.0.1:5173/`),
so agents should use the returned canonical form when composing related
identifiers. `inline_summary` and `external_ref` are persisted in trimmed
form; for `inline_summary`, `summary` and `location.value` are not required
to match when the producer supplies both — `summary` is the short caller-
facing description and `location.value` carries the full inline content.

Edge cases the helper does NOT handle (documented in SPEC-092 § Location
Rules): UNC paths (`\\server\share\...`) lose their double-slash prefix
after separator normalization; drive-relative paths (`C:foo` without a
slash after the colon) are conservatively rejected as URL-like.

`accepted` shall be returned only after the server-side declaration path has
accepted the declaration. `disposition` reports whether the declaration became a
`record` or `candidate`; `artifactStatus` reports the Core artifact status only
when a `CoreArtifactRecord` exists.

### Persistence and Activity

The full materialized flow is defined by SPEC-092:

- accepted `record` declarations upsert `CoreArtifactRecord`
- material changes emit background `artifact_recorded` activity
- idempotent no-op retries do not emit duplicate activity
- Artifacts sidebar projections read materialized Core artifact rows

The current implementation provides the tool contract classes, finalization
gate helpers, the first Code-owned materialization delegate for normalized
declarations, the Code product submit route, a runtime execution helper for
observed `declare_artifact` `tool_use` segments, and a platform-registered
assistant-effect processor. The delegate writes accepted declarations into
`CoreArtifactRecord` with canonical idempotency metadata and deterministic
artifact ids. The Code product API exposes
`POST /api/code/artifacts/declarations` as the first authoritative submit route
into that delegate. Materialized create/update operations emit idempotent
background `artifact_recorded` activities keyed by the material-change
signature; exact no-op replays do not duplicate activity. Live dispatch-loop
registry invocation now persists observed Code declarations. Tool-result
delivery back into the runtime loop and frozen-scope fallback recovery remain
follow-up slices.

### Idempotency

Agents should reuse the same `declarationId` for the same logical output.
Server-side idempotency key construction and frozen-scope retry behavior are
defined in SPEC-092.

### Final Response Gate

If an assistant final response claims that an artifact was produced or recorded,
the finalization envelope must include an `artifactClaims[]` entry whose
`declarationId` matches an accepted same-turn `declare_artifact` result.
Unmatched claims are blocked with `artifact_claim_without_declaration`.
Runtime finalization data is namespaced under
`runtimeFinalization.codeArtifactFinalization`; flat `runtimeFinalization`
payloads are ignored so future product gates can coexist without key
collisions.

### Error Codes

The source of truth is [SPEC-092 § Error Code Registry](./specs/SPEC-092-code-artifact-declaration-contract.md#error-code-registry).
The scaffolded TypeScript helper currently throws only the context-free
shape/location/metadata subset from that registry, while finalization may return
`artifact_claim_without_declaration`.

## Artifact Canvas Tools

These planned Cats Code tools control presentation focus in the right-hand
Artifact Canvas pane. They are intentionally separate from `declare_artifact`:
`declare_artifact` records the output; the canvas tools choose what the
active product surface opens in the shared Artifact Canvas.

| Field | Value |
|-------|-------|
| Owning product | Cats Code |
| Current status | Code runtime tool catalog and first assistant-effect execution path wired; renderer consumption and full same-caller declaration-index matrix still pending |
| First channel | `runtime_tool` |
| Tool names | `show_in_canvas`, `clear_canvas` |
| Implementation entry point | Planned: `src/products/code/state/runtimeArtifactCanvasExecution.ts` |
| Related SPEC | [SPEC-101](./specs/SPEC-101-cats-code-artifact-canvas.md) |
| Related ADR | [ADR-098](./decisions/098-url-driven-canvas-and-platform-shared-viewer.md) |
| Related PLAN | [PLAN-090](./plans/PLAN-090-cats-code-artifact-canvas-rollout.md) |

### `show_in_canvas`

Sets the right-hand Artifact Canvas focus to a canvas-eligible artifact.

Caller-visible input:

```ts
interface ShowInCanvasInput {
  artifactId?: string | null;
  declarationId?: string | null;
  presentation?: 'auto' | 'iframe' | 'image' | 'pdf' | 'code' | null;
}
```

Result:

```ts
type ShowInCanvasResult =
  | {
      status: 'accepted';
      // Public correlation handle for the Activity audit record. Safe
      // for transcript / UI surfaces; intentId is never exposed here.
      activityId: string;
      artifactId: string;
      presentationResolved: 'iframe' | 'image' | 'pdf' | 'code' | 'unsupported';
      iframeSandboxProfile: 'static' | 'scripted-cross-origin' | null;
      policyVersion: string | null;
      // Full nested-route URL the renderer was asked to navigate to.
      // Explicit presentation requests use
      // /canvas/:artifactId/view/:presentation.
      // Mirrors the navigate-intent's targetUrl field.
      targetUrl: string;
    }
  | {
      status: 'rejected';
      error: { code: string; message: string; details?: unknown };
    };
```

Effect: server records an `artifact_canvas_show_intent` Activity record
(per ADR-081 Materialization tier) and pushes an
`ArtifactCanvasNavigateIntent` over the platform render-intent stream
keyed by the caller's surface. That stream may use the same app push
transport as [ADR-075](./decisions/075-adopt-push-based-per-entity-state-subscription.md),
but it is not a generic `subscribeEntity` entity patch. The renderer
subscribes only for its active `CanvasSurfaceRef`, applies matching
intents, calls `navigate(targetUrl)`, waits for route commit, and
acknowledges with `POST /api/canvas/intents/ack` and `{ intentId }`. Pending
intents have a 30-second TTL and replay only to the same active surface
subscription while unacknowledged. `intentId` is a server-generated
unguessable secret used as the ack capability — it does NOT appear in
the Activity record, projection response, tool-result payloads, or URL
path/query, and the public correlation handle is `activityId` instead. The ack
endpoint requires the same session credentials the renderer used to
open the subscription and returns the same fixed `200 OK` body
`{ "status": "ok" }` for unknown / unauthorized / TTL-expired intent
ids. The tool does NOT
mutate any product `metadata`.

Core rules (the SPEC-101 source-of-truth covers full validation, the
runtime preview origin allowlist schema, and the presentation resolution
table):

- exactly one of `artifactId` or `declarationId` is required;
- `'unsupported'` is **not** a valid input; it is a server-resolved output
  state for `presentation: 'auto'` only;
- explicit `iframe` / `image` / `pdf` / `code` requests that cannot be
  served reject with `artifact_canvas_presentation_unsupported`; `auto`
  accepts and opens the metadata-only `unsupported` pane instead;
- `declarationId` resolves only against the current turn's per-turn index
  keyed by `(turnId, producerKey, scopeKey, declarationId)` — the
  SPEC-092 idempotency components plus `turnId`.
  - `producerKey = "<producerKind>:<producerIdentity>"` derived from the
    SPEC-092 idempotency fields stored under
    `CoreArtifactRecord.metadata.codeArtifactDeclaration.idempotency`
    (e.g. `agent:actor:actor-abc`, `tool:tool:declare_artifact`,
    `system:system:patch-bundle-detector`, `user:actor:owner-id`).
    `producerIdentity` is the encoded SPEC-092 identity string; do not
    parse `producerKey` by a naive two-part colon split.
  - `scopeKey = "<scopeKind>:<scopeId>"` derived from the same
    idempotency record, where `scopeKind` is one of SPEC-092's frozen
    scope kinds: `run` / `runtime` / `conversation` / `workspace`
    (the canvas does NOT add a `task` scope). Examples:
    `runtime:sess-abc`, `run:run-xyz`, `conversation:conv-1`.
    `runtimeSessionId` lives here (when `scopeKind = 'runtime'`), NOT
    in `producerKey`.
  Lookup is **same-caller-only**: both keys come from the caller's own
  resolved identity / scope, not from the input. Misses (no accepted
  declaration this turn under the caller's `(producerKey, scopeKey)`,
  including ids only seen in prior turns or under other scopes) reject
  with `artifact_canvas_declaration_unknown`; same-turn same-scope
  cross-producer references reject with
  `artifact_canvas_declaration_producer_mismatch`. Callers wanting to
  present a foreign-producer or foreign-scope declaration must pass
  `artifactId`. Multiple accepts at one key must resolve to the same
  `artifactId` (SPEC-092 idempotency); a key paired with a conflicting
  `artifactId` rejects with `artifact_canvas_declaration_collision`.
  The processor keeps no cross-turn lookup;
- accepted intent is **not** persisted to any product `metadata`
  field. Visible state lives in the URL via the nested child route
  `/canvas/:artifactId[/view/:presentation]` per
  [ADR-098](./decisions/098-url-driven-canvas-and-platform-shared-viewer.md)
  (which supersedes ADR-097); audit lives in an Activity record of
  kind `artifact_canvas_show_intent` per ADR-081 Materialization tier;
  explicit non-`auto` presentation requests use the `/view/:presentation`
  URL form, while `auto` uses the shorter `/canvas/:artifactId` form;
  `CanvasSurfaceRouteRegistry.parse(targetUrl)` must round-trip to the
  same surface, `artifactId`, and `presentationRequested` carried by the
  render intent;
- valid canvas surfaces are a single enum, not a free product/surface
  pair: `code_task`, `code_codespace`, `work_item`, `work_project`,
  `work_task`, and `chat_conversation`;
- Activity top-level anchors are the source of truth for Core-backed
  surface identity. Metadata `surfaceId` / `surfaceAnchorSource` are
  derived audit convenience fields; if they disagree with the top-level
  anchor, readers trust the top-level anchor. For task-backed surfaces,
  `metadata.surfaceKind` (`code_task` vs `work_task`) is a write-time
  historical snapshot of the task binding, so later task promotion does
  not rewrite it and is not treated as an anchor conflict.
  `code_codespace` is the only Phase 1 metadata-authoritative surface
  because Core Activity has no codespace anchor;
- credential-bearing URLs (`user:pass@host`) hard-reject at the canvas
  with `artifact_canvas_url_credentials_not_allowed` and never reach
  iframe `src`, open-external href, or pane metadata;
- the iframe sandbox profile is server-decided through TWO flat-array
  allowlists, both straight arrays with no `{ entries: [...] }` wrapper:
  - `artifactCanvas.runtimePreviewOriginAllowlist:
    { hostname, schemes?, ports? }[]` (Phase 1 default: loopback
    `127.0.0.1` / `::1` / `localhost` on `http:` with any port);
  - `artifactCanvas.scriptedPreviewProducerAllowlist:
    { producerKind, producerIdentity }[]` (Phase 1 default: **empty** —
    out of the box, no producer earns `scripted-cross-origin`;
    operators must enumerate trusted producers using encoded SPEC-092
    identities such as `tool:<tool-name>` or `system:<detector-name>`).
  `agent`-kind producers are short-circuited to `static` and cannot
  appear in the producer allowlist. Origin / producer allowlist failure
  silently demotes `scripted-cross-origin` -> `static`; scheme allowlist
  failure hard-rejects with `artifact_canvas_iframe_scheme_rejected`.
  IPv6 hostnames require manual bracket strip during normalization
  (Node's WHATWG `URL.hostname` does NOT strip the enclosing
  `[...]` — see SPEC-101 §Hostname Normalization);
- the `policyVersion` field on the accepted result, the navigate-intent
  payload, and the projection identifies the iframe-policy snapshot.
  The renderer is NOT a mirror of the allowlist matchers — it re-runs
  only scheme allowlist + same-origin-with-shell + profile-name
  validity. The projection is fetched on every URL hit so it always
  carries the current `policyVersion`; there is no stored visible
  state to drift.

#### Error Codes

The full registry (with triggers) is
[SPEC-101 §Error Code Registry](./specs/SPEC-101-cats-code-artifact-canvas.md#error-code-registry).
Implementers shall use these names verbatim:

- `artifact_canvas_identity_required`
- `artifact_canvas_identity_conflict`
- `artifact_canvas_declaration_unknown`
- `artifact_canvas_declaration_producer_mismatch`
- `artifact_canvas_declaration_collision`
- `artifact_canvas_artifact_not_found`
- `artifact_canvas_artifact_not_anchored`
- `artifact_canvas_no_active_surface`
- `artifact_canvas_caller_not_authorized`
- `artifact_canvas_presentation_invalid`
- `artifact_canvas_presentation_unsupported`
- `artifact_canvas_iframe_scheme_rejected`
- `artifact_canvas_url_credentials_not_allowed`

There are no error codes for runtime-preview-origin allowlist failure or
scripted preview producer allowlist failure; both silently demote to
`static`. The `iframeSandboxProfile` field on the accepted result is the
assistant-visible signal that demotion happened, and `policyVersion`
identifies the policy snapshot under which the decision was made.

### `clear_canvas`

Asks the renderer to navigate the caller's surface URL up out of the
canvas child route.

Caller-visible input is empty:

```ts
interface ClearCanvasInput {}
```

Result:

```ts
interface ClearCanvasResult {
  status: 'accepted';
  // Public correlation handle for the Activity audit record.
  activityId: string;
  // The full URL the renderer was asked to navigate to (the parent
  // surface URL, with /canvas/:artifactId popped). Mirrors the
  // navigate-intent's targetUrl.
  targetUrl: string;
}
```

Effect: writes an `artifact_canvas_clear_intent` Activity record (audit)
and pushes an `ArtifactCanvasNavigateIntent` whose `targetUrl` is the
parent surface URL. Idempotent: calling it from a URL without
`/canvas/:artifactId` segment still emits one Activity record and one
navigate-intent (the resulting navigation is a no-op).

Shares the `artifact_canvas_no_active_surface` and
`artifact_canvas_caller_not_authorized` rejection codes with
`show_in_canvas`.

Note on the pane "Close (X)" control: it is **renderer-only**
`navigate()` to drop the `/canvas/:artifactId` segment, NOT a
`clear_canvas` call. The user driving close locally does not need a
server tool — the URL change is enough. `clear_canvas` exists for the
agent / product-internal-delegate path. The pane's "Collapse / expand"
control is also renderer-only (does not change the URL). See
[SPEC-101 §FR7](./specs/SPEC-101-cats-code-artifact-canvas.md#functional-requirements)
for the close-vs-collapse semantics.

---

*Created: 2026-04-29*
*Last updated: 2026-05-13*
