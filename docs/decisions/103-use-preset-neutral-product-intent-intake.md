# ADR-103: Use Preset-Neutral Product Intent Intake

## Status

Proposed

## Context

SPEC-104 and ADR-101 established the direct-message MVP for explicit
`/chat`, `/work`, and `/code` commands. SPEC-105, ADR-102, and PLAN-094 then
established the no-slash path where a strong Cat can create an auditable
Work/Code proposal that the owner must confirm before any durable state is
created.

That MVP is intentionally direct-lane first. The next product need is broader:
the same owner intent should work from every current Chat, Code, and Work
preset, not only from Telegram or a direct message. The platform already treats
`+New chat`, `+Group chat`, `+Parallel chat`, `+New code`, `+Team code`,
`+Peer code`, `+New work`, `+Team work`, and `+Parallel work` as presets above
shared conversation/container semantics. Product-intent intake should follow
that shape.

If each preset grows its own command handler, semantic proposal bridge, Work
Item anchoring, and confirmation UI, the system will drift into parallel
implementations. The risk is highest for group/team/parallel surfaces, where
there may be multiple Cats or branch lanes. The platform needs one intake
contract that is parameterized by product, preset, source lane, and eligible
Cat, while preserving the safety rules from the direct MVP.

## Decision

Product-intent intake shall be a **preset-neutral Chat/Code/Work capability**.
The direct-message implementation remains the first concrete preset instance,
but it is no longer the architectural boundary.

Every supported product preset may provide a `ProductPresetIntentContext`
containing the source product, preset id, conversation/container identity,
lane or branch identity, current turn, transport, origin surface, and eligible
Cat participants. The explicit command and Cat-proposal flows consume that
context instead of checking only for `direct_message`.

The canonical supported preset set for this rollout is:

- Chat: `direct`, `new_chat`, `group_chat`, and `parallel_chat`.
- Code: `new_code`, `team_code`, and `peer_code`.
- Work: `new_work`, `team_work`, and `parallel_work`.

External transports such as Telegram enter the same contract through their
linked conversation or channel. Telegram is not a separate semantic system. If
a Telegram thread is only bound to the direct inbox, it behaves like the
existing direct preset. If it is later bound to another supported preset, the
same preset context is used.

### Explicit commands

`/chat`, `/work`, and `/code` remain deterministic platform-owned commands.
They are recognized before normal assistant dispatch in every supported preset.

- `/chat` means ordinary conversational posture for the current preset and
  source lane. It may expire unresolved proposals or abandon unconfirmed draft
  intake, but it does not close established Work Items.
- `/work` requests a Work-targeted Work Item intake anchor from the current
  preset context.
- `/code` requests a Code-targeted Work Item intake anchor from the current
  preset context.

These commands do not create new channel kinds or preset kinds. They write
append-only product-intent posture/transition segments tied to the source
preset context.

ADR-103 amends the direct-only rejection rule from SPEC-104 for future work:
non-direct usage is no longer rejected when the current surface can supply a
valid `ProductPresetIntentContext`. SPEC-104 remains the direct-lane MVP
record; SPEC-107 becomes the broader preset-neutral contract.

### Natural-language proposals

No-slash Work/Code suggestions remain Cat-authored. A strong eligible Cat in
the current preset may call the proposal-only tool when deployment policy and
owner settings allow it. Platform heuristic detection is not the default
semantic strategy.

Eligibility is preset-scoped:

- Single-recipient or direct presets use the addressed Cat.
- Group and team presets allow the current turn's addressed or active Cats to
  propose, subject to capability gates.
- Parallel and peer presets scope proposals to the child lane or branch where
  the proposal was made.

At most one product-intent proposal may be accepted per source lane and
assistant turn. Proposal tools are not exposed in the same turn as durable
Work Item, Task, Run, or Code execution tools.

### Durable anchor and metadata

The Work Item remains the durable anchor for both Work and Code intake.
Preset-neutral intake uses additive metadata such as
`metadata.productIntentIntake`, `metadata.productIntentIntakeRef`, and
`metadata.productIntent.activeAnchor` instead of growing new Core record
fields. The metadata records:

