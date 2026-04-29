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
- **String input normalization** (applied before validation, idempotency-key
  construction, and any "must be omitted or null" check): all optional string
  fields on `producer.*`, `artifact.*`, `location.value`, and `anchors.*` are
  trimmed; if the trimmed result is empty, the field is treated as `null` /
  omitted. This applies in particular to `producer.toolName`,
  `producer.actorId`, `producer.runtimeSessionId`, `artifact.summary`,
  `artifact.mimeType`, `location.value`, and any anchor id. A buggy producer
  that emits `""` instead of omitting a field shall not be treated as having
  set the field. `artifact.title` and `artifact.label` are required strings:
  trimming applies, and an empty trimmed result is rejected with
  `artifact_required_field_empty`.

### Producer Identity Resolution

Cats Code shall resolve producer identity from server-owned context before
building idempotency keys or accepting a declaration:

| Producer kind | Resolution source | Required validation |
|---------------|-------------------|---------------------|
| `agent` | Active Code runtime session participant / actor binding for the declaring assistant | The actor id resolves to a known agent/assistant actor in the current session, task, or run, and `producer.runtimeSessionId` resolves to that active runtime session. A producer-supplied `actorId` is only a hint and must match the server binding when present. |
| `tool` | Code tool execution context or tool bridge registration | `toolName` resolves to a server-registered tool that was invoked in, or is authorized for, the current workspace/run context. |
| `system` | Code system detector registry | `toolName` is treated as detector name. When omitted it defaults to `code-bridge`; the detector must be in the Code server's built-in detector registry. |
| `user` | Authenticated owner/user session | The resolved actor id is the authenticated owner profile actor for the current local user. Producer-supplied `actorId` is only a hint and must match that actor when present. |

If the producer identity cannot be resolved from these sources, Cats Code shall
reject the declaration before idempotency lookup.
Declarations with `producer.kind = 'agent'` shall include the server-resolved
`producer.runtimeSessionId`; missing agent runtime session context is rejected
before idempotency lookup so same-actor declaration ids cannot fold across
sessions.

Producer identity errors are deterministic:

| Case | Error code |
|------|------------|
| `agent` has no server-bound actor | `artifact_agent_actor_required` |
| `agent` has no runtime session id | `artifact_required_field_empty` |
| `agent` supplies a mismatched `actorId` | `artifact_agent_actor_mismatch` |
| `tool` has no resolvable registered tool | `artifact_tool_not_allowed` |
| `tool` supplies non-null `actorId` | `artifact_producer_actor_not_allowed` |
| `system` detector is not in the Code built-in detector registry | `artifact_system_detector_not_allowed` |
| `system` supplies non-null `actorId` | `artifact_producer_actor_not_allowed` |
| `user` has no authenticated owner actor | `artifact_user_actor_required` |
| `user` supplies a mismatched `actorId` | `artifact_user_actor_mismatch` |
| `agent` or `user` supplies non-null `toolName` | `artifact_producer_tool_not_allowed` |

### Error Code Registry

This registry is the canonical source for Cats Code artifact declaration error
codes. TypeScript helper unions and tool-call registry summaries shall reference
these codes instead of inventing local aliases.

#### Agent-Visible Shape and Field Errors

| Error code | Trigger |
|------------|---------|
| `artifact_required_field_empty` | A required string field is missing, non-string, empty, or whitespace after normalization. |
| `artifact_producer_field_not_allowed` | An agent-visible declaration supplies non-null server-resolved fields such as `producer.*`, `anchors.*`, `kind`, `coreKind`, `runId`, `taskId`, `conversationId`, `workspaceKey`, `requestedDisposition`, or `requestedStatus`. |
| `artifact_location_required` | `location` is missing or is not an object. |
| `artifact_location_kind_invalid` | `location.kind` is missing or not one of `none`, `local_path`, `url`, `inline_summary`, or `external_ref`. |
| `artifact_location_value_required` | `location.value` is required for the selected location kind but is empty after normalization. |
| `artifact_location_value_invalid` | `location.value` is syntactically invalid for the selected location kind. |
| `artifact_location_evidence_required` | `location.kind = 'none'` is supplied without a non-empty `summary` or metadata evidence. |

