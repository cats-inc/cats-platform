# PLAN-032: Cats Code MVP Fan-Out, Relay, and Convergence

> Deliver the first narrow vertical slice from `SPEC-043` by replacing the
> user's manual multi-agent copy/paste relay with a persistent project thread,
> a thread-wide agent roster, parallel prompt fan-out, one-click relay, and a
> convergence summary artifact.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Stopped (Relay sidebar surface retired) |
| **Owner** | Codex |
| **Reviewer** | User |

## Development Stop Notice

This plan is stopped as a standalone `Cats Code` sidebar surface. The
`/code/relay` route, sidebar `Relay` entry, relay-thread UI, and follow-on
relay/convergence implementation tasks in this document must not be extended
or completed.

The durable direction is to express strong-agent collaboration through
`+Team code` and `+Peer code` presets above the shared interaction engine.
Relay-like provenance, critique, and convergence may still exist inside those
presets, but this plan no longer authorizes a separate Relay navigation item
or a separate Code relay workspace.

## Related Spec / Dependencies

- [SPEC-043: Cats Code MVP Multi-Agent Local-App Workflow](../specs/SPEC-043-cats-code-mvp-multi-agent-local-app-workflow.md)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](../specs/SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-032: Core Task Lifecycle and Wakeup Integration](../specs/SPEC-032-core-task-lifecycle-and-wakeup-integration.md)
- [SPEC-041: Cats Code v1 Local Builder Loop](../specs/SPEC-041-cats-code-v1-local-builder-loop.md)
- [PLAN-029: Cats Code v1 Local Builder Loop](./PLAN-029-cats-code-v1-local-builder-loop.md)

## Overview

`SPEC-043` defines the broader `Cats Code` MVP as a non-linear,
multi-agent, chat-first software-production thread. That scope is too broad for
the first implementation slice.

The first implementation slice should target the user's biggest current waste:
manual relay between Codex, Claude, and Gemini during early discussion and
decision convergence.

This plan intentionally does **not** try to land the whole `Cats Code` MVP in
one pass. It narrows the first execution slice to:

1. create a persistent Code project thread
2. register a thread-wide agent roster
3. send one prompt to multiple configured coding agents in parallel
4. relay one agent's answer to one or more other agents without copy/paste
5. persist the resulting exchange as thread history
6. produce a convergence summary artifact that captures agreement,
   disagreement, and open questions

This slice should be useful on its own even before `shape`, `fit`,
implementation, or human-verification loops are deeply integrated.

Under the newer shared-engine semantics, this plan should be read primarily as
`+Peer code`-style branch/review behavior above a parallel container. It is not
the same thing as one-thread `concurrent` fan-out.

The make-or-break risk for this slice is the runtime-backed relay contract. If
the product cannot automatically send a prompt through `cats-runtime` and
receive a machine-usable response from at least one real provider target, the
slice collapses back into a prettier version of manual relay. The plan
therefore starts with a runtime-bridge spike before broader fan-out work.

## Slice Boundary

### In scope for PLAN-032

- persistent Code project thread container
- round records for the relay/convergence workflow
- visible agent roster with provider/interface/quota context
- parallel discussion fan-out to configured runtime-backed provider targets
- one-click relay for critique and rebuttal
- convergence summary artifact generation
- promotion of convergence output into a draft research or decision artifact
- waiting/resume states for agent work and user arbitration

### Explicitly deferred after PLAN-032

- wireframe generation and shape-mode tooling
- local-app tech-fit recommendation flow
- environment bootstrap automation
- primary-coder implementation handoff
- runtime-backed code execution and preview beyond existing `PLAN-029`
- manual testing ingestion
- full UI polish for the long-term `Cats Code` workspace

## Historical Implementation Phases (Do Not Complete)

### Phase 0: Runtime Bridge Spike and Round-Trip Proof

- [ ] Pick the first MVP runtime transport shape for relay automation
- [ ] Prove one end-to-end automated round trip against one real
      `cats-runtime` provider target before generalizing the abstraction
