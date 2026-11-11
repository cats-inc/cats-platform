# SPEC-139: Boss Cat Across Cats: Status Board, Group Conversations and Joining

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved by the owner on 2026-11-11 (D1 to D3). Revised the same day after the independent security review (see Security Review), with the conservative choices R1 to R4. Implementation in progress under [PLAN-133](../plans/PLAN-133-boss-cat-across-cats.md): FR-1 to FR-7 (with R1 and R2), FR-13/14 (the Boss Cat's own initiative), FR-15's board side, FR-16 for boards and groups and FR-17 are implemented; joining and the UI are not |
| **Owner** | Product owner |
| **Reviewer** | Owner; independent security review on 2026-11-11 |
| **Updates** | SPEC-125 FR-17 (three new actions beyond the conversation, and the turns they may run in); SPEC-118's K2 direct-lane exclusion (the Boss Cat tools, not K2, may run for a Boss Cat's own direct lane, from Desktop or mobile only; transports stay excluded); SPEC-137 FR-7 (a Boss Cat's `assist` review leaves out other Cats' words and gains a peer section); the memory checkpoint (`memoryLayers.ts`, FR-17) |
| **Keeps** | SPEC-118 FR-05: no tool returns another conversation's contents. A direct lane holds only its own Cat (SPEC-125, `assignCatToChannel`). These are limits on the server's tools, not a security boundary: every Cat's provider CLI runs under the owner's OS account and can edit app state, these settings included |
| **Counterpart** | Cats Bot SPEC-012 Phase 1. Desktop differs by design: it has group conversations the owner speaks in, so it needs no contact notes and no status questions |
| **Related finding** | Desktop's Telegram bindings did not pin the owner's Telegram account: any private chat with the bot reached the bound Cat's direct lane as a `user` message. That affected every Cat and is fixed by [SPEC-140](SPEC-140-telegram-owner-pin.md). This spec still never trusts a transport message |

## Summary

A Boss Cat (an admin Cat, SPEC-125 FR-19) helps the owner across Cats. It needs to know which
Cats have work that is stuck, failed or waiting for the owner, and it should talk with other
Cats where the owner can see and speak. This spec gives it three things:

- **A status board.** The server builds it without the model and without message text.
- **Group conversations.** The Boss Cat creates them with Cats it chooses, and the owner takes
  part as in any conversation.
- **Joining an existing conversation** (Chat, Code or Work, all alike). The owner's single
  switch decides: never, ask every time (the default), or allowed.

All three run only when the owner, signed in on Desktop or mobile, starts the turn in the Boss
Cat's own direct lane. They run in an isolated decision session that sees that message and the
board, nothing else.

## Goals

- The Boss Cat can tell which Cats need attention, at no model cost, without reading their
  conversations.
- Cats talk with each other only in conversations the owner can read and speak in.
- The owner decides, with one switch, whether the Boss Cat may join, and sees what joining
  grants before allowing it.
- A direct lane never leaves its Cat, except as message times.
- Text from conversations, files or other Cats cannot steer the Boss Cat into creating or
  joining anything.

## Non-Goals

- Reading a direct lane, or any conversation the Boss Cat is not a member of.
- Changing a conversation's coordinator, audience, workspace or permissions when the Boss Cat
  joins.
- Status questions in a hidden channel (Cats Bot SPEC-012 Phase 2).
- Pinning Telegram bindings to the owner (the related finding). Until that exists, no Telegram
  turn is owner-started.
- Turning on the provider-agent decision path by default (FR-1).

## Definitions

- **Boss Cat**: a Cat whose `group` is `admin` (SPEC-125 FR-19). There may be several.
- **Group conversation**: an active conversation that is not a direct lane, on the Chat, Code
  or Work surface.
- **Owner-started turn**: a turn whose source message the server stamped `ownerStarted`.
  - The stamp is set only at the authenticated owner message route, for the owner principal:
    Desktop's cookie with CSRF, or mobile's bearer.
  - The stamp lives on the source message. A retry keeps the original message's stamp and
    transport, and a queued turn is checked when it runs.
  - **Not owner-started:** every transport message (Telegram included, also the direct lane's
    own binding), `/api/orchestrator/dispatch`, parallel members, choice-card answers,
    schedules, heartbeats and other Cats' messages.
