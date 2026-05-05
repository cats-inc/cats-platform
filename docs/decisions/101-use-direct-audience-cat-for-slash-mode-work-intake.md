# ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake

## Status

Proposed

## Context

Cats needs an MVP path where the owner can message a Cat from Telegram or Web
Chat, use slash commands to switch the conversation posture, and let the system
turn a clarified request into durable Work / Code execution.

The important constraint is that this MVP starts from a `direct_message`.
There is exactly one audience Cat. Introducing a separate Concierge Cat, a
separate Conductor Cat, or a hidden worker hand-off inside this direct lane
would contradict the user model: the owner is talking to one Cat and expects
that Cat to carry the request forward if it is capable enough.

Existing docs already establish the lower layers:

- ADR-091 separates domain topology (`direct_message` vs `chat_channel`) from
  entry UI presets and retired composer-mode labels.
- ADR-082 and SPEC-082 define provider capability profiles and per-action
  supervision policy.
- PLAN-080 makes strong/weak bootstrap explicit through operator-owned
  provider capability config. Product code must not guess strength from a
  provider name, model label, or delivery richness.

The missing decision is how a direct chat command such as `/work` or `/code`
maps into Work Item intake and supervised Work/Code execution without inventing
new Chat modes or a second strong/weak classifier.

## Decision

For the direct-chat MVP, slash-mode work intake uses the **same direct audience
Cat** as the request owner and follow-up agent.

`Concierge` and `Conductor` are phases of the same direct audience Cat, not two
different Cats:

- **Concierge phase**: the Cat understands the request, asks clarifying
  questions, and receives a posture/capability-gated Work Item creation tool
  with a strict intake schema.
- **Follow-up / execution phase**: the same Cat continues from that durable
  anchor, receives task/run follow-up tools when policy allows them, and
  reports progress back to the same direct lane.

The identity is the same, but the supervised tool surface is phase-sensitive.
The MVP must not rely on a generic unchanged prompt and hope the model infers
when to create durable work. Concierge prompt/tool/schema and follow-up
task/run tools are separate policy grants over the same Cat.

Tool grants are also turn-bounded. After Concierge phase calls `createWorkItem`
successfully in an assistant turn, the Conductor tools (`createTask`,
`createRun`) shall not be exposed in the same turn. The Cat completes that
turn by surfacing the new Work Item to the user, and Conductor tools become
available starting from the next user turn. SPEC-082 approval gates still
apply on top of this turn separation. The constraint prevents the Cat from
chaining anchor creation directly into supervised execution within a single
dispatch, which would surprise the user and bypass the natural acknowledgement
step.

The platform shall not hand the direct MVP off to another Cat unless the owner
explicitly changes the addressed Cat or a future group/orchestration feature
introduces that behavior in a separate ADR/SPEC.

### Slash intent is product posture, not channel taxonomy

The first direct-message intent commands are:

- `/chat` — ordinary direct conversation; no durable Work Item anchor is
  created by default.
- `/work` — direct work-intake posture; clarified requests may create a Work
  Item and later task/run execution.
- `/code` — direct coding posture; clarified requests use the same Work Item
  anchor flow with a Code target before task/run execution begins.

These commands do not create new persistent channel kinds. The domain topology
remains `direct_message`. The command affects the current product posture and
materialization path for subsequent turns.

The posture change is recorded as a message-stream system segment/event. A lane
may keep a current-state cache for routing convenience, but that cache is not
the audit source of truth. Later Work Item anchors must be replayable back to
the exact command segment that switched posture.

A `/chat` posture change clears the lane's active-anchor cache. The Work Item
itself stays in the Work product surface and remains addressable from there.
A subsequent `/work` or `/code` posture change in the same lane does not
auto-resume the prior anchor; it starts a fresh intake. Resuming an existing
Work Item from a direct lane is out of scope for this MVP and would require
an explicit selection UI covered by SPEC-104's open question on multi-anchor
selection. The active-anchor cache is also cleared when the linked Work Item
reaches a terminal `CoreWorkItemStatus` (`completed`, `cancelled`, or
`archived`).

For the MVP, `/code` is not a separate direct-to-run bypass. `/code` uses the
same Work Item anchor flow as `/work`, with `targetProduct: 'code'` and a
Code-bound next action. Code execution starts only after the Work Item anchor
exists and the supervised Code/Work boundary allows the follow-up task/run.

### Capability gate uses existing supervision

