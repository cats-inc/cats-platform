# ADR-114: Separate Official App Sources and Coordinate Desktop Distribution

## Status

Accepted — repository and initial distribution direction approved on 2026-09-10.
Host execution, package installation, and telemetry bridge follow-through remain planned.

## Context

ADR-048 distinguishes Products from installable Apps. ADR-094/SPEC-098 describe
the App Package extension boundary, and PLAN-087 delivered its first registry,
management, and Lobby foundations.

Small official utility apps now have a separate source home, cats-inc/cats-apps.
The first planned app is Cats Usage. This requires a clear source/package/release
boundary without forcing every small app into its own repository and release system.

The current app route renders package metadata, not the app's renderer. The local
install API records an input package path; declared scoped API routes return 501.
Reserved entrypoints and SDK interfaces do not prove deployed app execution.

## Decision

1. Keep first-party utility implementation and common app build automation in
   cats-inc/cats-apps, a monorepo of individually versioned App Packages.
2. Keep the public App SDK, permissions, package validation/install/load,
   installed registry, Lobby/Settings, and Desktop integration in cats-platform.
3. Keep provider CLI execution, usage normalization, quota acquisition, persistence,
   and execution guardrails in cats-runtime.
4. Initially include a pinned, tested app set with each coordinated Desktop release.
   Individual app versions remain separate from the Desktop version.
5. Production installs and loads built artifacts. The host must not depend on an
   app source checkout, dev server, sibling source import, or install-time build.
6. Shared cats-apps CI may produce multiple app artifacts. One GitHub repository
   or release workflow per utility is not required.
7. The host owns versioned installation and per-app data separation. Bundle
   provenance establishes first-party trust; manifest text cannot self-grant it.
8. Cats Usage (cats.usage) contributes an App entry under Lobby Apps. It does not
   become a new Product or move Chat/Work/Code out of the platform repository.
9. A future remote App Catalog describes available apps/versions and artifacts.
   GitHub Releases may store artifacts; the local registry records installed state.
   The host consumes catalogs/downloads and manages updates when that phase is built.
10. Provide a narrow read-only telemetry bridge for Cats Usage. The app does not
    receive raw runtime credentials, provider login files, or arbitrary host access.

## Consequences

### Positive

- Utility apps exercise the intended public package/SDK boundary.
- Desktop releases include a known compatible, offline-available app set.
- Source separation does not force separate delivery cadence.
- Runtime data is reusable by multiple apps and product surfaces.

### Negative

- The host must finish actual package installation and renderer execution.
- Package/SDK compatibility and cross-repository artifact provenance become explicit.
- Independent app updates initially wait for the Desktop-coordinated release.

### Neutral

- ADR-110's platform-client repository decision remains in force.
- The broad product-module/connector/jobs design in SPEC-098 is not automatically
  implemented or promoted by this narrower official-utility decision.
- Remote catalogs, public third-party distribution, and per-app auto-updates remain later work.

## Alternatives Considered

### Implement Every Utility Inside Platform Source

Minimizes initial host work but permits internal imports and bypasses the intended
extension boundary. Rejected for the official utility collection.

### Give Every Utility Its Own Release Pipeline

Useful when ownership/cadence differs, but unnecessary overhead for a small
first-party collection. Keep as a future option.

### Require Remote Catalog Installation for the First App

Would couple the first useful app to remote distribution infrastructure. Defer;
initial bundled and later downloaded packages use the same installed format.

## References

- [ADR-048](048-separate-platform-products-from-installable-apps.md)
- [ADR-094](094-adopt-cats-app-packages-as-extension-boundary.md)
- [ADR-110](110-keep-platform-clients-in-one-repository-with-explicit-package-boundaries.md)
- [SPEC-115](../specs/SPEC-115-versioned-official-app-packages-and-telemetry-bridge.md)
- [Apps ADR-001](../../../cats-apps/docs/decisions/001-own-official-utility-apps-and-coordinate-desktop-distribution.md)
- [Runtime ADR-038](../../../cats-runtime/docs/decisions/038-separate-execution-usage-from-provider-account-quota.md)

*Decision made: 2026-09-10*