- source product and preset id;
- source conversation/container, lane or branch, turn, and segment ids;
- source transport and origin surface;
- target product (`work` or `code`);
- eligible or proposing Cat;
- capability profile kind;
- confirmation source when the intake came from a Cat proposal.

The existing `directSlashMode` metadata from the direct MVP is implementation
history. The rollout should converge to the preset-neutral metadata rather
than keep both paths as long-term compatibility contracts.

### Safety and execution boundaries

Weak or unknown Cats cannot autonomously create Work Items, Tasks, Runs, or
Code execution from any preset. They may continue ordinary conversation and may
surface a human gate where the UI supports it.

Creating or confirming a Work Item anchor remains separate from starting task,
run, or Code execution. Follow-up execution uses existing Work/Code supervision
boundaries and approval gates on a later owner turn or explicit follow-up
action.

## Consequences

### Positive

- One product-intent contract covers Chat, Code, Work, Web, mobile, and
  Telegram-linked ingress.
- Product presets stay presets above the shared conversation/container model
  instead of becoming separate command systems.
- Strong-model semantic understanding remains in the Cat, while the platform
  owns confirmation, policy, audit, and durable state.
- Parallel/team presets can create Work Items with source branch/lane context
  instead of losing where the intent came from.
- Code-targeted work continues to use the Work Item anchor before Code
  execution, preserving Work/Code visibility.

### Negative

- Group, team, parallel, and peer presets need stricter source-context metadata
  than the direct MVP.
- Existing direct-mode implementation must be generalized, which may require
  renaming metadata and tests.
- Mobile and Telegram confirmation affordances may initially need deep links
  or compact actions rather than full desktop parity.

### Neutral

- SPEC-104 and SPEC-105 remain valid as the direct-lane MVP records.
- The deployment and owner gates from ADR-102 still apply.
- Product presets may still layer product-specific coordinator or scheduling
  behavior after the Work Item anchor exists.

## Alternatives Considered

### Alternative 1: Keep direct-message intake as the only command surface

- **Pros**: Smallest implementation scope.
- **Cons**: Owners must move to a direct lane or Telegram to create Work/Code
  intake, even when they are already working inside a Code or Work preset.
- **Why rejected**: It makes presets feel inconsistent and blocks natural
  Work Item capture from the actual working surface.

### Alternative 2: Implement product-local intake independently in Chat, Code, and Work

- **Pros**: Each product can optimize its own flow quickly.
- **Cons**: Duplicates command parsing, confirmation, suppression, capability
  gates, Work Item metadata, and tests.
- **Why rejected**: The platform already has one conversation/container model.
  Product-intent intake should be parameterized by preset context, not forked.

### Alternative 3: Use a platform semantic classifier for every preset

- **Pros**: Simple central routing and works without provider tool calls.
- **Cons**: Reintroduces the heuristic ownership problem rejected by ADR-102,
  with higher cost and false-positive risk across more surfaces.
- **Why rejected**: Natural-language meaning belongs to the strong Cat in the
  conversation. The platform should enforce policy and confirmation.

### Alternative 4: Let strong Cats create Work Items directly from no-slash text

- **Pros**: Fastest user path from intent to durable work.
- **Cons**: Casual conversation can create durable product state without an
  explicit owner confirmation.
- **Why rejected**: No-slash intake remains proposal-only until the owner
  confirms.

## References

- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](./101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [ADR-102: Use Cat-Authored Product Intent Proposals for Natural-Language Intake](./102-use-cat-authored-product-intent-proposals.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](../specs/SPEC-104-direct-chat-slash-mode-work-intake.md)
- [SPEC-105: Direct Chat Cat-Proposed Product Intent Confirmation](../specs/SPEC-105-direct-chat-implicit-product-intent.md)
- [SPEC-107: Preset-Neutral Product Intent Intake](../specs/SPEC-107-preset-neutral-product-intent-intake.md)
- [PLAN-096: Preset-Neutral Product Intent Intake Rollout](../plans/PLAN-096-preset-neutral-product-intent-intake-rollout.md)
- [Product Integration Guide](../product-integration-guide.md)

---

*Created: 2026-05-09*
*Decision makers: Owner, Codex*
