# PLAN-097: Cats Code Live Preview Substrate Rollout

> Implement the managed live-preview supervisor defined by
> [SPEC-108](../specs/SPEC-108-cats-code-live-preview-substrate.md) under
> [ADR-104](../decisions/104-adopt-managed-live-preview-supervisor-for-artifact-canvas.md).
> This plan is the Phase 4 continuation of PLAN-090. It does not permit process
> spawning until the approval gate in Phase 5 is complete.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |

## Related Spec

[SPEC-108: Cats Code Live Preview Substrate](../specs/SPEC-108-cats-code-live-preview-substrate.md)

## Overview

The rollout adds live preview in guarded slices. First, land typed contracts,
profile validation, and fake-process supervision tests. Then add the
supervisor, lease store, port allocation, logs, and stop lifecycle. Only after
those pieces are reviewed does the plan wire a real preview producer that
materializes `preview_url` artifacts and opens them through the existing
Artifact Canvas.

## Implementation Phases

### Phase 1: Contracts and Configuration

- [x] Task 1.1: Add `LivePreviewCommandProfile`, `LivePreviewLease`,
      `LivePreviewStartRequest`, `LivePreviewStartResult`, and
      `LivePreviewStopResult` types under `src/products/code/livePreview/`.
- [x] Task 1.2: Add command-profile validation that rejects raw shell strings,
      unknown placeholders, non-loopback host settings, missing readiness
      probes, and invalid stop policies.
- [x] Task 1.3: Add disabled-by-default config for live previews:
      enabled flag, port range, global concurrency limit, per-workspace
      concurrency limit, default lease TTL, log size limit, and IPv6 loopback
      opt-in.
- [x] Task 1.4: Update `docs/services.md` and check the project-bootstrap port
      registry before reserving the default preview range.
- [x] Task 1.5: Add tests proving assistant/tool input cannot bypass profiles
      with a free-form command.

**Deliverables**: Typed substrate and boot-time validation with no process
spawning.

### Phase 2: Supervisor Core With Fake Process Adapter

- [ ] Task 2.1: Implement `LivePreviewSupervisor` with an injected process
      adapter so tests can exercise lifecycle without spawning real processes.
- [ ] Task 2.2: Implement loopback port leasing, collision handling, and release
      on failure/stop/expiry.
- [ ] Task 2.3: Implement readiness probes against the leased origin with
      timeout and terminal failure diagnostics.
- [ ] Task 2.4: Implement bounded stdout/stderr log capture through the process
      adapter.
- [ ] Task 2.5: Implement idempotent stop and best-effort process-tree cleanup.
- [ ] Task 2.6: Add unit tests for spawn success, spawn failure, readiness
      timeout, unexpected process exit, explicit stop, expiry, port conflict,
      and cleanup failure.

**Deliverables**: Supervisor logic proven without real subprocess execution.

### Phase 3: Lease Store and Cats Code Projection

- [ ] Task 3.1: Add an in-memory v1 `LivePreviewLeaseStore` and a product-owned
      read projection for Cats Code surfaces.
- [ ] Task 3.2: Add Cats Code API routes for listing previews by surface,
      reading one preview, stopping one preview, and reading bounded logs.
- [ ] Task 3.3: Add renderer affordances on Code task/codespace surfaces for
      preview status, stop, retry, and logs.
- [ ] Task 3.4: Add diagnostics mapping for port conflict, command disabled,
      readiness timeout, process exit, and cleanup failure.

**Deliverables**: Operators can inspect and stop supervised previews before
real process spawning is enabled.

### Phase 4: Artifact Canvas Integration

- [ ] Task 4.1: Materialize ready previews as `CoreArtifactRecord` rows with
      `kind = 'preview'`, safe `preview_url`, `previewId`, command profile id,
      workspace ref, and source surface metadata.
- [ ] Task 4.2: Add the server-side
      `isSupervisorOwnedPreviewOrigin(url, artifact, leaseStore)` predicate to
      Artifact Canvas iframe policy.
- [ ] Task 4.3: Require supervisor-owned origin qualification before a preview
      URL can receive `scripted-cross-origin`; otherwise demote to `static`
      using SPEC-101 behavior.
- [ ] Task 4.4: Trigger the existing `show_in_canvas` path after artifact
      materialization so Activity audit and render-intent behavior stays shared.
