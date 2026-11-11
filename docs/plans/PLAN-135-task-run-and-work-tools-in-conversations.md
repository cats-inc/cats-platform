# PLAN-135: Task, Run and Work Tools in Conversations

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In progress from 2026-11-12. The owner answered SPEC-142's Q3 to Q5 (A1 to A3) and asked for the plan to be carried out in full. PLAN-134 Phases 1 to 5 have landed. Phases 1 to 4 are done |
| **Owner** | Product owner |
| **Assigned To** | Unassigned |
| **Reviewer** | Independent agent before each merge |

## Related Spec

[SPEC-142: Task, Run and Work Tools in Conversations](../specs/SPEC-142-task-run-and-work-tools-in-conversations.md),
under [ADR-149](../decisions/149-let-a-conversation-gain-product-scopes-and-never-lose-them.md)
D10 to D13.

## Overview

Six phases, one pull request each.

- Phase 1 makes the `cats` server the host's tool server at every level.
- Phase 2 adds the base tools for Tasks and Runs.
- Phase 3 adds proposals and their cards.
- Phase 4 adds the Work tools that need no Project membership.
- Phase 5 lets a conversation belong to a Project and adds everything that touches a folder.
- Phase 6 updates the documents and runs the acceptance.

It builds on [PLAN-134](PLAN-134-conversation-product-scope.md):

- Phase 1 here needs the levels (its Phases 1 and 2) and Code's tools by level (its Phase 4).
- Phase 5 here needs its Phase 5, which raises the state version.

No version bump or publication is part of this plan.

## Implementation Phases

### Phase 1: One server at every level

**Goal:** every conversation that is not a direct lane has the `cats` server, with tools and
instructions listed by level (FR-1 to FR-5).

- [x] Move the server, its grants and its wrapper from `src/products/code/agentTools/` to
      `src/platform/mcp/`, and compose it from tool providers that the host registers. Code's
      tools become the first provider.
  - `hostTools.ts` (the server, its grants and the provider contract),
    `hostToolsEnricher.ts`, `hostToolsClientWrapper.ts` and `shellPermission.ts`. The first
    commit is the pure move.
  - Code's tools are `createCodeAgentToolsProvider`, at level `code`, registered by
    `src/app/server/index.ts` once Code's dependencies are resolved. The endpoint path
    `/api/code/agent-tools/mcp` is unchanged, because the public ingress already refuses it.
- [x] The enricher marks every conversation, direct lanes included (SPEC-142 A3). Its channel
      type gains the conversation's kind, so a lane is listed at `chat` whatever it stores.
  - The channel type already carried the kind and the routing mode (PLAN-134 Phase 2).
  - The marker moved from `codeAgentTools` to `hostTools`. `product:code` is added only when
    the level includes `code`.
- [x] Before lanes get the marker, resolve the image tools' server, which a companion's lane
      already receives under the name `cats`. The wrapper's merge rule would replace it.
      Rename it or make it a provider of the host server, after finding everything that names
      it or its tools.
  - Renamed `cats-images`. Its turn-scoped grants and the Telegram delivery stay its own.
  - Its instructions and the profile publication instructions name it. Nothing else in
    Platform, Runtime or Cats Bot names that server: Runtime's tests use `cats` only as a
    generic name, and Claude Code's `mcp__cats__…` names appear only in Code's policy.
- [x] The marker and the grant carry the level and the participant. Today they carry neither.
  - The participant is the dispatch's target, which the dispatch context now carries as
    `targetParticipantId`, as does a session started for a newly assigned Cat. A raise keeps
    the participant when the marker names none.
- [x] The tool list and the server's `instructions` are built per grant. Today the
      instructions are one fixed string.
  - `McpServerDefinition.instructions` may be a function of the caller. The turn policy is
    the instructions of the providers the grant's level lists.
  - A level with no tool gets no server and no policy. So in this phase nothing changes for
    `chat` conversations: no server, and no worker recycle for nothing. Phase 2's base tools
    give every level a tool.
- [x] The wrapper issues a new grant when the level it sees has changed, and keeps the old one
      valid until the worker is recycled (FR-3).
  - The old grants are revoked once Runtime reports the new set `delivered`, or when the
    session closes. The new grant keeps the session's folder, shell posture and participant.
  - Only a wider level is acted on. When it lists the same tools, the grant takes the new level
    in place and nothing recycles. Since Phase 4, Code to Work lists Work's tools and recycles.
  - Without the current grant, which happens only after a data reset, the new grant has no
    shell posture (fails closed).
