# ADR-135: Make Runtime Data Reset Explicit and Preserve Installed Tools

## Status

Accepted — 2026-10-23, following the owner's reset-dialog requirements.

## Context

Platform data reset currently retains Runtime settings and history. This also
retains existing provider timeout settings: resetting Platform is not a way to
recreate Antigravity's documented instance defaults. Users need an explicit way
to return their Desktop-managed Runtime profile to first-run setup without
uninstalling tools that packaged setup scripts installed.

## Decision

1. Keep the existing Platform reset scope by default. Add an unchecked **Also
   reset Runtime data** checkbox to its confirmation dialog. Every reset requires
   the exact case-sensitive text `RESET`; the authenticated API checks it too.
   Cancel is initially focused, keyboard focus stays inside the dialog, Escape
   cancels, and opening again clears text and selection.
2. With Runtime unchecked, do not edit its files, selected providers or budgets.
   With it checked, erase the managed Runtime's `config`, `data` and `sessions`
   directories, including provider selection, caches, history and workspaces
   beneath those directories. Subsequent startup requires provider selection
   and initialization. Existing installations are observations, not automatic
   selection. Fresh instances use Runtime's documented provider defaults.
3. Keep installed CLIs and prerequisites, their external authentication/native
   history, external workspaces, installed Apps/plugins and their data, and
   Desktop startup/tray preferences. Never invoke an uninstall helper or walk
   from a Runtime session into its external cwd. Runtime-root contents outside
   the three owned directories are not deletion targets.
4. Platform owns authorization and its purge. Desktop owns stopping and
   restarting its managed processes and their offline profile erasure. This
   operation cannot erase a separate or remote Runtime. Non-Desktop clients
   display a disabled Runtime option with an explanation. A new Runtime reset
   needs an authenticated Admin, including before first-admin setup; a durable
   previously authorized operation may be retried after its auth data is gone.
5. Extend the existing bounded Platform reset journal with optional
   `runtimeReset: pending|ready`. `pending` is persisted before Platform erasure;
   `ready` is written only after that purge finishes. Desktop accepts no path or
   scope arguments from the renderer. It validates every resolved target against
   its configured profile, rejects redirected parents and installation/profile
   overlaps, drains helpers and stops its services before deleting Runtime data.
   Final symlinks/junctions are removed without traversing their targets.
6. Delete the journal only after the optional Runtime purge succeeds. Failures
   leave services stopped and the marker intact. Retry and subsequent launches
   finish the authorized purge before starting managed services. A missing
   Runtime profile is recreated from bundled setup assets, without a selected
   provider. The normal installed user profile is never used for automated tests.

## Compatibility and Release Boundary

The reset endpoint now requires `{confirmation: "RESET", resetRuntime: boolean}`.
This is an intentional destructive-action HTTP contract change and requires the
next Platform minor line (0.10 or later) before publication; no version bump or
release is authorized by this implementation. Runtime's generated timeout fix
is independent and does not rewrite existing configurations.

The journal remains schema 1 with a validated optional field. Existing journals
without it follow the original Platform-only retry path; no stored user profile
is migrated or erased on ordinary startup without an authorized ready marker.
Regression tests cover both journal forms, partial failure/retry, exact phrase
validation, authorization and redirected storage. Native acceptance must use an
isolated candidate and report its actual scope separately from an installed build.

## References

- [ADR-115: Runtime selection](115-bound-bootstrap-and-provider-choices-by-runtime-selection.md)
- [SPEC-093 reset amendment](../specs/SPEC-093-settings-runtime-cli-provider-lifecycle.md#optional-runtime-data-reset--2026-10-23)
- [PLAN-107](../plans/PLAN-107-desktop-provider-management.md)
