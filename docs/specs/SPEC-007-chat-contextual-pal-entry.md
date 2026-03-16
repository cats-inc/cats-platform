# SPEC-007: Chat-Contextual Pal Entry

Status: Draft (Pending Review)

## Summary

Reframe pal UX so the primary operator action is "add pal to this chat" while
preserving the reusable workspace pal registry under `Settings > Pals`.

## Goals

- Keep the reusable pal registry and channel-assignment model from ADR-005
- Make the current-chat `Add pal` flow the primary operator path
- Move registry administration out of first-level navigation and into
  `Settings`
- Preserve direct `Create new` entry both from chat context and from
  `Settings > Pals`

## Requirements

### Functional Requirements

- The selected chat should expose a clear `Add pal` entry point without
  requiring navigation to a separate registry page first.
- The Add pal surface should support two paths:
  - choosing an existing workspace pal
  - creating a new reusable workspace pal
- Creating a new pal from chat context should:
  - save the reusable pal to the workspace registry
  - assign it to the current chat in the same flow
- A global `Settings` area should exist and be reachable from the left-panel
  account menu.
- `Settings > Pals` should remain available as the management surface for:
  - create new
  - review registry
  - future edit/archive/inspect flows
- The top-level navigation should stop treating `Pals` as a first-class peer of
  active chat work.

### Non-Functional Requirements

- The primary Add pal flow should minimize context switching for the operator.
- The design should not imply that pals are chat-local throwaway entities.
- Advanced configuration should stay available without making the common
  creation path heavy.
- The change should preserve compatibility with the current workspace store and
  `Cats Core v1` actor/resource direction.

## UX Direction

### Primary Flow

1. Operator is inside a chat.
2. Operator clicks `Add pal`.
3. A side sheet or modal opens.
4. Default tab or section is `Choose existing`.
5. Operator can search or select a pal and add it to the current chat.
6. If needed, operator switches to `Create new`.
7. After successful creation, the new pal is immediately assigned to the
   current chat and appears in the visible roster.

### Secondary Flow

1. Operator opens the account menu from the left-panel footer.
2. Operator opens `Settings`.
3. Operator opens `Pals`.
4. Operator manages the reusable registry there, including `Create new`.

## Out of Scope

- Full edit/archive implementation details for pals
- Approval-loop behavior after a pal is assigned
- Telegram/LINE-specific roster behavior
- Changes to the `cats-runtime` boundary or core API ownership

## Acceptance Criteria

- Planning docs clearly distinguish chat-time pal assignment from registry
  administration.
- The agreed information architecture is:
  - chat-first Add pal flow
  - Settings-hosted Pals registry
  - account-menu entry for Settings
- The spec remains compatible with ADR-005 and does not replace the shared pal
  registry model.

---

*Last updated: 2026-03-17*
