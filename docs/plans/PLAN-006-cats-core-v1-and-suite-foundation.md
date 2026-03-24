# PLAN-006: Cats Core v1 and Suite Foundation

Status: Approved

## Scope

Land the documentation and implementation sequence needed for `Cats Chat` and
`Cats Work` to share `Cats Core v1`, while preserving the existing chat shell
and the `cats-runtime` boundary.

## Phases

### Phase 1: Contract Freeze

- [x] Define the initial shared record shapes for identity, actors/resources,
      permissions, conversations, bot bindings, tasks/runs, approvals, owner
      profile, and archive metadata.
- [x] Define terminology mappings from current chat-shell terms such as cat,
      assignment, lease, and memory checkpoint into the broader shared model.
- [x] Publish example payloads or fixtures that both Chat and Work teams can
      consume.

**Deliverables**: stable shared contracts, terminology mapping, and reference
fixtures.

### Phase 2: Product API and Storage Seams

- [x] Define which routes or modules belong to shared-core product APIs.
- [x] Define the first storage abstraction that can evolve beyond the current
      file-backed chat state.
- [x] Keep operational search, approval state, and owner profile product-owned.
- [x] Land the first reusable headless record families for project, work item,
      artifact, activity, approval binding, and owner-profile persistence.

**Deliverables**: first product-facing shared-core API map and storage seam.

### Current Implementation Notes

- `src/core/*` now exposes minimal write paths for:
  - project
  - work item
  - task
  - approval decision
  - approval binding
  - run
  - trace
  - checkpoint
  - outcome
  - artifact
  - activity
  - owner profile
- `src/products/chat/state/core-projection/index.ts` and
  `src/products/chat/state/store.ts` now keep the boundary explicit between
  chat-owned projections and durable core-owned source-of-truth records.
- `src/shared/coreFixtures.ts` now publishes a reusable example payload bundle
  so Chat / Work / Code follow-up slices can share one contract vocabulary.

### Phase 3: Runtime Boundary Refinement

- [ ] Define which operations remain direct `cats-runtime` product API calls.
- [ ] Define the first curated MCP tool set for orchestrators.
- [ ] Define ownership rules so MCP tools cannot bypass product-owned
      permissions, approvals, or bot bindings.

**Deliverables**: runtime access matrix and first MCP tool contract.

### Phase 4: Cats Chat Launch Slice

- [ ] Add approval-loop and interactive-delegation support to the chat product.
- [ ] Add orchestrator bot bindings for Telegram and LINE style transports.
- [ ] Add escalation and takeover flows tied to owner-facing channels.
- [ ] Define packaged desktop onboarding requirements.
- [ ] Keep the full desktop Chat surface on the shared Electron plus
      React/TypeScript shell and treat mobile as later companion scope.

**Deliverables**: Chat launch slice plan aligned to the shared contracts.

### Phase 5: Cats Work Launch Slice

- [ ] Add work dashboard, inbox, and work-item views above the shared contracts.
- [ ] Reuse the same actor, conversation, approval, and archive metadata model.
- [ ] Keep Work surfaces above the same `cats-runtime` boundary.
- [ ] Reuse the same Electron-hosted React/TypeScript desktop shell decisions as
      Chat for suite consistency.

**Deliverables**: Work launch slice plan aligned to the shared contracts.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/shared/` | Expand | Host shared contract types before extraction is necessary |
| `src/chat/` | Refactor | Map phase-2 chat-state terms into broader shared-core terms |
| `src/server.ts` and route modules | Modify | Add shared-core product APIs and preserve runtime boundaries |
| `src/renderer/` | Expand | Support Chat and later Work surfaces above shared contracts |
| `tests/` | Expand | Add contract fixtures and migration coverage |
| `docs/` | Update | Keep ADR/spec/plan/progress alignment intact |

## Validation

- Shared fixtures load consistently in both Chat and Work planning exercises
- Current phase-2 shell behavior remains understandable and loadable during the
  migration
- Direct runtime API ownership and MCP tool ownership are documented without
  overlap confusion
- Packaging and onboarding assumptions remain aligned with the desktop-first
  distribution goal

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Shared core grows too large | High | Keep `Cats Core v1` limited to shared product contracts only |
| Chat and Work drift before code lands | High | Freeze contract fixtures early and review both tracks against them |
| MCP starts bypassing product logic | High | Keep permissions, approvals, and bot bindings above the runtime layer |
| Current chat shell becomes hard to migrate | Medium | Preserve compatibility mappings and staged refactors |
| Packaging work gets deferred behind UI work | Medium | Keep desktop onboarding in the launch plan from the start |

---

*Last updated: 2026-03-22*


