# SPEC-141: Conversation Product Scope

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft, 2026-11-11, revised the same day after an independent review and again after the owner answered Q1, Q2 and Q4. The owner's decisions D1 to D13 are fixed by ADR-149. ADR-149's P1 to P3 and P6 and this SPEC's S2 to S6 and Q3 were put to the owner on 2026-11-11 as defaults that stand unless the owner objects. S1 was put to the owner the same day. Implementation in progress: the field exists (FR-1 to FR-7, PLAN-134 Phase 1), Recents, routes, labels, Work's own-record check and Code's tool checks read it (FR-12 to FR-15, and FR-8 for `code` only, Phase 2), and the role tools are offered at every level (FR-19, Phase 3) |
| **Owner** | Product owner |
| **Reviewer** | Owner; an independent review before implementation |
| **Decision** | [ADR-149](../decisions/149-let-a-conversation-gain-product-scopes-and-never-lose-them.md) |
| **Updates when implemented** | ADR-069 (Recents and routes follow the scope; its section 3 fallback takes effect), ADR-073 (see below), ADR-098 and SPEC-101 (canvas surface kinds, if one is added), ADR-126 and SPEC-123 (who receives the `cats` server), SPEC-118 (its limit to conversations created on Chat ends, D8), SPEC-137 FR-7 (wording, if S1 stands), SPEC-139 FR-3, FR-6, FR-8 and FR-10, `docs/tool-calls.md` and `docs/agent-control-surfaces.md` (who is offered the collaboration tools), and the terminology |
| **Plan** | [PLAN-134](../plans/PLAN-134-conversation-product-scope.md) |

ADR-073 needs three updates:

- A draft's surface chip also sets the starting scope.
- Its line "`originSurface` stays the authoritative product-ownership field" no longer holds for
  Recents and routes.
- It says +New work creates a Project. The code creates none.

## Summary

Every conversation gets a product scope on the ladder `chat < code < work`. The owner sets it on
a new draft with the composer's surface chip and can raise it later, never lower it. The scope
decides which product's Recents and route the conversation lives in, and whether its agents
receive Code's tools.

What a raise does in this version:

- **To Code.**
  - The conversation moves to Code's Recents and opens under `/code`.
  - From their next turn, its agents have the `cats` tools: `declare_artifact`,
    `show_in_canvas`, and live previews when the Settings > Code switch is on.
  - Code's conversation parts apply: the canvas with its preview controls, the preview button,
    the work areas panel, and the folder and permission chips.
- **To Work.**
  - Everything a raise to Code gives.
  - The conversation moves to Work's Recents and opens under `/work`, and Work counts its Work
    Item as its own.
  - Its agents get no Work tool from this SPEC. Work's own tools are Work Items and Projects
    (D11), and [SPEC-142](SPEC-142-task-run-and-work-tools-in-conversations.md) specifies
    them. Task and Run are the foundation, not Work tools (D10).

A raise creates no record, changes no participant, folder or CLI permission, and removes no
tool. The conversation is then shown with its new product's view and preferences (FR-11).

Apart from raises, orchestrator knowledge and SPEC-118's collaboration tools are offered at
every level, in Code and Work conversations as well as Chat ones (D8).

## Goals

- One field says where a conversation lives and whether it has Code's tools.
- A raise is the owner's own informed choice, shown before it happens, and permanent.
- A raise removes no tool, participant or record from the conversation.
- Conversations that are not raised behave as today, with four intended changes:
  - conversations on Work gain Code's tools (D5);
  - conversations created on Code or Work gain orchestrator knowledge and SPEC-118's
    collaboration tools (D8);
  - conversations with no recorded origin become visible in Chat's Recents (S4);
  - a direct lane created outside Chat stops receiving Code's tools (S6).

## Non-Goals

- Work's own agent tools for Work Items and Projects, and the read tools for Tasks and Runs.
  SPEC-142 specifies both (D11 to D13).
- A raise proposed or performed by an agent, a transport, a schedule or a heartbeat.
- Raising a direct lane, a parallel group or its members (P3).
- Lowering a scope, or undoing a raise.
- Changing CLI permission (D4), or adding a live permission editor.
- Changing the product posture commands `/chat`, `/code` and `/work` (ADR-101, ADR-103).
- Changing SPEC-139's rules, or any SPEC-118 rule other than its limit to conversations
  created on Chat (D8).
