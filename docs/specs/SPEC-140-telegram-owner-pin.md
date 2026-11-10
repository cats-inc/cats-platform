# SPEC-140: Telegram Owner Pin

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented on 2026-11-11 at the owner's request, as a security fix, and revised after an independent review the same day |
| **Owner** | Product owner |
| **Reviewer** | Owner; independent agent review on 2026-11-11 (see Review) |
| **Fixes** | The related finding of SPEC-139's security review: a Telegram bot binding admitted any private chat into the bound Cat's direct lane as a `user` message, and mirrored that lane to whichever chat touched it last |
| **Matches** | Cats Bot's rule: the first private chat that writes becomes the owner chat (`ownerChatId`), and every other chat is ignored without a reply. The two differ in the details listed under Compatibility |
| **Updates** | SPEC-017 and SPEC-038 (Telegram ingress and control surface), SPEC-114 (work delivery to Telegram), SPEC-124 FR-25 to FR-27 (Telegram on duty) |

## Summary

A Telegram bot binding now belongs to one Telegram account, its owner. Only the owner's
private chat reaches the bound Cat, and the binding sends only to that chat.

- **A new binding**: the first private chat that writes becomes its owner, as in Cats Bot.
- **A binding that already talked to people**: it is settled from the private chats that wrote
  to it. One chat becomes the owner. Several mean the owner picks themselves in Settings, and
  until then the binding answers nobody.
- **A reset**: it never reopens "first message wins". Chats that write are collected, and the
  owner picks.

Settings shows who the owner is, by name, username and id.

## Goals

- Nobody but the owner can talk to a Cat through Telegram, give it commands or press its
  buttons.
- Nothing a Cat says reaches anyone but the owner on Telegram.
- An existing setup keeps working when it is clear who the owner is, and asks when it is not.

## Non-Goals

- Pairing with a one-time code. It is planned for both apps, using Telegram's own deep-link
  pairing (FR-9), and is not built now.
- Telegram group chats. Ingress already ignores every chat that is not private.
- Changing who may start the Boss Cat tools (SPEC-139). A Telegram message is still never an
  owner-started turn.

## Requirements

### Functional Requirements

1. FR-1: Each Telegram bot binding has an owner record, keyed by the binding's id:
   - `pinned`, with the owner's user id, display name, username, the time it was pinned, and
     how: `first_message`, `history` or `owner_choice`;
   - `open`: the next private chat that writes becomes the owner. Only a new binding is `open`;
   - `choose`: the owner must pick among up to 10 candidates, each with a display name,
     username, last message time and the start of its last message. The list may be empty
     while the binding collects candidates after a reset.

   In a private chat the chat id is the user's id, always positive, so the owner is identified
   by chat id. Only that user can write in the chat or press its buttons.
2. FR-2: At ingress, after the existing checks (bound, not a duplicate, not from a bot, a
   private chat), the update's chat is checked against the owner record. This one gate covers
   messages, edited messages and button callbacks, so it also covers commands, Work requests
   and room turns.
   - `pinned`: another chat is ignored with reason `not_owner`.
   - `open`: the chat is pinned as the owner (`first_message`) and admitted.
   - `choose`: the chat is recorded as a candidate (newest first, at most 10) and ignored with
     reason `owner_not_confirmed`.
   - A chat id that is not positive is never admitted.

   An ignored update:
   - gets no reply and creates no conversation record;
   - takes no slot in the dedupe window, like the other ignored updates;
   - leaves a receipt that keeps no summary of the message.

   Both ingress paths (webhook and polling) reach the room bridge only for an accepted update,
   golden-path intake included. Nothing runs earlier: no Work capture, no typing action and no
   file download.
3. FR-3: A binding without an owner record is settled once, from the private chats that wrote to
   it.
   - **What counts**:
     - only records with an inbound message id and a positive chat id (an old delivery path made
       records, typed `private`, for any chat it sent to);
     - records written before bindings were scoped count only for the context's default
       binding;
     - a record older than the binding itself never counts.
   - **The result**:
     - no chat: `open`;
     - one chat: `pinned` (`history`);
     - several: `choose`, most recent first.
4. FR-4: The owner picks a candidate with `POST /api/transports/telegram/owners/:bindingId/choose`
   (`{ userId }`), which pins that chat (`owner_choice`). It is refused with `409` unless the
   binding is in `choose` and the chat is among its candidates.
5. FR-5: `POST /api/transports/telegram/owners/:bindingId/reset` puts the binding in `choose`
   with no candidates. It answers nobody, collects the chats that write, and the owner picks
   (FR-4). A stranger who keeps writing therefore cannot simply win again.
   - Both routes need the signed-in owner or an admin (the auth gate's protected API plus a
     role check, as for Cat images), and both return the new owner record.
   - Disconnecting and reconnecting a bot creates a new binding, which starts `open`.
6. FR-6: Delivery sends only to the binding's pinned owner chat. Anything else fails with
   reason `not_owner_chat`, including any delivery while the binding is `open` or `choose`.
   - A delivery to an unknown chat is refused before a conversation record is created for it.
   - A room mirrors only to the owner's linked chat, never to the chat that touched the room
     last. Fanout's auto-link considers only the owner's chat, and a room with no owner chat is
     skipped (`unlinked_room`), not retried. These lookups lack the binding's scope. They use the
     stored owner record, or a judgement from records scoped to this binding alone, which is
     never stored.
   - A typing action goes only to the owner.
   - Callers treat `not_owner_chat` as a definite non-delivery. A Cat image is suppressed, like
     `delivery_not_authorized`. A Work delivery is `binding_unavailable`.