- [x] Confirm that the wrapper keeps the other servers on create, send and resume. PLAN-134
      Phase 4 makes that fix; this phase adds the test with the desktop control server, and
      fixes the order in which servers are merged, because Runtime's fingerprint depends on
      it.
  - The merged list is sorted by name on every call. The test with `cats-desktop` was in
    PLAN-134 Phase 4; it now checks the order too.
- [x] Tests for FR-1 to FR-5, including a direct lane with image tools, which keeps them beside
      the host server, through the real wrapper stack in `src/app/server/index.ts`.
  - `tests/host-tool-server.test.tsx`: tools and instructions by level over real MCP calls, a
    call outside the level refused, registration clashes, no server for a level without tools,
    the raise's new grant and the old one's revocation, and a lane's image tools beside the
    host server through the image wrapper and the host wrapper in the app's order.
  - Not through `createServer` itself: no level reaches the lane's host server until Phase 2
    lists a base tool. Phase 2 adds that check end to end.
- [x] Decide and record whether a lane's transport and heartbeat turns get the read tools, and
      put it to the security review.
  - Decided: the read tools are not held back from them. They read only the lane's own Tasks
    and Runs (FR-9), scoped by the grant's conversation and never by arguments, and write
    nothing; their output is limited to what the lane already shows.
  - What actually happens (the security review): a Telegram transport turn passes through the
    enricher like an owner's turn. A heartbeat turn does not (`companionLifeLoop.ts` sends its
    own context), so it carries the server only while the session's grant is tracked from an
    earlier turn; after a Platform restart a heartbeat-first turn gets none, and the next
    owner's turn recycles the worker. That is acceptable for read-only tools.
  - For tools that propose or write (Phase 3 on), a turn gate that refuses transport and
    heartbeat triggers is needed: Telegram text is an injection surface. The trigger and the
    transport are in the turn's context metadata. Phase 3 records it with the proposal tools.
- [x] Checked in Runtime: a provider that cannot take session servers is sent none and its
      report says `unsupported`; nothing fails (`RuntimeSessionManager.supportsSessionMcpServers`).
      A hosted ACP agent that is offered servers but advertises no MCP capability fails its
      session, as a Code conversation's does today. This is unchanged by this phase.

**Deliverables:** the host server with Code's tools as its first provider, and every
conversation marked with its level. Nothing changes for `code` and `work`, and `chat`
conversations get no server until Phase 2 gives them a tool.

### Phase 2: Base tools

**Goal:** an agent can read its conversation's Tasks and Runs (D13; FR-6 to FR-9).

- [x] The three read tools, over Core's Task, Run, Outcome and Checkpoint records, as a
      provider under `src/products/shared/`.
  - `get_tasks`, `list_runs` and `get_run` in `conversationRecordTools.ts`, at level `chat`,
    registered in `src/app/server/index.ts` before Code's tools. With them every conversation
    gets the `cats` server.
- [x] The "own records" rule in one helper, by conversation id only, used by every tool in
      this plan.
  - `conversationOwnRecords.ts`. A Run of an own Task counts only when it names no
    conversation, and an Outcome or Checkpoint only when it names no other conversation.
- [x] Turn Runs left out of the list unless asked for.
- [x] Bounds and fencing for every text field.
  - 50 Tasks; 20 Runs by default and 50 at most; titles and labels 160 characters and
    summaries 1,000, cut by user-perceived character. Each is one line, without control,
    format or line-separator characters, and fenced in `«»`. Ids and timestamps are cleaned and
    capped too, without a fence.
- [x] Tests, including a SPEC-118 role Task that belongs to another conversation.
  - `tests/conversation-record-tools.test.js`: the own-records rule, each tool's fields and
    bounds, a role Task and Run, another conversation's Outcome on the same Run, refused
    arguments and a hostile title.
  - End to end through `createServer`: a Chat conversation's session gets the server at
    create, lists the three tools and not Code's, reads its own projected Task, and is
    refused Code's tools. This is the end-to-end check Phase 1 left for this phase.
- [x] Add the tools to `docs/tool-calls.md`.

**Deliverables:** the base tools at every level.

### Phase 3: Proposals and cards

**Goal:** a tool can ask for a write, and only the owner's confirmation performs it (S1; FR-15
to FR-21).

