# PLAN-018: Rename the Main Platform from cats-inc to cats

Status: Superseded by [PLAN-031](./PLAN-031-rename-the-main-platform-host-from-cats-to-cats-platform.md)

This plan is kept for historical context on the earlier `cats-inc` -> `cats`
rename slice. The active naming target is now `cats-platform` under
[ADR-045](../decisions/045-use-cats-platform-as-the-main-platform-host-under-cats-brand.md).

## Scope

Implement the naming migration required by
[ADR-026](../decisions/026-use-cats-as-the-flagship-platform-name-under-cats-inc-brand.md).

This plan covers:

- renaming the main platform's public-facing identity from `cats-inc` to `cats`
- aligning repo/package/executable/docs naming with the new flagship platform name
- preserving `cats-runtime` as-is
- documenting temporary compatibility seams where a hard rename would create
  avoidable churn

This plan does not cover:

- changing the `cats-runtime` repo or package name
- full internal symbol cleanup across every source file in one slice
- changing the accepted platform-host refactor direction from [PLAN-017](./PLAN-017-platform-host-refactor-for-chat-work-code-and-core.md)

## Hard Constraints

- Keep `Cats Inc` as the umbrella brand.
- Treat `Cats` as the flagship platform product name.
- Keep `cats-runtime` unchanged.
- Avoid mixing this rename with unrelated architecture changes where possible.
- Preserve compatibility where the rename would otherwise break technical trials
  or existing local setup scripts.

## Naming Targets

| Layer | Target |
|------|--------|
| Brand | `Cats Inc` |
| GitHub owner/org | `cats-inc` |
| Main platform repo | `cats` |
| Main platform package/executable | `cats` |
| Runtime repo/package | `cats-runtime` |

## Phases

### Phase 1: Freeze the Naming Contract

- [x] Freeze the canonical naming matrix for brand, repo, package, executable,
      and runtime.
- [x] Freeze which old names remain temporarily accepted as compatibility names.
- [x] Audit current references to `cats-inc` in:
      - `package.json`
      - root docs
      - API and deployment docs
      - packaging ADRs/plans
      - renderer/server public payloads

**Deliverables**: one approved naming contract and a clear impact inventory.

### Phase 2: Documentation and Product Language Migration

- [x] Update `README.md` to present the main product as `Cats`.
- [x] Update architecture, API, setup, deployment, and services docs so they
      distinguish:
      - umbrella brand `Cats Inc`
      - platform product `Cats`
      - runtime `cats-runtime`
- [x] Update planning docs that still treat `cats-inc` as the canonical platform
      name when they are really referring to the flagship product.
- [x] Keep historical notes readable where older repo/package names matter.

**Deliverables**: public docs stop conflating the brand and the platform repo.

### Phase 3: Package and Executable Rename

- [x] Change `package.json` package name from `cats-inc` to `cats` when the
      actual package migration is executed.
- [x] Decide the canonical executable command name (`cats`).
- [x] Update packaging docs and executable-install guidance that currently say
      `npx cats-inc`, `npm install -g cats-inc`, or similar.
