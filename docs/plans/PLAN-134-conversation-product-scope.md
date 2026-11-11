# PLAN-134: Conversation Product Scope

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Done on `main` on 2026-11-12, apart from the checks that need a provider turn: Phase 4's candidate check and Phase 7's provider acceptance did not run (see each). The owner answered SPEC-141's Q1, Q2, Q4 and Q5 on 2026-11-11 (ADR-149 D8 to D13). The remaining proposals stand unless the owner objects |
| **Owner** | Product owner |
| **Assigned To** | Unassigned |
| **Reviewer** | Independent agent before each merge |

## Related Spec

[SPEC-141: Conversation Product Scope](../specs/SPEC-141-conversation-product-scope.md), under
[ADR-149](../decisions/149-let-a-conversation-gain-product-scopes-and-never-lose-them.md).

## Overview

Seven phases, one pull request each.

- Phases 1 and 2 add the field and move its readers. For a conversation that has an origin and
  is not a direct lane, they change no behavior, and tests prove that.
- Phase 3 opens the role tools to every level (D8). It does not need the field and can land
  on its own.
- Phase 4 gives Work Code's tools (D5).
- Phases 5 and 6 add the raise, first on the server and then in Desktop.
- Phase 7 updates the documents and runs the acceptance.

No version bump or publication is part of this plan. Phase 5 raises the state version (D9),
which is a persisted-data boundary: the release that ships Phase 5 starts a new minor line, and
that pull request records it.

## Implementation Phases

### Phase 1: The field

**Goal:** every conversation carries a scope, and nothing reads it yet (FR-1 to FR-7).

- [x] Add `productScope` to the conversation state, the summary and view types, the renderer
      mirrors and the mobile summary type. The create input types do not get the field.
  - The field is optional on the types, like `originSurface`. Chat's state code reads it
    through `resolveChannelProductScope`, which derives a value when the field is absent. The
    summary, the view and the projected metadata always carry one.
  - The two places where Desktop rebuilds a summary field by field copy it too.
- [x] Creation stamps it: the validated origin, or `chat` for a direct lane, for a single
      conversation and for each parallel member.
- [x] Loading derives it as FR-3 says when the stored value is missing or invalid, for a direct
      lane and for a no-origin conversation or group. A valid stored value is kept, so loading
      never raises a scope.
  - A parallel group stores no scope of its own (FR-5), and its members load by their own
    origin, not the group's. Listing a no-origin group's own entry under Chat is Phase 2's
    Recents change.
- [x] Add the one raise function to the Chat model. It refuses an equal or lower level, a
      direct lane and a parallel member.
  - It also refuses an archived conversation and a value that is not a scope. Each of these
    refusals has a stable code for Phase 5's routes. A conversation that does not exist throws
    from `requireChannel`, as in every model function, and the route maps that case.
  - A parallel member belongs to an active group, as SPEC-141 defines it. Recents lists the
    members of a group that is not active as ordinary conversations, so they can be raised,
    and so can a conversation whose group was dissolved or no longer lists it.
  - No route calls it yet.
- [x] Add the raise revision helper (FR-7). `collaborationExecutionRevision` is not touched.
  - The folder in the digest is `repoPath`. `chatCwd` is left out: a first session fills it
    in for a sandbox, which changes nothing the confirmation says.
- [x] Core metadata projected from a conversation gains `productScope` beside `originSurface`:
      Task, WorkItem, Run, Mission, Trace, Checkpoint, Outcome and Activity.
- [x] Tests for FR-1 to FR-7, with a load-and-save round trip that shows only the new field
      added.

**Deliverables:** the field is on the stored conversation, the summary, the view, the mobile
summary type and the eight kinds of projected Core record, and the state version is unchanged.
Two copies in the inventory do not carry it yet and move to Phase 2: the conversation
diagnostic report and Work's history listing. This phase changes the frozen contract
`src/products/chat/api/contracts.ts`, so it needs integration review.

**Result:** the contract change is additive: one optional field on the state and the summary
types, which the view inherits, mirrored in the shared and the mobile contracts. Nothing reads
the field, so S4's and S6's outcomes are stored and not yet visible: a no-origin conversation
and a direct lane created outside Chat are stored as `chat`, and Phase 2 is where Recents and
tool delivery start to follow that.

An independent review of this phase found no change in behavior. What it found for later
phases is recorded in Phase 2 (the read rule and two copies) and Phase 5 (stale whole-state
writes and the execution policy in the revision).

### Phase 2: Readers follow the scope

**Goal:** every reader in the inventory's "follows the scope" group reads the scope (FR-12 to
FR-15, and FR-8's checks still limited to `code`).

- [x] Put the read rule in `src/shared/productScope.ts`, where every reader can import it.
  - Readers in `products/shared`, `app/renderer`, `core` and mobile cannot import Chat's
    `resolveChannelProductScope`: `tests/dependency-graph.test.js` keeps the edges from
    `products/shared` into Chat exact, and `core` imports no product. They call
    `readProductScope`, and Chat's helper calls it too.
  - The rule reads a direct lane as `chat` whatever is stored, then a valid stored value as
    stored, else the derived one. The owner was told of the lane-first order on 2026-11-11 as
    a default that stands unless the owner objects.
    - Before, the lane check ran only when nothing valid was stored. A lane that carried a
      stored `code` would have received Code's tools once tools follow the scope.
    - No consistent state has such a lane. Creation makes a lane at `chat`, the raise refuses
      one, and `restoreRecoverableDirectLane` sets the kind only on a conversation that
      carries the recoverable-lane mark, which only a lane gets.
    - The stored value is left as it is, so nothing is lowered (D2), and the loader keeps a
      valid stored value as stored. SPEC-141's FR-3 and S6 say so now.
  - One rule serves every shape: a stored conversation and a view say they are a lane by
    `channelKind` or `roomRouting.mode`, a summary by `channelKind` or `roomMode`.
