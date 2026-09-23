# Linux Self-Update Investigation (0.3.8 to 0.4.0)

Date: 2026-09-23

## Scope and builds

Investigate the installed application's "downloaded" followed by
`install_handoff_failed` report on the Linux ARM64 machine. A downloaded asset,
old-host exit, or successful packaging CI does not establish an upgrade.

| Item | Observed value |
| --- | --- |
| Host | Linux aarch64, Debian arm64, Wayland |
| Original Desktop | 0.3.8 preview, `/opt/Cats/cats`, UID 1000, PID 27119 |
| Installed package before retry | `cats 0.3.8 arm64`, `install ok installed` |
| Embedded source commit | `d24a03708567545823c9f2b52b0274c11f461d7f` |
| Bundled Runtime before upgrade | 0.1.28 |
| Updater actually loaded by 0.3.8 | electron-updater 6.8.9 |
| Target | Desktop 0.4.0 preview; Runtime 0.2.0; Usage 0.3.0 |
| Target Platform commit | `2874dd0eba8625c1a7086f65aea47dd2a63d60ac` |
| Target Runtime commit | `edfec394951200702b9a88b4f9d76d97669b9be8` |

The [published release](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.0)
and its `latest-linux-arm64.yml` name `Cats-0.4.0-arm64.deb`, size 95012916 bytes.
The actual cached archive's SHA-512 matches both the published metadata and
`pending/update-info.json`:

```text
CcUxz9DP/plqRJ1q372BI5q70QcT1QMngZNElm+IKZCCqVBEjnBK8EwMLpZJwE/keYgtR9szsr9UrDMfB20+zg==
```

Inspection used the installed `app.asar`, including its release descriptor and
updater dependency. Its `LinuxUpdater.js`, `DebUpdater.js`, and `BaseUpdater.js`
are byte-identical to the checkout's 6.8.9 dependency. It did not substitute the
0.4.0 source tree for the running 0.3.8 implementation.

## Preserved evidence

Private evidence is under the parent workspace's
`.cats-update-evidence/20260923-linux/`, outside every member repository. The
directory is owner-only and is not suitable for publication: profile copies and
full service logs can contain private data. Only this sanitized account belongs
in Git.

Before stopping Cats, the investigation preserved:

- `~/.cats`, `~/.config/Cats`, and the complete `~/.cache/cats-updater`.
- The installed 0.3.8 `app.asar`, extracted updater implementation and descriptor.
- Original main/sidecar process status, command lines and cgroups; profile hashes.

The original host's stdout and stderr both pointed to `/dev/null`. There was no
`desktop-host.log`; the original click's text cannot be recovered from that sink.
The full error below was captured by a controlled reproduction of the observed
process restriction with the same unmodified installed application and cache.

## Root cause and reproduction

The original main process had `NoNewPrivs: 1`, `Seccomp: 0`, UID 1000.
`/usr/bin/pkexec` was correctly owned by root with mode `4755`. The desktop
compositor, panel and user systemd manager had `NoNewPrivs: 0`; a normal terminal
launch of the same installed Cats also had `NoNewPrivs: 0`.

Linux's [no_new_privs contract](https://docs.kernel.org/userspace-api/no_new_privs.html)
prevents setuid execution from gaining privileges. The flag is inherited and
cannot be cleared by the affected process. The original process's parent had
already exited, so there is no historical trace of its flag setter. However,
the subsequent real upgrade and isolated native reproduction below establish
that the shipped Electron relaunch path introduces exactly this restriction.
There is no evidence attributing this incident to an agent sandbox or autostart.

After a normal Tray Quit, the same installed executable was started with
`setpriv --no-new-privs`, reproducing the saved flag. The existing renderer bridge
performed check, download and restart/install with an explicit 0.4.0 target
assertion. The updater reused the existing verified cache.

At 2026-09-23 14:33:33 UTC:

1. Platform 0.3.8 and Runtime 0.1.28 both emitted their normal stopped events,
   with reason `stdin_closed`.
2. The updater invoked `pkexec --disable-internal-agent /bin/bash -c 'dpkg -i ...'`.
3. `pkexec` failed before executing the package manager:

   ```text
   pkexec must be setuid root
   Command pkexec exited with code 127
   ```

4. electron-updater's generic dpkg fallback attempted `apt-get install -f -y`
   through the same `pkexec`; it failed with the same error and exit code.
5. Runtime and Platform restarted successfully. The host reported:

   ```text
   [desktop-update] install handoff failed: Command pkexec exited with code 127
   ```

6. The snapshot retained `status: downloaded`, `currentVersion: 0.3.8`,
   `availableVersion: 0.4.0`, `error.code: install_handoff_failed`.
   The dpkg database stayed at 0.3.8 and its log showed no new install.

Thus this failure is in privilege acquisition, after successful service drain
and before dpkg/apt execution. It is not evidence of a cross-minor version block,
a corrupt download or a failed package install. The later successful retry
exposed the relaunch defect that makes this restriction recur.

## Recovery and acceptance

The restricted host was fully stopped through Tray. The original, unmodified
0.3.8 was relaunched as UID 1000 from a normal environment (`NoNewPrivs: 0`).
No profile/cache deletion, manual package replacement, permission change,
security-policy change, version bump or publication was performed.

