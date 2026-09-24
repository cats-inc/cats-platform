# Deployment Guide

> Deployment procedures and infrastructure documentation for the current
> `Cats` product, its `cats-platform` host target, and the planned packaged
> platform topology.

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | `http://127.0.0.1:8181` | Local development |
| Built local | `http://127.0.0.1:8181` | Local production-style run after `npm run build` |
| Containerized local | `http://127.0.0.1:8181` | Scaffold exists, but container assets need refresh before being treated as current |
| Staging | TBD | Pre-production testing |
| Production | TBD | Live environment |
| Desktop distributable | Cross-platform packaging commands wired; Windows smoke path validated | Electron host starts local `cats-runtime` + `cats`, waits for readiness, persists bootstrap/remediation state, stages Windows/macOS/Linux packaging outputs, emits Windows NSIS installers plus unsigned/test macOS/Linux packages, and currently has real post-install smoke validation only on Windows |

Before upgrading an existing local workspace, review
[release-notes.md](./release-notes.md) for behavior changes and migration
notes.

## Release boundaries

Apply the [cross-repository compatibility and data-upgrade policy](https://github.com/cats-inc/cats-one/blob/main/docs/release-guide.md#compatibility-and-data-upgrades):
breaking public APIs, configuration, stored-data requirements or supported user
flows move `0.x` to the next minor, and stable `1.x+` to the next major. Compatible
fixes can use patch releases. Internal schema changes with a transparent, lossless
migration are judged by their actual compatibility, not the schema number alone.
Preview status does not waive backup, validation, atomic migration, idempotent
restart or existing-profile upgrade tests. Keep obsolete execution APIs removed.

The catalog cutover sets the next authorized Platform/Desktop release boundary
at `0.4.0`. Before that release, recheck bundled Apps' `catsPlatform` ranges (a
`^0.3.0` declaration excludes `0.4.0`) and coordinate any required new immutable
App artifact. Do not bypass host compatibility or mutate an existing App archive.
Record the selected Runtime source and its upgrade capability; Desktop delegates
Runtime-owned data migration to Runtime instead of rewriting the same file itself.
These rules do not authorize version bumps or publication in a documentation task.

Platform npm and Cats Desktop share the root `package.json` version and the root
and `packages[""]` version entries in `package-lock.json`. Keep this single version
source for now; their publication timing is independent. For example, npm may
ship two intervening versions before the next Desktop release. Skipping those
Desktop numbers is valid and does not require a separate Desktop version counter.

Ordinary implementation, documentation, commit/push and merge requests do not
authorize a version bump or publication. Accumulate commits until the owner
selects a release target, using existing authorization for the necessary steps.
Do not release Runtime, cats-one or Apps merely because Platform changed.

| Selected target | Preparation | Publication trigger |
| --- | --- | --- |
| Platform npm | Root manifest and lockfile version | Manually dispatch `npm-publish.yml` |
| Official Desktop | Same version fields; matching `vX.Y.Z` tag | Push that Git tag |
| Preview Desktop | Same version fields; matching unused `vX.Y.Z` tag name | Manually dispatch `desktop-release.yml`; it creates the tag/release |

Pushing version files to a branch runs CI, not publication. An npm-only release
needs no Git tag; use `npm version <version> --no-git-tag-version` or update the
files directly. npm dist-tags (`latest`/`next`) are unrelated to Git release tags.
Reuse an already prepared version if it is unused on the chosen publication
target; never overwrite published bytes or recreate an existing release tag.