- [x] Recents: the shared filter, which Desktop and mobile use, and the sidebar view model. A
      parallel group is listed under its own origin, and under Chat when it has none.
- [x] Routes: the landing conversation, the redirect, the selection target, the owner-action
      source path and the Catlas conversation link. The routing hook's narrowed conversation
      type gains the scope.
- [x] Labels: the Catlas snapshot, and the Boss Cat board and join request, which SPEC-139
      added after the inventory was taken.
- [x] Work: the own-record check. Work's history listing copies the scope beside the origin.
  - The check reads the scope where it read the origin, and that decides for a Task that came
    from a conversation and is not bound to Work. In today's projection every conversation's
    Task is bound to Work through its WorkItem, and the WorkItem's graph object carries no
    conversation metadata, so Work already counts both as its own for every conversation.
    The move changes nothing that is visible, before or after a raise.
  - The copy in Core metadata is rewritten on every sync by a build that knows the field, so
    a reader of the copy sees the current scope. A build without the field keeps the copy on
    a Task and a WorkItem while it drops the conversation's field; the next sync by a build
    with the field corrects it.
- [x] The conversation diagnostic report shows the scope beside the origin.
- [x] Tools: the enricher's channel type, the enricher, the Code session verification and the
      Code work areas read the scope, still accepting `code` only. So does the Boss Cat join
      request's statement that joining brings Code's tools.
  - The two seams through which Code asks Chat about a conversation carry `scope` beside
    `origin`.
- [x] Tests: for fixtures of all three origins, every moved reader gives the same result as on
      the base commit. The differences are FR-3's no-origin conversations and FR-2's direct
      lanes created outside Chat.
  - The suites that already covered these readers pass with four edits.
    - The work-area fixture and its route test carry the seam's `scope`.
    - One landing assertion changes because a conversation with no recorded origin now
      belongs to Chat (S4).
    - The cross-surface routing fixture creates its conversations on Chat and rewrote only
      the origin to stand for a Code conversation. It sets the scope too. CI found this one;
      the local run had missed that suite.
  - New tests cover a conversation whose scope differs from its origin for every moved
    reader. A conversation with no recorded origin and a lane created outside Chat, as a lane
    and after it stops being one, are covered for Recents, the sidebar, the routes, the
    links, the Catlas label and the tool checks. The diagnostic report is checked only for a
    conversation whose scope equals its origin.
  - An independent review ran every moved reader against the base commit on the same stored
    conversations and found no difference for one whose scope equals its origin.

**Deliverables:** readers are on the scope, with no behavior change for a conversation whose
scope equals its origin. That is every conversation with a recorded origin, except a direct
lane created outside Chat and a conversation that once was one.

**Result:** three differences are now visible, all for stored data no current client produces.

- A conversation or a parallel group with no recorded origin is listed, routed and labelled as
  Chat's (S4).
- A direct lane created outside Chat is Chat's and no longer receives Code's tools (S6).
- An ordinary conversation that was such a lane stays at `chat`, as FR-3 says. Before, it was
  listed and routed under its origin's product and received Code's tools when that was Code.
  The owner cannot move it back until the raise exists.
  - One that stopped being a lane before a build with the field first loaded it loads at its
    origin instead, so two conversations with the same history can differ.

No conversation can have a scope above its origin until Phase 5 adds the raise.

### Phase 3: Role tools at every level

**Goal:** orchestrator knowledge and SPEC-118's collaboration tools are offered in Code and
Work conversations too (D8; FR-19).

- [x] `isOrchestratorKnowledgeChannel` stops reading the origin. It had no other term, so it
      is gone, and each of its four callers keeps its own conditions.
  - The knowledge on a visible turn and the decision request go to the conversation's
    coordinator. Neither had a lane condition: a Chat lane's Cat coordinates its lane and
    received both before, and still does. A lane created outside Chat now receives them like
    any other lane.
  - The collaboration descriptors and the snapshot keep refusing a direct lane, and keep
    requiring a Boss Cat coordinator. Nothing changes for a conversation created on Chat.
- [x] SPEC-118's execution checks stop requiring a Chat origin. They keep refusing a direct
      lane, an archived conversation and a source without a folder.
- [x] The proposal and snapshot shapes that hard-code a `chat` origin carry the real one, and
      `chat` when none was recorded. No validator read the literal, and a proposal's digest
      is taken over the stored proposal, so one prepared before this change stays valid.
- [x] Check that Code's and Work's own product instructions are still delivered, with
      orchestrator knowledge added to them. Code's enricher still adds its label and marker
      to a Code conversation only.
- [x] Tests for FR-19: Chat, Code, Work and no recorded origin, at the visible turn, the
      decision request, the tool descriptors, the snapshot and the execution source; the
      conditions that stay; and a created conversation still stamped `chat`.
  - Two existing expectations flipped, as D8 intends: a Code or Work coordinator now receives
    the knowledge, and a Boss Cat coordinator there is offered the read tools. The suites
    around these gates passed their 513 tests on unmodified `main` first, and the other 511
    passed unchanged.
  - The conversations the product really creates are covered: one started without naming
    anyone, on each product, and a session opened by Code's own operation.
  - Eighteen deliberate breaks of the built code each fail at least one test: an origin
    condition put back, a kept condition dropped, the card's wording, and the card rule
    below switched off or made too wide or too narrow.
  - Not tested: the lane and archived terms of the two execution checks. A conversation that
    became a lane or was archived after its proposal already fails the revision check that
    runs before them, so consistent state does not reach those terms.
