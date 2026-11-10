# SPEC-139: Boss Cat Across Cats: Status Board, Group Conversations and Joining

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved by the owner on 2026-11-11 with D1 to D3; not implemented. Implementation waits for an independent security review |
| **Owner** | Product owner |
| **Reviewer** | Owner; an independent security review before implementation |
| **Updates** | SPEC-125 FR-17 (three new actions beyond the conversation, and the turns they may run in); SPEC-137 FR-7 (a Boss Cat's `assist` review gains a peer section) |
| **Keeps** | SPEC-118 FR-05: no tool returns another conversation's contents. A direct lane holds only its own Cat (SPEC-125, `assignCatToChannel`) |
| **Counterpart** | Cats Bot SPEC-012 Phase 1 (status board, board-only heartbeat). By design, Desktop differs: it has group conversations the owner speaks in, so it needs no contact notes and no status questions |

## Summary

A Boss Cat (an admin Cat, SPEC-125 FR-19) helps the owner across Cats. It needs to know which
Cats have work that is stuck, failed or waiting for the owner. When it needs to talk with
other Cats, it should do so where the owner can see and speak. This spec gives it three things:

- **A status board.** The server builds it without the model and without any message text.
- **Group conversations.** The Boss Cat can create one with Cats it chooses. The owner takes
  part like in any other conversation.
- **Joining an existing conversation** (Chat, Code or Work, all alike). The owner's single
  switch decides: never, ask every time (the default), or allowed. Once joined, the Boss Cat
  is an ordinary participant. Direct lanes can never be joined.

## Goals

- The Boss Cat can tell which Cats need attention, at no model cost, without reading their
  conversations.
- Cats talk with each other only in conversations the owner can read and speak in.
- The owner decides, with one switch, whether the Boss Cat may join an existing conversation,
  and sees what joining grants before allowing it.
- A direct lane never leaves its Cat, except as message times.

## Non-Goals

- Reading a direct lane, or any conversation the Boss Cat is not a member of.
- Changing a conversation's coordinator, audience, workspace or permissions when the Boss Cat
  joins.
- Status questions answered in a hidden channel (Cats Bot SPEC-012 Phase 2). On Desktop the
  Boss Cat asks in a group conversation instead.
- Replacing the SPEC-118 collaboration flows (K2 reads, K3 execution). They keep their gates.

## Definitions

- **Boss Cat**: a Cat whose `group` is `admin` (SPEC-125 FR-19). There may be several.
- **Group conversation**: an active conversation that is not a direct lane, whether its
  surface is Chat, Code or Work.
- **Owner-started turn**: a turn started by an owner message from Desktop, mobile, or the direct
  lane's Telegram binding. Heartbeats, schedules and other Cats' turns are not owner-started.
- **Join policy**: the owner's setting of FR-7.

## Requirements

### Functional Requirements

#### Status board

1. FR-1: A Boss Cat gets `chat.boss.status_board`, with no side effect and no approval.
   - It is offered in an owner-started turn of a conversation the Boss Cat coordinates. That
     includes its own direct lane, which binds it as coordinator (SPEC-125 FR-11, FR-17).
   - The server builds it from the chat state and the companion life state, without the model.
   - It reads no conversation content, so the K2 reads flag (SPEC-118) does not gate it.
2. FR-2: A board holds:
   - **Each other active Cat**, with FR-12 applied:
     - its name and group, and whether its direct lane is awake or asleep;
     - its own initiative: the effective mode, the unanswered count, and whether it waits for
       the owner (SPEC-137);
     - whether a turn is running;
     - turns that failed or were interrupted in the last 7 days, per conversation;
     - how many owner choices and approvals wait for the owner.
   - **Each group conversation**:
     - id, title, surface and participant names;
     - whether the Boss Cat is a member;
     - the owner's last message time and the last message time;
     - whether a turn is running, failed, or waits for an owner choice.
   - **Each direct lane**: only the owner's and the Cat's last message times.
3. FR-3: Titles and names are the board's only free text.
   - Each is cut to 80 characters, with control and bidirectional-override characters
     removed.
   - Every consumer shows them fenced as data.
   - Nothing else leaves through the board: no message text, prompt, choice content,
     repository path, error text or memory.

#### Group conversations

4. FR-4: A Boss Cat gets `chat.boss.create_group`, in owner-started turns only (FR-1's
   conversations). It takes:
   - a title of at most 80 characters;
   - one or more other active Cats, within the participant limit;
   - an opening message of at most 2,000 characters.
   It creates a Chat-surface `chat_channel` with no repository. The Boss Cat coordinates it, the
   chosen Cats take part, and the Boss Cat posts the opening message. The owner sees it in the
   conversation list and can speak, add or remove Cats, or archive it, as in any conversation.
5. FR-5: Each invited Cat answers from that conversation's own session and history, never from
   its direct lane. Code and Work conversations are still created only by their own flows (K3
   `ensure_conversation`, Work tasks). `create_group` never binds a repository.
6. FR-6: A Boss Cat creates at most 5 groups an hour. Each creation is recorded with ids only
   (FR-13).

#### Joining an existing conversation

7. FR-7: Settings › Cats has one setting for every Boss Cat: 「主控貓加入其他對話」, with
   「不允許」, 「每次問我」 and 「允許」. The default is 「每次問我」. It covers Chat, Code and Work
   conversations alike. Its hint says that joining a Code or Work conversation grants that
   conversation's workspace.
8. FR-8: A Boss Cat gets `chat.boss.join_conversation`, in owner-started turns only, with a
   conversation id from the board.
   - It is refused for a direct lane, an archived conversation, a conversation the Boss Cat is
     already in, one at its participant limit, and when the policy is 「不允許」.
   - Under 「每次問我」, the server posts a choice card to the owner in the conversation where the
     Boss Cat asked. The card shows:
     - the conversation's title, surface and participants;
     - what joining grants: the conversation's workspace (repository path, read-only or
       read-write access, permission mode) and, for Code, the Code tools;
     - how much earlier history the Boss Cat will see under the existing continuity rules.
     Its choices are 「允許這次」 and 「不要」. Only the owner's exact choice, bound to the
     conversation id and the card's digest, authorizes the join, as SPEC-118 binds collaboration
     choices. A card unanswered for 24 hours is refused. The card is answered on Desktop or
     mobile; a turn from Telegram gets a notice there (D3).
   - Under 「允許」, the Boss Cat joins at once. The server posts a notice in the conversation
     where it asked.
