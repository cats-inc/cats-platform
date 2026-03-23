# ADR-031: Separate Composer Lead Control from Boss Orchestration Authority

> Let normal `Recents` threads begin as model-first chats, switch to Cat-led
> chats when the first Cat is added, and keep `Boss Cat` orchestration
> authority separate from the composer lead slot.

## Status

Accepted

## Context

`cats` already distinguishes:

- topic-first `Recents` chats
- Cat-private direct lanes under `My Cats`
- a global `Boss Cat` identity

Recent design discussion surfaced a real mismatch in the `Recents` model:

1. Making every `+ New Chat` visibly behave like a `Boss Chat` drifts away from
   familiar model-first chat UX such as Claude Chat or ChatGPT.
2. Putting model selection in the header suggests the whole thread belongs to
   one model, even though only the **next** outgoing turn can actually use the
   currently selected provider/model.
3. Treating the first added Cat as only a helper is not intuitive; once a user
   adds one Cat into a normal thread, they expect to be talking to that Cat.
4. At the same time, `Boss Cat` still needs to retain orchestration authority
   when present, especially for adding or coordinating other Cats.

The product therefore needs a model that keeps three ideas distinct:

- who is the default visible responder
- who may proactively help in the background
- who retains orchestration authority

## Decision

`cats` will adopt a composer-scoped execution model for normal `Recents`
threads.

### 1. Normal `Recents` threads may start in solo composer mode

- no visible Cat is required at the start
- the composer shows the provider/model selector
- that selector controls the next outgoing turn only

### 2. Adding the first Cat upgrades the thread into a Cat-led thread

- the first added Cat becomes the `leadCat`
- the composer control switches from model selector to the lead Cat's
  avatar-only affordance
- unmentioned turns default to that Cat

### 3. Clicking the composer avatar opens Cat inspect first; preset editing is deferred

- the composer avatar opens a Cat-focused inspect/settings surface
- the first slice should treat that surface as read-only inspect by default
- future provider/model/skill/knowledge editing from that surface is still
  expected to be Cat-preset editing, not thread-local editing
- that edit path should not ship as a casual first-slice action until
  thread-local override or stronger scope-warning design exists

### 4. `Boss Cat` auto-help is separate from lead status

- if `Boss Cat` is present and is **not** lead, it defaults to
  background `auto-helper`
- if `Boss Cat` **is** lead, it still retains orchestration authority
- becoming lead does not disable Boss orchestration capability

### 5. Non-Boss Cats default to mention-only unless explicitly elevated later

- additional non-Boss Cats join as `mention-only`
- they do not proactively intervene by default

### 6. `My Cats` private lanes remain unchanged

- this decision applies to normal `Recents` threads only
- Cat-private direct lanes continue to be Cat-first lanes and are not redefined
  here

## Consequences

### Positive

- `+ New Chat` becomes closer to familiar model-first chat UX
- the composer control more truthfully represents who or what will answer the
  next turn
- adding the first Cat feels intuitive because that Cat becomes the visible
  counterpart immediately
- `Boss Cat` can remain operationally powerful without being forced to occupy
  the front stage in every thread
- per-message provider/model provenance remains compatible with threads that
  evolve from solo to Cat-led

### Negative

- the product now needs clearer separation between:
  - thread-level pending execution state
  - Cat preset state
  - per-message execution provenance
- later composer-opened Cat editing can have cross-thread consequences, which
  requires careful UX messaging and likely thread-local override follow-up work
- participant-role handling is more formal than a single room-mode flag

### Neutral

- this ADR does not settle header presentation
- this ADR does not require every future orchestration or approval behavior to
  ship now
- this ADR does not prevent later thread-local Cat overrides, but it does not
  require them
- this ADR intentionally allows the first slice to ship avatar-click inspect
  before avatar-click edit

## Alternatives Considered

### Alternative 1: Keep every normal thread as a visible `Boss Chat`

- **Pros**: simple story; no new solo mode
- **Cons**: pushes the product away from familiar chat UX and makes model
  switching feel heavier than needed
- **Why rejected**: it makes every normal thread feel more agent-console-like
  than necessary

### Alternative 2: Put model selection in the header

- **Pros**: easy to discover
- **Cons**: implies the whole thread belongs to the currently visible model
- **Why rejected**: the selected provider/model only controls the next outgoing
  turn

### Alternative 3: Let the first added Cat remain helper-only

- **Pros**: preserves a hidden default orchestrator speaker
- **Cons**: feels like the user is suddenly talking to both the Cat and an
  invisible second actor
- **Why rejected**: once the user adds the first Cat, the expected visible
  counterpart should become that Cat

### Alternative 4: Treat `Boss Cat` lead status as disabling orchestration authority

- **Pros**: simpler role model on paper
- **Cons**: makes `Boss Cat` weaker exactly when it becomes the visible lead
- **Why rejected**: front-stage speaker status and orchestration authority are
  different concerns

## References

- `cats/docs/specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md`
- `cats/docs/specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md`
- `cats/docs/specs/SPEC-027-chat-first-information-architecture-and-default-boss-cat.md`
- `cats/docs/specs/SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md`
- `cats/docs/decisions/011-model-primary-orchestrator-as-visible-cat.md`
- `cats/docs/decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md`

---

*Drafted: 2026-03-23*
*Drafted by: Codex*
