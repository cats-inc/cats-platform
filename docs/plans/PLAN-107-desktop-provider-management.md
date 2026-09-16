# PLAN-107: Desktop Provider Management

## Metadata

| Field | Value |
|-------|-------|
| Status | In progress |
| Owner / Reviewer | User |
| Last updated | 2026-09-16 |

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
- [ ] Open auto-squash PR(s), wait for required full CI and actual merge.
- [ ] Dispatch unsigned preview with exact merged Runtime commit; wait for all
  platform builds, asset validation, and publication; verify update metadata.
- [ ] Return changed repos to clean main and remove confirmed merged branches.

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
