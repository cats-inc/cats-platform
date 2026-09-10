# PLAN-106: Official App Package Hosting

## Metadata

| Field | Value |
|-------|-------|
| Status | Planned; execution follow-through not started |
| Owner | cats-platform |
| Related spec | SPEC-115 |
| Related decision | ADR-114 |
| First app | Cats Usage (cats.usage) |

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
- [ ] Agree the U1 telemetry DTO and unsupported/coverage semantics with runtime.

### Phase 1: Freeze Executable Contracts

- [ ] Define the public SDK export/version and actual renderer context bootstrap.
- [ ] Select renderer isolation, origin/CSP policy, message binding, and capability
      revocation behavior; verify the isolated-frame candidate.
- [ ] Freeze package payload/entrypoints and archive import rules.
- [ ] Freeze app/version/source/checksum Desktop bundle metadata.
- [ ] Define runtime.telemetry.read and usage.snapshot or their final equivalents.
- [ ] Keep unimplemented server/jobs/general scoped executors outside this slice.

### Phase 2: Managed Installation and Loader

- [ ] Replace production references to developer package paths with staged,
      validated app/version installations.
- [ ] Commit registry changes only after the candidate payload is usable.
- [ ] Preserve prior versions/data on failure and explicit disabled state on update.
- [ ] Load the built renderer and assets through the actual host route.
- [ ] Supply identity, locale/theme, navigation, lifecycle, and the real SDK bridge.
- [ ] Verify source-free and offline package execution using temporary app roots.

### Phase 3: Read-Only Usage Bridge

- [ ] Enforce a narrowly scoped telemetry permission against the active app/version.
- [ ] Adapt existing runtime diagnostics for U1 without claiming account quota.
- [ ] Redact/minimize data and expose coverage, freshness, confidence, and failures.
- [ ] Verify polling reads only cached data and cannot invoke CLI/model work.
- [ ] Add quota-window projection when runtime PLAN-038 delivers verified sources.
- [ ] Revoke bridge access on disable/uninstall and tear down stale contexts.

### Phase 4: Desktop Preinstallation

- [ ] Select built cats-apps artifacts from an identified revision/build.
- [ ] Include exact versions/checksums in release provenance and package staging.
- [ ] Install the selected app set without a network catalog or source checkout.
- [ ] Validate Cats Usage launch from Lobby on supported Desktop targets.
- [ ] Validate update failure, preserved disabled state, and scoped data retention.

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

Then run a built Cats Usage package with source directories unavailable and with
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
| 2026-09-10 | Current implementation audited; source/package/release and telemetry-host follow-through documented. New implementation remains planned. |

*Created: 2026-09-10*
