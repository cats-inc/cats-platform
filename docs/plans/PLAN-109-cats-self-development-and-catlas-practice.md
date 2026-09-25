# PLAN-109: Cats Self-Development and Catlas Practice

## Metadata

| Field | Value |
|-------|-------|
| Status | In progress; initial Code knowledge assistance implemented, live/native acceptance pending |
| Owner | Platform integration; member responsibilities listed below |
| Reviewer | Product owner; independent implementation reviewers unassigned |
| Last updated | 2026-09-25 |

## Related Spec

[SPEC-117](../specs/SPEC-117-cats-self-development-and-catlas-practice.md) defines
the requirements and pending acceptance criteria.
[ADR-118](../decisions/118-use-isolated-development-and-verified-practice-for-cats-improvement.md)
records the proposed architecture.

[PLAN-110](PLAN-110-orchestrator-knowledge-and-collaboration-rollout.md) is the
related ordinary Orchestrator consumer/operation workstream: shared role
procedures, verified tools, bounded observations and result feedback. It has its
own staged acceptance and does not close G1/G2 development or G4 practice gates.

This plan was requested together with the ADR and SPEC. The owner subsequently
authorized the initial Code knowledge-assistance work package below. Broader
architecture review and release authorization remain separate gates.

## Overview

Deliver an observable local workflow before autonomous practice or broad
cross-repository automation. Reuse the existing Core/Work/Runtime contracts,
keep the preview/debug controller available, and attach evidence to each gate.
The owner's 2026-09-24 clarification splits the artifacts: preview/debug carries
the extra development/practice skills; release carries the promoted knowledge
and normal Catlas provider/model inference without those skills.

The first combined demonstration is a bounded source fix producing reviewed
knowledge, followed by a source-free release-profile candidate whose Catlas
uses that knowledge and current context to guide opening the correct Code
session. First use ordinary content injection; verified local file-reading or
retrieval tools can provide another delivery path without changing ownership.

| Gate | Deliverable | Depends on | Current state |
|------|-------------|------------|---------------|
| G0 | Reviewed profile, knowledge-delivery, ownership and acceptance contracts | Draft package | Pending |
| G1 | Profile-specific artifact selection, isolated candidate and recoverable workspace lifecycle | G0 | Pending |
| G2 | Managed single-member fix, actual skill delivery and independent validation | G1 | Pending |
| G3 | Release Catlas inference/guidance using promoted knowledge, with development skills absent | G0; G1/G2 for combined native acceptance | Code-help subset implemented; full gate pending |
| G4 | Supervised execution in supported profiles; preview/debug practice and verified knowledge promotion | G1, G2, G3 | Pending |
| G5 | Coordinated multi-repo changes and separately evidenced distribution/OS expansion | G2; G4 for learning rollout | Pending |

## Ownership and Integration

| Workstream | Owning member | Assignment boundary |
|------------|---------------|---------------------|
| Task/change-set integration, Catlas and procedure evaluation | cats-platform | Extend existing Core/Work records and product-owned delegates; coordinate frozen-contract changes |
| Desktop build profiles and candidate process control | cats-platform | Supplement inventory, release exclusion, isolated startup, state/profile identity, listeners, bounded host actions and packaged/native evidence |
| Workspace/session and provider delivery | cats-runtime | Generic primitives, access enforcement, retention hooks, profile-scoped skills/resources, normal Catlas context delivery and operation-result transport |
| Cats source composition and development guidance | cats-one | Four-member profile, developer skill, managed instruction synchronization and Cats-specific build composition |
| Utility changes and procedures | cats-apps | App source/tests and built artifacts through the SDK/package boundary, only when a scenario needs them |

Assign an integration owner and a reviewer for each executable slice before
concurrent work begins. One author must not supply their own independent review.
Broader work assignments remain proposed; the initial Code-help slice was
authorized and implemented in Platform. Member-local plans should link this parent
when work begins rather than copy its lifecycle or status into competing ledgers.

Every phase that introduces persistent state must pass its applicable atomic
write, restart recovery and migration checks before closing that phase. The full
AC-12 gate in G4 does not defer those earlier data-owner obligations.

### G0 content-profile inventory checkpoint (2026-09-25)