- A raise control in the mobile app (S3, Q3).
- Work's supervised runs. They are not conversations, their Runtime client carries no Code
  tools wrapper (`src/app/server/index.ts:130`), and this SPEC leaves them so.

## Definitions

- **Product scope**: `productScope`, one of `chat`, `code` and `work`, ordered
  `chat < code < work`. Each level includes everything below it.
- **Origin**: `originSurface`, the product whose draft created the conversation. It never
  changes.
- **Raise**: changing a conversation's scope to a wider level.
- **Direct lane**: a conversation whose kind is `direct_message`.
- **Parallel member**: a conversation that belongs to an active parallel group.
- **Owner principal**: an authenticated account whose membership has the `owner` or `admin`
  role, on Desktop's cookie with CSRF or on mobile's bearer.

## Inspected Baseline

Read from Platform `36d4bb458` and Runtime `fb50e59a` on 2026-11-11, and rechecked on Platform
`4c426dcbe`. PLAN-134 holds the
inventory of every `originSurface` reader.

- **Creation.**
  - `originSurface` is required and validated on create (`resolveCreateOriginSurface`,
    `src/products/chat/api/routeSupport.ts:500`), stamped by `createChannel`
    (`src/products/chat/state/model/index.ts:504`) and never written again.
  - The server accepts a direct lane with any origin. Reusing a direct lane returns the existing
    lane with its original origin. Telegram rooms are direct lanes stamped `chat`.
  - No path adds an existing conversation to a parallel group or turns one back into a direct
    lane.
- **Legacy values.** Loading turns a missing or invalid origin into null
  (`src/products/chat/state/chat-snapshot/entities.ts:360`). Such conversations are hidden from
  every Recents list today, because the filter needs an exact match
  (`src/products/shared/recentsFilter.ts:48`). ADR-069 section 3 decided they should resolve as
  `chat`.
- **Records.**
  - Every conversation is projected into Core with a Task and a WorkItem linked through
    `WorkItem.taskId` (`src/products/chat/state/core-projection/index.ts:110`, `:123`),
    whatever its origin. Creating a Work conversation creates no Project.
  - A projected conversation's Core `kind` is `chat_channel` or `direct_message`, never
    `code_thread` or `work_thread` (`src/shared/chatCoreIds.ts:117`).
  - By the code as read, Work already counts every conversation's projected Task as its own,
    because its WorkItem links to it, and the projected WorkItem too, because its graph object
    carries no conversation metadata. The origin check
    (`src/products/work/api/ownerGraphProjection.ts:12`) decides only for a Task that came
    from a conversation and is not bound to Work, which the projection does not produce.
- **Tools.**
  - The only registered enricher attaches the `cats` server when `originSurface === 'code'`
    (`src/products/code/agentTools/enricher.ts:34`). It does not look at the conversation's
    kind.
  - A session that did not have the server gets a grant on its next send once the marker is
    present. That grant is bound to the conversation's folder, where a new session's grant is
    bound to the folder Runtime reports (`src/products/code/agentTools/runtimeClientWrapper.ts:132`,
    `:159`).
  - When a send changes a live worker's server set, Runtime recycles the worker through resume
    at the turn boundary (Runtime SPEC-035, SMCP-08).
- **Code's conversation parts.**
  - The agent tools and live previews name the `code_conversation` canvas surface
    (`src/products/code/agentTools/showInCanvas.ts:97`, `devPreview.ts:134`, `service.ts:181`),
    whose route is Code's. Stored preview state is matched on that kind.
  - Code's conversation route mounts that canvas with its preview controls
    (`src/products/code/renderer/AppRoutes.tsx:96`), the preview button, the work areas panel
    (`src/products/code/renderer/components/CodeConversationView.tsx:53`) and the folder and
    permission chips.
  - Work's conversation route mounts none of them. Chat's mounts the `chat_conversation` canvas
    and a Cat status row.
  - Each product's route also names its own conversation preferences (`behaviorSurface`).
- **Recents and routes.**
  - `filterChatChannelsForProductRecents`, used by Desktop and mobile, keeps a conversation
    whose origin equals the product (`src/products/shared/recentsFilter.ts:48`).
  - `resolveConversationOriginRoute` redirects a conversation opened under another product to
    its origin's route
    (`src/products/shared/renderer/crossSurfaceConversationNavigation.ts:16`).
