# SPEC-102: Lobby Sidebar IA and Entity Routes

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (IA shipped 2026-05-05 per Implementation Status §; Clowder/Cattery still gated on ADR-100 / SPEC-103) |
| **Owner** | Claude |
| **Reviewer** | User |
| **Related ADR** | [ADR-099](../decisions/099-promote-cats-clowders-catteries-to-platform-entities.md) |
| **Related SPEC** | [SPEC-064](./SPEC-064-my-cats-platform-home-and-lens-projections.md) |
| **Implementation Note** | The §Implementation Status (2026-05-05) section below documents what actually shipped. The original FR list that follows it is kept as historical design intent — `/entities/*` was retreated, the DM section is opt-in, and the lobby is a bare landing page. PLAN-091 Phase 7+ tracks the shipped behaviour. |

## Implementation Status (2026-05-05, post-`/entities/*` migration)

> **Read this first if you're touching `/lobby`, `/entities/*`, the
> chat sidebar's DIRECT MESSAGES section, or the
> chat companion workspace.** The user iterated heavily on the IA
> during phases 7+ and the as-shipped behaviour deviates from the
> original FR list below in several load-bearing places. Don't
> "fix" the corrections back to the original spec — they are
> intentional. The deltas are listed here; the FR sections that
> follow are kept as historical record of the initial design intent
> only.

### IA shape (as-shipped)

- **`/lobby` is bare** — no sidebar at all. Body is the landing-page
  canvas: `lobbyTopBar` identity pill, hero greeting, three
  entity column-cards (Cats / Clowders / Catteries), products grid,
  apps grid, `LobbyBouncingCats` background.
- **Entity-domain routes mount the Entities workspace
  shell** (`EntitiesShell` in `src/app/renderer/entities-shell/EntitiesShell.tsx`).
  This is a chat-style appshell — `screen claudeShell` outer grid,
  `EntitiesAppShellSidebar` on the left, `<main class="canvas">` on the
  right. The shell wraps:
  `/entities`, `/entities/cats`, `/entities/cats/:catId`, `/entities/clowders`,
  `/entities/clowders/:clowderId(/:tab)?`, `/entities/catteries`,
  `/entities/catteries/:catteryId(/:tab)?`.
- **`EntitiesAppShellSidebar` reuses the chat / code / work
  `ConversationSidebar*` primitives**:
  - `PlatformSurfaceSwitcher` at the top with the
    `entitiesShellSurfaceLabel` ("Cats Directory") override. The
    `/entities` index page title uses its own `entityIndex.title`
    key so page copy can evolve independently from sidebar chrome.
  - `primaryActions = [Back to Lobby]` only (navigates `/lobby`)
  - Scrollable middle: three `<nav class="navGroup">` blocks, one per
    entity kind. Each starts with a `.navItem` button (My Cats /
    My Clowders / My Catteries) with active state when the URL
    starts with `/entities/cats|/entities/clowders|/entities/catteries`.
    Underneath each nav
    item, `<ConversationSidebarMyCatsSection hideLabel>` renders
    the entity rows, mirroring the Cats Work "Projects + pinned
    project rows" layout (Projects nav header + `.navGroupPinnedList`).
  - `GuideCatDockSlot` + `ConversationSidebarFooter` at the bottom.
- **Sidebar collapse state persists to `cats.sidebar-open` localStorage**
  via the shared `readSidebarOpenPreference` / `writeSidebarOpenPreference`
  helpers — same key chat / code / work use, so toggling collapse
  carries across products.
- **Entity index cards (CATS / CLOWDERS / CATTERIES)**: three-column
  grid, plain text headers (not buttons), each card shows up to
  three entity rows + a "{N} TOTAL" red footer. Footer hidden when
  count === 0; an avatar stack appears in the footer when total
  count > 3. Whole-card click-target via an absolute-positioned
  `.entityIndexCardLink` background button (rows + footer +
  accent stripe live above it via z-index / pointer-events). Cards
  share a single neutral `--muted-soft` accent stripe (no per-kind
  brand tints). Boss avatar carries `.catAvatarBoss` (gold ring) —
  the chat-thread-base.css primitive is the single source of that
  rule and the lobby imports it.
