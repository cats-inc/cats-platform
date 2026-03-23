# SPEC-030: Composer-Scoped Lead Cat and Boss Auto-Helper Semantics

Status: Draft (Pending Review)

## Summary

Define the conversation-control model for `Recents` threads without forcing a
visible `Boss Chat` identity on every thread.

This spec focuses only on:

- the composer-scoped execution control
- lead-Cat semantics for normal `Recents` chats
- `Boss Cat` background auto-helper behavior
- clicking the composer avatar to edit Cat preset settings

This spec explicitly does **not** define chat-header visuals, transcript
styling, or `My Cats` private-lane UI changes.

## Current-State Migration Note

The current landed product behavior still includes older Boss-led new-chat
assumptions in parts of the implementation.

This spec intentionally changes that direction for ordinary `Recents` threads.
Follow-on implementation should therefore:

- stop auto-assigning `Boss Cat` as the visible lead participant for a normal
  `+ New Chat`
- stop auto-sending a visible `Boss Cat` greeting merely because a normal
  `Recents` thread was opened
- add explicit state that distinguishes solo composer mode from Cat-led mode
  for normal `Recents` threads

This migration note is about ordinary `Recents` chats only.
It does not change `My Cats` direct lanes.

## Goals

- Keep `+ New Chat` close to familiar model-first AI chat UX
- Make the composer control truthful about who or what will answer the next
  unmentioned turn
- Allow the first added Cat to become the visible default counterpart in a
  normal chat thread
- Keep `Boss Cat` orchestration authority available without forcing `Boss Cat`
  to be the visible front-stage speaker in every `Recents` thread
- Preserve per-message provider/model provenance even when a thread changes
  mode over time
- Keep `My Cats` direct lanes unchanged

## Non-Goals

- Defining chat-header layout, badges, or stacked-avatar presentation
- Changing `My Cats` private-lane behavior
- Finalizing all participant-management UI outside the composer affordance
- Defining every future multi-Cat workflow or approval UX
- Shipping per-thread Cat-preset overrides in this slice

## User Stories

- As an operator, I want `+ New Chat` to begin like a normal AI chat where I
  choose what model the next message will use.
- As an operator, when I add one Cat into the current thread, I want that Cat
  to become the default counterpart instead of feeling like I am now talking to
  both that Cat and a hidden second speaker.
- As an operator, I want the composer control to show the current lead Cat with
  a compact avatar-only affordance rather than a noisy identity header.
- As an operator, I want clicking that avatar to let me quickly inspect or edit
  the Cat's preset, understanding that the preset is reused in other places.
- As an operator, I want `Boss Cat` to remain able to orchestrate when present,
  even if another Cat is the visible lead speaker.
- As an operator, if I add a Cat after several solo turns already exist, I want
  the system to handle that history transition intentionally rather than
  ambiguously.

## Scope Split

This spec applies to:

- normal topic threads under `Recents`
- composer execution controls in those threads
- participant-role semantics that affect how the next turn is routed

This spec does not apply to:

- `My Cats` direct lanes
- transport-specific transcript presentation
- chat header redesign
- suite-level navigation

## Core Decision

`Recents` threads may begin in a **solo** composer mode with no visible Cat.
The composer then shows a model/provider selector for the **next** outgoing
turn only.

When the operator adds the **first** Cat into that thread:

- the thread becomes **Cat-led**
- that Cat becomes the thread's `leadCat`
- the composer control switches from a model selector to the lead Cat's
  avatar-only affordance
- unmentioned turns default to that Cat

When additional Cats are added:

- one Cat remains the `leadCat`
- non-`Boss Cat` participants default to `mention-only`
- `Boss Cat`, when present and not lead, defaults to `auto-helper`

`Boss Cat` orchestration authority is separate from front-stage speaker status.
If `Boss Cat` is the lead, it still retains orchestration authority.

## Conversation Modes

### 1. Solo Composer Mode

Definition:

- no visible Cat participant controls the next turn
- no lead Cat is set for the thread
- the composer shows a provider/model selector