- **Boss decision session**: the isolated provider-agent decision session (SPEC-118) in which
  the Boss Cat tools run (FR-1).

## Requirements

### Functional Requirements

#### Where the tools run

1. FR-1: The Boss Cat tools run only through the provider-agent decision path (SPEC-118).
   - They run in an isolated session whose input is the current owner message and the
     server-built board.
   - That input never includes the lane's transcript, heartbeats, the `assist` review, tool
     output or files.
   - They are offered only when the conversation is the Boss Cat's own direct lane, the turn is
     owner-started (Desktop or mobile), and the Boss Cat is that lane's admin coordinator
     (SPEC-125 FR-11, FR-17). The server rechecks all three in every handler.
   - While the decision path is off (`CATS_CHAT_PROVIDER_AGENT_DECISION_ENABLED`), the tools are
     not offered. This spec does not change that flag's default.

#### Status board

2. FR-2: A Boss Cat gets `chat.boss.status_board`, with no side effect and no approval, under
   FR-1. Its use is limited to 30 calls an hour per owner, across all Boss Cats.
3. FR-3: A board holds:
   - **Each other active Cat**, with FR-15 applied:
     - its name and group, and whether its direct lane is awake or asleep;
     - its own initiative: the effective mode, the unanswered count, and whether it waits for
       the owner (SPEC-137);
     - whether a turn is running;
     - turns that failed or were interrupted in the last 7 days, per conversation;
     - how many owner choices and approvals wait.
   - **Each group conversation**, with FR-4 and FR-15 applied:
     - id, title, surface and participant names;
     - whether the Boss Cat is a member;
     - the owner's last message time and the last message time;
     - whether a turn is running, failed, or waits for an owner choice.
   - **Each direct lane**: only the owner's and the Cat's last message times.
4. FR-4: The board's only free text is Cat names and conversation titles the owner set
   (`titleSource: 'owner'`, which only the owner's rename sets).
   - `manual` is not enough: it is the creation default (K3 conversations take the owner's
     goal text as their title) and what conversations from before 2026-10-27 were normalized
     to, so its origin is unknown.
   - Some titles count as message text and are not shown: a title drafted from a message
     (`titleSource: 'draft'`), a title set by a model (`create_group` titles included), and a
     topic carrying a transport sender's name. In their place the board shows the surface, id
     and age.
   - Names and titles are cut to 80 characters, with control and bidirectional-override
     characters removed, and fenced as data.
   - Nothing else leaves through the board: no message text, prompt, choice content,
     repository path, error text or memory.

#### Group conversations

5. FR-5: A Boss Cat gets `chat.boss.create_group`, under FR-1. It takes:
   - a title of at most 80 characters;
   - one or more other active Cats, by ids present in that session's board, within the
     participant limit;
   - an opening message of at most 2,000 characters.

   It creates a Chat `chat_channel` with:
   - no repository and no cwd, with a `read_only` workspace and the `default` permission mode;
   - the Boss Cat as coordinator, and the chosen Cats taking part. Those Cats load no companion
     memory (owner notes and profile) in it (R2);
   - the opening message posted, but no turn dispatched. The Cats answer once the owner writes
     in the group (R1).

   The owner sees the group in the conversation list and can speak, add or remove Cats, or
   archive it, as in any conversation.
6. FR-6: Each invited Cat answers from that conversation's own session and history, never from
   its direct lane. Code and Work conversations are still created only by their own flows (K3
   `ensure_conversation`, Work tasks).
7. FR-7: At most 5 groups an hour per owner, across all Boss Cats. Each creation is recorded
   with ids only (FR-16).

#### Joining an existing conversation

> Placement (owner, 2026-11-11): Settings › Cats no longer exists (ADR-150). Cats Directory owns
> per-cat settings, including the admin switch. The one policy for every Boss Cat is app-level,
> so it gets a small Settings page of its own, 「主控貓」 (`/settings/boss-cat`). The page sits in
> the Settings sidebar after 「助理」. The route joins the App reserved-settings paths. FR-15's
> per-Cat switch is on each Cat's settings in Cats Directory.

8. FR-8: Settings › 主控貓 (`/settings/boss-cat`) has one setting for every Boss Cat:
   「主控貓加入其他對話」, with
   「不允許」, 「每次問我」 and 「允許」. The default is 「每次問我」.
   - It covers Chat, Code and Work conversations alike.
   - Its hint says that joining a Code or Work conversation grants that conversation's
     workspace, and for Code a shell.
   - It is evaluated when the join runs, not when it is requested.
9. FR-9: A Boss Cat gets `chat.boss.join_conversation`, under FR-1, with a conversation id
   present in that session's board.
   - It is refused for a direct lane, an archived conversation, a conversation the Boss Cat is
     already in, one at its participant limit, and under 「不允許」.
   - It is limited to 10 requests an hour per owner, with one pending card per conversation.
10. FR-10: Under 「每次問我」, the server posts a choice card to the owner in the Boss Cat's
    direct lane.
    - **Rendering.** The card is rendered from live state, only in the Desktop and mobile UI,
      and never enters any model context or transport mirror. It shows:
      - the conversation's title, surface and participants;
      - what joining grants: the conversation's workspace (repository path, read-only or
        read-write access, permission mode), and for Code the Code tools, which include a
        shell;
      - what the Boss Cat brings in: its provider, its MCP and skill profile, and its companion
        memory;
      - how much history it will see: the last 8 messages before it joins, then everything
        from then on (FR-12);
      - where the request came from (Desktop or mobile).
    - **Binding.** The digest covers:
      - the target conversation's revision (as `collaborationExecutionRevision`);
      - the Boss Cat's id and execution target;
      - the source conversation;
      - the policy value.
    - **The click.** The server rechecks the policy, the admin and coordinator status, the
      archive state, the limits and the digest. Then it performs the join itself; the model
      supplies nothing at that point.
    - **Lifetime.** A card is consumed once. A replay, or a retry after the Boss Cat leaves, is
      refused. A card unanswered for 24 hours, by the server's clock, is refused. Telegram
      cannot answer a card (D3).
