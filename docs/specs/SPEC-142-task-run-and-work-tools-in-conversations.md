# SPEC-142: Task, Run and Work Tools in Conversations

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft, 2026-11-11, revised the same day after an independent review. The owner's decisions D11 to D13 are fixed by ADR-149. On 2026-11-12 the owner answered Q3 to Q5 as recommended (see Owner Answers) and asked for the plan to be carried out in full; S1 to S7 proceed as this SPEC's proposals under that instruction. Q1 and Q2 stay open. Not implemented |
| **Owner** | Product owner |
| **Reviewer** | Owner; an independent review before implementation |
| **Decision** | [ADR-149](../decisions/149-let-a-conversation-gain-product-scopes-and-never-lose-them.md) D10 to D13, on top of [ADR-105](../decisions/105-adopt-phase-scoped-work-tool-surface.md) and [ADR-126](../decisions/126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md) |
| **Depends on** | [SPEC-141](SPEC-141-conversation-product-scope.md): the levels `chat`, `code` and `work` |
| **Updates when implemented** | SPEC-141 FR-8, FR-25, FR-29 and its Test Plan (who receives the `cats` server, how a raise reaches a live session, and what the raise confirmation lists for Work), ADR-126 and SPEC-123 (the same), ADR-105, SPEC-109 and `docs/tool-calls.md` (a second channel for Work's tools, without capability profiles for proposal-only tools), SPEC-126 (a conversation's Project and a Project's blockers), and the terminology |
| **Plan** | [PLAN-135](../plans/PLAN-135-task-run-and-work-tools-in-conversations.md) |

## Summary

Agents in a conversation get tools for the records around it, by the conversation's level:

- **Every level.** An agent can read its own conversation's Tasks and Runs (D13).
- **Work.** An agent can read Work Items and Projects, and propose changes to them, including
  a Project's folder (D11, D12).
- **Work.** A conversation can belong to a Project (D12).

Everything arrives through the `cats` session server that Code's tools already use. A read
answers at once. A write is only a proposal: the owner confirms it on a card in the
conversation, and then the server writes (S1).

## Goals

- An agent can see what its conversation's Tasks and Runs are doing without the owner pasting
  it in.
- In a Work conversation, an agent can help the owner organize Work Items and Projects, and the
  conversation itself can sit in a Project.
- Nothing is written to Work through these tools without the owner confirming exactly what
  will be written.
- One server and one grant per session, with the tools listed by level.

## Non-Goals

- Creating a Task or starting a Run from a tool. D13 keeps both with the confirmations that
  exist today: SPEC-118's role runs, ADR-105's execution preparation and Work's own pages.
- The external tracker tools. They stay on ADR-105's path.
- Changing ADR-105's decision path, SPEC-118 or SPEC-139, except for a new Project with a
  folder, which goes through a card (A1).
- Tools for Work's supervised runs, golden-path runs or schedules. Their sessions get no Cats
  tool today, and this SPEC leaves that.
- A general create, read, update and delete API over Work's records. ADR-105 rejected it.
- A new "workspace" record. The owner's "workspace" meant the Work Item.

## Definitions

- **Level**: a conversation's product scope, `chat`, `code` or `work` (SPEC-141).
- **Own records** of a conversation, all found by its conversation id:
  - its Tasks: the Task projected from it, and the Tasks whose conversation it is;
  - its Runs: the Runs whose conversation it is, and the Runs of its Tasks;
  - its Work Items: the Work Item projected from it, and the Work Items whose conversation it
    is;
  - its Project: the Project it belongs to (FR-22).
- **Projected Work Item**: the one Work Item that the projection rebuilds from the
  conversation on every sync. Its title, summary and status come from the conversation, so a
  tool can read it but cannot change it.
- **Captured Work Item**: any other Work Item whose conversation it is.
- **Turn Run**: the Run that the projection writes for each chat turn, on the projected Task.
- **Proposal**: a write an agent asks for. It changes nothing until the owner confirms it.
- **Admin coordinator**: the conversation's coordinator when it is an admin Cat (SPEC-125
  FR-17).
- **Owner principal**: as in SPEC-141.

## Inspected Baseline

Read from Platform `7ec13d700` and Runtime `fb50e59a` on 2026-11-11, and rechecked on Platform
`018097ca5`.

