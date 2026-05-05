# SPEC-047: Parallel Chat, Parallel Chat Groups, and Relay Actions

## Summary

> Terminology note (2026-04-08): this spec now uses `Parallel Chat` /
> `parallel-chat group` language to match [ADR-055](../decisions/055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md)
> and [SPEC-052](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md).
> Current code may still contain older `concurrent*` identifiers until the
> rename refactor lands.

Cats Chat needs a parallel mode that sits between a normal default chat and a fully shared group chat. A user should be able to open multiple private AI threads at once, send the same prompt to all of them, switch between them quickly, and selectively relay one model's reply into the other private threads using reusable command patterns.

This spec should now be read with the stricter shared-engine distinction:

- `Parallel Chat` is a container of child conversations
- it is not the same thing as thread-internal `concurrent` fan-out inside one
  conversation turn

## Why

- Current multi-chat workflows are too manual when the user wants to run multiple private AI threads in parallel, whether for comparison or simple parallel work.
- Existing group-chat semantics expose too much shared context across participants.
- Cats Code style reviewer / builder workflows need a human-guided way to fan out the same task, compare outputs, and relay a chosen answer back into other private lanes.

## Product Requirements

1. Add a new sidebar entry below `New chat` named `Parallel chat`.
2. `Parallel chat` creation must let the user choose at least two provider/model targets.
3. A parallel chat creates multiple private child chats that remain bound as one parallel-chat group.
4. When the active parallel chat sends a turn with scope `All chats`, the same user prompt is dispatched to every member chat and the next send stays locked until all member replies complete or fail.
5. While a parallel-chat-group dispatch is in flight, the composer must remain editable even though Enter and Send are disabled.
6. The active parallel chat must expose circular previous / next navigation across bound chats.
7. Assistant bubbles in parallel chats must expose persistent relay actions.
8. User bubbles must expose hover-only copy actions.
9. Relay actions must send transformed commands to other parallel-chat-group members instead of copying text into their composers.
10. The first slice must support these relay commands:
    - `check_this`
    - `adopt_this`
    - `debate_this`
    - `improve_this`
    - `counter_this`
    - `synthesize_this`
11. The first slice may expose only the `all_others` relay policy in the UI, but the API must preserve a path for single-target relay later.
12. Recents must visually keep parallel-chat-group members together and label each member by its provider/model target, not just by the shared room title.
13. The composer must let the user switch a turn between `All chats` and `Only this chat`.

## Backend / Contract Requirements

1. Chat shell payloads must include parallel-chat-group summaries alongside normal channel summaries.
2. REST endpoints must support:
  - parallel-chat-group creation
  - parallel-chat-group fan-out send
  - parallel-chat-group relay send
3. Parallel-chat-group send routes must wait for all targeted child chats to finish before returning.
4. The first slice may reject shared attachments for parallel fan-out with a clear user-facing error.

## UX Notes

- Use `Parallel chat` as the user-facing label instead of `Concurrent chat`.
- Parallel chat is the container. Compare / debate / adopt behaviors are optional relay workflows on top of that container.
- Parallel chat should stay distinct from concurrent response clusters inside
  one shared-thread group conversation.
- Parallel-chat groups should feel like "bound private threads", not like a room where all AIs watch the same transcript.
- Relay actions should read like intentional workflow commands, not like raw copy/paste.

## First Slice Status

Implemented (first slice landed):

- parallel draft flow
- grouped recents
- parallel navigation
- parallel send scope toggle
- relay action menu for `all_others`
- parallel-chat-group REST endpoints and client contracts

Deferred:

- single-target relay UI
- shared attachments in parallel fan-out
- richer relay policy presets and automation

## Related Plan

- [PLAN-036](../plans/PLAN-036-compare-chat-concurrent-groups-and-relay.md)
- [SPEC-061](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
