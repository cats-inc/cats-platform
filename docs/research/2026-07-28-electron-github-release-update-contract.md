# Electron and GitHub Release Update Contract

Date: 2026-07-28

## Topic

Official Electron/electron-builder and GitHub constraints that inform the Cats
Desktop update architecture.

## Repository Baseline

- Cats uses Electron and electron-builder.
- Windows packaging uses NSIS.
- macOS packaging includes DMG and ZIP.
- Linux packaging includes AppImage.
- A custom HTTPS JSON manifest checker exists, but download/install and
  user-facing update commands do not.
- GitHub Actions currently runs CI and manual npm publishing, not desktop
  release publication.
- The current desktop installer wrapper forces `--publish never`, disables
  signing identity auto-discovery, and filters empty signing credential
  variables. Windows packaging also sets `signAndEditExecutable: false`.
- The wrapper defaults both managed sidecars to `split`. Existing Windows
  cold-start evidence found a large loose-file penalty and a dramatic
  improvement for bundled `cats-platform`, although it did not formally isolate
  the exact Windows security-scanning component.
- Windows uses assisted NSIS (`oneClick: false`) with installation-directory
  changes enabled and `perMachine: false`.
- `assets/build/installer.nsh` overrides the stock install-mode behavior. Its
  `customInstallMode` macro sets `$isForceCurrentInstall`, which aborts the
  install-mode page before it draws, so this repository always installs
  per-user and never prompts for elevation. The macro documents why: the
  packaged provider setup helpers refuse to run elevated because every CLI
  provider Cats installs is user-scoped.
- The same file only deletes `%APPDATA%\Cats` and `%USERPROFILE%\.cats` when
  the user opts in on the uninstall page, and notes that a Windows upgrade runs
  the previous uninstaller silently. User state therefore survives an update.
- The repository currently has no Git tags. The package version is `0.1.1`;
  release preparation must query the registry again rather than assume the
  first available desktop version.

## External Findings

### electron-builder updater contract

The official electron-builder auto-update guide states:

- `electron-updater` supports GitHub Releases as a provider.
- electron-builder generates platform update metadata alongside artifacts.
- supported update targets include Windows NSIS, macOS, and Linux AppImage.
- macOS needs a ZIP target so macOS update metadata can be generated.
- macOS automatic updating requires signing.
- update events cover checking, available/current results, download progress,
  download completion, and errors.
- production applications should consume the generated provider configuration
  rather than accepting an arbitrary feed URL from renderer code.

Source:
[electron-builder Auto Update](https://www.electron.build/docs/features/auto-update/)

The official electron-updater API documents support for Windows NSIS, macOS,
and Linux updater implementations.

Source:
[electron-updater API](https://www.electron.build/docs/api/electron-updater/)

### Windows assisted installer and install handoff

The official NSIS configuration reference states:

- `oneClick: false` creates an assisted installer.
- `allowToChangeInstallationDirectory: true` allows the user to change the
  installation directory.
- with an assisted installer, `perMachine: false` shows an install-mode choice;
  it does not force per-user installation. Per-user is the default selection
  unless configured otherwise, while per-machine may require elevation.
- that stock behavior is what a project gets without an installer include.
  Cats does include one, so the repository baseline above governs instead.

Source:
[electron-builder NSIS](https://www.electron.build/nsis/)

The official updater API states that `quitAndInstall()` defaults to a
non-silent Windows install. It also documents that install-on-normal-quit is
enabled by default after an update has downloaded. Cats must therefore set
that behavior to false to preserve the explicit `Restart and Install`
contract.

Sources:

- [electron-updater BaseUpdater](https://www.electron.build/docs/api/electron-updater.class.baseupdater/)
- [electron-updater AppUpdater](https://www.electron.build/docs/api/electron-updater.class.appupdater/)

### Electron built-in updater distinction

Electron's built-in `autoUpdater` documentation supports macOS and Windows but
does not provide built-in Linux support. This makes `electron-updater` the
better fit for the requested Windows/macOS/Linux matrix already built with
electron-builder.

Source:
[Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/)

### GitHub Release behavior

GitHub Releases are based on Git tags and may attach binary release assets.
GitHub recommends draft-first asset collection when immutable releases are
enabled. This supports a release workflow where all platform artifacts are
uploaded and validated before a public stable release appears.

Sources:

- [GitHub: About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [GitHub: Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

## Implications for Cats

1. Use one host-owned `electron-updater` adapter instead of extending the
   custom JSON manifest into a second full update protocol.
2. Use Git tags as intentional release identity; ordinary CI commits do not
   need product version bumps.
3. Add an explicit release mode to the existing installer wrapper. Local
   packaging should retain `--publish never` and signing-safe defaults, while
   the protected tag workflow must preserve signing inputs and select a bounded
   publish mode.
4. Establish the repository's first version tag from a new reviewed release
   version after re-checking the npm registry; do not retroactively tag the
   current head as an older npm release.
5. Publish one primary user-facing artifact per OS:
   Windows NSIS, macOS DMG, Linux AppImage.
6. Build the official Windows artifact with an explicit
   `--sidecar-layout bundle` for both managed sidecars rather than inheriting
   the wrapper's `split` default.
7. Also attach the macOS ZIP and generated metadata required by the updater;
   these are support assets, not extra user-facing installer choices.
8. Gate production self-update on Windows/macOS signing and real old-to-new
   installed-app tests.
9. Keep update work in Electron main. Tray and Settings should consume one
   bounded capability/snapshot bridge.
10. Pair `app.isPackaged` with release-workflow provenance metadata; local
   packaged builds should not become official merely because they include a
   public GitHub provider configuration.
11. Do not expose desktop update controls to npm/browser installs.
12. Keep development and unofficial update controls hidden. Use injected test
    fixtures or packaged prereleases instead of an environment escape hatch.
13. On Windows, treat `Restart and Install` as handoff to the visible assisted
    installer, not a silent replacement. Disable automatic install on ordinary
    app quit.
14. Classify any existing unsigned installer as internal-only or define a
    deliberate unsigned-to-signed migration before calling it a supported
    baseline.
15. Start with stable releases and explicit manual download/install. Defer
   prerelease promotion and automatic startup checks until separately
   validated.

## Related Project Documents

- [ADR-108](../decisions/108-use-host-owned-github-release-updates-for-official-desktop-builds.md)
- [SPEC-111](../specs/SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
- [PLAN-101](../plans/PLAN-101-packaged-desktop-update-rollout.md)
- [Packaged desktop cold-start investigation](./2026-04-16-packaged-desktop-cold-start-investigation.md)

---

*Last updated: 2026-07-28*
