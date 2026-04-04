# ADR-052: Use Canonical Platform Settings Routes Inside Product Shells

> Keep one canonical `/settings/*` namespace while preserving the active
> product shell and sidebar when the user opens settings from Chat, Work, or
> Code.

## Status

Accepted

## Context

`cats-platform` currently exposes settings through a mix of platform and
product-specific routes:

- `/settings/*`
- `/chat/settings/*`
- product-local redirects

This creates multiple problems:

- the same settings concept is reachable from more than one namespace
- `Cats` appears to belong to Chat even though it is a core platform concern
- entering settings can drop the user out of the current product shell
- product-specific settings sections are not clearly contributed through product
  metadata

The desired UX is:

- settings always live at `/settings/*`
- the current product sidebar stays visible
- the inner content area gets a dedicated settings sidebar
- first-level sections are:
  - `General`
  - `Cats`
  - `Chat`
  - `Work`
  - `Code`
  - `Runtime`
  - `Data`

## Decision

### 1. `/settings/*` is the only canonical settings namespace

The platform will use only these canonical routes:

- `/settings`
- `/settings/general`
- `/settings/cats`
- `/settings/chat`
- `/settings/work`
- `/settings/code`
- `/settings/runtime`
- `/settings/data`

Product-local settings routes such as `/chat/settings/*` are removed instead of
kept as compatibility redirects because the system has not launched publicly.

### 2. Settings render inside the active product shell

Opening settings does not leave the current product shell.

The active shell continues to render its normal large sidebar. Inside that shell,
the main canvas switches to a shared platform-owned settings layout.

This keeps:

- Chat context inside Chat
- Work context inside Work
- Code context inside Code

while still enforcing one platform settings namespace.

### 3. `Cats` is a platform/core settings section

`Cats` is not Chat-owned settings anymore.

Its canonical route is `/settings/cats`, and it is rendered inside the shared
platform settings shell.

### 4. Product settings sections are contributed through product metadata

`Chat`, `Work`, and `Code` appear in the settings sidebar through platform
product descriptors, not through product-local settings route trees.

This keeps first-party products aligned with the same extension shape that can
be used for future platform products.

### 5. Future product sub-sections nest under `/settings/<productId>/*`

If a product needs second-level tabs later, they should live under:

- `/settings/chat/*`
- `/settings/work/*`
- `/settings/code/*`

The platform does not introduce `/settings/product/:productId` at this stage.

## Consequences

### Positive

- there is one stable settings URL scheme
- entering settings preserves the current product shell and sidebar
- `Cats` is correctly modeled as a platform concern
- product settings can grow through a clean metadata-driven seam
- future second-level product settings can expand without changing the first
  layer IA

### Negative

- the platform host and product shells must coordinate on settings rendering
- tests that assumed product-local settings routes need to be updated
- some previously local settings components become dead weight until they are
  migrated or deleted

### Neutral

- this ADR does not by itself decide the final content depth of Chat, Work, or
  Code settings
- this ADR does not introduce plugin marketplace settings; it only stabilizes
  the first-party route structure

## Alternatives Considered

### Alternative 1: Keep `/chat/settings/*` alongside `/settings/*`

- **Pros**: less immediate refactor work
- **Cons**: duplicates concepts, keeps Cats attached to Chat, and preserves
  confusing ownership boundaries
- **Why rejected**: the system has not launched, so there is no value in
  keeping legacy route baggage

### Alternative 2: Use `/settings/product/:productId`

- **Pros**: generic-looking route structure
- **Cons**: adds nesting without current value and makes first-party products
  harder to scan
- **Why rejected**: `Chat`, `Work`, and `Code` are first-class platform
  products and deserve direct routes

### Alternative 3: Render settings as a standalone host page without product shells

- **Pros**: simpler single owner for settings layout
- **Cons**: loses the surrounding product context and makes the user feel like
  they left the product they were working in
- **Why rejected**: the desired UX explicitly keeps the left product sidebar in
  place

## References

- [ADR-045](./045-use-cats-platform-as-the-main-platform-host-under-cats-brand.md)
- [ADR-048](./048-separate-platform-products-from-installable-apps.md)
- [platformProducts.ts](../../src/shared/platformProducts.ts)
- [PlatformSettingsShell.tsx](../../src/app/renderer/settings/PlatformSettingsShell.tsx)
- [PlatformSettingsRoutes.tsx](../../src/app/renderer/settings/PlatformSettingsRoutes.tsx)

---

*Decision made: 2026-04-04*
*Decision makers: User, Codex*
