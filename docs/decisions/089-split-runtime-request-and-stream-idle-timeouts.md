# ADR-089: Split Runtime Request and Stream Idle Timeouts

> Keep supervised runtime boundaries intact while using timeout budgets that
> match the shape of each runtime call.

## Status

Accepted

## Context

`CatsRuntimeClient` originally used one short request timeout for most runtime
HTTP calls. That was appropriate for health checks and small metadata reads,
but too short for Chat turns backed by large-context provider sessions. A
large-context first send can spend several seconds preparing context before the
runtime emits any NDJSON event.

The first attempted fix removed the Chat interactive runtime path from the
supervision boundary. That changed the error shape but broke the ADR-082
invariant that runtime effects flow through supervised tool boundaries and
produce evidence. The corrected direction is to keep the boundary and fix the
runtime timeout budgets.

Runtime calls have different timing semantics:

- health, setup, provider reads, wakeups, cancel, close, and delete are short
  request/response calls
- session creation may involve provider/workspace startup and should have a
  longer request timeout
- message send is an NDJSON streaming endpoint and should not use a fixed
  wall-clock timeout for the whole stream

## Decision

Use three separate timeout policies in the platform runtime client:

- short request timeout: `5s`, used for metadata and control-plane calls
- session-create timeout: `60s`, configured by
  `CATS_RUNTIME_SESSION_CREATE_TIMEOUT_MS`
- message stream idle timeout: `120s`, configured by
  `CATS_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS`

The message timeout is an idle timeout. It starts when the message request is
issued and resets each time the runtime emits another NDJSON chunk. A long
turn can run longer than 120 seconds as long as progress continues. A stalled
turn with no new chunks for 120 seconds is aborted.

Dedicated timeouts do not inherit from the short `timeoutMs` option. A caller
that tunes short metadata requests must not accidentally shrink session
creation or message streaming back to the short budget.

The Chat runtime boundary remains supervised. Chat, Work, and Code runtime
create/send cutover points must continue to call the supervision runtime
boundary rather than direct `RuntimeClient.createSession` or
`RuntimeClient.sendMessage`.

## Consequences

### Positive

- Large-context Chat turns keep ADR-082 supervision evidence and no longer fail
  only because the short metadata timeout elapsed.
- Long streaming turns can exceed 120 seconds when the provider keeps emitting
  chunks.
- Slow or stalled streams are still bounded by an idle timeout.
- Short metadata calls remain quick failure probes.

### Negative

- Runtime timeout behavior is now slightly more complex than one global
  request timeout.
- A slow session creation can take up to the configured session-create budget
  before surfacing as a failure.

### Neutral

- Session creation logs a warning when it succeeds slower than the platform's
  slow-start threshold so startup regressions remain visible without failing
  otherwise valid cold starts.

## Alternatives Considered

### One Global Long Timeout

- **Pros**: Simple and avoids large-context first-send failures.
- **Cons**: Health checks and metadata reads would become sluggish failure
  probes.
- **Why rejected**: Runtime control-plane calls and generation calls have
  different latency contracts.

### Fixed Wall-Clock Timeout for Message Streams

- **Pros**: Easy to implement with `AbortSignal.timeout`.
- **Cons**: Kills valid long streams even when chunks are arriving regularly.
- **Why rejected**: NDJSON generation is a streaming contract; timeout should
  measure idle time, not total wall-clock duration.

### Unsupservised Chat Interactive Runtime Calls

- **Pros**: Avoids supervision wrapper error text and temporarily restores the
  previous direct call shape.
- **Cons**: Violates ADR-082 supervision/evidence invariants for Chat runtime
  effects.
- **Why rejected**: The root issue is timeout policy, not the supervision
  boundary.

## References

- [ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)

---

*Decision made: 2026-04-29*
*Decision makers: Codex, user*
