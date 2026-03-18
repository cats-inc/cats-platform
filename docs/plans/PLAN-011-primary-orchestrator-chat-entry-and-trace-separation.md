# PLAN-011: Primary Orchestrator Chat Entry and Trace Separation

Status: Approved

## Scope

Implement the product direction defined in
[SPEC-011](../specs/SPEC-011-primary-orchestrator-chat-entry-and-trace-separation.md)
and
[ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md).

This plan covers the first implementation path for:

- one visible `Primary Orchestrator Cat` per `cats-inc` environment
- `+ New Chat` starting as a conversation with that Cat
- keeping orchestration runs and events as system-layer records
- separating main transcript dialogue from orchestration activity or trace

This plan is explicitly **not** a full Telegram, LINE@, approval, or desktop
packaging implementation plan.

Terminology rule:

- `Primary Orchestrator Cat` is the formal product and domain term
- `Boss Cat` is the preferred user-facing UI label

## Hard Constraints

- Do not introduce multiple competing public orchestrator identities in the
  first slice.
- Do not collapse orchestration run or event records into raw chat transcript
  messages.
- Do not treat the activity or trace panel as permission to turn the chat UI
  into a developer console.
- Keep `cats-runtime` as the only runtime boundary.
- Keep the current Cats registry model intact; the primary orchestrator must be
  selected from or represented as a Cat, not as a separate incompatible actor
  type.

## Phases

### Phase 1: Contract and State Freeze

- [ ] Define the persisted link between the Cats registry and the
      `Primary Orchestrator Cat`.
- [ ] Define which existing `globalOrchestrator` fields remain product-owned
      settings versus which fields move onto or reference the selected Cat.
- [ ] Define the minimum orchestration record types needed for the first
      activity or trace surface:
      - run
      - event
      - status
      - summary note
- [ ] Freeze the first chat-entry rule:
      `+ New Chat` creates a conversation addressed to the selected primary
      orchestrator.

**Deliverables**: approved state shape, compatibility rules, and UI-entry
semantics.

### Phase 2: Store and API Seams

- [ ] Extend the workspace or core-backed store to persist the selected
      `Primary Orchestrator Cat`.
- [ ] Preserve compatibility with the current global-orchestrator settings while
      the new model lands.
- [ ] Add or refine product APIs needed for:
      - reading primary orchestrator state
      - assigning or changing the primary orchestrator
      - reading orchestration activity or trace for a conversation
- [ ] Define how orchestration system notes are derived without making the
      transcript the source of truth for trace data.

**Deliverables**: stable persistence and API seams for primary-orchestrator
selection plus orchestration activity reads.

### Phase 3: Settings > Cats Primary Orchestrator UX

- [ ] Add a dedicated `Boss Cat` section to `Settings > Cats`.
- [ ] Support assigning an existing Cat as the primary orchestrator.
- [ ] Support creating a new Cat and assigning it as the primary orchestrator in
      the same flow.
- [ ] Surface at least the first visible primary-orchestrator metadata:
      - name
      - status
      - transport-binding readiness placeholder
      - future keep-warm or auto-start placeholder

**Deliverables**: settings-hosted primary-orchestrator management surface.

### Phase 4: New Chat and Conversation Entry Refactor

- [ ] Change `+ New Chat` so it starts a conversation with the selected primary
      orchestrator rather than creating an implied empty room.
- [ ] Make the primary orchestrator the implicit lead participant in new chat
      state.
- [ ] Keep assigned Cats as explicit collaborators added later by the operator
      or orchestrator.
- [ ] Ensure the chat header and related UI make the visible orchestrator entry
      identity clear without adding unnecessary persona clutter.

**Deliverables**: orchestrator-first new-chat flow and updated conversation
ownership semantics.

### Phase 5: Activity / Trace Separation

- [ ] Add a dedicated activity or trace panel adjacent to the chat experience.
- [ ] Define which orchestration milestones appear as short transcript system
      notes versus which remain side-panel-only events.
- [ ] Render dispatch, blocked, retry, and completion states in the side panel
      without exposing raw internal logs by default.
- [ ] Keep transcript rendering focused on human-meaningful dialogue.

**Deliverables**: separate activity surface and cleaner transcript behavior.

### Phase 6: Validation, Migration, and Documentation

- [ ] Add tests for primary-orchestrator selection and persistence.
- [ ] Add tests for new-chat behavior when a primary orchestrator is present or
      missing.
- [ ] Add tests for activity or trace reads and transcript-note behavior where
      practical.
- [ ] Update architecture, requirements, and progress docs once implementation
      starts landing.

**Deliverables**: verified migration path and aligned documentation.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/shared/app-shell.ts` | Review / extend | Current workspace and orchestrator contract needs a primary-orchestrator seam |
| `src/shared/core.ts` | Extend | Orchestration run and event records likely belong near shared product contracts |
| `src/core/model.ts` | Extend | Keep Cats Core mappings aligned with visible-orchestrator and system-trace separation |
| `src/workspace/store.ts` | Modify | Persist primary orchestrator selection and any first activity records |
| `src/workspace/model.ts` | Refactor | Change new-chat and participant semantics around the primary orchestrator |
| `src/server.ts` | Extend | Add primary-orchestrator and activity-read APIs while preserving compatibility |
| `src/renderer/App.tsx` | Refactor carefully | Add settings section, orchestrator-first new-chat flow, and activity panel |
| `src/renderer/api.ts` | Extend | Support primary-orchestrator selection and activity reads |
| `tests/` | Expand | Cover state persistence, APIs, and renderer-facing orchestration semantics |
| `docs/` | Update | Keep roadmap, progress, and architecture synchronized once implementation begins |

## Validation

- The product has one clearly selected visible `Primary Orchestrator Cat`.
- `+ New Chat` opens a conversation addressed to that Cat.
- The transcript remains readable and is not dominated by orchestration logs.
- Operators can inspect orchestration progress in a dedicated side surface.
- The implementation remains compatible with future internal active
  orchestrators without exposing them as competing public entry identities.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Primary-orchestrator selection conflicts with the current global-orchestrator settings model | High | Land a compatibility seam first, then migrate fields gradually |
| Activity UI becomes a log viewer instead of an operator-facing trace | High | Define a small curated event vocabulary before implementation |
| New-chat semantics break existing assumptions about empty draft chats | Medium | Keep a staged migration path and test the draft-to-conversation flow explicitly |
| The Cat persona and orchestration records drift apart conceptually | Medium | Keep API naming explicit: persona identity vs run/event records |
| Transport-binding placeholders are mistaken for fully implemented Telegram/LINE support | Medium | Label transport readiness as planned or placeholder until real relays land |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement SPEC-011 / PLAN-011. Treat one selected `Primary Orchestrator Cat`
> as the visible default public chat entry. Make `+ New Chat` start with that
> Cat. Keep orchestration runs and events as system-layer records, and expose
> them in a side activity or trace panel rather than flooding the main
> transcript. Preserve the current Cats registry model and `cats-runtime`
> boundary.

---

*Last updated: 2026-03-19*
