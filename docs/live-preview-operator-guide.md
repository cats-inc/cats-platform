# Cats Code Live Preview Operator Guide

> Operator-facing reference for the supervised live-preview substrate
> (PLAN-097 / SPEC-108, amended by SPEC-123). The host constructs the
> supervisor. Static previews are on by default. Child-process (dev server)
> previews stay off until the user turns on Settings > Code "Cats may run
> preview servers" or an operator opts in. This guide documents what the
> switches turn on, the supported profile list, the approved port range and
> the lifecycle expectations.

## TL;DR

- Default behavior: `livePreview.enabled = true`, and the host builds the
  supervisor (`createCodeLivePreviewSupervisor`).
  - Only the built-in `static` profile can start. It is an in-process loopback
    file server that serves one directory inside the workspace, so no process
    spawns.
  - Guards:
    - The `Host` header must match the leased origin.
    - Hidden and dot segments, traversal and symlink escapes are refused.
    - Only GET and HEAD are accepted, and responses are `no-store`.
  - Scripts run only inside the canvas iframe on that distinct origin.
  - Artifact Canvas grants the scripted profile only to the artifact that a
    ready lease names (`supervisor.attachArtifact`).
  - The host sweeps expired leases every minute and stops all previews on
    shutdown.
  - `CATS_CODE_LIVE_PREVIEW_ENABLED=false` disables every preview.
- Dev servers (SPEC-123 `start_dev_preview`) spawn real processes only
  through a reviewed profile, and only when one of these is on:
  - **User opt-in (default path).** Settings > Code "Cats may run preview
    servers" (`codePreviewServersEnabled` in `platform-preferences.json`,
    default off). The host registers the reviewed Vite profile and spawns
    through `createOptInProcessAdapter`, which re-reads the setting before
    every spawn. Turning it off (`POST /api/code/preview-settings`) stops
    every running dev preview.
  - **Operator opt-in.** `CATS_CODE_LIVE_PREVIEW_USE_REAL_PROCESS_ADAPTER=true`
    plus a profile in `CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES`, as before.
- The `start_dev_preview` tool also requires the Cat's session to have
  shell execution permission (permission mode `skip`, or a whitelist with
  a shell tool; CAP-08). A read-only session is refused with
  `shell_permission_required`, and a closed setting with
  `preview_servers_disabled`.
- The profile's `node` runs on the host's own runtime: `process.execPath`
  in development, and the Electron binary with `ELECTRON_RUN_AS_NODE=1` in
  packaged Desktop.

## Reviewed command profiles

Profiles are declarative — operators may not supply raw shell strings,
unsupported placeholders, or shell metacharacters. Validation
(`validateLivePreviewCommandProfile`) rejects all of those.

| Profile id | Status | Working dir | Executable + args | Stop policy | Notes |
|------------|--------|-------------|-------------------|-------------|-------|
| `vite` | Reviewed; disabled by default | `artifactDirectory` | `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port {port} --strictPort` | `5s` graceful, kill process tree | Bound to leased loopback port; readiness probes `/` for `200` within `30s`. Operators must install `vite` into the artifact directory's `node_modules` (or supply an alternative reviewed profile). |

The `vite` profile lives as `VITE_LIVE_PREVIEW_PROFILE` and is also exposed
as `BUILTIN_LIVE_PREVIEW_PROFILES`. The source ships with `enabled: false`.
With the user opt-in, the host registers an enabled copy (unless the
operator configured a profile with the same id). Operators can instead merge
it into `commandProfiles` (for example with
`CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES=[{...}]`) with `enabled: true`.

### npm-script profiles (PLAN-116 D3)

`NPM_SCRIPT_LIVE_PREVIEW_PROFILES` (`npm-script`, `npm-script:vite`,
`:astro`, `:next`, `:nuxt`, `:webpack`, `:parcel`) run
`node <npm-cli.js> run <script> [-- <port args>]` shell-free:
- `PORT` and `HOST=127.0.0.1` come from the environment, with `BROWSER=none`.
- Readiness probes `/` for `200` within 60 s.
- The user opt-in registers enabled copies, like the Vite profile.
- `findNpmCli` locates `npm-cli.js` from `npm_execpath`, next to the host
  runtime, or on PATH, in both the Windows (`<dir>/node_modules/npm`) and
  POSIX (`<prefix>/lib/node_modules/npm`) layouts.
- Packaged Desktop bundles no npm, so dev servers other than a directly
  installed Vite need the user's Node.js installation on PATH.

`start_dev_preview` chooses this profile only when the requested
`package.json` script runs Vite's dev server (`vite`, `vite dev` or
`vite serve`, with any flags; the profile supplies host and port) and
`node_modules/vite/bin/vite.js` exists in that directory. Otherwise it
returns `profile_unsupported` or `dependencies_missing` without spawning.

