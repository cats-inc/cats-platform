# SPEC-108: Cats Code Live Preview Substrate

> Define the supervised local-process substrate that can produce live
> `preview_url` artifacts for the Artifact Canvas without giving assistants
> arbitrary shell execution or broad iframe privilege.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |
| **Related Plan** | [PLAN-097](../plans/PLAN-097-cats-code-live-preview-substrate-rollout.md) |

## Summary

Cats Code needs a managed way to start local app previews, wait for readiness,
materialize the resulting URL as a `CoreArtifactRecord`, and show it in the
Artifact Canvas. This substrate is intentionally separate from PLAN-090's viewer
work. It introduces process supervision, command-profile allowlists, loopback
port leasing, lifecycle cleanup, and lease-based preview-origin qualification.

## Goals

- Start local preview processes only through reviewed command profiles.
- Allocate and prove ownership of loopback preview origins before the iframe can
  receive the scripted preview profile.
- Materialize live previews as normal Artifact Canvas artifacts instead of a
  second preview UI path.
- Make logs, readiness, stop, expiry, and failure states inspectable by Cats
  Code.
- Keep process spawning disabled until the supervisor, tests, and security
  review are complete.

## Non-Goals

- Allow arbitrary assistant-provided shell commands.
- Expose a public remote preview tunnel.
- Run previews on non-loopback interfaces in v1.
- Replace `declare_artifact`, `show_in_canvas`, or the Artifact Canvas route
  registry.
- Add a generic background job platform for every product. This is a Cats Code
  preview substrate first.

## User Stories

- As an operator, I want Cats Code to run a generated web app and show the live
  preview beside the conversation.
- As an operator, I want to stop a preview and see why it failed when startup
  does not become ready.
- As a Cats Code assistant, I want a structured preview-start action that does
  not require me to invent a shell command.
- As a platform integrator, I want iframe privilege to depend on a platform
  lease, not merely on a loopback hostname.

## Requirements

### Functional Requirements

1. Cats Code shall expose a product-internal live-preview start action that
   accepts a command profile id, workspace root reference, active
   `CanvasSurfaceRef`, optional artifact title, and optional readiness timeout.
2. The live-preview start action shall reject requests without an active Code
   surface, without a valid workspace root, or without an enabled command
   profile.
3. Command profiles shall be declarative. A profile includes `id`, `label`,
   command executable, argument template, working-directory policy, environment
   variable allowlist, port placeholder strategy, readiness probe, timeout, and
   stop policy.
4. Assistants shall not provide raw shell strings. They may request a profile by
   id and provide profile-declared parameters only.
5. The supervisor shall allocate a port from a configured loopback preview range.
   The range is configurable; the initial proposed range is `47100-47199`, but
   implementation must reserve it in `docs/services.md` before code lands.
6. The supervisor shall bind previews to loopback only. v1 accepted hosts are
   `127.0.0.1` and, when explicitly enabled by config, `[::1]`.
7. The supervisor shall create a preview lease before spawning. The lease stores
   `previewId`, command profile id, workspace root id/path, `CanvasSurfaceRef`,
   allocated host/port/origin, process id when known, readiness state, log path,
   created timestamp, expiry timestamp, and stop reason when stopped.
8. The supervisor shall fail fast when the selected port cannot be reserved or
   when the command attempts to bind a different port than the leased port.
9. Readiness shall be probe-based. A preview is not canvas-eligible until its
   readiness probe succeeds against the leased origin.
10. On readiness success, the platform shall materialize a `CoreArtifactRecord`
    with `kind = 'preview'`, a safe `preview_url` location, and metadata linking
    the artifact to `previewId`, command profile id, workspace, and source
    surface.
11. After materializing the artifact, the platform shall use the existing
    Artifact Canvas path to show it: `show_in_canvas` or an equivalent
    product-internal call that writes the same Activity audit and render-intent
    shape.
12. A preview URL may receive `scripted-cross-origin` only when it matches a
    live supervisor lease and the Artifact Canvas producer allowlist includes the
    live-preview producer identity.
13. A loopback URL that is not backed by a live supervisor lease shall demote to
    `static` or reject according to SPEC-101; hostname alone is not sufficient
    for privileged iframe treatment.
14. The supervisor shall collect stdout/stderr logs to a bounded local log file
    under Cats platform storage. Logs must be retrievable by Cats Code without
    exposing arbitrary filesystem reads.
15. The supervisor shall support explicit stop by `previewId`. Stop is
    idempotent and records a terminal stop reason.