- **`/entities` is a real index page**, not a redirect or inert prefix.
  It renders the same `EntityIndexCards` directory inside `EntitiesShell`
  so the namespace has a first-class landing route.

### Sort order

- **Entity index cards + Entities sidebar's My Cats**:
  Boss-first; tiebreak by `createdAt` ascending (older cats float
  higher). `PlatformLobbyCatSummary` carries a required
  `createdAt: string` field for this. Both `EntityIndexCards`
  and `ENTITIES_HELPERS.sortCatsForDisplay` in
  `EntitiesAppShellSidebar` apply the same rule.
- **Chat sidebar DIRECT MESSAGES**:
  Recency-first via `sortChatCatsByRecency(cats, channels)` (chat
  Sidebar.tsx, inline). Each cat's score is its direct-lane
  channel's `lastActivatedAt` (falling back to `lastMessageAt`);
  cats with no channel use `createdAt`. **Boss-cat pinning is NOT
  applied here** — the Lobby is for management, the Chat sidebar is
  recency-driven Slack-style DMs.

### Chat sidebar — DIRECT MESSAGES section

- Section is **opt-in** at the renderer level
  (`forceShowMyCatsSection: cats.length > 0` in chat
  `Sidebar.tsx`). When the user has no cats the section header,
  the rows, and any placeholder all stay hidden.
- The legacy "+ New cat" empty-state placeholder is **removed
  permanently** from this section (cat creation lives elsewhere).
- 3-dots overflow popover replaces "Archive" with **"Clear"**
  (label key `conversationSidebar.clearButton`). Click confirms
  via the app-level `<ConfirmDialog>` then deletes the cat's
  direct-lane channel through the new
  `useWorkspaceAppNavigationActions.onClearDirectLane(catId,
  channelId)` flow — same `deleteChatChannel` API as
  `onDeleteChannel` but the post-delete navigate goes to
  `buildMyCatPathForPrefix(chatPrefix, catId)` (i.e. `/chat/dm/:catId`)
  instead of falling back to `/chat/new`. The DM route renders
  `NewChatDraft` when no direct-lane channel exists, so the user
  stays on the cat in a fresh draft state.
- Section was previously auto-rendering on every chat / code / work
  sidebar whenever `payload.chat.cats.length > 0`. The opt-in
  guard in `ConversationSidebar.tsx` (`showMyCatsSection =
  forceShowMyCatsSection || myCatsEmptyStatePlaceholder != null`)
  fixes that leak — Code / Work intentionally don't pass either.
- `MY CATS` label rename to `Direct Messages` (FR-13 of the
  original spec) lives only on chat. The default fallback in
  `ConversationSidebar` still uses the directMessages key but no
  other sidebar opts in.

### Chat product chrome

- **Sidebar primary action labels are Title-Case**:
  `New Chat` / `Group Chat` / `Parallel Chat` (en). Same for
  Work: `New Work` / `Team Work` / `Parallel Work`. Chinese
  catalogs unchanged (no case concept).
- **`ChatViewTopBar` profile button**: when the channel is a
  direct lane, an eye-icon button appears to the left of the
  side-panel toggle. Click navigates `/entities/cats/:defaultRecipientCat.catId`.
  Wired in `ChatView.tsx` via `useNavigate` + the new
  `onOpenCatProfile?: () => void` prop on `ChatViewTopBar`.
- **`NewChatDraft` direct-lane variant**: avatar + cover photo
  display read-only (`readOnlyVisuals` on `DraftHeader` suppresses
  the camera-badge and "Add cover photo" buttons but the imagery
  still renders). The header `actions` slot carries an eye-icon
  "View cat profile" button (label key
  `chatNewChatDraft.viewCatProfileAction`) that navigates
  `/entities/cats/:defaultRecipientCat.id`.