11. FR-11: Under 「允許」, the Boss Cat joins at once after the same rechecks. The server posts a
    notice in its direct lane.
12. FR-12: A join is an ordinary `assignCatToChannel`, so the conversation shows "joined the
    chat." The Boss Cat becomes a participant:
    - It is not the coordinator, and nothing else about the conversation changes: no
      workspace, permission, audience or coordinator change.
    - Its continuity in that conversation is bounded by its `joinedAt` for every session,
      replacements and rejoins included. It sees the last 8 messages before it joined, then
      what follows.
    - It may leave with `chat.boss.leave_conversation`, and the owner can remove it like any
      participant.
    - A Cat that stops being an admin stays a participant, but loses the Boss Cat tools.

#### The Boss Cat's own initiative

13. FR-13: In `assist` mode, a Boss Cat's review (SPEC-137 FR-7) leaves out other Cats' words and
    gains a peer section built from the board, under FR-4's title rule.
    - The prompt asks it to point out one Cat's work that needs the owner, naming the Cat and
      the conversation, and to suggest the owner open that conversation. It does not offer to
      do that work itself.
    - A heartbeat is not owner-started, so the server refuses the tools from it.
    - Because the tools run in the isolated decision session (FR-1), a short reply such as
      「好」 names nothing: the owner's own message must name the conversation or the Cats. The
      section says so.
    - The peer section lists each other Cat that needs the owner: its failed and interrupted
      turns of the last 7 days with the places they happened, and its waiting choices and
      approvals. A place is an owner-set title, or else the surface and age.
    - Only group conversations count. A direct lane leaves its Cat only as message times
      (Goals, Privacy), so nothing in another Cat's direct lane reaches the section.
    - Its Cat lines total at most 12 Cats and 3,000 characters, with a count of the rest. Cats
      with something the last look did not see come first.
    - A hidden Cat (FR-15) is left out of the section.
    - Approvals come from Core. A Core that cannot be read leaves them out and does not stop
      the life loop; a board that cannot be built costs only the section.
    - Other Cats' words are left out of the Boss Cat's own conversations, also second-hand:
      - A run of other Cats' messages shows as one line, 「«name», … (other Cats) replied」, so
        an owner's request another Cat answered does not look unfinished (the owner's choice on
        2026-11-11).
      - Only notices about the Boss Cat's own turns are shown; the rest, which can quote
        another Cat's output or error, are not.
      - The owner's answer to another Cat's choice names that Cat, not the choice.
      - A collaboration report the Boss Cat posted, which quotes other Cats, is not quoted.
      - These lines are not part of the fingerprint, so another Cat writing in a shared
        conversation is no news to the Boss Cat's own review.
      - The name of a hidden Cat that writes in such a conversation still shows, since the Boss
        Cat takes part in it and its own sessions see that message anyway.
