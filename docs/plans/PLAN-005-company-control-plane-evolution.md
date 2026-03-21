# PLAN-005: Company Control Plane Evolution

Status: Draft (Exploratory, Unreviewed)

Note: This plan remains as exploratory Paperclip-informed research. It is not
the current execution path for the accepted `Cats Core v1` and Chat/Work
parallel-track plan.

## Scope

Incrementally rewrite `cats` to absorb Paperclip's company-control-plane
concepts without copying Paperclip's runtime, server, or schema. The end state
is a Cats-owned control plane where chat is one module attached to work,
governance, and outputs.

## Phases

### Phase 1: Product Model and Compatibility Layer

- [ ] Define the top-level product objects and their relationships.
- [ ] Map current channels, cats, leases, and transcripts into a compatibility
      layer for the new model.
- [ ] Introduce a store abstraction so the control-plane model can outgrow the
      current flat JSON shape safely.

**Deliverables**: stable terminology, compatibility mapping, and a domain shape
that can wrap the current phase-2 shell.

### Phase 2: Work Graph Above Chat

- [ ] Add goal, project, and work-item objects above channels.
- [ ] Attach chat threads and transcripts to work instead of using channels as
      the only root object.
- [ ] Extend the cat registry into a broader org or roster model with ownership
      context.

**Deliverables**: chat remains functional, but operators can now navigate work
objects above the channel layer.

### Phase 3: Operator Control Plane Surfaces

- [ ] Add activity, inbox, approval, and cost read models.
- [ ] Add operator-facing summary surfaces that show what is happening before
      exposing raw logs.
- [ ] Add governance actions and budget-aware control points where the work
      graph requires them.

**Deliverables**: `cats` gains board-level visibility and control-plane
surfaces instead of only chat views.

### Phase 4: Workspaces, Execution, and Outputs

- [ ] Model durable project workspaces separately from execution workspaces.
- [ ] Attach runtime sessions, services, artifacts, previews, and work outputs
      to projects and work items.
- [ ] Add execution history surfaces hydrated from `cats-runtime`.

**Deliverables**: operators can see where work ran, what it produced, and what
still needs review or follow-up.

### Phase 5: Extension Seams and Alternate Entry Points

- [ ] Define a thin extension seam for future plugin-like capabilities.
- [ ] Add alternate operator entrypoints such as Telegram, tray, or desktop
      flows without bloating the core chat surface.
- [ ] Revisit multi-company packaging and reusable company templates only after
      the core control plane is stable.

**Deliverables**: `cats` keeps a thin core while leaving room for richer
future modules.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/shared/app-shell.ts` | Modify | Expand the shared product contract beyond channels and cats |
| `src/workspace/` | Refactor | Split phase-2 chat state from future control-plane domain state |
| `src/server.ts` and route modules | Modify | Add higher-level operator APIs without leaking runtime internals |
| `src/renderer/` | Modify | Add control-plane surfaces above the current chat shell |
| `tests/` | Expand | Cover compatibility, migration, and new operator views |
| `docs/` | Update | Keep ADR, roadmap, requirements, and architecture aligned |

## Validation

- `npm test` stays green for every implementation slice
- `npm run build` stays green for both server and renderer
- Legacy workspace fixtures continue to load through the compatibility layer
- Manual verification covers both the old chat loop and the new control-plane
  surfaces during migration

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Control-plane scope becomes too broad too early | High | Land phases independently and keep chat working throughout |
| Runtime concerns leak upward into `cats` | High | Keep `cats-runtime` contract tests and ADR-001 as a hard boundary |
| Current JSON state becomes too brittle | Medium | Introduce a store abstraction before large model growth |
| Product language becomes confusing during migration | Medium | Define stable terminology before broad UI changes |
| Plugin ambitions bloat early phases | Medium | Keep plugins and alternate entrypoints explicitly in Phase 5 |

---

*Last updated: 2026-03-16*

