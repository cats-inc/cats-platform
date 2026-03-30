# PLAN-030: Packaged Setup Wizard and Provider Installation

> Extract, rewrite, and freeze the setup/install knowledge that `cats-platform` still
> needs from `environment-bootstrap` and the sibling A2A/bootstrap pilot
> before the repo split removes easy access to those monorepo inputs.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Completed |
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

`cats-platform` and `cats-runtime` are preparing to split into separate repos. While
this monorepo still includes the latest `environment-bootstrap/` and
`project-bootstrap/` submodule sources, `cats-platform` needs one explicit place to
freeze, extract, and rewrite the setup/install knowledge that must become
repo-owned before that easy local reference path disappears.

Two sibling knowledge tracks already exist:

- `project-bootstrap` A2A collaboration knowledge is already being validated by
  the pilot track under `cats-runtime` [PLAN-023](../../../cats-runtime/docs/plans/PLAN-023-a2a-layering-and-collaboration-artifact-alignment.md),
  with matching pilot artifacts already mirrored into `cats-platform/docs/a2a/` and
  `cats-platform/skills/`.
- `cats-runtime` has already ported part of the provider install/check
  substrate into runtime-owned metadata and checks under
  `cats-runtime/src/core/provider-install/`.

What remains missing is the `cats-platform`-owned execution plan for the packaged setup
and provider-installation side:

- what stable install/check knowledge still lives only in
  `environment-bootstrap`
- what `cats-platform` should port into packaged-host assets or product-owned code
- how that knowledge should connect to `cats-runtime` provider metadata without
  making either submodule a shipped product dependency
- how the first executable helper slices get rewritten as `cats-platform`-owned assets
  rather than remaining source-repo references
- how to validate the port while the monorepo still gives direct access to the
  source repos

This plan fills that gap. It is the `cats-platform`-side companion to the already-landed
A2A/bootstrap pilot work, not a replacement for it.

## Goals

1. Freeze the exact setup/install knowledge that `cats-platform` still needs to extract
   from `environment-bootstrap` before the repo split.
2. Rewrite the required packaged-host helper slices into `cats-platform`-owned code or
   bundled assets before the split, rather than leaving them as source-repo
   dependencies.
3. Record the `project-bootstrap` / A2A pilot relationship explicitly so setup
   knowledge porting does not accidentally re-open the collaboration-layer
   decisions already tracked elsewhere.
4. Define the product-owned install/check asset contract that the packaged host
   will eventually execute.
5. Keep `cats-runtime` as the runtime/provider-topology authority while making
   `cats-platform` the owner of packaged host setup/install orchestration.
6. Validate the ported knowledge while both submodules are still locally
   available in the monorepo.

## Non-Goals

