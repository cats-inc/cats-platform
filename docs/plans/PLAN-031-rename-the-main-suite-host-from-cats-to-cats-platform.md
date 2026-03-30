# PLAN-031: Rename the Main Suite Host from cats to cats-platform

Status: In Progress

## Related Decision

[ADR-045](../decisions/045-use-cats-platform-as-the-main-suite-host-under-cats-brand.md)

## Related Spec

N/A

## Spec Requirement

No separate SPEC is required for this slice.

This work is a naming-governance and migration-sequencing effort rather than a
new product feature with fresh user-facing behavior requirements. The accepted
decision is captured in ADR-045, and the work here is to apply that naming
contract consistently. If the rename later expands into materially new setup,
packaging, or plugin behavior beyond naming and metadata alignment, those
changes should be captured in targeted specs at that time.

## Scope

Implement the rename required by
[ADR-045](../decisions/045-use-cats-platform-as-the-main-suite-host-under-cats-brand.md).

This plan covers:

- renaming the main suite host identity from `cats` to `cats-platform`
- preserving `Cats` as the flagship product brand
- preserving `cats-runtime` as the runtime boundary
- assigning `cats-one` to the one-shot install/bootstrap experience
- aligning repo/package/docs/metadata references with the new naming matrix
- documenting compatibility seams where a hard rename would create avoidable
  churn

This plan does not cover:

- changing the `cats-runtime` repo/package name
- defining the full plugin/app contract beyond the naming implications already
  accepted
- rewriting every internal code symbol that still contains `cats`
- reworking unrelated architecture slices from
  [PLAN-017](./PLAN-017-suite-host-refactor-for-chat-work-code-and-core.md) or
  later product plans

## Hard Constraints

- Keep `Cats Inc` as the umbrella brand.
- Keep `Cats` as the public-facing flagship product brand.
- Use `cats-platform` as the canonical host repo/package identity.
- Keep `cats-runtime` unchanged as the runtime boundary.
- Reserve `cats-one` for install/bootstrap flows.
- Avoid mixing this rename with unrelated feature or architecture changes where
  possible.

## Naming Targets

| Layer | Target |
|------|--------|
| Umbrella brand | `Cats Inc` |
| GitHub owner / npm scope | `cats-inc` |
| Flagship product brand | `Cats` |
| Main suite host repo target | `cats-platform` |
| Main suite host package target | `@cats-inc/cats-platform` |
| Persistent host executable | `cats` |
| Runtime repo/package | `cats-runtime` |
| Installer package | `cats-one` |
| One-shot install entrypoint | `npx cats-one` |

## Relationship to Earlier Rename Work

This plan supersedes
[PLAN-018](./PLAN-018-rename-the-main-suite-from-cats-inc-to-cats.md).

Work completed during the earlier `cats-inc` -> `cats` rename is still useful:

- the brand/product split between `Cats Inc` and `Cats`
- the audit discipline for tracking historical vs accidental leftovers
- the existing documentation cleanup around `cats-runtime`

However, the final host target is no longer `cats`; it is now
`cats-platform`.

## Phases

### Phase 1: Freeze the New Naming Contract

- [x] Mark ADR-045 as the active naming decision and ADR-026 as superseded.
- [x] Mark PLAN-031 as the active rename plan and PLAN-018 as superseded.
- [x] Freeze the new naming matrix for brand, host repo/package, runtime, and
      installer surfaces.
- [x] Audit current `cats` references and classify each as:
      - brand/product label
      - host repo/package identity
      - historical note
      - internal code symbol left for later cleanup

**Deliverables**: one active naming contract and a clear impact inventory.

### Phase 2: Documentation and Public Language Migration

- [x] Update `README.md` to distinguish:
      - `Cats` as brand/product
      - `cats-platform` as the host
      - `cats-runtime` as the runtime boundary
      - `cats-one` as the installer entrypoint
- [x] Update architecture, API, setup, deployment, services, and packaging docs
      to use the new naming matrix.
- [x] Replace future public repo references such as `cats-inc/cats` with
      `cats-inc/cats-platform`.
- [x] Update plugin and package-planning docs so the host package target is
      `@cats-inc/cats-platform`.
- [x] Keep historical notes readable where older rename stages still matter.

**Deliverables**: docs stop conflating the `Cats` brand with the technical host
identity.

### Phase 3: Package, Installer, and Executable Alignment

- [x] Change `package.json` from the current host name to the target host
      package identity when the migration slice executes.
- [x] Reconcile packaging docs that currently assume the host package/executable
      is `cats`.
- [x] Document `cats-one` as the canonical one-shot install/bootstrap package.
- [x] Decide whether the persistent local executable remains `cats` or moves to
      a more explicit host-oriented binary name, and document that choice
      explicitly.
