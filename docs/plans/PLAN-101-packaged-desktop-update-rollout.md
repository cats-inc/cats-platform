# PLAN-101: Packaged Desktop Update Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | User |

## Related Spec

[SPEC-111: Packaged Desktop Update Surfaces and Release Contract](../specs/SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)

## Related Decision

[ADR-108: Use Host-Owned GitHub Release Updates for Official Desktop Builds](../decisions/108-use-host-owned-github-release-updates-for-official-desktop-builds.md)

## Overview

Replace the existing check-only JSON manifest prototype with one
main-process `electron-updater` manager, expose bounded commands through the
sandboxed preload bridge, add capability-gated update controls to Tray and
`Settings > Desktop`, and create an intentional tag-gated GitHub Release
workflow.

The update UI must remain hidden until the current platform's official
old-version-to-new-version upgrade path has passed. npm/browser execution stays
package-manager-owned and receives no desktop update action.

## Delivery Gates

| Gate | Required evidence | Effect |
|------|-------------------|--------|
| G0: Contract approved | ADR-108 and SPEC-111 approved | implementation may begin |
| G1: Release identity | tag/package version guard and draft release workflow | artifacts are traceable to one version |
| G2: Check contract | manager, IPC, bridge, Tray, and Settings automated tests | manual check UX may be reviewed |
| G3: Signed platform upgrade | real old-to-new upgrade passes on the platform | update capability may be enabled for that platform |
| G4: Three-OS release | Windows, macOS, Linux artifacts and metadata pass | GitHub Release may be published as complete |
| G5: Startup checks | repeated-launch/rate/concurrency validation | startup check may be enabled separately |

## Implementation Phases

### Phase 0: Approve Trust, Version, and Release Inputs

- [ ] Approve ADR-108 and SPEC-111.
- [ ] Confirm the public GitHub owner/repository used by the updater.
- [ ] Confirm stable-only Phase 1 release channels.
- [ ] Inventory repository tags and re-query published
      `@cats-inc/cats-platform` npm versions immediately before selecting the
      first desktop release version.
- [ ] Choose a new unused first desktop version; do not retroactively tag the
      current head as an older npm release.
- [ ] Classify the existing unsigned `0.1.1` Windows installer as either an
      internal test artifact or a supported installed baseline. If supported,
      require an unsigned-to-signed migration decision before G3.
- [ ] Select the Windows signing certificate source.
- [ ] Configure Apple Developer ID signing and notarization ownership.
- [ ] Confirm the primary release targets:
      - Windows x64 NSIS
      - macOS universal DMG plus updater ZIP
      - Linux x64 AppImage
- [ ] Confirm `--sidecar-layout bundle` as the explicit official Windows
      release layout for both managed sidecars; retain the switch for
      controlled A/B diagnostics.
- [ ] Confirm that Phase 1 preserves the current assisted Windows installer
      UX, including install-mode and directory confirmation.
- [ ] Decide whether GitHub immutable releases will be enabled; in either case,
      require draft-first asset collection.
- [ ] Record secret names and protected GitHub Environment policy without
      placing secret values in repository docs.

**Deliverables**: approved trust boundary, new first-version/tag baseline,
unsigned-install classification, stable release target, signing owners, and
protected release environment.

### Phase 1: Establish Intentional Versioned Desktop Releases

- [x] Add a tag/version validation script that requires `vX.Y.Z` to match both
      package files.
- [x] Add an explicit release mode to the desktop installer wrapper. Keep its
      local default at `--publish never`, but allow the tag-gated workflow to
      select the bounded electron-builder publish mode required for a draft
      GitHub Release.
- [x] Split signing environment behavior by build mode:
      - local/test mode keeps signing identity auto-discovery disabled
      - release mode preserves validated Windows/macOS signing variables and
        permits signing identity discovery as required by the selected setup
- [x] Replace or override `signAndEditExecutable: false` for signed Windows
      release builds without weakening the unsigned local/test path.
- [x] Add tests for installer-wrapper publish arguments, signing environment
      preservation, and rejection of release mode outside the expected
      tag-gated inputs.
- [ ] Generate a non-secret official release descriptor containing version,
      source commit, platform, channel, and provider identity only in the
      tag-gated workflow.
- [ ] Keep the descriptor absent from local package commands and normal CI.
- [ ] Add a desktop release workflow triggered by stable version tags and a
      bounded manual dry-run mode.
