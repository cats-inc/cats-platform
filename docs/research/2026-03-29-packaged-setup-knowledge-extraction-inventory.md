# Packaged Setup Knowledge Extraction Inventory

## Summary

This note freezes the pre-split extraction truth for packaged setup knowledge
across `cats-platform/`, `cats-runtime/`, `environment-bootstrap/`, and
`project-bootstrap/`.

The key finding is:

- `project-bootstrap` A2A collaboration knowledge is already extracted into the
  sibling pilot track and mirrored into `cats-platform`.
- `cats-runtime` already owns provider topology plus install/check metadata.
- the remaining high-risk gap is product-owned packaged-host setup/install
  execution knowledge that still lives only in `environment-bootstrap`.

That means `cats-platform` should not try to re-import all bootstrap knowledge. It
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

### `cats-platform`

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
- `cats-platform` already mirrors that pilot through [`docs/a2a/`](../a2a/) and the
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

That means `cats-platform` should consume runtime-owned metadata and diagnostics, not
fork a second metadata truth source.

### 3. The missing layer is packaged-host execution knowledge

The main pieces that were trapped inside `environment-bootstrap` are the
concrete packaged-host execution helpers that `cats-platform` needed to own or
reimplement, starting on Windows and now extended to repo-owned macOS/Linux
native CLI helpers:

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

That is the knowledge most at risk if the repo split happens before `cats-platform`
ports a product-owned host asset layer.

## Extraction Inventory