- [x] Reconcile
      [ADR-013](../decisions/013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
      and [PLAN-013](./PLAN-013-self-hosted-npm-app-packaging.md) with the new
      host/install split.

**Deliverables**: package, installer, and executable naming no longer point at
different concepts accidentally.

### Phase 4: Repo and Workspace Migration Coordination

- [ ] Rename the future public GitHub repo target from `cats` to
      `cats-platform`.
- [ ] Update clone/setup docs, badges, and repository references.
- [ ] Plan the monorepo subproject folder rename from `cats/` to
      `cats-platform/` as a coordinated slice once references and scripts are
      ready.
- [x] Document transitional local-folder expectations while the monorepo still
      uses `cats/`.

**Deliverables**: repo identity and workspace guidance align with the new host
name.

### Phase 5: Validation and Cleanup

- [x] Validate that docs, package metadata, and public payloads align on the
      same naming model.
- [x] Add or update tests where public app metadata or installer text is
      asserted.
- [x] Log what still says `cats` by design:
      - brand/product labels
      - historical ADR/PLAN content
      - intentionally deferred internal symbols
- [ ] Remove or document accidental leftovers discovered during the audit.

**Deliverables**: a controlled rename with explicit leftover rules instead of
drift.

## Candidate Code and Doc Areas

| Area | Action | Why |
|------|--------|-----|
| `package.json` | Update later | Move the host package identity off bare `cats` |
| `README.md` | Update | Clarify brand vs host vs runtime vs installer |
| `docs/api.md` | Update | Public metadata and host naming must distinguish product and host |
| `docs/architecture.md` | Update | Suite-host naming and repo targets need the new contract |
| `docs/deployment.md` | Update | Packaging and installer guidance must include `cats-one` and `cats-platform` |
| `docs/setup-guide.md` | Update | Quick-start paths and folder names need the new host target |
| `docs/services.md` | Update | Product-facing identifiers must reflect the host rename where appropriate |
| `docs/decisions/013-*` | Update | Packaging guidance currently assumes the older host/package naming |
| `docs/plans/PLAN-013-*` | Update | Packaging plan must reflect the host/install split |
| plugin/package planning docs | Update | Host package target should become `@cats-inc/cats-platform` |
| source metadata strings | Audit | Identify what should stay `Cats` vs what should become `cats-platform` |

## Current Compatibility and Intentional Leftovers

These items are expected to remain during or after the first rename slice:

- `Cats` as the flagship product/marketing name
- `cats-runtime` as the runtime repo/package identity
- `cats-one` as the install/bootstrap package name
- historical rename records such as ADR-026 and PLAN-018
- existing ADR/PLAN filenames that encode older naming stages
- temporary monorepo folder references to `cats/` until the coordinated folder
  rename lands

## Validation

- Public docs clearly distinguish `Cats`, `cats-platform`, `cats-runtime`, and
  `cats-one`.
- No docs imply that the host repo/package is still canonically `cats`.
- Future public references align on `cats-inc/cats-platform` and
  `cats-inc/cats-runtime`.
- Historical `cats` references are either intentionally product-brand labels or
  explicitly documented leftovers.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Repo/package/display naming drift apart again | High | Freeze the new naming matrix first and migrate surfaces in a tracked sequence |
| The host/install split confuses packaging docs | High | Treat `cats-platform` and `cats-one` as separate concerns and update ADR-013/PLAN-013 explicitly |
| Temporary local-folder mismatch causes confusion | Medium | Document the monorepo transition path and defer the folder rename to a coordinated slice |
| Rename work gets mixed with unrelated feature delivery | Medium | Keep this as a tracked documentation/metadata slice before larger implementation churn |
| Old `cats` references survive in user-facing metadata | Medium | Audit public payloads and add validation/tests where those strings are asserted |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement ADR-045 / PLAN-031. Keep `Cats` as the flagship product brand,
> rename the main suite host from `cats` to `cats-platform`, preserve
> `cats-runtime`, reserve `cats-one` for install/bootstrap flows, and migrate
> docs/package/public metadata in a controlled way with explicit historical and
> compatibility notes.

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-30 | Plan created to supersede PLAN-018 and apply ADR-045 naming targets |
| 2026-03-30 | Phase 1-3 migration slice landed across README, packaging docs, research notes, package metadata, and the new `cats-one` bootstrap package scaffold while keeping the persistent executable as `cats` |
| 2026-03-30 | Validation slice updated `tests/package-contract.test.js` for `@cats-inc/cats-platform` and replaced direct `npm.cmd` spawning with npm CLI script resolution so Windows package-contract checks can run in this environment |
| 2026-03-30 | Local tarball smoke confirmed `cats-one` installs a `cats-one` shim and successfully hands off to the packaged `@cats-inc/cats-platform` CLI while keeping `cats-runtime` as a separate dependency |

---

*Created: 2026-03-30*
*Author: Codex*
