# PLAN-103: Packaged Provider Helper Smoke Verification

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Blocked — waiting on a built desktop package |
| **Owner** | User |
| **Assigned To** | Unassigned |
| **Reviewer** | User |

## Related Spec

[SPEC-112: Grok, Devin, Cline, and Aider in Packaged Setup and the Setup Provider Inventory](../specs/SPEC-112-grok-devin-cline-aider-in-packaged-setup-and-provider-catalog.md)

## Why this exists

PLAN-102 ported Grok, Cline, Devin, and Aider into packaged setup and extended the smoke
suites to cover them. Those smoke assertions have never run against a **built package with
real installers** — only the unit and contract tests have. Every claim about how the helpers
behave on a packaged host is therefore inferred from source, not observed.

This is a deferred verification, not unfinished implementation. It is filed separately so
the gap stays visible rather than living only in a commit message.

## What is already verified

Do not redo these.

- The helper scripts parse (`bash -n`, PowerShell `Parser::ParseFile`).
- Packaging plans, setup-asset registration, desktop contracts, the inventory probe, and the
  product execution catalog are covered by `npm test` (4211 passing).
- The Devin installer strip is verified against the live installers: `install.sh` is 286
  lines ending in `"$VERSION_DIR/bin/$COMPILED_BIN_NAME" setup`, `setup.ps1` is 234 lines
  ending in `& $EntryExe setup`, each the only such line, and the patched output still
  parses on both platforms.

## What is not verified

Everything that only a packaged host exercises:

- That the staged helpers are present and executable in a built package at the paths the
  smoke scripts assert.
- That `--check` / `-CheckOnly` returns valid JSON from inside the package.
- That `--dry-run` previews without mutating.
- That an **apply** actually installs each CLI on a clean host, and that the JSON reports
  what happened.
- That Devin's apply surfaces the `devin auth login` manual step and never reports ready.
- That Aider's uninstall removes the tool via `uv tool uninstall aider-chat` rather than
  leaving it behind a deleted shim.
- That the superseded-package removal fires when the abandoned Pi package is actually
  installed.

## Precondition

A built desktop package for at least one platform:

```
npm run build:desktop-package      # or the platform Build-DesktopPackage / build-desktop-package script
```

The smoke scripts take the app root as their first argument and default to the usual release
paths.

## Procedure

1. Build the package for the host platform.
2. Run the existing smoke script for that platform:
   - `scripts/windows/Test-WindowsInstallerSmoke.ps1`
   - `scripts/linux/test-linux-package-smoke.sh`
   - `scripts/macos/test-macos-package-smoke.sh`
3. On a host where the CLI is **not** already installed, run each helper's real apply from
   the packaged path, then its uninstall. Record the JSON for each mode.
4. Confirm the mode-specific expectations below.

Step 3 is the part that has never been done. Steps 1–2 mostly re-run assertions that already
pass in CI form.

## Pass criteria

- Every helper returns well-formed JSON in `--check`, `--dry-run`, apply, and uninstall.
- `--dry-run` leaves the filesystem unchanged.
- Devin's apply result carries `devin auth login` in `manualSteps` and does **not** report a
  ready/authenticated state.
- Devin's uninstall removes both the entry point and the versioned tree.
- Aider's uninstall leaves `aider --version` failing, and warns that the bundled `uv` was
  left in place.
- Cline installs, upgrades, and uninstalls through the npm pack on all three platforms.
- With the abandoned `@mariozechner/pi-coding-agent` installed beforehand, a Pi apply removes
  it and installs `@earendil-works/pi-coding-agent`.

## Known risks this would catch

- A helper staged at a path the smoke script does not assert, or asserted at a path the
  packager does not stage.
- The Devin strip failing against a future upstream installer shape — the helper is designed
  to refuse rather than run, so this would surface as a clean failure, not a hang.
- `uv` being absent on a host where Aider was installed, making uninstall fall back to shim
  removal only.

## If it fails

Prefer fixing the helper over loosening the smoke assertion. The assertions encode
behaviour that was deliberately chosen (refuse rather than run an unrecognised installer,
never claim Devin is ready, never remove a `uv` of unknown provenance); a failing assertion
is more likely to be a real regression than an over-strict test.

## Related

- [PLAN-102: Grok, Devin, Cline, and Aider Packaged Setup Rollout](./PLAN-102-grok-devin-cline-aider-packaged-setup-rollout.md)
- [SPEC-112](../specs/SPEC-112-grok-devin-cline-aider-in-packaged-setup-and-provider-catalog.md), [ADR-109](../decisions/109-port-grok-devin-cline-aider-installers-into-packaged-setup.md)
- cats-runtime PLAN-035 — the other deferred verification from this slice

---

*Created: 2026-08-09*
*Author: User, with Claude support*