- [x] The proposal store: content, binding digest, proposer, state and expiry. Its interface
      lives in `src/platform/`, so that Work's tools and Chat's card can both use it.
  - `src/platform/proposals/contracts.ts`: the record, the kind interface (`validate`,
    `binding`, `describe`, `perform`), the registry and the port a tool proposes through.
  - The record is stored in its card's message, with the conversation: a restart keeps it, a
    data reset removes it with the rest of the state, and no file format changes.
  - `src/products/chat/api/conversationProposals.ts` validates, binds and stores a proposal,
    and answers it, on a per-conversation gate of its own: the conversation's mutation gate is
    held for a whole turn, and a tool proposing during that turn would wait on it. The
    conversation id is derived from the grant's channel, never taken from the caller.
  - A confirmation is marked `confirming` before the write and closed after it, so a crash
    never writes twice and a failure after a successful write cannot report it as failed. The
    digest is rechecked on a fresh read just before the write.
  - A card's progress only moves forward in the store, as a raised scope does: a whole-state
    writer that read the state before an answer (a continuation replay) cannot reopen the card
    or drop one posted meanwhile (`keepProposalProgress`).
  - Fails closed, by design: a follow-up hop inside an owner's turn takes an agent's message as
    its source and cannot propose, and a send that overlaps an owner's send closes the gate for
    the rest of that turn.
