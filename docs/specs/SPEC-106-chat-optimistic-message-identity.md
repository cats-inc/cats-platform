# SPEC-106: Chat Optimistic Message Identity and Refresh-Race Resilience

> Define the contract for keeping a single stable identity across the optimistic
> client-side user message and the canonical server-persisted message, so the
> first message in a direct lane (or any other ordinary chat send) does not
> flicker through a transient empty frame before the runtime session opens.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related Plan** | [PLAN-095](../plans/PLAN-095-chat-optimistic-message-identity-rollout.md) |
| **Related SPEC** | [SPEC-069: Chat Continuity Semantics and Context Transplant](./SPEC-069-chat-continuity-semantics-and-context-transplant.md) |

## Summary

When the owner sends a user message in a direct chat (web composer or any
other transport that goes through the workspace composer), the live indicator
shows three render frames:

1. The optimistic user message lands locally with id `optimistic-<UUID>`.
2. A server-side SSE `room_updated` event arrives before the `sendChatMessage`
   HTTP response, triggering a full app-shell refetch. The refreshed payload's
   selected channel does not carry the optimistic message (its id is unknown
   to the server) and may still be missing the canonical user message because
   server-side persistence has not advanced yet for the relevant publisher.
   The merge result drops the optimistic entry from the rendered transcript
   and the user briefly sees a transcript without their typed message.
3. The `sendChatMessage` response delivers the full app-shell containing the
   canonical user message with id `<UUID>` (no `optimistic-` prefix). React
   re-keys, the canonical row is mounted, the live indicator transitions into
   `waiting` and then `streaming`.

The flicker is structural rather than network-bound. It is caused by two
independent contract gaps:

- **Identity gap**: optimistic and canonical messages do not share an id.
  Once the canonical state arrives, React reconciles by removing the
  optimistic row and mounting a new canonical row instead of swapping data
  in place.
- **Refresh-race gap**: the SSE-driven app-shell refresher has no rule that
  preserves a still-pending optimistic message when the next server snapshot
  has not yet ack'd it.

This spec pins the contract that closes both gaps simultaneously. Removing
either half does not eliminate the flicker on its own.

## Goals

- Eliminate the transient empty-transcript frame between optimistic add and
  canonical ack.
- Keep optimistic message identity stable across the optimistic → canonical
  transition so React reconciles in place.
- Make the existing app-shell refresher resilient to the SSE/HTTP race
  whether or not the message has been persisted on the server when the next
  refresh fetches.
- Preserve idempotency: a second `sendChatMessage` carrying the same
  `clientMessageId` for a channel must not create a duplicate transcript
  entry.
- Avoid regressions in non-optimistic message paths (Telegram ingress, server
  internal appends, retry flow).

## Non-Goals

- No change to runtime session lifecycle, dispatch ordering, or SPEC-069
  recovery semantics.
- No new SSE event kinds. The existing `/api/events/chat` and
  `/api/subscribe?kind=channel&id=...` channels remain authoritative.
- No structural change to the message schema beyond the optional
  `clientMessageId` request field and the corresponding response surface.
- No change to mobile composer flows that do not go through the workspace
  composer (they will inherit the contract when they migrate; not in v1
  scope).

## Requirements

### Functional Requirements

#### Identity contract

1. The workspace composer shall generate a v4 UUID at submit time and use
   the bare UUID (no `optimistic-` prefix) as the local optimistic message
   id and as the `clientMessageId` field of the outbound `sendChatMessage`
   request.
2. `SendChannelMessageInput` shall expose an optional `clientMessageId?:
   string` field. When provided and well-formed (UUID), the server shall use
   that value as the canonical persisted message id for the user message
   appended in this dispatch.
3. When `clientMessageId` is omitted or malformed, server-side append
   behavior shall be unchanged (server generates a fresh `randomUUID`).
4. The optimistic message metadata flag `metadata.optimistic === true` shall
   remain a client-only marker. Server-side `appendMessage` shall strip the
   `optimistic` key before persisting so that no canonical message ever
   carries it.

