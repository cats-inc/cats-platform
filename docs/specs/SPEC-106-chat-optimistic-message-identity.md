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
3. When `clientMessageId` is omitted, server-side append behavior shall be
   unchanged (server generates a fresh `randomUUID()`).
4. When `clientMessageId` is supplied but malformed (not a v4 UUID), the
   server shall NOT reject the request. It shall fall back to a fresh
   `randomUUID()` for the canonical id, append the user message normally,
   run all dispatch side effects, and surface the fallback decision via
   `messageIdentity.source = 'server_fallback'` with
   `reason = 'invalid-uuid'` (see FR-14).
5. The optimistic message metadata flag `metadata.optimistic === true` shall
   remain a client-only marker. Server-side `appendMessage` shall strip the
   `optimistic` key before persisting so that no canonical message ever
   carries it.

#### Idempotency

6. **Equivalent collision** — when the server observes a `sendChatMessage`
   request whose `clientMessageId` already exists in the addressed channel
   as an *equivalent* user message (existing entry has
   `senderKind === 'user'`, the same trimmed `body`, and the same
   `senderName`), the server shall return the existing canonical message
   and the already-built dispatch state without appending a duplicate. The
   response shall set `idempotent: true` and
   `messageIdentity.source = 'idempotent'` so the client and operator
   tooling can distinguish the deduplicated round-trip from a fresh send.
7. **Non-equivalent collision** — when the supplied `clientMessageId`
   matches an existing entry that is NOT an equivalent user message
   (different `senderKind` such as `system`/`agent`/transcript event, or
   same `senderKind` with divergent `body` / `senderName`), the server
   shall NOT reuse the colliding id and shall NOT treat the request as
   idempotent. It shall fall back to a fresh `randomUUID()` for the
   canonical id, append the new user message, run all dispatch side
   effects as a fresh send, and surface the decision via
   `messageIdentity.source = 'server_fallback'` with `reason =
   'collision-foreign-sender'` (different senderKind) or
   `reason = 'collision-equivalence-mismatch'` (same senderKind but
   divergent body/senderName). A diagnostic warn line shall be emitted
   under the `feature: 'chat_client_message_id_collision'` convention.
8. Idempotent collision (FR-6 only) shall not advance any side effect that
   has already advanced for the original send (no second posture change,
   no second Cat proposal, no second turn start). Non-equivalent collision
   (FR-7) is treated as a brand-new send and runs its own side effects.
9. Replay through `retryChatMessage` or other server-internal append paths
   shall not consume the `clientMessageId` slot; only the original outbound
   send claims it.

#### Refresh-race resilience

10. The app-shell SSE refresher shall preserve a still-pending optimistic
    user message when the refreshed payload does not yet carry a canonical
    message with the same id.
11. Once the refreshed payload includes the canonical message with the same
    id, the optimistic copy shall be replaced in place (React preserves the
    component instance because the row key is stable).
12. The preserve-optimistic rule shall be scoped by an explicit
    `(channelId, optimisticMessageId)` pair carried by an in-flight send
    registry maintained by the workspace composer. The pair MUST come from
    the registry, NOT from `previousPayload.chat.selectedChannelId` —
    relying on the selected-channel id breaks down when the owner switches
    channels mid-send. Registry lifecycle is defined under §Refresh-Race
    Handling. v1 invariant: at most one pending optimistic send per
    channel; the workspace composer disables submit while a previous send
    is in flight for the same channel. Cross-tab is out of scope: the
    registry is renderer-instance local (each browser tab has its own
    Map), so multi-tab or multi-surface concurrency is not a goal of this
    SPEC.
13. The preserve rule shall not interfere with cancel / abort flows. When
    `sendChatMessage` rejects, the composer rollback shall remove the
    optimistic entry from the registry AND from
    `selectedChannel.messages`, so a subsequent SSE refresh shall not
    re-introduce it.

#### Audit and metadata

