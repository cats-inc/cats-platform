# macOS Self-Update Validation (0.3.2 to 0.3.6)

Date: 2026-09-23

## Topic

First signed-to-signed self-update on macOS, recorded as the G3 evidence
PLAN-101 requires before a platform is admitted to
`DESKTOP_RELEASE_READY_PLATFORMS`. Per ADR-117 section 3, a signed preview is
a valid source of this evidence; both builds here are previews.

## Builds

- **N = 0.3.2**, preview, run 35326932135, source `96d5c5ea`. First macOS
  preview signed with Developer ID and notarized (ADR-117 / PLAN-101 Phase 1b).
  Installed on the test machine by downloading the DMG from the GitHub
  prerelease on 2026-09-18, so the bundle carried `com.apple.quarantine` and
  went through Gatekeeper.
- **N+1 = 0.3.6**, preview, run 35799127996, source `adaf2158`. Signed and
  notarized; the build's verify step recorded `The validate action worked!`
  (stapler), `accepted`, and `source=Notarized Developer ID`.
- 0.3.3 sits between them and is not part of the pair: it was dispatched with
  `unsigned=true`, and Squirrel.Mac refused it over the signed 0.3.2, as its
  release notes said it would. 0.3.4 and 0.3.5 were npm-only.

## Environment

- Intel MacBook, x86_64 (Core i9-9880H), macOS 26.7.
- Cats 0.3.2 had been running for roughly eight hours before the test and was
  quit from the tray and relaunched first, to clear the manager state left by
  the 0.3.3 attempt (see "Detour" below).
- Signing identity `Developer ID Application: Chung-Chien Chou (97JBZ3MFX5)`.
  The Team ID is public in every signature and is not a secret.

## Procedure

1. Tray, **Check for Updates**.
2. Dialog offered 0.3.6; accepted **Update and Restart**.
3. Download completed; Cats quit; Squirrel.Mac replaced the bundle; Cats
   relaunched. No "ready to install" prompt appears on this path by design:
   an accepted offer downloads and hands off in one step, on every platform.

## Results

Recorded on the test machine after relaunch:

```
CFBundleShortVersionString = 0.3.6
Authority=Developer ID Application: Chung-Chien Chou (97JBZ3MFX5)
Authority=Developer ID Certification Authority
TeamIdentifier=97JBZ3MFX5
/Applications/Cats.app: accepted
source=Notarized Developer ID
```

electron-updater's cache at `~/Library/Caches/cats-updater/pending/` held
`Cats-0.3.6-x64.zip`; the stale `Cats-0.3.3-x64.zip` from the failed attempt
had been replaced, as expected from the `update-info.json` mismatch.

## What this validates

- The Developer ID certificate and App Store Connect API key configured on
  2026-09-18 produce artifacts Gatekeeper accepts on a machine other than the
  one that built them.
- The `latest-mac.yml` and ZIP pairing the release validator checks is the
  pairing electron-updater actually consumes.
- Squirrel.Mac accepts the signed successor over the signed predecessor, and
  the host's drain / quit / relaunch sequence around `quitAndInstall` works on
  macOS. This was the last unexercised leg of the macOS update path.
- A preview feed resolves through prereleases (`allowPrerelease`), so a
  preview finds its successor without `latest` involvement.

## What this does not validate

- **Apple Silicon.** The target set is x64 only (SPEC-111 section 8) because
  there is no macOS arm64 test machine; this run exercised the x64 slice under
  no translation layer at all, since the host is Intel. Rosetta 2 behaviour
  is untested.
- **Windows and Linux G3.** Both remain open. Windows is also unsigned until a
  certificate is purchased.
- **G5 startup checks.** Not exercised; manual checks only.
- **Settings-originated checks on macOS.** Only the tray path was driven.

## Detour: the 0.3.3 attempt and the two defects it exposed

Attempting 0.3.2 to 0.3.3 first (unsigned) could not succeed, but it showed:

- The tray dialog did not activate the app on macOS, so a parentless message
  box opened behind the frontmost window. Fixed in #112.
- A rejected download trapped the manager: from `downloaded` no re-check was
  possible, a failed handoff returned to `downloaded`, and the tray flow showed
  nothing when the handoff failed. Fixed in #113; ships in the next preview and
  should be validated by updating 0.3.6 to it.

## References

- [ADR-117](../decisions/117-separate-artifact-trust-from-desktop-release-identity.md)
- [SPEC-111 section 9](../specs/SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
- [PLAN-101 Phase 6](../plans/PLAN-101-packaged-desktop-update-rollout.md)
