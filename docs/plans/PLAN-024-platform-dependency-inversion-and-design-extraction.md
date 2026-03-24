# PLAN-024: Platform Inversion, API Unification, and Suite Host Cleanup

> Rewrite `cats` into a cleaner suite architecture without shrinking scope:
> invert platform dependencies, extract a real shared shell/design layer,
> decompose the current hotspots, unify API contracts, migrate endpoint
> namespaces, serve runtime tools from the suite host, and remove every
> temporary compatibility layer by the end of the plan.

## Status

Draft

## Date

2026-03-24

## Related Decisions

- [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md)
- [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md)
- [ADR-037](../decisions/037-serve-runtime-dashboard-and-playground-from-suite-host.md)

## Purpose

This plan is the execution path for the structural cleanup that `cats` still
needs before `Chat`, `Work`, and `Code` can share one core and one suite shell
without turning the repo into a larger version of today's coupling.

The earlier revision of this plan had the right ambition but an inaccurate
baseline and unsafe migration mechanics. This rewrite keeps the full end scope
intact and changes the order of attack so the cleanup can actually land.

## Non-Negotiable End State

By the end of this plan, all of the following must be true:

1. `platform/` no longer imports product implementations from `products/chat/`.
2. `shared/app-shell.ts` is deleted, not left behind as a permanent barrel.
3. Core server/model hot spots are split into domain-focused modules.
4. Chat state, routing, orchestration, and renderer hot spots are split into
   smaller modules with clear seams.
5. A real shared suite shell/design layer exists outside Chat-specific files.
6. API errors, envelopes, request parsing, and pagination/filtering are
   consistent across shared and product routes.
7. Shared resources live at `/api/*`, Chat resources live at `/api/chat/*`,
   and transitional aliases are removed at the end.
8. Runtime dashboard and playground are served by the `cats` host at
   `/runtime/dashboard` and `/runtime/playground`, with runtime API exposed
   through `/runtime/api/*`.
9. Temporary migration shims, route aliases, and compatibility barrels are
   deleted in the final cleanup phase.
10. The refactored architecture is protected by dedicated regression coverage
    for boundaries, contracts, orchestration flows, renderer/shell behavior,
    and suite-host runtime tooling.

Nothing listed above is optional. This plan includes the final cleanup.

## Ground-Truth Snapshot

The plan starts from the codebase as it actually exists on 2026-03-24.

### Structural hotspots

Current hotspot files and measured line counts:

- `src/products/chat/renderer/styles.css` - 2,924 lines
- `src/products/chat/state/runtimeActions.ts` - 2,897 lines
- `src/core/api.ts` - 1,761 lines
- `src/products/chat/state/store.ts` - 1,536 lines
- `src/core/model.ts` - 1,376 lines
- `src/products/chat/renderer/App.tsx` - 1,353 lines

### Dependency problems

The most important reverse dependencies still exist today:

- `platform/orchestration/dispatch.ts` imports `ChatStore`,
  `CompanionBoxStore`, `buildChannelView`, and `routeChannelMessage`.
- `platform/orchestration/planner.ts` imports Chat state/model helpers and
  operator loop types.
- `platform/memory/service.ts` imports `ChatStore`, `CompanionBoxStore`, and
  `requireChannel`.
- `platform/transports/telegram/bridge.ts` imports Chat state/model/runtime
  logic directly.
- `shared/app-shell.ts` is still used as a false shared contract surface.

### Test baseline

`cats` is not starting from zero tests. The repo currently has 39 repo-owned
test files under `tests/`, and `npm test` already protects substantial server,
renderer, routing, and orchestrator behavior. The job is to reshape and expand
that protection while refactoring, not to invent testing from scratch.

### API and host baseline

- Shared routes still live largely under `/api/core/*`.
- Chat routes still occupy top-level `/api/*` paths such as
  `/api/app-shell`, `/api/preferences`, `/api/channels`, and
  `/api/orchestrator/*`.
- Runtime dashboard/playground are still native `cats-runtime` pages rather
  than suite-hosted surfaces in `cats`.

## Execution Principles