14. Every `sendChatMessage` response shall surface the identity decision
    through a `messageIdentity` field with the following shape:

    ```ts
    interface SendChannelMessageMessageIdentity {
      source: 'client' | 'server_fallback' | 'idempotent';
      canonicalMessageId: string;
      clientMessageId?: string;       // present whenever the client supplied one
      reason?: 'invalid-uuid'
        | 'collision-foreign-sender'
        | 'collision-equivalence-mismatch';
    }
    ```

    `source: 'client'` means the supplied id was honored as the canonical
    id. `source: 'server_fallback'` means the server generated a fresh id
    (with `reason` explaining why the supplied id was not used).
    `source: 'idempotent'` means the request was deduplicated against an
    equivalent prior send (FR-6). `messageIdentity` is omitted when no
    `clientMessageId` was supplied (server is free to omit it) so legacy
    callers see no schema change.

15. The optimistic-preserve rule shall not silently swallow merge conflicts.
    When the preserve helper rejects an optimistic candidate (for example,
    because the channel changed underneath, the registry pair refers to a
    channel that disappeared, or a refreshed entry with the same id has a
    different `senderKind`/`body`), the renderer shall log a diagnostic
    warn line consistent with the `feature: 'chat_optimistic_message_*'`
    convention used elsewhere in the workspace shell diagnostics.

### Non-Functional Requirements

- **Stability**: no transient empty-transcript frame between optimistic add
  and canonical ack in the happy path (owner stays on the channel during
  the pending window). The channel-switch trade-off is documented under
  §Refresh-Race Handling and is explicitly not in scope for v1 stability.
- **Auditability**: when the client supplies a `clientMessageId`, the
  server shall stamp `metadata.clientMessageId` (the value the client
  actually sent) and `metadata.clientMessageIdSource` (the same value as
  `messageIdentity.source`) on the persisted canonical `ChatMessage`,
  regardless of whether the canonical id honored the client value or fell
  back to a server UUID. Post-hoc transcript inspection can then correlate
  the client send with the server message even when the canonical id is
  not the client id.
- **Backward compatibility**: omitting `clientMessageId` shall behave
  identically to the current implementation. Other transports (Telegram
  ingress, server-internal appends) are unaffected and produce no
  `metadata.clientMessageId` / `metadata.clientMessageIdSource` keys.
- **Idempotency safety (well-formed only)**: a *well-formed* (v4 UUID)
  `clientMessageId` used twice in the same channel for an *equivalent*
  user message shall not produce two transcript entries, two posture
  events, or two Cat proposals (FR-6). This guarantee does NOT extend to
  malformed `clientMessageId` values: each malformed retry falls back to
  a fresh server UUID per FR-4 and therefore appends a new entry. Clients
  that need idempotency MUST send well-formed v4 UUIDs.

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

SPEC-106 is **additive** on top of the existing `SendChannelMessageInput` /
`SendChannelMessageResponse` shapes in `src/products/chat/api/contracts.ts`.
Existing fields (`phase`, `results`, `dispatch`, `message: ChatMessage |
null`, etc.) MUST be preserved. The new fields below are additions only.

```ts
interface SendChannelMessageInput {
  body: string;
  senderName?: string;
  clientMessageId?: string;                  // SPEC-106: optional UUID v4
  pendingProvider?: string;
  pendingModel?: string | null;
  pendingInstance?: string | null;
  pendingModelSelection?: ProviderModelSelection | null;
  messageMetadata?: ChannelMessageMetadata;
  choiceResponse?: ChatMessageChoiceResponse | null;
}

// Existing fields unchanged; SPEC-106 adds `idempotent` and `messageIdentity`
interface SendChannelMessageResponse {
  appShell: AppShellPayload;
  message: ChatMessage | null;               // existing — unchanged
  phase: 'acknowledged';                     // existing — unchanged
  results: ChannelDispatchResult[];          // existing — unchanged
  dispatch?: ChannelDispatchAcknowledgement; // existing — unchanged
  idempotent?: true;                         // SPEC-106 (FR-6): set when an
                                             // equivalent prior send exists
  messageIdentity?: SendChannelMessageMessageIdentity; // SPEC-106 FR-14
}

interface SendChannelMessageMessageIdentity {
  source: 'client' | 'server_fallback' | 'idempotent';
  canonicalMessageId: string;
  clientMessageId?: string;
  reason?: 'invalid-uuid'
    | 'collision-foreign-sender'
    | 'collision-equivalence-mismatch';
}
```

