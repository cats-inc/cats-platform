# ADR-091: Retire `composerMode = cat_led` in Favor of Channel Intent

> Finish the retirement that ADR-055 began: remove the `cat_led` routing
> shortcut from Chat, split channel intent into explicit derived predicates,
> and keep the orchestrator as the single deterministic router that ADR-082
> declared it would be.

## Status

Proposed

> Completes ADR-055 ("Retire lead semantics and separate composer recipients
> from dispatch policy"). Restores the ADR-082 invariant that **deterministic
> routing is an orchestrator responsibility**, not a parallel branch in the
> mention router.

## Context

Two prior decisions left an unresolved seam:

- **ADR-055** (2026-04-08) retired the *language* of lead Cats: it renamed
  `leadParticipantId` → `defaultRecipientId`, removed the lead badge from the
  composer, and unified the composer chip slot. It did **not** remove the
  `composerMode: 'cat_led'` enum, the channel field that persists it, or the
  dispatch branch that reads it.
- **ADR-082** (2026-04-25) declared that the platform orchestrator owns
  deterministic routing — explicit `@mention` resolution, channel-wired
  dispatch to a named target, and weak-model SOP fallback. It did not address
  the existing `cat_led` short-circuit in `mentionRouter`.

The result is a grey zone:

- `src/products/chat/state/mentionRouter.ts:178-207` short-circuits to the
  `defaultRecipientId` participant whenever `channel.composerMode === 'cat_led'`,
  bypassing the orchestrator entirely. This is a *second* deterministic router
  living outside the orchestrator system layer.
- `src/products/chat/state/chat-snapshot/entities.ts:314-322` infers and
  persists the field at channel creation time, so every existing channel
  records one of `'solo'` or `'cat_led'` as a permanent routing decision.
- `src/shared/roomRouting.ts:30,37` still defines
  `'missing_cat_led_recipient'` and `'cat_led_recipient'` enum values; this
  file is a frozen shared contract per `CLAUDE.md`, so the legacy values are
  load-bearing across product code.
- 34 source files reference `cat_led` directly, including UI workflow-shape
  gates in `WorkspaceProductApp.tsx`, session-launch branches, and Guide Cat
  assist scope tables.

The split is a maintenance trap: every new routing rule has to choose
between living in the orchestrator (ADR-082's home) or the mentionRouter
short-circuit (cat_led's home). Neither side is wrong on its own; the
divergence is the bug.

## Decision

Retire `cat_led` as a routing concept. `composerMode` may remain as a legacy
wire/storage field during the migration, but no routing rule may depend on
`composerMode === 'cat_led'`.

- **Split channel intent into derived predicates** instead of overloading
  `composerMode`:
  - provider solo thread: no active participants, not a direct lane, and an
    optional pending provider/model target;
  - direct participant lane: `roomMode === direct_cat_chat` / direct-lane
    topology, always routed to the direct participant;
  - participant room: non-direct room with active participants; supports
    audience selection and workflow-shape controls, but does not own default
    routing.
- **Rewrite mentionRouter** so no non-direct participant room bypasses the
  orchestrator:
  - Explicit `@mention` → that participant (unchanged).
  - Direct lane with no `@mention` → direct participant (unchanged).
  - Non-direct room with no `@mention`, even when `defaultRecipientId` is set
    → orchestrator handles the turn first. The default recipient remains room
    context the orchestrator may use, not an automatic target.
  - No `@mention` and no `defaultRecipientId` → orchestrator handles the
    turn directly (today's `solo` behaviour).
- **Treat this as an intentional product behavior change** for group and
  parallel participant rooms. The old behavior made the default participant
  speak first deterministically. The new behavior makes the orchestrator speak
  first unless the operator explicitly mentions a participant or chooses a
  per-turn audience.
- **Remove the legacy enum values** `'missing_cat_led_recipient'` and
  `'cat_led_recipient'` from `src/shared/roomRouting.ts`. Replace call sites
  with the recipient-state equivalents (`'missing_default_recipient'` /
  `'default_recipient'`).
- **Replace UI gates** that key on `composerMode === 'cat_led'` with explicit
  channel-intent predicates such as `supportsParticipantAudienceSelection`.

This preserves two existing behaviors:

- Pure provider/model solo chats (`+ New chat` and pure provider branches in
  `+ Parallel chat`) continue to send the operator's message directly to the
  selected provider/model.
- Direct/private lanes continue to route directly to the selected participant.

It intentionally changes one behavior:

- Group/parallel participant rooms no longer auto-dispatch a no-mention turn
  to `defaultRecipientId`. They route to the orchestrator first.

The migration is staged so persisted state stays valid throughout:

1. **Slice 1 — channel-intent helpers.** Add derived predicates for provider
   solo, direct participant lane, participant room, and participant-audience
   support. Replace routing/session reads that currently depend on
   `composerMode === 'solo'` or `composerMode === 'cat_led'` with the derived
   predicates.
2. **Slice 2 — routing behavior change.** Remove the
   `composerMode === 'cat_led'` short-circuit in `mentionRouter`. Direct lanes
   still route directly to their participant; non-direct participant rooms
   route no-mention turns to the orchestrator.
3. **Slice 3 — UI gate cleanup.** Replace active audience/workflow-shape gates
   and conversation-mode naming with participant-room predicates and neutral
   labels.
4. **Slice 4 — storage/contract cleanup.** Stop writing `composerMode`; keep
   read-side compatibility for persisted records while API/read models migrate
   to explicit derived fields.
5. **Slice 5 — remove the type and the legacy enum values.** Delete
   `ComposerMode` from chat contracts, delete
   `'missing_cat_led_recipient'` and `'cat_led_recipient'` from
   `src/shared/roomRouting.ts`, and rename remaining identifiers
   (`composerMode`, `inferredComposerMode`, `cat_led_thread`) to recipient-
   state language.
6. **Slice 6 — drop read-side compatibility.** After one release
   cycle the derivation function and the legacy persisted field are
   removed.

Slices 1-3 are reversible. Slice 4 starts the wire/storage migration. Slice 5
is the contract-breaking cleanup and must land only after the product surfaces
no longer depend on `composerMode`.

## Consequences

### Positive

- ADR-082's "orchestrator owns deterministic routing" invariant is
  restored. There is exactly one deterministic router.
- ADR-055's intent is fully realized: lead semantics is gone in name **and**
  in storage shape; per-turn recipients + dispatch policy is the only mental
  model.
- Channel records get smaller and one frozen-contract enum shrinks.
- New routing rules have a single home (orchestrator routing) and do not
  have to choose between two deterministic branches.

### Negative

- Touches 34 source files, the chat API contract, and the frozen shared
  `src/shared/roomRouting.ts` enum. Slices 4 and 5 are coordinated edits
  that cannot land independently without breaking the dispatch.
- Non-direct participant rooms lose the old no-mention direct-to-default
  behavior. Users who want a specific participant to answer must mention that
  participant, choose a per-turn audience, or rely on the orchestrator to route
  the work.
- One release cycle of read-side compatibility shim adds temporary
  derivation logic. Slice 6 must follow within one release to avoid the
  shim becoming permanent.
- Existing channels do not get a behaviour change at slice 1; the
  derivation produces the same value. But any test or product surface that
  expected `composerMode` to be a *stable, persisted* field rather than a
  *derived* one needs updating.

### Neutral

- Channel creation paths (`+ New chat`, `+ Group chat`, `+ Parallel chat`)
  do not need new UX. They keep setting `roomMode` and (for `+ New chat` /
  `+ Group chat` with a default recipient) `defaultRecipientId`. The
  derivation handles the rest.

## Alternatives Considered

### Adopt `cat_led` as an orchestrator-owned routing rule

- **Pros**: Smaller diff. Keeps the existing dispatch decisions verbatim.
- **Cons**: Still leaves the `composerMode` enum in the persisted channel
  record. Future routing rules still have to choose between
  "orchestrator-owned" and "channel-mode-owned" placement. The
  channel-mode branch becomes a special case the orchestrator must
  remember.
- **Why rejected**: This is the half-fix that ADR-055 already attempted.
  Repeating it would just push the grey zone forward by one ADR cycle.

### Leave `cat_led` in place as legacy

- **Pros**: Zero risk. No migration.
- **Cons**: The grey zone keeps biting every time a new ADR touches
  routing or channel modes. The ADR-082 invariant stays nominally
  declared but actually violated by the running code.
- **Why rejected**: ADR-055 is already amended once; layering more amendments
  on top of unfinished cleanup is the pattern this ADR is trying to break.

## References

- [ADR-055: Retire lead semantics and separate composer recipients from dispatch policy](./055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md)
- [ADR-082: Recast the orchestrator as a capability shell with policy-dial supervision](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [ADR-042: Separate channel topology from routing mode](./042-separate-channel-topology-from-routing-mode.md)
- `src/products/chat/state/mentionRouter.ts:178-207` — current `cat_led` short-circuit
- `src/products/chat/state/chat-snapshot/entities.ts:314-322` — current `composerMode` inference + persistence
- `src/shared/roomRouting.ts:30,37` — frozen enum values to remove

---

*Proposed: 2026-04-29*
*Proposed by: Claude, after the owner flagged that `cat_led` still bypasses the orchestrator's deterministic routing.*