| Knowledge Slice | Source Today | Current Home | Target Home After Split | Status | Notes |
|-----------------|-------------|--------------|-------------------------|--------|-------|
| A2A collaboration artifacts | `project-bootstrap/docs/a2a/*` | `cats-runtime` pilot + mirrored `cats-platform/docs/a2a/*` | `cats-platform` and `cats-runtime` repo-owned pilot artifacts | Already extracted | Do not re-open under packaged setup work |
| Provider topology + install/check metadata | `environment-bootstrap` learnings plus runtime ADRs | `cats-runtime/src/core/provider-install/*` | `cats-runtime` | Already extracted | `cats-platform` should consume, not duplicate |
| Windows npm-global AI CLI pack install | `environment-bootstrap/platform/windows/Install-NodeCLITools.ps1` | `cats-platform/scripts/windows/Install-NodeCliPack.ps1` | packaged-host assets in `cats-platform` | Ported | Covers Codex, Gemini, Copilot, OpenCode, Auggie, and Pi, and now consumes the repo-owned npm prefix helper instead of a bootstrap dependency |
| Windows native Claude Code installer | `environment-bootstrap/platform/windows/Install-ClaudeCode.ps1` | `cats-platform/scripts/windows/Install-ClaudeCode.ps1` | packaged-host provider assets in `cats-platform` | Ported | Repo-owned native installer helper now removes legacy npm Claude shims, preserves the official Windows-native install path, and keeps post-install sign-in guidance inside the packaged setup contract |
| Windows native Cursor Agent installer | `environment-bootstrap/platform/windows/Install-CursorAgent.ps1` | `cats-platform/scripts/windows/Install-CursorAgent.ps1` | packaged-host provider assets in `cats-platform` | Ported | Aligns packaged setup with the current Windows-native Cursor install baseline instead of routing Cursor through WSL-first guidance |
| Windows npm prefix + PATH setup | `environment-bootstrap/platform/windows/Setup-NodeJS.ps1` | `cats-platform/scripts/windows/Setup-NodeGlobalPrefix.ps1` | packaged-host prerequisite helpers in `cats-platform` | Ported | Staged into `build/desktop-packaging/shared/setup-assets/windows/` and bundled into desktop installs under `desktop-host/setup-assets/windows/` |
| Windows WSL prerequisite preflight | `Install-WSL2-Admin.ps1` + `Install-WSLUbuntu.ps1` knowledge | `cats-platform/scripts/windows/Check-WslPrerequisites.ps1` | packaged-host prerequisite helpers in `cats-platform` | Ported | Structured preflight only; stays as the read-only readiness surface before mutation |
| Windows setup readiness audit | `environment-bootstrap/platform/windows/Check-Installation.ps1` | `cats-platform/scripts/windows/Check-WindowsSetupReadiness.ps1` | host-side readiness/recovery helpers in `cats-platform` | Ported | Structured audit only; composes the repo-owned prefix, native CLI pack, and WSL preflight helpers instead of copying the old bootstrap-wide report verbatim |
| Windows WSL substrate + Ubuntu installer | `environment-bootstrap/platform/windows/Install-WSL2-Admin.ps1` + `environment-bootstrap/platform/windows/Install-WSLUbuntu.ps1` | `cats-platform/scripts/windows/Install-WslUbuntuEnvironment.ps1` | packaged-host prerequisite helpers in `cats-platform` | Ported | Repo-owned mutation helper for WSL substrate enablement, WSL2 default-version setup, and Ubuntu registration; keeps in-distro Ubuntu package upgrades as later manual follow-through |
| Windows WSL Kiro installer | `environment-bootstrap/platform/windows/Install-WSLKiroCLI.ps1` | `cats-platform/scripts/windows/Install-KiroWslCli.ps1` (later removed; superseded by the generic `Install-WSLCLITools.ps1` Kiro path) | packaged-host provider assets in `cats-platform` | Ported | Original port carried dependency checks, PATH cleanup, `kc` alias repair, and post-install sign-in guidance before Kiro was normalized onto the shared WSL provider loop |
| Windows readiness/auth inspection follow-through | remaining `Check-Installation.ps1` coverage | `environment-bootstrap` only | host-side readiness/recovery helpers in `cats-platform` plus `cats-runtime` diagnostics consumption | Port selectively | Do not replace runtime diagnostics; expand the repo-owned audit incrementally instead of copying the old bootstrap-wide report verbatim |
| Docker Desktop install + warm-state knowledge | `Install-Docker-Admin.ps1` | `cats-platform/scripts/windows/Install-DockerDesktop.ps1` | packaged-host capability-pack assets in `cats-platform` plus current `Check-WindowsSetupReadiness.ps1` | Ported | Repo-owned helper now owns Docker Desktop install, upgrade, elevation-required recovery, and engine warm-state follow-through while the readiness audit consumes its structured check output |
| Ollama local-model runtime follow-through | official Ollama Windows install guidance plus repo-local packaged setup knowledge | `cats-platform/scripts/windows/Install-Ollama.ps1` | packaged-host capability-pack assets in `cats-platform` plus current `Check-WindowsSetupReadiness.ps1` | Ported | Repo-owned helper now owns user-scoped Ollama install, upgrade, and local API warm-state follow-through while the readiness audit can consume its structured check output |
| Windows native Goose installer | `environment-bootstrap/platform/windows/Install-Goose.ps1` + `environment-bootstrap/platform/windows/Install-WSLGoose.ps1` knowledge | `cats-platform/scripts/windows/Install-Goose.ps1` | packaged-host provider assets in `cats-platform` | Ported | Repo-owned native installer helper now keeps Goose on the packaged setup baseline and treats post-install auth as an explicit host-owned interruption |
| Windows native Junie installer | `environment-bootstrap/platform/windows/Install-Junie.ps1` | `cats-platform/scripts/windows/Install-Junie.ps1` | packaged-host provider assets in `cats-platform` | Ported | Repo-owned native installer helper now keeps Junie on the packaged setup baseline and treats JetBrains sign-in follow-through as an explicit host-owned interruption |
| Linux/macOS npm prefix, native CLI pack, native provider installers, and readiness audit | `environment-bootstrap/platform/{linux,macos}/install-*.sh`, `check-installation.sh`, and shared Unix helper knowledge | `cats-platform/scripts/{linux,macos}/*`, including platform-local `provider-cli-common.sh` and `node-cli-common.sh` | packaged-host assets in `cats-platform` | Ported | Repo-owned Unix helpers are now staged under `shared/setup-assets/{linux,macos}/` with platform-local shell support files, and the packaged host executes them through the same structured setup bridge used on Windows |
| Ngrok / tunnel setup | `Install-Ngrok-Admin.ps1`, `Setup-Ngrok.ps1` | `environment-bootstrap` only | later transport helper layer in `cats-platform` | Defer | Not part of the first packaged setup baseline |
| Guacamole / Tailscale / workstation extras | extra-mode scripts | `environment-bootstrap` only | none for current packaged setup | Exclude | Not part of `cats-platform` packaged setup scope |

