# SPEC-092: Code Artifact Declaration Contract

> Define how Cats Code receives structured artifact declarations from agents,
> tools, system detection, and user imports, then validates and materializes
> them as `CoreArtifactRecord` rows.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |
| **Related ADR** | [ADR-088](../decisions/088-use-structured-artifact-declarations-for-code-materialization.md) |
| **Related Plan** | [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md) |

## Summary

`Cats Code` needs an artifact sidebar that contains durable outputs, not every
file touched by a coding assistant. This spec defines the declaration contract
that lets a producer say "this output is worth recording" while the product
server remains responsible for validation, normalization, provenance, and
`CoreArtifactRecord` persistence.

The contract supports four producer classes:

- agent-declared artifacts
- tool-declared artifacts
- system-detected candidates
- user imports

## Goals

- Give coding agents a structured way to declare artifacts.
- Normalize agent/tool/system/user artifact signals into one Code product
  boundary.
- Keep transcript prose separate from durable artifact commands.
- Keep cwd scanning out of the authoritative artifact path.
- Preserve provenance back to conversation, task, run, workspace, actor, and
  Work linkage when those anchors exist.
- Use the existing Core artifact record in the first slice.

## Non-Goals

- Creating a new Core artifact-declaration record family.
- Treating every changed file as an artifact.
- Parsing JSON blocks from assistant messages as artifact commands.
- Adding a full artifact review inbox UI in the first slice.
- Adding new `CoreArtifactKind` values in this spec.
- Defining the final visual design for the Artifacts sidebar.

## Requirements

### Functional Requirements

1. Cats Code shall accept artifact declarations through structured product
   surfaces, not transcript prose parsing.
2. The accepted producer classes shall be:
   - `agent`
   - `tool`
   - `system`
   - `user`
3. A declaration shall be treated as an input proposal until Cats Code validates
   and materializes it.
4. Cats Code shall be the only authority that writes `CoreArtifactRecord` from
   artifact declarations.
5. Cats Code shall reject or downgrade declarations whose anchors do not
   resolve.
6. Cats Code shall reject local paths that are outside the resolved workspace
   unless an explicit user import policy allows them.
7. Cats Code shall not materialize an artifact merely because a source file was
   changed.
8. Cats Code shall not materialize an artifact merely because a Code entry,
   task, run, workspace, or sidebar entry was opened.
9. Cats Code shall normalize producer-specific labels onto existing
   `CoreArtifactKind` values:
   - `document`
   - `report`
   - `build`
   - `preview`
   - `attachment`
   - `transcript_export`
   - `dataset`
10. Cats Code shall preserve producer-specific artifact labels in metadata when
    the Core kind is broader than the producer label.
11. Cats Code shall stamp authoritative provenance from server-side context,
    including conversation id, task id, run id, workspace path, actor id,
    producer kind, and declaration id when available.
12. Cats Code shall support idempotent declaration handling using the canonical
    key formula defined in this spec so a retried agent or tool call does not
    create duplicate artifacts.
13. Cats Code shall support two declaration dispositions:
    - `record`: write or update a `CoreArtifactRecord`
    - `candidate`: hold for review or materialize as `draft` with candidate
      metadata, depending on implementation phase
14. A declaration that becomes a Core artifact shall choose one Core status:
    - `draft`
    - `ready`
    - `published`
15. Cats Code shall resolve disposition and status in this order:
    label defaults, producer-requested downgrade, then server policy override.
16. A producer request shall not upgrade disposition or status beyond the label
    default. `requestedStatus = 'published'` is rejected in ordinary
    declaration submits; `published` is set only by an explicit publish action
    or server-configured auto-publish context.
17. `published` shall require server-side publish context. It is not granted by
    producer kind or by a raw declaration request.
18. `system` producer declarations shall normalize to `candidate`; system
    detection is not a record-authoring path.
19. Phase 1 agent declarations shall enter through the Cats-native Code runtime
    action channel named `declare_artifact`, backed by the Code product
    API/delegate. MCP tools and runtime stream events may adapt into the same
    declaration API later, but they shall not define a second declaration
    payload.