7. FR-7: Owner records persist in the Telegram relay state file as `owners`, additive within
   version 2.
   - An older build ignores them and drops them on its next write. After upgrading again, they
     are settled anew by FR-3.
   - A damaged entry is dropped and settled again.
   - A file that cannot be read at all is copied aside (`.damaged-<time>`). Every binding without
     a record then goes to `choose` rather than `open`, so a damaged file never lets a stranger
     claim a Cat.
   - A data reset clears everything, the uncertainty included.
8. FR-8: A Cat's Telegram card in Cats Directory shows each binding's owner under the bot's name.
   - **The owner**: always the display name with `@username` and the numeric id beside it,
     because a display name is whatever the sender typed. It shows how the owner was set, with
     a reset (after a confirmation).
   - **While `open`**: that the first account to message the bot becomes its owner.
   - **While `choose` with candidates**: each candidate with a 「這是我」 button and the start of
     its last message. 「都不是我」 starts collecting afresh.
   - **While collecting**: send the bot a message from your own Telegram, refresh, and pick
     yourself.
   - **Refresh**: a 「重新整理」 button reloads the record, and so does a failed action.

   A hint says that only the owner's messages reach the Cat, and that its Telegram messages go
   only to the owner. The owner records also appear in `GET /api/transports/telegram/diagnostics`
   as `owners`.
9. FR-9 (planned, not built): pairing replaces "first message wins" in both apps through
   Telegram's deep-link pairing. The app shows a `t.me/<bot>?start=<one-time token>` link or
   QR code. The owner opens it, the bot receives `/start <token>`, and that account is pinned.
   Cats Bot moves to the same flow at the same time.

### Non-Functional Requirements

- **Security**:
  - A stranger who finds the bot can no longer reach a Cat, run its commands or receive
    anything it says.
  - "First message wins" leaves one window, only for a new binding (including a reconnect):
    between connecting the bot and the owner's first message, a stranger who writes first
    becomes the owner. Settings shows who was pinned. A reset moves the binding to an owner's
    pick, so the window cannot be reopened. FR-9 removes it.
- **Compatibility**:
  - The relay state stays version 2, and no Cat, binding or core contract changes.
    `BotBindingRecord` in the frozen `src/core/types.ts` is untouched; the owner lives in the
    Telegram relay state.
  - Unlike Cats Bot, Desktop pins on any private update, not only text, and sends no "you are
    now the owner" greeting.
  - A binding in `choose` goes quiet until the owner picks in Settings.

## Design Overview

- `src/platform/transports/telegram/owner.ts`: settling, admitting, checking, resetting and
  choosing owners.
- **Ingress and delivery**: `relay/ingress.ts` gates admission (FR-2). `relay/delivery.ts` and
  `relay/index.ts` gate delivery, room lookups and typing (FR-6).
- **Diagnostics and storage**: `relay/index.ts` settles owners for diagnostics with each
  binding's scope. `store/` persists them and detects a damaged file (FR-7).
- **Routes**: `src/server/routes/telegram.ts` and `src/app/server/requestRouter.ts` add the two
  routes. The route is host wiring, added here as a security fix.
- **Settings**: `components/cats/TelegramOwnerRow.tsx`, in the Cats Directory Telegram card, renders
  FR-8.

## Test Plan

- `tests/telegram-owner-pin.test.js` covers:
  - first-message pinning; strangers ignored (button callbacks included), leaving no record and
    no dedupe slot;
  - history:
    - one chat pinned, several making the owner choose, with every new writer collected;
    - send-only and group or channel records never counted;
    - unscoped records only for the default binding, and none from before the binding;
  - reset collecting candidates instead of reopening the window;
  - delivery only to the owner, and rooms mirroring only to the owner;
  - persistence, a damaged entry, and a damaged file (copied aside, owner confirmed).
- `tests/provider-telegram-routes.test.js` covers the routes end to end:
  - a stranger's message, `/work` request, photo and button press are ignored and leave no
    record;
  - a choice is refused once an owner is pinned;
  - a reset collects the next writer, who becomes the owner only when chosen;
  - anonymous calls, 404 and 405 are refused.
- `tests/telegram-owner-row.test.tsx`: the Settings row in each state, including the full owner
  identity, collecting, refresh and 「都不是我」.
- Existing Telegram, fanout, Work and Cat image tests run with the owner gate. Tests that relied
  on any chat getting in now use the owner's chat.

## Review

An independent review on 2026-11-11 found the following, now addressed:

- **High.** Old send-only records (they carry a time but no inbound message id, and may be
  groups or channels) were counted as history. Now FR-3 and FR-1.
- **Medium.**
  - Unscoped records were counted by every binding. Now FR-3.
  - A reset reopened the first-come window. Now FR-5.
  - Settings could not show who claimed a binding. Now FR-8.
- **Low.**
  - Role check. Now FR-5.
  - Damaged state failed open. Now FR-7.
  - Stranger text was kept in receipts. Now FR-2.
  - Typing actions were not gated. Now FR-6.
  - Copy wording. Now FR-8.
  - The Cats Bot note overstated how alike the apps are. Now Compatibility.
- **Kept as is.**
  - One seen chat is still pinned from history, by the owner's decision. Settings shows it,
    with a reset.
  - The gate compares the chat id, not also the sender id. In a private chat they are the
    same.

## References

- SPEC-139 (the review that found this), SPEC-017, SPEC-038, SPEC-114, SPEC-124.
- Cats Bot `src/core/transports/telegram.ts` (owner chat) and SPEC-001 FR-26.
- Telegram Bot API, deep linking (`/start` parameters).
