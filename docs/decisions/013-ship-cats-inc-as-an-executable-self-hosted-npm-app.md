# ADR-013: Ship `cats-platform` as a Self-Hosted npm Host and Reserve `cats-can` for Bootstrap

> Prioritize a one-shot `npx cats-can` bootstrap path plus a persistent
> `@cats-inc/cats-platform` host install for technical self-hosted trials and
> open-source collaboration, while keeping Electron as a later wrapper around
> the same local services.

## Status

Proposed

## Context

`Cats` is the flagship platform brand, and the current local host workspace now
lives in `cats-platform/`. Under ADR-045, the public host package target is now
`@cats-inc/cats-platform`, while the one-shot bootstrap/install entrypoint is
reserved as `cats-can`. The host package already behaves more like an
application than a reusable library:

- the package entrypoint boots config, runtime client, chat store, and the
  HTTP server
- the built server is responsible for serving the renderer bundle
- the app depends on `cats-runtime` as its only runtime boundary

At the same time, recent product direction clarified a near-term distribution
goal:

- technical users should be able to try the product quickly with a
  self-hosted bootstrap command such as `npx cats-can`
- technical users who want a persistent install should be able to use a host
  package such as `npm install -g @cats-inc/cats-platform` and then run `cats-platform`
- the codebase should be easy to share for open-source collaboration before a
  polished desktop wrapper exists

The installer label itself also now carries deliberate brand semantics:

- `cats-can` suggests a packaged local bundle that contains the initial
  platform/runtime experience
- `cats-can` also acts as the slogan seam for future product-language such as
  "Cats can chat", "Cats can work", and "Cats can code"

Earlier ADRs correctly established Electron as the preferred desktop host when
the packaged desktop experience is built. That decision remains valid, but it
does not solve the shorter-term need for a lightweight, reviewable, technical
distribution path.

Treating the root host package as a general-purpose npm library would
conflict with its current shape and its product role:

- the root package is not a stable SDK surface
- the renderer and server are shipped together as one product shell
- product trial and contribution workflows care more about fast local startup
  than about importing the host into another application

The project needs a written distribution stance so review can happen before
implementation starts.

## Decision

`@cats-inc/cats-platform` will be positioned first as an executable
self-hosted npm app package, not as a general-purpose library package, and
`cats-can` will be reserved for the zero-to-running bootstrap entrypoint.

This decision includes:

1. The primary public technical distribution targets are:
   - `npx cats-can` for one-shot bootstrap/install flows
   - `npm install -g @cats-inc/cats-platform` followed by `cats-platform` for
     persistent host installs
2. The root `@cats-inc/cats-platform` package is application-first. It may expose small
   programmatic helpers for tests or internal composition, but that is
   secondary to the executable app experience.
3. The published app package should include the built server and built renderer
   assets needed for local execution, rather than expecting users to clone the
   repo and build manually.
4. The app should own a first-run bootstrap flow for local config, data
   directories, and health/readiness checks suitable for technical self-hosted
   users.
5. The default self-hosted flow should make local `cats-runtime` startup or
   attachment easy enough to feel like one product, while keeping
   `cats-runtime` as the runtime boundary defined by ADR-001.
6. Future Electron packaging remains valid, but it should wrap the same local
   service topology rather than block the first npm-based self-hosted release.
7. If reusable library surfaces are needed later, they should be extracted into
   separate packages such as shared-core or runtime-client packages instead of
   forcing the root host package to serve two masters.

## Consequences

### Positive

- Technical reviewers can try the product with much less setup friction.
- Open-source contributors get a simpler reproduction and onboarding path.
- The decision aligns distribution with the current app-shaped codebase.
- Electron remains compatible as a later packaging layer, not a competing
  architecture.
- Future reusable packages can be extracted intentionally instead of leaking
  app internals through the root package.

### Negative

- the host packages now need explicit packaging work such as executable
  entrypoints,
  published asset curation, and first-run bootstrap behavior.
- One-command startup increases pressure to define how local `cats-runtime`
  readiness, shutdown, and version compatibility are handled.
- The team must resist the temptation to call the root package a library just
  because it is distributed through npm.

### Neutral

- This decision does not remove Electron from the roadmap.
- This decision does not require `cats` to absorb `cats-runtime`
  implementation details.
- This decision does not prevent separate container or hosted deployment paths
  later.

## Alternatives Considered

### Alternative 1: Treat `cats-platform` Primarily as a Reusable npm Library

- **Pros**: Cleaner story for `import`-based reuse.
- **Cons**: Conflicts with the current app-first package shape and does not
  solve the desired self-hosted trial experience.
- **Why rejected**: The immediate product need is fast local execution and
  collaboration, not turning the root product package into an SDK.

### Alternative 2: Wait for Electron Before Offering an Installable Product

- **Pros**: More polished first impression for non-technical users.
- **Cons**: Delays technical review, local trials, and open-source
  collaboration behind a larger packaging project.
- **Why rejected**: `npx`-style distribution is a smaller and faster path for
  technical users, and it remains compatible with later Electron work.

### Alternative 3: Keep the Host as a Repo-Only Dev App

- **Pros**: Lowest short-term packaging effort.
- **Cons**: Keeps trial and contribution friction high because users must clone
  the repo, install dependencies, and understand multiple local services.
- **Why rejected**: It does not match the stated goal of easy technical
  self-hosted sharing.

## References

- [ADR-001](./001-use-cats-runtime-boundary.md)
- [ADR-003](./003-electron-host-manages-local-services.md)
- [Deployment Guide](../deployment.md)
- [Architecture](../architecture.md)

---

*Proposed: 2026-03-19*
*Proposed by: Codex from user direction*