- [ ] Freeze the minimum runtime relay contract for the first slice, including at
      least:
      - agent identity
      - request payload shape
      - final response payload
      - failure shape
      - optional streaming events
      - optional quota note
- [ ] Explicitly reject manual pasteback as sufficient completion for this
      phase
- [ ] Document what the first runtime-backed slice does **not** normalize yet
      so later fan-out work does not over-assume parity across providers

**Deliverables**: one proven automated runtime relay round trip and a frozen
minimum runtime-backed contract for the relay slice.

### Phase 1: Project Thread and Agent Roster Foundation

- [ ] Define a product-owned Code project-thread record and persistence seam
      that can outlive one relay round
- [ ] Define a round record for discussion-focused rounds with:
      - mode
      - objective
      - startedAt / endedAt
      - waiting state
      - linked artifact ids
- [ ] Define explicit round-boundary rules for the first slice:
      - a round starts when the user or product opens a new objective or mode
        focus
      - a round may continue through retries if the objective is unchanged
      - a round ends when a stable artifact bundle is produced, the thread
        enters a waiting state, or the thread hands off into a different
        primary mode
- [ ] Define a thread-wide agent-roster record with at least:
      - provider id
      - instance / connector target
      - availability state
      - optional quota or subscription note
      - recent role
- [ ] Reuse existing provider catalog truth where possible instead of inventing
      a second provider vocabulary for Codex / Claude / Gemini
- [ ] Add additive API routes or state helpers so the renderer can create,
      fetch, and resume Code project threads
- [ ] Add a minimal thread-surface stub in this phase so later fan-out and
      convergence work is visible as it lands rather than waiting for a final
      UI pass

**Deliverables**: persistent project-thread state and a usable agent-roster
contract for relay work, plus a minimal visible thread shell.

### Phase 2: Parallel Fan-Out Dispatch and Relay Execution

- [ ] Lift the validated Phase-0 runtime contract into the first relay
      abstraction for discussion rounds
- [ ] Keep discussion/workflow state product-owned while delegating provider
      execution to `cats-runtime`
- [ ] Add a fan-out action that sends one discussion prompt to multiple roster
      entries in parallel
- [ ] Persist per-agent dispatch state:
      - requested
      - running
      - completed
      - failed
      - waiting_for_user
- [ ] Add a relay action that forwards one agent response to one or more other
      agents for critique, rebuttal, or refinement without manual copy/paste
- [ ] Preserve relay provenance:
      - source agent
      - target agents
      - source message id
      - relay instruction
      - timestamp

**Deliverables**: one-thread multi-agent discussion that replaces manual
copy/paste fan-out and relay.

### Phase 3: Convergence Summary and Artifact Promotion

- [ ] Define the first convergence-summary contract with at least:
      - agreement points
      - disagreement points
      - open questions
      - recommended next step
      - drafting recommendation
- [ ] Define who generated the convergence summary and persist that identity as
      part of the artifact provenance
- [ ] Add a convergence action that can summarize a relay round once at least
      two agent outputs exist
- [ ] Make the first-slice trust model explicit:
      - summary may be generated by one nominated roster agent or by the user
      - summary must never appear as anonymous system truth
- [ ] Allow the user to promote convergence output into a first draft artifact
      such as:
      - research note
      - ADR draft
      - spec draft
- [ ] Persist the link between convergence summary, contributing agent messages,
      and promoted artifact
- [ ] Keep the summary editable or overridable by the user so convergence does
      not masquerade as final truth

**Deliverables**: a usable convergence artifact that can directly feed document
work without another manual summarization pass.

### Phase 4: Thread Surface and Resume Flow

- [ ] Expand the initial thread-surface stub so it shows:
      - current round objective
      - agent roster
      - per-agent answer status
      - relay actions
      - convergence summary
      - waiting state
- [ ] Add explicit resume behavior for:
      - in-progress fan-out
      - pending convergence
      - waiting-for-user arbitration
- [ ] Preserve a readable timeline of round transitions, relay actions, and
      convergence artifacts
- [ ] Keep this surface narrow and functional; do not block the slice on final
      workspace design

