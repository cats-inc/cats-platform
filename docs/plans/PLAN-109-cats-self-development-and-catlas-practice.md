# PLAN-109: Cats Self-Development and Catlas Practice

## Metadata

| Field | Value |
|-------|-------|
| Status | Draft; planning documents drafted, implementation not started |
| Owner | Platform integration; member responsibilities listed below |
| Reviewer | Product owner; independent implementation reviewers unassigned |
| Last updated | 2026-09-24 |

## Related Spec

[SPEC-117](../specs/SPEC-117-cats-self-development-and-catlas-practice.md) defines
the requirements and pending acceptance criteria.
[ADR-118](../decisions/118-use-isolated-development-and-verified-practice-for-cats-improvement.md)
records the proposed architecture.

This draft plan was requested together with the ADR and SPEC so the proposal
can be reviewed as one package. Writing it does not mark the design approved,
start implementation, or authorize a release.

## Overview

Deliver an observable local workflow before autonomous practice or broad
cross-repository automation. Reuse the existing Core/Work/Runtime contracts,
keep the installed controller available, and attach evidence to each gate.
The first combined demonstration is a bounded source fix plus Catlas guidance
for opening a Code session in the correct repository.

| Gate | Deliverable | Depends on | Current state |
|------|-------------|------------|---------------|
| G0 | Reviewed contracts, ownership and first acceptance scenarios | Draft package | Pending |
| G1 | Isolated candidate and recoverable workspace lifecycle | G0 | Pending |
| G2 | Managed single-member fix, actual skill delivery and independent validation | G1 | Pending |
| G3 | Catlas explain/guide workflow using compatible knowledge and current state | G0; G1/G2 for combined native acceptance | Pending |
| G4 | Supervised execution, repeatable practice and verified procedure promotion | G1, G2, G3 | Pending |
| G5 | Coordinated multi-repo changes and separately evidenced distribution/OS expansion | G2; G4 for learning rollout | Pending |

## Ownership and Integration

| Workstream | Owning member | Assignment boundary |
|------------|---------------|---------------------|
| Task/change-set integration, Catlas and procedure evaluation | cats-platform | Extend existing Core/Work records and product-owned delegates; coordinate frozen-contract changes |
| Candidate Desktop profile and process control | cats-platform | Isolated startup, state/profile identity, listeners, bounded host actions, packaged/native evidence |
| Workspace/session and provider delivery | cats-runtime | Generic primitives, access enforcement, retention hooks, effective skills/resources, operation-result transport |
| Cats source composition and development guidance | cats-one | Four-member profile, developer skill, managed instruction synchronization and Cats-specific build composition |
| Utility changes and procedures | cats-apps | App source/tests and built artifacts through the SDK/package boundary, only when a scenario needs them |

Assign an integration owner and a reviewer for each executable slice before
concurrent work begins. One author must not supply their own independent review.
These are proposed work assignments; no agents or implementation tasks have been
started by this documentation change. Member-local plans should link this parent
when work begins rather than copy its lifecycle or status into competing ledgers.

Every phase that introduces persistent state must pass its applicable atomic
write, restart recovery and migration checks before closing that phase. The full
AC-12 gate in G4 does not defer those earlier data-owner obligations.

## Implementation Phases

### Phase 0: Resolve contracts and freeze a small acceptance set

- [x] Draft the ADR, SPEC and PLAN with inspected source baselines and explicit
  implemented-versus-proposed boundaries.
- [ ] Review ADR-118 and SPEC-117; record accepted changes and unresolved choices.
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
- [ ] Define the Platform operation-bundle schema and packaged location, the
  runtime-facing context delivery, and compatibility/invalidation behavior.
- [ ] Specify the initial Core grants, local-delivery endpoint, budgets, and
  evaluator boundaries. Choose the single-member bug reproduction before asking
  an implementation agent to fix it.

**G0 exit:** approved scope and executable acceptance recipes; schema/migration
and public compatibility impact recorded. No release version is bumped here.

