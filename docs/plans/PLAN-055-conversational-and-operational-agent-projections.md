# PLAN-055: Conversational and Operational Agent Projections

> Formalize one shared agent core with explicit Chat-first and Work-first
> projections so conversational agents, operational agents, and hybrids stay
> legible across the product.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec / Dependencies

- [SPEC-063: Conversational vs Operational Agents and Surface Projections](../specs/SPEC-063-conversational-vs-operational-agents-and-surface-projections.md)
- [ADR-064: Project Conversational Agents Into Chat and Operational Agents Into Work](../decisions/064-project-conversational-agents-into-chat-and-operational-agents-into-work.md)
- [ADR-063: Separate Managed Work, Agent Missions, Execution Runs, and Transport Bindings](../decisions/063-agent-missions-and-transport-bindings.md)
- [SPEC-062: Agent Missions, Managed Work, and Transport Bindings](../specs/SPEC-062-agent-missions-and-transport-bindings.md)

## Overview

The platform now has one shared agent core, but the user experience still needs
an explicit split between:

- chat-first conversational agents
- work-first operational agents
- hybrid agents that can do both

This plan introduces that split without forking identity, mission, or transport
contracts.

## Implementation Phases

### Phase 1: Freeze Agent Projection Taxonomy

- [ ] Define canonical projection metadata for:
      - `conversational`
      - `operational`
      - `hybrid`
- [ ] Decide where that metadata lives in the shared agent/entity registry
- [ ] Define migration/default rules for existing Cats and assistants

**Deliverables**: one shared projection taxonomy above the agent core

### Phase 2: Chat Projection and `My Cats`

- [ ] Define which projection classes may appear in `My Cats` by default
- [ ] Keep `My Cats` as a chat projection and quick-access roster rather than a
      universal worker registry
- [ ] Define direct-lane, companion, and transport-facing entry rules for
      conversational and hybrid agents

**Deliverables**: clear Chat-side projection rules

### Phase 3: Work Projection and Agent Control Plane

- [ ] Define the Work-side agent list, assignment view, mission view, run
      visibility, and schedule ownership for operational and hybrid agents
- [ ] Define when a hybrid agent should be visible in Work even if it also has
      a chat persona
- [ ] Define navigation and provenance links from managed work into briefing
      chat threads

**Deliverables**: clear Work-side control-plane rules

### Phase 4: Cross-Surface Links and Hybrid Behavior

- [ ] Define explicit cross-links such as:
      - `Open in Chat`
      - `Open in Work`
      - `Promote to Work`
      - `Open agent briefing thread`
- [ ] Ensure those links preserve shared agent identity, mission lineage, and
      transport-binding continuity
- [ ] Define minimal hybrid-agent status surfaces for first rollout

**Deliverables**: navigable hybrid-agent behavior without identity fork

### Phase 5: Product Adoption and Verification

- [ ] Update Chat/Work/Code product docs to consume the new projection classes
- [ ] Add test coverage for projection classification and navigation rules
- [ ] Add smoke checks for:
      - conversational-only agent
      - operational-only agent
      - hybrid agent

**Deliverables**: platform-wide agent projection consistency

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/core/**` | Modify | Agent/entity registry projection metadata |
| `src/products/chat/**` | Modify | `My Cats`, direct-lane, and conversational-agent projection rules |
| `src/products/work/**` | Modify | Operational-agent control-plane projections |
| `src/products/code/**` | Modify | Code-side links for code-oriented operational/hybrid agents |
| `docs/**` | Modify | Architecture, terminology, requirements, and integration docs |
| `tests/**` | Modify/Create | Projection and cross-surface behavior coverage |

## Technical Decisions

- One shared agent core should serve all projections.
- `My Cats` remains Chat-first.
- Work remains the primary control plane for OpenClaw-style agents.
- Hybrid agents require explicit projection context instead of silent surface
  blending.

## Testing Strategy

- **Unit Tests**: projection classification and default-surface rules
- **Integration Tests**: cross-surface navigation and shared identity lineage
- **Manual Testing**:
  - open a conversational agent from `My Cats`
  - manage an operational agent from Work
  - switch a hybrid agent between Chat and Work without losing identity

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `My Cats` becomes overloaded with operational workers | High | Keep Chat projection rules narrow and explicit |
| Work becomes the only place users can reach hybrid agents | Medium | Preserve explicit chat briefing links |
| Hybrid agents create duplicated identity or status | High | Keep one shared registry and explicit projection metadata |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-14 | Plan created for conversational vs operational agent projection rules |

---

*Created: 2026-04-14*
*Author: Codex*