- **Surface chip.** Drafts show a chip that can change the product. Existing Code and Work
  conversations show a fixed chip (`src/products/code/renderer/AppRoutes.tsx:157`,
  `src/products/work/renderer/AppRoutes.tsx:142`). Existing Chat conversations show none.
- **Chat-only gates.**
  - `isOrchestratorKnowledgeChannel` (`src/products/chat/state/orchestratorKnowledge.ts:22`)
    and SPEC-118's execution checks (`src/products/chat/state/collaborationExecution.ts:87`,
    `:146`) require `originSurface === 'chat'`.
  - The companion's life review counts only Chat and no-origin conversations
    (`src/products/chat/companion/life/review.ts:47`).
- **Posture.** `/chat`, `/code` and `/work` change a lane's product posture, in both directions
  and from Telegram (ADR-101). Posture context takes its source product and preset from the
  origin (`src/products/chat/state/runtime-dispatch/routing.ts:1149`), and active anchors match
  on them (`src/products/chat/shared/productIntentIntakeMetadata.ts:167`).
- **Revision.** `collaborationExecutionRevision` digests one conversation's settings together
  with every Cat's settings and the provider capabilities
  (`src/products/chat/state/collaborationExecutionSurface.ts:24`). A running SPEC-118
  collaboration checks it at each step.
- **Policy and lifecycle.** CLI permission is set at creation, and no route edits it
  afterwards. No route archives a conversation; `archived` appears only in stored data.
- **Persistence.**
  - Loading builds each conversation from known fields
    (`src/products/chat/state/chat-snapshot/entities.ts`), so a build that does not know a
    field drops it on its next write.
  - The state file has a version, `CATS_CORE_STATE_VERSION = 6` (`src/core/types.ts:3`). A
    build refuses a file whose version is newer than its own
    (`src/products/chat/state/chat-snapshot/index.ts:160`).
- **Owner principal.** Every `/api/channels/*` route is behind the auth gate, but none checks a
  role today. `src/products/chat/api/resources/diagnosticRoutes.ts:11` shows the role check
  this SPEC needs.

## Requirements

### Functional Requirements

#### The field

1. FR-1: Every conversation has a `productScope` of `chat`, `code` or `work`. The order is
   `chat < code < work`.
2. FR-2: A new conversation's scope is its origin, except that a direct lane's scope is `chat`
   whatever its origin (S6). The create request cannot name a scope: the server sets it, for a
   single conversation and for each parallel member.
3. FR-3: A stored conversation whose scope is missing or invalid gets one when loaded, and the
   value is written on the next save. No other stored field changes.
   - A direct lane loads as `chat`.
   - Any other conversation loads at its origin's level.
   - A conversation or a parallel group with no recorded origin is treated as `chat`. It then
     appears in Chat's Recents, where today it is hidden from every list (S4).
   - A valid stored scope is kept as stored, even when it is lower than the origin. Loading
     never raises a scope: a former lane with a Code origin stays at `chat` until the owner
     raises it.
   - A direct lane is read as `chat` whatever is stored (S6). What is stored is left as it is.
4. FR-4: One state function raises the scope. No other code path writes the field after
   creation, and the function refuses an equal or lower level.
5. FR-5: A direct lane or a parallel member cannot be raised (P3). A parallel group keeps its
   own `originSurface` for its Recents entry.
   - A conversation that stops being one can be raised like any other: a lane that became an
     ordinary conversation when its Cat left Chat, or a member whose group was dissolved.
6. FR-6: The conversation summary, the conversation view, the mobile summary and the Core
   metadata projected from a conversation carry `productScope`. They keep `originSurface`.
7. FR-7: The raise has its own revision: a digest of the conversation's id, scope, kind, group
   membership, participants, folder, workspace access and permission mode.
   - `collaborationExecutionRevision` is left as it is and does not cover the scope. A raise
     therefore does not disturb a prepared or a running SPEC-118 collaboration.
   - The Settings > Code switch is shown in the confirmation but is not part of the digest.

#### What follows the scope

