# SPEC-064: MY CATS Platform Home and Lens Projections

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md) |

## Summary

`MY CATS` should remain one platform-level agent home, not split into separate
top-level names such as:

- `Chat Cats`
- `Work Cats`
- `Code Cats`

At the same time, the user needs different state depending on context.

This spec freezes a lens-based model:

- `Overview`
- `Chat`
- `Work`
- `Code`

and distinguishes that platform-level home from product-local contextual
subsets.

## Goals

- keep one stable `MY CATS` concept across the platform
- preserve one underlying agent identity across Chat, Work, and Code state
- let the user inspect different agent state through lenses rather than
  through renamed registries
- preserve existing chat-first direct-lane behavior where `My Cats` selects a
  Cat-private lane
- avoid making every product embed the full platform home when a contextual
  subset is enough

## Non-Goals

- defining final renderer layout or visual design for the `MY CATS` surface
- deciding every badge, sort, or filter in the first release
- replacing `Settings > Cats` as the broader registry-management surface
- changing direct-lane routing semantics in this document

## User Stories

- As an owner, I want one stable place called `MY CATS` where I can inspect my
  agents across the platform.
- As a chat-heavy user, I want `MY CATS` to still feel good for direct Cat
  access and unread/presence awareness.
- As a Work-heavy user, I want to see which agents are overloaded or carrying
  important assignments without hunting through chat lists.
- As a Code-heavy user, I want to see which Cats are working in which repo or
  review flow without needing a separate top-level registry name.
- As a maintainer, I want product-local panels to stay contextual subsets, not
  become shadow registries.

## Requirements

### Functional Requirements

1. The platform shall expose one platform-level navigation concept named
   `MY CATS`.
2. The platform shall not split that concept into separate top-level products
   named `Chat Cats`, `Work Cats`, or `Code Cats`.
3. `MY CATS` shall resolve against one shared agent/entity registry rather than
   product-local copies.
4. `MY CATS` shall support at least these lenses:
   - `Overview`
   - `Chat`
   - `Work`
   - `Code`
5. The `Overview` lens shall provide cross-product summary state for one agent.
6. The `Chat` lens shall be able to show chat-oriented state such as:
   - online/presence
   - recent direct-lane or conversation activity
   - unread or waiting attention indicators
   - companion/direct-lane entry
7. The `Work` lens shall be able to show work-oriented state such as:
   - assignments
   - workload
   - availability
   - mission/schedule state
   - approval or blocker indicators
8. The `Code` lens shall be able to show code-oriented state such as:
   - current repo/workspace
   - branch or worktree context
   - active coding/review session
   - PR/test/review status
9. Selecting an agent in `MY CATS > Chat` may still open that Cat's in-place
   direct lane according to existing direct-lane rules.
10. Product surfaces shall be allowed to render contextual subsets instead of
    the full `MY CATS` surface.
11. Contextual subsets shall not be renamed into separate top-level agent
    registries.
12. `Cats Chat` may show contextual subsets such as:
    - `Cats in this chat`
    - recent direct-lane agents
    - unread or presence-focused agent chips
13. `Cats Work` may show contextual subsets such as:
    - assigned agents
    - operational agents
    - workload-focused rosters
14. `Cats Code` may show contextual subsets such as:
    - code crew
    - active coders
    - repo-scoped agents
15. Product-local contextual subsets shall deep-link back to the canonical
    `MY CATS` home with an appropriate lens and selected agent when needed.
16. The same canonical agent identity shall remain stable across all lenses and
    contextual subsets.
17. The lens model shall remain compatible with:
    - `Conversational Agent`
    - `Operational Agent`
    - `Hybrid Agent`
18. Product policy may choose which lenses are primary for each agent class,
    but that policy shall not fork identity.

### Non-Functional Requirements

- **IA clarity**: users should understand that `MY CATS` is one home with many
  views, not many unrelated registries.
- **Projection consistency**: contextual product subsets must remain legible as
  projections of the platform home.
- **Identity integrity**: Chat/Work/Code lenses must not fork the underlying
  agent identity.
- **Extensibility**: new products or lenses should fit without renaming the
  whole agent-home concept.

## Design Overview

```text
Shared Agent Registry
        |
        v
      MY CATS
        |
  +-----+-----+-----+-----+
  | Overview | Chat | Work | Code |
        |
        +--> product-local contextual subsets
              Chat subset
              Work subset
              Code subset
```

## Platform vs Product Presentation

### Platform-Level `MY CATS`

`MY CATS` is the canonical platform home for inspecting agent identity and
cross-product state through lenses.

### Product-Local Contextual Subsets

Each product may surface narrower subsets without rebranding the whole concept.

Examples:

- `Cats Chat`
  - presence roster
  - recent direct lanes
  - unread-focused Cat list
- `Cats Work`
  - assigned agents
  - workload list
  - operational roster
- `Cats Code`
  - code crew
  - active coder list
  - repo-local agent list

These are subsets or panels, not alternate homes.

## Boundaries

### What `MY CATS` is

- one platform-level agent home
- one stable navigation concept
- one set of lens views over one registry

### What `MY CATS` is not

- three separate product registries
- the only place agents can appear
- a replacement for context-specific product rosters

## Dependencies

- [ADR-064](../decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [SPEC-063](./SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)
- [SPEC-062](./SPEC-062-agent-missions-and-transport-bindings.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-027](./SPEC-027-chat-first-information-architecture-and-default-boss-cat.md)

## Open Questions

- [ ] Should `Overview` be the default landing lens, or should the last-used
      lens persist per user?
- [ ] Which hybrid agents should appear in `MY CATS > Overview` by default?
- [ ] How much code/work state should be summarized inline before users drill
      into deeper product surfaces?

## References

- [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [ADR-064](../decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [SPEC-063](./SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)
- [Architecture](../architecture.md)
- [terminology.md](../terminology.md)

---

*Created: 2026-04-14*
*Author: Codex*
*Related Plan: [PLAN-056](../plans/PLAN-056-my-cats-platform-home-and-lens-projections.md)*
