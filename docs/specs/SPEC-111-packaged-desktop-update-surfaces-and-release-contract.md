# SPEC-111: Packaged Desktop Update Surfaces and Release Contract

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | User |

## Summary

Official packaged Cats Desktop builds need one trustworthy update lifecycle that
users can enter from both the tray menu and `Settings > Desktop`. Development
Electron runs, unofficial packages, npm installs, and browser/self-hosted runs
must not show a working desktop-update action merely because they share the
same renderer.

This specification defines:

- distribution capability and UI visibility
- the host-to-renderer update contract
- manual check, download, and restart/install states
- Tray and Settings behavior
- version and GitHub Release rules
- the primary Windows, macOS, and Linux release artifacts
- signing, testing, and failure requirements

ADR-108 owns the architectural decision. PLAN-101 owns implementation
sequencing.

## Baseline When Proposed

This section records the state of the repository when this specification was
written. It is deliberately not updated as implementation lands; see
`Implementation Status` below for what is true now.

- The Electron main process can check a custom HTTPS JSON manifest and stores
  the result in the desktop host snapshot.
- The current state supports `disabled`, `idle`, `checking`, `up_to_date`,
  `update_available`, and `failed`.
- The current preload bridge has no update methods.
- The tray has product, Settings, and Quit commands but no update command.
- `Settings > Desktop` contains mobile pairing and startup behavior but no
  update section.
- The entire Desktop Settings route is hidden when the Electron bridge is
  absent, which currently keeps it out of npm/browser execution.
- CI runs for pushes and pull requests. npm publishing is a separate manual
  workflow. No desktop release workflow currently creates GitHub Release
  assets.
- The installer wrapper always passes `--publish never`, disables signing
  identity auto-discovery, and removes empty signing credential variables.
  Windows packaging separately sets `signAndEditExecutable: false`.
- The repository currently has no Git tags, so the first desktop release must
  establish a new version/tag baseline rather than assume one exists.
- The installer wrapper currently defaults both managed sidecars to the
  loose-file `split` layout. Existing Windows measurements found a substantial
  cold-start improvement when the platform sidecar was bundled.
- Windows currently uses an assisted NSIS installer with installation-directory
  changes enabled. `assets/build/installer.nsh` forces per-user installation
  through `customInstallMode`, so the install-mode page never appears and the
  installer never requests elevation.
- Desktop packaging currently produces more formats and architectures than
  the minimum public update matrix. The release contract needs one primary
  user-facing artifact per OS.

## Implementation Status

Current as of 2026-07-30. PLAN-101 holds the per-task detail.

Landed:

- The custom JSON manifest protocol is deleted. `desktop/host/updateManager.ts`
  owns the lifecycle over an injected adapter, and
  `desktop/host/updaterAdapter.ts` wraps `electron-updater`.
- Capability comes from the embedded release descriptor
  (`desktop/host/releaseDescriptor.ts`), never from the environment.
- The preload bridge exposes five bounded no-argument update commands, and
  every IPC handler validates the main-window sender.
- The tray shows a capability-gated update entry with localized labels.
- `desktop-release.yml` is tag-gated, builds on three native runners, collects
  into a draft, and publishes only after asset validation.
- Manual workflow dispatch builds a clearly named unsigned preview on the same
  three runners. It never reads signing secrets and its signatures are not
  verified, and the result is explicitly an unsigned GitHub prerelease that
  never becomes `latest`.

  The preview does embed a release descriptor, marked `kind: preview`, so the
  update client itself can be exercised before signing exists. That descriptor
  resolves to the `preview_packaged` distribution mode rather than
  `official_packaged`, and the tray and Settings label the build as a preview.
  The release-ready platform gate does not apply to a preview, because a
  preview is how that gate is earned. Requirement 1.9 still holds: the mode
  comes from build provenance the guarded workflow embeds, never from
  configuration.

  The operator supplies a `vX.Y.Z` equal to the current package version that
  does not already exist; the workflow creates that preview tag from the
  selected branch commit instead of requiring a tag push that would trigger
  the stable path.