#### Location and Metadata Errors

| Error code | Trigger |
|------------|---------|
| `artifact_local_path_invalid` | A `local_path` value is not a usable path string before workspace containment validation, such as a URL-like value or unsafe null byte. |
| `artifact_url_credentials_not_allowed` | A `url` value contains username or password credentials. |
| `artifact_inline_summary_too_large` | An `inline_summary` value exceeds 8 KiB after trimming. |
| `artifact_external_ref_invalid` | An `external_ref` value does not use `<refKind>:<refId>` or has an empty ref id. |
| `artifact_external_ref_kind_not_allowed` | An `external_ref` ref kind is not in `codeArtifactDeclaration.externalRefKinds`. |
| `artifact_metadata_invalid` | Metadata is missing the required JSON-serializable object shape. |
| `artifact_metadata_too_large` | Serialized metadata exceeds 16 KiB. |
| `artifact_metadata_too_many_keys` | Producer-supplied metadata has more than 32 top-level keys. |
| `artifact_metadata_key_too_long` | A top-level metadata key exceeds 64 characters. |
| `artifact_metadata_reserved_key` | A top-level metadata key matches a normalized `CoreArtifactRecord` field. |

#### Producer, Anchor, Idempotency, and Policy Errors

| Error code | Trigger |
|------------|---------|
| `artifact_agent_actor_required` | An `agent` declaration has no server-bound actor. |
| `artifact_agent_actor_mismatch` | An `agent` declaration supplies an `actorId` that conflicts with the server-bound actor. |
| `artifact_tool_not_allowed` | A `tool` declaration has no resolvable registered tool or the tool is not authorized for the context. |
| `artifact_system_detector_not_allowed` | A `system` declaration names a detector not in the Code built-in detector registry. |
| `artifact_user_actor_required` | A `user` declaration has no authenticated owner actor. |
| `artifact_user_actor_mismatch` | A `user` declaration supplies an `actorId` that conflicts with the authenticated owner actor. |
| `artifact_producer_actor_not_allowed` | A `tool` or `system` declaration supplies non-null `actorId`. |
| `artifact_producer_tool_not_allowed` | An `agent` or `user` declaration supplies non-null `toolName`. |
| `artifact_anchor_required` | No conversation, task, run, workspace, or verified detached-import anchor can be resolved. |
| `artifact_anchor_conflict` | A retry supplies a non-null anchor value that conflicts with the frozen anchor on the idempotent artifact. |
| `artifact_idempotency_ambiguous` | Frozen-scope retry fallback finds more than one compatible existing artifact/candidate. |
| `artifact_publish_requires_action` | An ordinary declaration submit requests `published`. |
| `artifact_publish_transition_failed` | Import-and-publish or standalone publish materialized an artifact but the publish transition failed. |
| `artifact_claim_without_declaration` | Final-response `artifactClaims[]` references no accepted same-turn declaration. |

Configuration diagnostics such as `tool_auto_publish_policy_invalid_entry` are
server health / log diagnostics, not declaration response error codes.

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
`CodeArtifactDeclaration`. Implementations shall expose it as a separate
Code-owned route or internal delegate (the canonical route shape is
`POST /api/code/artifacts/import-and-publish`); it shall not reuse the normal
declaration submit path.

The request payload shape is:

```ts
interface CodeArtifactImportAndPublishInput {
  importSource: {
    kind: 'upload' | 'workspace_path' | 'attachment_ref';
    value: string;        // upload id, canonicalized workspace-relative path, or attachment id
    mimeType?: string | null;
    sizeBytes?: number | null;
  };
  artifact: {
    title: string;        // required, trimmed
    label: string;        // required producer label
    coreKind?: CodeArtifactDeclaration['artifact']['coreKind'];
    summary?: string | null;
  };
  anchors?: {
    conversationId?: string | null;
    taskId?: string | null;
    runId?: string | null;
    projectId?: string | null;
    workItemId?: string | null;
    workspaceKey?: string | null;
  };
  metadata?: Record<string, unknown>;
}
```

