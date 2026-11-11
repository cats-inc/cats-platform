# PLAN-133: Boss Cat Across Cats

## Metadata

| Field | Value |
| --- | --- |
| Status | In progress: slice 1 implemented |
| Owner | Cats Chat |
| Reviewer | Owner |
| Date | 2026-11-11 |

## Related Spec

[SPEC-139: Boss Cat across Cats](../specs/SPEC-139-boss-cat-across-cats.md), with the settings
placement in [ADR-150](../decisions/150-manage-cats-in-cats-directory-and-keep-settings-app-level.md).
[ADR-149](../decisions/149-let-a-conversation-gain-product-scopes-and-never-lose-them.md) is not
implemented, so this plan builds SPEC-139 as written: a conversation's surface is its
`originSurface`, and the Code tools are named for Code only.

## Overview

Each slice is one pull request. No tool, route or card becomes reachable before the guard it
depends on has merged:

- the Boss Cat tools need the `ownerStarted` stamp (slice 2) and the isolated decision session
  (slice 4);
- joining needs the `joinedAt` bound and the owner's card (both in slice 5);
- the Settings page and the per-Cat switch ship with the behaviour they control (slice 6).

The provider-agent decision flag (`CATS_CHAT_PROVIDER_AGENT_DECISION_ENABLED`) gates only the
tools. FR-17, the `joinedAt` bound, the FR-13 review change and the UI are live on merge, and
are tested as live behaviour.

## Implementation Phases

### Slice 1: Memory checkpoint per conversation (FR-17, R3)

- [x] `cat.memory` is a single slot that the last refreshed conversation overwrites, and
      `buildCatConversationContext` read it as "Your memory checkpoint". The prompt now derives
      it from the target conversation (`deriveConversationCheckpoint`): its own last reply there,
      roles, skill profile and that conversation's open loops; no "Recent rooms". The stored
      slot stays for the Directory and Core projection, which no prompt reads.
      `globalOrchestrator.memory` reaches no prompt.
- [x] Regression (`tests/chat-prompts.test.js`): refresh a direct lane last, then build a group
      prompt for the same Cat. No marker from the lane (owner question, Cat reply, title)
      appears; the test fails against the old read site.

### Slice 2: Owner-started stamp

- [ ] `handleRestSendMessage` stamps `ownerStarted` from `context.auth` only: an owner
      principal with `browser_cookie` (CSRF already enforced) or `mobile_bearer`. Not from
      `isLocalOwnerRequest` (loopback only, admits `admin`) or client headers.
- [ ] A client-supplied value is always stripped. A choice answer (`choiceResponse`) is not
      owner-started. Missing auth means not owner-started.
- [ ] Retries keep the original message's stamp, including the canonical-core rebuild
      (`buildCanonicalRetryMessage`). The stamp survives persist and reload.

### Slice 3: Status board

- [ ] `bossCatBoard.ts` builds FR-3 from Chat and Core state, as a pure function.
- [ ] FR-4 title rule: only `titleSource: 'manual'` titles; others appear as surface, id and
      age. Names and titles cut to 80 characters, control and bidi-override characters removed.
- [ ] FR-15 per-Cat visibility field, absent meaning visible.

### Slice 4: Tool surface, board and groups

- [ ] `bossCatSurface.ts`: manifests, descriptors and handlers for `chat.boss.status_board`
      and `chat.boss.create_group`.
- [ ] Offered only in the Boss Cat's own direct lane, for an owner-started turn, to its admin
      coordinator, with the decision flag on. Every handler rechecks.
- [ ] The decision session gets its own explicit create input (sandbox, `read_only`, isolated,
      no skills) and sees only the current message and the board. A marker test reads what a
      stubbed Runtime client receives.
- [ ] Limits (30 boards, 5 groups per hour per owner, persisted) and FR-16 records (ids only).
- [ ] Created groups: Chat, no repository or cwd, `read_only`, `default`; opening message posted
      without dispatch; invited Cats load no companion memory there.

### Slice 5: Joining

- [ ] Join policy storage (absent reads as 「每次問我」), evaluated when the join runs.
- [ ] `chat.boss.join_conversation` refusals and limits (10 an hour, one pending card per
      conversation); `chat.boss.leave_conversation`.
- [ ] Continuity bounded by `joinedAt` in `runtimeTargeting.ts`, across session replacement
      and rejoin; the last 8 messages before joining.
- [ ] The owner card: its own route, digest binding, server-performed join, consumed once,
      24-hour expiry, excluded from model context and the transport mirror.
- [ ] Under 「每次問我」 with no card, the join is refused. Under 「允許」, join after rechecks and
      post a notice.

### Slice 6: Owner UI

- [ ] Settings › 主控貓 (`/settings/boss-cat`) after 「助理」, with the FR-8 hint;
      `/settings/boss-cat` joins `BASE_RESERVED_SETTINGS_PATHS`.
- [ ] The FR-15 switch on `/entities/cats/:catId/settings`, next to the admin switch.
- [ ] The join card in the Desktop and mobile conversation views.

### Slice 7: Own initiative (FR-13, FR-14)

- [ ] A Boss Cat's `assist` review drops other Cats' lines and gains the peer section.
- [ ] The `assist` skip fingerprints the peer section's attention items.

## Contract Changes

`src/products/chat/api/contracts.ts` is a frozen shared contract. SPEC-139 approves these
additive fields, each introduced in the slice that uses it:

- `ChannelMessageMetadata.ownerStarted` (slice 2): server-stamped, records Desktop or mobile.
- the per-Cat visibility field on `ChatCat` (slice 3).
- a `titleSource` value for model-set group titles (slice 4).
- a channel marker for groups the Boss Cat created, read by companion memory loading (slice 4).
- Boss Cat preferences (join policy) and usage counters on `ChatState` (slices 4 and 5).
- the join card's message metadata (slice 5).

Each new field must survive the snapshot normalizers (`chat-snapshot/entities.ts`) and the
Core projection, with a round-trip test.

Changes outside `src/products/chat/**`: the App reserved-settings paths
(`src/app/server/appPackageRoutes.ts`), the Settings shell and sidebar, the Cats Directory
settings page, and the mobile conversation view.

## Validation

Each slice runs its focused tests and the affected typecheck on memory stores and fixtures, never
the owner's dev state. PR CI is the full-suite gate.