- [x] An independent security review before merge. This phase ends a limit SPEC-118 set on
      purpose.
  - Result: no critical or high finding. No path creates a conversation, adds a participant,
    or queues or starts a run without the owner's confirmation of a persisted proposal. The
    three collaboration sessions are the same for every origin and receive none of Code's
    tools.
  - Fixed in the same pull request:
    - The owner's click on a collaboration card could be taken by one of Work's tool phases.
      The English answer reads "Execute this scope and budget?" and "Execute proposal", and
      those words match Work's execution-preparation cues when the conversation has an open
      Work Item. The collaboration tools were then withheld, and the click ran as an ordinary
      turn in the source folder instead of the bounded workflow it approved. Chat behaved the
      same before this phase; cards in Work conversations make the match likely. An answer
      addressed to a collaboration card now reaches no Work phase, whatever it selects.
    - The card called a reused Code or Work conversation "this Chat conversation", and three
      descriptions sent to the model still said Chat.
  - Recorded and not fixed here: SPEC-118, "Limits recorded with SPEC-141 FR-19". Two need
    changes of their own:
    - the one-shot decision session, which was created outside the conversation's posture and
      now received the owner's message on Code and Work. Fixed in its own pull request on
      2026-11-11: every decision session is a read-only sandbox and fails on native tool
      activity;
    - an accepted click that is not offered the execution tools still runs as an ordinary
      turn in the source folder. A `weak_worker` coordinator and a card found stale as it was
      published reach that with no setting changed. Chat behaved the same before.
  - A focused re-check of the fix confirmed it closes the Work-phase path on Chat, Code and
    Work, and found the two items above plus a narrow retry-from-Core path that drops the
    choice answer. None blocks this change. All start from a collaboration card, which
    appears only with the decision flag on.
- [x] Amend SPEC-118, `docs/tool-calls.md` and `docs/agent-control-surfaces.md` in the same
      pull request, since they state the limit.

**Deliverables:** the role tools no longer depend on where a conversation was created.

**Result at default settings.** The decision flag is off by default, so the collaboration
tools stay off everywhere. What changes without any setting is the knowledge.

- The coordinator of every Code and Work conversation now receives the orchestrator
  knowledge with each turn, added to its own instructions. So does the coordinator of a
  conversation stored with no origin, which the Chat-only rule had left out.
- That includes a conversation started without naming anyone. Its one participant is the
  remembered provider and model, and the first participant coordinates. A session opened by
  Code's own operation is the same shape. On Chat such a conversation received the knowledge
  already.
- What that agent receives, measured with the packaged English text:
  - With every turn, the role entry, which opens "You are the Cats Orchestrator (visible
    Boss Cat)", and the results procedure: about 3,300 characters of turn instructions for a
    plain question. The correctness review's run on the base commit found none.
  - A message with a word such as implement, review, fail, error or retry also selects the
    collaboration and recovery procedures: about 5,500 characters. The collaboration
    procedure is about proposing teammates, which this agent has no tool for.
  - By the correctness review's reading of Runtime, its Claude and Codex providers put a
    send's instructions inside the turn's user message, so they stay in the session history.
- A direct lane's Cat coordinates its lane, and a lane created on Chat received the knowledge
  already. A lane not created on Chat now does, and its decision request is bound to the
  Cat's own instance and model; for a companion's lane that request runs with the flag off.
  No current client creates a lane outside Chat (S6), so in practice this is a lane with no
  recorded origin.
- Local knowledge the owner adopted (`knowledge/contributions.json` under the platform
  directory) replaces entries of this knowledge, so it now reaches Code and Work
  coordinators too.

**Decided by the owner (2026-11-11).** The one agent of a Code or Work conversation is told
that it is the Cats Orchestrator, as it is on Chat: the knowledge goes to whoever coordinates,
and the role entry is not limited to a Boss Cat coordinator. Phase 7 still accepts it with a
real provider.

### Phase 4: Work includes Code

**Goal:** conversations on Work have Code's tools and can show them (D5; FR-8 to FR-11).

- [x] The enricher, the Code session verification and the Code work areas accept `work`. So
      does the Boss Cat join request's statement that joining brings Code's tools, with
      SPEC-139 FR-8's hint and the card's text.
  - One predicate, `productScopeIncludes` in `src/shared/productScope.ts`, decides it at all
    four places. A direct lane reads as `chat` and gets none of it.
  - Who gets the `cats` server: a conversation's own turns and session starts, the only
    callers of the invocation enrichment. Work's supervised runs, schedules and the golden
    path carry no marker, because they never pass through the enrichment, so the wrapper adds
    no server to them. FR-8 names conversations, so this is what it asks for.
    - It is the marker, not the client, that keeps them out. In production Work gets the
      shared runtime client, which the Code wrapper wraps (`src/index.ts`,
      `app/server/dependencies.ts`). A marker added to a Work run's context would bring the
      server with it.
- [x] Make Code's conversation parts usable from Work's route: the preview controls, the
      preview button, the work areas panel and the folder and permission chips.
  - They stay in `src/products/code/renderer/components/`. `tests/dependency-graph.test.js`
    allows four exact edges from Work's route file to them, as it does for other
    product-to-product seams. Moving them would have moved their Code hooks, API paths and a
    server type with them.
  - The folder chip and the permission chip were shared already. Work adds Code's branch and
    workspace chip beside the folder, and keeps its own view and preferences (FR-11): the
    work areas panel comes from `CodeConversationView` with `behaviorSurface="work"`.
  - Work's stylesheet imports Code's work areas styles.
- [x] Decide how the canvas finds its route (see Technical Decisions), then make
      `showInCanvas.ts`, `devPreview.ts`, `service.ts`, `conversationPreviews.ts` and
      `artifactMaterialization.ts` follow it.
  - The URL is built in `showInCanvas.ts`, `service.ts` and `artifactMaterialization.ts`;
    `devPreview.ts` and `conversationPreviews.ts` build none and needed no change.
  - [x] If a surface kind is added, also update the hand-written kind list. No kind was
        added.
