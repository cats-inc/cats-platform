# ADR-149: Give Each Conversation a Product Scope That Can Be Raised, Never Lowered

## Status

Decided by the owner on 2026-11-11 (D1 to D7), who left the name to the agent (Decision 1).
P1 to P3 and P6 are proposed defaults the owner may change. P4 became D7, and P5 is now a
proposal of the SPEC. Nothing is implemented. The draft
[SPEC-141](../specs/SPEC-141-conversation-product-scope.md) specifies it and
[PLAN-134](../plans/PLAN-134-conversation-product-scope.md) stages it.

When implemented, it will:

- amend [ADR-126](126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md):
  the `cats` session MCP server goes to every conversation whose product scope is `code` or
  `work`, not only to conversations created on Code, so existing Work conversations gain it
  (D5);
- extend [ADR-073](073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md) without
  reversing it: a draft's surface chip still sets `originSurface`, now sets the starting product
  scope too (D6), and a conversation's scope can be raised afterwards;
- amend [ADR-069](069-scope-recents-to-channel-origin-surface-by-default.md): Recents and the
  conversation's route follow its product scope instead of `originSurface`, so a raise moves
  the conversation to its new product's Recents (D7);
- touch [SPEC-139](../specs/SPEC-139-boss-cat-across-cats.md) in four places:
  - joining a Work conversation now also grants Code's tools (D5), so FR-8's hint and FR-10's
    card, which name the Code tools for Code only, must name them for Work too;
  - a raise is a new way for a conversation to become Code or Work, beside the creation flows
    FR-6 names;
  - a Boss Cat that joined a conversation also gains what a later raise grants (P2);
  - the board's surface for a group conversation (FR-3) is its product scope (D7).

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
- **A new draft picks its product with the composer's surface chip.**
  - Helper chips carry a product. On +New chat, 「做一個番茄鐘」 (`pomodoro-app`) carries
    `code` and 「開個專案」 (`start-project`) carries `work` (`src/shared/guideCatAssistCatalog.ts:72`).
    Code's new draft has its own project chip that carries `work` (line 80).
  - Clicking a helper chip sets the surface chip
    (`src/products/shared/renderer/components/catlasChipActions.ts:33`). Dismissing the surface
    chip returns the draft to its own product: Chat on +New chat
    (`src/products/chat/renderer/components/NewChatDraft.tsx:49`), Code on Code's draft.
  - On submit, the surface chip becomes the target surface and the new conversation's
    `originSurface` (ADR-073).
- **`originSurface` is stamped at creation** (ADR-069). About 50 source files mention it:
  Recents, route builders, history, tool delivery, Catlas and owner actions among them.
- **No conversation changes product after creation.** ADR-073 covers draft submit only. The
  Task level has a precedent: a Code Task linked through `WorkItem.taskId` projects as Work
  (`resolveTaskProductBinding`).
- **Task and Run are shared Execution records**
  ([ADR-081](081-canonicalize-three-tier-core-record-taxonomy.md)).
  - Every conversation is projected into Core with a Task and a WorkItem linked through
    `WorkItem.taskId`, whatever its origin
    (`src/products/chat/state/core-projection/index.ts:110`). Creating a Work conversation
    creates no Project. The entry-preset rows in [terminology.md](../terminology.md) describe
    more than the code does; an earlier version of this ADR repeated them.
  - Code's `cats` server has no task or run tool. The task and run tools that exist sit on other
    paths ([tool-calls.md](../tool-calls.md)): `work.collaboration.request_role` on the Chat
    Orchestrator's decision path, `work.task.create_from_work_item` behind an owner-confirmed
    Chat sidecar, and `cats.lifecycle.run.spawn` as an internal delegate.
- **Chat, Code and Work all mount the shared canvas viewer** (`withSharedViewerRoutes`,
  [ADR-098](098-url-driven-canvas-and-platform-shared-viewer.md)). Code's `show_in_canvas`
  focus is stored on its Task ([ADR-097](097-store-code-canvas-focus-on-task-metadata.md)).

## Decision

### 1. The name is "product scope"

A conversation has one product scope: `chat`, `code` or `work`. The field is `productScope`.
User-facing copy names the product, as the surface chip already does, and needs no generic word.

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

### 2. A ladder: Work includes Code (D5)