- Update copy ships in English and Traditional Chinese.
- The `App updates` section component in `Settings > Desktop`
  (`src/app/renderer/settings/PlatformSettingsDesktopUpdates.tsx`), mounted
  first in the Desktop settings route. It shows version and channel for every
  desktop build and gates the update controls on `canCheck`, per section 4.

Not yet landed:

- Native up-to-date, available, and failed notifications.
- Phase 5 hardening and the Phase 6 real-machine upgrade matrix.

Gated off deliberately:

- `DESKTOP_RELEASE_READY_PLATFORMS` is empty, so no build advertises
  self-update yet. A platform is added only after its G3 upgrade test passes.

## Goals

1. Add `Check for Updates…` to the tray in official packaged builds.
2. Add an `App updates` section to `Settings > Desktop` in official packaged
   builds.
3. Keep desktop update controls absent from npm/browser execution.
4. Keep update controls absent from development and unofficial Electron builds.
5. Use one main-process update manager for all checks, downloads, progress, and
   install handoff.
6. Publish intentional, tag-versioned GitHub Releases instead of creating a
   user-facing version for each commit.
7. Support one primary desktop artifact on Windows, macOS, and Linux, plus
   updater metadata/support files.
8. Preserve sandboxing: the renderer may request bounded update actions but may
   not choose feeds, URLs, files, commands, or installer arguments.

## Non-Goals

- Updating npm installations from inside the Cats renderer.
- Showing an npm registry update badge or running `npm install` on the user's
  behalf.
- Adding `Check for Updates` to a Windows taskbar Jump List.
- Supporting silent unattended installation in Phase 1.
- Automatically downloading an update in Phase 1.
- Supporting downgrade or rollback through the updater.
- Supporting private GitHub repositories that require end-user GitHub tokens.
- Making DEB, PKG, tarball, Windows arm64, or Linux arm64 part of the Phase 1
  self-update matrix.
- Finalizing alpha/beta promotion and downgrade behavior.
- Treating unsigned development packages as official update clients.

## Distribution and Visibility Matrix

| Execution mode | Desktop route | App updates section | Update controls | Tray update command | Update owner |
|----------------|---------------|---------------------|-----------------|---------------------|--------------|
| Official packaged Electron | Visible | Visible | Visible | Visible | Electron main process |
| Unsigned preview from the release workflow | Visible | Visible, marked preview | Visible | Visible, marked preview | Electron main process |
| Electron development | Visible | Visible, version only | Hidden | Hidden | None |
| Unofficial/unsigned packaged Electron | Visible where otherwise supported | Visible, version only | Hidden | Hidden | Distributor/manual |
| npm, `npx`, or `cats-one` self-hosted execution | Hidden under current route policy | Hidden | Hidden | Not applicable | npm/deployment owner |
| Browser-only client | Hidden | Hidden | Hidden | Not applicable | Deployment owner |

The section and its controls are two separate decisions. Cats ships no About
box, so `Settings > Desktop` is the only surface where a user can read the
installed version, and withholding it from a build that merely cannot self-update
would leave that user unable to report which build they are running. The section
therefore appears for every desktop host that reports a snapshot, and shows the
installed version and channel unconditionally.

The **update controls** — status chip, last-checked time, available version,
download progress, and the action button — remain gated by the explicit update
capability (`canCheck`). A development or unofficial build therefore reads its
own version but is never offered an action it cannot perform.

If the Desktop route later becomes visible in a non-Electron environment, no
snapshot is reported, and the whole section stays absent.

## User Stories

- As a Cats Desktop user, I want to check for an update from the tray without
  finding the Settings page first.
- As a Cats Desktop user, I want Settings to show my current version, channel,
  update state, download progress, and next action.
