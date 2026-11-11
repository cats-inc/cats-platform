# PLAN-133: Boss Cat Across Cats

## Metadata

| Field | Value |
| --- | --- |
| Status | In progress: slices 1 to 4b and 7 implemented |
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

- [x] `handleRestSendMessage` stamps `ownerStarted: 'desktop' | 'mobile'` from `context.auth`
      only (`resolveOwnerStartedSurface`): an `owner` principal with `browser_cookie` (CSRF
      already enforced) or `mobile_bearer`. Not from `isLocalOwnerRequest` (loopback only,
      admits `admin`) or client headers.
- [x] `buildBaseUserMessageMetadata` drops any caller-supplied value on every route, and never
      stamps a choice answer or a message with a transport binding. Missing auth means not
      owner-started.
- [x] The stamp lives on the source message, which a retry reuses. Core turn metadata carries
      it, so the canonical rebuild (`buildCanonicalChatUserMessage`) keeps it. It survives
      persist and reload. Read it with `readOwnerStarted`.
- [x] Tests: `tests/chat-owner-started.test.js` (cookie, bearer, roles, forged values,
      unauthenticated server, transport, choice answer, Core rebuild, reload).

### Slice 3: Status board

- [x] `bossCatBoard.ts` builds FR-3 as a pure function of Chat state, own-initiative profiles
      and Core approvals. Nothing reads it yet. Definitions it fixes:
      - a lane's presence follows the UI's status dot (its lead lease, `resolveChatLifecycleState`);
      - initiative is read as the life loop reads it (SPEC-137), only for companion Cats;
      - a choice card waits while nobody answered it and the owner has not written past it;
        a Cat's count covers the cards it posted;
      - approvals are Core tasks with `approval.status: 'pending'` on the Cat's conversations,
        by the task's own conversation or an approval binding;
      - a failed or interrupted turn is one of the last 7 days whose target for that Cat
        failed, was blocked, or was cancelled, with no later completed turn for that Cat in
        that conversation (as Cats Bot SPEC-012 FR-2 defines attention);
      - group participants are Cat names only; temporary participants' names are free text.
- [x] FR-4 title rule: `manual` is the creation default and what older data was normalized
      to, so it proves nothing. The owner's renames (`renameChannel`, `renameParallelChatGroup`)
      now set a new value, `titleSource: 'owner'`, and the board shows only those. The board
      never reads topics, where a transport's sender name lives. Names and titles cut to 80
      characters, control and bidi-override characters removed.
- [x] FR-15: `ChatCat.hiddenFromBossCat?: true`, absent meaning visible, kept by the snapshot
      normalizer. A hidden Cat shows by name only and leaves group participant lists. A group
      of only hidden Cats shows its surface, id and age, nothing else (`redacted`).
- [x] Tests: `tests/chat-boss-cat-board.test.js` (every field, markers in messages, choices,
      errors, topics and paths never show, title rule, hidden Cats, reload, approvals, and a
      real failed turn through an isolated test server).

### Slice 4a: Tool surface and the board

- [x] `bossCatSurface.ts`: the `chat.boss.status_board` manifest and descriptor, the FR-1 gate
      (`resolveBossCatTurnGate`), the hourly limits and the decision loop.
- [x] Offered only in the Boss Cat's own direct lane, for an owner-started turn
      (`readOwnerStarted`), to its admin coordinator, while the full decision path is on
      (`supportsBossCat`). Never in a group, for a choice answer or a slash command. The handler
      rechecks the gate on fresh state.
- [x] Flow: the tools run first, in their own observation that carries Boss tools only. Their
      receipts land on the owner's message (`bossCatTurn`, server-owned like the stamp). The
      ordinary lane reply then runs as usual and gets them as per-turn instructions. The board is
      fenced as JSON and is data. A retry finds the receipts and calls no tool again. Without a
      tool call, or if the loop fails before one, the reply runs alone.
- [x] The decision session has its own create input: sandbox, `read_only`, `default`,
      isolated, no skills, no cwd, no product knowledge. It sees the owner's message only (and,
      in later calls, the receipts). It is closed when the loop ends.
