# ADR-105: Adopt a Phase-Scoped Work Tool Surface

> Keep Cats Work from becoming a generic project-management clone by exposing
> bounded, auditable Work tools to strong Cats in explicit phases.

## Status

Proposed

## Context

Cats Chat and Telegram are becoming natural work-intake surfaces. The owner
expects to say ordinary things such as "remember these todos" or "Boss Cat,
start working through the list" and have Cats materialize durable Work Items
that can later be triaged, grouped, and executed.

The current implementation has several partial pieces:

- slash-mode `/work` and `/code` can create draft Work Item anchors when the
  direct audience Cat is classified as `strong_agent`
- natural-language product intent can ask a strong Cat to propose Work/Code
  intake
- Cats Work has Core Project / WorkItem records plus Work Graph projections
- Cats Work supervision has a supervised tool boundary, but its first tools are
  not a full Project / WorkItem authoring surface
- the runtime MCP facade is additive and currently focused on runtime/session
  tools, not Cats-owned Work planning mutations

This leaves a product gap. Strong models are not consistently told, through a
structured control surface, that they may capture work, organize Work Items, or
ask Boss Cat to start execution. Relying only on prompt text would make
persistence, permissions, audit, approval, and retry behavior ambiguous.

At the same time, exposing broad Project / WorkItem CRUD directly to models
would recreate the project-management-system trap: Cats would spend too much
energy cloning Redmine, Bugzilla, GitHub Issues, or other trackers instead of
serving as an agent-native work intake, triage, and execution layer.

## Decision

Cats will expose a Cats-owned, supervised, phase-scoped Work tool surface.

The tool surface is not a generic MCP-first CRUD API. It is a product-owned
tool contract that may later be projected through runtime tool catalogs or an
MCP facade. Direct product APIs remain the application boundary; MCP is an
adapter surface, not the source of truth.

The tool surface is divided into phases:

1. **Intake**
   - captures natural-language todos from Chat or Telegram
   - may split one message into multiple candidate Work Items
   - may create draft or planned Work Item anchors
   - must not start execution in the same phase

2. **Triage**
   - organizes existing Work Items
   - may create or assign Projects
   - may update title, summary, priority, kind, status within planning states,
     links, and source metadata
   - must not claim completion or start runtime work by itself

3. **Execution Preparation**
   - lets Boss Cat or an approved strong operational Cat prepare a Work Item
     for action
   - may create a Task from a Work Item
   - may create a Mission or request a Run through the existing supervision
     and approval boundaries
   - must keep capture and execution separated by at least one owner-visible
     acknowledgement or explicit user request

4. **External Tracker Binding**
   - links Cats Work Items to external issues
   - may import, export, or sync with GitHub Issues, Redmine, Bugzilla, GitLab,
     Gitea, or similar systems
   - must treat external trackers as bindings, not as the internal Cats Core
     schema

Tool names should use Cats-owned names such as:

- `work.item.capture`
- `work.item.propose_split`
- `work.item.update`
- `work.item.assign_project`
- `work.project.lookup`
- `work.project.create`
- `work.item.prepare_execution`
- `work.task.create_from_work_item`
- `work.external.link_issue`

The exact schemas and first rollout are defined in SPEC-109 and PLAN-099.

## Consequences

### Positive

- Strong Cats get a clear, structured way to capture and organize work.
- Chat and Telegram can become first-class work-intake surfaces without
  turning every chat into a Project / Task / Run.
- Boss Cat can operate over a durable Work Item backlog rather than scraping
  transcripts.
- Capture, triage, and execution become separately permissioned and auditable.
- External trackers remain integration targets instead of becoming the Cats
  internal model.

### Negative

- The platform needs several new tool schemas, validators, policy gates, and
  tests before strong models can use the capability safely.
- Some owner flows will require one extra confirmation or follow-up turn before
  execution begins.
- Existing slash-mode and proposal flows must be reconciled with the new shared
  tool surface instead of continuing as one-off logic.

### Neutral

- WorkItem remains the durable planning anchor. Surface concepts such as todo,
  bug, issue, story, requirement, and epic stay metadata-level Work Item kinds.
- MCP remains useful later, but the first implementation belongs in Cats-owned
  supervised tools and product delegates.
- The first slice can be implemented without changing Core record fields by
  using existing metadata and Activity records.

## Alternatives Considered

### Alternative 1: Keep prompt-only instructions

- **Pros**: Fastest to prototype; no new tool schemas.
- **Cons**: Models can misunderstand whether they may mutate state; audit and
  retry behavior remain weak; persistence depends on product-side heuristics.
- **Why rejected**: Prompt text is not enforcement. Work capture and execution
  affect durable state and need structured control surfaces.

### Alternative 2: Give strong models broad Project / WorkItem CRUD

- **Pros**: Simple mental model for implementers; many PM operations become
  possible immediately.
- **Cons**: Encourages model-authored arbitrary mutations; blurs intake,
  triage, and execution; makes permissioning too coarse.
- **Why rejected**: The product needs phase-scoped agency, not full CRUD.

### Alternative 3: Make MCP the primary Work API

- **Pros**: Standard tool protocol; could be reused by external agent hosts.
- **Cons**: Risks bypassing product-owned permissions, UI semantics, approval
  gates, and Core ownership rules.
- **Why rejected**: MCP is an adapter plane. Cats-owned supervised tools should
  define the contracts first.

### Alternative 4: Use external trackers as the system of record

- **Pros**: Avoids building planning features; GitHub/Redmine/Bugzilla already
  solve many PM workflows.
- **Cons**: Breaks local-first agent orchestration; couples Boss Cat execution
  to external tracker schemas; fails offline/self-hosted cases.
- **Why rejected**: External trackers should bind to Work Items, not replace
  Cats Core.

## References

- [SPEC-109: Phase-Scoped Work Tool Surface](../specs/SPEC-109-phase-scoped-work-tool-surface.md)
- [PLAN-099: Phase-Scoped Work Tool Surface Rollout](../plans/PLAN-099-phase-scoped-work-tool-surface-rollout.md)
- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](./101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [ADR-102: Use Cat-Authored Product Intent Proposals](./102-use-cat-authored-product-intent-proposals.md)
- [ADR-103: Use Preset-Neutral Product Intent Intake](./103-use-preset-neutral-product-intent-intake.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [Tool Call Registry](../tool-calls.md)
- [Agent Control Surface Registry](../agent-control-surfaces.md)

---

*Decision made: 2026-05-13*
*Decision makers: Codex, owner discussion*