- **No Work tool reaches a session.**
  - ADR-105's tools run only on the provider-agent decision path, behind a flag that is off by
    default (`src/config.ts:305`); intake needs a second switch as well. The model returns one
    decision from an isolated session, a sidecar runs it, and the result goes to the owner,
    not back to the model.
  - That path offers them to Boss Cats and strong Cats only
    (`src/products/work/shared/workToolSurface.ts:77`), and it does not check where the
    conversation was created.
  - Their writes pass an owner choice or a re-check of the owner's own wording. On that path
    `work.project.create` takes a folder from the model's arguments
    (`src/products/chat/state/runtime-dispatch/routing.ts:2566`).
  - ADR-105 expected this surface to be "projected through runtime tool catalogs or an MCP
    facade" later.
- **No tool reads a Task or a Run for a session.** Code's `cats` server has a fixed list of
  canvas and preview tools (`src/products/code/agentTools/service.ts:101`).
- **The `cats` server.**
  - Platform hosts it and attaches it today only to conversations created on Code.
  - A call is refused unless the tool is in the list for that grant
    (`src/platform/mcp/jsonRpcServer.ts:159`), so one server can list different tools per
    conversation.
  - Its `instructions` are one fixed string, Code's preview policy
    (`src/platform/mcp/jsonRpcServer.ts:144`, `src/products/code/agentTools/service.ts:100`).
  - A grant and the enricher's marker name the conversation but no participant
    (`src/products/code/agentTools/runtimeClientWrapper.ts:99`).
  - The image tools serve a second server that is also named `cats`, in companion direct
    lanes (`src/platform/multimedia/catImageTools.ts:50`). Runtime refuses two servers with one
    name.
  - Code's wrapper replaces a session's server list with its own on create, send and resume
    (`src/products/code/agentTools/runtimeClientWrapper.ts:129`, `:168`, `:184`). By the code
    as read, this drops the desktop control server that an outer wrapper added.
- **Session tools are pre-approved by default.** The provider asks the owner only when the
  conversation has an explicit interactive policy, and conversations have none by default.
- **How Runtime notices a change.** It recycles a worker when the fingerprint of its server set
  changes. The fingerprint covers each server's name, URL and token (Runtime
  `src/core/sessionMcpServers.ts:157`).
- **The projection.**
  - The projected Work Item has `projectId: null`, takes its title and summary from the
    conversation, and is `in_progress` while the conversation is active
    (`src/products/chat/state/core-projection/entities.ts:1034`, `:1041`, `:115`).
  - Every chat turn is a Run on the projected Task
    (`src/products/chat/state/core-projection/workflow.ts:196`), and a finished turn can stay
    `blocked`.
  - SPEC-118's role Tasks sit under the source conversation's Task but carry the collaboration
    conversation's id (`src/products/work/state/collaborationRecords.ts:168`). A role Run's
    summary is the start of that role's reply.
- **A conversation cannot belong to a Project.**
  - The owner's routes refuse to edit a Work Item that comes from a conversation
    (`src/core/ownerActions.ts:25`, `src/products/work/state/ownerRelationships.ts:31`).
  - They also refuse to move a Work Item that is `in_progress`, and they keep a parent and its
    children in one Project (`ownerRelationships.ts:32`, `:55`).
  - Work reports a Work Item without a Project as unanchored
    (`src/products/work/api/ownerGraphProjection.ts:45`).
- **Work's delegates.**
  - Capture always writes a Work Item with no Project and no parent
    (`src/products/work/state/workIntakeDelegate.ts:100`, `:103`).
  - Update and assign accept a Work Item only in a planning status.
  - Nothing changes the folder of an existing Project: the create route writes it only for a
    new one (`src/products/work/api/productCrudRoutes.ts:205`), and Work's dialog does not
    send it.
- **A Project's folder.** A supervised run starts in the folder of its Work Item's Project
  (`src/products/work/api/index.ts:1381`), or in a sandbox when the Project has none, with
  `read_write` and `skip`.
- **Owner choices today.** The owner's answer to a choice is a user message whose text holds
  the question and the chosen options (`src/products/chat/shared/messageChoices.ts:218`). It
  enters later prompts, it can be mirrored to a transport, and the message route checks no
  role. SPEC-139's bound card is not built yet.

