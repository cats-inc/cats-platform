# ADR-011: Model the Primary Orchestrator as a Visible Cat

> Keep one user-visible public orchestrator identity while preserving a
> separate non-personified orchestration system layer.

## Status

Accepted

> Clarified by [ADR-028](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md):
> one environment still has one current `Boss Cat`, but external bot bindings
> may front other Cats too. `Boss Cat` remains the default public orchestrator,
> not the only Cat allowed to have a transport identity.

## Context

`cats` is now firmly a chat-first product. That creates a product-level
constraint:

- a user opening `+ New Chat` expects to be talking to someone
- Telegram and LINE@ also expect one stable public-facing bot identity
- the app still needs non-chat orchestration behavior such as dispatch,
  retries, run state, event traces, and log inspection

This creates an easy modeling trap:

1. Make the orchestrator a purely invisible system layer
   - good for engineering separation
   - bad for chat product clarity and user trust
2. Make the orchestrator only a personified Cat
   - good for product clarity
   - risky if orchestration runs, events, and debug state get collapsed into
     the same record as the visible chat persona

The product also wants a simple initial rule:

- one default public orchestrator per `cats` environment
- no hard architectural ban on future internal active orchestrators

The decision therefore needs to settle both user-facing identity and internal
system boundaries.

## Decision

`cats` will use a two-layer orchestrator model with one visible public
entry identity.

Terminology rule:

- `Primary Orchestrator Cat` is the formal product and domain term
- `Boss Cat` is the preferred user-facing UI term

1. Each `cats` environment has exactly one `Primary Orchestrator Cat`.
   - this is the default public orchestrator for the environment
   - this is the identity shown to users in chat
   - this is the default identity used for public bot bindings such as
     Telegram and LINE@ when a more specific Cat binding is not chosen
   - user-facing surfaces should usually label this role as `Boss Cat`

2. `+ New Chat` starts a conversation with that `Primary Orchestrator Cat`.
   - the orchestrator is the implicit lead participant in new chats
   - users do not choose among multiple public orchestrators in the initial UX

3. Other Cats remain assignable collaborators, not competing public entry
   identities.
   - they can be pulled into a chat by the orchestrator or operator
   - they may be visible as assigned specialists inside the chat

4. The orchestration engine remains a non-personified system layer.
   - A2A dispatch
   - run state
   - retries
   - event traces
   - log inspection
   - other coordination mechanics

5. The visible Cat and the orchestration system layer are related but not the
   same domain object.
   - the Cat is the product persona and public identity
   - the system layer owns orchestration runs, events, and diagnostics

6. UI surfaces must keep transcript and trace separate.
   - the main chat transcript is for meaningful dialogue
   - orchestration details belong in an activity or trace panel
   - the transcript may include short system notes when they improve operator
     understanding, but it must not become a log viewer

7. Future internal active orchestrators are allowed in principle, but they do
   not replace or multiply the one default public orchestrator unless a later
   spec explicitly changes that rule.

## Consequences

### Positive

- The chat product keeps a stable "who am I talking to?" answer.
- The product gets a short, memorable UI term without losing a precise domain
  term.
- Telegram and LINE@ bindings have one clear default public orchestrator
  target.
- Engineering still gets explicit orchestration records instead of burying all
  system state inside a chat persona object.
- The transcript stays readable while advanced debugging remains available.

### Negative

- The product must model both a visible orchestrator identity and separate
  orchestration-run records.
- Some UI work is required to explain activity or trace information without
  exposing too much system detail by default.
- Future support for internal orchestrators will require careful terminology so
  they do not look like competing public entry bots.

### Neutral

- This does not require multiple orchestrators to ship now.
- This does not decide the exact data schema for orchestration runs and events;
  it only fixes the layering direction.
- This does not decide the detailed approval, escalation, or takeover UX by
  itself.

## Alternatives Considered

### Alternative 1: Make the orchestrator an invisible system only

- **Pros**: Clean internal systems model; no need to personify orchestration.
- **Cons**: Breaks the chat-first product metaphor and weakens user trust in
  external bot channels.
- **Why rejected**: A chat product needs a visible counterparty.

### Alternative 2: Treat the visible orchestrator Cat and all orchestration
state as one object

- **Pros**: Simpler-looking product story; fewer nouns in discussion.
- **Cons**: Conflates persona, bot binding, run state, logs, retries, and trace
  data into one unstable record.
- **Why rejected**: Product clarity is good, but engineering boundaries still
  matter.

### Alternative 3: Allow multiple equally public orchestrators from the start

- **Pros**: Flexible for future advanced setups.
- **Cons**: Complicates `+ New Chat`, transport bindings, and mental models too
  early.
- **Why rejected**: The current product needs one clear public entry identity
  first.

### Alternative 4: Put orchestration debug output directly in the transcript

- **Pros**: No secondary panel needed; everything is in one place.
- **Cons**: Turns the transcript into a log stream and degrades the chat
  experience.
- **Why rejected**: Trace belongs beside the conversation, not inside every
  turn.

## References

- [ADR-007](./007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-008](./008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-009](./009-prefer-chat-contextual-cat-entry-and-settings-registry.md)
- [ADR-028](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [Architecture](../architecture.md)
- [Requirements](../requirements.md)
- [SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)

---

*Accepted: 2026-03-19*
*Accepted by: user direction captured through Codex*