- The scopes are ordered, `chat < code < work`, and each includes everything below it.
- New Chat starts at `chat`, New Code at `code` and New Work at `work`. Existing conversations
  take the level of their `originSurface`.
- So existing Work conversations gain Code's tools once this is implemented: the `cats` server,
  artifacts, the canvas and live previews. Live previews still need the Settings > Code switch,
  which is off by default (ADR-126).
- The records do not differ by level: every conversation already has a projected Task and
  WorkItem. The levels differ in which lists and tools read them.

### 3. A scope can be raised, never lowered (D2)

- The server refuses a lower scope, and the UI offers no way to lower one.
- Records made under a scope stay anchored: Tasks, artifacts, canvas focus, Projects and
  WorkItems.
- Live sessions never lose tools in the middle of a conversation.
- Lowering would undo nothing an agent has already done.
- To stop a conversation, the owner removes a participant, stops the turn or run, or deletes
  the conversation. No route archives a conversation, and there is no live permission editor
  today; a SPEC may add either.

### 4. The surface chip sets a new draft's scope (D6)

- On a new draft, the composer's surface chip is the product scope. The owner picks it
  directly or through a helper chip, such as 「做一個番茄鐘」 for Code or 「開個專案」 for Work.
- On submit, the chip sets both `originSurface` and the starting scope (ADR-073).
- Catlas-made helper chips may carry any of the three products. The host checks only that the
  value is `chat`, `code` or `work` (`src/products/chat/api/catlasCuration.ts:28`,
  [ADR-140](140-let-catlas-curate-assist-content-and-titles-through-host-validated-output.md)).
  The owner's click and send are still the choice.
- On a draft the chip can still be dismissed back to the draft's own product, because nothing
  exists yet.
- D6 covers drafts. Using the same chip to raise an existing conversation is a proposal (P6).

### 5. What a scope grants

A scope decides which Cats tools and APIs the conversation's participants may use, and which
product records the conversation anchors:

