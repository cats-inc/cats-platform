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
      auto-publish policy can transition artifacts to `published`. Include
      the `codeArtifactDeclaration.toolAutoPublishPolicies` config schema,
      matcher validation, the
      `codeArtifactDeclaration.toolAutoPublishPolicies.failBootOnInvalidEntry`
      opt-in flag, and the `/api/code/health`
      `codeArtifactDeclaration.policyDiagnostics` reporting structure from
      SPEC-092.
- [ ] Task 1.5b: Add the SPEC-092 workspace-key resolver and path
      canonicalization helper used by the `workspace_key` /
      `path_prefix` matchers, idempotency `workspace:` scope key
      construction, and declaration validation. Include the host-OS
      case-sensitivity rule and the path-segment-prefix matching rule;
      reject non-absolute policy values with
      `tool_auto_publish_policy_invalid_path_value`.
- [ ] Task 1.5c: Add the SPEC-092 string input normalization helper
      (trim → null) used by all optional declaration string fields and the
      import-and-publish payload before validation and idempotency-key
      construction. Reject empty trimmed values for required fields with
      `artifact_required_field_empty`.
- [ ] Task 1.6: Add validation helpers for title, kind, status, anchor
      existence, idempotency key, producer identity, location kind, and
      metadata size/reserved keys.
- [ ] Task 1.7: Add workspace-containment validation for local paths.
- [ ] Task 1.8: Add validators for `none`, `url`, `inline_summary`, and
      `external_ref` locations, including the server-configured
      `externalRefKinds` allowlist.
- [ ] Task 1.9: Add the material-change signature helper used to suppress
      duplicate `artifact_recorded` activity on no-op replay, including
      recursive volatile-key removal for `producerDetails`.
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
- [ ] Task 2.5: Add a distinct user import-and-publish product action that
      accepts the SPEC-092 `CodeArtifactImportAndPublishInput` payload at
      `POST /api/code/artifacts/import-and-publish` (or the equivalent
      product delegate). The action must (a) normalize the import source,
      (b) construct the equivalent declaration with `producer.kind = 'user'`
      and `requestedStatus` unset, (c) materialize through the normal
      declaration path, and (d) perform the `user_publish_action` transition
      after materialization. It must reject `requestedStatus =
      'published'` on the normal declaration path.
- [ ] Task 2.5b: Implement the SPEC-092 publish-transition failure
      semantics: do **not** roll back the materialized artifact when only
      the publish transition fails. Return
      `artifact_publish_transition_failed` (HTTP 502 or equivalent partial
      status) with the materialized artifact id and current status; emit a
      `tool_auto_publish_transition_failed` server log when the failing
      path is `tool_auto_publish_policy`. Stand-alone publish-action
      failures on existing artifacts follow the same partial-success
      contract.
- [ ] Task 2.6: Add idempotent upsert behavior keyed by the SPEC-092 canonical
      idempotency key, not by raw declaration id alone. Persist frozen scope
      metadata and use the compatible producer/declaration fallback when retry
      timing changes the active scope.
- [ ] Task 2.7: Return recoverable ambiguous-candidate payloads for
      `artifact_idempotency_ambiguous`; never auto-pick an artifact server-side.
- [ ] Task 2.8: Emit idempotent background `artifact_recorded` activity when a
      declaration creates or materially updates a durable artifact, based on
      the SPEC-092 material-change signature.

**Deliverables**: one authoritative Code server path from declaration to
`CoreArtifactRecord`.

### Phase 3: Runtime, Tool, and Agent Producers

- [ ] Task 3.1: Expose the Phase 1 agent-facing channel as a Cats-native Code
      runtime action named `declare_artifact` backed by the Code product
      API/delegate. Do not use transcript JSON as a fallback command channel.
- [ ] Task 3.1a: Inject the SPEC-092 § Producer Onboarding agent
      onboarding block (with the active version stamp from
      `codeArtifactDeclaration.onboardingBlockVersion`) into the system
      prompt of every Code runtime session **before every assistant turn**,
      not only at session create. Runtime bridge shall verify presence +
      version match after session create, session resume, context
      compaction / summarization, and any other system-prompt rewrite
      surface; if missing or stale, re-inject before the next assistant
      turn. CLI provider adapters may translate format but shall not
      rewrite the content of the positive / negative lists or change the
      version stamp.
