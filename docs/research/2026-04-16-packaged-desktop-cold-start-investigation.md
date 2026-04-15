# 2026-04-16 Packaged Desktop Cold-Start Investigation

Date: 2026-04-16
Topic: Investigate why the packaged Windows desktop app can spend 15-75 seconds
before `cats-runtime` / `cats-platform` emit their first lifecycle output, even
though direct packaged sidecar probes start in about 2 seconds
Source:
- `desktop/host/processSupervisor.ts`
- `desktop/host/main.ts`
- `desktop/host/env.ts`
- `desktop/host/packaging.ts`
- `scripts/build-desktop-installer.mjs`
- `src/shared/loadProjectEnvFile.ts`
- `src/app/server/startupTrace.ts`
- `cats-runtime/src/core/dotenv.ts`
- `cats-runtime/src/core/startupTrace.ts`
- `cats-runtime/src/shared/runtimePaths.ts`
- `cats-runtime/src/core/skills/catalog.ts`
- `cats-runtime/scripts/bundle-runtime.mjs`
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
the dominant delay first appeared to happen before the managed child process
entered JS startup code.

That first conclusion turned out to be incomplete. Later A/B evidence with a
single-file packaged `cats-platform` bundle showed that Windows packaged cold
start is highly sensitive to sidecar file layout as well as the host-managed
launch boundary.

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

## Installed-App Evidence

### Baseline: split `cats-platform` + split `cats-runtime`

From `cats.log.previous` and `cats-runtime.log.previous`:

- `cats-runtime`
  - host `spawned` at `2026-04-15T22:24:46.395Z`
  - first `runtime.startup_trace` at `2026-04-15T22:25:04.331Z`
  - `ready.message.emitted` at `2026-04-15T22:25:08.011Z`
  - host marked runtime ready at `2026-04-15T22:25:08.016Z`
- `cats-platform`
  - host `spawned` at `2026-04-15T22:25:08.098Z`
  - first `app.startup_trace` at `2026-04-15T22:26:22.270Z`
  - `ready.message.emitted` at `2026-04-15T22:26:22.441Z`
  - host marked platform ready at `2026-04-15T22:26:22.448Z`

Interpretation:

- `cats-runtime` spent about `18.0s` before entering `main()`, then about
  `3.7s` inside JS before emitting ready
- `cats-platform` spent about `74.2s` before entering `main()`, then only
  about `171ms` inside JS before emitting ready

### Updated run: bundled `cats-platform` + split `cats-runtime`

From the latest `cats.log` and `cats-runtime.log`:

- `cats-runtime`
  - host `spawned` at `2026-04-15T22:30:26.706Z`
  - first `runtime.startup_trace` at `2026-04-15T22:30:42.829Z`
  - `ready.message.emitted` at `2026-04-15T22:30:44.018Z`
  - host marked runtime ready at `2026-04-15T22:30:44.024Z`
- `cats-platform`
  - host `spawned` at `2026-04-15T22:30:44.108Z`
  - first `app.startup_trace` at `2026-04-15T22:30:46.777Z`
  - `ready.message.emitted` at `2026-04-15T22:30:47.090Z`
  - host marked platform ready at `2026-04-15T22:30:47.096Z`

Interpretation:

- `cats-runtime` is still slow on Windows packaged cold start:
  about `16.1s` before entering `main()`, then about `1.2s` inside JS
- bundled `cats-platform` improved dramatically:
  about `2.7s` before entering `main()`, then about `314ms` inside JS

### Practical delta

The strongest A/B result from the current evidence is:

- split `cats-platform`: about `74.4s` total host-managed startup
- bundled `cats-platform`: about `3.0s` total host-managed startup

That is too large to treat as noise or as a pure host-supervisor artifact.

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

Those probes still rule out:

- general `Cats.exe` cold-start cost by itself
- ordinary packaged `app-managed` startup for either sidecar when launched
  outside the desktop-host flow