This read-only inventory prepares the next contract slice; it does not mark G0
or G1 complete or add a new development grant. The inspected Platform baseline
is `c5f73f7e`, Runtime is `a694104`. PLAN-110's isolated K3 execution and native
candidate evidence can be reused at their documented scope; they do not prove
release/preview content exclusion or knowledge promotion.

| Content or boundary | Observed implementation | Consequence for the next slice |
|---------------------|-------------------------|--------------------------------|
| Normal Catlas and Orchestrator knowledge | Platform packages both curated JSON bundles; npm and Desktop inventory checks consume their contents | Keep normal role procedures and knowledge in both content profiles; distinguish them from practice/development instructions |
| Runtime product skills | The source catalog contains 33 packages: Chat 5, Code 5, orchestration 7, Work 16; all are existing general product roles/procedures | Preserve these packages. `code`, `work`, `repo-maintainer`, or the generic memory/handoff names do not identify the Cats-only supplement |
| Developer workspace skills | Member-owned developer skills are synchronized into workspace agent directories; Desktop already excludes Runtime's developer `skills/` tree | Workspace skill discovery is not delivery to a Desktop-managed product session. Do not copy the whole developer workspace inventory into release or preview |
| Cats-specific development/practice supplement | No separate managed product supplement is present in the inspected library | Author a distinct, explicitly inventoried supplement after the delivery/exclusion contract is reviewed; generic role skills alone do not satisfy G2/G4 |
| Artifact selection | Desktop copies `runtime-skills/` broadly; Runtime npm inventory includes that directory | A new supplement cannot simply be dropped into that broadly shipped root without profile-specific asset selection and transitive resource checks |
| Runtime catalog and delivery | Catalog root is resolved from package override/module location; catalog cache identity uses root/watch key and package cache uses entry file/fingerprint. Codex delivery can materialize `.agents/skills`; supported other providers use instruction delivery and unsupported delivery remains explicit | Runtime must own generic content-policy filtering and cache identity; neither current cache carries content policy. A Desktop checkbox or hidden catalog entry cannot prove exclusion from materialized files or model input |
| Resume/hydration | Explicit requested skills take precedence; otherwise persisted skill state is resolved again against the current catalog | Specify a release-compatible resume decision before enabling the supplement. Retained provider context needs rejection or a fresh context when its exclusion cannot be verified |
| Build identity | Existing preview/official flags control release/update/trust behavior; no development-content policy is selected by those flags today | Bind a separate content profile to verified build/host configuration. Preview eligibility still does not authorize a source edit or practice run |
| Candidate isolation | Platform has a dedicated candidate profile with separate roots, identity/lock handling, listeners and owned process checks; PLAN-110 records private Windows native evidence | Reuse this substrate. G1 still needs managed lifecycle/persistence and both content-profile/transition acceptance; do not repeat the old claim that no candidate isolation exists |

Source seams: [Desktop asset staging](../../desktop/host/packaging.ts),
[preview/release build entry](../../scripts/build-desktop-installer.mjs),
[candidate isolation](../../desktop/host/candidateProfile.ts),
[Runtime package inventory](../../../cats-runtime/package.json),
[catalog and provider delivery](../../../cats-runtime/src/core/skills/catalog.ts),
[session hydration](../../../cats-runtime/src/core/hydration/sessionHydration.ts),
and [product skill authoring contract](../../../cats-runtime/runtime-skills/README.md).
The source catalog was enumerated through its read-only compiled catalog API with
an explicit `runtime-skills` root. No files were materialized, packaged, or sent
to a model during this inventory.

The next reviewable contract slice should fix the exact supplement ownership,
content identifiers/resources, build-to-content-profile mapping and host policy
source. Define additive manifest/provenance and cache keys before editing
packaging, then map new/requested/resumed session rejection and fresh-context
behavior to Runtime's existing delivery seams. Record any required compatibility
boundary and tested persisted-data upgrade before implementing it; this audit
does not approve a new required state field or version bump. Acceptance must
cover physical artifacts, advertised catalogs, actual provider input and a
preview-to-release transition with stale files/state, while retaining these 33
ordinary product skills and both normal knowledge consumers.

## Implementation Phases

### Authorized first implementation: Code-entry knowledge assistance

On 2026-09-24 the owner authorized the initial knowledge-consumption work package.
Implement the independently useful G3 explain/guide subset before the G1/G2
development machinery. This does not close the combined preview-to-release gate.