### Phase 1: Establish candidate and workspace isolation

- [ ] Add the narrow product readiness/binding surface for a Cats source
  workspace. Inventory the four members and capture baseline/dirty state without
  changing them. Show controller capabilities and missing prerequisites.
- [ ] Prepare the first task's writable worktree through Runtime-owned
  primitives. Record physical paths, common Git metadata and task ownership.
  Keep other member inputs outside the writer's grant.
- [ ] Implement a candidate profile with independently allocated Platform,
  Runtime, Desktop and Electron state, identity/lock scope and listeners. Verify
  the actual candidate build/endpoint; do not adopt the controller's Runtime.
- [ ] Add bounded startup, health, stop and inspection through existing host
  boundaries. Persist ownership before launching; reconcile after interruption.
- [ ] Preserve diffs and receipts on stop/cancel/error. Make duplicate starts and
  cleanup retries idempotent. Require explicit ownership/retention disposition
  before deleting a workspace; never clean a user-selected source directory.
- [ ] Exercise path aliases, out-of-grant child-process writes, occupied ports,
  wrong endpoints, active-work cleanup, process failure and restart recovery in
  isolated fixtures, then check native controller/candidate coexistence.

**G1 exit:** AC-01, single-member AC-02, AC-03 and AC-04 have evidence on the
initial native OS. Missing enforcement is a blocker for the affected provider,
not a reason to silently widen its permissions.

### Phase 2: Deliver one managed development task

- [ ] Author `cats-inc-development` in cats-one's canonical developer skill
  root. Reuse existing project-memory/handoff and development/review roles.
  Synchronize complete resources through the current workspace tool; if a
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
- [ ] Repeat the lifecycle with cancellation or provider interruption and verify
  that recovery neither loses the patch nor repeats completed side effects.

**G2 exit:** AC-05 and AC-06 pass, with G1 still valid. Deliver a reviewable local
change and evidence. Push, merge, publication and installation are separate
actions under their applicable grants.

### Phase 3: Teach Catlas one versioned operation

- [ ] Curate the first Platform-owned operation bundle, including prerequisites,
  guide steps, UI targets, action bindings, postconditions and recovery. Include
  build/capability, OS/locale, revision/digest and provenance metadata.
- [ ] Supply a bounded observation of the current surface, relevant workspace,
  provider readiness and permitted operations. Keep private content out of this
  projection and invalidate it when the relevant state changes.
- [ ] Author the runtime-delivered `cats-platform-operation` procedural skill.
  Verify session delivery together with the selected Platform bundle; do not
  duplicate product facts into another skill catalog.
- [ ] Add explain and guide projections to existing optional Catlas surfaces.
  Preserve offline/disabled behavior. Validate UI targets and the actual result
  of user actions instead of assuming a displayed instruction was followed.
- [ ] Validate compatible, missing, stale and unsupported knowledge cases on an
  isolated packaged candidate without access to the source documentation.
- [ ] Complete the first combined demonstration: Catlas helps open the intended
  Code session, and the G2 development task uses that verified workspace.

**G3 exit:** AC-07, the explain/guide subset of AC-08, and AC-09 pass. Report this
as guided assistance; general agent-executed operations remain gated on G4.

### Phase 4: Close the operation and practice loops

- [ ] Implement the selected operation's complete agent request, authorization,
  product delegate, structured result and authoritative postcondition loop.
  Register the actual control surfaces/tools and document any public HTTP route.
- [ ] Cover pending approval, rejection, stale state, duplicate action, partial
  success, timeout and cancellation without unsafe automatic replay.
- [ ] Create reset recipes, evaluator fixtures and evidence receipts for the
  first curriculum. Freeze at least ten scenarios, at least four held out from
  authoring, budgets and target metrics before optimizing a method.
- [ ] Author `cats-practice-and-distill` in Runtime's product skill library.
  Admit practice explicitly, record effective input digests, and verify helper
  resources. A lesson-producing agent cannot approve its own promotion.