Its real updater again reused the cached 0.4.0 archive, drained both services,
and successfully opened the normal polkit authentication dialog. The user
authenticated in that dialog; no password passed through the diagnostic session.

The dpkg log records `upgrade cats:arm64 0.3.8 0.4.0` at 22:48:28 Asia/Taipei
and `status installed cats:arm64 0.4.0` at 22:49:05. At that time the old host
exited and PID 116371 automatically started `/opt/Cats/cats` as UID 1000.
Its renderer update snapshot reported `currentVersion: 0.4.0`. Runtime health
reported 0.2.0/ready; Platform health reported 0.4.0/ready. The installed release
descriptor matched the target Platform and Runtime commits above. The Usage
registry reported 0.3.0, enabled, `packageSource: desktop-bundle`, no error.

This is a successful **automatic 0.3.8 to 0.4.0 package upgrade**, following
recovery of the old host's launch environment. No manual dpkg/apt recovery was
used. Two defects in the shipped code remain material to the result:

1. The normal source host was `NoNewPrivs: 0`, but its automatically relaunched
   replacement was `NoNewPrivs: 1`. Without a normal cold launch, the next update
   would encounter the same pkexec restriction.
2. Authentication took longer than the five-minute watchdog. Upstream's
   synchronous installer blocked the event loop; after dpkg completed, the
   expired timer ran before the queued quit. It logged
   `installer handoff timed out in an uncertain state` and exited through the
   existing uncertain-handoff path. Relaunch still completed. A subsequent
   destroyed-window IPC diagnostic was a consequence of that forced exit, not
   evidence that the package installation failed. The diagnostic client's own
   45-second CDP timeout also did not cancel the ongoing installer.

## Relaunch reproduction and source repair

The repo's Electron 41.2.0 executable and installed `/opt/Cats/cats` had identical
SHA-256 `b4baa43eb216e30586d576ba52389d2a91547f8c07951ab8e09db34ce9a75386`.
An isolated minimal app with a disposable profile recorded NNP 0 on first
launch and NNP 1 after `app.relaunch()`. No Cats profile or package was involved.

Electron's [v41.2.0 relauncher source](https://github.com/electron/electron/blob/v41.2.0/shell/browser/relauncher.cc)
starts the helper with default launch options. The
[Linux helper](https://github.com/electron/electron/blob/v41.2.0/shell/browser/relauncher_linux.cc)
allows new privileges only for its subsequent launch; that cannot undo a flag
already inherited by the helper. The local native probe confirms the resulting
0-to-1 transition rather than relying solely on source inspection.

The source repair:

- Uses a detached Node helper for Linux update/setup relaunch. It inherits the
  host's UID and restriction, waits for the host-owned stdin pipe to close during
  shutdown, then launches the same executable/arguments without Node mode. It
  neither adds nor removes NNP and does not alter renderer sandboxing or polkit.
- Specializes DebUpdater's relaunch callback after normal construction, retaining
  the real Electron HTTP executor. Passing a custom upstream AppAdapter through
  the constructor would instead disable that executor and break downloads.
- Starts the quit watchdog after `quitAndInstall` returns if no terminal event
  has arrived. Time in synchronous polkit/dpkg no longer consumes the quit budget;
  asynchronous stalled handoffs remain bounded.

These changes are repository code only. The published/installed 0.4.0 artifact
does **not** contain them, and no new Desktop release was created. A normal
cold launch is still needed to recover an already-restricted installed host.

The final installed-app cold launch was `/opt/Cats/cats`, PID 132799, UID 1000,
NNP 0. Both managed services were healthy at the versions above. Temporary
remote-debugging arguments were removed and port 9333 was confirmed closed.

## Profile and model acceptance

- Platform preferences/auth secret, Runtime providers/management settings and
  bundled-template seed bookkeeping stayed byte-identical to the initial backup.
- Runtime migrated the real catalog from schema 1 to 2. Exactly one unique raw
  backup was created, byte-identical to the original. All 16 catalog scopes,
  model order/display labels, default markers and supplied context limits were
  preserved (including the nested Goose/Pi lists). The final cold restart kept
  the migrated file byte-identical and the backup count at one.
- The actual renderer displayed Claude's four models and Low/Medium/High/xHigh/
  Max/Ultracode controls, with Opus 5 and High defaults. Codex's API returned its
  five models and gpt-6-astra default. The 15 available providers returned normal
  and advanced catalogs successfully. Devin has no currently usable target and
  returns `provider_target_unavailable`; its six catalog entries were preserved.
  This investigation did not install/authenticate another provider or run paid
  model requests.

## Validation limits

- `npm run build:host` passed.
- 125 focused tests passed, including update manager/adapter/handoff/IPC/dialog/
  contract/preload coverage and real process/Electron relaunch tests. The opt-in
  Electron checks used disposable profiles on this Linux desktop: NNP 0→0 and
  1→1, reacquired singleton lock, original arguments, one replacement, and live
  ElectronHttpExecutor. This is not a full-suite claim.
- The new watchdog regression fails against the pre-fix adapter with
  `DesktopInstallHandoffTimeoutError` and passes against the repair.
- Independent code review found no blocking issues; process tests have bounded
  timeouts. Full CI and a future released-version-to-released-version test of
  the repaired updater remain separate gates.
- Linux's official release-ready allowlist is unchanged by this investigation.
- Windows/macOS results and the complete cross-platform failure/retry matrix are
  outside this machine's evidence.