#### Idempotency

5. When the server observes a `sendChatMessage` request whose
   `clientMessageId` already exists in the addressed channel as a user
   message, the server shall return the existing canonical message and the
   already-built dispatch state without appending a duplicate. The response
   payload shall include an idempotency marker (e.g.
   `idempotent: true`) so the client and operator tooling can distinguish
   the deduplicated round-trip from a fresh send.
6. Idempotent collision shall not advance any side effect that has already
   advanced for the original send (no second posture change, no second Cat
   proposal, no second turn start).
7. Replay through `retryChatMessage` or other server-internal append paths
   shall not consume the `clientMessageId` slot; only the original outbound
   send claims it.

#### Refresh-race resilience

8. The app-shell SSE refresher shall preserve a still-pending optimistic
   user message in the currently selected channel when the refreshed payload
   does not yet carry a canonical message with the same id.
9. Once the refreshed payload includes the canonical message with the same
   id, the optimistic copy shall be replaced in place (React preserves the
   component instance because the row key is stable).
10. The preserve-optimistic rule shall apply only to the most recent
    `metadata.optimistic === true` user message in the previously rendered
    selected channel. Other optimistic markers (older, unsent, or
    intentionally orphaned) shall not be replayed.
11. The preserve rule shall not interfere with cancel / abort flows. When
    `sendChatMessage` rejects, the composer rollback shall remove the
    optimistic entry, and a subsequent SSE refresh shall not re-introduce
    it.

#### Audit and metadata

12. Server-side response to a `sendChatMessage` carrying a recognized
    `clientMessageId` shall surface the identity decision (used the supplied
    id, fell back to a server id, or returned an existing message
    idempotently) so the renderer and operator logs can reason about state.
13. The optimistic-preserve rule shall not silently swallow merge conflicts.
    When the preserve helper rejects an optimistic candidate (for example,
    because the channel changed underneath), the renderer shall log a
    diagnostic warn line consistent with the
    `feature: 'chat_optimistic_message_*'` convention used elsewhere in the
    workspace shell diagnostics.

### Non-Functional Requirements

- **Stability**: no transient empty-transcript frame between optimistic add
  and canonical ack in the happy path.
- **Auditability**: client-supplied id shall be visible in the canonical
  message record so post-hoc inspection of the transcript can correlate the
  client send with the server message.
- **Backward compatibility**: omitting `clientMessageId` shall behave
  identically to the current implementation. Other transports (Telegram
  ingress, server-internal appends) are unaffected.
- **Idempotency safety**: the same `clientMessageId` used twice in the same
  channel shall not produce two transcript entries, two posture events, or
  two Cat proposals.

## Design Overview

```text
composer submit
  -> generate uuid X
  -> appendOptimisticUserMessage(payload, channelId, body, id=X, metadata.optimistic=true)
  -> setState(payload')
  -> sendChatMessage(channelId, { body, ..., clientMessageId: X })

  while HTTP in flight:
    SSE 'room_updated' may fire
      -> refreshAppShell -> fetchAppShell -> mergeAppShell + preserveOptimistic
         (current has optimistic-X marked optimistic; next may or may not have X)
         next has X       -> canonical replaces optimistic in place (id key stable)
         next missing X   -> optimistic preserved on top of next
         next has older X -> reject preserve, log diagnostic, accept refreshed truth

  HTTP response arrives:
    -> server canonical id X (or fresh server id if collision)
    -> setState(dispatch.appShell)
    -> if id matches optimistic, in-place swap; metadata.optimistic flag clears
       because server stripped it on persist
```

### Identity Schema

```ts
interface SendChannelMessageInput {
  body: string;
  senderName?: string;
  clientMessageId?: string;            // SPEC-106: optional UUID v4
  pendingProvider?: string;
  pendingModel?: string | null;
  pendingInstance?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
  messageMetadata?: ChannelMessageMetadata;
  choiceResponse?: ChatMessageChoiceResponse | null;
}

interface SendChannelMessageResponse {
  appShell: AppShellPayload;
  message: ChatMessage;                // canonical record (after persist)
  idempotent?: true;                   // SPEC-106: present when the same
                                       // clientMessageId was already persisted
}
```