20. Runtime/tool bridge outputs such as preview URL, build output, test report,
    screenshot, delivery manifest, patch bundle, and review report shall use
    the same declaration contract.
21. User imports and attachments shall use the same declaration contract after
    upload/import normalization.
22. Every durable artifact materialization shall emit an idempotent background
    `artifact_recorded` activity unless the upsert is a no-op replay of an
    already recorded declaration.
23. Artifact sidebar projections shall read materialized `CoreArtifactRecord`
    rows. They must not independently parse declarations or scan workspaces.

### Declaration Shape

The first structured contract should be equivalent to:

```ts
interface CodeArtifactDeclaration {
  declarationId: string;
  producer: {
    kind: 'agent' | 'tool' | 'system' | 'user';
    actorId?: string | null;
    toolName?: string | null;
    runtimeSessionId?: string | null;
  };
  requestedDisposition?: 'record' | 'candidate';
  requestedStatus?: 'draft' | 'ready' | 'published';
  artifact: {
    title: string;
    label: string;
    coreKind?: 'document' | 'report' | 'build' | 'preview' | 'attachment' | 'transcript_export' | 'dataset';
    summary?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  };
  location?: {
    kind: 'none' | 'local_path' | 'url' | 'inline_summary' | 'external_ref';
    value?: string | null;
  };
  anchors?: {
    conversationId?: string | null;
    taskId?: string | null;
    runId?: string | null;
    projectId?: string | null;
    workItemId?: string | null;
    workspacePath?: string | null;
  };
  metadata?: Record<string, unknown>;
}
```

Rules:

- `declarationId` is producer-supplied but server-normalized for whitespace,
  length, and idempotency. It must be stable across retries of the same
  producer output.
- `artifact.title` is required.
- `artifact.label` is producer-facing vocabulary such as `review_report`,
  `diff_summary`, `test_report`, `patch_bundle`, or `preview_url`.
- `artifact.coreKind` may be omitted; Cats Code maps from `label` when possible.
- `producer.runtimeSessionId` and `anchors` are hints. Server-side context wins
  when there is a conflict.
- `producer.toolName` is required for `tool` declarations and may name the
  server detector for `system` declarations. When omitted for `system`, the
  detector name is `code-bridge`.
- `producer.toolName` is interpreted as tool name for `producer.kind = 'tool'`
  and detector name for `producer.kind = 'system'`. It must be omitted or null
  for `agent` and `user` declarations.
- `producer.actorId` is only meaningful for `agent` and `user` declarations.
  It must be omitted or null for `tool` and `system` declarations.
- `metadata` may carry producer-specific details only under non-reserved keys.
  It must not override normalized Core fields.

### Producer Identity Resolution

Cats Code shall resolve producer identity from server-owned context before
building idempotency keys or accepting a declaration:

| Producer kind | Resolution source | Required validation |
|---------------|-------------------|---------------------|
| `agent` | Active Code runtime session participant / actor binding for the declaring assistant | The actor id resolves to a known agent/assistant actor in the current session, task, or run. A producer-supplied `actorId` is only a hint and must match the server binding when present. |
| `tool` | Code tool execution context or tool bridge registration | `toolName` resolves to a server-registered tool that was invoked in, or is authorized for, the current workspace/run context. |
| `system` | Code system detector registry | `toolName` is treated as detector name. When omitted it defaults to `code-bridge`; the detector must be in the Code server's built-in detector registry. |
| `user` | Authenticated owner/user session | The resolved actor id is the authenticated owner profile actor for the current local user. Producer-supplied `actorId` is only a hint and must match that actor when present. |

If the producer identity cannot be resolved from these sources, Cats Code shall
reject the declaration before idempotency lookup.

Producer identity errors are deterministic:

| Case | Error code |
|------|------------|
| `agent` has no server-bound actor | `artifact_agent_actor_required` |
| `agent` supplies a mismatched `actorId` | `artifact_agent_actor_mismatch` |
| `tool` has no resolvable registered tool | `artifact_tool_not_allowed` |
| `tool` supplies non-null `actorId` | `artifact_producer_actor_not_allowed` |
| `system` detector is not in the Code built-in detector registry | `artifact_system_detector_not_allowed` |
| `system` supplies non-null `actorId` | `artifact_producer_actor_not_allowed` |
| `user` has no authenticated owner actor | `artifact_user_actor_required` |
| `user` supplies a mismatched `actorId` | `artifact_user_actor_mismatch` |
| `agent` or `user` supplies non-null `toolName` | `artifact_producer_tool_not_allowed` |

### Idempotency Key

Cats Code shall construct one canonical declaration idempotency key before
materialization:

```text
code-artifact-declaration:v1:
  producer=<producer-kind>:<producer-identity>:
  scope=<scope-kind>:<scope-id>:
  declaration=<normalized-declaration-id>
```

Where:

- `producer-kind` is one of `agent`, `tool`, `system`, or `user`.
- `producer-identity` is:
  - `actor:<server-resolved-actor-id>` for `agent` and `user`
  - `tool:<server-resolved-tool-name>` for `tool`
  - `system:<server-detector-name>` for `system`
- `scope-kind:scope-id` is selected by precedence:
  1. `run:<server-resolved-run-id>`
  2. `runtime:<server-resolved-runtime-session-id>`
  3. `conversation:<server-resolved-conversation-id>`
  4. `workspace:<stable-normalized-workspace-key>` for detached user imports
- `normalized-declaration-id` is the trimmed declaration id after validating it
  is non-empty and stable for the producer.

Null fallback is explicit:

- `agent` and `user` declarations without a server-resolved actor id shall be
  rejected.
- `tool` declarations without a server-resolved tool name shall be rejected.
- `system` declarations whose detector is not in the Code built-in detector
  registry shall be rejected.
- Declarations without any scope candidate shall be rejected with
  `artifact_anchor_required`.
- Producer-supplied runtime/session/anchor ids may fill a missing field only
  when the server can verify that id belongs to the active Code context.

The server shall store the idempotency key and its resolved components in
artifact metadata under `codeArtifactDeclaration.idempotency`, including:

- `key`
- `producerKind`
- `producerIdentity`
- `scopeKind`
- `scopeId`
- `declarationId`

The chosen `scopeKind` and `scopeId` are frozen when the declaration first
successfully materializes or is accepted as a stored candidate. Later retries
must first search for an existing artifact or pending candidate by exact
idempotency key. If the server cannot re-resolve the original scope during a
retry, it shall search by frozen producer identity + normalized declaration id
within compatible server-verified anchors before creating anything new. If that
fallback finds exactly one existing artifact/candidate, Cats Code shall reuse
its frozen idempotency key and update/no-op that record. If it finds more than
one compatible record, Cats Code shall reject with
`artifact_idempotency_ambiguous`.

If the implementation derives the `CoreArtifactRecord.id` from the key, it
shall use a stable hash of the frozen full key rather than raw producer text.

When Cats Code rejects a declaration with
`artifact_idempotency_ambiguous`, the response shall include non-sensitive
candidate references sufficient for a UI or agent to recover, such as artifact
ids, titles, statuses, scope kinds, and scope ids. The client recovery path is:

1. show or log the ambiguous candidates instead of silently retrying;
2. let the user or calling agent pick an existing artifact when continuation is
   intended; or
3. require a new `declarationId` only when the producer truly intends to create
   a distinct artifact.

The server shall not auto-pick among ambiguous candidates.

### Disposition and Status Precedence

Disposition and status resolve deterministically:

1. Start from the label mapping table default disposition and status.
2. Apply producer-requested downgrade only:
   - disposition may move from `record` to `candidate`
   - disposition may not move from `candidate` to `record`
   - status may move from `ready` to `draft`
   - if a future label default is `published`, status may move from
     `published` to `ready` or `draft`
   - status may not move from `draft` to `ready` or `published`, or from
     `ready` to `published`
3. Apply server policy last. Server policy may force `candidate`, force
   `draft`, or reject the declaration when anchors, location, publishing
   context, or safety checks fail.

