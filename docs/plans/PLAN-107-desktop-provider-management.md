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
- [ ] Implement host provider-management read/action contracts with sender checks,
  exact target/revision validation, operation progress, and retained observations.
- [ ] Add any required Runtime contract support for scoped connection checks and
  race-safe subset scans; keep existing standalone setup semantics.
- [ ] Remove save-triggered and helper-triggered redundant whole-selection scans.

### 2. Shared UX

- [ ] Embed one browser-safe manager in onboarding and Settings > Runtime.
- [x] Selection + observations + actions per row; Apply with optional detection;
  stable footer; explicit Continue; empty and partially ready completion.
- [x] Per-target install/check progress, useful manual steps, endpoint editing,
  advanced lifecycle controls, retained history and cross-editor conflicts.

### 3. Native helper maintenance

- [ ] Record source baseline and applicability for all post-port upstream changes.
- [ ] Correct Windows Cursor/Kiro paths and sync native version gates.
- [ ] Port Devin retry/Grok metadata behavior and truthful observed results.
- [ ] Bring selected npm prerequisites up to the verified update contract.
- [ ] Stage new shared support assets for Windows/macOS/Linux and cover contracts.

### 4. Verification and release

- [ ] Focused Runtime/host/renderer/helper regressions and affected type/build checks.
- [ ] Independent review and isolated visual/behavior verification of both entries.
- [ ] Incremental commits; update docs and actual validation results.
- [ ] Select unused Desktop patch version; update package/lock/release notes.
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
