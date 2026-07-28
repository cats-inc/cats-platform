# ADR-108: Use Host-Owned GitHub Release Updates for Official Desktop Builds

> Give official packaged Electron builds one main-process update authority and
> one GitHub Release source, while leaving npm-installed Cats updates to npm.

## Status

Proposed

## Context

Cats has two intentionally different distribution paths:

- an Electron desktop product for users who install a native application
- an npm/self-hosted product for technical users and server-style deployments

The desktop host already contains a partial update foundation:

- a main-process HTTPS JSON manifest checker
- stable, beta, and alpha channel values
- update state in the desktop host snapshot
- an optional startup check

That foundation does not yet expose a manual check command through the preload
bridge, does not put an update command in the tray, does not render an update
section in Settings, and cannot download or install a platform-native update.
The current GitHub Actions workflows run CI and manually publish npm packages;
they do not produce a tag-gated desktop release.

The current desktop packaging entrypoint is intentionally test-oriented. It:

- always invokes electron-builder with `--publish never`
- forces code-signing identity auto-discovery off
- discards empty signing credential variables

The Windows builder configuration also sets `signAndEditExecutable: false`.
A release workflow cannot become functional by adding a publish provider
alone; it needs an explicit release mode that removes those test-build
interlocks while leaving local packaging safe by default.

The same packaging entrypoint defaults both managed sidecars to the `split`
layout. Existing Windows cold-start evidence shows that the loose-file layout
can impose a very large pre-JavaScript startup cost and that bundling
`cats-platform` nearly eliminated the measured platform delay. The exact
Windows scanning component is not yet proven, but an official Windows release
must not silently inherit the test-oriented `split` default.

The renderer currently hides the complete `Settings > Desktop` route when the
Electron preload bridge is absent. This correctly keeps desktop-only controls
out of the npm/browser product, but bridge presence alone is not sufficient:
the bridge also exists in Electron development runs and may exist in unofficial
or unsigned packages that must not claim a working update feed.

The project needs to decide:

1. which process owns update checks, downloads, and installation
2. which release source is authoritative
3. which execution modes expose update controls
4. how Tray and Settings share state without duplicating update logic
5. how releases receive versions without assigning a new version to every
   commit
6. which artifact is the primary desktop update target on each OS

## Decision

### 1. The Electron main process owns the desktop update lifecycle

All update provider access, version comparison, downloads, signature checks,
installer handoff, and restart/install actions will run in the Electron main
process.

The renderer and tray are presentation surfaces over one host-owned update
manager. Neither surface may fetch release metadata, compare versions, download
artifacts, or invoke installers independently.

The preload bridge will expose a bounded command/snapshot contract:

- read update capability and current state
- request a manual check
- request a download
- request restart-and-install after download
- subscribe to update-state changes

### 2. Official packaged builds use `electron-updater` with GitHub Releases

Official Cats Desktop builds will use `electron-updater` with the public
`cats-inc/cats-platform` GitHub Releases feed.

The existing custom JSON manifest checker is a useful prototype, but it will
not become a second production update protocol. It will be replaced by an
adapter around `electron-updater` and its generated platform metadata for
official packaged builds.

This gives the host one provider contract for:

- Windows NSIS updates
- signed macOS updates
- Linux AppImage updates
- download progress
- release metadata
- checksum and platform-specific update handling

### 3. Update UI is capability-gated, not environment-guessed

The main process will publish an explicit capability derived from packaging and
release configuration. At minimum it distinguishes:

- `official_packaged`: self-update commands may be exposed
- `development`: self-update commands are unavailable
- `unofficial_packaged`: self-update commands are unavailable

`app.isPackaged` is necessary but not sufficient. An official feed
configuration and the release/signing prerequisites for the current platform
must also be present. The tag-gated workflow will embed a non-secret official
release descriptor containing the version, commit, platform, channel, and
provider identity. The main process will require that descriptor to match the
running package before advertising self-update. Local packaging commands will
not generate it.

The renderer must not infer this capability from user agent, hostname,
operating system, or generic preload-bridge presence.

The production channel comes from the embedded release descriptor.
Environment overrides may not enable self-update or change the update channel
of an official production package. Development testing uses injected adapter
fixtures or a deliberately packaged prerelease; it does not add a fourth
runtime distribution mode.

The npm/browser path has no Electron update capability and therefore renders no
`Check for Updates` button or desktop update section. npm users update through
their package manager. They may still see an application version in a future
About surface, but not a binary self-update action.

### 4. Tray and Settings share one update state machine

Official packaged builds expose manual update checks in both locations:

- the Electron tray menu contains `Check for Updates…`
- `Settings > Desktop` contains an `App updates` section above startup and
  mobile-pairing controls

Both commands call the same main-process method. The Settings surface is the
durable detail surface for current version, channel, status, progress, and the
next action. Tray-originated results use a native notification when available;
an available update can bring the user to `Settings > Desktop`.

A Windows taskbar Jump List is not an update surface in this decision. The
requested shell surface is the notification-area tray menu.

### 5. Releases, not commits, assign product versions

Normal commits and normal CI runs do not change `package.json` version and do
not publish a desktop release.

An intentional release consists of:

1. a release change that updates `package.json` and `package-lock.json`
2. a matching immutable Git tag, such as `v0.2.0`
3. a tag-gated GitHub Actions desktop release workflow
4. a GitHub Release whose assets and update metadata all come from that tag

