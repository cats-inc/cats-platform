# PLAN-106: Official App Package Hosting

## Metadata

| Field | Value |
|-------|-------|
| Status | Renderer/SDK/telemetry implemented; pinned 0.2.2 preview release in progress; catalog deferred |
| Owner | cats-platform |
| Related spec | SPEC-115 |
| Related decision | ADR-114 |
| First app | Usage (cats.usage) |

## Related Spec

[SPEC-115](../specs/SPEC-115-versioned-official-app-packages-and-telemetry-bridge.md)

## Overview

Continue PLAN-087's registry/Lobby work with real installed renderer execution,
versioned package management, a narrow telemetry bridge, and Desktop artifact
integration. Keep the initial slice smaller than the full extension manifesto.

## Implementation Phases

### Phase 0: Baseline and Ownership

- [x] Inspect current manifest, registry, Settings, Lobby, placeholder route, and
      unimplemented scoped API executor.
- [x] Record cats-apps source ownership and coordinated Desktop distribution.
- [x] Link Apps and runtime specifications/plans.
- [x] Agree the U1 telemetry DTO and unsupported/coverage semantics with runtime.

### Phase 1: Freeze Executable Contracts

- [x] Define the public SDK export/version and actual renderer context bootstrap.
- [x] Select renderer isolation, origin/CSP policy, message binding, and capability
      revocation behavior; verify the isolated-frame candidate.
- [x] Freeze package payload/entrypoints and archive import rules.
- [x] Freeze app/version/artifact/checksum Desktop bundle metadata.
- [x] Define runtime.telemetry.read and usage.snapshot or their final equivalents.
- [x] Keep unimplemented server/jobs/general scoped executors outside this slice.

### Phase 2: Managed Installation and Loader

- [x] Replace production references to developer package paths with staged,
      validated app/version installations.
- [x] Commit registry changes only after the candidate payload is usable.
- [x] Preserve prior versions/data on failure and explicit disabled state on update.
- [x] Load the built renderer and assets through the actual host route.
- [x] Supply identity, locale/theme, navigation, lifecycle, and the real SDK bridge.
- [x] Verify source-free and offline package execution using temporary app roots.

### Phase 3: Read-Only Usage Bridge

- [x] Enforce a narrowly scoped telemetry permission against the active app/version.
- [x] Read the dedicated Runtime snapshot for U1 and supported passive quota signals.
- [x] Redact/minimize data and expose coverage, freshness, confidence, and failures.
- [x] Verify polling reads only cached data and cannot invoke CLI/model work.
- [x] Add quota-window projection for the existing fixture-backed Claude/Codex signals.
- [x] Revoke the next/in-flight bridge read on disable/uninstall and tear down on denial.

### Phase 4: Desktop Preinstallation

- [x] Select built cats-apps artifacts from an identified artifact/build.
- [x] Include exact versions/checksums in package plans, staging and installer manifests.
- [x] Install the selected app set without a network catalog or source checkout.
- [ ] Validate Usage launch from Lobby on supported Desktop targets.
- [x] Match packaged App/config/SDK paths to Electron resource destinations.
- [x] Publish and select the immutable Usage 0.1.0 release for Desktop 0.2.2.
- [x] Gate each OS release on shipped App hashes and isolated offline activation.
- [x] Validate update failure, preserved disabled state, and scoped data retention.

Implemented details and exact pinning commands: [App package guide](../app-packages.md).
Windows staging and an isolated headless host test passed; this does not claim a
signed/public release, native installer execution on all platforms or independent review.

### Phase 5: Later Remote Catalog and App Updates

- [ ] Define official available-App catalog publication/consumption.
- [ ] Add cached catalog browsing and compatible-version selection.
- [ ] Add verified download, explicit install, version comparison, and replacement.
- [ ] Define bundled-versus-independently-updated version policy before enabling it.

Phase 5 is deferred and is not a prerequisite for the first bundled utility.

## Work Areas

| Area | Responsibility |
|------|----------------|
| Shared App manifest/SDK contracts | Real browser exports, permissions, compatibility |
| platform/apps | Managed installation, lifecycle, provenance, scoped operations |
| App package API and AppHostRoute | Artifact serving/load and authorized access |
| Lobby/Settings | Reuse registry-driven entries and existing management |
| Desktop packaging | Pinned package-set inputs and bundled installation |
| cats-apps / cats-runtime | App build/UI / quota and usage source, through their plans |

## Testing Strategy

Add targeted contract tests for manifests/compatibility/permission denial, install
staging and failure recovery, renderer asset paths, SDK context binding, revoked
access, DTO redaction, unknown/zero/stale coverage, and disabled-state retention.

Then run a built Usage package with source directories unavailable and with
runtime offline. Use temporary app/runtime profiles; do not seed the user's real
registry with verification apps. Record actual Desktop platform coverage rather
than treating a rendered placeholder as end-to-end success.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Broad SDK declarations conceal absent implementations | Negotiate capabilities and require actual renderer proof |
| Utility gains direct host/runtime access | Narrow permission and origin/context-bound bridge |
| Bundle update overrides user choices | Preserve explicit disabled state and data |
| Release silently chooses a different app version | Pin artifact provenance and checksum |

## References

- [PLAN-087](PLAN-087-cats-app-package-interface-rollout.md)
- [Apps PLAN-001](../../../cats-apps/docs/plans/PLAN-001-official-app-package-foundation.md)
- [Apps PLAN-002](../../../cats-apps/docs/plans/PLAN-002-cats-usage-dashboard.md)
- [Runtime PLAN-038](../../../cats-runtime/docs/plans/PLAN-038-provider-account-quota-and-usage-snapshots.md)

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-10 | Renderer/SDK/read bridge and pinned package installation implemented with isolated browser tests. |
| 2026-09-10 | Usage 0.1.0 published; Runtime PR 39 merged. Desktop 0.2.2 pins the published archive; corrected resource roots, mobile-safe snapshot decoding, and actual-installer-resource checks added. Native interactive acceptance remains separate. |

*Created: 2026-09-10*