8. FR-8: The `cats` session MCP server and Code's preview policy go to every conversation whose
   scope is `code` or `work` (D5).
   - Conversations created on Work therefore receive Code's tools from the release that ships
     this.
   - Live previews keep their Settings > Code switch and the session's shell permission.
   - The checks that verify a Code session or serve Code work areas only for
     `origin === 'code'` accept the scope the same way.
   - A direct lane's scope is `chat`, so it receives none of this.
   - SPEC-142 later attaches the `cats` server at every level and lists Code's tools on it only
     for `code` and `work`. What this requirement fixes is who gets Code's tools.
9. FR-9: A conversation's canvas and live previews open beside it on the product where it
   lives. The tools stop assuming Code's route for every conversation.
   - Canvas and preview state recorded earlier keeps working after a raise and after this
     ships: an artifact still opens, and a running preview can still be read, stopped and
     restarted.
10. FR-10: A conversation whose scope is `code` or `work` is shown with Code's conversation
    parts, on Code and on Work alike: the canvas with its preview controls, the preview button,
    the work areas panel, and the folder and permission chips.
11. FR-11: A conversation is shown with the conversation view and the conversation preferences
    of its scope's product. Parts that only Chat's view has, such as its Cat status row, are
    not shown on Code or Work.
12. FR-12: Recents, on Desktop and mobile, list a conversation under the product of its scope
    (D7). A parallel group stays under its group origin.
13. FR-13: A conversation's route is its scope's product: `/chat/chats/:id`, `/code/chats/:id`
    or `/work/chats/:id`.
    - Opening it under another product redirects there and keeps the rest of the path. Links
      made before a raise, and links that hard-code a product prefix, therefore still work.
    - A product's landing conversation is chosen from conversations of that scope.
14. FR-14: Links and labels that name a conversation's product use its scope: the owner-action
    source path, the Catlas conversation link and the product label in the Catlas snapshot.
15. FR-15: Work's own-record check reads the scope where it reads
    `metadata.originSurface === 'work'` today.
    - The check decides only for a Task that came from a conversation and is not bound to
      Work. The projected Task and the projected WorkItem already count for every
      conversation, and this SPEC leaves that as it is.
    - A raise to `work` therefore changes nothing in what Work counts as its own.

#### What stays with the origin

16. FR-16: `originSurface` keeps its meaning and its stored value. Core metadata copied from a
    conversation keeps `originSurface` and adds `productScope`.
17. FR-17: The posture commands never change the scope, and the scope does not limit posture.
    Posture context keeps taking its source product and preset from the origin, so an active
    anchor survives a raise.
18. FR-18: Catlas keeps deciding whether to title a conversation from the draft surface it was
    created on.
#### Role tools at every level

19. FR-19 (D8): Orchestrator knowledge and SPEC-118's collaboration tools are offered in every
    conversation that is not a direct lane, whatever its origin or scope. Three gates stop
    reading the origin: orchestrator knowledge, the collaboration tool descriptors and
    SPEC-118's execution checks.
    - Every other SPEC-118 condition stays, including:
      - the decision flag, which is off by default;
      - an admin coordinator;
      - the owner's confirmation before anything is created or run;
      - a folder on the conversation that starts an implementation;
      - no direct lane and no archived conversation;
      - its exclusions of default-provider Chat, direct Cat replies, transports and direct
        Orchestrator dispatch.
    - The lane condition is on the collaboration tools. The knowledge goes to a conversation's
      coordinator, and a direct lane's Cat coordinates its lane: it received the knowledge
      when the lane was created on Chat and still does, and a lane created elsewhere now
      receives it too.
    - Code's and Work's own product instructions stay. Orchestrator knowledge is added to them.
    - A conversation stored with no origin is included like any other. The Chat-only rule
      had left it out, although it is Chat's everywhere else (S4).
    - The knowledge goes to whoever coordinates. A conversation started without naming anyone
      has the remembered provider and model as its one participant, which coordinates it, so
      on Code and Work that agent now receives the Orchestrator role with each turn. On Chat
      it already did.
    - A conversation that SPEC-118 creates is still created on Chat.
    - The companion's life review is not part of D8. It keeps reading the origin (S1), so a
      conversation created on Chat is still reviewed after a raise, and one created on Code or
      Work is still not reviewed, as SPEC-137 FR-7 says.

#### Raising

20. FR-20: Only an owner principal can raise a scope. The server refuses a request without one.
    No agent tool, transport command, schedule, heartbeat or create request reaches the raise
    function.