Notes:

- `requestedStatus`, `requestedDisposition`, and `producer.*` fields are
  **not** part of this payload. The wrapping action injects
  `producer = { kind: 'user', actorId: <server-resolved owner actor> }`,
  forces `requestedDisposition = 'record'`, and sets `requestedStatus`
  unset (so the normal declaration path resolves status from the label
  default).
- `importSource.kind = 'upload'` references a previously uploaded blob in
  the server's upload store. `importSource.kind = 'workspace_path'`
  references an already-resolved workspace-relative path that is normalized
  through the same path-canonicalization rules used elsewhere.
  `importSource.kind = 'attachment_ref'` references a known attachment id.
- `anchors.workspaceKey` follows the § Workspace Key and Path
  Canonicalization rules. At least one of
  `conversationId | taskId | runId | workspaceKey` must resolve, otherwise
  the request is rejected with `artifact_anchor_required` (same rule as
  declaration anchors).
- String input normalization (trim → null) applies to every optional string
  field, identical to the declaration shape rules.

The action flow is:

1. validate `CodeArtifactImportAndPublishInput`, normalize the import source
   (upload blob copy, workspace path containment check, attachment lookup)
   into a concrete `location` and any inferred `mimeType` / `sizeBytes`;
2. construct the equivalent `CodeArtifactDeclaration` (with
   `producer.kind = 'user'`, `requestedDisposition = 'record'`,
   `requestedStatus` unset, and the resolved `location` / `anchors`) and
   materialize it through the normal declaration path;
3. perform a `user_publish_action` transition on the materialized artifact
   in the same server-side action.

The normal declaration submit path shall reject `requestedStatus = 'published'`
even when `producer.kind = 'user'`.

#### Publish-Transition Failure Semantics

Step 3 (`user_publish_action` transition) runs after step 2 has already
upserted a durable `CoreArtifactRecord`. The action shall **not roll back**
the materialized artifact when only the publish transition fails:

- if step 1 (input validation / import normalization) fails → no artifact is
  created; return the corresponding validation error;
- if step 2 (declaration materialization) fails → no artifact is created;
  return the declaration-path error verbatim;
- if step 3 (publish transition) fails after step 2 succeeded → return
  `artifact_publish_transition_failed` with HTTP 502 (or the implementation's
  equivalent partial-success status) and a body that includes the
  materialized artifact id, its current `status` (typically `ready` or
  `draft`), and the underlying transition error reason. The artifact remains
  visible at its materialized status; the user / agent may retry the
  transition or invoke the standalone publish action later.

The same failure semantics apply when an existing-artifact publish action
(no import) fails: the artifact remains at its current status, the action
returns `artifact_publish_transition_failed`, and the caller may retry.

`tool_auto_publish_policy` outcomes follow the same rule: if a tool
declaration matches a publish policy and the publish transition fails after
materialization, the artifact is left at its materialized status (typically
`ready`), the upsert is reported as success, and a structured server log
entry with reason `tool_auto_publish_transition_failed` is emitted. Activity
emission still follows the material-change signature rules; one
`artifact_recorded` activity is written for the materialization, but no
`artifact_published` follow-on activity is emitted.

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
- `workspaceMatcher` is evaluated against the **server-resolved workspace key
  and canonical workspace path** (see § Workspace Key and Path
  Canonicalization below). Omitted matcher or `{ kind: 'any' }` means any
  resolved workspace context. `workspace_key` requires exact key match against
  the resolved workspace key. `path_prefix` requires a canonical path-prefix
  match against the resolved canonical workspace path.
- `runMatcher` is evaluated against server-resolved run/task anchors. Omitted
  matcher or `{ kind: 'any' }` means any run context. `run_id` and `task_id`
  require exact id match.
- The first implementation uses this single server config list. Per-workspace
  editable policy is a follow-up and must not introduce a second policy source
  without updating this spec.