- `chat`: the conversation itself.
- `code`: everything in `chat`, plus its codespace (the conversation's folder, or its sandbox),
  its Task family and Runs, artifacts, the canvas and live previews.
- `work`: everything in `code`, plus a place in Work, which counts the conversation's WorkItem
  as its own. No Work tool is delivered to sessions today, and
  [SPEC-141](../specs/SPEC-141-conversation-product-scope.md) leaves Work's agent tools open.

A tool still appears only once it is delivered to the session (ADR-126 point 5).

### 6. What a scope does not decide (D3, D4)

- **CLI permission.** It stays a per-conversation setting with today's defaults. Product scope
  limits what Cats' own tools and APIs do. It is not a security boundary: every provider CLI
  runs under the owner's OS account, as SPEC-139's "Keeps" line says.
- **Actions beyond the conversation.** They stay with roles
  ([SPEC-125](../specs/SPEC-125-conversation-participants-audience-and-orchestrator-binding.md)
  FR-17, SPEC-118, SPEC-139). Work intake from Chat and Telegram stays there too, so a Chat
  conversation does not need `work` to capture a work item.
- **Turns the owner did not start.** They keep their own gates (ADR-141, SPEC-139).

### 7. Owner decisions (2026-11-11)

- D1: An existing conversation can be upgraded after creation.
- D2: Its scope can be raised but never lowered. The owner proposed this and left the name to
  the agent.
- D3: Work is not tightened. The risk is recorded below.
- D4: Chat's default CLI permission stays as it is.
- D5: The scopes form a ladder. Work always includes Code.
- D6: On a new draft, the composer's surface chip, which helper chips also set, is how the
  owner sets the starting product scope.
- D7: A conversation lives in the Recents of its product scope and opens on that product's
  surface. A raise moves it there; `originSurface` still records where it started.

### 8. Proposed defaults (the owner may change them)

- P1: Only the owner raises a scope, from the Desktop or mobile UI. Agents, transports,
  schedules and heartbeats cannot. An agent proposing a raise belongs to a later SPEC. It would
  build on SPEC-139's owner-started stamp, which landed with #417, and on its bound choice
  card, which is not built yet.
- P2: Before a raise, the owner sees what it grants and every participant who gains it. A Boss
  Cat that joined under SPEC-139 is one of them, and later
  joiners gain it too.
- P3: Direct lanes and parallel groups cannot be raised. Direct lanes take transport and
  heartbeat turns, and SPEC-139 keeps each lane to its own Cat. To work on code from a lane,
  the owner opens a Code conversation.
- P4: Became D7 on 2026-11-11. It had proposed keeping Recents on `originSurface`.
- P5: Replaced by SPEC-141's proposal S2, which the owner has not confirmed: a raise creates
  no record, because every conversation already has a projected Task and WorkItem.
- P6: On an existing conversation, the surface chip offers only wider levels, and choosing one
  opens P2's confirmation. It cannot be dismissed, since that would lower the scope.

## Recorded Risk: Work Runs Without Approvals (D3)

- **Verified.**
  - `POST /api/work/tasks/:id/supervised-run`, started from the Work UI
    (`src/products/work/renderer/api/workRecords.ts:375`), creates its Runtime session with
    `read_write` and `skip` (`src/products/work/api/index.ts:1278`). Its CLI runs shell
    commands and edits files without asking.
  - Conversations on Work use the same defaults as any other conversation.
- **Widened by D5.** Every Work conversation gains Code's tools under those same defaults.
  Work's supervised runs start their own sessions and receive none of them; SPEC-141 leaves
  that as it is.
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

- One ordered rule, in product words, for what a conversation can reach.
- The owner's Chat → Code → Work path works without starting over in a new conversation.
- The surface chip the owner already uses on drafts sets the scope, and P6 proposes the same
  chip for raises.
- A raised conversation shows up where its new tools are (D7).
- Nothing a conversation made loses its anchor.

### Negative

- Existing Work conversations gain Code's tools (D5). Work's conversation route mounts none of
  Code's conversation parts today, so SPEC-141 requires them there: the canvas with its preview
  controls, the preview button, the work areas panel and the chips.
- Each of the roughly 50 files that mention `originSurface` must be sorted into "follows
  product scope" (tool and instruction delivery, and Recents and routes under D7) or "stays
  with the origin" (where the conversation started). That includes the `code_thread` fallback
  in `resolveTaskProductBinding` and the owner actions' source path
  ([ADR-133](133-give-code-and-work-owner-actions-and-source-aware-lifecycle.md)).
- A raise moves the conversation out of the Recents the owner last saw it in (D7). The SPEC
  must make the move visible, so the conversation is not lost.
- It changes a frozen shared contract, the channel state in
  `src/products/chat/api/contracts.ts`, which needs integration review. SPEC-141 found no
  change needed under `src/app/server/**`.
- Product scope is not a security boundary (D3, D4), and the Work risk stays open.
- A raise cannot be taken back. A mistaken one means a new conversation.

### Neutral

- `originSurface` keeps meaning where the conversation started.
- The role and owner-started gates are unchanged.
- For existing data, the SPEC chooses between a one-time migration and deriving the scope on
  read, under the Pre-Release Compatibility Policy.

## Alternatives Considered

### Alternative 1: A set, where Work need not include Code

- **Pros**: Existing Work conversations keep today's tools, and a Work conversation could do
  without Code's.
- **Cons**: Two independent choices, and no single widest surface for a conversation.
- **Why rejected**: D5.

### Alternative 2: Allow lowering a scope

- **Pros**: Undoes a mistaken upgrade.
- **Cons**: Orphans records made under the scope, pulls tools from live sessions, and undoes
  nothing already done.
- **Why rejected**: D2.

### Alternative 3: Change `originSurface` instead

- **Pros**: No new field.
- **Cons**: "Origin" would no longer be true, and about 50 files rely on it meaning where the
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
  [ADR-140](140-let-catlas-curate-assist-content-and-titles-through-host-validated-output.md),
  [ADR-141](141-host-a-consented-desktop-control-mcp-for-provider-sessions.md)
- [SPEC-118](../specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md),
  [SPEC-125](../specs/SPEC-125-conversation-participants-audience-and-orchestrator-binding.md),
  [SPEC-139](../specs/SPEC-139-boss-cat-across-cats.md)
- [Terminology](../terminology.md), [Tool Call Registry](../tool-calls.md),
  [Agent Control Surface Registry](../agent-control-surfaces.md)

---

*Decision made: 2026-11-11*
*Decision makers: owner (D1 to D7); drafted by Claude*
