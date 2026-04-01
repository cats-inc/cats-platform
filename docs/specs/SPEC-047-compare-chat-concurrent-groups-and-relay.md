# SPEC-047: Parallel Chat, Concurrent Groups, and Relay Actions

## Summary

Cats Chat needs a parallel mode that sits between a normal solo chat and a fully shared group chat. A user should be able to open multiple private AI threads at once, send the same prompt to all of them, switch between them quickly, and selectively relay one model's reply into the other private threads using reusable command patterns.

## Why

- Current multi-chat workflows are too manual when the user wants to run multiple private AI threads in parallel, whether for comparison or simple parallel work.
- Existing group-chat semantics expose too much shared context across participants.
- Cats Code style reviewer / builder workflows need a human-guided way to fan out the same task, compare outputs, and relay a chosen answer back into other private lanes.

## Product Requirements

1. Add a new sidebar entry below `New chat` named `Parallel chat`.
2. `Parallel chat` creation must let the user choose at least two provider/model targets.
3. A parallel chat creates multiple private child chats that remain bound as one concurrent group.
4. When the active parallel chat sends a turn with scope `All chats`, the same user prompt is dispatched to every member chat and the next send stays locked until all member replies complete or fail.
5. While a concurrent-group dispatch is in flight, the composer must remain editable even though Enter and Send are disabled.
6. The active parallel chat must expose circular previous / next navigation across bound chats.
7. Assistant bubbles in parallel chats must expose persistent relay actions.
8. User bubbles must expose hover-only copy actions.
9. Relay actions must send transformed commands to other concurrent-group members instead of copying text into their composers.
10. The first slice must support these relay commands:
    - `check_this`
    - `adopt_this`
    - `debate_this`
    - `build_on_this`
11. The first slice may expose only the `all_others` relay policy in the UI, but the API must preserve a path for single-target relay later.
12. Recents must visually keep concurrent-group members together and label each member by its provider/model target, not just by the shared room title.
13. The composer must let the user switch a turn between `All chats` and `Only this chat`.

## Backend / Contract Requirements

1. Chat shell payloads must include concurrent-group summaries alongside normal channel summaries.
2. REST endpoints must support:
   - concurrent-group creation
   - concurrent-group fan-out send
   - concurrent-group relay send
3. Concurrent-group send routes must wait for all targeted child chats to finish before returning.
4. The first slice may reject shared attachments for parallel fan-out with a clear user-facing error.

## UX Notes

- Use `Parallel chat` as the user-facing label instead of `Concurrent chat`.
- Parallel chat is the container. Compare / debate / adopt behaviors are optional relay workflows on top of that container.
- Concurrent groups should feel like "bound private threads", not like a room where all AIs watch the same transcript.
- Relay actions should read like intentional workflow commands, not like raw copy/paste.

## First Slice Status

Implemented (first slice landed):

- parallel draft flow
- grouped recents
- parallel navigation
- parallel send scope toggle
- relay action menu for `all_others`
- concurrent-group REST endpoints and client contracts

Deferred:

- single-target relay UI
- shared attachments in parallel fan-out
- richer relay policy presets and automation

## Related Plan

- [PLAN-036](../plans/PLAN-036-compare-chat-concurrent-groups-and-relay.md)
