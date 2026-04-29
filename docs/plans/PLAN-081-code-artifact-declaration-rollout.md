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
- [ ] Task 1.3: Add the canonical idempotency key builder:
      producer kind + server-resolved producer identity + server-resolved
      run/runtime/conversation/workspace scope + normalized declaration id.
      Freeze the resolved scope on first accepted materialization and support
      compatible producer/declaration fallback lookup on later retries.
- [ ] Task 1.4: Add label default, producer-requested downgrade, and server
      policy precedence helpers for disposition/status.
- [ ] Task 1.5: Add publishing policy helpers. Ordinary declarations cannot
      set `published`; only owner publish actions and server-configured tool
      auto-publish policy can transition artifacts to `published`.
- [ ] Task 1.6: Add validation helpers for title, kind, status, anchor
      existence, idempotency key, producer identity, location kind, and
      metadata size/reserved keys.
- [ ] Task 1.7: Add workspace-containment validation for local paths.
- [ ] Task 1.8: Add validators for `none`, `url`, `inline_summary`, and
      `external_ref` locations, including the server-configured
      `externalRefKinds` allowlist.
- [ ] Task 1.9: Add the material-change signature helper used to suppress
      duplicate `artifact_recorded` activity on no-op replay.
- [ ] Task 1.10: Define first candidate storage strategy: draft Core artifact
      with candidate metadata, or product-local pending queue.

**Deliverables**: shared Code artifact declaration parsing, mapping, and
validation helpers with unit coverage.

### Phase 2: Product API and Persistence Path

- [ ] Task 2.1: Add a Code-owned API route or internal product delegate for
      submitting artifact declarations. This is the only persistence authority
      for declarations.
- [ ] Task 2.2: Normalize server-side anchors from current execution context
      before trusting declaration hints.
- [ ] Task 2.3: Add detached user-import handling that requires an explicit
      selected workspace or anchor target before accepting the declaration.
- [ ] Task 2.4: Write accepted declarations through `upsertCoreArtifact`.
- [ ] Task 2.5: Add idempotent upsert behavior keyed by the SPEC-092 canonical
      idempotency key, not by raw declaration id alone. Persist frozen scope
      metadata and use the compatible producer/declaration fallback when retry
      timing changes the active scope.
- [ ] Task 2.6: Emit idempotent background `artifact_recorded` activity when a
      declaration creates or materially updates a durable artifact, based on
      the SPEC-092 material-change signature.

**Deliverables**: one authoritative Code server path from declaration to
`CoreArtifactRecord`.

### Phase 3: Runtime, Tool, and Agent Producers

- [ ] Task 3.1: Expose the Phase 1 agent-facing channel as a Cats-native Code
      runtime action named `declare_artifact` backed by the Code product
      API/delegate. Do not use transcript JSON as a fallback command channel.
- [ ] Task 3.2: Define a Code-owned runtime artifact signal shape before
      auto-materializing bridge outputs. The first fields should cover preview
      URL, build output, test report, screenshot, patch bundle, and review
      report as separate optional signals rather than one catch-all payload.
- [ ] Task 3.3: Map preview URL runtime/tool signals to `preview_url`
      declarations and verify the URL came from known runtime/tool output.
- [ ] Task 3.4: Map build output and test report signals to `build_output` and
      `test_report` declarations only after the runtime observation payload can
      identify the output path/URL/ref and result status.
- [ ] Task 3.5: Map screenshot, patch bundle, and review report signals as
      separate tool declarations with location-specific validation.
- [ ] Task 3.6: Add system-candidate production for safe summaries such as
      changed-files summary or diff summary after a run completes.
- [ ] Task 3.7: Route user imports and attachments through the same
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
      validation, idempotency, disposition/status precedence, publish
      action gating, metadata bounds, external-ref allowlists, material-change
      signatures, and candidate handling.
- [ ] Task 5.2: Add integration tests for agent/tool/system/user declaration
      flows writing `CoreArtifactRecord` and idempotent activity.
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
| `src/products/code/shared/runtimeArtifactSignals.ts` | Create | Code-owned bridge signal shape for preview/build/test/screenshot/patch/report outputs |
| `src/products/code/shared/workspaceSummary.ts` | Modify | Reuse workspace containment / summary semantics |
| `src/products/code/state/taskExecution.ts` | Modify | Submit declarations for runtime bridge outputs |
| `src/products/code/state/deliveryProxy.ts` | Modify | Normalize delivery outputs into declarations where applicable |
| `src/runtime/client.ts` | Modify if needed | Add explicit observation fields only when runtime can produce verified output signals |
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
- Use the Cats-native Code runtime action `declare_artifact` for Phase 1 agent
  declarations. MCP and runtime stream events are follow-up adapters into the
  same Code product API.
- Construct idempotency from server-resolved producer identity, execution
  scope, and declaration id. Freeze the accepted scope and use compatible
  producer/declaration fallback lookup for retry timing changes. Raw
  declaration id alone is not unique enough.
- Resolve label defaults first, producer-requested downgrades second, and
  server policy last.
- Treat system declarations as candidate-only. Durable record-capable runtime
  outputs must come through tool declarations.
- Treat `published` as a publish action / server auto-publish policy outcome,
  not an ordinary declaration upgrade. Agent declarations cannot publish in
  this spec.
- Emit `artifact_recorded` activity for non-noop durable materializations using
  the material-change signature, not a full-record hash.
- Use one Code server-configured `externalRefKinds` allowlist for
  `external_ref` locations in the first implementation.
- Candidate handling must be explicit in implementation. The first slice may
  use `status = 'draft'` plus metadata, but this must be validated and
  documented.

## Testing Strategy

- **Unit Tests**: label mapping, disposition/status precedence, publish
  capability, location validators, metadata bounds/reserved keys, workspace
  containment, idempotency key construction, candidate metadata.
- **Integration Tests**: declaration -> upsert Core artifact -> Code artifact
  projection, with agent/tool/system/user producer examples and idempotent
  replay that does not duplicate artifacts or activity.
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
| Idempotency misses duplicate agent retries | Medium | Use the SPEC-092 canonical key from producer identity, execution scope, and declaration id, with frozen scope fallback lookup |
| Runtime bridge work is underestimated | Medium | Split signal schema, preview, build/test, screenshot, patch, and report mapping into separate tasks |
| Published status is granted accidentally | High | Reject `published` on ordinary declarations; allow only owner publish action or server-configured tool auto-publish |
| Idempotent replays emit duplicate activity | Medium | Compare the SPEC-092 material-change signature instead of full record timestamps/metadata |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-29 | Plan created for structured Code artifact declarations. |
| 2026-04-29 | Tightened contract rollout around idempotency, precedence, publish-action gating, system candidate-only behavior, Phase 1 Cats-native action channel, and split runtime bridge signal tasks. |
| 2026-04-29 | Clarified publication as an explicit publish action / tool auto-policy path, froze idempotency scope across retries, defined producer identity resolution, external-ref allowlist, and material-change activity suppression. |

---

*Created: 2026-04-29*
*Author: Codex*