- [x] Ship a curated, versioned bilingual knowledge bundle in Platform's bundled
  config assets, with a validated loader, compatibility selection and digests.
- [x] Add a Code-owned, authenticated, explicit-help endpoint. Resolve Catlas's
  model binding from Core, validate bounded draft context, and use the existing
  supervised Runtime boundary with a fresh isolated read-only session.
- [x] Inject selected knowledge contents and current observations into the model
  request. Return bounded plain-text advice plus knowledge/context receipts;
  preserve deterministic help on missing knowledge, unavailable models or errors.
- [x] Add an optional Code-entry help surface with localized copy, cancellation
  and invalidation when the selected context changes. No product actions execute.
- [x] Verify the source-free bundle, actual request contents, distinct context
  cases, cleanup/error behavior, API boundary and renderer behavior in fixtures.
  Record live-provider/native acceptance separately from these local checks.

Integration scope: Platform owns the generic knowledge reader and inference
service; Code owns observation, routing and presentation. Additive dependency
injection in the host connects them. Existing frozen Core/Chat contracts and the
deterministic assist-cache format remain unchanged. Runtime owns provider policy
enforcement; unsupported read-only execution must degrade explicitly. No developer
supplement is added in this slice, and its profile-filtering work remains pending.

Compatibility: the endpoint and packaged resource are additive within Platform
0.4.x. Existing persisted user data is unchanged, so no migration is required.
Any future breaking contract or stored-data requirement follows the shared
version/upgrade policy; this work package does not bump or publish a version.

### Phase 0: Resolve contracts and freeze a small acceptance set

- [x] Draft the ADR, SPEC and PLAN with inspected source baselines and explicit
  implemented-versus-proposed boundaries.
- [ ] Review ADR-118 and SPEC-117; record accepted changes and unresolved choices.
- [ ] Define explicit preview/debug and release content/capability profiles,
  preserving the independent artifact trust/update identity contract. Specify
  supplement selection across canonical owners, transitive resource staging,
  catalog filtering, default Runtime package inventory and resumed sessions.
- [ ] Map the conceptual change-set, candidate, attempt and promotion records to
  existing Core/Work objects. Agree schema ownership and frozen-contract changes.
- [ ] Specify candidate startup isolation, including Electron identity/lock
  ordering, data roots, Runtime selection, path validation and provider/OS write
  enforcement. Do not treat a process cwd as a security boundary.
- [ ] Reconcile workspace retention with the pending Runtime/Platform lifecycle
  review. Define run-owned output retention, stop/delete distinction, ownership
  references, recovery and explicit cleanup.
- [ ] Freeze the first operation: select a usable execution target, select the
  intended repository, and open a Code session with observable cwd/access.
  Identify the product delegates and missing adapter/result-loop pieces.
- [ ] Define the Platform knowledge-file/manifest schema and packaged location,
  evidence-to-reviewed-bundle production, normal Catlas model/context delivery,
  and compatibility/invalidation behavior. Include concepts, symptoms and
  diagnostics as well as operation steps; release must not need a practice skill.
- [ ] Specify the initial Core grants, local-delivery endpoint, budgets, and
  evaluator boundaries. Choose the single-member bug reproduction before asking
  an implementation agent to fix it.

**G0 exit:** approved scope and executable acceptance recipes; schema/migration
and public compatibility impact recorded. No release version is bumped here.

### Phase 1: Establish build-profile separation and candidate isolation

- [ ] Implement explicit artifact inventories: preview/debug selects its
  development supplement; release excludes it and its transitive resources.
  Replace broad-copy assumptions for these packages, with corresponding
  Runtime catalog, request, hydration and profile-transition checks.
- [ ] Prove release remains free of the supplement with stale preview data,
  resumed development contexts and nearby Cats source. Reject an unverifiable
  provider-context resume or start a fresh release-compatible context; changing
  metadata alone is insufficient. Preserve unrelated product features and keep
  build identity separate from task authorization.
- [ ] Add the narrow product readiness/binding surface for a Cats source
  workspace. Inventory the four members and capture baseline/dirty state without
  changing them. Show controller capabilities and missing prerequisites.
- [ ] Prepare the first task's writable worktree through Runtime-owned
  primitives. Record physical paths, common Git metadata and task ownership.
  Keep other member inputs outside the writer's grant.
