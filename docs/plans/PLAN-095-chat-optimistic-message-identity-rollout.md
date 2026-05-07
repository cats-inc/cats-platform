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
targets end-to-end validation of the happy path with no transient
empty-transcript frames.

## Outstanding Verification

- Browser live observation for Task 3.1 is still outstanding. Automated
  tests cover the server idempotency contract and registry-driven preserve
  behavior, but they do not prove the `[CV] li ...` live-indicator trace
  never passes through a lower message count in an actual browser renderer.
- This was intentionally not performed in the current automation slice
  because it would require sending a verification message into the user's
  persisted dev transcript. Under the repo state-hygiene policy, that
  needs explicit user approval for the exact write payload before running.

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

- [x] Task 1.1: Extend `SendChannelMessageInput` in
      `src/products/chat/api/contracts.ts` with optional
      `clientMessageId?: string`. Document the UUID-v4 expectation.
- [x] Task 1.2: Update `createMessageRecord` in
      `src/products/chat/state/model/recordBuilders.ts` to accept an optional
      override id. When omitted, fall back to `randomUUID()` as today.
- [x] Task 1.3: Update `appendMessage` in
      `src/products/chat/state/model/index.ts` to plumb the optional override
      through. Strip `metadata.optimistic` from the persisted message
      regardless of senderKind. When the caller supplies a non-empty
      `clientMessageId` AND a fresh canonical record is being persisted,
      stamp three audit metadata keys on the new record:
      - `metadata.clientMessageId` (the trimmed client-supplied value)
      - `metadata.clientMessageIdSource: 'client' | 'server_fallback'`
        (the persistence-time enum is narrower than
        `messageIdentity.source` — `'idempotent'` is response-only and
        never persisted because FR-6 returns the existing record
        untouched)
      - `metadata.clientMessageFingerprint` (the canonical fingerprint
        described in Task 1.5)
      Idempotent collision (FR-6) returns the existing record untouched —
      do NOT re-stamp.
- [x] Task 1.4: Update `beginChannelMessageDispatch` and any other
      direct-from-user-send caller in
      `src/products/chat/state/runtime-dispatch/routing.ts` to pass
      `payload.clientMessageId`, the resolved `clientMessageIdSource`,
      and the computed canonical fingerprint into the user-message append
      path so Task 1.3 can stamp the audit metadata correctly. Telegram
      ingress and server-internal appends continue to pass nothing on
      this path.
- [x] Task 1.5: Implement the SPEC-106 collision matrix in
      `beginChannelMessageDispatch` / `appendMessage`. Define the
      canonical fingerprint as a deterministic SHA-256 over a stable
      JSON serialization of:
      - the trimmed `senderName`,
      - the normalized `body` (after the same pre-persistence
        normalization the append pipeline applies — mention extraction,
        choice extraction, fenced JSON parsing, body trimming),
      - the normalized structural `choices` value (or `null`) produced by
        the same append-time choice extraction,
      - the structural value of `choiceResponse` (or `null`),
      - the structural value of `messageMetadata` after stripping the
        `optimistic` flag and the server-managed client-message audit keys
        (`clientMessageId`, `clientMessageIdSource`,
        `clientMessageFingerprint`).
      Compare *fingerprints*, not raw fields, on collision:
      - **Equivalent collision** — existing entry has
        `senderKind === 'user'` AND the stored
        `metadata.clientMessageFingerprint` matches the incoming
        request's freshly computed fingerprint. Skip the append and all
        downstream side effects (posture, Cat proposal, runtime session
        creation, SSE publish-once gate). Return the existing message
        and set `idempotent: true` with
        `messageIdentity.source = 'idempotent'`.
      - **Non-equivalent collision** — different `senderKind`, or same
        senderKind with a divergent fingerprint. Do NOT reuse the
        colliding id. Generate a fresh `randomUUID()`, append the new
        message, run all side effects normally, and surface
        `messageIdentity.source = 'server_fallback'` with
        `reason = 'collision-foreign-sender'` /
        `'collision-equivalence-mismatch'`. Emit a structured warn
        under `feature: 'chat_client_message_id_collision'`.
