# ADR-065: Keep MY CATS as One Platform Agent Home With Lenses

## Status

Proposed

## Context

The platform now distinguishes:

- `Conversational Agent`
- `Operational Agent`
- `Hybrid Agent`

and projects them across:

- `Cats Chat`
- `Cats Work`
- `Cats Code`

This creates an information-architecture question for `MY CATS`.

Should the product:

- split into separate top-level surfaces such as `Chat Cats`, `Work Cats`, and
  `Code Cats`
- or keep one `MY CATS` entry and let each product show different state over
  the same underlying agents

Splitting the name would make one shared agent registry feel like three partial
registries. It would also encourage product-local identity drift.

At the same time, a single undifferentiated list is not enough, because the
user wants different state in different contexts:

- chat presence and unread state
- work assignments and workload
- code repo/worktree/session state

The platform therefore needs one stable home plus projection-aware views.

## Decision

`MY CATS` will remain one platform-level navigation surface and one product
concept.

It will not split into top-level products named:

- `Chat Cats`
- `Work Cats`
- `Code Cats`

Instead, `MY CATS` will be the single platform agent home over the shared
agent/entity registry, with lens-based views.

The first lens model is:

1. `Overview`
   - cross-product summary of the agent
2. `Chat`
   - chat/direct-lane/companion-oriented state
3. `Work`
   - assignment/mission/workload/availability-oriented state
4. `Code`
   - repo/worktree/run/review-oriented state

Further rules:

5. The same underlying agent identity must remain stable across all `MY CATS`
   lenses.
6. `MY CATS` is the platform-level home, not the only place where agents are
   visible.
7. Product surfaces may show contextual subsets instead of embedding the full
   `MY CATS` home:
   - Chat may show `Cats in this chat`, presence, or recent direct-lane state
   - Work may show assigned or operational agents
   - Code may show active coders or code crew
8. Those contextual surfaces are projections or subsets, not alternate
   registries and not alternate names for `MY CATS`.
9. `MY CATS > Chat` must preserve the existing direct-lane semantics:
   - selecting a conversational Cat may still open that Cat's in-place direct
     lane
   - that behavior does not require `MY CATS` to stay only a sidebar roster
10. `MY CATS` should be navigable from platform-level chrome, while product
    surfaces may deep-link into a specific lens and selected agent.

## Consequences

### Positive

- The platform keeps one stable name and one stable mental model.
- Users can inspect Chat/Work/Code state without learning three agent homes.
- Product teams keep one registry and many projections instead of one registry
  per product.
- Future hybrid agents can surface different states without duplicating
  identity.

### Negative

- `MY CATS` will need clearer IA than a simple sidebar list.
- Product-local contextual subsets must be designed carefully so they feel
  connected to, not duplicated from, the platform home.
- Some earlier docs that described `My Cats` only as a lightweight chat roster
  now need refinement.

## Rejected Alternatives

### Split Into `Chat Cats`, `Work Cats`, and `Code Cats`

Rejected because it would fragment one shared agent model into three top-level
product concepts and encourage drift between surfaces.

### Keep `MY CATS` as a Chat-Only Roster

Rejected because it would under-serve platform-level agent inspection once the
same agents also have operational or code-facing state that users need to see.

### Put All State Only in Product-Local Panels

Rejected because it would remove any stable platform-level home for agents and
make cross-product inspection harder.

## Follow-On Work

- Define `MY CATS` lens metadata and navigation/deep-link rules.
- Define which agent classes appear in `Overview` by default.
- Keep product-contextual subsets explicit:
  - Chat subset
  - Work subset
  - Code subset
- Decide whether `Overview` should include badges for conversational,
  operational, and hybrid posture.

## Related

- [ADR-064](./064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [SPEC-063](../specs/SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)
- [SPEC-062](../specs/SPEC-062-agent-missions-and-transport-bindings.md)
