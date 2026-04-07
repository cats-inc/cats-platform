# ADR-054: Use a Platform-Level Guide Sidecar for Day-0 Assist

> Make post-setup `Guide Cat` assistance visible from the first Lobby entry by
> giving the platform host one persistent left-docked assistant sidecar.

## Status

Proposed

## Context

`cats-platform` already supports:

- optional `Guide Cat` creation during setup
- routing setup completion into `/lobby`
- a platform host that switches among `Lobby`, `Chat`, `Work`, and `Code`
- product-owned right-side inspector/detail panels inside product canvases

The current gap is the first visible consumption surface after setup.

Existing docs already establish that the user should receive assistance from
day 0, not only after they discover later settings or compose flows:

- [SPEC-049](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
  says Guide Cat should support starter ideas, onboarding guidance, and
  product-entry help after setup.
- [ADR-051](./051-generalize-participants-and-adopt-guide-cat-terminology.md)
  says Guide Cat is the optional first helper and should support `Chat`,
  `Work`, and `Code`.

However, the platform still lacks a stable visible home for that helper after
setup completes:

- forcing setup users directly into `Chat` collapses the platform host back
  into a chat-first redirect instead of a host-owned landing
- modeling the first visible Guide Cat interaction as a direct lane immediately
  collapses a platform-level helper into Chat-only topology
- using the existing right-side product inspector region would compete with
  existing approval/run/detail surfaces
- using only static starter cards on Lobby satisfies guidance partially, but it
  does not create a persistent assistant presence across products
- using only a floating FAB/chat bubble makes the assistant feel bolted on
  rather than host-owned

## Decision

### 1. The primary day-0 assist surface is a platform-level Guide sidecar

When setup completes with a persisted `guideCat`, the first host-owned
assistance surface should be a `Guide Cat` sidecar that belongs to the platform
shell, not to an individual product tree.

This sidecar should be available on:

- `/lobby`
- `Chat`
- `Work`
- `Code`

### 2. The sidecar docks on the left edge of the active content region

The Guide sidecar should attach to the left side of the active host content,
including Lobby and product canvases.

This keeps the assistant in one consistent place while preserving the right
side for existing and future inspector/detail panels.

### 3. The first post-setup route remains `/lobby`

Creating Guide Cat during setup must not force the user directly into a
Chat-only route.

The host should still complete setup into `/lobby`, but when Guide Cat exists,
Lobby should surface the sidecar in a first-run assist state so the user sees
immediate help without losing the host-owned landing experience.

### 4. The sidecar session is platform-level, not a direct lane by default

The sidecar must not be modeled as an automatic Chat direct lane.

Guide Cat remains a platform-level helper identity. If the user wants to
continue deeper work inside `Cats Chat`, the sidecar may offer an explicit
promotion path such as `Open in Cats Chat`, but that is a deliberate handoff,
not the default day-0 representation.

### 5. The sidecar is persistent, but user-controllable

The platform should support at least these states:

- hidden
- collapsed tab / icon
- welcome peek
- open

The first Lobby entry after setup with Guide Cat should prefer a visible
assist state such as `welcome peek` or `open`, while later visits should honor
persisted dismissal/collapse state.

### 6. The first visible experience favors quick actions over empty chat

The initial sidecar state should not open as a blank transcript.

It should start with:

- a short Guide Cat greeting
- context-aware quick actions
- an explicit path to expand into a deeper conversation

## Consequences

### Positive

- day-0 assist becomes visible immediately after setup without sacrificing the
  host-owned Lobby
- Guide Cat keeps one cross-product identity instead of being forced into a
  Chat-only shape on day 1
- left-side docking avoids collision with current and future right-side
  inspector/detail panels
- the assistant can persist across route changes because it belongs to the
  platform shell, not to one product page
- future Chat/Work/Code guide experiences can share one docked interaction
  model instead of inventing three different onboarding affordances

### Negative

- the platform shell now owns an additional persistent UI system and view-state
  contract
- responsive layout and narrow-width behavior need an explicit fallback such as
  overlay or bottom sheet
- designers and implementers must define a clean handoff from sidecar help into
  product-native conversations or workflows

### Neutral

- this ADR does not decide the exact transcript storage or runtime session
  contract for sidecar conversations
- this ADR does not require the first slice to support every surface equally;
  the rollout may start with Lobby-first visibility and then extend to product
  canvases

## Alternatives Considered

### Alternative 1: Auto-route setup users straight into a Guide Cat chat lane

- **Pros**: immediate conversation, minimal extra shell UI
- **Cons**: collapses a platform helper into Chat semantics and bypasses the
  host-owned Lobby
- **Why rejected**: it breaks the current direction that setup completes into a
  platform landing and makes the first experience product-specific too early

### Alternative 2: Keep Guide Cat visible only as Lobby cards or starter suggestions

- **Pros**: simpler than a persistent shell sidecar
- **Cons**: helps only on Lobby and does not establish one durable assistant
  presence across products
- **Why rejected**: it satisfies day-0 guidance partially but not the broader
  cross-product assistant posture

### Alternative 3: Use a generic floating FAB/chat bubble

- **Pros**: familiar UI pattern, small implementation surface
- **Cons**: feels bolted on, has weak spatial alignment with product canvases,
  and gives less structure for later cross-product persistence
- **Why rejected**: the platform wants a host-owned assistant surface, not a
  generic support widget

### Alternative 4: Dock the Guide sidecar on the right

- **Pros**: common place for helper or inspector UIs
- **Cons**: competes directly with current Chat/Work/Code right-side inspector
  and detail panels
- **Why rejected**: the right side is already more valuable as product-owned
  inspection space

## References

- [SPEC-049](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [SPEC-046](../specs/SPEC-046-platform-product-landing-and-installed-apps.md)
- [SPEC-051](../specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)
- [ADR-051](./051-generalize-participants-and-adopt-guide-cat-terminology.md)
- [PLAN-038](../plans/PLAN-038-guide-cat-setup-and-participant-generalization.md)
- [PLAN-041](../plans/PLAN-041-guide-cat-sidecar-and-day-0-assist-rollout.md)

---

*Decision made: 2026-04-07*
*Decision makers: User, Codex*