- [ ] Task 3.1b: Register `declare_artifact` in the Code-product tool
      catalog with the SPEC-092 agent-visible parameter schema:
      `declarationId`, `label`, `title`, `location`, `summary`, and
      `metadata` only — **no `kind` / `coreKind` / `producer.*` /
      `anchors.*` / `runId` / `taskId` / `conversationId` /
      `requestedDisposition` / `requestedStatus` in the agent-facing
      schema**. The Code product fills `coreKind` from `label` per
      § Label Mapping and fills server-resolved fields itself. If a CLI
      provider's tool framework forces inclusion of disallowed fields,
      reject any agent-supplied value with
      `artifact_producer_field_not_allowed` and use server-resolved
      values. The tool name shall be exactly `declare_artifact` (no
      aliases). Catalog description shall short-form the positive +
      negative list so tool-only listings remain self-explanatory.
- [ ] Task 3.1c: Surface server validation errors back to the agent through
      the tool-call-result channel verbatim (using the SPEC-092 error codes
      such as `artifact_required_field_empty`,
      `artifact_publish_requires_action`, `artifact_idempotency_ambiguous`,
      `artifact_producer_field_not_allowed`, etc.) so the agent can correct
      and re-call. Server shall not auto-retry on the agent's behalf.
- [ ] Task 3.1d: Enforce the SPEC-092 final-response gating rule. The
      runtime bridge / Code session loop shall require a structured
      finalization envelope before any final visible response is shown:
      `assistantTurnId`, `bodyText`, and optional `artifactClaims[]`.
      Each `artifactClaims[]` entry must reference the normalized
      `declarationId` of a same-turn `declare_artifact` call that received
      an `accepted` result under the same `assistantTurnId`. If a claim is
      missing that declaration, block finalization and surface
      `artifact_claim_without_declaration` back to the agent so it can
      either declare or remove the claim. Streaming adapters must buffer or
      defer artifact-claim rendering until this gate passes. Text heuristics
      may produce telemetry only; they are not the normative gate.
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

- [x] Task 4.1: Update Code artifact projections to read materialized
      `CoreArtifactRecord` rows and declaration metadata. Landed:
      `CodeArtifactListItem` exposes `producerLabel`, `workspacePath`,
      `conversationId`, and `disposition` derived from
      `metadata.codeArtifactDeclaration`.
- [x] Task 4.2: Add artifact filters by producer label, Core kind, status,
      workspace, task, and producing run. Landed:
      `CodeArtifactListFilters` accepts kind, status, producerLabel,
      workspacePath, taskId, runId; `/api/code/artifacts` reads each as a
      query param.
- [x] Task 4.3: Ensure artifact detail deep-links to conversation, task, run,
      workspace, and Work anchors when available. Already covered by
      `CodeArtifactDetailProjection` (task / workItem / project /
      conversation references resolved via `resolveConversation` and the
      task/work-item lookups).
- [x] Task 4.4: Keep source file edits out of the artifact sidebar unless they
      are represented by a declared patch/report/summary artifact. Landed:
      `excludeUndeclaredSourceEdits` filter hides artifacts with no
      `codeArtifactDeclaration` and a non-URL local path; the renderer
      Artifacts page passes the flag by default so undeclared raw source
      edits stay out of the sidebar.

**Deliverables**: Code `Artifacts` sidebar reads the materialized artifact
contract and stays separate from workspace file browsing.

### Phase 5: Tests, Documentation, and Mockup Handoff

- [ ] Task 5.1: Add unit tests for label mapping, path containment, anchor
      validation, idempotency, disposition/status precedence, publish
      action gating, tool auto-publish policy matchers, metadata bounds,
      external-ref allowlists, material-change signatures, producer identity
      field misuse, and candidate handling.