- [x] Keep earlier canvas and preview state working (FR-9). The kind is unchanged, so stored
      artifacts, their preview source surfaces and running leases are read as before. A
      stored Activity's `targetUrl` is never read back.
- [x] Bind the grant of a session that gains the server to that session's folder (FR-25).
  - The wrapper reads the folder from Runtime (`workspace.runtimeCwd`, else `cwd`, the order
    Runtime uses itself). When Runtime cannot say, the grant has no folder and the tools that
    need one answer `workspace_unknown`.
  - The same path serves a Platform restart, which now also binds the session's folder
    instead of the conversation's.
  - When Runtime cannot say at first, the next send asks again, so one failed read does not
    leave the grant without a folder.
  - Two sends racing on a session that has no grant yet issue one grant, not two. The
    review of this phase ran the race: two grants, and closing the session revoked one, so
    the conversation's previews would not stop.
- [x] Keep the other servers on the session. Code's wrapper keeps the servers a call already
      carries and replaces only entries named like its own, on create, send and resume.
  - The image tools' server is also named `cats`. It is offered only in a companion's
    direct lane, whose scope is `chat`, so the two never meet.
- [x] Review copy and labels that say "Cats Code" for a conversation that now may live on Work
      (`policy.ts`, `service.ts`, the `product:code` label).
  - The model-facing descriptions, the preview policy and the "not available" message say
    Cats, not Cats Code.
  - The `product:code` label stays. It names Code's tools, nothing in Platform reads it, and
    renaming it could break a reader outside Platform.
  - The join hint and card no longer say the Code tools include a shell; a shell comes from
    the conversation's permission.
- [x] Found by this phase's review and fixed in its own pull request (2026-11-11): a dev
      preview ignored the conversation's execution policy. `shellPermission.ts` and the
      enricher read the access and permission mode alone, so a policy that turned off network
      or asked for every approval still let `start_dev_preview` run a package.json script in
      Platform's own process, on Code conversations before and on Work ones after D5. Now a
      policy decides: only an `explicit` one with `full-access`, network on and approval
      `never` allows a preview, and a `provider` one, which leaves approvals to the provider,
      does not. The legacy `skip` posture keeps the old rule; SPEC-123's Known Limits records
      what that leaves open.
- [ ] Tests, plus an isolated candidate check of a Work conversation that shows an artifact and
      a live preview.
  - [x] Tests: the scope predicate at the four places, the wrapper keeping other servers and
        binding a gaining session's folder, the registry composing and parsing Work's route,
        the route read from Core, an intent re-targeted by its frame, Work's route rendering
        the canvas pane, and `show_in_canvas` and `clear_canvas` returning Work's route for a
        Work conversation. Three existing expectations flipped as D5 intends: Code's tools
        for `code` only, Work's work areas refused, and Work's routes without a canvas.
  - [ ] The candidate check was not run. It needs a built Desktop on an isolated profile and
        a real agent turn that calls the tools, so it stays for Phase 7's acceptance, which
        could not run either (see there).

**Deliverables:** a conversation created on Work receives the `cats` server, and its canvas,
previews and work areas appear under `/work`.

### Phase 5: The raise on the server

**Goal:** an owner principal can read what a raise would do and perform it (FR-20 to FR-26).

- [x] `GET` and `POST /api/channels/:channelId/product-scope`, with the owner principal check,
      the refusals and their error codes, the mutation gate and the raise revision.
  - `src/products/chat/api/resources/productScopeRoutes.ts`. An owner principal is an account
    with the `owner` or `admin` role on Desktop's cookie (the auth gate enforces CSRF for a
    POST) or mobile's bearer; a request without one is refused.
  - This plan said it was the first conversation route that checks a role. It is not: the
    diagnostics route and the Boss Cat join card routes check one already, and no existing
    helper took exactly this rule.
  - One function, `productScopeRaiseRefusal`, decides the refusal for the read, the raise and
    the model function.
- [x] The system line, with event metadata that names the old and the new level
      (`product_scope_raised`, `fromScope`, `toScope`), and the update events
      (`message_added` and `updated`).
- [x] Raise the state version (D9) in this pull request, the first that can store a raised
      conversation. `CATS_CORE_STATE_VERSION` is 7.
  - A version 6 file upgrades once and keeps its original bytes in
    `chat-state.local.json.pre-product-scope.bak`; older files keep the version 6 path and its
    `.pre-provider-policy.bak`.
  - The review of this phase found two ways the backup could block or vanish, both fixed:
    - an owner who went back with the restore recipe and saved, or whose first upgrade failed
      and who kept using 0.15.x, could never upgrade again, because the backup name held other
      bytes. Such bytes are now kept beside it under a digest name;
    - recovering from a version 6 `.bak` kept no copy of those bytes, which `main` did. It does
      again, before the setup-completion repair rewrites that `.bak`.
  - Backups are written through a temporary file and a rename, so a crash never leaves a
    partial one, and a partial one left by anything else no longer blocks the upgrade.
  - Tests: an upgrade that adds nothing an ordinary load does not; an upgrade with the
    version 6 backup already present; a version 5 file going straight to 7; a failed upgrade
    and its retry; recovery from a version 6 `.bak` after the upgrade; a newer file refused.
  - Checked against a copy of main's build (version 6), not as a repository test: it refuses
    an upgraded profile on a normal read and with a damaged primary through `.bak`, and leaves
    both files as they were.
  - Checked on a temporary copy of the owner's real profile (primary, `.bak`,
    `.pre-provider-policy.bak`): the upgrade's file equals one ordinary save by the version 6
    build apart from the version and timestamps, and the backups were kept. The copies were
    deleted and the originals not touched.
  - **Persisted-data boundary.** Recorded in `docs/deployment.md`: the next authorized
    Platform/Desktop release that contains this is the next minor, `0.16.0`. A profile opened
    by it cannot be opened by 0.15.x; the restore recipe is there too. `src/core/types.ts` is
    a frozen shared contract, and this change to it is D9's.