Producer requests that would upgrade beyond the label default are ignored and
normalized back to the label default, except `requestedStatus = 'published'`,
which is always rejected for ordinary declaration submits. Publication is a
separate server-side state transition described below.

If the final disposition is `candidate`, the final Core status is `draft`
whenever the candidate is represented as a `CoreArtifactRecord`.

`system` producer declarations are candidate-only. A system declaration with
`requestedDisposition = 'record'` is normalized to `candidate`; record-capable
runtime outputs must be submitted as `tool` declarations instead.

### Publishing

Ordinary artifact declarations cannot directly set `published`. A declaration
with `requestedStatus = 'published'` submitted through the normal declaration
path shall be rejected with `artifact_publish_requires_action`.

Cats Code may write `CoreArtifactRecord.status = 'published'` only in one of
these server-side publish contexts:

- `user_publish_action`: the authenticated owner/user explicitly invoked a
  publish action for an existing artifact or for a user-import flow that wraps a
  declaration and publish action together.
- `tool_auto_publish_policy`: the declaring tool is on the server-configured
  tool auto-publish policy list, the artifact label is allowed for that tool,
  and the current workspace/run context satisfies that policy rule.

User import-and-publish is a distinct product action, not a flag inside
`CodeArtifactDeclaration`. Implementations may expose it as a route such as
`POST /api/code/artifacts/import-and-publish` or as an equivalent internal
delegate action, but it shall not reuse the normal declaration submit path. The
action flow is:

1. normalize the user import/upload into a `CodeArtifactDeclaration` with
   `requestedStatus` omitted or set to `ready` / `draft`, never `published`;
2. materialize or update the artifact through the normal declaration path;
3. perform a `user_publish_action` transition in the same server-side action
   after materialization succeeds.

The normal declaration submit path shall reject `requestedStatus = 'published'`
even when `producer.kind = 'user'`.

Tool auto-publish policy is server configuration under
`codeArtifactDeclaration.toolAutoPublishPolicies`:

```ts
interface CodeArtifactToolAutoPublishPolicy {
  toolName: string;
  labels: string[];
  workspaceMatcher?: {
    kind: 'any' | 'workspace_key' | 'path_prefix';
    values?: string[];
  };
  runMatcher?: {
    kind: 'any' | 'run_id' | 'task_id';
    values?: string[];
  };
}
```

Rules:

- `toolName` is an exact match against the server-resolved tool name.
- `labels` is a non-empty set of producer labels allowed for that tool. No
  wildcard labels are allowed in this spec.
- `workspaceMatcher` is evaluated against the server-resolved workspace key and
  canonical workspace path. Omitted matcher or `{ kind: 'any' }` means any
  resolved workspace context. `workspace_key` requires exact key match.
  `path_prefix` requires a canonical path-prefix match.
- `runMatcher` is evaluated against server-resolved run/task anchors. Omitted
  matcher or `{ kind: 'any' }` means any run context. `run_id` and `task_id`
  require exact id match.
- The first implementation uses this single server config list. Per-workspace
  editable policy is a follow-up and must not introduce a second policy source
  without updating this spec.
- A policy entry with an unknown matcher kind, empty `toolName`, empty
  `labels`, or empty `values` for non-`any` matchers is invalid server config
  and shall be ignored with a startup/config diagnostic.

Agent and system declarations are not publish-capable in this spec. Agents may
declare `ready` artifacts, but publishing them requires a later owner publish
action or a future explicit supervision/policy grant spec. Until that future
spec exists, an agent declaration that requests `published` shall be rejected
with `artifact_publish_requires_action`.

### Location Rules

`location.kind` is interpreted as follows:

| Kind | `value` meaning | Core `path` behavior | Additional rules |
|------|-----------------|----------------------|------------------|
| `none` | No durable object reference | `null` | Requires a non-empty `summary` or metadata evidence. |
| `local_path` | Workspace-relative path, or an absolute path that canonicalizes inside the resolved workspace | normalized workspace-relative path | Absolute paths outside the workspace are rejected unless they are normalized through user import first. |
| `url` | HTTP(S) URL for a preview or externally hosted output | normalized URL string | Credentials in URLs are rejected. Runtime-local URLs must be attached to known runtime/tool output or explicit user input. |
| `inline_summary` | Text summary content, not a file path | `null` | `value` is copied into `summary` when `summary` is empty; maximum 8 KiB after trimming. |
| `external_ref` | Opaque reference to a known external object, such as an upload id, runtime artifact id, or storage key | normalized external reference string | The value must use `<refKind>:<refId>`, where `refKind` is allowlisted and `refId` is non-empty. |

