# PLAN-035: Suite Product Landing and Installed Apps

Status: In Progress

## Related Spec

- [SPEC-046](../specs/SPEC-046-suite-product-landing-and-installed-apps.md)
- [ADR-048](../decisions/048-separate-suite-products-from-installable-apps.md)

## Overview

This plan introduces the first host-owned landing and inventory slice for
`cats-platform`.

The implementation should keep today's strengths:

- setup remains the first-run entry
- `/` still resolves to the user's selected or last-used product
- product routes remain owned by their product trees

While adding a clearer suite-host model:

- a host-owned `/lobby` landing with `/products` as a compatibility alias
- explicit required-product and optional-product inventory
- explicit product and app descriptors in host state
- host/global settings separated from product-owned settings

## Phase 1: Establish Terminology and Host Contracts

- [x] Add host-level terminology notes to the relevant suite docs.
- [x] Introduce explicit product and app descriptor types under a host-owned
      shared contract file.
- [x] Include install-policy and install-state fields for first-party products.
- [x] Extend the suite envelope or companion host API shape so the renderer can
      read product/app inventory without inferring everything from route
      prefixes.
- [x] Promote the current setup plugin metadata into a more general host
      registration source.

**Deliverables**: stable host vocabulary and structured product/app registration
contracts.

## Phase 2: Add the Host-Owned Landing Surface

- [x] Add a suite route for `/lobby` and keep `/products` as a compatibility
      alias.
- [x] Build a host-owned landing page that presents:
      - Home and Office product groupings
      - per-product install policy and install-state metadata
      - installed apps
      - host actions and runtime summary
- [x] Add a clear navigation entry to open the landing from inside the suite.
- [x] Keep `/` routing behavior aligned with the existing selected/last-used
      product model.
- [x] Keep setup-complete navigation aligned with the current product-first
      entry flow rather than forcing a landing detour in this slice.

**Deliverables**: a visible host launcher and inventory surface.

## Phase 3: Re-Tier Settings Ownership

- [x] Introduce host-owned settings sections for at least `general`, `runtime`,
      and `data`.
- [x] Move or proxy existing suite-global settings out of Chat-owned routing.
- [x] Define the canonical route shape for product-owned settings beneath each
      product prefix.
- [x] Add explicit redirects or compatibility handling so existing settings
      entry points do not break abruptly.
- [x] Preserve legacy deep links such as `/settings/cats` by redirecting them
      to the canonical product-owned path once that path exists.

**Deliverables**: suite settings and product settings follow distinct ownership
boundaries.

## Phase 4: Integrate Setup and Product Entry

- [x] Ensure setup continues to choose a primary product from the host
      registration source.
- [x] Reuse the same product descriptors for both setup and landing.
- [x] Ensure setup and landing can distinguish required products from optional
      products without changing the user-facing primary-product selection flow.
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
| `src/shared/suite-contract.ts` | Modify | Extend host envelope and descriptor contracts |
| `src/app/renderer/App.tsx` | Modify | Register host-owned landing and settings routes |
| `src/app/renderer/setup/plugins.tsx` | Modify | Promote setup-only metadata into host registration data |
| `src/app/renderer/setup/types.ts` | Modify | Align setup registration types with host descriptors |
| `src/app/renderer/*` | Modify/Create | Add host-owned landing and settings surfaces |
| `src/products/chat/renderer/AppRoutes.tsx` | Modify | Reduce suite-global settings ownership inside Chat routes |
| `docs/decisions/048-separate-suite-products-from-installable-apps.md` | Create | Decision record for terminology and host model |
| `docs/specs/SPEC-046-suite-product-landing-and-installed-apps.md` | Create | Feature spec for landing and inventory |
| `docs/plans/PLAN-035-suite-product-landing-and-installed-apps.md` | Create | Implementation plan |

## Technical Decisions

- Use `product` for suite-owned first-party top-level experiences.
- Use `app` for installable and publishable units.
- Treat install policy (`required` vs `optional`) as separate from both
  `product` and `app`.
- Keep the current root-entry behavior while adding a host-owned landing route.
- Keep setup-complete entry product-first in this slice, while exposing
  `/lobby` as the host-owned launcher and inventory surface.
- Reuse the host registration source across setup and landing instead of
  maintaining separate metadata islands.

## Testing Strategy

- **Unit Tests**: descriptor normalization, route helpers, and host envelope
  shaping
- **Integration Tests**: suite host routing for `/`, `/setup`, `/products`,
  `/lobby`, `/settings/*`, and product prefixes
- **Manual Testing**:
  1. Fresh setup still opens the wizard.
  2. Completing setup still enters the selected product.
  3. `/lobby` shows Home, Office, and installed apps, with per-product
     install metadata.
  4. Legacy settings links such as `/settings/cats` redirect to their canonical
     destination without breaking deep links.
  5. Existing direct links into `/chat/*`, `/work/*`, and `/code/*` still work.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Host and product settings ownership stays mixed during migration | High | Add explicit canonical routes plus compatibility redirects early |
| Terminology drifts between docs and UI | Medium | Land ADR/SPEC copy first and reuse labels from a shared source where possible |
| Product/app descriptors become overfit to the current first-party slice | Medium | Keep descriptors minimal and centered on inventory, launch semantics, and install policy |
| Landing adds friction to the fast chat entry path | Medium | Preserve `/` -> last-used product while making `/lobby` a clear optional host entry |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-31 | Plan created |
| 2026-03-31 | Added shared suite product registry, exposed `products` in the suite envelope, and reused the same descriptors across setup and Lobby. |
| 2026-03-31 | Moved suite settings to host-owned `/settings/*`, preserved `/settings/cats` compatibility via `/chat/settings/cats`, and surfaced install-policy metadata in setup cards. |

---

*Created: 2026-03-31*  
*Author: Codex*
