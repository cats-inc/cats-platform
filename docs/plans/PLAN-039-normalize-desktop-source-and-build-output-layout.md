# PLAN-039: Normalize Desktop Source and Build Output Layout Across `cats-platform` and `cats-runtime`

Status: Completed

## Related Decisions

- [ADR-003](../decisions/003-electron-host-manages-local-services.md)
- [ADR-045](../decisions/045-use-cats-platform-as-the-main-platform-host-under-cats-brand.md)
- [ADR-053](../decisions/053-use-structured-cats-home-platform-storage.md)

## Related Plans

- Paired runtime ownership plan: `cats-runtime` `PLAN-031`

## Related Spec

N/A

## Spec Requirement

No separate SPEC is required for this slice.

This work is a repo-layout, build-layout, and desktop-host vocabulary cleanup
rather than a new user-facing feature. The user direction is already explicit:

- `cats-platform` should stop exposing a root-level `electron/` source tree and
  root-level `dist*` output sprawl.
- `cats-runtime` should stop being the odd package out and align with the same
  `build/...` vocabulary.
- because neither package has been released, the migration should remove legacy
  aliases and fail fast instead of preserving compatibility shims.

If this layout cleanup later expands into new distribution channels or a larger
desktop architecture rewrite, that follow-up can be captured in a dedicated
SPEC/ADR at that time.

## Scope

This plan covers:

- moving `cats-platform/electron/**` into `cats-platform/desktop/host/**`
- renaming `cats-platform` desktop build vocabulary away from
  `dist-electron/*`
- consolidating `cats-platform` build outputs under a single `build/` root
- updating package metadata, scripts, test imports, packaging paths, smoke
  checks, and docs to match the new source/output layout
- coordinating the `cats-runtime` output rename where `cats-platform`
  packaging or sidecar staging consumes runtime artifacts
- removing old path aliases, duplicate emit paths, and compatibility shims
  instead of carrying both old and new layouts

This plan does not cover:

- changing public package names such as `@cats-inc/cats-platform` or
  `cats-runtime`
- redesigning the desktop host responsibility split beyond renaming its source
  home from `electron/` to `desktop/host/`
- implementing the `cats-runtime` output migration directly inside this plan;
  that work belongs to `cats-runtime` `PLAN-031`
- moving runtime-generated source files such as
  `src/http/ui/generated/runtimeTailwind.ts` out of `src/`
- changing `~/.cats` storage layout beyond the ADRs already accepted

## Ownership Boundary

- `cats-platform` owns:
  - `desktop/host/**`
  - `build/renderer`, `build/server`, `build/desktop`, `build/test`
  - packaging staging under `build/desktop-packaging`
  - packaged resource naming under `desktop/...`
- `cats-runtime` owns:
  - `build/runtime`
  - runtime package entrypoints and scripts
  - runtime docs and tests for the output-root migration
- cross-package coordination is required where desktop packaging stages a built
  `cats-runtime`, but the runtime package keeps ownership of its own build
  contract

## Hard Constraints

- Do not keep old and new output paths emitting in parallel.
- Do not leave temporary redirects or compatibility shims for old source/output
  names; the packages have not shipped yet.
- Do not keep root-level `dist`, `dist-server`, `dist-electron`, or
  `dist-test` after the migration lands in `cats-platform`.
- Do not keep `cats-runtime/dist` after the migration lands there.
- Do not let packaging, smoke scripts, or tests continue to depend on old path
  names after the migration slice is complete.

## Target Layout

### `cats-platform`

```text
cats-platform/
  src/
  desktop/
    host/
  build/
    renderer/
    server/
    desktop/
    test/
    desktop-packaging/
  release/
```

### `cats-runtime`

```text
cats-runtime/
  src/
  build/
    runtime/
  public/
```

## Migration Principles

1. Prefer domain names over implementation names.
   - Use `desktop/host`, not `electron`.
   - Use `build/desktop`, not `dist-electron`.
2. Group build outputs by responsibility under one root.
   - `build/renderer`
   - `build/server`
   - `build/desktop`
   - `build/test`
