# ADR-009: Prefer Chat-Contextual Cat Entry and a Settings-Hosted Registry

> Keep reusable cat management global, but make "add cat to this chat" the
> primary operator flow.

## Status

Accepted

## Context

[ADR-005](./005-use-chat-cat-registry-and-channel-assignments.md) settled
the product model for reusable cats:

- cats live in a global chat registry
- channel usage lives in explicit assignments
- a renderer can hydrate assigned cats for convenience

That data model remains correct, but the current renderer information
architecture still makes the registry feel like the primary destination. The
main `Cats` surface sits alongside primary navigation, while the more frequent
operator need is usually contextual:

- "add someone to this chat"
- "reuse an existing cat here"
- "create a new cat because this chat now needs one"

This creates a UX mismatch:

- registry management appears more important than the active chat task
- adding a cat requires a context switch even when the operator is already in
  the right chat
- the current top-level `Cats` page behaves like administration, not like a
  high-frequency chat action

The product should distinguish:

- `chat-time action`: add or assign a cat to the current chat
- `resource management`: review, create, edit, archive, or inspect reusable
  cats across chats

## Decision

`cats` should keep the shared cat registry model from ADR-005, but change
the product entry points.

From this point forward, the planned UX is:

1. The primary "Add cat" flow starts inside the current chat surface.
   - the entry should live near the current chat roster, header, or composer
   - it should open a side sheet or modal rather than forcing a page change

2. The chat-time Add cat surface should offer two paths:
   - `Choose existing`
   - `Create new`

3. `Choose existing` should be the default view.
   - operators usually want to reuse an existing teammate first
   - the surface should support search and clear assignment calls to action

4. `Create new` inside the chat flow should remain available.
   - creating from context should still save a reusable global cat
   - after creation, the new cat should be assigned to the current chat as part
     of the same flow

5. The global cat registry should move under `Settings > Cats`.
   - it becomes a management surface rather than a first-level product surface
   - it remains the place for review, editing, archive, and future inspection
     flows

6. The `Settings` entry should come from the account menu in the left-panel
   footer.
   - the existing account area is the correct home for global preferences and
     resource management

7. `Settings > Cats` must still support `Create new`.
   - moving the registry under Settings does not remove direct creation there
   - it simply stops treating registry management as the main chat workflow

## Consequences

### Positive

- The common operator action becomes "add cat to this chat," which matches real
  usage better than "go manage the registry first."
- Reusable resource management still exists without dominating the primary
  navigation.
- The registry remains compatible with `Cats Core v1` and future `Cats Work`
  reuse.
- The model from ADR-005 stays intact, so this is a UX-entry decision rather
  than a schema reversal.

### Negative

- The renderer information architecture becomes more complex because there are
  now two intentional entry points into the same resource model.
- The app will need a real settings shell and account menu rather than a static
  sidebar footer.
- The chat surface gains another contextual flow that must not clutter the
  composer area.

### Neutral

- `Settings > Cats` still needs create, edit, and archive actions, even if it
  is no longer first-level navigation.
- Existing APIs for global cat creation and channel assignment can stay
  conceptually valid; this proposal mainly changes how the UI composes them.

## Alternatives Considered

### Alternative 1: Keep `Cats` as a top-level surface

- **Pros**: Minimal information architecture change.
- **Cons**: Keeps a management screen in the main operator loop and preserves
  the current context-switch cost.
- **Why not preferred**: It optimizes for registry administration rather than
  for chat-time action.

### Alternative 2: Remove the registry entirely and make cats fully chat-local

- **Pros**: Very simple UI concept.
- **Cons**: Breaks the reusable cat model already accepted in ADR-005 and
  weakens future cross-chat and cross-product reuse.
- **Why rejected**: The data model is still right; the entry points are what
  need to change.

### Alternative 3: Only allow creation from Settings

- **Pros**: Centralized management.
- **Cons**: Forces operators out of the active chat even for lightweight
  additions.
- **Why rejected**: It makes the common path slower and less natural.

## References

- [ADR-005](./005-use-chat-cat-registry-and-channel-assignments.md)
- [Requirements](../requirements.md)
- [Architecture](../architecture.md)

---

*Accepted: 2026-03-17*
*Accepted by: user direction captured through Codex*