- [ ] Task 4.5: Add integration tests covering ready preview artifact creation,
      non-lease loopback demotion, stale lease demotion, and same-surface lease
      matching.

**Deliverables**: Live previews produce normal Artifact Canvas artifacts and do
not bypass the existing viewer contract.

### Phase 5: Real Process Enablement Gate

- [ ] Task 5.1: Review SPEC-108 / PLAN-097 security posture and command profile
      defaults before enabling real subprocess execution.
- [ ] Task 5.2: Add the first real command profile. Prefer Vite-only unless the
      review explicitly approves a broader `npm run dev` profile.
- [ ] Task 5.3: Enable real process adapter behind config with default disabled
      in development and packaged builds until manually opted in.
- [ ] Task 5.4: Add end-to-end validation that starts a real preview in an
      isolated temporary workspace, waits for readiness, opens Artifact Canvas,
      and stops/cleans the preview without writing user dev state.
- [ ] Task 5.5: Update operator docs with the supported profile list, port
      range, logs path, and stop behavior.

**Deliverables**: First approved real live-preview producer.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/code/livePreview/contracts.ts` | Create | Live preview profile, lease, start, stop, diagnostics types |
| `src/products/code/livePreview/profileValidation.ts` | Create | Declarative profile validation and placeholder allowlist |
| `src/products/code/livePreview/supervisor.ts` | Create | Supervisor orchestration with injected process adapter |
| `src/products/code/livePreview/processAdapter.ts` | Create | Real and fake process adapter seam |
| `src/products/code/livePreview/leaseStore.ts` | Create | v1 lease store and lookup helpers |
| `src/products/code/api/livePreviewRoutes.ts` | Create | Product-owned API routes for preview status, stop, and logs |
| `src/products/shared/artifactCanvas/iframePolicy.ts` | Modify | Add supervisor-owned preview origin predicate before privileged profile |
| `src/products/shared/artifactCanvas/projection.ts` | Modify | Pass live preview lease context into iframe policy |
| `src/products/code/renderer/**` | Modify | Add status, stop, retry, and log affordances on Code surfaces |
| `docs/services.md` | Modify | Reserve/document the preview port range before implementation |
| `tests/code-live-preview-*.test.tsx` | Create | Contract, supervisor, lease, API, and canvas integration tests |

## Technical Decisions

- Live preview is a Cats Code product feature, but iframe privilege remains
  controlled by platform-shared Artifact Canvas policy.
- The first lease store can be memory-only; persisted historical leases are an
  explicit follow-up unless review requires them before enablement.
- No test may write demo records to the user's persisted dev state. Use
  `MemoryCoreStore`, temporary workspaces, and fake process adapters.
- Process spawning stays disabled until Phase 5.

## Testing Strategy

- **Unit Tests**: Profile validation, placeholder rejection, port leasing,
  readiness state machine, lifecycle transitions, stop idempotency.
- **Integration Tests**: Cats Code API routes with fake supervisor, artifact
  materialization, Artifact Canvas iframe-policy lease matching.
- **End-to-End Tests**: One approved real process profile in an isolated temp
  workspace after Phase 5 approval only.
- **Manual Testing**: Start preview, show canvas, inspect logs, stop preview,
  restart platform and verify no orphan process remains.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Assistant gains arbitrary shell execution | High | Only command profile ids and profile-declared parameters are accepted |
| Privileged iframe points at a stale or hostile loopback server | High | Require supervisor lease match before `scripted-cross-origin` |
| Orphan preview process survives platform shutdown | High | Process-tree cleanup on stop/expiry/shutdown plus startup orphan sweep |
| Port conflicts with other local services | Medium | Configurable range, registry check, collision retry, docs/services update |
| Logs leak unrelated filesystem content | Medium | Capture only child stdout/stderr into bounded platform-owned log files |
| Tests pollute user dev state | Medium | Use fake process adapter and isolated stores/workspaces |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-09 | Plan created as PLAN-090 Phase 4 continuation. Process spawning remains disabled until the Phase 5 approval gate. |
| 2026-05-09 | Completed Phase 1 contracts/config/validation: added live-preview profile and lease types, disabled-by-default config, strict profile/start-request validation, service registry port-range documentation, and tests proving raw command fields cannot bypass profiles. Checked the project-bootstrap registry for `47100-47199` conflicts before documenting the candidate range. No supervisor or process spawning is enabled. |

---

*Created: 2026-05-09*
*Author: Codex*