3. Treat packaging staging as build output.
   - Keep `build/desktop-packaging/` under the same `build/` family.
4. Keep final installable artifacts distinct from staging output.
   - `build/desktop-packaging/` is the staging workspace.
   - `release/` remains the final installer output root.
5. Remove old names in the same slice that introduces new names.
6. Do not widen testing scope by default; validate the touched layout
   boundaries with targeted checks.

## Phases

### Phase 1: Freeze the New Source and Output Matrix

- [x] Confirm `cats-platform/electron/**` will move to `desktop/host/**`,
      not `desktop/electron/**`.
- [x] Confirm `cats-platform` output roots:
      - `build/renderer`
      - `build/server`
      - `build/desktop`
      - `build/test`
      - `build/desktop-packaging`
- [x] Audit the current codebase for references to:
      - `electron/`
      - `dist-electron/`
      - `dist-server/`
      - `dist-test/`
- [x] Confirm the packaging boundary explicitly:
      - `build/desktop-packaging/` is staging
      - `release/` is final installer output
- [x] Audit `.gitignore` and cleanup scripts against the new output roots.
- [x] Freeze the no-legacy-shim rule for this migration.

**Deliverables**: one explicit layout matrix and an inventory of all affected
references before implementation starts.

### Phase 2: Move `cats-platform` Desktop Source into `desktop/host`

- [x] Move `electron/**` to `desktop/host/**`.
- [x] Rename `tsconfig.electron.json` to `tsconfig.desktop.json`.
- [x] Update `rootDir`, `include`, and all build scripts to use
      `desktop/host/**`.
- [x] Update any source imports, script imports, test references, and docs that
      still refer to `electron/*`.
- [x] Keep desktop-host responsibilities intact while renaming only the source
      home and related config vocabulary.

**Deliverables**: desktop host source no longer lives in `electron/`, and the
desktop build entrypoint vocabulary stops encoding the Electron implementation
detail directly.

### Phase 3: Consolidate `cats-platform` Build Outputs Under `build/`

- [x] Rename renderer output:
      - `dist` -> `build/renderer`
- [x] Rename server output:
      - `dist-server` -> `build/server`
- [x] Rename desktop host output:
      - `dist-electron` -> `build/desktop`
- [x] Rename test bundle output:
      - `dist-test` -> `build/test`
- [x] Rename root cleanup helpers and script names as needed
      (`clean-dist` -> `clean-build`) instead of keeping stale terminology.
- [x] Update `vite.config.ts` so the renderer output target matches
      `build/renderer`.
- [x] Update `package.json` fields such as:
      - `main`
      - `files`
      - build/typecheck/test scripts
- [x] Update `.gitignore` to drop old root-level `dist*` assumptions and cover
      the canonical `build/` outputs instead.
- [x] Update any runtime packaging or installer staging scripts that import
      compiled desktop modules from the old output locations.

**Deliverables**: `cats-platform` exposes one coherent `build/` tree instead of
      four root-level `dist*` directories.

### Phase 4: Align Desktop Packaging and Packaged Resource Paths

- [x] Keep packaging staging under `build/desktop-packaging/`.
- [x] Rename packaged resource destination paths from
      `desktop-host/setup-assets` to `desktop/setup-assets`.
- [x] Update smoke scripts, staged manifests, helper catalogs, and packaging
      tests to use the new packaged resource path.
- [x] Validate that final installer artifacts still emit to `release/` instead
      of being conflated with staging output.
- [x] Update docs and packaged-relative-path assertions so desktop-host source
      naming and packaged resource naming do not drift apart.

**Deliverables**: source layout, packaged resource layout, smoke checks, and
installer contracts all use the same `desktop/...` vocabulary.

### Phase 5: Coordinate the Paired `cats-runtime` Output Migration

- [x] Land `cats-runtime` `PLAN-031` so the runtime package moves from `dist/`
      to `build/runtime/` under its own ownership.