- [ ] Persist attempts and candidate lessons with failure classifications,
  counterexamples and scope. Route identified product bugs to linked existing
  development proposals without broadening the original grant.
- [ ] Evaluate candidates against the fixed baseline on clean resets and
  protected held-out cases. Require SPEC-117's critical assertions and repeated
  trials; record intervention, time and usage/cost with unavailable values clear.
- [ ] Implement reviewed, digest-bound promotion and revocation. Validate
  retrieval invalidation, privacy scope, sanitized export and crash recovery.
- [ ] Keep practice on demand initially. Add opt-in event hints or scheduled
  practice only after budget, cooldown, interruption and stop behavior pass.

**G4 exit:** full AC-08 and AC-10 through AC-12 pass; AC-09 remains satisfied.
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
| Platform `src/shared/guideCatAssist*`, existing Catlas renderer components | Compatible knowledge, bounded observations and explain/guide presentation |
| Platform `desktop/host/` | Candidate profile/identity and owned process lifecycle |
| Runtime `src/core/workspace/`, `src/core/hydration/`, `src/core/skills/`, provider adapters | Generic workspaces, effective skill delivery and enforced execution |
| cats-one workspace tooling and canonical `skills/` | Cats member composition and the development procedure |
| Runtime canonical `runtime-skills/` | Operation/practice procedural packages with validator metadata |
| Apps `apps/`, package builder and tests | Utility-owned scenarios only when selected |
| Platform control/tool registries, API docs, member guides and release SOPs | Publish the actual implemented contracts and evidence boundaries with each slice |

## Testing Strategy

| Layer | Required evidence |
|-------|-------------------|
| Contract/fixture | Physical path and ownership checks, permissions, compatibility selection, state revisions, idempotency and receipt digests |
| Lifecycle/integration | Wrong Runtime target, process death, interrupted writes, duplicate requests, retained output, recovery and scoped cleanup |
| Provider live | Actual instructions/resources, effective resumed content, complete tool/result loop, runtime-enforced outcome inspection |
| Renderer/native UI | Guide steps target real controls, actual session cwd/access matches the user's choice, optional/offline behavior, controller/candidate coexistence |
| Practice evaluation | Protected held-out cases, baseline comparison, repeat trials, false-success rejection, evaluator tampering rejection and revocation |
| Distribution/data | Source-free operation knowledge, actual packaged identities, supported native OS matrix and applicable migration/update recovery |

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

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Candidate shares the controller's profile, lock or Runtime | Resolve/verify all identities before launch; test coexistence and wrong-target rejection |
| Session cleanup removes the only copy of a patch | Task-level ownership, durable references, retain on stop, explicit cleanup disposition |
| Skill appears synchronized but was never delivered | Provider-live behavior/resource probes and persisted effective delivery metadata |
| Agent bypasses tools through shell/network access | Validate provider/OS and endpoint grants together; refuse unsupported enforcement |
| Agent changes the tests or lessons to appear successful | Fixed evaluator/holdout outside its grant, independent review, digest-bound promotion |
| Source HEAD knowledge misguides an installed build | Build/capability-specific bundle selection and stale-state revalidation |
| Private experience becomes global instruction | Scoped candidates, sanitized exports, reviewed promotion and retrieval invalidation |
| Multiple repositories or memory stores drift apart | One parent plan, member-owned implementations, existing Core and evidence ownership |

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-24 | Drafted ADR-118, SPEC-117 and this plan at the owner's request. Recorded static source baselines, pending gaps, ownership, staged gates and acceptance criteria. No implementation, live-provider/native acceptance, version bump or publication is claimed. |
| 2026-09-24 | Documentation validation passed: git diff whitespace checks and a filesystem-only check of all three new documents plus their new index references (51 local links, 19 unique functional requirements mapped to 12 acceptance criteria, balanced fences, no template placeholders, UTF-8/LF). Application tests/builds were not run for this documentation-only change. |

---

*Created: 2026-09-24*
*Last updated: 2026-09-24*
