# PLAN-092: Direct Chat Slash-Mode Work Intake Rollout

> Implement the direct-message MVP where `/chat`, `/work`, and `/code` set
> product intent; the same direct audience Cat owns clarification and follow-up
> when it is strong enough; weak/unknown Cats require a human gate.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-104: Direct Chat Slash-Mode Work Intake](../specs/SPEC-104-direct-chat-slash-mode-work-intake.md)

## Dependencies

- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [ADR-091: Retire `composerMode` in Favor of Channel Intent](../decisions/091-retire-composer-mode-cat-led-in-favor-of-recipient-state.md)
- [SPEC-038: Telegram Bot Commands and Transport Control Surface](../specs/SPEC-038-telegram-bot-commands-and-transport-control-surface.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [PLAN-080: Provider Capability Bootstrap Config Rollout](./PLAN-080-provider-capability-bootstrap-config-rollout.md)
- [PLAN-085: Mission Cancel and Run Stop Rollout](./PLAN-085-mission-cancel-and-run-stop-rollout.md)

## Overview

This rollout should be small and contract-first. It should not redesign Chat,
Work, Code, or Telegram UI. The implementation target is a bridge:

1. parse direct-message product-intent slash commands through one shared pure
   parser;
2. resolve the direct audience Cat and its execution target;
3. reuse the provider capability profile resolver;
4. gate durable Work Item creation and follow-up execution by `strong_agent`
   vs weak/unknown;
5. record posture changes as message-stream system segments;
6. create/link Work Item anchors through existing product APIs and supervised
   run boundaries.

The direct lane remains the conversational follow-up surface.

## Implementation Phases

### Phase 1: Parser, posture events, and source refs

- [ ] Task 1.1: Add a pure Chat-owned product-intent command parser for
      `/chat`, `/work`, and `/code`. The helper must be shared by Telegram and
      Web ingress, strip Telegram bot suffixes such as `/work@botname`, trim
      whitespace, return structured `argumentText`, and avoid transport-local
      parsing branches.
- [ ] Task 1.2: Add tests proving `/start`, `/help`, `/commands`, `/status`,
      and `/mode` remain transport-control commands while `/chat`, `/work`, and
      `/code` are product-intent commands.
- [ ] Task 1.3: Define and implement the
      `metadata.directSlashModePostureChange` system-segment schema from
      SPEC-104. Per-lane posture may be cached for routing, but message-stream
      events are the audit source of truth.
- [ ] Task 1.4: Wire the Work Item source-ref schema through existing Core
      contracts: `CoreWorkItemRecord.conversationId` (already on Core types)
      carries the source direct conversation id; `metadata.directSlashModeIntake`
      (additive `CoreRecordMetadata` key) carries command segment/turn/lane,
      source channel, transport, target product, audience Cat id, capability
      profile kind, and schema version. Confirm during this task that no new
      Core record fields are introduced — only existing fields are populated
      and additive metadata keys are added.
- [ ] Task 1.5: Define the lane current-state cache for active anchors:
      `metadata.directSlashMode.activeAnchor = { workItemId, targetProduct,
      establishedBySegmentId, establishedAt }`. Implement the active-anchor
      lifecycle: clear the cache on `/chat` posture change, clear when the
      linked Work Item reaches a terminal `CoreWorkItemStatus`
      (`completed`, `cancelled`, or `archived`), and start a fresh intake on
      a subsequent `/work` or `/code` rather than auto-resuming any earlier
      Work Item. Include tests for each clear/no-resume condition.
- [ ] Task 1.6: Register `/chat`, `/work`, and `/code` through the same
      Telegram `setMyCommands` path that already owns SPEC-038 commands.
- [ ] Task 1.7: Add tests proving direct lanes remain `direct_message` after
      posture changes, repeated posture commands are idempotent, and non-direct
      channel usage returns a visible rejection without changing posture.
- [ ] Task 1.8: Hook the Chat composer (Web ingress) so messages starting
      with `/` invoke the shared parser before send. Recognized product-intent
      commands route through the same dispatch path as Telegram-origin
      commands; non-recognized `/`-prefixed text passes through as ordinary
      message content (tested in Task 1.2).
- [ ] Task 1.9: Update SPEC-038's `/help` and `/commands` outputs to list
      `/chat`, `/work`, and `/code` alongside the transport-control commands.
      This is a docs-and-string follow-up; no new transport routing logic.

**Deliverables**: command recognition (Telegram + Web), posture audit events,
source-ref schema reusing existing Core types, active-anchor cache with full
lifecycle, and SPEC-038 help discoverability all exist before durable work
creation.

### Phase 2: Direct audience capability bridge

- [ ] Task 2.1: Add a helper that resolves a direct lane to exactly one
      audience Cat.
- [ ] Task 2.2: Add a helper that resolves the audience Cat to its execution
      target and provider capability profile.
- [ ] Task 2.3: Ensure the bridge consumes the active PLAN-080 bootstrap config
      path used by existing Chat dispatch/provider-agent observation code.
- [ ] Task 2.4: Add tests for `strong_agent`, `weak_worker`, and `unknown`
      direct-audience capability outcomes.
- [ ] Task 2.5: Add negative tests for no audience, multiple audiences, and
      provider-name/model-name inference attempts.

**Deliverables**: direct-message work-intake permission is a deterministic
capability lookup, not a new classifier.

### Phase 3: Strong Cat clarification and Work Item anchor

- [ ] Task 3.1: Define the minimal Work Item anchor draft payload: title,
      summary, `goal`, non-empty `successCriteria[]`, non-empty
      `outOfScope[]`, non-empty `openQuestions[]`, proposed next action, source
      conversation, audience Cat, command segment, and target product hint.
- [ ] Task 3.2a: Gate `createWorkItem` tool exposure by direct posture and
      capability profile. Strong `/work` and `/code` may receive the tool;
      weak/unknown and `/chat` must not.
- [ ] Task 3.2b: Add the Concierge prompt protocol per SPEC-104 §Concierge
      Prompt Framework: one focal clarifying question per assistant turn (no
      stacking), default priority order (`goal` → `successCriteria` →
      `outOfScope` → `openQuestions`) with consolidation when the user
      volunteers info unsolicited, a current-understanding recap surfaced at
      least once before invoking `createWorkItem`, and explicit invocation
      only when the schema is satisfied or the clarification budget is
      exhausted.
- [ ] Task 3.2c: Enforce the `createWorkItem` schema so `goal`,
      `successCriteria[]`, `outOfScope[]`, and `openQuestions[]` are non-empty
      before durable creation.
- [ ] Task 3.2d: Add the clarification escape hatch: after three assistant
      clarification turns, the Cat must either create the Work Item if schema
      is satisfied or ask the human to confirm creation with stated
      assumptions.
- [ ] Task 3.2e: Enforce per-turn tool-grant separation: when `createWorkItem`
      succeeds in an assistant turn, the dispatch layer shall not expose
      `createTask` or `createRun` in the same turn. Conductor tools become
      available starting from the next user turn, on top of the existing
      SPEC-082 supervision approval gates. The successful `createWorkItem`
      result must be surfaced to the user (system or assistant message
      naming the Work Item id and summary) within the same turn it ran.
- [ ] Task 3.3: Create the Work Item through existing Core/Work creation paths,
      writing `conversationId`, `metadata.directSlashModeIntake`, and lane
      active-anchor state.
- [ ] Task 3.4: Wire strong `/code` posture to the same Work Item anchor path
      with `targetProduct: 'code'`; Code-bound task/run execution begins only
      after the Work Item exists and only in a subsequent user turn (Task
      3.2e).
- [ ] Task 3.5: Add tests proving the same direct audience Cat remains attached
      to the follow-up path after anchor creation.
- [ ] Task 3.6: Add separate tests for tool exposure (3.2a), Concierge prompt
      protocol — one focal question per turn + recap before creation (3.2b),
      schema validation (3.2c), clarification-budget behavior (3.2d),
      tool-chain separation — same-turn `createWorkItem` does not expose
      `createTask` / `createRun` and they reappear in the next user turn
      (3.2e), and full active-anchor lifecycle — clear on `/chat`, clear on
      Work Item terminal status, no auto-resume on next `/work` (Task 1.5
      behavior, exercised end-to-end here).

**Deliverables**: strong direct Cats can create Work Item anchors through
existing product boundaries, with prompt/tool/schema/turn-separation all
tested independently.

### Phase 4: Weak / unknown human gate

- [ ] Task 4.1: Define the weak/unknown response contract:
      `human_gate_required`, reason, optional draft summary, and suggested
      next actions.
- [ ] Task 4.2: Add the chosen human-gate UX: Web shows an inline direct-lane
      confirm action for creating the drafted Work Item; Telegram returns a
      short explanation plus a deep link to the Web confirmation/create surface.
- [ ] Task 4.3: Add Telegram-safe copy for weak/unknown direct Cats that asks
      the human to confirm/create or switch Cats without exposing internal
      provider jargon.
- [ ] Task 4.4: Add tests proving weak/unknown Cats cannot create durable Work
      Items, Tasks, Runs, or Code execution without the human gate.

**Deliverables**: weak and unknown paths fail safe while remaining useful.

### Phase 5: Follow-up and supervised execution bridge

- [ ] Task 5.1: Link created Work Item anchors back to the source direct
      conversation and audience Cat through `conversationId` and
      `metadata.directSlashModeIntake`.
- [ ] Task 5.2: Ensure follow-up messages in the direct lane can reference the
      active Work Item / Code task and current run state through lane
      active-anchor resolution.
- [ ] Task 5.3: Start supervised task/run execution only through existing
      Work/Code run APIs and supervision boundaries.
- [ ] Task 5.4: Add tests proving direct slash-mode flows do not call runtime
      create/send directly from product code.
- [ ] Task 5.5: Add read-model/projection tests proving Work/Code surfaces show
      Work Items created from direct chat.

**Deliverables**: durable work created from direct chat is visible in both the
originating lane and the owning product surface.

### Phase 6: Verification and documentation close-out

- [ ] Task 6.1: Run targeted tests for command parsing, direct capability
      bridge, strong creation, weak human gate, and Work/Code projection.
- [ ] Task 6.2: Add one manual Web direct-lane verification note.
- [ ] Task 6.3: Add one manual Telegram direct-lane verification note when a
      Telegram dev binding is available.
- [ ] Task 6.4: Update SPEC-104 and this plan if implementation paths differ
      from the planned seams.
- [ ] Task 6.5: Update `docs/terminology.md` only if implementation introduces
      new durable terminology. Do not add retired mode aliases.

**Deliverables**: the MVP is verified without polluting user dev state with
demo Work Items unless the user explicitly approves a write.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/shared/**` | Create/Modify | Shared pure product-intent slash parser for Web and Telegram ingress. |
| `src/products/chat/renderer/components/Composer.tsx` (or equivalent) | Modify | Hook web composer to invoke shared parser on `/`-prefix before send (Task 1.8). |
| `src/products/chat/**` | Modify | Write posture system segments, keep direct routing ownership, track active anchor current state with full lifecycle. |
| `src/platform/transports/telegram/**` | Modify | Route product-intent commands separately from transport-control commands; sync command-menu entries via existing `setMyCommands`. |
| `src/platform/supervision/**` | Reuse/Modify | Resolve capability profile through existing provider capability bootstrap config; enforce per-turn tool-grant separation between `createWorkItem` and `createTask` / `createRun`. |
| `src/products/work/api/**` | Modify | Create/link Work Item anchors through existing Work/Core boundaries; populate `conversationId` and additive metadata only (no new Core fields). |
| `src/products/code/api/**` | Modify | Create/link Code-bound task/run intent through existing Code boundaries; gated by Work Item anchor existing first. |
| `tests/**` | Modify/Create | Command parsing, capability bridge, prompt-protocol, schema validation, tool-chain separation, active-anchor lifecycle, and projection coverage. |
| `docs/specs/SPEC-038-telegram-bot-commands-and-transport-control-surface.md` | Modify | Extend `/help` and `/commands` outputs to list `/chat`, `/work`, `/code` (Task 1.9). |
| `docs/specs/SPEC-104-direct-chat-slash-mode-work-intake.md` | Modify | Keep requirement details aligned with implementation. |
| `docs/plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md` | Modify | Track progress by slice. |

## Technical Decisions

- Reuse existing provider capability profiles; do not add Cat-level or Chat-mode
  strong/weak flags.
- Keep `/chat`, `/work`, and `/code` as product-intent commands. They do not
  create new persistent channel kinds.
- Keep `Concierge` / `Conductor` as phases of the same direct audience Cat for
  this MVP.
- Record posture as message-stream system segments. Lane metadata may cache the
  current posture/active anchor, but it is not the audit source of truth.
- `/code` always creates a Work Item anchor first in the MVP, with
  `targetProduct: 'code'`, before Code task/run execution starts.
- Active-anchor cache lifecycle is eager-clear: `/chat` posture change clears,
  Work Item terminal status clears, and a subsequent `/work` or `/code`
  starts a fresh intake (no auto-resume).
- `createWorkItem` and `createTask` / `createRun` are turn-separated. The
  successful Work Item anchor is surfaced to the user before any Conductor
  tool can run. SPEC-082 supervision gates apply on top of this separation.
- Weak/unknown direct Cats require human confirmation; no automatic hand-off to
  another Cat in this plan.
- Work Item durable record creation happens through product-owned APIs above
  Core, not through runtime sessions.
- No new fields are added to Core record types in this rollout. Source-ref
  state uses `CoreWorkItemRecord.conversationId` (already exists) plus
  additive `CoreRecordMetadata` keys (`metadata.directSlashModeIntake`,
  `metadata.directSlashModeIntakeRef`, `metadata.directSlashMode.activeAnchor`,
  `metadata.directSlashModePostureChange`, `metadata.planning.productHint`).

## Testing Strategy

- **Unit tests**:
  - slash parser recognizes product-intent commands
  - parser strips Telegram bot suffixes and is shared by Telegram/Web
  - transport-control command set remains separate
  - web composer routes `/`-prefixed messages through the shared parser
  - non-recognized `/`-prefixed text passes through as ordinary content
  - posture system-segment metadata is written and replayable
  - repeated posture commands are idempotent
  - non-direct channel commands produce visible rejection
  - direct audience resolver handles exactly-one / none / many cases
  - capability bridge returns `strong_agent`, `weak_worker`, or `unknown`
  - weak/unknown create attempts return human-gated results
  - active-anchor cache clears on `/chat` posture change
  - active-anchor cache clears when linked Work Item reaches `completed`,
    `cancelled`, or `archived`
  - subsequent `/work` or `/code` after cache clear starts fresh intake
    (no auto-resume of any prior Work Item)
- **Prompt-behavior tests**:
  - Concierge prompt asks one focal question per turn, not stacked
  - prompt surfaces a current-understanding recap before invoking
    `createWorkItem`
  - prompt invokes `createWorkItem` only when schema is satisfied or the
    clarification budget is exhausted
- **Tool-grant separation tests**:
  - successful `createWorkItem` in turn N does not expose `createTask` or
    `createRun` in turn N
  - both Conductor tools reappear in turn N+1 (next user turn)
  - separation holds independently of SPEC-082 approval gate state
  - `createWorkItem` result is surfaced to the user in the same turn it ran
- **Integration tests**:
  - strong `/work` creates a Work Item with source conversation and Cat context
  - strong `/code` creates a Work Item with `targetProduct: 'code'`, then
    starts Code-bound follow-up through supervised boundaries in a subsequent
    user turn
  - weak/unknown `/work` cannot create durable records without human gate
  - Work/Code projections include Work Items created from direct chat
  - active-anchor follow-up attaches later direct messages to the created Work
    Item, and detaches after `/chat` or terminal status
- **Boundary tests**:
  - no provider-name/model-name strong/weak inference
  - no product direct runtime create/send calls
  - no retired route/control labels introduced
  - no new fields added to Core record types
- **Manual testing**:
  - Web direct lane: `/work`, clarification, create Work Item, follow-up
  - Telegram direct lane: `/work`, weak/strong behavior, follow-up link/copy
  - SPEC-038 `/help` output lists `/chat`, `/work`, `/code`

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Product-intent slash commands collide with Telegram control commands | High | Keep parser layers separate and test the SPEC-038 command set. |
| Implementation reintroduces mode taxonomy | High | Tests and docs must assert channel kind remains `direct_message`. |
| Per-lane posture cache becomes the audit source of truth | High | Phase 1 requires message-stream posture events before durable creation. |
| Strong/weak logic drifts into provider-name checks | High | Capability bridge tests use PLAN-080 config fixtures and absent-config cases. |
| Weak Cat creates durable work by accident | High | Centralize durable-action permission result and test weak/unknown paths. |
| Tool exposure lands without prompt/schema support | High | Phase 3 splits tool gating, Concierge prompt, and schema validation into separate tasks/tests. |
| `createTask` / `createRun` chained into the same turn as `createWorkItem` | High | Phase 3 Task 3.2e enforces per-turn tool-grant separation in the dispatch layer; tested in Task 3.6. |
| Concierge stacks multiple questions per turn, overwhelming the user and burning the clarification budget | Medium | Phase 3 Task 3.2b prompt protocol mandates one focal question per turn with a recap before creation; tested in Task 3.6. |
| Active-anchor cache leaks across postures (e.g. `/chat` does not detach, `/work` after `/chat` silently resumes prior Work Item) | Medium | Phase 1 Task 1.5 implements full lifecycle (clear on `/chat`, clear on terminal status, no auto-resume); covered by unit tests in Task 1.5 and integration tests in Phase 5. |
| Direct lane silently hands off to another Cat | Medium | Store/source context checks require the same direct audience Cat unless the owner explicitly switches. |
| Work Items become invisible outside Chat | Medium | Projection tests cover Work/Code surfaces and source direct-lane references. |
| SPEC-038 `/help` falls out of sync with product-intent command surface | Low | Task 1.9 owns the `/help` and `/commands` text update; manual test in Phase 6 verifies the listing. |
| Verification pollutes user state | Medium | Prefer isolated stores/tests; manual durable writes require explicit user approval per AGENTS.md. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-06 | Implementation started: added the Chat-owned `parseProductIntentCommand` shared parser with tests covering `/chat` / `/work` / `/code`, Telegram bot suffix stripping, multiline `argumentText`, transport-control separation, prefix false positives, and ordinary-text pass-through. Telegram/Web ingress hooks remain in Task 1.8 and later slices. |
| 2026-05-06 | Third-pass close-out: locked active-anchor lifecycle (eager clear on `/chat`, clear on Work Item terminal status `completed`/`cancelled`/`archived`, no auto-resume on next `/work`); locked per-turn tool-grant separation between `createWorkItem` and `createTask`/`createRun`; specified the Concierge prompt protocol (one focal question per turn, default priority order, recap-before-creation); confirmed `CoreWorkItemRecord.conversationId` already exists and `CoreRecordMetadata` is open-ended so no Core schema changes are required; added Task 1.8 for web composer ingress and Task 1.9 for SPEC-038 `/help` follow-up. Risks table updated to cover prompt-stacking, tool-chain leakage, and active-anchor lifecycle drift. |
| 2026-05-06 | Follow-up review close-out: locked posture to message-stream system segments, chose `/code` as Work Item anchor with Code target, defined source-ref metadata and active-anchor cache, split prompt/tool/schema tasks, and added parser/menu/idempotency/non-direct requirements. |
| 2026-05-06 | Plan created with ADR-101 and SPEC-104 to capture direct-message slash-mode work intake MVP. |

---

*Created: 2026-05-06*
*Author: Codex*