- A policy entry with an unknown matcher kind, empty `toolName`, empty
  `labels`, or empty `values` for non-`any` matchers is invalid server config.
  Cats Code shall:
  - emit one structured server log entry at error level with category
    `code-artifact-declaration` and reason
    `tool_auto_publish_policy_invalid_entry`, including the offending entry
    index and the failing field;
  - surface the same diagnostics in `/api/code/health` under
    `codeArtifactDeclaration.policyDiagnostics` as an array of
    `{ category, reason, entryIndex, field }`;
  - drop only the invalid entries from the active policy set; remaining valid
    entries continue to apply.

  Operators that prefer fail-loud behaviour may opt in via
  `codeArtifactDeclaration.toolAutoPublishPolicies.failBootOnInvalidEntry =
  true`; in that mode any invalid entry shall fail server boot instead of
  being dropped silently. The default is to drop and report.

#### Workspace Key and Path Canonicalization

Code Workspace is a projection (terminology.md), not a Core record family,
so the `workspace_key` matcher and `path_prefix` matcher must agree on a
deterministic resolution rule.

Server-resolved workspace key shall be:

```text
<workspace-source>:<workspace-identity>
```

Where `workspace-source` matches the existing Code Workspace source
vocabulary and `workspace-identity` is:

| `workspace-source` | `workspace-identity` |
|--------------------|----------------------|
| `owner_folder` | canonicalized absolute path of the owner-selected folder |
| `conversation_repo` | canonicalized absolute path of the bound repo (`Conversation.repoPath`) |
| `runtime_cwd` | canonicalized absolute path of the runtime session `cwd` |
| `managed_room` | the managed room id verbatim (no path canonicalization) |

Server-resolved canonical workspace path shall be the
`workspace-identity` value above when the source is path-based
(`owner_folder`, `conversation_repo`, `runtime_cwd`); for `managed_room` the
canonical workspace path shall be `null` and `path_prefix` policies shall
not match.

Path canonicalization rules (apply to both the workspace identity above and
to `path_prefix` matcher `values`):

- normalize all path separators to forward slash (`/`);
- collapse `.` and `..` lexically without touching the filesystem (no
  symlink resolution, no `realpath`);
- collapse repeated slashes (`//` → `/`);
- normalize a trailing slash to no trailing slash;
- on Windows hosts: lowercase the drive letter and the entire path for
  comparison (case-insensitive); on Linux/macOS hosts: keep case
  (case-sensitive);
- absolute paths only — relative paths are rejected as policy `values`.

`path_prefix` matching shall be **path-segment-based**: a configured value
matches a candidate path only when, after canonicalization, the candidate is
either equal to the value or has the value followed by `/` as a strict
prefix. `/foo/bar` therefore matches `/foo/bar` and `/foo/bar/baz` but does
not match `/foo/barbaz`.

These rules apply uniformly to declaration validation, idempotency
`workspace:` scope key construction, and tool auto-publish policy matching.
Implementations shall reject policy entries whose canonicalized values are
not absolute paths with reason
`tool_auto_publish_policy_invalid_path_value` and surface them through the
diagnostics channel above.

Agent and system declarations are not publish-capable in this spec. Agents may
declare `ready` artifacts, but publishing them requires a later owner publish
action or a future explicit supervision/policy grant spec. Until that future
spec exists, an agent declaration that requests `published` shall be rejected
with `artifact_publish_requires_action`.

### Producer Onboarding

The receiver-side rules above only work if producers know the contract.
Producer onboarding has different shapes per producer kind; agents in
particular need explicit instruction or they will under- or over-declare.

#### Agent Onboarding

The Code product is responsible for keeping the **artifact-declaration
onboarding block** present in the agent's active system prompt **before
every assistant turn**, not only at session create. Concretely, after
each of these events the runtime bridge shall verify the current
onboarding block (matching the active version stamp) is in the agent's
visible context, and re-inject it if missing or stale:

- session create (`+New code` first activation);
- session resume (e.g. browser reload, runtime reconnect);
- context compaction / summarization that rewrites history;
- assistant role / system-prompt rewrite by any other product surface.

The onboarding block carries an explicit version stamp at its top so
runtime bridges can compare cheaply. The Code product shall publish the
template version under
`codeArtifactDeclaration.onboardingBlockVersion` (e.g. `"v1"`) and the
runtime bridge shall re-inject any time the stamp differs from the
published version.