- As a Cats Desktop user, I want both surfaces to agree when a check or download
  is already in progress.
- As an npm user, I do not want a desktop update button that could replace my
  package-managed installation with a native app.
- As a release operator, I want ordinary commits to run CI without generating a
  new product version or public release.
- As a release operator, I want all update metadata and binaries to originate
  from the same immutable version tag.

## Product Requirements

### 1. Capability Contract

The host shall expose a read-only update capability with this semantic shape:

```ts
interface DesktopUpdateCapability {
  distribution: 'official_packaged' | 'development' | 'unofficial_packaged';
  provider: 'github_release' | 'none';
  channel: 'stable' | 'beta' | 'alpha';
  currentVersion: string;
  canCheck: boolean;
  canDownload: boolean;
  canInstall: boolean;
  unavailableReason: string | null;
}
```

Requirements:

1. `canCheck` shall be true only for an official packaged build with a valid
   provider configuration.
2. `canDownload` and `canInstall` shall reflect platform/package support and
   release readiness, not merely `app.isPackaged`.
3. Official capability shall require an embedded release descriptor generated
   only by the tag-gated release workflow. Its version, commit, platform,
   channel, and provider identity shall match the running package.
4. Local packaging and normal CI shall not generate the official release
   descriptor.
5. The renderer shall not derive capability from user agent, hostname, OS, or
   preload-bridge presence.
6. Production renderer code shall have no method for changing the feed URL or
   provider.
7. The production update channel shall come from the embedded descriptor.
   Environment overrides shall not change an official package's channel.
8. Capability reasons may be logged or shown in development diagnostics but
   shall not expose signing secrets, tokens, or raw local paths.
9. No production or development environment variable shall turn
   `development` or `unofficial_packaged` into `official_packaged`.
   Automated UI tests shall inject capability fixtures, while real updater
   tests shall use a deliberately packaged prerelease.

### 2. Update Snapshot and State Machine

The host shall publish one serializable update snapshot with these statuses:

- `unavailable`
- `idle`
- `checking`
- `up_to_date`
- `update_available`
- `downloading`
- `downloaded`
- `installing`
- `failed`

The snapshot shall include:

- capability
- current version
- available version, when known
- release title or bounded release summary, when known
- last checked timestamp
- progress percent and byte counts while downloading
- a stable error code and safe user-facing summary on failure
- whether the next valid action is check, download, or restart/install

The snapshot shall not expose:

- GitHub credentials
- signing credentials
- arbitrary installer paths
- unrestricted download URLs for renderer navigation
- raw stack traces

Only one check or download may be active at a time. Repeated requests during an
active operation shall join the existing operation or return the current
snapshot; they shall not start parallel provider requests.

Required high-level transitions:

```text
capability unavailable ──resolve──> unavailable
capability valid ────────resolve──> idle
idle ──check──> checking ──current──> up_to_date
                         └─newer────> update_available
update_available ──download──> downloading ──complete──> downloaded
downloaded ──restart/install──> installing ──handoff/exit──> platform installer
platform installer ──success/next launch──> new version
any active state ──error──> failed ──check──> checking
```

`unavailable` is terminal for the current process because official
distribution identity is embedded at build time. It can become `idle` only
after launching a different package whose capability resolves as official.

### 3. Preload Bridge

The sandboxed preload bridge shall expose bounded methods equivalent to:

```ts
getUpdateSnapshot(): Promise<DesktopUpdateSnapshot>;
checkForUpdates(): Promise<DesktopUpdateSnapshot>;
downloadUpdate(): Promise<DesktopUpdateSnapshot>;
restartAndInstall(): Promise<void>;
onUpdateSnapshot(
  listener: (snapshot: DesktopUpdateSnapshot) => void,
): () => void;
```

Every main-process handler shall validate that the sender is the current Cats
main window. No method may accept a feed URL, filesystem destination, shell
command, executable path, or installer flags from the renderer.

