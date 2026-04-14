# PLAN-056: MY CATS Platform Home and Lens Projections

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Related Spec** | [SPEC-064](../specs/SPEC-064-my-cats-platform-home-and-lens-projections.md) |
| **Related ADR** | [ADR-065](../decisions/065-keep-my-cats-as-one-platform-agent-home-with-lenses.md) |

## Objective

Turn `MY CATS` into one platform-level agent home with lens-based projections,
while keeping product-local agent panels as contextual subsets rather than
separate registries or renamed top-level surfaces.

## Scope

In scope:

- platform-level `MY CATS` lens model
- Chat / Work / Code contextual subset rules
- deep-link and navigation contract
- documentation and type-level contract updates

Out of scope:

- final visual design system
- every production renderer interaction
- complete registry schema redesign

## Phases

### Phase 1: Freeze `MY CATS` IA Contract

- [ ] Add `MY CATS` platform-home semantics to architecture and requirements
- [ ] Freeze `Overview / Chat / Work / Code` lens vocabulary
- [ ] Freeze contextual-subset vs platform-home distinction

### Phase 2: Define Lens Metadata and Navigation

- [ ] Add lens metadata to shared agent/home contracts
- [ ] Define deep-link rules from product subsets back into `MY CATS`
- [ ] Define selected-agent and selected-lens URL/state strategy

### Phase 3: Preserve Chat Semantics

- [ ] Keep `MY CATS > Chat` compatible with direct-lane and companion flows
- [ ] Preserve existing in-place direct-lane entry semantics when selecting a
      conversational Cat
- [ ] Clarify what remains Chat-only vs what becomes platform-home behavior

### Phase 4: Add Work and Code Projections

- [ ] Define the minimum `Work` lens state
- [ ] Define the minimum `Code` lens state
- [ ] Define product-local contextual subset contracts for Work and Code

### Phase 5: Verification and Rollout

- [ ] Add navigation and lens-contract tests where shared contracts exist
- [ ] Add product IA smoke cases for:
  - Chat subset -> `MY CATS > Chat`
  - Work subset -> `MY CATS > Work`
  - Code subset -> `MY CATS > Code`
- [ ] Update docs and screenshots/mock references as surfaces land

## Files / Areas Likely Affected

| Path | Change Type | Notes |
|------|-------------|-------|
| `docs/architecture.md` | Update | Platform-home and lens model |
| `docs/requirements.md` | Update | IA and lens requirements |
| `docs/product-integration-guide.md` | Update | Product subset vs platform-home rules |
| `docs/terminology.md` | Update | `MY CATS`, lens, contextual subset |
| `src/app/renderer/**` | Modify | Platform-level nav and deep-link handling |
| `src/products/chat/**` | Modify | Chat subset and direct-lane bridge |
| `src/products/work/**` | Modify | Work subset projection |
| `src/products/code/**` | Modify | Code subset projection |
| `src/core/**` | Modify | Shared lens metadata if promoted to core contract |

## Verification

- Docs consistency check:
  - `git diff --check`
- Future code checks:
  - route/deep-link tests
  - Chat direct-lane regression checks
  - shared identity projection checks

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| `MY CATS` remains overloaded and vague | High | Keep lens names explicit and contextual subsets narrow |
| Product subsets drift into shadow registries | High | Deep-link back to canonical `MY CATS` home and preserve one registry contract |
| Chat direct-lane semantics regress | Medium | Keep `MY CATS > Chat` behavior explicitly compatible with current private-lane rules |
| Work/Code lenses become too heavy for first slice | Medium | Start with summary state and link outward to product-native detail views |

## Open Questions

- [ ] Should `Overview` or the last-used lens be the default landing behavior?
- [ ] Which lens metadata belongs in shared core versus renderer-local routing?
- [ ] Should `MY CATS` support pinned favorites independent of Chat/Work/Code lenses?

---

*Created: 2026-04-14*
*Author: Codex*
