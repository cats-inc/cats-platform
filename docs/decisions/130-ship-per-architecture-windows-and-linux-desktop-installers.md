# ADR-130: Ship Per-Architecture Windows and Linux Desktop Installers

## Status

Accepted, 2026-10-13. The owner asked the GitHub Desktop release to add a
Linux x86_64 `.deb` and a Windows arm64 installer, accepting either a combined
installer like macOS or separate per-architecture installers. This amends the
release set of [ADR-108](108-use-host-owned-github-release-updates-for-official-desktop-builds.md)
section 6 and [SPEC-111](../specs/SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
section 8, and removes Windows arm64 and Linux x64 from SPEC-111's non-goals.

## Context

- Until Desktop 0.7.13 a release shipped one Windows x64 NSIS installer, one
  macOS universal DMG plus its updater ZIP, and one Linux arm64 `.deb`.
- macOS merges its two slices into one universal app, so one feed serves every
  Mac. Windows and Linux have no equivalent single binary.
- electron-builder 26 names update feeds per platform and, only on Linux, per
  non-x64 architecture: Windows always writes `latest.yml`, while Linux writes
  `latest-linux.yml` for x64 and `latest-linux-arm64.yml` for arm64.
- electron-updater 6 picks the feed file whose name contains `process.arch` and
  otherwise falls back to the first file.
- With two architectures, electron-builder's NSIS target defaults to a combined
  installer carrying both app archives. Because this repository's
  `artifactName` contains `${arch}`, it then also builds each per-architecture
  installer, and the combined one is named without an architecture.
- The Windows voice helper is a self-contained .NET publish for a single
  runtime identifier. Any architecture-neutral resource directory would put the
  same helper in both apps; an x64 helper still runs on Windows on Arm under
  emulation, so the mistake would go unnoticed.

## Decision

1. **Windows ships one NSIS installer per architecture.**
   `nsis.buildUniversalInstaller` is `false`, so one electron-builder run
   produces `Cats-<version>-setup-x64.exe` and `Cats-<version>-setup-arm64.exe`.
   Both are listed in the single `latest.yml` feed, x64 first, and
   electron-updater picks the entry matching the running architecture. The x64
   asset name and its update path are unchanged for existing installs.
2. **Linux ships an amd64 and an arm64 `.deb`**, `Cats-<version>-amd64.deb` and
   `Cats-<version>-arm64.deb`, each with its own feed.
3. **Each OS packs all of its architectures in one release job.** Separate jobs
   would each write their own `latest.yml` and overwrite the other's on upload.
   Windows and Linux arm64 are cross-packaged on the x64 runners; Electron and
   the ngrok native addons are prebuilt for both architectures.
4. **Native helpers follow the app architecture.** The Windows voice helper is
   published for each architecture into `build/native-windows/<arch>`, which the
   `win.extraResources` entry maps onto `resources/native` through
   electron-builder's `${arch}` macro.
5. **Validation is per architecture.** Release asset validation requires an
   installer for each declared platform architecture, the four update feeds, and
   that each feed offers an update for every architecture it serves and none for
   another. Bundle verification compares the Windows voice helper's PE machine
   with `Cats.exe` in every unpacked app, because electron-builder only warns
   when an extraResources source is missing.

## Consequences

### Positive

- Windows on Arm runs natively, including the voice helper, and x64 Linux
  machines get a package.
- Each download stays the size of one architecture, and existing x64 Windows and
  arm64 Linux installs keep the same asset names and update path.
- A missing or mismatched architecture blocks publication instead of shipping.

### Negative

- Windows and Linux release jobs package twice, so they take longer, and a
  default local `npm run desktop:package:windows` or `:linux` builds both
  architectures. Pass `--arch x64` or `--arch arm64` for a single local build.
- Windows arm64 and Linux x64 are cross-packaged and exercised in CI only by the
  architecture-independent checks: resources, offline App activation, sidecar
  startup under the runner's Node, licenses and the helper's PE machine. Their
  Electron hosts first run on user hardware.

### Neutral

- Installing the other architecture's Windows installer replaces the existing
  installation, because both share one application identity.
- macOS remains one universal build.

## Alternatives Considered

### Alternative 1: One combined Windows installer

Rejected. It doubles every Windows download and update, renames the x64 asset,
and with this repository's `artifactName` electron-builder would also emit the
two per-architecture installers unless the pattern dropped `${arch}`.

### Alternative 2: A separate release job per Windows architecture

Rejected. Both jobs write `latest.yml`, so one upload would remove the other
architecture from the Windows feed.

### Alternative 3: Ship both voice helpers in each Windows app

Rejected. It roughly doubles the helper's size in every installer and needs a
runtime architecture switch when an install-time mapping already exists.

## References

- [ADR-108](108-use-host-owned-github-release-updates-for-official-desktop-builds.md)
- [SPEC-111](../specs/SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
- [Desktop release workflow](../../.github/workflows/desktop-release.yml)
- [Release asset validation](../../scripts/validate-release-assets.mjs)
