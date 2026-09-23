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
already exited, so the investigation does **not** establish which earlier
launcher set the flag. In particular, it does not attribute it to Electron,
autostart, or an agent sandbox without that evidence.

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
a corrupt download, a failed package install, or a quit/relaunch defect.

## Recovery and acceptance

The restricted host was fully stopped through Tray. The original, unmodified
0.3.8 was relaunched as UID 1000 from a normal environment (`NoNewPrivs: 0`).
No profile/cache deletion, package replacement, permission change, security-policy
change, version bump or publication was performed.

Its real updater again reused the cached 0.4.0 archive, drained both services,
and successfully opened the normal polkit authentication dialog. At the time of
this initial note, authentication and final installed-version/profile/menu
acceptance are pending. Do not count this as a completed upgrade yet.

## Validation limits

- No application code changed, so no code regression test or build was needed.
  The relevant validation is the installed-process A/B reproduction above.
- Linux's official release-ready allowlist is unchanged by this investigation.
- Windows/macOS results and the complete cross-platform failure/retry matrix are
  outside this machine's evidence.