21. FR-21: `GET /api/channels/:channelId/product-scope` answers an owner principal with:
    - the current scope and the origin;
    - whether the conversation can be raised, and if not, which of FR-23's reasons applies;
    - the wider levels;
    - the participants who would gain a new level, by id, name and kind;
    - the folder or sandbox, the workspace access and the permission mode, none of which a
      raise changes;
    - whether live previews are switched on;
    - the raise revision (FR-7).
22. FR-22: `POST /api/channels/:channelId/product-scope` takes the target level and the revision
    the owner saw. Inside the conversation's mutation gate, the server rechecks everything in
    FR-23 and then performs the raise. If a turn holds that gate, the request waits for it, as
    any write to the conversation does.
23. FR-23: The raise is refused, with a stable error code for each case, when:
    - the caller is not an owner principal;
    - the conversation does not exist, or its stored status is archived;
    - it is a direct lane or a parallel member;
    - the target is not a wider level;
    - the revision no longer matches.
24. FR-24: A raise does exactly three things:
    - it sets the scope;
    - it adds a system line to the conversation that names the old and the new level;
    - it publishes the conversation's update events.

    It changes no participant, coordinator, audience, folder, workspace access, permission mode
    or origin, and it creates no Core record (S2).
25. FR-25: The raise restarts no session.
    - A turn that is running finishes with the tools it started with.
    - Each participant's next turn carries the new tool set, and Runtime recycles the worker
      through resume. Once SPEC-142 attaches the server at `chat`, the server set no longer
      changes on a raise, so the session's next send carries a new grant to the same effect
      (SPEC-142 FR-3). The raise itself still does only what FR-24 lists.
    - The grant for a session that gains the server is bound to the folder that session runs
      in, not to the conversation's folder. This also applies to every Work conversation's
      first turn after D5 ships.
    - If Runtime cannot recycle the worker, the turn is handled as a lost session is today. The
      scope stays raised.
    - Code's preview policy joins the instructions once Runtime reports the server as delivered
      (ADR-126 point 5).
26. FR-26: A participant added after a raise works under the conversation's current scope.

#### Desktop

27. FR-27: An existing conversation shows the surface chip for its scope in Chat, Code and
    Work. Chat gains the chip, which it does not show today.
28. FR-28: On a conversation that can be raised, the chip opens a menu of the wider levels
    only. On a direct lane or a parallel member the chip has no menu. On an existing
    conversation the chip can never be dismissed (P6).
29. FR-29: Choosing a level opens a confirmation built from FR-21's answer. It shows:
    - the new level and what it adds, as in the Summary;
    - for Work, that no agent tool is added yet;
    - every participant who gains the level, and that later participants will too;
    - the folder or sandbox and the CLI permission, marked as unchanged;
    - that the conversation moves to the new product's Recents and uses that product's view
      and preferences;
    - that a raise cannot be undone.
30. FR-30: After a raise, Desktop opens the conversation at its new route and shows a toast that
    names the product it moved to. A failed raise shows a toast with the reason and leaves the
    conversation where it was.
31. FR-31: Drafts work as today (D6). On a draft the chip can still be changed and dismissed.
32. FR-32: All new copy exists in zh-TW and en.

### Non-Functional Requirements

- **Security**:
  - The product scope is not a security boundary (ADR-149 Decision 6). It decides which Cats
    tools a session is offered. CLI permission stays as the conversation was created.
  - The server enforces three things: an owner principal (FR-20), the refusals in FR-23 and the
    single write path in FR-4.
  - Desktop renders the confirmation from server state. It never enters a model's context.
  - D5 widens ADR-149's recorded Work risk: conversations on Work gain Code's tools under the
    same approval-free defaults.
  - D8 widens SPEC-118: its collaboration tools reach Code and Work conversations, which run
    in a folder and, by default, without approvals. SPEC-118's other conditions stay (FR-19),
    and PLAN-134 asks for an independent security review of that phase.
