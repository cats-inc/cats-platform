# ADR-110: Keep Platform Clients in One Repository with Explicit Package Boundaries

## Status

Accepted

## Date

2026-08-28

## Context

`cats-platform` currently produces several different kinds of deliverables from
one repository:

- the browser renderer and platform server distributed through the
  `@cats-inc/cats-platform` npm package
- the Electron desktop application distributed as GitHub Release installers
- the Expo / React Native mobile client under `mobile/`, whose static bundle is
  currently carried by the desktop installer

Those deliverables have different runtimes and may eventually have different
release cadences, but that does not by itself require separate source
repositories. The web renderer, desktop host, mobile client, and platform server
still change against the same product contracts and platform-owned domain
model. Splitting them into `cats-desktop`, `cats-app`, or similar repositories
now would turn many ordinary changes into coordinated cross-repository version
updates.

The existing root npm package can also cause confusion about this boundary. It
is not a web component library: its command starts the platform server, its
published files include the server and browser renderer, and its package
`main` points at the Electron host. Conversely, the mobile package is private
and the npm package's `files` list does not publish `build/mobile`; the desktop
packaging configuration carries that bundle as an installer resource instead.

Some implementation sharing is desirable across the clients, but sharing an
entire renderer is not. Browser, Electron main/preload, and React Native code
have different platform APIs and rendering primitives. The repository needs a
stable rule for distinguishing useful shared logic from accidental coupling or
duplicated product contracts.

## Decision

Keep the platform server, browser client, Electron desktop host, and React
Native mobile client in the `cats-platform` repository. Treat them as distinct
deployable applications and platform targets inside one source repository,
rather than as reasons to create separate repositories now.

This decision establishes the following boundaries:

1. **One canonical repository.** `cats-platform` remains the source of truth
   for the platform host and its Web, Desktop, and Mobile clients. A different
   artifact or release channel does not imply a different repository.
2. **Distinct deployable targets.** The npm-hosted web/server application,
   GitHub-Release desktop installers, and any present or future mobile release
   remain independently buildable and testable targets. They may acquire
   different version numbers or release cadences without first moving source.
3. **The root npm package remains application-first.**
   `@cats-inc/cats-platform` is an executable platform-host distribution, not a
   promise that every target in this repository is published in that tarball
   and not a general-purpose UI library.
4. **Share platform-neutral TypeScript contracts and logic.** Shared boundaries
   should contain data contracts, schemas, API-client behavior, selectors and
   state transitions, message/content segmentation, design tokens, and the app
   SDK when those modules do not depend on a target runtime.
5. **Keep platform renderers and host integrations separate.** DOM/CSS UI,
   Electron main/preload behavior, and React Native views remain target-owned.
   Implementing separate browser and native renderers over the same contracts
   is intentional and is not considered wasteful source duplication.
6. **Extract package boundaries only when they are real.** Reusable,
   browser-safe, or React-Native-safe code may move into internal workspace
   packages or separately published packages such as core contracts, an API
   client, design tokens, or the app SDK. The root package currently has no
   explicit `exports` map for a supported mobile-safe import surface; that is an
   implementation gap to close deliberately, not a reason to copy source or
   split repositories.
7. **Require evidence before a repository split.** A new repository is
   justified only when at least one durable boundary exists, such as separate
   ownership or access control, a genuinely independent release lifecycle, a
   stable versioned dependency contract, or measured coordination costs that
   are lower after the split. Artifact format alone is insufficient.

An eventual workspace layout may make these boundaries more visible, for
example:

```text
apps/
  platform-server/
  web/
  desktop/
  mobile/
packages/
  core-contracts/
  client/
  product-logic/
  design-tokens/
  app-sdk/
```

This layout is illustrative, not an authorization to move the current tree.
Any physical workspace migration or new published-package contract requires a
separate specification and implementation plan.

## Consequences

### Positive

- Cross-target contract changes can remain atomic and reviewable in one pull
  request.
- Web, Desktop, and Mobile can share domain behavior without duplicating the
  platform model or coordinating temporary package releases.
- Each target can still have its own build, tests, artifact, and release policy.
- Future reusable package surfaces can be designed intentionally instead of
  exposing application internals from the root npm package.

### Negative

- The repository and CI graph remain larger than a single-target application
  and will need target-aware checks as it grows.
- Platform-neutral modules require enforced import boundaries so browser or
  Node/Electron dependencies do not leak into mobile code.
- Some UI behavior must be implemented more than once because browser and
  React Native renderers are intentionally distinct.
- Until explicit shared packages or exports are implemented, some desirable
  reuse remains an internal source-tree convention rather than a supported npm
  contract.

### Neutral

- This decision does not require Web, Desktop, and Mobile to share one version
  number or publish in the same workflow.
- This decision does not change the current npm or GitHub Release automation.
- A future App Store or Play Store release does not automatically require a
  mobile repository split.
- The desktop application may continue to wrap the same built web renderer and
  platform server while keeping Electron-specific code isolated.

## Alternatives Considered

### Split Desktop and Mobile into Separate Repositories Now

- **Pros**: Strong filesystem and CI isolation; independent permissions and
  release workflows are straightforward.
- **Cons**: Requires version choreography for shared contracts and logic,
  makes cross-target refactors non-atomic, and encourages copied source before
  stable package boundaries exist.
- **Why rejected**: Current ownership and product contracts are shared, so the
  coordination cost would increase without establishing a real organizational
  boundary.

### Keep One Repository but Share One Renderer Across All Targets

- **Pros**: Maximizes apparent UI reuse and reduces the number of component
  implementations.
- **Cons**: Couples DOM, Electron, and React Native constraints; either weakens
  native UX or creates platform conditionals throughout the renderer.
- **Why rejected**: Shared contracts and product logic are the stable reuse
  boundary. Platform views are not.

### Publish the Entire Repository as One General-Purpose npm Library

- **Pros**: One version and one installation mechanism.
- **Cons**: Confuses an executable host with an SDK, exposes unstable app
  internals, and does not match native mobile or installer distribution.
- **Why rejected**: ADR-013 already establishes the root package as
  application-first; reusable surfaces should have explicit contracts of their
  own.

## References

- [ADR-003: Electron Host Manages Local Services](./003-electron-host-manages-local-services.md)
- [ADR-013: Ship `cats-platform` as a Self-Hosted npm Host and Reserve `cats-can` for Bootstrap](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [ADR-025: Make cats a Platform Host with Core-Owned Product Projections](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
- [ADR-048: Separate Platform Products from Installable Apps](./048-separate-platform-products-from-installable-apps.md)
- [ADR-092: Reposition Cats Mobile as a First-Class Product Client](./092-reposition-cats-mobile-as-first-class-product-client.md)
- [ADR-094: Adopt Cats App Packages as the Extension Boundary](./094-adopt-cats-app-packages-as-extension-boundary.md)
- [ADR-095: Distribute Cats Mobile as a Static Expo Go Bundle Served by the Desktop](./095-distribute-mobile-as-static-expo-go-bundle-served-by-desktop.md)
- [Architecture](../architecture.md)

---

*Accepted: 2026-08-28*
*Decision makers: user + Codex*
