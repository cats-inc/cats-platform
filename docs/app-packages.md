# Built Utility Apps and Desktop Version Selection

Usage is the display name; `cats.usage` remains the stable package ID. The first
implementation is a renderer-only utility package, not another Platform product.

## Host and SDK compatibility

An App declares supported hosts in `cats.app.json` independently of its own
artifact version. Current Usage 0.4.0 declares:

```json
{
  "compatibility": {
    "catsPlatform": "^0.5.0",
    "appSdk": "^1.2.0"
  }
}
```

`catsPlatform` compares against the Platform root package version, also used by
Desktop. `appSdk` compares against the host's independent SDK interface version.
Both must match: a new SDK feature can require a newer SDK even within a supported
Desktop line. No separate minimum-Desktop field is needed while versions are shared.

[Package installation validation](../src/platform/apps/packageInstaller.ts)
checks both declarations using [the version matcher](../packages/app-sdk/package.js).
The current grammar accepts exact stable `X.Y.Z`, `^X.Y.Z`, `major.x` and
`major.minor.x`. It rejects prerelease strings and unsupported expressions such
as `>=0.3.2 <0.4.0`, `~0.3.2` or unions. Do not describe it as a full npm semver parser.

Use the actual minimum plus an upper compatibility boundary: `^0.3.2` accepts
stable `0.3.2` and later `0.3.x`, excluding `0.4.0`; `^1.2.0` accepts SDK 1.2.0
through 1.x, excluding 2.0.0. A broad `0.x` would admit all 0.x minors and does not
express a useful minimum for an App requiring newer features.

Required project release discipline preserves App-facing contracts within a 0.x minor
line and changes the minor for breaking host changes; stable SDK breaking changes
use a major bump. This is a project choice, not a promise of universal pre-1.0
compatibility. If a compatible line is not yet supportable, declare an exact
verified version. Record verification evidence separately from declared ranges.
Pre-release permission to remove obsolete contracts does not justify silently
accepting incompatible Apps.