- **Companion-mode toggle removed from `/chat/dm/:catId`**.
  `CompanionWorkspace` is no longer reachable from the chat
  surface — it lives at `/entities/cats/:catId` only (see below).
  `CompanionModeToggleChip` and the in-line companion render in
  chat `AppRoutes.tsx` are gone.

### `/entities/cats*` canvas + companion

- **`/entities/cats` mounts `CatsCanvasPage`** (`src/app/renderer/entities/CatsCanvasPage.tsx`)
  inside `EntitiesShell`. The page fetches `AppShellPayload` once
  via `fetchAppShell()` and renders
  `<WorkspaceCatsCanvas>` from a fresh **copy** of the settings
  canvas at `src/products/shared/renderer/components/cats/`. The
  Settings canvas at `/settings/cats` still exists in parallel —
  whether to delete it is **TBD** (cat creation flow at
  `/settings/cats/new` is the holdout reason).
- **`/entities/cats/:catId` mounts `CatProfilePage`** (`src/app/renderer/entities/CatProfilePage.tsx`).
  Renders a platform-level **copy** of the chat
  `CompanionWorkspace` at
  `src/app/renderer/entities/companion/` (7 components +
  4 hooks copied; chat product types + APIs are still pulled
  from their original location, single source of truth for
  the backend pipeline). The page passes:
  - `hideFeed = !hasCompanionSkill(cat)` — non-companion cats
    keep the same chrome (header / settings panel) but the
    `<CompanionFeed>` Post / Photo region is suppressed
  - `hideCompanionToggle` always — there is no chat surface to
    flip back to from the Entities mount
- **`CatHome` + `CatsListPage` scaffolding from earlier phases is removed**.
  `/entities/cats` is `CatsCanvasPage`, and `/entities/cats/:catId`
  is `CatProfilePage`; no dormant alternate cat route/component tree is kept.
- **`/entities/clowders` and `/entities/catteries` mount canvas entry pages**
  inside `EntitiesShell`, matching `/entities/cats` as platform-level management
  entrypoints. The current canvases use a registry + detail-panel
  shape over the phase-6 summary payload; full mutation flows still
  wait for the Clowder / Cattery storage records.

### Path migrations + contracts

- `/chat/my-cats/:catId` → `/chat/dm/:catId` (chat product) —
  matches phase 2 of the plan. **Platform-shell helpers were also
  migrated** in a follow-up:
  `buildMyCatPathForPrefix` (`app/renderer/productShell/myCatNavigation.ts`),
  `resolveWorkspaceMyCatsPathPrefix` and
  `buildWorkspaceMyCatPath` (`products/shared/channelPaths.ts`),
  the `<Route path="dm/:catId">` registration in
  `WorkspaceAppRoutes.tsx`, and the `useMatch` in
  `useWorkspaceLocationState` all emit / match `/dm/:catId` now.
  Helper / constant names still say `MyCats` (the shared-agent
  concept per ADR-065) but the URLs are `/dm/`.
- `PlatformLobbyCatSummary` gains a required `createdAt: string`
  field (post-phase-7 contract bump for sort tiebreaks).
- `PlatformLobbyClowderSummary` and `PlatformLobbyCatterySummary`
  also carry required `createdAt: string` fields while their full
  records are still deferred, so Lobby cards and canvas entry pages can
  apply a stable `createdAt` ascending sort.

### Settings sidebar

- Assistants navigates to `/settings/assistants` (per phase 3)
  but the sidebar **UI** still nests it under the `CATS`
  subheading group, mirroring `My Cats` indentation. The lift
  applied to the route, not the visual grouping.
- `/settings/cats/my-cats` is **removed**. Settings sidebar's My Cats
  row navigates directly to canonical `/settings/cats`; no compatibility
  redirect is kept.
