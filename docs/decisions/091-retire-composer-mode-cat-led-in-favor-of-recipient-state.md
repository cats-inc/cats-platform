# ADR-091: Retire `composerMode = cat_led` in Favor of Per-Turn Recipient State

> Finish the retirement that ADR-055 began: remove the persisted `composerMode`
> field and its `cat_led` value from Chat, and route every dispatch off
> recipient state alone so the orchestrator stays the single deterministic
> router that ADR-082 declared it would be.

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

Retire the `composerMode` enum entirely. Specifically:

- **Remove the type** `ComposerMode = 'solo' | 'cat_led'` from
  `src/products/chat/api/contracts.ts` and the duplicate in
  `src/products/shared/api/workspaceContracts.ts`.
- **Stop persisting** `composerMode` on channel records. New channels do
  not write the field; existing channels keep it as legacy data and the
  read path ignores it.
- **Rewrite mentionRouter** to derive routing solely from per-turn recipient
  state plus the channel's `defaultRecipientId`:
  - Explicit `@mention` → that participant (unchanged).
  - No `@mention` and `defaultRecipientId` is set → orchestrator decides
    (it may still elect to route to the default recipient as a deterministic
    rule, but the decision is owned by the orchestrator's routing, not by a
    short-circuit in the mention router). This is the ADR-082 alignment.
  - No `@mention` and no `defaultRecipientId` → orchestrator handles the
    turn directly (today's `solo` behaviour).
- **Move the `defaultRecipientId` "speak first" rule** into the orchestrator
  routing layer. The mention router stops reading `composerMode`.
- **Remove the legacy enum values** `'missing_cat_led_recipient'` and
  `'cat_led_recipient'` from `src/shared/roomRouting.ts`. Replace call sites
  with the recipient-state equivalents (`'missing_default_recipient'` /
  `'default_recipient'`).
- **Replace UI gates** that key on `composerMode === 'cat_led'` with checks
  on the channel's `defaultRecipientId` plus its `roomMode` (whichever
  combination expresses the same intent).

The migration is staged so persisted state stays valid throughout:

1. **Slice 1 — read-side compatibility shim.** Add a derivation function
   `deriveLegacyComposerMode(channel)` that returns `'cat_led'` if
   `roomMode === 'direct_cat_chat'` or `defaultRecipientId` is set,
   otherwise `'solo'`. Replace every existing read of
   `channel.composerMode` with the derivation. Persisted reads still parse
   the legacy field (forward-compatible) but no read site depends on the
   field's presence.
2. **Slice 2 — stop writing the field.** Channel creation no longer infers
   or persists `composerMode`. The read derivation continues to produce the
   same value for existing channels (because `roomMode` /
   `defaultRecipientId` are still set).
3. **Slice 3 — rewrite the routing branch.** Replace the
   `composerMode === 'cat_led'` short-circuit in `mentionRouter` with a
   call into the orchestrator routing layer that takes
   `defaultRecipientId` as input. Tests pin the same dispatch decisions as
   before for both `solo`-derived and `cat_led`-derived channels.
4. **Slice 4 — remove the type and the legacy enum values.** Delete
   `ComposerMode` from chat contracts, delete
   `'missing_cat_led_recipient'` and `'cat_led_recipient'` from
   `src/shared/roomRouting.ts`, and rename remaining identifiers
   (`composerMode`, `inferredComposerMode`, `cat_led_thread`) to recipient-
   state language.
5. **Slice 5 — drop the read-side compatibility shim.** After one release
   cycle the derivation function and the legacy persisted field are
   removed.

Slices 1-3 are reversible; slice 4 is the contract-breaking commit and
must land together with slice 3's tests passing. Slice 5 is a separate
follow-up.

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
  `src/shared/roomRouting.ts` enum. Slices 3 and 4 are coordinated edits
  that cannot land independently without breaking the dispatch.
- One release cycle of read-side compatibility shim adds temporary
  derivation logic. Slice 5 must follow within one release to avoid the
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
