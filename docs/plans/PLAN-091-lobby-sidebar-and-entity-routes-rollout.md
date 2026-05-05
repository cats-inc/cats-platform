# PLAN-091: Lobby Sidebar and Entity Routes Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Related Spec** | [SPEC-102](../specs/SPEC-102-lobby-sidebar-ia-and-entity-routes.md) |
| **Related ADR** | [ADR-099](../decisions/099-promote-cats-clowders-catteries-to-platform-entities.md) |

## Objective

Promote Cats, Clowders, and Catteries to first-class platform entities with
canonical top-level URLs (per ADR-099), introduce a `LobbySidebar` that
lists them (per SPEC-102), and migrate existing Chat/Code/Work product
sidebar rows to match the new IA.

## Scope

In scope:
- New canonical entity routes: `/entities/cats/:id`, `/entities/clowders/:id`,
  `/entities/catteries/:id` (+ tab/lens children)
- New `LobbySidebar` and `EntityDetailPane` components
- Chat sidebar rename `MY CATS` → `Direct Messages`, path migration to
  `/chat/dm/:catId`
- Removal of empty `My Clowders` / `My Catteries` placeholder rows from
  Code/Work sidebars
- Mobile Lobby tab extension (three new sections)
- Web Lobby canvas reshaping (sidebar + canvas, removal of
  `LobbyCatRoster`)
- Standalone entity pages for deep-links

Out of scope (covered elsewhere or deferred):
- Full Clowder/Cattery data model and registry — covered by
  [SPEC-103](../specs/SPEC-103-clowder-and-cattery-data-model.md);
  Phase 6 prerequisite, gated on user approval
- Membership management business logic (invites, roles, ACL) — future
  follow-up plan
- Cross-product Code/Work lens implementation — covered by SPEC-064
  follow-up
- Tablet-specific mobile layout
- Recent-cats compressed roster (replacement for removed
  `LobbyCatRoster`)

## Phases

### Phase 1: Land Design Artifacts and Canonical Routes (Stub UI)

- [ ] Land ADR-099, SPEC-102, this PLAN — review with user
- [ ] Add canonical routes to `src/app/renderer/App.tsx`:
  - [ ] `/entities/cats/:catId` → temporary `<EntityComingSoon kind="cat" />`
  - [ ] `/entities/clowders/:clowderId` → `<EntityComingSoon kind="clowder" />`
  - [ ] `/entities/catteries/:catteryId` → `<EntityComingSoon kind="cattery" />`
- [ ] No sidebar changes yet; no path migration yet (kept for Phase 2 so
      callers all flip together — see Phase 2 note)
- [ ] Smoke tests:
  - [ ] visiting `/entities/cats/abc` renders without crash
  - [ ] visiting `/entities/clowders/abc` and `/entities/catteries/abc` likewise

### Phase 2: Chat Sidebar Relabel + Clean Path Cut

> **Clean cut**: per AGENTS.md §Pre-Release Compatibility Policy, this
> phase removes `/chat/my-cats/:catId` entirely and adds `/chat/dm/:catId`
> in the **same change**. No alias, no 308 redirect, no transitional
> side-by-side. All callers flip together; a missed caller is a hard 404.

- [ ] Add i18n key `conversationSidebarDirectMessagesLabel` (en + zh-TW)
- [ ] Update `ConversationSidebarMyCatsSection` to default to the new
      label; remove `conversationSidebarMyCatsLabel` if no other caller
      uses it (audit the i18n key first)
- [ ] Add `/chat/dm/:catId` route to chat product router (renders existing
      direct-lane channel view) and **remove** `/chat/my-cats/:catId`
      registration in the same change
- [ ] Update `myCatNavigation.ts` `buildMyCatPathForPrefix` to emit
      `/chat/dm/:catId`; rename `buildDirectLanePath` →
      `buildDirectMessagePath` to match the UI label (resolved decision;
      internal `direct_lane` term in channel topology stays)
- [ ] Update `buildDirectLanePath` in `PlatformLobby.tsx` (or remove its
      use from Lobby — `LobbyCatRoster` is going away in Phase 4)
- [ ] Audit and update every caller emitting `/chat/my-cats/...`:
      sidebar row click handlers, Telegram binding helpers, settings
      navigation, deep-link fixtures, snapshot tests