- [ ] Reuse and extend the existing candidate profile for managed ownership and
  recovery, retaining separate Platform, Runtime, Desktop and Electron state,
  identity/lock scope and listeners. Verify the actual candidate build/endpoint
  in this workflow; do not adopt the controller's Runtime.
- [ ] Add bounded startup, health, stop and inspection through existing host
  boundaries. Persist ownership before launching; reconcile after interruption.
- [ ] Preserve diffs and receipts on stop/cancel/error. Make duplicate starts and
  cleanup retries idempotent. Require explicit ownership/retention disposition
  before deleting a workspace; never clean a user-selected source directory.
- [ ] Exercise path aliases, out-of-grant child-process writes, occupied ports,
  wrong endpoints, active-work cleanup, process failure and restart recovery in
  isolated fixtures, then check native controller/candidate coexistence.

**G1 exit:** AC-01, single-member AC-02, AC-03, AC-04 and AC-13 have evidence on the
initial native OS. Missing enforcement is a blocker for the affected provider,
not a reason to silently widen its permissions.

### Phase 2: Deliver one managed development task

- [ ] Author `cats-inc-development` in cats-one's canonical developer skill
  root. Reuse existing project-memory/handoff and development/review roles.
  Include it only in the preview/debug supplement. Synchronize complete
  resources through the current workspace tool; if a
  candidate parent is used, satisfy its four-member inventory contract.
- [ ] Verify actual discovery or explicit instruction/resource delivery for the
  selected managed provider. Record requested, resolved and applied content;
  test fresh-session and re-entry behavior without exact-CLI-version allowlists.
- [ ] Bind an implementation run and independent verification run to the same
  Core task/change set. Give them separate write/evaluation scopes and clear
  file/repository assignments.
- [ ] Fix the preselected small defect, run the owning member's scoped checks,
  and build/test the candidate against the recorded dependency inputs.
- [ ] Record diff/artifact digests, tested revisions, commands, results, review
  findings and retained workspace disposition in an inspectable local receipt.
- [ ] Produce candidate knowledge files from the verified task: concepts or
  intent/symptom cues, diagnostic findings, procedure/recovery advice, affected
  versions and sanitized evidence references. Keep them unverified until the
  independent curation/validation used by G3; do not package a raw transcript.
- [ ] Repeat the lifecycle with cancellation or provider interruption and verify
  that recovery neither loses the patch nor repeats completed side effects.

**G2 exit:** AC-05 and AC-06 pass, with G1 still valid. Deliver a reviewable local
change and evidence. Push, merge, publication and installation are separate
actions under their applicable grants.

### Phase 3: Deliver knowledge-fed Catlas inference in release

- [ ] Independently verify and curate knowledge candidates from G2 into the
  first Platform-owned local bundle. Include product concepts, symptoms,
  diagnostics, prerequisites, guide steps, UI targets, action bindings,
  postconditions and recovery, with build/capability, OS/locale, revision/digest
  and provenance metadata. This manually reviewed seed precedes G4's automated
  practice/promotion machinery.
- [ ] Supply a bounded observation of the current surface, relevant workspace,
  provider readiness and permitted operations. Keep private content out of this
  projection and invalidate it when the relevant state changes.
- [ ] Implement normal Catlas context assembly: retrieve bounded relevant
  knowledge content, combine it with the user request/current observation, and
  invoke the configured provider/model. Record entry revisions and delivery
  outcome without requiring private model reasoning. Do not resolve development
  supplement skills on this release path.
- [ ] Verify actual content injection at the provider boundary. If enabling
  local file-reading/retrieval tools, prove the selected session can read the
  exact read-only files; a remote model receiving only local paths must not pass.
- [ ] Add explain and guide projections to existing optional Catlas surfaces.
  Preserve offline/disabled behavior. Validate UI targets and the actual result
  of user actions instead of assuming a displayed instruction was followed.
- [ ] Validate compatible, missing, stale and unsupported knowledge cases on an
  isolated release-profile package without source or development skills. Use
  distinct context/intent/blocker fixtures and the bound model to demonstrate
  situational guidance, diagnostic questions and truthful offline behavior.
- [ ] Complete the first combined demonstration: the G2 preview/debug task
  yields reviewed knowledge, and release Catlas uses it to help open the intended
  user Code session and verify its workspace. Confirm both artifact inventories.