But they do **not** fully rule out Windows security scanning costs amplified by
the managed packaged process tree and by large loose-file sidecar layouts.

## Updated Conclusion

The earlier conclusion was too strong.

It is still true that the worst Windows packaged delay happens before the child
starts executing its own JS entrypoint. But the later bundle A/B shows that the
sidecar file layout materially changes that pre-JS delay.

Current best conclusion:

- the packaged Windows cold-start problem is not caused by onboarding/setup UI
  work, model catalog work, or normal JS bootstrap logic after `main()`
- the dominant cost is tied to the Windows packaged launch path **before**
  `main()`
- that cost is strongly amplified when the sidecar is shipped as many loose JS
  files
- collapsing `cats-platform` into a single packaged bundle removes almost all
  of its previous `74s` cold-start penalty
- `cats-runtime` remains slow because it is still shipped as a loose-file tree

This invalidates the older assumption that `cats-platform` import-graph shape
was irrelevant. It appears highly relevant on Windows once the packaged host is
spawning managed `Cats.exe` children under `ELECTRON_RUN_AS_NODE`.

## Strongest Working Hypothesis

The strongest working hypothesis is now:

- Windows packaged host-managed startup is paying a large pre-JS-entry scanning
  cost
- that scanning cost is much worse for loose-file sidecars than for a single
  bundled sidecar
- the likely trigger is Windows security scanning of the managed packaged child
  process and its file reads, not `cats-platform` application logic itself

This note does **not** claim to have formally proven whether the main driver is
Microsoft Defender real-time protection, SmartScreen reputation checks, or a
related Windows security layer. But the current evidence fits Defender-style
on-access scanning better than an onboarding/runtime logic explanation.

Supporting evidence outside the raw logs:

- temporarily disabling Windows protection reportedly brought startup much
  closer to macOS/Linux behavior on the same machine
- bundling only `cats-platform` removed almost all of its cold-start penalty
  while the still-split `cats-runtime` remained slow

## What Is Still Not Proven

This investigation still has not formally proven the exact Windows subsystem
responsible for the cost.

It is still unknown:

- exactly how much of the delay comes from Defender real-time protection versus
  other Windows reputation/scanning layers
- whether signing alone materially reduces the loose-file sidecar penalty
- whether bundling `cats-runtime` produces the same near-elimination of delay
  already seen for `cats-platform`

## Repro and Control Surface

The packaging flow now has an explicit sidecar-layout switch so the A/B can be
repeated intentionally instead of implicitly depending on whichever build
artifacts happen to exist:

- `npm run desktop:package:windows -- --sidecar-layout split`
- `npm run desktop:package:windows -- --sidecar-layout bundle`
- `node scripts/build-desktop-installer.mjs --target macos --arch x64 --format dmg --sidecar-layout split`
- `node scripts/build-desktop-installer.mjs --target linux --arch arm64 --format deb --sidecar-layout bundle`

The same `split|bundle` choice now flows through both `cats-platform` and
`cats-runtime`.

## Recommended Next Steps

1. Bundle `cats-runtime` and repeat the same Windows packaged A/B so runtime is
   no longer the uncontrolled loose-file variable.
2. Collect a Defender Performance Analyzer trace during a cold packaged start
   to move the current security-scanning hypothesis from plausible to proven.
3. Compare signed versus unsigned packaged builds only after the runtime bundle
   A/B is available, so signing is not confounded with the current split
   runtime layout.
4. Keep the explicit `split|bundle` packaging flag so macOS/Linux can stay on
   the original layout while Windows uses the faster bundled layout if needed.

## Status

This investigation is still not finished, but it has now established two
important things:

- the original 74-second `cats-platform` delay was not caused by onboarding or
  post-`main()` app bootstrap logic
- shipping the platform sidecar as a single packaged JS bundle nearly removes
  that delay on Windows
