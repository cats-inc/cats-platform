# SPEC-115: Versioned Official App Packages and Telemetry Bridge

## Metadata

| Field | Value |
|-------|-------|
| Status | Renderer/telemetry/pinned-package v1 implemented; broader extensions deferred |
| Owner | cats-platform |
| Implementation | Managed .catsapp install, opaque-frame SDK v1, read bridge, Desktop lock selection |
| First consumer | Usage (cats.usage) from cats-apps |

## Summary

Finish the smallest useful App host slice: install built first-party utility
packages, load their renderers, enforce a public SDK boundary, and expose a scoped
read-only telemetry operation. Include pinned app versions with Desktop first;
remote catalog discovery and independent app updates are later phases.

## Baseline Before This Slice

| Capability | Actual implementation |
|------------|-----------------------|
| Manifest types/validation | Present, including reserved contribution fields |
| Installed registry and lifecycle APIs | Present, based on local package paths |
| Settings Apps and Lobby projection | Present |
| /apps/:appId/* | Host-owned package information placeholder |
| Declared scoped App APIs | Route validation exists; executor returns 501 |
| Renderer/activation SDK | Type interfaces; no general installed renderer runtime |
| Runtime-backed tool bridge | Separate helper exists; not a working renderer telemetry capability |
| Versioned package paths | Helpers exist; local install does not populate the managed version directory |
| Remote available-App catalog | Not implemented |

This spec extends the narrow official utility route. It does not require activating
all reserved server, worker, connector, product-module, job, or scoped API features.

The delivered contract and exact build commands are frozen in the
[App package guide](../app-packages.md). The placeholder remains only for unverified
manifest registrations; verified enabled utility archives execute in the real host.
`runtime.telemetry.read` and `usage.snapshot` are now implemented. The Runtime DTO
includes passive Claude/Codex windows, but active collectors/history remain deferred.

## Goals

- Actual source-independent app execution from a versioned installed package.
- A usable public renderer SDK with scoped, revocable access.
- A pinned official app set in Desktop releases.
- Truthful Usage reads without provider credentials in a renderer.

## Non-Goals

- Moving Chat, Work, Code, Desktop, or Mobile source out of cats-platform.
- A full marketplace or arbitrary third-party server code execution.
- App-owned provider CLI/account access.
- Embedded live dashboard widgets in Lobby.
- General mutation APIs or quota/budget override controls for Usage.

## Package and Install Requirements

1. Consume Cats App Packages from cats-apps build outputs, identified by app ID,
   app version, source revision, checksum, and Platform/SDK compatibility.
2. Keep development folder input distinct from installed production location.
   Validate and stage the payload into a host-owned app/version directory.
3. Verify declared renderer/assets exist and remain within package boundaries.
   Reject traversal, invalid paths, and links escaping the installed payload.
4. Do not run npm installation, source compilation, or package-provided install
   scripts while installing or launching a utility.
5. Select official packages from a pinned Desktop bundle record. Runtime calls
   must not resolve a moving latest release to determine bundled content.
6. Validate identity, contents, compatibility, and provenance before activation.
   App self-declaration does not establish system trust.
7. Install a new version completely before switching the registry's active reference.
   A failed replacement leaves the prior usable version and scoped data intact.
8. Retain app data separately from immutable package contents. Any migration/data
   removal must be explicit and independently validated.
9. Persist source/provenance sufficiently to distinguish Desktop-bundled, local
   development, and future remotely installed packages.
10. Preserve explicit disabled state across Desktop updates; preinstallation must
    not silently re-enable an app the owner disabled.

## Renderer and SDK Requirements

11. Serve/load the built entrypoint under the host-owned app route, with correct
    relative asset handling and an offline launch path.
12. Export a usable, versioned renderer SDK in addition to its TypeScript interfaces.
    App builds must not import platform source or host singletons.
13. Provide locale, theme, app identity/version, route/navigation, and a bounded
    operation bridge. Scoped preference storage is optional until implemented.
14. Bind calls to the active installed app/version and granted capabilities.
    Disable/uninstall must revoke access and terminate the active renderer context.
15. Treat an isolated renderer frame plus an authenticated host message bridge as
    the initial design candidate. Freeze the origin/CSP/message-binding model in
    PLAN-106 Phase 1 before implementing the loader; a same-origin frame alone
    is not a security boundary.
16. Keep unsupported optional SDK/contribution features explicit. Do not return
    success for a declared server/action executor that is still absent.

## Telemetry Read Requirements

17. Enforce the implemented runtime.telemetry.read permission in the validated
    permission model and at the host boundary.
18. Expose the implemented allowlisted usage.snapshot operation through the
    renderer context. Its presence must be negotiated, not inferred from a
    manifest permission string.
19. Project only sanitized usage, quota-window, incident, freshness, and coverage
    fields. Runtime API keys, provider credentials, raw stderr, and unrelated
    account/user metadata must never enter the renderer response.
20. For U1, the host may adapt existing runtime diagnostics into a limited DTO.
    Provider diagnostics are incident summaries, not account quota totals.
    Account quota remains unavailable until runtime supplies verified observations.
21. Align the DTO with runtime SPEC-029. Preserve unknown/zero, native units,
    currencies, source confidence, shared-account identity, and reset timestamps.
22. A read operation returns cached data and never requests model execution or
    forces provider account probes.
23. Bound snapshot size, polling/cache cadence, cancellation, and error handling.
    Expose runtime unavailability and stale observations without clearing them to zero.
24. Any later upstream refresh operation needs its own authorized contract.
    A read-only telemetry permission does not automatically grant it.

### SDK 1.1: explicit Codex quota refresh

`usage.refreshQuota({provider:"codex", instance})` is now implemented and requires
both `runtime.telemetry.read` and the distinct `runtime.telemetry.refresh` permission.
The host issues authenticated, CSRF-protected
`POST /api/apps/:id/usage/refresh?version=...`, checks the enabled package/version/
hash/permissions before and after the request, and forwards only the bounded target
to Runtime `POST /usage/refresh`. The App cannot choose commands, credentials or URLs.

The response is `{status, nextRefreshAt, snapshot}`; status is `updated`, `cooldown`,
`busy`, `auth_required`, `unsupported`, `unavailable`, `timeout` or `error`. Only an
allowlisted projection crosses the bridge (2 MiB; 12-second Runtime request;
15-second SDK deadline). Runtime owns the 8-second CLI attempt plus cleanup and
60-second cooldown. The snapshot can contain `provider_account_query` scope and
`codex.account/rateLimits/read` source, with a sanitized limit ID. App polling
continues using only the passive snapshot operation. Cats never reads CLI
credentials or sends provider API requests; the Codex CLI owns its authentication.

## Catalog and Update Direction (Deferred)

The remote catalog identifies available apps, versions, compatibility, download
references, size, and checksum. Artifact hosting may use GitHub Releases. The
installed registry remains the authority for local version and lifecycle.

A later host phase adds source selection, cached catalog reads, compatible-version
selection, verified downloads, update comparison, and transactional replacement.
The Desktop updater and an App updater remain distinct ownership scopes.

## Acceptance

- A built Usage package opens from Lobby with its source checkout unavailable.
- Assets load offline, and runtime-unavailable data is shown truthfully.
- The exact app version/provenance is inspectable and matches Desktop bundle inputs.
- Denied/revoked telemetry access cannot reach runtime.
- Unknown/stale/shared-account fixture data survives the host projection.
- Invalid or failed updates preserve the prior installation and preferences.
- Disabled apps remain disabled after a Desktop bundle update.
- Current placeholder/scoped-501 paths are not counted as successful execution.

## Dependencies and Open Questions

- [Apps SPEC-001](../../../cats-apps/docs/specs/SPEC-001-official-utility-app-packages.md)
- [Apps SPEC-002](../../../cats-apps/docs/specs/SPEC-002-cats-usage-dashboard.md)
- [Runtime SPEC-029](../../../cats-runtime/docs/specs/SPEC-029-provider-account-quota-and-usage-snapshots.md)
- Freeze the renderer isolation mechanism, SDK compatibility range, archive
  container, install atomicity, and Desktop bundle-record schema in Phase 1.
- Decide how a future separately updated app interacts with an older bundled
  version; do not implement silent downgrades as the default.

*Created: 2026-09-10*
*Related Plan: [PLAN-106](../plans/PLAN-106-official-app-package-hosting.md)*