- [x] Confirm how a turn whose session was lost is handled today (read, not run). A
      `stale_session` error retries a resume of the same session; `provider_session_unavailable`
      rotates to a replacement session in the same folder, with continuity carried in the next
      turn (`runtime-dispatch/recovery.ts`, `runtime-dispatch/wake.ts`). Neither touches the
      scope, and a replacement starts through the ordinary session start, so it gets the raised
      scope's tools.
- [x] Stop a stale whole-state write from lowering a raised scope.
  - The store keeps a wider stored scope over the incoming copy on every write, in the file and
    the memory store (`keepRaisedProductScopes`), with a `product_scope_kept` diagnostic. No
    caller had to change.
  - That also covers a writer this plan did not list, and the widest window: a continuation
    replay (`resumeStoredWorkflowContinuationDispatch`) writes its own whole copy back through
    `chatStore.write` throughout a turn, outside any gate. So does the participant-add path's
    continuation recovery, for every other conversation.
  - `shellRoutes.ts`'s selection writer, which this plan listed, is not reached by any route.
  - A sync re-projects the Core task's scope copy from the chat, so `writeSnapshot` cannot leave
    a stale copy there either.
  - Test: the forced interleaving through both stores' `write` and `writeSnapshot`, a stale
    copy's other changes still landing, and a running turn's merge.
- [x] A raised conversation cannot become a direct lane in consistent state (Phase 2's read rule
      reads any direct lane as `chat` anyway).
- [x] Make the Boss Cat join card's binding and SPEC-118's proposal card's cover the scope.
  - Not through `collaborationExecutionRevision`: a running collaboration checks that revision
    as it goes, so a raise would stop it.
  - The join card's digest adds the scope when it differs from the origin. A card posted before
    this, which is at its origin's level, stays valid; checked against main's build.
  - A proposal records the scope it was prepared at, and the owner's confirmation is refused as
    `stale_context` when it has changed. A proposal stored without it reads as its origin's
    level. The card names that scope's product.
  - This reverses what SPEC-141 said of a prepared collaboration; FR-7 and the acceptance line
    now say an admitted one, queued or running, is unaffected, and a proposal not yet confirmed
    is stale.
- [x] Add the execution policy to the raise revision, its values in a fixed order. FR-7's list
      now names it, with the archived state and the workspace kind.
- [x] Expect a raise to make a pending owner-action, history or schedule preview stale when its
      token hashes the conversation's projected Task or WorkItem. Not tested.
