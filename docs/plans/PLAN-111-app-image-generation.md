# PLAN-111: App image generation

Status: Implementation, isolated acceptance and installed Windows Desktop acceptance complete (2026-09-28).
Related: [SPEC-119](../specs/SPEC-119-app-image-generation.md),
[ADR-120](../decisions/120-scope-app-image-jobs-and-assets.md),
[Apps PLAN-003](../../../cats-apps/docs/plans/PLAN-003-media-studio-vertical-slice.md).

- [x] SDK 1.3 methods, permission manifest, binary bridge and opaque iframe preview/download.
- [x] Account/App/version grants and additive Core task/run/artifact metadata.
- [x] Durable submit, duplicate suppression, background collection and offline saved works.
- [x] Cancellation/late admission and transient transport recovery regressions.
- [x] Real Studio package in isolated browser; generate fixture, download exact bytes,
      reopen offline, cancel, narrow viewport, CSP and Home navigation; zero CLI calls.
- [x] Platform typecheck including mobile; 10 image/package, 29 App host/registry/renderer
      and 6 Usage client regressions passed.
- [x] Independent review; reported cancellation/admission/access findings addressed.
- [x] Build/install local Desktop 0.5.11 with Runtime source changes, SDK1.3 and Studio0.1.0.
- [x] Verify installed process/version, healthy services and separate Studio/Usage Home tiles.

Git delivery follows the user's direct-main commit/push instruction; no release tags or publication.

## Installed Windows acceptance

The existing 0.5.9 Desktop exited through its tray Quit action, then the local NSIS
installer upgraded the same per-user location to 0.5.11. The replacement process and
Settings → Desktop both report 0.5.11; bundled SDK is 1.3.0. Platform and Runtime are
healthy. Home displays separate Studio and Usage cards; both actual pages opened,
and Studio's Home action returned correctly. Studio reports generation capability,
labels the existing orange-cat sample, and disables generation for an empty prompt.
No real job was submitted. Existing Core record counts, setup completion and tray/
background preferences remain unchanged. Cats was left at Home.

Installer SHA-256: `f0a177abea397f0dce9b40ad467e6b2668321ba9498f5e4868ccb087ed9b42af`.
Local Studio archive SHA-256: `3da3fa89f7921df850c0095a172ccd8cdfc011ac5175ae5ab5860f22c28d0252`.
Published Usage archive SHA-256: `7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.
Window captures are private local evidence, not tracked artifacts. This was a local
manual installer update, not an automatic update or a public release.

Local bundle selection preserves published Usage0.4.0 at its existing hash and adds a local
immutable Studio archive. Synthetic tests never write the user's Core/profile. Installation
is the actual user-requested operation. Further fresh Grok calls are deferred.