- [x] The loop carries K2's guards:
      - the session id is captured at creation, so a failed call still cancels and closes it;
      - a hard deadline (the observation's 30 s) and Stop polling, since the lane's turn is
        already active;
      - native tool activity is refused;
      - a stopped loop logs a diagnostic with ids only and falls through to the reply.
- [x] Limits are persisted in `ChatState.bossCatUsage`: 30 boards an hour per owner, across
      every Boss Cat.
- [x] FR-16: the tool boundary writes a durable evidence record, with ids and status, to
      `<platform>/state/evidence/<conversation>.jsonl`. Data reset clears that directory.
      (`chatStatePath` is a file, so it cannot be the evidence directory. Work and Code
      default to it today; that is a separate problem.)
- [x] A stored board is dropped from its receipt once the reply for that message settles. A
      failed reply keeps it for the retry. Backticks in names and titles become quotes, so they
      cannot close the board's fence.
- [x] Boards are bounded by their serialized size: 16,000 characters, at most 40 Cats and 30
      groups, and 5 problem conversations per Cat. Cats needing attention come first, then the
      most recently active groups, with counts of what was left out. A full board measured
      47,000 characters before this bound, over the session's 24,000-character feedback
      envelope.
- [x] Tests: `tests/chat-boss-cat-tools.test.js`. They cover the gate matrix and, through an
      isolated server with the flag on, these cases:
      - what the stubbed Runtime receives for the decision session: its create input, and no
        lane, group or other-lane markers;
      - the lane reply's instructions;
      - the 31st board;
      - no tools without an authenticated owner, with the flag off, or when the Boss Cat
        declines;
      - a retry replaying receipts;
      - the evidence record, with a real file at `chatStatePath`;
      - a malformed decision, which closes its session while the reply still arrives;
      - a decision that never answers, which stops at its deadline;
      - a Desktop retry of a message that carries no stamp.

### Slice 4b: Group conversations

- [x] `chat.boss.create_group`:
      - it is offered only after a board was read in the same run;
      - it takes `{ title, catIds, openingMessage }` and no other fields;
      - the title is 1 to 80 characters with control and bidi characters removed, and the
        opening message is 1 to 2,000 characters;
      - every id must be another Cat on that board and still active;
      - 5 groups an hour per owner.
- [x] The Boss observation's policy is decided for `create_group` (`narrow_write`). A model held
      to read-only scope (a weak worker) is offered the board alone.
- [x] The created group:
      - a Chat conversation with no repository or cwd, `read_only` and `default`;
      - the Boss Cat as coordinator, plus the chosen Cats;
      - the opening message is the Boss Cat's own message, and nothing is dispatched (R1);
      - `bossCatGroup` marks it, so the invited Cats load no companion memory there (R2,
        `isBossCatGroupGuest` in `resolveCompanionSessionForTarget`);
      - the owner keeps the conversation they had open;
      - a localized notice in the Boss Cat's lane names the group and its Cats;
      - the owner's list updates live.
- [x] One atomic store update does all of it together: it reserves the use, creates the group,
      posts the notice and writes the receipt on the owner's message. The dispatch merge alone
      would drop an edit to a message another writer touched.
- [x] Core turn metadata carries `bossCatTurnCatId`. A message rebuilt from Core gets an empty
      record, so a retry runs no tool and replays nothing.
- [x] Tests in `tests/chat-boss-cat-tools.test.js`:
      - a group created end to end, checking its policy, members, coordinator, opening message,
        no dispatch, selection, notice, usage, the lane instructions, the Core marker and R2;
      - refusals: ids not on the board, the Boss Cat's own id, a long title, an empty opening
        message, extra fields, and the sixth group in an hour;
      - `create_group` is not offered before a board;
      - the owner writing to an invited Cat in the created group: the session Runtime receives
        is `read_only` with `default` permissions and no repository, and the Cat's prompt
        carries the opening message;
      - R2 through `resolveRuntimeEnvelopeForTarget` with the real channel view: an ordinary
        group hydrates companion memory (the positive control), and the Boss Cat's group does
        not;
      - a full-size board fits the envelope, attention first.
- [x] `docs/tool-calls.md` registers both tools.
- [ ] Remaining: the FR-16 evidence record for a creation names the tool and status only; the
      created conversation and Cat ids are on the receipt. The weak-worker fallback (board only)
      has no test.

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

- [x] A Boss Cat's `assist` review leaves out other Cats' words (`leaveOutOtherCats` in
      `review.ts`): runs of their messages fold into one 「«name», … replied」 line, only notices
      about its own turns show, the owner's answers to their choices name no content, and a collaboration
      report is not quoted; none of these count for the fingerprint.
- [x] The peer section (`companion/life/peerSection.ts`) is built from `buildBossCatBoard`,
      only when a heartbeat is due, from group conversations only (direct lanes stay out), with
      approvals from Core (`readCore`, optional and fail-safe). A board that throws costs only
      the section. The prompt (`peers`) asks the Boss Cat to point out, not to offer to continue.
- [x] The `assist` skip fingerprints the peer section's items by id (turns, choice cards,
      approvals); only an unseen item runs a turn. Cats left out by the 12-Cat or 3,000-character
      bound stay unseen and come first, and approvals seen before survive a Core read failure.
- [x] Tests: `tests/chat-boss-cat-own-initiative.test.js`, also exercised against the #421
      attention rule.

## Contract Changes

`src/products/chat/api/contracts.ts` is a frozen shared contract. SPEC-139 approves these
additive fields, each introduced in the slice that uses it:

- `ChannelMessageMetadata.ownerStarted` (slice 2): server-stamped, records Desktop or mobile.
- the per-Cat visibility field on `ChatCat` (slice 3).
- `titleSource: 'owner'`, set only by the owner's renames (slice 3). Model-set group titles
  keep the `manual` default, which the board does not show.
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
