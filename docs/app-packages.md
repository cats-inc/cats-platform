# Built Utility Apps and Desktop Version Selection

Usage is the display name; `cats.usage` remains the stable package ID. The first
implementation is a renderer-only utility package, not another Platform product.

## Build and select an exact App version

In cats-apps:

```powershell
npm test
npm run build -- --version 0.1.0
```

This produces an archive, `usage-0.1.0.lock.json`, and provenance in `dist/`.
The requested version must equal both App manifests. Rebuilding different bytes
over an existing output version is rejected; use a separate development output
directory or publish a new version. Release builds record their GitHub source SHA;
local builds report an unknown revision and an input-content digest.

In cats-platform, build the Windows installer with that selection:

```powershell
npm run desktop:package:windows -- --apps-lock ../cats-apps/dist/usage-0.1.0.lock.json --skip-mobile
```

`--apps-lock` also works on the macOS/Linux installer entrypoints. The Windows
staging wrapper accepts `-AppsLock`; Unix staging wrappers accept the lock as
their third positional argument. `CATS_DESKTOP_APPS_LOCK` provides the same input
for automation. An explicit CLI argument takes precedence.

To stage already-built host/runtime artifacts without creating an installer:

```powershell
node scripts/package-desktop.mjs --platform windows --apps-lock ../cats-apps/dist/usage-0.1.0.lock.json
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

The cats-apps shared tag workflow publishes `usage-v0.1.0` (and future utility
tags) independently of Desktop. It refuses to replace an existing release and
does not mark utility releases as a repository-wide `latest` release.

Desktop release CI reads the source-controlled `config/desktop-apps.lock.json`.
Desktop 0.2.3 retains the published [Usage 0.1.0 release](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.1.0) selected in 0.2.2,
with SHA-256 `568fbc3fa2efaee2036f4ae04d97d379945988d6e9300e41861b61c01beb1222`.
The release provenance identifies Apps commit `f0f1b2757d26cdb8fafdb25967008a3ffa348e25`.
Future selections must copy the actual release's version/hash and immutable
asset URL into the lock and commit it with Desktop. Do not substitute a local
rebuild's hash: gzip headers can differ by build OS even for identical payloads.
No fake URL or implicit latest version is shipped. Local builds without a
selection still explicitly report that no optional Apps are included.

For the 0.2.3 unsigned preview, merge the Platform version/fix changes, then
manually dispatch the Desktop release workflow on that merged commit with
`tag=v0.2.3` and `runtime_ref=0345d319cf2f97ea51a482dd6932b34576a491b3`.
This is the merged Runtime Usage snapshot implementation. Let the preview
workflow create its tag; pushing a Desktop version tag selects the signed stable
release path instead. Utility App tags and Desktop tags are independent.

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
  "packagePath": "C:/downloads/usage-0.1.0.catsapp",
  "id": "cats.usage",
  "version": "0.1.0",
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

SDK 1.1 adds `usage.refreshQuota({provider:"codex",instance})`. Unlike cached reads,
this requires both telemetry permissions (`runtime.telemetry.read` and
`runtime.telemetry.refresh`). Its version-bound host route is POST
`/api/apps/:id/usage/refresh?version=...`; normal authentication and CSRF apply.
It forwards only a Codex instance selector, with a 12-second/2-MiB response bound.
Runtime uses CLI stdio only (8-second attempt plus cleanup, 60-second cooldown),
never reads CLI credentials, never invokes model work and never calls a provider
API directly. Native Windows was verified; WSL/Docker currently return unsupported.
The result includes sanitized status, `nextRefreshAt`, and a cached v1 snapshot.
Usage 0.1.1 requires SDK ^1.1.0. Selecting its published version/hash for Desktop
is still a release step; the default lock above continues to identify the last
published package until that step is completed.

- `.catsapp`: gzip JSON `{schemaVersion:1,kind:"cats-app",manifest,files:[{path,base64}]}`.
  Limits: 8 MiB compressed, 24 MiB expanded envelope, 128 files, 8 MiB/file.
  Absolute/traversal/device names, duplicate/case-colliding paths and invalid base64
  are rejected. No symlinks or install hooks are represented. The host retains the
  verified archive and reads its renderer from those bytes instead of trusting loose files.
- Renderer: one self-contained HTML entry with explicit `<head>`; inline JS/CSS,
  data images if needed. Server/worker execution and additional capabilities are rejected.
- Compatibility: SDK `1.1.0`; exact stable versions, `major.x`, `major.minor.x` and
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
node --import tsx scripts/testing/check-usage-app.mts --apps-lock ../cats-apps/dist/usage-0.1.0.lock.json
node --import tsx scripts/testing/check-usage-app.mts --apps-lock <verified-release-lock> --renderer-root build/renderer --check-loading-recovery
```

It binds `127.0.0.1` on an OS-assigned port and closes the test server/browser.
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