- [x] Task 1.6: Update the `sendChatMessage` HTTP handler in
      `src/products/chat/api/resources/channelRoutes.ts` to accept
      `clientMessageId` and surface SPEC-106 contract on the response:
      - **Length cap (FR-4)**: trim surrounding whitespace, then reject
        with HTTP 400 when the supplied `clientMessageId` exceeds 128
        characters. The 128-char cap is
        the only sanitation step beyond trimming whitespace and is
        designed to prevent a misbehaving client from inflating
        transcript / state files via the audit metadata.
      - When `clientMessageId` is present but malformed (not a v4 UUID)
        and within the 128-char cap, fall back to a server UUID rather
        than returning HTTP 400. Surface
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
- [x] Task 1.7: Update `createOptimisticUserMessage` in
      `src/products/shared/renderer/workspaceChatUtils.tsx` to use a bare
      UUID as the message id (drop the `optimistic-` prefix). Keep
      `metadata.optimistic = true` as the client-only marker.
- [x] Task 1.8: Update `appendOptimisticUserMessage` to expose the generated
      id to the caller (return it alongside the next payload).
- [x] Task 1.9: Update `useWorkspaceComposerSubmit` to capture the optimistic
      id and pass it as `clientMessageId` into `sendChatMessage`.
- [x] Task 1.10: Update existing tests in
      `tests/workspace-chat-optimistic.test.tsx` and any new-chat-routing
      test that depended on the `optimistic-` prefix. Add unit tests that
      pin the new contract:
      - Server honors a well-formed supplied id and surfaces
        `messageIdentity.source = 'client'`. The persisted record carries
        `metadata.clientMessageId === <supplied>`,
        `metadata.clientMessageIdSource === 'client'`, and a non-empty
        `metadata.clientMessageFingerprint`.
      - Equivalent idempotent collision returns the existing message
        without side effects, surfaces both `idempotent: true` and
        `messageIdentity.source = 'idempotent'`, and does NOT re-stamp
        the existing record's metadata. Persisted records never carry
        `clientMessageIdSource = 'idempotent'`.
      - Equivalence is determined by the canonical fingerprint, not raw
        fields. A retry whose `body` differs only in trailing whitespace
        or where mention / choice extraction would yield the same
        normalized body and choices is treated as equivalent. A retry
        whose `choiceResponse` or non-server-managed `messageMetadata`
        differs structurally is non-equivalent.
      - Non-equivalent collision (foreign sender / divergent fingerprint)
        falls back to a server UUID, surfaces
        `messageIdentity.source = 'server_fallback'` with the appropriate
        `reason`, runs side effects, and stamps
        `metadata.clientMessageId`, `metadata.clientMessageIdSource =
        'server_fallback'`, and the new fingerprint on the new record.
      - Malformed `clientMessageId` (non-UUID, ≤128 chars) falls back to
        a server UUID with `messageIdentity.source = 'server_fallback'`
        and `reason = 'invalid-uuid'`; the send is NOT rejected. Two
        successive sends with the same malformed value produce two
        independent canonical records (no idempotency for malformed
        values; SPEC-106 NFR Idempotency-safety scopes only well-formed
        UUIDs).
      - Oversized `clientMessageId` (>128 chars) returns HTTP 400 and
        does NOT enter the dispatch path; no record is appended.
      - Telegram ingress and server-internal append paths produce no
        `messageIdentity` field (because they pass no `clientMessageId`)
        and continue to use server-generated UUIDs. The persisted record
        carries none of the audit metadata keys
        (`metadata.clientMessageId`, `metadata.clientMessageIdSource`,
        `metadata.clientMessageFingerprint`).

**Deliverables**: a workspace send always produces a transcript entry whose
id was generated by the client, and a duplicate send is idempotent.

### Phase 2: Wire up optimistic-preserve in refresh

