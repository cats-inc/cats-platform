# SPEC-068: New Code Draft Canvas and Renderer Ownership

> Define the first `+New code`-specific draft surface, its execution-profile
> visibility rules, and the renderer boundary between shared primitives and
> product-owned draft assembly.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-067](../decisions/067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md) |

## Summary

`SPEC-061` defined `+New code` as a one-person coding entry preset above the
same shared engine used by Chat and Work. The current renderer path still
routes `Cats Code` draft entry through the chat-owned `ChatNewChatDraft`
surface.

That is good enough for early reuse, but it is the wrong long-term ownership
boundary for `+New code`.

This spec defines the first correction:

- `+New code` owns its draft canvas inside `products/code/*`
- the surface reuses shared draft primitives rather than forking composer
  layout or side-panel behavior
- `+Team code` and `+Peer code` may continue to reuse shared chat draft flow
  until their own renderer semantics are implemented

## Goals

- make `+New code` renderer ownership explicit
- preserve shared fixes for composer layout, folder picker, model selector,
  and panel shell
- let Code introduce code-specific copy and setup framing without cloning the
  full Chat draft
- establish the first seam for future `executionProfile`-first UI

## Non-Goals

- full `Team code` or `Peer code` renderer specialization
- final styling for the code-first draft canvas
- full worktree, permission, or auto-accept UI in the first slice
- changing the shared conversation engine topology

## Problem Statement

Today `products/code/renderer/components/NewChatDraft.tsx` re-exports the
chat-specific draft surface.

That causes three structural problems:

1. `+New code` inherits chat-specific copy such as `New Chat Setup` and
   `AI Reply`
2. future code-specific draft changes would either bloat shared chat props or
   force a whole-surface fork
3. one bug-fix path for shared primitives is mixed together with a second path
   for product semantics

The platform needs a boundary where:

- shared primitives remain shared
- product draft semantics stay product-owned

## User Stories

- As a Code user, I want `+New code` to feel like a coding-session start
  surface rather than a renamed chat form.
- As a maintainer, I want layout and primitive fixes to land once and benefit
  Chat, Work, and Code together.
- As a product owner, I want code-specific copy and setup framing without
  rewriting the whole shared draft system.

## Requirements

### Functional Requirements

1. `+New code` shall be rendered by a code-owned component inside
   `products/code/*`.
2. The first code-owned `+New code` draft shall reuse shared draft primitives
   for:
   - composer shell
   - side-panel shell
   - model selector
   - folder browser
   - target-slot layout primitives
3. The first code-owned draft shall support code-specific copy overrides at
   least for:
   - composer placeholder
   - setup-panel title
   - direct-lane hero framing
   - execution section title
   - workspace section title
5. The first code-owned draft shall expose visible session-context chrome on
   the canvas for:
   - workspace selection
   - execution target selection
6. The first code-owned draft shall keep those visible session-context
   elements product-owned while reusing shared chip and panel primitives.
7. `+New code` shall not require a fork of the entire chat draft surface just
   to change copy or setup framing.
8. Shared draft primitives shall keep their default chat/work copy unless a
   product explicitly overrides it.
9. `+Team code` and `+Peer code` may continue to use the current shared
   chat-draft path until their own renderer semantics are ready.

### Renderer Boundary Requirements

10. Shared draft primitives shall own reusable interaction mechanics such as:
   - attachment strip
   - plus-menu behavior
   - folder selection shell
   - provider/model editing shell
   - send-row layout
11. Shared draft primitives may expose a neutral header-accessory seam for
    product-owned draft chrome without importing product semantics.
12. Product-owned draft wrappers shall own:
   - entry-specific copy
   - which shared primitive variant is composed
   - when the draft delegates to another shared draft path
13. Product-specific changes to `+New code` shall not require editing Chat or
   Work draft copy unless the underlying primitive changed.
14. Shared primitive bugs or styling fixes shall remain reusable across Chat,
    Work, and Code without code-surface forking.

### Future Compatibility Requirements

15. The first slice shall leave a clear seam for later `executionProfile`
    visibility such as:
    - workspace identity
    - worktree mode
    - permission profile
    - tool or memory binding
16. The first slice shall not block later introduction of a fully code-owned
    `Team code` or `Peer code` draft surface.

## Design Overview

### First-Slice Ownership Split

```text
Code NewChatDraft wrapper
  -> default/new-code route:
       shared WorkspaceNewChatDraft + code copy overrides
  -> group / parallel routes:
       existing ChatNewChatDraft path for now
```

### Why This Split

- `WorkspaceNewChatDraft` already represents a more neutral draft shell than
  `ChatNewChatDraft`
- it keeps shared fixes concentrated in one primitive path
- Code can begin diverging where it matters without forcing `Team code` and
  `Peer code` into the same first refactor

### First-Slice Copy Direction

The first code-owned `+New code` draft should adopt code-oriented framing such
as:

- setup title: `New Code Setup`
- execution section: `Execution`
- workspace section: `Workspace`
- prompt placeholder aimed at building, fixing, or investigating code

The first slice does not yet define the final visual language for
worktree/permission chips, but it does introduce a code-owned chip row for the
current workspace and execution target. In solo `+New code`, that header row
is the primary execution-target chrome; the lower composer target slot remains
reserved for direct-lane participant stacks. The same copy seam also owns the
direct-lane hero wording so Code does not fall back to chat phrasing such as
`Private Chat`.

## Dependencies

- [SPEC-043](./SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-061](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-067](../decisions/067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md)

## Open Questions

- [ ] When should `+New code` stop exposing chat-era cat selection semantics on
      the setup panel?
- [ ] Which `executionProfile` fields should move from side panel to visible
      draft chrome first: workspace, permission, or worktree?
- [ ] Should `+New code` keep shared starter chips, or move to a code-specific
      session-brief treatment in the next slice?

## References

- [SPEC-061](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [ADR-067](../decisions/067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md)

---

*Created: 2026-04-17*
*Author: Codex*
*Related Plan: [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)*
