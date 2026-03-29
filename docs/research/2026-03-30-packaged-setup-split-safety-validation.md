# 2026-03-30 Packaged Setup Split-Safety Validation

Date: 2026-03-30
Topic: Validate which packaged setup slices are now repo-owned and safe after
the `cats` / `cats-runtime` repo split
Source:
- `electron/setupAssets.ts`
- `electron/packaging.ts`
- `electron/setupBridge.ts`
- `scripts/windows/*`
- `tests/desktop-packaging.test.js`
- `tests/desktop-setup-assets.test.js`
- `tests/desktop-setup-readiness.test.js`
- `tests/desktop-setup-bridge.test.js`
- `tests/skill-sync-scripts.test.js`

## Validation Setup

Commands run:

```powershell
cd cats
npm run build:host
node --test --test-isolation=none tests/desktop-packaging.test.js tests/desktop-setup-assets.test.js tests/desktop-setup-readiness.test.js tests/desktop-setup-bridge.test.js tests/skill-sync-scripts.test.js
```

## Findings

### Packaged Setup Execution Is Now Repo-Owned for the First Windows Baseline

- `electron/setupAssets.ts` stages the packaged setup helper catalog from local
  `cats/scripts/windows/*` assets, not from submodule paths.
- `electron/setupBridge.ts` resolves helper execution from those repo-owned
  staged or source-local paths and does not shell out to
  `environment-bootstrap` or `project-bootstrap`.
- The bounded host bridge now persists the last setup action in the desktop
  host state file and re-derives helper availability from packaged asset
  metadata rather than renderer-owned guesses.

### Staged Packaging Truth Matches the Repo-Owned Helper Surface

- `tests/desktop-packaging.test.js` passed with the current contract.
- That test still locks these repo-owned packaged assets into the staged plan
  and installer manifests:
  - `scripts/windows/Setup-NodeGlobalPrefix.ps1`
  - `scripts/windows/Install-NodeCliPack.ps1`
  - `scripts/windows/Install-CursorAgent.ps1`
  - `scripts/windows/Check-WslPrerequisites.ps1`
  - `scripts/windows/Install-WslUbuntuEnvironment.ps1`
  - `scripts/windows/Install-KiroWslCli.ps1`
  - `scripts/windows/Check-WindowsSetupReadiness.ps1`
- `electron/packaging.ts` now points every ported first-wave asset's
  `currentHome` at `cats/scripts/windows/*`, while still keeping
  `environment-bootstrap` and `project-bootstrap` marked as source knowledge
  only (`productDependency: false`).

### What Is Safe After Split vs Still Deferred

Safe after split for the first packaged setup baseline:

- runtime-owned provider metadata consumed from `cats-runtime`
- repo-owned Windows packaged setup helpers listed above
- repo-owned packaged setup host bridge and persisted setup action state
- repo-owned cross-platform skill sync scripts in `cats`

Still intentionally deferred or incomplete:

- Docker Desktop install and warm-state helpers still only exist as deferred
  source knowledge (`environment-bootstrap/platform/windows/Install-Docker-Admin.ps1`)
- richer readiness/auth follow-through beyond the current structured readiness
  audit
- deeper interruption handling across relaunch, elevation/UAC, first WSL boot,
  and later auth-required recovery

## Summary

The first packaged setup baseline now passes the narrow split-safety check:

- the product flow can discover, stage, bundle, and execute its first Windows
  packaged setup helpers from repo-owned assets
- `environment-bootstrap` and `project-bootstrap` remain source inputs, not
  product runtime dependencies
- the remaining split risk has moved to later capability packs and deeper
  interruption semantics, not the already ported first-wave helpers

## Relevance

This validation narrows `PLAN-030` truth:

- the repo-owned packaged setup baseline is evidence-backed
- later work should focus on deferred capability packs and deeper resume flows,
  not re-porting the already internalized first-wave helper set

## Action Items

- Keep Docker and other deferred capability packs out of the first split-safe
  baseline until a separate product slice justifies them.
- Continue deepening interruption handling in the host bridge instead of
  re-opening already ported helper knowledge.
