# PLAN-095: Chat Optimistic Message Identity Rollout

> Implement SPEC-106 in two coordinated parts: a client-supplied stable
> message id contract and the wired-up optimistic-preserve refresh helper.
> Both parts are required to eliminate the first-message flicker; either one
> alone leaves a different transient empty frame visible to the owner.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Docs

- [SPEC-106: Chat Optimistic Message Identity and Refresh-Race Resilience](../specs/SPEC-106-chat-optimistic-message-identity.md)
- [SPEC-069: Chat Continuity Semantics and Context Transplant](../specs/SPEC-069-chat-continuity-semantics-and-context-transplant.md)

## Overview

The first message that an owner sends in a direct lane currently flashes
because two contracts are missing:

- The optimistic UUID and the server canonical UUID are not the same row, so
  React reconciles the canonical row by remounting instead of updating in
  place.
- The SSE-driven app-shell refresher fetches a fresh server snapshot before
  the `sendChatMessage` HTTP response returns, and the merge step does not
  preserve the still-pending optimistic message.

Either gap on its own causes a visible flicker; the existing
`preserveOptimisticUserMessageAfterRefresh` helper was written for this but
was never wired into production. PLAN-095 lands both contracts together and
validates the end-to-end happy path with no transient empty-transcript
frames.

## Implementation Guardrails

- Do not rely on prefix-based id matching (`optimistic-...`). The optimistic
  id is the bare UUID once SPEC-106 lands; server canonical id is the same
  UUID for owner-typed messages.
- Do not introduce a new SSE event kind. The existing `room_updated` event
  drives the refresh; the optimistic-preserve helper sits inside that flow.
- Do not allow `metadata.optimistic === true` to ever reach a server-persisted
  message. Strip it server-side before append.
- Do not change Telegram ingress or any server-internal append path. Those
  paths do not carry a `clientMessageId` and continue to use server-generated
  UUIDs.
- Do not change SPEC-069 recovery, runtime session lifecycle, or dispatch
  ordering. Those concerns are orthogonal.

## Implementation Phases

### Phase 1: Client-supplied stable id contract

- [ ] Task 1.1: Extend `SendChannelMessageInput` in
      `src/products/chat/api/contracts.ts` with optional
      `clientMessageId?: string`. Document the UUID-v4 expectation.
- [ ] Task 1.2: Update `createMessageRecord` in
      `src/products/chat/state/model/recordBuilders.ts` to accept an optional
      override id. When omitted, fall back to `randomUUID()` as today.
- [ ] Task 1.3: Update `appendMessage` in
      `src/products/chat/state/model/index.ts` to plumb the optional override
      through. Strip `metadata.optimistic` from the persisted message
      regardless of senderKind.
- [ ] Task 1.4: Update `beginChannelMessageDispatch` and any other
      direct-from-user-send caller in
      `src/products/chat/state/runtime-dispatch/routing.ts` to pass
      `payload.clientMessageId` into the user-message append path.
- [ ] Task 1.5: Implement the SPEC-106 collision matrix in
      `beginChannelMessageDispatch` / `appendMessage`:
      - **Equivalent collision** (existing entry has `senderKind === 'user'`,
        same trimmed `body`, same `senderName`) — skip the append and all
        downstream side effects (posture, Cat proposal, runtime session
        creation, SSE publish-once gate). Return the existing message and
        set `idempotent: true` with `messageIdentity.source = 'idempotent'`.
      - **Non-equivalent collision** (different `senderKind`, or same
        sender with divergent body/senderName) — do NOT reuse the colliding
        id. Generate a fresh `randomUUID()`, append the new message, run
        all side effects normally, and surface
        `messageIdentity.source = 'server_fallback'` with
        `reason = 'collision-foreign-sender'` /
        `'collision-equivalence-mismatch'`. Emit a structured warn under
        `feature: 'chat_client_message_id_collision'`.