**Why `node` instead of `npx`:** the supervisor spawns with `shell: false`
to keep agent inputs from reaching a shell. On Windows, `npx` resolves
to a `.cmd` shim that requires `shell: true` to launch; using `node`
directly with the installed `vite/bin/vite.js` script keeps the spawn
shell-free on every platform. Operators must therefore install `vite`
into the artifact directory's `node_modules` (`cd <artifactDir> && npm
install vite`) before starting a preview, or define an equivalent
shell-free profile pointing at their preferred dev server entry.

## Port allocation

- Reserved range: `47100–47199` (TCP, loopback only)
- Each lease consumes one port from the range; default global concurrency
  is `3`, default per-workspace concurrency is `1`
- `127.0.0.1` is the canonical bind host; `[::1]` is opt-in via
  `CATS_CODE_LIVE_PREVIEW_ALLOW_IPV6_LOOPBACK=true`
- Before leasing a port the supervisor briefly binds it; a port that another
  program holds (for example a second Cats instance) is skipped
- Static (in-process) leases do not count toward the concurrency limits,
  which bound OS processes only

## Logs

- Each live preview captures stdout and stderr into a platform-owned log
  file, bounded by `CATS_CODE_LIVE_PREVIEW_LOG_MAX_BYTES` (default
  `1 MiB`)
- Logs are rotated/truncated at the limit; older content is dropped
- Log location: under the platform host's chat-state path, scoped per
  preview lease id
- Logs are never aggregated across leases or processes; one process per
  log file

## Lifecycle and stop behavior

| Event | Behavior |
|-------|----------|
| `start` | Supervisor leases a port from the configured range, validates the request, calls the process adapter's `spawn`, and probes readiness against the leased origin |
| `ready` | First successful readiness probe response materializes the artifact and emits `show_in_canvas` |
| `stop` (operator or expiry) | SIGTERM sent first; if the process has not exited within `stop.graceMs`, SIGKILL is escalated. With `killProcessTree: true`, the SIGTERM phase issues `taskkill /pid PID /T` on Windows (graceful tree close — no `/F`) or a process-group SIGTERM on POSIX; the SIGKILL phase escalates to `taskkill /pid PID /T /F` (force) on Windows or a process-group SIGKILL on POSIX |
| Process exits unexpectedly | Lease moves to `failed`; supervisor does not auto-restart. The canvas controls offer Restart for a dev server |
| Canvas shows the preview | The Code canvas controls renew the lease every 5 minutes; a static preview whose lease is gone restarts on the same artifact |
| Conversation's last session ends | Deleted: its previews stop at once. Closed: they stop after 60 seconds unless a new session starts |
| Platform shutdown | Supervisor stops all active previews with a default grace period |
| Platform start | Dev servers recorded in `<platform>/state/code-live-preview-processes.json` that are still alive and still hold their port are stopped (`taskkill /T /F`, or the process group on POSIX) |

## Security expectations

- Profiles are the only path through which executable + argv + working
  directory reach the spawn call. The supervisor passes `shell: false`
  to `child_process.spawn`, so shell metacharacters in any
  agent-supplied parameter would be inert even if validation missed
  them.
- The renderer iframe policy demotes preview origins that lack a
  matching supervisor lease to `static` (`isSupervisorOwnedPreviewOrigin`
  in `iframePolicy.ts`). A stale or hostile loopback server cannot
  inherit `scripted-cross-origin` privileges.
- All artifact materialization for previews carries the `preview_url`
  producer label and the supervisor lease metadata, so canvas-side audit
  tooling can attribute every preview artifact to a known supervised
  origin.
- The real process adapter never inherits the operator's terminal
  stdin; `stdio: ['ignore', 'pipe', 'pipe']` keeps the child silent on
  stdin and forwards bounded stdout/stderr only.

## Enabling real spawning

SPEC-123 question 1 (approved 2026-09-29) closes PLAN-097 Task 5.1: dev
previews run for sessions that already have shell execution permission,
behind the Settings > Code "Cats may run preview servers" switch. The
switch currently ships **off** until the user confirms the default. The
supervisor wiring is in the host (`createCodeLivePreviewSupervisor` with
`previewServersAllowed`).

For a scripted or operator-managed setup without the Settings switch:

1. Set `CATS_CODE_LIVE_PREVIEW_ENABLED=true`
2. Set `CATS_CODE_LIVE_PREVIEW_USE_REAL_PROCESS_ADAPTER=true`
3. Provide `CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES` with the reviewed
   Vite profile (or a reviewed equivalent) with `enabled: true`
4. Validate in a temporary workspace (PLAN-116 M2 acceptance closes
   PLAN-097 Task 5.4) before pointing it at real user dev state

The agent tool still checks the Settings switch, so an operator who wants
agents to start dev servers also turns that on.