## Requirements

### Functional Requirements

#### Delivery

1. FR-1: The `cats` session server goes to every conversation, direct lanes included (A3). It
   lists tools by the conversation's level:
   - every level: the base tools (FR-6 to FR-9). A direct lane, whose level is always `chat`,
     lists these and nothing else;
   - `code` and `work`: Code's tools, as SPEC-141 FR-8 says;
   - `work`: the Work tools (FR-10 to FR-14).
2. FR-2: The server reads the level when it lists tools and again when a tool is called. A
   call to a tool outside the level is refused.
3. FR-3: After a raise, the session's next send carries a new grant. The changed token makes
   Runtime recycle the worker, so the agent lists its tools again on that turn.
   - The old grant stays valid until the worker that holds it is recycled, so a turn that is
     running keeps its tools.
   - Without this, a raise would no longer reach a live session, because the server is already
     attached at `chat`.
4. FR-4: Attaching the `cats` server keeps every other server on the session, such as the
   desktop control server, on create, send and resume.
5. FR-5: The server's `instructions`, and the policy that joins a turn's instructions, name
   only the tools listed for that grant. The turn policy is added only once Runtime reports
   the server as delivered (ADR-126 point 5). A session whose provider cannot take session
   servers gets no tool and no policy.

#### Base tools: Tasks and Runs (D13)

6. FR-6: An agent can read its conversation's Tasks: id, title, status, approval state, parent
   and summary.
7. FR-7: An agent can list its conversation's Runs, newest first: id, title, status, Task,
   start and end times, and summary. Turn Runs are left out unless the agent asks for them.
8. FR-8: An agent can read one of its conversation's Runs with its Outcome and its latest
   Checkpoint.
9. FR-9: The base tools read only the conversation's own records.
   - A record whose conversation is another one is refused, even when it hangs under one of
     this conversation's Tasks.
   - They return no transcript. A Run's summary and Outcome may hold what its agent reported.
   - Counts and text lengths are bounded, and text is fenced as data.
   - They write nothing and need no card.

#### Work tools: reading (D11, D12)

10. FR-10: At `work`, an agent can read its conversation's Work Items and its Project: id,
    title, status, priority, Project, Task, folder and summary.
11. FR-11: At `work`, an admin coordinator can find the owner's Projects by name: id, title,
    status, folder and summary, bounded like FR-9. S3 would open this to every participant.

#### Work tools: proposing (D11, D12)

12. FR-12: At `work`, any participant can propose, within the conversation's own records:
    - new Work Items drawn from the conversation, which join its Project when it has one;
    - a change to one of its captured Work Items: title, summary, priority, kind, or a
      planning status;
    - putting one of its captured Work Items into the conversation's Project.
13. FR-13: At `work`, an admin coordinator can also propose, beyond the conversation:
    - putting the conversation, or one of its captured Work Items, into a Project found
      through FR-11;
    - a new Project, with a title, a summary and optionally a folder. On confirmation the
      conversation joins it when it has no Project;
    - a folder for the conversation's Project. Other conversations' supervised runs may start
      in that folder, so this reaches beyond the conversation.

    S3 would open these to every participant.
14. FR-14: A proposing tool returns at once with the proposal's id and "waiting for the owner".
    It writes nothing.
    - It cannot change the projected Work Item, another conversation's Work Items, or the
      folder of a Project the conversation is not in.
    - A parallel member cannot propose a Project for its conversation (FR-22).

#### Proposals and confirmation (S1)

15. FR-15: Each proposal appears in the conversation as one card.
    - The card is a message that carries the proposal's id and no text. Desktop and mobile
      render it from the server's proposal store.
    - Neither the card nor the owner's answer enters a model's context or a transport mirror.
      The answer therefore does not use today's choice answers, which are user messages. The
      proposer learns only the outcome line of FR-21.
    - It shows the exact fields that will be written, the records they touch and the
      participant who proposed them.
    - A client that cannot render the card shows one fixed line that points to Desktop.
