# Packaged Setup Knowledge Extraction Inventory

## Summary

This note freezes the pre-split extraction truth for packaged setup knowledge
across `cats/`, `cats-runtime/`, `environment-bootstrap/`, and
`project-bootstrap/`.

The key finding is:

- `project-bootstrap` A2A collaboration knowledge is already extracted into the
  sibling pilot track and mirrored into `cats`.
- `cats-runtime` already owns provider topology plus install/check metadata.
- the remaining high-risk gap is product-owned packaged-host setup/install
  execution knowledge that still lives only in `environment-bootstrap`.

That means `cats` should not try to re-import all bootstrap knowledge. It
should port the missing packaged-host execution helpers and keep consuming
runtime-owned provider metadata from `cats-runtime`.

## Reviewed Inputs

### `project-bootstrap`

- [`project-bootstrap/docs/a2a/README.md`](../../../project-bootstrap/docs/a2a/README.md)
- [`project-bootstrap/templates/base/docs/a2a/README.md`](../../../project-bootstrap/templates/base/docs/a2a/README.md)
- [`project-bootstrap/docs/specs/SPEC-001-current-a2a-template-artifacts-and-upgrade-behavior.md`](../../../project-bootstrap/docs/specs/SPEC-001-current-a2a-template-artifacts-and-upgrade-behavior.md)
- [`project-bootstrap/docs/decisions/001-adopt-current-a2a-agent-card-and-json-rpc-template-set.md`](../../../project-bootstrap/docs/decisions/001-adopt-current-a2a-agent-card-and-json-rpc-template-set.md)

### `environment-bootstrap`

- [`environment-bootstrap/README.md`](../../../environment-bootstrap/README.md)
- [`environment-bootstrap/platform/windows/Install-NodeCLITools.ps1`](../../../environment-bootstrap/platform/windows/Install-NodeCLITools.ps1)
- [`environment-bootstrap/platform/windows/Install-CursorAgent.ps1`](../../../environment-bootstrap/platform/windows/Install-CursorAgent.ps1)
- [`environment-bootstrap/platform/windows/Setup-NodeJS.ps1`](../../../environment-bootstrap/platform/windows/Setup-NodeJS.ps1)
- [`environment-bootstrap/platform/windows/Check-Installation.ps1`](../../../environment-bootstrap/platform/windows/Check-Installation.ps1)
- [`environment-bootstrap/platform/windows/Install-WSL2-Admin.ps1`](../../../environment-bootstrap/platform/windows/Install-WSL2-Admin.ps1)
- [`environment-bootstrap/platform/windows/Install-WSLUbuntu.ps1`](../../../environment-bootstrap/platform/windows/Install-WSLUbuntu.ps1)
- [`environment-bootstrap/platform/windows/Install-WSLKiroCLI.ps1`](../../../environment-bootstrap/platform/windows/Install-WSLKiroCLI.ps1)
- [`environment-bootstrap/platform/windows/Install-Docker-Admin.ps1`](../../../environment-bootstrap/platform/windows/Install-Docker-Admin.ps1)

### `cats-runtime`

- [`cats-runtime/src/core/provider-install/knowledge.ts`](../../../cats-runtime/src/core/provider-install/knowledge.ts)
- [`cats-runtime/src/core/provider-install/ProviderInstallCheckRunner.ts`](../../../cats-runtime/src/core/provider-install/ProviderInstallCheckRunner.ts)
- [`cats-runtime/docs/decisions/013-extend-provider-manifests-with-install-and-check-metadata.md`](../../../cats-runtime/docs/decisions/013-extend-provider-manifests-with-install-and-check-metadata.md)
- [`cats-runtime/PROGRESS.md`](../../../cats-runtime/PROGRESS.md)

### `cats`

