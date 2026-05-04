# SPEC-102: Lobby Sidebar IA and Entity Routes

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | User |
| **Related ADR** | [ADR-099](../decisions/099-promote-cats-clowders-catteries-to-platform-entities.md) |
| **Related SPEC** | [SPEC-064](./SPEC-064-my-cats-platform-home-and-lens-projections.md) |

## Summary

Adds a `LobbySidebar` that lists the user's Cats, Clowders, and Catteries,
each row navigating to the canonical platform-level entity routes from
ADR-099 (`/cats/:id`, `/clowders/:id`, `/catteries/:id`). Reshapes the Chat
product sidebar's `MY CATS` section into `Direct Messages` with a corrected
projection URL `/chat/dm/:catId`. Defines the entity profile/management
canvas shape rendered at each entity route.

## Goals

- Make Cats / Clowders / Catteries reachable from Lobby's sidebar without
  making them children of the Lobby surface
- Preserve the existing `PlatformLobby` canvas (lobbyTopBar identity pill,
  lobbyHero greeting, products grid, apps grid, `LobbyBouncingCats`
  background) — Lobby is a single page with one rendered state
- Lobby sidebar row clicks navigate to the canonical entity URL
  (`/cats/:id`, `/clowders/:id`, `/catteries/:id`); the user leaves
  `/lobby`. Entity detail is rendered standalone, never inside Lobby
  chrome. Per ADR-099, Lobby is a viewport, not a parent
- Keep web ↔ mobile navigation parity at the section level: both list the
  same three sections; both navigate to the canonical entity route on tap
- Rename Chat sidebar's `MY CATS` to `Direct Messages` and migrate the
  projection path

## Non-Goals

- Defining the full Clowder/Cattery data model — covered by
  [SPEC-103](./SPEC-103-clowder-and-cattery-data-model.md), which is
  Phase 6's prerequisite
- Cross-product Code/Work lens implementation (covered by SPEC-064)
- Reshaping mobile bottom-tabs
- Membership management business logic (invites, roles, billing)

## User Stories

- As an owner, I want the Lobby to be the place I see all my Cats, Clowders,
  and Catteries side by side, not split across three product sidebars.
- As a chat-heavy user, I want the Chat sidebar's section that lists cats
  for direct messaging to be called `Direct Messages` because that's what
  it is.
- As a deep-link sharer, I want `/cats/:id` to be a URL I can paste anywhere
  and have it work, regardless of which product the recipient is in.
- As an organization admin, I want a Cattery's home page to show its members
  and the clowders inside it as a single clear page, not buried under Work
  product sidebar.

## Requirements

### Functional Requirements

#### Lobby Sidebar

1. The web `/lobby` route shall render a left sidebar with three sections:
   - `My Cats` — list of cat summaries (id, name, avatar, lifecycle dot)
   - `My Clowders` — list of clowder summaries (id, name, avatar, member
     count, cat count)
   - `My Catteries` — list of cattery summaries (id, name, avatar, member
     count, clowder count, cat count)
2. Each section shall be **collapsible** with a chevron, and shall expose a
   `+ New X` row at its tail.
3. Clicking an entity row shall navigate to the canonical entity URL:
   `/cats/:catId`, `/clowders/:clowderId`, `/catteries/:catteryId`.
4. Sidebar state (which sections are collapsed, which entity is active) is
   URL-driven where reasonable; collapsed/expanded is `localStorage`-backed
   per ADR-098 spirit (ephemeral UI, not navigable view).

#### Lobby Canvas

5. With **no entity selected**, the Lobby canvas shall preserve the existing
   `PlatformLobby` content: `lobbyTopBar` (brand + GuideCatDockSlot +
   identity pill), `lobbyHero` greeting, products grid, apps grid. The
   `LobbyBouncingCats` background shall remain visible behind sidebar and
   canvas.
6. The top-right `LobbyCatRoster` (stacked cat avatars in `lobbyTopBar`)
   shall be **removed** once Lobby sidebar ships, to avoid duplicate rosters.
   The identity pill and `GuideCatDockSlot` shall remain.
7. Clicking a Lobby sidebar row **navigates** to the canonical entity URL
   (`/cats/:catId`, `/clowders/:clowderId`, `/catteries/:catteryId`); the
   user **leaves** the `/lobby` route. Per ADR-099, Lobby is a viewport,
   not a parent — there is no `/lobby/cat/:id` viewport-route family. The
   Lobby canvas only renders hero+products+apps (the LobbyHome state); it
   does not double as an in-place detail pane.
