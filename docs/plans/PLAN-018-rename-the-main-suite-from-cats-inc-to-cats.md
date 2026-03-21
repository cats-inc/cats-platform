# PLAN-018: Rename the Main Suite from cats-inc to cats

Status: Draft (Pending Review)

## Scope

Implement the naming migration required by
[ADR-026](../decisions/026-use-cats-as-the-flagship-suite-name-under-cats-inc-brand.md).

This plan covers:

- renaming the main suite's public-facing identity from `cats-inc` to `cats`
- aligning repo/package/executable/docs naming with the new flagship suite name
- preserving `cats-runtime` as-is
- documenting temporary compatibility seams where a hard rename would create
  avoidable churn

This plan does not cover:

- changing the `cats-runtime` repo or package name
- full internal symbol cleanup across every source file in one slice
- changing the accepted suite-host refactor direction from [PLAN-017](./PLAN-017-suite-host-refactor-for-chat-work-code-and-core.md)

## Hard Constraints

- Keep `Cats Inc` as the umbrella brand.
- Treat `Cats` as the flagship suite product name.
- Keep `cats-runtime` unchanged.
- Avoid mixing this rename with unrelated architecture changes where possible.
- Preserve compatibility where the rename would otherwise break technical trials
  or existing local setup scripts.

## Naming Targets

| Layer | Target |
|------|--------|
| Brand | `Cats Inc` |
| GitHub owner/org | `cats-inc` |
| Main suite repo | `cats` |
| Main suite package/executable | `cats` |
| Runtime repo/package | `cats-runtime` |

## Phases

### Phase 1: Freeze the Naming Contract

- [ ] Freeze the canonical naming matrix for brand, repo, package, executable,
      and runtime.
- [ ] Freeze which old names remain temporarily accepted as compatibility names.
- [ ] Audit current references to `cats-inc` in:
      - `package.json`
      - root docs
      - API and deployment docs
      - packaging ADRs/plans
      - renderer/server public payloads

**Deliverables**: one approved naming contract and a clear impact inventory.

### Phase 2: Documentation and Product Language Migration

- [ ] Update `README.md` to present the main product as `Cats`.
- [ ] Update architecture, API, setup, deployment, and services docs so they
      distinguish:
      - umbrella brand `Cats Inc`
      - suite product `Cats`
      - runtime `cats-runtime`
- [ ] Update planning docs that still treat `cats-inc` as the canonical suite
      name when they are really referring to the flagship product.
- [ ] Keep historical notes readable where older repo/package names matter.

**Deliverables**: public docs stop conflating the brand and the suite repo.

### Phase 3: Package and Executable Rename

- [ ] Change `package.json` package name from `cats-inc` to `cats` when the
      actual package migration is executed.
- [ ] Decide the canonical executable command name (`cats`).
- [ ] Update packaging docs and executable-install guidance that currently say
      `npx cats-inc`, `npm install -g cats-inc`, or similar.
- [ ] Reconcile [ADR-013](../decisions/013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
      and [PLAN-013](./PLAN-013-self-hosted-npm-app-packaging.md) with the new
      package name.

**Deliverables**: the main suite has one canonical package/executable identity.

### Phase 4: Public Runtime and App Metadata Alignment

- [ ] Update public payloads or app-shell metadata that currently identify the
      app as `cats-inc` when they are meant to name the flagship suite.
- [ ] Decide which service identifiers remain operational/internal versus
      product-facing.
- [ ] Decide whether environment variables keep temporary compatibility aliases
      such as:
      - canonical `CATS_*`
      - compatibility `CATS_INC_*`
- [ ] Document the compatibility and eventual cleanup rule explicitly.

**Deliverables**: public metadata and runtime-facing naming stop leaking the old
suite name unintentionally.

### Phase 5: Repo and Hosting Migration Coordination

- [ ] Rename the main GitHub repo from `cats-inc` to `cats` when the owner/org
      move is ready.
- [ ] Update remote URLs, badges, repository references, and clone/setup docs.
- [ ] Confirm the intended final public shape:

```text
cats-inc/cats
cats-inc/cats-runtime
```

- [ ] Document any transitional local-folder expectations if the filesystem path
      stays `cats-inc/` during migration.

**Deliverables**: repo identity matches the naming contract.

### Phase 6: Validation and Cleanup

- [ ] Validate that docs, package metadata, and public help text align on the
      same naming model.
- [ ] Add or update tests where user-facing metadata is asserted.
- [ ] Keep explicit notes for any internal code identifiers intentionally left
      untouched until later refactor slices.
- [ ] Log what still says `cats-inc` by design versus by accident.

**Deliverables**: a controlled rename with documented leftovers rather than
half-migrated naming drift.

## Candidate Code and Doc Areas

| Area | Action | Why |
|------|--------|-----|
| `package.json` | Modify later | Package/executable name currently still equals `cats-inc` |
| `README.md` | Update | Main suite identity is still presented as `cats-inc` |
| `docs/api.md` | Review and update | Public payloads currently still include `cats-inc` app identifiers |
| `docs/architecture.md` | Update carefully | Distinguish suite host identity from historical repo name |
| `docs/deployment.md` | Update | Packaging and install guidance currently assumes the old suite name |
| `docs/setup-guide.md` | Update | Quick-start and folder naming still reference `cats-inc` |
| `docs/services.md` | Review | Decide which service labels stay operational and which become product-facing |
| `docs/decisions/013-*` | Update or supersede | Packaging guidance currently assumes `cats-inc` as the app/package name |
| `docs/plans/PLAN-013-*` | Update | Self-hosted npm packaging guidance must match the renamed package |
| source metadata strings | Review | `app.name`, health payloads, and display labels may need public rename treatment |

## Validation

- The flagship suite is consistently called `Cats`.
- `Cats Inc` remains clearly the umbrella brand rather than the suite repo name.
- Public references align on `cats-inc/cats` and `cats-inc/cats-runtime`.
- No docs imply that `Cats Work` is the whole flagship suite.
- Old `cats-inc` references are either intentionally historical or explicitly
  marked as temporary compatibility names.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Repo/package/display naming drift apart | High | Freeze the naming matrix first and migrate surfaces in a tracked sequence |
| The rename collides with package-publishing assumptions in ADR-013/PLAN-013 | High | Reconcile packaging docs in the same migration plan rather than later |
| Internal and public names diverge awkwardly | Medium | Allow temporary compatibility aliases, but document them explicitly |
| The rename gets mixed with the suite-host refactor and becomes too large | Medium | Keep naming migration as a distinct tracked slice even if some edits land alongside PLAN-017 |
| Technical users lose old entrypoint expectations | Medium | Keep compatibility naming where needed until the new package/executable path is stable |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement ADR-026 / PLAN-018. Keep `Cats Inc` as the umbrella brand, rename
> the main flagship suite from `cats-inc` to `cats`, preserve `cats-runtime`,
> and migrate docs/package/public metadata in a controlled way with explicit
> compatibility notes where the old name must survive temporarily.

---

*Last updated: 2026-03-21*