16. The supervisor shall stop previews on workspace deletion, task deletion,
    lease expiry, platform shutdown, and command-profile disablement.
17. The supervisor shall enforce configurable concurrency limits per workspace
    and globally.
18. The supervisor shall emit product-visible diagnostics for spawn failure,
    readiness timeout, port conflict, process exit, stop, expiry, and cleanup
    failure.
19. The first implementation shall include fake-process tests for supervision
    logic before any real process-spawn integration is enabled.
20. Real process spawning shall remain disabled by default until PLAN-097's
    approval gate is checked.

### Non-Functional Requirements

- **Security**: No assistant-provided raw shell commands; no non-loopback host
  binding in v1; no iframe privilege without a supervisor lease.
- **Reliability**: Stop operations must be idempotent and best-effort process
  tree cleanup must be attempted on every terminal lifecycle path.
- **Observability**: Every preview lease has a status, timestamps, and bounded
  logs visible from Cats Code.
- **Port Hygiene**: The implementation must update `docs/services.md` and check
  the central project-bootstrap registry before reserving the default port range.
- **Compatibility**: No backward-compatibility shims are needed for prior live
  preview prototypes; this product has no stable release.

## Design Overview

```
Cats Code assistant/tool request
  -> live-preview start action (profile id + workspace + surface)
  -> command profile validation
  -> loopback port lease
  -> supervised process spawn
  -> readiness probe
  -> CoreArtifactRecord(kind = preview, preview_url)
  -> existing Artifact Canvas show intent
  -> /canvas/:artifactId renders via SPEC-101 policy
```

### Command Profile Shape

```ts
interface LivePreviewCommandProfile {
  id: string;
  label: string;
  executable: string;
  args: string[];
  workingDirectory: 'workspaceRoot' | 'artifactDirectory';
  env?: Record<string, string>;
  port: {
    mode: 'env' | 'argument';
    name: string;
  };
  readiness: {
    path: string;
    timeoutMs: number;
    intervalMs: number;
    expectedStatus?: number;
  };
  stop: {
    graceMs: number;
    killProcessTree: boolean;
  };
}
```

Profile argument and environment templates may reference only approved
placeholders such as `{port}`, `{workspaceRoot}`, and `{artifactDirectory}`.
Shell interpolation and shell metacharacter expansion are not part of the
profile contract.

### Preview Lease Shape

```ts
interface LivePreviewLease {
  previewId: string;
  commandProfileId: string;
  surface: CanvasSurfaceRef;
  workspaceRef: {
    kind: 'code_workspace';
    id: string;
    rootPath: string;
  };
  origin: string;
  host: '127.0.0.1' | '[::1]';
  port: number;
  processId: number | null;
  status:
    | 'starting'
    | 'ready'
    | 'failed'
    | 'stopping'
    | 'stopped'
    | 'expired';
  logPath: string;
  artifactId: string | null;
  createdAt: string;
  readyAt: string | null;
  expiresAt: string;
  stoppedAt: string | null;
  stopReason: string | null;
}
```

### Origin Qualification

Artifact Canvas remains the final iframe authority. The live preview substrate
adds one server-side predicate:

```
isSupervisorOwnedPreviewOrigin(url, artifact, leaseStore) === true
```

The predicate returns true only when the URL host/port exactly matches a live
ready lease, the artifact points at the same `previewId`, and the artifact
surface/workspace scope matches the lease scope. SPEC-101's scheme,
credential, shell-origin, and producer allowlist checks still run.

## Dependencies

- [ADR-104](../decisions/104-adopt-managed-live-preview-supervisor-for-artifact-canvas.md)
- [SPEC-101](./SPEC-101-cats-code-artifact-canvas.md)
- [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md)
- `cats-runtime` workspace/session APIs for identifying workspace roots

## Open Questions

- [ ] Should the first real command profile support only Vite, or also Next.js
      and generic `npm run dev`?
- [ ] Should leases survive app restart as stopped historical records, or should
      v1 keep them memory-only with log files retained?
- [ ] Should explicit preview stop be a Cats Code UI action only, or also a
      runtime tool action available to strong coding Cats?

## References

- [PLAN-097: Cats Code Live Preview Substrate Rollout](../plans/PLAN-097-cats-code-live-preview-substrate-rollout.md)
- [ADR-098: URL-Driven Canvas View-State and Platform-Shared Viewer](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md)
- [SPEC-092: Code Artifact Declaration Contract](./SPEC-092-code-artifact-declaration-contract.md)

---

*Created: 2026-05-09*
*Author: Codex*
