# Cats Code Live Preview Operator Guide

> Operator-facing reference for the supervised live-preview substrate
> (PLAN-097 / SPEC-108). The substrate is **disabled by default** and stays
> disabled until an operator opts in via two independent flags. This guide
> documents what those flags turn on, the supported profile list, the
> approved port range, and the lifecycle expectations.

## TL;DR

- Default behavior: nothing spawns. `livePreview.enabled = false` blocks
  every code path that would call `LivePreviewSupervisor.start`. The
  process adapter is also inert, so even an accidental supervisor wiring
  cannot spawn.
- Real spawning requires **all** of these to be true:
  1. `CATS_CODE_LIVE_PREVIEW_ENABLED=true`
  2. `CATS_CODE_LIVE_PREVIEW_USE_REAL_PROCESS_ADAPTER=true`
  3. At least one approved command profile registered (start with the
     reviewed Vite profile, see below)
  4. The supervisor is wired with the real adapter via
     `selectLivePreviewProcessAdapter(config)` (Phase 5 finalization
     work; not enabled by default at the platform host level)
- PLAN-097 Task 5.1 security review and Task 5.4 isolated end-to-end
  validation must complete before any production-style operator turns
  these on against real workspaces.

## Reviewed command profiles

Profiles are declarative — operators may not supply raw shell strings,
unsupported placeholders, or shell metacharacters. Validation
(`validateLivePreviewCommandProfile`) rejects all of those.

| Profile id | Status | Working dir | Executable + args | Stop policy | Notes |
|------------|--------|-------------|-------------------|-------------|-------|
| `vite` | Reviewed; disabled by default | `artifactDirectory` | `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port {port} --strictPort` | `5s` graceful, kill process tree | Bound to leased loopback port; readiness probes `/` for `200` within `30s`. Operators must install `vite` into the artifact directory's `node_modules` (or supply an alternative reviewed profile). |

The `vite` profile lives as `VITE_LIVE_PREVIEW_PROFILE` and is also exposed
as `BUILTIN_LIVE_PREVIEW_PROFILES`. Operators must explicitly merge it
into `commandProfiles` (e.g., via
`CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES=[{...}]` or by code-level
config composition) and set `enabled: true` on the profile entry — the
source ships with `enabled: false` so a bare merge stays dormant.

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
- Conflicts with non-Cats services in the same range are not auto-detected
  beyond the registry check below — keep this range free of unrelated
  development servers

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
| Process exits unexpectedly | Lease moves to `failed`; supervisor does not auto-restart. Operator may inspect logs and start a fresh lease |
| Platform shutdown | Supervisor stops all active previews with a default grace period; orphan processes are best-effort cleaned up via the same `taskkill` / process-group path |

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

## Enabling real spawning (manual, after security approval)

This guide does **not** enable real spawning by itself. Even with both
env vars on, the platform host wiring still has to construct a
supervisor with the real adapter. Today the platform host wires only
the lease store; supervisor construction is left as an explicit
follow-up because the security review (Task 5.1) and isolated E2E
validation (Task 5.4) are operator responsibilities that depend on the
target environment.

To enable in a manual / scripted setup:

1. Confirm Task 5.1 security review has passed for your environment
2. Set `CATS_CODE_LIVE_PREVIEW_ENABLED=true`
3. Set `CATS_CODE_LIVE_PREVIEW_USE_REAL_PROCESS_ADAPTER=true`
4. Provide `CATS_CODE_LIVE_PREVIEW_COMMAND_PROFILES` with the reviewed
   Vite profile (or your reviewed-and-approved equivalent), and set
   `enabled: true` on that profile entry
5. In your platform host wiring, build a `LivePreviewSupervisor` using
   `selectLivePreviewProcessAdapter(config.codeLivePreview)` and pass it
   to the dependencies that surface `livePreviewStore` /
   `stopLivePreview`
6. Run Task 5.4 isolated validation in a temporary workspace before
   pointing the supervisor at real user dev state
7. Watch the bounded log files and platform health endpoints for
   orphan-process indicators after first run

If any of these steps cannot complete, leave `useRealProcessAdapter`
off; the inert adapter will refuse to spawn and the rest of the
substrate (lease store, projection, canvas integration) continues to
work for fake-adapter-driven tests and demos.
