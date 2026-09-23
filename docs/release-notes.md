# Release Notes

> Operator-facing behavior changes and migration notes for Cats Platform.

Newest dates go first. Each dated section should include behavior changes,
migration steps, and any deprecations introduced in that release.

Use this shape for new entries:

```md
## YYYY-MM-DD

### Change title

Behavior change:

Migration steps:

Deprecations:
```

## Unreleased — Linux Desktop update relaunch

Linux update/setup relaunch now preserves the host's existing privilege state.
Electron 41's native relaunch introduced NoNewPrivs and made a later `.deb`
update fail at pkexec with exit 127. The quit watchdog also starts after the
synchronous installer returns, so time spent authenticating does not cause a
successful install to be reported as a timed-out handoff. Existing restricted
hosts still need a normal cold launch; the flag cannot be cleared in place.
No version bump or new Desktop/npm publication accompanies this source fix.
See the [Linux validation record](./research/2026-09-23-linux-self-update-validation.md).

## 2026-09-23 (0.4.0 preview — existing catalog upgrades)

### Upgrade existing model settings before the first model request

Behavior change:

The preview bundles Runtime 0.2.0. On writable startup or explicit catalog reload,
Runtime validates and converts recognized schema-1 model settings to schema 2,
preserves their scopes/models/options, creates a unique raw backup and atomically
replaces the file. Current-format files and absent overrides need no migration.
Unknown mappings or write conflicts preserve the existing file and expose recovery
diagnostics. Compatible accepted settings remain usable when available.

Desktop model selectors stop indefinite loading for rejected catalog settings.
Runtime Setup & Repair shows upgrade details, the backup path and explicit retry
after correction. Successful retry refreshes the configured targets' model data.

Migration steps:

Install this preview over the previous Desktop version with the existing profile.
Recognized schema-1 catalogs upgrade automatically before model reads. Check the
model names, order, efforts and defaults, and restart to confirm no second backup
is created. If the profile was already manually converted, its schema-2 file stays
unchanged; use an isolated copy of the old backup to exercise conversion rather
than resetting the active profile. Setup & Repair reports any blocked conversion.
See the [catalog upgrade guide](https://github.com/cats-inc/cats-runtime/blob/main/docs/provider-catalog-soft-patches.md#existing-schema-1-files-and-rollback).

Deprecations:

The previously shipped schema-2 contract now uses the required 0.x minor release
boundary. Execution remains schema 2; migration is a bounded data conversion.
Runtime/Platform npm versions are prepared, with no npm publication in this task.
Usage 0.3.0 targets Desktop 0.4.x; the old Desktop 0.3.x App
artifact remains unchanged. Native installer upgrade acceptance is the purpose of
this preview and is separate from package and isolated-profile checks.

Release verification:

The [0.4.0 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.0)
is published from Platform `2874dd0eba8625c1a7086f65aea47dd2a63d60ac`, bundling
Runtime `edfec394951200702b9a88b4f9d76d97669b9be8` on every OS. Runtime and Platform
CI passed. The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35862976809)
passed all three package builds, Usage 0.3.0 offline activation, macOS signature /
notarization checks and validation of all ten release assets. Windows x64 is
unsigned; macOS x64 is signed/notarized; Linux is arm64. This GitHub prerelease did
not publish either npm package. Linux ARM64 0.3.8 → 0.4.0 package/profile
acceptance passed on 2026-09-23, while exposing the relaunch/watchdog defects
described above. The repaired published update chain and other native upgrade
acceptance remain open.

## 2026-09-23 (0.3.8 preview — provider catalog data and local patches)

### Update one installation's model catalog without rebuilding

Behavior change:

Runtime 0.1.28 and Desktop now share the same validated catalog data for model
names, ordered controls, explicit defaults and fixed combinations. A local YAML
override replaces only its provider/backend/transport scope; other scopes inherit
factory data. Validation, digest-checked apply with backup, reload and rollback
are available through the Runtime catalog tool. Existing sessions retain their
recorded execution bindings. Desktop retains coherent observed menus during
temporary disconnections and never uses local informational labels to authorize
execution on a remote Runtime.

Migration steps:

An existing schema-1 `curated-model-catalogs.yaml` requires explicit conversion
to schema 2. The update does not rewrite personal files automatically. Before
using its model menus, use the new bundled Runtime's catalog tool to produce a
separate converted candidate, review it, then preview/apply and reload (or restart)
the same Runtime. Without valid schema-2 data or a compatible accepted snapshot,
the catalog reports unavailable. Clean profiles use factory data directly.
See the [catalog patch and conversion guide](https://github.com/cats-inc/cats-runtime/blob/main/docs/provider-catalog-soft-patches.md).

Deprecations:

Handwritten model/default/effort tables and schema-1 runtime loading are replaced
by the schema-2 data contract. The explicit converter retains evidenced legacy
mappings. Runtime and Platform npm versions are prepared only; this release
publishes Desktop preview assets and does not publish either npm package.

## 2026-09-23 (0.3.7 preview — macOS admitted to the release-ready gate)

### Recover from a rejected update download

Behavior change:

An update that downloaded but could not be installed no longer traps the
updater. Before this, a downloaded artifact could not be re-checked, a failed
install handoff returned to the same "ready to install" state, and the tray
flow showed nothing when the handoff failed -- so a rejected download was
offered on every click until Cats was restarted. Now a failed handoff is shown
once with its reason (a Squirrel.Mac signature rejection reads as "failed its
signature check" rather than "could not open the installer"), and the next
**Check for Update** re-checks first: a newer release supersedes the stale
download, and an unchanged one is offered again without re-downloading.

macOS passed the signed old-to-new self-update test (0.3.2 to 0.3.6) and is
admitted to `DESKTOP_RELEASE_READY_PLATFORMS`. This affects only official
builds, of which none exist yet; previews never went through that gate.

Migration steps:

From 0.3.6 on macOS, **Check for Update** downloads 0.3.7 and relaunches into
it; on Windows and Linux use **Check for Update** as usual. Anyone still on
the unsigned 0.3.3 DMG on macOS must install 0.3.7 manually once.

Deprecations: none.

## 2026-09-23 (0.3.6 preview — first signed macOS self-update candidate)

### Bring the update dialog to the foreground on macOS

Behavior change:

The tray-originated update dialog now activates the app before it opens. The
tray closes on click and the main window is usually hidden, so that message
box has no parent window, and macOS does not bring an app forward for a
parentless dialog: the "ready to install" prompt that follows a download opened
behind whatever was frontmost and went unseen until the next tray click.
Windows raises such a dialog on its own, which is why the two platforms looked
inconsistent.

Migration steps:

This is the first preview that can validate macOS self-update end to end.
0.3.3 was dispatched with `unsigned=true`, so Squirrel.Mac refused to apply it
over the signed 0.3.2 -- by design, as that release's notes stated; Windows and
Linux applied it because NSIS and dpkg do not verify signatures. From a signed
0.3.2 install, **Check for Update** should find 0.3.6, download it, and relaunch
into it. Anyone who installed the unsigned 0.3.3 DMG manually must install
0.3.6 manually once; self-update resumes from there.

0.3.4 and 0.3.5 were published to npm only; no desktop artifacts carry those
versions.

Deprecations: none.

## 2026-09-23 (0.3.4 npm alignment)

### Make the current Platform available to npm launchers

Behavior change:

Prepare the current Platform implementation for publication as
`@cats-inc/cats-platform@0.3.4` on npm's `latest` tag. cats-one 0.1.22 will require
Platform `^0.3.4` and Runtime `^0.1.25`, replacing its outdated dependency floor.
The existing setup and configuration ownership remains unchanged: preferences
are persisted when saved, the auth session secret is generated when needed,
and provider capability bootstrap rules remain opt-in.

Migration steps:

Publish Runtime and Platform first, then resolve cats-one's lockfile from npm
and publish the launcher. A fresh `npx @cats-inc/cats-one@latest` can then use
the aligned packages. Desktop installer publication is a separate workflow.

Deprecations: none.

## 2026-09-18 (0.3.3 unsigned preview)

### Let Cline accept short chat messages

Behavior change:

The bundled Runtime fixes Cline rejecting messages such as `晚安` or `hello`
as an unknown command before model execution. It also protects messages that
look like CLI subcommands or flags while retaining the selected provider,
model, effort and permission settings.

This preview is explicitly unsigned on all platforms at the operator's request.
The workflow now exposes an opt-in `unsigned` input for manual previews; the
default signing behavior from ADR-117 is unchanged for other runs.

Migration steps:

On Windows, use Cats Desktop **Check for Update**. Install the macOS DMG manually
for this unsigned preview; its update cannot be applied by Squirrel.Mac, including
from the signed 0.3.2 build. Linux users can install the published arm64 DEB.

The release uses Runtime commit `bf0c24880fb5045b4c2b0daaf27ce905f9b60b53`
(`0.1.24`, Runtime PR #69) and retains the locked Usage app `0.2.1`.
Dispatch `desktop-release.yml` with `tag=v0.3.3`, that exact `runtime_ref`, and
`unsigned=true`. Windows x64 NSIS, macOS x64 DMG/updater ZIP and Linux arm64
DEB remain the release artifact set.

Deprecations: none.

## 2026-09-18 (0.3.2 preview — first signed macOS preview)

### Sign and notarize macOS preview artifacts

Behavior change:

macOS preview artifacts are now signed with a Developer ID Application
certificate and notarized by Apple. A downloaded DMG installs without a
Gatekeeper bypass, and **Check for Update** works on macOS for the first time.
That was previously impossible rather than merely inconvenient: Squirrel.Mac
refuses to apply an update to an unsigned application, and macOS 15 removed the
right-click-to-open Gatekeeper bypass.

Per ADR-117 this changes artifact trust only. The build keeps its preview
release identity: it publishes as a GitHub prerelease, never becomes `latest`,
resolves to `preview_packaged`, and stays outside the release-ready platform
gate. Signing credentials are scoped per platform, so each platform starts
signing when its own certificate exists rather than waiting for the others.
Windows and Linux preview artifacts remain unsigned.

Migration steps:

**Existing macOS preview installs cannot update themselves into this release.**
Squirrel.Mac validates the signature of the *running* application before
applying an update, so the unsigned-to-signed transition is a discontinuity.
Download and install the 0.3.2 DMG manually, once; updates from 0.3.2 onward
work normally. This affects only that one transition.

On Windows, use Cats Desktop **Check for Update** as usual. Linux users can
install the published DEB.

Deprecations:

The `unsigned-preview-*` Actions artifact names are retired in favour of
`preview-*`, because a preview is no longer necessarily unsigned.

## 2026-09-18 (0.3.1 unsigned preview)

### Let first setup finish loading Catlas providers

Behavior change:

First setup can populate the Catlas provider/model picker when Runtime's initial
configuration response takes longer than 500 ms. Platform now waits within the
existing 5-second Runtime request deadline, retains the successful result and
reuses it on subsequent reads. Automatic retry and the spinner remain; no manual
recovery buttons or raw transport errors are added. Provider selection and
authentication checks retain their existing scope.

This preview also includes the separately merged ClinePass six-model shortlist
and its matching Runtime execution support. The merged macOS release target is
x64 again under ADR-117; preview artifacts remain unsigned.

Migration steps:

On Windows, use Cats Desktop **Check for Update** to install 0.3.1. Unsigned
macOS previews require downloading and installing the DMG manually; Squirrel.Mac
does not apply updates to an unsigned app. Linux users can install the published
DEB. A setup that could not finish can continue after the update; deleting local
Cats data is unnecessary.
Runtime remains 0.1.24, pinned to
`a44eb734279d5211f687d7dc3047d8207347c87c`. Usage remains 0.2.1 with the existing
immutable artifact and SHA-256 lock. Dispatch the manual Desktop workflow with
`tag=v0.3.1` and that exact `runtime_ref`. Windows x64 NSIS, macOS x64 DMG/updater
ZIP and Linux arm64 DEB publish after packaging and update-asset gates succeed.

Validation: the merged setup fix passed full CI (4,596 passed, 56 skipped,
0 failed). Read-only verification against the affected Runtime returned ten
providers in 1,497 ms cold and 23 ms warm. The paired ClinePass Platform and
Runtime commits passed their full CI. Version consistency and 47 focused release
version/asset checks passed. The version candidate requires its own
full CI plus the three-platform release workflow; verify the public update feed
after publication. Installed update/restart and setup acceptance remain with
the user.

Deprecations: none. This is an explicitly requested unsigned GitHub prerelease;
future version bumps still require a new request. The reported Devin model
execution issue is deferred and is not claimed as fixed by this release.

## 2026-09-18 (0.3.0 unsigned preview)

### Faster conversation switching and independent execution selections

Behavior change:

Previously opened conversations appear immediately from a bounded in-memory
cache while their subscriptions refresh in the background. Each conversation
retains its own provider/model/effort selection, draft, attachments and scroll
position. Delayed responses cannot switch the active conversation or overwrite
another conversation's draft. Interrupted subscriptions reconnect automatically.

This preview also includes the aligned Desktop Devin model presets, preservation
of custom model selections, and Runtime's Devin setup/model/Playground fixes.
The macOS installer and updater ZIP now use the merged universal build path.
The preview remains unsigned and does not use signing or notarization secrets.

Migration steps:

Use Cats Desktop **Check for Update** in an existing unsigned preview to install
0.3.0. Existing conversations, provider selections and user data do not require
a reset. Runtime remains 0.1.24, pinned to
`29ef46443c81d8d0e50944a052db882a18668376`. The bundled Usage App is 0.2.1,
which declares Platform 0.3.x compatibility with the same SDK 1.2 contract.
Its [immutable release](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.2.1)
comes from source `df1c57168c98a6a83fffb54f58ad298a1b769511`; the Desktop lock
pins its published SHA-256
`6b8160e548488f30c741cadd4726b55fa18f8c0a324d48ac0cbc6ea143788f24`.
Dispatch the manual Desktop workflow with `tag=v0.3.0` and that exact
`runtime_ref`. Windows x64 NSIS, macOS universal DMG/updater ZIP and Linux arm64
DEB publish only after all packaging and update-asset gates succeed.

Validation: the merged conversation-cache change passed full CI (4,588 tests,
56 skipped) and isolated renderer navigation checks. The pinned Runtime release
preflight passed. The version candidate requires full PR CI and the
three-platform unsigned release workflow. Verify public update discovery after
publication; the installed upgrade/restart remains user acceptance.

Release preparation passed 118 focused package/compatibility/release tests,
Desktop host and UI-test builds, plus independent compatibility review. Usage's
docs/tests/build release workflow passed; its downloaded digest, lock and
provenance agree. Platform fixtures use the current host version while explicit
incompatibility and caret-boundary tests retain their fixed assertions.

Deprecations: none. This remains an unsigned GitHub prerelease. This release
was explicitly requested; future version bumps still need a new request.

## 2026-09-18 (0.2.12 unsigned preview)

### Keep provider/model pickers available and recover automatically

Behavior change:

Chat, Settings and first setup's Catlas picker retain successful provider/model
data across tray idle and refresh failures. Initial loading and recovery use an
animated indicator with automatic retry. Raw timeout/auth messages, Retry and
Open Runtime Setup actions are removed from these pickers. Base and advanced
catalogs recover independently; confirmed selection/auth changes still clear
retained data. First setup also contains optional prefetch failures so recovery
does not leave an unhandled exception.

This preview includes the merged Copilot and Cursor fixed presets, OpenCode and
Kilo curated shortlists, and Runtime's corrected Muse effort menus. Existing
user-curated catalog overrides retain their normal precedence.

Migration steps:

Use Cats Desktop **Check for Update** in an existing unsigned preview to install
0.2.12. Provider selections and user data do not require a reset. Runtime remains
0.1.24, pinned to `03d3e1786b49de66b74b55a8c478db96f9721d6b`; the bundled Usage
App remains 0.2.0. Dispatch the manual Desktop workflow with `tag=v0.2.12` and
that exact `runtime_ref`. Windows x64 NSIS, macOS x64 DMG/updater ZIP and Linux
arm64 DEB publish only after all packaging and update-asset gates succeed.

Validation: provider recovery and first-setup regressions, isolated picker
visual checks, merged Platform CI and the pinned Runtime release preflight
passed. The version candidate requires full PR CI plus the three-platform
unsigned release workflow. Check public update discovery after publication;
the installed upgrade/restart remains user acceptance.

Deprecations: manual recovery actions inside provider/model pickers are removed.
This remains an unsigned GitHub prerelease. This release was explicitly
requested; future version bumps still need a new request.

## 2026-09-17 (0.2.11 unsigned preview)

### Restore Desktop onboarding cards and clean-machine preparation

Behavior change:

Desktop onboarding again uses its original classified cards and Show more,
with visible Node.js/npm preparation before any provider is selected. Node/npm,
npm prefix/PATH and GitHub CLI background checks run independently of provider
selection and retain their individual results. Installation remains explicit;
provider scans remain limited to the saved selection. Fresh helper checks find
newly installed commands and verify both Node and npm after installation.

Onboarding and Settings show short statuses and useful next actions, with
technical diagnostics and maintenance inside collapsed details. Checking one
tool no longer erases another tool's prerequisite status, including recovery.
This preview also includes the merged Grok 4.6/4.5 catalog and picker correction,
without inventing an upstream default marker.

Migration steps:

Use Cats Desktop **Check for Update** to install the 0.2.11 unsigned preview.
Existing provider selections and user data do not require a reset. Runtime
remains 0.1.24, pinned to `580f1c9be3a5158fb8967157900629062c9ea020`, with the
existing Usage 0.2.0 lock. The manual Desktop workflow uses `tag=v0.2.11` and
that exact `runtime_ref`; it publishes Windows x64, macOS x64 and Linux arm64
only after all release checks pass.

Validation: 98 focused cases, affected host/renderer builds and typechecks,
isolated onboarding/Settings browser checks, and independent review passed.
Required full PR CI and three-platform packaging/asset validation gate this
publication. Physical provider installation and sign-in remain user acceptance.

Deprecations: none. This remains an unsigned preview. The user explicitly
authorized this release; future version bumps still need a new request.

## 2026-09-17 (0.2.10 unsigned preview)

### Let first-run Catlas setup read provider catalogs before login

Behavior change:

The second setup step could show `Authentication is required.` and disable the
provider/model selectors even after Runtime setup was ready. The first Admin
session is created only at final submission, but the picker had called catalog
routes that required that session. The three catalog GET routes are now allowed
only during first setup; post-setup/repair requests and mutations retain their
authentication requirements. Runtime-selected scope still limits the results.

Migration steps:

Use **Check for Update** to install the 0.2.10 unsigned preview and reopen setup.
The fix requires no reset of provider selection or user data. Runtime remains
0.1.24 at `c1a5c0ae108a155b14867f85c344a23c9a95bdbf`, with the existing Usage
0.2.0 lock. The manual Desktop workflow uses `tag=v0.2.10` and that exact
`runtime_ref`; it publishes Windows x64, macOS x64 and Linux arm64 after all
release checks pass.

Validation: the original 401 was reproduced in an isolated HTTP test. The fix
passed 49 focused auth/setup cases and an actual browser flow through both
setup steps, provider/model selection, first-Admin creation and authenticated
catalog access. Anonymous access is denied again immediately after setup.

Deprecations: none. This remains an unsigned preview.

## 2026-09-16 (0.2.9 unsigned preview)

### Shared provider onboarding and Settings

Behavior change:

Desktop onboarding and Settings > Runtime now share the provider manager.
Checkboxes express the user's chosen scope and load the saved Runtime selection;
new installations start unchecked. Apply saves the selection and optionally
runs detection. Each selected provider supports its own Detect/Install actions,
with Upgrade/Repair/previewed Uninstall where supported. Prior detection results
remain visible after save-only changes. Ollama/OpenClaw expose endpoint editing
and explicit connection checks; command presence, sign-in and connection are
separate observations.

Saving an empty or partially ready scope completes Runtime bootstrap, so Desktop
can continue to product setup without opening another setup page. Progress stays
visible until the requested operation finishes. Installing a provider verifies
that target once, rather than scanning every selected provider.

Native Windows/macOS/Linux packaged scripts incorporate the reviewed
`environment-bootstrap` changes through `752dc13`: current-version gates,
Cursor/Kiro Windows paths, isolated vendor PowerShell, Devin sharing-lock retry,
bounded old-build cleanup, truthful observed changes, and verified npm updates.
An explicit npm-provider Upgrade also updates npm in its existing prefix; Apply
and Detect do not. Explicit custom prefixes are preserved.

Migration steps:

Use Cats Desktop **Check for Update** from an unsigned preview build. Existing
provider selections and detection history are retained; review them in Settings
> Runtime. This preview packages Runtime 0.1.24 at
`c1a5c0ae108a155b14867f85c344a23c9a95bdbf` (Runtime PR #54), with the existing
Usage 0.2.0 App lock. The
[unsigned preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.2.9)
was published by [run 35098915681](https://github.com/cats-inc/cats-platform/actions/runs/35098915681)
after Windows x64 NSIS, macOS x64 DMG/updater ZIP, Linux arm64 DEB, bundled-App
checks and update metadata validation passed. The public updater feed was
verified with the actual Desktop parser and resolves 0.2.9 on all three targets.

Deprecations: the separate Desktop provider editors and save-triggered global
scan path are replaced by the shared manager. WSL/Docker variants are outside
this native onboarding rollout. Physical native installation/login remains
user acceptance; automated validation uses isolated fixtures. This remains an
unsigned GitHub prerelease.

## 2026-09-16 (0.2.8 unsigned preview)

### Updated Claude/Codex catalogs and consistent defaults

Behavior change:

Claude Code 2.1.273 appears as four version-bearing choices: Opus 5 with 1M
context (default), Fable 5.1, Sonnet 5, and Haiku 4.5. The duplicate upstream
Default/Opus row is represented once. Opus, Fable, and Sonnet offer all six
observed effort levels with High as default; Haiku has no effort selector.
Desktop and Playground fallback lists now include Fable. Model/effort menus
standardize only the status marker to lowercase `(default)`, preserving the
model name's spelling and case.

The preview also includes the merged Codex 0.154.0 five-model catalog and
per-model effort defaults, Runtime's initial session discovery fixes, and the
new provider-selection bootstrap flow. Provider inventory and ordinary selectors
follow the provider targets selected in Runtime setup.

Migration steps:

Fully quit Cats and install the 0.2.8 preview normally. Desktop packages Runtime
0.1.23 at `46982a34d6964d2eee804fb60a4274ab382ea8ff` (Runtime PR #49); the existing
Usage 0.2.0 App lock remains unchanged. User-curated catalog overrides still take
precedence over the bundled example; this operator's Claude override was explicitly
approved and synchronized separately.

After both preparation PRs merge, dispatch the unsigned preview with `tag=v0.2.8`
and `runtime_ref=46982a34d6964d2eee804fb60a4274ab382ea8ff`. The workflow creates
the tag and publishes Windows
x64 NSIS, macOS x64 DMG/updater ZIP, and Linux arm64 DEB after all packaging and
asset-validation gates pass. npm packages use the existing `next` channel.

Deprecations: none. This remains an unsigned GitHub prerelease.

## 2026-09-16 (0.2.7 unsigned preview)

### Complete setup again after resetting all data

Behavior change:

Resetting all data now clears the previous local Admin, linked identities,
memberships, browser/mobile sessions, and login throttles alongside chat/core
setup state. Previously the remaining Admin made the second setup step fail
with `already_complete` when opening Cats, whether Catlas was enabled or skipped.
The reset confirmation now describes account and session removal.

Reset and setup completion share one serialized operation. Reset still requires
an authenticated Admin and CSRF token when an account remains but the setup
timestamp is missing. An auth-reset write rejection restores the previous
chat/core snapshot, and unexpected reset failures return a safe error message.

Migration steps:

Fully quit Cats and install the 0.2.7 preview normally. Upgrading does not itself
clear accounts: an installation already stuck after a reset on an older preview
needs another authenticated reset to remove its leftover Admin.

Desktop packages Runtime 0.1.22 at
`af2793ff6d50163efac65418d0deda7ff7f7eb9f`, with the existing locked Usage 0.2.0
archive. After merge, manually dispatch the Desktop release workflow with
`tag=v0.2.7` and that exact Runtime commit. The workflow creates the preview tag
and publishes Windows x64 NSIS, macOS x64 DMG/updater ZIP, and Linux arm64 DEB
only after all packaging and asset-validation gates pass.

Deprecations: none. This remains an unsigned GitHub prerelease.

## 2026-09-15 (0.2.6 unsigned preview)

### Passive provider detection at login

Desktop accepts installed, unverified provider targets as usable and preserves
their diagnostic warnings, matching the Runtime's shared passive detection policy.
The first-run Windows Ollama audit reads file version metadata without starting
the provider. Runtime background CLI/ACP checks and discovery no longer execute
providers to inspect versions, help, or session lists.

Desktop 0.2.6 packages Runtime 0.1.22 with the corresponding fix. The preview
workflow selects its exact merged Runtime commit. No migration or global
provider settings change is required. See the
[incident and validation record](../../cats-runtime/docs/research/2026-08-27-cline-self-update-and-probe-concurrency.md).

Deprecations: none.

## 2026-09-11 (0.2.5 unsigned preview)

### Multi-CLI quota queries and the separated runtime skill library

Behavior change:

Desktop selects the published Usage 0.2.0 archive with App SDK 1.2.0 and Runtime
commit `91bba98e2e621ec3124130b7c79fdc6c3ab7ca19`. The App lock pins SHA-256
`7d5455bb6b484b731becbc69b469e649fbfc433cf015586e0022c3045974c04e`
from Apps source commit `1affcf38e427f636e1eedb45bf3d1ac4e78eeb4f`.
Alongside Codex, Usage offers explicit Copilot, Claude Code and Antigravity
(`agy`) quota queries when Runtime advertises support. It preserves native
request quantities, unlimited entitlements, unknown values, stale observations
and independent provider/instance cooldowns. Opening or polling the dashboard
does not query accounts. Runtime invokes the configured native CLI only: no
credential extraction, Cats-originated provider API requests or model turns.

Kiro remains unenabled pending authenticated success evidence. Native Windows
CLI queries were live-verified; native macOS/Linux live queries and WSL/Docker
query transports remain unverified/unsupported respectively.

This preview includes the merged skill-root alignment: Desktop stages the
Runtime product library from `runtime-skills/`, not developer `skills/`.
cats-one's developer-workspace changes are merged but are not a Desktop sidecar.

Migration steps:

Fully quit Cats and install the 0.2.5 preview normally. The host activates the
bundled Usage update offline with no separate download, extraction or file move.
Settings, conversations and App data are retained, along with explicit disabled
or uninstalled App choices. This release task does not update the operator's
installed Desktop or modify its profile.

Deprecations:

None. This is an unsigned GitHub prerelease, not a signed stable distribution.
After this preparation merges, dispatch the Desktop release workflow with
`tag=v0.2.5` and the exact Runtime commit above. Let the workflow create its tag;
do not push a Desktop tag into the signed release path. The matrix is Windows
x64 (NSIS), macOS x64 (DMG/updater ZIP) and Linux arm64 (DEB). Each build must
verify actual bundled App bytes and temporary-profile offline activation before
publication. Those gates do not claim interactive native-installer acceptance.

## 2026-09-11 (0.2.4 unsigned preview)

### Explicit Codex quota refresh in bundled Usage

Behavior change:

Desktop bundles Usage 0.1.1 with App SDK 1.1 and Runtime commit
`603afdc2f9e46b31b56b0223f6a3f0690b5af76f`. The source-controlled App lock
pins the published archive's exact version, download URL and SHA-256.
Usage adds a Codex-only **Query latest quota / 查詢最新額度** button, showing
the provider's actual window duration, remaining percentage and reset time.
Opening the dashboard and its periodic snapshot refresh remain passive.

An explicit click uses the configured native Codex CLI's App Server stdio
`account/rateLimits/read` operation. Cats does not extract local CLI credentials
or issue its own provider HTTP request, and the query does not start a model
turn. Failed queries retain the last observation, and a 60-second cooldown
prevents repeated requests. WSL/Docker transports return unsupported; native
Windows was live-verified, while native macOS/Linux live validation remains open.

Migration steps:

Fully quit Cats and install the 0.2.4 preview normally. Desktop activates its
bundled Usage package offline; no separate App download, extraction or file move
is needed. Existing settings, conversations and App data are retained, as are
explicit disabled/uninstalled App choices. This release task does not update
the operator's installed Desktop automatically.

Deprecations:

None. This is an unsigned GitHub prerelease, not a signed stable distribution.
After this preparation is merged, manually dispatch the Desktop release workflow
with `tag=v0.2.4` and the exact Runtime commit above. Let that workflow create the
preview tag; do not push a Desktop version tag into the signed release path.
The release matrix remains Windows x64 (NSIS), macOS x64 (DMG/updater ZIP), and
Linux arm64 (DEB). Each build must pass the actual-resource/offline-App verifier
before publication; these checks are not interactive native-installer acceptance.

## 2026-09-10 (0.2.3 unsigned preview)

### App renderer loading recovery

Behavior change:

Fix the Windows single-file sidecar's SDK resource lookup by preserving its
package import during bundling. Version 0.2.2 inlined that module, making a valid
installed Usage archive fail to render with HTTP 503 because the SDK was read
from the wrong directory. Add a production-bundler regression test and an
installer-resource gate for this exact failure.

App startup now has a 15-second renderer/SDK deadline and a localized retry button.
Failed initialization and late responses from disposed attempts cannot leave a
permanent loading placeholder or replace a newer attempt. This is a host change;
no Usage package reinstall is required. Desktop still pins Usage 0.1.0 and the
same Runtime commit as 0.2.2.

Migration steps:

Fully quit Cats, then install the 0.2.3 preview over the existing installation.
Settings, conversations and App data remain in the existing user profile; do not
uninstall or delete that profile. No manual App extraction or file move is needed.
The published 0.2.2 installer is unchanged. Direct installed-window acceptance is
separate from the automated package and isolated browser/Electron checks.

Deprecations:

None. Merge this version bump before manually dispatching the Desktop release
workflow with tag `v0.2.3` and Runtime commit
`0345d319cf2f97ea51a482dd6932b34576a491b3`. Let the workflow create the preview
tag; do not push it directly into the signed stable release path.

## 2026-09-10 (0.2.2 unsigned preview)

### Usage is included as a version-pinned utility

Behavior change:

Desktop includes the independently released Usage 0.1.0 package selected by an
exact version, release asset URL and SHA-256. On first launch, Platform validates
and installs the bundled package offline, enables it and shows Usage in Lobby's
Apps section. Users do not separately download, move or extract the utility.
The packaged App/config/SDK roots now agree with Electron's resource layout.
Release jobs verify the actual unpacked resources and temporary-profile offline
activation on Windows, macOS and Linux before publishing the preview.

Usage reads the bundled Runtime's cached usage snapshot. Token/currency totals,
passive Claude/Codex quota reports, freshness and offline state are available;
active account polling and persistent usage history are not. Missing reports do
not mean zero usage or a full allowance.

Migration steps:

Install Desktop normally. Existing disabled/uninstalled App choices remain in
effect. No manual App migration is required. The release matrix is Windows x64
(NSIS), macOS x64 (DMG/updater ZIP), and Linux arm64 (DEB). Automated resource and
activation checks are not full interactive native-installer acceptance tests.

Deprecations:

None. This remains an unsigned prerelease, not a signed stable distribution.
Merge the version bump before manually dispatching the Desktop release workflow
with tag `v0.2.2` and the exact merged Runtime commit. Let the workflow create the
tag; pushing that tag directly selects the signed stable workflow instead.

## 2026-09-05 (0.2.1)

### Muse appears in the provider list without a relaunch

Behavior change:

The 0.2.0 preview left Meta Muse out of the desktop provider list on hosts that
had it installed. The bundled runtime inherited a PATH captured before the muse
installer ran — the installer writes its directory into the User PATH in the
registry, which no already-running process picks up — so it could not resolve
`muse`, reported it as degraded, and the desktop filtered it out.

The runtime bundled with 0.2.1 resolves a provider from the directory its own
installer uses when PATH cannot see it, so Muse shows up as ready immediately
after install. On Windows it also runs the recorded `muse-bin-<version>.exe`
directly instead of going through the `muse.cmd` launcher, which removes a
console flash on every launch from the desktop and roughly four seconds of
launcher startup from every probe and turn.

Migration steps:

None. If you installed Muse and did not see it, this build is the fix; no
relaunch or PATH change is needed.

Deprecations:

None.

## 2026-09-05

### Meta Muse joins the provider set and Aider is removed

Behavior change:

Meta's Muse CLI (`muse`) is now a fully supported provider. Packaged setup can
install, detect, upgrade, and uninstall it on Windows, macOS, and Linux, it
appears in the onboarding CLI grid, and it is selectable as an execution target
with model and reasoning-effort controls. Sessions run headless through
`muse exec --json` and resume with their history intact.

Aider is removed. It could be installed and detected but never executed, so it
was hidden from the onboarding grid and absent from the execution catalog. Its
installers, setup assets, and packaging entry are gone.

Two limits are worth knowing before selecting Muse:

- Muse reports no token usage at all, so metering and cost surfaces stay empty
  for this provider. This is a limit of the CLI, not of the integration.
- Muse exposes no per-tool allowlist, only three capability switches (writes,
  shell, web tools). A tool allowlist that names part of one of those groups is
  refused rather than silently widened to the whole group.

Migration steps:

If you use Aider through Cats, install it yourself from
https://aider.chat/install.sh; Cats no longer manages it. Nothing else changes
for existing providers.

To use Muse, install it from packaged setup and run `muse login` once. The
credential is stored in `~/.config/muse/auth.json`; there is no API-key
environment variable that substitutes for that account sign-in.

Deprecations:

Aider is removed rather than deprecated. The `aider` provider id no longer
resolves anywhere in setup, packaging, or the execution catalog.

## 2026-09-02

### Tray update checks refresh stale results

Behavior change:

Choosing **Check for Updates** from the system tray now performs a fresh
provider query after a prior `up_to_date` or `failed` result. Previously, a
long-running Desktop process replayed the earlier informational dialog, so a
release published after that check remained invisible from the tray even
though `Settings > Desktop > App updates` found it correctly.

Migration steps:

None.

Deprecations:

None.

### The legacy `/api/setup/complete` bootstrap route is removed

Behavior change:

`POST /api/setup/complete` — the original Chat-owned onboarding route that
created a Boss Cat and set `setupCompleteAt` — is removed. It could complete
setup without creating an Admin, which was a second bootstrap path around the
first-admin invariant added earlier the same day. `POST /api/platform/setup/complete`
is now the only setup-completion route, and it always creates the first local
Admin.

`POST /api/setup/reset` is unchanged and still used by Settings.

Deprecations:

The route, its renderer client (`completeSetup` in the shared and Chat renderer
setup APIs), and its pre-auth public-route exception are gone. `completeSetup`
had no caller left in the renderer.

Migration steps:

Anything still calling `POST /api/setup/complete` must move to
`POST /api/platform/setup/complete` and send `adminIdentifier` and
`adminPassword`. Two behavior differences matter: the platform route rejects a
`bossCatName` field because the Guide Cat name is system-managed, and it does
not create a Boss Cat. Assign one afterwards through `POST /api/cats` with
`makeBoss: true`, or `PATCH /api/cats/:id` with `makeBoss: true`.

### First Admin is always local, and Google is linked from Settings

Behavior change:

Setup now requires an Admin identifier and password. `/api/platform/setup/complete`
rejects a missing or partial pair with `400 invalid_admin_credentials` before it
writes any owner, Guide Cat, setup, or auth state, so a workspace can no longer
reach `setupCompleteAt` without a local Admin. During the promotion period an
Admin password must contain 8 to 256 Unicode code points; Cats applies no
uppercase/lowercase/digit/symbol rule and accepts spaces and password-manager
output. Length is counted in code points, so an emoji counts once.

First-admin creation is serialized and rechecks "no Admin exists" inside the
same auth-state write. Two concurrent submissions now produce exactly one
Admin; the loser receives `409 already_complete` and creates nothing. Auth
state is written before the chat/core snapshot and rolled back if that snapshot
fails.

`Settings > General > Account` now reports real login-method state and owns the
Google lifecycle. Linking or unlinking Google requires re-entering the local
password: the server issues a single-use action grant, valid for five minutes
and bound to the account, browser session, and purpose, which the browser sends
in `X-Cats-Auth-Action`. A stolen session and CSRF token are no longer enough
to attach a Google identity. A verified Google email must match the account
email; an account created with a non-email handle adopts the verified address
on its first successful link. Unlinking refuses to leave the account without a
local password, and on success revokes every other browser and mobile session
for that account while keeping the device that performed it signed in.

Ordinary Google login is unchanged in intent and stricter in practice: it
resolves only an already-linked Google `sub` and no longer rewrites the Cats
account email from the provider.

Deprecations:

`POST /api/auth/google/setup` — the standalone Google-only first-admin route —
is removed along with its renderer wrapper, domain helper, and public-route
exception. It had no supported setup UX. `/api/auth/google/link` and the new
`/api/auth/google/unlink` are protected routes now, not pre-auth ones.

Migration steps:

None for existing workspaces: an already-created Admin keeps working, and a
linked Google identity is unaffected. Operators automating first-run setup must
add `adminIdentifier` and `adminPassword` to their
`/api/platform/setup/complete` request body.

## 2026-08-05

### Desktop runtime setup opens in an authenticated system browser

Behavior change:

Desktop links to Cats Runtime setup, dashboard, and playground surfaces once
again open in the user's system browser instead of replacing the current
Electron page. Before opening the browser, the authenticated Desktop renderer
requests a 30-second, single-use handoff. The platform stores only its hash,
consumes it before issuing a separate HttpOnly browser session cookie, and
redirects to the allow-listed Runtime surface. Replays, expired handoffs,
non-Runtime return paths, and open redirects are rejected. The final Runtime
URL contains no handoff credential.

Migration steps:

None. The system browser receives its own Cats session the first time a
Desktop Runtime link is opened.

Deprecations:

None.

## 2026-08-04

### Every platform entrypoint provisions its first-run auth secret

Behavior change:

Clean `cats-platform`, `cats-one`, local dev, and packaged Desktop starts no
longer require an operator-created `.env` before the first-admin setup form can
complete. When no explicit `CATS_AUTH_SESSION_SECRET` is configured, the
platform server generates a 256-bit secret, persists it in the user-local
platform config directory, and reuses it across launches. Persistence uses an
atomic no-clobber publish so concurrent hosts converge on one value;
filesystems without hard-link support use an exclusive-copy fallback, while
permission errors remain fail-closed. Invalid files are quarantined and
regenerated, and stale temporary/invalid artifacts are cleaned during
provisioning. Direct CLI users receive an actionable path on stderr; Desktop
captures the same sidecar diagnostics and keeps real I/O failures on the
retryable bootstrap page. First-admin configuration failures use a safe
`503 configuration_error`, and unexpected pre-auth setup failures no longer
return raw exception messages, including failures caught by the server-level
request handler. Platform-launched project processes and shell helpers strip the
auth secret, runtime API key, Telegram credentials, and ngrok auth tokens from
their environments. The Windows installer smoke check honors custom
Desktop/platform data roots.

Migration steps:

None. Existing explicit secrets remain authoritative and are not overwritten.
Clustered or ephemeral deployments should configure their own shared
`CATS_AUTH_SESSION_SECRET`; single-host installs can keep the generated value.

Deprecations:

None.

### Desktop runtime setup links retain the authenticated app session

Behavior change:

Desktop links that open same-origin Cats surfaces in a new window, including
`/runtime/setup`, now navigate inside the authenticated Electron window. They
no longer open the system browser without the Desktop session cookie and fail
with `E_UNAUTHENTICATED`. Different-origin HTTP(S) links continue to use the
system browser, and unsupported URL schemes remain blocked.

Migration steps:

None.

Deprecations:

None.

## 2026-05-10

### Platform auth rollout in progress

Behavior change:

PLAN-089 server-side auth foundations now include the global route gate.
Browser local login/logout/status and Cats Mobile bearer login/logout/status
routes exist, setup-complete missing/corrupt auth state enters a constrained
repair path through `POST /api/auth/repair/first-admin`, and protected
Chat/Work/Code/Core/runtime/shell/transport APIs reject unauthenticated
requests before product dispatch. Setup-complete unauthenticated app-shell
reads return only the minimal setup/auth bootstrap envelope.

Migration steps:

Set `CATS_AUTH_SESSION_SECRET` before testing first-admin local login or mobile
bearer sessions. Keep `CATS_AUTH_ALLOWED_BROWSER_ORIGINS` explicit for every
trusted browser origin that may submit setup/login/repair/Google credential
POST requests.

Do not rely on `CATS_AUTH_ENABLED=false`; it is an unsafe dev/test escape hatch
and is rejected after `setupCompleteAt` exists. When an operator forgets the
only admin credential, delete only
`<platform-state-dir>/auth-state.local.json`, restart, and complete repair from
the one-time token written to
`<platform-state-dir>/auth-recovery-token.local.txt`. Deleting the auth state
file removes accounts, identities, memberships, and sessions, but leaves
product data intact.

Bounded aggregate login cooldowns no longer require auth-state deletion for
recovery. Operators can clear throttle state through the authenticated
admin+CSRF route or the one-time recovery token.

Cats Mobile now keeps Google login separate from browser GIS. The mobile
client discovers public mobile Google client ids from `/api/mobile/auth/status`,
starts a mobile OIDC flow, posts the resulting ID token to
`/api/mobile/auth/google/login`, and receives a mobile bearer token only after
the server verifies the token against `CATS_AUTH_GOOGLE_MOBILE_AUDIENCES` and
the per-attempt nonce.

Downstream tooling may key on these pinned error codes: `E_UNAUTHENTICATED`
for `401`, `E_FORBIDDEN` for plain authorization failures, and
`E_CSRF_MISMATCH` for Cats synchronizer CSRF failures.

Deprecations:

None in this slice.

## 2026-04-30

### Chat routing after ADR-091

Behavior change:

Existing non-direct participant chats changed routing behavior: a no-mention
user turn now enters the orchestrator first instead of auto-dispatching to
`defaultRecipientId`. Direct/private lanes still route unmentioned turns to the
direct participant, and explicit `@mention` routing is unchanged.

Migration steps:

Operators with older local rooms should mention the intended participant or
choose a per-turn audience when they want a specific Cat to answer first.

Deprecations:

None.
