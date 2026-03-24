# PLAN-024: Platform Inversion, API Unification, and Suite Host Cleanup

> Rewrite `cats` into a cleaner suite architecture without shrinking scope:
> invert platform dependencies, extract a real shared shell/design layer,
> decompose the current hotspots, unify API contracts, migrate endpoint
> namespaces, serve runtime tools from the suite host, and remove every
> temporary compatibility layer by the end of the plan.

## Status

In Progress

Execution checkpoint on 2026-03-25:

- Phase 0 completed
- Phase 1 completed
- Phase 2 in progress
- Phase 3 substantially advanced
- Phase 4 substantially advanced
- Phase 5 substantially advanced
- Directory normalization has landed for the main extracted module families:
  `src/core/api/*`, `src/core/model/*`,
  `src/products/chat/state/runtime-dispatch/*`,
  `src/products/chat/state/runtime-session/*`,
  `src/products/chat/state/room-routing/*`,
  `src/products/chat/state/core-snapshot/*`,
  `src/products/chat/state/chat-snapshot/*`,
  `src/products/chat/state/core-projection/*`,
  `src/products/chat/state/companion-box/*`,
  `src/products/chat/renderer/api/*`,
  `src/products/chat/renderer/hooks/*`, and
  `src/products/chat/renderer/components/settings-cats/*`
- The current directory layout keeps mobile companion scope viable by
  preserving product API/contracts as the cross-client seam instead of
  pushing web renderer concerns down into `core/` or shared runtime code.
- Phases 6 through 8 pending

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

The plan started from the 2026-03-24 baseline and is now tracked against the
current execution checkpoint below.

### Structural hotspots

Current notable hotspot files and measured line counts as of 2026-03-25:

- `src/app/server/index.ts` - 573 lines
- `src/platform/orchestration/contracts.ts` - 544 lines
- `src/products/chat/renderer/styles/extras.css` - 507 lines
- `src/products/chat/state/model.ts` - 496 lines
- `src/products/chat/renderer/App.tsx` - 491 lines
- `src/runtime/client.ts` - 434 lines

### Dependency problems

The worst reverse dependencies from the original baseline have largely been
removed. The current structural pressure points are:

- `src/app/server/index.ts` is now the main composition root and must not grow
  into a new integration God file as more product lines are wired in.
- Several major module families have now been normalized into subdirectories,
  but a smaller set of remaining flat prefix groups still needs active
  governance so navigability does not regress as new product lines land.
- A shrinking set of `*Shared.ts`, compatibility barrels, and transitional
  re-exports still need active governance so they do not become new dumping
  grounds.

### Test baseline

`cats` is not starting from zero tests. The repo currently has 40 repo-owned
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

### Phase checkpoint

The plan is no longer at the untouched baseline:

- Phase 0 guardrails and architectural regression tests are in place.
- Phase 1 seam injection and composition-root inversion have landed.
- Phase 3 and Phase 4 hotspot decomposition have substantially reduced the
  earlier monoliths.
- Phase 5 renderer extraction has materially progressed, though the shared
  shell/design end state is not complete yet.
- Phase 6 through Phase 8 remain the major unfinished work.

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

Key files:

- `src/platform/orchestration/dispatch.ts`
- `src/platform/orchestration/planner.ts`
- `src/platform/memory/service.ts`
- `src/platform/transports/telegram/bridge.ts`
- `src/app/server/index.ts`
- new adapter modules under `src/products/chat/`

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

Key files:

- `src/shared/app-shell.ts`
- `src/products/chat/api/contracts.ts`
- `src/platform/orchestration/contracts.ts`
- `src/platform/orchestration/toolIntent.ts`
- `src/platform/memory/companionStore.ts`
- `src/platform/memory/extraction.ts`
- new shared contract modules under `src/shared/` or equivalent

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

Key files:

- `src/core/api.ts`
- `src/core/model.ts`
- `src/core/taskLifecycle.ts`
- new domain modules under `src/core/api/`
- new domain modules under `src/core/model/`

Deliverables:

- Split `src/core/api.ts` into domain route modules for actors, conversations,
  tasks, runs, projects, work items, artifacts, activities, approvals, memory,
  and owner/system resources.
- Split `src/core/model.ts` into domain-focused mutation/query modules with a
  stable public index.
- Evaluate `src/core/taskLifecycle.ts` alongside the task/run split and either
  keep it bounded or absorb its responsibilities into the new task/run domain
  modules if it continues to grow as a secondary hotspot.
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

Key files:

- `src/products/chat/state/runtimeActions.ts`
- `src/products/chat/state/store.ts`
- `src/products/chat/state/model.ts`
- `src/products/chat/state/mentionRouter.ts`
- `src/products/chat/state/roomRouting.ts`
- new action/state slices under `src/products/chat/state/`

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

Key files:

- `src/products/chat/renderer/App.tsx`
- `src/products/chat/renderer/styles.css`
- `src/app/renderer/App.tsx`
- `src/app/renderer/main.tsx`
- `src/renderer/styles.css`
- new shared design modules under `src/design/`

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

Key files:

- `src/core/api.ts` or its extracted route modules
- `src/products/chat/api/shared.ts`
- `src/products/chat/api/resources/index.ts`
- `src/products/chat/api/orchestratorRoutes.ts`
- `src/app/server/index.ts`
- shared HTTP/error utilities under `src/shared/`

Deliverables:

- Use one error class hierarchy and one top-level API error handler across core,
  Chat, host, and transport routes where appropriate.
- Implement the response envelope, request body, pagination, and filtering
  rules defined in ADR-036 sections 5 through 8.
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
- API tests assert the ADR-036 sections 5 through 8 contract for envelopes,
  codes, request bodies, pagination, and filtering behavior.

### Phase 7 - Namespace Migration and Runtime Tool Hosting

Land the visible public URL cleanup and suite-host the runtime tools.

Key files:

- `src/app/server/index.ts`
- `src/products/chat/api/index.ts`
- Chat renderer/client call sites that still target legacy paths
- runtime page host/proxy wiring under the server entrypoint
- packaging/build scripts that copy or expose runtime pages

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

## Post-Plan Governance Follow-Up

Completing PLAN-024 does not mean `cats` will stop growing. `Chat`, `Work`,
`Code`, and future product lines will continue to add modules and routes. This
follow-up workstream exists so growth happens on top of the corrected seams
instead of quietly rebuilding the old coupling.

This is not a second all-repo rewrite. It is the maintenance and governance
track that should remain active after the main refactor lands.

### Follow-Up Objectives

- Improve navigability now that the main boundary corrections are in place.
- Prevent `*Shared.ts`, compatibility barrels, and re-export shims from
  turning into new dumping grounds.
- Rebalance test coverage so new modules gain behavior tests, not only static
  boundary checks.
- Keep the suite composition root deliberate instead of letting
  `app/server/index.ts` become the next integration sink.
- Keep future product growth aligned to the approved `core/platform/product`
  dependency direction.

### Follow-Up Workstreams

#### 1. Directory Normalization

Once module families are stable, move them from flat prefix-based naming into
clearer subdirectories so the repo is easier to navigate:

- `src/core/api/*`
- `src/core/model/*`
- `src/products/chat/state/runtime-dispatch/*`
- `src/products/chat/renderer/styles/*`

The goal is not more abstraction. The goal is to make ownership visible from
the filesystem and reduce prefix sprawl as more product surfaces land.

#### 2. Shared and Shim Audit

Audit every `*Shared.ts`, compatibility barrel, and transitional re-export and
classify it as one of:

- keep as a real shared helper
- rename to a more specific ownership name
- delete because it exists only as migration residue

No generic shared file should survive without a clear ownership story and a
bounded responsibility.

#### 3. Test Rebalancing

Boundary tests remain mandatory, but future work should not rely on boundary
tests alone. For every newly extracted or newly expanded module family, add:

- at least one behavior-level test covering the owned flow
- at least one boundary or contract test protecting the seam

Priority follow-up areas include task lifecycle, orchestrator dispatch,
Telegram ingress, suite shell navigation, and runtime tool hosting.

#### 4. Growth Rules and Enforcement

As `Chat`, `Work`, `Code`, and later product lines expand, enforce the
following rules:

- cross-product sharing must happen through `core/` or an explicitly approved
  shared contract module
- product growth must not reintroduce direct `core -> product` or
  `platform -> product implementation` imports
- new compatibility shims must name their removal target and removal phase
- feature work that grows an existing module family should prefer landing in
  the owned slice/directory rather than reopening a generic integration file

#### 5. Composition Root Governance

`src/app/server/index.ts` is the suite composition root. It is allowed to know
about product modules and adapters, but it must not become a second-generation
God file.

Governance rules:

- keep business logic, route behavior, and domain transforms out of the
  composition root
- if a new product or transport adds meaningful branching or setup logic,
  extract a dedicated registration/factory module and let the composition root
  only wire it
- prefer one host-owned wiring call per product surface rather than letting
  feature work append more inline setup blocks forever
- review composition-root growth whenever a change increases its fan-in or
  introduces new product-specific conditional behavior

#### 6. File-Size Budgets

Size budgets are a governance tool, not a substitute for judgment. They exist
to catch integration sinks before they turn back into 1,500-line files.

Budget rules:

- `> 500` lines: warn and justify why the file still has one bounded
  responsibility
- `> 650` lines: require a named split target or follow-up decomposition task
- `> 900` lines: block unless an ADR or plan explicitly grants a temporary
  exception with a removal target

Composition roots and generated style aggregators are not automatically exempt.
They may remain larger than ordinary modules, but they still require an
explicit ownership story and decomposition path once they cross the thresholds.

### Follow-Up Success Criteria

The follow-up track is healthy when all of the following are true:

- new product capabilities can usually land by adding or extending a focused
  module, not by reopening a monolithic integration sink
- shared/helper files stay specific instead of becoming anonymous catch-alls
- test growth tracks module growth with both behavior coverage and boundary
  enforcement
- the suite composition root stays a wiring layer rather than becoming a new
  feature implementation hub
- file-size budgets trigger early decomposition before new monoliths emerge
- future `Chat`, `Work`, `Code`, and `Learn` work continues to strengthen the
  architecture instead of eroding it
