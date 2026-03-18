# PLAN-013: Self-Hosted npm App Packaging

Status: Draft (Pending Review)

## Scope

Implement the app-distribution direction defined in
[ADR-011](../decisions/011-ship-cats-inc-as-an-executable-self-hosted-npm-app.md).

This plan covers the first technical self-hosted delivery path for `cats-inc`:

- `npx cats-inc` or equivalent install-and-run flows
- publishable app-package curation
- first-run bootstrap for technical evaluators
- local `cats-runtime` supervision or attachment
- docs and verification for contributor-friendly setup

This plan is explicitly **not** an Electron implementation plan and **not** a
root-package SDK extraction plan.

## Hard Constraints

- Do not turn the root `cats-inc` package into a general-purpose library.
- Do not make `cats-inc` source-import `cats-runtime` internals for production
  startup.
- Keep the current product boundary: renderer talks to `cats-inc`,
  `cats-inc` talks to `cats-runtime`.
- Keep Electron as a later wrapper around the same local services, not a
  blocker for npm-based self-hosting.
- Favor a technical-evaluator experience first; do not expand scope into a
  full non-technical onboarding redesign in this slice.

## Phases

### Phase 1: Packaging Contract Freeze

- [ ] Freeze the first supported invocation modes:
      - `npx cats-inc`
      - `npm install -g cats-inc` then `cats-inc`
      - local dev/build flows remain supported
- [ ] Freeze the minimum CLI command surface for the first release:
      - default start command
      - optional `init`
      - optional `doctor`
- [ ] Freeze how `cats-inc` discovers or creates local config, state, and data
      directories.
- [ ] Freeze the runtime strategy modes:
      - attach to an already-running `cats-runtime`
      - manage a local `cats-runtime` child process
- [ ] Freeze the rule that the root package remains app-first even if a few
      internal helpers are refactored for CLI composition.

**Deliverables**: approved app-package UX, CLI scope, and runtime-boundary
rules.

### Phase 2: Executable Package Foundation

- [ ] Add a real executable entrypoint via `package.json bin`.
- [ ] Introduce CLI dispatch code that boots the app without redefining the
      root package as a reusable SDK.
- [ ] Curate publish contents with `files`, `.npmignore`, and/or prepack
      behavior so built server and renderer assets are included while docs,
      tests, and source-only material are not shipped by default.
- [ ] Define the build/publish contract so `dist-server/` and `dist/` are
      available in the published package.
- [ ] Decide whether `main`/`types` remain for internal tooling compatibility
      or should be minimized further for the app-first package story.

**Deliverables**: publishable npm app package with executable entrypoint and
curated assets.

### Phase 3: First-Run Bootstrap

- [ ] Implement startup-time detection for missing config/state prerequisites.
- [ ] Create or suggest default local paths for workspace state, app config,
      and other product-owned files.
- [ ] Add a technical first-run flow that emits actionable setup guidance
      instead of raw crashes when prerequisites are missing.
- [ ] Keep advanced environment-variable overrides for CI and power users.
- [ ] Define how app bootstrap records whether it is using managed runtime
      mode or external-runtime attach mode.

**Deliverables**: usable first-run bootstrap for technical evaluators and
contributors.

### Phase 4: Runtime Supervision and Readiness

- [ ] Add a local runtime supervisor module for managed mode.
- [ ] Spawn `cats-runtime` as a child process when configured to do so.
- [ ] Wait for runtime readiness over HTTP instead of source-importing runtime
      internals.
- [ ] Define startup timeout, retry, and failure messaging behavior when the
      runtime cannot become healthy.
- [ ] Define shutdown ordering so `cats-inc` can stop a managed runtime it
      started without affecting externally managed runtime instances.
- [ ] Define a minimal version-compatibility policy between `cats-inc` and
      `cats-runtime`.

**Deliverables**: working managed-runtime path that preserves the explicit
process boundary.

### Phase 5: Documentation and Validation

- [ ] Update setup and deployment docs for the npm-based self-hosted path.
- [ ] Document the difference between app-managed runtime mode and external
      runtime mode.
- [ ] Add tests for CLI parsing, first-run bootstrap behavior, and runtime
      readiness handling.
- [ ] Add at least one integration test or scripted verification that launches
      `cats-inc` in packaged-style mode.
- [ ] Document the remaining gap between npm self-hosting and future Electron
      packaging.

**Deliverables**: reviewable docs and test coverage for the first self-hosted
npm delivery path.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `package.json` | Modify | Add `bin`, publish curation, and package lifecycle hooks |
| `src/index.ts` | Refactor carefully | Keep app boot logic usable by CLI entry without redefining the package as a public SDK |
| `src/server.ts` | Review lightly | Confirm server creation remains the app bootstrap core |
| `src/config.ts` | Modify | Support first-run path resolution and managed-runtime config |
| `src/runtime/` | Expand | Add runtime supervision/attachment helpers |
| `src/workspace/store.ts` | Review | Ensure default state-path behavior matches first-run bootstrap |
| `tests/` | Expand | Cover CLI and runtime-readiness behavior |
| `docs/setup-guide.md` | Update | Document install and first-run flows |
| `docs/deployment.md` | Update | Record npm self-hosted distribution as a first-class path |

## Validation

- `npx cats-inc` starts the product or gives actionable first-run guidance.
- A published-style package contains the built renderer and server assets
  required for local execution.
- `cats-inc` can either attach to an existing `cats-runtime` or start one it
  manages locally.
- Managed runtime startup waits for HTTP readiness rather than importing
  runtime internals in-process.
- Managed runtime shutdown does not kill externally managed runtime instances.
- The package story remains app-first and does not become a de facto root SDK.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The root package drifts back toward a library-shaped public API | High | Enforce ADR-011 constraints in implementation and review |
| Published npm contents omit required built assets | High | Validate with publish-style dry runs and packaged-mode tests |
| Runtime supervision becomes tightly coupled to one local environment | High | Keep attach mode and managed mode both supported |
| First-run bootstrap scope expands into a full onboarding product rewrite | Medium | Keep the slice focused on technical evaluators and actionable terminal guidance |
| Runtime/version mismatches create confusing startup failures | High | Define explicit compatibility checks and readable error messages |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement PLAN-011. Make `cats-inc` runnable as an executable self-hosted npm
> app package with `npx`-style startup. Keep the root package app-first, not a
> general-purpose library. Add executable packaging, first-run bootstrap, and
> local `cats-runtime` supervision/attachment while preserving the HTTP process
> boundary. Do not turn this slice into Electron work or a broad onboarding
> redesign.

---

*Last updated: 2026-03-19*