### 4. Settings Surface

In any desktop build, `Settings > Desktop` shall render sections in this order:

1. `App updates`
2. `Mobile pairing`
3. `Startup behavior`

The existing relative order of Mobile pairing and Startup behavior is
preserved; adding updates shall not introduce an unrelated section reorder.

The `App updates` section shall always show, for every desktop build:

- current version
- current release channel

Cats has no About box, so these two facts have no other home; see the
Distribution and Visibility Matrix.

Where the capability contract reports `canCheck`, the section shall additionally
show:

- a persistent status chip
- last checked time when available
- available version and bounded release summary when available
- download progress while downloading
- exactly one primary next-action button

An unsigned preview build shall additionally carry a notice identifying it as
an unsigned preview.

Button/state mapping:

| State | Primary action |
|-------|----------------|
| `idle`, `up_to_date`, `failed` | `Check for Updates` |
| `checking` | disabled `Checking…` |
| `update_available` | `Download Update` |
| `downloading` | disabled progress state |
| `downloaded` | `Restart and Install` |
| `installing` | disabled `Installing…` |

On Windows, the current package is an assisted NSIS installer. Before invoking
restart/install, Settings shall explain that Cats will close and a Windows
installer will open. The host shall use the non-silent install path. The
installer may ask the user to confirm the installation directory:

- `oneClick: false` selects assisted installer behavior
- `allowToChangeInstallationDirectory: true` permits directory changes
- `perMachine: false` plus the `customInstallMode` hook in
  `assets/build/installer.nsh` forces per-user installation. The install-mode
  page is aborted before it draws, so no all-users option is presented and the
  update never requests elevation. Packaged provider setup helpers refuse to
  run elevated, so this behavior shall be preserved rather than relaxed for
  updates.

Because updates stay per-user, restart/install shall not be designed around an
elevation prompt or an admin-install branch.

A manual up-to-date result and mutation failures shall use the shared toast
system. Persistent state may remain visible in the status chip and update
facts; settings mutation feedback shall not be implemented as ad hoc inline
success/error text.

The update controls and the primary button shall be absent—not disabled—from
development and unofficial packaged modes, which still read their own version.
The whole section shall be absent from npm and browser modes, where no desktop
host reports a snapshot.

### 5. Tray Surface

In an official packaged build, the tray shall contain `Check for Updates…`
before Settings and Quit.

Requirements:

1. The item shall invoke the same main-process check used by Settings.
2. While checking, downloading, or installing, the item shall be disabled or
   replaced by a truthful progress label.
3. A manual up-to-date result shall produce a native notification when
   available.
4. An available-update result shall produce a native notification. Activating
   it shall open the main window at `Settings > Desktop`.
5. If native notifications are unavailable, a tray-originated result shall
   open the main window at `Settings > Desktop` so the action always has
   visible feedback.
6. A tray check shall not create a second update manager or a second provider
   request path.

### 6. Startup Check Policy

Phase 1 shall ship manual checks with automatic download disabled.
The updater shall also set automatic install-on-normal-quit to false. A
downloaded update shall install only after the explicit restart/install action.

The existing startup-check capability may remain configurable for test and
staged rollout, but it shall default off for public builds until signed
old-version-to-new-version upgrade tests pass on Windows, macOS, and Linux.

When later enabled:

- run at most once per process launch
- wait until desktop bootstrap reaches a non-blocking ready state
- remain silent when current
- never automatically install
- share state and concurrency control with manual checks

### 7. Version and Release Contract

1. Push and pull-request CI shall not modify versions or publish releases.
2. A release change shall update both `package.json` and `package-lock.json`.
3. A stable release tag shall use `vMAJOR.MINOR.PATCH`.
4. Before the first desktop release, release preparation shall verify that the
   repository has no conflicting tag, re-query published npm versions, and
   select a new unused version.