The block:

- shall name the canonical tool: `declare_artifact`;
- shall instruct the agent to use **producer label** (`build_output`,
  `preview_url`, `test_report`, `review_report`,
  `implementation_summary`, `diff_summary`, `changed_files_summary`,
  `patch_bundle`, `screenshot`, `wireframe`, `spec_document`,
  `plan_document`, `transcript_export`, `dataset_file`, plus future
  labels) — **not** the Core kind. The Code product server maps label →
  coreKind per § Label Mapping;
- shall include an explicit **negative** list (do **not** declare source
  edits, intermediate / scratch files, lockfiles, generated dependency
  manifests, files in `node_modules/` / `.cache/` / `__pycache__/` /
  `.venv/` / build temp dirs, partial / failed-mid-stream outputs unless
  the failure itself is the artifact);
- shall instruct one declaration per durable output (no bundling) and
  remind the agent that source-file edits are workspace mutations, not
  artifacts;
- shall pin the **final-response gating rule** (below) so the agent
  treats a declaration as a precondition for claiming the artifact in
  visible text.

The first canonical onboarding block text is:

```text
<!-- cats-code:declare-artifact-onboarding:v1 -->
You can record durable outputs the user will want to find later by calling
the `declare_artifact` tool.

Identify each output by its producer **label**, not by the Core artifact
kind. The system maps the label to the underlying kind. Examples:

- a successful production build → label = "build_output"
- a runnable preview URL or local server → label = "preview_url"
- a generated test report → label = "test_report"
- a code review or implementation summary → label = "review_report" or
  "implementation_summary"
- a diff summary or changed-files summary → label = "diff_summary" or
  "changed_files_summary"
- a long-form design doc, spec, plan, or README → label = "spec_document",
  "plan_document", or "wireframe"
- a patch bundle or screenshot → label = "patch_bundle" or "screenshot"
- an exported chat or transcript file → label = "transcript_export"
- a generated dataset or fixture file → label = "dataset_file"

Do NOT declare:

- source-file edits in the workspace (those are workspace mutations, not artifacts)
- intermediate / scratch files written during exploration
- lockfiles, generated dependency manifests, cache files
- anything inside node_modules/, .cache/, __pycache__/, .venv/, dist/ work
  files that are not the final build, or temp build dirs
- partial outputs from a failed mid-stream run, unless the failure summary
  itself is the artifact the user wants to keep

Each declaration must include:

- `declarationId` — a stable, deterministic id per logical output;
  reuse the same id across retries so the system can deduplicate
- `label` — one of the labels above
- `title` — short human-readable title
- `location` — `{ kind: 'local_path' | 'url' | 'inline_summary' |
  'external_ref' | 'none', value: ... }`
- `summary` (optional) — one-line note when the title alone does not
  explain why this output exists
- `metadata` (optional) — producer-specific structured details under
  non-reserved keys (the system reserves the canonical Core artifact
  field names; see SPEC-092 § Metadata Rules)

You shall NOT pass `kind`, `producer`, `anchors`, `runId`, `taskId`, or
`conversationId` — those are filled server-side. If you pass them, the
server rejects the declaration with `artifact_producer_field_not_allowed`.

Final-response gating:

- If your final visible response to the user claims that an artifact has
  been produced or "can be found at X", you must have completed a
  `declare_artifact` tool call for that artifact within the same turn
  AND received an `accepted` result before emitting the final response.
  Use the accepted `declarationId` in the Code finalization artifact
  claim metadata.
- If `declare_artifact` was rejected, your final response shall not
  claim the artifact is recorded. State explicitly that the output
  exists in the workspace but was not recorded as an artifact (and
  briefly note the rejection reason if the user can act on it), or
  re-call `declare_artifact` after correcting the input.
- Streaming a final response before the tool call has resolved is not
  allowed for artifact-claim sentences. If the runtime forces partial
  streaming, do not include the artifact-claim sentence until the tool
  call has resolved.

Declare each artifact exactly once per logical output. Use the same
`declarationId` across retries.
```