Behavior:

- the selector controls the pending execution target for the **next** outgoing
  turn
- the selector does not claim to rewrite the whole thread's historical model
  identity
- each sent message must still record its actual provider/model provenance

### 2. Single-Cat Led Mode

Definition:

- one Cat is present and is the thread `leadCat`
- the composer shows that Cat as an avatar-only affordance

Behavior:

- unmentioned turns default to the lead Cat
- the lead Cat's preset defines the execution preset for normal turns in that
  thread
- the user is no longer expected to think in terms of "a model plus a Cat";
  the visible conversation counterpart is that Cat

### 3. Multi-Cat Team Mode

Definition:

- multiple Cats participate in the same thread
- exactly one Cat remains `leadCat`

Behavior:

- the composer still shows the `leadCat` avatar only
- unmentioned turns default to the lead Cat
- explicit `@mentions` may override the next-turn target
- additional participants are governed by participation-policy rules below

## Composer Control Rules

### Solo Composer Control

When the thread has no lead Cat:

- the composer must show a model/provider selector
- that selector controls the pending execution target for the next outgoing
  turn
- the selector belongs in the composer, not the header, because it affects the
  next message rather than claiming ownership of all historical messages

### Cat-Led Composer Control

When the thread has a lead Cat:

- the composer must show the lead Cat as an avatar-only control
- it must not show the Cat name inline in that control
- hover or tooltip may still expose the Cat name
- clicking the avatar opens Cat settings or a Cat side panel

### Avatar Click Behavior

Clicking the composer avatar opens a Cat-focused inspect/settings surface.

In the first slice, that surface should default to **read-only inspect** for:

- provider
- model
- instance / execution target
- skill profile
- companion / knowledge / response-profile configuration

Later product slices may allow editing from that surface, but those edits would
be **Cat-preset** edits, not thread-local overrides.

That means:

- changing the preset here affects the same Cat in future use across other
  channels and direct lanes
- the UI must make that scope clear

This spec does not require the first slice to support thread-local temporary
overrides of a Cat preset, and it does not require composer-opened Cat preset
editing to ship before that scope is made safe.

## Add-Cat Semantics

### Adding the First Cat

Adding the first Cat to a normal `Recents` thread shall:

- end solo composer mode
- set `leadCatId` to that Cat
- replace the composer model selector with the Cat avatar affordance
- make that Cat the default responder for unmentioned turns

This action is intentionally stronger than "invite a helper."
It upgrades the thread from model-first solo chat into a Cat-led thread.

### Adding Additional Cats

Adding a second or later Cat does **not** replace the current lead
automatically.

Instead:

- the existing `leadCat` remains
- new non-Boss Cats default to `mention-only`
- if the added Cat is `Boss Cat` and is not made lead, it defaults to
  `auto-helper`

### Removing Cats

If all Cats are removed from a `Recents` thread:

- the thread returns to solo composer mode
- the composer model selector returns

If the current lead Cat is removed while other Cats remain:

- the system must either:
  - require a new lead selection, or
  - deterministically promote another Cat

The final promotion rule may be implementation-defined in the first slice, but
the thread must never be left in a Cat-led mode with no valid lead Cat.

## Participation Roles

This spec separates three concerns:

1. **lead**
   - the default front-stage responder for unmentioned turns
2. **auto-helper**
   - a background participant allowed to proactively assist when policy permits
3. **orchestration authority**
   - authority to route, delegate, recruit Cats, or request structured help

These concerns are related but not identical.

### Lead

The lead Cat:

- is the default responder for unmentioned turns
- occupies the composer avatar control
- is the primary visible counterpart in that thread

### Mention-Only

A mention-only Cat:

- does not own the default reply path
- responds when explicitly mentioned or otherwise directly routed
- does not proactively intervene just because it is present in the thread

All non-Boss Cats added after the lead default to `mention-only` in the first
slice.

### Auto-Helper

An auto-helper:

- does not occupy the composer lead slot unless separately chosen as lead
- may proactively assist in routing, planning, safety, escalation, or handoff
- does not automatically become the front-stage speaker on every turn