8. The standalone entity route (`/cats/:catId` etc.) is reached either by
   clicking from Lobby or by direct deep-link. In both cases it renders
   `EntityDetailPane` with a slim breadcrumb back to `/lobby`. The
   "sidebar visible while entity detail shows on the right" UX from
   earlier drafts is **dropped**; if a persistent platform navigation
   rail is wanted later, it is a separate ADR.

#### Entity Detail Pane

9. The `EntityDetailPane` is a shared React component with two slots:
   header (entity title + avatar + primary action) and body (tab content).
10. For Cat (`/cats/:id`), the tabs are: `Overview / Chat / Work / Code`
    (per SPEC-064 lens model). Default = `Overview`.
11. For Clowder (`/clowders/:id`), the tabs are: `Cats / Settings`.
    Default = `Cats`. (A Clowder is a flat task force group; it does not
    separate "humans who run it" from "cats inside" the way a Cattery
    does. See SPEC-103 §Surface Implications.)
12. For Cattery (`/catteries/:id`), the tabs are: `Members / Clowders /
    Cats / Settings`. Default = `Members`.
13. Tab selection is URL-driven via the second path segment:
    - `/cats/:id/{overview|chat|work|code}`
    - `/clowders/:id/{cats|settings}`
    - `/catteries/:id/{members|clowders|cats|settings}`
    Bare `/{type}/:id` redirects to the default tab (Cat=Overview;
    Clowder=Cats; Cattery=Members).
14. The entity route is **always** standalone — it never renders inside
    Lobby chrome. The page consists of `EntityDetailPane` with a slim
    breadcrumb back to `/lobby`. Smoke tests must assert that
    `/cats/:id` mounts without `PlatformLobby` mounted (see
    Non-Functional Requirements).

#### Chat Product Sidebar

15. `ConversationSidebarMyCatsSection` default label shall flip from
    `conversationSidebarMyCatsLabel` to a new
    `conversationSidebarDirectMessagesLabel` i18n key. The label `My Cats`
    is retired from the Chat sidebar.
16. Chat sidebar row click shall navigate to `/chat/dm/:catId`. The cat
    avatar in the same row also navigates to `/chat/dm/:catId` — there is
    **no** secondary "View profile" affordance on the avatar; everything in
    the Direct Messages row is single-intent (open the DM lane).
17. The path `/chat/my-cats/:catId` shall be **removed in the same change**
    that introduces `/chat/dm/:catId`. Per AGENTS.md §Pre-Release
    Compatibility Policy, no alias / 308 redirect / fallback branch is
    kept. All callers (sidebar paths, deep-links, Telegram binding helpers,
    test fixtures) are updated together.

#### Code & Work Product Sidebars

19. The placeholder row `My Clowders` in Code sidebar
    (`codeSidebarMyClowdersLabel`) and `My Catteries` in Work sidebar
    (`workSidebarMyCatteriesLabel`) shall be **removed**, along with their
    `+ New clowder` / `+ New cattery` empty-state placeholders.
20. Future product-local subset views for clowders/catteries shall follow
    SPEC-064's projection rules and shall not occupy the primary
    `myCatsSectionLabel` slot.

#### Mobile Lobby

21. The mobile Lobby tab (`mobile/app/(tabs)/lobby.tsx`,
    `mobile/src/renderer/screens/Lobby.tsx`) shall be **replaced** with the
    sidebar-as-tab content. The current mobile Lobby surface
    (`header / statRow / quickEntryRow / recentActivity`) is **removed**
    in the same change — per AGENTS.md no aliases or transitional
    side-by-side rendering are kept; the unreleased mobile Lobby content
    is treated as replaceable history.
22. The replaced mobile Lobby tab shall render exactly three sections,
    matching the web Lobby sidebar:
    - `My Cats`
    - `My Clowders`
    - `My Catteries`
23. Each section shall be collapsible (default collapsed, see FR-30) and
    expose a `+ New X` row at its tail, identical in structure to the web
    sidebar.
24. Tapping a row shall push to the corresponding entity screen via the
    canonical route family, mounted under Expo Router as
    `app/(tabs)/cats/[id].tsx`, `app/(tabs)/clowders/[id].tsx`,
    `app/(tabs)/catteries/[id].tsx`.
25. Mobile entity screens shall render a tab bar matching the web pane's
    tabs:
    - Cats: `Overview / Chat / Work / Code`
    - Clowders: `Cats / Settings`
    - Catteries: `Members / Clowders / Cats / Settings`
    using full-screen layout. The mobile entity screen reuses the same
    render-time contracts as `EntityDetailPane` even if its native shell
    differs.

#### Settings

26. `/settings/cats` shall be narrowed to **global cat preferences only**
    (model defaults, visibility, registration, app integrations). Per-cat
    profile/management lives at `/cats/:catId`.