Implementation notes:

- The Code product owns the template text and version stamp. CLI
  provider adapters (claude-code / codex / cursor / opencode / etc.)
  shall not rewrite positive / negative lists or change the version
  stamp; they may translate format only if the underlying provider does
  not accept the literal block, but the version stamp must propagate.
- The onboarding block shall be emitted as a stable system-prompt
  segment separate from the user-authored `+New code` first message.
  Implementations that rewrite history mid-session shall preserve the
  onboarding block verbatim **or** re-inject the published version
  before the next assistant turn.
- When an agent declares an artifact and the server rejects it with one
  of the SPEC-092 error codes, the rejection reason is surfaced to the
  agent through the same tool-call-result channel; the agent may correct
  and re-call. Server shall not auto-retry on the agent's behalf.

#### Final-Response Gate

The final-response gate is evaluated at the Code session finalization
boundary, not by parsing transcript prose. Runtime/provider adapters shall
expose a structured finalization envelope before any final visible response
is shown:

```ts
interface CodeAssistantFinalization {
  assistantTurnId: string;
  bodyText: string;
  artifactClaims?: Array<{
    declarationId: string;
    label?: string | null;
    title?: string | null;
  }>;
}
```

Rules:

- `assistantTurnId` is the product/session-loop id for one assistant turn
  attempt. A same-turn declaration is one accepted `declare_artifact` tool
  result emitted under the same `assistantTurnId`.
- Every `artifactClaims[]` entry must include the normalized
  `declarationId` of an accepted same-turn declaration. Matching by title,
  label, location, or free text is not authoritative.
- If any claim lacks an accepted same-turn declaration, the runtime bridge
  shall block the finalization, surface a structured warning back to the
  agent with code `artifact_claim_without_declaration`, and allow the agent
  to either call `declare_artifact` or remove the claim. The ungated final
  response shall not be shown to the user.
- Streaming adapters shall buffer or defer artifact-claim rendering until
  the finalization envelope has passed the gate. They may stream unrelated
  body text only if doing so cannot reveal an artifact claim before the gate.
- Renderers and projections shall use the structured `artifactClaims[]`
  metadata for artifact claim affordances. They shall not parse transcript
  prose as the normative declaration or gate input.
- Best-effort text heuristics may emit telemetry for suspicious prose, but
  they must not be the acceptance path for this gate and must not replace
  the structured envelope.

Implementation status note (2026-04-29): the first active-session wiring
slice injects/advertises the artifact contract and observes
`declare_artifact` tool-use shape, but does not yet enforce this final-response
gate. Until Task 3.1d lands, Cats Platform may still show a final visible
response that claims an artifact without an accepted same-turn declaration.

#### Tool Catalog Registration

`declare_artifact` shall be registered as a first-class Code-product tool
in the catalog visible to the active runtime session, alongside the rest
of the agent's tools:

- the tool name shall be exactly `declare_artifact` (no aliases);
- the tool's catalog description shall reproduce the positive label
  examples and a short form of the negative list so an agent that does
  not see the full onboarding block (e.g. tool-only listing) can still
  infer correct usage;
- the tool's parameter schema shall expose **only** these
  agent-visible fields:

  - `declarationId: string` (required, stable across retries)
  - `label: string` (required producer label; server maps to
    `coreKind` per § Label Mapping)
  - `title: string` (required)
  - `location: { kind: 'local_path' | 'url' | 'inline_summary' |
    'external_ref' | 'none'; value?: string | null }` (required;
    `kind = 'none'` requires a non-empty `summary` per § Location
    Rules)
  - `summary?: string | null` (optional)
  - `metadata?: Record<string, unknown>` (optional, must obey
    § Metadata Rules)

  Server-resolved fields (`producer.*`, authoritative
  `runId` / `taskId` / `conversationId` / `workspaceKey`,
  `coreKind` derivation, `requestedDisposition`, `requestedStatus`)
  shall be **omitted from agent-visible parameters**. If a CLI
  provider's tool framework forces inclusion of those fields, the Code
  product shall mark them optional and instruct the agent to leave them
  unset. Any non-null agent-supplied value in those fields rejects the
  entire declaration with `artifact_producer_field_not_allowed`; no
  artifact is materialized from that call. When the fields are omitted or
  null, Cats Code uses only server-resolved values.

