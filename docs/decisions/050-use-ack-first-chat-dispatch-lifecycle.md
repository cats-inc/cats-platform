# ADR-050: Use an ACK-First Chat Dispatch Lifecycle

> Accept and persist the user turn first, then continue runtime dispatch
> asynchronously with SSE-driven invalidation.

## Status

Accepted

## Context

`cats-platform` originally handled chat send as one coupled request:

1. create or select the room
2. optimistically show the user bubble in the renderer
3. keep the send request open while runtime session wake, dispatch, and reply
   completion all run
4. unblock the composer only after the full runtime reply finishes

That created repeated product problems:

- the user bubble could appear before the backend had actually accepted it
- first-send ordering differed between single chat and parallel chat
- room selection and chat switching could be blocked by long-running dispatch
- the renderer needed polling (`waitForPersistedUserTurn`) to guess when the
  user turn had finally been persisted
- `Stop` semantics were tied to aborting the request instead of cancelling the
  running server-side dispatch

This also blurred two separate concerns:

- `channel topology`: solo thread, boss room, direct lane
- `fan-out`: single-channel dispatch vs parallel dispatch across multiple
  channels

The topology determines routing targets and room policy. Fan-out determines how
many independent channel dispatches are started. They should stay orthogonal in
the send lifecycle.

## Decision

`cats-platform` will use an ACK-first send lifecycle for chat composer sends.

1. `POST /api/channels/:channelId/messages` must:
   - persist the user message and in-flight routing state first
   - return an acknowledged response immediately
   - start runtime continue work asynchronously after the ACK is sent

2. `POST /api/concurrent-groups/:groupId/messages` must:
   - stage and persist the acknowledged user turns for every target member chat
   - return one acknowledged response after all member ACK states are durable
   - continue each member dispatch asynchronously after the ACK is sent

3. The renderer must not optimistically insert the user bubble before ACK.
   - the visible user message comes from the acknowledged server response
   - the old polling bridge (`waitForPersistedUserTurn`) is not allowed

4. Composer busy states are split into:
   - `ack`: the room and user turn are being accepted, selection remains blocked
   - `ack` exposes a local `Cancel send` abort path for the in-flight request
   - `dispatch`: the user turn has been accepted, runtime work is running, and
     `Stop` becomes available

5. `Stop` must target the running server-side dispatch, not the original send
   request.
   - before ACK, the renderer may only abort the transport request
   - after ACK, the renderer must not treat the accepted user turn as
     retractable

6. Background dispatch completion and background dispatch failure must both
   publish room invalidation events over the existing chat SSE channel so the
   renderer can refresh from the authoritative app shell.

7. Background continue work must never overwrite newer persisted channel state
   with a stale whole-channel snapshot.
   - every background persistence step must merge dispatch-owned changes back
     into the latest durable room state
   - finalization and failure settlement must preserve later ACKed user turns
     and other concurrent room mutations
   - within `roomRouting`, config and outcome fields are merged separately, but
     `workflow` currently remains a single latest-wins merge unit
   - if overlapping background dispatches for the same channel both mutate
     `workflow`, the newer persisted workflow snapshot wins until a stronger
     turn/event-level merge is justified by observed product issues

8. This lifecycle applies to normal composer sends regardless of room topology.
   Parallel send remains fan-out over multiple independent channel dispatches;
   it is not a separate room model.

## Consequences

### Positive

- user bubbles only appear after the backend has accepted them
- first-send behavior is consistent across solo, boss, direct, and parallel
  chat flows
- room switching is no longer blocked by the full runtime reply duration
- ACK-stage hangs can be cancelled without conflating transport abort with
  server-side dispatch cancellation
- the renderer can show `Stop` only when there is an actual dispatch to cancel
- send completion becomes state-driven instead of request-lifetime-driven

### Tradeoffs

- send endpoints now acknowledge acceptance, not full dispatch completion
- tests and clients must distinguish `acknowledged` from `completed`
- background dispatch errors need explicit finalization logic so a room does not
  stay stuck in `running`
- overlapping same-channel dispatches currently resolve competing `workflow`
  snapshots with latest-wins semantics instead of turn/event-level merging

## Follow-up

This ADR settles the lifecycle boundary, but two UX pieces still build on top
of it and remain follow-up work:

1. message-level retry vs resend actions
2. stop-and-edit-last-message flows that supersede a cancelled last user turn

Those follow-ups must reuse the ACK-first lifecycle rather than reintroducing
optimistic local-only message state.

## Related

- [ADR-010](./010-separate-read-model-app-shell-from-restful-resource-apis.md)
- [ADR-041](./041-push-transport-and-chat-invalidations-over-sse.md)
- [ADR-042](./042-separate-channel-topology-from-routing-mode.md)
- [ADR-049](./049-cascade-product-deletes-into-runtime-session-deletion.md)
