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
| `declare_artifact` | Cats Code | Active-session onboarding, submit route, materialization, activity, runtime execution helper, assistant-effect processor, and live dispatch persistence wired; tool-result delivery pending | `runtime_tool` first; bridge/user delegates later | Code assistant / runtime bridge / Code UI import flow | [Declare Artifact](#declare_artifact) |

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

## `declare_artifact`

Declares that a Code-session output is worth recording as an Artifact. It is not
a transcript command and it is not a public HTTP route in the current scaffold.

| Field | Value |
|-------|-------|
| Owning product | Cats Code |
| Current status | Code-origin active sessions receive the onboarding block at session create and runtime context metadata at session create / message send; returned `declare_artifact` `tool_use` segments are observed as shape summaries. The Code product now has an authoritative submit route, materialization delegate, activity emission, runtime execution helper, platform-registered assistant-effect processor, and live dispatch persistence for observed `tool_use` payloads. Runtime tool-result delivery back to the assistant and finalization enforcement remain pending. |
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
overwriting one another with stale snapshots. Accepted / rejected declaration
results are recorded in assistant-message metadata under
`runtimeAssistantMetadata["cats-code.artifact-declaration"].codeArtifactToolResults`.
Tool results are not yet sent back to the assistant through the runtime
tool-result channel. Until the finalization gate is wired, Cats Platform still
accepts final visible responses that claim an artifact without an accepted
same-turn declaration.

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

### Error Codes

The source of truth is [SPEC-092 § Error Code Registry](./specs/SPEC-092-code-artifact-declaration-contract.md#error-code-registry).
The scaffolded TypeScript helper currently throws only the context-free
shape/location/metadata subset from that registry, while finalization may return
`artifact_claim_without_declaration`.

---

*Created: 2026-04-29*
*Last updated: 2026-04-30*
