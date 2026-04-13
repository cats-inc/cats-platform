# ADR-061: Treat Guide Cat as an Optional Surface-Assist Capability

> Model Guide Cat as an optional, low-privilege assist capability that can
> enrich setup, lobby, composer, and product surfaces without becoming a chat
> mode or taking ownership of critical-path product correctness.

## Status

Proposed

## Context

`Guide Cat` has existed in the docs, but most current design slices still frame
it too narrowly:

- setup helper
- sidecar on Lobby
- one-off starter suggestion source

That is smaller than the actual product opportunity.

The user expects `Guide Cat` to cover soft-assist behavior that would otherwise
be hard-coded into many surfaces:

- greetings
- contextual helper copy
- composer prompt chips
- starter questions
- surface-aware suggestions
- light onboarding and "what should I do next?" assistance

At the same time, Guide Cat should not become:

- a mandatory participant in every conversation
- a replacement for Boss Cat
- the owner of routing, approvals, repair, or other correctness-critical logic

The platform needs a cleaner framing: Guide Cat should be optional and
composable, more like a capability layer than a room topology.

## Decision

Guide Cat should be modeled as an optional surface-assist capability.

### 1. Guide Cat is not a chat mode or room topology

Guide Cat must not define:

- a dedicated chat-mode architecture
- transcript identity rules
- room topology
- lane/session semantics

Guide Cat may appear in or around product surfaces, but it does not own the
core interaction engine.

### 2. Guide Cat belongs to the same optional-capability family as Boss Cat, but with lower authority

Both Guide Cat and Boss Cat are optional capability layers above the shared
engine, but they serve different roles:

- `Boss Cat`
  - conversation-scoped coordinator capability
  - may be visible or hidden
  - may influence routing, scheduling, or privileged orchestration
- `Guide Cat`
  - surface-scoped assist capability
  - may be visible or hidden
  - may generate suggestions, helper copy, and low-risk assistive actions

Guide Cat does not receive Boss Cat's privileged orchestration authority by
default.

### 3. Guide Cat capabilities should be composable per surface

Guide Cat may enrich surfaces such as:

- setup
- lobby
- `+New chat`
- `+Group chat`
- composer surfaces
- Chat empty states
- Work empty states
- Code empty states
- future inline help surfaces

Each surface may decide whether Guide Cat is:

- absent
- deterministic-only
- cached-assist only
- runtime-backed and interactive

### 4. Deterministic fallback is mandatory

Guide Cat assistance must degrade cleanly into deterministic behavior when:

- no Guide Cat exists
- runtime is unavailable
- cache is empty
- permissions or policy suppress Guide Cat execution

The product must never require Guide Cat to preserve basic usability.

### 5. Guide Cat may generate assistive content, not critical-path truth

Guide Cat may own:

- greetings
- suggestion chips
- contextual helper copy
- low-risk onboarding prompts
- optional next-step recommendations

Guide Cat must not own:

- transcript bubble identity
- routing correctness
- approval policy
- repair/replay semantics
- final authoritative task/workflow transitions without an explicit product
  handoff

### 6. Sidecar is one projection, not the whole capability

The existing Guide sidecar idea remains valid as one surface projection.

But the sidecar should be treated as a consumer of the broader Guide Cat
capability model, not the definition of Guide Cat itself.

### 7. Implementation should follow optional-capability patterns

The product should prefer patterns such as:

- `Null Object` for absence
- `Strategy` for provider/runtime selection
- `Policy Object` for per-surface permissions and behavior
- `Decorator` or middleware-style hooks for surface integration

This keeps Guide Cat removable and composable instead of forcing hard-coded
conditional branches through every product surface.

## Consequences

### Positive

- Guide Cat can enrich many surfaces without becoming another special chat mode
- product teams can add assistive surfaces without hard-coding every helper
  string
- deterministic fallback keeps usability intact when Guide Cat is unavailable
- the sidecar becomes one projection of a broader capability model

### Negative

- the platform must define clear per-surface policy and fallback behavior
- there is more up-front abstraction work than adding another one-off widget
- teams must stay disciplined and not sneak critical-path logic into Guide Cat

### Neutral

- Guide Cat may still appear visibly in some transcript-adjacent surfaces
- some surfaces may continue to use static help until the capability is rolled
  out there

## Alternatives Considered

### Alternative 1: Keep Guide Cat as only a setup or sidecar feature

- **Pros**: smaller immediate scope
- **Cons**: leaves greeting, suggestion, and assist surfaces fragmented and
  mostly hard-coded
- **Why rejected**: the product intent is broader than one sidecar or wizard
  step

### Alternative 2: Make Guide Cat a participant in every conversation by default

- **Pros**: easy to explain because everything stays "inside chat"
- **Cons**: pollutes transcript semantics and confuses assistive help with room
  participation
- **Why rejected**: surface assistance and transcript participation are not the
  same responsibility

### Alternative 3: Let Guide Cat own routing/helper correctness in the product

- **Pros**: more behavior could be authored dynamically
- **Cons**: correctness depends on a low-privilege helper layer
- **Why rejected**: critical-path correctness must stay in deterministic product
  code and policies

## References

- [ADR-054](./054-use-a-platform-level-guide-sidecar-for-day-0-assist.md)
- [ADR-059](./059-adopt-a-unified-conversation-turn-lane-engine.md)
- [SPEC-049](../specs/SPEC-049-guide-cat-setup-and-generalized-participant-entry.md)
- [SPEC-051](../specs/SPEC-051-guide-cat-sidecar-and-day-0-assist-surfaces.md)

---

*Proposed: 2026-04-14*
*Proposed by: Codex*