- [ ] Task 1.6: Update the `sendChatMessage` HTTP handler in
      `src/products/chat/api/resources/channelRoutes.ts` to accept
      `clientMessageId` and surface SPEC-106 contract on the response:
      - When `clientMessageId` is present but malformed (not a v4 UUID),
        fall back to a server UUID rather than returning HTTP 400. Surface
        `messageIdentity.source = 'server_fallback'` with
        `reason = 'invalid-uuid'`.
      - When `clientMessageId` is honored, surface
        `messageIdentity.source = 'client'`.
      - When idempotent collision is detected, surface
        `idempotent: true` AND
        `messageIdentity.source = 'idempotent'` so legacy clients reading
        only `idempotent` continue to work and new clients can read the
        richer decision.
      - The new fields (`idempotent`, `messageIdentity`) are additive on
        top of the existing response shape (`appShell`, `message`,
        `phase`, `results`, `dispatch`); existing fields MUST NOT change
        meaning or shape.
- [ ] Task 1.7: Update `createOptimisticUserMessage` in
      `src/products/shared/renderer/workspaceChatUtils.tsx` to use a bare
      UUID as the message id (drop the `optimistic-` prefix). Keep
      `metadata.optimistic = true` as the client-only marker.
- [ ] Task 1.8: Update `appendOptimisticUserMessage` to expose the generated
      id to the caller (return it alongside the next payload).
- [ ] Task 1.9: Update `useWorkspaceComposerSubmit` to capture the optimistic
      id and pass it as `clientMessageId` into `sendChatMessage`.
- [ ] Task 1.10: Update existing tests in
      `tests/workspace-chat-optimistic.test.tsx` and any new-chat-routing
      test that depended on the `optimistic-` prefix. Add unit tests that
      pin the new contract:
      - Server honors a well-formed supplied id and surfaces
        `messageIdentity.source = 'client'`.
      - Equivalent idempotent collision returns the existing message
        without side effects and surfaces both `idempotent: true` and
        `messageIdentity.source = 'idempotent'`.
      - Non-equivalent collision (foreign sender / divergent body) falls
        back to a server UUID and surfaces
        `messageIdentity.source = 'server_fallback'` with the appropriate
        `reason`. Side effects run for the fresh send.
      - Malformed `clientMessageId` (non-UUID) falls back to a server UUID
        with `messageIdentity.source = 'server_fallback'` and
        `reason = 'invalid-uuid'`; the send is NOT rejected.
      - Telegram ingress and server-internal append paths produce no
        `messageIdentity` field (because they pass no `clientMessageId`)
        and continue to use server-generated UUIDs.

**Deliverables**: a workspace send always produces a transcript entry whose
id was generated by the client, and a duplicate send is idempotent.

### Phase 2: Wire up optimistic-preserve in refresh

- [ ] Task 2.1: Introduce the SPEC-106 in-flight send registry. Create a
      module-scope `pendingOptimisticSends: Map<channelId,
      optimisticMessageId>` (location TBD: either a small new file like
      `src/products/shared/renderer/pendingOptimisticSends.ts` or a hook
      adjacent to `useWorkspaceComposerSubmit`). Provide:
      - `registerPendingOptimisticSend(channelId, optimisticId)`
      - `clearPendingOptimisticSend(channelId)`
      - `iteratePendingOptimisticSends(): Iterable<[channelId,
        optimisticId]>`
      Lifecycle (per SPEC-106 §Refresh-Race Handling):
      - Add: `useWorkspaceComposerSubmit` registers immediately after
        `appendOptimisticUserMessage`, before the HTTP call.
      - Remove on success / idempotent / fallback: when `sendChatMessage`
        resolves.
      - Remove on rollback: in the `catch` path that resets to
        `rollbackPayload`.
- [ ] Task 2.2: Wire `preserveOptimisticUserMessageAfterRefresh` into the
      app-shell refresher in
      `src/products/shared/renderer/hooks/useWorkspaceChatEvents.ts` and the
      legacy `src/products/chat/renderer/hooks/useChatAppShellRefresh.ts`.
      The refresh callback MUST consume the registry from Task 2.1 and
      iterate `(channelId, optimisticId)` pairs. The helper is invoked once
      per pair with that explicit `channelId`. The refresh path MUST NOT
      fall back to `previousPayload.chat.selectedChannelId` when the
      registry is empty — empty registry means no preserve is required.
- [ ] Task 2.3: Tighten the helper's `alreadyPresent` check to compare ids
      and to reject preserve when the previous payload's optimistic message
      id collides with a refreshed entry that has different `senderKind` or
      `body`. Log a diagnostic warn line consistent with
      `feature: 'chat_optimistic_message_preserve'` when the helper rejects
      a candidate. Also handle the orphaned-channel case: if the registry
      points at a channel that disappeared from the refreshed payload, log
      `feature: 'chat_optimistic_message_orphaned_channel'` and remove the
      entry.