- [x] The card: a message with the proposal's id and no text, rendered from the store in
      Desktop and mobile, and kept out of prompts and transport mirrors.
  - Its body is one fixed line that points to Desktop, so mobile and any client that cannot
    render the card show that. Desktop renders the card from the owner-only route.
  - It is an owner card like the Boss Cat join card: the same predicate keeps both out of
    routing prompts, continuity, the companion's review and transport mirrors (`origin:
    system`). Only a system message counts as a card, and a client cannot set the key.
  - Clients see a card's id and status only: views and the messages route redact the record,
    and its content is read through the owner-only route, which cleans and bounds every text
    of the kind's view.
- [x] The answering route, for an owner principal only, with the rechecks in FR-18. It does not
      use the conversation's choice answers.
  - `GET` and `POST .../decision` under `/api/channels/:id/proposals/:proposalId`. A
    confirmation rechecks the card's status, its expiry, the conversation and the digest
    against the records as they are now, then performs the write with both actors.
- [x] Closing a card that expired or went out of date, so it frees its place and stops showing
      as waiting, including on the Boss Cat board.
  - An expired card reads as expired at once, and is stored so on the next answer or outcome.
    An out-of-date card is closed as `stale` when the owner answers it, and says so before.
  - The board counts a Cat's open proposals with its waiting approvals.
- [x] The limits in FR-20 and the outcome line in FR-21.
  - 3 open and 10 an hour per conversation, with a refusal the agent can read.
  - The proposer's next turn gets one line per closed proposal (ids and kinds, no content),
    marked as told when that turn's result is applied.
- [x] If PLAN-133's bound card has landed, build on it and keep one card mechanism.
  - The join card's pattern: the record in its card's message, owner-only routes, a digest
    rechecked on the answer, 24 hours, and the same owner-card predicate.
- [x] Tests with one trial proposal kind that writes nothing outside the test.
  - `tests/conversation-proposals.test.js`: storing and refusing, the limits, decline,
    confirm once with both actors, out of date, expiry, a failed write, the outcome lines,
    the board, and the routes (owner only, CSRF, a member refused).
- [x] The turn gate the Phase 1 review asked for.
  - An allow-list: the chat dispatch passes `turnOwnerStarted`, read from the server's own
    SPEC-139 stamp on the turn's source message. It survives a retry; a continuation, a
    Telegram turn, a choice answer and another principal's message have none.
  - A grant's `proposalsAllowed` is open only while that send runs, on every grant the worker
    may hold (retired ones included), and never while another send of the session is in
    flight. A heartbeat carries no marker and stays closed.
  - Tools that propose check `hostToolTurnMayPropose(grant)` (Phase 4).

**Deliverables:** the proposal mechanism, with no Work tool using it yet.

### Phase 4: Work tools without membership

**Goal:** at `work`, an agent can read and propose changes to Work Items and Projects (D11,
D12; FR-10 to FR-14, without the parts that need a conversation's Project).

- [x] The read tools: the conversation's Work Items, and finding Projects for an admin
      coordinator.
  - `get_work_items` and `find_projects` in `src/products/work/agentTools/workConversationTools.ts`,
    a provider at `work`. `get_work_items` marks the projected Work Item; `project` stays null
    until Phase 5. The admin coordinator check (the coordinator, when it is an admin Cat) is
    supplied by the server, which reads the conversation.
- [x] Proposal kinds that existing delegates can perform:
  - [x] new Work Items, through capture (`propose_work_items`, up to 8 in one card);
  - [x] a change to a captured Work Item, through update (`propose_work_item_change`);
  - [x] a captured Work Item into a Project, through assign, for an admin coordinator
        (`propose_work_item_project`), with the folder warning when the Work Item has a Task;
  - [x] a new Project without a folder, through Project create, for an admin coordinator
        (`propose_project`). It names the conversation as its primary conversation (FR-28).
- [x] The checks of FR-14 in the tool layer, before a proposal is stored and again on
      confirmation: not the projected Work Item, not another conversation's records.
  - In the kinds' `validate` and again in `perform`. Another conversation's Work Item reads
    as missing.
- [x] The delegates' context carries the proposer and the confirming owner. Today it carries
      one actor.
  - `confirmedByActorId` beside `actorRef` (the proposing participant), kept in the activity's
    metadata.
- [x] Tests for each kind, for each refusal, and for ADR-105's path still behaving as before.
  - `tests/work-conversation-tools.test.ts`. ADR-105's path is untouched: its delegates gained
    only an optional field, and its suites pass.
- [ ] An independent security review before merge: this is the first path on which a session
      tool leads to a Work write.
- [x] Add the tools to `docs/tool-calls.md`.
- [x] Every proposing tool refuses unless the turn is the owner's own (the Phase 3 turn gate).
- [x] Change the raise confirmation's line that no Work tool is added yet (SPEC-141 FR-29,
      `shared.productScopeRaise.addsNoWorkTool`) to name the tools a Work conversation now gets.
  - Now `addsWorkTools`: "Its agents get Work's tools: they read this conversation's Work Items
    and propose changes you confirm." SPEC-141 FR-29's wording is amended in Phase 6.

**Deliverables:** the Work tools, except those that need a conversation's Project or a folder.

### Phase 5: A conversation in a Project, and folders

**Goal:** a Work conversation can belong to a Project, and every change to a run's starting
folder goes through a card that says so (D12; FR-12, FR-13, FR-16, FR-22 to FR-28).

- [x] The Project id on the conversation state. It lands after PLAN-134 Phase 5 and under its
      state version rise, or with a rise of its own if that release has shipped. This changes
      the frozen `src/products/chat/api/contracts.ts`.
  - As built: `workProjectId` and `workProjectRevision` are optional fields under chat state
    version 7, which has not shipped (latest release 0.15.1), so no rise of its own. A profile
    without them reads as no Project. The store keeps a newer revision over an incoming copy
    (`keepOwnerWorkProjects`), as it keeps raised scopes and proposal progress.
- [x] The projection copies it onto the projected Work Item, moves that Work Item's children
      with it, and writes no Project when the Project no longer exists.
  - As built: `applyChannelWorkProject` (`src/products/chat/api/conversationWorkProject.ts`)
    writes the conversation and Core in one snapshot update, moves the children and records an
    activity with both actors. The projection drops a Project id that Core no longer has.
- [x] The owner's control on a Work conversation in Desktop: set, change and clear, with the
      refusals in FR-23.
  - As built: `ConversationWorkProjectChip` beside the scope chip, for a conversation at Work
    that is not a parallel member. Its confirmation names the folder where the conversation's
    supervised runs would start, or the sandbox, and how many conversations and Work Items the
    Project holds. Route: `GET`/`POST /api/channels/:id/work-project`, owner only, bound to the
    revision shown, not waiting for a running turn.
- [x] Two new Work writes, each with its delegate under Work:
  - [x] capture into the conversation's Project (`intoProjectId` on the intake delegate's
        capture context, one write);
  - [x] a folder for an existing Project (`src/products/work/state/workProjectFolder.ts`).
- [x] The remaining proposal kinds:
  - [x] the conversation's Project, which is a write to the conversation
        (`conversation.work_project`, registered by Chat);
  - [x] a captured Work Item into the conversation's Project (`propose_work_item_project` opens
        to any participant for the conversation's own Project);
  - [x] a folder for the conversation's Project, for an admin coordinator
        (`work.project.folder`, `propose_project_folder`);
  - [x] a new Project with a folder, through the existing create delegate, for an admin
        coordinator. The conversation joins it when it has no Project.
- [x] The folder warning on every card in FR-16.
- [x] ADR-105's Project create with a folder becomes a proposal and its card (SPEC-142 A1).
      Without a folder it is unchanged, with its flag on and off.
  - As built: on the owner's own turn only (the SPEC-139 stamp); otherwise, and without the
    proposal service, nothing is created.
- [x] Work's side: the projected Work Item under its Project, a Project's page listing its
      conversations with links, and the blocker rules of FR-27.
  - As built: Turn Runs no longer count as a Project's active work for edit, pause, archive or
    its anchors; a Project with conversations names them as a delete blocker; the Project page
    lists them with links (`memberConversations` on the project list projection).
- [x] Tests, including the supervised run's folder (FR-26), a blocked Turn Run not refusing a
      change, and Work's routes still refusing to edit the projected Work Item.
  - As built: `tests/conversation-work-project.test.js`,
    `tests/conversation-work-project-renderer.test.tsx`, Phase 5 cases in
    `tests/work-conversation-tools.test.ts` and the A1 case in
    `tests/chat-work-triage-dispatch.test.tsx`. FR-26 is checked through the projected Work
    Item's Project and Task, which Work's supervised-run target reads for its folder.
- [ ] An isolated candidate walk with screenshots.

**Deliverables:** Project membership, the folder proposals and the remaining Work tools.

### Phase 6: Documents and acceptance

- [ ] Amend SPEC-141 FR-8, FR-25, FR-29 and its Test Plan, ADR-126 and SPEC-123: the `cats`
      server goes to every level, a raise reaches a session through a new grant, and the raise
      confirmation lists the Work tools.
- [ ] Amend ADR-105 and SPEC-109: their tools have a second channel, and proposal-only tools
      are not limited by capability profile there.
- [ ] Amend SPEC-126 and the terminology: a conversation's Project, and a Project's blockers.
- [ ] Provider acceptance: Claude Code and Codex each list the tools at all three levels and
      complete a read and a proposal, under the default policy and an interactive one.
- [ ] Update ADR-149's status.

## Not in This Plan

- Creating a Task or starting a Run from a tool.
- The external tracker tools.
- Tools for supervised runs, golden-path runs and schedules.
- Picking a Project on a Work draft (SPEC-142 Q1).

## Proposed Tool Names

On the `cats` server, in the style of its existing tools. The names are a proposal and are
fixed when each phase lands.

- **Every level.** `get_tasks`, `list_runs`, `get_run`.
- **Work, reading.** `get_work_items`, `find_projects`.
- **Work, proposing within the conversation.** `propose_work_items`,
  `propose_work_item_change`, `propose_work_item_project`.
- **Work, proposing beyond it.** `propose_conversation_project`, `propose_project`,
  `propose_project_folder`. `propose_work_item_project` also needs an admin coordinator when
  it names a Project other than the conversation's.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/code/agentTools/service.ts`, `runtimeClientWrapper.ts`, `contracts.ts`, `enricher.ts` to `src/platform/mcp/` | Move | The host tool server, its grants, its wrapper and its marker |
