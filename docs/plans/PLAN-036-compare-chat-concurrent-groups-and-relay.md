# PLAN-036: Parallel Chat, Concurrent Groups, and Relay

## Goal

Ship the first Cats Chat parallel-mode slice that binds multiple private child chats into one concurrent group, supports fan-out sends, and lets the user relay one assistant reply into the other private chats with command-driven prompts.

## Scope

### Renderer

- Add `Parallel chat` entry to the sidebar.
- Add parallel draft creation UI with multiple provider/model targets.
- Add concurrent-group navigation in the chat surface.
- Add parallel send-scope toggle: `All chats` vs `Only this chat`.
- Add bubble actions:
  - user bubble hover copy
  - assistant bubble copy + relay menu
- Group parallel chats together in Recents and label members by provider/model target.

### State / API

- Extend chat shell contracts with concurrent-group summaries.
- Normalize concurrent groups into renderer payloads.
- Add concurrent-group create / send / relay routes.
- Preserve concurrent-group metadata when channels are renamed or deleted.

### Tests / Verification

- Typecheck the full repo.
- Verify existing sidebar navigation tests still pass.
- Add coverage for parallel sidebar grouping and route helpers.

## Implementation Notes

1. Treat concurrent-group members as ordinary chats plus a higher-level `concurrentGroups` binding layer.
2. Do not overload `orchestratorRoles` with ad hoc `groupId` metadata.
3. Use a dedicated busy key (`concurrent:dispatch`) so parallel sends can disable Enter / Send without disabling text editing.
4. Keep relay prompt construction centralized so future policy work stays additive.

## Status

Completed for first slice.

## Verification

- `npm run typecheck`
- `npm run build:test-ui && node --test dist-test/sidebar-my-cats-navigation.test.js`
- `npm run build:test-ui && node --test dist-test/chat-compare-sidebar.test.js`

## Follow-ups

- Expose single-target relay policy in the UI.
- Support shared attachments for parallel fan-out.
- Add parallel-workflow transcript or reducer tests once the interaction model stabilizes.

## Related Spec

- [SPEC-047](../specs/SPEC-047-compare-chat-concurrent-groups-and-relay.md)
