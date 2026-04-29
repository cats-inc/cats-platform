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
12. Cats Code shall support idempotent declaration handling so a retried agent
    or tool call does not create duplicate artifacts.
13. Cats Code shall support two declaration dispositions:
    - `record`: write or update a `CoreArtifactRecord`
    - `candidate`: hold for review or materialize as `draft` with candidate
      metadata, depending on implementation phase
14. A declaration that becomes a Core artifact shall choose one Core status:
    - `draft`
    - `ready`
    - `published`
15. A producer may request status, but Cats Code may downgrade it based on
    policy.
16. Runtime/tool bridge outputs such as preview URL, build output, test report,
    screenshot, delivery manifest, patch bundle, and review report should use
    the same declaration contract.
17. User imports and attachments should use the same declaration contract after
    upload/import normalization.
18. Artifact sidebar projections shall read materialized `CoreArtifactRecord`
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

- `declarationId` is scoped to the producer + run/session context for
  idempotency.
- `artifact.title` is required.
- `artifact.label` is producer-facing vocabulary such as `review_report`,
  `diff_summary`, `test_report`, `patch_bundle`, or `preview_url`.
- `artifact.coreKind` may be omitted; Cats Code maps from `label` when possible.
- `location.kind = 'local_path'` must resolve inside the workspace unless the
  producer is a user import.
- `location.kind = 'url'` is allowed for preview or externally hosted outputs
  only when the URL is attached to known runtime/tool output or explicit user
  input.
- `anchors` are hints. Server-side context wins when there is a conflict.
- `metadata` may carry producer-specific details, but it must not override
  normalized Core fields.

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

Unknown labels default to `report` + `candidate` unless product policy rejects
them.

### Validation Rules

Cats Code shall validate:

- title is non-empty,
- mapped Core kind is allowed,
- requested status is allowed,
- at least one structural anchor or workspace context exists,
- referenced conversation/task/run/project/work item ids resolve when present,
- task/run anchors are compatible when both are present,
- workspace path resolves to a known Code workspace when required,
- local path is inside the resolved workspace,
- URL artifacts are allowed for the producer and label,
- declaration id is stable enough for idempotency,
- metadata size stays bounded.

Cats Code shall reject declarations that attempt to:

- write outside the workspace through path traversal,
- claim a Work project/work item anchor that does not exist,
- claim a run unrelated to the current task,
- elevate status to `published` without an explicit publish-capable producer,
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

When a declaration is accepted as `candidate`, Cats Code may:

- write `CoreArtifactRecord.status = 'draft'` with metadata indicating
  candidate state, or
- store the candidate in a product-local pending queue until the artifact is
  approved or discarded.

The first implementation may choose either candidate storage strategy, but the
chosen strategy must be documented in the implementing plan update.

### Activity and Audit

When a declaration becomes a durable `CoreArtifactRecord`, Cats Code should
write a background/system `CoreActivityRecord` of kind `artifact_recorded` when
the surrounding flow already uses activity feeds. Activity is audit/feed
evidence, not the artifact itself.

### Non-Functional Requirements

- **Traceability**: Every materialized artifact must expose enough provenance
  for users to find the originating conversation, task, run, and workspace.
- **Idempotency**: Retried declarations should update the same artifact or be
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
- Which runtime/tool events should auto-record by default versus become
  candidates?
- Should future Core add a `candidate` artifact status, or is `draft` plus
  metadata sufficient?
- Should generated source patches be `attachment`, `report`, or a future
  dedicated artifact kind?

---

*Created: 2026-04-29*
*Author: Codex*
*Related Plan: [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md)*
