# PLAN-107: Desktop Provider Management

## Metadata

| Field | Value |
|-------|-------|
| Status | Delivered in 0.2.9 unsigned preview; native acceptance remains |
| Owner / Reviewer | User |
| Last updated | 2026-09-17 |

## Related Design

[SPEC-116](../specs/SPEC-116-desktop-provider-management.md) and
[ADR-116](../decisions/116-share-desktop-provider-management-across-onboarding-and-settings.md).
This is the Desktop delivery slice of shared Runtime PLAN-039, not a competing
provider selection contract. The user explicitly approved continuing directly
from documentation into implementation and release.

## Implementation Phases

### 1. Shared state and operations

- [x] Inspect current onboarding, Settings, Runtime selection/observations, and
  upstream helper history; record accepted design.
- [x] Implement host provider-management read/action contracts with sender checks,
  exact target/revision validation, operation progress, and retained observations.
- [x] Add any required Runtime contract support for scoped connection checks and
  race-safe subset scans; keep existing standalone setup semantics.
- [x] Remove save-triggered and helper-triggered redundant whole-selection scans.

### 2. Shared UX

- [x] Embed one browser-safe manager in onboarding and Settings > Runtime.
- [x] Selection + observations + actions per row; Apply with optional detection;
  stable footer; explicit Continue; empty and partially ready completion.
- [x] Per-target install/check progress, useful manual steps, endpoint editing,
  advanced lifecycle controls, retained history and cross-editor conflicts.

### 3. Native helper maintenance

- [x] Record source baseline and applicability for all post-port upstream changes.
- [x] Correct Windows Cursor/Kiro paths and sync native version gates.
- [x] Port Devin retry/Grok metadata behavior and truthful observed results.
- [x] Bring selected npm prerequisites up to the verified update contract.
- [x] Stage new shared support assets for Windows/macOS/Linux and cover contracts.

### 4. Verification and release

- [x] Focused Runtime/host/renderer/helper regressions and affected type/build checks.
- [x] Independent review and isolated visual/behavior verification of both entries.
- [x] Incremental commits; update docs and actual validation results.
- [x] Select unused Desktop patch version; update package/lock/release notes.
- [x] Open auto-squash PR(s), wait for required full CI and actual merge.
- [x] Dispatch unsigned preview with exact merged Runtime commit; wait for all
  platform builds, asset validation, and publication; verify update metadata.
- [x] Return changed repos to clean main and remove confirmed merged branches.

## Upstream Reconciliation

Source: local environment-bootstrap, through `752dc13` (2026-09-16). The last
provider addition port is `6f59feb` (Muse, 2026-09-05), delivered in Platform
`5af840d2`; older helpers have their own older baselines. This matrix records
applicability, not a claim that raw scripts can be copied unchanged.

| Source | Change | Integration decision |
|--------|--------|----------------------|
| c881307 | PS7/5.1 module environment through .cmd installers | Muse already isolates via 5.1; audit other native child installers |
| 2335020 | Muse sandbox account visibility | Machine login preference, outside native provider install UI |
| 1a43d11 / d624c3c | Standalone update/upgrade desktop shortcuts | Environment-bootstrap launcher feature, outside Cats managed helpers |
| f9776f0 / 668ac2b | Observed change summaries on all OSes | Adapt before/after outcomes to structured Cats results |
| 69030f5 / 668ac2b | Native upstream version gates and old-version cleanup | Port version gates; bound cleanup to known installer-owned paths |
| 17517c4 | Windows Cursor/Kiro actual install directories | Port detection/PATH/verification corrections |
| 24f543c | Devin manifest gate, sharing-violation retries, POSIX query failures | Port with explicit failed/partial result semantics |
| 752dc13 | Grok channel pointer and isolated installer failures | Port metadata gate; preserve child-process isolation already in Cats |
| 4690075 | Consistent npm update and verification | Port selected prerequisite behavior; preserve user's prefix |
| a4721ae | Remove Git LFS provisioning | Cats provider helpers do not provision Git LFS; no action |
| 3ccb6d7 | WSL outer-shell quoting for npm updater | WSL path outside this native UX delivery |
| 08e08b1 | Zeabur GitHub API failure | Zeabur is not a Cats provider; no action |

## Validation Strategy

Use isolated temporary roots, fake Runtime responses, and fixture installers.
Cover real shared-manager interactions in DOM tests, host IPC validation, target
and revision scope, observation retention, failure/manual-step outcomes, and
packaging inventories. Static/simulated OS checks do not claim real install or
login coverage. Run full suites in required PR CI; do not duplicate passing full
CI locally solely for a commit/version bump.

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-16 | Design approved; documented current split UI, global per-card scans, retained-observation gap, and upstream drift. User authorized implementation, auto-merge and unsigned preview publication. |

- 2026-09-16: Shared DOM manager is mounted by onboarding and Settings; host owns
  revision-bound per-target operations. Focused Desktop tests passed (33), plus
  host build and renderer typecheck. Independent core-flow review found no
  remaining blockers after async/revision/PATH fixes. Native helper port follows.

- 2026-09-16: Native helpers now gate upgrades with published metadata, keep
  newer installations, run vendor PowerShell in isolated children, and report
  observed version changes (a same-version attempt remains unchanged). Devin
  retries only typed sharing violations. Cleanup is limited to older builds in
  canonical user-owned trees; current/newer/pending builds and links remain.
  npm upgrades resolve and install exact versions with engine checks and verify
  command/package versions, preserving explicit prefixes. Dry-run paths return
  before mutation, including superseded-package migration.