The direct audience Cat is mapped to its execution target, and that target is
resolved through the existing provider capability profile mechanism.

Product code shall not add another strong/weak classifier. The relevant profile
kinds are still:

- `strong_agent`
- `weak_worker`
- `unknown`

Behavior:

- `strong_agent`: the Cat may autonomously ask clarifying questions and create
  the durable Work Item anchor once the request is sufficiently clear, subject
  to normal supervision policy, approval gates, budget, and tool boundaries.
- `weak_worker` or `unknown`: the Cat may help discuss and clarify, but it shall
  not autonomously create durable Work Items, Tasks, Runs, or Code execution.
  The Orchestrator shall ask the human to create/confirm the durable work
  object or switch to a stronger Cat.

Unknown is not treated as strong by default. Strong treatment must come from the
existing provider capability evidence path.

### Human gate for weak / unknown direct Cats

When the direct audience Cat is `weak_worker` or `unknown`, the MVP does not
auto-escalate to another Cat. The safe behavior is a human gate:

- explain that this Cat cannot autonomously take durable work action;
- offer a human-confirmed create path, if the UI supports it;
- allow the owner to continue chatting or switch to a strong Cat.

This keeps weak-model behavior useful without pretending that a weak model can
own durable work intake.

## Consequences

### Positive

- The direct-message mental model stays simple: one Cat, one lane, one
  continuity thread.
- The MVP reuses existing provider capability and supervision policy instead of
  creating new strong/weak flags.
- `/chat`, `/work`, and `/code` become product intent commands without adding
  stale Chat mode labels.
- Work Item creation is gated by actual execution capability, not by UI entry
  labels such as default/group/parallel.
- Weak/unknown Cats fail safe through a human gate rather than silently creating
  durable work records.

### Negative

- The first MVP cannot demonstrate multi-Cat delegation from a direct lane.
- A weak direct Cat may feel limited in `/work` mode because durable actions
  require human confirmation.
- The bridge from direct audience Cat to execution target to capability profile
  must be explicit and well-tested; otherwise product code may accidentally
  drift back into ad hoc provider-name checks.

### Neutral

- Existing group, parallel, and non-direct chat behavior is unchanged.
- Existing Work supervised-run and Code run machinery remain the execution
  substrate. This ADR decides the direct-chat entry contract, not a new run
  engine.
- Telegram and Web Chat share the same command semantics, but transport-control
  commands such as `/start` and `/help` remain separate from product intent
  commands.

## Alternatives Considered

### Alternative 1: Concierge Cat hands off to a separate Conductor Cat

- **Pros**: Clean role separation and easier future multi-agent demos.
- **Cons**: Violates the direct-message premise. The owner addressed one Cat,
  but the system would silently switch identity.
- **Why rejected**: Multi-Cat delegation belongs to group/orchestration flows,
  not the first direct-message MVP.

### Alternative 2: Weak direct Cat escalates automatically to a strong Cat

- **Pros**: More automation; fewer user interruptions.
- **Cons**: Introduces hidden recipient changes and unclear ownership of the
  resulting Work Item.
- **Why rejected**: The MVP should ask the human to confirm durable work action
  or explicitly switch Cats.

### Alternative 3: Add a new Chat mode taxonomy for `/work` and `/code`

- **Pros**: Straightforward routing branch names.
- **Cons**: Reintroduces the mode taxonomy that ADR-091 retired; risks leaking
  product posture into persistent channel shape.
- **Why rejected**: Slash intent is product posture. The channel remains
  `direct_message`.

### Alternative 4: Infer strong/weak from provider or model names

- **Pros**: Quick demo path.
- **Cons**: Contradicts PLAN-080 and makes provider capability opaque.
- **Why rejected**: Existing capability profile config and evidence are the
  accepted source of truth.

## References

- [ADR-082: Recast the Orchestrator as a Capability Shell with Policy-Dial Supervision](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-091: Retire `composerMode` in Favor of Channel Intent](./091-retire-composer-mode-cat-led-in-favor-of-recipient-state.md)
- [PLAN-080: Provider Capability Bootstrap Config Rollout](../plans/PLAN-080-provider-capability-bootstrap-config-rollout.md)
- [SPEC-038: Telegram Bot Commands and Transport Control Surface](../specs/SPEC-038-telegram-bot-commands-and-transport-control-surface.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](../specs/SPEC-104-direct-chat-slash-mode-work-intake.md)

---

*Decision made: 2026-05-06*
*Decision makers: Owner, Codex*