An App's unchanged range need not track every Desktop patch. Raise its minimum
only when required capabilities/fixes demand it. Changing a published manifest
changes artifact bytes and requires a new App version when released. See the
[App release SOP](https://github.com/cats-inc/cats-apps/blob/main/docs/deployment.md#host-and-sdk-compatibility)
and [all-target release guide](https://github.com/cats-inc/cats-one/blob/main/docs/release-guide.md).

## Build and select an exact App version

In cats-apps:

```powershell
npm test
npm run build -- --version 0.4.0
```

This produces an archive, `usage-0.4.0.lock.json`, and provenance in `dist/`.
The requested version must equal both App manifests. Rebuilding different bytes
over an existing output version is rejected; use a separate development output
directory or publish a new version. Release builds record their GitHub source SHA;
local builds report an unknown revision and an input-content digest.

In cats-platform, build the Windows installer with that selection:

```powershell
npm run desktop:package:windows -- --apps-lock ../cats-apps/dist/usage-0.4.0.lock.json --skip-mobile
```

`--apps-lock` also works on the macOS/Linux installer entrypoints. The Windows
staging wrapper accepts `-AppsLock`; Unix staging wrappers accept the lock as
their third positional argument. `CATS_DESKTOP_APPS_LOCK` provides the same input
for automation. An explicit CLI argument takes precedence.

To stage already-built host/runtime artifacts without creating an installer:

```powershell
node scripts/package-desktop.mjs --platform windows --apps-lock ../cats-apps/dist/usage-0.4.0.lock.json
```

The lock format is `{ schemaVersion: 1, apps: [{ id, version, sha256, artifact }] }`.
Each `version` is exact stable `x.y.z`, and `sha256` is a lowercase 64-hex digest.
`artifact` is a local path relative to the lock file or a public GitHub Release
asset URL under `/owner/repo/releases/download/<fixed-tag>/<asset>`. Missing bytes,
duplicates, incompatible versions, identity mismatches and digest mismatches fail
the build. Moving `latest`, `nightly`, and `current` release references are rejected.
No App source checkout or npm build is performed by Desktop packaging.

The installer command resolves packages before host builds can clean `build/`,
then materializes an immutable offline selection in an OS temporary directory.
Staging copies archives into `shared/official-apps/`, writes a relative-only
`bundle.lock.json`, and records pins in the package plan, asset map, and installer
manifests. Electron includes this directory and the host SDK in `app-sidecar`.
Temporary build selections are safe to remove after the build is finished.

## Release policy and default selection

The cats-apps shared tag workflow publishes `usage-v0.4.0` (and other utility
tags) independently of Desktop. It refuses to replace an existing release and
does not mark utility releases as a repository-wide `latest` release.

Desktop release CI reads the source-controlled `config/desktop-apps.lock.json`.
Desktop 0.5.1 keeps the same Usage 0.4.0 artifact; its `^0.5.0` declaration accepts
0.5.1, so no new App release is needed.
Desktop 0.5.0 selects the published [Usage 0.4.0 release](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.4.0),
with SHA-256 `7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.
Provenance identifies Apps commit `cb48b229295d5cb4bb6f3009fbe0b9e81afe1b63`.
The release workflow passed; downloaded archive, lock, provenance and GitHub digest
agree. The SDK 1.2.0 matcher accepts Platform 0.5.x and rejects 0.4.x, and the
decoded payload equals Usage 0.3.0. Only the App version and host range differ:
Desktop 0.5.0 bundles Runtime 0.3.0 and moves to the next host minor, which Usage
0.3.0's `^0.4.0` declaration excludes. Desktop 0.4.x retains Usage 0.3.0 unchanged.

Desktop 0.4.0 selected the published [Usage 0.3.0 release](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.3.0),
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
Provenance identifies Apps commit `4c3f6057747032df24b1c1b1bb5ea873fa94f387`.
The release workflow passed; downloaded archive, lock, provenance and GitHub digest
agree. Platform 0.4.0 / SDK 1.2.0 accepts the archive, and its decoded payload equals
the locally tested build. Only the App version and host range differ from Usage
0.2.1; Desktop 0.3.x retains that prior artifact unchanged.

Desktop 0.2.5 selects the published [Usage 0.2.0 release](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.2.0),
with SHA-256 `7d5455bb6b484b731becbc69b469e649fbfc433cf015586e0022c3045974c04e`.
The release provenance identifies Apps commit `1affcf38e427f636e1eedb45bf3d1ac4e78eeb4f`.
Desktop 0.2.4 retains Usage 0.1.1 and SDK 1.1.0 unchanged.
Desktop 0.2.2 and 0.2.3 retain their existing Usage 0.1.0 archive unchanged.
Future selections must copy the actual release's version/hash and immutable
asset URL into the lock and commit it with Desktop. Do not substitute a local
rebuild's hash: gzip headers can differ by build OS even for identical payloads.
No fake URL or implicit latest version is shipped. Local builds without a
selection still explicitly report that no optional Apps are included.

For the 0.4.0 catalog-upgrade preview, commit/push the Platform version and App
selection, then manually dispatch the Desktop release workflow on that commit with
`tag=v0.4.0` and `runtime_ref=edfec394951200702b9a88b4f9d76d97669b9be8`.
That Runtime 0.2.0 source passed release preflight and includes automatic schema-1
catalog upgrades. Desktop bundles SDK 1.2.0 and the separate `runtime-skills/`
library. npm publication is not part of this release. Let the preview workflow
create its tag; pushing a Desktop version tag selects the official release path
instead. Utility App tags and Desktop tags are independent.

Each Windows/macOS/Linux build runs the following check against its real unpacked
installer resources before the draft can be published:

```powershell
node scripts/verify-desktop-app-bundle.mjs --release-root release --expect-lock config/desktop-apps.lock.json
```

It verifies the selected App set, archive hashes/identity, shipped SDK/config paths,
the entrypoint's SDK package alias, retention of that import in bundled sidecars,
and offline/idempotent activation in a temporary registry. It does not touch user
state and is not a full interactive native-installer/UI acceptance test.

## Install and activate

Packaged Desktop supplies `CATS_APP_BUNDLE_PATH` from its `app-sidecar` resource
root to the managed platform process. Configuration templates and the App SDK
resolve under the same root on Windows, macOS and Linux.
Before accepting requests, the platform validates all bundled artifacts, stages
each version under its managed App directory, and atomically changes its registry
entry. The startup lock must reference adjacent local archives only; startup
does not download packages. Invalid bundles fail closed. First installs are
enabled and appear in Lobby's Apps section after normal Desktop setup; no manual
utility download, file move or extraction is required.

Per-App data lives outside replaceable package versions. Failed validation leaves
the current version/data intact. Same version + same hash is idempotent; same
version + different hash is rejected. Explicit rollback to a previously verified
version is supported. Bundled refreshes preserve disabled/uninstalled choices.
Package updates are atomic per App, not an all-App database transaction.

The authenticated local install API also accepts `.catsapp`:

```json
{
  "packagePath": "C:/downloads/usage-0.2.0.catsapp",
  "id": "cats.usage",
  "version": "0.2.0",
  "sha256": "<copy the real 64-hex hash from the verified lock>",
  "enable": true
}
```

POST that body to `/api/apps/install` using the host's existing authentication
and CSRF policy. The old Settings path-only form is for manifest registration;
the initial production installation path is the Desktop bundle. Manifest-only
registrations do not grant a verified executable renderer. Local archives become
`local-user`; only host-selected Desktop bundles receive `system` provenance.

## Frozen v1 boundary

SDK 1.2 supports `usage.refreshQuota({provider,instance})` for `codex`, `copilot`,
`claude` and `antigravity`. Unlike cached reads,
this requires both telemetry permissions (`runtime.telemetry.read` and
`runtime.telemetry.refresh`). Its version-bound host route is POST
`/api/apps/:id/usage/refresh?version=...`; normal authentication and CSRF apply.
It forwards only an allowlisted provider/instance selector, with a 12-second/2-MiB response bound.
Runtime uses CLI stdio only (8-second attempt plus cleanup, 60-second cooldown),
never reads CLI credentials, never invokes model work and never calls a provider
API directly. Native Windows was verified; WSL/Docker currently return unsupported.
The result includes sanitized status, `nextRefreshAt`, and a cached v1 snapshot.
The quota projection carries `refreshSupported`, nullable native used/limit/remaining,
unit and explicit unlimited state. New collectors reject custom CLI startup args;
Kiro remains unverified after an auth-related CLI response. See
[Runtime evidence](../../cats-runtime/docs/research/2026-09-11-additional-cli-quota-queries.md).
Usage 0.2.0 is published, requires SDK ^1.2.0 and is selected for Desktop 0.2.5.
Usage 0.1.1 requires SDK ^1.1.0 and remains in the existing Desktop 0.2.4 release.
Neither publication changes an existing installation automatically. The actual
0.2.5 installer resources and offline activation must pass the release gates
before preview publication; installed acceptance remains a separate task.

- `.catsapp`: gzip JSON `{schemaVersion:1,kind:"cats-app",manifest,files:[{path,base64}]}`.
  Limits: 8 MiB compressed, 24 MiB expanded envelope, 128 files, 8 MiB/file.
  Absolute/traversal/device names, duplicate/case-colliding paths and invalid base64
  are rejected. No symlinks or install hooks are represented. The host retains the
  verified archive and reads its renderer from those bytes instead of trusting loose files.
- Renderer: one self-contained HTML entry with explicit `<head>`; inline JS/CSS,
  data images if needed. Server/worker execution and additional capabilities are rejected.
- Compatibility: SDK `1.2.0`; exact stable versions, `major.x`, `major.minor.x` and
  caret ranges only. Unsupported ranges/prereleases fail rather than being guessed.
  Existing old releases with matching version strings do not imply the new host implementation is present.
- SDK: host-injected `globalThis.catsApp`, with identity/version/locale/theme,
  `usage.getSnapshot()` and `openLobby()`. Executable SDK and browser typings live
  in `packages/app-sdk`; it is not a separately published npm package.
- Renderer isolation: `sandbox="allow-scripts"` without same-origin access; CSP is
  inserted before any package markup, with default/network/frame/worker access denied.
  Source-window + opaque-origin + nonce bind a one-time MessageChannel handshake.
  No credentials or general fetch proxy are provided. This limits host privileges;
  it is **not** a full hostile-code/data-exfiltration sandbox. Install only trusted
  first-party or owner-approved local utilities. See [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
  and [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
- Reads: `/api/apps/:id/renderer?version=...` and `/api/apps/:id/usage?version=...`
  require an enabled verified version and `ui.route`; usage additionally requires
  `runtime.telemetry.read`. Each read and in-flight completion rechecks access.
  The host forwards only `/usage/snapshot`, projects allowlisted fields, limits
  responses to 2 MiB/8 seconds, and never forwards upstream error bodies.
  Disable/uninstall/version changes revoke the next read; the surface tears down
  when notified of revoked access or when unmounted. Already-delivered data cannot
  be recalled. UI requests are limited to one in flight and at least one second apart.
- Startup: loading the verified renderer and establishing its SDK bridge share a
  15-second deadline. A stalled request or missing handshake produces a localized
  error and a retry button, aborts the request and removes any incomplete frame.
  Retry creates a fresh nonce/context without reinstalling the App. Initialization
  failures are caught, and late responses from disposed attempts cannot replace
  the new attempt. Nonces use 128 cryptographically random bits without requiring
  the secure-context-only `crypto.randomUUID` API.

## Validation and remaining work

Run `cats-app-package`, `cats-app-hosting`, `runtime-usage-client`, `app-host-route`,
registry/manifest, and `desktop-packaging` tests with the repository test runner.
The browser smoke uses the actual built package, authenticated App requests through
the complete request router, a fixture runtime, a fresh browser context, and a
temporary registry. Supply the built renderer root to exercise the full production
Platform page and Lobby navigation, instead of only the standalone App surface:

```powershell
$env:CATS_TEST_PLAYWRIGHT_MODULE = '<absolute path to playwright-core/index.mjs>'
$env:CATS_TEST_BROWSER_EXECUTABLE = '<absolute path to a Chromium/Edge executable>'
node --import tsx scripts/testing/check-usage-app.mts --apps-lock <built-usage-0.2.0-lock>
node --import tsx scripts/testing/check-usage-app.mts --apps-lock <verified-release-lock> --renderer-root build/renderer --check-loading-recovery
```

It binds `127.0.0.1` on an OS-assigned port and closes the test server/browser.
The smoke selects the App version from its lock and exercises the Usage 0.2.0
multi-provider buttons, request counts, unlimited semantics and stale/offline states.
Native Codex refresh has separate live built-App validation in PLAN-106. Existing
0.2.4 release builds apply their offline-activation gate to selected Usage 0.1.1 bytes.
It does not read provider accounts, browser profiles or real user state.
Screenshots go to `build/usage-smoke/`. Fixtures are not live collector evidence.
The recovery check injects a stalled renderer request and a missing SDK handshake,
then requires an error, successful retry and a visible dashboard. The normal smoke
also checks return-to-Lobby/re-entry when using the complete production page.

To run the same functional checks in an isolated hidden Electron window, point
`CATS_TEST_BROWSER_EXECUTABLE` at a stock Electron executable matching Desktop and
add `--electron`. Its fresh profile, lack of a Desktop supervisor/preload, and fixture
host envelope are deliberate: this is not an installed Desktop acceptance test.
Hidden Electron runs do not produce screenshots. Do not label either this test or
the offline package verifier as proof that a user's installed Desktop works.
Run `--check-loading-recovery` with Chromium/Edge only; its request interception
is not supported by this Electron harness. The regular Electron run covers
rendering, filters, offline/stale/restart state, revocation and Lobby re-entry.

Desktop 0.2.2's Windows bundled sidecar inlined the `#cats-app-package` module.
That relocated the SDK loader's `import.meta.url` to the server entrypoint, so it
read a nonexistent sibling `browser.js` instead of the shipped SDK resource. The
renderer API consequently returned 503 even though the App archive was valid.
Keep this package-import alias external to the server bundle. The bundled-sidecar
regression test executes the production bundler's output in a temporary install
layout and must receive the actual SDK from the renderer API; source-only tests
cannot catch this failure. The installer verifier also rejects the bad bundle.

These packaging and loading-recovery fixes are included in the 0.2.3 build;
they do not modify the published 0.2.2 installer or Usage 0.1.0 artifact. Fully
quit Cats and install 0.2.3 over the existing installation, preserving the user
profile. Installation and live-window acceptance must be verified separately.

Deferred: remote catalog/install/update UX, signatures/revocation infrastructure,
general App actions/server/worker/storage capabilities, active account collectors,
verified account linking, persistent usage history, and native installer smoke on
all three operating systems. Keep these distinct from the delivered renderer slice.