- [`docs/a2a/README.md`](../a2a/README.md)
- [`skills/orchestration/a2a-handoff/SKILL.md`](../../skills/orchestration/a2a-handoff/SKILL.md)
- [`skills/orchestration/project-memory-sync/SKILL.md`](../../skills/orchestration/project-memory-sync/SKILL.md)
- [`docs/specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md`](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [`docs/plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md`](../plans/PLAN-030-packaged-setup-wizard-and-provider-installation.md)

## Current Truth

### 1. `project-bootstrap` knowledge is not the urgent missing setup gap

The A2A/bootstrap collaboration artifact set from `project-bootstrap` is
already represented in the current pilot posture:

- `cats-runtime` owns the first validated pilot track under
  [`cats-runtime/docs/plans/PLAN-023-a2a-layering-and-collaboration-artifact-alignment.md`](../../../cats-runtime/docs/plans/PLAN-023-a2a-layering-and-collaboration-artifact-alignment.md)
- `cats` already mirrors that pilot through [`docs/a2a/`](../a2a/) and the
  repo-owned collaboration skills under [`skills/orchestration/`](../../skills/orchestration/)

So the pre-split urgency is no longer "copy more A2A docs out of
`project-bootstrap`". The urgent gap is packaged setup/install execution
knowledge.

### 2. `cats-runtime` already owns provider metadata and check knowledge

`cats-runtime` is no longer missing the install/check metadata layer:

- provider family topology, install metadata, prerequisites, path hints, auth
  hints, and docs links already live in
  [`cats-runtime/src/core/provider-install/knowledge.ts`](../../../cats-runtime/src/core/provider-install/knowledge.ts)
- runtime-side check execution already lives in
  [`cats-runtime/src/core/provider-install/ProviderInstallCheckRunner.ts`](../../../cats-runtime/src/core/provider-install/ProviderInstallCheckRunner.ts)
- ADR-013 explicitly locked the direction that install/check metadata belongs
  with provider manifests rather than staying only in `environment-bootstrap`

That means `cats` should consume runtime-owned metadata and diagnostics, not
fork a second metadata truth source.

### 3. The missing layer is packaged-host execution knowledge

The main pieces still trapped inside `environment-bootstrap` are the concrete
Windows-first execution helpers that a packaged host would need to own or
reimplement:

- npm-global CLI pack installation via
  [`Install-NodeCLITools.ps1`](../../../environment-bootstrap/platform/windows/Install-NodeCLITools.ps1)
- native Windows Cursor Agent installation via
  [`Install-CursorAgent.ps1`](../../../environment-bootstrap/platform/windows/Install-CursorAgent.ps1)
- user-scoped npm prefix + PATH preparation via
  [`Setup-NodeJS.ps1`](../../../environment-bootstrap/platform/windows/Setup-NodeJS.ps1)
- WSL prerequisite enablement and distro install via
  [`Install-WSL2-Admin.ps1`](../../../environment-bootstrap/platform/windows/Install-WSL2-Admin.ps1)
  and
  [`Install-WSLUbuntu.ps1`](../../../environment-bootstrap/platform/windows/Install-WSLUbuntu.ps1)
- WSL provider installers such as
  [`Install-WSLKiroCLI.ps1`](../../../environment-bootstrap/platform/windows/Install-WSLKiroCLI.ps1)
- bundled readiness and auth-state inspection via
  [`Check-Installation.ps1`](../../../environment-bootstrap/platform/windows/Check-Installation.ps1)

These scripts already embody useful operational knowledge:

- admin-vs-user execution boundaries
- UAC/elevation expectations
- WSL and distro existence checks
- user-scoped PATH and npm-prefix rules
- auth/login hints for provider CLIs
- Docker/WSL warm-state checks

That is the knowledge most at risk if the repo split happens before `cats`
ports a product-owned host asset layer.

## Extraction Inventory

| Knowledge Slice | Source Today | Current Home | Target Home After Split | Status | Notes |
|-----------------|-------------|--------------|-------------------------|--------|-------|
| A2A collaboration artifacts | `project-bootstrap/docs/a2a/*` | `cats-runtime` pilot + mirrored `cats/docs/a2a/*` | `cats` and `cats-runtime` repo-owned pilot artifacts | Already extracted | Do not re-open under packaged setup work |
| Provider topology + install/check metadata | `environment-bootstrap` learnings plus runtime ADRs | `cats-runtime/src/core/provider-install/*` | `cats-runtime` | Already extracted | `cats` should consume, not duplicate |
| Windows npm-global AI CLI pack install | `environment-bootstrap/platform/windows/Install-NodeCLITools.ps1` | `cats/scripts/windows/Install-NodeCliPack.ps1` | packaged-host assets in `cats` | Ported | Covers Codex, Gemini, Copilot, OpenCode, Auggie, and Pi, and now consumes the repo-owned npm prefix helper instead of a bootstrap dependency |
| Windows native Cursor Agent installer | `environment-bootstrap/platform/windows/Install-CursorAgent.ps1` | `cats/scripts/windows/Install-CursorAgent.ps1` | packaged-host provider assets in `cats` | Ported | Aligns packaged setup with the current Windows-native Cursor install baseline instead of routing Cursor through WSL-first guidance |
| Windows npm prefix + PATH setup | `environment-bootstrap/platform/windows/Setup-NodeJS.ps1` | `cats/scripts/windows/Setup-NodeGlobalPrefix.ps1` | packaged-host prerequisite helpers in `cats` | Ported | Staged into `build/desktop-packaging/shared/setup-assets/windows/` and bundled into desktop installs under `desktop-host/setup-assets/windows/` |
| Windows WSL prerequisite preflight | `Install-WSL2-Admin.ps1` + `Install-WSLUbuntu.ps1` knowledge | `cats/scripts/windows/Check-WslPrerequisites.ps1` | packaged-host prerequisite helpers in `cats` | Ported | Structured preflight only; stays as the read-only readiness surface before mutation |
| Windows setup readiness audit | `environment-bootstrap/platform/windows/Check-Installation.ps1` | `cats/scripts/windows/Check-WindowsSetupReadiness.ps1` | host-side readiness/recovery helpers in `cats` | Ported | Structured audit only; composes the repo-owned prefix, native CLI pack, and WSL preflight helpers instead of copying the old bootstrap-wide report verbatim |
| Windows WSL substrate + Ubuntu installer | `environment-bootstrap/platform/windows/Install-WSL2-Admin.ps1` + `environment-bootstrap/platform/windows/Install-WSLUbuntu.ps1` | `cats/scripts/windows/Install-WslUbuntuEnvironment.ps1` | packaged-host prerequisite helpers in `cats` | Ported | Repo-owned mutation helper for WSL substrate enablement, WSL2 default-version setup, and Ubuntu registration; keeps in-distro Ubuntu package upgrades as later manual follow-through |
| Windows WSL provider installers | `Install-WSLKiroCLI.ps1`, related WSL scripts | `environment-bootstrap` only | packaged-host provider assets in `cats` | Port next | Kiro is now the concrete first candidate because Cursor follows the Windows-native install baseline |
| Windows readiness/auth inspection follow-through | remaining `Check-Installation.ps1` coverage | `environment-bootstrap` only | host-side readiness/recovery helpers in `cats` plus `cats-runtime` diagnostics consumption | Port selectively | Do not replace runtime diagnostics; expand the repo-owned audit incrementally instead of copying the old bootstrap-wide report verbatim |
| Docker Desktop install + warm-state knowledge | `Install-Docker-Admin.ps1` | `environment-bootstrap` only | later packaged-host capability pack | Defer | Relevant for heavier local-model / container paths, not first baseline |
| Ngrok / tunnel setup | `Install-Ngrok-Admin.ps1`, `Setup-Ngrok.ps1` | `environment-bootstrap` only | later transport helper layer in `cats` | Defer | Not part of the first packaged setup baseline |
| Guacamole / Tailscale / workstation extras | extra-mode scripts | `environment-bootstrap` only | none for current packaged setup | Exclude | Not part of `cats` packaged setup scope |

## Recommended Port Order

1. Port the first WSL-backed provider installer next.
   - The prerequisite npm prefix + PATH helper is now repo-owned in
     `cats/scripts/windows/Setup-NodeGlobalPrefix.ps1`.
   - The Windows npm-global CLI pack installer is now repo-owned in
     `cats/scripts/windows/Install-NodeCliPack.ps1`.
   - The Windows native Cursor Agent installer is now repo-owned in
     `cats/scripts/windows/Install-CursorAgent.ps1`.
   - The WSL prerequisite preflight is now repo-owned in
     `cats/scripts/windows/Check-WslPrerequisites.ps1`.
   - The WSL substrate and Ubuntu installer is now repo-owned in
     `cats/scripts/windows/Install-WslUbuntuEnvironment.ps1`.
   - The host-side readiness audit is now repo-owned in
     `cats/scripts/windows/Check-WindowsSetupReadiness.ps1`.
   - The next missing Windows-first slice is the first repo-owned WSL-backed
     provider installer, starting with Kiro.

2. Port concrete WSL provider installers after the substrate chain.
   - Start with Kiro because it still encodes the most relevant WSL
     install/auth/path repair behavior for the first packaged WSL-backed
     direction.

3. Defer Docker and tunnel flows until after the first packaged setup contract
   is stable.
   - They are still useful knowledge sources.
   - They are not the lowest-friction first packaged path described by
     `SPEC-023`.

## Implications for `PLAN-030`

- Phase 1 can be considered landed once this inventory is accepted as the
  extraction baseline.
- The first implementation slice after planning should be Windows-first and
  executable, not another broad documentation pass.
- `cats` should prefer product-owned asset contracts over lifting raw bootstrap
  scripts verbatim.
- `cats-runtime` remains the runtime/provider authority; `cats` still needs to
  own packaged-host execution and resume behavior.

## Recommended Next Slice

Port the next packaged-host setup asset slice around:

- Windows WSL prerequisite enablement and distro bootstrap
- reuse of the repo-owned Windows npm prefix helper, native CLI pack helper,
  and native Cursor installer that now ship inside the staged desktop package
- extend the new WSL prerequisite preflight helper into the actual feature and
  distro mutation flow

That is the next smallest slice that converts the remaining Windows-first
bootstrap knowledge into owned product behavior.