- [ ] Task 2.4: Confirm the helper does not re-introduce an optimistic
      message after composer rollback. The rollback path MUST clear the
      registry entry for the affected `channelId` BEFORE the next SSE
      refresh runs (covered by Task 2.1 lifecycle).
- [ ] Task 2.5: Add an integration test that drives a worker fixture
      simulating SSE refresh racing with `sendChatMessage`, verifying that
      the rendered messages count never decreases below the optimistic-add
      frame's count and that the canonical id replaces the optimistic in
      place once the response arrives. Add a second integration test for
      the channel-switch scenario: owner submits in channel A, switches to
      channel B before the SSE refresh fires, helper does NOT preserve in
      channel B; subsequent send response in channel A still resolves
      cleanly.

**Deliverables**: the optimistic-preserve helper runs in production and the
SSE refresh race no longer drops the pending message.

### Phase 3: End-to-end validation

- [ ] Task 3.1: Add an end-to-end happy-path test that walks
      `routeChannelMessage` (workspace composer) and asserts that the
      `[CV] li ...` style live-indicator log signature does not transit
      through a state with fewer messages than the optimistic-add frame.
- [ ] Task 3.2: Add a regression test for the cancel/abort path that proves
      a failed send does not leave a phantom optimistic entry after the next
      SSE refresh.
- [ ] Task 3.3: Run targeted regression bundles for chat dispatch, workspace
      composer, optimistic helpers, and SPEC-069 recovery. Confirm no test
      that depended on the `optimistic-` prefix is left unmigrated.
- [ ] Task 3.4: Update SPEC-106 verification notes with the validated test
      list and the live observation that the previous flicker is gone.