The first implementation shall maintain `external_ref` allowlist policy as one
Code server configuration value, `codeArtifactDeclaration.externalRefKinds`.
Per-workspace external-ref policy is a follow-up, not part of this spec. This
allowlist is separate from `toolAutoPublishPolicies`. The default
initial allowed kinds are:

- `upload`
- `runtime_artifact`
- `storage_object`

Unknown `refKind` values are rejected with
`artifact_external_ref_kind_not_allowed`.

User imports do not make arbitrary outside-workspace paths safe. A user import
outside the workspace must first be normalized by the upload/import path into a
managed attachment, copied workspace object, or allowlisted external reference;
the declaration then records that normalized location.

### Anchor Rules

Server-side context is authoritative for conversation, task, run, workspace,
project, and work item anchors. Producer hints may be used only when the server
can verify the referenced record and its relationship to the current Code
context.

Detached user imports from the Artifacts sidebar are allowed only when the UI
supplies an explicit selected workspace or anchor target. If there is no active
conversation/task/run and no selected workspace/project/work item, the import
shall be rejected with `artifact_anchor_required` rather than creating a
globally floating artifact.

### Metadata Rules

Metadata shall be JSON-serializable object data after normalization.

- Maximum serialized metadata size: 16 KiB.
- Maximum top-level metadata keys supplied by the producer: 32.
- Maximum metadata key length: 64 characters.
- Top-level metadata keys matching normalized `CoreArtifactRecord` fields
  (`id`, `title`, `kind`, `status`, `projectId`, `workItemId`,
  `conversationId`, `taskId`, `runId`, `path`, `mimeType`, `sizeBytes`,
  `summary`, `createdAt`, `updatedAt`, `metadata`) are reserved and shall be
  rejected with `artifact_metadata_reserved_key`.
- Cats Code-owned declaration metadata shall live under
  `codeArtifactDeclaration`; producer-specific details should live under
  `producerDetails`.

### Label Mapping

The first mapping table is:

| Producer label | Core kind | Default status | Default disposition |
|----------------|-----------|----------------|---------------------|
| `preview_url` | `preview` | `ready` | `record` |
| `build_output` | `build` | `ready` | `record` |
| `test_report` | `report` | `ready` | `record` |
| `review_report` | `report` | `ready` | `record` |
| `implementation_summary` | `report` | `ready` | `record` |
| `diff_summary` | `report` | `draft` | `candidate` |
| `changed_files_summary` | `report` | `draft` | `candidate` |
| `patch_bundle` | `attachment` | `ready` | `record` |
| `screenshot` | `attachment` | `ready` | `record` |
| `wireframe` | `document` | `draft` | `record` |
| `spec_document` | `document` | `draft` | `record` |
| `plan_document` | `document` | `draft` | `record` |

Unknown labels default to `report` + `draft` + `candidate` unless product
policy rejects them.

### Validation Rules

Cats Code shall validate:

- title is non-empty,
- mapped Core kind is allowed,
- requested status is allowed,
- producer identity resolves through the producer identity table above,
- at least one structural anchor or workspace context exists,
- referenced conversation/task/run/project/work item ids resolve when present,
- task/run anchors are compatible when both are present,
- workspace path resolves to a known Code workspace when required,
- location kind and value obey the location rules above,
- local path is inside the resolved workspace or has been normalized through
  user import,
- URL artifacts are allowed for the producer and label,
- the canonical idempotency key can be constructed,
- metadata is JSON-serializable, stays within the exact bounds above, and does
  not use reserved Core field names.

Cats Code shall reject declarations that attempt to:

- write outside the workspace through path traversal,
- claim a Work project/work item anchor that does not exist,
- claim a run unrelated to the current task,
- set `published` through an ordinary declaration submit,
- bypass system-candidate normalization to materialize system output directly
  as `record`,
- materialize unsupported executable payloads as trusted artifacts.

### Materialization Rules

When a declaration is accepted as `record`, Cats Code shall upsert
`CoreArtifactRecord` with:

- `title`
- normalized `kind`
- normalized `status`
- strongest available anchors
- `path` when the location maps to a local path, URL, or external reference
- `mimeType`
- `sizeBytes`
- `summary`
- metadata containing declaration provenance and producer label
- metadata containing the canonical idempotency key

Cats Code shall compute a material-change signature before writing
`artifact_recorded` activity. The signature includes only normalized durable
artifact fields:

- `title`
- `kind`
- `status`
- `projectId`
- `workItemId`
- `conversationId`
- `taskId`
- `runId`
- `path`
- `mimeType`
- `sizeBytes`
- `summary`
- `codeArtifactDeclaration.producerLabel`
- `codeArtifactDeclaration.disposition`
- `codeArtifactDeclaration.location`
- `codeArtifactDeclaration.candidate`
- `producerDetails` after removing volatile keys

Volatile-key removal is recursive for the entire `producerDetails` object. At
every object depth, Cats Code shall remove keys whose normalized lowercase name
ends with `at`, includes `timestamp`, or equals `retryCount`,
`attemptCount`, `observedAt`, `receivedAt`, `updatedAt`, or `createdAt`.
Arrays preserve order after recursively normalizing object elements. The
signature also excludes top-level `id`, `createdAt`, `updatedAt`, retry
counters, observed timestamps, and raw idempotency metadata. If the signature
is unchanged from the existing artifact, the upsert is a no-op replay for
activity purposes.

When a declaration is accepted as `candidate`, Cats Code may:

- write `CoreArtifactRecord.status = 'draft'` with metadata indicating
  candidate state, or
- store the candidate in a product-local pending queue until the artifact is
  approved or discarded.

The first implementation may choose either candidate storage strategy, but the
chosen strategy must be documented in the implementing plan update.

### Activity and Audit

When a declaration creates or materially updates a durable
`CoreArtifactRecord`, Cats Code shall write a background/system
`CoreActivityRecord` of kind `artifact_recorded`. Idempotent retries that do
not change the material-change signature shall not emit duplicate activity.
Activity is audit/feed evidence, not the artifact itself.

### Non-Functional Requirements

- **Traceability**: Every materialized artifact must expose enough provenance
  for users to find the originating conversation, task, run, and workspace.
- **Idempotency**: Retried declarations shall update the same artifact or be
  ignored, not create duplicates.
- **Safety**: Local file paths must be workspace-contained by default.
- **Separation**: Transcript content is not a command channel.
- **Extensibility**: New producer labels should be metadata/mapping additions
  before Core enum expansion is considered.

## Design Overview

```text
agent/tool/system/user output
  -> structured CodeArtifactDeclaration
  -> Cats Code validation and normalization
  -> artifact disposition policy
  -> upsert CoreArtifactRecord
  -> Code Artifacts sidebar projection
  -> optional Work evidence projection when Work anchors exist
```

## Dependencies

- [ADR-088](../decisions/088-use-structured-artifact-declarations-for-code-materialization.md)
- [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md)
- [SPEC-091](./SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [PLAN-064](../plans/PLAN-064-new-code-mvp-task-run-artifact-materialization.md)
- [ADR-081](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md)

## Open Questions

- Should candidate declarations be stored as draft `CoreArtifactRecord` rows in
  the first implementation, or held in a Code-local pending queue?
- Which additional runtime stream or MCP adapters should be added after the
  Phase 1 Cats-native Code runtime action `declare_artifact`?
- Should future Core add a `candidate` artifact status, or is `draft` plus
  metadata sufficient?
- Should generated source patches be `attachment`, `report`, or a future
  dedicated artifact kind?

---

*Created: 2026-04-29*
*Author: Codex*
*Related Plan: [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md)*