27. `SettingsAssistants` shall move from `/settings/cats/assistants` to a
    top-level `/settings/assistants`. The assistants registry is not
    per-cat, and nesting it under `cats/` muddles the partition between
    "global cat preferences" and "the assistants registry". Per AGENTS.md,
    the old `/settings/cats/assistants` path is removed in the same change
    (no alias).
28. The existing `/settings/cats/my-cats` route (currently redirects to
    `/settings/cats`) shall be retargeted to `/cats` (the canonical cats
    list page).

#### Lobby Sidebar Default State

29. Each Lobby sidebar section (My Cats / My Clowders / My Catteries)
    shall default to **collapsed**. User-driven expand/collapse state is
    persisted in `localStorage` per section.

### Non-Functional Requirements

- **Path stability**: `/cats/:id`, `/clowders/:id`, `/catteries/:id` are
  stable contracts; breaking changes require a new ADR.
- **Surface independence**: removing Lobby in the future shall not break
  entity URLs. Tests must include a smoke check that `/cats/:id` renders
  without `PlatformLobby` mounted.
- **No backward compatibility shims**: `/chat/my-cats/:catId` and
  `/settings/cats/assistants` are removed in the same change that
  introduces the replacements. Per AGENTS.md §Pre-Release Compatibility
  Policy.
- **i18n**: every new label uses messageKeys; both `en` and `zh-TW`
  catalogs ship in the same change.
- **Test coverage**: each route shall have a renderer-level smoke test.
  Removed paths (`/chat/my-cats/:catId`, `/settings/cats/assistants`)
  shall have an explicit **404 assertion** to prove the path no longer
  resolves — this is the regression guard that replaces the alias-test
  pattern AGENTS.md forbids.

## Design Overview

### Route Shape

```
/lobby                          ← LobbyHome (sidebar rail + hero + products + apps)

/cats/:catId                    ← StandaloneEntityPage (CatHome) — canonical
/cats/:catId/:lens              ← lens deep-link (overview|chat|work|code)
/clowders/:clowderId            ← StandaloneEntityPage (ClowderHome) — canonical
/clowders/:clowderId/:tab       ← tab deep-link (cats|settings)
/catteries/:catteryId           ← StandaloneEntityPage (CatteryHome) — canonical
/catteries/:catteryId/:tab      ← tab deep-link (members|clowders|cats|settings)

/chat/dm/:catId                 ← Chat DM lane (replaces /chat/my-cats/:catId)
                                  /chat/my-cats/:catId is REMOVED — no alias
```

`/lobby` is a single route. There is **no** `/lobby/cat/:id` family —
that would imply Lobby owns the entity, contradicting ADR-099. Clicking
a row in Lobby's sidebar navigates the user away from `/lobby` to the
canonical entity URL.

### Component Tree

```
LobbyHome (route: /lobby)
├── LobbyTopBar (brand + GuideCatDockSlot + identity pill)
├── LobbyBouncingCats (fixed canvas background)
├── LobbySidebar (left rail)
│   ├── LobbySection "My Cats"
│   ├── LobbySection "My Clowders"
│   └── LobbySection "My Catteries"
└── LobbyCanvas (right side, single state)
    └── existing hero + products grid + apps grid

StandaloneEntityPage (routes: /cats/:id, /clowders/:id, /catteries/:id)
├── slim breadcrumb to /lobby
└── EntityDetailPane
    ├── header (avatar + name + actions)
    └── tabs body (CatLensView | ClowderTab | CatteryTab)
```

### Wireframes

#### Web Lobby — no entity selected (preserved canvas)

```
┌──────────────────────────────────────────────────────────────────────────┐
│   (background: LobbyBouncingCats, fixed)                                 │
│ ┌─────────────────┐ ┌─────────────────────────────────────────────────┐  │
│ │ Cats            │ │ Cats          [GuideCatDock] [Kenneth · ● ok]  │  │
│ ├─────────────────┤ ├─────────────────────────────────────────────────┤  │
│ │ ▾ My Cats   (5) │ │                                                 │  │
│ │  ● Concierge    │ │             "Pick a surface."                   │  │
│ │  ● Coder        │ │              (lobbyHero greeting)               │  │
│ │  ● Writer       │ │                                                 │  │
│ │  ● Researcher   │ ├─────────────────────────────────────────────────┤  │
│ │  ● Ops          │ │ PRODUCTS                                        │  │
│ │  + New Cat      │ │ ┌───────┐ ┌───────┐ ┌───────┐                  │  │
│ │                 │ │ │ Chat  │ │ Work  │ │ Code  │                  │  │
│ │ ▾ Clowders  (2) │ │ │       │ │       │ │       │                  │  │
│ │  ▣ Dev Team     │ │ └───────┘ └───────┘ └───────┘                  │  │
│ │  ▣ Research     │ ├─────────────────────────────────────────────────┤  │
│ │  + New Clowder  │ │ INSTALLED APPS                                  │  │
│ │                 │ │ ┌───────┐ ┌───────┐                            │  │
│ │ ▾ Catteries (2) │ │ └───────┘ └───────┘                            │  │
│ │  ▦ Acme Co.     │ │                                                 │  │
│ │  ▦ Side Project │ │                                                 │  │
│ │  + New Cattery  │ │                                                 │  │
│ └─────────────────┘ └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
  LobbySidebar          LobbyCanvas (LobbyHome state)
```