- [ ] Keep normal push/pull-request CI non-publishing.
- [ ] Build on native Windows, macOS, and Linux runners.
- [ ] Make the Windows release job pass `--sidecar-layout bundle` explicitly
      instead of inheriting the wrapper's `split` default.
- [ ] Configure electron-builder's GitHub publish provider.
- [ ] Limit the release matrix to the primary artifacts and builder-required
      update support files.
- [ ] Generate Windows, macOS, and Linux update metadata in the same build run
      as their artifacts.
- [ ] Upload artifacts into a draft GitHub Release.
- [ ] Add a release-asset validation job that verifies every referenced file
      exists before publication.
- [ ] Publish the release only after all required jobs succeed.
- [ ] Create the repository's first version tag only after the reviewed release
      commit and all pre-tag validation are ready; confirm GitHub will select
      the intended release as latest.
- [ ] Keep the existing npm publish workflow independent.

**Deliverables**: a tag-gated draft-first desktop release pipeline that does
not create versions or releases for ordinary commits.

### Phase 2: Replace the Manifest Prototype with a Host-Owned Update Manager

- [ ] Add `electron-updater` as an application dependency.
- [ ] Introduce a small updater adapter so tests can use a fake provider rather
      than live GitHub requests.
- [ ] Replace custom JSON-manifest comparison with electron-updater events and
      generated release metadata.
- [ ] Extend update contracts with explicit capability, progress, safe error,
      and next-action fields.
- [ ] Resolve official capability from `app.isPackaged`, updater
      configuration, and a matching embedded release descriptor; do not trust
      generic bridge presence.
- [ ] Keep the production channel pinned to the embedded descriptor rather
      than environment overrides.
- [ ] Reject any environment override that attempts to turn a development or
      unofficial package into an official update client.
- [ ] Implement the required state machine and concurrency guard.
- [ ] Keep automatic download disabled.
- [ ] Set electron-updater's install-on-normal-quit behavior to false so a
      downloaded update waits for the explicit restart/install action.
- [ ] Persist only durable, useful update facts; do not restore an in-progress
      download/install state after process restart.
- [ ] Map provider errors to stable error codes and safe localized summaries.
- [ ] Send technical diagnostics to desktop logs with secret redaction.
- [ ] Remove obsolete custom manifest environment variables, docs, and tests
      once the replacement is complete.

**Deliverables**: one testable main-process update manager with no renderer
network or installer authority.

### Phase 3: Add Bounded IPC and Preload Capabilities

- [ ] Add IPC channel constants for snapshot, check, download, install, and
      update events.
- [ ] Validate that every update IPC call originates from the current main
      window.
- [ ] Expose only bounded no-argument update commands in the preload bridge.
- [ ] Add the update capability and snapshot types to the browser-safe desktop
      bridge module.
- [ ] Ensure no bridge method accepts provider URLs, paths, commands, or
      installer flags.
- [ ] Make event unsubscription deterministic when the renderer unmounts.
- [ ] Preserve preload sandbox safety and keep channel literals covered by
      drift tests.

**Deliverables**: sandbox-safe host/renderer update contract with explicit
capability gating.

### Phase 4: Add Settings and Tray Update Surfaces

- [ ] Rename or broaden the current Desktop Settings component so its ownership
      is not limited to startup preferences.
- [ ] Add the `App updates` section before Mobile pairing and Startup behavior.
- [ ] Preserve the existing relative order of Mobile pairing before Startup
      behavior.
- [ ] Render the section only when `capability.canCheck` is true.
- [ ] Implement the status chip, version/channel facts, last-check time,
      available release summary, progress, and one primary next-action button.
- [ ] Use the shared toast system for manual up-to-date results and failures.
- [ ] Add English and Traditional Chinese strings through shared i18n catalogs.
- [ ] Add `Check for Updates…` to the tray before Settings and Quit.
- [ ] Disable or relabel the tray item during active update operations.
- [ ] Add native up-to-date, available, and failed notifications.
- [ ] Route available-update notification activation to `Settings > Desktop`.
- [ ] Fall back to opening `Settings > Desktop` when native notifications are
      unavailable.
- [ ] Confirm npm/browser and Electron development renders contain no update
      button.

**Deliverables**: synchronized, localized Tray and Settings update UX for
official packaged builds only.

### Phase 5: Harden Download, Restart, and Failure Recovery

- [ ] Wire explicit user-controlled download.
- [ ] Wire restart-and-install only after the updater reports `downloaded`.
- [ ] On Windows, call the non-silent install path and explain before exit that
      the assisted NSIS installer will open.