14. FR-14: The `assist` skip (SPEC-137 FR-8) also fingerprints the peer section's attention
    items.
    - Each item is marked by id: a failed or interrupted turn, a waiting choice card, a pending
      approval. Only an item the last quiet look did not see runs a turn, so an item settled
      and another arriving between two looks is still news.
    - After a quiet look, a Cat shown in the section keeps only the marks it shows now. A Cat
      the bounds left out, or one that is hidden or gone, keeps its old marks, so the first is
      still news and the others' return with the same picture is not.
    - While Core cannot be read, the approvals seen before are kept, so Core coming back is no
      news.
    - A heartbeat that speaks marks nothing seen; SPEC-137's back-off limits how often it
      looks again.
    - Like SPEC-137 FR-8's fingerprint, the marks live in the process's memory: after a
      restart, each Boss Cat looks once more.

#### Owner control and privacy

15. FR-15: Each Cat has a switch, 「讓主控貓看到這隻 Cat 的狀態」, on by default, on its settings in
    Cats Directory (`/entities/cats/:catId/settings`). When it is off:
    - the board shows only the Cat's name, and the peer section leaves it out (FR-13);
    - group entries leave the Cat out of their participant lists;
    - a conversation whose only Cat participants are hidden appears as surface, id and age.

    The switch does not change the join policy, and its hint says so.
16. FR-16: Every board call, group creation, join request, owner decision, join and leave is
    recorded in the supervision record with ids only. The conversation itself shows the join
    and the leave.
17. FR-17: Every prompt's memory checkpoint is derived for the target conversation when the
    prompt is built. Its summary, facts and open loops never come from another conversation,
    so "Recent rooms", the recent-help snippet and an open loop quoting the owner's last
    question stay in their own conversation (R3).

### Non-Functional Requirements

- **Security**:
  - **By construction:**
    - only authenticated Desktop or mobile owner messages start these tools;
    - the tools run in an isolated session that sees only that message and the board, and
      accept only ids from the board;
    - direct lanes cannot be joined;
    - the board carries no message text;
    - a join needs the owner's exact bound choice under 「每次問我」, and the server performs it;
    - created groups have no workspace and dispatch nothing until the owner writes.
  - **By prompt only:** fencing of names and titles.
  - **Limits:** these are limits on the server's tools, not a boundary (Keeps).
- **Privacy**:
  - A direct lane leaves its Cat only as message times.
  - A group conversation shows up on the board only as its owner-set title, surface and visible
    participants.
  - Its content reaches the Boss Cat only after a join the owner allowed.
- **Cost**: the board and the peer section are built without the model. A peer item the Boss
  Cat has not seen can make an `assist` heartbeat run its one turn, within SPEC-137's rhythm
  and back-off. Creation and joining happen only when the owner starts the turn, within FR-2,
  FR-7 and FR-9's limits.

## Design Overview

- **Owner-started stamp.** The authenticated owner message route sets `ownerStarted` on the
  source message. Retries and queued turns read it from there. Transports never set it.
- **Tools.** `src/products/chat/state/bossCatSurface.ts` (new) defines the four tools and
  their server handlers. The provider-agent decision path offers them under FR-1, and the
  handlers recheck FR-1.
- **Board.** `src/products/chat/state/bossCatBoard.ts` (new) builds the board.
  `companion/life/peerSection.ts` builds the peer section from it, and the life loop
  (`companion/life/loop.ts`) builds both only when a Boss Cat's `assist` heartbeat is due.
- **Creating and joining.** Creation uses the channel creation path with an explicit
  `read_only`/`default` policy and no dispatch. Joining uses `assignCatToChannel`. Continuity
  in `runtimeTargeting.ts` is bounded by `joinedAt`.
- **The card.** It is a new card kind with its own binding, rendered by the UI from live state
  and excluded from model context and transport fanout.
- **Settings.** A new Settings page, 「主控貓」 (`/settings/boss-cat`), after 「助理」, holds the join
  policy; `/settings/boss-cat` joins the App reserved-settings paths. Each Cat's settings in Cats
  Directory gain its visibility switch, next to the admin switch.
