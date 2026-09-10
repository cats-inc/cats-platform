# PLAN-106: Official App Package Hosting

## Metadata

| Field | Value |
|-------|-------|
| Status | SDK 1.2 multi-CLI refresh implemented, unreleased; existing Desktop pins unchanged; native cross-platform acceptance/catalog deferred |
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

Multi-CLI follow-up (2026-09-11, PR-only delivery):

- [x] Extend SDK 1.2 provider allowlist to Codex/Copilot/Claude/Antigravity.
- [x] Preserve native request/credit quantities, unlimited and refresh capability.
- [x] Retain scoped permissions, auth/CSRF, bounded fixed routes and in-flight revocation.
- [x] Add provider projection/routing tests; retain shipped-SDK sidecar regression.
- [x] Verify built Usage 0.2.0 query buttons with the authenticated host in an isolated browser.
- [x] Final independent review and focused regression pass.

Validation: 21 host/renderer/client tests, the bundled-SDK sidecar test, typechecks
and server/web builds passed. Both standalone and production renderer smoke tests
used the actual 0.2.0 archive with isolated auth/CSRF and fixture snapshots.
The production run exercised Lobby entry/re-entry and routed Copilot, Claude and
Antigravity clicks to their exact provider targets without automatic CLI queries.
Independent review covered collector boundaries and the complete renderer bridge.

The owner subsequently authorized commit/push and auto-merge PRs only. Full
Windows `npm test` passed: 4,551 cases, 4,546 passed, 5 skipped, 0 failed, including
server/desktop/renderer/test/mobile typechecks and test builds. The initial run
alongside Runtime had one Telegram file-store restart timeout; its isolated rerun
and the complete serial suite both passed without modifying production code,
test assertions or timeout limits. GitHub required checks remain the merge gate.

No Desktop version bump, tag, release lock edit, publication or installed update
belongs to this follow-up. Later delivery must select the new App version/hash and
matching Runtime revision explicitly. Existing Codex publication history follows.

Codex refresh follow-up (2026-09-10): SDK 1.1 and a distinct telemetry-refresh
permission now bridge explicit native CLI quota reads. The host enforces bounded
Codex-only targets, authentication/CSRF, before/after version/hash/permission
checks and sanitized responses. Usage 0.1.1 requires SDK ^1.1.0; it must be selected
as an immutable new artifact, not overwritten into the old 0.1.0 archive.
This follow-up now targets the 0.2.4 unsigned preview. Updating the operator's
installed Desktop remains outside the release task.
Validation on 2026-09-11: 27 focused hosting/renderer/client/package tests passed,
server and production web builds plus renderer/test typechecks passed. A real
built Usage 0.1.1 archive went through the same offline staging helper as Desktop,
then launched in an authenticated temporary Platform profile. One UI click caused
one native Codex CLI quota read and displayed the matching remaining percentage;
opening the page caused none. Independent review covered permissions, redaction
and revocation. That implementation validation did not publish a release, update
an installed Desktop or claim native macOS/Linux live validation.

Earlier PR-only delivery (2026-09-11): full Windows `npm test` completed successfully,
including server/desktop/renderer/test/mobile typechecks and builds: 4,548 cases,
4,543 passed, 5 skipped, 0 failed. The owner authorized commit/push and auto-merge
PRs only. That task did not create a tag, publish a release, change the Desktop
App lock or update an installation. The later 0.2.4 release authorization below
supersedes that publication hold, not the installed-update boundary.

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
signed release or native installer/UI acceptance on all platforms.
The Windows bundled SDK path failure in 0.2.2 was fixed in the published 0.2.3
unsigned preview. After the installed Windows Desktop was updated, the user
confirmed that the complete Usage dashboard was visible. Desktop 0.2.4 adds
the separately verified explicit Codex query; its release gates and any later
installed-update acceptance remain separate from that 0.2.3 confirmation.

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
| 2026-09-11 | Release authorization supersedes the earlier publication hold: prepare Desktop 0.2.4 unsigned preview with the published Usage 0.1.1 archive and fixed Runtime commit `603afdc2f9e46b31b56b0223f6a3f0690b5af76f`. Pin the actual release bytes, merge through PR/CI, and require all three installer-resource/offline-activation gates before publishing. Updating the operator's installed Desktop remains out of scope. |
| 2026-09-11 | 0.2.4 preparation verified: full Windows `npm test` passed (4,543 passed, 5 skipped, 0 failed), version identity passed, and the production resolver downloaded the pinned public artifact successfully. The released Usage manifest/payload exactly match the previously live-verified 0.1.1 archive; release digest/lock/provenance agree. Independent release review found no blockers; corrected the old 0.2.3 status. PR CI and actual three-OS packaging remain the next gates, with no installed update performed. |
| 2026-09-10 | Renderer/SDK/read bridge and pinned package installation implemented with isolated browser tests. |
| 2026-09-10 | Usage 0.1.0 published; Runtime PR 39 merged. Desktop 0.2.2 pins the published archive; corrected resource roots, mobile-safe snapshot decoding, and actual-installer-resource checks added. Native interactive acceptance remains separate. |
| 2026-09-10 | Follow-up to a reported `Loading Usage` stall: bounded renderer/SDK startup, localized retry, caught nonce initialization failures and stale-attempt protection. Extend smoke coverage to production Platform assets, authenticated router, Lobby re-entry and injected startup failures. The installed-window cause and new release acceptance remain open. |
| 2026-09-10 | Author verification: 46 targeted tests, renderer/test typechecks and production web build passed. Edge production-page checks (including injected loading recovery) and isolated Electron 41.2.0 functional checks passed with the published Usage archive. Desktop/frame and narrow-viewport screenshots inspected using fixture data; no actual user-installation repair or new release is claimed. |
| 2026-09-10 | Root cause confirmed against the installed Windows bundle: SDK inlining moved its resource-relative URL to a missing server sibling. A production-bundler regression test reproduced the renderer API 503, then passed after preserving the external SDK alias. Extend the installer gate to reject inlined SDKs. The user's installed 0.2.2 has not been overwritten. |
| 2026-09-10 | Prepare Desktop 0.2.3 unsigned preview with the same immutable Usage 0.1.0 archive and Runtime commit as 0.2.2. Release and in-place Windows update are authorized; complete CI, publish, install and verify before claiming the affected installation is repaired. |
| 2026-09-10 | Release validation: version identity and documentation links passed. Windows full-suite typechecks/builds completed and test cases ran, but the runner did not exit after the final visible case; interrupted without claiming a full-suite pass. The 15 affected tests reran successfully with the same no-isolation mode and exited normally. Required GitHub CI remains the merge/release gate. |
| 2026-09-10 | CI reproduced the test-runner teardown stall. Async-handle tracing of the bundled tests isolated React async act's MessageChannel fallback retaining a port; the source/tsx run did not exercise that bundled fallback. Drain the ignored stale response with Node's task queue instead of async act, then verify the bundled no-isolation tests exit before rerunning required CI. |

*Created: 2026-09-10*