## Recommended Port Order

1. Extend the packaged native provider installer baseline next.
   - The prerequisite npm prefix + PATH helper is now repo-owned in
     `cats-platform/scripts/windows/Setup-NodeGlobalPrefix.ps1`.
   - The Windows npm-global CLI pack installer is now repo-owned in
     `cats-platform/scripts/windows/Install-NodeCliPack.ps1`.
   - The Windows native Claude Code installer is now repo-owned in
     `cats-platform/scripts/windows/Install-ClaudeCode.ps1`.
   - The Windows native Cursor Agent installer is now repo-owned in
     `cats-platform/scripts/windows/Install-CursorAgent.ps1`.
   - The WSL prerequisite preflight is now repo-owned in
     `cats-platform/scripts/windows/Check-WslPrerequisites.ps1`.
   - The WSL substrate and Ubuntu installer is now repo-owned in
     `cats-platform/scripts/windows/Install-WslUbuntuEnvironment.ps1`.
   - The host-side readiness audit is now repo-owned in
     `cats-platform/scripts/windows/Check-WindowsSetupReadiness.ps1`.
   - The first repo-owned WSL-backed provider installer originally landed as
     `cats-platform/scripts/windows/Install-KiroWslCli.ps1`, then was later
     removed when Kiro was folded into the shared `Install-WSLCLITools.ps1`
     provider loop.
   - Selective auth/readiness follow-through is now landed.
   - The first packaged path is now explicitly frozen around Claude, Cursor,
     Goose, Junie, and Kiro rather than leaving Goose/Junie as implied future
     work.

2. Expand host bridge and resume semantics after the first native + shared WSL
   provider installer set.
   - Claude, Cursor, and Kiro now give the packaged setup flow concrete
     native-plus-WSL provider targets.
   - Selective auth/readiness follow-through is now also landed through the
     repo-owned readiness audit plus explicit host interruption kinds for
     relaunch, restart, elevation, first WSL boot, and auth-required states.
   - Docker install, warm-up, and Ollama local-model runtime follow-through are
     now explicit.
   - The remaining gap is no longer deciding whether Goose/Junie or Ollama
     belong in the first packaged path; the main open follow-through has moved
     to heavier expert-only capability packs.

3. Defer tunnel flows and broader local-model follow-through until after the
   first packaged setup contract
   is stable.
   - They are still useful knowledge sources.
   - They are not the lowest-friction first packaged path described by
     `SPEC-023`.

## Implications for `PLAN-030`

- Phase 1 can be considered landed once this inventory is accepted as the
  extraction baseline.
- The first implementation slice after planning should be executable, not
  another broad documentation pass.
- `cats-platform` should prefer product-owned asset contracts over lifting raw
  bootstrap
  scripts verbatim.
- `cats-runtime` remains the runtime/provider authority; `cats-platform` still
  needs to
  own packaged-host execution and resume behavior.

## Recommended Next Slice

Keep the next packaged-host slice focused on either:

- additional host/runtime recovery coherence that is still missing from the
  packaged setup bridge, or
- heavier expert-only capability-pack follow-through that still remains
  outside the current repo-owned packaged helper baseline

The contract no longer treats Goose/Junie as missing or deferred baseline work.