#### Standalone Cat page — `/cats/:catId` (reached from Lobby row click or direct deep-link)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Lobby     Cats Platform                            [Kenneth · ● ok]    │
├──────────────────────────────────────────────────────────────────────────┤
│ ◉ Concierge                                  [Open in Chat] [⋯]          │
├──────────────────────────────────────────────────────────────────────────┤
│ Overview | Chat | Work | Code                                            │
├──────────────────────────────────────────────────────────────────────────┤
│  Cross-product summary:                                                  │
│   • Default executor: Claude Opus 4.7                                    │
│   • Memberships: Dev Team, Acme Co.                                      │
│   • Last active: Chat (2 min ago)                                        │
│   • Pending: 0 chat / 1 work / 0 code                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

#### Standalone Cattery page — `/catteries/:catteryId`

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Lobby     Cats Platform                            [Kenneth · ● ok]    │
├──────────────────────────────────────────────────────────────────────────┤
│ ▦ Acme Co.                                   [Manage] [+ Invite]         │
├──────────────────────────────────────────────────────────────────────────┤
│ Members | Clowders | Cats | Settings                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ Members (12)   [statusFilter: formal ▾]            [+ Invite]            │
│ ┌────────────────────────────────────────────────────────────────────┐   │
│ │ ◉ Kenneth         Owner          formal              ⋯             │   │
│ │ ◉ Alice           Admin          formal              ⋯             │   │
│ │ ◉ Bob             Member         formal              ⋯             │   │
│ └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

The Lobby sidebar is **not** visible on these standalone pages. To return
to the sidebar the user clicks the `← Lobby` breadcrumb.

#### Mobile Lobby tab — replaced with sidebar-as-tab (default collapsed)

```
┌────────────────────────┐
│ Lobby             ⚙   │ ← top bar
├────────────────────────┤
│ ▸ My Cats         (5)  │ ← collapsed by default
├────────────────────────┤
│ ▸ My Clowders     (2)  │
├────────────────────────┤
│ ▸ My Catteries    (2)  │
├────────────────────────┤
│                        │
│        (empty)         │ ← no statRow, no quickEntry,
│                        │   no recentActivity — those
│                        │   surfaces leave Lobby
│                        │
├────────────────────────┤
│ 主頁 │ 聊天 │ 工作 │碼│我│ ← bottom tabs (unchanged)
└────────────────────────┘

Expanded example (user expanded My Cats):

┌────────────────────────┐
│ Lobby             ⚙   │
├────────────────────────┤
│ ▾ My Cats         (5)  │
│  ● Concierge       →   │ ← tap → /cats/:catId
│  ● Coder        2  →   │
│  ● Writer          →   │
│  ● Researcher      →   │
│  ● Ops             →   │
│  + New Cat             │
├────────────────────────┤
│ ▸ My Clowders     (2)  │
├────────────────────────┤
│ ▸ My Catteries    (2)  │
├────────────────────────┤
│ 主頁 │ 聊天 │ 工作 │碼│我│
└────────────────────────┘
```

The previous mobile Lobby content (`statRow`, `quickEntryRow`,
`recentActivity`) is **not preserved**. Per the user's IA correction, the
mobile Lobby tab IS the sidebar — same shape as the web Lobby's left rail,
not the previous "today summary" page.

#### Chat product sidebar — relabeled

```
Before:                          After:
┌───────────────────┐           ┌───────────────────┐
│ MY CATS           │           │ DIRECT MESSAGES   │
│  ● Concierge   2  │   →       │  ● Concierge   2  │
│  ● Coder          │           │  ● Coder          │
│  + New cat        │           │  + New direct …   │
└───────────────────┘           └───────────────────┘
click → /chat/my-cats/:id        click → /chat/dm/:id
       (REMOVED in same change)         (old path no longer registered)
```

