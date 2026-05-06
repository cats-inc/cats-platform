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

- [x] Task 1.1: Add a pure Chat-owned product-intent command parser for
      `/chat`, `/work`, and `/code`. The helper must be shared by Telegram and
      Web ingress, strip Telegram bot suffixes such as `/work@botname`, trim
      whitespace, return structured `argumentText`, and avoid transport-local
      parsing branches.
- [x] Task 1.2: Add tests proving `/start`, `/help`, `/commands`, `/status`,
      and `/mode` remain transport-control commands while `/chat`, `/work`, and
      `/code` are product-intent commands.
- [x] Task 1.3: Define and implement the
      `metadata.directSlashModePostureChange` system-segment schema from
      SPEC-104. Per-lane posture may be cached for routing, but message-stream
      events are the audit source of truth.
- [x] Task 1.4: Wire the Work Item source-ref schema through existing Core
      contracts: `CoreWorkItemRecord.conversationId` (already on Core types)
      carries the source direct conversation id; `metadata.directSlashModeIntake`
      (additive `CoreRecordMetadata` key) carries command segment/turn/lane,
      source channel, transport, target product, audience Cat id, capability
      profile kind, and schema version. Confirm during this task that no new
      Core record fields are introduced — only existing fields are populated
      and additive metadata keys are added.
- [x] Task 1.5: Define the lane current-state cache for active anchors:
      `metadata.directSlashMode.activeAnchor = { workItemId, targetProduct,
      establishedBySegmentId, establishedAt }`. Implement the active-anchor
      lifecycle: clear the cache on `/chat` posture change, clear when the
      linked Work Item reaches a terminal `CoreWorkItemStatus`
      (`completed`, `cancelled`, or `archived`), and start a fresh intake on
      a subsequent `/work` or `/code` rather than auto-resuming any earlier
      Work Item. A direct `/work` <-> `/code` switch while a draft anchor is
      active supersedes the old draft anchor, marks it cancelled when still
      draft, and points metadata at the replacement; if no replacement can be
      created, or `/chat` abandons the active posture, cancel the same-source
      draft anchor with posture-abandoned metadata while clearing the stale
      cache.
      Include tests for each clear/no-resume/supersede condition.
- [x] Task 1.6: Register `/chat`, `/work`, and `/code` through the same
      Telegram `setMyCommands` path that already owns SPEC-038 commands.
- [x] Task 1.7: Add tests proving direct lanes remain `direct_message` after
      posture changes, repeated posture commands are idempotent, and non-direct
      channel usage returns a visible rejection without changing posture.
- [x] Task 1.8: Hook the Chat composer (Web ingress) so messages starting
      with `/` invoke the shared parser before send. Recognized product-intent
      commands route through the same dispatch path as Telegram-origin
      commands; non-recognized `/`-prefixed text passes through as ordinary
      message content (tested in Task 1.2).
- [x] Task 1.9: Update SPEC-038's `/help` and `/commands` outputs to list
      `/chat`, `/work`, and `/code` alongside the transport-control commands.
      This is a docs-and-string follow-up; no new transport routing logic.

**Deliverables**: command recognition (Telegram + Web), posture audit events,
source-ref schema reusing existing Core types, active-anchor cache with full
lifecycle, and SPEC-038 help discoverability all exist before durable work
creation.

### Phase 2: Direct audience capability bridge

- [x] Task 2.1: Add a helper that resolves a direct lane to exactly one
      audience Cat.
- [x] Task 2.2: Add a helper that resolves the audience Cat to its execution
      target and provider capability profile.
- [x] Task 2.3: Ensure the bridge consumes the active PLAN-080 bootstrap config
      path used by existing Chat dispatch/provider-agent observation code.
- [x] Task 2.4: Add tests for `strong_agent`, `weak_worker`, and `unknown`
      direct-audience capability outcomes.
- [x] Task 2.5: Add negative tests for no audience, multiple audiences, and
      provider-name/model-name inference attempts.

**Deliverables**: direct-message work-intake permission is a deterministic
capability lookup, not a new classifier.

### Phase 3: Strong Cat clarification and Work Item anchor

- [x] Task 3.1: Define the minimal Work Item anchor draft payload: title,
      summary, `goal`, non-empty `successCriteria[]`, non-empty
      `outOfScope[]`, non-empty `openQuestions[]`, proposed next action, source
      conversation, audience Cat, command segment, and target product hint.
- [x] Task 3.2a: Gate draft Work Item anchor creation by direct posture and
      capability profile. Strong `/work` and `/code` create a draft anchor;
      weak/unknown and `/chat` must not.
