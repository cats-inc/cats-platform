# ADR-145: Keep Bounded Production Desktop Host Diagnostics

## Status

Accepted — 2026-11-02. The owner requested the Desktop follow-up to Cats Bot's
production diagnostics and explicitly excluded crash dumps.

## Context

Desktop already captures its Platform/Runtime sidecars' stdout/stderr, but its
outer Electron host mostly wrote to stderr. Window disappearance, graphics
process loss and monitor changes need local evidence from installed builds.
Existing service logs rotated per launch but had no size bound within a run.

## Decision

- The primary Desktop writes `host.log` in its existing host log directory:
  normally `~/.cats/desktop/logs`, or `<CATS_DESKTOP_DIR>/logs`. Initialize after
  the single-instance lock, before readiness and candidate port preflight.
  A validated candidate uses only its own log directory. Pre-lock/native failures
  may leave no host record; a secondary launch is logged by an early primary listener.
- Default INFO records startup/exit, launch mode, bootstrap phases, service
  status/PID/exit codes, window lifecycle/geometry, display topology and scale,
  renderer/GPU exits, suspend/resume and shutdown/watchdog outcomes.
  `CATS_DESKTOP_LOG_LEVEL=trace|debug|info|warn|error` is read at launch; invalid
  values use INFO. DEBUG adds move/resize records; TRACE currently matches DEBUG.
- Preserve low-frequency typed metadata only. Never copy bootstrap summaries,
  service output/error bodies, URL paths/queries, titles, prompts, replies, argv
  or environment dumps into the new host file. Page kinds are coarse protocol
  categories. Exception records omit arbitrary messages and source excerpts,
  retaining type, safe OS code and frame locations. Existing credential-like
  strings are redacted as defence in depth.
- Main/tray/window-state errors route through an explicit helper that writes a
  safe record and mirrors stderr. No global stderr interception, renderer console
  capture, crash reporter, dump collection, upload or automatic restart is added.
- Host logs keep a current file plus three numbered backups, each at most 256 KiB;
  records are limited to 16 KiB. Bound old oversized files/backups on first use.
  File/mirror errors are best effort and do not interrupt execution.
- Keep `cats.log`, `cats-runtime.log` and their existing `.previous` names. Apply
  the same current/record limits, with one bounded previous segment per service.
  Per-launch rotation preserves useful previous evidence when the current file
  is empty. Both old current and previous logs are bounded, including quiet starts.
- Sidecar capture remains in the owning supervisor with ordered per-service
  writes. Readiness parsing and in-memory diagnostic callbacks receive the original
  stream, independent of truncation in the saved file. Log storage failure cannot
  prevent a service from starting. Do not duplicate raw service text into host.log.
- No execution-state format, UI contract, public API or version changes are
  required; existing diagnostic log history is subject to the new retention limit.

## Consequences

### Positive

- Installed builds leave evidence without a debug installer.
- Default product files have a total budget of about 2 MiB: host current/backups
  total 1 MiB and two service current/previous pairs total 1 MiB.
- New host records do not persist arbitrary provider/user error text.

### Negative

- Older diagnostics are discarded, including oversized legacy history.
- Text cannot explain native failures before JavaScript starts.
- Synchronous file writes have a small disk cost, especially with DEBUG enabled.

### Neutral

- Sidecar lifecycle, readiness, tray/background and candidate authority are unchanged.
- The previous snapshot is the last log segment or last nonempty launch, not a full
  unlimited transcript of every service attempt.

## Alternatives Considered

### Debug-only logs

Would omit the installed-build incidents this change is meant to explain.

### Capture every console/stderr string into the host file

Would duplicate services, introduce unbounded/noisy content and risk private text.

### Crash dumps or a shared package extraction

Dumps are explicitly excluded. ADR-142's package proposal is a separate change;
this implementation adds no cross-repository runtime dependency.

## References

- [ADR-003](003-electron-host-manages-local-services.md)
- [Deployment diagnostic logs](../deployment.md#desktop-diagnostic-logs)
- [Desktop host tests](../testing.md#desktop-host-tests)
- [Electron crash events](https://www.electronjs.org/docs/latest/tutorial/crash-reporting)
- [Node uncaughtExceptionMonitor](https://nodejs.org/api/process.html#event-uncaughtexceptionmonitor)

Decision made: 2026-11-02.