- **Memory checkpoint.** `memoryLayers.ts` derives the checkpoint per target conversation.

## Test Plan

- Only an authenticated Desktop or mobile owner message in the Boss Cat's direct lane offers
  the tools.
  - The server refuses them from Telegram (also the direct lane's binding), dispatch, parallel
    members, choice answers, schedules, heartbeats, other Cats and non-admins.
  - A Desktop retry of a failed Telegram message is still not owner-started.
- The decision session's input holds only the current message and the board. A marker placed
  in the lane transcript, a heartbeat, the review, a file or a tool output never reaches it.
- The board and FR-4:
  - The board has every FR-3 field and no message text.
  - Drafted, model-set and sender-name titles appear as surface, id and age.
  - A marker in messages, choices and errors never shows.
  - The 31st call within an hour is refused.
- `create_group`:
  - It makes a Chat conversation with no repository or cwd, `read_only` and `default`.
  - Its opening message dispatches no turn, and invited Cats load no companion memory there.
  - Ids not on the board are refused, and the sixth group per owner within an hour is refused.
- `join_conversation`:
  - It covers every refusal case.
  - Under 「每次問我」 it waits for the bound choice.
  - A card is consumed once. Replay, a retry after leaving, a policy change before the click
    and expiry are all refused.
  - The card's details never appear in model context or in the Telegram mirror.
  - Under 「允許」 it joins after the rechecks.
  - A join changes nothing else, and continuity stays bounded by `joinedAt` across a session
    replacement and a rejoin.
- A Boss Cat's `assist` review has no other Cat's lines, includes the peer section, and skips
  when nothing changed. A reply of 「好」 after a suggestion runs no tool.
- A hidden Cat appears on the board only by name, not in the peer section, and is left out of
  group participant lists.
- A conversation's memory checkpoint never carries another conversation's title, snippet or
  open loop. Markers in a direct lane's owner question and in a companion note stay out of
  group prompts.

## Decisions

- D1 (2026-11-11, the owner): Chat, Code and Work conversations are on one level, so one join
  policy covers them all. Its default is 「每次問我」 (FR-8).
- D2 (2026-11-11, the owner): `create_group` does not follow the join policy (FR-5). The review
  suggested reconsidering this. It stands, because FR-1 and FR-5 now ensure three things: only
  the owner's own Desktop or mobile message can start it, the group gets no workspace, and
  nothing runs until the owner writes there.
- D3 (2026-11-11, the owner): a join card cannot be answered in Telegram. No Telegram turn is
  owner-started, so Telegram cannot start these tools either.

### Revision choices (2026-11-11, conservative; the owner may relax them)

- R1: a created group's opening message dispatches no turn until the owner writes (FR-5).
- R2: invited Cats load no companion memory in a group the Boss Cat created (FR-5).
- R3: the memory checkpoint never crosses conversations (FR-17).
- R4: the board is offered only in the Boss Cat's own direct lane, never inside a group
  conversation, so the board is never written into a group's transcript (FR-1).

## Security Review

An independent review on 2026-11-11 found the following, now addressed:

- **Critical.**
  - C1: unverified Telegram messages counted as owner-started. Now the Definitions, FR-1 and
    D3. The underlying Telegram gap is the related finding.
- **High.**
  - H1: the tools' session was undefined, and heartbeat text could steer them. Now FR-1 and
    FR-13.
  - H2: `create_group` granted more than a blank room. Now FR-5, FR-7 and D2.
- **Medium.**
  - M1: the memory checkpoint crossed conversations. Now FR-17.
  - M2: board titles carried message text, and the board was written into groups. Now FR-2,
    FR-4, FR-15 and R4.
  - M3: the card's binding and TOCTOU were undefined. Now FR-10.
  - M4: history beyond what the card stated. Now FR-12.
  - M5: owner-started edge cases. Now the Definitions.
- **Low.**
  - L1: the "by construction" claims overstated. Now Keeps.
  - L2: what a joining Boss Cat brings in. Now FR-10.
  - L3: limits per Boss Cat and unlimited join requests. Now FR-7 and FR-9.

## References

- SPEC-125 FR-11, FR-17 and FR-19 (coordinator and admin rules), SPEC-118 (the decision path,
  K2/K3 and choice binding), SPEC-137 (own initiative), SPEC-124 (the life loop).
- Cats Bot SPEC-012 (the Bot counterpart and its security review).