- [x] Reconcile [ADR-013](../decisions/013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
      and [PLAN-013](./PLAN-013-self-hosted-npm-app-packaging.md) with the new
      package name.

**Deliverables**: the main platform has one canonical package/executable identity.

### Phase 4: Public Runtime and App Metadata Alignment

- [x] Update public payloads or app-shell metadata that currently identify the
      app as `cats-inc` when they are meant to name the flagship platform.
- [x] Decide which service identifiers remain operational/internal versus
      product-facing.
- [x] Decide whether environment variables keep temporary compatibility aliases
      such as:
      - canonical `CATS_*`
      - compatibility `CATS_INC_*`
- [x] Document the compatibility and eventual cleanup rule explicitly.

**Deliverables**: public metadata and runtime-facing naming stop leaking the old
platform name unintentionally.

### Phase 5: Repo and Hosting Migration Coordination

- [ ] Rename the main GitHub repo from `cats-inc` to `cats` when the owner/org
      move is ready.
- [ ] Update remote URLs, badges, repository references, and clone/setup docs.
- [x] Confirm the intended final public shape:

```text
cats-inc/cats
cats-inc/cats-runtime
```

- [x] Document transitional local-folder expectations for the monorepo phase:
      - the local subproject folder is now `cats/`
      - the future public repo target remains `cats-inc/cats`

**Deliverables**: repo identity matches the naming contract.

### Phase 6: Validation and Cleanup

- [x] Validate that docs, package metadata, and public help text align on the
      same naming model.
- [x] Add or update tests where user-facing metadata is asserted.
- [x] Keep explicit notes for any internal code identifiers intentionally left
      untouched until later refactor slices.
- [x] Log what still says `cats-inc` by design versus by accident.

**Deliverables**: a controlled rename with documented leftovers rather than
half-migrated naming drift.

## Candidate Code and Doc Areas

| Area | Action | Why |
|------|--------|-----|
| `package.json` | Updated | Package/executable name now uses `cats` |
| `README.md` | Updated | Main platform identity now presents `Cats` as the flagship product |
| `docs/api.md` | Updated | Public payloads now identify the platform as `cats` |
| `docs/architecture.md` | Updated | Platform host identity now distinguishes brand, product, and runtime |
| `docs/deployment.md` | Updated | Packaging and install guidance now uses the renamed platform |
| `docs/setup-guide.md` | Updated | Quick-start and folder naming now reflect `cats/` plus compatibility notes |
| `docs/services.md` | Updated | Product-facing service labels now use `cats`; `CATS_INC_*` stays compatibility-only |
| `docs/decisions/013-*` | Updated in place | Packaging guidance now assumes `cats` as the app/package name while keeping existing ADR filename |
| `docs/plans/PLAN-013-*` | Updated | Self-hosted npm packaging guidance now matches the renamed package |
| source metadata strings | Updated | `app.name`, health payloads, display labels, and sidebar storage key now use `cats` |

## Current Compatibility and Intentional Leftovers

The current `cats-inc` strings that remain after this slice are intentional:

- rename-decision/history documents such as ADR-026 and PLAN-018, where the old
  name must be described explicitly
- existing ADR/PLAN filenames and markdown link targets such as
  `013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md` and
  `025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md`
- future public repo layout references such as `cats-inc/cats` and
  `cats-inc/cats-runtime`
- temporary compatibility aliases `CATS_INC_*`

The current audit found no accidental `cats-inc` leftovers in:

- `cats/src`
- `cats/tests`
- public product docs that define the current platform/runtime contract

Operational/product-facing naming is now:

- product name: `Cats`
- package/executable: `cats`
- public app metadata: `cats`
- public health/service identifier: `cats`
- compatibility aliases: `CATS_INC_*` only, pending future cleanup

## Validation

- The flagship platform is consistently called `Cats`.
- `Cats Inc` remains clearly the umbrella brand rather than the platform repo name.
- Public references align on `cats-inc/cats` and `cats-inc/cats-runtime`.
- No docs imply that `Cats Work` is the whole flagship platform.
- Old `cats-inc` references are either intentionally historical or explicitly
  marked as temporary compatibility names.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Repo/package/display naming drift apart | High | Freeze the naming matrix first and migrate surfaces in a tracked sequence |
| The rename collides with package-publishing assumptions in ADR-013/PLAN-013 | High | Reconcile packaging docs in the same migration plan rather than later |
| Internal and public names diverge awkwardly | Medium | Allow temporary compatibility aliases, but document them explicitly |
| The rename gets mixed with the platform-host refactor and becomes too large | Medium | Keep naming migration as a distinct tracked slice even if some edits land alongside PLAN-017 |
| Technical users lose old entrypoint expectations | Medium | Keep compatibility naming where needed until the new package/executable path is stable |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement ADR-026 / PLAN-018. Keep `Cats Inc` as the umbrella brand, rename
> the main flagship platform from `cats-inc` to `cats`, preserve `cats-runtime`,
> and migrate docs/package/public metadata in a controlled way with explicit
> compatibility notes where the old name must survive temporarily.

---

*Last updated: 2026-03-21*