## URL Map

```
/lobby                            ← LobbyHome (sidebar + hero + products + apps)
                                    no /lobby/{type}/:id family

/cats                             ← Cats list (standalone)
/cats/:catId                      ← Cat home (Overview default)
/cats/:catId/:lens                ← lens (overview|chat|work|code)
/clowders                         ← Clowders list
/clowders/:clowderId              ← Clowder home (Cats default)
/clowders/:clowderId/:tab         ← cats|settings
/catteries                        ← Catteries list
/catteries/:catteryId             ← Cattery home (Members default)
/catteries/:catteryId/:tab        ← members|clowders|cats|settings

/chat/dm/:catId                   ← Chat DM (renamed; old path removed)

/settings/cats                    ← global cat preferences (narrowed)
/settings/assistants              ← assistants registry (lifted from /settings/cats/assistants;
                                    old path removed in the same change)
/settings/cats/my-cats            ← 301 → /cats
```

## Boundaries

### What `LobbySidebar` is

- A platform navigation surface listing the three entity types
- A pure projection of the shared registry — clicking a row navigates; the
  row itself is not the entity

### What `LobbySidebar` is not

- The owner of cats / clowders / catteries
- A registry — it consumes the registry
- A management UI — management lives in `EntityDetailPane`

### What `EntityDetailPane` is

- The shared shell rendered at the canonical entity routes (`/cats/:id`,
  `/clowders/:id`, `/catteries/:id`)
- A tabbed view following SPEC-064 lens model for cats; entity-specific
  tabs for clowders and catteries

### What `EntityDetailPane` is not

- Lobby-specific
- Chat/Work/Code-specific (it can call into product views via lens tabs,
  but the pane itself is platform-shared)

## Resolved Decisions (was: Open Questions)

- **Avatar click in Chat sidebar (Direct Messages)** → opens DM lane
  (`/chat/dm/:catId`). The row and the avatar share the single intent
  "open the DM"; there is no `View profile` affordance on the avatar.
  Cat profile is reached only via Lobby sidebar `/cats/:catId`.
- **Lobby sidebar section default state** → **collapsed**. User-driven
  expand/collapse persisted in `localStorage` per section.
- **`SettingsAssistants` location** → top-level `/settings/assistants`
  (lifted out from under `/settings/cats/assistants`).
- **Mobile Lobby tab content** → replaced wholesale with the
  sidebar-as-tab (My Cats / My Clowders / My Catteries). The previous
  `statRow / quickEntryRow / recentActivity` is removed.
- **`LobbyCatRoster`** → removed cleanly in Phase 4. No replacement;
  identity pill + GuideCatDockSlot remain in `lobbyTopBar`.
- **`/chat/my-cats/:catId`** → removed in the same change as
  `/chat/dm/:catId` introduction. No alias.
- **Lobby URL shape** → only `/lobby` exists. `/lobby/cat/:id` etc. are
  **not** introduced — the Lobby sidebar's row click navigates the user
  to the canonical entity URL (`/cats/:catId` etc.). Lobby is a viewport
  per ADR-099, not a parent of the entity routes.
- **Clowder detail tabs** → `Cats / Settings` (collapsed from the
  earlier `Members / Cats / Settings` proposal). A Clowder is a flat
  task force; no separation between "humans who run it" and "cats
  inside".
- **Tablet mobile layout** → out of scope; ship phone-only.

## Dependencies

- [ADR-099](../decisions/099-promote-cats-clowders-catteries-to-platform-entities.md)
- [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [ADR-098](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md)
- [SPEC-064](./SPEC-064-my-cats-platform-home-and-lens-projections.md)
- [SPEC-095](./SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md)

## References

- `src/app/renderer/PlatformLobby.tsx` — current Lobby canvas
- `src/app/renderer/lobbyModel.ts` — Lobby payload model
- `src/app/renderer/productShell/ConversationSidebarMyCats.tsx` — Chat
  sidebar's cats section to be relabeled
- `src/app/renderer/productShell/myCatNavigation.ts` — `buildDirectLanePath`
  to be retargeted to `/chat/dm/:catId`
- `src/products/code/renderer/components/Sidebar.tsx` — `myCatsSectionLabel`
  to be removed
- `src/products/work/renderer/components/Sidebar.tsx` — same
- `mobile/src/renderer/screens/Lobby.tsx` — mobile lobby to extend
- `src/design/components/platform-lobby.css` — styles to extend

---

*Created: 2026-05-04*
*Author: Claude*
*Related Plan: [PLAN-091](../plans/PLAN-091-lobby-sidebar-and-entity-routes-rollout.md)*