1. Invert behavior before relocating types.
2. Keep the full cleanup in scope, but only delete shims after their callers
   are gone.
3. Change contracts in two steps: normalize behavior first, then rename paths.
4. Every phase must leave `npm test` green and add coverage for the seam it
   introduces.
5. Temporary aliases are allowed only as migration scaffolding and must have an
   explicit removal phase.

## Test Workstream

Testing is a first-class workstream in this plan, not a follow-up chore.

Mandatory coverage areas:

- Architecture boundary checks that fail when `platform/` reaches back into
  `products/chat/` or when new code depends on migration-only shims.
- Contract tests for shared and Chat API behavior, including envelopes, error
  codes, pagination/filtering, and namespace migration compatibility.
- Integration tests for chat routing, orchestrator dispatch, task lifecycle,
  Telegram bridge flows, and suite-host runtime interactions.
- Renderer and shell tests that protect shared navigation, suite chrome, and
  product-switching behavior while design extraction is underway.
- Cleanup enforcement checks that prove legacy routes, barrels, aliases, and
  host fallbacks are actually removable when their cleanup phase lands.

Phase-to-test mapping:

- Phase 0 establishes baseline regression coverage and import-boundary checks.
- Phase 1 adds adapter/port contract tests around orchestration, memory, and
  transport composition.
- Phase 2 adds ownership/import tests for shared contract extraction and
  `shared/app-shell.ts` burn-down.
- Phase 3 adds domain route/model tests around each extracted core module.
- Phase 4 adds slice-focused tests for Chat state, routing, and orchestration
  modules after decomposition.
- Phase 5 adds renderer, shell, and design regression tests.
- Phase 6 adds normalized API contract tests on existing paths.
- Phase 7 adds namespace migration and runtime host integration tests for
  `/runtime/dashboard`, `/runtime/playground`, and `/runtime/api/*`.
- Phase 8 adds cleanup enforcement so legacy aliases and migration shims cannot
  silently return.

## Phase Plan

### Phase 0 - Baseline, Guardrails, and Architectural Inventory

Establish the refactor baseline before moving code.

Deliverables:

- Record the current hotspot file sizes and update this plan if the snapshot
  changes materially during execution.
- Add architecture-focused regression coverage around current high-risk flows:
  core task/approval APIs, chat routing, orchestrator dispatch, Telegram bridge,
  shell navigation, and runtime tool links.
- Add import-boundary checks or scripted audits that flag direct
  `platform -> products/chat` imports.
- Document the current route map and classify each route as shared, Chat,
  transport, or host utility.

Exit criteria:

- Refactor work is protected by targeted regression tests.
- The team can detect new reverse dependencies instead of discovering them by
  accident later.

### Phase 1 - Composition Root and Ports/Adapters Inversion

Remove the worst reverse dependencies by introducing ports at the platform
boundary and wiring Chat adapters from the composition root.

Deliverables:

- Define platform-facing interfaces for orchestration, memory, operator
  inspection, routing, and transport integration.
- Move composition into `app/server/` so platform modules depend on interfaces,
  not Chat implementations.
- Create Chat-owned adapters that satisfy those interfaces without promoting
  Chat DTOs into platform contracts.
- Update orchestration and Telegram bridge flows to call ports instead of
  importing Chat runtime/state helpers directly.

Required outcome:

- `platform/` may depend on contracts and adapters passed in from the host, but
  it must stop importing Chat implementation files directly.

Exit criteria:

- The dominant `platform -> products/chat` execution-path imports are removed.
- Existing chat/orchestrator/transport behavior is still covered by tests.
- Ports and adapters introduced in this phase are covered by contract tests.

### Phase 2 - Shared Contract Extraction and `shared/app-shell.ts` Burn-Down

Replace the fake shared barrel with real contracts and a deliberate shell model.

Deliverables:

- Classify everything currently re-exported by `shared/app-shell.ts` into one
  of three buckets:
  shared suite contract, Chat-only contract, or obsolete re-export.
- Create explicit shared contract modules only for the shapes that are truly
  cross-product or host-level.