In the first slice:

- `Boss Cat`, when present and not lead, defaults to `auto-helper`
- non-Boss Cats do not default to `auto-helper`

## Boss Cat Rules

### Boss Absent

If `Boss Cat` is not present in the thread:

- there is no Boss auto-help behavior

### Boss Present but Not Lead

If `Boss Cat` is present and is not the lead:

- `Boss Cat` defaults to `auto-helper`
- it may assist in the background without taking over the composer slot

### Boss Is Lead

If `Boss Cat` is also the lead:

- `Boss Cat` remains the default front-stage responder
- `Boss Cat` still retains orchestration authority
- becoming lead must **not** strip `Boss Cat` of the ability to recruit,
  delegate, or add other Cats into the thread

This means:

- lead status controls who is the default visible responder
- it does not remove the underlying orchestrator authority of `Boss Cat`

## Routing and Mention Rules

1. Explicit `@mentions` override the default next-turn target.
2. If no explicit valid mention is present:
   - solo mode uses the composer-selected pending provider/model
   - Cat-led modes default to the `leadCat`
3. After an explicit mention turn completes, the thread's default target remains
   the current lead unless another action changes that lead.

## Provider/Model Provenance

Every `Recents` thread shall preserve per-message execution provenance.

At minimum, each message or turn record should keep:

- provider
- model
- instance or target identifier when available

This matters because:

- the thread may start in solo mode and later become Cat-led
- Cat preset changes may affect future turns but must not rewrite past turns

The product may also keep helpful thread-level convenience metadata such as
`lastUsedProvider` or `lastUsedModel`, but those are summaries only, not
replacements for per-message provenance.

## Suggested State Contract

This spec does not mandate exact field names, but the product should be able to
represent equivalent concepts such as:

- `leadCatId: string | null`
- `participantCatIds: string[]`
- `composerMode: 'solo' | 'cat_led'`
- `bossParticipation: 'absent' | 'background_auto_helper' | 'lead'`
- `pendingProvider: string | null`
- `pendingModel: string | null`
- per-message execution provenance fields

The first implementation slice will likely also need an explicit
`composerMode: 'solo' | 'cat_led'` or equivalent state to avoid inferring the
mode only from older Boss-led metadata.

## Interaction Summary

```text
Start new thread
  -> solo composer mode
  -> composer shows model selector

Add first Cat
  -> leadCat = that Cat
  -> composer shows Cat avatar only
  -> unmentioned turns default to that Cat

Add second Cat
  -> keep current lead
  -> non-Boss Cat defaults to mention-only

Add Boss Cat while another Cat is lead
  -> Boss participates as background auto-helper

Make Boss Cat lead
  -> composer shows Boss avatar
  -> Boss still keeps orchestration authority
```

## Dependencies

- `cats/docs/specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md`
- `cats/docs/specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md`
- `cats/docs/specs/SPEC-027-chat-first-information-architecture-and-default-boss-cat.md`
- `cats/docs/specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md`
- `cats/docs/decisions/011-model-primary-orchestrator-as-visible-cat.md`
- `cats/docs/decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md`
- `cats/docs/decisions/030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions.md`

## Open Questions

- [ ] Should the first slice allow a thread-local temporary override of a lead
      Cat's provider/model without mutating the Cat preset globally?
- [ ] When a solo-mode thread already has several turns of history and the
      operator adds the first Cat, should that Cat inherit the prior solo
      transcript as execution context immediately, or should the handoff be
      summarized/filtered through a dedicated hydration step?
- [ ] When the lead Cat is removed from a multi-Cat thread, should the next lead
      be chosen explicitly or by deterministic promotion?
- [ ] Should `Boss Cat` auto-helper participation ever be turned off
      per-thread when Boss is present but not lead?

## References

- `cats/docs/requirements.md`
- `cats/docs/terminology.md`
- `cats/docs/architecture.md`

---

*Created: 2026-03-23*
*Author: Codex*
