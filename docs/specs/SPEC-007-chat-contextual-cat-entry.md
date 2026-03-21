# SPEC-007: Chat-Contextual Cat Entry

Status: Draft (Pending Review)

## Summary

Reframe cat UX so the primary operator action is "add cat to this chat" while
preserving the reusable global cat registry under `Settings > Cats`.

## Goals

- Keep the reusable cat registry and channel-assignment model from ADR-005
- Make the current-chat `Add cat` flow the primary operator path
- Move registry administration out of first-level navigation and into
  `Settings`
- Preserve direct `Create new` entry both from chat context and from
  `Settings > Cats`

## Requirements

### Functional Requirements

- The selected chat should expose a clear `Add cat` entry point without
  requiring navigation to a separate registry page first.
- The Add cat surface should support two paths:
  - choosing an existing global cat
  - creating a new reusable global cat
- Creating a new cat from chat context should:
  - save the reusable cat to the global registry
  - assign it to the current chat in the same flow
- A global `Settings` area should exist and be reachable from the left-panel
  account menu.
- `Settings > Cats` should remain available as the management surface for:
  - create new
  - review registry
  - future edit/archive/inspect flows
- The top-level navigation should stop treating `Cats` as a first-class peer of
  active chat work.

### Non-Functional Requirements

- The primary Add cat flow should minimize context switching for the operator.
- The design should not imply that cats are chat-local throwaway entities.
- Advanced configuration should stay available without making the common
  creation path heavy.
- The change should preserve compatibility with the current chat store and
  `Cats Core v1` actor/resource direction.

## UX Direction

### Primary Flow

1. Operator is inside a chat.
2. Operator clicks `Add cat`.
3. A side sheet or modal opens.
4. Default tab or section is `Choose existing`.
5. Operator can search or select a cat and add it to the current chat.
6. If needed, operator switches to `Create new`.
7. After successful creation, the new cat is immediately assigned to the
   current chat and appears in the visible roster.

### Secondary Flow

1. Operator opens the account menu from the left-panel footer.
2. Operator opens `Settings`.
3. Operator opens `Cats`.
4. Operator manages the reusable registry there, including `Create new`.

## Out of Scope

- Full edit/archive implementation details for cats
- Approval-loop behavior after a cat is assigned
- Telegram/LINE-specific roster behavior
- Changes to the `cats-runtime` boundary or core API ownership

## Acceptance Criteria

- Planning docs clearly distinguish chat-time cat assignment from registry
  administration.
- The agreed information architecture is:
  - chat-first Add cat flow
  - Settings-hosted Cats registry
  - account-menu entry for Settings
- The spec remains compatible with ADR-005 and does not replace the shared cat
  registry model.

---

*Last updated: 2026-03-17*






