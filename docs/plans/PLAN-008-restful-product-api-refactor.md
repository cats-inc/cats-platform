# PLAN-008: RESTful Product API Refactor

Status: Phase 1-3 Complete

## Scope

Implement the RESTful product API direction from [SPEC-008](../specs/SPEC-008-restful-product-api-refactor.md)
and [ADR-010](../decisions/010-separate-read-model-app-shell-from-restful-resource-apis.md)
without breaking the current renderer during the migration.

The main objective is not just to rename routes. The goal is to separate:

- authoritative resource APIs
- compatibility read models
- UI-only state
- operational side effects such as activation and export

## Phases

### Phase 1: Contract Extraction and Compatibility Baseline

- [x] Introduce canonical resource DTOs for workspace, preferences, channel,
      message, pal, pal assignment, orchestrator, export, and activation
      payloads.
- [x] Decide the authoritative `workspaceId` strategy for the current single
      workspace implementation. → `"default"` is the only supported workspaceId.
- [x] Freeze the legacy-to-target route mapping in `docs/api.md`.
- [x] Keep `GET /api/app-shell` available and document it as a read-only
      compatibility view. Also added `GET /api/views/app-shell` alias.

**Deliverables**: shared REST DTOs, migration notes, and a stable compatibility
baseline.

### Phase 2: Read-Side Resource Routes

- [x] Add `GET /api/workspaces/{workspaceId}`.
- [x] Add `GET /api/workspaces/{workspaceId}/preferences`.
- [x] Add `GET /api/workspaces/{workspaceId}/channels`.
- [x] Add `GET /api/workspaces/{workspaceId}/channels/{channelId}`.
- [x] Add `GET /api/workspaces/{workspaceId}/channels/{channelId}/messages`.
- [x] Add `GET /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments`.
- [x] Add `GET /api/workspaces/{workspaceId}/orchestrator`.
- [x] Add `GET /api/pals` and `GET /api/pals/{palId}`.

**Deliverables**: read-only resource surface with tests.

### Phase 3: Write-Side Resource and Operation Routes

- [x] Add `POST /api/workspaces/{workspaceId}/channels`.
- [x] Add `PATCH /api/workspaces/{workspaceId}/preferences` – server-side
      selection persistence retained as workspace preference.
- [ ] Add `PATCH /api/workspaces/{workspaceId}/channels/{channelId}` – deferred,
      channel metadata editing not yet exposed in the renderer.
- [x] Add `DELETE /api/workspaces/{workspaceId}/channels/{channelId}`.
- [x] Add `POST /api/workspaces/{workspaceId}/channels/{channelId}/messages`.
- [x] Add `PUT /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}`.
- [x] Add `DELETE /api/workspaces/{workspaceId}/channels/{channelId}/pal-assignments/{palId}`.
- [x] Add `PATCH /api/workspaces/{workspaceId}/orchestrator`.
- [x] Add `POST /api/pals`. `PATCH /api/pals/{palId}` deferred (no UI need yet).
- [x] Add `POST /api/workspaces/{workspaceId}/channels/{channelId}/activations`.
- [x] Add `GET /api/workspaces/{workspaceId}/channels/{channelId}/exports/latest`.
- [x] Legacy routes kept as compatibility adapters over the same store/runtime logic.

**Deliverables**: full RESTful mutation surface with compatibility adapters.

### Phase 4: Renderer API Client Refactor

- [ ] Split the renderer API layer into resource clients instead of one
      app-shell mutation client.
- [ ] Remove the assumption that every mutation returns a full shell payload.
- [ ] Decide whether selected-chat persistence stays server-side or becomes
      local renderer state.
- [ ] Keep one shell/bootstrap fetch if still useful, but treat it as a read
      model instead of the source of truth for all mutations.
- [ ] Update UI flows for create chat, assign pal, create pal, activate chat,
      and send message so they consume resource/operation responses directly.

**Deliverables**: renderer consumes REST resources, not action-style shell
mutations.

### Phase 5: Tests, Deprecation, and Documentation Cleanup

- [ ] Add route tests for every new read and write family.
- [ ] Keep legacy route tests until renderer cutover is complete.
- [ ] Add structured error assertions.
- [ ] Update docs to mark legacy routes deprecated and REST routes canonical.
- [ ] Remove compatibility aliases only after route and renderer parity is
      confirmed.

**Deliverables**: stable tests, clear docs, and a safe deprecation path.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/server.ts` | Refactor heavily | Current route table is where legacy action routes and new resource routes will coexist |
| `src/workspace/model.ts` | Reuse and extend | Existing resource logic already exists here for channels, pals, assignments, messages, and orchestrator updates |
| `src/workspace/store.ts` | Reuse and possibly extend | Store already syncs workspace and `Cats Core v1`; resource reads should build on it |
| `src/workspace/shell.ts` | Reclassify | Keep as read-model composer, not mutation contract owner |
| `src/shared/app-shell.ts` | Narrow responsibility | Keep app-shell/read-model types, but stop using them as the default mutation DTOs |
| `src/shared/core.ts` | Review alignment | Ensure REST resources still map cleanly into `Cats Core v1` contracts |
| `src/renderer/api.ts` | Split or replace | Current client assumes most mutations return `AppShellPayload` |
| `src/renderer/App.tsx` | Refactor | Current UI flow assumes full-shell mutation responses and server-managed selection |
| `tests/server.test.js` | Expand | Add resource-route coverage and legacy compatibility coverage |
| `tests/workspace-store.test.js` | Review | Keep store-level behavior stable while endpoints change |
| `docs/api.md` | Update | Mark canonical REST routes and deprecated legacy routes |

## Technical Decisions to Preserve

- Keep `cats-runtime` as the only runtime boundary.
- Keep the current workspace/core store as the shared persistence source during
  the first migration.
- Treat app-shell as a read model, not the primary resource contract.
- Model activation as an operation resource instead of a plain controller verb.
- Preserve additive migration; do not do a big-bang rewrite.

## Validation

- Resource reads work without fetching the full app shell.
- Resource mutations return targeted payloads instead of `AppShellPayload`.
- The renderer can complete create chat, create pal, assign pal, activate, and
  send-message flows using the new resource contracts.
- `GET /api/app-shell` can remain for bootstrap while no longer being required
  as the mutation contract.
- `Cats Core v1` routes remain consistent with the same underlying store.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dual API surface increases temporary complexity | High | Keep legacy routes as thin adapters and centralize shared domain logic in the workspace/core modules |
| Renderer migration stalls halfway | High | Land resource reads first, then switch one mutation flow at a time |
| Selection persistence becomes a design trap | Medium | Decide early whether it belongs in preferences or only in local UI state |
| Activation semantics are over-designed too early | Medium | Start with synchronous operation resources and only move to async polling if needed |
| Route naming diverges from `Cats Core v1` terms | Medium | Review resource names against `src/shared/core.ts` before freezing DTOs |

## Suggested Implementation Order for Another Agent

1. Add shared resource DTOs and read-only resource routes.
2. Add write/operation routes while preserving legacy adapters.
3. Refactor `src/renderer/api.ts` into resource-specific client functions.
4. Migrate renderer flows one by one.
5. Deprecate and then remove legacy routes after parity.

---

*Last updated: 2026-03-18*