- Move Chat-only contracts back to Chat-owned modules.
- Reduce `shared/app-shell.ts` to a temporary migration shim with a shrinking
  export list and a tracked removal checklist.

Required outcome:

- Type ownership becomes explicit instead of implicit.
- Platform contracts describe platform behavior, not Chat's internal DTO set.

Exit criteria:

- New imports stop targeting `shared/app-shell.ts`.
- Remaining imports are limited, enumerated, and explicitly mapped to removal
  work in Phases 3 through 8.
- Import-audit coverage proves the migration shim is shrinking rather than
  becoming permanent.

### Phase 3 - Core Server and Model Decomposition

Break the central core hot spots into domain-scoped modules while preserving
runtime behavior.

Deliverables:

- Split `src/core/api.ts` into domain route modules for actors, conversations,
  tasks, runs, projects, work items, artifacts, activities, approvals, memory,
  and owner/system resources.
- Split `src/core/model.ts` into domain-focused mutation/query modules with a
  stable public index.
- Consolidate API error classes into one shared hierarchy usable by both shared
  and product routes.
- Add focused tests around each extracted module boundary.

Required outcome:

- Core route/controller code is no longer a monolith.
- Core model mutations are separated by entity domain rather than living in one
  God file.

Exit criteria:

- `src/core/api.ts` and `src/core/model.ts` are thin composition files.
- Domain route/model modules own the behavior that used to live inline.

### Phase 4 - Chat State, Routing, and Orchestration Decomposition

Split the Chat execution hot spots without losing the current product behavior.

Deliverables:

- Decompose `runtimeActions.ts` into session, routing, delivery, orchestrator,
  attachment, and task-lifecycle action groups.
- Split `store.ts` and state helper modules along persistence, projections,
  selections, activity/task syncing, and transcript concerns.
- Isolate routing/planner concerns that still mix orchestration logic with
  Chat state traversal.
- Replace ad hoc coupling with explicit service boundaries inside Chat.

Required outcome:

- Chat execution logic is readable and testable in slices.
- Orchestration behavior can evolve without a single 2,000+ line state file
  remaining the control center.

Exit criteria:

- `runtimeActions.ts` is no longer the dominant integration monolith.
- The main state flows are testable through smaller modules and seams.

### Phase 5 - Renderer, Shell, and Design Extraction

Pull suite-level shell and design concerns out of Chat while preserving the
visual identity that already works.

Deliverables:

- Extract design tokens, spacing, typography, shared shell chrome, and reusable
  component styles into `src/design/` or equivalent shared renderer modules.
- Split Chat renderer composition so `App.tsx` becomes a thin assembly layer.
- Split `products/chat/renderer/styles.css` into tokens, shell, sidebar,
  transcript, panel, settings, and utility style modules.
- Move suite shell structure out of Chat-owned files so Work and Code can share
  it without inheriting Chat-specific implementation details.

Required outcome:

- The suite shell is genuinely shared.
- Chat-specific visuals stay in Chat; shared design primitives move out.

Exit criteria:

- Shared renderer/design modules exist and are used by Chat.
- The Chat renderer and stylesheet monoliths are substantially reduced.
- Renderer and shell regression coverage protects the extracted suite chrome.

### Phase 6 - API Contract Normalization on Existing Paths

Normalize HTTP behavior before performing the public namespace move.

Deliverables:

- Use one error class hierarchy and one top-level API error handler across core,
  Chat, host, and transport routes where appropriate.
- Normalize request parsing, invalid JSON handling, success envelopes, mutation
  responses, and list pagination/filtering semantics.
- Remove string-matching error classification from Chat route handling.
- Document the normalized contract in the API docs and test it directly.

Required outcome:

- Old URLs may still exist during this phase, but they behave consistently.
- The Phase 7 namespace migration becomes a routing change, not another
  behavior rewrite.

Exit criteria:

- Shared and Chat routes follow the same HTTP contract rules.
- API tests assert envelopes, codes, and pagination/filtering behavior.

### Phase 7 - Namespace Migration and Runtime Tool Hosting

