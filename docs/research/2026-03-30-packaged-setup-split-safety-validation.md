# 2026-03-30 Packaged Setup Split-Safety Validation

Date: 2026-03-30
Topic: Validate which packaged setup slices are now repo-owned and safe after
the `cats-platform` / `cats-runtime` repo split
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
cd cats-platform
npm run build:host
node --test --test-isolation=none tests/desktop-packaging.test.js tests/desktop-setup-assets.test.js tests/desktop-setup-readiness.test.js tests/desktop-setup-bridge.test.js tests/skill-sync-scripts.test.js
```

## Findings

### Packaged Setup Execution Is Now Repo-Owned for the First Windows Baseline

- `electron/setupAssets.ts` stages the packaged setup helper catalog from local
  `cats-platform/scripts/windows/*` assets, not from submodule paths.
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
  `currentHome` at `cats-platform/scripts/windows/*`, while still keeping
  `environment-bootstrap` and `project-bootstrap` marked as source knowledge
  only (`productDependency: false`).

### What Is Safe After Split vs Still Deferred

Safe after split for the first packaged setup baseline:

- runtime-owned provider metadata consumed from `cats-runtime`
- repo-owned Windows packaged setup helpers listed above
- repo-owned packaged setup host bridge and persisted setup action state
- repo-owned cross-platform skill sync scripts in `cats-platform`

Still intentionally deferred or incomplete:

- richer desktop remediation polish above the current explicit interruption
  contract
- any broader Ollama/local-model or future expert-only capability packs beyond
  the now-ported native CLI plus Docker baseline

### Sibling A2A / Bootstrap Pilot Remains Coherent

- `project-bootstrap` remains a read-only source input for collaboration
  knowledge, but the packaged setup flow does not shell out to it and does not
  treat its artifacts as a runtime dependency.
- The sibling collaboration pilot stays governed by
  [`cats-runtime` PLAN-023](../../../cats-runtime/docs/plans/PLAN-023-a2a-layering-and-collaboration-artifact-alignment.md),
  while `cats-platform` only mirrors the already-extracted A2A file set and
  repo-owned skill-sync posture needed for split-safe sibling alignment.
- The packaged setup contract additions made under `PLAN-030`, including
  explicit interruption handling plus the staged `localProviders` rollout, do
  not reopen the A2A extraction track. They stay on the packaged-host setup
  boundary and leave collaboration artifact ownership with the sibling pilot.

### Merge-Back Remains Deferred

- Nothing in the packaged setup baseline or the sibling A2A pilot is being
  treated as an automatic merge-back into `project-bootstrap`.
- Long-term convergence remains evidence-led after additional pilot loops,
  rather than being implied by the existence of repo-owned rewrites.

## Summary

The first packaged setup baseline now passes the narrow split-safety check:

- the product flow can discover, stage, bundle, and execute its first Windows
  packaged setup helpers from repo-owned assets
- `environment-bootstrap` and `project-bootstrap` remain source inputs, not
  product runtime dependencies
- the remaining split risk has moved to later capability packs, deeper
  remediation polish, and later governance/adoption decisions, not the already
  ported first-wave helpers

## Relevance

This validation narrows `PLAN-030` truth:

- the repo-owned packaged setup baseline is evidence-backed
- sibling A2A/bootstrap pilot work remains coherent without being reopened
  under packaged setup
- later work should focus on Docker/local-model capability packs, deeper
  remediation polish, and explicit adoption gates rather than re-porting the
  already internalized first-wave helper set

## Action Items

- Keep Docker and other heavier capability packs out of the first split-safe
  baseline until a separate product slice justifies them.
- Continue polishing host remediation and recovery UX instead of re-opening
  already ported helper knowledge.
- Keep merge-back into `project-bootstrap` and any production-default
  collaboration rollout as separate evidence-led decisions.
