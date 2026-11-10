# ADR-149: Let a Conversation Gain Product Scopes and Never Lose Them

## Status

Decided by the owner on 2026-11-11 (D1 to D4). P1 to P5 are proposed defaults the owner may
change. This records a direction only: nothing is implemented, and a SPEC and a PLAN must come
first.

When implemented, it will:

- amend [ADR-126](126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md):
  the `cats` session MCP server goes to conversations whose product scopes include `code`,
  not only to conversations created on Code;
- extend [ADR-073](073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md) without
  reversing it: a draft's target surface still sets `originSurface` and the starting scopes,
  and a conversation can gain scopes afterwards;
- keep [ADR-069](069-scope-recents-to-channel-origin-surface-by-default.md): Recents still
  follow `originSurface` (P4);
- touch [SPEC-139](../specs/SPEC-139-boss-cat-across-cats.md): a Boss Cat that joined a
  conversation also gains any scope the conversation gains later (P2).

## Context

On 2026-11-11 the owner proposed additive permissions across Cats Chat, Cats Code and Cats
Work. A new chat gets the basics. Code adds the codespace, artifacts, the split canvas and live
previews. Work adds projects, tasks and runs.

What exists today, read from the code on 2026-11-11:

- **Cats tools reach agents through separate paths, each with its own gate.** The session
  wrappers are stacked in `src/app/server/index.ts:128`.
  - Code's `cats` session MCP server (`declare_artifact`, `show_in_canvas`, dev previews) is
    attached only when `originSurface === 'code'` (`src/products/code/agentTools/enricher.ts:34`).
    Work conversations get none of it.
  - Image tools are offered only in a Cat's own direct lane, under an image policy for that Cat
    (`src/products/chat/api/catImages.ts:170`).
  - [SPEC-118](../specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md)'s
    collaboration tools are offered to a Chat Orchestrator, behind the provider-agent decision
    flag, which is off by default. SPEC-118 excludes Code and Work conversations.
  - [ADR-105](105-adopt-phase-scoped-work-tool-surface.md)'s Work intake tools are offered to
    strong Cats and Boss Cats in Chat and Telegram.
  - Desktop control ([ADR-141](141-host-a-consented-desktop-control-mcp-for-provider-sessions.md))
    and the Boss Cat tools (SPEC-139, not implemented) need a turn the owner started.
- **CLI permission does not follow the surface.**
  - Unless the creator chooses otherwise, every conversation, direct lanes included, gets
    `read_write` with `skip`, in a sandbox folder when no folder is chosen. The defaults say
    "most permissive wins" (`src/shared/runtimeSessionPolicy.ts:158`). Claude then runs with
    `--dangerously-skip-permissions`, and Codex accepts commands and file changes.
  - The policy is set when the conversation is created (`persistCreatedChannel`). No route
    edits it on a live conversation, and the active permission chip only displays it.
- **`originSurface` is stamped at creation** (ADR-069). 54 source files read it: Recents,
  route builders, history, tool delivery, Catlas and owner actions among them.
- **No conversation changes product after creation.** ADR-073 covers draft submit only. The
  Task level has a precedent: a Code Task linked through `WorkItem.taskId` projects as Work
  (`resolveTaskProductBinding`).
- **Task and Run are shared Execution records**
  ([ADR-081](081-canonicalize-three-tier-core-record-taxonomy.md)). New Code creates a Task,
  and Chat may create Chat Tasks. Project and WorkItem are Work's Planning records. The host
  writes these records; no agent has a task or run tool today.
- **Chat, Code and Work all mount the shared canvas viewer** (`withSharedViewerRoutes`,
  [ADR-098](098-url-driven-canvas-and-platform-shared-viewer.md)). Code's `show_in_canvas`
  focus is stored on its Task ([ADR-097](097-store-code-canvas-focus-on-task-metadata.md)).

## Decision

### 1. The name is "product scope"

A conversation has a set of product scopes, drawn from `chat`, `code` and `work`. The field is
`productScopes`. User-facing copy names the product ("Add Code", 「加上 Code」) and needs no
generic word.