The canonical persisted `ChatMessage.id` equals `clientMessageId` when the
client supplied a valid UUID and there was no prior collision. Otherwise the
server keeps generating fresh ids.

### Optimistic Marker Lifecycle

The renderer tags `metadata.optimistic = true` on the locally constructed
optimistic user message. The marker is **client-only**:

- Client renderer reads it to decide whether the row is still pending.
- The merge helper reads it to decide which row in the previous payload may
  be re-introduced into a refreshed payload.
- Server-side `appendMessage` deletes the key from the metadata payload
  before persisting. Canonical messages never carry it.

Once the canonical record arrives, the optimistic flag disappears because
the row's metadata is replaced by the canonical metadata wholesale.

### Refresh-Race Handling

The existing `preserveOptimisticUserMessageAfterRefresh` helper in
`workspace/chatUtils` already implements the preserve algorithm but is not
wired into the production refresh path. v1 wires it in
`useWorkspaceChatEvents.refreshAppShell` (and the legacy
`useChatAppShellRefresh`) immediately after
`mergeAppShellPreservingActiveEntityState`, so that the merged payload runs
through optimistic preservation before being committed to React state.

The helper compares optimistic message ids against the refreshed channel's
message id list. With the identity contract from §Functional Requirements
4–6, the comparison is `clientMessageId === canonical.id`, so:

- Pre-ack refresh: id not present → optimistic preserved.
- Post-ack refresh: id present → no re-add, canonical row stays.
- Cancelled / aborted send: composer rollback removes the optimistic entry
  before the next refresh; helper finds nothing to preserve.

### Idempotency Boundary

Server-side `appendMessage` (or its caller in
`beginChannelMessageDispatch`) checks the channel's message list for an
existing entry with `id === clientMessageId` before appending. On collision:

- Skip the append.
- Skip all downstream side effects of this dispatch (posture event, Cat
  proposal, runtime session creation).
- Return the existing message and the current channel state as the response.
- Set `idempotent: true` on the response so the renderer can skip secondary
  state transitions if needed.

A collision of this kind is already the right behavior for retries that
arrive after a successful original send; the contract makes it explicit.

## Acceptance Criteria

- A workspace-composer send produces a single React row that transitions
  from optimistic to canonical without unmounting.
- The live-indicator log no longer shows a `msgs[N]` frame in which N is
  smaller than the previous frame's N during the optimistic → canonical
  window for a healthy send.
- A second `sendChatMessage` with the same `clientMessageId` returns the
  existing canonical message with `idempotent: true` and does not create a
  duplicate transcript entry, posture event, or Cat proposal.
- Telegram ingress and server-internal appends still produce server-generated
  message ids unchanged.
- Optimistic-preserve never re-introduces an entry that the composer has
  rolled back due to send failure.
- Server-side persisted `ChatMessage.metadata` for owner-typed messages
  never contains `optimistic: true`.

## Open Questions

- [ ] Should mobile composer flows opt in to the same contract, or should
      mobile shell wait for a separate mobile-send slice? Default v1 answer:
      defer mobile until its composer flow goes through the workspace
      composer.
- [ ] Should the `idempotent` response marker also be exposed on the SSE
      `room_updated` event payload so passive clients (other tabs) can avoid
      duplicate UI animations? Default v1 answer: no — the SSE refetch will
      converge naturally.

## References

- [SPEC-069: Chat Continuity Semantics and Context Transplant](./SPEC-069-chat-continuity-semantics-and-context-transplant.md)
- [PLAN-095: Chat Optimistic Message Identity Rollout](../plans/PLAN-095-chat-optimistic-message-identity-rollout.md)

---

*Created: 2026-05-07*
*Author: Codex*
*Related Plan: [PLAN-095](../plans/PLAN-095-chat-optimistic-message-identity-rollout.md)*