**Deliverables**: SPEC-106 acceptance criteria are met by automated tests
and a live observation, and the rollout is closed.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/api/contracts.ts` | Modify | Add optional `clientMessageId` on `SendChannelMessageInput`; additively add `idempotent?: true` and `messageIdentity?: SendChannelMessageMessageIdentity` on the response (do NOT change existing `appShell` / `message` / `phase` / `results` / `dispatch` fields). |
| `src/products/chat/state/model/recordBuilders.ts` | Modify | Accept optional override id in `createMessageRecord`; strip `metadata.optimistic` defensively. |
| `src/products/chat/state/model/index.ts` | Modify | Plumb the override id through `appendMessage`. |
| `src/products/chat/state/runtime-dispatch/routing.ts` | Modify | Pass `payload.clientMessageId` into the user-message append path; implement collision matrix (FR-6 / FR-7) with idempotent short-circuit vs server-fallback paths. |
| `src/products/chat/api/resources/channelRoutes.ts` | Modify | On invalid UUID, fall back to server UUID instead of returning 400; surface `idempotent` AND `messageIdentity` decision on the response. |
| `src/products/shared/renderer/pendingOptimisticSends.ts` | Create | SPEC-106 in-flight send registry: `Map<channelId, optimisticMessageId>` with register/clear/iterate helpers. (Location may move into a hook adjacent to `useWorkspaceComposerSubmit` if that fits the codebase better; the contract is unchanged.) |
| `src/products/shared/renderer/workspaceChatUtils.tsx` | Modify | Bare UUID for optimistic id; expose generated id from `appendOptimisticUserMessage`; keep `metadata.optimistic` as the client-only marker. |
| `src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts` | Modify | Capture the optimistic id, register it in the pending-sends registry, pass it as `clientMessageId` to `sendChatMessage`, and clear the registry entry on resolve / rollback. |
| `src/products/shared/renderer/hooks/useWorkspaceChatEvents.ts` | Modify | Iterate the pending-sends registry and call `preserveOptimisticUserMessageAfterRefresh(prev, next, channelId)` once per entry; never derive `channelId` from `selectedChannelId`. |
| `src/products/chat/renderer/hooks/useChatAppShellRefresh.ts` | Modify | Same registry-driven preserve wiring for the legacy refresher. |
| `tests/workspace-chat-optimistic.test.tsx` | Modify | Drop `optimistic-` prefix assertions; add idempotency, preserve-helper-wired, and abort-rollback coverage. |
| `tests/chat-product-intent-dispatch.test.tsx` | Modify (if needed) | Migrate any test that previously relied on prefix-based id matching. |
| `tests/new-chat-routing.test.tsx` | Modify (if needed) | Confirm `isOptimisticDraftChannelId` (channel-id concept) is unaffected; only message-id prefix changes. |
| `tests/<new>chat-optimistic-message-identity-e2e.test.tsx` | Create | End-to-end happy-path and abort-rollback tests for the SSE/HTTP race. |
| `docs/specs/SPEC-106-chat-optimistic-message-identity.md` | Modify | Append §Verification Notes after Phase 3. |
| `docs/plans/PLAN-095-chat-optimistic-message-identity-rollout.md` | Modify | Track progress per slice. |

## Technical Decisions

- The optimistic id is a bare UUID v4. The previous `optimistic-` prefix is
  retired because it forced an id mismatch on every server ack.
- The `metadata.optimistic` flag stays as the in-flight marker. Server-side
  append strips it before persistence. Canonical messages never carry it.
- Invalid `clientMessageId` (not a v4 UUID) is **not** rejected as an HTTP
  error. The server falls back to a fresh UUID, the body still posts, and
  `messageIdentity.source = 'server_fallback'` with
  `reason = 'invalid-uuid'` exposes the decision for audit. Rationale:
  matches Telegram / server-internal append behavior (which also pass no
  client id) and avoids breaking misbehaving clients with a 400.
- The collision matrix is binary: equivalent (FR-6) → idempotent reuse;
  non-equivalent (FR-7) → server fallback. There is no "merge-into-existing"
  path. Same `clientMessageId` with divergent body or non-user senderKind
  always falls back, never reuses the colliding row.
- Response shape changes are additive only. Existing fields (`appShell`,
  `message`, `phase`, `results`, `dispatch`) keep their current shape and
  meaning. Legacy clients reading just `idempotent: true` continue to
  work; new clients can read the richer `messageIdentity` decision.
- Telegram ingress and server-internal appends do not pass
  `clientMessageId`; they continue to use server-generated UUIDs and the
  response omits `messageIdentity` (no decision to surface).
- The preserve helper sits between the merge and the React commit. Both
  refresh paths (`useWorkspaceChatEvents` and the legacy
  `useChatAppShellRefresh`) call it before `setState`, and the call is
  driven by the in-flight send registry — channelId comes from the
  registry, never from `selectedChannelId`.

## Testing Strategy

- **Unit tests**:
  - `clientMessageId` flows through `createMessageRecord` when supplied.
  - `appendMessage` strips `metadata.optimistic` before persisting.
  - Equivalent collision (FR-6): returns existing message, skips side
    effects, surfaces `idempotent: true` AND
    `messageIdentity.source = 'idempotent'`.
  - Non-equivalent collision (FR-7) — foreign sender: falls back to server
    UUID, runs side effects, surfaces
    `messageIdentity.source = 'server_fallback'` with
    `reason = 'collision-foreign-sender'`.
  - Non-equivalent collision (FR-7) — divergent body/senderName: same
    fallback path with `reason = 'collision-equivalence-mismatch'`.
  - Invalid `clientMessageId` (non-UUID): falls back to server UUID,
    surfaces `messageIdentity.source = 'server_fallback'` with
    `reason = 'invalid-uuid'`. The send is NOT rejected.
  - `createOptimisticUserMessage` produces a bare UUID id.
  - `preserveOptimisticUserMessageAfterRefresh` matches by id and rejects
    on `senderKind`/`body` mismatch with a different canonical entry.
  - Pending-sends registry: register adds, clear removes, rollback path
    clears the entry before refresh.
- **Integration tests**:
  - Workspace send writes one canonical message whose id equals the
    optimistic id (`messageIdentity.source = 'client'`).
  - Race-mode test (SSE refresh fires before HTTP returns) keeps the
    optimistic entry visible until the canonical replaces it in place.
  - Abort-mode test (HTTP throws, composer rollback) does not let the next
    SSE refresh re-introduce the optimistic entry.
  - Channel-switch test: owner submits in channel A, switches to channel B
    before the refresh fires; the helper does NOT preserve in B, and when
    the response resolves in A the registry entry clears cleanly.
  - Telegram ingress test still produces server-generated ids and no
    `messageIdentity` field on its persistence path.
- **Regression tests**:
  - Existing SPEC-069 recovery tests are unaffected.
  - Existing `isOptimisticDraftChannelId` (channel-id concept) tests still
    pass; the message-id prefix change does not affect channel paths.
  - Existing `chat-product-intent-dispatch` and proposal tests still pass.

## Open Questions

- [ ] Should the renderer surface a tiny visual marker (e.g. a clock icon)
      while `metadata.optimistic === true`, or rely on the unchanged plain
      transcript row? Default v1 answer: rely on the row; the existing live
      indicator transitions are sufficient feedback.
- [ ] Should mobile composer flows opt into the contract in this rollout, or
      defer to a separate mobile slice? Default v1 answer: defer.

## Follow-up Backlog

- Mobile composer parity for SPEC-106 client-supplied id is deferred to a
  separate mobile slice.
- Surfacing `idempotent: true` on passive SSE consumers (other open tabs) is
  deferred; the SSE refetch converges naturally for v1.
- A future enhancement could let the renderer animate the optimistic →
  canonical id swap (the underlying React row is unchanged but the
  `metadata.optimistic` flag flips). Out of scope for v1.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Server canonical message accidentally carries `metadata.optimistic` | Medium | `appendMessage` strips the key on every append; unit test pins the invariant. |
| Existing code depends on the `optimistic-` id prefix | Medium | Prelanding grep audit (already performed): only `workspaceChatUtils.createOptimisticUserMessage` constructs the prefixed id and only `tests/workspace-chat-optimistic` asserts on it; channel-id `isOptimisticDraftChannelId` is a different concept and unaffected. |
| Idempotent collision causes a confused renderer animation | Low | Response carries explicit `idempotent: true` AND `messageIdentity.source = 'idempotent'`; renderer treats it as a successful send and the existing canonical row stays. |
| Preserve helper re-introduces a rolled-back optimistic message | Medium | Composer rollback removes the entry from the in-flight send registry AND from `payload.chat.selectedChannel.messages` before the next SSE refresh runs; helper iterates an empty (or shorter) registry and finds nothing to preserve. Phase 3 adds an explicit abort-rollback test. |
| Mobile send flows fail silently because they do not carry `clientMessageId` | Low | Server fallback to `randomUUID()` keeps existing mobile send working and the response simply omits `messageIdentity`; mobile parity is tracked in §Follow-up Backlog. |
| `clientMessageId` collides with a system/agent or divergent-body entry | Medium | FR-7 path: server detects non-equivalent collision, falls back to a fresh UUID, runs side effects normally, surfaces `messageIdentity.source = 'server_fallback'` with `reason`, and emits a `feature: 'chat_client_message_id_collision'` warn for operator audit. The colliding existing row is never overwritten. |
| Channel switch mid-send drops optimistic preserve for the wrong channel | Medium | Pending-sends registry is keyed by `channelId`; refresh iterates the registry rather than reading `selectedChannelId`. Channel-switch integration test in Task 2.5 pins the behavior. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-07 | Plan created from a live diagnosis of the first-message flicker. SPEC-106 captures the contract; PLAN-095 splits the rollout into the client-supplied id contract (Phase 1), the optimistic-preserve wire-up (Phase 2), and an end-to-end validation slice (Phase 3). Existing `preserveOptimisticUserMessageAfterRefresh` helper is reused; it was already implemented and tested but never wired into production. |
| 2026-05-07 | Follow-up review pointed out 5 contract gaps in the initial draft: (1) invalid-clientMessageId behavior contradicted across SPEC FR-3 / Task 1.10 / Testing Strategy, (2) response shape definition silently dropped existing fields (`phase`/`results`/`dispatch`), (3) `idempotent?: true` alone could not express server-fallback decisions, (4) collision rules only handled the user-message case, leaving system/agent collisions and divergent-body cases undefined, (5) preserve wire-up did not specify the channelId source. SPEC-106 now defines the `messageIdentity` schema (FR-14), splits the collision matrix into FR-6 (equivalent → idempotent) and FR-7 (non-equivalent → server fallback), pins the response shape as additive only, and introduces the in-flight send registry that the preserve helper consumes (FR-12). PLAN-095 Task 1.5 / 1.6 / 1.10 / 2.1 / 2.2 / 2.5 align with the updated contract. |

---

*Created: 2026-05-07*
*Author: Codex*