- [x] Update any `cats-platform` packaging or staging logic that currently
      assumes the runtime still emits to `dist/`.
- [x] Validate that packaged desktop staging still picks up the built runtime
      after the runtime output-root migration lands.

**Deliverables**: the platform layout migration and the paired runtime output
plan align without leaving cross-package path drift.

### Phase 6: Sweep Tests, Docs, and Contract Assertions

- [x] Update `cats-platform` tests importing `../dist-electron/*` or asserting
      `dist*` paths.
- [x] Update `cats-runtime` tests and helpers asserting `dist/*`.
- [x] Update current docs and scripts to the new layout.
- [x] Leave historical research/ADR text untouched unless the old path appears
      as active guidance rather than historical context.
- [x] Validate that no repo-root `dist*` references remain in active
      `cats-platform` code/docs/scripts and no `cats-runtime/dist` references
      remain in active code/docs/scripts.

**Deliverables**: current code, current docs, and active tests all reflect the
same layout contract.

## Candidate File Areas

| Area | Action | Why |
|------|--------|-----|
| `cats-platform/electron/**` | Move/Rename | Desktop host source should live under `desktop/host/**` |
| `cats-platform/tsconfig.electron.json` | Rename/Modify | Desktop build config should follow the new source home and become `tsconfig.desktop.json` |
| `cats-platform/package.json` | Modify | Build outputs, `main`, scripts, and packaged files all reference old names |
| `cats-platform/vite.config.ts` | Modify | Renderer output should move from `dist` to `build/renderer` |
| `cats-platform/.gitignore` | Modify | Old `dist*` roots should be replaced by the canonical `build/` layout |
| `cats-platform/scripts/*.mjs` | Modify | Packaging/build scripts import compiled desktop output from old locations |
| `cats-platform/tests/**/*.test.js` | Modify | Many tests import from `dist-electron` or assert old packaged paths |
| `cats-platform/docs/**` | Modify | Current docs still describe the old source/output vocabulary |
| `cats-platform/release/**` | Validate | Final installer artifacts should stay distinct from staging output |
| `cats-runtime/*` | Coordinate via `PLAN-031` | Runtime output-root changes remain runtime-owned, not platform-owned |

## Technical Decisions Frozen by This Plan

- Decision 1: `cats-platform` desktop source moves to `desktop/host`, not
  `desktop/electron`.
- Decision 2: `cats-platform` build outputs consolidate under `build/` instead
  of leaving root-level `dist*` directories.
- Decision 3: `cats-platform` renderer output uses `build/renderer`, not
  `build/web`, because it represents the shared renderer surface rather than a
  separately owned web-product deploy target.
- Decision 4: `cats-runtime` aligns with the same build vocabulary through
  `build/runtime/`, but the runtime package owns that migration in a paired
  plan instead of embedding all runtime tasks directly here.
- Decision 5: this migration removes old names instead of keeping compatibility
  aliases because neither package has shipped.
- Decision 6: packaged desktop helper assets should align on `desktop/...`
  vocabulary rather than keeping `desktop-host/...` as a separate naming island.

## Testing Strategy

Use targeted, risk-based validation only.

- **`cats-platform` targeted checks**
  - package-level typecheck after each path-bearing slice
  - renderer/server/desktop/test build commands after output-path updates
  - packaging-path tests
  - smoke-script/path-resolution tests that directly assert packaged or desktop
    host locations
- **`cats-runtime` targeted checks**
  - are tracked in the paired runtime plan and should at least include package
    build, entrypoint/export checks, and path-bearing helper validation
- **Docs validation**
  - targeted search/diff checks to ensure active docs stop referencing replaced
    paths