- Unknown Settings child routes render the Settings not-found pane instead
  of redirecting to `/settings/general`, so removed routes cannot survive
  as implicit aliases.

### Hooks / shared primitives extracted during the iterations

- `useSidebarOverflowMenuDismiss` (`src/app/renderer/productShell/`)
  — outside-click dismissal for the `.myCatOverflowMenu` /
  `.recentOverflowMenu` popover. Originally inline in
  `useAppChrome`; lifted out so the Entities sidebar
  (which doesn't go through `useAppChrome`) gets the same
  behaviour.
- `WorkspaceProductSidebarProps.confirmDialog`
  (`WorkspaceProductApp.tsx`) — promise-based confirm bound to
  the app-level `<ConfirmDialog>`, plumbed through to
  `renderSidebar` so chat's "Clear" popover doesn't fall back to
  `window.confirm`.
- Chat sidebar wrapper now defines its own `sortChatCatsByRecency`
  (replacing `sortChatCatsForDisplay` for the DIRECT MESSAGES
  section).

## Summary

Adds a `LobbySidebar` that lists the user's Cats, Clowders, and Catteries,
each row navigating to the canonical platform-level entity routes from
ADR-099 (`/entities/cats/:id`, `/entities/clowders/:id`, `/entities/catteries/:id`). Reshapes the Chat
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
  (`/entities/cats/:id`, `/entities/clowders/:id`, `/entities/catteries/:id`); the user leaves
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
- Membership management business logic (invites, roles, billing)

## Mobile Bottom-Tab Reshape (2026-05-05 follow-up)

The original Phase-5 framing scoped mobile bottom-tabs as a non-goal.
That call was reversed once the desktop side promoted Settings to its
own surface and replaced the Cats Directory product switcher with a
dedicated back button: web and mobile now share one Cats Directory
mental model, so leaving mobile bottom-tabs labelled `Lobby` would
have re-introduced exactly the IA mismatch this SPEC was opened to
close. The follow-up:

- Mobile bottom-tab order is `Cats`, `Chat`, `Code`, `Work`, `Settings`
  (web Lobby content — greeting, entity index cards — is explicitly
  NOT mirrored on the mobile `Cats` tab).
- The mobile `Cats` tab IS the directory landing — three sections
  (My Cats / My Clowders / My Catteries) on top of the existing
  connect-to-desktop / unconfigured affordances, mirroring the web
  Cats Directory sidebar.
- The mobile Chat / Code / Work product sidebars drop their MY-lens
  rows (DIRECT MESSAGES / MY CLOWDERS / MY CATTERIES) and the cat
  presence chip; cat / clowder / cattery rosters now live exclusively
  under the `Cats` tab.
- Web Chat sidebar's `MY CATS → Direct Messages` rename remains in
  scope for FR-15 (the desktop Chat sidebar still surfaces the
  per-conversation direct-message lens; only the platform-level cat
  roster moved out).

## User Stories

- As an owner, I want the Lobby to be the place I see all my Cats, Clowders,
  and Catteries side by side, not split across three product sidebars.
- As a chat-heavy user, I want the Chat sidebar's section that lists cats
  for direct messaging to be called `Direct Messages` because that's what
  it is.
- As a deep-link sharer, I want `/entities/cats/:id` to be a URL I can paste anywhere
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
   `/entities/cats/:catId`, `/entities/clowders/:clowderId`, `/entities/catteries/:catteryId`.
4. The Lobby sidebar has no "selected entity" state because clicking a
   row navigates the user away from `/lobby` (FR-7). The only sidebar
   state is per-section collapse/expand, persisted in `localStorage`
   (ephemeral UI, not navigable; consistent with ADR-098 spirit).

#### Lobby Canvas

5. The Lobby canvas has a single rendered state: it preserves the
   existing `PlatformLobby` content — `lobbyTopBar` (brand +
   GuideCatDockSlot + identity pill), `lobbyHero` greeting, products
   grid, apps grid — with `LobbyBouncingCats` as the fixed background
   behind sidebar and canvas. There is no entity-detail mode inside the
   Lobby canvas.
6. The top-right `LobbyCatRoster` (stacked cat avatars in `lobbyTopBar`)
   shall be **removed** once Lobby sidebar ships, to avoid duplicate rosters.
   The identity pill and `GuideCatDockSlot` shall remain.
7. Clicking a Lobby sidebar row **navigates** to the canonical entity URL
   (`/entities/cats/:catId`, `/entities/clowders/:clowderId`, `/entities/catteries/:catteryId`); the
   user **leaves** the `/lobby` route. Per ADR-099, Lobby is a viewport,
   not a parent — there is no `/lobby/cat/:id` viewport-route family. The
   Lobby canvas only renders hero+products+apps (the LobbyHome state); it
   does not double as an in-place detail pane.
8. The standalone entity route (`/entities/cats/:catId` etc.) is reached either by
   clicking from Lobby or by direct deep-link. In both cases it renders
   `EntityDetailPane` with a slim breadcrumb back to `/lobby`. The
   "sidebar visible while entity detail shows on the right" UX from
   earlier drafts is **dropped**; if a persistent platform navigation
   rail is wanted later, it is a separate ADR.

#### Entity Detail Pane

9. The `EntityDetailPane` is a shared React component with two slots:
   header (entity title + avatar + primary action) and body (tab content).
10. For Cat (`/entities/cats/:id`), the tabs are: `Overview / Chat / Work / Code`
    (per SPEC-064 lens model). Default = `Overview`.
11. For Clowder (`/entities/clowders/:id`), the tabs are: `Cats / Settings`.
    Default = `Cats`. (A Clowder is a flat task force group; it does not
    separate "humans who run it" from "cats inside" the way a Cattery
    does. See SPEC-103 §Surface Implications.)
12. For Cattery (`/entities/catteries/:id`), the tabs are: `Members / Clowders /
    Cats / Settings`. Default = `Members`.
13. Tab selection is URL-driven via the second path segment:
    - `/entities/cats/:id/{overview|chat|work|code}`
    - `/entities/clowders/:id/{cats|settings}`
    - `/entities/catteries/:id/{members|clowders|cats|settings}`
    Bare `/{type}/:id` redirects to the default tab (Cat=Overview;
    Clowder=Cats; Cattery=Members).
14. The entity route is **always** standalone — it never renders inside
    Lobby chrome. The page consists of `EntityDetailPane` with a slim
    breadcrumb back to `/lobby`. Smoke tests must assert that
    `/entities/cats/:id` mounts without `PlatformLobby` mounted (see
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
23. Each section shall be collapsible (default collapsed, see FR-29) and
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
    profile/management lives at `/entities/cats/:catId`.
27. `SettingsAssistants` shall move from `/settings/cats/assistants` to a
    top-level `/settings/assistants`. The assistants registry is not
    per-cat, and nesting it under `cats/` muddles the partition between
    "global cat preferences" and "the assistants registry". Per AGENTS.md,
    the old `/settings/cats/assistants` path is removed in the same change
    (no alias).
28. The legacy `/settings/cats/my-cats` route shall be removed rather
    than redirected. The Settings sidebar's My Cats row shall navigate
    directly to `/settings/cats` until the `/settings/cats` vs.
    `/entities/cats` split is finalized.

#### Lobby Sidebar Default State

29. Each Lobby sidebar section (My Cats / My Clowders / My Catteries)
    shall default to **collapsed**. User-driven expand/collapse state is
    persisted in `localStorage` per section.

### Non-Functional Requirements

- **Path stability**: `/entities/cats/:id`, `/entities/clowders/:id`, `/entities/catteries/:id` are
  stable contracts; breaking changes require a new ADR.
- **Surface independence**: removing Lobby in the future shall not break
  entity URLs. Tests must include a smoke check that `/entities/cats/:id` renders
  without `PlatformLobby` mounted.
- **No backward compatibility shims**: `/chat/my-cats/:catId`,
  `/settings/cats/assistants`, and `/settings/cats/my-cats` are
  removed in the same change that introduces the replacements. Per
  AGENTS.md §Pre-Release Compatibility Policy.
- **i18n**: every new label uses messageKeys; both `en` and `zh-TW`
  catalogs ship in the same change.
- **Test coverage**: each route shall have a renderer-level smoke test.
  Removed paths (`/chat/my-cats/:catId`, `/settings/cats/assistants`,
  `/settings/cats/my-cats`)
  shall have an explicit **not-found / no-match assertion** to prove the
  path no longer resolves to a live settings or entity page — this is the
  regression guard that replaces the alias-test pattern AGENTS.md forbids.

## Design Overview

### Route Shape

```
/lobby                                   ← LobbyHome (sidebar rail + hero + products + apps)

/entities                                ← Cats Directory index
/entities/cats                           ← Cats canvas
/entities/cats/:catId                    ← CatProfilePage — canonical
/entities/cats/:catId/:lens              ← lens deep-link (overview|chat|work|code)
/entities/clowders                       ← Clowders canvas
/entities/clowders/:clowderId            ← StandaloneEntityPage (ClowderHome) — canonical
/entities/clowders/:clowderId/:tab       ← tab deep-link (cats|settings)
/entities/catteries                      ← Catteries canvas
/entities/catteries/:catteryId           ← StandaloneEntityPage (CatteryHome) — canonical
/entities/catteries/:catteryId/:tab      ← tab deep-link (members|clowders|cats|settings)

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

StandaloneEntityPage (routes: /entities/cats/:id, /entities/clowders/:id, /entities/catteries/:id)
├── slim breadcrumb to /lobby
└── EntityDetailPane
    ├── header (avatar + name + actions)
    └── tabs body (CatLensView | ClowderTab | CatteryTab)
```

### Wireframes

#### Web Lobby (`/lobby`) — single rendered state

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

#### Standalone Cat page — `/entities/cats/:catId` (reached from Lobby row click or direct deep-link)

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

#### Standalone Cattery page — `/entities/catteries/:catteryId`

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
│  ● Concierge       →   │ ← tap → /entities/cats/:catId
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
/lobby                                     ← LobbyHome (hero + entity cards + products + apps)
                                             no /lobby/{type}/:id family

/entities                                  ← Cats Directory index
/entities/cats                             ← Cats canvas
/entities/cats/:catId                      ← CatProfilePage companion/profile mount
/entities/clowders                         ← Clowders canvas
/entities/clowders/:clowderId              ← Clowder home (Cats default)
/entities/clowders/:clowderId/:tab         ← cats|settings
/entities/catteries                        ← Catteries canvas
/entities/catteries/:catteryId             ← Cattery home (Members default)
/entities/catteries/:catteryId/:tab        ← members|clowders|cats|settings

/chat/dm/:catId                            ← Chat DM (renamed; old path removed)

/settings/cats                             ← global cat preferences (narrowed)
/settings/assistants                       ← assistants registry (lifted from /settings/cats/assistants;
                                             old path removed in the same change)
```

## Boundaries

### What `EntitiesAppShellSidebar` is

- A platform navigation surface listing the three entity types
- A pure projection of the shared registry — clicking a row navigates; the
  row itself is not the entity

### What `EntitiesAppShellSidebar` is not

- The owner of cats / clowders / catteries
- A registry — it consumes the registry
- A management UI — management lives in `EntityDetailPane`

### What `EntityDetailPane` is

- The shared shell rendered at the canonical entity routes (`/entities/cats/:id`,
  `/entities/clowders/:id`, `/entities/catteries/:id`)
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
  Cat profile is reached only via Lobby sidebar `/entities/cats/:catId`.
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
  to the canonical entity URL (`/entities/cats/:catId` etc.). Lobby is a viewport
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
