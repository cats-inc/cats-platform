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
| `declare_artifact` | Cats Code | Scaffolded, not wired | `runtime_tool` first; bridge/user delegates later | Code assistant / runtime bridge / Code UI import flow | [Declare Artifact](#declare_artifact) |

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
| Current status | Scaffolded only; no runtime catalog wiring, product route, or persistence flow yet |
| First channel | `runtime_tool` |
| Tool name | `declare_artifact` |
| Implementation entry point | `src/products/code/shared/artifactDeclaration.ts` |
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

### Output Summary

The scaffolded tool result shape is:

```ts
interface CodeArtifactToolResult {
  status: 'accepted' | 'rejected';
  declarationId: string;
  artifactId?: string;
  artifactStatus?: 'draft' | 'ready' | 'published';
  errorCode?: string;
  message?: string;
}
```

An `accepted` result means the declaration was accepted by the tool contract for
that call. In the current scaffold it does not imply a persisted
`CoreArtifactRecord`, because the materialization flow is intentionally not
wired yet.

### Persistence and Activity

The full materialized flow is defined by SPEC-092:

- accepted `record` declarations upsert `CoreArtifactRecord`
- material changes emit background `artifact_recorded` activity
- idempotent no-op retries do not emit duplicate activity
- Artifacts sidebar projections read materialized Core artifact rows

The current implementation only provides the tool contract classes and
finalization gate helpers.

### Idempotency

Agents should reuse the same `declarationId` for the same logical output.
Server-side idempotency key construction and frozen-scope retry behavior are
defined in SPEC-092.

### Final Response Gate

If an assistant final response claims that an artifact was produced or recorded,
the finalization envelope must include an `artifactClaims[]` entry whose
`declarationId` matches an accepted same-turn `declare_artifact` result.
Unmatched claims are blocked with `artifact_claim_without_declaration`.

### Notable Errors

- `artifact_declaration_id_required`
- `artifact_required_field_empty`
- `artifact_invalid_label`
- `artifact_invalid_location`
- `artifact_invalid_metadata`
- `artifact_producer_field_not_allowed`
- `artifact_claim_without_declaration`

---

*Created: 2026-04-29*
*Last updated: 2026-04-29*