Follow [local validation scope](../AGENTS.md#local-validation-scope); a version
bump does not itself require duplicating the full hosted suite locally. See the
[cross-repository release guide](https://github.com/cats-inc/cats-one/blob/main/docs/release-guide.md)
for dependency ranges, launcher releases and independently versioned Apps.

## Deployment Methods

Standalone npm CLI browser/keyboard behavior is documented under
[Terminal controls](setup-guide.md#terminal-controls). Use `--no-open` for an
interactive run without automatic browser launch. Automation should use the
existing app-managed mode; it never claims keyboard input or opens a browser.
Watch supervisors retain terminal ownership across file-change/crash restarts.

### npm publication

Publish `@cats-inc/cats-platform` through the manual
[npm publish workflow](../.github/workflows/npm-publish.yml), which runs the full
test gate and fresh prepack build before trusted publication. Update the root
manifest and lockfile version together and integrate remote main first:

```sh
gh workflow run npm-publish.yml --repo cats-inc/cats-platform --ref main -f dist_tag=latest
```

`--ref main` selects main's source at dispatch time; use the intended release
branch when necessary. Choose the dist-tag explicitly; the workflow defaults to
`next`. Verify the successful run, registry version and tarball availability.
Only when a selected cats-one release needs a new Platform minimum, publish that
version before updating the launcher's range and registry lockfile. Existing
compatible npm dependencies need no repeat release. npm publication neither
publishes Desktop nor creates its Git tag.

### Desktop publication

The [Desktop workflow](../.github/workflows/desktop-release.yml) validates that
the tag matches the manifest and lockfile versions, builds into a draft, validates
the assets, then publishes. Prepare the version files and commit/push the chosen
source before triggering it.

- **Official:** push the matching `vX.Y.Z` Git tag pointing at the selected
  Platform commit. This selects the official signing/release gates and publishes
  the release as latest after they pass. An npm publish is not a prerequisite.
- **Preview:** manually dispatch from the intended branch with an unused matching
  tag and an immutable Runtime commit. Do not push the preview tag first; that
  would select the official path. Example with placeholders:

  ```sh
  gh workflow run desktop-release.yml --repo cats-inc/cats-platform --ref main -f tag=vX.Y.Z -f runtime_ref=RUNTIME_COMMIT_SHA
  ```

  The workflow creates the preview tag and publishes a GitHub prerelease, not
  latest. Current preview tag names still use plain `vX.Y.Z`.
- **Unsigned preview:** append `-f unsigned=true` only when unsigned output is
  requested. Preview status and signing are separate: the default signs where
  credentials exist. Unsigned macOS previews require manual installation and
  cannot self-update; preview publication alone does not guarantee update support
  on every OS.

Desktop builds Runtime from source, so Runtime npm publication is unnecessary.
For previews, pass the full Runtime SHA rather than accepting the default `main`.
**Current official-workflow limitation:** tag-triggered runs resolve Runtime
`main` in each OS build and record the resulting SHA. The Platform tag does not
pin Runtime, and the workflow does not currently resolve one shared Runtime SHA
before the matrix. Record the actual revisions; adding that pin to official
builds is a separate workflow change, not behavior supplied by this guide.

Apps are selected separately through `config/desktop-apps.lock.json`, using exact
versions, published URLs and SHA-256 values. Reuse the selected artifacts unless
the authorized Desktop release includes an App update. An App release does not
automatically change this lock or update an installed Desktop.
Check both the App's [host and SDK requirements](app-packages.md#host-and-sdk-compatibility);
the App version itself does not specify a compatible Desktop version.

Confirm the complete workflow and the published release assets before reporting
completion. Dispatching a workflow or uploading CI artifacts alone is not a
published Desktop release.

### Product knowledge assets

Code-entry assistance ships `config/catlas-knowledge.json` (v1), and Orchestrator
ships `config/orchestrator-knowledge.json` (role-aware v2), in the Platform npm
package and Desktop's required shared Platform staging assets. Electron
copies that config directory into `resources/app-sidecar/config`; the existing
Platform package-root resolver supports both split and bundled server output.
Desktop staging fails if either required knowledge asset is missing. The runtime
loader validates its schema, Platform version range and required capabilities;
invalid or incompatible content yields basic Code help or an empty Orchestrator
knowledge snapshot while preserving existing Chat routing/policy.

These build-coupled bundles are normal release/preview product knowledge,
separate from the user's replaceable assist cache and the proposed preview/debug
development supplement.
Knowledge consumption needs neither a source checkout nor development skills.
Maintenance and the current validation limits are recorded in
[SPEC-117](specs/SPEC-117-cats-self-development-and-catlas-practice.md#implemented-code-entry-assistance)
and [SPEC-118](specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md#k1-implementation-contract).

### Provider selection contract

Selection-aware Platform/Desktop must connect to the matching Runtime contract
from [Runtime PLAN-039](../../cats-runtime/docs/plans/PLAN-039-provider-selection-bootstrap-rollout.md).
Desktop packaging builds the sibling Runtime checkout; use the matching
`runtime_ref` in release automation. This implementation does not publish a new
package or update an installed Desktop.

The connected Runtime's `~/.cats/runtime/config/providers.yaml` (root override:
`CATS_RUNTIME_DIR`) owns selection. A new root offers static choices and saves
them before inventory or helpers. Empty selection is valid idle mode; an old or
unreachable Runtime cannot authorize an all-provider fallback. Keep the full
example out of automatic installation/upgrade configuration writes.

### Manual Deployment

```bash
npm install
npm run build
npm start
```

### Docker

```bash
docker compose up --build
```

Container assets were inherited from bootstrap and have not yet been refreshed
for the current `build/server/` plus `build/renderer/` output layout. Treat them as a future
follow-up, not a validated deployment path.

### Trusted LAN / Tunnel Browser Access

For browser access from another device or a trusted tunnel/overlay:

- expose `cats-platform`, not `cats-runtime`
- keep `CATS_RUNTIME_BASE_URL` pointing at the local runtime upstream
  (typically `http://127.0.0.1:3110`)
- let browsers enter through the Cats origin only, including runtime setup and
  diagnostics under `/runtime/*` and `/runtime/api/*`
- keep packaged Electron on `CATS_DESKTOP_APP_HOST=127.0.0.1` and
  `CATS_DESKTOP_RUNTIME_HOST=127.0.0.1`

Current decision:

- trusted LAN binds may use `CATS_HOST=0.0.0.0` for self-hosted/dev web
- Tailscale/ngrok should target the local `cats-platform` port, not the runtime
- a dedicated `CATS_PUBLIC_BASE_URL` is not required in the current slice
  because browser-facing runtime/recovery links are same-origin relative paths
- this remains a trusted operator workflow, not a public-internet deployment
- `GET /api/platform/ingress` exposes the current bind mode plus candidate
  local/LAN/trusted-overlay browser URLs for operator verification, while
  filtering out common virtual-only adapter addresses such as WSL/Docker
- `npm run ingress:smoke -- --base-url <url>` is the recommended operator probe
  before opening the app from another device or through Tailscale/ngrok,
  because it verifies that `/runtime/*` and `/runtime/api/*` still resolve
  through the Cats origin

Auth and repair constraints for LAN/tunnel access:

- Every executable platform entrypoint generates and persists a 256-bit secret
  automatically at
  `~/.cats/platform/config/auth-session-secret.local` when no explicit value is
  configured; the same secret is reused across launches. This applies to
  `cats-platform`, `cats-one`, local dev, and packaged Desktop. Set an explicit
  value for clustered or ephemeral deployments. The platform uses an atomic
  no-clobber publish, with exclusive-copy semantics when hard links are
  unavailable. Permission failures remain fail-closed; invalid contents are
  quarantined and stale temporary/invalid artifacts are retired. Direct CLI
  diagnostics go to stderr, while Desktop captures sidecar diagnostics and
  keeps provisioning failures on its retryable bootstrap page.
- Platform-launched project child processes remove the session secret, runtime
  API key, Telegram credentials, and ngrok auth tokens from their environments.
- `CATS_AUTH_ENABLED=false` is not a LAN deployment option and is rejected
  after setup completion.
- Keep `CATS_AUTH_ALLOWED_BROWSER_ORIGINS` explicit for every browser-facing
  origin that may submit pre-auth mutations, including Vite dev, trusted LAN,
  or tunnel origins.
- Reverse proxies must preserve the browser's `Origin` header and list the
  public origin in `CATS_AUTH_ALLOWED_BROWSER_ORIGINS`; Cats does not trust
  arbitrary `X-Forwarded-*` headers to reconstruct pre-auth browser origins.
- If a setup-complete workspace starts with missing/corrupt auth state, the
  server writes the raw one-time repair token only to
  `<platform-state-dir>/auth-recovery-token.local.txt` (default:
  `~/.cats/platform/state/auth-recovery-token.local.txt` in dev and packaged
  desktop); structured logs expose only the token-file path.
- Repair first-admin creation always requires the recovery token. Loopback
  source address is not treated as authorization because reverse proxies and
  tunnels can make remote clients appear local. Keep the recovery token local
  to the operator while completing repair.
- Aggregate login-throttle state can be cleared through the admin+CSRF
  browser route or the one-time recovery token route;
  do not delete the auth-state file just to clear a bounded cooldown.
- Every workspace has a local Admin password. Setup refuses to complete
  without one, so a deployment always retains a credential that works offline,
  on a raw LAN IP, and on origins Google will not authorize.
- Google account linking is an authenticated `Settings > General > Account`
  action, not a deployment step. It requires the operator to re-enter the local
  password; the resulting action grant is single-use, expires in five minutes,
  is bound to one browser session and purpose, and dies with the process.
- Google Sign-In requires an origin Google authorizes, which generally rules
  out raw LAN IP hosts and plain HTTP other than localhost. On those hosts the
  Account section stays truthful: local password remains the login method and
  the UI explains that linking needs an authorized origin.
- Unlinking Google revokes every other browser and mobile session for that
  account and rotates the current session's CSRF token. Expect other devices
  and phones to be signed out; the device performing the unlink stays signed
  in. Unlink is refused when it would leave the account with no local
  password.

### Desktop Host First Slice

The first desktop-host slice is now in-tree:

- Electron `main` owns tray, windows, startup, and process supervision
- `cats-runtime` runs as a managed local sidecar in `app-managed` mode
- `cats` runs as a managed local sidecar in `app-managed` mode
- the host waits on each service's `/health` readiness contract before
  leaving the bootstrap surface
- a host-owned bootstrap page performs the first prerequisite scan against
  `cats-runtime` diagnostics and then:
  - continues into `/setup` for first-run flows
  - or opens `/` for completed setups so the app can resolve to `/lobby`, the
    last-used product, or in-product recovery
- The renderer does not talk to provider CLIs or spawn local runtimes directly
- the packaged experience still keeps setup and provider remediation in the
  host rather than pushing shell work into the renderer
- after setup completes, runtime/provider regressions stay in recovery instead
  of routing the user back into onboarding
- tray product shortcuts read `/api/app-shell` through the same Electron session
  as the window. Normal renderer loads/product changes also synchronize the shell;
  login/logout cookie changes refresh it even while the window is hidden.
  Confirmed logout, disabled products, and authoritative empty lists remove
  shortcuts. Temporary request failures retain the last confirmed list, and older
  responses cannot overwrite a newer shell update. Ordinary synchronization keeps
  provider diagnostics and setup work intact.
- current launch command:

```bash
npm run desktop:start
```

Native tray/session regression (requires a graphical Electron environment):

```bash
npm run build:host
CATS_TEST_ELECTRON_PLATFORM_SHELL=1 node --test --test-isolation=none tests/desktop-platform-shell-electron.test.js
```

This uses a synthetic local server and a disposable profile. It starts Electron
twice to check persisted login, cold-start shortcuts, refresh, logout, and login
again without reading or changing the installed user's profile. On 2026-09-24 it
passed on Linux ARM64 with Electron 41.2.0. The published
[0.4.3 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.3)
also passed separate [installed Linux 0.4.2 → 0.4.3 automatic update acceptance](research/2026-09-23-linux-self-update-validation.md#2026-09-24-follow-up-released-042-to-043):
package and native Desktop versions changed, settings/model choices survived,
and all three tray shortcuts appeared on automatic restart and survived renderer
refresh. Windows/macOS native acceptance is not implied by either Linux check.

- self-hosted npm package smoke helpers:

```powershell
.\scripts\windows\Pack-Install.ps1
```

```bash
./scripts/linux/pack-install.sh
./scripts/macos/pack-install.sh
```

- use `cats-platform --help` after install to confirm the host executable contract
- this path validates the self-hosted tarball flow for the future
  `@cats-inc/cats-platform` package; it does not replace the Electron
  packaging flow below or the separate `cats-one` bootstrap publication target

- staged packaging command:

```bash
npm run desktop:stage
```

- current packaging substrate output root:
  - `build/desktop-packaging/desktop-package-plan.json`
  - `build/desktop-packaging/shared/*`
  - `build/desktop-packaging/shared/setup-assets/windows/*`
  - `build/desktop-packaging/shared/setup-assets/linux/*`
  - `build/desktop-packaging/shared/setup-assets/macos/*`
  - `build/desktop-packaging/shared/setup-assets/linux/provider-cli-common.sh`
  - `build/desktop-packaging/shared/setup-assets/linux/node-cli-common.sh`
  - `build/desktop-packaging/shared/setup-assets/macos/provider-cli-common.sh`
  - `build/desktop-packaging/shared/setup-assets/macos/node-cli-common.sh`
  - `build/desktop-packaging/shared/setup-assets/manifest.json`
  - `build/desktop-packaging/targets/<target>/installer-manifest.json`
- current platform wrappers:

```powershell
.\scripts\windows\Build-DesktopPackage.ps1 -Platform windows
```

```bash
./scripts/linux/build-desktop-package.sh linux
./scripts/macos/build-desktop-package.sh macos
```

- actual Windows installer command:

```bash
npm run desktop:package:windows
npm run desktop:package:windows -- --sidecar-layout bundle
npm run desktop:package:windows -- --sidecar-layout split
```

```powershell
.\scripts\windows\Build-WindowsInstaller.ps1
```

- macOS/Linux installer commands:

```bash
npm run desktop:package:macos
npm run desktop:package:linux
node scripts/build-desktop-installer.mjs --target macos --arch x64 --format dmg --sidecar-layout split
node scripts/build-desktop-installer.mjs --target linux --arch arm64 --format deb --sidecar-layout bundle
```

- sidecar layout contract:
  - `--sidecar-layout split` keeps the original multi-file `cats` and
    `cats-runtime` sidecar outputs
  - `--sidecar-layout bundle` builds both sidecars as single-file packaged
    bundles while leaving dev/server workflows unchanged
  - the same flag flows through `build-desktop-installer.mjs`,
    `package-desktop.mjs`, `cats-platform`, and `cats-runtime` so the packaged
    app never mixes app/runtime layouts by accident

- refresh the packaged/tray icon set from `assets/app-icon-silhouette.svg`:

```bash
npm run desktop:icons
```

- square fallback:

```bash
npm run desktop:icons -- --shape square
```

- packaging/build commands consume the existing icon files in place; they do
  not regenerate icons during the package step

```bash
./scripts/macos/build-macos-installer.sh
./scripts/linux/build-linux-installer.sh
```

- Unix unpacked-package smoke-check commands:

```bash
./scripts/macos/test-macos-package-smoke.sh
./scripts/linux/test-linux-package-smoke.sh
```

- current Windows installer output:
  - `release/Cats-<version>-setup-x64.exe`
  - `release/Cats-<version>-setup-x64.exe.blockmap`
  - `release/win-unpacked/*`
- post-install smoke-check command:

```powershell
.\scripts\windows\Test-WindowsInstallerSmoke.ps1
```

- smoke-check defaults:
  - install root: `%LOCALAPPDATA%\Programs\Cats`
  - host state path: `%USERPROFILE%\.cats\desktop\state.json`
  - platform data path: `%USERPROFILE%\.cats\platform`
  - `CATS_DESKTOP_DIR` and `CATS_PLATFORM_DIR` override the corresponding data
    paths; `-HostStatePath` and `-PlatformDir` provide explicit smoke-test
    overrides
- smoke-check contract:
  - verify installed `Cats.exe`
  - verify bundled `cats` and `cats-runtime` sidecar assets
  - verify bundled packaged-setup assets, starting with the Windows npm prefix helper
  - verify the bundled Windows native CLI pack installer asset
  - verify the bundled Windows native Claude installer asset
  - verify the bundled Windows native Cursor installer asset
  - verify the bundled Windows native Goose installer asset
  - verify the bundled Windows native Junie installer asset
  - verify the bundled Windows WSL prerequisite preflight asset
  - verify the bundled Windows WSL substrate and Ubuntu installer asset
  - verify the bundled Windows native Kiro installer asset
  - verify the bundled Windows Docker Desktop installer asset
  - verify the bundled Windows setup readiness audit asset
  - verify packaged `desktop-package-plan.json` keeps the Windows NSIS target
  - launch the installed app and wait for the desktop-host state file to reach
    `ready_for_setup`, `ready_for_chat`, or `needs_prerequisites`
- packaging strategy in this slice:
  - keep Electron as the thin host around bundled `cats` + `cats-runtime`
    sidecars
  - stage deterministic target manifests for Windows, macOS, and Linux while
    wiring unsigned/test installer commands for all three host platforms while
    shipping a real Windows NSIS installer first
  - preserve the self-hosted npm path rather than replacing it
- installer/remediation contract in this slice:
  - verify bundled app assets
  - verify bundled `cats-runtime` sidecar slot
  - run the host-owned first-run provider scan during desktop bootstrap on
    Windows/macOS/Linux via the platform-specific readiness audit
  - expose a machine-readable `installer.providerSetup.helperCatalog` for the
    bundled platform-scoped setup assets
  - expose a machine-readable `installer.providerSetup.localProviders` rollout
    so the host can distinguish bundled local-provider paths from future
    add-on capability packs
  - map failures onto structured host state plus resumable remediation actions
  - keep the current first packaged native CLI path bounded to Claude Code,
    Cursor Agent, Goose, Junie, and Kiro across Windows/macOS/Linux
  - keep the current Windows-specific extensions bounded to the WSL-backed Kiro
    helper plus the Docker Desktop and Ollama local-model path
  - keep broader expert-only local-model helpers and future capability
    packs outside the current packaged baseline rather than silently missing
  - avoid any runtime shell-out to `environment-bootstrap` or
    `project-bootstrap`; both remain source knowledge only
- update-channel contract in this slice:
  - manual-check skeleton only
  - optional HTTPS manifest URL via env
  - download URLs must stay on the manifest host or an explicit allow-list
  - no auto-download or silent apply yet
- Windows packaging mode in this slice:
  - `electron-builder`
  - target: `nsis`
  - `oneClick: false`
  - installation directory selection enabled
  - executable signing/editing intentionally disabled for the current
    unsigned test-install path
- macOS packaging mode in this slice:
  - `electron-builder`
  - targets: `dmg`, `pkg`, `zip`
  - unsigned/test-package path only in the current slice
  - unpacked smoke validation available through `test-macos-package-smoke.sh`
- Linux packaging mode in this slice:
  - `electron-builder`
  - targets: `AppImage`, `deb`, `tar.gz`
  - unsigned/test-package path only in the current slice
  - unpacked smoke validation available through `test-linux-package-smoke.sh`

- platform wrappers:

```powershell
.\scripts\windows\Start-DesktopHost.ps1
```

```bash
./scripts/linux/start-desktop-host.sh
./scripts/macos/start-desktop-host.sh
```

- still intentionally out of scope for this slice:
  - full installer matrix
  - auto-update
  - privileged provider-install execution
- Tauri is not the current path because the desktop package still needs to
  supervise Node-based `cats` and `cats-runtime` sidecars
- Mobile is shipped as a separate React Native / Expo client per ADR-092 /
  SPEC-095 / PLAN-084. It is not bundled into the desktop installer — it
  ships through App Store and Play Store with EAS Build. Connectivity to
  the desktop cats follows the 2026-03-24 research note (Phase 1 cloud
  relay + push, Phase 2 tunnel / WebSocket relay direct, Phase 3 Tailscale
  for power users)

See
[ADR-003](./decisions/003-electron-host-manages-local-services.md)
for the planned desktop host model.

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CATS_HOST` | Yes | Host interface to bind (`CATS_INC_HOST` remains a compatibility alias) |
| `CATS_PORT` | Yes | Service port (`CATS_INC_PORT` remains a compatibility alias) |
| `CATS_PLATFORM_DIR` | No | Override the platform root used for `state/chat-state.local.json`, `state/platform-onboarding-history.json`, and `config/platform-preferences.json` |
| `CATS_DESKTOP_DIR` | No | Override the desktop root used for `state.json` and `logs/` |
| `CATS_RUNTIME_DIR` | No | Override the runtime root used for `config/`, `data/`, and `sessions/` |
| `CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG` | No | Override the provider capability bootstrap YAML path. Defaults to `<platform config dir>/provider-capability-bootstrap.yaml` |
| `CATS_RUNTIME_BASE_URL` | Yes | Upstream runtime URL |
| `CATS_RUNTIME_API_KEY` | No | Optional bearer token for `cats-runtime` |
| `CATS_RUNTIME_SESSION_CREATE_TIMEOUT_MS` | No | Timeout budget for runtime session creation and provider/workspace startup. Defaults to `60000`. |
| `CATS_RUNTIME_SESSION_CREATE_SLOW_WARNING_MS` | No | Threshold above which a successful session create still emits a `slow_session_create` diagnostic. Defaults to `max(2000, sessionCreateTimeoutMs / 6)` so the threshold tracks the configured budget. |
| `CATS_RUNTIME_MESSAGE_IDLE_TIMEOUT_MS` | No | Idle timeout for NDJSON message streams. Defaults to `120000` and resets whenever the runtime emits another chunk. Relies on `cats-runtime` keeping the stream warm during long tool waits — see ADR-089. |

Desktop-host specific overrides:

| Variable | Required | Description |
|----------|----------|-------------|
| `CATS_DESKTOP_APP_ENTRY` | No | Override built `cats` server entrypoint for the host |
| `CATS_DESKTOP_RUNTIME_ENTRY` | No | Override built `cats-runtime` entrypoint for the host |
| `CATS_DESKTOP_RUNTIME_ROOT` | No | Override sibling `cats-runtime/` root discovery |
| `CATS_DESKTOP_APP_PORT` | No | Override host-managed `cats` port |
| `CATS_DESKTOP_RUNTIME_PORT` | No | Override host-managed `cats-runtime` port |
| `CATS_DESKTOP_PACKAGING_OUTPUT_ROOT` | No | Override staged packaging output root |
| `CATS_DESKTOP_FORCE_QUIT_ON_CLOSE` | No | Escape hatch that forces quit-on-close and disables tray/background hiding |
| `CATS_DESKTOP_UPDATE_CHECK_ON_STARTUP` | No | Run one silent update check per launch. Defaults off, and has no effect unless the build already has update capability |

Finder- or LaunchServices-started packaged apps on macOS do not source your
interactive shell profile before the desktop host launches managed child
services. The desktop host preserves the inherited `PATH`, appends common
system and user bin directories, and on macOS/Linux also checks standard nvm
hints (`NVM_BIN`, `NVM_DIR`, and `~/.nvm/alias/default`) so npm-installed CLI
providers remain discoverable without requiring a login-shell bootstrap step.

### Provider Capability Bootstrap

Provider capability treatment is opt-in. At startup, Cats reads:

```text
<platform config dir>/provider-capability-bootstrap.yaml
```

or the path in `CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG`.

Unlisted provider/model/control targets start as `default` / `unknown`.
Provider catalog entries and runtime delivery richness do not grant
`strong_agent` or `weak_worker` treatment by themselves. Use
`Settings > Assistants > Provider capability bootstrap` to manage rules. The
same surface can install the bundled example, or an operator may copy
`config/provider-capability-bootstrap.yaml.example` (bundled at
`<platform package root>/config/` in dev and at
`<resources>/cats-platform/config/` in the packaged Electron host) to the active
config path for file-based administration.

Valid YAML rules use only:

- `initialTreatment: strong_agent` or `initialTreatment: weak_worker`
- `confidenceLevel: catalog_only`
- a non-empty `reason`

Rules using `initialTreatment: default`, `confidenceLevel: unknown`,
`evaluated`, or `observed` are invalid and fail closed. Duplicate rule ids also
fail the whole config closed because the id is part of the audit identity.

Settings validates the whole rule document before writing YAML, and rejects a
save if the file changed after the page loaded. A successful save requires a
Cats restart because the config is injected into dispatch adapters at host
composition time. Direct YAML editing remains supported; Settings and
`provider-capability-bootstrap-diagnostics.local.json` read the same parser and
diagnostic contract rather than creating a second source of truth.

### Secrets Management

- Keep `.env` local and uncommitted
- Never hardcode runtime API keys in source or docs

### Desktop Release Signing

Manual previews sign where credentials exist by default. To publish an explicitly
unsigned preview, pass `unsigned=true` to the `desktop-release.yml` workflow
dispatch along with the unused version tag and an exact `runtime_ref` commit.
This skips signing/notarization for that run; it does not alter repository secrets
or tag-triggered official releases. macOS unsigned previews require manual DMG
installation and cannot be used to validate self-update (ADR-117).

macOS is the constrained platform: Developer ID certificates are issued only by
Apple, so an official macOS build requires an Apple Developer Program
membership (USD 99/year; Individual enrollment is sufficient and needs no
D-U-N-S number). Notarization is included in the membership. Windows
certificates, by contrast, can be bought from any commercial CA.

Repository secrets an official macOS release reads:

- `CSC_LINK` — the Developer ID Application certificate exported as a `.p12`,
  base64-encoded (`base64 -i DeveloperID.p12 | pbcopy`).
- `CSC_KEY_PASSWORD` — the password set when exporting that `.p12`.
- `APPLE_API_KEY_P8_BASE64` — the App Store Connect API key (`AuthKey_*.p8`),
  base64-encoded. The workflow decodes it into `$RUNNER_TEMP` and exports
  `APPLE_API_KEY` as its path, because electron-builder reads that variable as
  a path to the key file rather than as the key itself.
- `APPLE_API_KEY_ID` — the key's 10-character ID.
- `APPLE_API_ISSUER` — the issuer UUID shown above the key list in App Store
  Connect.

An API key is used rather than `APPLE_ID` plus an app-specific password
because it is revocable on its own and survives an Apple ID password change,
which a stored CI secret has no way to notice.

Windows reads `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` the same way.

Per ADR-117, these credentials are scoped to the **platform** that can use
them, not to release identity, so a preview signs on any platform whose
certificate exists. The macOS certificate never reaches the Windows job, where
electron-builder would otherwise read a bare `CSC_LINK` as a Windows
certificate. A preview on a platform with no certificate degrades to an
unsigned artifact; only an official release refuses to build.

Local packaging still never touches the keychain. Pass `--sign` (or
`CATS_DESKTOP_SIGN_LOCAL=1`) to opt a local build into using an identity from
the OS keychain — it is an explicit request rather than an inference, because
a developer machine may hold unrelated certificates. `--sign` never submits
anything to Apple's notary service.

Every guarded build prints the trust it actually got, for example
`trust=signed and notarized` or
`trust=signed but NOT notarized (no App Store Connect API key)`. That middle
state is the dangerous one: it looks correct on the build machine and is
rejected on every other.

Missing credentials fail an official build instead of downgrading it:

- `resolveSigningProblems` in `scripts/build-desktop-installer.mjs` refuses an
  official macOS build unless both the certificate and the complete API key are
  present.
- electron-builder only *warns* when notarization credentials are absent, so
  without that gate a release would ship signed but un-notarized — which
  Gatekeeper rejects on every machine except the one that built it.

What the packaging configuration contributes:

- `build.mac.hardenedRuntime` is `true`. Notarization rejects an unhardened
  bundle, and electron-builder 26 hardens non-MAS builds unless explicitly told
  otherwise.
- `assets/build/entitlements.mac.plist` and its `.inherit` sibling are resolved
  by filename out of `buildResources`. They grant V8's JIT, let the native
  addons under `Resources/app-sidecar` and `Resources/cats-runtime` load, and
  keep microphone access working for composer voice input — under the hardened
  runtime `NSMicrophoneUsageDescription` alone no longer grants it.
- `build.mac.notarize` is `false`. The wrapper passes `-c.mac.notarize=true`
  only for a release build that has credentials, so a local package or an
  unsigned preview never waits on Apple.

**Existing unsigned macOS preview installs cannot self-update into the first
signed preview.** Squirrel.Mac requires a valid signature on the *running*
application before it will apply an update, so the unsigned-to-signed
transition is a discontinuity: those users download the next preview manually,
once. This applies only to that one transition.

The release workflow verifies the output rather than trusting the build:
`codesign --verify --deep --strict` on the bundle, an explicit `codesign`
check on `Resources/native/macos-stt/cats-stt-macos` (Mach-O files staged under
`Resources` are the ones most easily missed), `xcrun stapler validate` for the
ticket Gatekeeper reads offline, and `spctl --assess`.

## Monitoring

- **Logs**: stdout from the Node process
- **Health**: `GET /health`
- **Renderer**: served by the Node server after `npm run build`
- **Desktop host**: Electron bootstrap page plus child-process supervision
- **Desktop host state**: JSON snapshot at `<CATS_DESKTOP_DIR>/state.json`
  containing bootstrap phase, issues, remediation actions, progress steps,
  tray/background state, update status, and packaging metadata
- **Desktop security posture**: sandboxed preload bridge, validated host env
  overrides, validated host action ids, and HTTP/HTTPS-only host-controlled
  external URLs

## Troubleshooting

### Model picker keeps loading after a catalog-format upgrade

First read the running Runtime's `GET /providers/catalogs`. A healthy service with
`available: false` is a catalog configuration failure; vendor login and model
discovery cannot repair it. Runtime builds advertising `automaticSchema1Upgrade`
migrate recognized schema-1 overrides during startup/reload, with validation and
backup. Inspect `upgrade.state` and diagnostics in Setup & Repair, correct a blocked
cause, then use its retry action. Read-only host/picker code never performs migration.
For older installations without that capability, follow Runtime's
[backed-up conversion and reload procedure](../../cats-runtime/docs/provider-catalog-soft-patches.md#existing-schema-1-files-and-rollback)
using the package actually bundled in that installation and its exact profile.
Preserve local choices and obtain required authorization before modifying personal
files. Confirm both basic/advanced model responses and the mounted selector recover.

When a release changes this format, exercise an isolated previous-version profile
in addition to the clean-install gate. Passing build/asset checks and mentioning
migration in release notes are insufficient evidence of a working upgrade.

### Issue 1: Runtime dependency unavailable

**Symptoms**: `/health` returns `503`
**Solution**: Check `cats-runtime` first, then verify the required local CLI
providers and session directories are available to the runtime process.

### Issue 2: Container build does not match the current output layout

**Symptoms**: The Docker image fails to start or cannot find the built server
entrypoint.
**Solution**: Refresh the inherited container assets before using Docker as an
official deployment path.

### Issue 3: Desktop host stays on the bootstrap page instead of opening chat

**Symptoms**: The Electron host starts, but the window keeps showing
prerequisite guidance or provider issues.
**Solution**: Check the bootstrap actions first:

- `Open Runtime Diagnostics` shows the current `cats-runtime`
  diagnostics summary
- `Continue to Setup` opens `/setup` so an API baseline or local CLI path can
  be configured
- `Retry Scan` re-runs readiness and prerequisite checks after remediation

### Issue 4: Windows installer build succeeds but the app is unsigned

**Symptoms**: `npm run desktop:package:windows` produces a working NSIS
installer, but Windows still treats it as unsigned.
**Solution**: This is expected in the current slice. The installer is now real
and testable, but signing/editing is still disabled so the build can run
without the `winCodeSign` symlink issue and without release certificates.

### Issue 5: Desktop update controls are missing from Tray and Settings

**Symptoms**: A packaged build shows no `Check for Updates` action.
**Solution**: This is the expected state for anything other than an official
release build whose platform has passed its upgrade gate. The host resolves
update capability from the release descriptor embedded by the tag-gated
release workflow, and no environment variable can grant it. Development runs,
locally packaged builds, and npm/browser execution never show the controls.
Platforms are admitted to `DESKTOP_RELEASE_READY_PLATFORMS` one at a time as
their signed old-to-new upgrade test passes.

### Issue 5: The installer finishes, but you need a quick post-install verification

**Symptoms**: The NSIS installer completes, but you still need to confirm the
bundled sidecars and desktop-host bootstrap state are present on the installed
machine.
**Solution**: Run `.\scripts\windows\Test-WindowsInstallerSmoke.ps1`. Override
`-InstallRoot` or `-HostStatePath` if the app was installed outside the default
per-user path.

---

*Last updated: 2026-09-23*