**G3 exit:** AC-07, the explain/guide subset of AC-08, AC-09, AC-14 and AC-15 pass;
AC-13 still holds. Report this as contextual inference and guided assistance;
general agent-executed operations remain gated on G4.

### Phase 4: Close the operation and practice loops

- [ ] Implement the selected operation's complete agent request, authorization,
  product delegate, structured result and authoritative postcondition loop.
  Register the actual control surfaces/tools and document any public HTTP route.
- [ ] Cover pending approval, rejection, stale state, duplicate action, partial
  success, timeout and cancellation without unsafe automatic replay.
- [ ] Create reset recipes, evaluator fixtures and evidence receipts for the
  first curriculum. Freeze at least ten scenarios, at least four held out from
  authoring, budgets and target metrics before optimizing a method.
- [ ] Author `cats-platform-operation` and `cats-practice-and-distill` in the
  Runtime-owned library as preview/debug supplement entries. Verify selection,
  delivery, helper resources and release exclusion. Admit practice only in
  preview/debug and record effective input digests. Neither these skills nor
  the lesson-producing agent can approve their own knowledge promotion.
- [ ] Persist attempts and candidate lessons with failure classifications,
  counterexamples and scope. Route identified product bugs to linked existing
  development proposals without broadening the original grant.
- [ ] Evaluate candidates against the fixed baseline on clean resets and
  protected held-out cases. Require SPEC-117's critical assertions and repeated
  trials; record intervention, time and usage/cost with unavailable values clear.
- [ ] Implement reviewed, digest-bound promotion and revocation. Validate
  retrieval invalidation, privacy scope, sanitized export and crash recovery.
- [ ] Feed promoted knowledge files into the same bundle consumed by release
  Catlas and rerun source-free inference/guidance checks. Exercise rejection of
  developer instructions, private traces and incompatible/unverified lessons.
- [ ] Keep preview/debug practice on demand initially. Scheduled practice stays
  preview/debug-only after budget/interruption/stop checks pass. Opt-in Catlas
  hints can serve either profile after privacy, budget and cooldown checks.

**G4 exit:** full AC-08 and AC-10 through AC-12 pass; AC-09 and AC-13 through
AC-15 remain satisfied.
Produce one validated procedural improvement and one rejected candidate to prove
that learning is measured and selective. No claim of model-weight training.

### Phase 5: Expand repository coordination and delivery

- [ ] Add a two-member change with a frozen interface/consumer acceptance case.
  Coordinate per-repo worktrees and verify the complete revision set before
  integration. Record partial-merge recovery; never claim multi-repo Git atomicity.
- [ ] Keep Cats-specific inventory/build composition in cats-one and generic
  workspace behavior in Runtime. Add member-local specs/plans for new public
  contracts as required, linked to this parent.
- [ ] Exercise an App change only through built/versioned package and SDK
  compatibility rules. Updating an App does not implicitly update Desktop pins.
- [ ] Validate source-built, packaged and installed behavior separately, followed
  by macOS/Linux acceptance with their own provider and native UI evidence.
  Exercise preview/debug-to-release state transitions and both artifact profiles;
  release must not inherit the development supplement through caches or sessions.
- [ ] For any selected release, follow member release SOPs, validate migrations
  with backups/restart failures, and exercise the controller's normal update
  path. Document recovery when data cannot be read by an older binary.
- [ ] Evaluate independent knowledge-bundle distribution only if build-coupled
  delivery proves insufficient; define compatibility, trust, rollback and
  revocation before enabling it.

**G5 exit:** cross-member AC-02/AC-05 and applicable platform/distribution checks
pass for each claimed target. A successful source build is not an installed
upgrade result; release remains conditional on the owner's release scope.

## Expected Implementation Seams

This is an ownership map, not a commitment to create each possible new module.
Phase 0 chooses exact new files and fields after integration review.