16. FR-16: A card that would change where a supervised run starts shows the folder and says
    that such runs start there without asking (ADR-149's recorded risk). That covers:
    - a folder for a Project, with the number of other conversations and Work Items in it;
    - a new Project with a folder;
    - putting the conversation, or a Work Item that has a Task, into a Project that has a
      folder.
17. FR-17: The owner answers a card on a route of its own. Only an owner principal can confirm
    or decline.
18. FR-18: A card is bound to a digest of its content, the conversation and the current state
    of the records it touches.
    - It is closed once: by a confirmation, a decline, a changed record, or 24 hours by the
      server's clock. A closed card cannot be answered again and frees its place in FR-20.
19. FR-19: On confirmation the server performs the write itself, with the bound content. The
    model supplies nothing at that point.
    - It uses Work's existing delegate where there is one: capture, update, assign to a
      Project, and Project create, which already takes a folder.
    - Two Work writes are new: capture into the conversation's Project, and a folder for an
      existing Project.
    - The conversation's own Project is a write to the conversation, not to Work (FR-22).
    - The write records both the participant who proposed it and the owner who confirmed it.
20. FR-20: A conversation holds at most 3 open proposals, and accepts at most 10 an hour. A
    proposal beyond either limit is refused with a reason the agent can read.
21. FR-21: The proposing participant learns each outcome on its next turn, as one line per
    proposal in that turn's instructions: confirmed, declined, expired or out of date.

#### A conversation in a Project (D12)

22. FR-22: A conversation at `work` that is not a parallel member can belong to one Project.
    The conversation stores the Project's id.
23. FR-23: The owner sets, changes or clears it, from the conversation in Desktop or by
    confirming a proposal. Nothing else writes it.
    - It is refused for an unknown or archived Project.
    - It is refused while a supervised run of the conversation's Tasks is queued, running or
      waiting for approval. Turn Runs and the projected Work Item's status do not count.
24. FR-24: The conversation's projected Work Item carries the Project. Work then lists it under
    that Project and no longer reports it as unanchored.
    - Work Items parented under the projected Work Item follow it to the new Project.
    - The owner's Work Item routes keep refusing to edit it. The conversation is where its
      Project is changed.
    - A conversation whose Project no longer exists is projected with no Project.
25. FR-25: Raising a conversation to `work` does not put it in a Project. A conversation at
    `work` without one stays under "No project".
26. FR-26: A supervised run of the conversation's Task starts in its Project's folder, or in a
    sandbox when the Project has none, as it does for any Work Item in a Project. The
    conversation's own sessions keep the conversation's folder.
27. FR-27: For Work's own actions on a Project:
    - a member conversation's projected Work Item and Turn Runs are not counted as active
      work when Work decides whether the Project can be edited, paused or archived;
    - a Project cannot be deleted while it has conversations. Work lists them and links to
      each, so the owner can take them out.
28. FR-28: A conversation's Project and a Project's `primaryConversationId` are separate.
    Confirming a new Project from a conversation sets both.

#### What stays

29. FR-29: ADR-105's decision path, its roles and its flags stay as they are, with one change
    (A1): a new Project that comes with a folder is not created at once. It becomes a proposal
    with the folder warning of FR-16, and the owner's confirmation creates it. A new Project
    without a folder is created as before, with the flag on and off. A Work conversation may
    then be offered the same change on both paths.
30. FR-30: No tool changes CLI permission.
    - Under the default policy these tools run without a provider prompt, as session tools do
      today. A proposal still needs its card.
    - Under an explicit interactive policy the provider asks before each call, and a proposal
      then needs its card as well.

### Non-Functional Requirements

- **Security**:
  - These tools are limits on what the server will do, not a security boundary. Every provider
    CLI runs under the owner's OS account and can edit the app's state (ADR-149 Decision 6).
  - The server enforces the level (FR-2), the conversation's own records (FR-9, FR-14), the
    admin coordinator where FR-11 and FR-13 ask for one, an owner principal for every answer
    (FR-17) and the binding (FR-18).
  - A Project's folder decides where approval-free supervised runs start. Through these tools
    it changes only by a card that says so (FR-16).
  - ADR-105's path no longer creates a Project with a folder that the model supplied: that
    becomes a card with the folder warning (A1). Work's pages cannot change a folder at all.
  - Names, titles and summaries that tools return are cut to a bounded length, stripped of
    control and bidirectional-override characters, and fenced as data. That is by prompt only.
- **Privacy**:
  - The base tools return the conversation's own records and no transcript.
  - FR-11 shows an admin coordinator the owner's Project names, folders and summaries.
  - At `work`, every participant sees the conversation's own Work Items and Project. A
    conversation is at `work` because the owner created it on Work or raised it there.
- **Compatibility**:
  - The conversation's Project is a new stored field. A build without it would drop it on its
    next write.
  - It ships at or after the state version rise that ADR-149 D9 decided for the product scope.
    If it lands in a later release, it needs a rise of its own.
- **Cost**:
  - Every conversation, direct lanes included, gains a session server and three tool
    definitions.
  - Each live session recycles its worker on its first turn after this ships. Grants are kept
    in memory, so it also recycles on its first turn after each Platform restart, as Code
    conversations do today.
  - No tool runs a model turn.

## Design Overview

- **One server, several providers.** The `cats` server becomes the host's tool server. The
  host composes it from tool providers: Code's tools, the base tools and Work's tools. No
  product imports another.
- **Grants.** The grant and the marker carry the conversation, the participant and the level.
  The wrapper issues a new grant when the level it sees has changed (FR-3).
- **Tools.** The base tools read Core's Task, Run, Outcome and Checkpoint records. The Work
  tools read Work's records and create proposals.
- **Proposals.** One store holds each proposal with its bound digest. The card and the
  answering route are new. If SPEC-139's bound card lands first, this builds on it.
- **Project membership.** A field on the conversation, copied onto the projected Work Item,
  where today the projection writes `null`.
- **Names.** The tools use plain names in the style of `declare_artifact`. PLAN-135 lists
  them. ADR-105's dotted names stay as the delegates' names.

## Proposals for the Owner

These are this SPEC's choices, not owner decisions.

- S1: Every write is a proposal that the owner confirms on a card (FR-14 to FR-19). A session
  tool runs without a prompt by default, so without this an agent could write to Work unasked.
- S2: Direct lanes get none of these tools (FR-1). Withdrawn: the owner answered Q5 the other
  way (A3). It had two reasons. The image tools already use the server name `cats` in a
  companion's lane, which PLAN-135 Phase 1 resolves before lanes get the server. Lanes also
  take transport and heartbeat turns, which then can read the lane's own records.
- S3: Finding the owner's Projects and proposing beyond the conversation need an admin
  coordinator (FR-11, FR-13), as ADR-149 Decision 6 and SPEC-125 FR-17 say for actions beyond
  the conversation. Proposals within the conversation are open to every participant, which
  SPEC-109 FR-19 allows for proposal-only tools. This narrows D12, in which the owner chose
  that agents can find and create Projects, and it needs the owner's explicit yes. Opening the
  rest to every participant is Q4.
- S4: Proposals cover Work Items, Projects, the conversation's Project and a Project's folder.
  The external tracker tools and Task creation stay on their existing paths.
- S5: The limits in FR-18 and FR-20: 24 hours, 3 open, 10 an hour.
- S6: A conversation's Project is changed from the conversation, not from Work's Work Item
  pages (FR-24).
- S7: Joining a Project does not change the conversation's own folder (FR-26).

## Test Plan

- **Delivery.**
  - A conversation at each level lists exactly its level's tools, and a call outside the level
    is refused.
  - The server's instructions and the turn policy name no tool the level does not list.
  - A direct lane gets the `cats` server with the base tools only, and a companion's image
    tools still work beside it.
  - After a raise, the next turn lists the new level's tools, and a turn that was running
    keeps the old ones.
  - A session with the desktop control server keeps it on create, send and resume.
  - A provider without session servers gets no tool and no policy text.
- **Base tools.**
  - They return the conversation's own Tasks and Runs with the fields in FR-6 to FR-8, and
    leave Turn Runs out by default.
  - A SPEC-118 role Task that belongs to another conversation is refused, and no transcript is
    returned.
  - A marker placed in a title is cut and fenced.
- **Work tools.**
  - Reads return the fields in FR-10 and FR-11, and FR-11 is refused for a participant that is
    not an admin coordinator.
  - Each kind of proposal in FR-12 and FR-13 creates one card and writes nothing.
  - A proposal that names the projected Work Item, another conversation's Work Item, or the
    folder of a Project the conversation is not in, is refused.
- **Confirmation.**
  - Only an owner principal can answer a card, and only on its own route.
  - Confirming writes exactly the bound content, and records the proposer and the owner.
  - A card closes once. A changed record, a replay and a card older than 24 hours are refused,
    and each frees its place.
  - The fourth open proposal and the eleventh within an hour are refused.
  - The proposing participant's next turn carries the outcome line.
  - Neither the card nor the answer appears in a model's context or a transport mirror.
  - Each card in FR-16 shows the folder and the warning.
- **Project membership.**
  - Setting, changing and clearing it from the conversation, and by confirming a proposal.
  - Each refusal in FR-22 and FR-23. A blocked Turn Run and an active conversation do not
    refuse it.
  - The projected Work Item carries the Project, appears under it in Work, and is no longer
    reported as unanchored. Its children follow it. Work's own routes still refuse to edit it.
  - A supervised run of the conversation's Task starts in the Project's folder, and the
    conversation's sessions keep their own folder.
  - FR-27: a Project with an active member conversation can still be edited, paused and
    archived, and cannot be deleted until the conversation leaves.
  - The stored field survives a load and save, and follows the state version rule.
- **What stays.** ADR-105's path behaves as before, with its flag on and off.
- **Providers.** Claude Code and Codex each list the tools for all three levels and complete a
  read and a proposal, under the default policy and under an interactive one.

## Open Questions

- [ ] Q1: Should a draft on Work be able to pick a Project before the conversation exists?
      This SPEC leaves creation as it is.
- [ ] Q2: Should an agent be able to propose a Task for one of the conversation's Work Items?
      ADR-105 already has this for Boss Cats, behind the owner's confirmation. This SPEC leaves
      it there (S4).
- [x] Q3: ADR-105's path lets a model supply a new Project's folder, after a re-check of the
      owner's wording and with no folder warning. Should that stay, or go through a card too?
      Answered: a card (A1).
- [x] Q4: Should every participant of a Work conversation be able to find the owner's Projects
      and propose a new Project or a move into another one? S3 limits both to an admin
      coordinator. With that limit, a Work conversation whose only participant is a plain
      provider and model can organize its own Work Items but cannot start a Project.
      Answered: keep S3's limit (A2).
- [x] Q5: Should a direct lane's agent get the read tools for Tasks and Runs? D13 says every
      level; S2 leaves lanes out. Answered: yes, for the lane's own records (A3).

## Owner Answers

Given on 2026-11-12, each as this SPEC recommended.

- A1 (Q3): ADR-105's path creates a new Project with a folder only through a card that shows
  the folder and its warning (FR-16, FR-29). A new Project without a folder is unchanged.
- A2 (Q4): S3 stays. Finding the owner's Projects and proposing beyond the conversation need an
  admin coordinator. A Work conversation whose only participant is a plain provider and model
  can organize its own Work Items but cannot start a Project.
- A3 (Q5): A direct lane's agent gets the base tools (FR-6 to FR-9) for the lane's own Tasks and
  Runs. S2 is withdrawn. The lane gets nothing else from this SPEC: its level is `chat`.

## References

- [ADR-149](../decisions/149-let-a-conversation-gain-product-scopes-and-never-lose-them.md),
  [ADR-101](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md),
  [ADR-105](../decisions/105-adopt-phase-scoped-work-tool-surface.md),
  [ADR-126](../decisions/126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md),
  [ADR-141](../decisions/141-host-a-consented-desktop-control-mcp-for-provider-sessions.md)
- [SPEC-109](SPEC-109-phase-scoped-work-tool-surface.md),
  [SPEC-118](SPEC-118-orchestrator-knowledge-and-collaboration-operations.md),
  [SPEC-123](SPEC-123-code-agent-artifact-preview.md),
  [SPEC-125](SPEC-125-conversation-participants-audience-and-orchestrator-binding.md),
  [SPEC-126](SPEC-126-code-work-owner-actions-and-lifecycle.md),
  [SPEC-139](SPEC-139-boss-cat-across-cats.md),
  [SPEC-141](SPEC-141-conversation-product-scope.md)
- [Tool Call Registry](../tool-calls.md)
- Runtime SPEC-035, session MCP servers, in the cats-runtime repository

---

*Created: 2026-11-11*
*Author: Claude; independent review by a separate agent on 2026-11-11*
*Related Plan: [PLAN-135](../plans/PLAN-135-task-run-and-work-tools-in-conversations.md)*
