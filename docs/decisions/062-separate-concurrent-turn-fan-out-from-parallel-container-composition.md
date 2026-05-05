# ADR-062: Separate Concurrent Turn Fan-Out from Parallel Container Composition

> Keep `concurrent` and `parallel` as different layers of the shared
> interaction engine, then map `Cats Code` entry points onto those layers
> instead of inventing more mode-specific workflow engines.

## Status

Proposed

## Context

The current re-architecture already freezes one canonical interaction engine:

- `Container`
- `Conversation`
- `Turn`
- `Lane`
- `Segment`
- `Session`

That unifies direct lanes, group rooms, and compare surfaces under one model.

Two ambiguities still need to be settled before `Cats Chat` concurrent delivery
and `Cats Code` product surfaces can converge cleanly:

1. whether `concurrent` and `parallel` are just two names for the same thing
2. how `Cats Code` entry points should map onto the shared engine

If the product treats `concurrent` as "multiple answers at once" without
distinguishing whether those answers live in one conversation or in many child
conversations, the renderer, runtime, and artifact model will drift again.

If `Cats Code` invents separate workflow engines for:

- default coding
- shared-team coding
- peer review / branch compare

then the platform will repeat the same mode-driven fragmentation that Chat is
trying to remove.

## Decision

`cats-platform` should freeze `concurrent` and `parallel` as different layers
of the shared engine and should express `Cats Code` entry points as presets
above those layers.

### 1. Concurrent is thread-internal fan-out

`concurrent` means:

- one `Conversation`
- one `Turn`
- many active `Lane`s

The lanes share the same conversation context and belong to the same
dispatch/reply cycle.

The user-visible mental model is:

- "I asked one room-turn to fan out to multiple recipients."

### 2. Parallel is container-level composition

`parallel` means:

- one `Container`
- many child `Conversation`s

Each child conversation owns its own transcript, lane set, runtime lifecycle,
and durable continuity.

The user-visible mental model is:

- "I opened multiple branches/threads side by side."

### 3. Concurrent and Parallel may coexist, but they must not collapse

A parallel container may contain conversations that themselves use:

- direct lanes
- sequential multi-lane turns
- concurrent multi-lane turns

That composition is valid, but the layers remain distinct:

- `parallel` does not mean "multi-lane inside one thread"
- `concurrent` does not mean "multiple independent branch transcripts"

### 4. Concurrent requires an explicit convergence policy

Concurrent fan-out does not imply that the product must immediately reduce many
lanes into one winner.

Each concurrent turn must therefore expose or derive a `convergence policy`.

The canonical policies are:

- `keep_all`
- `pick_one`
- `synthesize_one`
- `promote_one_continue`

This keeps `concurrent` broad enough for:

- compare panels
- specialist roundtables
- debate surfaces
- pick-a-winner workflows
- synthesize-and-continue workflows

### 5. Code entry points are presets above the shared engine

`Cats Code` should not introduce a separate workflow engine.

Instead, the first product entry points should be:

- `+New code`
- `+Team code`
- `+Peer code`

These are presets that configure topology, scheduler, sharing, convergence, and
automation policies above the same engine.

### 6. +New code maps to one primary coding conversation

`+New code` is the single-operator coding entry point.

Its baseline mapping is:

- one `Conversation`
- one primary active coding lane by default
- optional helper lanes only when explicitly invoked

This preset is suitable for:

- one coder
- one workspace
- one current implementation thread

### 7. +Team code maps to a shared multi-participant conversation

`+Team code` is the shared-room coding entry point.

Its baseline mapping is:

- one shared `Conversation`
- multiple participants
- workflow/coordinator policy such as PDCA, review, or plan-build-test

This preset is suitable for:

- role-based collaboration inside one shared project thread
- sequential or concurrent sub-steps inside one durable team transcript

### 8. +Peer code maps to a parallel branch/review container

`+Peer code` is the branch-and-review entry point.

Its baseline mapping is:

- one `Container`
- multiple child code `Conversation`s
- explicit automation edges between them

Typical roles include:

- one main coder branch
- one or more peer-review branches
- optional auto-relay of results back to the main branch

This preset is suitable for:

- peer review
- branch compare
- review loops
- selective branch adoption

### 9. Execution profile is a first-class preset input

Runtime-affecting parameters such as:

- `cwd`
- worktree policy
- permissions
- skill bindings
- tool profile
- memory profile

must not be treated as accidental renderer-only state.

They should be captured as an `execution profile` bound to the relevant
participant, lane, or child conversation preset.

### 10. Automation policies belong above the engine, not inside transcript identity

Policies such as:

- "after A finishes, send result to B and C for review"
- "after B and C review, send summary back to A"
- "auto-pick the accepted branch"

must be modeled as automation/convergence policies above the shared engine.

They must not redefine:

- transcript identity
- lane identity
- session identity

## Consequences

### Positive

- Chat and Code can reuse the same engine vocabulary
- concurrent UI can be designed around one-thread response clusters without
  colliding with parallel branch UX
- `Cats Code` gets clearer entry points without multiplying core engines
- peer-review automation can be added as policy rather than as bespoke branch
  transcript logic

### Negative

- product docs and terminology must become more precise
- some existing "parallel/concurrent" references will need cleanup
- Code surfaces will need to expose preset-specific configuration such as
  execution profiles and automation policies

### Neutral

- the product may still use friendly labels like `Reply together` or
  `Peer code`
- not every preset needs all policies exposed in the first slice

## Alternatives Considered

### Alternative 1: Treat Concurrent and Parallel as the same feature

- **Pros**: smaller vocabulary; less doc work
- **Cons**: conflates one-thread fan-out with multi-thread branch composition
- **Why rejected**: the transcript, runtime, and artifact semantics are
  materially different

### Alternative 2: Define Concurrent as N-to-1 only

- **Pros**: simple comparison story
- **Cons**: too narrow for roundtable, debate, and keep-all compare flows
- **Why rejected**: convergence policy should be explicit and optional, not
  hard-coded into the meaning of concurrency

### Alternative 3: Make each Code entry point its own workflow engine

- **Pros**: each surface can optimize independently
- **Cons**: repeats the mode-driven fragmentation the platform is trying to
  remove
- **Why rejected**: presets and policies are sufficient above one shared engine

## References

- [ADR-058](./058-adopt-lane-native-concurrent-group-transcript-delivery.md)
- [ADR-059](./059-adopt-a-unified-conversation-turn-lane-engine.md)
- [SPEC-043](../specs/SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-047](../specs/SPEC-047-compare-chat-concurrent-groups-and-relay.md)
- [SPEC-052](../specs/SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)

---

*Proposed: 2026-04-14*
*Proposed by: Codex*