- [x] Task 2.1: Introduce the SPEC-106 in-flight send registry. Create
      a renderer-instance-local `pendingOptimisticSends: Map<channelId,
      optimisticMessageId>` (location TBD: either a small new file like
      `src/products/shared/renderer/pendingOptimisticSends.ts` or a hook
      adjacent to `useWorkspaceComposerSubmit`). Provide:
      - `registerPendingOptimisticSend(channelId, optimisticId)` — when
        the channel already has an entry, replace it AND emit a warn
        line under
        `feature: 'chat_optimistic_message_replaced_in_flight'` (the
        composer's submit-disabled UX should make this defensive only).
      - `clearPendingOptimisticSend(channelId)`
      - `iteratePendingOptimisticSends(): Iterable<[channelId,
        optimisticId]>`
      Cardinality / scope per SPEC-106:
      - **At most one entry per channelId in v1.** The composer's submit
        affordance is disabled while a send is in flight for the same
        channel; the registry's replace-with-warn is a defensive
        backstop, not the primary enforcement.
      - **Renderer-instance local.** No cross-tab sharing; each browser
        tab maintains its own Map. Server-side FR-6 / FR-7 only dedupes
        on the `(channelId, clientMessageId)` pair: if two tabs each
        generate their own UUID and submit logically the same message,
        the server has no way to tell they are the same and persists
        both. Cross-tab dedupe of distinct UUIDs is out of scope for
        SPEC-106 — that is a separate problem (e.g. a shared submit
        intent broker over SSE) and would need its own design.
      Lifecycle (per SPEC-106 §Refresh-Race Handling):
      - Add: `useWorkspaceComposerSubmit` registers immediately after
        `appendOptimisticUserMessage`, before the HTTP call.
      - Remove on success / idempotent / fallback: when `sendChatMessage`
        resolves.
      - Remove on rollback: in the `catch` path that resets to
        `rollbackPayload`.
- [x] Task 2.2: Wire `preserveOptimisticUserMessageAfterRefresh` into the
      app-shell refresher in
      `src/products/shared/renderer/hooks/useWorkspaceChatEvents.ts` and the
      legacy `src/products/chat/renderer/hooks/useChatAppShellRefresh.ts`.
      The refresh callback MUST consume the registry from Task 2.1 and
      iterate `(channelId, optimisticId)` pairs. The helper is invoked once
      per pair with that explicit `channelId`. The refresh path MUST NOT
      fall back to `previousPayload.chat.selectedChannelId` when the
      registry is empty — empty registry means no preserve is required.
- [x] Task 2.3: Tighten the helper's `alreadyPresent` check to compare ids
      and to reject preserve when the previous payload's optimistic message
      id collides with a refreshed entry that has different `senderKind` or
      `body`. Log a diagnostic warn line consistent with
      `feature: 'chat_optimistic_message_preserve'` when the helper rejects
      a candidate. Also handle the orphaned-channel case: if the registry
      points at a channel that disappeared from the refreshed payload, log
      `feature: 'chat_optimistic_message_orphaned_channel'` and remove the
      entry.
- [x] Task 2.4: Confirm the helper does not re-introduce an optimistic
      message after composer rollback. The rollback path MUST clear the
      registry entry for the affected `channelId` BEFORE the next SSE
      refresh runs (covered by Task 2.1 lifecycle).
- [x] Task 2.5: Add targeted renderer integration tests covering:
      - Race-mode helper path: an SSE-style app-shell refresh snapshot
        drops the still-pending row, and the registry-driven preserve
        path keeps the registered optimistic entry visible while the
        owner remains on that channel.
      - Channel-switch / pre-ack: owner submits in channel A, switches to
        channel B before the SSE refresh fires, helper does NOT preserve
        in channel B; subsequent send response in channel A still
        resolves cleanly (registry entry clears even though A is no
        longer the selected channel).
      - Channel-switch-back / pre-ack (v1 trade-off): owner submits in
        channel A, switches to B, switches back to A *before* HTTP ack.
        The optimistic row is NOT re-injected — the v1 registry holds
        only the id, not the body. The test asserts the documented v1
        behavior (rendered messages for A do not include the typed
        message until the ack lands) so a future change that lifts this
        limitation has a clear baseline to invert.
      - Defensive replace warn: a second `registerPendingOptimisticSend`
        for an already-registered channel emits a
        `feature: 'chat_optimistic_message_replaced_in_flight'` warn
        (this should not happen under normal composer-submit-disabled
        UX; the test pins the defensive backstop).
      - Exact-id preserve: the refresh helper preserves the registry's
        `optimisticMessageId`, not the latest optimistic row found in the
        channel.

**Deliverables**: the optimistic-preserve helper runs in production and the
SSE refresh race no longer drops the pending message.

### Phase 3: End-to-end validation

- [ ] Task 3.1: Add an end-to-end happy-path test that walks
      `routeChannelMessage` (workspace composer) and asserts that the
      `[CV] li ...` style live-indicator log signature does not transit
      through a state with fewer messages than the optimistic-add frame.
- [x] Task 3.2: Add a regression test for the cancel/abort path that proves
      a failed send does not leave a phantom optimistic entry after the next
      SSE refresh.
- [x] Task 3.3: Run targeted regression bundles for chat dispatch, workspace
      composer, optimistic helpers, and SPEC-069 recovery. Confirm no test
      that depended on the `optimistic-` prefix is left unmigrated.
- [x] Task 3.4: Update SPEC-106 verification notes with the validated test
      list and the live-observation status. The browser `[CV] li ...`
      observation remains intentionally unperformed in this slice because it
      would require writing a verification message into the user's persisted
      dev transcript without explicit approval.

**Deliverables**: SPEC-106 acceptance criteria are met by automated tests
and a live observation, and the rollout is closed.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/api/contracts.ts` | Modify | Add optional `clientMessageId` on `SendChannelMessageInput`; additively add `idempotent?: true` and `messageIdentity?: SendChannelMessageMessageIdentity` on the response (do NOT change existing `appShell` / `message` / `phase` / `results` / `dispatch` fields). |
| `src/products/chat/state/model/recordBuilders.ts` | Modify | Accept optional override id in `createMessageRecord`; strip `metadata.optimistic` defensively. Accept the resolved `clientMessageIdSource` and pre-computed canonical fingerprint so the persistence call site can stamp `metadata.clientMessageId`, `metadata.clientMessageIdSource`, and `metadata.clientMessageFingerprint` per SPEC-106 NFR Auditability. |
| `src/products/chat/state/model/index.ts` | Modify | Plumb the override id, source, and fingerprint through `appendMessage`; stamp the three audit metadata keys on the persisted record when the caller supplied a `clientMessageId` (skip stamping on the idempotent return path — existing record stays untouched). |
| `src/products/chat/state/runtime-dispatch/routing.ts` | Modify | Compute the canonical fingerprint over the normalized append-time inputs; pass `payload.clientMessageId`, the resolved `clientMessageIdSource`, and the fingerprint into the user-message append path; implement collision matrix (FR-6 / FR-7) by comparing the incoming fingerprint against the stored `metadata.clientMessageFingerprint` of the colliding record, NOT raw fields. |
| `src/products/chat/api/contracts.ts` (ChannelMessageMetadata) | Modify | Add three optional persisted audit keys: `clientMessageId?: string`, `clientMessageIdSource?: 'client' \| 'server_fallback'` (note: `'idempotent'` is response-only and never persisted), `clientMessageFingerprint?: string`. Telegram / server-internal append paths leave all three undefined. |
| `src/products/chat/api/resources/channelRoutes.ts` | Modify | On invalid UUID, fall back to server UUID instead of returning 400; surface `idempotent` AND `messageIdentity` decision on the response. |
| `src/products/shared/renderer/pendingOptimisticSends.ts` | Create | SPEC-106 in-flight send registry: `Map<channelId, optimisticMessageId>` with register/clear/iterate helpers. (Location may move into a hook adjacent to `useWorkspaceComposerSubmit` if that fits the codebase better; the contract is unchanged.) |
| `src/products/shared/renderer/workspaceChatUtils.tsx` | Modify | Bare UUID for optimistic id; expose generated id from `appendOptimisticUserMessage`; keep `metadata.optimistic` as the client-only marker. |
| `src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts` | Modify | Capture the optimistic id, register it in the pending-sends registry, pass it as `clientMessageId` to `sendChatMessage`, and clear the registry entry on resolve / rollback. |
| `src/products/shared/renderer/hooks/useWorkspaceChatEvents.ts` | Modify | Iterate the pending-sends registry and call `preserveOptimisticUserMessageAfterRefresh(prev, next, channelId, optimisticMessageId)` once per entry; never derive `channelId` from `selectedChannelId` and never infer the optimistic row from "latest optimistic" scanning. |
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
- Invalid `clientMessageId` (not a v4 UUID, ≤128 chars) is **not**
  rejected as an HTTP error. The server falls back to a fresh UUID, the
  body still posts, and `messageIdentity.source = 'server_fallback'`
  with `reason = 'invalid-uuid'` exposes the decision for audit.
  Rationale: matches Telegram / server-internal append behavior (which
  also pass no client id) and avoids breaking misbehaving clients with a
  400. **Oversized** `clientMessageId` (>128 chars) IS rejected with
  HTTP 400 — this hard cap is the only sanitation step beyond trimming
  and is designed to prevent a misbehaving client from inflating
  transcript / state files via the audit metadata key.
- The collision matrix is binary: equivalent (FR-6) → idempotent reuse;
  non-equivalent (FR-7) → server fallback. There is no
  "merge-into-existing" path. Equivalence is decided by a canonical
  fingerprint (SHA-256 over a stable serialization of trimmed
  senderName, normalized body, normalized choices, structural
  choiceResponse, and messageMetadata sans `optimistic` plus the
  server-managed client-message audit keys), NOT by raw fields, because
  the message append pipeline runs normalization (mention extraction,
  choice extraction, fenced JSON parsing, body trimming) before
  persistence and a literal field comparison would be unstable.
- Idempotency safety is scoped to **well-formed v4 UUIDs** only. Two
  successive sends with the same malformed `clientMessageId` produce two
  independent canonical records (each fallback gets a fresh server UUID).
  Clients that need idempotency MUST send well-formed values.
- Audit metadata (`metadata.clientMessageId`,
  `metadata.clientMessageIdSource`, `metadata.clientMessageFingerprint`)
  lives on the persisted canonical record so post-hoc inspection works
  without keeping the response payload around. The persisted
  `clientMessageIdSource` enum is narrower than the response one —
  only `'client'` and `'server_fallback'` ever appear on a record;
  `'idempotent'` is response-only because FR-6 returns the existing
  record untouched and never persists a fresh row. Idempotent
  collisions do NOT re-stamp; the existing record's metadata stays
  authoritative.
- The pending-send registry caps at one entry per channel in v1
  (composer disables submit while in-flight). It is renderer-instance
  local — no cross-tab sharing. Server-side FR-6 / FR-7 only dedupes on
  the `(channelId, clientMessageId)` pair: distinct UUIDs from
  different tabs that represent logically the same submission are NOT
  deduped (each tab generates its own UUID and the server has no way
  to tell them apart). Cross-tab dedupe of distinct UUIDs is out of
  scope for SPEC-106.
- Channel-switch trade-off (v1): the registry holds only the
  `optimisticMessageId`, not the message body. Switching away from the
  sending channel and back before the HTTP ack means the typed message
  is briefly absent from the channel view until the ack or next SSE
  refresh persists the canonical record. v2 may upgrade the registry
  value to a full `ChatMessage` snapshot if user testing surfaces this
  as an issue.
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
  - `appendMessage` stamps `metadata.clientMessageId`,
    `metadata.clientMessageIdSource ∈ { 'client', 'server_fallback' }`,
    and `metadata.clientMessageFingerprint` when the caller supplied a
    `clientMessageId` (covers honor / fallback / collision cases). No
    persisted record ever carries
    `clientMessageIdSource = 'idempotent'`.
  - `appendMessage` does NOT stamp any of the three audit keys for
    Telegram or server-internal append paths (no `clientMessageId`
    supplied).
  - Idempotent return (FR-6) does NOT re-stamp the existing record's
    metadata; original audit values stay authoritative.
  - Equivalent collision (FR-6) by canonical fingerprint: returns
    existing message, skips side effects, surfaces `idempotent: true`
    AND `messageIdentity.source = 'idempotent'`. Includes a positive
    test that two retries differing only in trailing whitespace or
    mention-extraction-equivalent prefixes are deduped.
  - Non-equivalent collision (FR-7) — foreign sender: falls back to server
    UUID, runs side effects, surfaces
    `messageIdentity.source = 'server_fallback'` with
    `reason = 'collision-foreign-sender'`.
  - Non-equivalent collision (FR-7) — divergent fingerprint (different
    body / choices after normalization, senderName, choiceResponse, or
    non-server-managed messageMetadata): same fallback path with
    `reason = 'collision-equivalence-mismatch'`.
  - Invalid `clientMessageId` (non-UUID, ≤128 chars): falls back to
    server UUID, surfaces
    `messageIdentity.source = 'server_fallback'` with
    `reason = 'invalid-uuid'`. The send is NOT rejected.
  - Oversized `clientMessageId` (>128 chars): HTTP 400; no record
    appended; no audit metadata written.
  - Two successive sends with the same malformed `clientMessageId`
    produce two independent canonical records (no idempotency for
    malformed values).
  - `createOptimisticUserMessage` produces a bare UUID id.
  - `preserveOptimisticUserMessageAfterRefresh` matches by id and rejects
    on `senderKind`/`body` mismatch with a different canonical entry.
  - Registry-driven preserve passes both `channelId` and
    `optimisticMessageId`; the helper preserves the named row and does not
    infer a different row from the latest optimistic message in the
    channel.
  - Fingerprint idempotency includes server-augmented append-time metadata,
    so retries are only idempotent while those state-derived keys remain
    stable.
  - Pending-sends registry: register adds, clear removes, rollback path
    clears the entry before refresh; defensive replace emits the
    `chat_optimistic_message_replaced_in_flight` warn.
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
  - Channel-switch-back trade-off (v1): owner submits in A, switches to B,
    switches back to A *before* HTTP ack — A's transcript does NOT show
    the typed message until the ack lands. Pins the documented v1
    behavior so v2 has a clear inversion target if it lifts the
    snapshot-in-registry limitation.
  - Telegram ingress test still produces server-generated ids and no
    `messageIdentity` field on its persistence path; the persisted
    record carries none of the audit keys (`metadata.clientMessageId`,
    `metadata.clientMessageIdSource`,
    `metadata.clientMessageFingerprint`).
  - Multi-tab logical duplicate test: two tabs each generate their own
    UUID, both submit equivalent bodies in the same channel; the server
    persists two independent canonical records. Pins that SPEC-106 is
    NOT a cross-tab dedupe mechanism (different `clientMessageId`
    values bypass FR-6).
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
- [ ] Should the pending-send registry hold the full optimistic
      `ChatMessage` snapshot (`Map<channelId, { id, snapshot }>`) so a
      switch-away-and-back flow before HTTP ack can re-inject the typed
      message? Default v1 answer: no — channel switches mid-send are rare
      and the message is not lost (only the visual continuity is wider).
      Lift in v2 if user testing surfaces it.
- [ ] Should the registry value type lift to
      `Set<optimisticMessageId>` per channel to support multiple
      simultaneous pending sends in the same channel (e.g. a future
      queue-style composer)? Default v1 answer: no — composer disables
      submit while in-flight, so cap-of-one is enforced at the UI layer.

## Follow-up Backlog

- Mobile composer parity for SPEC-106 client-supplied id is deferred to a
  separate mobile slice.
- Surfacing `idempotent: true` on passive SSE consumers (other open tabs) is
  deferred; the SSE refetch converges naturally for v1.
- A future enhancement could let the renderer animate the optimistic →
  canonical id swap (the underlying React row is unchanged but the
  `metadata.optimistic` flag flips). Out of scope for v1.
- Snapshot-in-registry upgrade (channel-switch-back coverage) is a v2
  candidate; will require lifting the Map value to
  `{ optimisticMessageId, snapshot: ChatMessage }` and re-injecting on
  channel re-entry.

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
| Owner switches away then back to the sending channel before HTTP ack — typed message briefly absent | Low (v1 trade-off) | Documented as the v1 channel-switch trade-off in SPEC-106 §Refresh-Race Handling and Acceptance Criteria. The message is not lost; it lands as soon as the server persists. v2 may store snapshots in the registry to close this gap; tracked in §Follow-up Backlog. Task 2.5 includes a baseline test pinning the documented v1 behavior. |
| Repeated malformed `clientMessageId` produces duplicate transcript entries | Low | NFR Idempotency-safety scopes guarantees only to well-formed v4 UUIDs. Each malformed retry falls back to a fresh server UUID, so duplicates are by design. Unit test in Task 1.10 pins the behavior so future readers don't mistake it for a bug. Clients that need idempotency MUST send well-formed UUIDs. |
| Audit trail for fallback path is lost after the response is discarded | Medium | Server stamps `metadata.clientMessageId`, `metadata.clientMessageIdSource ∈ { 'client', 'server_fallback' }`, and `metadata.clientMessageFingerprint` on the persisted canonical record (Task 1.3 / 1.4). Post-hoc transcript inspection can correlate the persisted record back to the original client send even when the canonical id is a server fallback. The persisted source enum never carries `'idempotent'`. |
| Misbehaving client inflates state files via oversize `clientMessageId` payload | Medium | Hard cap of 128 chars on `clientMessageId` (Task 1.6); oversize requests rejected with HTTP 400 before the dispatch path. Within the cap, malformed values are stamped literally on `metadata.clientMessageId` for audit, but the bound prevents arbitrary bloat. Unit test in Task 1.10 pins the 400 path. |
| Equivalence check unstable under append-time normalization (mention extraction, fenced JSON, choiceResponse) | Medium | FR-6 equivalence is decided by a canonical fingerprint (SHA-256 over a stable serialization of trimmed senderName, normalized body, normalized choices, structural choiceResponse, messageMetadata sans `optimistic` plus server-managed client-message audit keys), stamped at append time on `metadata.clientMessageFingerprint`. Subsequent collisions compare fingerprints, not raw fields. Task 1.10 includes positive and negative fingerprint tests so future changes to the normalization pipeline either preserve the contract or update both the helper and the tests in lockstep. |
| Cross-tab logical duplicate sends bypass server idempotency | Low | SPEC-106 server-side dedupe is keyed only on `(channelId, clientMessageId)`. Two tabs that each generate their own UUID for the same logical message produce two persisted records by design. Documented in §Technical Decisions and pinned by a multi-tab test in §Testing Strategy. Cross-tab dedupe of distinct UUIDs is out of scope and would need its own design. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-07 | Plan created from a live diagnosis of the first-message flicker. SPEC-106 captures the contract; PLAN-095 splits the rollout into the client-supplied id contract (Phase 1), the optimistic-preserve wire-up (Phase 2), and an end-to-end validation slice (Phase 3). Existing `preserveOptimisticUserMessageAfterRefresh` helper is reused; it was already implemented and tested but never wired into production. |
| 2026-05-07 | Follow-up review pointed out 5 contract gaps in the initial draft: (1) invalid-clientMessageId behavior contradicted across SPEC FR-3 / Task 1.10 / Testing Strategy, (2) response shape definition silently dropped existing fields (`phase`/`results`/`dispatch`), (3) `idempotent?: true` alone could not express server-fallback decisions, (4) collision rules only handled the user-message case, leaving system/agent collisions and divergent-body cases undefined, (5) preserve wire-up did not specify the channelId source. SPEC-106 now defines the `messageIdentity` schema (FR-14), splits the collision matrix into FR-6 (equivalent → idempotent) and FR-7 (non-equivalent → server fallback), pins the response shape as additive only, and introduces the in-flight send registry that the preserve helper consumes (FR-12). PLAN-095 Task 1.5 / 1.6 / 1.10 / 2.1 / 2.2 / 2.5 align with the updated contract. |
| 2026-05-07 | Second follow-up review pointed out 5 more contract gaps: (1) `Map<channelId, optimisticMessageId>` cardinality vs the multi-tab / multi-pending claim, (2) module-scope registry cannot support real cross-tab multi-tab — needs renderer-instance framing, (3) registry stores only the id, not the optimistic body, so channel-switch-back-before-ack loses the typed row from the local view, (4) NFR Idempotency-safety promised "same `clientMessageId` never produces duplicates" but malformed-id fallback path violates this, (5) NFR Auditability said the client-supplied id is visible on the canonical record but the design only exposed it on the response payload. SPEC-106 now caps the registry at one entry per channel for v1 (renderer-instance local, no cross-tab claim), documents the channel-switch-back trade-off explicitly, scopes idempotency safety to well-formed UUIDs, and adds the §Audit Metadata on the Canonical Record contract that stamps `metadata.clientMessageId` / `metadata.clientMessageIdSource` on the persisted record. PLAN-095 Task 1.3 / 1.4 / 1.10 / 2.1 / 2.5 / Files / Risks / Open Questions / Testing Strategy aligned with the updated contract. |
| 2026-05-07 | Third follow-up review pointed out 5 more inconsistencies: (1) Non-Goals still claimed "no message schema change" while later requiring `metadata.clientMessageId` / `clientMessageIdSource` keys, (2) audit metadata enum included `'idempotent'` even though FR-6 returns existing records and never persists a fresh row, (3) malformed `clientMessageId` had no length cap so a misbehaving client could inflate state files via the audit metadata, (4) FR-6 equivalence used "same trimmed body / senderName" but the append pipeline runs normalization (mention extraction, choice extraction, fenced JSON parsing) so literal equality is unstable, (5) registry section claimed "multi-tab idempotency comes from server FR-6/FR-7" but the server only dedupes on `(channelId, clientMessageId)` — distinct UUIDs from different tabs bypass dedupe. SPEC-106 Non-Goals expanded to allow audit metadata keys; FR-4 added a 128-char cap with HTTP 400 for oversized; FR-6 / FR-7 / §Audit Metadata / §Idempotency Boundary rewritten around a canonical fingerprint (SHA-256 over normalized fields), with `clientMessageIdSource` enum on persisted records narrowed to `'client' \| 'server_fallback'` only and a new `metadata.clientMessageFingerprint` audit key added. PLAN-095 Task 1.3 / 1.4 / 1.5 / 1.6 / 1.10 / Files / Technical Decisions / Risks / Testing Strategy aligned with the corrected contract; the multi-tab claim was rewritten to be precise about `(channelId, clientMessageId)` keying and the cross-tab dedupe out-of-scope position. |
| 2026-05-07 | Phase 1 server contract slice landed. `clientMessageId` is now part of the chat send request/response contract; server appends can honor a well-formed v4 UUID as the canonical user-message id, stamp `metadata.clientMessageId` / `clientMessageIdSource` / `clientMessageFingerprint`, strip client-only `metadata.optimistic` and spoofed audit keys, and return `idempotent: true` for equivalent duplicate sends without rerunning downstream side effects. Malformed ids within the 128-char trimmed cap fall back to server UUIDs; oversized ids are rejected by the REST handler before dispatch. Non-equivalent collisions fall back to server UUIDs with SPEC-106 reason codes and a `feature: 'chat_client_message_id_collision'` warn. Targeted verification: `npx tsx --test tests/chat-client-message-identity.test.tsx` (7 tests) and `npx tsc --noEmit -p tsconfig.server.json`. Full `npm run typecheck` remains blocked by pre-existing mobile type resolution for `src/shared/guideCatAssist.ts` importing `node:crypto`. |
| 2026-05-07 | Phase 1 renderer send slice landed. `createOptimisticUserMessage` now uses the bare UUID as the optimistic row id, `appendOptimisticUserMessage` returns `{ payload, optimisticMessageId }`, and `useWorkspaceComposerSubmit` passes that same id as `clientMessageId` to `sendChatMessage`. The first optimistic helper test no longer asserts the removed `optimistic-` prefix and now checks UUID-v4 shape. Targeted verification: `npx tsx --test tests/workspace-chat-optimistic.test.tsx`, `npx tsc --noEmit -p tsconfig.json`, and `npx tsc --noEmit -p tsconfig.server.json`. |
| 2026-05-07 | Phase 2 refresh-preserve slice landed. Added renderer-instance-local `pendingOptimisticSends`, wired composer register/clear lifecycle, and routed both shared workspace SSE refresh and legacy chat app-shell refresh through `preservePendingOptimisticSendsAfterWorkspaceRefresh`. The preserve helper now rejects refreshed id collisions with `feature: 'chat_optimistic_message_preserve'`, logs orphaned-channel diagnostics, and clears orphaned registry entries. Targeted verification: `npx tsx --test tests/workspace-chat-optimistic.test.tsx` (10 tests), `npx tsc --noEmit -p tsconfig.json`, and `npx tsc --noEmit -p tsconfig.desktop.json`. Full race-mode E2E remains tracked in Task 2.5 / Phase 3. |
| 2026-05-07 | Phase 2 hardening slice landed. The registry-driven refresh path now passes the exact `optimisticMessageId` into `preserveOptimisticUserMessageAfterRefresh`, preventing same-channel defensive replacement from preserving the wrong optimistic row. Added targeted coverage for exact-id preserve and the documented channel-switch-back v1 trade-off. Targeted verification: `npx tsx --test tests/workspace-chat-optimistic.test.tsx` (12 tests), `npx tsc --noEmit -p tsconfig.json`, and `npx tsc --noEmit -p tsconfig.desktop.json`. |
| 2026-05-07 | Phase 3 targeted regression sweep completed without a live dev-state write. Verification recorded in SPEC-106: `npx tsx --test tests/chat-client-message-identity.test.tsx tests/workspace-chat-optimistic.test.tsx tests/chat-runtime-session-lifecycle.test.tsx` passed 30 tests, and `npx tsx --test tests/chat-product-intent-dispatch.test.tsx` passed 51 tests. Browser `[CV] li ...` live observation remains intentionally unperformed because it would require creating a verification transcript in the user's persisted dev state without explicit approval. |
| 2026-05-07 | Follow-up hardening after the local implementation stack: the exact-id preserve fix is recorded as a separate detour from the earlier refresh-preserve slice, `buildClientMessageAuditMetadata` is now the single helper for persisted audit metadata, client-message length-cap failures use a shared domain error across REST and dispatch entry points, and SPEC-106 now documents that fingerprints include server-derived append-time metadata. |

---

*Created: 2026-05-07*
*Author: Codex*
