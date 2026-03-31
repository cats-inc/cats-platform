# SPEC-046: Suite Product Landing and Installed Apps

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats-platform` already behaves like a suite host: setup runs before normal
entry, top-level routes are split across `chat`, `work`, and `code`, and the
host remembers the user's last product surface.

The next slice should make that host role visible in the UI.

This spec defines a host-owned landing and inventory model where:

- setup still chooses a primary first-party product
- `/` continues to open the user's selected or last-used product in the current
  slice
- the host-owned landing is now named `Lobby`
- the suite exposes a dedicated host surface for required products, optional
  products, and installed apps
- host/global settings are separated from product-owned settings

The goal is to establish a "quasi-app-platform" user experience now without
forcing the full packaging/versioning split in the same slice.

## Current Slice Focus

This slice focuses on:

- a host-owned landing framework after setup
- a visible product inventory with explicit required/optional product policy
- a visible installed-apps surface
- a clean ownership split between host settings and product settings
- terminology and contract seams that can survive a later app packaging
  refactor

## Terminology

This spec follows [ADR-048](../decisions/048-separate-suite-products-from-installable-apps.md):

- `product`: a suite-owned top-level first-party experience such as
  `Cats Chat`, `Cats Work`, or `Cats Code`
- `required product`: a suite-owned product that ships as part of the current
  baseline suite
- `optional product`: a suite-owned product that may be installed, removed, or
  deferred
- `app`: an installable and publishable unit that may come from first-party or
  third-party developers

The host landing should primarily orient around products, while also exposing
installed apps as a first-class inventory concept.

## Goals

- make the host role visible after setup rather than leaving product selection
  implicit
- give users a dedicated place to inspect what is installed
- allow the host to distinguish baseline products from optional products
- keep setup centered on first-party product choice
- preserve direct deep-link entry into product routes
- move product-specific settings under product ownership without hiding them
- keep the model future-friendly for a later app publishing and installation
  system

## User Stories

- As a new user, I want setup to end in a clear suite experience instead of
  feeling like a one-off wizard disconnected from the host.
- As a returning user, I want to keep opening directly into the product I last
  used.
- As a user, I want a clear place to see which official products are part of
  my baseline suite and which optional products are available or installed.
- As a user, I want a clear place to see which apps are installed.
- As a future developer ecosystem user, I want the suite to distinguish between
  first-party products and installable apps cleanly.
- As a product team, I want product settings to live with the product instead
  of being flattened into one catch-all suite settings shell.

## Requirements

### Functional Requirements

1. The suite host shall expose a host-owned landing or inventory route for
   products and apps.
2. The suite shall continue to support setup-first entry through `/setup`.
3. Completing setup shall continue to record a selected primary product.
4. The suite root `/` shall continue to resolve to the user's selected or
   last-used product entry.
5. Completing setup shall continue to open the selected primary product entry
   in the current slice rather than forcing a stop at `/products`.
6. The host-owned landing shall provide a visible list of first-party products.
7. Each product entry on the landing shall show at least:
   - label
   - install policy (`required` or `optional`)
   - install or availability state
   - launch action
   - whether it is the current default or last-used entry
8. The landing shall visually distinguish required products from optional
   products.
9. Optional products shall be representable even when they are not currently
   installed.
10. The host-owned landing shall also provide an installed-apps section.
11. The installed-apps section shall be able to represent:
   - first-party apps
   - third-party apps
   - apps that contribute a visible entry surface
   - apps that contribute supporting capability without a main launch surface
12. Suite-level settings shall remain host-owned and shall focus on global
   concerns such as owner/general settings, runtime, and data/reset controls.
13. Product-specific settings shall be routable under the owning product route
    tree.
14. The suite shall preserve direct product routes such as `/chat/*`,
    `/work/*`, and `/code/*`.
15. The setup wizard shall continue to derive its first-product choices from a
    host-owned registration source rather than hardcoded renderer branching.
16. The host shall preserve bounded compatibility for existing deep links when
    canonical settings ownership moves from suite-level routes to product-owned
    routes.
17. The host envelope shall expose enough structured metadata to render product
    and app inventory without inferring state only from route prefixes.

### UX Requirements

1. The landing must read as part of the suite host, not as a settings page.
2. Required products, optional products, and installed apps must be visible
   without drilling into account settings first.
3. The host should allow quick return from landing into the user's active
   product.
4. The UI copy should consistently distinguish `Products` and `Apps`.
5. The current chat-first flow should remain quick; landing should add clarity
   without making routine re-entry slower.

### Data and Contract Requirements

The host should converge toward explicit descriptors such as:

```ts
type SuiteProductId = SuiteSurfaceId | (string & {});

interface SuiteProductDescriptor {
  id: SuiteProductId;
  label: string;
  routePrefix: string;
  installPolicy: 'required' | 'optional';
  installState: 'installed' | 'available' | 'installing' | 'attention';
  launchable: boolean;
  defaultEntry: boolean;
  lastUsed: boolean;
  removable: boolean;
  settingsPath?: string | null;
}

interface SuiteInstalledAppDescriptor {
  id: string;
  label: string;
  publisher: string;
  version: string | null;
  installState: 'installed' | 'available' | 'updating' | 'attention';
  entryPath?: string | null;
  contributesProductId?: string | null;
}
```

The exact field set may evolve, but the host must stop relying only on implicit
route knowledge for inventory UI.

## Information Architecture

### Host-Level Routes

- `/setup`
  setup wizard before suite entry
- `/lobby`
  canonical host-owned Lobby for products and installed apps
- `/products`
  compatibility alias that redirects to `/lobby`
- `/settings/general`
  host-owned general settings
- `/settings/runtime`
  host-owned runtime and environment state
- `/settings/data`
  host-owned reset/export/diagnostic data controls

### Product-Level Routes

- `/chat/*`
- `/work/*`
- `/code/*`

Each product may also own product-local settings beneath its own route tree,
for example:

- `/chat/settings/*`
- `/work/settings/*`
- `/code/settings/*`

## Landing Structure

The first host-owned landing should have these content regions:

1. `Home`
   - Chat-oriented products and companion-facing entry surfaces
   - cards still carry required/optional and install/readiness metadata

2. `Office`
   - Work-, Code-, and operator-oriented products
   - cards still carry required/optional and install/readiness metadata

3. `Installed Apps`
   - installed app list
   - publisher/version/install state
   - open/manage action when relevant

4. `Host Actions`
   - open settings
   - runtime health
   - return to last-used product

The layout may evolve, but Home/Office should remain the primary organizer for
the current Lobby, while install policy and install state remain per-product
metadata.

## Registration Model

The host should use one registration pipeline that can support both setup and
landing:

- product descriptors for suite-owned top-level entry
- product install policy and install state
- app descriptors for install inventory

In the current slice, the existing setup registration source can be promoted
into a more general host registry instead of remaining wizard-only metadata.

## Dependencies

- [ADR-025](../decisions/025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md)
- [ADR-045](../decisions/045-use-cats-platform-as-the-main-suite-host-under-cats-brand.md)
- [ADR-048](../decisions/048-separate-suite-products-from-installable-apps.md)
- [SPEC-023](./SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [Product Integration Guide](../product-integration-guide.md)

## Open Questions

- Which first host-owned settings subsections should exist immediately:
  `general`, `runtime`, `data`, and perhaps `updates`?
- How should future optional products such as `Learn` or `Invest` map into the
  Home/Office split while keeping their install policy legible on the card?
- How should first-party products appear inside the installed-apps inventory
  once app packaging exists: mirrored, linked, or summarized only?

## References

- [Cats Plugin Architecture and Packaging Strategy](../research/2026-03-24-cats-plugin-architecture-and-packaging.md)
- [SPEC-039](./SPEC-039-cats-chat-v1-priority-items.md)

---

*Created: 2026-03-31*  
*Author: Codex*  
*Related Plan: [PLAN-035](../plans/PLAN-035-suite-product-landing-and-installed-apps.md)*