- [ ] Task 5.2: Add integration tests for agent/tool/system/user declaration
      flows writing `CoreArtifactRecord`, user import-and-publish, ambiguous
      idempotency recovery payloads, and idempotent activity.
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
| `src/products/code/state/runtimeArtifactTooling.ts` | Create | Code-origin runtime onboarding and `declare_artifact` observation helper |
| `src/platform/runtime/invocationEnrichment.ts` | Create | Product-registered runtime invocation enrichment registry |
| `src/products/code/shared/runtimeArtifactSignals.ts` | Create | Code-owned bridge signal shape for preview/build/test/screenshot/patch/report outputs |
| `src/products/code/shared/workspaceSummary.ts` | Modify | Reuse workspace containment / summary semantics |
| `src/products/code/state/sessionFinalization.ts` | Create | Validate Code assistant finalization envelopes and enforce `artifactClaims[]` gating before visible response commit |
| `src/products/code/state/taskExecution.ts` | Modify | Submit declarations for runtime bridge outputs |
| `src/products/code/state/deliveryProxy.ts` | Modify | Normalize delivery outputs into declarations where applicable |
| `src/runtime/client.ts` | Modify if needed | Add explicit observation fields only when runtime can produce verified output signals |
| `src/core/planningRecordLists.ts` | Modify | Add additive query support only if Code projections need it |
| `src/core/model/planningRecords.ts` | Modify | Avoid schema change unless idempotency metadata needs helper support |
| `tests/code-artifact-declaration.test.tsx` | Create | Contract, mapping, validation, and idempotency tests |
| `tests/code-artifact-finalization.test.tsx` | Create | Finalization-envelope gating tests for `artifactClaims[]` / same-turn accepted declarations |
| `tests/code-artifact-runtime-tooling.test.tsx` | Create | Code-origin onboarding and tool-use observation tests |
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
- Keep user import-and-publish as a distinct product action, not a declaration
  schema flag.
- Use one server-configured `toolAutoPublishPolicies` list with exact tool /
  label matching and explicit workspace/run matchers.
- Emit `artifact_recorded` activity for non-noop durable materializations using
  the material-change signature, not a full-record hash. Volatile filtering is
  recursive inside `producerDetails`.
- Use one Code server-configured `externalRefKinds` allowlist for
  `external_ref` locations in the first implementation.
- Candidate handling must be explicit in implementation. The first slice may
  use `status = 'draft'` plus metadata, but this must be validated and
  documented.

## Testing Strategy

- **Unit Tests**: label mapping, disposition/status precedence, publish action
  gating, tool auto-publish policy matchers, location validators, metadata
  bounds/reserved keys, workspace containment, idempotency key construction,
  candidate metadata, workspace key / path canonicalization (Windows vs Linux
  case rule, segment-prefix `/foo/bar` vs `/foo/barbaz`, trailing-slash and
  `..` collapse), invalid `toolAutoPublishPolicies` entry handling
  (drop-and-report vs `failBootOnInvalidEntry`), string input
  normalization (empty / whitespace string → null on optional fields,
  rejection on required fields), agent-visible tool-schema field set
  (only `declarationId` / `label` / `title` / `location` / `summary` /
  `metadata`; agent-supplied `kind` / `coreKind` / `producer.*` /
  authoritative anchors rejected with
  `artifact_producer_field_not_allowed`), finalization-envelope gating
  (claims match same-turn accepted `declarationId`; unmatched claims are
  blocked with `artifact_claim_without_declaration`; text heuristics are
  telemetry only), and `declarationId` composition (label-suffixed,
  random-nonce rejection / warning).
- **Integration Tests**: declaration -> upsert Core artifact -> Code artifact
  projection, with agent/tool/system/user producer examples and idempotent
  replay that does not duplicate artifacts or activity. Plus
  import-and-publish: success path through
  `POST /api/code/artifacts/import-and-publish` and the partial-success
  path where step 3 fails (artifact persists at `ready`,
  `artifact_publish_transition_failed` is returned). Plus producer
  onboarding integration: onboarding block injection asserted in the
  active session prompt at session create, after a simulated resume, and
  after a simulated context compaction (block present, version stamp
  matches `codeArtifactDeclaration.onboardingBlockVersion`); tool catalog
  exposes `declare_artifact` with the exact agent-visible field set and
  no aliases; agent-supplied `kind` is rejected via tool-call-result;
  rejected `declare_artifact` calls surface SPEC-092 error codes
  verbatim; finalization-envelope gating blocks an `artifactClaims[]`
  entry without a same-turn accepted declaration and returns
  `artifact_claim_without_declaration` before the response is shown.