- [x] Tests that a session created without the `cats` server gains it on its next send (the
      enricher's marker after the raise; the wrapper's first-send grant is Phase 4's), that a
      running turn keeps the raise (the merge), and that a failed recycle leaves the scope
      raised (no recovery path writes it, and the store keeps it).
- [x] Tests that an admitted SPEC-118 collaboration carries on after a raise, and that a
      confirmation after one is stale.
- [x] Tests that nothing but the route raises a scope: `raiseChannelProductScope` has one
      production caller, the route.
- [x] Document both routes in `docs/api.md`.

**Deliverables:** the raise works through the API and nowhere else.

### Phase 6: The raise in Desktop

**Goal:** the owner raises a conversation from its chip (FR-27 to FR-32).

- [x] The scope chip on existing conversations in Chat, Code and Work, with the menu of wider
      levels and no menu on direct lanes and parallel members.
  - The shared conversation view renders it for every product (`ConversationScopeChip`), so
    Chat's conversations and its direct lanes show it too. The products no longer pass their
    own fixed chip.
  - The menu lists the wider levels from the conversation as the app shell shows it. A direct
    lane, a parallel member, an archived conversation and a Work conversation get a chip with
    no menu. The server rechecks all of it.
  - It is never dismissable on an existing conversation. A draft's chip is unchanged.
- [x] The confirmation, built from the read route's answer.
  - Choosing a level reads `GET /api/channels/:id/product-scope`. A refusal there, or a level
    that is no longer wider, shows its reason instead of a confirmation.
  - The confirmation lists what the level adds (by the transition: from Chat, Code's tools,
    the preview switch's state and Code's conversation parts; from Code, that these stay), that
    no Work tool is added yet for Work, the participants and that later ones join too, the
    folder or sandbox and the CLI permission as unchanged, the move to the product's Recents,
    view and preferences, and that it cannot be undone. Cancel has the focus.
  - It is rendered into the page body: the composer sits in a size container, which would
    hold a fixed overlay inside it.
- [x] After a raise: open the conversation at its new route and show the toast. On failure:
      show the reason and stay.
  - The existing origin redirect moves the conversation once the app shell shows the new
    scope. The raise's response and its update event can reach the app in either order, so
    the toast is recorded before the request and handed to whichever redirect comes, through
    the cross-surface handoff. The new product's app shows it once.
  - An owner who has left the conversation by then gets the toast where they are and stays
    there.
  - Each refusal code has its own reason; anything else reads as a generic failure. One raise
    at a time, locked in the handler.
- [x] Copy in zh-TW and en.
- [x] Renderer tests, plus an isolated candidate walk with screenshots at the Desktop minimum
      window width.
  - `tests/product-scope-raise-renderer.test.tsx`: the menu's levels, the confirmation for
    each transition in both languages, the refusal reasons, the chip never dismissable and a
    draft's still dismissable, the read and the raise with its revision, refusals with no
    confirmation, the chip disabled during a raise, the toast handed over in both orders, an
    owner who left, a refused raise and the lock.
  - The source candidate (`npm run desktop:candidate`, isolated profile, a synthetic owner
    account, no provider set up, so no model was called): the owner's Desktop session reads
    the route; a Chat conversation raised to Code moved to `/code/chats/…` and Code's Recents
    with the toast, then to Work the same way, where its chip has no menu. At the minimum
    window (960 px, sidebar open) the chip, its menu and the confirmation fit, and Escape
    closes the confirmation and leaves the conversation where it was.

**Deliverables:** the complete raise flow in Desktop.

### Phase 7: Documents and acceptance

- [x] Amend ADR-069, ADR-073, ADR-126 and SPEC-123 as SPEC-141's metadata lists. ADR-098 and
      SPEC-101 too, if a canvas surface kind was added.
  - As built (2026-11-12): dated amendments, ADR-126 and SPEC-123 once for both plans; no
    surface kind was added, so ADR-098 and SPEC-101 are unchanged. SPEC-118 and
    `docs/agent-control-surfaces.md` (amended in Phase 3) got residue fixes only.
- [x] If S1 stands, reword SPEC-137 FR-7 from "Chat conversation" to "created on Chat".
  - As built: SPEC-141 records S1 as a default put to the owner and no objection; FR-7 now
    says created on Chat or with no recorded origin, as `review.ts` reads it.
- [x] Amend SPEC-139 FR-3, FR-6, FR-8 and FR-10 to say "scope" where they say a conversation's
      surface.
  - As built: all four read the scope, and FR-10's binding lists it; the hint and the card
    still name Code's tools only, and the notes say so.
  - PLAN-133's join slice landed before this plan's Phase 2. Phase 2 moved the board's and
    the join request's product label, and the statement about Code's tools, to the scope.
  - Phase 4 updates the hint and the card's text for Work, and Phase 5 makes the card's
    binding cover the scope.
- [x] Terminology: mark the product scope row as implemented, and correct the entry-preset rows
      that describe records the code does not create.
  - As built: the row says implemented, not yet released; New Chat, New Code and New Work state
    the projected Task and WorkItem and no Project. Team Code and Peer Code are unchanged.
- [x] `docs/tool-calls.md`: who receives the `cats` tools.
  - As built: the server goes to every conversation and lists tools by scope; `find_projects`
    names its owner-turn refusal.
- [x] Check that the persisted-data boundary recorded in Phase 5 reached the release notes. No
      bump here.
  - Checked 2026-11-12: not in `docs/release-notes.md` yet (no unreleased section);
    `docs/deployment.md` records it for 0.16.0, with the product scope and, since
    PLAN-135 Phase 5, a Work conversation's Project.
- [ ] Provider acceptance: the mid-conversation tool delivery with Claude Code and with Codex.
  - Not run on 2026-11-12. In an isolated candidate (`npm run desktop:candidate`, synthetic
    owner), Codex refused before any model turn because its native Windows sandbox is not set
    up on this machine, and Claude Code reported that it is not logged in inside the isolated
    home. Setting up either would change the owner's own configuration. What was confirmed
    without a model: both sessions carried the `cats` grant marker at level `work`, with the
    participant and the proposal gate open on the owner's turn.
- [ ] Provider acceptance: a Code session with one agent still does its coding task. Since
      Phase 3 that agent is told it is the Cats Orchestrator with every turn, and a coding
      request brings the collaboration and recovery procedures. No model was run against it.
  - Not run on 2026-11-12, for the same reasons as the item above. The instructions this
    agent receives are covered by the orchestrator tests; whether a model still codes with them
    is not checked.
- [x] Update ADR-149's status.
  - As built: implemented on `main`, not yet released, with the acceptance that did not run.

## Not in This Plan

- The read tools for Tasks and Runs, Work's own tools for Work Items and Projects, and a
  conversation's Project (ADR-149 D10 to D13). SPEC-142 and PLAN-135 cover them.
- A raise control in the mobile app (SPEC-141 Q3).
- A raise proposed by an agent.
- Raising direct lanes or parallel groups.
- Work's supervised runs.

## Reader Inventory

From a sweep of Platform `36d4bb458` on 2026-11-11: 145 mentions of `originSurface` in 54
source files, tests excluded. Paths are under `src/`. Re-swept on `c37152b45` before Phase 2:
157 mentions in 59 files. The additions are SPEC-139's Boss Cat readers and Chat's own landing
helper, listed below; line numbers are from the sweep that found each entry.

### Follows the scope

- **Tools.**
  - `platform/runtime/invocationEnrichment.ts:13`, the channel type every enricher receives.
  - `products/code/agentTools/enricher.ts:34`, and the wrapper through its marker.
  - `products/code/state/codeSessionOperation.ts:120` and `products/code/state/workAreas.ts:58`.
    They read `origin` as exposed by `products/chat/state/conversationSessionDelegate.ts:41` and
    `products/chat/state/conversationExecutionInspection.ts:95`, which must expose the scope
    too.
- **Recents.**
  - `products/shared/recentsFilter.ts:48`, used by Desktop and by `mobile/chat.ts:76`.
  - `app/renderer/productShell/conversationSidebarViewModel.ts:92-102`, for conversations.
- **Routes.**
  - `products/shared/channelPaths.ts:125`, with the Chat, Code and Work wrappers.
  - `products/shared/renderer/crossSurfaceConversationNavigation.ts:16-26`, called from
    `hooks/useWorkspaceAppShellRouting.ts:276`.
  - `products/shared/renderer/hooks/useWorkspaceAppNavigationActions.ts:349`.
  - `core/ownerActions.ts:48`, which reads the Core metadata copy.
  - `products/chat/api/guideCatAssist.ts:113`.
- **Labels.** `products/chat/api/catlasSnapshot.ts:87`, `products/chat/state/bossCatBoard.ts:299`
  and `products/chat/state/bossCatJoinRequests.ts:78`, `:347`.
- **Work.** `products/work/api/ownerGraphProjection.ts:12`.

Phase 2 moved every entry above. Two more were found in the re-sweep and moved with them:
`products/chat/shared/channelPaths.ts:92`, Chat's landing conversation, and
`products/chat/state/bossCatJoinRequests.ts:358`, whether joining brings Code's tools.

Four links hard-code a product prefix and rely on the redirect:
`products/code/renderer/components/WorkspaceDetailPage.tsx:325`,
`products/code/state/codeSessionOperation.ts:45`,
`products/code/renderer/components/ArtifactDetailView.tsx:32` and
`products/work/api/ownerGraphProjection.ts:28-31`, which builds `/chat/chats/:id` for every
projected conversation because its Core kind is never `code_thread` or `work_thread`. They keep
working (FR-13).

### Stops reading the origin (D8)

These gates open to every conversation that is not a direct lane.

- `products/chat/state/orchestratorKnowledge.ts:22`. Through it:
  - orchestrator knowledge at `runtime-dispatch/execution.ts:208`;
  - decisions at `providerAgentDecisionRequester.ts:50`;
  - the collaboration descriptors at `runtime-dispatch/turn.ts:925`;
  - snapshot eligibility at `orchestratorCollaboration.ts:153`.
- `products/chat/state/collaborationExecution.ts:87`, `:146`.
- `products/chat/state/orchestratorCollaboration.ts:94`, `:141`, `:177`, `:303`, which write a
  literal `chat` origin into proposals and snapshots.

### Stays with the origin

- **Creation and validation.**
  - `products/chat/state/model/index.ts:143-156`, `:202-278`, `:400`, `:504`.
  - `products/chat/api/routeSupport.ts:500-527`, `resources/channelRoutes.ts:367`,
    `resources/parallelChatGroupCrudRoutes.ts:37`.
  - `products/chat/state/conversationSessionDelegate.ts:28`, `collaborationExecution.ts:214`,
    `telegramBridgeAdapter.ts:84`.
  - The renderer's draft and submit path: `products/shared/renderer/WorkspaceProductApp.tsx:1381`,
    `hooks/useWorkspaceComposerSubmit.ts`, `composerDispatch.ts`, `composerParallelDispatch.ts`
    and `workspaceChatUtils.tsx:267-326`.
- **Parallel groups.** `conversationSidebarViewModel.ts:120-121` and
  `conversationSidebarRecentEntries.tsx:57`, `:90`. A group with no origin is treated as `chat`
  (FR-3).
- **Copies, which keep the origin and add the scope.**
  - Done in Phase 1:
    - `products/chat/state/model/readModels.ts:284`, the conversation summary. The group
      summary at `:388` keeps only its origin, since a group has no scope (FR-5).
    - `products/chat/state/core-projection/entities.ts:572`, `:624` and `workflow.ts:207-479`.
    - `products/shared/renderer/workspaceChatUtils.tsx:525` and `activeEntityMerge.ts:183`.
  - Done in Phase 2:
    - `products/shared/renderer/hooks/useWorkspaceAppShellRouting.ts:36`, a narrowed type that
      the routes read.
    - `products/chat/api/resources/diagnosticRoutes.ts:66`.
    - `products/work/state/historyListing.ts:12-60`. The `originSurface` filter of
      `GET /api/work/history` at `:64` still selects by origin, as its name says.
- **Catlas titling.** `products/chat/api/catlasTitles.ts:21`, `:60`.
- **Posture.** `products/chat/state/runtime-dispatch/routing.ts:1149-1150`.
- **Knowledge scope copy.** `products/chat/state/orchestratorKnowledge.ts:62`.
- **The revision digest.** `products/chat/state/collaborationExecutionSurface.ts:28`. It is
  left as it is (FR-7).

### Stays with the origin by S1

The owner has not seen this one.

- `products/chat/companion/life/review.ts:47`, the companion's life review.

### Not this field

- The scheduler's `MissionTemplate.originSurface: 'schedule'` in `platform/scheduler/` and
  Work's schedule editor, and `executionSource` in `products/work/state/historyManagement.ts:26`.
- `ProductPresetIntentOriginSurface`, the ingress device, in
  `products/chat/shared/productPresetIntentContext.ts` and `routing.ts:1267`.

### Core conversation kind

No reader of `code_thread` or `work_thread` changes. A projected conversation's kind is always
`chat_channel` or `direct_message`, so those readers never see a conversation's origin or
scope.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/api/contracts.ts`, `src/products/shared/api/workspaceContracts.ts`, `src/mobile/contracts.ts` | Modify | `productScope` on the state, summary and view types |
| `src/shared/productScope.ts` | Create | The order, the comparison and the derivation |
| `src/products/chat/state/model/productScope.ts` | Create | The raise function and the raise revision, which need Chat state and a hash |
| `src/products/chat/shared/channelTopology.ts` | Modify | `resolveChannelProductScope`, how Chat's state code reads a conversation's scope; Phase 2 moves the rule to `src/shared/` |
| `src/core/types.ts`, `src/products/chat/state/store.ts`, `chat-snapshot/index.ts` | Modify | The state version and its upgrade (D9), in Phase 5 |
| `src/products/chat/state/model/index.ts`, `chat-snapshot/entities.ts`, `model/readModels.ts` | Modify | Stamp, derive, raise and summarize |
| `src/products/chat/state/core-projection/entities.ts`, `workflow.ts` | Modify | The metadata copy |
| `src/products/shared/renderer/workspaceChatUtils.tsx`, `activeEntityMerge.ts` | Modify | The scope in Desktop's two summary copies |
| `src/platform/runtime/invocationEnrichment.ts` | Modify | The scope on the enricher's channel type |
| The "follows the scope" files in the inventory | Modify | Read the scope |
| `src/products/chat/state/orchestratorKnowledge.ts`, `collaborationExecution.ts`, `orchestratorCollaboration.ts` | Modify | The role tools at every level (D8) |
| `src/products/code/agentTools/*`, `src/products/code/livePreview/*`, `src/products/shared/artifactCanvas/*` | Modify | The canvas route by scope, earlier state, and the grant's folder |
| `src/products/code/renderer/components/*` to `src/products/shared/renderer/` | Move | Code's conversation parts, so Work may mount them |
| `src/products/work/renderer/AppRoutes.tsx`, `src/products/shared/renderer/WorkspaceAppRoutes.tsx` | Modify | Work's conversation parts |
| `src/products/chat/api/resources/channelRoutes.ts`, `routeSupport.ts` | Modify | The two raise routes |
| `src/products/shared/renderer/components/ComposerSurfaceChip.tsx`, `conversation-view/ConversationView.tsx` | Modify | The scope chip and its menu |
| `src/products/shared/renderer/components/ProductScopeRaiseDialog.tsx` | Create | The confirmation |
| `src/shared/i18n/catalogs/en.ts`, `zh-TW.ts`, `messageKeys.ts` | Modify | Copy |
| `tests/` | Create | Field, upgrade, reader equality, D8, D5, raise and renderer tests |
| `docs/api.md` and the documents in Phases 3 and 7 | Modify | Contracts and amendments |

No file under `src/app/server/` needs to change: Work conversations already use the shared
Runtime client that carries the Code tools wrapper.

## Technical Decisions

- **One ordered value.** The owner chose the ladder (ADR-149 D5), so the field is one level and
  "only up" is one comparison.
- **Derive the scope on load.** Loading already completes missing fields, so the scope needs no
  separate migration.
- **Raise the state version with the raise, not with the field.** Until a conversation can be
  raised, a dropped field derives again to the same value, so Phases 1 to 4 stay inside the
  current data format. The version rises in Phase 5 so that an older build refuses the file
  instead of lowering a raised conversation (D9).
  - One corner exists before Phase 5: a direct lane created outside Chat that later became an
    ordinary conversation. If an older build wrote the file, it would load at its origin's
    level. No client is known to create such a lane.
  - The version 6 upgrade cannot be reused as it is (see Phase 5).
- **The canvas route, decided in Phase 4: keep `code_conversation` and resolve its route from
  the conversation's scope.** A canvas surface kind fixed its route, so `code_conversation`
  always opened under `/code`. Two ways forward were open:
  - add a kind for Work conversations, which needs every kind list updated and a rule for
    state recorded under the old kind;
  - keep `code_conversation` and resolve its route from the conversation's scope, which keeps
    earlier state valid.

  The second was chosen for FR-9. Artifacts store the kind as their preview source surface and
  leases compare it, so a new kind would have had to migrate them, and a Phase 5 raise from
  `code` to `work` would have had to migrate them again. With the kind kept, a raise changes
  only where the next URL points.
  - The registry composes a `code_conversation` URL under `/code/chats` or `/work/chats` from
    a route option, and parses both back to the same surface.
  - The server reads the option from the scope copy on the conversation's Core task.
  - A frame opens an intent for its own surface under its own route, so an intent made before
    a conversation moved still opens beside it.
  - A `/code/chats/<id>/canvas/<artifact>` link for a Work conversation is redirected to
    Work's route with the canvas path kept (FR-13), and Work now renders it.
- **The raise has its own revision.** `collaborationExecutionRevision` also digests every Cat's
  settings and is checked by running collaborations, so reusing it would refuse raises for
  unrelated changes and would stop a collaboration on a raise.
- **No session restart from Platform.** The next send carries the new server set and Runtime
  recycles the worker (Runtime SPEC-035, SMCP-08).

## Testing Strategy

- **Unit tests**: the scope helper, creation, loading, the upgrade, the raise function and its
  refusals, the raise revision, each moved reader and each opened gate.
- **Integration tests**: the two routes with and without an owner principal, the reader
  equality fixtures, tool delivery by scope, the grant's folder, and the mid-conversation
  delivery through the wrapper.
- **Manual testing**: isolated candidates for Phase 4 and Phase 6, and the provider acceptance
  in Phase 7. The State Hygiene Policy applies: no test records in the owner's profile.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| D5 changes every conversation created on Work | Medium | Its own phase and pull request, with a candidate check before merge |
| D8 brings SPEC-118's tools to Code and Work conversations, which run in a folder | Medium | SPEC-118's other conditions stay; an independent security review in Phase 3 |
| A build older than the upgrade cannot open the profile | Medium | Intended (D9). The upgrade keeps a backup of the original bytes, and the release notes record the boundary |
| The first turn after a raise, or after D5 ships, fails because Runtime cannot recycle the worker | Medium | Handled as a lost session is today; a test in Phase 5 and the provider acceptance in Phase 7 |
| A session that gains the tools mid-conversation gets a grant for the wrong folder | Medium | Bind the grant to the session's folder (FR-25), with worktree and sandbox tests |
| Mid-conversation tool delivery differs by provider | Medium | Acceptance with Claude Code and Codex; adapters without session MCP keep reporting `unsupported` |
| A raised conversation seems to disappear from its old Recents | Low | Desktop opens it at its new route, shows a toast, and old links redirect |
| Two frozen shared contracts change | Medium | Integration review in Phase 1 and in Phase 5 |
| Phase 3 edits decision-path files that PLAN-133 is changing now | Medium | Rebase on PLAN-133's latest slice before starting, and keep the change to the three gates |
| A no-origin conversation becomes visible in Chat's Recents | Low | Stated as S4 for the owner; covered by a test |
| A direct lane created outside Chat loses Code's tools | Low | Stated as S6 for the owner; covered by a test |
| PLAN-133 builds SPEC-139's join card while this plan changes what joining a Work conversation grants | Medium | Whichever lands second updates the join hint, the card's text and its binding (Phase 7) |

---

*Created: 2026-11-11*
*Author: Claude; independent review by a separate agent on 2026-11-11*
*Related Spec: [SPEC-141](../specs/SPEC-141-conversation-product-scope.md)*
