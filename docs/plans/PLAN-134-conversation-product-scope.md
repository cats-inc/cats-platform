# PLAN-134: Conversation Product Scope

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft; not started. It waits for the owner's answers to SPEC-141's proposals and to Q1 to Q4 |
| **Owner** | Product owner |
| **Assigned To** | Unassigned |
| **Reviewer** | Independent agent before each merge |

## Related Spec

[SPEC-141: Conversation Product Scope](../specs/SPEC-141-conversation-product-scope.md), under
[ADR-149](../decisions/149-let-a-conversation-gain-product-scopes-and-never-lose-them.md).

## Overview

Six phases, one pull request each.

- Phases 1 and 2 add the field and move its readers. For a conversation that has an origin and
  is not a direct lane, they change no behavior, and tests prove that.
- Phase 3 is the main intended change for existing conversations: Work gains Code's tools
  (D5).
- Phases 4 and 5 add the raise, first on the server and then in Desktop.
- Phase 6 updates the documents and runs the acceptance.

No version bump or publication is part of this plan.

## Implementation Phases

### Phase 1: The field

**Goal:** every conversation carries a scope, and nothing reads it yet (FR-1 to FR-7).

- [ ] Add `productScope` to the conversation state, the summary and view types, the renderer
      mirrors and the mobile summary type. The create input types do not get the field.
- [ ] Creation stamps it: the validated origin, or `chat` for a direct lane, for a single
      conversation and for each parallel member.
- [ ] Loading derives it as FR-3 says when the stored value is missing or invalid, for a direct
      lane and for a no-origin conversation or group. A valid stored value is kept, so loading
      never raises a scope.
- [ ] Add the one raise function to the Chat model. It refuses an equal or lower level, a
      direct lane and a parallel member.
- [ ] Add the raise revision helper (FR-7). `collaborationExecutionRevision` is not touched.
- [ ] Core metadata projected from a conversation gains `productScope` beside `originSurface`:
      Task, WorkItem, Run, Mission, Trace, Checkpoint, Outcome and Activity.
- [ ] If the owner chooses the version boundary (Q4): raise the state version with a tested
      upgrade, a backup and an atomic replacement.
- [ ] Tests for FR-1 to FR-7, with a load-and-save round trip that shows only the new field
      added.

**Deliverables:** the field exists everywhere. This phase changes the frozen contract
`src/products/chat/api/contracts.ts`, and `src/core/types.ts` under Q4, so it needs integration
review.

### Phase 2: Readers follow the scope

**Goal:** every reader in the inventory's "follows the scope" group reads the scope (FR-12 to
FR-15, and FR-8's checks still limited to `code`).

- [ ] Recents: the shared filter and the sidebar view model.
- [ ] Routes: the landing conversation, the redirect, the selection target, the owner-action
      source path and the Catlas conversation link.
- [ ] Labels: the Catlas snapshot.
- [ ] Work: the own-WorkItem check.
- [ ] Tools: the enricher's channel type, the enricher, the Code session verification and the
      Code work areas read the scope, still accepting `code` only.
- [ ] Tests: for fixtures of all three origins, every moved reader gives the same result as on
      the base commit. The differences are FR-3's no-origin conversations and FR-2's direct
      lanes created outside Chat.

**Deliverables:** readers are on the scope, with no behavior change for a conversation that has
an origin and is not a direct lane.

### Phase 3: Work includes Code

**Goal:** conversations on Work have Code's tools and can show them (D5; FR-8 to FR-11).

- [ ] The enricher, the Code session verification and the Code work areas accept `work`.
- [ ] Make Code's conversation parts usable from Work's route: the preview controls, the
      preview button, the work areas panel and the folder and permission chips. They live in
      `src/products/code/renderer/components/`, and `tests/dependency-graph.test.js` forbids
      Work importing Code, so they move to `src/products/shared/` or get an explicit allowance.
- [ ] Decide how the canvas finds its route (see Technical Decisions), then make
      `showInCanvas.ts`, `devPreview.ts`, `service.ts`, `conversationPreviews.ts` and
      `artifactMaterialization.ts` follow it.
  - [ ] If a surface kind is added, also update the hand-written kind list in
        `src/products/shared/artifactCanvas/iframePolicy.ts`, `projection.ts`, `activity.ts`,
        `contracts.ts` and `CodeCanvasPreviewButton.tsx`.
- [ ] Keep earlier canvas and preview state working (FR-9).
- [ ] Bind the grant of a session that gains the server to that session's folder (FR-25).
- [ ] Review copy and labels that say "Cats Code" for a conversation that now may live on Work
      (`policy.ts`, `service.ts`, the `product:code` label).
- [ ] Tests, plus an isolated candidate check of a Work conversation that shows an artifact and
      a live preview.

**Deliverables:** a conversation created on Work receives the `cats` server, and its canvas,
previews and work areas appear under `/work`.

### Phase 4: The raise on the server

**Goal:** an owner principal can read what a raise would do and perform it (FR-20 to FR-26).

- [ ] `GET` and `POST /api/channels/:channelId/product-scope`, with the owner principal check,
      the refusals and their error codes, the mutation gate and the raise revision. This is the
      first conversation route that checks a role.
