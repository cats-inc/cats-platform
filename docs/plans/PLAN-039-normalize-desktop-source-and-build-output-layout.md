# PLAN-039: Normalize Desktop Source and Build Output Layout Across `cats-platform` and `cats-runtime`

Status: Draft

## Related Decisions

- [ADR-003](../decisions/003-electron-host-manages-local-services.md)
- [ADR-045](../decisions/045-use-cats-platform-as-the-main-platform-host-under-cats-brand.md)
- [ADR-053](../decisions/053-use-structured-cats-home-platform-storage.md)
- `cats-runtime` [ADR-030](../../../cats-runtime/docs/decisions/030-use-structured-cats-home-runtime-storage.md)

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
- moving `cats-runtime` output from `dist/` to `build/runtime/`
- updating package metadata, scripts, test imports, packaging paths, smoke
  checks, and docs to match the new source/output layout
- removing old path aliases, duplicate emit paths, and compatibility shims
  instead of carrying both old and new layouts

This plan does not cover:

- changing public package names such as `@cats-inc/cats-platform` or
  `cats-runtime`
- redesigning the desktop host responsibility split beyond renaming its source
  home from `electron/` to `desktop/host/`
- moving runtime-generated source files such as
  `src/http/ui/generated/runtimeTailwind.ts` out of `src/`
- changing `~/.cats` storage layout beyond the ADRs already accepted

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
    web/
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
   - `build/web`
   - `build/server`
   - `build/desktop`
   - `build/test`
   - `build/runtime`
3. Treat packaging staging as build output.
   - Keep `build/desktop-packaging/` under the same `build/` family.
4. Remove old names in the same slice that introduces new names.
5. Do not widen testing scope by default; validate the touched layout
   boundaries with targeted checks.

## Phases

### Phase 1: Freeze the New Source and Output Matrix

- [ ] Confirm `cats-platform/electron/**` will move to `desktop/host/**`,
      not `desktop/electron/**`.
- [ ] Confirm `cats-platform` output roots:
      - `build/web`
      - `build/server`
      - `build/desktop`
      - `build/test`
      - `build/desktop-packaging`
- [ ] Confirm `cats-runtime` output root:
      - `build/runtime`
- [ ] Audit the current codebase for references to:
      - `electron/`
      - `dist-electron/`
      - `dist-server/`
      - `dist-test/`
      - `dist/` inside `cats-runtime`
- [ ] Freeze the no-legacy-shim rule for this migration.

**Deliverables**: one explicit layout matrix and an inventory of all affected
references before implementation starts.

### Phase 2: Move `cats-platform` Desktop Source into `desktop/host`

- [ ] Move `electron/**` to `desktop/host/**`.
- [ ] Rename `tsconfig.electron.json` to `tsconfig.desktop.json`.
- [ ] Update `rootDir`, `include`, and all build scripts to use
      `desktop/host/**`.
- [ ] Update any source imports, script imports, test references, and docs that
      still refer to `electron/*`.
- [ ] Keep desktop-host responsibilities intact while renaming only the source
      home and related config vocabulary.

**Deliverables**: desktop host source no longer lives in `electron/`, and the
desktop build entrypoint vocabulary stops encoding the Electron implementation
detail directly.

### Phase 3: Consolidate `cats-platform` Build Outputs Under `build/`

- [ ] Rename renderer output:
      - `dist` -> `build/web`
- [ ] Rename server output:
      - `dist-server` -> `build/server`
- [ ] Rename desktop host output:
      - `dist-electron` -> `build/desktop`
- [ ] Rename test bundle output:
      - `dist-test` -> `build/test`
- [ ] Rename root cleanup helpers and script names as needed
      (`clean-dist` -> `clean-build`) instead of keeping stale terminology.
- [ ] Update `package.json` fields such as:
      - `main`
      - `files`
      - build/typecheck/test scripts
- [ ] Update any runtime packaging or installer staging scripts that import
      compiled desktop modules from the old output locations.

**Deliverables**: `cats-platform` exposes one coherent `build/` tree instead of
      four root-level `dist*` directories.

### Phase 4: Align Desktop Packaging and Packaged Resource Paths

- [ ] Keep packaging staging under `build/desktop-packaging/`.
- [ ] Rename packaged resource destination paths from
      `desktop-host/setup-assets` to `desktop/setup-assets`.
- [ ] Update smoke scripts, staged manifests, helper catalogs, and packaging
      tests to use the new packaged resource path.
- [ ] Update docs and packaged-relative-path assertions so desktop-host source
      naming and packaged resource naming do not drift apart.

**Deliverables**: source layout, packaged resource layout, smoke checks, and
installer contracts all use the same `desktop/...` vocabulary.

### Phase 5: Move `cats-runtime` Output to `build/runtime`

- [ ] Change `cats-runtime` TypeScript `outDir` from `dist` to `build/runtime`.
- [ ] Update package metadata:
      - `main`
      - `types`
      - `exports`
      - `bin`
      - `files`
- [ ] Update all scripts and helpers that execute:
      - `dist/index.js`
      - `dist/bin/*`
