# SPEC-070: Product-Scoped Recents and Channel Origin Surfaces

> Keep `RECENTS` product-scoped by default across `Cats Chat`, `Cats Work`,
> and `Cats Code`, backed by explicit conversation-origin metadata instead of
> renderer heuristics.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-069](../decisions/069-scope-recents-to-channel-origin-surface-by-default.md) |

## Summary

`Cats Chat`, `Cats Work`, and `Cats Code` currently share one underlying
conversation model, but the sidebar `RECENTS` experience cannot stay a single
global mixed list.

Without an explicit origin contract:

- `+New code` sessions leak into `Cats Chat` recents
- later `Work` and `Code` recents would have to infer ownership from fields
  such as `repoPath`, `roomMode`, or entry-shape heuristics
- `Parallel` / compare containers would need a second ad hoc ownership rule

This spec defines one durable rule:

- every channel and parallel group carries an explicit `originSurface`
- `RECENTS` defaults to showing only entries whose origin matches the current
  product surface
- any future cross-product lens is secondary, not the default

## Goals

- prevent `Code` and `Work` conversations from appearing in `Chat` recents by
  default
- give future `Work` and `Code` recents one explicit ownership contract
- remove the need for renderer-side heuristics such as `repoPath != null`
- keep the default sidebar mental model simple: each product shows its own
  recent conversations

## Non-Goals

- shipping an `All recents` toggle in the first slice
- redesigning the sidebar information architecture
- changing transcript, dispatch, or routing semantics
- migrating older legacy channels to a new stored value beyond compatible
  fallback behavior

## Problem Statement

The current app shell exposes one channel list to all three product surfaces.
That is fine for shared storage and routing, but it is the wrong default for
product-local recents.

If `RECENTS` stays global-by-default:

1. `Cats Chat` starts to look polluted by coding sessions
2. `Cats Code` and `Cats Work` cannot later enable recents safely without
   custom one-off filtering
3. parallel groups and child channels can drift apart in ownership semantics

The platform needs explicit conversation-origin metadata that survives:

- create
- persistence
- snapshot normalization
- app-shell summaries
- compare-group summaries
- renderer-side recents filtering

## User Stories

- As a Chat user, I want `RECENTS` to show chat conversations, not code
  sessions.
- As a Code user, I want future `RECENTS` to reflect code sessions without
  needing a second hidden storage list.
- As a maintainer, I want one explicit contract for product ownership instead
  of scattered renderer heuristics.

## Requirements

### Functional Requirements

1. Every created channel shall carry an explicit `originSurface`.
2. Every created parallel group shall carry an explicit `originSurface`.
3. Channel creation from `Cats Chat`, `Cats Work`, and `Cats Code` shall write
   the current surface into `originSurface`.
4. Parallel-group creation shall write the current surface into both:
   - the group itself
   - each child channel created for that group
5. Sidebar `RECENTS` shall default to entries whose `originSurface` matches the
   current product surface.
6. This same default rule shall apply to grouped parallel/compare entries, not
   only standalone channels.
7. Legacy channels or groups with missing `originSurface` shall resolve as
   `chat` for compatibility.
8. The default recents rule shall not rely on `repoPath`, `composerMode`,
   `roomMode`, or other indirect heuristics.

### Product Behavior Requirements

9. `Cats Chat` shall not show `Code`-origin or `Work`-origin entries in
   `RECENTS` by default.
10. `Cats Work` shall default to `Work`-origin recents when that surface uses
    the shared sidebar fallback path.
11. `Cats Code` may continue to hide recents temporarily, but when it enables
    them it shall use `originSurface === 'code'` as the default filter.
12. Any future cross-product recents view shall be an explicit secondary lens,
    not the default behavior.

### Contract Requirements

13. `originSurface` shall be available in:
    - channel state
    - channel summaries
    - parallel-group state
    - parallel-group summaries
    - create payloads
14. App-shell normalization shall preserve `originSurface` when present and
    apply the compatibility fallback only when absent.

## Design Overview

### Default Rule

```text
RECENTS(currentSurface) = channels/groups where originSurface === currentSurface
legacy missing originSurface -> 'chat'
```

### Why Explicit Metadata

`repoPath`, `entryKind`, `composerMode`, and routing mode are all imperfect
proxies:

- chat conversations may also have repo context
- work sessions may not be repo-backed
- code sessions can use group or parallel topologies
- room mode says how a conversation routes, not which product owns it

`originSurface` is therefore a product-ownership contract, not a routing
contract.

## Dependencies

- [SPEC-040](./SPEC-040-cats-work-team-templates-and-work-intake.md)
- [SPEC-041](./SPEC-041-cats-code-v1-local-builder-loop.md)
- [SPEC-043](./SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-061](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-069](../decisions/069-scope-recents-to-channel-origin-surface-by-default.md)
- [PLAN-060](../plans/PLAN-060-product-scoped-recents-and-origin-surface-rollout.md)

## Open Questions

- [ ] When `Cats Code` turns recents back on, should the first shipped version
      stay product-scoped only, or also expose a later `All` lens?
- [ ] Should `Cats Work` expose any explicit cross-product recents switch on
      day one, or rely on product switching plus deep links first?
- [ ] Should future search results visually badge `originSurface` once recents
      and search can both return cross-product conversations?

## References

- [ADR-048](../decisions/048-separate-platform-products-from-installable-apps.md)
- [ADR-069](../decisions/069-scope-recents-to-channel-origin-surface-by-default.md)

---

*Created: 2026-04-17*
*Author: Codex*
*Related Plan: [PLAN-060](../plans/PLAN-060-product-scoped-recents-and-origin-surface-rollout.md)*
