# ADR-048: Separate Platform Products from Installable Apps

> Keep platform-owned top-level experiences as `products`, while using `app` for
> installable and publishable units across first-party and third-party
> distribution.

## Status

Accepted

## Date

2026-03-31

## Context

`cats-platform` is already evolving into a host above `cats-runtime`.

The current platform shape already has first-party surfaces with stable top-level
identity:

- `Cats Chat`
- `Cats Work`
- `Cats Code`

At the same time, the product direction is expanding toward a future where
other developers can build, share, and publish extensions into the Cats
ecosystem.

It is also likely that first-party products will not all share the same
installation policy forever.

Examples:

- some products may ship as part of the baseline platform
- some products may remain optional first-party installs, such as future
  `Learn` or `Invest` lines

That creates a terminology problem if the host uses only one word for both:

- the platform-owned top-level experiences that define the flagship product
- the installable units that may later be published by first-party or
  third-party developers

The host also needs a clearer information architecture for setup, landing, and
inventory:

- setup should still feel like choosing a primary Cats experience
- the platform should expose what is installed in a host-owned surface
- product-specific settings should not be flattened into one platform-level bucket

The naming model therefore needs to support:

- platform-owned top-level products
- installable units from first-party or third-party publishers
- required vs optional installation policy as a separate dimension

## Decision

`cats-platform` will use two related but distinct concepts, and will treat
installation policy as a separate concern from either one:

1. `product`
   - a platform-owned, first-party top-level experience line
   - products define the main top-level navigation, setup outcome, and route
     identity seen by the user
   - a product may be `required` or `optional`
   - a product may also have its own install state such as installed,
     available, updating, or attention-required

2. `app`
   - an installable and publishable software unit that may be produced by
     first-party or third-party developers
   - apps are the host-level inventory and distribution concept
   - an app may contribute a top-level product surface, a supporting tool, or
     a narrower extension surface

The host must not overload `product` and `app` with installation semantics.
Installation policy is its own dimension.

### Host responsibilities

The platform host will treat these concerns separately:

- setup remains product-oriented
- the host owns product inventory, including whether a product is required or
  optional
- the host owns installed-app visibility and app inventory surfaces
- first-party product launch remains visible as the main platform entry model
- product-specific settings belong under the owning product route tree
- platform-level settings remain reserved for host/global concerns

### Naming guidance

Use these terms consistently:

- `product`: Chat, Work, Code, and other future platform-owned top-level
  experiences
- `required product`: a product that ships as part of the current baseline
  platform experience
- `optional product`: a platform-owned product that may be installed, removed, or
  deferred
- `app`: installable units, marketplace/distribution entries, and future
  third-party packages
- `platform host`: the `cats-platform` shell that assembles products, apps,
  setup, and host-level settings

## Consequences

### Positive

- The product story stays clear: `Cats Chat`, `Cats Work`, and `Cats Code`
  remain recognizable first-party pillars instead of being flattened into a
  generic install-unit label.
- The host can represent both baseline and optional first-party products
  cleanly without forcing optional first-party work into the `app` bucket.
- The ecosystem story stays clear: future publishable extensions can be called
  `apps`, which fits marketplace and sharing language better than `plugins` or
  overloaded `products`.
- Setup, landing, and settings can now be designed with different ownership
  rules instead of one overloaded bucket.
- The host can introduce installed-app inventory now without waiting for the
  final packaging/refactor model.

### Negative

- The platform now carries two adjacent concepts that must be documented and
  reflected in UI copy carefully.
- Product descriptors now also need explicit install policy and install-state
  modeling, rather than assuming every first-party product is always present.
- Some current code and research notes still use `plugin` or `surface`
  terminology and will need gradual cleanup.
- Host contracts will eventually need explicit descriptors for both products
  and apps instead of relying only on route prefixes and setup metadata.

### Neutral

- A first-party product may later also be distributed through an app package.
- A first-party product may be required in one release shape and optional in a
  later one.
- This decision does not force immediate repo/package splitting.
- This decision does not change `cats-runtime` as the only runtime boundary.

## Alternatives Considered

### Alternative 1: Call everything `app`

- **Pros**: simple public terminology; strong fit for marketplace language
- **Cons**: blurs the distinction between the flagship platform-owned experiences
  and smaller installable units; weakens product-level IA decisions
- **Why not preferred**: the host needs a stable term for its first-party
  top-level experiences

### Alternative 2: Call everything `product`

- **Pros**: simple for the current first-party platform
- **Cons**: awkward for future third-party publication and app-store style
  distribution; makes smaller installable units sound heavier than they are
- **Why not preferred**: the future ecosystem direction benefits from `app`
  as the distribution term

### Alternative 3: Keep `plugin` as the installable term

- **Pros**: technically familiar; aligns with earlier internal research
- **Cons**: weaker public-facing language for sharing and listing; less natural
  for a broader consumer-facing host experience
- **Why not preferred**: `app` fits the intended future publishing model
  better

## References

- [ADR-025](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
- [ADR-045](./045-use-cats-platform-as-the-main-platform-host-under-cats-brand.md)
- [Product Integration Guide](../product-integration-guide.md)
- [Cats Plugin Architecture and Packaging Strategy](../research/2026-03-24-cats-plugin-architecture-and-packaging.md)

---

*Accepted: 2026-03-31*  
*Decision makers: user + Codex*
