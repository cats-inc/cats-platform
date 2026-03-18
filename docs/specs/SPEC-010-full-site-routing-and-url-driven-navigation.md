# SPEC-010: Full-Site Routing and URL-Driven Navigation

Status: Draft (Pending Review)

## Summary

`cats-inc` now has a more RESTful product API, but the renderer still behaves
like a single-shell app driven mostly by in-memory UI state plus a server-side
`selectedChannelId`.

That is acceptable for the current phase-2 chat shell, but it is not a good
fit for the planned suite shape:

- `Cats Chat` needs stable, deep-linkable chat URLs
- `Settings` should be addressable directly
- future `Cats Work` surfaces need their own route families
- browser history, reload, bookmarking, and external links should work the way
  users expect from modern web apps

This spec defines a route-first navigation model for the renderer. The purpose
is not visual redesign. The purpose is to make URL location a first-class part
of the product contract.

## Problem Statement

Today:

- the renderer has no client-side router
- chat selection is handled as a preference mutation rather than a page
  navigation concept
- the browser URL does not identify the active chat, settings section, or
  future work surface
- browser back/forward behavior cannot represent normal product navigation

This creates three problems:

1. Deep links are not possible.
2. Future Chat and Work information architecture will be harder to extend.
3. RESTful resource APIs and page navigation remain conflated in product
   discussions even though they are separate concerns.

## Goals

- Make URL location authoritative for top-level surface navigation.
- Make URL location authoritative for major entity selection such as the active
  chat channel.
- Support direct entry, reload, bookmarking, and browser history navigation for
  routeable surfaces.
- Preserve the current visual design, layout, and DOM structure as much as
  possible.
- Keep the route model compatible with both current `Cats Chat` scope and
  future `Cats Work` scope.
- Keep the server-side `selectedChannelId` concept only as a fallback/default
  behavior when the URL does not already name a channel.

## Non-Goals

- A visual redesign
- A CSS rewrite
- A mandatory split of `App.tsx` into many route components in the first slice
- Replacing the current app-shell bootstrap in the same slice
- Encoding every transient UI state in the URL
- Shipping full `Cats Work` features as part of the initial router work

## Core Decisions

### RESTful API and Browser Routing Are Separate Layers

The REST migration defines how the renderer and other clients talk to product
resources.

Browser routing defines how a human-facing page location maps to product
surfaces and entities.

The app should support both:

- resource-oriented API routes such as `/api/channels/{channelId}`
- human-facing page routes such as `/chats/{channelId}`

One does not replace the other.

### Path-Based Routing Is the Target

The canonical navigation model should use normal path-based routes, not
hash-based routing.

Reasoning:

- the product server already has SPA fallback behavior for non-API GET routes
- path-based URLs are cleaner and more durable
- future Chat and Work route families should read like a real app structure

`HashRouter` is only a fallback option if a future desktop-hosting constraint
forces it. It is not the preferred product model.

### URL Owns Location; Preferences Provide Defaults

If the URL explicitly identifies a surface or entity, the URL wins.

Examples:

- `/chats/abc123` opens channel `abc123`
- `/settings/cats` opens the cats settings section
- `/work/projects/roadmap` opens that project when such a surface exists

If the URL does not identify an entity, server-side preferences may still help
choose a default.

Examples:

- `/chats` may open the last selected channel or the chat overview
- `/settings` may open a default settings subsection

This keeps deep links stable without throwing away useful persisted defaults.

## Route Policy

### Initial Required Route Families

The routing foundation must support these route families first:

- `/`
- `/chats`
- `/chats/:channelId`
- `/settings`
- `/settings/cats`

### Reserved Future Route Families

The route architecture must be able to grow cleanly into:

- `/work`
- `/work/projects`
- `/work/projects/:projectId`
- `/work/tasks/:taskId`
- `/tools/:toolId`

These future routes do not all need to ship immediately, but the initial router
should not paint the app into a corner where Chat and Work compete for the same
state machine.

### URL State Rules

