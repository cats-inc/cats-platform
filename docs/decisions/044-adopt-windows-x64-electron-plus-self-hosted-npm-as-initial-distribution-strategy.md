# ADR-044: Adopt Windows x64 Electron Plus Self-Hosted npm as the Initial Distribution Strategy

> Ship a real Windows x64 desktop installer first, while using the
> self-hosted npm path as the cross-platform technical/server distribution
> path during the early product phase.

## Status

Accepted

## Context

The local `cats-platform/` workspace now has two viable distribution directions in the
repo:

- a self-hosted npm host-package path for `@cats-inc/cats-platform` and
  `cats-runtime`
- an Electron-hosted packaged desktop path

Those two directions serve different audiences well:

- the npm path is effective for technical users, contributors, internal
  operators, and server/self-hosted deployments
- the Electron path is better for a consumer-style desktop product that should
  open like a normal app

At the same time, the packaged desktop matrix is not equally important across
all platforms and architectures right now.

Current repo reality:

- the target matrix planning layer already models Windows, macOS, and Linux
  targets
- the actual `electron-builder` configuration currently lands a real Windows
  `NSIS` installer for `x64`
- Windows `arm64`, macOS installers, and Linux installers are not the highest
  immediate need

Trying to finish a full desktop installer matrix immediately would add
significant packaging, signing, validation, and support work before the team
has confirmed the first end-user distribution loop.

The project needs one explicit early-phase packaging stance so implementation
and release work stop treating every platform/architecture as equally urgent.

## Decision

The initial distribution strategy for the Cats host is:

1. Ship a real Windows x64 Electron installer first for the desktop-product
   path.
2. Use the self-hosted npm path as the early cross-platform distribution path
   for technical users, internal operators, and server-style deployments.
3. Treat Windows `arm64`, macOS Electron installers, and Linux Electron
   installers as follow-on work rather than launch blockers.
4. Do not attempt a single cross-platform Electron package artifact.
   - packaged desktop artifacts remain platform-specific
   - the npm path is the portable technical path

More specifically:

- **Consumer desktop priority**: Windows x64 Electron package first
- **Technical/self-hosted priority**: `npx cats-can`,
  `npm install -g @cats-inc/cats-platform` then `cats`, and corresponding
  `cats-runtime` install/run flows
- **Deferred desktop matrix work**:
  - Windows arm64 Electron installer
  - macOS Electron installer(s)
  - Linux Electron installer(s)

## Consequences

### Positive

- the team gets one clear desktop-first target without waiting for a full
  multi-platform installer program
- technical/server users still have a viable cross-platform path immediately
- packaging effort matches actual urgency instead of theoretical platform
  completeness
- Windows x64 becomes a concrete place to validate installer UX, setup flows,
  and host-managed remediation before multiplying targets

### Negative

- some early users on Windows arm64, macOS, or Linux will not get a native
  Electron installer immediately
- release and support docs must clearly explain the split between the consumer
  desktop path and the technical/self-hosted path
- installer validation coverage remains asymmetric until the broader matrix is
  implemented

### Neutral

- this decision does not remove Windows arm64, macOS, or Linux packaged
  targets from the roadmap
- this decision does not weaken the accepted Electron host architecture
- this decision does not replace the self-hosted npm path; it makes that path
  intentionally first-class for technical distribution

## Alternatives Considered

### Alternative 1: Build the Full Electron Installer Matrix Immediately

- **Pros**: stronger appearance of platform completeness from day one
- **Cons**: spreads packaging effort, signing work, CI complexity, and support
  validation too early
- **Why rejected**: the current highest-value packaged path is Windows x64,
  while npm already covers technical cross-platform use

### Alternative 2: Ship Only the Self-Hosted npm Path at First

- **Pros**: lowest packaging complexity
- **Cons**: delays the consumer-style desktop install path that Electron was
  chosen to support
- **Why rejected**: the project wants a real desktop product path early, not
  only a technical/operator path

### Alternative 3: Treat Windows x64 and Windows arm64 as Equal Immediate
Priority

- **Pros**: broader Windows hardware coverage
- **Cons**: increases packaging and validation scope without matching current
  urgency
- **Why rejected**: Windows arm64 is not important enough right now to block
  the first packaged release

## References

- [ADR-003](./003-electron-host-manages-local-services.md)
- [ADR-013](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [ADR-021](./021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [Deployment Guide](../deployment.md)
- [Setup Guide](../setup-guide.md)
- [cats-platform/package.json](../../package.json)
- [cats-platform/electron/packaging.ts](../../desktop/host/packaging.ts) (since moved to `desktop/host/packaging.ts`)

---

*Accepted: 2026-03-30*
*Decision makers: user + Codex*
