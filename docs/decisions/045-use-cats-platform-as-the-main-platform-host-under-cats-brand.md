# ADR-045: Use cats-platform as the Main Platform Host under Cats Brand

> Keep `Cats` as the flagship product brand, but rename the main platform host
> repo/package identity from `cats` to `cats-platform` so it is clearly
> separated from `cats-runtime`, the umbrella org/scope `cats-inc`, and the
> zero-to-running installer entrypoint `cats-can`.

## Status

Accepted

> **Amendment (2026-07-21)**: the installer entrypoint named `cats-can` in this
> decision is now `cats-one` (its original name). npm's name-similarity rule
> blocks the unscoped `cats-can` name (it normalizes identically to the existing
> `cat-scan` package), so the installer was renamed at repo split time; see
> https://github.com/cats-inc/cats-one. The core decision — `cats-platform` as
> the main platform host under the Cats brand — is unchanged.

## Date

2026-03-30

## Context

[ADR-026](./026-use-cats-as-the-flagship-platform-name-under-cats-inc-brand.md)
renamed the flagship platform from `cats-inc` to `cats`.

That was the right correction for the earlier awkward `cats-inc/cats-inc`
direction, and it preserved `Cats` as the main product identity. However,
subsequent product direction made the technical role of the main host more
specific:

- `cats-runtime` remains the execution/runtime boundary
- the main app is the platform host above that boundary
- the host is expected to grow into the app/plugin surface for first-party and
  later third-party products
- the desired one-shot installation story is now `npx cats-can`, not "the host
  package name must also be the bootstrap command"
- the installer label should reinforce the broader brand language: `cats-can`
  can read both as a bundled "can" that packages the local platform/runtime
  experience and as the slogan seam behind future lines such as "Cats can
  chat", "Cats can work", and "Cats can code"

Keeping the main host technically named `cats` now creates three problems.

1. It overloads the brand and the host.
   `Cats` is a strong product/marketing name, but using the same bare name for
   the technical host makes the host, the brand, and the future plugin surface
   harder to discuss precisely.

2. It makes the host role too implicit.
   The app is no longer just "the flagship platform name." It is the platform host
   that assembles Chat, Work, Code, setup, packaging, and later app/plugin
   integration above `cats-runtime`.

3. It muddies the packaging story.
   The desired installer entrypoint and the canonical host identity are now
   different concerns. `cats-can` is a good onboarding/install label, but it is
   not the right long-term name for the host itself.

The project therefore needs a naming model that keeps `Cats` as the public
product brand while giving the host a more explicit technical identity.

## Decision

The umbrella brand remains `Cats Inc`, and the flagship product brand remains
`Cats`, but the main platform host repo/package identity becomes
`cats-platform`.

### Naming matrix

| Layer | Canonical Name |
|-------|----------------|
| Umbrella brand | `Cats Inc` |
| GitHub owner / npm scope | `cats-inc` |
| Flagship product brand | `Cats` |
| Main platform host repo target | `cats-platform` |
| Main platform host package target | `@cats-inc/cats-platform` |
| Persistent host executable | `cats-platform` |
| Runtime repo/package | `cats-runtime` |
| Zero-to-running installer package | `cats-can` |
| One-shot install entrypoint | `npx cats-can` |

### Additional naming rules

1. `Cats` remains the product/brand users see first.
2. `cats-platform` is the technical host that owns platform assembly, packaging,
   setup, and app/plugin integration above `cats-runtime`.
3. `cats-runtime` remains the execution/runtime boundary and keeps its current
   name.
4. `cats-can` is reserved for installer/bootstrap flows and must not become the
   canonical host name.
5. `cats-can` is intentionally dual-purpose branding: it should suggest both a
   packaged local bundle and the reusable slogan frame "Cats can ...".
6. `Cats Chat`, `Cats Work`, `Cats Code`, and later apps remain product lines
   or installable surfaces within the `Cats` ecosystem rather than reasons to
   rename the host again.

## Consequences

### Positive

- The host name becomes explicit about its technical role without giving up the
  stronger end-user brand `Cats`.
- The naming stack is easier to explain:
  `cats-inc` publishes `cats-platform`, `cats-runtime`, and `cats-can`.
- `cats-can` gets a clean role as the onboarding/install experience instead of
  being forced into host/platform identity.
- The installer label now carries a stronger memorable brand cue than a more
  generic `one`-style name.
- The project can keep growing toward app/plugin hosting without overloading
  the bare word `cats`.

### Negative

- This supersedes [ADR-026](./026-use-cats-as-the-flagship-platform-name-under-cats-inc-brand.md)
  and reopens naming migration work that had already been partially completed.
- Repo, package, docs, and packaging metadata now need another controlled
  rename pass.
- There will be a temporary period where the local monorepo folder and some
  historical docs still say `cats`.

### Neutral

- This ADR does not require renaming `Cats` as the product/marketing label.
- This ADR does not require immediate internal symbol cleanup across every
  module.
- This ADR does not change the accepted runtime boundary or the Chat/Work/Code
  platform-host direction.

## Alternatives Considered

### Alternative 1: Keep `cats` as the host repo/package name

- **Pros**: shortest and strongest brand name; no additional rename churn
- **Cons**: overloads brand and host identity; keeps the technical role too
  implicit; continues the mismatch between the host name and the desired
  `cats-can` installer story
- **Why rejected**: the project now needs a clearer technical host identity
  than bare `cats` provides

### Alternative 2: Use `cats-platform` as the host repo/package name

- **Pros**: describes the current first-party multi-product shell accurately;
  pairs cleanly with `cats-runtime`
- **Cons**: emphasizes the bundled first-party platform more than the longer-term
  platform/app-host role; slightly weaker if the host becomes a broader
  installable app surface
- **Why rejected**: the team chose to optimize for the host's long-term role as
  the platform layer above `cats-runtime`, not only the current bundle shape

### Alternative 3: Use `cats-can` as the host repo/package name

- **Pros**: strong onboarding/install feel; strong brand memory through the
  bundled-can metaphor and the "Cats can ..." slogan seam
- **Cons**: reads like a bundle, plan, or installer SKU rather than the
  canonical host/platform identity
- **Why rejected**: `cats-can` is better used as the bootstrap/install entry
  point than as the host's long-lived technical name

## References

- [ADR-025](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
- [ADR-026](./026-use-cats-as-the-flagship-platform-name-under-cats-inc-brand.md)
- [PLAN-018](../plans/PLAN-018-rename-the-main-platform-from-cats-inc-to-cats.md)
- [Cats Plugin Architecture and Packaging Strategy](../research/2026-03-24-cats-plugin-architecture-and-packaging.md)
- [Cats as an AI-First App Store](../research/2026-03-26-cats-ai-first-app-store-vision.md)

---

*Accepted: 2026-03-30*  
*Decision makers: user + Codex*
