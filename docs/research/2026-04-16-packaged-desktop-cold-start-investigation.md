# 2026-04-16 Packaged Desktop Cold-Start Investigation

Date: 2026-04-16
Topic: Investigate why the packaged Windows desktop app can spend 15-75 seconds
before `cats-runtime` / `cats-platform` emit their first lifecycle output, even
though direct packaged sidecar probes start in about 2 seconds
Source:
- `desktop/host/processSupervisor.ts`
- `desktop/host/main.ts`
- `desktop/host/env.ts`
- `src/shared/loadProjectEnvFile.ts`
- `src/app/server/startupTrace.ts`
- `cats-runtime/src/core/dotenv.ts`
- `cats-runtime/src/core/startupTrace.ts`
- `tests/desktop-supervisor.test.js`
- `tests/desktop-env.test.js`
- `tests/project-env-file.test.js`
- `cats-runtime/tests/dotenv.test.ts`
- Installed-app diagnostics under:
  - `~/.cats/desktop/logs/cats.log`
  - `~/.cats/desktop/logs/cats-runtime.log`

## Problem Statement

The packaged Windows desktop app can take much longer than macOS/Linux or
direct packaged probes to reach the first usable screen.

The original suspicion was that onboarding/setup audit or model-catalog work
was blocking startup. After adding host spawn timing and phase trace probes,
the dominant delay proved to happen before the managed child process enters JS
startup code.

## Trace Delivery Follow-Through

The first startup-trace patch was incomplete for packaged installs.

- desktop host originally loaded only `process.cwd()/.env`
- `cats-platform` originally loaded only `process.cwd()/.env`
- `cats-runtime` originally loaded only `process.cwd()/.env`

For packaged installs, repo-local `.env` files were therefore irrelevant and
the trace flags did not actually reach installed child processes.

The follow-up fix changed packaged env loading to:

- desktop host: `~/.cats/desktop/.env`
- `cats-platform`: `~/.cats/platform/config/.env`
- `cats-runtime`: `~/.cats/runtime/config/.env`

After that fix, both installed logs emitted structured startup phase traces.

## Latest Installed-App Evidence

### `cats-runtime`

From the latest `cats-runtime.log`:

- host `spawned` at `2026-04-15T20:49:44.601Z`
- first `runtime.startup_trace` at `2026-04-15T20:49:59.970Z`
- first stdout at `2026-04-15T20:50:00.213Z`
- `ready.message.emitted` at `2026-04-15T20:50:01.265Z`
- host marked runtime ready at `2026-04-15T20:50:01.270Z`

Interpretation:

- about `15.4s` elapsed before the runtime even entered `main()`
- once inside JS startup, readiness took about `1.3s`

### `cats-platform`

From the latest `cats.log`:

- host `spawned` at `2026-04-15T20:50:01.357Z`
- first `app.startup_trace` at `2026-04-15T20:51:15.586Z`
- `server.listen.ready` at `2026-04-15T20:51:15.746Z`
- `ready.message.emitted` at `2026-04-15T20:51:15.746Z`
- host marked platform ready at `2026-04-15T20:51:15.754Z`

Interpretation:

- about `74.3s` elapsed before the sidecar even entered `main()`
- once inside JS startup, readiness took about `160ms`

## Direct Probe Results

Installed `Cats.exe` was probed directly from the shell to separate child-app
cost from desktop-host-managed launch cost.

The probes showed:

- `Cats.exe -e "console.log('probe-ok')"` returns in about `122ms`
- `Cats.exe resources/app-sidecar/build/server/index.js --help` returns in
  about `189ms`
- direct `app-managed` `cats-platform` probe with packaged paths/env returns in
  about `2.0s`
- direct `app-managed` `cats-runtime` probe with packaged paths/env returns in
  about `2.3s`

Those probes rule out:

- general `Cats.exe` cold-start cost
- sidecar JS entry/import graph as the source of the 74-second delay
- runtime JS bootstrap as the source of the 15-second delay
- ordinary packaged `app-managed` startup for either sidecar when launched
  outside the desktop-host flow

## Current Conclusion

The dominant cold-start delay is not inside `cats-platform` or `cats-runtime`
application code.

The dominant delay sits between:

1. desktop host spawning the managed child process, and
2. the managed child beginning JS execution (`main.entered`)

In short:

- `cats-runtime` is mostly blocked before JS entry
- `cats-platform` is almost entirely blocked before JS entry

This also rules out prior suspects such as:

- onboarding/setup wizard rendering
- setup readiness audit execution
- model-catalog discovery
- provider scan logic inside `cats-platform`
- runtime bootstrap logic inside `cats-runtime`

## Strongest Working Hypothesis

The evidence points to a Windows/Electron host-managed child-launch problem
rather than an app-code problem.

The remaining likely buckets are:

- parent GUI `Cats.exe` spawning same-binary managed children under
  `ELECTRON_RUN_AS_NODE`
- a Windows-specific launch/scanning cost that only appears in the host-managed
  process tree
- a host-only environment/launch-context difference not present in shell probes

## What Is Still Not Proven

This investigation has not yet proven the exact sub-cause inside that
boundary. It has only narrowed the problem to the pre-JS-entry launch phase.

It is still unknown whether the main cost is:

- Windows process launch/scanning behavior
- Electron main-process spawning behavior
- a specific host-only env difference
- something tied to the packaged process tree when the GUI host is already
  alive

## Recommended Next Steps

1. Add another host probe immediately around the raw `spawn()` call to record
   the exact command, cwd, and a bounded env fingerprint for the managed child.
2. Run an A/B experiment where the desktop host starts sidecars through a
   bundled plain-Node launcher instead of `process.execPath` / `Cats.exe`.
3. Compare the same packaged build with:
   - GUI host spawning managed children
   - a shell-launched probe using the exact same args/env/cwd
4. If the plain-Node launcher removes the delay, treat the issue as an
   Electron/Windows host-child launch-path problem, not a sidecar problem.

## Status

This investigation is not finished, but it has already invalidated the earlier
assumption that `cats-platform` startup logic itself was responsible for the
74-second delay.