| `src/platform/mcp/jsonRpcServer.ts`, `sessionGrants.ts` | Modify | Instructions per grant; a new grant on a level change |
| `src/platform/runtime/invocationEnrichment.ts` | Modify | The conversation's kind, level and participant on the enricher's channel type |
| `src/app/server/index.ts`, `src/app/server/dependencies.ts` | Modify | Composing the server from its providers. These are integration-owned |
| `src/products/code/agentTools/` | Modify | Code's tools as a provider, with its policy text |
| `src/products/shared/agentTools/` | Create | The base tools and the "own records" helper |
| `src/platform/proposals/` | Create | The proposal store and its interface |
| `src/products/chat/state/`, `src/products/chat/api/resources/` | Modify | The card message, the answering route and the outcome line |
| `src/products/work/agentTools/` | Create | The Work tools as a provider |
| `src/products/work/state/work*Delegate.ts`, `src/products/work/shared/workToolSurface.ts` | Modify | Context with proposer and owner; capture into a Project; a Project's folder |
| `src/products/chat/api/contracts.ts`, `src/products/shared/api/workspaceContracts.ts` | Modify | The conversation's Project id, and the card's message shape |
| `src/core/types.ts`, `src/products/chat/state/store.ts` | Modify, only if Phase 5 needs its own rise | The state version and its upgrade |
| `src/products/chat/state/core-projection/entities.ts` | Modify | The Project on the projected Work Item and its children |
| `src/products/work/api/`, `src/core/ownerActions.ts`, `src/core/ownerManagement.ts` | Modify | A Project's conversations, and the blocker rules |
| `src/products/work/renderer/`, `src/products/shared/renderer/components/conversation-view/`, `src/mobile/`, and the mobile app under `mobile/` | Modify | The Project control, the card on Desktop and mobile with its fallback line, and a Project's conversations |
| `src/shared/i18n/catalogs/en.ts`, `zh-TW.ts`, `messageKeys.ts` | Modify | Copy |
| `tests/` | Create | Delivery, base tools, proposals, Work tools and Project membership |
| `docs/tool-calls.md`, `docs/api.md` and the documents in Phase 6 | Modify | Registries and amendments |

