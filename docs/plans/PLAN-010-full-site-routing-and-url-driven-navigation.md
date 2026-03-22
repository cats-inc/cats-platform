# PLAN-010: Full-Site Routing and URL-Driven Navigation

Status: Implemented

## Scope

Implement the routing model defined in
[SPEC-010](../specs/SPEC-010-full-site-routing-and-url-driven-navigation.md).

This plan covers the renderer route foundation needed for:

- routeable chats
- routeable settings
- browser history and deep-link support
- future expansion into `Cats Work` and tool-oriented surfaces

This plan is explicitly **not** a visual redesign plan.

## Hard Constraints

- Do not change UI style.
- Do not change layout.
- Do not rename CSS classes just to match routing terminology.
- Do not treat router work as permission to reorganize navigation chrome.
- Keep DOM structure changes minimal and only where route wiring requires them.
- Do not require a full data-layer rewrite in the same slice.

## Phases

### Phase 1: Route Contract Freeze

- [ ] Freeze the initial public page route families:
      - `/`
      - `/chats`
      - `/chats/:channelId`
      - `/new`
      - `/new?cat=<catId>` as a stable Cat-private draft qualifier
      - `/settings`
      - `/settings/cats`
- [ ] Freeze the reserved future route families:
      - `/work`
      - `/work/projects`
      - `/work/projects/:projectId`
      - `/work/tasks/:taskId`
      - `/tools/:toolId`
- [ ] Document URL ownership rules:
      route beats preferences when both exist.
- [ ] Decide redirect behavior for `/` and invalid entity routes.

**Deliverables**: approved route map and URL policy.

### Phase 2: Router Foundation

- [ ] Add a real client-side router foundation, preferably path-based.
- [ ] Wire the renderer entrypoint to the router.
- [ ] Preserve current static asset/deep-link behavior in dev and built mode.
- [ ] Keep current visual shell intact while routing is introduced.

**Deliverables**: route-capable renderer shell without UI redesign.

### Phase 3: Chats Route Migration

- [ ] Move chat overview/current-chat navigation onto `/chats` and
      `/chats/:channelId`.
- [ ] Make sidebar chat selection navigate by URL instead of only mutating local
      view state.
- [ ] Keep `selectedChannelId` as a fallback/default when the URL does not name
      a channel.
- [ ] Define behavior for unknown channel ids.

**Deliverables**: route-driven chat selection and deep-linkable chat pages.

### Phase 4: Settings Route Migration

- [ ] Move the current settings surface onto `/settings`.
- [ ] Make the cats registry/settings section addressable via `/settings/cats`.
- [ ] Keep existing layout and settings shell visuals unchanged.
- [ ] Ensure reload and direct entry work for settings routes.

**Deliverables**: route-driven settings entry with no visual refresh.

### Phase 5: Route-State Cleanup

- [ ] Reduce duplicated view-state booleans where the route already expresses
      the active surface.
- [ ] Keep transient UI state local if it does not belong in the URL.
- [ ] Audit which state is still route-worthy versus purely presentational.
- [ ] Confirm that `selectedChannelId` is now a default/fallback, not a hidden
      competing source of truth.

**Deliverables**: cleaner boundary between route state and local UI state.

### Phase 6: Validation and Documentation

- [ ] Add tests for direct entry to `/chats`, `/chats/:channelId`, and
      `/settings/cats`.
- [ ] Add tests for browser-history navigation if test tooling allows it; if
      not, document the manual verification steps explicitly.
- [ ] Update docs to explain that RESTful API routes and renderer page routes
      are separate layers.
- [ ] Document the reserved future route families for `Cats Work` and tools.

**Deliverables**: verified route behavior and aligned documentation.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `package.json` | Possibly update | Add router dependency if `react-router-dom` is adopted |
| `src/renderer/main.tsx` | Modify | Mount router provider at the app entrypoint |
| `src/renderer/App.tsx` | Refactor carefully | Replace ad hoc surface/view switching with route-driven branches |
| `src/renderer/api.ts` | Review | Ensure selection/default logic works with route-driven channel identity |
| `src/server.ts` | Verify or adjust lightly | Preserve SPA fallback and deep-link safety for built mode |
| `src/shared/app-shell.ts` | Review | Clarify whether selection fields are route defaults or current-location state |
| `docs/architecture.md` | Update | Record renderer routing direction explicitly |
| `docs/api.md` | Update | Clarify that API resources and browser routes are different concerns |
| `tests/` | Expand | Cover deep-link and route-navigation behavior where practical |

## Validation

- Visiting `/new` opens the new-chat draft and survives refresh.
- Visiting `/new?cat=<catId>` opens a Cat-private draft lane and survives
  refresh without auto-creating a persisted thread.
- Visiting `/` redirects to `/setup` before initialization and to `/new` after setup.
- Visiting `/setup` after setup redirects to `/new`.
- Visiting `/chats` resolves to the last selected chat or `/new`.
- Visiting `/chats/:channelId` opens the named chat when it exists.
- Selecting a chat updates the browser URL.
- Visiting `/settings/cats` opens the cats settings section directly.
- Refreshing a valid route preserves the current surface.
- Browser back/forward works for route-driven navigation.
- No UI style/layout regression is introduced as part of the route work.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Routing work expands into a stealth navigation redesign | High | Enforce the no-style/no-layout constraint in implementation and review |
| Route state and legacy local state fight each other | High | Define URL-authoritative rules before wiring behavior |
| `selectedChannelId` remains a hidden second source of truth | Medium | Restrict it to default/fallback semantics when no route id exists |
| Deep links work in dev but fail in built mode | High | Verify server fallback explicitly during implementation |
| Route structure locks future Work surfaces into awkward paths | Medium | Reserve future route families up front and review them before coding |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement SPEC-010 / PLAN-010. Add path-based renderer routing so chats,
> settings, and future suite surfaces are URL-driven. Make `/chats`,
> `/chats/:channelId`, `/settings`, and `/settings/cats` the first real page
> routes. Keep the current UI style, layout, class names, and overall DOM
> structure intact. Do not turn this into a visual redesign. Treat
> `selectedChannelId` as a fallback/default when the URL does not specify a
> channel.

---

*Last updated: 2026-03-23*