- [ ] Validate the current Windows installer choices:
      - `oneClick: false` opens the assisted wizard
      - installation-directory changes remain available
      - `perMachine: false` shows an install-mode choice that defaults to
        per-user but may still elevate for per-machine
- [ ] Guard against duplicate checks, duplicate downloads, and install requests
      in invalid states.
- [ ] Confirm closing/hiding-to-tray behavior does not interrupt a download
      without truthful state.
- [ ] Confirm Quit remains explicit and does not silently install an update.
- [ ] Confirm restart-and-install shuts down managed sidecars cleanly before
      updater handoff.
- [ ] Preserve the existing shutdown/tray lock against repeated interaction.
- [ ] Test offline, timeout, missing metadata, checksum, signature, unsupported
      package, cancelled download, and install-handoff failures.
- [ ] Keep the current application usable after check/download failure.

**Deliverables**: recoverable user-controlled download and install lifecycle
that cooperates with desktop sidecar shutdown.

### Phase 6: Validate Real Upgrade Paths

- [ ] Publish a non-public or prerelease test pair for version N and N+1.
- [ ] Windows:
      - install signed N via NSIS
      - check from Settings
      - check from Tray
      - download, restart/install, and verify N+1
- [ ] macOS:
      - install signed/notarized N
      - verify DMG plus ZIP metadata pairing
      - update to N+1 and verify signature/notarization
- [ ] Linux:
      - launch N as AppImage with the expected AppImage environment
      - update to N+1 and verify the resulting executable
- [ ] Verify Settings and Tray stay synchronized on all platforms.
- [ ] Verify npm, `npx`, `cats-one`, browser, and Electron development runs
      contain no desktop update action.
- [ ] Verify a tag/package version mismatch fails before packaging.
- [ ] Verify a missing required asset leaves the GitHub Release unpublished.
- [ ] If Phase 0 identifies a real unsigned `0.1.1` install base, test its
      agreed migration path to signed N. Otherwise record that it was an
      internal test artifact and start supported upgrade validation at signed N.
- [ ] Save only non-secret validation evidence in a dated research/validation
      note.

**Deliverables**: platform-by-platform old-to-new upgrade evidence and a clear
go/no-go decision for each capability.

### Phase 7: Documentation and Optional Startup Check

- [ ] Update setup and deployment guides for GitHub Release updates.
- [ ] Remove documentation for the retired custom JSON manifest protocol.
- [ ] Document the release operator flow: release version change, tag, draft
      assets, validation, publish.
- [ ] Document that npm/self-hosted users update through their package manager.
- [ ] Document primary versus updater-only GitHub Release assets.
- [ ] Update architecture and release notes with the host-owned update boundary.
- [ ] After G3 passes on every supported platform, decide whether to enable one
      startup check per process launch.
- [ ] If enabled, verify it waits for bootstrap readiness, remains silent when
      current, never auto-downloads, and shares the manual-operation lock.

**Deliverables**: operator/user documentation and an independently gated
startup-check policy.

## Files to Create or Modify

| Area | Expected action | Purpose |
|------|-----------------|---------|
| `package.json`, `package-lock.json` | Modify | application dependency, publish provider, primary targets |
| `.github/workflows/desktop-release.yml` | Create | tag-gated native release matrix and draft publication |
| `scripts/build-desktop-installer.mjs` | Modify | separate safe local packaging from publish/sign-capable release mode |
| `scripts/validate-release-version.mjs` | Create | tag/package version guard |
| `scripts/generate-desktop-release-descriptor.mjs` | Create | emit tag/commit/platform/channel/provider provenance for release packages |
| `desktop/host/releaseDescriptor.ts` | Create | validate embedded descriptor and resolve official capability |
| `desktop/host/update.ts` | Replace/refactor | electron-updater adapter and state manager |
| `desktop/host/contracts.ts` | Modify | capability, progress, error, and command contracts |
| `desktop/host/main.ts` | Modify | updater lifecycle, IPC, notifications, clean install handoff |
| `desktop/host/preload.cts` | Modify | bounded update bridge |
| `desktop/host/tray.ts` | Modify | update command rendering and interaction |
| `desktop/host/trayMenu.ts` | Modify | localized tray update state |
| `src/shared/desktopRecoveryBridge.ts` | Modify | browser-safe update bridge types/helpers |
| `src/app/renderer/settings/PlatformSettingsDesktopStartup.tsx` | Rename/refactor | broaden Desktop Settings and add App updates section |
| `src/app/renderer/settings/PlatformSettingsRoutes.tsx` | Modify | updated Desktop Settings component |
| shared i18n catalogs | Modify | English and Traditional Chinese update copy |
| desktop update/tray/preload/Settings tests | Modify/expand | state, security, visibility, synchronization |
| package smoke scripts | Modify | release metadata and packaged capability assertions |
| setup/deployment/architecture docs | Modify | release and update operator/user guidance |

