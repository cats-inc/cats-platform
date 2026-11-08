# Testing Strategy

Optional Runtime reset coverage lives in `platform-data-reset`,
`desktop-runtime-data-reset` and `platform-data-reset-confirmation`, with
auth/setup and shared confirmation consumers. Use isolated temporary roots;
never run acceptance against the installed profile. Native source acceptance
checks the unchecked default, exact `RESET` gating, stopped/restarted services,
retained external/install fixtures and a fresh provider page with Continue
disabled after the checked reset. A successful purge alone does not prove the
previous provider view was discarded. ADR-135 and PLAN-107 record the validation
and remaining OS/release boundaries.

For the planned shared App ingress, follow
[SPEC-122 acceptance](specs/SPEC-122-app-components-and-private-services.md#acceptance)
and [PLAN-115 P4](plans/PLAN-115-app-components-and-private-services.md#p4--shared-platform-ingress-next-implementation-sequence).
Require a remote client plus Platform/Mobile and two Apps/MCP paths through one
origin/port/tunnel, cross-App/Platform auth denial, App-scoped revocation and real
opaque-sandbox Copy. The historical local per-App Windows fixture does not pass
these gates. Documentation-only changes use diff/link checks, no product builds.

> Testing approach, standards, and procedures for `Cats`.

## Overview

The current focus is smoke and integration coverage around the Node server and
shared app-shell contract. The renderer now drives real chat flows, but it
is mostly covered through server and state integration tests, with a small set
of direct renderer-adjacent regression tests for app-shell normalization,
selected-channel typing, and persisted-room route-entry wake decisions. The
Telegram transport seam is also covered directly at the platform-module level
so dedupe, durable mapping, and webhook behavior can advance without touching
chat-core tests. Current regression coverage also targets chat-entry wake
behavior through explicit selection mutations, read-only app-shell boot
semantics, direct-cat default routing, re-wake flows for sleeping room
participants, transcript-adjacent operator-loop wiring, conversation-scoped
approval/run selection, pre-dispatch reroute actions, retry/acknowledge
operator seams, room-workflow branch metadata, effective policy summaries, and
chat-workflow activity projection into the shared core read model. Operator
loop regression coverage also verifies that invalid effective-policy enum
metadata is ignored rather than leaked through raw casts, and that
acknowledge-action metadata uses the stable `operatorAcknowledged*` key family.
Memory-substrate regression coverage also verifies that curated cat/owner
durable memory is promoted into canonical retrieval, and that scope-aware
flushes remove stale canonical hits after update/delete flows.
Desktop-host regression coverage now also checks:

- `cats` app startup flag parsing and lifecycle output
- desktop bootstrap phase selection (`ready_for_setup`, `ready_for_chat`,
  `needs_prerequisites`)
- managed child-process launch specs for `cats` and `cats-runtime`
- Electron host security guards for sandboxed preload usage, validated desktop
  action ids, validated host overrides, and validated update URLs
- Windows installer smoke-check script coverage for bundled sidecars and the
  persisted desktop-host state contract
- macOS/Linux unpacked-package smoke-check script coverage for bundled
  sidecars, packaged setup assets, and platform-scoped installer contracts
- host build smoke through `npm run build:host`
- packaged App/config/SDK startup paths against Electron resource destinations
- isolated startup of both shipped sidecars, including the actual bundled
  Runtime entry and its health endpoint; the Platform unavailable-Runtime
  fixture alone cannot detect Runtime bundle import failures
- shipped App version/hash equality with the release selection, source-free
  offline installation, enabled Lobby contributions and repeat-start idempotence
  through `verify-desktop-app-bundle.mjs`; see [App package checks](app-packages.md)
  Release receipts require both `platformStartup` and `runtimeStartup` before
  publication.

## Test Types

### Interactive CLI Lifecycle

After `npm run build:server`, run the affected entrypoint and Desktop consumers:

```sh
node --test tests/cli-interaction.test.js tests/cli-entrypoint.test.js tests/app-startup.test.js tests/app-shutdown.test.js tests/platform-cli-auth-session-secret.test.js tests/desktop-startup.test.js tests/desktop-host-bootstrap-contract.test.js
```

The compiled-entrypoint fixtures isolate HOME/config/state and intercept browser
openers. They verify ready-only opening, `o`, `q`, Ctrl+C, `--no-open`, early
parent disconnect and IPC cleanup without touching user state. Helper tests
cover managed, CI, redirected and machine-output exclusions plus all three OS
opener commands. Native browser/physical-terminal smoke on each OS is separate.

### Smoke and Integration Tests

- **Location**: `tests/*.test.js`
- **Framework**: `node:test`
- **Scope**: Built server endpoints, runtime-backed chat mutations, and
  file-backed store behavior, including Telegram status/webhook routes and
  restart durability for relay state

### Future Unit Tests

- **Location**: `tests/` or `tests/unit/`
- **Framework**: `node:test`
- **Scope**: Pure chat-state, orchestration, persistence modules, and transport
  seams such as Telegram dedupe/mapping without booting the full server

### Future Renderer Tests

- **Location**: `src/renderer/**` or `tests/ui/`
- **Framework**: TBD
- **Scope**: Channel switching, runtime banners, orchestrator shell behavior,
  and richer operator-loop interactions such as generic approval action
  options, retry/acknowledge controls, and run-inspector DOM behavior

### Desktop Host Tests

Production host diagnostics (ADR-145) use `npm run build:host` followed by focused
`node --test` runs for `desktop-host-diagnostics.test.js`,
`desktop-supervisor.test.js`, `desktop-window-placement.test.js`, the tray/startup
tests and affected bootstrap/candidate tests. Coverage includes privacy, severity,
native-query failure isolation, fatal nonzero exit, bounded UTF-8 records and
legacy/current/previous logs, live stdout/stderr rotation, readiness and shutdown.

After the host build, run
`electron scripts/testing/desktop-host-diagnostics-acceptance.mjs` for a real
fixture window's show/hide and renderer crash events. It creates a temporary
profile, starts no sidecars/provider or crash reporter, and prints retained
`host.log`/`result.json` evidence. Real monitor hot-plug/DPI changes and GPU loss
still require separate native OS acceptance; synthetic events do not prove them.

Validation on 2026-11-02, Windows x64 / Node 26.13.0: scoped host/supervisor/
placement/tray/startup checks passed (74 tests); bootstrap/state/lifecycle checks
passed (19); candidate command/profile/interaction checks passed (22). After adding
the final log-directory startup-failure guard, host compilation and the affected
diagnostics/supervisor/placement checks passed again (56 tests, including the new
full two-service `startAll` case). No full Platform/mobile suite is claimed.
Independent review found no remaining issues.

Real Electron 41.2.0 acceptance captured show/hide, `renderer-gone` with
`reason=crashed` / exit code 2, and clean host exit. The source candidate command
also built the pinned Runtime plus Platform server/host and production renderer;
both private services became ready, a visible first-run window was captured and
inspected, and its host log recorded lifecycle/display/service/bootstrap events.
Authenticated stop returned exit code 0; an OS process check confirmed host and
both sidecars had exited. The candidate preceded only the final diagnostic-directory
failure guard, which the separate full-startup regression covers.

Private evidence/launch/source receipt:
parent workspace `.diagnostics/desktop-host-log-candidate-20261102-2` (Platform
source digest `4558c543863dbd75b273f65330bb8368242cc04c927f66f5471d4f1813a08809`,
Runtime commit `c6e575b672ecaf3d6113c08260720b57c7d62765`). The initial attempt
stopped during compilation because the shared checkout's installed dependencies
lacked its pinned UI package; locked dependencies in the task worktree resolved it.
No installed application, real user profile or provider selection was changed.

Windows npm-provider checks in `tests/desktop-installer-observations.test.js`
cover a fresh account whose global npm prefix does not exist. Native npm
`ENOENT` under Windows PowerShell must yield a JSON install plan without creating
the folder; a CLI already on PATH keeps its installed state with an unknown npm
package version. Other native errors, including permission failures, still fail
instead of being interpreted as a missing package. Non-native PowerShell errors
that merely mention `ENOENT` also propagate. Both Pi legacy-package lookups use
the same guarded list probe. The fixtures invoke no real provider, registry query
or install. Windows PowerShell 5.1 validation passed all 15 cases in this file;
this is focused helper validation, not a full Platform or installed-upgrade run.

Windows elevation checks in `tests/windows-node-elevation.test.js` run the
real Windows PowerShell 5.1 child and JSON relay from temporary script and user
temp directories. They cover the packaged `Cats Bot` path, spaces in either
path, Unicode and shell punctuation, missing/empty/invalid/locked child results,
successful result passthrough and a declined UAC prompt for Node, Git, GitHub CLI
and VC++ Runtime. Only the administrator observation and UAC launch are
substituted; probe-skip flags prevent downloads and real installers. The
28 regression cases passed on Windows. Actual UAC acceptance and clean-machine installation still need
manual validation. These focused helper checks do not compile the Desktop host;
host integration suites require `npm run build:host` first. That build and the
six Desktop setup PATH-refresh integration cases also passed separately.

`tests/windows-setup-process-contracts.test.js` covers native argv roundtrips,
all four substrate helpers' Apply/Upgrade/Force previews, successful and failed
vendor children under spaced Unicode TEMP paths, and installer exits 0/3010/1603.
Its 34 cases passed under Windows PowerShell 5.1; installer/network calls use
private fixtures. A 3010 result must retain its explicit Windows-restart data.
`tests/unix-node-preview.test.js` covers 14 macOS/Linux Node preview cases with
and without nvm, using blocked curl and nvm mutations. These passed with Git Bash
on Windows; the same file selects `/bin/bash` on native macOS/Linux. Native Unix
execution and real clean-machine installs remain separate acceptance checks.

Windows MSI advice also has consumer coverage: `desktop-setup-prerequisites`,
`desktop-setup-path-refresh`, `desktop-setup-bridge`, `desktop-provider-manager`,
`desktop-bootstrap-provider-manager` and `provider-manager-view` passed 61 checks
after the host build. They retain an explicit machine reboot across ready/failed
rechecks and unrelated helper runs without preserving it in a new process.
The real first-run page fixture passed 51 distinct scenarios (50 in the full run,
then all seven Windows-restart scenarios after the host-session addition), with
zero page errors. Ready and missing Node screenshots were visually checked.
These use fake helpers and private profiles, not real UAC or system installers.

Unix npm-prefix JSON regression checks run with the system `/bin/bash` on macOS,
including Bash 3.2 with `set -u`. They cover an already configured folder, required
configuration changes and forced nvm preparation without installing software or
changing the owner's npm settings. Run these focused cases with:

```sh
node --test --test-name-pattern='prefix checks emit complete JSON|forced nvm prefix preparation' tests/unix-installer-observations.test.js
```

- **Location**: `tests/app-startup.test.js`,
  `tests/desktop-readiness.test.js`, `tests/desktop-supervisor.test.js`
- **Framework**: `node:test`
- **Scope**: app-managed startup contract, host prerequisite snapshot logic,
  and managed child-process launch/shutdown seams

`tests/desktop-setup-auth-recovery.test.js` covers the setup bridge's current
authentication recommendation after newer per-target Runtime observations,
including unknown/missing status, stale or unrelated evidence and preservation
of helper history and other recovery actions. Run it after `npm run build:host`
alongside `tests/desktop-cli-inventory-probe.test.js` and
`tests/desktop-setup-bridge.test.js`.

The first-run wizard has its own check of the real pages: the page the host
would load, in headless Chrome, with a fake `window.catsDesktopHost`, so no
script, install or terminal runs and no user state is touched. It needs
`playwright-core` here or in a sibling `cats-runtime` checkout.

```bash
npm run build:host
node scripts/test-first-run-wizard-renderer.mjs [screenshot-dir]
```

## Choosing Local Validation

The hosted Node.js CI job has a 20-minute deadline. Catlas cancellation fixtures
also bound their wait for model startup and fail immediately if help returns before
dispatch; deferred model responses are released during cleanup. A missing or
incompatible knowledge bundle must fail a test instead of leaving CI waiting for
a model call that will never occur.

[AGENTS.md: Local Validation Scope](../AGENTS.md#local-validation-scope) is the
canonical policy for all agents. Local commit/handoff checks cover the affected
behavior and consumers; a full local suite is not a routine prerequisite.
Documentation/rules-only changes use diff and reference review.

Use focused Node test files, rebuilding only the artifacts those tests consume:

```bash
node --test --test-isolation=none tests/<name>.test.js
node --test --test-isolation=none build/test/<name>.test.js
```

The first form may require a fresh `build:server` or `build:host`, depending on
its imports. The second requires `build:test-ui` for the selected TypeScript/UI
tests. Run affected type/boundary checks and include indirect consumers of
shared contracts. Reuse passing checks for unchanged inputs; full local
`npm test` remains available for explicit requests, full-suite diagnosis, or
changes whose impact cannot be bounded confidently.

### Composer sizing, attached chrome and menu layers

For Platform #296/#297, exercise controlled clears/restores, remounts, read-only
mirrors, width reflow and whole-stack docking in the focused renderer tests:

```sh
node --import tsx --test tests/composer-layout.test.tsx tests/conversation-scroll-memory.test.tsx tests/renderer-transcript-behavior.test.tsx tests/draft-composer-visibility-matrix.test.tsx tests/started-conversation-composer-matrix.test.tsx tests/screenshot-composer-action.test.tsx
node scripts/testing/composer-layout-smoke.mjs
```

The browser check uses existing Electron development dependencies, or an explicit
`CATS_TEST_BROWSER_EXECUTABLE` pointing to an existing Electron binary. It builds
production Chat/Code/Work draft wrappers, their shared conversation composer and
styles in an isolated profile. Its 18 cases cover three products × three presets
× draft/started, including real transcript/docked-state assertions. It checks
expansion, submit/clear, restored drafts, the header/card gap, chip hit targets,
permission menus where editable and attachment menus. Additional checks cover
Chat direct lanes and 1078×632, 768×800 and 1440×1000 viewports. The shared
navigation smoke separately protects group/direct controls and sidebar overflow.
All sends are local fixture callbacks: no provider CLI or real-profile records.
Detailed geometry and PNG evidence are written to ignored
`build/composer-layout-smoke/`; screenshots require visual inspection. This is
isolated renderer acceptance, not an installed Desktop release or live-provider
acceptance. Keep the native carousel transforms and each mode's recipient
semantics intact; broad z-index changes are not a substitute for hit testing.

2026-10-23 validation: 58 focused bundled tests passed in CI's shared-process
mode, alongside renderer/test typechecks, server and Vite builds, the 18-case
Windows Electron 41.2.0 matrix and existing navigation smoke. Geometry/screenshot
inspection confirmed attached chrome and restored heights; renderer errors and
provider calls were zero in the browser fixture. A separate source Candidate
built and reached first-run provider selection, then drained and exited with its
two sidecars; that startup check does not extend the fixture verdict to an
installed profile. No independent review or macOS/Linux native run was performed.

### Transcript width and wide Markdown content

The message lane shares the composer's width; intrinsic table/code widths must
not enlarge the Grid column or move right-aligned user messages. Keep the existing
85% bubble cap and content-sized short replies. Tables retain ordinary word
boundaries; tables and fenced code scroll inside their own regions, while prose,
inline paths and user text retain their existing wrapping.

`composer-layout-smoke.mjs` also covers 27 started-transcript scenarios: three
products × three presets × three viewport sizes. Each replaces a normal reply
with a wide table, unbroken fenced-code line, inline path and URL, then restores
the normal reply without remounting. It measures both bubble edges against the
composer, bounds row/canvas overflow, scrolls the table/code regions and verifies
untruncated code/user text, readable table headings and content-sized short replies.
Inspect both `transcript-wide-*.png` and `transcript-table-*.png`; the latter scrolls
the table into view and waits for the offscreen renderer to paint before capture.

2026-10-23 validation: the new browser assertions first reproduced a 6,034px
intrinsic column inside a 720px lane. After the width constraints, all 27 cases
retain their normal bounds, alongside the existing 18 composer cases and direct
lane checks, with no renderer errors or provider calls. Windows Electron 41.2.0
screenshots were inspected at the three sizes. All 39 selected message/Markdown,
transcript, composer and style tests passed in shared-process mode; renderer
TypeScript and Vite builds passed. This is isolated renderer acceptance, not an
installed-profile or macOS/Linux native result.

The production-style source candidate `transcript-overflow-candidate-20261023-b`
built from Platform `c57ac7c9` plus the dirty fix (source digest
`ac14b687f9ae18823b0bf008ada7b4932ae72b5640baa4fc185de037bfc33dc9`), with
Runtime `84fd051b`. Its first-run provider-selection screenshot was inspected;
the host and both sidecars drained and exited. This only verifies source build
and startup integration; the renderer fixture above proves the width behavior.

### Docs-only changes in CI

The CI workflow first checks whether every changed file is under `docs/`. If so,
the required `nodejs (24)` job still runs, so branch protection sees a passing check
with a stable name, but it skips install, typecheck and tests. `validate` runs as
usual. Any other path, a manual run or a failed detection runs every step.

The same job also skips code that already passed. `changes` fingerprints the mode, blob
and path of every tracked file outside `docs/` (for a pull request, the merge result)
and looks up the Actions cache key `ci-green-v1-<fingerprint>`, which a fully passing
`nodejs (24)` run saves. When a pull request is rebased only because main gained
documentation or release notes, its fingerprint is unchanged, so the rerun reuses the
earlier green result instead of the full suite. Any change outside `docs/`, including
the workflow, lockfile or `.nvmrc`, changes the fingerprint and runs everything. A
missing or evicted cache entry, or a manual run, also runs everything.

Pull-request caches stay within that pull request's scope, so the push to main after a
merge cannot find one. Instead, `changes` reuses the merged pull request's own run when
all of these hold:

- the push adds one commit on the previous main;
- the GitHub API names that commit as a pull request's merge;
- the request's final head, fetched from `refs/pull/<n>/head`, contains the previous
  main and has the pushed commit's tree;
- CI passed on that head as a `pull_request` run.

Main requires up-to-date branches, so an ordinary squash merge meets these. Any other
push, or a failed lookup, runs everything. The reuse trusts the pull request's run as
much as branch protection already does. `npm-publish.yml` likewise skips its test gate
when CI passed on the dispatched commit on main, and runs it otherwise.
`tests/ci-workflow.test.js` runs both steps against a local origin with a stubbed `gh`.

A pull request can also reuse a green run from main when its code outside `docs/` equals
main's, which means that exact code already passed there. The skip trusts everyone who can
push to the branch: such a person could save a marker for untested code. Pull requests from
forks cannot write to the base branch's cache scope.

Tests, scripts and tools must therefore not read repository documentation; keep
executable inputs under `tests/fixtures/`. `tests/docs-boundary.test.js` enforces the
rule. A line that names a docs path without reading it carries
`// docs-boundary-ignore: <reason>`.

## Running Tests

### Codex Windows first-time setup

The Desktop wizard adds an official Codex terminal entry after login. Its readiness
probe is read-only: initialize, initialized and windowsSandbox/readiness only, with
no thread, turn, configuration write or sandbox installation. Tests use private
temporary homes and workspaces, not the owner's Codex configuration.

After the clean-machine creation regression reported on 2026-11-08, readiness is
advisory. Account/Catlas regression tests cover incomplete, unverified and ready
status, creation without calling the readiness API (even if it would hang), and
discarding a pending run-log result after the view closes. Page 3 keeps the official
terminal entry and read-only readiness status; Runtime retains actual-turn checks.

Focused validation for this correction passed 31 account/Catlas/Google/i18n tests
and the headless Chrome initialization scenario (zero page errors), plus renderer
typecheck, affected-test typecheck, host and renderer builds. Independent review
found no blocker. The full test TypeScript project still requires the optional
mobile dependencies; no full-suite, real-model or customer-machine claim is made.

Focused Windows validation (2026-11-05) covers:

- 45 host/setup, provider-selection and prerequisite cases, 39 native-probe,
  target-resolution and Platform account/Catlas page cases, and six host/bootstrap
  and test-collection boundary cases all passed. The final page
  submission originally required a ready target; that UI gate is superseded by the
  advisory behavior above. Catlas off and late-result cancellation remain covered.
- Native launcher fixtures cover both x64/arm64 Node architectures independently of
  Electron, npm cmd/ps1 and standalone executables. RPC cases cover fragmentation,
  unknown statuses, cancellation, timeout, excessive output and owned descendants.
  Shutdown cancels and waits for preflight cleanup before the host exits.
- The headless Chrome wizard fixture's focused sign-in, Codex initialization, optional
  steps, page-one and language cases passed 10/10 without an installer or real terminal.
- Native Codex 0.166.0 checks used four private CODEX_HOME configurations; all four
  config files remained byte-identical. MXC readiness follows the current account's
  machine capabilities. Initialization readiness does not replace Runtime's actual
  permission check.

Desktop host/server and renderer builds and renderer/affected-test TypeScript checks
passed. The repository-wide test TypeScript project also imports mobile tests and
could not complete without this checkout's optional mobile dependencies; mobile and
the full suite were not validated locally. A focused test config checks the two
changed TypeScript suites without substituting types for missing mobile packages.

The account completion API remains unchanged: the fresh check is Desktop UI
preflight, not a server authorization flag. Known non-native targets do not need a
native sandbox. Unknown targets or native launch arguments concealed by Runtime's
public configuration remain unverified; setup can finish with another tool or Catlas
off. Real clean-machine terminal/UAC completion remains manual acceptance.

The pending-close renderer test resolves its mock and waits one Node event-loop turn
after unmount. React's bundled asynchronous act fallback leaves a referenced
MessagePort under this ESM test harness, so it is not used for an already unmounted
view. The corrected tests must exit naturally; force-exit is not passing evidence.

Source candidate `desktop-codex-init-20261105-04` reached first-run setup with
both owned services ready, was visually inspected, then drained with exit code 0
and both service PIDs cleared. Its launch receipt is
`76869e6c8c1bc61bc2850d9154aa9f32a40d5e75869b9864b1727d5e7a1c4208`:
Platform base `32305a506505f284dd28c17748cdc95c796ded02` plus working changes,
source digest `1b89481da6f24c1ac5bd05d8276fd8c7e4a1e537ec2ce2a3d711ed0d9b5fe6b1`;
Runtime `c1d0111dd8d2bd4668e0d6d4f93afc20af9bd77b`, source digest
`9d9d99518d3a108ce3e7d58cef1f42c53642d43b6ee919a3298bdd7ac5b6cef7`.
This proves isolated startup/shutdown, not an authenticated provider turn or UAC
completion. A subsequent cosmetic ready-state hint fix passed the same 10-case
Chrome fixture and its ready screenshot was inspected.

### Developer skills and runtime library packaging

```sh
node --test tests/skill-sync-scripts.test.js
npm run build:host
node --test tests/desktop-packaging.test.js
```

Skill-sync fixtures use temporary repositories. Windows exercises PowerShell
5.1, PowerShell 7 when installed, and Git Bash when installed for both POSIX wrappers. POSIX hosts
execute the Bash wrappers natively. Coverage includes nested package discovery,
resource preservation, duplicate-name preflight and product-root exclusion.
Desktop fixtures verify `runtime-skills/` is staged and runtime developer
`skills/` is excluded. These tests do not launch an installed Desktop app.

2026-09-11 directory-alignment validation: host build passed, and the two test
files above passed all 33 cases. After optional-shell detection was added,
the 9 helper cases passed again under Windows PowerShell 5.1, PowerShell 7 and
Git Bash (both Linux/macOS scripts). Independent read-only review findings were
addressed. Native Linux/macOS execution and an installed Desktop launch remain
outside this validation. The real repository sync copied both developer skills
into both local discovery mirrors.

The 2026-09-11 pre-commit `npm test` passed 4,554 tests with five
skips, including server/Desktop/UI/mobile typechecks and builds. A preceding
full run hit an intermittent Telegram file-backed restart fixture timeout;
the unchanged final full rerun passed. Temporary diagnostic instrumentation
was removed, and no Telegram production or test changes are included here.

### All Tests

This is the full suite, used by CI and when local scope warrants it:

```bash
npm test
```

This builds the TypeScript source and then runs the Node built-in test runner
against the compiled output.

### Build Verification

```bash
npm run build
npm run build:host
```

This is the current production-bundle smoke check. It is still run manually;
the CI workflow does not yet build the Vite bundle.

### Windows Installer Smoke Check

After producing and installing the Windows NSIS package, run:

```powershell
.\scripts\windows\Test-WindowsInstallerSmoke.ps1
```

The smoke-check validates:

- `Cats.exe` exists under the installed package root
- bundled `cats` sidecar assets exist under `resources/app-sidecar/*`
- bundled `cats-runtime` assets exist under `resources/cats-runtime/*`
- the packaged `desktop-package-plan.json` still advertises the Windows NSIS
  target
- launching the installed app refreshes the persisted desktop-host state file
  and reaches a stable bootstrap phase

### macOS / Linux Unpacked Smoke Check

After producing the unsigned/test desktop package outputs, run:

```bash
./scripts/macos/test-macos-package-smoke.sh
./scripts/linux/test-linux-package-smoke.sh
```

These smoke-checks validate:

- bundled `cats` sidecar assets under the packaged `Resources/` tree
- bundled `cats-runtime` assets under the packaged `Resources/` tree
- bundled platform-specific packaged setup helpers for macOS or Linux
- bundled platform-local helper libraries used by those packaged setup scripts
- the packaged `desktop-package-plan.json` still advertises the expected
  target platform and helper rollout

## Mocking Guidelines

- Prefer in-process stub objects for runtime clients
- Prefer local temp directories for file-backed chat-store coverage
- Avoid heavy mocking libraries unless the product surface grows enough to need
  them

## CI/CD Integration

- Tests run automatically on:
  - [x] Pull requests
  - [x] Main branch commits
  - [x] Manual npm publishing (test gate before publication)
  - [ ] Production bundle build verification
  - [ ] Scheduled (nightly)

PR CI still requires `validate` and `nodejs (24)`, including the full `npm test`
suite. Scoped local validation does not change those gates. Version bumps and
release candidates retain full test validation and the existing npm/Desktop
release checks; successful candidate CI does not require a second full run on
the developer's machine. The npm publish path builds through `prepack`; the
separate Desktop release workflow builds platform packages and validates their
release assets. Ordinary PR CI does not prove a native installer was exercised.
Automatic selection of CI tests and build deduplication are separate workflow
changes, not implemented by this policy update.

---

*Last updated: 2026-09-16*