9. FR-9: A join is an ordinary `assignCatToChannel`, so the conversation shows "joined the
   chat." The Boss Cat becomes a participant:
   - It is not the coordinator, and nothing about the conversation changes: no workspace,
     permission, audience or coordinator change.
   - It sees earlier history only as any new participant does (SPEC-125, `runtimeTargeting.ts`).
   - It may leave with `chat.boss.leave_conversation`, and the owner can remove it like any
     participant.
   - A Cat that stops being an admin stays a participant, but loses the Boss Cat tools.

#### The Boss Cat's own initiative

10. FR-10: In `assist` mode, a Boss Cat's heartbeat review (SPEC-137 FR-7) gains a peer section
    built from the board. It lists the other Cats and the group conversations that need
    attention, with fenced titles and names and no text any Cat or model wrote. The prompt asks
    the Boss Cat to suggest one next step in its own direct lane, naming the Cat and the
    conversation, for example offering to create a group or to join. A heartbeat is not an
    owner-started turn, so the server refuses `create_group` and `join_conversation` from it. A
    heartbeat therefore only suggests.
11. FR-11: The `assist` skip (SPEC-137 FR-8) also fingerprints the peer section's attention
    items, so nothing new runs no turn.

#### Owner control and privacy

12. FR-12: Each Cat has a switch, 「讓主控貓看到這隻 Cat 的狀態」, on by default. When it is off, the
    board and the peer section show only the Cat's name. The switch does not change the join
    policy, and its hint says so.