- [x] Task 3.2b: Add the Concierge prompt protocol per SPEC-104 §Concierge
      Prompt Framework: one focal clarifying question per assistant turn (no
      stacking), default priority order (`goal` → `successCriteria` →
      `outOfScope` → `openQuestions`) with consolidation when the user
      volunteers info unsolicited, a current-understanding recap surfaced at
      least once before proposing task/run follow-up, and explicit follow-up
      only when the schema is satisfied or the clarification budget is
      exhausted.
- [x] Task 3.2c: Enforce the draft Work Item anchor schema so `goal`,
      `successCriteria[]`, `outOfScope[]`, and `openQuestions[]` are non-empty
      before durable creation.
- [x] Task 3.2d: Add the clarification escape hatch: after three assistant
      clarification turns, the Cat must either create the Work Item if schema
      is satisfied or ask the human to confirm creation with stated
      assumptions. MVP implementation note: this is currently prompt-only
      soft guidance; a hard turn counter and forced creation/confirmation gate
      are intentionally outside this MVP.
- [x] Task 3.2e: Enforce per-turn separation: product-intent turns create the
      draft Work Item anchor, return a system acknowledgement, and may dispatch
      the same direct Cat only for a chat-only Concierge clarification reply.
      They do not dispatch `createTask`, `createRun`, or Code execution in the
      same turn. Follow-up task/run work starts on later user turns through
      existing Work/Code supervision boundaries.
- [x] Task 3.3: Create the Work Item through existing Core/Work creation paths,
      writing `conversationId`, `metadata.directSlashModeIntake`, and lane
      active-anchor state.
- [x] Task 3.4: Wire strong `/code` posture to the same Work Item anchor path
      with `targetProduct: 'code'`; Code-bound task/run execution begins only
      after the Work Item exists and only in a subsequent user turn (Task
      3.2e).
- [x] Task 3.5: Add tests proving the same direct audience Cat remains attached
      to the follow-up path after anchor creation.
- [x] Task 3.6: Add separate tests for command gating (3.2a), Concierge prompt
      protocol — one focal question per turn + recap before creation (3.2b),
      schema validation (3.2c), clarification-budget behavior (3.2d),
      turn separation — same-turn draft anchor creation dispatches at most a
      chat-only Concierge reply and does not dispatch `createTask`,
      `createRun`, or Code execution (3.2e), and full active-anchor lifecycle
      — cancel abandoned drafts on `/chat` or no-replacement posture changes, clear on
      Work Item terminal status, no auto-resume on next `/work` (Task 1.5
      behavior, exercised end-to-end here).

**Deliverables**: strong direct Cats can create Work Item anchors through
existing product boundaries, with prompt/schema/turn-separation all
tested independently.

### Phase 4: Weak / unknown human gate

- [x] Task 4.1: Define the weak/unknown response contract:
      `human_gate_required`, reason, optional draft summary, and suggested
      next actions.
- [x] Task 4.2: Add the chosen human-gate UX: Web shows an inline direct-lane
      confirm action for creating the drafted Work Item; Telegram returns a
      short explanation plus a deep link to the Web confirmation/create surface.
- [x] Task 4.3: Add Telegram-safe copy for weak/unknown direct Cats that asks
      the human to confirm/create or switch Cats without exposing internal
      provider jargon.
- [x] Task 4.4: Add tests proving weak/unknown Cats cannot create durable Work
      Items, Tasks, Runs, or Code execution without the human gate.

**Deliverables**: weak and unknown paths fail safe while remaining useful.

### Phase 5: Follow-up and supervised execution bridge

- [x] Task 5.1: Link created Work Item anchors back to the source direct
      conversation and audience Cat through `conversationId` and
      `metadata.directSlashModeIntake`.
- [x] Task 5.2: Ensure follow-up messages in the direct lane can reference the
      active Work Item / Code task and current run state through lane
      active-anchor resolution.
- [x] Task 5.3: Start supervised task/run execution only through existing
      Work/Code run APIs and supervision boundaries.
- [x] Task 5.4: Add tests proving direct slash-mode flows do not call Work/Code
      task/run execution directly from product code; command turns may only
      dispatch the same direct Cat for chat-only Concierge clarification.
- [x] Task 5.5: Add read-model/projection tests proving Work/Code surfaces show
      Work Items created from direct chat.

**Deliverables**: durable work created from direct chat is visible in both the
originating lane and the owning product surface.

### Phase 6: Verification and documentation close-out

- [x] Task 6.1: Run targeted tests for command parsing, direct capability
      bridge, strong creation, weak human gate, Code-target anchors, and
      Work/Code projection/supervised boundary handoff.
