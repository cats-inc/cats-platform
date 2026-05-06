# ADR-102: Use Cat-Authored Product Intent Proposals for Natural-Language Intake

## Status

Proposed

## Context

SPEC-104 defines explicit direct-chat product commands: `/chat`, `/work`, and
`/code`. Those commands are product control inputs and should remain
deterministic platform behavior.

SPEC-105 and PLAN-093 then explored a no-slash path where ordinary direct-chat
text is classified by a platform-owned heuristic detector. That path is safe in
one narrow sense because it still requires owner confirmation before durable
Work/Code materialization. However, it has the wrong long-term ownership model:

- natural-language meaning is being inferred by product code instead of the
  Cat that is already reading the conversation;
- every new language or phrasing style risks another keyword list or regex;
- false-positive control turns into product-side semantic tuning;
- the owner sees a system suggestion instead of the Cat explicitly asking for
  approval to turn the request into Work/Code.

The desired model is different. The platform should own commands, policy,
confirmation, audit, and durable state. A strong Cat should own semantic
understanding of ordinary language and may ask the owner to approve a product
intake proposal.

## Decision

Natural-language Work/Code intake shall be driven by **Cat-authored proposal
tools**, not by platform-owned semantic heuristics.

The explicit command surface remains platform-owned:

- `/chat` means ordinary conversational posture. It is valid inside a lane that
  has Work context; it does not close an established Work Item or erase source
  context. It only prevents the current turn from advancing Work/Code intake or
  execution. For an unconfirmed draft intake, `/chat` may still abandon the
  draft to avoid orphan records.
- `/work` enters deterministic Work intake through SPEC-104.
- `/code` enters deterministic Code-targeted Work intake through SPEC-104.

For ordinary no-slash direct-chat text:

1. The message is dispatched to the addressed direct Cat as ordinary chat.
2. If the direct Cat is capability-gated as `strong_agent`, and proposal
   suggestions are enabled by deployment policy and owner settings, the
   platform may expose a proposal-only tool such as
   `proposeProductIntake`.
3. The Cat may call that tool to ask the owner whether the current conversation
   should become Work or Code intake.
4. The tool call writes an append-only proposal/candidate system segment. It
   must not create a Work Item, Task, Run, active anchor, or Code execution.
5. Owner confirmation bridges into SPEC-104 with source metadata preserving the
   original owner message and Cat proposal. Decline or ignore leaves the lane in
   ordinary chat.

Weak or unknown direct Cats do not receive the proposal tool. They may still
answer conversationally and can tell the owner to use `/work` or `/code`, but
they cannot generate confirmable product-intake proposals.

The deterministic heuristic detector from PLAN-093 is not the normative
natural-language path. It may remain temporarily as an experimental prefilter or
fallback only when explicitly enabled. It must not be the default behavior for
new deployments, and it must remain behind both deployment configuration and
owner-facing settings.

### Configuration Contract

Natural-language product suggestions have two gates:

1. **Deployment gate**:
   `CATS_CHAT_NATURAL_PRODUCT_INTENT_MODE=off|cat_tool|heuristic_prefilter`
   - `off`: no no-slash product suggestions.
   - `cat_tool`: expose proposal tools to eligible strong direct Cats.
   - `heuristic_prefilter`: allow the old deterministic detector as an
     experimental prefilter/fallback. This mode is not a default.
2. **Owner setting**:
   a user-facing "Suggest Work/Code from chat" setting controls whether the
   owner wants natural-language proposals at all.

The effective mode is the stricter of the two gates. Explicit `/chat`, `/work`,
and `/code` commands are always available and are not disabled by this setting.
Until the Cat proposal tool path ships, the deployment default shall be `off`.
After that path ships, the deployment default may become `cat_tool`, but it
shall not default to `heuristic_prefilter`.

## Consequences

### Positive

- Multilingual semantic understanding belongs to the Cat/model instead of a
  platform keyword list.
- Platform code focuses on policy, confirmation, and durable state boundaries.
- The user sees the Cat ask for permission, which matches the mental model of
  "the Cat thinks this should become Work."
- Weak/unknown Cats remain safe because they never receive the proposal tool.
- The existing SPEC-104 confirmation and Work Item path remains the only
  durable materialization path.

### Negative

- The MVP needs a provider/tool-call path before no-slash suggestions work
  correctly.
- Providers without tool calling cannot participate in Cat-authored proposals
  unless the platform adds a separate structured-output bridge.
- A pure chat reply from the Cat is no longer enough; proposal intent must be a
  structured tool call so the platform can audit and confirm it.

### Neutral

- Explicit commands still cover every path manually, so losing the heuristic
  detector does not block the MVP.
- The heuristic implementation from PLAN-093 can be kept as experimental code
  during migration, then removed once Cat-authored proposals are stable.

## Alternatives Considered

### Alternative 1: Keep improving platform heuristics

- **Pros**: simple, local, cheap, already partially implemented.
- **Cons**: creates language-specific hardcode and makes platform code own
  semantic interpretation.
- **Why rejected**: It scales poorly across languages and contradicts the
  product model that the Cat is the semantic participant in the conversation.

### Alternative 2: Provider-backed classifier before every ordinary message

- **Pros**: better semantic quality than regex and multilingual by default.
- **Cons**: adds a hidden LLM call per chat message, increases cost/latency,
  and still keeps semantic ownership outside the addressed Cat.
- **Why rejected**: If a strong model is already the direct Cat, it should make
  the proposal in-band through an auditable tool call.

### Alternative 3: Let the Cat directly create Work Items from ordinary chat

- **Pros**: shortest path from understanding to durable work.
- **Cons**: bypasses owner confirmation and makes casual chat too risky.
- **Why rejected**: No-slash natural-language intake must remain proposal-only
  until the owner confirms.

## References

- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](./101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](../specs/SPEC-104-direct-chat-slash-mode-work-intake.md)
- [SPEC-105: Direct Chat Implicit Product Intent Confirmation](../specs/SPEC-105-direct-chat-implicit-product-intent.md)
- [PLAN-093: Direct Chat Implicit Product Intent Rollout](../plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md)
- [PLAN-094: Cat-Proposed Product Intent Rollout](../plans/PLAN-094-cat-proposed-product-intent-rollout.md)

---

*Decision made: 2026-05-06*
*Decision makers: Owner, Codex*
