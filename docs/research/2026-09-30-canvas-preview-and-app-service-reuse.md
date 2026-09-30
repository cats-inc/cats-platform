# Canvas Previews and App Services: What to Share

> PLAN-116 F4 evaluation. Date: 2026-09-30. Compares the Code live-preview
> substrate (SPEC-108, SPEC-123, PLAN-116 D1 to D3) with SPEC-122 App
> components and private services. The question is whether to reuse process
> supervision, file containment and leases between them. No code is changed by
> this note.

## The two substrates

- **Canvas previews** (`src/products/code/livePreview/`):
  - They run a dev server the Cat wrote, or an in-process static file server,
    on a leased loopback port from `47100-47199`.
  - Profiles are reviewed argv templates. The process is spawned shell-free,
    with the user's environment minus Platform credentials, so the toolchain on
    PATH works.
  - Readiness is an HTTP probe. The lease has a TTL that the canvas renews, and
    stop kills the process tree (`taskkill /T`, or the POSIX process group).
  - Running processes are recorded for the startup orphan sweep.
  - Script privileges in the canvas iframe follow a **lease predicate**: only
    the artifact a ready lease names gets `allow-scripts allow-same-origin` on
    its own loopback origin.
- **App components** (`src/platform/apps/componentProcess.ts`, `componentHost.ts`):
  - They run trusted App modules through a component runner in a Node child with
    an IPC channel, a **whitelisted** environment (no inheritance) and
    `start(context)` returning an HTTP handle.
  - Readiness is an IPC message within 15 s. Stop sends an IPC `stop`, then
    `SIGKILL` after 3.5 s. Two automatic generation restarts are allowed.
  - Browser isolation is an **opaque sandbox** (`allow-scripts`, no
    `allow-same-origin`, plus a CSP `sandbox` header) behind Platform's shared
    ingress with per-installation route authorization.

## Evaluation

### Process supervision: share two helpers, not the supervisor

- **Different contracts, keep them separate.** Apps speak a component protocol
  (IPC readiness, `start/close`, migrations, generations). Dev servers are
  arbitrary third-party CLIs that know nothing of Cats: readiness can only be
  an HTTP probe, and a restart means re-running a profile. Merging the two
  supervisors would either force IPC on dev servers or drop it from Apps.
- **Tree kill is worth sharing, and Apps need it.** `componentProcess.ts` stops
  with `child.kill('SIGKILL')`. On POSIX the component's subprocesses are then
  reparented and keep running. On Windows, Node's kill-on-close job ends
  non-detached ones with the component, so only detached ones survive. (The
  first version of this note said the gap was on Windows; a probe during
  PLAN-115 P1 corrected it.) The
  live-preview adapter already implements a graceful-then-forced tree kill
  (`taskkill /T` then `/T /F`, or process-group signals on POSIX).
  - Recommendation: move it to `src/platform/process/killTree.ts` and use it in
    both places.
- **The orphan registry is worth sharing.** `processRegistry.ts` (D2) records a
  pid and port, and the next start kills only what is alive and still holds its
  port. App components hold loopback ports too, and after a Platform crash they
  are cleaned up only through IPC disconnect lifetime binding. That covers the
  Node child itself but not its descendants.
  - Recommendation: the same registry, keyed by `(kind, id)`, in
    `src/platform/process/`.

### File containment: share one resolver

- Both need "a path, resolved through `realpath`, that must stay inside a root
  and outside hidden segments":
  - `resolveWorkspacePath` (SPEC-123 CAP-04);
  - the static preview server's per-request check;
  - App package snapshot validation, which rejects links and special files.
- The policies differ: the workspace allows symlinks that resolve inside it,
  and App snapshots reject links outright. So share only the primitive
  (`containedRealpath(root, candidate)` returning the resolved path or a coded
  failure), and keep each policy in its product.

### Leases and browser trust: do not share

- A preview lease authorizes **scripts with same-origin** on a loopback origin
  for one artifact on one canvas surface, for a TTL. An App route authorizes an
  **installation** with an opaque origin, indefinitely, through ingress
  credentials. The threat models point in opposite directions:
  - a preview is the user's own code, shown to the user locally;
  - an App is third-party code, reachable from outside.
- Reusing `allow-same-origin` or the lease predicate for App documents would
  weaken SPEC-122's opaque sandbox. Reusing App grants for previews would let
  ingress credentials reach unsupervised dev servers.
  - Recommendation: keep both, and cite this note in both specs.
- **Remote viewing.** Canvas leases are loopback-only. The SPEC-122 shared
  ingress does not make them remotely reachable, and must not. Showing a preview
  to a remote client (Mobile, a tunnel) needs its own ingress route per lease,
  Host rewriting for dev servers that check Host (Vite does), and an
  isolation review. It is its own acceptance, not a by-product of App ingress.

## Recommendation

1. Extract `killTree` and the process registry to `src/platform/process/`, adopt
   them in `componentProcess.ts`, and add a test that an App service's
   grandchild dies on stop. This is a behavior fix for Apps, so it needs its
   own plan item under SPEC-122's owner. Done in PLAN-115 P1.
2. Extract `containedRealpath` when a second caller changes; do not refactor
   ahead of that.
3. Leave leases, browser sandbox profiles and routing separate. Add a
   cross-reference in SPEC-122 and SPEC-123 so neither reuses the other's trust
   predicate.
4. Track remote Canvas viewing as a separate future item with its own
   isolation acceptance.

## Sources

- `src/products/code/livePreview/{supervisor,realProcessAdapter,processRegistry,staticAdapter}.ts`
  and `src/products/code/agentTools/showInCanvas.ts` on main (2026-09-30, after
  PLAN-116 D3).
- `src/platform/apps/{componentProcess,componentHost}.ts` and
  [SPEC-122](../specs/SPEC-122-app-components-and-private-services.md)
  "Local prototype evidence and retained component contract".
- [ADR-126](../decisions/126-deliver-code-preview-tools-to-provider-agents-through-session-mcp.md)
  "Relationship to App and Plugin MCP".