- [x] Task 6.2: Add one manual Web direct-lane verification note.
- [x] Task 6.3: Add one manual Telegram direct-lane verification note when a
      Telegram dev binding is available.
- [x] Task 6.4: Update SPEC-104 and this plan if implementation paths differ
      from the planned seams.
- [x] Task 6.5: Update `docs/terminology.md` only if implementation introduces
      new durable terminology. Do not add retired mode aliases.

**Deliverables**: the MVP is verified without polluting user dev state with
demo Work Items unless the user explicitly approves a write.

### Phase 6 Verification Notes

- Web direct-lane verification: verified without writing to the persisted local
  dev state by exercising the Web composer metadata helper and the shared Chat
  dispatch boundary against in-memory stores. The final targeted suite covered
  `/chat`, `/work`, and `/code` Web-origin command tagging, direct-lane posture
  segments, strong/weak/unknown capability outcomes, active-anchor lifecycle,
  Work/Code projection visibility, and WorkItem-to-Task supervised-boundary
  handoff.
- Telegram direct-lane verification: no live Telegram dev binding was used in
  this session, so no bot messages or demo records were written to external
  services or the user's persisted dev state. The verified path covered
  Telegram suffix parsing (`/work@botname`), Telegram command-menu/help
  discoverability, transport-control separation, and the Telegram product-intent
  bridge into the same Chat dispatch boundary used by Web.
