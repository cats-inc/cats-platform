# ADR-104: Adopt a Managed Live Preview Supervisor for Artifact Canvas

> Cats Code live previews may run local development processes, but those
> processes are platform-managed capabilities, not arbitrary assistant shell
> commands. The live preview URL becomes a normal Artifact Canvas artifact after
> the supervisor proves origin ownership.

## Status

Proposed

## Context

PLAN-090 intentionally stopped before live app preview. The Artifact Canvas can
display safe `preview_url` artifacts, but it does not yet start `npm run dev`,
Vite, Next.js, or similar local preview processes. That boundary is intentional:
starting local processes changes the threat model from "render an existing URL"
to "execute a command on the owner's machine and then grant iframe privileges to
the resulting origin."

Cats Code still needs this capability. Without a managed live preview substrate,
the product cannot provide the expected coding loop: generate code, start the
app, show the app beside the conversation, and keep logs/lifecycle visible.

The unsafe shortcut would be to let an assistant produce a shell command and
then trust any loopback URL that appears. That would make the runtime preview
origin allowlist too broad and would blur "local loopback" with "platform-owned
preview."

## Decision

Cats Code shall introduce a managed live preview supervisor before any live
preview process spawning is enabled.

The supervisor owns these responsibilities:

- It starts previews only from configured command profiles. Free-form assistant
  shell commands are rejected at the boundary.
- It allocates a loopback-only port from a configured preview range and injects
  that port into the command environment or arguments through a profile-defined
  placeholder.
- It records a preview lease with `previewId`, command profile id, surface,
  workspace root, allocated origin, process id, readiness state, log location,
  created time, and expiry/stop policy.
- It publishes a `preview_url` `CoreArtifactRecord` only after the readiness
  probe passes and the observed URL matches the minted lease.
- It calls the existing Artifact Canvas path by producing or triggering a
  `show_in_canvas` request for that artifact. The canvas route and viewer policy
  remain unchanged.
- It stops process trees on explicit stop, workspace deletion, task deletion,
  lease expiry, or platform shutdown.

Runtime-owned preview origin qualification is lease-based, not hostname-based.
A URL qualifies for the privileged `scripted-cross-origin` iframe profile only
when all of these are true:

- The URL is loopback and uses the supervisor-minted host and port.
- The URL maps to a live preview lease owned by the same workspace/surface scope.
- The artifact producer identity is an allowed system/tool producer for the live
  preview supervisor.
- The existing Artifact Canvas scheme, credential, and shell-origin checks still
  pass.

No implementation may start a live preview process before SPEC-108 and PLAN-097
are reviewed and the enabling slice is approved.

## Consequences

### Positive

- Assistant output cannot directly become a local shell command.
- `allow-same-origin` iframe privilege is tied to a supervisor lease instead of
  any random loopback server.
- Preview lifecycle, logs, and cleanup become inspectable product behavior.
- Artifact Canvas stays URL-driven and platform-shared; live preview only adds a
  producer for `preview_url` artifacts.

### Negative

- The first live preview version requires process supervision and lifecycle
  infrastructure before the visible demo is complete.
- Some project-specific preview commands will require profile definitions before
  they work.
- The supervisor must handle cross-platform process-tree cleanup rather than
  relying on one shell behavior.

### Neutral

- Existing static Artifact Canvas previews remain valid.
- Scripted dev previews stay disabled by default until a profile and producer
  allowlist are configured.

## Alternatives Considered

### Alternative 1: Assistant-provided shell commands

- **Pros**: Fast to prototype and flexible for any project.
- **Cons**: Unsafe by default; impossible to distinguish intended preview
  commands from destructive or exfiltrating commands.
- **Why rejected**: It gives assistants direct process execution authority and
  makes iframe privilege decisions depend on trust in transcript content.

### Alternative 2: Trust all loopback preview URLs

- **Pros**: Simple continuation of the existing origin allowlist.
- **Cons**: Any process on the machine could claim the preview port; malicious or
  stale loopback services could receive privileged iframe treatment.
- **Why rejected**: Loopback is necessary but not sufficient. The platform must
  prove it minted and owns the preview origin.

### Alternative 3: Keep live preview entirely outside Artifact Canvas

- **Pros**: Avoids changing canvas policy.
- **Cons**: Creates a second preview UI and duplicate safety model.
- **Why rejected**: Artifact Canvas is the accepted platform viewer for
  Core-tier artifacts. Live preview should produce artifacts, not bypass them.

## References

- [SPEC-101: Cats Code Artifact Canvas](../specs/SPEC-101-cats-code-artifact-canvas.md)
- [PLAN-090: Cats Code Artifact Canvas Rollout](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md)
- [SPEC-108: Cats Code Live Preview Substrate](../specs/SPEC-108-cats-code-live-preview-substrate.md)
- [PLAN-097: Cats Code Live Preview Substrate Rollout](../plans/PLAN-097-cats-code-live-preview-substrate-rollout.md)
- [ADR-098: URL-Driven Canvas View-State and Platform-Shared Viewer](./098-url-driven-canvas-and-platform-shared-viewer.md)

---

*Created: 2026-05-09*
*Decision makers: Codex*