- Re-implementing the existing first-run `/setup` onboarding flow from
  [PLAN-012](./PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- Turning the renderer into a shell/process installer
- Making `environment-bootstrap` or `project-bootstrap` a shipped runtime or
  product dependency
- Leaving required packaged setup helper logic trapped in source-only bootstrap
  repos after the split
- Re-doing the A2A pilot already tracked under sibling runtime planning
- Shipping the full release-grade desktop distribution pipeline in the same
  slice

## Implementation Phases

### Phase 1: Freeze Source Inputs Before Repo Split

- [x] Audit `environment-bootstrap` for setup/install knowledge that still has
      no product-owned home:
      - provider install/check flows
      - platform prerequisite handling
      - auth/PATH/shell/npm-prefix guidance
      - WSL, Docker, encoding, and elevation edge cases
- [x] Audit which parts of that knowledge are already ported into
      `cats-runtime` and which parts still remain only in the submodule
- [x] Record the sibling `project-bootstrap` pilot boundary explicitly:
      - A2A collaboration knowledge stays under the existing pilot track
      - this plan only consumes its outcomes where packaged setup needs to stay
        consistent with repo collaboration artifacts
- [x] Produce one extraction inventory that is truthful about:
      - `source of truth today`
      - `target home after split`
      - `port now`
      - `can defer`

**Deliverables**: one explicit extraction inventory and source-boundary map
exist before deeper implementation slices begin.

### Phase 2: Define the Product-Owned Setup Asset Contract

- [x] Define how packaged-host install/check assets should be organized inside
      `cats-platform`:
      - bundled scripts
      - product-owned code modules
      - machine-readable config/manifests
- [x] Freeze the GUI-safe execution contract for those assets:
      - `check-only`
      - non-interactive invocation
      - JSON result schema
      - stable outcome classes such as `ready`, `not_installed`,
        `auth_required`, `restart_required`, and `failed`
- [x] Map `cats-runtime` provider metadata onto the packaged-host contract so
      the host can reuse runtime topology while still owning actual setup
      execution
- [x] Keep the contract truthful about what remains runtime-owned versus
      product-owned

**Deliverables**: packaged setup has a stable product-owned asset contract
instead of an implicit dependency on bootstrap scripts.

### Phase 3: Port the First High-Value Knowledge Slices

- [x] Port the first Windows npm-prefix/PATH prerequisite helper into a
      `cats-platform`-owned packaged setup asset
- [x] Port the Windows npm-global CLI-pack installer into a `cats-platform`-owned
      packaged setup asset
- [x] Port the first Windows native Cursor installer helper into a `cats-platform`-owned
      packaged setup asset
- [x] Port the first Windows WSL prerequisite preflight helper into a
      `cats-platform`-owned packaged setup asset
- [x] Port the first Windows setup-readiness audit helper into a `cats-platform`-owned
      packaged setup asset
- [x] Port the remaining highest-value stable install/check knowledge into
      `cats-platform`-owned assets or code, prioritizing WSL prerequisite flows and
      readiness checks for the first packaged setup flow
- [x] Rewrite those slices as product-owned helpers or bundled assets rather
      than keeping raw source-repo scripts as dependencies
- [x] Prefer reusable product-owned helpers over one-off script copies
- [x] Keep ported logic traceable back to the original internal sources without
      claiming those sources remain runtime/product dependencies
- [x] Remove any expectation that packaged setup may shell out to
      `environment-bootstrap` or `project-bootstrap` after the split
- [x] Update setup, deployment, and architecture docs as soon as the first
      concrete asset slices land

**Deliverables**: `cats-platform` starts owning concrete packaged setup knowledge rather
than only describing it in specs, and the first executable helper slices are
split-safe.

### Phase 4: Host Bridge and Resume Contract

- [x] Define the packaged-host helper catalog for install/check/verify action
      metadata
- [x] Define the packaged-host bridge for install/check/verify/resume actions
- [x] Define what setup state is persisted by the host versus re-derived from
      `cats-runtime` on demand
- [x] Keep interruption handling explicit:
      - [x] relaunch
      - [x] restart required
      - [x] elevation/UAC
      - [x] first WSL boot
      - [x] Docker warm-up
      - [x] auth-required after install
- [x] Keep the renderer UI-only while still surfacing structured progress and
      recovery guidance

**Deliverables**: `cats-platform` has a bounded host-bridge contract for packaged setup
instead of ad hoc future integration notes.

### Phase 5: Pilot Validation Before Split

- [x] Validate that the extraction inventory is sufficient without directly
      shelling out to `environment-bootstrap` or `project-bootstrap` as the
      product flow
- [x] Verify the sibling A2A/bootstrap pilot artifacts remain coherent with the
      packaged setup direction
- [x] Record what still depends on monorepo-local source access and what is now
      safe after the split
- [x] Leave merge-back / long-term bootstrap convergence as a later evidence-led
      decision rather than assuming immediate upstream sync

**Deliverables**: knowledge extraction is evidence-backed before the repo split
removes local submodule convenience.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docs/plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md` | Create | Canonical `cats-platform` implementation plan for `SPEC-023` |
| `docs/plans/README.md` | Modify | Index the new plan |
| `docs/specs/README.md` | Modify | Point `SPEC-023` at `PLAN-030` |
| `docs/specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md` | Modify | Add explicit implementation tracking and related-plan truth |
| `docs/README.md` | Modify | Keep the plans index description aligned with the new packaged-setup track |
| `docs/research/*` | Later | Capture extraction inventory and validation notes once Phase 1 lands |
| `electron/*` | Later | Host-owned setup bridge and packaged helper follow-through |
| `src/products/chat/**` or later packaged setup modules | Later | Renderer-side setup consumption, if the public setup flow changes |

## Technical Decisions

- Decision 1: Treat `environment-bootstrap` as a one-time source knowledge repo
  and retire it as a required dependency before the repo split, because
  packaged `cats-platform` must keep running after the split.
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
- **Current bridge validation**:
  - `npm run build:host`
  - `node --test --test-isolation=none tests/desktop-host-state.test.js tests/desktop-readiness.test.js tests/desktop-setup-bridge.test.js`
- **Pre-split validation**: verify new packaged-host helpers execute without
  shelling out to bootstrap submodule scripts once the first slices land
- **Documentation verification**:
  - `git diff --check`
  - targeted doc/index consistency review

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Repo split happens before the missing setup knowledge is frozen | High | Start with extraction inventory and source-boundary mapping rather than jumping straight to UI work |
| Setup work accidentally duplicates the A2A pilot track | Medium | Keep the sibling `project-bootstrap` pilot explicitly referenced but out of scope for packaged setup implementation |
| `cats-platform` and `cats-runtime` ownership blur again during setup work | High | Keep runtime topology/readiness in `cats-runtime` and install/check execution in the packaged host |
| Product code ends up copying raw bootstrap scripts without a stable contract | High | Freeze the product-owned asset contract before porting executable slices |
| Source-repo helper logic remains unported when the split happens | High | Make repo-owned rewrite of the first packaged-host helper slices part of the main plan rather than a later optional follow-on |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-29 | Plan created to give `SPEC-023` a dedicated knowledge-porting and packaged-setup execution track before `cats-platform` / `cats-runtime` split into separate repos |
| 2026-03-29 | Scope frozen so `environment-bootstrap` knowledge extraction is the primary setup/install source track, while the sibling `project-bootstrap` A2A pilot remains referenced through `cats-runtime` PLAN-023 instead of being re-opened here |
| 2026-03-29 | Phase 1 landed: recorded the pre-split extraction inventory under `docs/research/2026-03-29-packaged-setup-knowledge-extraction-inventory.md`, separating already-extracted A2A/runtime metadata from still-missing packaged-host execution helpers trapped in `environment-bootstrap` |
| 2026-03-29 | Phase 2 landed: `electron/contracts.ts` and `electron/packaging.ts` now expose a machine-readable `installer.providerSetup` contract covering setup modes, capability packs, source-knowledge boundaries, and the prioritized Windows-first port queue, with desktop packaging tests locking that shape into the staged installer manifest |
| 2026-03-29 | Scope expanded so PLAN-030 now explicitly requires repo-owned rewrites of the first packaged-host helper slices before repo split, rather than stopping at inventory and contract freezing |
| 2026-03-29 | Phase 3 slice 1 landed: `scripts/windows/Setup-NodeGlobalPrefix.ps1` is now a repo-owned packaged setup helper, staged into `build/desktop-packaging/shared/setup-assets/windows/`, bundled into the installer under `desktop-host/setup-assets/windows/`, and covered by packaging plus helper-contract tests |
| 2026-03-29 | Phase 3 slice 2 landed: `scripts/windows/Install-NodeCliPack.ps1` is now a repo-owned packaged setup helper for the Windows native CLI pack, wired to the sibling npm-prefix helper, staged/bundled with the desktop package, and covered by packaging plus helper-contract tests |
| 2026-03-29 | Phase 3 slice 3 landed: `scripts/windows/Check-WslPrerequisites.ps1` is now a repo-owned WSL prerequisite preflight helper, staged/bundled with the desktop package, so the host can detect build/WSL/distro readiness before the full WSL feature-enable and distro-install chain is ported |
| 2026-03-30 | Phase 3 slice 4 landed: `scripts/windows/Check-WindowsSetupReadiness.ps1` now composes the repo-owned npm-prefix, native CLI pack, and WSL prerequisite helpers into one structured host-side readiness audit, and the packaged desktop outputs bundle that audit helper as a first diagnostics asset |
| 2026-03-30 | Phase 3 slice 5 landed: `scripts/windows/Install-CursorAgent.ps1` is now a repo-owned packaged setup helper for the native Windows Cursor Agent installer, the helper catalog/manifest now bundle it as a first-party setup asset, and the extraction inventory was corrected so Cursor follows the Windows-native install baseline while Kiro remains the first WSL-backed provider installer target |
| 2026-03-30 | Phase 3 slice 6 landed: `scripts/windows/Install-WslUbuntuEnvironment.ps1` is now a repo-owned packaged setup helper for the WSL substrate enablement plus Ubuntu distro registration flow, and the packaging contract/manifest/smoke coverage now bundle it as a first-party setup asset instead of leaving `Install-WSL2-Admin.ps1` and `Install-WSLUbuntu.ps1` trapped in `environment-bootstrap` |
| 2026-03-30 | Phase 3 slice 7 landed: `scripts/windows/Install-KiroWslCli.ps1` is now a repo-owned packaged setup helper for the first WSL-backed provider installer, and the packaging contract/manifest/smoke coverage now bundle Kiro's WSL dependency checks, PATH cleanup, alias repair, and sign-in follow-through as first-party setup knowledge |
| 2026-03-30 | Phase 3 slice 8 landed: `scripts/windows/Install-ClaudeCode.ps1` is now a repo-owned packaged setup helper for the native Windows Claude Code installer, the helper catalog/manifest/smoke coverage now bundle it as a first-party setup asset, and the packaged helper contract removes legacy npm-installed Claude shims so the native installer remains the Windows baseline |
| 2026-03-30 | Phase 4 slice 1 landed: `installer.providerSetup.helperCatalog` now surfaces machine-readable helper capabilities, packaged paths, elevation expectations, and supported operations for the bundled Windows setup assets so the future host bridge can bind to a stable contract instead of guessing from filenames |
| 2026-03-30 | Phase 4 slice 2 landed: staged desktop packaging outputs now also emit `shared/setup-assets/manifest.json`, and Windows installer smoke coverage expects that manifest to ship beside the bundled setup helpers as a lighter-weight discovery surface for future host bridge work |
| 2026-03-30 | Phase 4 slice 3 landed: `electron/setupBridge.ts`, `electron/main.ts`, and `electron/preload.cts` now expose a bounded packaged setup bridge that lists bundled helpers, executes structured install/check actions through the Electron host, persists the last packaged setup action in the desktop-host state file, and re-derives helper availability from the packaged asset contract rather than guessing from renderer-owned logic |
| 2026-03-30 | Phase 4 slice 4 landed: the desktop bootstrap page now surfaces setup recovery state from the host bridge, including bundled helper availability and the last packaged setup action summary, while keeping the renderer on the UI-only side of the install/check boundary |
| 2026-03-30 | Phase 4 slice 5 landed: the packaged setup bridge now derives a repo-owned `resumeAction` from the last resumable helper run, exposes a dedicated `resume-setup` IPC path, and lets the bootstrap page surface one recommended packaged setup next step instead of treating restart/manual follow-through states as dead ends |
| 2026-03-30 | Phase 4 slice 6 landed: bootstrap readiness now turns restart-required packaged setup state into a first-class install issue with setup recovery remediation, so the host issue panel and progress model no longer hide packaged setup interruptions behind provider-only warnings |
| 2026-03-30 | Phase 5 validation slice 1 landed: `docs/research/2026-03-30-packaged-setup-split-safety-validation.md` now records that the first packaged setup helper baseline, staged asset contract, and host bridge all run from repo-owned `cats-platform` assets, while also naming the deferred slices that still remain source-knowledge-only after split |
| 2026-03-30 | Phase 4 slice 7 landed: `electron/contracts.ts`, `electron/setupBridge.ts`, `electron/readiness.ts`, `electron/main.ts`, `electron/bootstrapPage.ts`, and the Windows readiness/install helpers now carry explicit interruption kinds for relaunch, restart, elevation, first WSL boot, and auth-required follow-through, while `Check-WindowsSetupReadiness.ps1` now selectively audits native provider auth readiness instead of stopping at prerequisite-only truth |
| 2026-03-30 | Phase 4 slice 8 landed: `scripts/windows/Check-WindowsSetupReadiness.ps1` now also carries an optional Docker Desktop warm-state audit that emits `docker_warm_up_required`, and the host interruption contract/tests now treat Docker warm-up as a first-class resumable packaged setup state |
| 2026-03-30 | Phase 2 slice 3 landed: `electron/contracts.ts`, `electron/packaging.ts`, and desktop packaging tests now also carry a machine-readable `installer.providerSetup.localProviders` rollout map, making the current packaged local-provider path explicit in code instead of leaving it implied in prose |
| 2026-03-30 | Phase 4 slice 9 landed: `electron/bootstrapPage.ts` now surfaces the packaged local-provider rollout in the setup recovery panel, so the desktop host can show which local providers are bundled today instead of only reporting helper counts |
| 2026-03-30 | Phase 5 validation slice 2 landed: `docs/research/2026-03-30-packaged-setup-split-safety-validation.md` now explicitly cross-checks the sibling `cats-runtime` A2A/bootstrap pilot against the packaged setup baseline and records that merge-back into `project-bootstrap` remains a separate evidence-led decision rather than an automatic follow-through from the repo-owned rewrites |
| 2026-03-30 | Phase 3/4 close-out landed: `docs/deployment.md` and `docs/architecture.md` now reflect the repo-owned packaged setup boundary, staged helper/provider rollout contracts, and no-shell-out split-safe posture, allowing the remaining Phase 3 broad checklist items and the explicit interruption-handling gate to close against current implementation truth |
| 2026-03-30 | Phase 3 slice 9 landed: `scripts/windows/Install-Goose.ps1` and `scripts/windows/Install-Junie.ps1` are now repo-owned packaged setup helpers, bundled into the staged desktop setup asset catalog, covered by helper-contract tests, and consumed by the Windows readiness audit instead of staying in `environment-bootstrap` as deferred source knowledge |
| 2026-03-30 | Phase 4 slice 10 landed: the packaged host rollout contract, smoke coverage, bootstrap recovery UI, and staged installer manifests now treat Claude Code, Cursor Agent, Goose, Junie, and the WSL-backed Kiro helper as the current packaged local-provider baseline, leaving broader local-model follow-through as the main later capability-pack gap |
| 2026-03-30 | Phase 3 slice 10 landed: `scripts/windows/Install-DockerDesktop.ps1` is now a repo-owned packaged setup helper for Docker Desktop install, upgrade, elevation-required recovery, and engine warm-state follow-through instead of leaving Docker install trapped in `environment-bootstrap` |
| 2026-03-30 | Phase 4 slice 11 landed: the helper catalog, staged desktop assets, Windows installer smoke coverage, and readiness audit now bundle the Docker Desktop helper as the current `local_model_pack` prerequisite slice while keeping broader Ollama/local-model follow-through for later |
| 2026-03-30 | Phase 3/4 slice 12 landed: `scripts/windows/Install-Ollama.ps1`, the staged setup asset catalog, the packaging manifest, the Windows readiness audit, and helper tests now keep Ollama on the current repo-owned `local_model_pack` baseline instead of leaving it as later follow-through |
| 2026-03-30 | Phase 4 slice 13 landed: `electron/setupBridge.ts` now treats manual packaged-setup follow-through as verification-first resume work, so helpers like the Ollama runtime path no longer recommend another install/apply mutation when the remaining work is just warm-state/manual completion |
| 2026-03-30 | Phase 4 slice 14 landed: `electron/main.ts` now actually primes the repo-owned `windows-install-readiness-audit` during Windows desktop bootstrap whenever no more specific packaged setup recovery action is active, so the packaged `first_run_provider_scan` contract is now executed instead of remaining manifest-only |

---

*Created: 2026-03-29*
*Author: Codex*