The canonical persisted `ChatMessage.id` equals `clientMessageId` only when
(a) the client supplied a well-formed v4 UUID, (b) there was no prior
collision, and (c) FR-7 did not trigger a fallback. In that case the
response carries `messageIdentity.source = 'client'`. Otherwise the server
generates a fresh id and surfaces `source: 'server_fallback'` (with
`reason`) or `source: 'idempotent'` per FR-6.

### Optimistic Marker Lifecycle

The renderer tags `metadata.optimistic = true` on the locally constructed
optimistic user message. The marker is **client-only**:

- Client renderer reads it to decide whether the row is still pending.
- The merge helper reads it to decide which row in the previous payload may
  be re-introduced into a refreshed payload.
- Server-side `appendMessage` deletes the `optimistic` key from the
  metadata payload before persisting. Canonical messages never carry it.

Once the canonical record arrives, the optimistic flag disappears because
the row's metadata is replaced by the canonical metadata wholesale.

### Audit Metadata on the Canonical Record

To satisfy NFR Auditability, server-side append SHALL stamp two fields
onto `ChatMessage.metadata` whenever the request carried a non-empty
`clientMessageId`:

- `metadata.clientMessageId: string` — the value the client actually
  sent, even when the canonical id fell back to a server UUID.
- `metadata.clientMessageIdSource: 'client' | 'server_fallback' |
  'idempotent'` — same enum as `messageIdentity.source` in the response.

These fields persist with the message, so a transcript export or
post-hoc audit can correlate any canonical record back to the original
client send and tell whether the canonical id is honored or fell back.

For idempotent collision (FR-6), the *existing* canonical message is
returned without re-stamping; its earlier `metadata.clientMessageId` /
`metadata.clientMessageIdSource` values (set by the original successful
send) remain authoritative. The duplicate retry is not persisted, so it
contributes no metadata.

Telegram ingress, server-internal appends, and server-internal retries
do NOT carry a `clientMessageId` and therefore do NOT receive these
metadata fields.

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
3–7, the comparison is `clientMessageId === canonical.id`, so:

- Pre-ack refresh: id not present → optimistic preserved.
- Post-ack refresh: id present → no re-add, canonical row stays.
- Cancelled / aborted send: composer rollback removes the optimistic entry
  before the next refresh; helper finds nothing to preserve.

#### Pending-send registry (channelId source contract)

FR-12 requires the preserve step to know exactly which `(channelId,
optimisticMessageId)` pairs are still pending. The workspace composer is
the only component that has this knowledge at submit time, so it owns the
registry.

```ts
// renderer-instance local — one Map per browser tab / workspace shell mount.
// v1: at most one entry per channelId (composer disables submit while
// a previous send is in flight for the same channel).
const pendingOptimisticSends = new Map<channelId, optimisticMessageId>();
```

**Cardinality (v1)**: at most one entry per `channelId`. The workspace
composer disables its submit affordance while a previous send is in flight
for the same channel, so this is enforced at the UI layer rather than the
registry layer. If a register call ever attempts to overwrite an existing
entry for the same channel (defensive case — should not happen under
normal flow), the helper shall log a structured warn under
`feature: 'chat_optimistic_message_replaced_in_flight'` and adopt the
newer entry. A future revision can lift this cap to
`Map<channelId, Set<optimisticMessageId>>` if a use case requires it.

**Scope**: the registry lives in module / hook scope inside the renderer
process. It does NOT span browser tabs (tabs do not share JS heap), and it
does NOT span unrelated workspace shell remounts. Each tab and each
renderer instance maintains its own registry. Cross-tab idempotency is out
of scope for SPEC-106 v1 — the server-side idempotency boundary (FR-6 /
FR-7) is the cross-tab guarantee, not this client registry.

Lifecycle:

- **Add**: `useWorkspaceComposerSubmit` inserts `(channelId, optimisticId)`
  into the registry immediately after `appendOptimisticUserMessage`
  succeeds, *before* the `sendChatMessage` HTTP call goes out.
- **Remove on success**: when `sendChatMessage` resolves with the canonical
  message (regardless of `messageIdentity.source`), the entry for that
  `channelId` is removed.