- **Privacy**: The system line carries the two levels and nothing else.
- **Compatibility**:
  - `productScope` is a new stored field. A build without it would drop the field from the
    conversation on its next write and silently lower a raised conversation, which D2 forbids.
    - That build also drops the copy from the records it rebuilds: Run, Mission, Trace,
      Checkpoint, Outcome and Activity.
    - It keeps the copy on a Task and a WorkItem, whose metadata it carries over, until a
      build with the field syncs again.
  - The state version therefore rises (D9), and an older build refuses the file, as it does
    for any newer version today.
  - It rises in the change that first lets a conversation be raised. Until then a dropped
    field derives again to the same value. The one corner before that is S6's lane created
    outside Chat that later became an ordinary conversation: after an older build's write it
    would load at its origin's level.
  - The upgrade follows the version policy:
    - it accepts only a file it recognizes;
    - it keeps a backup of the original bytes that later writes never rotate;
    - it replaces the file atomically;
    - on failure it leaves the original in place and reports the failure.
  - A new state version is a persisted-data boundary, so the release that ships it starts a
    new minor line. The state version lives in the frozen `src/core/types.ts`.
  - This SPEC and its plan include no version bump and no publication.
- **Performance**: A raise is one state write. Listing and routing read one more field.

## Design Overview

- **State.** `productScope` sits beside `originSurface` on the conversation state. Loading
  derives a missing value (FR-3), creation stamps it (FR-2), and one function raises it (FR-4).
- **Readers.** Each reader in PLAN-134's inventory moves as FR-8 to FR-18 say. While every
  scope still equals its origin, moving a reader changes nothing, and tests prove that before
  D5 lands. The exceptions are the no-origin conversations of FR-3 and the direct lanes of
  FR-2.
- **D8.** The three gates of FR-19 stop reading the origin and keep their other conditions.
- **D5.** The enricher marks conversations of scope `code` and `work`. Code's conversation
  parts become available to Work's route, and the canvas resolves its route from the scope.
  PLAN-134 decides between a new canvas surface kind and resolving the existing one.
- **Raise.** Two routes beside the conversation detail route, both owner-gated. The answer to
  the read route carries the revision that the write route checks.
- **Desktop.** The conversation view's surface tag becomes the scope chip, with the menu, the
  confirmation and the move.

## Proposals for the Owner

These are this SPEC's choices, not owner decisions. The owner may change any of them. All six
were put to the owner on 2026-11-11 as defaults that stand unless the owner objects.

- S1: The companion's life review keeps reading the origin (FR-19). The owner's answer on D8
  named the collaboration tools and orchestrator knowledge, not the review.
- S2: A raise creates no record (FR-24). ADR-149's P5 expected entry records; the projection
  already gives every conversation a Task and a WorkItem.
- S3: Version one has no raise control on mobile. Mobile lists follow the scope, and the raise
  route accepts mobile's bearer for later. This narrows ADR-149's P1 to Desktop.
- S4: A conversation or a parallel group with no recorded origin is treated as `chat` and
  becomes visible in Chat's Recents (FR-3). This puts ADR-069 section 3 into effect.
- S5: The raise is recorded as the system line in the conversation and nowhere else (FR-24).
- S6: A direct lane's scope is always `chat` (FR-2).
  - It is `chat` at creation and on load, and every reader treats a lane as `chat` whatever is
    stored. The stored value is left alone, so a conversation that stops being a lane has the
    level it had (D2). The owner was told of this reading order on 2026-11-11 as a default
    that stands unless the owner objects.
  - A lane created with a Code origin received the `cats` server before PLAN-134 Phase 2 and
    no longer does.
  - Such a lane that later becomes an ordinary conversation stays at `chat` (FR-3). It was
    listed and routed under its origin's product before, and is Chat's now, until the owner
    raises it.
  - Desktop has no path that creates such a lane. The mobile app's only direct-lane create is
    on its Chat tab and sends `chat`.

## Test Plan

- **The field.**
  - A new conversation's scope equals its origin, a new direct lane's is `chat`, and a create
    request that names a scope does not set it.
  - Stored conversations load as FR-3 says, including a missing or invalid stored value, a
    no-origin group, and a valid scope below the origin, which is kept. Saving writes the value
    and changes nothing else.
  - The raise function refuses an equal or lower level, a direct lane and a parallel member. A
    former lane and a former member can be raised. No other mutator changes the field.
  - A file of the previous state version upgrades with a backup of its original bytes, also
    when the backup of an earlier upgrade is already present. A failed upgrade leaves the
    original in place.
  - A build of the previous version refuses the upgraded file, on a normal read and on its
    backup recovery path.
- **Readers, before D5.** With every scope equal to its origin, Recents, routes, redirects,
  landing conversations, tool delivery and Work's own-WorkItem check give the same results as
  on the base commit, for fixtures of all three origins.