5. The first desktop release shall create its tag from the reviewed release
   commit. It shall not retroactively apply an older npm version tag to the
   current head.
6. The tag version shall exactly equal the package version.
7. A tag mismatch shall fail before expensive platform builds begin.
8. The GitHub Release shall be created as a draft while assets are collected.
9. The release shall be published only after all required platform jobs and
   metadata checks succeed.
10. A failed platform job shall leave no partially published latest stable
    release.
11. Release artifacts shall be immutable for a published version. A correction
    requires a higher version.
12. npm publishing shall remain an independent workflow and shall not cause
    Electron clients to self-update unless the matching desktop release is
    intentionally published.
13. The release workflow shall embed a non-secret official release descriptor
    in each platform package. The descriptor shall identify the tag version,
    source commit, platform, stable channel, and GitHub provider.
14. Manual workflow-dispatch validation shall use an unsigned, unofficial
    preview path until signing is configured. It shall run the three-platform
    draft, packaging, asset-validation, and publication stages, but shall not
    embed the official descriptor, access signing secrets, become `latest`, or
    advertise desktop update capability. The preview shall be published as a
    GitHub prerelease. The workflow shall create its unused preview tag from
    the selected workflow branch commit so testing does not first trigger the
    signed stable tag path.
15. Publishing an unsigned preview consumes that version/tag for test purposes.
    A later signed stable release shall use a higher version rather than
    replacing the preview artifacts in place.

### 8. Required Release Assets

One public release shall contain:

- Windows x64 NSIS installer built with `--sidecar-layout bundle`
- macOS universal DMG
- macOS universal ZIP required by the updater
- Linux x64 AppImage
- generated Windows, macOS, and Linux update metadata
- any differential-update files generated and referenced by that metadata
- checksums or provenance output required by the release workflow

The release UI shall identify NSIS, DMG, and AppImage as the primary choices.
Updater-only metadata and the macOS ZIP may remain attached without being
presented as additional user installation choices.

The official Windows release workflow shall pass the sidecar layout explicitly;
it shall not depend on the installer's current `split` default. The bundle
selection applies to both `cats-platform` and `cats-runtime`.

### 9. Security and Trust

1. Stable Windows and macOS self-update shall not be enabled until their
   signing configuration is available and validated.
2. macOS update testing shall use a signed application.
3. Release jobs shall use least-privilege GitHub permissions.
4. Signing credentials shall remain in protected GitHub secrets and shall not
   be exposed to pull-request workflows from untrusted forks.
5. Update metadata and artifacts shall be generated in the same release run.
6. The production app shall use HTTPS and the configured GitHub provider; it
   shall not accept renderer-supplied mirrors.
7. Release notes rendered in Settings shall be treated as untrusted text and
   shall not execute HTML or open arbitrary links without the existing safe
   external-navigation policy.
8. Unsigned preview artifacts shall use `unsigned-preview` Actions artifact
   names and publish only in a GitHub prerelease. They shall not be promoted
   into the stable GitHub Release update feed.

### 10. Failure and Recovery

- Offline, timeout, provider, metadata, checksum, signature, and unsupported
  package failures shall map to stable error codes and localized safe copy.
- A failed check shall leave the running application usable.
- A failed download shall retain the current installed application and permit
  retry.
- The app shall not quit for install until the updater reports the download as
  complete and the user explicitly chooses restart/install.
- On Windows, restart/install shall hand off to the visible assisted NSIS
  wizard. App exit does not mean installation succeeded; success is confirmed
  by the installer and by the next launch reporting the new version.
- A Windows upgrade runs the previous uninstaller silently before installing.
  `assets/build/installer.nsh` only removes `%APPDATA%\Cats` and
  `%USERPROFILE%\.cats` when the user explicitly opts in on the uninstall page,
  so an update shall preserve Electron UI state and Cats runtime/platform
  state. Any change to that macro shall be treated as an update-path
  regression.