The implementation may choose narrower filenames, but it must preserve the
ownership boundaries in ADR-108 and SPEC-111.

## Testing Strategy

### Unit Tests

- updater event-to-state mapping
- version/capability resolution
- concurrency and idempotency
- safe error mapping
- tray label/menu construction
- Settings action/state mapping
- tag/package version validation
- desktop installer wrapper local/release argument and signing-environment policy

### Integration Tests

- main-process updater adapter with a fake provider
- IPC sender validation
- preload channel round trip and sandbox safety
- Tray-to-manager and Settings-to-manager synchronization
- npm/browser/development visibility matrix
- shutdown before restart/install handoff

### Workflow and Artifact Tests

- normal CI creates no release
- local packaging retains `--publish never` and disabled signing discovery
- release packaging preserves signing inputs and selects the bounded publish mode
- mismatched tag fails early
- first release version does not collide with existing tags or npm versions
- all required metadata references resolve to uploaded assets
- partial platform failure does not publish the draft
- packaged builds contain the correct provider configuration
- the Windows release package records or otherwise verifies the bundled
  platform/runtime sidecar layout

### Real-Machine Tests

- signed installed Windows N to N+1
- Windows assisted NSIS handoff, install-directory retention, install-mode
  choice, and expected elevation behavior
- signed/notarized macOS N to N+1
- Linux AppImage N to N+1
- Tray and Settings checks on current and outdated versions
- offline and interrupted-download recovery

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Update UI appears in a build without a valid feed | High | explicit host capability; hide controls until real platform gate passes |
| Windows/macOS signing is unavailable | High | keep self-update capability off; publish unsigned test artifacts only as clearly unsupported previews |
| Current packaging kill switches silently prevent release publish/signing | High | explicit local versus release mode; wrapper tests for publish args and credential preservation |
| Windows release silently inherits the loose-file sidecar default | High | pass and verify `--sidecar-layout bundle` in the official Windows job |
| Release metadata and artifacts come from different builds | High | generate together, validate references, publish draft only after all jobs pass |
| Tray and Settings start duplicate checks | Medium | one main-process operation lock and shared snapshot stream |
| Restart/install terminates sidecars unsafely | High | reuse orderly desktop shutdown before updater handoff; add integration coverage |
| npm users see an Electron updater | High | capability gating plus renderer visibility tests for every execution mode |
| macOS appears to have two user installers | Low | advertise DMG; label ZIP as updater support asset |
| GitHub latest/prerelease semantics select the wrong channel | High | stable-only Phase 1; define promotion rules before enabling alpha/beta |
| AppImage update is tested from an unpacked Linux build | High | require a real AppImage old-to-new test with expected runtime environment |
| Existing unsigned Windows installs cannot cross into the signed update chain | Medium until install base is known | classify the `0.1.1` artifact; validate unsigned-to-signed upgrade or document one manual reinstall |

## Rollback Strategy

- If a release workflow fails before publication, keep the draft unpublished
  and fix forward with the same tag only while no release was published.
- After publication, never replace artifacts in place; issue a higher patch
  version.
- If a client-side updater defect is found, disable the advertised capability
  in the next build and keep manual GitHub downloads available.
- Do not add a renderer fallback that fetches GitHub directly.

## Progress Log

| Date | Update |
|------|--------|
| 2026-07-28 | Plan created with ADR-108, SPEC-111, and the official-tooling research note. No implementation has started. |
| 2026-07-28 | Review follow-up added the installer-wrapper publish/signing interlocks, first-tag bootstrap, assisted NSIS UX, strict development capability policy, unsigned-install classification gate, and explicit bundled Windows sidecars. |
| 2026-07-28 | Phase 1 started: added `scripts/validate-release-version.mjs` and its tests. |
| 2026-07-28 | Phase 1: desktop installer wrapper gained a guarded release mode covering publish arguments, signing environment split, and the Windows executable-signing override. |

---

*Created: 2026-07-28*
*Author: User, with Codex support*
