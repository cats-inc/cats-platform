# ADR-091: Retire `composerMode` in Favor of Channel Intent

## Status

Accepted

## Context

Earlier Chat prototypes let draft UI state leak into routing and persistence.
That made the codebase treat "how the user entered the composer" as if it were
the domain shape of the conversation.

The current IA separates those concerns:

- Domain topology: `direct_message` vs `chat_channel`.
- Entry UI: `+ New Chat` default/group/parallel presets.
- Feature mode: parallel group execution.
- Routing internals: direct-message recipient vs orchestrated non-direct
  channel routing.

`composerMode` crossed those layers. It also encouraged compatibility aliases
for retired prototype states, which this pre-release product deliberately does
not keep.

## Decision

Remove `composerMode` from Chat storage, API/read models, UI gates, and routing
contracts. The current contract is:

- `channelKind`: `direct_message` or `chat_channel`.
- `roomRouting.mode`: `direct_message` or `chat_channel`.
- `entryKind`: `direct`, `default`, or `group` where this is strictly create UI
  intent, not persistent routing taxonomy.
- conversation mode: `direct_message`, `default_chat`, or `participant_chat`.
- continuity topology: `direct_message`, `telegram_direct_message`,
  `default_chat`, or `participant_chat`.

No code should add aliases or fallbacks for retired prototype routing names.
Persisted local development records can be regenerated because the product has
not had a public stable release.

Guide Cat assist follows the same split: `/chat/new` is one assist surface.
Default/group/parallel composer presets do not create separate assist scope
keys, and direct-message routes do not get Guide Cat helper chips.

## Consequences

- Routing can reason from channel topology first instead of inferred draft
  state.
- Group and parallel participant chats are non-direct chat channels; no-mention
  turns go through the orchestrator unless the operator explicitly mentions a
  participant or chooses a per-turn audience.
- Direct messages remain recipient-routed.
- Tests and docs must use the current names only: `direct_message`,
  `chat_channel`, `default_chat`, `participant_chat`, and UI `default/group`
  presets.

## References

- ADR-055: retire lead semantics and separate composer recipients from dispatch
  policy.
- ADR-082: orchestrator-owned deterministic routing.
- SPEC-067: Guide Cat assist cache and scope keys.