| Existing seam | Expected work |
|---------------|---------------|
| Platform `src/core/`, `src/products/work/` | Link tasks/runs, change sets, practice attempts and receipts through existing models |
| Platform `src/platform/supervision/`, `src/platform/runtime/` | Grants, operation transport/results and evidence references |
| Platform `src/products/code/` | Source binding, actual cwd/access inspection and local delivery projection |
| Platform `src/shared/guideCatAssist*`, existing Catlas renderer components | Knowledge production/selection, bounded observations, model-context assembly and explain/guide presentation |
| Platform `desktop/host/`, packaging scripts | Profile-specific supplement/knowledge inventories, candidate identity and owned process lifecycle |
| Runtime `src/core/workspace/`, `src/core/hydration/`, `src/core/skills/`, provider adapters | Generic workspaces, effective skill delivery and enforced execution |
| cats-one workspace tooling and canonical `skills/` | Cats member composition and the development procedure |
| Runtime canonical `runtime-skills/` | Preview/debug-only operation/practice packages with explicit distribution selection and validator metadata |
| Apps `apps/`, package builder and tests | Utility-owned scenarios only when selected |
| Platform control/tool registries, API docs, member guides and release SOPs | Publish the actual implemented contracts and evidence boundaries with each slice |

## Testing Strategy

| Layer | Required evidence |
|-------|-------------------|
| Contract/fixture | Physical path and ownership checks, permissions, compatibility selection, state revisions, idempotency and receipt digests |
| Lifecycle/integration | Wrong Runtime target, process death, interrupted writes, duplicate requests, retained output, recovery and scoped cleanup |
| Provider live | Actual instructions/resources, effective resumed content, complete tool/result loop, runtime-enforced outcome inspection |
| Release Catlas inference | Bound model receives selected knowledge bytes/tool results and current context without development skills; distinct user situations produce grounded guidance; local-path-only delivery is rejected as insufficient |
| Renderer/native UI | Guide steps target real controls, actual session cwd/access matches the user's choice, optional/offline behavior, controller/candidate coexistence |
| Practice evaluation | Protected held-out cases, baseline comparison, repeat trials, false-success rejection, evaluator tampering rejection and revocation |
| Distribution/data | Both artifact inventories, supplement absence in release including transitive/resumed content, promoted knowledge digests, source-free inference, native OS matrix and migration/update recovery |

Use each member's current manifest and testing guide to select the smallest
checks that cover the changed behavior and consumers. Run required CI before
integration. Do not run the entire application suite merely because these
planning files changed, or report previously existing tests as newly passed.

Initial scenario recipes must include the happy path, missing provider,
non-Git parent, duplicate create, stale knowledge/surface, interrupted task,
out-of-scope write, misleading retrieved instruction, incorrect self-reported
success and budget exhaustion. Hold out input/state variations and keep the
evaluator outside the candidate's grant. Record native/provider limits beside
the evidence, not as an inferred global pass.