- **Remove on idempotent success**: same as above; the canonical message is
  already in the refreshed payload, so preserve has nothing to do.
- **Remove on rollback**: when `sendChatMessage` rejects and the composer
  resets to `rollbackPayload`, the entry for that `channelId` is removed
  *before* the next SSE refresh runs.
- **Remove on channel deletion**: if the channel disappears from the
  refreshed payload while a send is pending (rare), the entry is removed
  silently and the helper logs a `feature:
  'chat_optimistic_message_orphaned_channel'` warn line.

The refresh pipeline iterates the registry and calls
`preserveOptimisticUserMessageAfterRefresh(prev, next, channelId)` once per
entry, threading the channel id through explicitly. The helper MUST NOT
fall back to `prev.chat.selectedChannelId` if the registry is empty —
empty registry means no preserve is required.

The registry is in-memory only and does not survive a renderer reload; any
optimistic send in flight at reload time is naturally invalidated when the
composer remounts and clears its state.

**Channel-switch limitation (v1)**: the registry stores only the
`optimisticMessageId`, not the full optimistic message body. The preserve
helper looks up the optimistic row by id from
`previousPayload.chat.selectedChannel.messages`. When the owner navigates
away from the sending channel, `previousPayload.chat.selectedChannel`
swaps to the new channel and the optimistic row is no longer in
in-memory state for the original channel. The helper has nothing to
preserve. If the owner navigates back to the original channel before the
HTTP ack arrives, the freshly fetched channel state does NOT contain the
optimistic row either (it has not been persisted yet) and the registry
holds only an id — there is no body to re-inject. The user briefly sees
an empty transcript at the original channel until the HTTP ack arrives or
the next SSE refresh fetches the channel after persistence.

v1 accepts this trade-off. The flicker eliminated by SPEC-106 is the
"stay on channel during pending send" case, which is the dominant use
case. Switching away mid-send is a rare flow, and the message is not
*lost* — it lands as soon as the server persists it; only the visual
continuity gap is wider than the no-switch case. Storing full optimistic
snapshots in the registry to cover the switch-back-before-ack case is
tracked under §Open Questions; if user testing surfaces it, v2 can lift
the registry value type to `{ optimisticMessageId, snapshot: ChatMessage
}`.

### Idempotency Boundary

Server-side `appendMessage` (or its caller in
`beginChannelMessageDispatch`) checks the channel's message list for an
existing entry with `id === clientMessageId` before appending. The action
depends on whether the colliding entry is *equivalent* to the incoming
send (`senderKind === 'user'`, same trimmed `body`, same `senderName`):

- **Equivalent collision** (FR-6 — idempotent retry of a successful send):
  - Skip the append.
  - Skip all downstream side effects of this dispatch (posture event,
    Cat proposal, runtime session creation).
  - Return the existing message and the current channel state.
  - Set `idempotent: true` and
    `messageIdentity = { source: 'idempotent', canonicalMessageId,
    clientMessageId }` on the response.

- **Non-equivalent collision** (FR-7 — different senderKind / body /
  senderName, indicating client bug or id-space pollution):
  - Do NOT reuse the colliding id.
  - Generate a fresh `randomUUID()` for the canonical id of the new entry.
  - Append the new user message and run all dispatch side effects as a
    fresh send.
  - Set `messageIdentity = { source: 'server_fallback',
    canonicalMessageId, clientMessageId, reason }` where `reason` is
    `'collision-foreign-sender'` (different senderKind) or
    `'collision-equivalence-mismatch'` (same senderKind, divergent
    body/senderName).
  - Emit a structured warn line under
    `feature: 'chat_client_message_id_collision'` so operators can
    investigate id-reuse patterns.

A non-collision send (no existing entry with the supplied id) honors the
client id and sets
`messageIdentity = { source: 'client', canonicalMessageId, clientMessageId }`
— or, if the supplied value is not a v4 UUID,
`{ source: 'server_fallback', reason: 'invalid-uuid', canonicalMessageId,
clientMessageId }` per FR-4.

