# ADR-099: Promote Cats / Clowders / Catteries to First-Class Platform Entities

## Status

Proposed

## Context

ADR-065 already named `MY CATS` a **platform-level** agent home, but the
implementation still nests cat addressability under `/chat/my-cats/:catId`
(see `myCatNavigation.ts`, `buildDirectLanePath`). At the same time:

- `Clowder` and `Cattery` exist today **only** as relabeled empty placeholder
  rows inside Code's and Work's product sidebars (`codeSidebarMyClowdersLabel`,
  `workSidebarMyCatteriesLabel`). Neither has a registry, route, or UI.
- The Lobby (`/lobby`) surfaces products and apps, but not the entities
  (cats / clowders / catteries) that live across products.
- ADR-098 just established that **URL is the source of truth** for canvas
  view-state. The same principle one level up: entity identity must be URL-
  addressable independent of the surface that happens to be rendering it.

Three structural problems follow:

1. **URL ownership is wrong.** A Cat is not a child of any product surface;
   removing Chat shouldn't remove the cat's URL. Today, removing Chat removes
   `/chat/my-cats/:catId` and the cat is unaddressable.
2. **Clowders/Catteries asymmetry.** They are agent-organizational primitives
   (a clowder groups cats, a cattery houses cats), conceptually parallel to
   Cats. Treating them as Code/Work product-local labels prevents cross-
   product reasoning.
3. **No platform home for entities.** ADR-065 says My Cats is platform-level
   but there is no platform navigation surface that lists the user's cats /
   clowders / catteries side by side.

## Decision

Cats, Clowders, and Catteries are **first-class platform entities** with
top-level URLs that do not nest under any product or surface:

```
/cats/:catId              ← canonical Cat home (Overview lens by default)
/cats/:catId/:lens        ← explicit lens (chat | work | code) per SPEC-064
/clowders/:clowderId      ← canonical Clowder home
/catteries/:catteryId     ← canonical Cattery home
```

Rules:

1. These URLs are **canonical** — every other surface (Lobby sidebar, Chat
   sidebar, search, deep-links) navigates here for the entity itself.
2. They are **stable across surface restructuring**. If Lobby is replaced
   with a Slack-style server list tomorrow, `/cats/:id` keeps working.
3. Surfaces that *project* an entity stay at their own URL family:
   - `/chat/dm/:catId` — Chat product's direct-lane projection. The old
     path `/chat/my-cats/:catId` is **removed in the same change**; per
     AGENTS.md §Pre-Release Compatibility Policy, no alias / 308 redirect
     is kept. All callers (sidebar, deep-links in fixtures, Telegram
     binding helpers, tests) flip to the new path in one cut.
   - Future product-local lenses follow the same shape (e.g.
     `/work/cats/:catId`).
4. **Lobby is a viewport, not a parent.** `/lobby` becomes the platform
   entity home that lists cats / clowders / catteries through a sidebar
   whose rows link to canonical entity URLs. The Lobby route does not own
   them.
5. Chat product sidebar's `MY CATS` section is **renamed to `Direct
   Messages`** (UI label only; internal `direct_message` term unchanged).
6. Code product sidebar's `My Clowders` placeholder row and Work product
   sidebar's `My Catteries` placeholder row are **removed**. Future product-
   local subset views (e.g. "Clowders working in this codebase") follow
   SPEC-064's projection rules and live alongside, not as the primary.
7. `/settings/cats` becomes **global cat preferences only** (defaults,
   visibility, model selection). Per-cat profile/management moves to
   `/cats/:catId`.

## Consequences

### Positive

- Entity URLs survive any surface restructuring; deep-links stay valid.
- Cross-product navigation simplifies — every product can deep-link to
  `/cats/:id` to "go look at this cat" without owning the page.
- Lobby finally becomes the platform entity home ADR-065 implied.
- `Direct Messages` aligns Chat sidebar with the Slack/Discord IA users
  already understand; `MY CATS` stops competing with `/cats/...`.
- Clowders and Catteries get a real home instead of empty product-sidebar
  rows.

### Negative

- Path migration is a clean cut: every existing `/chat/my-cats/:catId`
  caller (sidebar nav, deep-links, test fixtures, Telegram binding
  helpers) flips to `/chat/dm/:catId` in one change. AGENTS.md
  §Pre-Release Compatibility Policy forbids transition aliases for
  unreleased contracts, so a missed caller surfaces as a hard 404, not as
  a silent legacy path.
- `direct_message` (internal) vs `Direct Messages` (UI label) introduces a
  vocabulary gap that must be documented.
- `/settings/cats` semantics narrow to "global preferences" — existing UI
  needs a clear partition. `SettingsAssistants` lifts out from
  `/settings/cats/assistants` to a top-level `/settings/assistants` so
  the partition is unambiguous.

### Neutral

- ADR-065's lens model is unchanged; it is now realized at the canonical
  URL instead of inside Chat.
- `LobbyCatRoster` (top-right stacked avatars) becomes redundant once the
  Lobby sidebar ships and is removed; identity pill and `GuideCatDockSlot`
  remain.

## Alternatives Considered

### Alternative 1: Keep `/chat/my-cats/:catId` as Cat home; Lobby deep-links there
- **Pros**: Zero code migration.
- **Cons**: Reinforces the fiction that cats belong to Chat. Removing or
  renaming Chat breaks cat addressability. Clowders/Catteries still have no
  home.
- **Why rejected**: directly contradicts ADR-065.

### Alternative 2: Nest entities under `/lobby/cats/:id`, `/lobby/clowders/:id`
- **Pros**: Visually obvious that these are Lobby-managed.
- **Cons**: Surface-then-entity URL shape implies Lobby ownership of the
  entity. Removing Lobby breaks cat URLs. Same anti-pattern, different
  parent.
- **Why rejected**: Lobby is a viewport, not an owner.

### Alternative 3: Three independent registries with no shared identity
- **Pros**: Conceptual purity per entity type.
- **Cons**: Loses ADR-065's shared agent registry. Clowders/Catteries
  reference Cats by id; they need a shared registry, not three siloed ones.
- **Why rejected**: registry sharing is a load-bearing decision.

## References

- [ADR-065](./065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [ADR-098](./098-url-driven-canvas-and-platform-shared-viewer.md)
- [ADR-048](./048-separate-platform-products-from-installable-apps.md)
- [SPEC-064](../specs/SPEC-064-my-cats-platform-home-and-lens-projections.md)
- [SPEC-102](../specs/SPEC-102-lobby-sidebar-ia-and-entity-routes.md)
- [PLAN-091](../plans/PLAN-091-lobby-sidebar-and-entity-routes-rollout.md)

---

*Decision made: 2026-05-04*
*Decision makers: User, Claude*