Also cover a release package beside a full Cats checkout, a leftover preview
skill cache, an attempted development-session resume, an API model given only
a local path, and a reviewed knowledge entry consumed without its producing
skill. Check both real artifact contents and effective session/model inputs.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Candidate shares the controller's profile, lock or Runtime | Resolve/verify all identities before launch; test coexistence and wrong-target rejection |
| Session cleanup removes the only copy of a patch | Task-level ownership, durable references, retain on stop, explicit cleanup disposition |
| Skill appears synchronized but was never delivered | Provider-live behavior/resource probes and persisted effective delivery metadata |
| Release accidentally inherits the development supplement | Artifact inventory checks plus catalog/request/hydration and profile-transition tests |
| Local knowledge exists but the selected model never receives it | Verify transmitted entry contents or actual bounded read/tool results at the provider boundary |
| Agent bypasses tools through shell/network access | Validate provider/OS and endpoint grants together; refuse unsupported enforcement |
| Agent changes the tests or lessons to appear successful | Fixed evaluator/holdout outside its grant, independent review, digest-bound promotion |
| Source HEAD knowledge misguides an installed build | Build/capability-specific bundle selection and stale-state revalidation |
| Private experience becomes global instruction | Scoped candidates, sanitized exports, reviewed promotion and retrieval invalidation |
| Multiple repositories or memory stores drift apart | One parent plan, member-owned implementations, existing Core and evidence ownership |

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-25 | Read-only G0 inventory distinguishes 33 ordinary Runtime role/procedure packages and two normal knowledge bundles from the still-absent Cats-specific development/practice supplement. Recorded broad artifact staging, catalog cache identity, resumed-skill hydration and existing private candidate isolation. This documentation slice prepares ownership/profile contracts; no content filter, skill delivery, persisted schema, model inference, version or publication changed. G0/G1 and practice/promotion remain open. |
| 2026-09-24 | PLAN-110 K1 now shares the Platform knowledge reader with Catlas and delivers normal Orchestrator procedures inline, with source-free asset fixtures. Catlas's 13 regressions pass within the 239-test scoped batch. This does not close this plan's preview development, practice/promotion, live-provider or installed-Desktop gates. |
| 2026-09-24 | Drafted ADR-118, SPEC-117 and this plan at the owner's request. Recorded static source baselines, pending gaps, ownership, staged gates and acceptance criteria. No implementation, live-provider/native acceptance, version bump or publication is claimed. |
| 2026-09-24 | Initial draft documentation validation passed: git diff whitespace checks and a filesystem-only check of all three new documents plus their new index references (51 local links, 19 unique functional requirements mapped to 12 acceptance criteria, balanced fences, no template placeholders, UTF-8/LF). Application tests/builds were not run for this documentation-only change. |
| 2026-09-24 | Incorporated the owner's two-profile clarification: extra development/practice skills only in preview/debug; reviewed local knowledge plus current context delivered to release Catlas's bound model. Added artifact exclusion, knowledge handoff and actual model-input delivery requirements and gates. Implementation remains pending. |
| 2026-09-24 | Amended documentation validation passed: git diff whitespace checks, 54 local links, 23 unique functional requirements mapped to 15 acceptance criteria, balanced fences, no template placeholders and UTF-8/LF. Reviewed profile separation and knowledge-delivery consistency across ADR/SPEC/PLAN and their four indexes. Application tests/builds and live-provider checks were not run for this documentation-only amendment. |
| 2026-09-24 | Implemented the owner-authorized Code-entry work package: curated bilingual build-coupled knowledge, validated loader, bounded observation, Core-bound read-only Runtime inference, authenticated help API, optional localized UI, provenance receipts and cancellation/failure fallback. npm/Desktop asset inventories include the bundle. No new Core persistence, developer supplement, skill, promotion workflow, version bump or publication was introduced. |
| 2026-09-24 | Focused server/assist-store/architecture checks passed 125/125, including 13 Catlas cases and actual inline content delivery through the Runtime HTTP adapter. Renderer/Code-entry/i18n/API-path checks passed 31/31. Desktop packaging checks passed 25/25; after adding a staged knowledge-loader assertion, its focused staging test also passed. Server/Desktop builds, renderer/test typechecks, UI-test bundling and Vite production build passed (existing chunk-size warning). This is scoped validation, not a full-suite pass. |
| 2026-09-24 | An isolated headless Edge component fixture passed explicit-request, question, response, close, no-page-error and narrow-viewport checks; desktop and 390px screenshots were visually inspected. It used local fixture responses and a separate browser profile, without touching the user's application state. Live-provider behavior, installed-Desktop/native acceptance, other OSes and the combined preview-to-release demonstration remain pending. |
| 2026-09-24 | Final server-bundle build and npm dry-run package inspection passed; the npm file inventory includes the 6,800-byte knowledge asset. Documentation validation passed 59 local links, 23 functional requirements mapped to 15 acceptance criteria, UTF-8/LF and balanced fences. Full-suite CI and publication validation are separate from these scoped local checks. |
| 2026-09-24 | The first full CI run on `0f140439` passed validation/typechecking and 4,679 tests, with 59 skips and one failure: the npm package-contract test still expected the pre-knowledge file inventory. Updated that expected inventory and added an explicit packed-knowledge presence assertion. The implementation's knowledge delivery and Desktop checks passed in that run; the corrected package contract is validated separately below. |
| 2026-09-24 | The corrected npm executable/package contract passed its focused test, including a clean non-mobile server/renderer/Desktop build and actual npm dry-run inventory inspection. The new knowledge file is now asserted both in the declared package inventory and the packed file list. Full CI runs again on the correction commit. |
| 2026-09-24 | Full [CI on `e3a61434`](https://github.com/cats-inc/cats-platform/actions/runs/35940019078) passed both `validate` and `nodejs (24)`. The owner subsequently requested Orchestrator knowledge/procedure planning before wiring; ADR-119, SPEC-118 and PLAN-110 track that separate consumer/operation workstream. |

---

*Created: 2026-09-24*
*Last updated: 2026-09-25*