13. FR-13: Every board call, group creation, join request, owner decision, join and leave is
    recorded in the supervision record with ids only. The conversation itself shows the join
    and the leave.
14. FR-14: In a group conversation, the memory checkpoint a Cat receives (`memoryLayers.ts`)
    leaves direct lanes out of "Recent rooms" and out of the recent-help snippet. A direct lane's
    words therefore never surface in a group conversation through it.

### Non-Functional Requirements

- **Security**:
  - **By construction:**
    - direct lanes cannot be joined;
    - the board carries no message text;
    - create and join run only in owner-started turns;
    - "ask every time" needs the owner's exact bound choice.
  - **By prompt only:** titles and names are fenced.
  - **Limits:** these are limits on the server's tools. Every Cat's provider CLI runs under the
    owner's OS account, as elsewhere in Desktop.
- **Privacy**:
  - A direct lane leaves its Cat only as message times.
  - A group conversation shows up on the board only as its title, surface and participant
    names. Its content reaches the Boss Cat only after the Boss Cat joins, with the owner's
    consent or under 「允許」.
- **Cost**: the board and the peer section run no extra model turn. Creating and joining
  happen only when the owner starts the turn.

## Design Overview

- **Tools.** `src/products/chat/state/bossCatSurface.ts` (new) defines the four tools and their
  server handlers. `runtime-dispatch/turn.ts` offers them beside K2/K3 when the target is the
  conversation's admin coordinator and the turn is owner-started. The handlers recheck that on
  the server.
- **Board.** `src/products/chat/state/bossCatBoard.ts` (new) builds the board. SPEC-137's
  `review.ts` reuses it for the peer section.
- **Creating and joining.** Creation uses the channel creation path. Joining uses
  `assignCatToChannel`. The choice card reuses the collaboration choice card's binding
  (`orchestratorCollaborationReport.ts`) as a new card kind.
- **Settings.** Settings › Cats gains the join policy next to the admin switch, and each Cat
  gains its visibility switch.
- **Memory checkpoint.** `memoryLayers.ts` filters direct lanes for group conversations
  (FR-14).

## Test Plan

- The board has every FR-2 field and no message text. A fixture whose messages, choices and
  errors hold a marker string never shows the marker. Titles are cut and cleaned.
- The tools are offered only to an admin coordinator in an owner-started turn. The server
  refuses them from a heartbeat, a schedule, another Cat's turn and a non-admin Cat.
- `create_group` makes a Chat conversation without a repository, with the Boss Cat
  coordinating and the opening message posted. A sixth group within an hour is refused.
- `join_conversation`:
  - It is refused for a direct lane, an archived conversation, an existing membership, a full
    conversation and under 「不允許」.
  - Under 「每次問我」 it waits for the bound choice and refuses after 24 hours. A forged or
    changed choice is refused.
  - Under 「允許」 it joins at once.
  - A join changes no workspace, permission, audience or coordinator.
- A Boss Cat's `assist` heartbeat includes the peer section and skips when nothing changed.
- A Cat with its switch off shows only its name.
- A group conversation's memory checkpoint never names a direct lane or quotes from one.

## Decisions

- D1 (2026-11-11, the owner): Chat, Code and Work conversations are on one level, so one join
  policy covers them all. Its default is 「每次問我」 (FR-7).
- D2 (2026-11-11, the owner): `create_group` does not follow the join policy. The owner asks
  for it in the same turn, and a new conversation holds nothing earlier (FR-4).
- D3 (2026-11-11, the owner): a join card cannot be answered in Telegram. A turn from the
  direct lane's Telegram binding gets a notice there, and the card is answered on Desktop or
  mobile (FR-8).

## References

- SPEC-125 FR-11, FR-17 and FR-19 (coordinator and admin rules), SPEC-118 (K2/K3 and choice
  binding), SPEC-137 (own initiative), SPEC-124 (the life loop).
- Cats Bot SPEC-012 (the Bot counterpart and its security review).