- Final commands run on 2026-05-06:
  `npx tsx --test tests/chat-product-intent-command-parser.test.tsx tests/chat-composer-message-metadata.test.ts tests/chat-product-intent-dispatch.test.tsx tests/chat-direct-slash-mode-follow-up.test.tsx tests/chat-direct-slash-mode-work-projection.test.tsx tests/chat-direct-slash-mode-supervised-boundary.test.tsx`
  passed with 37 tests; `npx tsc --noEmit -p tsconfig.server.json` passed;
  `npm run build:test-ui` passed.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/shared/**` | Create/Modify | Shared pure product-intent slash parser for Web and Telegram ingress. |
| `src/products/chat/renderer/components/Composer.tsx` (or equivalent) | Modify | Hook web composer to invoke shared parser on `/`-prefix before send (Task 1.8). |
| `src/products/chat/**` | Modify | Write posture system segments, keep direct routing ownership, track active anchor current state with full lifecycle. |
| `src/platform/transports/telegram/**` | Modify | Route product-intent commands separately from transport-control commands; sync command-menu entries via existing `setMyCommands`. |
| `src/platform/supervision/**` | Reuse/Modify | Resolve capability profile through existing provider capability bootstrap config; keep follow-up task/run work inside existing supervision boundaries. |
| `src/products/work/api/**` | Modify | Create/link Work Item anchors through existing Work/Core boundaries; populate `conversationId` and additive metadata only (no new Core fields). |
| `src/products/code/api/**` | Modify | Create/link Code-bound task/run intent through existing Code boundaries; gated by Work Item anchor existing first. |
| `tests/**` | Modify/Create | Command parsing, capability bridge, prompt protocol, schema validation, turn separation, active-anchor lifecycle, and projection coverage. |
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
  starts a fresh intake (no auto-resume). Direct `/work` <-> `/code` switches
  supersede the old draft anchor instead of leaving it orphaned; if policy
  cannot create the replacement, or `/chat` abandons the posture, the old draft
  anchor is cancelled with posture-abandoned metadata while the active cache is
  cleared.
- Draft Work Item anchor creation and task/run follow-up are turn-separated.
  The successful Work Item anchor is surfaced to the user before the same Cat's
  chat-only Concierge reply and before any Conductor-style follow-up can run.
  SPEC-082 supervision gates apply on top of this separation. Future agent-tool
  exposure for `createWorkItem`,
  `createTask`, or `createRun` must preserve this with a platform per-turn
  capability gate, not prompt-only instructions.
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
  - `/work` <-> `/code` direct switches supersede the old draft anchor and
    cancel it when still draft
- **Prompt-behavior tests**:
  - Concierge prompt asks one focal question per turn, not stacked
  - prompt surfaces a current-understanding recap before proposing task/run
    follow-up
  - prompt proposes follow-up only when schema is satisfied or the
    clarification budget is exhausted
- **Turn-separation tests**:
  - successful draft anchor creation in turn N dispatches at most a chat-only
    Concierge reply from the same direct Cat
  - successful draft anchor creation in turn N does not dispatch `createTask`,
    `createRun`, or Code execution in turn N
  - follow-up execution prompt/context appears only in turn N+1 or later
    (next user turn)
  - separation holds independently of SPEC-082 approval gate state
  - draft anchor result is surfaced to the user in the same turn it was created
  - if `createWorkItem` becomes a real agent tool grant, prompt-only
    enforcement tests must be replaced with per-turn capability-gate tests
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
  - no product direct Work/Code task/run execution calls
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
| Anchor creation lands without prompt/schema support | High | Phase 3 splits command gating, Concierge prompt, and schema validation into separate tasks/tests. |
| `createTask` / `createRun` chained into the same turn as draft anchor creation | High | Phase 3 Task 3.2e allows only chat-only Concierge dispatch in the command turn and enforces durable/execution turn separation in the dispatch layer; tested in Task 3.6. |
| Future tool exposure weakens turn separation into prompt-only behavior | High | ADR-101 and this plan require a platform per-turn capability gate before `createWorkItem`, `createTask`, or `createRun` are exposed as agent tools. |
| Concierge stacks multiple questions per turn, overwhelming the user and burning the clarification budget | Medium | Phase 3 Task 3.2b prompt protocol mandates one focal question per turn with a recap before creation; tested in Task 3.6. |
| Active-anchor cache leaks across postures (e.g. `/chat` does not detach, `/work` after `/chat` silently resumes prior Work Item, or `/work` -> `/code` leaves an orphan draft) | Medium | Phase 1 Task 1.5 implements full lifecycle (clear and cancel abandoned draft on `/chat`, clear on terminal status, no auto-resume, supersede or abandon on target switch); covered by unit tests in Task 1.5 and integration tests in Phase 5. |
| Direct lane silently hands off to another Cat | Medium | Store/source context checks require the same direct audience Cat unless the owner explicitly switches. |
| Work Items become invisible outside Chat | Medium | Projection tests cover Work/Code surfaces and source direct-lane references. |
| SPEC-038 `/help` falls out of sync with product-intent command surface | Low | Task 1.9 owns the `/help` and `/commands` text update; manual test in Phase 6 verifies the listing. |
| Verification pollutes user state | Medium | Prefer isolated stores/tests; manual durable writes require explicit user approval per AGENTS.md. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-06 | Follow-up Concierge hardening: strong `/work` and `/code` command turns now create the draft anchor, surface the system acknowledgement, and immediately start the same direct Cat's chat-only Concierge turn. Telegram `from.language_code` now drives first-turn i18n, abandoned draft anchors are cancelled when posture is cleared without replacement, and the targeted suite passed with 37 tests plus server typecheck and UI test build. |
| 2026-05-06 | Follow-up review hardening: product-intent acknowledgements, human-gate choices, and draft placeholder text now use i18n catalog entries; draft metadata records localization keys; stale follow-up prompts validate the Work Item's source conversation before injecting Concierge instructions; `/work` <-> `/code` direct switches supersede the prior draft anchor; ADR-101/PLAN-092 now require future tool exposure to use platform per-turn capability gates rather than prompt-only policy. |
| 2026-05-06 | MVP close-out: Phase 6 verification notes are complete. Final targeted direct slash-mode suite passed (37 tests), `npx tsc --noEmit -p tsconfig.server.json` passed, and `npm run build:test-ui` passed. Web and Telegram notes document the non-persistent verification path used to avoid writing live demo records without explicit approval. |
| 2026-05-06 | Supervised boundary slice: Core now has a single WorkItem-to-Task link helper; Work task creation and Code task creation accept `workItemId`, so direct slash-mode anchors can be promoted through existing Work/Code task APIs before Work supervised-run or Code execution APIs start. Tests prove Chat does not create runs directly, Work run creation waits until Work task linkage, and Code task creation links the anchor before execution. |
| 2026-05-06 | Code projection slice: Code dashboard read-model now exposes code-target Work Item anchors, including draft anchors created from direct `/code` chat before any task/run bridge exists. Source-level projection tests cover both Work and Code visibility. |
| 2026-05-06 | Final validation slice: targeted direct slash-mode suite passed (28 tests), `npx tsc --noEmit -p tsconfig.server.json` passed, and `npm run build:test-ui` passed. No `docs/terminology.md` update was needed because no new durable terminology was introduced beyond `directSlashMode` metadata already documented in SPEC-104/PLAN-092. Live Web/Telegram manual verification was not executed in this session to avoid writing verification records into the user's persisted dev state without explicit approval. |
| 2026-05-06 | Human-gate UI slice: weak/unknown system acknowledgements now reuse existing chat message choices to show inline next-step actions, including the Work Items path as the primary option while keeping the same metadata path for transport/deep-link handling. |
| 2026-05-06 | Spec alignment slice: SPEC-104 and PLAN-092 now reflect the implemented MVP contract: strong slash-mode command turns create a draft Work Item anchor directly, may dispatch only chat-only Concierge clarification in the same turn, and keep task/run/Code execution on later turns. |
| 2026-05-06 | Human-gate slice: weak/unknown `/work` and `/code` responses now carry a machine-readable human gate with draft summary and suggested next actions, use Telegram-safe copy without provider jargon, and tests assert no durable Work Item is created on weak/unknown paths. |
| 2026-05-06 | Work projection slice: added coverage proving Work product projections list draft Work Items created from direct slash-mode chat, including source conversation and assigned direct Cat context. |
| 2026-05-06 | Follow-up prompt/context slice: direct-lane follow-up messages now carry `directSlashModeIntakeRef` when an active anchor exists, runtime context forwards the anchor metadata, and Cat dispatch instructions include the Concierge protocol (one focal question, priority order, recap before task/run follow-up, no duplicate Work Item anchor). |
| 2026-05-06 | Active-anchor lifecycle slice: `/chat` posture changes now write `directSlashMode.activeAnchor = null` with `clearReason: chat_posture`; terminal Work Items (`completed`, `cancelled`, `archived`) clear the cached anchor, and a later `/work` or `/code` starts a fresh intake even when posture itself is unchanged. Tests cover chat-clear, terminal-clear, and no duplicate anchor on idempotent repeats. |
| 2026-05-06 | Work Item anchor slice: strong direct `/work` and `/code` posture changes now create a draft Core Work Item anchor with `conversationId`, `metadata.directSlashModeIntake`, `metadata.directSlashMode.activeAnchor`, and `metadata.planning.productHint`; repeated posture commands do not duplicate anchors. Weak/unknown direct Cats now record `directSlashMode.humanGate.kind = human_gate_required` and create no durable Work Item. |
| 2026-05-06 | Direct audience capability slice: product-intent posture changes now require exactly one direct audience Cat, resolve that Cat's execution target through the existing provider capability profile resolver, consume the PLAN-080 bootstrap config, and record `strong_agent` / `weak_worker` / `unknown` in `directSlashModePostureChange.capabilityProfileKind`. Tests cover no-audience, multi-audience, weak, strong, and unknown outcomes without provider-name inference. |
| 2026-05-06 | Posture event slice: Web and Telegram product-intent commands now enter the same Chat dispatch boundary; recognized `/chat` / `/work` / `/code` messages write the user command, a visible system acknowledgement, and a Core system segment carrying `directSlashModePostureChange`. Non-direct usage produces a visible rejection without dispatching to runtime, and repeated posture commands are recorded as unchanged (`changed: false`). |
| 2026-05-06 | Web composer slice: outgoing Web messages are tagged with `messageMetadata.productIntentCommand` when the shared parser recognizes `/chat`, `/work`, or `/code`; non-product slash commands still pass through as ordinary message content. |
| 2026-05-06 | Telegram discoverability slice: command catalog and localized `/help` text now list `/chat`, `/work`, and `/code` without registering those product-intent commands as transport-control handlers. SPEC-038 now documents the discoverability-only relationship. |
| 2026-05-06 | Implementation started: added the Chat-owned `parseProductIntentCommand` shared parser with tests covering `/chat` / `/work` / `/code`, Telegram bot suffix stripping, multiline `argumentText`, transport-control separation, prefix false positives, and ordinary-text pass-through. Telegram/Web ingress hooks remain in Task 1.8 and later slices. |
| 2026-05-06 | Third-pass close-out: locked active-anchor lifecycle (eager clear on `/chat`, clear on Work Item terminal status `completed`/`cancelled`/`archived`, no auto-resume on next `/work`); locked per-turn separation between draft anchor creation and task/run follow-up; specified the Concierge prompt protocol (one focal question per turn, default priority order, recap-before-follow-up); confirmed `CoreWorkItemRecord.conversationId` already exists and `CoreRecordMetadata` is open-ended so no Core schema changes are required; added Task 1.8 for web composer ingress and Task 1.9 for SPEC-038 `/help` follow-up. Risks table updated to cover prompt-stacking, same-turn execution leakage, and active-anchor lifecycle drift. |
| 2026-05-06 | Follow-up review close-out: locked posture to message-stream system segments, chose `/code` as Work Item anchor with Code target, defined source-ref metadata and active-anchor cache, split prompt/tool/schema tasks, and added parser/menu/idempotency/non-direct requirements. |
| 2026-05-06 | Plan created with ADR-101 and SPEC-104 to capture direct-message slash-mode work intake MVP. |

---

*Created: 2026-05-06*
*Author: Codex*
