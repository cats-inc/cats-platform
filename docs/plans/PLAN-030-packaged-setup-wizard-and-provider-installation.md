# PLAN-030: Packaged Setup Wizard and Provider Installation

> Extract and freeze the setup/install knowledge that `cats` still needs from
> `environment-bootstrap` and the sibling A2A/bootstrap pilot before the repo
> split removes easy access to those monorepo inputs.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User / packaging workstream |

## Related Spec / Dependencies

- [SPEC-023: Packaged Setup Wizard and Provider Installation](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-012: First-Run Setup Wizard and Boss Cat Bootstrap](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [ADR-021: Keep Packaged Setup and Provider Installation in the Host](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [cats-runtime PLAN-023: A2A Layering and Collaboration Artifact Alignment](../../../cats-runtime/docs/plans/PLAN-023-a2a-layering-and-collaboration-artifact-alignment.md)
- [cats-runtime PLAN-019: Shared Runtime UI Foundation for Dashboard, Playground, and Provider Setup](../../../cats-runtime/docs/plans/PLAN-019-shared-runtime-ui-foundation-for-dashboard-playground-and-provider-setup.md)
- [cats-runtime PLAN-025: Executable Packaging and Publish Follow-Through](../../../cats-runtime/docs/plans/PLAN-025-executable-packaging-and-publish-follow-through.md)

## Overview

`cats` and `cats-runtime` are preparing to split into separate repos. While
this monorepo still includes the latest `environment-bootstrap/` and
`project-bootstrap/` submodule sources, `cats` needs one explicit place to
freeze what setup/install knowledge must be extracted before that easy local
reference path disappears.

Two sibling knowledge tracks already exist:

- `project-bootstrap` A2A collaboration knowledge is already being validated by
  the pilot track under `cats-runtime` [PLAN-023](../../../cats-runtime/docs/plans/PLAN-023-a2a-layering-and-collaboration-artifact-alignment.md),
  with matching pilot artifacts already mirrored into `cats/docs/a2a/` and
  `cats/skills/`.
- `cats-runtime` has already ported part of the provider install/check
  substrate into runtime-owned metadata and checks under
  `cats-runtime/src/core/provider-install/`.

What remains missing is the `cats`-owned execution plan for the packaged setup
and provider-installation side:

- what stable install/check knowledge still lives only in
  `environment-bootstrap`
- what `cats` should port into packaged-host assets or product-owned code
- how that knowledge should connect to `cats-runtime` provider metadata without
  making either submodule a shipped product dependency
- how to validate the port while the monorepo still gives direct access to the
  source repos

This plan fills that gap. It is the `cats`-side companion to the already-landed
A2A/bootstrap pilot work, not a replacement for it.

## Goals

1. Freeze the exact setup/install knowledge that `cats` still needs to extract
   from `environment-bootstrap` before the repo split.
2. Record the `project-bootstrap` / A2A pilot relationship explicitly so setup
   knowledge porting does not accidentally re-open the collaboration-layer
   decisions already tracked elsewhere.
3. Define the product-owned install/check asset contract that the packaged host
   will eventually execute.
4. Keep `cats-runtime` as the runtime/provider-topology authority while making
   `cats` the owner of packaged host setup/install orchestration.
5. Validate the ported knowledge while both submodules are still locally
   available in the monorepo.

## Non-Goals

- Re-implementing the existing first-run `/setup` onboarding flow from
  [PLAN-012](./PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- Turning the renderer into a shell/process installer
- Making `environment-bootstrap` or `project-bootstrap` a shipped runtime or
  product dependency
- Re-doing the A2A pilot already tracked under sibling runtime planning
- Shipping the full release-grade desktop distribution pipeline in the same
  slice

## Implementation Phases

### Phase 1: Freeze Source Inputs Before Repo Split

- [ ] Audit `environment-bootstrap` for setup/install knowledge that still has
      no product-owned home:
      - provider install/check flows
      - platform prerequisite handling
      - auth/PATH/shell/npm-prefix guidance
      - WSL, Docker, encoding, and elevation edge cases
- [ ] Audit which parts of that knowledge are already ported into
      `cats-runtime` and which parts still remain only in the submodule
- [ ] Record the sibling `project-bootstrap` pilot boundary explicitly:
      - A2A collaboration knowledge stays under the existing pilot track
      - this plan only consumes its outcomes where packaged setup needs to stay
        consistent with repo collaboration artifacts
- [ ] Produce one extraction inventory that is truthful about:
      - `source of truth today`
      - `target home after split`
      - `port now`
      - `can defer`

**Deliverables**: one explicit extraction inventory and source-boundary map
exist before deeper implementation slices begin.

### Phase 2: Define the Product-Owned Setup Asset Contract

- [ ] Define how packaged-host install/check assets should be organized inside
      `cats`:
      - bundled scripts
      - product-owned code modules
      - machine-readable config/manifests
- [ ] Freeze the GUI-safe execution contract for those assets:
      - `check-only`
      - non-interactive invocation
      - JSON result schema
      - stable outcome classes such as `ready`, `not_installed`,
        `auth_required`, `restart_required`, and `failed`
- [ ] Map `cats-runtime` provider metadata onto the packaged-host contract so
      the host can reuse runtime topology while still owning actual setup
      execution
- [ ] Keep the contract truthful about what remains runtime-owned versus
      product-owned

**Deliverables**: packaged setup has a stable product-owned asset contract
instead of an implicit dependency on bootstrap scripts.

### Phase 3: Port the First High-Value Knowledge Slices

- [ ] Port the highest-value stable install/check knowledge into `cats`-owned
      assets or code, prioritizing the providers and prerequisites most likely
      to matter for the first packaged setup flow
- [ ] Prefer reusable product-owned helpers over one-off script copies
- [ ] Keep ported logic traceable back to the original internal sources without
      claiming those sources remain runtime/product dependencies
- [ ] Update setup, deployment, and architecture docs as soon as the first
      concrete asset slices land

**Deliverables**: `cats` starts owning concrete packaged setup knowledge rather
than only describing it in specs.

### Phase 4: Host Bridge and Resume Contract

- [ ] Define the packaged-host bridge for install/check/verify/resume actions
- [ ] Define what setup state is persisted by the host versus re-derived from
      `cats-runtime` on demand
- [ ] Keep interruption handling explicit:
      - relaunch
      - restart required
      - elevation/UAC
      - first WSL boot
      - Docker warm-up
      - auth-required after install
- [ ] Keep the renderer UI-only while still surfacing structured progress and
      recovery guidance

**Deliverables**: `cats` has a bounded host-bridge contract for packaged setup
instead of ad hoc future integration notes.

### Phase 5: Pilot Validation Before Split

- [ ] Validate that the extraction inventory is sufficient without directly
      shelling out to `environment-bootstrap` as the product flow
- [ ] Verify the sibling A2A/bootstrap pilot artifacts remain coherent with the
      packaged setup direction
- [ ] Record what still depends on monorepo-local source access and what is now
      safe after the split
- [ ] Leave merge-back / long-term bootstrap convergence as a later evidence-led
      decision rather than assuming immediate upstream sync

**Deliverables**: knowledge extraction is evidence-backed before the repo split
removes local submodule convenience.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md` | Create | Canonical `cats` implementation plan for `SPEC-023` |
| `docs/plans/README.md` | Modify | Index the new plan |
| `docs/specs/README.md` | Modify | Point `SPEC-023` at `PLAN-030` |
| `docs/specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md` | Modify | Add explicit implementation tracking and related-plan truth |
| `docs/README.md` | Modify | Keep the plans index description aligned with the new packaged-setup track |
| `docs/research/*` | Later | Capture extraction inventory and validation notes once Phase 1 lands |
| `electron/*` | Later | Host-owned setup bridge and packaged helper follow-through |
| `src/products/chat/**` or later packaged setup modules | Later | Renderer-side setup consumption, if the public setup flow changes |

## Technical Decisions

- Decision 1: Treat `environment-bootstrap` as a source knowledge repo, not a
  shipped dependency, because packaged `cats` must keep running after the repo
  split.
- Decision 2: Keep A2A/bootstrap collaboration knowledge on the existing pilot
  track instead of mixing it into packaged setup work, because the repo already
  has a sibling plan for that concern.
- Decision 3: Keep `cats-runtime` as the provider-topology and runtime-readiness
  authority while making the packaged host own setup/install execution, because
  that boundary is already locked by ADR-021.
- Decision 4: Prioritize extraction inventory and contract freezing before
  large implementation slices, because the immediate risk is losing easy access
  to submodule knowledge during repo split.

## Testing Strategy

- **Phase 1 validation**: confirm extraction inventory against the actual
  `environment-bootstrap/` and `project-bootstrap/` source trees while they are
  still available in the monorepo
- **Contract validation**: add focused tests only when the packaged-host asset
  contract or host bridge becomes executable code
- **Documentation verification**:
  - `git diff --check`
  - targeted doc/index consistency review

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Repo split happens before the missing setup knowledge is frozen | High | Start with extraction inventory and source-boundary mapping rather than jumping straight to UI work |
| Setup work accidentally duplicates the A2A pilot track | Medium | Keep the sibling `project-bootstrap` pilot explicitly referenced but out of scope for packaged setup implementation |
| `cats` and `cats-runtime` ownership blur again during setup work | High | Keep runtime topology/readiness in `cats-runtime` and install/check execution in the packaged host |
| Product code ends up copying raw bootstrap scripts without a stable contract | High | Freeze the product-owned asset contract before porting executable slices |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-29 | Plan created to give `SPEC-023` a dedicated knowledge-porting and packaged-setup execution track before `cats` / `cats-runtime` split into separate repos |
| 2026-03-29 | Scope frozen so `environment-bootstrap` knowledge extraction is the primary setup/install source track, while the sibling `project-bootstrap` A2A pilot remains referenced through `cats-runtime` PLAN-023 instead of being re-opened here |

---

*Created: 2026-03-29*
*Author: Codex*