- Not "capability": it already names Runtime and provider capability profiles,
  [SPEC-132](../specs/SPEC-132-provider-session-interactions-and-capability-visibility.md)'s
  session capabilities, [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)'s managed
  plugin capabilities, the coordinator capability, and
  [ADR-082](082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)'s
  capability shell.
- Not bare "scope" or "conversation scope": `toolScope` is the supervision dial (`read_only`,
  `narrow_write`), and [tool-calls.md](../tool-calls.md) uses "conversation scope" for the
  conversation a tool call is bound to.
- "Product scope" sits beside the Task level's "task product binding".

### 2. A set with `chat` always in it

- New Chat starts with `chat`. New Code starts with `chat` and `code`. New Work starts with
  `chat` and `work`.
- Existing conversations take their scopes from `originSurface` the same way, so their tools
  do not change.
- The scopes are a set, not a ladder. An ordered `chat < code < work` would give every Work
  conversation Code's tools on the first day. The owner decided that Work is not tightened
  (D3), not that Work includes Code.

### 3. Scopes can be gained, never lost (D2)

- The server refuses to remove a scope, and the UI offers no way to.
- Records made under a scope stay anchored: Tasks, artifacts, canvas focus, Projects and
  WorkItems.
- Live sessions never lose tools in the middle of a conversation.
- Removing a scope would undo nothing an agent has already done.
- To stop a conversation, the owner removes a participant, stops the turn or run, or archives
  the conversation. There is no live permission editor today; a SPEC may add one.

### 4. What a scope grants

A scope decides which Cats tools and APIs the conversation's participants may use, and which
product records the conversation anchors:

- `chat`: the conversation itself.
- `code`: its codespace (the conversation's folder, or its sandbox), its Task family and Runs,
  artifacts, the canvas and live previews.
- `work`: its Project and WorkItems, and Work's tools for assigning and running its Tasks.

A tool still appears only once it is delivered to the session (ADR-126 point 5).

### 5. What a scope does not decide (D3, D4)

- **CLI permission.** It stays a per-conversation setting with today's defaults. Product scopes
  limit what Cats' own tools and APIs do. They are not a security boundary: every provider CLI
  runs under the owner's OS account, as SPEC-139's "Keeps" line says.
- **Actions beyond the conversation.** They stay with roles
  ([SPEC-125](../specs/SPEC-125-conversation-participants-audience-and-orchestrator-binding.md)
  FR-17, SPEC-118, SPEC-139). Work intake from Chat and Telegram stays there too, so a Chat
  conversation does not need `work` to capture a work item.
- **Turns the owner did not start.** They keep their own gates (ADR-141, SPEC-139).

### 6. Owner decisions (2026-11-11)

- D1: An existing conversation can be upgraded after creation.
- D2: It can gain scopes but never lose them. The owner proposed this and left the name to the
  agent.
- D3: Work is not tightened. The risk is recorded below.
- D4: Chat's default CLI permission stays as it is.

### 7. Proposed defaults (the owner may change them)

- P1: Only the owner adds a scope, from the Desktop or mobile UI. Agents, transports, schedules
  and heartbeats cannot. An agent proposing one belongs to a later SPEC, because it needs
  SPEC-139's owner-started stamp, which does not exist yet.
- P2: Before a scope is added, the owner sees what it grants, which records it creates, and
  every participant who gains it. A Boss Cat that joined under SPEC-139 is one of them, and
  later joiners gain it too.
- P3: Direct lanes and parallel groups cannot gain scopes. Direct lanes take transport and
  heartbeat turns, and SPEC-139 keeps each lane to its own Cat. To work on code from a lane,
  the owner opens a Code conversation.
- P4: Recents keep following `originSurface` (ADR-069). A conversation that gained a scope can
  also be opened on that scope's surface.
- P5: Adding a scope runs that product's entry contract (ADR-073) only for what is missing,
  reusing the `WorkItem.taskId` link for Work. The SPEC defines the records.

## Recorded Risk: Work Runs Without Approvals (D3)

- **Verified.**
  - `POST /api/work/tasks/:id/supervised-run`, started from the Work UI
    (`src/products/work/renderer/api/workRecords.ts:375`), creates its Runtime session with
    `read_write` and `skip` (`src/products/work/api/index.ts:1278`). Its CLI runs shell
    commands and edits files without asking.
  - Conversations on Work use the same defaults as any other conversation.
- **Inferred, not verified.** Work is where runs become repetitive and unattended: ADR-082
  plans for high-frequency runs, and schedules and triggers are Work rules. Once a schedule or
  trigger starts such a run, it acts with no one watching, and text from imported issues,
  transports or other agents could steer it.
- **Narrower paths already exist.** SPEC-118 K3's implementer works in an isolated worktree with
  a file-tool allowlist, and its reviewer is read-only. The golden path also limits its CLI to
  an allowlist of local file tools (`src/products/work/state/workGoldenPathRuntimeExecutor.ts:254`).
- **Revisit** before a schedule, trigger or transport can start a supervised Work run without
  the owner.

## Consequences

### Positive

- One rule, in product words, for what a conversation can reach.
- The owner's Chat → Code → Work path works without starting over in a new conversation.
- Nothing a conversation made loses its anchor.

### Negative

- Each of the 54 readers of `originSurface` must be sorted into "follows product scopes" (tool
  and instruction delivery) or "stays with the origin" (Recents, routes, history, Catlas). That
  includes the `code_thread` fallback in `resolveTaskProductBinding` and the owner actions'
  source path ([ADR-133](133-give-code-and-work-owner-actions-and-source-aware-lifecycle.md)).
- It changes frozen shared contracts: the channel state in `src/products/chat/api/contracts.ts`
  and the integration-owned session composition in `src/app/server/**`. Both need integration
  review.
- Product scopes are not a security boundary (D3, D4), and the Work risk stays open.
- A gained scope cannot be taken back. A mistaken one means a new conversation.

### Neutral

- `originSurface` keeps meaning where the conversation started.
- The role and owner-started gates are unchanged.
- For existing data, the SPEC chooses between a one-time migration and deriving scopes on read,
  under the Pre-Release Compatibility Policy.

## Alternatives Considered

### Alternative 1: One ordered level, `chat < code < work`

- **Pros**: One value, and "only up" is a single comparison.
- **Cons**: Every Work conversation would gain Code's tools at once. The owner decided that
  Work is not tightened, not that Work includes Code.
- **Why rejected**: A set keeps today's Work behavior and still lets a Work conversation add
  `code`.

### Alternative 2: Allow removing a scope

- **Pros**: Undoes a mistaken upgrade.
- **Cons**: Orphans records made under the scope, pulls tools from live sessions, and undoes
  nothing already done.
- **Why rejected**: D2.

### Alternative 3: Change `originSurface` instead

- **Pros**: No new field.
- **Cons**: "Origin" would no longer be true, and 54 readers rely on it meaning where the
  conversation started.
- **Why rejected**: Where a conversation started and what it may reach are different facts.

### Alternative 4: Call it "capability" or "scope"

- **Why rejected**: Both names are taken (Decision 1).

### Alternative 5: Keep today's model, one new conversation per product

- **Why rejected**: D1.

## References

- [ADR-069](069-scope-recents-to-channel-origin-surface-by-default.md),
  [ADR-073](073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md),
  [ADR-081](081-canonicalize-three-tier-core-record-taxonomy.md),
  [ADR-082](082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md),
  [ADR-097](097-store-code-canvas-focus-on-task-metadata.md),
  [ADR-098](098-url-driven-canvas-and-platform-shared-viewer.md),
  [ADR-105](105-adopt-phase-scoped-work-tool-surface.md),
  [ADR-126](126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md),
  [ADR-133](133-give-code-and-work-owner-actions-and-source-aware-lifecycle.md),
  [ADR-141](141-host-a-consented-desktop-control-mcp-for-provider-sessions.md)
- [SPEC-118](../specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md),
  [SPEC-125](../specs/SPEC-125-conversation-participants-audience-and-orchestrator-binding.md),
  [SPEC-139](../specs/SPEC-139-boss-cat-across-cats.md)
- [Terminology](../terminology.md), [Tool Call Registry](../tool-calls.md),
  [Agent Control Surface Registry](../agent-control-surfaces.md)

---

*Decision made: 2026-11-11*
*Decision makers: owner (D1 to D4); drafted by Claude*
