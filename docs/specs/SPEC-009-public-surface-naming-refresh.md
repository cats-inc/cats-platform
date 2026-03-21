# SPEC-009: Public-Surface Naming Refresh

Status: Draft (Pending Review)

## Summary

`cats` currently exposes two public naming choices that no longer fit the
product direction well:

- `Pal / Pals`
- `workspace / workspaces`

`Pal / Pals` feels serviceable but not brand-aligned, while `workspace` is now
too close to the planned `Cats Work` product line and risks creating confusing
phrases across API docs, product copy, and future multi-surface work.

This spec defines a controlled naming refresh for the **public surface only**.
It intentionally avoids visual redesign and avoids a broad internal refactor.

## Goals

- Rename public `Pal / Pals` language to `Cat / Cats`.
- Do not use `Paw / Paws` as the primary product noun.
- Remove `workspace / workspaces` from the canonical public API surface.
- Preserve compatibility through legacy aliases during migration.
- Keep the existing UI structure, layout, styling, and CSS hooks intact.
- Avoid forcing an immediate rename of internal `workspace` and `pal`
  implementation types.

## Non-Goals

- Redesigning the UI
- Reflowing layout, spacing, panels, or responsive behavior
- Renaming CSS class names just to match new product language
- Moving or renaming `src/workspace/` in this slice
- Renaming every internal `Workspace*` or `Pal*` type in this slice
- Removing legacy route aliases immediately

## Naming Decisions

### Public Product Nouns

- `Pal` becomes `Cat`
- `Pals` becomes `Cats`
- `Paw / Paws` is rejected as the primary domain noun

Reasoning:

- `Cat / Cats` aligns with `Cats Chat`, `cats`, and the broader suite brand
- `Paw / Paws` reads more like a body-part metaphor than a reusable actor or
  teammate resource

### Public Container Naming

Canonical public API and public-facing product copy should stop using
`workspace / workspaces` as the root container term.

Reasoning:

- `workspace` is too close to future `Cats Work`
- the current implementation only supports one effective local root
- the extra container layer adds API length without adding meaningful user
  value in the current product shape

## Public Naming Targets

### UI Copy

Examples:

- `Add pal` → `Add cat`
- `Pals` → `Cats`
- `Saved pals` → `Cats`
- `pal registry` → `Cats` or `Cats registry`
- `Assign pal` → `Add cat` or `Assign cat`, depending on context

### Canonical API Routes

Recommended canonical route family:

- `/api/cats`
- `/api/cats/{catId}`
- `/api/channels`
- `/api/channels/{channelId}`
- `/api/channels/{channelId}/messages`
- `/api/channels/{channelId}/cats`
- `/api/channels/{channelId}/cats/{catId}`
- `/api/preferences`
- `/api/orchestrator`
- `/api/channels/{channelId}/activations`
- `/api/channels/{channelId}/exports/latest`

### Legacy Compatibility Routes

The following route families should remain temporarily available as
compatibility aliases:

- `/api/pals`
- `/api/pals/{palId}`
- `/api/workspaces/default/...`
- earlier `/api/workspace/...` compatibility routes already preserved from the
  REST migration

### Canonical Payload Naming

Examples:

- `{ pal: ... }` → `{ cat: ... }`
- `{ pals: [...] }` → `{ cats: [...] }`
- `palId` → `catId`
- `palAssignments` → `cats` or `channelCats`, depending on the final DTO shape

## Hard Constraints

The following are strict constraints for implementation:

- Do not change layout.
- Do not change visual style.
- Do not rename CSS classes just to match the new naming.
- Do not change DOM structure unless a route or data-binding update strictly
  requires it.
- Prefer text-label and data-contract changes over UI restructuring.

## Internal Naming Strategy

This rename should be **public-first, internal-later**.

Accepted direction for this slice:

- public routes, docs, and labels use `Cat / Cats`
- public routes stop using `workspace / workspaces`
- internal modules may continue using:
  - `src/workspace/`
  - `WorkspaceState`
  - `WorkspacePal`
  - `ChannelPalAssignment`
  - related store and shell helpers

This keeps the rename manageable and avoids destabilizing persistence and core
sync logic in the same change.

## Migration Direction

### Step 1: Docs and Product Copy

- update terminology and product docs
- update visible UI labels
- preserve all current layout and CSS behavior

### Step 2: Canonical API Surface

- add the new canonical `cats` and root-level `channels/preferences/orchestrator`
  routes
- keep existing canonical routes as aliases until clients migrate

### Step 3: Renderer Client Migration

- point renderer API helpers at the new canonical routes
- keep view bootstrap behavior stable
- avoid broad component restructuring

### Step 4: Deferred Internal Cleanup

- only after public naming stabilizes, evaluate whether internal `workspace`
  and `pal` names should be cleaned up

## Acceptance Criteria

- Public UI text uses `Cat / Cats` instead of `Pal / Pals`.
- No public-facing primary noun uses `Paw / Paws`.
- Canonical API docs no longer present `workspace / workspaces` as the public
  route root.
- Compatibility aliases are documented and preserved during migration.
- Implementation guidance explicitly forbids unintended visual/layout changes.
- Another agent can implement the rename without treating it as a UI redesign.

## Open Questions

- For channel membership payloads, should the canonical collection be named
  `cats`, `channelCats`, or `assignments` with `catId` nested inside?
- Should `GET /api/app-shell` remain unchanged during this rename, or should
  its payload labels also shift to `cats` while preserving a compatibility
  adapter?
- After the public rename lands, is a second pass to rename internal
  `Workspace*` and `Pal*` types worth the churn?

## References

- [PLAN-009](../plans/PLAN-009-public-surface-naming-refresh.md)
- [SPEC-008](./SPEC-008-restful-product-api-refactor.md)
- [PLAN-008](../plans/PLAN-008-restful-product-api-refactor.md)
- [Architecture](../architecture.md)
- [Terminology](../terminology.md)

---

*Last updated: 2026-03-18*