- [ ] Rename cleanup script vocabulary as needed
      (`clean-dist` -> `clean-build`) so the package no longer advertises the
      old layout.
- [ ] Update runtime docs, release guidance, and pack/install helpers so they
      no longer reference `dist/`.

**Deliverables**: `cats-runtime` uses `build/runtime/` as its only compiled
output root.

### Phase 6: Sweep Tests, Docs, and Contract Assertions

- [ ] Update `cats-platform` tests importing `../dist-electron/*` or asserting
      `dist*` paths.
- [ ] Update `cats-runtime` tests and helpers asserting `dist/*`.
- [ ] Update current docs and scripts to the new layout.
- [ ] Leave historical research/ADR text untouched unless the old path appears
      as active guidance rather than historical context.
- [ ] Validate that no repo-root `dist*` references remain in active
      `cats-platform` code/docs/scripts and no `cats-runtime/dist` references
      remain in active code/docs/scripts.

**Deliverables**: current code, current docs, and active tests all reflect the
same layout contract.

## Candidate File Areas

| Area | Action | Why |
|------|--------|-----|
| `cats-platform/electron/**` | Move/Rename | Desktop host source should live under `desktop/host/**` |
| `cats-platform/tsconfig.electron.json` | Rename/Modify | Desktop build config should follow the new source home |
| `cats-platform/package.json` | Modify | Build outputs, `main`, scripts, and packaged files all reference old names |
| `cats-platform/vite.config.ts` | Modify | Renderer output should move from `dist` to `build/web` |
| `cats-platform/scripts/*.mjs` | Modify | Packaging/build scripts import compiled desktop output from old locations |
| `cats-platform/tests/**/*.test.js` | Modify | Many tests import from `dist-electron` or assert old packaged paths |
| `cats-platform/docs/**` | Modify | Current docs still describe the old source/output vocabulary |
| `cats-runtime/tsconfig.json` | Modify | `outDir` must move to `build/runtime` |
| `cats-runtime/package.json` | Modify | Package entrypoints and scripts still point at `dist/` |
| `cats-runtime/scripts/**` | Modify | Restart/pack/install helpers execute `dist/index.js` and `dist/bin/*` |
| `cats-runtime/tests/**` | Modify | Runtime tests and fixtures may assert old output locations |
| `cats-runtime/docs/**` | Modify | Current docs still describe `dist/` as the compiled runtime root |

## Technical Decisions Frozen by This Plan

- Decision 1: `cats-platform` desktop source moves to `desktop/host`, not
  `desktop/electron`.
- Decision 2: `cats-platform` build outputs consolidate under `build/` instead
  of leaving root-level `dist*` directories.
- Decision 3: `cats-runtime` aligns with the same build vocabulary through
  `build/runtime/`, even though it currently has only one compiled output root.
- Decision 4: this migration removes old names instead of keeping compatibility
  aliases because neither package has shipped.
- Decision 5: packaged desktop helper assets should align on `desktop/...`
  vocabulary rather than keeping `desktop-host/...` as a separate naming island.

## Testing Strategy

Use targeted, risk-based validation only.

- **`cats-platform` targeted checks**
  - desktop/source build config typecheck
  - renderer/server/desktop/test build commands after output-path updates
  - packaging-path tests
  - smoke-script/path-resolution tests that directly assert packaged or desktop
    host locations
- **`cats-runtime` targeted checks**
  - package build
  - entrypoint/export checks
  - restart/pack/install helper tests or smoke checks that execute compiled
    runtime paths
- **Docs validation**
  - targeted search/diff checks to ensure active docs stop referencing replaced
    paths
- **Do not default to full-suite runs**
  - broaden validation only if the migration unexpectedly crosses into a wider
    contract boundary than planned

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Path drift between source, build scripts, and package metadata | High | Change source and package/build metadata in the same slice for each phase |
| Packaged desktop helper paths diverge from source naming again | High | Rename packaged `desktop-host/setup-assets` in the same migration, not later |
| Cross-platform smoke scripts regress on Windows/macOS/Linux | High | Keep smoke/path checks in the targeted validation set for the packaging slice |
| Runtime npm metadata breaks when `dist/` is removed | High | Update `main`, `types`, `exports`, `bin`, `files`, and pack/install scripts together |
| Repo-root cleanup misses stale outputs and leaves mixed layouts | Medium | Rename cleanup scripts to the new `build/` vocabulary and explicitly remove old roots |
| Historical docs get rewritten unnecessarily | Low | Update only active/current docs; leave historical ADR/research prose alone unless it is still normative |

## Suggested Execution Order

1. Land the `cats-platform` source rename to `desktop/host` plus
   `tsconfig.desktop.json`.
2. Move `cats-platform` outputs under `build/` and repair package/test/script
   references.
3. Rename packaged helper/resource paths from `desktop-host/...` to
   `desktop/...`.
4. Move `cats-runtime` from `dist/` to `build/runtime/`.
5. Sweep active docs, smoke scripts, and current tests.

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-06 | Plan created to align `cats-platform` desktop source/build layout with `cats-runtime` build vocabulary and remove unreleased legacy path names |

---

*Created: 2026-04-06*
*Author: Codex*
