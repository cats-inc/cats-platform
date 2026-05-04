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
- New canonical entity routes: `/cats/:id`, `/clowders/:id`,
  `/catteries/:id` (+ tab/lens children)
- New `LobbySidebar` and `EntityDetailPane` components
- Chat sidebar rename `MY CATS` → `Direct Messages`, path migration to
  `/chat/dm/:catId`
- Removal of empty `My Clowders` / `My Catteries` placeholder rows from
  Code/Work sidebars
- Mobile Lobby tab extension (three new sections)
- Web Lobby canvas reshaping (sidebar + canvas, removal of
  `LobbyCatRoster`)
- Standalone entity pages for deep-links

Out of scope (deferred to follow-up SPECs):
- Full Clowder/Cattery data model and registry (Phase 6 prerequisite)
- Membership management business logic (invites, roles)
- Cross-product Code/Work lens implementation (SPEC-064 follow-up)
- Tablet-specific mobile layout
- Recent-cats compressed roster (replacement for removed
  `LobbyCatRoster`)

## Phases

### Phase 1: Land Design Artifacts and Canonical Routes (Stub UI)

- [ ] Land ADR-099, SPEC-102, this PLAN — review with user
- [ ] Add canonical routes to `src/app/renderer/App.tsx`:
  - [ ] `/cats/:catId` → temporary `<EntityComingSoon kind="cat" />`
  - [ ] `/clowders/:clowderId` → `<EntityComingSoon kind="clowder" />`
  - [ ] `/catteries/:catteryId` → `<EntityComingSoon kind="cattery" />`
- [ ] No sidebar changes yet; no path migration yet (kept for Phase 2 so
      callers all flip together — see Phase 2 note)
- [ ] Smoke tests:
  - [ ] visiting `/cats/abc` renders without crash
  - [ ] visiting `/clowders/abc` and `/catteries/abc` likewise

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
- [ ] Wire `/cats/:catId` to render standalone page wrapping
      `EntityDetailPane` + `CatHome`
- [ ] Wire `/cats/:catId/:lens` for explicit lens deep-links (overview |
      chat | work | code)
- [ ] Move `SettingsAssistants` from `/settings/cats/assistants` to
      top-level `/settings/assistants` (clean cut — old path removed in
      the same change, per AGENTS.md). Update
      `PlatformSettingsRoutes.tsx`, settings navigation entries, and any
      deep-links
- [ ] `/settings/cats/my-cats` redirect (currently → `/settings/cats`)
      retargets to `/cats`
- [ ] Smoke tests for each lens path
- [ ] Smoke test that `/settings/assistants` renders the assistants form
      and that `/settings/cats/assistants` is no longer registered

### Phase 4: LobbySidebar + Lobby Canvas Reshape

- [ ] New `src/app/renderer/lobby/LobbySidebar.tsx` (3 collapsible
      sections fed by Lobby envelope payload — augment
      `lobbyModel.ts` to expose cats/clowders/catteries summaries)
- [ ] Refactor `PlatformLobby.tsx` into a 2-column layout:
  - left: `LobbySidebar`
  - right: `LobbyCanvas` (renders LobbyHome content if no entity selected,
    or `EntityDetailPane` if an entity route is mounted as a child)
- [ ] Sidebar interaction: clicking a row navigates to the canonical
      entity URL (`/cats/:catId`, `/clowders/:clowderId`,
      `/catteries/:catteryId`). The user **leaves** `/lobby`. There is
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
  - [ ] `/cats/:id` (standalone) mounts EntityDetailPane without Lobby
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
> approved. Until then, `/clowders/:id` and `/catteries/:id` continue to
> render the Phase 1 stub.

- [ ] Approve ADR-100 and SPEC-103 with the user; resolve their open
      questions (Clowder Members-vs-Cats tab collapse, Cattery temp
      membership, etc.)
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
- **Phase 3**: per-lens render smoke tests; `/cats/:id` standalone page
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
- **Phase 6**: depends on follow-up SPEC

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
| `/settings/cats` vs `/cats/:id` partition unclear | Medium | SPEC-102 §Settings narrows `/settings/cats` to global preferences and lifts `SettingsAssistants` to top-level `/settings/assistants`; `/settings/cats/my-cats` redirects to `/cats` |
| Removing mobile Lobby's `statRow / quickEntryRow / recentActivity` loses discoverability for chat/code/work | Low | Bottom-tab nav already provides product entry; recentActivity can come back as its own surface if needed (out of scope for this plan) |
| Phase 6 (Clowder/Cattery) has no data model yet | High | Phase 6 gated on a follow-up SPEC; Phases 1–5 ship without it; sidebar shows empty state for clowders/catteries until Phase 6 |
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

## Open Questions

- [ ] Should there be a `+ New Cat` modal that's reachable from both
      Lobby sidebar and `/cats` list page, or two separate flows?

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