- If restart/install fails before process exit, the app shall return to a
  recoverable failed or downloaded state.
- If the platform installer fails after Cats exits, it shall leave the
  previously installed version recoverable and shall not report the new
  version on the next launch.
- The updater shall log technical diagnostics to the desktop host log without
  placing secrets or tokens in the log.

## Localization Requirements

All new Settings, tray, notification, button, status, and error copy shall ship
in English and Traditional Chinese through the shared i18n catalogs.

Release notes supplied by GitHub are external content and are not required to
be translated.

## Acceptance Criteria

1. A packaged official build shows update controls in Tray and
   `Settings > Desktop`.
2. An npm/browser run shows no `App updates` section at all.
3. An Electron development run shows its installed version and channel but no
   update control.
4. Triggering a check from Tray updates an already-open Settings surface
   without a second request.
5. Triggering a check from Settings updates the tray state.
6. Up-to-date, available, download-progress, downloaded, failed, and
   restart/install states are covered by automated tests.
7. An old signed Windows install upgrades to the tagged Windows release.
   The test shall cover the visible assisted installer, retained install
   location, the absence of an install-mode page, and that no elevation prompt
   appears.
8. An old signed macOS install upgrades to the tagged macOS release.
9. An old Linux AppImage upgrades to the tagged Linux release.
10. A normal commit runs CI without changing the package version or creating a
    GitHub Release.
11. A mismatched `vX.Y.Z` tag fails the release workflow.
12. A release is not published if any required artifact or metadata file is
    missing.
13. The first desktop release uses a new registry-safe version and establishes
    the repository's first matching version tag without retroactively tagging
    an older npm release.
14. A manual unsigned preview completes Windows, macOS, and Linux packaging
    plus asset validation without Windows or Apple signing credentials, while
    producing no official release descriptor and publishing only a GitHub
    prerelease that is not `latest`.

## Dependencies

- ADR-108 approval
- `electron-updater` compatible with the repository's electron-builder version
- public GitHub Releases for `cats-inc/cats-platform`
- Windows code-signing setup
- Apple Developer ID signing/notarization setup
- GitHub Actions runners for Windows, macOS, and Linux
- existing desktop host, preload, tray, Settings, notification, toast, and
  localization foundations
- a release-capable path through the current desktop installer wrapper and
  Windows signing configuration

## Open Questions

- [ ] Which Windows certificate source and Apple signing/notarization account
      will be used for stable releases?
- [ ] Should startup checks become default-on immediately after the three-OS
      upgrade gate passes, or wait for a later release?
- [ ] When prerelease channels are enabled, should users choose a channel in
      Settings or should channels remain build-specific?
- [ ] Is the existing unsigned `0.1.1` Windows installer strictly an internal
      test artifact, or is there a supported installed user base? If it is
      internal only, the first signed prerelease becomes upgrade baseline N.
      If it was distributed, decide and validate whether unsigned-to-signed
      automatic upgrade is supported or require one documented manual
      reinstall.

## References

- [ADR-108: Host-Owned GitHub Release Updates](../decisions/108-use-host-owned-github-release-updates-for-official-desktop-builds.md)
- [PLAN-101: Packaged Desktop Update Rollout](../plans/PLAN-101-packaged-desktop-update-rollout.md)
- [SPEC-023: Packaged Setup Wizard and Provider Installation](./SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-073: Settings Composition Layer](./SPEC-073-settings-composition-layer.md)
- [Electron/GitHub release update research](../research/2026-07-28-electron-github-release-update-contract.md)
- [Packaged desktop cold-start investigation](../research/2026-04-16-packaged-desktop-cold-start-investigation.md)

---

*Created: 2026-07-28*
*Author: User, with Codex support*
*Related Plan: [PLAN-101](../plans/PLAN-101-packaged-desktop-update-rollout.md)*