Land the visible public URL cleanup and suite-host the runtime tools.

Deliverables:

- Register the final shared route namespace at `/api/*`.
- Register the final Chat route namespace at `/api/chat/*`.
- Keep legacy route aliases only as temporary compatibility handlers during the
  migration window. Do not use `301` for mutation routes. Legacy handlers must
  preserve method and body semantics until removed.
- Update renderer, client, transport, and integration callers to the final
  namespaces.
- Serve runtime dashboard and playground from the `cats` host at
  `/runtime/dashboard` and `/runtime/playground`.
- Expose runtime JSON through a suite-owned `/runtime/api/*` seam so the
  runtime tools operate without depending on a user-visible second port.

Required outcome:

- Public route semantics match ADR-036 and ADR-037.
- Runtime tools are part of the suite host experience, not a sidecar port leak.

Exit criteria:

- The final route structure is live and exercised by tests.
- Runtime dashboard/playground load correctly from `/runtime/dashboard` and
  `/runtime/playground`.
- Runtime host integration coverage verifies `/runtime/dashboard`,
  `/runtime/playground`, and `/runtime/api/*`.

### Phase 8 - Final Cleanup, Alias Removal, and Enforcement

Delete every temporary structure introduced to make the migration possible.

Deliverables:

- Delete `shared/app-shell.ts`.
- Delete legacy `/api/core/*` and top-level Chat route aliases once all callers
  have migrated.
- Remove temporary compatibility adapters, migration barrels, and transitional
  re-exports.
- Remove design/style import shims that only existed to bridge the extraction.
- Remove any temporary runtime page injection or base-URL fallback once
  `/runtime/dashboard`, `/runtime/playground`, and `/runtime/api/*` are
  canonical.
- Add permanent enforcement for module boundaries, file-size budgets, and route
  namespace ownership.
- Update architecture and API documentation so the final structure is the only
  documented one.

Required outcome:

- No permanent half-state remains in the repo.
- The architecture after the refactor is simpler than what came before.

Exit criteria:

- All temporary shims and aliases introduced by the plan are gone.
- The codebase enforces the boundaries the refactor created.
- Cleanup enforcement checks fail if removed legacy surfaces are reintroduced.

## Workstream-Specific Acceptance Criteria

These checks apply across the whole plan:

- No production file should remain a multi-thousand-line integration sink once
  its phase is complete.
- No new `platform -> products/chat` imports are introduced after Phase 1.
- No Chat-only contract is masquerading as a suite-level contract after
  Phase 2.
- No mixed API contract behavior remains after Phase 6.
- No legacy namespace or migration-only compatibility surface remains after
  Phase 8.
- No phase is complete unless its new seam is covered by tests or an automated
  boundary check.

## Risks and Countermeasures

### Risk 1: A large refactor regresses behavior across Chat and orchestration

Countermeasure:

- Each phase adds seam-focused tests before or alongside extraction work.
- Phase boundaries are behavioral, not cosmetic; each one ends with working
  runtime, routing, and renderer flows.

### Risk 2: Contract moves become another form of type dumping

Countermeasure:

- Shared contracts are created only when ownership is genuinely cross-product.
- Product-owned types stay in product modules even if multiple files use them.

### Risk 3: Namespace migration breaks callers

Countermeasure:

- Behavior is normalized before URL changes.
- Compatibility handlers exist only during the migration window and are removed
  in Phase 8.
- Mutation routes must preserve request method and body semantics throughout the
  transition.

### Risk 4: Cleanup never happens and the repo keeps both old and new layers

Countermeasure:

- Final cleanup is a first-class phase with explicit deletions.
- Temporary shims are introduced only when their removal target is already
  named in this plan.

## Definition of Done

This plan is complete only when:

- `cats` has the final dependency direction, final route namespaces, final host
  structure, and final shared design layer.
- Runtime dashboard/playground are suite-hosted.
- Legacy barrels, aliases, and migration shims are gone.
- The final regression suite protects the architecture that the refactor
  created.
- The final repo is easier to review, test, and extend than the one that
  existed on 2026-03-24.
