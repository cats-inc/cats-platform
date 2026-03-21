# PLAN-009: Public-Surface Naming Refresh

Status: Complete (Phase 1-5 implemented)

## Scope

Implement the public naming refresh defined in
[SPEC-009](../specs/SPEC-009-public-surface-naming-refresh.md).

This plan is intentionally narrow:

- rename public `Cat / Cats` to `Cat / Cats`
- remove `workspace / workspaces` from canonical public API routes
- preserve compatibility aliases
- avoid any UI redesign

This plan is explicitly **not** a visual refresh plan.

## Hard Constraints

- Do not change UI layout.
- Do not change UI visual style.
- Do not rename CSS classes purely for naming consistency.
- Do not restructure DOM unless strictly required for a data-binding update.
- Do not treat naming cleanup as a UI redesign excuse.

## Phases

### Phase 1: Naming Contract Freeze

- [x] Freeze the approved public nouns:
      `Cat / Cats`, reject `Paw / Paws`.
- [x] Freeze the public API direction:
      no canonical `workspace / workspaces` root.
- [x] Define canonical route replacements for all currently exposed public
      REST endpoints.
- [x] Document the compatibility boundary while public naming stabilizes.

**Deliverables**: approved glossary and rename boundary.

### Phase 2: Documentation and Terminology Update

- [x] Update `docs/terminology.md` to reflect `Cat / Cats`.
- [x] Update `docs/api.md` so canonical routes use `/api/cats`, `/api/channels`,
      `/api/preferences`, and `/api/orchestrator`.
- [x] Update related planning docs that are meant to guide future work:
      - `SPEC-007`
      - `PLAN-007`
      - `SPEC-008`
      - `PLAN-008`
- [x] Update high-level product docs only where the public naming appears and
      would otherwise confuse future implementers.

**Deliverables**: docs align on the new public naming.

### Phase 3: Canonical API Rename with Compatibility Aliases

- [x] Add canonical `GET/POST /api/cats` and `GET /api/cats/{catId}` routes.
- [x] Add canonical root-level routes:
      - `/api/channels`
      - `/api/channels/{channelId}`
      - `/api/channels/{channelId}/messages`
      - `/api/channels/{channelId}/cats`
      - `/api/channels/{channelId}/cats/{catId}`
      - `/api/preferences`
      - `/api/orchestrator`
      - `/api/channels/{channelId}/activations`
      - `/api/channels/{channelId}/exports/latest`
- [x] Keep `/api/cats` and `/api/workspaces/default/...` as compatibility
      aliases during migration.
- [x] Decide whether canonical payloads return `cat/cats/catId` immediately, or
      whether route renaming lands first with payload adapters.

**Deliverables**: new canonical public API with compatibility preserved.

### Phase 4: Renderer Client and Visible Label Migration

- [x] Update `src/renderer/api.ts` to call the new canonical routes.
- [x] Update visible text labels in `src/renderer/App.tsx` from `Cat / Cats` to
      `Cat / Cats`.
- [x] Keep component structure and layout untouched.
- [x] Keep CSS class names unchanged unless a strictly necessary bug fix forces
      a minimal exception.
- [x] Verify that no changed label requires spacing/layout intervention.

**Deliverables**: renderer uses the new names without a UI redesign.

### Phase 5: Tests and Deprecation Notes

- [x] Add or update route tests for the new `/api/cats` and root-level route
      families.
- [x] Preserve compatibility-route coverage for `/api/cats` and
      `/api/workspaces/default/...`.
- [x] Add tests or assertions that the renderer-facing rename did not require
      DOM/class restructuring.
- [x] Document which aliases remain, and what conditions are required before
      later removal.

**Deliverables**: tested rename path and clear alias policy.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/server.ts` | Extend and adapt | Canonical routes and compatibility aliases will coexist here |
| `src/renderer/api.ts` | Modify | Move client calls from old public names to new canonical ones |
| `src/renderer/App.tsx` | Copy-only changes | Update visible labels without touching structure |
| `src/renderer/styles.css` | Avoid structural edits | Keep current visual system intact; only allow minimal fixes if absolutely required |
| `src/shared/app-shell.ts` | Review | Decide whether public DTO names change now or later behind adapters |
| `docs/terminology.md` | Update | New official public vocabulary |
| `docs/api.md` | Update | Canonical route documentation changes here |
| `docs/specs/` and `docs/plans/` | Update | Existing planning docs should not keep steering future work toward old names |
| `tests/rest-api.test.js` | Expand | Cover renamed canonical routes plus preserved aliases |

## Validation

- Visible UI labels say `Cat / Cats`.
- No visible label says `Paw / Paws`.
- Canonical API docs no longer use `workspace / workspaces` as the public root.
- Existing UI layout is visually unchanged.
- New canonical routes work.
- Old routes still function as compatibility aliases.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rename work expands into a hidden redesign | High | Enforce the no-layout/no-style constraint in both spec and implementation review |
| Public and internal names diverge awkwardly for a while | Medium | Accept temporary divergence and document it explicitly |
| Route rename breaks existing clients | High | Keep old routes as aliases until migration is confirmed complete |
| Payload rename creates too much churn in one slice | Medium | Allow route-first migration with payload adapters if needed |
| Legacy `workspace` naming still leaks through compatibility docs | Medium | Keep narrowing active product docs while leaving explicit route-history docs clear |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement SPEC-009 / PLAN-009. Rename the public surface from `Cat/Cats` to
> `Cat/Cats`, and remove `workspace/workspaces` from canonical public API
> routes. Keep compatibility aliases. Do not change UI style, layout, class
> names, or DOM structure unless strictly necessary for wiring. If a remaining
> internal legacy name causes product confusion, clean it up in the same pass.

---

*Last updated: 2026-03-18*