- [ ] The system line, with event metadata that names the old and the new level, and the update
      events.
- [ ] Confirm how a turn whose session was lost is handled today. FR-25 relies on it for a
      failed recycle, and this plan has not read that code.
- [ ] Tests that a session created without the `cats` server gains it on its next send, that a
      running turn keeps its tools, and that a failed recycle leaves the scope raised.
- [ ] Tests that a prepared and a running SPEC-118 collaboration are unaffected.
- [ ] Tests that no agent tool, transport command, schedule, heartbeat or create request can
      raise a scope.
- [ ] Document both routes in `docs/api.md`.

**Deliverables:** the raise works through the API and nowhere else.

### Phase 5: The raise in Desktop

**Goal:** the owner raises a conversation from its chip (FR-27 to FR-32).

- [ ] The scope chip on existing conversations in Chat, Code and Work, with the menu of wider
      levels and no menu on direct lanes and parallel members.
- [ ] The confirmation, built from the read route's answer.
- [ ] After a raise: open the conversation at its new route and show the toast. On failure:
      show the reason and stay.
- [ ] Copy in zh-TW and en.
- [ ] Renderer tests, plus an isolated candidate walk with screenshots at the Desktop minimum
      window width.

**Deliverables:** the complete raise flow in Desktop.

### Phase 6: Documents and acceptance

- [ ] Amend ADR-069, ADR-073, ADR-126 and SPEC-123 as SPEC-141's metadata lists. ADR-098 and
      SPEC-101 too, if a canvas surface kind was added.
- [ ] If S1 stands, reword SPEC-118 and SPEC-137 FR-7 from "Chat conversation" to "created on
      Chat".
- [ ] Amend SPEC-139 FR-3, FR-6, FR-8 and FR-10, and make its join card's binding cover the
      scope. PLAN-133 is building SPEC-139 now, in another session.
  - Its join slice binds the card to `collaborationExecutionRevision`, which FR-7 keeps free of
    the scope, and names Code's tools for Code only.
  - Whichever lands second, PLAN-133's join slice or this plan's Phase 3, updates the hint, the
    card's text and the binding. This plan does not edit SPEC-139 or PLAN-133 before then.
- [ ] Terminology: mark the product scope row as implemented, and correct the entry-preset rows
      that describe records the code does not create.
- [ ] `docs/tool-calls.md`: who receives the `cats` tools.
- [ ] Record the persisted-data boundary for the release notes, as Q4 was answered. No bump
      here.
- [ ] Provider acceptance: the mid-conversation tool delivery with Claude Code and with Codex.
- [ ] Update ADR-149's status.

## Not in This Plan

- Work agent tools (SPEC-141 Q1).
- Role-gated tools in every conversation (Q2).
- A raise control in the mobile app (Q3).
- A raise proposed by an agent.
- Raising direct lanes or parallel groups.
- Work's supervised runs.

## Reader Inventory

From a sweep of Platform `36d4bb458` on 2026-11-11: 145 mentions of `originSurface` in 54
source files, tests excluded. Paths are under `src/`.

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
- **Labels.** `products/chat/api/catlasSnapshot.ts:87`.
- **Work.** `products/work/api/ownerGraphProjection.ts:12`.

Three links hard-code a product prefix and rely on the redirect:
`products/code/renderer/components/WorkspaceDetailPage.tsx:325`,
`products/code/state/codeSessionOperation.ts:45` and
`products/code/renderer/components/ArtifactDetailView.tsx:32`. They keep working (FR-13).

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
  - `products/chat/state/model/readModels.ts:284`, `:388`.
  - `products/chat/state/core-projection/entities.ts:572`, `:624` and `workflow.ts:207-479`.
  - `products/shared/renderer/workspaceChatUtils.tsx:525`, `activeEntityMerge.ts:183` and
    `hooks/useWorkspaceAppShellRouting.ts:36`.
  - `products/chat/api/resources/diagnosticRoutes.ts:66`.
  - `products/work/state/historyListing.ts:12-60`.
- **Catlas titling.** `products/chat/api/catlasTitles.ts:21`, `:60`.
- **Posture.** `products/chat/state/runtime-dispatch/routing.ts:1149-1150`.
- **Knowledge scope copy.** `products/chat/state/orchestratorKnowledge.ts:62`.
- **The revision digest.** `products/chat/state/collaborationExecutionSurface.ts:28`. It is
  left as it is (FR-7).

### Stays with the origin by S1

The owner has not confirmed these.

- `products/chat/state/orchestratorKnowledge.ts:22`. Through it:
  - orchestrator knowledge at `runtime-dispatch/execution.ts:208`;
  - decisions at `providerAgentDecisionRequester.ts:50`;
  - the collaboration descriptors at `runtime-dispatch/turn.ts:925`;
  - snapshot eligibility at `orchestratorCollaboration.ts:153`.
- `products/chat/state/collaborationExecution.ts:87`, `:146`.
- `products/chat/state/orchestratorCollaboration.ts:94`, `:141`, `:177`, `:303`, which write a
  literal `chat` origin into proposals and snapshots.
