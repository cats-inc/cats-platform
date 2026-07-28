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
3. Publish one primary user-facing artifact per OS:
   Windows NSIS, macOS DMG, Linux AppImage.
4. Also attach the macOS ZIP and generated metadata required by the updater;
   these are support assets, not extra user-facing installer choices.
5. Gate production self-update on Windows/macOS signing and real old-to-new
   installed-app tests.
6. Keep update work in Electron main. Tray and Settings should consume one
   bounded capability/snapshot bridge.
7. Pair `app.isPackaged` with release-workflow provenance metadata; local
   packaged builds should not become official merely because they include a
   public GitHub provider configuration.
8. Do not expose desktop update controls to npm/browser installs.
9. Start with stable releases and explicit manual download/install. Defer
   prerelease promotion and automatic startup checks until separately
   validated.

## Related Project Documents

- [ADR-108](../decisions/108-use-host-owned-github-release-updates-for-official-desktop-builds.md)
- [SPEC-111](../specs/SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
- [PLAN-101](../plans/PLAN-101-packaged-desktop-update-rollout.md)

---

*Last updated: 2026-07-28*
