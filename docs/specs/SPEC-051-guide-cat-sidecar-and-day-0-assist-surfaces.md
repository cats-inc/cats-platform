# SPEC-051: Guide Cat Sidecar and Day-0 Assist Surfaces

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats-platform` already supports optional `Guide Cat` creation during setup and
routes setup completion into `/lobby`. What is still missing is the first
visible, persistent day-0 assist surface after setup.

This spec defines that missing surface as a platform-level `Guide Cat` sidecar:

- visible immediately after setup when Guide Cat exists
- attached to the left side of Lobby and later product canvases
- persistent across host route changes
- explicit about when help stays in the sidecar versus when it promotes into a
  product-native conversation

This spec is a follow-on to [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md).
SPEC-049 established that Guide Cat is the optional first helper and that users
should receive help from day 0. This spec defines the first persistent visible
consumption surface for that requirement.

## Goals

- make day-0 assistance visible immediately after setup when Guide Cat exists
- preserve `/lobby` as the first post-setup route instead of forcing a jump
  into `Chat`
- give `Guide Cat` one cross-product host-owned surface across `Lobby`,
  `Chat`, `Work`, and `Code`
- place the assistant where it will not collide with product-owned right-side
  inspector/detail panels
- keep Guide Cat as a platform helper by default, not an automatic Chat direct
  lane
- support explicit escalation from sidecar help into product-native work when
  the user wants deeper continuity

## Non-Goals

- implementing the full generalized `entity` / `participant` migration
- deciding that Guide Cat must appear immediately in the Chat cat registry
- replacing product-owned right-side panels with Guide Cat
- building a complete autonomous onboarding workflow engine in the first slice
- requiring background suggestion generation before any sidecar can render
- forcing the sidecar to be visible on every screen forever after the first run

## User Stories

- As a new owner, I want to see Guide Cat immediately after setup so I know the
  platform can help me from day 0.
- As a new owner, I want that help to appear without being thrown out of Lobby
  into a product-specific route.
- As an owner, I want the same helper to remain available in Chat, Work, and
  Code so I do not have to rediscover it in each product.
- As an owner, I want to collapse or dismiss the helper when I want space to
  work on my own.
- As a product developer, I want one platform-shell assistant surface so Guide
  behavior does not fork into separate per-product onboarding widgets.

## Requirements

### Functional Requirements

1. If setup completes with `guideCat != null`, the first render of `/lobby`
   shall expose a visible Guide Cat sidecar affordance.
2. The first visible state after setup shall be more prominent than a passive
   icon-only state.
3. The sidecar shall belong to the platform shell rather than to a single
   product route.
4. The sidecar shall be available on:
   - `/lobby`
   - `/chat/*`
   - `/work/*`
   - `/code/*`
5. The sidecar shall dock on the left side of the active host content region.
6. The sidecar shall not occupy the right-side inspector/detail region used by
   product-native panels.
7. The sidecar shall support at least these view states:
   - hidden
   - collapsed
   - welcome-peek
   - open
8. The first post-setup Lobby entry with Guide Cat shall default to
   `welcome-peek` or `open`.
9. The sidecar shall allow the user to close or collapse it without deleting
   Guide Cat.
10. The platform shall persist enough view state so first-run visibility does
    not reappear as a blocking experience on every return to Lobby.
11. The sidecar shall render an initial greeting plus quick actions; it shall
    not require an empty transcript as the only first-open state.
12. The first quick-action set shall be contextual to day-0 onboarding, such
    as:
    - create first chat
    - create first cat
    - explain Chat / Work / Code
    - hide for now
13. The sidecar shall know the active surface and route context so later
    guidance can adapt to Lobby vs Chat vs Work vs Code.
14. The first slice shall keep Guide Cat sidecar conversations distinct from
    Chat direct lanes by default.
15. If the user wants longer-form follow-through, the sidecar shall support an
    explicit promotion path into a product-native surface such as `Open in Cats Chat`.
16. Setup completion shall continue to route to `/lobby`; Guide Cat presence
    shall not override that route.
17. If `guideCat == null`, the sidecar shall not auto-appear.
18. The first slice may reuse deterministic quick actions and canned greeting
    content before runtime-backed response generation is added.
19. The sidecar shall tolerate runtime unavailability; Guide Cat absence or
    runtime failure must degrade into local UI/help states rather than breaking
    navigation.
20. Product transitions from Lobby into Chat, Work, or Code shall preserve
    Guide sidecar state when technically feasible inside the current host
    renderer lifecycle.
21. On narrow layouts where a fixed left dock is not viable, the sidecar shall
    fall back to an overlay or bottom-sheet style without changing its product
    meaning.

### Non-Functional Requirements

- **Continuity**: the sidecar should feel like one cross-product assistant, not
  four independent widgets
- **Clarity**: the user should always understand whether they are in a temporary
  sidecar assist view or a product-native conversation
- **Non-intrusiveness**: first-run assistance should be visible, but later
  state should respect dismissal/collapse preferences
- **Layout safety**: the sidecar must not obscure core navigation or collide
  with right-side inspector space
- **Responsiveness**: the feature must remain usable on smaller widths where a
  docked left rail cannot stay permanently open

## Design Overview

```text
setup complete with guideCat
    |
    +--> route to /lobby
            |
            +--> platform shell mounts Guide Cat sidecar
                    |
                    +--> initial state = welcome-peek/open
                    +--> greeting + quick actions
                    +--> collapse/hide supported
                    +--> route changes keep sidecar alive when possible
                    +--> explicit "Open in Cats Chat" handoff when deeper work is needed
```

## Surface Model

### Lobby

- The sidecar is the primary visible day-0 assist surface.
- It should appear attached to the left side of the Lobby content region.
- It should not replace the Lobby itself; the user still lands on the host
  landing screen.

### Chat / Work / Code

- The sidecar remains available from the same left-side host position.
- It should sit to the left of the main canvas region rather than competing
  with existing right-side product panels.
- It may offer surface-specific quick actions based on the current route.

## Conversation and Handoff Model

### Sidecar-Local Help

The first slice treats the sidecar as a host-owned assist surface:

- visible guidance
- quick actions
- short conversational exchanges
- cross-surface continuity

### Product-Native Promotion

When the user wants deeper work, the sidecar may hand off into a product-native
surface through an explicit action such as:

- `Open in Cats Chat`
- `Create a Work item from this`
- `Open this in Cats Code`

The user must be able to tell when such a promotion happens.

## Suggested State Additions

The first slice should introduce host-owned view state such as:

- `guideSidecarState: 'hidden' | 'collapsed' | 'welcome_peek' | 'open'`
- `guideSidecarFirstSeenAt`
- `guideSidecarDismissedAt`
- optional `guideSidecarLastSurface`

This state should live with platform-owned preferences or host shell state, not
inside product-specific chat state.

## Dependencies

- persisted `guideCat` platform state from setup
- host-owned `/lobby` routing from [SPEC-046](./SPEC-046-platform-product-landing-and-installed-apps.md)
- Guide Cat terminology and platform-helper role from [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- route-stable platform shell capable of rendering cross-surface UI

## Open Questions

- [ ] Should the first slice support true runtime-backed conversational replies
      in the sidecar, or start with deterministic greeting + quick actions plus
      a later runtime integration?
- [ ] Should the sidecar preserve its exact open/collapsed state across app
      restarts, or only within the current app session?
- [ ] Should `Open in Cats Chat` create a dedicated Guide thread, a guide-owned
      direct lane, or a normal thread seeded with Guide Cat context?
- [ ] Should `Work` and `Code` receive surface-specific quick actions in the
      first slice, or should they initially reuse one shared generic set?

## References

- [SPEC-049](./SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [SPEC-046](./SPEC-046-platform-product-landing-and-installed-apps.md)
- [ADR-051](../decisions/051-generalize-participants-and-adopt-guide-cat-terminology.md)
- [ADR-054](../decisions/054-use-a-platform-level-guide-sidecar-for-day-0-assist.md)

---

*Created: 2026-04-07*
*Author: Codex*
*Related Plan: [PLAN-041](../plans/PLAN-041-guide-cat-sidecar-and-day-0-assist-rollout.md)*