The following state belongs in the URL:

- top-level surface selection
- active chat channel identity
- stable settings subsection identity
- future project/task/tool identity where direct entry matters

The following state should stay out of the URL unless a later spec explicitly
promotes it:

- sidebar open/closed state
- account menu state
- popover state
- overflow menu state
- composer draft text
- one-off modal state

Query parameters may be used later for stable filters or sort modes, but path
segments should carry the primary page identity.

## Functional Requirements

### Chat Navigation

- Selecting a chat from the sidebar shall update the browser URL to
  `/chats/{channelId}`.
- Entering `/chats/{channelId}` directly shall load and display that chat if it
  exists.
- Entering `/chats` without a channel id shall resolve to either:
  - the preferred channel from persisted preferences, or
  - the chat overview/new-chat state
- Browser back/forward shall move between previously visited chats.

### Settings Navigation

- Entering settings shall update the URL to `/settings` or a concrete settings
  subsection.
- The cats registry/settings view shall be directly addressable by
  `/settings/cats`.
- Reloading a settings URL shall keep the user on the same settings surface.

### Deep-Link Safety

- Reloading a valid app route shall continue to work in dev and built mode.
- Unknown routes shall produce a controlled in-app not-found behavior or a safe
  redirect policy.
- Unknown entity ids such as a missing channel id shall not silently open a
  different entity without user-visible handling.

## Implementation Direction

### Preferred Router Approach

The preferred implementation approach is a real client-side router, such as
`react-router-dom`, using path-based navigation.

Reasoning:

- the app is expected to grow beyond one shell
- `Cats Chat` and `Cats Work` need explicit route families
- browser history integration should not be reimplemented ad hoc unless there is
  a strong reason

### Data Model Transition

The current app-shell bootstrap may remain during the first routing slice.

That means the first implementation may still:

- fetch `GET /api/app-shell` during bootstrap
- use the shell payload to hydrate route views
- continue to mutate product state through product APIs

But selection and page identity should progressively move from ad hoc UI state
to route-driven state.

### Selected Channel Semantics

The current `selectedChannelId` preference should become a fallback/default,
not the primary source of truth for an explicitly routed chat.

Accepted behavior:

- URL with `channelId` present: route is authoritative
- no `channelId` in URL: preference may provide the default

## Hard Constraints

The following are strict constraints for implementation:

- Do not change the visual style.
- Do not change layout structure for cosmetic reasons.
- Do not rename CSS classes as part of the routing work.
- Do not treat routing work as permission to redesign navigation chrome.
- Keep DOM changes minimal and only where wiring a route boundary truly
  requires them.

## Acceptance Criteria

- The app has explicit route families for chats and settings.
- Selecting a chat changes the browser URL.
- Directly visiting a chat URL opens that chat.
- Refreshing a valid deep link keeps the user on the same app surface.
- Browser back/forward works for routeable navigation.
- The app preserves the current visual design and layout during the routing
  migration.
- The route model leaves clean room for future `Cats Work` and tool surfaces.

## Open Questions

- Should `/` immediately redirect to `/chats`, or should it remain a shell entry
  that resolves via preferences first?
- Should invalid entity routes render an in-app not-found state, or redirect to
  the nearest safe parent route such as `/chats`?
- How much route component splitting is worth doing in the first slice versus
  keeping a single `App.tsx` with route-driven branches?
- Should future provider/tool-specific pages live under `/tools/*`, `/work/*`,
  or another dedicated family?

## References

- [PLAN-010](../plans/PLAN-010-full-site-routing-and-url-driven-navigation.md)
- [SPEC-009](./SPEC-009-public-surface-naming-refresh.md)
- [PLAN-009](../plans/PLAN-009-public-surface-naming-refresh.md)
- [SPEC-008](./SPEC-008-restful-product-api-refactor.md)
- [PLAN-008](../plans/PLAN-008-restful-product-api-refactor.md)
- [Architecture](../architecture.md)

---

*Last updated: 2026-03-18*