- **Manual Testing**: run a `+New code` execution that produces a preview/test
  report declaration, verify the artifact appears in the Code artifact list,
  opens detail, and deep-links back to the originating task/run/workspace.
  Resume the same session in a new tab, trigger a context compaction, and
  confirm the agent still declares artifacts correctly (onboarding block
  re-injected, label-based; no `kind` field).

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent declarations become trusted too directly | High | Server validates anchors, paths, status, and kind before persistence |
| Artifact sidebar becomes a file explorer | High | Source edits are mutations; only declared/published outputs become artifacts |
| Candidate artifacts pollute the durable list | Medium | Store candidates as draft with explicit metadata or keep them in a pending queue |
| Runtime/tool producers drift into separate payload formats | Medium | Route all producer classes through one declaration normalizer |
| Idempotency misses duplicate agent retries | Medium | Use the SPEC-092 canonical key from producer identity, execution scope, and declaration id, with frozen scope fallback lookup |
| Runtime bridge work is underestimated | Medium | Split signal schema, preview, build/test, screenshot, patch, and report mapping into separate tasks |
| Published status is granted accidentally | High | Reject `published` on ordinary declarations; allow only owner publish action or server-configured tool auto-publish policy |
| Auto-publish config diverges across implementations | Medium | Use the SPEC-092 `toolAutoPublishPolicies` schema and matcher semantics |
| Idempotent replays emit duplicate activity | Medium | Compare the SPEC-092 material-change signature instead of full record timestamps/metadata |
| Ambiguous idempotency recovery stalls clients | Medium | Return candidate references and require explicit user/agent selection or a new declaration id |
| Workspace key / path canonicalization diverges across hosts and matcher kinds | High | Single SPEC-092 helper (host-OS case rule, lexical canonicalization, path-segment prefix) used by `workspace_key` matcher, `path_prefix` matcher, idempotency `workspace:` scope, and declaration validation alike |
| Invalid auto-publish config silently breaks publish surface | Medium | Drop invalid entries with structured server log + `/api/code/health` `codeArtifactDeclaration.policyDiagnostics`; operators may opt in to `failBootOnInvalidEntry = true` |
| `user_publish_action` partial success leaves callers unsure of artifact state | Medium | Do not roll back materialization on transition failure; return `artifact_publish_transition_failed` with materialized artifact id + current status so callers can retry the transition |
| Agent fills `coreKind` / `kind` directly instead of producer label | Medium | Tool catalog exposes only `label` (no `kind` / `coreKind`); server rejects agent-supplied `kind` with `artifact_producer_field_not_allowed`; SPEC-092 onboarding block uses label vocabulary throughout |
| Final response claims an artifact without a successful declaration | High | Structured finalization envelope: every `artifactClaims[]` item must reference a same-turn accepted `declarationId`; unmatched claims block finalization with `artifact_claim_without_declaration`; prose heuristics are telemetry only |
| Onboarding block lost across resume / context compaction | High | Runtime bridge re-injects the active onboarding block before every assistant turn after session create / resume / compaction / system-prompt rewrite; `codeArtifactDeclaration.onboardingBlockVersion` stamp lets bridge compare cheaply |
| Current active-session slice lacks finalization enforcement | High | Until Task 3.1d is implemented, document that final visible responses can still claim artifacts without a same-turn accepted declaration |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-29 | Plan created for structured Code artifact declarations. |
| 2026-04-29 | Tightened contract rollout around idempotency, precedence, publish-action gating, system candidate-only behavior, Phase 1 Cats-native action channel, and split runtime bridge signal tasks. |
| 2026-04-29 | Clarified publication as an explicit publish action / tool auto-policy path, froze idempotency scope across retries, defined producer identity resolution, external-ref allowlist, and material-change activity suppression. |
| 2026-04-29 | Added tool auto-publish policy schema, user import-and-publish action split, producer field misuse validation, recursive volatile filtering, and ambiguous idempotency recovery requirements. |
| 2026-04-29 | Pinned workspace key + path canonicalization rules, `CodeArtifactImportAndPublishInput` payload shape, publish-transition partial-success semantics, structured `policyDiagnostics` channel + `failBootOnInvalidEntry` opt-in, and string input normalization (empty → null) for declaration / import-and-publish optional fields. |
| 2026-04-29 | Added § Producer Onboarding rollout: agent system-prompt onboarding block injection (Task 3.1a), `declare_artifact` tool-catalog registration with agent-visible-fields-only schema (Task 3.1b), and tool-call-result error surfacing for agent self-correction (Task 3.1c). |
| 2026-04-29 | Producer-onboarding follow-up: agent-visible tool schema is label-based (`declarationId` + `label` + `title` + `location` + `summary` + `metadata`); agent-supplied `kind` / `coreKind` / `producer.*` / authoritative anchors rejected with `artifact_producer_field_not_allowed`. Onboarding block carries an explicit `codeArtifactDeclaration.onboardingBlockVersion` stamp and is re-injected before every assistant turn after session create / resume / compaction / system-prompt rewrite (Task 3.1a updated). Added Task 3.1d: structured finalization-envelope gating with `artifactClaims[]` matched by same-turn accepted `declarationId`; unmatched claims block finalization with `artifact_claim_without_declaration`. Test strategy expanded to assert injection presence on resume / compaction, exact tool schema, no aliases, error result return, label-based declarationId composition. |
| 2026-04-29 | Scaffolded no-flow implementation classes: `CodeArtifactDeclarationTool` / `declare_artifact` tool definition, label mapping + input normalization, and `CodeArtifactFinalizationGate` for structured `artifactClaims[]` validation. Added focused tests for the tool schema, server-field rejection, transcript / dataset labels, and same-turn finalization matching. No API route, runtime catalog registration, prompt injection, or session dispatch wiring is connected in this slice. |
| 2026-04-29 | Added `docs/tool-calls.md` as the central registry for Cats-owned agent/runtime tool call contracts and registered `declare_artifact` there, so future tools are not discoverable only through per-feature SPEC files. |
| 2026-04-29 | Follow-up hardening: split no-flow `shape_ok` from future server `accepted` tool results, aligned `tool-calls.md` with the TypeScript discriminated unions, added SPEC-092 § Error Code Registry, enforced context-free metadata/location limits in the helper, changed validation order to surface required-field errors before server-field misuse, moved artifact tests to `.tsx` source imports, and made label mapping exhaustive via `satisfies Record<CodeArtifactProducerLabel, ...>`. |
| 2026-04-29 | Follow-up normalization fix: local paths now get lexical path normalization plus an internal `verification.workspaceContainment = 'unverified'` marker until server containment validation clears it; `inline_summary` and `external_ref` persist trimmed values; disallowed server-resolved fields follow the same empty-string-as-omitted normalization; tool-call docs now state URL canonicalization behavior. |
| 2026-04-29 | Type-level + verification-marker hardening: `CodeArtifactLocationInput` (no `verification`) split from `CodeArtifactLocationNormalized` (with `verification`) so agent-supplied `verification` cannot smuggle through TS; the `local_path` deferred-verification marker is broadened to `{ workspaceContainment, pathCaseCanonicalization }` so the server-side host-OS case rule is also visibly deferred (not just containment). Added regression tests for verification smuggling and empty-string disallowed-field handling. UNC / drive-relative path edge cases documented in `collapseLexicalPath` + SPEC-092 § Location Rules. `inline_summary` `summary` vs `location.value` divergence documented as permitted (short description vs full content). |
| 2026-04-29 | Wired the first active-session slice: Code-origin channels from `+New code`, `+Team code`, and `+Peer code` member activation now receive the artifact onboarding block at runtime session create and lightweight `metadata.codeArtifactDeclaration` on session create / message send through the platform runtime invocation-enricher registry. Runtime invocation enrichers now return contribution diffs that the platform merges onto the original invocation, with deterministic priority bands for cross-product hooks and platform-owned context merging for labels/metadata/workspace so hooks cannot wipe prior context keys by omission. The merge contract now rejects non-structured-cloneable metadata and documents that same-key metadata sub-objects are replaced wholesale. Runtime `tool_use` segments now preserve `toolArgs`, and Code records same-turn `declare_artifact` shape observations under namespaced assistant-message metadata (`runtimeAssistantMetadata["cats-code.artifact-declaration"]`). Native runtime tool execution, product persistence, resume/compaction re-injection, and finalization enforcement remain Phase 2/3 follow-ups. |
| 2026-04-30 | Runtime invocation-enricher hardening follow-up: contribution contexts are now structured-clone validated before merge and failures are attributed to the producing enricher through `RuntimeEnrichmentCloneError`, avoiding post-merge whole-context validation costs and misleading later-hook blame. Code's artifact enricher registration and direct helper now share one module-level enricher instance. Regression coverage now includes bad contribution metadata, typed clone errors, and automatic registry cleanup around the artifact-runtime tooling tests. |
| 2026-04-30 | Phase 2 slice 1 landed the Code-owned materialization delegate for normalized declarations: label/status/disposition resolution, server anchor validation, canonical idempotency key construction, deterministic artifact ids, local-path workspace containment for lexical paths, Core artifact upsert, accepted tool-result shaping, and candidate-as-draft storage. Public product routes, runtime tool execution, frozen-scope fallback recovery, and `artifact_recorded` activity emission remain follow-up slices. |
| 2026-04-30 | Phase 2 slice 2 exposed the first Code-owned declaration submit route at `POST /api/code/artifacts/declarations`, wired it through the materialization delegate and Core store update boundary, and returned Code artifact detail projection plus accepted tool-result shape. Runtime native tool execution, frozen-scope fallback recovery, and `artifact_recorded` activity emission remain follow-up slices. |
| 2026-04-30 | Phase 2 slice 3 added idempotent `artifact_recorded` activity emission to the materialization delegate. The material-change signature covers durable Core fields, declaration label/disposition/location/candidate state, and recursively de-volatilized `producerDetails`; exact no-op replays suppress duplicate activity while material updates append a new audit record. Runtime native tool execution and frozen-scope fallback recovery remain follow-up slices. |
| 2026-04-30 | Phase 3 slice 1 added the Code runtime declaration execution helper. It consumes observed `declare_artifact` `tool_use` segments, applies server-resolved producer / anchor context, executes them through the same materialization delegate as the HTTP route, and returns `CodeArtifactToolResult` values while preserving rejected shape errors. Live runtime-loop tool-result delivery, finalization enforcement, and frozen-scope fallback recovery remain follow-up slices. |
| 2026-04-30 | Phase 3 slice 2 added the platform assistant-effect processor registry and registered Code's artifact processor behind it. Runtime surfaces can now apply observed `declare_artifact` side effects through a platform hook, preserving the Chat / Code product boundary. The live dispatch loop still needs to invoke the hook and deliver tool results back to the assistant. |
| 2026-04-30 | Phase 3 slice 3 wired the chat runtime dispatch loop to invoke platform assistant effects after runtime message results. Code-origin `declare_artifact` calls now persist artifacts through `coreStore.updateCore` on the latest Core snapshot, and accepted / rejected declaration results are attached to the terminal assistant-message metadata. Tool-result delivery back into the live runtime loop and finalization enforcement remain follow-up slices. |
| 2026-04-30 | Phase 3 slice 4 added assistant-effect turn predicates. Runtime dispatch now opens a Core write only when a registered processor says the assistant turn may produce side effects; Code's artifact processor matches only Code-origin `declare_artifact` `tool_use` segments. Tool-result delivery back into the live runtime loop and finalization enforcement remain follow-up slices. |
| 2026-04-30 | Phase 3 slice 5 added local `tool_result` projection for Code artifact declarations. The assistant-effect processor now projects accepted / rejected `CodeArtifactToolResult` values back into the dispatch response segments after matching `declare_artifact` `tool_use` segments, giving persisted turns a complete local tool trace. Live delivery of those results back to the assistant runtime loop and finalization enforcement remain follow-up slices. |
| 2026-04-30 | Phase 3 slice 6 wired the structured Code finalization gate into runtime dispatch response commit. Registered finalization gates evaluate before visible assistant messages are appended; Code-origin `artifactClaims[]` metadata must match same-turn accepted `declare_artifact` results or the response is blocked with `artifact_claim_without_declaration`. Text heuristics and live retry-back-to-agent remain follow-up slices. |
| 2026-04-30 | Phase 3 slice 7 added runtime finalization-envelope ingress. Runtime streams can now deliver `finalization` events, `result.finalization`, or `result.finalizationEnvelope`; dispatch carries that structured envelope into platform finalization gates so Code artifact claims no longer depend on transcript JSON or ad hoc metadata injection. Live retry-back-to-agent remains a follow-up slice. |
| 2026-04-30 | Phase 2 slice 4 added frozen-scope idempotency recovery. When a retry resolves to a lower-precedence scope but an existing artifact has the same producer identity and `declarationId`, materialization reuses the frozen idempotency key / artifact id and preserves existing anchors instead of creating a duplicate artifact. Ambiguous fallback matches fail with `artifact_idempotency_ambiguous`. |
| 2026-05-10 | Phase 4 landed: `CodeArtifactListItem` exposes declaration metadata (`producerLabel`, `workspacePath`, `conversationId`, `disposition`); `buildCodeArtifactListProjection` accepts a richer `CodeArtifactListFilters` object covering producer label, status, workspace, task, and run filters plus the legacy kind-string parameter; `excludeUndeclaredSourceEdits` filter hides raw source-file edits unless a declaration represents them, and the renderer Artifacts page passes the flag by default. Phase 1–3 task checkboxes were not previously ticked but the underlying contracts/runtime/persistence work has been live since the 2026-04-30 slices recorded above; Phase 4 is the first batch ticked in this plan. |

---

*Created: 2026-04-29*
*Author: Codex*
