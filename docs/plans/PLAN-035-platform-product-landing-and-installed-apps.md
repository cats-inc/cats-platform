# PLAN-035: Platform Product Landing and Installed Apps

Status: In Progress

## Related Spec

- [SPEC-046](../specs/SPEC-046-platform-product-landing-and-installed-apps.md)
- [ADR-048](../decisions/048-separate-platform-products-from-installable-apps.md)

## Overview

This plan introduces the first host-owned landing and inventory slice for
`cats-platform`.

The implementation should keep today's strengths:

- setup remains the first-run entry
- `/` still resolves to the user's last-used product when one exists
- product routes remain owned by their product trees

While adding a clearer platform-host model:

- a host-owned `/lobby` landing with `/products` as a compatibility alias
- explicit required-product and optional-product inventory
- explicit product and app descriptors in host state
- host/global settings separated from product-owned settings

## Phase 1: Establish Terminology and Host Contracts

- [x] Add host-level terminology notes to the relevant platform docs.
- [x] Introduce explicit product and app descriptor types under a host-owned
      shared contract file.
- [x] Include install-policy and install-state fields for first-party products.
- [x] Extend the platform envelope or companion host API shape so the renderer can
      read product/app inventory without inferring everything from route
      prefixes.
- [x] Promote the current setup plugin metadata into a more general host
      registration source.

**Deliverables**: stable host vocabulary and structured product/app registration
contracts.

## Phase 2: Add the Host-Owned Landing Surface

- [x] Add a platform route for `/lobby` and keep `/products` as a compatibility
      alias.
- [x] Build a host-owned landing page that presents:
      - Home and Office product groupings
      - per-product install policy and install-state metadata
      - installed apps
      - host actions and runtime summary
- [x] Add a clear navigation entry to open the landing from inside the platform.
- [x] Keep `/` routing behavior aligned with the last-used product model while
      allowing `/lobby` fallback when no last-used product exists.
- [ ] Update setup-complete navigation so the first post-setup destination is
      `/lobby` rather than an immediately selected product.

**Deliverables**: a visible host launcher and inventory surface.

## Phase 3: Re-Tier Settings Ownership

- [x] Introduce host-owned settings sections for at least `general`, `runtime`,
      and `data`.
- [x] Move platform-global and Cats settings out of product-owned routing.
- [x] Define the canonical route shape for unified platform settings under
      `/settings/*`.
- [x] Remove pre-launch product-local settings aliases instead of preserving
      compatibility redirects.
- [x] Keep settings rendered inside the active product shell even though the URL
      is host-owned.

**Deliverables**: one canonical settings namespace with clear platform-vs-product
ownership boundaries.

## Phase 4: Integrate Setup and Product Entry

- [ ] Remove setup-time primary-product selection from the flow.
- [x] Reuse the same product descriptors for both setup and landing.
- [ ] Ensure setup and landing can distinguish required products from optional
      products without requiring a setup-time primary-product selection flow.
- [x] Surface the current default product and last-used product clearly on the
      landing.
- [x] Add launch actions that route into the correct product entry points.

**Deliverables**: setup, landing, and product entry use one consistent host
model.

## Phase 5: Prepare for Future App Installation Flows

- [ ] Ensure the landing layout and descriptor model can represent third-party
      installed apps.
- [ ] Add placeholders or soft seams for later install/update/manage actions.
- [ ] Document how future app publishing can map onto current host inventory
      without renaming the first-party products.

**Deliverables**: the current slice remains compatible with a later app
distribution system.

## Files to Create or Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/platform-contract.ts` | Modify | Extend host envelope and descriptor contracts |
| `src/app/renderer/App.tsx` | Modify | Register host-owned landing and settings routes |
| `src/app/renderer/setup/plugins.tsx` | Modify | Promote setup-only metadata into host registration data |
| `src/app/renderer/setup/types.ts` | Modify | Align setup registration types with host descriptors |
| `src/app/renderer/*` | Modify/Create | Add host-owned landing and settings surfaces |
| `src/products/chat/renderer/AppRoutes.tsx` | Modify | Reduce platform-global settings ownership inside Chat routes |
| `docs/decisions/048-separate-platform-products-from-installable-apps.md` | Create | Decision record for terminology and host model |
| `docs/specs/SPEC-046-platform-product-landing-and-installed-apps.md` | Create | Feature spec for landing and inventory |
| `docs/plans/PLAN-035-platform-product-landing-and-installed-apps.md` | Create | Implementation plan |

## Technical Decisions

- Use `product` for platform-owned first-party top-level experiences.
- Use `app` for installable and publishable units.
- Treat install policy (`required` vs `optional`) as separate from both
  `product` and `app`.
- Keep the current root-entry behavior while adding a host-owned landing route.
- Finish setup into `/lobby`, and let the first launched product establish the
  initial `lastProductSurface`.
- Reuse the host registration source across setup and landing instead of
  maintaining separate metadata islands.

## Testing Strategy

- **Unit Tests**: descriptor normalization, route helpers, and host envelope
  shaping
- **Integration Tests**: platform host routing for `/`, `/setup`, `/products`,
  `/lobby`, `/settings/*`, and product prefixes
- **Manual Testing**:
  1. Fresh setup still opens the wizard.
  2. Completing setup lands on `/lobby`.
  3. `/lobby` shows Home, Office, and installed apps, with per-product
     install metadata.
  4. Launching a product from `/lobby` establishes the later `/` entry path.
  5. Settings opened from Chat, Work, or Code keep the current product sidebar
     while using canonical `/settings/*` routes.
  6. Existing direct links into `/chat/*`, `/work/*`, and `/code/*` still work.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Host and product settings ownership stays mixed during migration | High | Add explicit canonical routes plus compatibility redirects early |
| Terminology drifts between docs and UI | Medium | Land ADR/SPEC copy first and reuse labels from a shared source where possible |
| Product/app descriptors become overfit to the current first-party slice | Medium | Keep descriptors minimal and centered on inventory, launch semantics, and install policy |
| Landing adds friction to the fast chat entry path | Medium | Preserve `/` -> last-used product after first launch while making `/lobby` the deterministic first post-setup entry |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-31 | Plan created |
| 2026-03-31 | Added shared platform product registry, exposed `products` in the platform envelope, and reused the same descriptors across setup and Lobby. |
| 2026-03-31 | Moved platform settings to host-owned `/settings/*` and surfaced install-policy metadata in setup cards. |
| 2026-04-04 | Removed pre-launch `/chat/settings/*` aliases and kept canonical settings inside the active product shell. |
| 2026-04-07 | Direction updated so setup no longer chooses a primary product; completion should land in `/lobby`, and the first launched product should establish later `/` entry behavior. |

---

*Created: 2026-03-31*  
*Author: Codex*
