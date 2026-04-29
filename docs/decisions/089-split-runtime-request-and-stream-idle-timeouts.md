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

### Runtime Keepalive Contract

The 120s idle timeout is meaningful only if `cats-runtime` continues to emit
NDJSON chunks while a turn is active, **including while the runtime is waiting
for tool execution to return**. A long shell or git tool that takes minutes
must not let the stream go silent — `cats-runtime` is responsible for
periodically writing a progress / heartbeat chunk so the platform's idle
timer keeps resetting.

A turn that genuinely produces no chunks for 120 seconds is treated as a
stalled stream and aborted. If a real workload regularly exceeds 120s of
silence between chunks the answer is one of: extend `cats-runtime`'s
heartbeat cadence, raise `CATS_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS`, or split
the workload into smaller turns. Lengthening the platform timeout without
addressing keepalive is the wrong fix because it just delays the same
hang.

A future contract test on the `cats-runtime` side should assert that long
synthetic tool waits emit at least one progress chunk per
`messageIdleTimeoutMs / 2` so the platform's default budget always has at
least one keepalive within window.

### Slow Session-Create Goes Through a Structured Sink

A successful `createSession` that exceeds the configured slow-warning
threshold (default `max(2_000, sessionCreateTimeoutMs / 6)`, configurable
via `CATS_RUNTIME_SESSION_CREATE_SLOW_WARNING_MS`) emits a structured
`RuntimeClientDiagnosticRecord` (`code: 'slow_session_create'`) into a
persistent sink at `<state-dir>/runtime-client-diagnostics.local.json`.

The runtime client itself does **not** write these to stdout/stderr; the
emission goes through an injected `onClientDiagnostic` callback that the
host wires up. This matches PLAN-080's stance for provider-capability
bootstrap diagnostics: persisted records are the operator surface, startup
log spam is not. Cold-start session creates are inherently bursty and would
otherwise drown the console without adding signal.

The threshold is a fraction of the configured session-create budget (not a
fixed millisecond constant) so it stays meaningful when operators tune the
budget for slower environments.

### Error Metadata Asymmetry Between Effect and Control-Plane Calls

`RuntimeClient.createSession` and `RuntimeClient.sendMessage` are routed
through the supervision boundary (per ADR-082). Failures from those two
methods surface as `RuntimeSupervisionRejectedError` and carry structured
`toolName` + `rejectionCode` metadata that downstream Chat dispatch
preserves on system messages.

Other `RuntimeClient` methods (`getHealth`, `getProviderConfig`,
`closeSession`, `cancelSession`, `deleteSession`, `createWakeup`, etc.) are
control-plane / metadata calls and are intentionally **not** wrapped by the
supervision boundary. Their timeouts surface as raw Node `TimeoutError`
without `toolName` / `rejectionCode` fields. This asymmetry is intentional:
the boundary's evidence machinery is for runtime *effects*, not for cheap
metadata reads. Callers of control-plane methods that want richer
diagnostics should attach their own context at their call site.

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

- Session creation that exceeds the slow-warning threshold emits a structured
  `RuntimeClientDiagnosticRecord` (`code: 'slow_session_create'`) into the
  persistent runtime-client diagnostics sink. The runtime client never writes
  these to stdout/stderr; operators query the persisted file or attach their
  own `onClientDiagnostic` handler if they want different routing.
- The 120s message idle timeout assumes `cats-runtime` keeps the NDJSON stream
  warm during long tool waits (see Runtime Keepalive Contract above). A future
  contract test should pin this on the runtime side.

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