**Deliverables**: first usable `Cats Code` relay workspace for discussion and
decision convergence.

### Phase 5: Hardening and Documentation

- [ ] Add regression coverage for thread persistence, roster updates, fan-out,
      relay provenance, and convergence summary generation
- [ ] Document how this slice relates to later `shape`, `fit`, `build`, and
      `human_verify` modes
- [ ] Log deferred follow-ons needed for:
      - wireframe mode
      - tech-fit mode
      - main-coder / reviewer implementation loop
      - manual testing ingestion

**Deliverables**: stable first-slice relay/convergence workflow with explicit
follow-on seams.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/code/api/**` | Modify/Create | Thread routes, relay actions, convergence-summary endpoints |
| `src/products/code/state/**` | Modify/Create | Project-thread persistence, round state, agent-roster, relay orchestration |
| `src/products/code/renderer/**` | Modify/Create | Minimal thread surface, roster display, relay controls, convergence summary |
| `src/shared/providerCatalog.ts` | Modify (if needed) | Reuse or extend provider/instance labels for thread roster presentation |
| `src/core/**` | Modify (additive only) | Shared task/artifact helpers only if thread/artifact linking needs common support |
| `tests/**` | Modify/Create | Thread, relay, convergence, and resume regression coverage |
| `docs/specs/**` | Modify (follow-on) | Tighten `SPEC-043` only if implementation proves a planning assumption false |

## Technical Decisions

- The first slice must prove a real automated runtime-backed round trip before
  broader fan-out work begins; manual copy/paste is not considered sufficient
  completion for the connector phase.
- Keep the first relay slice product-owned at the workflow layer but
  runtime-backed at the provider-execution layer; do not add product-owned
  provider adapters.
- The first runtime bridge should stay narrow. General cross-provider
  normalization can wait until one real runtime-backed path works.
- Treat quota context as advisory routing metadata in the first slice. It may
  start as manually supplied or connector-derived metadata rather than a fully
  trusted live meter.
- Reuse existing provider catalog naming and instance descriptors so Codex /
  Claude / Gemini identity stays aligned with current product terminology.
- Convergence summaries must record who authored the summary. They are
  attributable and editable artifacts, not anonymous product output.
- Use convergence summaries as editable artifacts, not as authoritative final
  decisions.
- Keep `PLAN-032` focused on discussion relay and convergence. Builder-loop
  execution remains with `SPEC-041` / `PLAN-029`.

## Testing Strategy

- **Unit Tests**:
  thread-record normalization, round-boundary helpers, roster-entry
  normalization, relay provenance records, convergence-summary shaping
- **Integration Tests**:
  create thread -> configure roster -> fan-out prompt -> relay one response ->
  generate convergence summary -> resume waiting thread
- **Renderer/Behavior Tests**:
  thread timeline rendering, per-agent status updates, relay actions,
  convergence artifact visibility, waiting/resume states
- **Manual Testing**:
  create one Code thread, add Codex/Claude/Gemini roster entries, fan out one
  requirement question, relay the strongest answer to the other two, review the
  generated convergence summary, then promote it into a draft artifact

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Connector abstraction becomes too broad too early | High | Start with a narrow discussion-round contract and the currently relevant external coding-agent interfaces only |
| Quota data is incomplete or unreliable across agents | Medium | Treat quota as optional advisory metadata in v1 and keep user override available |
| Convergence summary hallucinates consensus | High | Preserve source-linked evidence, expose disagreements explicitly, and keep user override as a first-class action |
| Plan scope drifts into full `Cats Code` workspace delivery | High | Keep wireframe, fit, build, and human-verify work explicitly deferred from this plan |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-30 | Plan created as the first narrow execution slice for `SPEC-043`, focusing on project thread, agent roster, fan-out relay, and convergence summary rather than the whole `Cats Code` MVP |
| 2026-04-28 | Relay sidebar development stopped. Future multi-agent Code collaboration must live under `+Team code` / `+Peer code` preset flows instead of completing `/code/relay`. |

---

*Created: 2026-03-30*
*Author: Codex*
