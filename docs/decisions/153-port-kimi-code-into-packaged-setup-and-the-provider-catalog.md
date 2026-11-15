# ADR-153: Port Kimi Code into Packaged Setup and the Provider Catalog

> Desktop installs, detects, upgrades and removes Moonshot AI's Kimi Code CLI with its own
> packaged helpers on Windows, macOS and Linux, and lists `kimi` after Pi and before Kiro
> wherever Cats orders providers.

## Status

Accepted, 2026-11-16, at the owner's request to port Kimi Code from environment-bootstrap
"completely": the Runtime playground, the Platform provider and model menus, and Desktop's
packaged scripts, placed after Pi and before Kiro. Implementation only; this does not
authorize a release or version bump.

## Context

- environment-bootstrap `4108ac8` (2026-11-13) added Kimi Code CLI to its Full mode on all
  three platforms. This ADR carries over what that change learned, not its files: Platform
  helpers follow the packaged check/apply/upgrade/force/uninstall JSON contract.
- The official installers are `https://code.kimi.ai/kimi-code/install.ps1` and
  `install.sh`, the global mirror. They put one ~160 MB binary in
  `~/.kimi-code/bin/kimi(.exe)` (`KIMI_INSTALL_DIR` replaces `~/.kimi-code`), add that
  directory to the user PATH unless `KIMI_NO_MODIFY_PATH` is set, rename an archived Python
  kimi-cli on PATH to `kimi-legacy`, and write a first-login region marker that is never
  overwritten. Config, credentials and sessions live in `~/.kimi-code` (`KIMI_CODE_HOME`).
- Without `KIMI_VERSION` the installers install whatever the plain-text endpoint
  `https://code.kimi.ai/kimi-code/latest` names (2.5.3 on 2026-11-16), and they always
  re-download, even when current.
- `install.ps1` ends its failure path with `Read-Host "Press Enter to exit"`.
- The Windows installer moves the old binary to `kimi.exe.bak`, or to `kimi.exe.<8 hex>.bak`
  when that backup is locked; Kimi's own start-up cleanup never removes the hex form. The
  Unix installer copies the old binary to `kimi.bak`.
- `kimi --version` starts the whole binary: 5 s measured on this machine, 9 to 30 s
  reported by environment-bootstrap on Windows.
- Kimi on Windows runs shell commands through Git for Windows' Git Bash
  (`KIMI_SHELL_PATH` overrides). `kimi.exe` 2.5.3 and the `fd.exe` it extracts into its bin
  directory name neither `vcruntime140` nor `msvcp140` (a byte search on 2026-11-16; Kimi
  has not yet been started on a clean Windows without the redistributable).
- Sign-in is `kimi login` (device-code flow); mainland China accounts sign in with
  `kimi login --region mainland-cn`.
- Runtime owns the `kimi` provider id, its adapter, install knowledge and model catalog
  (cats-runtime, a parallel change). Desktop's AI-tool rows, labels and install commands come
  from Runtime's provider universe, so Kimi appears in Desktop only with a Runtime that
  knows it.

## Decision

1. **Native helpers on three platforms.** `scripts/windows/Install-KimiCode.ps1` and
   `scripts/{linux,macos}/install-kimi-code.sh` are `provider_installer` setup assets with
   helper ids `<os>-kimi-native-installer`, staged like Devin's and Grok's. The Windows
   helper follows Devin's wrapper, the closest fit: a native vendor script run in a hidden
   child, a manual sign-in step and the shared uninstall. Claude Code's helper carries npm-shim
   and auth-probe machinery Kimi does not need.
2. **Only the fixed path counts.** Detection, version reads and verification look only at
   `${KIMI_INSTALL_DIR:-~/.kimi-code}/bin/kimi(.exe)`. A `kimi` that is only on PATH is
   reported missing, and uninstall never follows PATH.
3. **Never wait on a prompt.** The Windows installer runs in the existing
   `-NonInteractive` child, so its `Read-Host` throws and the step fails instead of hanging.
   The Unix installer is staged, refused unless it starts with a shebang and passes
   `bash -n`, and runs from its own scratch directory with stdin on `/dev/null`.
4. **Upgrade only when behind, judge by the result.** `-Upgrade` asks `KIMI_VERSION` or the
   `latest` endpoint, in the installer's order, and skips the download when current. A
   successful install is the version read afterwards. After a verified upgrade or reinstall
   the helpers remove the previous build: every unlocked `kimi.exe*.bak` on Windows,
   `kimi.bak` on macOS and Linux. On Windows a failed replacement that left only
   `kimi.exe.bak` is restored.
5. **Bound the slow probe.** The Windows version read times out after 60 s and runs only
   when a result needs it; packaged setup checks already allow 120 s.
6. **Leave the user's data.** Uninstall removes the binary, its backups and, in the default
   tree only, `fd.exe`. It never removes `~/.kimi-code`, which holds `config.toml`,
   credentials and sessions. PATH entries stay, like every other helper's.
7. **Say what is still owed.** A fresh install reports `kimi login` (and the mainland
   region form) as a manual step. A missing Git Bash on Windows is a warning, not a failure.
   Kimi joins `VC_RUNTIME_FREE_PROVIDERS`, so selecting it alone offers no Visual C++ step.
8. **One order everywhere.** `kimi` follows `pi` and precedes `kiro` in
   `PRODUCT_PROVIDER_ORDER` and `SETUP_PROVIDER_ORDER`, and before `kiro` in the
   first-run native-installer order. Its product target is `cli/native`, labelled
   "Kimi Code".

## Consequences

- The Unix helpers report the sign-in step on every mutation result, as Devin's do; the
  Windows helper reports it only after a fresh install.
- Kimi has no Desktop usage-quota refresh until Runtime offers a quota query.
- Kimi is in the session-delete warning list. Runtime deletes Kimi's native session through
  Kimi's own `kimi acp` `session/delete` (Runtime ADR-054), so deleting a conversation also
  removes Kimi's transcript, and that cannot be undone.
- Cats Bot keeps its five providers and its pinned copies of the shared Unix helpers.
- Verified on native Windows 11 on 2026-11-16:
  - `Install-KimiCode.ps1 -CheckOnly` reported the existing install, 2.5.3, under both Windows
    PowerShell 5.1 and PowerShell 7.
  - A real download in a throwaway `KIMI_INSTALL_DIR` and `KIMI_CODE_HOME`, with
    `KIMI_NO_MODIFY_PATH=1`, under PowerShell 7, ran check (missing), apply (installed 2.5.3,
    with the `kimi login` manual step), check (ready), `-Upgrade` (unchanged, no download),
    uninstall (removed `kimi.exe`) and check (missing).
  - The user PATH and the existing `~/.kimi-code/bin/kimi.exe` were unchanged afterwards.
  - A Platform server built from this change, backed by a Runtime with the `kimi` provider,
    listed pi, kimi and kiro in that order and served Kimi's six catalog models.
- Not verified:
  - an install that edits PATH;
  - the Unix helpers against the real installer (Linux ran in WSL bash with fixtures);
  - macOS.