- **D5.**
  - A conversation created on Work receives Code's tools. Its canvas, preview controls,
    preview button, work areas panel and chips appear on Work's route.
  - A conversation created on Chat still receives none of Code's tools, and neither does a
    direct lane of any origin.
  - A supervised Work run still receives none.
  - The grant of a worktree or sandbox conversation is bound to its session's folder.
- **Raising.**
  - Each refusal in FR-23 returns its error code and changes nothing.
  - A raise sets the scope, adds one system line and publishes the events. Participants,
    coordinator, folder, access, permission mode and origin are unchanged, and no Core record is
    created.
  - A stale raise revision is refused. A change to another Cat's settings does not make it
    stale.
  - A prepared and a running SPEC-118 collaboration are unaffected by a raise.
  - A session created without the server gains it on its next send. A running turn keeps its
    tools. A failed recycle leaves the scope raised.
  - After Code to Work, an artifact recorded earlier still opens and a running preview can be
    read, stopped and restarted.
  - No agent tool, transport command, schedule, heartbeat or create request can raise a scope.
- **Role tools (D8).**
  - Orchestrator knowledge and the collaboration descriptors are offered in conversations of
    every origin and scope, and never in a direct lane or an archived conversation.
  - Each remaining SPEC-118 condition still refuses: the flag off, a coordinator who is not an
    admin, no owner confirmation, and no folder for an implementation.
  - A conversation SPEC-118 creates is created on Chat.
  - Code's and Work's own product instructions are still delivered alongside the knowledge.
- **What stays.**
  - The companion's review follows the origin: it still covers a conversation raised from
    Chat and still skips one created on Code or Work.
  - `/code` and `/work` leave the scope alone, and an active anchor still matches after a
    raise.
- **Desktop.**
  - The chip shows the scope in all three products. Its menu lists wider levels only, and it is
    absent on direct lanes and parallel members.
  - The confirmation shows every item in FR-29.
  - After a raise the conversation opens at its new route, leaves the old Recents and appears in
    the new one. An old link redirects.
  - The copy is checked in zh-TW and en.
- **Providers.** The mid-conversation tool delivery is checked with Claude Code and with Codex.

## Open Questions

- [x] Q1: Should a Work conversation's agents get Work tools? Answered on 2026-11-11 (D10,
      D11): Task and Run are the foundation, not Work tools. Work's own tools are Work Items
      and Projects, and SPEC-142 specifies them.
- [x] Q2: Should SPEC-118's collaboration tools and orchestrator knowledge be offered in every
      conversation? Answered on 2026-11-11 (D8): yes, Code and Work conversations have them
      too (FR-19).
- [ ] Q3: Should the mobile app get a raise control in version one? S3 says no, and stands
      unless the owner objects.
- [x] Q4: Should the state version rise? Answered on 2026-11-11 (D9): yes (Compatibility).
- [x] Q5: Should a conversation's agents get Task and Run tools, and from which level?
      Answered on 2026-11-11 (D13): from `chat` up, read-only. SPEC-142 specifies them.

## References

- [ADR-149](../decisions/149-let-a-conversation-gain-product-scopes-and-never-lose-them.md),
  [ADR-069](../decisions/069-scope-recents-to-channel-origin-surface-by-default.md),
  [ADR-073](../decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md),
  [ADR-098](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md),
  [ADR-101](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md),
  [ADR-103](../decisions/103-use-preset-neutral-product-intent-intake.md),
  [ADR-105](../decisions/105-adopt-phase-scoped-work-tool-surface.md),
  [ADR-126](../decisions/126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md)
- [SPEC-101](SPEC-101-cats-code-artifact-canvas.md),
  [SPEC-118](SPEC-118-orchestrator-knowledge-and-collaboration-operations.md),
  [SPEC-123](SPEC-123-code-agent-artifact-preview.md),
  [SPEC-137](SPEC-137-companion-own-initiative-modes-and-back-off.md),
  [SPEC-139](SPEC-139-boss-cat-across-cats.md)
- Runtime SPEC-035, session MCP servers (SMCP-08), in the cats-runtime repository

---

*Created: 2026-11-11*
*Author: Claude; independent review by a separate agent on 2026-11-11*
*Related Plan: [PLAN-134](../plans/PLAN-134-conversation-product-scope.md)*
