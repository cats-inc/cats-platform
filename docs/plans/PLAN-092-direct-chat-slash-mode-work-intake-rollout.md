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

1. parse direct-message product-intent slash commands;
2. resolve the direct audience Cat and its execution target;
3. reuse the provider capability profile resolver;
4. gate durable Work/Code creation by `strong_agent` vs weak/unknown;
5. create/link Work/Code anchors through existing product APIs and supervised
   run boundaries.

The direct lane remains the conversational follow-up surface.

## Implementation Phases

### Phase 1: Contract and command parser

- [ ] Task 1.1: Add a small product-intent command parser for `/chat`,
      `/work`, and `/code`, separate from Telegram transport-control commands.
- [ ] Task 1.2: Add tests proving `/start`, `/help`, `/commands`, `/status`,
      and `/mode` remain transport-control commands while `/chat`, `/work`, and
      `/code` are product-intent commands.
- [ ] Task 1.3: Represent product posture as direct-lane metadata or another
      current-state seam that does not change the channel kind.
- [ ] Task 1.4: Add tests proving direct lanes remain `direct_message` after
      posture changes.

**Deliverables**: command recognition and posture state exist without durable
work creation.

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

### Phase 3: Strong Cat clarification and Work/Code draft anchor

- [ ] Task 3.1: Define the minimal Work/Code anchor draft payload: title,
      summary, source conversation, audience Cat, unknowns/assumptions, proposed
      next action, and target product hint.
- [ ] Task 3.2: Wire strong `/work` posture so the Cat can ask clarification
      questions before durable creation.
- [ ] Task 3.3: Create the Work Item through existing Core/Work creation paths
      once the strong Cat has sufficient information.
- [ ] Task 3.4: Wire strong `/code` posture to create a Code-bound task/run
      intent, linking a Work Item when operator-visible planning/follow-up is
      needed.
- [ ] Task 3.5: Add tests proving the same direct audience Cat remains attached
      to the follow-up path after anchor creation.

**Deliverables**: strong direct Cats can create durable anchors through existing
product boundaries.

### Phase 4: Weak / unknown human gate

- [ ] Task 4.1: Define the weak/unknown response contract:
      `human_gate_required`, reason, optional draft summary, and suggested
      next actions.
- [ ] Task 4.2: Add a minimal Web direct-lane action for human-confirmed Work
      Item creation, or explicitly route to the existing manual Work Item create
      surface if that is the smaller implementation.
- [ ] Task 4.3: Add Telegram-safe copy for weak/unknown direct Cats that asks
      the human to confirm/create or switch Cats without exposing internal
      provider jargon.
- [ ] Task 4.4: Add tests proving weak/unknown Cats cannot create durable Work
      Items, Tasks, Runs, or Code execution without the human gate.

**Deliverables**: weak and unknown paths fail safe while remaining useful.

### Phase 5: Follow-up and supervised execution bridge

- [ ] Task 5.1: Link created Work/Code anchors back to the source direct
      conversation and audience Cat.
- [ ] Task 5.2: Ensure follow-up messages in the direct lane can reference the
      created Work Item / Code task and current run state.
- [ ] Task 5.3: Start supervised task/run execution only through existing
      Work/Code run APIs and supervision boundaries.
- [ ] Task 5.4: Add tests proving direct slash-mode flows do not call runtime
      create/send directly from product code.
- [ ] Task 5.5: Add read-model/projection tests proving Work/Code surfaces show
      anchors created from direct chat.

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
| `src/products/chat/**` | Modify | Parse direct product-intent slash commands, keep direct routing ownership. |
| `src/platform/transports/telegram/**` | Modify | Route product-intent commands separately from transport-control commands. |
| `src/platform/supervision/**` | Reuse/Modify | Resolve capability profile through existing provider capability bootstrap config. |
| `src/products/work/api/**` | Modify | Create/link Work Item anchors through existing Work/Core boundaries. |
| `src/products/code/api/**` | Modify | Create/link Code-bound task/run intent through existing Code boundaries. |
| `tests/**` | Modify/Create | Command, capability, strong, weak, and projection coverage. |
| `docs/specs/SPEC-104-direct-chat-slash-mode-work-intake.md` | Modify | Keep requirement details aligned with implementation. |
| `docs/plans/PLAN-092-direct-chat-slash-mode-work-intake-rollout.md` | Modify | Track progress by slice. |

## Technical Decisions

- Reuse existing provider capability profiles; do not add Cat-level or Chat-mode
  strong/weak flags.
- Keep `/chat`, `/work`, and `/code` as product-intent commands. They do not
  create new persistent channel kinds.
- Keep `Concierge` / `Conductor` as phases of the same direct audience Cat for
  this MVP.
- Weak/unknown direct Cats require human confirmation; no automatic hand-off to
  another Cat in this plan.
- Work/Code durable record creation happens through product-owned APIs above
  Core, not through runtime sessions.

## Testing Strategy

- **Unit tests**:
  - slash parser recognizes product-intent commands
  - transport-control command set remains separate
  - direct audience resolver handles exactly-one / none / many cases
  - capability bridge returns `strong_agent`, `weak_worker`, or `unknown`
  - weak/unknown create attempts return human-gated results
- **Integration tests**:
  - strong `/work` creates a Work Item with source conversation and Cat context
  - strong `/code` creates Code-bound task/run intent and optional Work anchor
  - weak/unknown `/work` cannot create durable records without human gate
  - Work/Code projections include anchors created from direct chat
- **Boundary tests**:
  - no provider-name/model-name strong/weak inference
  - no product direct runtime create/send calls
  - no retired route/control labels introduced
- **Manual testing**:
  - Web direct lane: `/work`, clarification, create Work Item, follow-up
  - Telegram direct lane: `/work`, weak/strong behavior, follow-up link/copy

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Product-intent slash commands collide with Telegram control commands | High | Keep parser layers separate and test the SPEC-038 command set. |
| Implementation reintroduces mode taxonomy | High | Tests and docs must assert channel kind remains `direct_message`. |
| Strong/weak logic drifts into provider-name checks | High | Capability bridge tests use PLAN-080 config fixtures and absent-config cases. |
| Weak Cat creates durable work by accident | High | Centralize durable-action permission result and test weak/unknown paths. |
| Direct lane silently hands off to another Cat | Medium | Store/source context checks require the same direct audience Cat unless the owner explicitly switches. |
| Work/Code anchors become invisible outside Chat | Medium | Projection tests cover Work/Code surfaces and source direct-lane references. |
| Verification pollutes user state | Medium | Prefer isolated stores/tests; manual durable writes require explicit user approval per AGENTS.md. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-06 | Plan created with ADR-101 and SPEC-104 to capture direct-message slash-mode work intake MVP. |

---

*Created: 2026-05-06*
*Author: Codex*