`tests/dependency-graph.test.js` forbids one product importing another. That is why the server
and the proposal store sit under `src/platform/`, the base tools under `src/products/shared/`,
and the host joins them.

## Technical Decisions

- **One server, composed by the host.** One server and one grant per session keeps the tool
  list, the level check and the instructions in one place. The session composition seam also
  names a host contribution `cats`. The desktop control server stays separate, as it is.
- **List by grant, check by call.** The JSON-RPC module already refuses a tool that is not in
  the grant's list. The level is read both times.
- **A new grant carries a raise.** Runtime recycles a worker when its server set's fingerprint
  changes, and the fingerprint includes the token. The wrapper compares the level it sees with
  the one the grant was issued for, so Chat's raise does not need to call into the server.
- **Reuse ADR-105's delegates where they fit.** Capture, update, assign and Project create
  already take server-supplied context and return typed results. Capture into a Project and a
  Project's folder have no delegate today and get one.
- **Plain tool names.** Dotted names are untested over session servers in Claude Code and
  Codex, so the new tools follow the `cats` server's existing style and the dotted names stay
  inside the delegates.
- **A card of its own.** Today's choice answer is a user message with the question and the
  options in its text. It would put the proposal into prompts and transport mirrors, and the
  message route checks no role.
- **Cards instead of provider approvals.** A provider's own prompt appears only under an
  explicit interactive policy, which conversations do not have by default. A card works under
  every policy and shows Work's own fields.

## Testing Strategy

- **Unit tests**: the tool list and instructions per level, the "own records" helper, each
  tool's result shape and bounds, the proposal digest, the limits, the card's closing and each
  refusal.
- **Integration tests**: the server over HTTP with real grants, the wrapper with other servers
  present, a raise followed by a new tool list, the answering route with and without an owner
  principal, and the delegates called with bound content.
- **Manual testing**: an isolated candidate for Phase 5, and the provider acceptance in
  Phase 6. The State Hygiene Policy applies: no test records in the owner's profile.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Every conversation gains a session server; each live session recycles its worker after this ships and after every Platform restart | Medium | Phase 1 ships with no tool at `chat` first; providers without session servers are unaffected |
| Attaching `cats` everywhere drops other servers, as Code's wrapper does today | High | PLAN-134 Phase 4 makes the fix; Phase 1 here holds it with a test |
| Two servers named `cats` on one session make Runtime refuse the send | High | Direct lanes are excluded with the same lane check the image tools use, and a test covers a lane with image tools |
| Codex reads the user's own configuration when a server is injected, and may fail on an unknown layer or on a user's own `cats` entry. Today that reaches Code conversations only. Not verified by a run | Medium | Check in Phase 1 with Codex before the server reaches `chat`; provider acceptance in Phase 6 |
| Other adapters that take session servers, such as Copilot, also receive the tools, and the acceptance covers only Claude Code and Codex | Low | State it in the release notes; add an adapter to the acceptance when it is used |
| A session tool leads to a Work write | High | Every write is a proposal the owner confirms (S1); an independent security review in Phase 4 |
| A Project's folder changes where approval-free runs start | High | Every such card shows the folder and the warning (FR-16) |
| A proposal reaches a prompt or a transport mirror | High | A card and an answering route of their own (FR-15, FR-17), with a test for both |
| The same change is offered on ADR-105's path and on the session server | Low | Both end in the same delegate; noted in SPEC-142 FR-29 |
| PLAN-133 builds SPEC-139's bound card at the same time | Medium | Phase 3 builds on it if it has landed, so there is one card mechanism |
| A new stored field is dropped by an older build | Medium | Phase 5 follows the state version rise of PLAN-134 Phase 5 |

---

*Created: 2026-11-11*
*Author: Claude; independent review by a separate agent on 2026-11-11*
*Related Spec: [SPEC-142](../specs/SPEC-142-task-run-and-work-tools-in-conversations.md)*