In every case where a `clientMessageId` was supplied (well-formed or not,
collision or not), the persisted canonical record carries
`metadata.clientMessageId` and `metadata.clientMessageIdSource` per the
§Audit Metadata on the Canonical Record contract. The idempotent path
(FR-6) is the only exception: it returns the *existing* canonical record
without modifying its metadata, so the audit trail belongs to the
original successful send.

## Acceptance Criteria

- A workspace-composer send produces a single React row that transitions
  from optimistic to canonical without unmounting.
- The live-indicator log no longer shows a `msgs[N]` frame in which N is
  smaller than the previous frame's N during the optimistic → canonical
  window for a healthy send while the owner stays on the channel.
- A second `sendChatMessage` with the same well-formed `clientMessageId`
  and equivalent body/senderName returns the existing canonical message
  with `idempotent: true` and `messageIdentity.source = 'idempotent'`,
  and does not create a duplicate transcript entry, posture event, or Cat
  proposal.
- A `sendChatMessage` whose `clientMessageId` collides with a non-user
  message (system/agent/event) or with a user message of divergent
  body/senderName falls back to a fresh server UUID, runs all side
  effects, and surfaces `messageIdentity.source = 'server_fallback'` with
  the appropriate `reason`.
- A malformed `clientMessageId` (non-UUID) falls back to a fresh server
  UUID and surfaces `messageIdentity.source = 'server_fallback'` with
  `reason = 'invalid-uuid'`. The send is not rejected. Re-sending the
  same malformed value does NOT enjoy idempotency protection — each
  retry appends a new entry with a fresh server UUID.
- Telegram ingress and server-internal appends still produce
  server-generated message ids unchanged. The response surfaces no
  `messageIdentity` because no `clientMessageId` was supplied, and the
  persisted record carries no `metadata.clientMessageId` /
  `metadata.clientMessageIdSource`.
- Every persisted canonical record for a request that *did* carry a
  `clientMessageId` has `metadata.clientMessageId` (the original value
  the client sent) and `metadata.clientMessageIdSource` (matching
  `messageIdentity.source`) stamped on it, except for the idempotent
  return path which leaves the existing record untouched.
- Optimistic-preserve never re-introduces an entry that the composer has
  rolled back due to send failure (registry entry removed before next
  refresh).
- The optimistic-preserve helper consumes `(channelId, optimisticId)` from
  the in-flight send registry, never from `selectedChannelId`. Channel
  switches mid-send do not cause the wrong channel to be preserved.
- The registry holds at most one `(channelId, optimisticMessageId)` per
  channel in v1; a register attempt that would replace an existing entry
  emits a `feature: 'chat_optimistic_message_replaced_in_flight'` warn.
- Channel-switch trade-off (v1): when the owner switches away from the
  sending channel before the HTTP ack arrives and switches back before
  the ack lands, the optimistic row is NOT re-injected. The user sees
  the channel without the typed message until the ack or next SSE
  refresh persists the canonical record. This is documented behavior,
  not a bug.
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
- [ ] Should the pending-send registry store the full optimistic
      `ChatMessage` snapshot (`Map<channelId, { optimisticMessageId,
      snapshot: ChatMessage }>`) so that switching away from the sending
      channel and back before the HTTP ack still shows the typed message?
      Default v1 answer: no — the channel-switch case is rare and the
      message is not lost (only the visual continuity is wider). v2 can
      lift the value type if user testing shows it matters.
- [ ] Should the registry support multiple pending sends per channel
      (`Map<channelId, Set<optimisticMessageId>>`)? Default v1 answer:
      no — the workspace composer disables submit while a send is in
      flight, so the cap-of-one is enforced at the UI layer. Lift this
      only if a future flow (e.g. a queue-style composer that allows
      drafts) needs it.

## References

- [SPEC-069: Chat Continuity Semantics and Context Transplant](./SPEC-069-chat-continuity-semantics-and-context-transplant.md)
- [PLAN-095: Chat Optimistic Message Identity Rollout](../plans/PLAN-095-chat-optimistic-message-identity-rollout.md)

---

*Created: 2026-05-07*
*Author: Codex*
*Related Plan: [PLAN-095](../plans/PLAN-095-chat-optimistic-message-identity-rollout.md)*
