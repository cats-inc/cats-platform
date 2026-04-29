# PLAN-081: Code Artifact Declaration Rollout

> Implement the structured artifact declaration path that lets agents, tools,
> system detection, and user imports materialize durable Code artifacts without
> scanning the workspace or parsing transcript JSON.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |
| **Related ADR** | [ADR-088](../decisions/088-use-structured-artifact-declarations-for-code-materialization.md) |
| **Related Spec** | [SPEC-092](../specs/SPEC-092-code-artifact-declaration-contract.md) |

## Related Spec

[SPEC-092: Code Artifact Declaration Contract](../specs/SPEC-092-code-artifact-declaration-contract.md)

## Overview

The rollout adds one product-owned materialization path:

```text
structured artifact declaration
  -> validate / normalize
  -> choose record vs candidate
  -> upsert CoreArtifactRecord
  -> project into Code Artifacts
```

The first slice should focus on contract correctness and provenance. It should
not attempt to build a rich artifact review inbox, add new Core artifact kinds,
or infer artifacts by scanning the workspace.

## Implementation Phases

### Phase 1: Contract and Normalization Helpers

- [ ] Task 1.1: Add a browser/server-safe `CodeArtifactDeclaration` contract in
      the Code product tree.
- [ ] Task 1.2: Add label-to-`CoreArtifactKind` mapping helpers matching
      SPEC-092.
- [ ] Task 1.3: Add validation helpers for title, kind, status, anchor
      existence, idempotency key, location kind, and metadata size.
- [ ] Task 1.4: Add workspace-containment validation for local paths.
- [ ] Task 1.5: Define first candidate storage strategy: draft Core artifact
      with candidate metadata, or product-local pending queue.

**Deliverables**: shared Code artifact declaration parsing, mapping, and
validation helpers with unit coverage.

### Phase 2: Product API and Persistence Path

- [ ] Task 2.1: Add a Code-owned API route or internal product delegate for
      submitting artifact declarations.
- [ ] Task 2.2: Normalize server-side anchors from current execution context
      before trusting declaration hints.
- [ ] Task 2.3: Write accepted declarations through `upsertCoreArtifact`.
- [ ] Task 2.4: Add idempotent upsert behavior keyed by producer, run/session,
      and declaration id.
- [ ] Task 2.5: Optionally emit `artifact_recorded` activity after a durable
      Core artifact is written.

**Deliverables**: one authoritative Code server path from declaration to
`CoreArtifactRecord`.

### Phase 3: Runtime, Tool, and Agent Producers

- [ ] Task 3.1: Teach Code runtime bridge flows to submit declarations for
      known outputs such as preview URL, build output, test report, screenshot,
      patch bundle, and review report.
- [ ] Task 3.2: Expose an agent-facing structured action such as
      `record_artifact` / `declare_artifact` instead of relying on transcript
      JSON.
- [ ] Task 3.3: Add system-candidate production for safe summaries such as
      changed-files summary or diff summary after a run completes.
- [ ] Task 3.4: Route user imports and attachments through the same
      declaration path after upload/import normalization.

**Deliverables**: at least one agent-declared, one tool-declared, and one
system-candidate artifact path.

### Phase 4: Projection and Sidebar Integration

- [ ] Task 4.1: Update Code artifact projections to read materialized
      `CoreArtifactRecord` rows and declaration metadata.
- [ ] Task 4.2: Add artifact filters by producer label, Core kind, status,
      workspace, task, and producing run.
- [ ] Task 4.3: Ensure artifact detail deep-links to conversation, task, run,
      workspace, and Work anchors when available.
- [ ] Task 4.4: Keep source file edits out of the artifact sidebar unless they
      are represented by a declared patch/report/summary artifact.

**Deliverables**: Code `Artifacts` sidebar reads the materialized artifact
contract and stays separate from workspace file browsing.

### Phase 5: Tests, Documentation, and Mockup Handoff

- [ ] Task 5.1: Add unit tests for label mapping, path containment, anchor
      validation, idempotency, status downgrades, and candidate handling.
- [ ] Task 5.2: Add integration tests for agent/tool/system/user declaration
      flows writing `CoreArtifactRecord`.
- [ ] Task 5.3: Update mockup notes so designers know which artifact states and
      provenance fields should be visible.
- [ ] Task 5.4: Update docs after implementation if candidate storage differs
      from the initial plan.

**Deliverables**: validated artifact declaration rollout ready for UI mockup
and implementation review.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/code/api/artifactDeclarationRoutes.ts` | Create | Code-owned API/delegate route for artifact declarations |
| `src/products/code/api/contracts.ts` | Modify | Export declaration request/response shapes |
| `src/products/code/api/projection.ts` | Modify | Project artifacts from Core rows plus declaration metadata |
| `src/products/code/shared/artifactDeclaration.ts` | Create | Mapping, validation, and metadata helpers |
| `src/products/code/shared/workspaceSummary.ts` | Modify | Reuse workspace containment / summary semantics |
| `src/products/code/state/taskExecution.ts` | Modify | Submit declarations for runtime bridge outputs |
| `src/products/code/state/deliveryProxy.ts` | Modify | Normalize delivery outputs into declarations where applicable |
| `src/core/planningRecordLists.ts` | Modify | Add additive query support only if Code projections need it |
| `src/core/model/planningRecords.ts` | Modify | Avoid schema change unless idempotency metadata needs helper support |
| `tests/code-artifact-declaration.test.js` | Create | Contract, mapping, validation, and idempotency tests |
| `tests/code-artifact-projection.test.js` | Create | Sidebar/detail projection tests |
| `tests/code-task-execution.test.js` | Modify | Cover runtime bridge artifact declaration side effects |
| `docs/specs/SPEC-092-code-artifact-declaration-contract.md` | Maintain | Keep contract aligned with implementation |

## Technical Decisions

- Use `CoreArtifactRecord` as the durable record; declarations are input
  contracts, not a new Core family.
- Do not scan the workspace to discover artifacts.
- Do not parse transcript JSON as artifact commands.
- Keep producer labels flexible in metadata while mapping to the existing Core
  artifact kind enum.
- Treat server-side execution context as authoritative for conversation/task/run
  provenance.
- Candidate handling must be explicit in implementation. The first slice may
  use `status = 'draft'` plus metadata, but this must be validated and
  documented.

## Testing Strategy

- **Unit Tests**: label mapping, validation, workspace containment, status
  downgrade, idempotency key construction, candidate metadata.
- **Integration Tests**: declaration -> upsert Core artifact -> Code artifact
  projection, with agent/tool/system/user producer examples.
- **Manual Testing**: run a `+New code` execution that produces a preview/test
  report declaration, verify the artifact appears in the Code artifact list,
  opens detail, and deep-links back to the originating task/run/workspace.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent declarations become trusted too directly | High | Server validates anchors, paths, status, and kind before persistence |
| Artifact sidebar becomes a file explorer | High | Source edits are mutations; only declared/published outputs become artifacts |
| Candidate artifacts pollute the durable list | Medium | Store candidates as draft with explicit metadata or keep them in a pending queue |
| Runtime/tool producers drift into separate payload formats | Medium | Route all producer classes through one declaration normalizer |
| Idempotency misses duplicate agent retries | Medium | Require declaration id scoped to producer and run/session context |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-29 | Plan created for structured Code artifact declarations. |

---

*Created: 2026-04-29*
*Author: Codex*