- **Do not default to full-suite runs**
  - broaden validation when a slice changes package entrypoints, tsconfig
    boundaries, packaging contracts, or other path-bearing surfaces with wide
    blast radius

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Path drift between source, build scripts, and package metadata | High | Change source and package/build metadata in the same slice for each phase |
| Packaged desktop helper paths diverge from source naming again | High | Rename packaged `desktop-host/setup-assets` in the same migration, not later |
| Cross-platform smoke scripts regress on Windows/macOS/Linux | High | Keep smoke/path checks in the targeted validation set for the packaging slice |
| Runtime npm metadata breaks when `dist/` is removed | High | Update `main`, `types`, `exports`, `bin`, `files`, and pack/install scripts together |
| `.gitignore` or cleanup scripts still preserve stale output roots | Medium | Treat `.gitignore` and cleanup-script updates as first-class migration tasks, not cleanup afterthoughts |
| Repo-root cleanup misses stale outputs and leaves mixed layouts | Medium | Rename cleanup scripts to the new `build/` vocabulary and explicitly remove old roots |
| Historical docs get rewritten unnecessarily | Low | Update only active/current docs; leave historical ADR/research prose alone unless it is still normative |

## Suggested Execution Order

1. Land the `cats-platform` source rename to `desktop/host` plus
   `tsconfig.desktop.json`.
2. Move `cats-platform` outputs under `build/` and repair package/test/script
   references.
3. Rename packaged helper/resource paths from `desktop-host/...` to
   `desktop/...`.
4. Land the paired `cats-runtime` `PLAN-031` migration from `dist/` to
   `build/runtime/`.
5. Sweep active docs, smoke scripts, and current tests.

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-06 | Plan created to align `cats-platform` desktop source/build layout with `cats-runtime` build vocabulary and remove unreleased legacy path names |
| 2026-04-06 | Phase 2 slice 1 landed: moved the desktop host source tree from `electron/` to `desktop/host/`, renamed `tsconfig.electron.json` to `tsconfig.desktop.json`, and updated active docs/scripts to compile from the new source home while keeping the existing `dist-electron/` output for the next slice |
| 2026-04-06 | Phase 2 slice 2 landed: consolidated app build artifacts under `build/server`, `build/renderer`, and `build/desktop`, updated desktop packaging/staging contracts, renamed the clean script to `scripts/clean-build.mjs`, and refreshed active docs/smoke tests/package-contract assertions for the new output layout; validation included `npm run build`, `npm run build:test-ui`, `node --test tests/package-contract.test.js`, `node --test tests/desktop-packaging.test.js tests/desktop-host-state.test.js tests/desktop-supervisor.test.js tests/desktop-setup-bridge.test.js`, `node --test tests/app-startup.test.js tests/server.test.js tests/rest-api.test.js`, `node --test tests/provider-telegram-routes.test.js`, `node --test tests/runtime-bridge-routes.test.js`, `node --test tests/product-delete-runtime-cleanup.test.js`, `node --test tests/platform-setup-wizard.test.js`, and `node --test tests/runtime-setup-flow.test.js` |
| 2026-04-06 | Phase 2 slice 3 landed: renamed packaged setup helper/resource paths from `desktop-host/setup-assets/*` to `desktop/setup-assets/*`, updated electron-builder `extraResources`, synced host setup metadata plus Windows/macOS/Linux smoke checks, and refreshed desktop packaging/readiness/state bridge assertions for the new packaged location; validation included `npm run build:host` and `node --test tests/desktop-packaging.test.js tests/desktop-host-state.test.js tests/desktop-setup-bridge.test.js tests/desktop-readiness.test.js` |
| 2026-04-06 | Phase 4 slice 4 landed: switched the desktop host default runtime entry, packaging plan, staged sidecar asset map, packaged smoke scripts, and desktop packaging/supervisor/readiness tests from `cats-runtime/dist` to `cats-runtime/build/runtime`, and refreshed active setup/MCP docs so the platform-side contract now matches `cats-runtime` `PLAN-031` |
| 2026-04-06 | Final sweep completed: verified active `cats-platform` code/docs/scripts/tests no longer depend on repo-root `dist*` outputs or `cats-runtime/dist`, updated remaining current-state docs to `build/renderer` and `build/runtime`, and closed the paired migration with targeted desktop-host validation after rebuilding the compiled host output |

---

*Created: 2026-04-06*
*Author: Codex*