- Validation: 38 initial Windows helper regressions passed; follow-up coverage
  includes Node registry PATH, owned-child timeout, external npm prefixes and
  legacy Pi migration. Seven Unix observation fixtures passed for both script
  copies; the 19 existing Unix contracts passed. Host, renderer, package staging,
  tarball executable, and shared-view regressions passed; package manifest
  assertion was updated for the new shared module. TypeScript and renderer/host
  builds passed. Isolated Edge checks exercised onboarding Apply/wait/Continue
  and the shared Settings view without browser errors or user-state writes.
  Native downloads, installation/login on physical macOS/Linux remain manual
  acceptance; required CI and three-platform release builds are delivery gates.

- Runtime PR #54 passed release-preflight and merged as
  `c1a5c0ae108a155b14867f85c344a23c9a95bdbf`. Desktop version 0.2.9 and the release
  notes pin that exact Runtime 0.1.24 source. Final independent helper review
  cleared all blockers. The new Windows helper/PATH cases passed (7), and the
  package-content assertion passed after registering the shared manager.

- Final viewport inspection bounded the provider list inside onboarding, keeping
  Apply/progress/Continue visible at the Desktop window size even with all 18
  supported native examples. Settings uses a bounded list for the same footer.

- The first full Platform CI run passed 4,530 cases and caught 14 expectations
  tied to the replaced onboarding cards. Those fixtures now exercise the shared
  manager's scoped actions, Ollama connection/install separation, Muse install,
  retained failed outcomes, and the still-supported recovery accordion. The
  focused host/view/page set passed before resubmitting the full CI gate.

- Follow-up review restored prerequisite/recovery-action regression coverage and
  identified redraws resetting a scrolled provider list. The shared manager now
  retains list position and expanded controls across edits and detection; all
  14 view/page cases pass. Independent review cleared the final delta. An isolated
  960x700 Edge run preserved scrollTop 1346 through selection edits, Apply and
  per-row Detect, retained expanded controls, kept the footer visible, and
  reported no browser errors. Platform PR #80 passed both required CI checks and
  merged as `5a9f8908b82046ffbf5a49e691e0d3c3ef32e091`; this final fix follows in
  a separate PR before preview publication.

## Delivery Evidence

- Runtime [#54](https://github.com/cats-inc/cats-runtime/pull/54), Platform
  [#80](https://github.com/cats-inc/cats-platform/pull/80) and follow-up
  [#81](https://github.com/cats-inc/cats-platform/pull/81) passed their required
  CI and squash-merged. Final Platform CI passed 4,540 cases, skipped 54
  conditionally, and failed none. Both implementation checkouts returned to
  clean main; the confirmed merged task branches were removed locally/remotely.
- [Unsigned preview 0.2.9](https://github.com/cats-inc/cats-platform/releases/tag/v0.2.9)
  was published at 2026-09-16 13:02:03 UTC by
  [run 35098915681](https://github.com/cats-inc/cats-platform/actions/runs/35098915681).
  Platform source is `fb402fced2f048ff96a03cb7b619d0b7c8b32a69`; packaged Runtime
  0.1.24 is `c1a5c0ae108a155b14867f85c344a23c9a95bdbf`. All three builds, bundled
  App verification, update-asset validation and publication succeeded.
- The actual `electron-updater` GitHub provider parsed the public feed using
  the 0.2.8 preview settings and selected 0.2.9 on Windows x64, macOS x64 and
  Linux arm64. Every metadata file resolved to the corresponding published
  installer/archive with matching asset size and a well-formed SHA-512 value.
  This verified update discovery without downloading/installing the application
  or changing the user's Desktop state.
- Physical provider installation, provider sign-in, and the installed Desktop
  download/restart handoff remain user acceptance. Fixture/packaging success
  does not claim that those machine-specific actions were performed.

## First-run Catlas Auth Correction (Desktop 0.2.10)

- User acceptance found the product setup's second step returning
  `Authentication is required.` even after Runtime had applied its selection.
  The initial browser checks had covered Desktop provider setup but not the
  subsequent product setup with authentication enabled and no Admin session.
- The correction allows only `GET /api/providers` and the exact basic/advanced
  model catalog paths during `pre_setup`. Existing Runtime target projection
  remains authoritative; catalog mutations, unrelated APIs, post-setup and
  auth repair retain their original authentication requirements.
- An isolated HTTP regression first reproduced the 401, then passed the full
  catalog-to-Admin/Catlas completion flow. Together with policy/router coverage,
  49 focused cases pass. Server build and test TypeScript checks passed. An isolated Edge run
  exercised the actual two-step UI, enabled the model picker, completed setup,
  confirmed its authenticated session and anonymous post-setup 401, and reported
  no browser errors. Independent review cleared the change.
- The patch release uses Desktop `v0.2.10` with the same exact Runtime 0.1.24
  commit `c1a5c0ae108a155b14867f85c344a23c9a95bdbf`. Required PR CI and the manual
  three-platform unsigned release workflow remain publication gates. The
  [release record](https://github.com/cats-inc/cats-platform/releases/tag/v0.2.10)
  carries the actual publication and updater-discovery evidence.