#### `declarationId` Composition Guidance for Agents

The server is authoritative on idempotency keys (§ Idempotency Key) but
agents help by emitting a stable `declarationId` per logical output. The
recommended composition for agent-emitted declarations is:

```text
<short-stable-output-handle>:<producer-label>
```

For example: `pomodoro-preview-localhost-5180:preview_url`,
`spec-092-draft:spec_document`,
`build-284-success:build_output`. Agents shall not include random
nonces in `declarationId` unless the underlying output truly is
unique-per-call; random ids defeat idempotency on retries.

#### Tool / System / User Onboarding

Tool, system, and user producers do not use the agent system prompt:

- **Tool** producers are server-side bridge code in the Code runtime /
  delivery proxy. They call `upsertCoreArtifactDeclaration` (or its
  internal delegate) directly from the tool-completion handler with a
  declaration constructed from known runtime/tool output (preview URL,
  build manifest, test report, screenshot, etc.). No prompt injection.
- **System** producers are Code-bridge detector code. They call the same
  delegate as tools, with `producer.kind = 'system'` and the registered
  detector name. System producers are candidate-only per § Disposition
  and Status Precedence.
- **User** producers come from sidebar affordances (Add attachment,
  Export transcript, import-and-publish). The product UI constructs the
  declaration / `CodeArtifactImportAndPublishInput` payload; users do
  not interact with `declare_artifact` directly.

### Location Rules

`location.kind` is interpreted as follows:

| Kind | `value` meaning | Core `path` behavior | Additional rules |
|------|-----------------|----------------------|------------------|
| `none` | No durable object reference | `null` | Requires a non-empty `summary` or metadata evidence. |
| `local_path` | Workspace-relative path, or an absolute path that canonicalizes inside the resolved workspace | normalized workspace-relative path | Absolute paths outside the workspace are rejected unless they are normalized through user import first. |
| `url` | HTTP(S) URL for a preview or externally hosted output | normalized URL string | Credentials in URLs are rejected. Runtime-local URLs must be attached to known runtime/tool output or explicit user input. |
| `inline_summary` | Text summary content, not a file path | `null` | `value` is copied into `summary` when `summary` is empty; maximum 8 KiB **after trimming** (size check uses the trimmed bytes). When the producer supplies both a non-empty `summary` and `location.value`, they are NOT required to match: `summary` is the short caller-facing description while `location.value` carries the full inline content (e.g. multi-paragraph implementation summary). Persisted forms use trimmed values for both. Surfaces that need a single canonical text shall prefer `summary`; surfaces that need full evidence shall prefer `location.value`. |
| `external_ref` | Opaque reference to a known external object, such as an upload id, runtime artifact id, or storage key | normalized external reference string | The value must use `<refKind>:<refId>`, where `refKind` is allowlisted and `refId` is non-empty. Both `refKind` and `refId` are trimmed before comparison and persistence. |

When implementation splits context-free shape normalization from server
materialization, a normalized `local_path` is still untrusted. The helper may
normalize separators and collapse `.` / `..` lexically, but it shall carry
two internal verification markers until the server has resolved the workspace
and applied the host-OS case rule from § Workspace Key and Path
Canonicalization:

- `verification.workspaceContainment = 'unverified'` until the server confirms
  the canonical path is contained inside the resolved workspace;
- `verification.pathCaseCanonicalization = 'unverified'` until the server
  applies the Windows-lowercase / Linux-keep-case rule (the helper is
  host-agnostic and preserves drive-letter case verbatim).

Both markers are NOT part of the agent-visible tool schema and shall not be
treated as proof of containment or canonical case. The agent-side input shape
does not carry `verification`, so producer-supplied values are silently
dropped during normalization rather than trusted.

Edge cases the helper does NOT handle (intentional, documented):