The workflow must reject a tag whose version does not exactly match the package
version. Stable releases use `vMAJOR.MINOR.PATCH`. Prerelease channel publishing
is deferred until its promotion and downgrade rules are specified.

The repository currently has no Git tags. The first desktop release must
therefore establish, rather than assume, the tag baseline. Release preparation
will re-check npm registry versions, choose a new unused version, and create
the first tag only from the reviewed release commit. It must not retroactively
attach an old npm version tag to the current repository head.

### 6. Each OS has one primary user-facing desktop artifact

The target public desktop release set is:

| Platform | Primary user-facing artifact | Updater support assets |
|----------|------------------------------|------------------------|
| Windows | x64 NSIS installer | generated update metadata and any builder-required differential assets |
| macOS | universal DMG | universal ZIP plus generated macOS update metadata |
| Linux | x64 AppImage | generated Linux update metadata |

The official Windows release job will explicitly pass
`--sidecar-layout bundle`, which applies to both `cats-platform` and
`cats-runtime`. The `split|bundle` switch remains available for controlled
cold-start comparisons and for platform-specific packaging decisions outside
the Windows release job.

The macOS ZIP is an updater support artifact, not a second installer choice the
release page needs to advertise prominently.

If accepted, this amends ADR-044 for the GitHub desktop release target:
Windows remains the first validation platform, but a complete cross-platform
public desktop release contains the three primary artifacts above.

### 7. Download and installation remain user-controlled

Manual checks are required. Automatic download and automatic installation are
disabled by default.

On Windows, Phase 1 keeps the existing assisted NSIS behavior:

- `oneClick: false` presents an installer wizard
- `allowToChangeInstallationDirectory: true` allows installation-directory
  confirmation or changes
- `perMachine: false` presents an install-mode choice rather than forcing
  per-user installation; per-user is the default selection, while a
  per-machine choice may still require elevation

`Restart and Install` therefore hands off to a visible Windows installer; it is
not a promise of a silent replacement. The update manager must call the
non-silent install path and must disable electron-updater's default
install-on-normal-quit behavior so only the explicit action installs the
downloaded update.

Startup checks may be enabled later through the same update manager after
signed old-version-to-new-version upgrades have passed on all supported
platforms. A startup check must remain silent when the application is current
and must never imply automatic installation.

## Consequences

### Positive

- Tray and Settings cannot drift because they consume one host-owned state.
- npm users do not receive a misleading desktop updater.
- official, development, and unofficial packaged builds have truthful
  capabilities.
- release versions advance intentionally instead of on every commit.
- GitHub Release assets and updater metadata are generated together from one
  tag.
- platform-native update behavior is delegated to the packaging tool already
  used by the project.

### Negative

- `electron-updater` becomes an application dependency.
- Windows and macOS signing become release gates before self-update can be
  advertised as production-ready.
- a real three-OS release workflow and installed-app upgrade matrix are needed.
- macOS requires a ZIP support artifact in addition to the user-facing DMG.

### Neutral

- npm publishing remains a separate, manually triggered workflow.
- the existing alpha/beta/stable contract may remain in types, but Phase 1
  publishes stable desktop updates only.
- the current custom manifest tests will be replaced rather than maintained as
  a second production protocol.
- alternative Linux packages may still be attached to a release later, but
  Phase 1 self-update is defined only for AppImage.

## Alternatives Considered

### Alternative 1: Extend the custom JSON manifest checker

- **Pros**: keeps the current manifest shape and avoids a new runtime
  dependency
- **Cons**: Cats would need to implement platform installer selection,
  differential downloads, signature integration, progress, and restart/apply
  behavior
- **Why rejected**: it duplicates mature platform-specific behavior and
  creates a second metadata format beside electron-builder output

### Alternative 2: Let Tray and Settings query GitHub independently

- **Pros**: each UI surface could be implemented quickly
- **Cons**: duplicated network traffic, divergent state, renderer network
  authority, and race conditions between checks
- **Why rejected**: update authority belongs in the sandboxed desktop host
  boundary

### Alternative 3: Expose `Check for Updates` in every distribution

- **Pros**: superficially consistent UI
- **Cons**: npm installs cannot safely replace themselves with Electron
  binaries and may be managed globally, locally, by `npx`, or by a deployment
  system
- **Why rejected**: the installation source owns the update mechanism

### Alternative 4: Publish a desktop version on every commit

- **Pros**: every commit is directly installable
- **Cons**: noisy user-facing versions, unstable latest-release semantics,
  excessive artifact storage, and no deliberate release gate
- **Why rejected**: CI build identity and product release identity are
  different concerns

## References

- [ADR-003: Electron host manages local services](./003-electron-host-manages-local-services.md)
- [ADR-013: Ship Cats as an executable self-hosted npm app](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [ADR-044: Windows x64 Electron plus self-hosted npm](./044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy.md)
- [ADR-052: Canonical platform Settings routes](./052-use-canonical-platform-settings-routes-inside-product-shells.md)
- [SPEC-111: Packaged Desktop Update Surfaces and Release Contract](../specs/SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
- [PLAN-101: Packaged Desktop Update Rollout](../plans/PLAN-101-packaged-desktop-update-rollout.md)
- [Electron/GitHub release update research](../research/2026-07-28-electron-github-release-update-contract.md)
- [Packaged desktop cold-start investigation](../research/2026-04-16-packaged-desktop-cold-start-investigation.md)

---

*Decision proposed: 2026-07-28*
*Decision makers: User, with Codex support*
