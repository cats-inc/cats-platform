# ADR-067: Use Shared Draft Primitives with Product-Owned Code Entry Drafts

> Keep reusable draft mechanics in shared renderer primitives while moving
> `Cats Code` entry-draft ownership into `products/code/*`.

## Status

Proposed

## Context

`SPEC-061` and `PLAN-053` define `+New code`, `+Team code`, and `+Peer code`
as Code product presets above the shared interaction engine. The current
renderer implementation still treats Code draft entry as a direct re-export of
the chat-oriented `ChatNewChatDraft` surface.

That creates a false ownership boundary:

- copy such as `New Chat Setup` and `AI Reply` leaks into Code
- future code-specific draft changes would either bloat shared chat props or
  require a large whole-surface fork
- maintainers cannot clearly separate primitive fixes from product semantics

At the same time, fully forking the draft renderer would be the wrong
reaction:

- composer layout fixes would drift
- folder browser behavior would drift
- model selector behavior would drift
- Chat, Work, and Code would start carrying the same bugs independently

The platform needs a middle path.

## Decision

`Cats Code` draft entry surfaces should be product-owned wrappers assembled
from shared draft primitives.

### 1. Shared primitives stay shared

Reusable draft mechanics remain in shared renderer primitives, including:

- composer shell
- side-panel shell
- model selector and provider fields
- folder browser
- shared target-slot primitives

### 2. Product wrappers own entry semantics

Code product wrappers own:

- entry-specific copy
- which primitive path is used for a given preset
- future code-specific visible setup context such as workspace or permission

### 3. First slice is `+New code` only

The first migration slice should move `+New code` off the chat draft re-export
path.

For this slice:

- `+New code` uses a code-owned wrapper over the neutral shared workspace draft
- `+Team code` and `+Peer code` may continue using the current shared
  chat-draft path until their own renderer seams are ready

### 4. Prefer structured extension seams over prop explosion

When shared primitives need product-specific variation, they should adopt
structured seams such as:

- copy override objects
- header accessory components
- section builders
- target-slot components

The first `+New code` slices now concretely use:

- a product-owned copy override bag
- a product-owned header accessory component
- a product-owned target-slot override

They should not accumulate one-off product booleans or string props for every
minor surface difference.

## Consequences

### Positive

- shared draft bug fixes continue to benefit Chat, Work, and Code
- Code can change draft framing without forking the entire chat draft
- future `executionProfile` UI can land in a code-owned surface
- renderer ownership becomes easier to reason about

### Negative

- there is a temporary split where `+New code` and `+Team code` do not use the
  exact same draft component
- wrapper mapping introduces one more component layer in Code
- some shared primitives will need small extension seams such as copy override
  contracts

### Neutral

- `+Team code` and `+Peer code` remain on the existing shared chat-draft path
  until later slices
- the first slice does not yet settle the final visual design for code-first
  session setup

## Alternatives Considered

### Alternative 1: Keep direct re-export of `ChatNewChatDraft`

- **Pros**: lowest short-term implementation cost
- **Cons**: wrong ownership boundary and future prop explosion
- **Why rejected**: it would keep Code draft semantics trapped inside Chat UI

### Alternative 2: Fork the full chat draft into `products/code/*`

- **Pros**: maximum Code control
- **Cons**: shared bugs and styling fixes would drift immediately
- **Why rejected**: it solves ownership by giving up reuse too early

### Alternative 3: Keep one shared draft surface and add more Code-only props

- **Pros**: no wrapper split
- **Cons**: shared surfaces become crowded with product-specific branching
- **Why rejected**: this is just a slower version of the same architectural
  drift

### Alternative 4: Keep `ChatNewChatDraft` and add extension slots for Code

- **Pros**: preserves one draft entry component and could expose richer
  product-specific surfaces through explicit slots
- **Cons**: still anchors Code to the chat-owned draft surface and leaves the
  first `+New code` slice carrying chat-specific copy and setup semantics
- **Why rejected**: the platform already has a more neutral shared primitive in
  `WorkspaceNewChatDraft`, so the first ownership correction is cleaner if Code
  starts there instead of extending the chat-specific surface further

## References

- [SPEC-043](../specs/SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-061](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-068](../specs/SPEC-068-new-code-draft-canvas-and-renderer-ownership.md)
- [PLAN-053](../plans/PLAN-053-concurrent-parallel-semantics-and-code-entry-presets.md)

---

*Proposed: 2026-04-17*
*Proposed by: Codex*