- **UNC paths** (`\\server\share\...`) are not preserved; after separator
  normalization the leading double slash collapses, so `\\server\share\foo`
  becomes `/server/share/foo`. UNC-mounted workspaces are not a target use
  case for the current scaffold.
- **Drive-relative paths** (`C:foo` without a slash after the colon) are
  conservatively rejected as URL-like with `artifact_local_path_invalid`.

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
| `transcript_export` | `transcript_export` | `ready` | `record` |
| `dataset_file` | `dataset` | `ready` | `record` |

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
- agent-facing declarations do not supply server-resolved fields that are
  omitted from the `declare_artifact` tool schema. Non-null values for
  `kind`, `coreKind`, `producer.*`, `anchors.*`, `runId`, `taskId`,
  `conversationId`, `workspaceKey`, `requestedDisposition`, or
  `requestedStatus` are rejected with
  `artifact_producer_field_not_allowed`.

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
- Per-workspace editable `toolAutoPublishPolicies` overrides (vs. the current
  single server config list) is deferred — when does that follow-up land, and
  does it co-exist with the boot-time list or replace it?
- Should the agent onboarding block accept per-task or per-workspace
  customization (e.g. a workspace policy that elevates `diff_summary` to
  `record` instead of `candidate`, or a task that wants every preview
  declared regardless of size)? Deferred to the same per-workspace policy
  follow-up as `toolAutoPublishPolicies`.

---

*Created: 2026-04-29*
*Author: Codex*
*Related Plan: [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md)*
*Amended: 2026-04-29 — added § Workspace Key and Path Canonicalization (workspace key resolution, host-OS-aware lexical canonicalization, segment-based prefix matching), § Publish-Transition Failure Semantics (no rollback, `artifact_publish_transition_failed` partial-success contract, `tool_auto_publish_transition_failed` server log), `CodeArtifactImportAndPublishInput` payload shape and route, structured `policyDiagnostics` channel + `failBootOnInvalidEntry` opt-in, and string input normalization (empty / whitespace → null on optional fields, `artifact_required_field_empty` on required fields).*
*Amended: 2026-04-29 — added § Producer Onboarding: agent system-prompt onboarding block (positive + negative artifact list, one-declaration-per-output rule, context-compression preservation), tool-catalog registration shape, agent-side `declarationId` composition guidance, and tool / system / user producer onboarding paths.*
*Amended: 2026-04-29 — § Producer Onboarding tightened: agent-visible tool schema is **label-based** (`declarationId` + `label` + `title` + `location` + `summary` + `metadata`); `kind` / `coreKind` / `producer.*` / authoritative anchors removed from agent-facing schema and rejected with `artifact_producer_field_not_allowed` if supplied. Added explicit structured **final-response gating** via `CodeAssistantFinalization.artifactClaims[]`; each claim must match a same-turn accepted `declarationId`, unmatched claims block finalization with `artifact_claim_without_declaration`, and prose heuristics are telemetry only. Added `transcript_export` and `dataset_file` label mappings. Onboarding block carries `codeArtifactDeclaration.onboardingBlockVersion` stamp and runtime bridge re-injects before every assistant turn after session create / resume / context compaction / system-prompt rewrite, not only at first turn.*
*Amended: 2026-04-29 — clarified split normalization semantics for `local_path`: context-free helpers may perform lexical path normalization but must mark workspace containment as `unverified` until server materialization validates it. `inline_summary` size checks and persisted values use trimmed content, `external_ref` trims both `refKind` and `refId`, and empty strings for agent-supplied server-resolved fields are treated as omitted.*
*Amended: 2026-04-29 — split `CodeArtifactLocationInput` (no `verification`) from `CodeArtifactLocationNormalized` (with `verification`) so producer-supplied `verification` is rejected at the TS type boundary, not just by convention. Broadened the `local_path` deferred-verification marker into `{ workspaceContainment: 'unverified', pathCaseCanonicalization: 'unverified' }` to cover both server-side concerns (containment + Windows drive-letter case rule). Documented `inline_summary` `summary` vs `location.value` divergence is permitted (short description vs full content), UNC paths are not preserved, and drive-relative paths reject as URL-like.*