- `products/chat/companion/life/review.ts:47`.

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
| `src/shared/productScope.ts` | Create | The order, the comparison, the derivation and the raise revision |
| `src/products/chat/state/model/index.ts`, `chat-snapshot/entities.ts`, `model/readModels.ts` | Modify | Stamp, derive, raise and summarize |
| `src/products/chat/state/core-projection/entities.ts`, `workflow.ts` | Modify | The metadata copy |
| `src/platform/runtime/invocationEnrichment.ts` | Modify | The scope on the enricher's channel type |
| The "follows the scope" files in the inventory | Modify | Read the scope |
| `src/products/code/agentTools/*`, `src/products/code/livePreview/*`, `src/products/shared/artifactCanvas/*` | Modify | The canvas route by scope, earlier state, and the grant's folder |
| `src/products/code/renderer/components/*` to `src/products/shared/renderer/` | Move | Code's conversation parts, so Work may mount them |
| `src/products/work/renderer/AppRoutes.tsx`, `src/products/shared/renderer/WorkspaceAppRoutes.tsx` | Modify | Work's conversation parts |
| `src/products/chat/api/resources/channelRoutes.ts`, `routeSupport.ts` | Modify | The two raise routes |
| `src/products/shared/renderer/components/ComposerSurfaceChip.tsx`, `conversation-view/ConversationView.tsx` | Modify | The scope chip and its menu |
| `src/products/shared/renderer/components/ProductScopeRaiseDialog.tsx` | Create | The confirmation |
| `src/shared/i18n/catalogs/en.ts`, `zh-TW.ts`, `messageKeys.ts` | Modify | Copy |
| `src/core/types.ts`, `src/products/chat/state/store.ts` | Modify, only under Q4 | The state version and its upgrade |
| `tests/` | Create | Field, reader equality, D5, raise and renderer tests |
| `docs/api.md` and the documents in Phase 6 | Modify | Contracts and amendments |

No file under `src/app/server/` needs to change: Work conversations already use the shared
Runtime client that carries the Code tools wrapper.

## Technical Decisions

- **One ordered value.** The owner chose the ladder (ADR-149 D5), so the field is one level and
  "only up" is one comparison.
- **Derive on load.** Loading already completes missing fields, and the stored value appears on
  the next save. Whether the state version also rises is the owner's choice (Q4).
- **The canvas route, to decide in Phase 3.** A canvas surface kind fixes its route today, so
  `code_conversation` always opens under `/code`. Two ways forward:
  - add a kind for Work conversations, which needs every kind list updated and a rule for
    state recorded under the old kind;
  - keep `code_conversation` and resolve its route from the conversation's scope, which keeps
    earlier state valid.

  Either must satisfy FR-9.
- **The raise has its own revision.** `collaborationExecutionRevision` also digests every Cat's
  settings and is checked by running collaborations, so reusing it would refuse raises for
  unrelated changes and would stop a collaboration on a raise.
- **No session restart from Platform.** The next send carries the new server set and Runtime
  recycles the worker (Runtime SPEC-035, SMCP-08).

## Testing Strategy

- **Unit tests**: the scope helper, creation, loading, the raise function and its refusals, the
  raise revision, and each moved reader.
- **Integration tests**: the two routes with and without an owner principal, the reader
  equality fixtures, tool delivery by scope, the grant's folder, and the mid-conversation
  delivery through the wrapper.
- **Manual testing**: isolated candidates for Phase 3 and Phase 5, and the provider acceptance
  in Phase 6. The State Hygiene Policy applies: no test records in the owner's profile.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| D5 changes every conversation created on Work | Medium | Its own phase and pull request, with a candidate check before merge |
| A build without the field drops it on write and undoes a raise | Medium | The owner's choice in Q4: a version boundary that makes older builds refuse the file, or accepting the loss |
| The first turn after a raise, or after D5 ships, fails because Runtime cannot recycle the worker | Medium | Handled as a lost session is today; a test in Phase 4 and the provider acceptance in Phase 6 |
| A session that gains the tools mid-conversation gets a grant for the wrong folder | Medium | Bind the grant to the session's folder (FR-25), with worktree and sandbox tests |
| Mid-conversation tool delivery differs by provider | Medium | Acceptance with Claude Code and Codex; adapters without session MCP keep reporting `unsupported` |
| A raised conversation seems to disappear from its old Recents | Low | Desktop opens it at its new route, shows a toast, and old links redirect |
| A frozen shared contract changes | Medium | Integration review in Phase 1 |
| A no-origin conversation becomes visible in Chat's Recents | Low | Stated as S4 for the owner; covered by a test |
| A direct lane created outside Chat loses Code's tools | Low | Stated as S6 for the owner; covered by a test |
| PLAN-133 builds SPEC-139's join card while this plan changes what joining a Work conversation grants | Medium | Whichever lands second updates the join hint, the card's text and its binding (Phase 6) |

---

*Created: 2026-11-11*
*Author: Claude; independent review by a separate agent on 2026-11-11*
*Related Spec: [SPEC-141](../specs/SPEC-141-conversation-product-scope.md)*