- [ ] Remove Code sidebar's `myCatsSectionLabel:
      codeSidebarMyClowdersLabel` row and its empty-state placeholder
      (`src/products/code/renderer/components/Sidebar.tsx` ~line 379)
- [ ] Remove Work sidebar's `myCatsSectionLabel:
      workSidebarMyCatteriesLabel` row and its placeholder
- [ ] Drop now-unused i18n keys: `codeSidebarMyClowdersLabel`,
      `codeSidebarNewClowderLabel`, `workSidebarMyCatteriesLabel`,
      `workSidebarNewCatteryLabel` (and `conversationSidebarMyCatsLabel`
      if confirmed unused) — the Lobby sidebar uses its own
      `lobbyMyCatsLabel`/`lobbyMyClowdersLabel`/`lobbyMyCatteriesLabel`
- [ ] Update tests in `tests/platform-shell-sidebar-surface.test.tsx`
      (Code/Work sections expectations flip to "no My Clowders/Catteries
      section")
- [ ] Update `tests/sidebar-my-cats-navigation.test.tsx` to assert
      `/chat/dm/:catId` (and to fail loudly if `/chat/my-cats/...` is
      still emitted anywhere)
- [ ] Update mobile fixture `mobile/src/api/fixtures/productSidebar.ts`:
      remove the `Code → MY CLOWDERS` and `Work → MY CATTERIES` lines
      from the comment, and update the `myLensLabel` choices
      accordingly

### Phase 3: EntityDetailPane Component + Cat Home

- [ ] New `src/design/components/EntityDetailPane.tsx` — shared shell with
      header slot + tabs slot + body slot
- [ ] New `src/app/renderer/entities/CatHome.tsx` — Overview/Chat/Work/Code
      lens tabs; Overview shows summary fields; Chat/Work/Code lenses can
      be stubs in Phase 3 (full lenses are SPEC-064's territory)
- [ ] Wire `/entities/cats/:catId` to render standalone page wrapping
      `EntityDetailPane` + `CatHome`
- [ ] Wire `/entities/cats/:catId/:lens` for explicit lens deep-links (overview |
      chat | work | code)
- [ ] Move `SettingsAssistants` from `/settings/cats/assistants` to
      top-level `/settings/assistants` (clean cut — old path removed in
      the same change, per AGENTS.md). Update
      `PlatformSettingsRoutes.tsx`, settings navigation entries, and any
      deep-links
- [ ] `/settings/cats/my-cats` redirect (currently → `/settings/cats`)
      retargets to `/entities/cats`
- [ ] Smoke tests for each lens path
- [ ] Smoke test that `/settings/assistants` renders the assistants form
      and that `/settings/cats/assistants` is no longer registered

### Phase 4: LobbySidebar + Lobby Canvas Reshape

- [ ] New `src/app/renderer/lobby/LobbySidebar.tsx` (3 collapsible
      sections fed by Lobby envelope payload — augment
      `lobbyModel.ts` to expose cats/clowders/catteries summaries)
- [ ] Refactor `PlatformLobby.tsx` into a 2-column layout:
  - left: `LobbySidebar`
  - right: existing LobbyHome content (hero + products + apps).
    LobbyCanvas only ever renders LobbyHome — there is no entity-detail
    state inside Lobby. Clicking a sidebar row navigates the user away
    to `/entities/cats/:id` etc.
- [ ] Sidebar interaction: clicking a row navigates to the canonical
      entity URL (`/entities/cats/:catId`, `/entities/clowders/:clowderId`,
      `/entities/catteries/:catteryId`). The user **leaves** `/lobby`. There is
      no `/lobby/{type}/:id` family; per ADR-099, Lobby is a viewport,
      not a parent. SPEC-102 §Resolved Decisions and §Route Shape
- [ ] Remove `LobbyCatRoster` from `lobbyTopBar`
- [ ] Sidebar sections default to **collapsed**; persist user-driven
      expand/collapse in `localStorage` per section
- [ ] CSS: extend `platform-lobby.css` for sidebar + 2-column layout;
      handle `@media (max-width: 640px)` to stack (sidebar above canvas)
      on narrow widths
- [ ] Tests:
  - [ ] `/lobby` renders LobbyHome (sidebar + hero + products + apps)
        — existing tests should still pass
  - [ ] `/entities/cats/:id` (standalone) mounts EntityDetailPane without Lobby
        chrome
  - [ ] `/lobby/cat/:id` (and `/lobby/clowder/...`, `/lobby/cattery/...`)
        is **not** registered — assert 404 to lock in that the
        viewport-route family does not exist

### Phase 5: Mobile Lobby Replacement (sidebar-as-tab)

> **Replace, don't extend.** Per the IA correction, mobile Lobby tab IS
> the sidebar. The current mobile Lobby surface
> (`header / statRow / quickEntryRow / recentActivity`) is removed in
> the same change. Per AGENTS.md, no transitional side-by-side rendering
> is kept.

- [ ] Rewrite `mobile/src/renderer/screens/Lobby.tsx` so its body is the
      three-section sidebar list (My Cats / My Clowders / My Catteries),
      default collapsed
- [ ] Delete the `header / statRow / quickEntryRow / recentActivity`
      content blocks and any helpers that exclusively served them
      (`StatCard`, `QuickEntryChip`, `ActivityRow`, related styles in
      the `StyleSheet.create` block)
- [ ] Update `useMobileLobby` hook to expose
      cats/clowders/catteries summaries; drop fields that only served the
      removed surfaces (`stats`, `recentActivity`, `todayLabel`,
      `quickEntry*` copy) unless used elsewhere
- [ ] Drop now-unused mobile copy keys: `quickEntryTitle`,
      `quickEntryChat`, `quickEntryCode`, `quickEntryWork`,
      `recentActivityTitle`, `emptyRecentActivity` (audit before
      deletion)
- [ ] Add Expo Router screens for entity detail:
  - [ ] `app/(tabs)/cats/[id].tsx`
  - [ ] `app/(tabs)/clowders/[id].tsx`
  - [ ] `app/(tabs)/catteries/[id].tsx`
- [ ] Each screen renders a mobile equivalent of `EntityDetailPane`
      (full-screen tabs)
- [ ] Mobile copy keys (en + zh-TW) for `MY CATS` / `MY CLOWDERS` /
      `MY CATTERIES` section headings and empty-state placeholders
- [ ] Update mobile Lobby tests in `tests/mobile-lobby-i18n.test.ts` and
      any `useMobileLobby` snapshot/state tests

### Phase 6: Clowder & Cattery Implementation

> **Prerequisite**:
> [ADR-100](../decisions/100-cats-as-canonical-identity-with-clowder-and-cattery-as-associations.md)
> + [SPEC-103](../specs/SPEC-103-clowder-and-cattery-data-model.md)
> approved. Until then, `/entities/clowders/:id` and `/entities/catteries/:id` continue to
> render the Phase 1 stub.

- [ ] Approve ADR-100 and SPEC-103 with the user; resolve remaining
      open questions (Cattery temp membership, archive vs delete
      semantics, primary-Cattery affinity field, etc.)
- [ ] Add Core types: `Cat` (existing), `Clowder`, `Cattery`,
      `ClowderMembership`, `CatteryMembership`, `MembershipStatus =
      'formal' | 'temp' | 'external'`
- [ ] Add platform contract entries / payloads exposing the list APIs
      from SPEC-103 §FR 18-20
- [ ] Storage: membership stored as separate normalized records, not as
      embedded arrays (SPEC-103 §Storage)
- [ ] Implement `ClowderHome.tsx`:
  - Header chip: "Part of [Cattery]" or "Cross-unit task force"
  - Tabs (locked): `Cats / Settings`, default = `Cats`
  - Status chips on each Cat row (`formal | temp | external`)
  - `Cats` tab default `statusFilter: 'all'`
- [ ] Implement `CatteryHome.tsx`:
  - Tabs (locked): `Members / Clowders / Cats / Settings`, default
    = `Members`
  - Members tab: direct members only; `statusFilter` accepts
    `all | formal | external` (no `temp` for Cattery, per SPEC-103
    FR-12, 19); default `formal`
  - Clowders tab: derived list `parentCatteryId === thisCattery.id`
  - Cats tab: aggregate (direct + via formal Clowders), deduped by
    catId, with "via [Clowder]" hint; `statusFilter` accepts the full
    Clowder-side set (`all | formal | temp | external | formal_or_temp`)
    because indirect rows can carry any Clowder status; default `formal`
  - Membership status transitions enforce entity-specific rules
    (SPEC-103 FR-21): `temp` involvement rejected at Cattery level
- [ ] Add `Memberships` section to `CatHome.tsx` Overview lens listing
      Clowders + Catteries this Cat is in
- [ ] Membership management UI initial pass: add member, change status,
      remove. Invites / role permissions deferred to a follow-up plan
- [ ] Audit trail: every membership change produces an audit record (reuse
      Activity record family if appropriate; otherwise add Membership-
      specific audit per SPEC-103 §Non-Functional)
- [ ] Tests: list endpoints, dedup logic, statusFilter, expired-temp
      hiding

## Files / Areas Likely Affected

- `src/app/renderer/App.tsx` — route registrations (Phase 1, 4)
- `src/app/renderer/lobby/LobbySidebar.tsx` — new (Phase 4)
- `src/app/renderer/lobby/LobbyCanvas.tsx` — new wrapper (Phase 4)
- `src/app/renderer/PlatformLobby.tsx` — refactor (Phase 4)
- `src/app/renderer/lobbyModel.ts` — extend payload (Phase 4)
- `src/app/renderer/entities/CatHome.tsx` — new (Phase 3)
- `src/app/renderer/entities/ClowderHome.tsx` — new (Phase 6)
- `src/app/renderer/entities/CatteryHome.tsx` — new (Phase 6)
- `src/design/components/EntityDetailPane.tsx` — new shared shell (Phase 3)
- `src/design/components/platform-lobby.css` — sidebar styles (Phase 4)
- `src/app/renderer/productShell/ConversationSidebarMyCats.tsx` — relabel
  (Phase 2)
- `src/app/renderer/productShell/myCatNavigation.ts` — path migration
  (Phase 2)
- `src/products/code/renderer/components/Sidebar.tsx` — drop placeholder
  row (Phase 2)
- `src/products/work/renderer/components/Sidebar.tsx` — same (Phase 2)
- `src/shared/i18n/messageKeys.ts` — new keys (Phase 2, 3, 5)
- `src/shared/i18n/catalogs/en.ts` and `zh-TW.ts` — translations
- `src/products/chat/...` — register `/chat/dm/:catId` route and
  **remove** `/chat/my-cats/:catId` registration (Phase 2; no alias)
- `mobile/src/renderer/screens/Lobby.tsx` — replace body with sidebar-
  as-tab content (Phase 5; old `header / statRow / quickEntryRow /
  recentActivity` removed in same change)
- `mobile/app/(tabs)/cats/[id].tsx` etc. — new screens (Phase 5)
- `tests/platform-shell-sidebar-surface.test.tsx` — update
- `tests/platform-lobby*.test.tsx` — update
- `tests/sidebar-my-cats-navigation.test.tsx` — update path expectations

## Verification

- **Phase 1**: route smoke tests for each new canonical entity route
- **Phase 2**: i18n catalog completeness; sidebar test snapshot updates;
  every former `/chat/my-cats/...` caller now emits `/chat/dm/...` (a
  test that greps the source for `my-cats` to catch stragglers); **404
  assertion** on `/chat/my-cats/:catId` to prove the path no longer
  resolves (replaces the alias-test pattern AGENTS.md forbids)
- **Phase 3**: per-lens render smoke tests; `/entities/cats/:id` standalone page
  renders without `PlatformLobby` mounted; **404 assertion** on
  `/settings/cats/assistants` after the lift to `/settings/assistants`
- **Phase 4**: existing PlatformLobby tests pass for `/lobby` rendering
  LobbyHome (sidebar + hero + products + apps); `LobbyCatRoster` removal
  asserted; **404 assertion** on `/lobby/cat/:id`,
  `/lobby/clowder/:id`, `/lobby/cattery/:id` to prove the
  viewport-route family does not exist; sidebar row click navigates
  away from `/lobby` to canonical entity route
- **Phase 5**: mobile Lobby renders the three new sections; tap
  navigates to canonical entity route; assert that the previous
  `statRow / quickEntryRow / recentActivity` blocks are **no longer
  rendered** (the screen body is now the sidebar list); helpers
  (`StatCard`, `QuickEntryChip`, `ActivityRow`) and dropped i18n keys
  are not imported anywhere
- **Phase 6**: depends on user approval of ADR-100 + SPEC-103 (both
  written and committed; pending sign-off and resolution of their
  remaining open questions)

Per CLAUDE.md, run **only targeted tests** (e.g.
`tests/platform-lobby*.test.tsx`, `tests/sidebar-my-cats-navigation.test.tsx`,
`tests/platform-shell-sidebar-surface.test.tsx`); do not run the full
suite unless explicitly asked.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Missed `/chat/my-cats/...` caller after clean cut → 404 | Medium | Audit checklist + grep test in CI; no alias per AGENTS.md so misses are loud, not silent |
| `LobbyCatRoster` removal disorients existing users | Low | Sidebar provides equivalent + better entry; pre-release product, no public users |
| Sidebar adds visual weight to a previously minimal Lobby | Low | Default-collapsed sections; users opt-in to expand |
| `/settings/cats` vs `/entities/cats/:id` partition unclear | Medium | SPEC-102 §Settings narrows `/settings/cats` to global preferences and lifts `SettingsAssistants` to top-level `/settings/assistants`; `/settings/cats/my-cats` redirects to `/entities/cats` |
| Removing mobile Lobby's `statRow / quickEntryRow / recentActivity` loses discoverability for chat/code/work | Low | Bottom-tab nav already provides product entry; recentActivity can come back as its own surface if needed (out of scope for this plan) |
| Phase 6 (Clowder/Cattery) blocks on ADR-100 + SPEC-103 approval | Medium | ADR-100 + SPEC-103 are written; Phase 6 gated on user sign-off + remaining open questions. Phases 1–5 ship without them; sidebar shows empty state for clowders/catteries until Phase 6 |
| Lobby sidebar duplicates Chat sidebar's Direct Messages | Low | They serve different intents (Lobby = manage, Chat = converse); SPEC-102 §Boundaries makes the distinction explicit |

## Resolved Decisions

- **Phase 4 collapse-state persistence** → `localStorage` only, per
  section. No server-side sync. (Cross-device drift accepted.)
- **Helper rename** → `buildDirectLanePath` becomes
  `buildDirectMessagePath` (file: `myCatNavigation.ts`). Aligns with
  the UI label `Direct Messages`. Internal `direct_lane` term in
  channel topology stays unchanged — the rename is a renderer-level
  facade only.
- **Phase 6 prerequisite docs** → ADR-100 + SPEC-103 (both written;
  pending user review).
- **Lobby URL shape** → only `/lobby` exists; no `/lobby/{type}/:id`
  family. Sidebar row click navigates to canonical entity URL. SPEC-102
  §Resolved Decisions, §Route Shape.
- **Clowder detail tabs** → locked at `Cats / Settings`. SPEC-102 FR-11,
  SPEC-103 §Surface Implications.
- **Cattery vs Clowder status semantics** → entity-specific filter
  values and transitions; Cattery never accepts `temp`. SPEC-103 FR-19,
  21.

## Phase 7+ — IA Correction & Polish (2026-05-05)

> Phase 7 was originally a routine continuation. During implementation
> + review the user steered the IA in several directions that
> deviated from phases 1–6 of this plan and from the original
> SPEC-102 FR list. The shipped behaviour is documented in
> [SPEC-102 §Implementation Status (2026-05-05)](../specs/SPEC-102-lobby-sidebar-ia-and-entity-routes.md#implementation-status-2026-05-05).
> This section is the commit-level log so future readers can
> reconstruct the rationale.
>
> **Don't undo these.** Several of them look like reverts of the
> original spec — they are deliberate.

### Phase 7 — IA correction (lobby = bare landing page)

- [x] `/lobby` reverts to bare landing page (no sidebar). Sidebar
      moves to entity drill-down routes only via the new
      `EntitiesShell` workspace shell.
- [x] `EntitiesShell` reuses the chat appshell primitives:
      `screen claudeShell` outer grid, `LobbyAppShellSidebar` on
      the left, `<main class="canvas">` on the right.
- [x] `LobbyAppShellSidebar` composes `ConversationSidebarNavigation`,
      `ConversationSidebarMyCatsSection` (one per lens kind
      with `data-lens-kind` for per-product placeholder tints),
      `GuideCatDockSlot`, `ConversationSidebarFooter`.
- [x] `PlatformSurfaceSwitcher` learns `activeLabelOverride` so the
      drill-down sidebar trigger reads "Cats Directory" without
      widening `PlatformSurfaceId`.
- [x] Sidebar collapse state persists via the shared
      `cats.sidebar-open` localStorage key
      (`readSidebarOpenPreference` / `writeSidebarOpenPreference`).
- [x] `claudeShellSidebarCollapsed` class flips on
      `EntitiesShell`'s outer div in lockstep with the inner
      `.sidebarCollapsed` so the grid track shrinks 260px → 48px.
- [x] `chat-thread-base.css` is imported into `EntitiesShell` so
      the `.catAvatar` / `.catAvatarBoss` primitives are available
      to the sidebar's `MyCatRowItem`.
- [x] Per-lens-kind placeholder tints (yellow / green / blue) wired
      via `data-lens-kind` overrides in `extras.css`.
- [x] Lobby card on `/lobby` reshaped: three column-cards (CATS /
      CLOWDERS / CATTERIES) with three-row entity lists +
      `{N} TOTAL` red footer. Footer hidden when count === 0;
      avatar stack shows in footer when total > 3. Whole-card
      click target via absolute-positioned `.lobbyEntityCardLink`.
      Cards equal-height via `flex: 1`. Single neutral
      `--muted-soft` accent stripe.
- [x] `Back to Lobby` primary action added to the drill-down sidebar
      (mirrors chat's "+ New chat" slot but as a hover-only nav
      item, no `active` highlight — `/lobby` is never current
      under `EntitiesShell`). Originally landed as `Main page`;
      renamed in the `/entities/*` IA migration.
- [x] Outside-click popover dismissal extracted into shared
      `useSidebarOverflowMenuDismiss` hook so the lobby drill-down
      sidebar gets the same behaviour `useAppChrome` provides
      chat / code / work.
- [x] `MY CATS` row "..." popover gains a "Direct message"
      entry (above a divider) on the lobby drill-down sidebar
      (chat keeps Archive only because its row click is already
      the direct lane).
- [x] Lobby cat row "..." → Archive runs an actual archive flow
      (`window.confirm` + `updateCatProfile(catId, { archive: true })`
      + `window.location.reload()` so the platform envelope
      refreshes).
- [x] Boss-first sort applied to lobby card + lobby drill-down
      sidebar; `chat-thread-base.css` `.catAvatarBoss` rule is the
      single source of the gold ring.

### Phase 8 — Direct Messages section opt-in

- [x] `ConversationSidebar.tsx` `showMyCatsSection` becomes
      opt-in (`forceShowMyCatsSection || myCatsEmptyStatePlaceholder
      != null`). Code / Work no longer auto-render the Direct
      Messages section just because `payload.chat.cats.length > 0`.
- [x] Settings sidebar regression fix: Assistants nav button moved
      back inside the `CATS` group div for the visual indent
      (route stays `/settings/assistants`).
- [x] `/settings/cats/my-cats` redirect retargeted back to
      `/settings/cats` (revert of phase-3 change).

### Phase 9 — Platform-shell DM path migration follow-through

- [x] `buildMyCatPathForPrefix`, `resolveWorkspaceMyCatsPathPrefix`,
      `buildWorkspaceMyCatPath`, `WorkspaceAppRoutes`'s
      `<Route path="my-cats/:catId">`, and
      `useWorkspaceLocationState`'s `useMatch` all migrate from
      `/{prefix}/my-cats/:catId` to `/{prefix}/dm/:catId` to
      match the chat product's phase-2 path migration. Helper
      / constant names retain `MyCats` (the shared-agent concept
      per ADR-065) but URLs are `/dm/`.
- [x] Chat sidebar's row click resolves to `/chat/dm/:catId`
      again — was breaking after the chat product moved to
      `useWorkspaceAppNavigationActions`'s shared shell because
      the shared helper still emitted `/my-cats/`.

### Phase 10 — Cats canvas at `/entities/cats`

- [x] Copy entire `src/products/shared/renderer/components/settings-cats/`
      tree to `src/products/shared/renderer/components/cats/`,
      sed-rename internal `SettingsCats*` / `settingsCats*`
      identifiers to `Cats*` / `cats*`. External hooks (still
      named `useSettingsCats*`), i18n keys, and CSS class names
      kept on their original names. Both directories coexist.
- [x] New `src/app/renderer/entities/CatsCanvasPage.tsx`. Mounted
      at `/entities/cats` inside `EntitiesShell`. Fetches `AppShellPayload`
      via `fetchAppShell()`, owns local `useState` for payload /
      busy / feedback. Renders `<WorkspaceCatsCanvas>` (the
      copied canvas).
- [x] Imports `products/shared/renderer/styles/settings.css` so
      the canvas chrome renders correctly outside the Settings
      shell.

### Phase 11 — CompanionWorkspace at `/entities/cats/:catId`

- [x] Copy `src/products/chat/renderer/components/companion/` (7
      components) to `src/app/renderer/entities/companion/` plus
      4 `useCompanion*` hooks to
      `src/app/renderer/entities/companion/hooks/`. Sed-rewrite
      import paths for the new depth; chat-product types / API /
      utils still pulled from their original location.
- [x] Platform copy of `CompanionWorkspace` gains two opt-in
      props: `hideFeed?: boolean` (suppresses `<CompanionFeed>`
      Post / Photo region) and `hideCompanionToggle?: boolean`
      (drops the back-to-chat `<CompanionModeToggleChip>`).
- [x] New `src/app/renderer/entities/CatProfilePage.tsx`. Mounted
      at `/entities/cats/:catId` (replaces the previous `<CatHome>` wiring
      on that route). Reads `:catId`, fetches `AppShellPayload`,
      finds the cat, renders `<CompanionWorkspace>` with
      `hideFeed = !hasCompanionSkill(cat)` and
      `hideCompanionToggle` always. Imports `chat-companion.css`.
- [x] Avatar saves call `updateCatProfile` + refetch; wake / sleep
      stay stubbed (chat product owns the session-lifecycle pipeline).

### Phase 12 — Sort, label, profile-button polish

- [x] `PlatformLobbyCatSummary` gains required `createdAt: string`
      (carried by `chat/state/shell.ts buildLobbyCats`).
- [x] Lobby card + lobby drill-down sidebar sort: Boss-first,
      tiebreak by `createdAt` ascending.
- [x] Chat sidebar primary action labels Title-Case
      (`New Chat` / `Group Chat` / `Parallel Chat` / `New Work` /
      `Team Work` / `Parallel Work`). Chinese unchanged.
- [x] Chat sidebar DIRECT MESSAGES section becomes opt-in on
      `cats.length > 0`; legacy "+ New cat" placeholder removed
      permanently.
- [x] Chat sidebar sort flips to `sortChatCatsByRecency(cats,
      channels)` — direct-lane channel `lastActivatedAt` desc,
      fallback to `cat.createdAt`. No boss-cat pin (lobby-only
      concern now).
- [x] Chat sidebar Archive popover renamed to **Clear**: deletes
      the cat's direct-lane channel via new
      `useWorkspaceAppNavigationActions.onClearDirectLane(catId,
      channelId)` (same delete API as `onDeleteChannel` but
      navigates to `/chat/dm/:catId` so the route renders
      `NewChatDraft`). Confirmation uses the app-level
      `<ConfirmDialog>` (new `WorkspaceProductSidebarProps.confirmDialog`
      plumbing).
- [x] In-line companion-mode toggle removed from
      `chat/AppRoutes.tsx` `dm/:catId` route + ChatView's
      `renderTopBarExtraActions`.
- [x] `NewChatDraft` direct-lane variant: avatar + cover read-only
      via `DraftHeader.readOnlyVisuals`. Header `actions` slot
      carries an eye-icon "View cat profile" button (label key
      `chatNewChatDraft.viewCatProfileAction`) that navigates
      `/entities/cats/:catId`.
- [x] `ChatViewTopBar` gains `onOpenCatProfile?: () => void`. On
      direct-lane channels `ChatView` wires it via `useNavigate`
      → `/entities/cats/:catId`. Renders an eye-icon button left of the
      side-panel toggle.

### Phase 13 — `/entities/*` IA retreat + surface label rename (2026-05-05)

> The earlier phases shipped entity routes flat at the URL root
> (`/cats`, `/clowders`, `/catteries`). Phase 13 retreats them all
> under a single `/entities/` namespace so the routing layer
> reserves the prefix once instead of three times, and so product
> manifests can no longer accidentally shadow an entity route.
> Clean cut per AGENTS.md — no aliases, all callers flip together.

- [x] Web URL migration (kept `/settings/cats` and `/settings/cats/new` untouched per scope):
      - `/cats`, `/cats/:catId`, `/cats/:catId/:lens` → `/entities/cats…`
      - `/clowders`, `/clowders/:clowderId(/:tab)?` → `/entities/clowders…`
      - `/catteries`, `/catteries/:catteryId(/:tab)?` → `/entities/catteries…`
      - Bare `/entities` redirects to `/lobby` (mirrors the existing
        `/products` → `/lobby` pattern; no dedicated `/entities` index
        page exists yet).
- [x] `PLATFORM_ENTITY_PATH_PREFIXES` collapses to `[ENTITIES_PATH]`
      so `isPlatformEntityPath` only checks one prefix. New
      `PLATFORM_ENTITY_KIND_PATHS` map exposes the per-kind paths
      for callers that need them.
- [x] Surface label rename: `entitiesShellSurfaceLabel`
      "Cats Lobby" → "Cats Directory" (en + zh-TW).
- [x] Sidebar primary action rename: `lobbySidebar.mainPage`
      "Main page" → "Back to Lobby" (en) / "回大廳" (zh-TW).
- [x] All caller migrations: `LobbyAppShellSidebar.tsx` route
      flags + click handlers, `PlatformLobby.tsx` `routePath` /
      `detailPathPrefix` types and literal values,
      `CatProfilePage.tsx`, `CatsListPage.tsx`, `CatHome.tsx`,
      `CatteryHome.tsx`, `ClowderHome.tsx`, `EntityCanvasPages.tsx`
      `routePath` / `href` builders, `App.tsx` route registrations,
      `ChatNewChatDraft.tsx`, `ChatView.tsx`, plus doc comments in
      `CatsCanvasPage.tsx`, `CompanionWorkspace.tsx`,
      `ChatViewTopBar.tsx`, `platform-lobby.css`.
- [x] Test fixtures updated: `entities-shell-route`,
      `platform-route-paths`, `platform-routing`,
      `app-package-routes` (collision fixture flips to `/entities`),
      `cat-home-route`, `cats-list-page`,
      `clowder-cattery-home-routes`. The `app-package-routes`
      collision test now exercises the new single-prefix reservation.
- [x] Mobile expo-router file-system routes
      (`mobile/app/(tabs)/cats/[id].tsx` etc.) intentionally
      **not** moved — different routing tree, no cross-references
      with the web React Router URLs. If mobile rail navigation
      ever becomes URL-shared with web, that's a separate plan.
- [x] Holdout: `/entities/cats` vs `/settings/cats` final split
      stays as documented in §Open follow-ups — `/settings/cats`
      keeps the Settings canvas + `/settings/cats/new` cat creation
      flow until that decision lands.

### Open follow-ups

- [ ] **Decide on `/settings/cats` removal.** The Settings canvas
      at `/settings/cats` is duplicated by `/entities/cats`'s
      `CatsCanvasPage` mount. Removing `/settings/cats` cleanly
      requires either:
      - Deleting `/settings/cats/new` too and giving cat creation
        a new entry point (e.g. `/entities/cats/new` route on
        `CatsCanvasPage`, or a dedicated `+ New cat` modal), or
      - Keeping `/settings/cats/new` as a hidden (no sidebar
        entry) creation route and removing only `/settings/cats`
        + `/settings/cats/my-cats`. Settings sidebar's CATS group
        + My Cats row would need to be removed; Assistants
        un-indents to align with the rest of the settings entries.
- [ ] **`CatHome` cleanup.** `src/app/renderer/entities/CatHome.tsx`
      no longer mounts (`/entities/cats/:catId` renders `CatProfilePage`).
      It can be deleted along with `/entities/cats/:catId/:lens` route
      handling, or kept as scaffolding for a future entity-lens
      revival.
- [ ] **Wake / sleep on `CatProfilePage`.** Currently stubbed —
      the chat product owns the session-lifecycle pipeline. Need
      a platform-level entry point or proxy to chat's
      `useCompanionPresence`-driven flow.
- [ ] **Old `chat/renderer/components/companion/` cleanup.** The
      original chat-internal companion folder still exists alongside
      the platform copy. Once the platform copy is the only mount
      site (which it is — chat's `dm/:catId` no longer renders
      `<CompanionWorkspace>`), the chat-internal copy can be
      deleted to avoid drift. Same for
      `src/products/shared/renderer/components/settings-cats/` once
      `/settings/cats` is decided.

## Open Questions

- [ ] Should there be a `+ New Cat` modal that's reachable from both
      Lobby sidebar and `/entities/cats` list page, or two separate flows?

## References

- [ADR-099](../decisions/099-promote-cats-clowders-catteries-to-platform-entities.md)
- [ADR-100](../decisions/100-cats-as-canonical-identity-with-clowder-and-cattery-as-associations.md)
- [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [ADR-098](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md)
- [SPEC-064](../specs/SPEC-064-my-cats-platform-home-and-lens-projections.md)
- [SPEC-102](../specs/SPEC-102-lobby-sidebar-ia-and-entity-routes.md)
- [SPEC-103](../specs/SPEC-103-clowder-and-cattery-data-model.md)

---

*Created: 2026-05-04*
*Author: Claude*
