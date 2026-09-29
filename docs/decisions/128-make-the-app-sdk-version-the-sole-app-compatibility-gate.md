# ADR-128: Make the App SDK Version the Sole App Compatibility Gate

## Status

Accepted, 2026-09-29. The owner asked why Usage and Studio had to be re-released
for every Platform minor and, after confirming that the App SDK contract is already
exposed and versioned ([ADR-123](123-expose-app-sdk-contract-as-platform-npm-subpath.md)),
decided that the SDK version is the only compatibility gate an App is held to.
The launcher (cats-one) keeps its own dependency ranges; this ADR does not touch it.

## Context

An App manifest carries two compatibility declarations
([SPEC-098](../specs/SPEC-098-cats-app-package-and-extension-interface.md)):

- `compatibility.appSdk`, compared against `APP_SDK_VERSION` (1.3.0 today), the
  version of the contract the App actually programs against: the browser SDK,
  the package format, the permission catalog and the Runtime bridge behind it.
  The SDK already moves when host behaviour visible to Apps moves: `media.images`
  and image jobs took it from 1.2.0 to 1.3.0.
- `compatibility.catsPlatform`, compared against the Platform package version
  with the same range grammar. Under the project's 0.x discipline, `^0.6.0` means
  0.6.x only, so every Platform minor made every published App artifact
  incompatible by declaration even when nothing an App can observe had changed.
  Usage 0.5.0 and Studio 0.2.0 exist for that reason alone.

The second gate was a safety net for the period before the project committed to
"anything an App can observe is covered by the SDK version". It has two costs:
it couples App releases to Platform releases that have nothing to do with Apps,
and it keeps already-published artifacts (including ones whose only defect is
stale publisher metadata) alive on old hosts longer than necessary.

## Decision

1. **`compatibility.appSdk` is the sole compatibility gate.** The host accepts an
   App if and only if the host's `APP_SDK_VERSION` satisfies the App's `appSdk`
   range. Any host change an App can observe (SDK API, package format, permission
   catalog, bridge routes, lobby or renderer-host mounting) must move
   `APP_SDK_VERSION`: a compatible addition bumps the minor, a breaking change bumps
   the major. Platform version changes carry no App-compatibility meaning.
2. **`compatibility.catsPlatform` becomes a minimum host version.** The field stays
   required and keeps its grammar (exact `X.Y.Z`, `^X.Y.Z`, `X.x`, `X.Y.x`), but the
   host now compares itself against the lower bound of the declared range: a host
   older than that bound is rejected, any newer host is accepted. `^0.6.0` therefore
   reads "Platform 0.6.0 or newer". Unsupported grammar and prerelease strings are
   still rejected, so no existing manifest changes meaning in an unsafe direction.
3. Both installation (`validateRendererAppPackage`) and Desktop packaging
   (`stageDesktopPackagingOutputs`) apply the same two rules.
4. Published App artifacts are not re-released for a Platform minor. An App is
   re-released when it needs a newer SDK, when its own behaviour changes, or when
   its metadata must change.

## Consequences

- Platform 0.7 will accept Usage 0.5.0 and Studio 0.2.0 as published; no App
  re-release is needed for the version bump alone.
- The obligation moves to Platform: a reviewer of any change under
  `packages/app-sdk`, the App permission catalog, `src/platform/apps` or the
  renderer host must ask whether `APP_SDK_VERSION` has to move. The SDK version
  check in `tests/app-sdk-*` and the conformance vectors are the enforcement.
- The change is strictly more permissive: every App the previous rule accepted is
  still accepted, so it ships within the current 0.x minor line.
- `docs/app-packages.md`, the cats-apps release SOP and the conformance fixture
  are updated with this ADR. cats-one's release guide describes the old rule in
  passing and is left for its next edit.
