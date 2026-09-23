# SPEC-117: Cats Self-Development and Catlas Practice

## Metadata

| Field | Value |
|-------|-------|
| Status | Draft; documentation only, implementation not started |
| Owner | Platform integration, with member-owned work packages |
| Reviewer | Product owner; implementation reviewers not yet assigned |
| Decision | [ADR-118](../decisions/118-use-isolated-development-and-verified-practice-for-cats-improvement.md) |
| Plan | [PLAN-109](../plans/PLAN-109-cats-self-development-and-catlas-practice.md) |
| Last updated | 2026-09-24 |

## Summary

An installed Cats Desktop shall be able to manage bounded development tasks
against the Cats source repositories, verify a separate candidate, and retain
reviewable results. Catlas shall use versioned operation knowledge and current
product observations to explain, guide, and, when authorized, perform supported
operations. Practice shall produce evaluated candidates for code, knowledge,
and skill improvements, with traceable promotion and revocation.

These are proposed requirements. Named records below are conceptual contracts,
not existing APIs, schemas, CLI commands, or promised installed capabilities.

## Goals

- Complete source improvements without disturbing the controlling installation.
- Coordinate agents and repositories through existing Task/Run/session records.
- Keep Catlas guidance accurate for the product actually running on the machine.
- Reuse one operation definition for explanation, guidance, and execution.
- Improve procedures using reproducible outcomes, including failure evidence.

## Non-Goals

- Unbounded background self-modification or changing foundation-model weights.
- A replacement for Core work records, Runtime, A2A, or a new skill marketplace.
- Hot-patching the active installation or silently replacing its bundled Runtime.
- Automatic publication, update installation, or cross-user trace collection.
- Full automation of every Platform surface in the first slice.
- Solving the separate companion/settings memory-ledger bridge or requiring a
  vector database.

## Inspected Baseline

Static inspection on 2026-09-24 used Platform `f10dc011`, Runtime `edfec39`,
cats-one `af2e2d3`, and Apps `97e9005`. No installed-build or live-provider
acceptance was performed for this proposal. Existing tests are references to
coverage, not checks executed during this drafting task.

| Area | Source evidence | Current limit relevant to this feature |
|------|-----------------|----------------------------------------|
| Session workspaces | [Runtime preparation](../../../cats-runtime/src/core/workspace/sessionWorkspace.ts), [worktree tests](../../../cats-runtime/src/http/sessionWorktree.test.ts) | Source/sandbox/worktree primitives exist; worktree preparation resolves one Git repository |
| Developer workspace | [cats-one SPEC-001](../../../cats-one/docs/specs/SPEC-001-developer-workspace-bootstrap.md) | Four-member inventory and managed skill sync exist; no cross-repository build/dev orchestration or established managed-session discovery acceptance |
| Runtime skills | [catalog/delivery](../../../cats-runtime/src/core/skills/catalog.ts), [hydration](../../../cats-runtime/src/core/hydration/sessionHydration.ts) | Delivery is provider-dependent; filesystem and instruction delivery differ, and re-entry can resolve newer content |
| Supervised operations | [tool boundary](../../src/platform/supervision/toolBoundary.ts), [tool registry documentation](../tool-calls.md) | Delegates and decision contracts exist; several agent-callable adapter/result loops remain pending |
| Catlas assistance | [assist refresh](../../src/products/chat/api/guideCatAssist.ts), [sidecar](../../src/design/components/GuideCatSidecar.tsx) | Fixed navigation and deterministic/last-good cache hydration exist; runtime-generated assist and the proposed operation loop are absent |
| Desktop isolation | [host config](../../desktop/host/config.ts), [host startup](../../desktop/host/main.ts) | Some state/port overrides exist; a complete candidate profile, including Electron identity and single-instance behavior, is not established |
| Product memory | [SPEC-031](SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md), [SPEC-088](SPEC-088-companion-memory-bridge-contract-placeholder.md) | Evidence/memory/retrieval have defined boundaries; a validated-procedure promotion store is not implemented |

## First Acceptance Slice

Use one machine, initially Windows, an identified installed release/preview
controller with the required capabilities, and the four source members. Missing
controller capabilities must be reported; source availability alone is not
proof that an older installation implements this feature.

1. Assign one narrow bug fix in one writable member, with an independently
   reproducible expected result and a separate reviewer/evaluator.
2. Prepare an isolated worktree, resolve developer instructions and skills, and
   create managed implementation and verification sessions.
3. Build/test the candidate with separate data, listeners, and process ownership.
4. Produce a bounded diff, validation receipt, and retained workspace. The
   acceptance path ends at reviewable local delivery.
5. Catlas explains and guides selecting a usable execution target, selecting the
   intended repo, and opening a Code session. The resulting session's actual
   workspace and access are checked through authoritative state.

Only one member is writable in this slice. Cross-member mutation, autonomous
practice, general authorized-operation mode, and native OS parity have later
gates in PLAN-109. The existing full-member skill sync still requires all four
valid sibling members if used in a candidate parent; a partial directory or
symlink arrangement must not be passed off as a supported full workspace.

## Requirements

### Development and candidate execution

- **FR-01 — Readiness and scope.** Resolve the controller's build/capability
  identity, Runtime endpoint, authorized source root, member identities,
  provider/model target, effective write grant, budget, and delivery intent.
  Show missing prerequisites before starting mutations. Readiness must be
  inspectable through the product, without requiring handwritten state files.
- **FR-02 — Revision set.** Record each participating member's base commit,
  initial dirty state, candidate commit or content digest, lockfile/build inputs,
  and assignment. Do not discard, stash, or silently import user edits. Applying
  an existing dirty diff is a separate, explicit input to the task. Record the
  installed and candidate versions independently; equality is not required.
- **FR-03 — Workspace ownership.** Each concurrent writer gets a separate
  worktree with resolved physical paths and explicit ownership. Track Git common
  directory coordination as well as worktree files. The parent of four repos is
  not a worktree target. Multi-member tasks group per-repo workspaces under one
  change set and integrate an identified revision set through contract checks.
- **FR-04 — Enforced access.** Constrain agent writes to admitted workspaces and
  owned test artifacts. Keep active controller files/state, unrelated sources,
  credentials, and fixed evaluators outside that grant. Validate the effective
  provider/OS boundary, including linked paths and child processes. A setting
  named sandbox or a skill instruction alone does not satisfy this requirement.
- **FR-05 — Candidate profile.** Allocate separate Platform, Runtime, Desktop,
  Electron user-data, application identity/lock scope, listeners, and owned
  process handles before candidate startup. Never implicitly reuse the
  controller's healthy Runtime or real profile. Verify candidate identity at
  connection and before operations; a wrong endpoint is a failed precondition.
- **FR-06 — Recoverable execution.** Reuse Core Task/Run, Runtime session, and
  existing approval/delivery records. Persist workspace/run references before
  reporting admission. Cancellation stops owned work without deleting diffs;
  restart reconciles reality before retrying. Duplicate requests cannot create
  duplicate sessions, candidates, or applied side effects. Preserve evidence
  and workspace ownership beyond a participant's lifecycle.
- **FR-07 — Integration and delivery.** Separate authorship from independent
  evaluation. Record the exact tested revision set and scoped checks. Preserve
  consumer contracts and built App/package boundaries; do not repair dependency
  mismatches through incidental sibling-source imports. Merge, version bumps,
  publication, and installation each follow existing authorization and release
  policy. Reuse grants already given for the exact scope.

### Skills, knowledge, and Catlas operation

- **FR-08 — Actual skill delivery.** Record requested/resolved/applied skill
  identities, versions or fingerprints, resource availability, provider target,
  delivery mode, and degradation reasons. Re-entry must report effective
  changes, not assume historical content is still applied. A required skill
  needs a successful delivery/behavior probe on the selected provider before
  the managed development workflow is called ready. Installing workspace
  mirrors alone does not prove session discovery.
- **FR-09 — Compatible operation knowledge.** Supply a Platform-owned bundle
  containing operation definitions, build compatibility, required capability
  revisions, OS/locale support, provenance, and a content digest. Product
  installations must use it without a source checkout. Choose by observed
  capabilities as well as version; unsupported or stale instructions cannot
  authorize execution. Ship the initial bundle with the corresponding build;
  independently updated bundles require a later distribution/trust contract.
- **FR-10 — Bounded observation.** Provide the current surface and revision,
  relevant selected entities, workspace/access summary, provider readiness,
  recent bounded failure signals, and policy-filtered operations. Exclude
  secrets and unrelated private conversations. Resolve authorization and target
  identifiers server-side. Retained display information is not current
  execution authority.
- **FR-11 — Shared workflow semantics.** Each operation defines prerequisites,
  steps, stable UI targets where supported, tool/delegate bindings, outcome
  predicates, and recovery/compensation behavior. Explain mode describes it;
  guide mode observes user steps; execute mode applies permitted actions.
  Switching presentation mode never expands the grant. Missing UI targets
  produce a recoverable explanation, not guessed clicks.
- **FR-12 — Complete operation boundary.** Agent-visible actions cross the
  owning product delegate and supervised tool boundary. Check grant, target,
  input, current state revision, approval, idempotency, and budget at execution.
  Feed structured success/failure back into the same agent/run. Re-read the
  postcondition before saying an operation completed. Register only verified
  call paths in the control/tool registries; listing a descriptor is insufficient.
- **FR-13 — Optional, quiet assistance.** Preserve ordinary use and deterministic
  fallback when Catlas is absent, disabled, offline, or budget-limited. Proactive
  model-generated hints are event-triggered, deduplicated, dismissible, and
  rate-limited. New runtime assistance initially defaults to explicit help;
  proactive generation and scheduled practice require separately enabled
  settings and budgets. Existing deterministic welcome/navigation remains
  available. Catlas does not join private conversations or receive
  development/publishing authority by default.

### Practice, evidence, and durable improvement

- **FR-14 — Resettable practice.** Every exercise declares a goal, owned fixture,
  initial-state recipe, permitted actions, expected outcomes, timeout/budget,
  cleanup/retention policy, and evaluator revision. Use synthetic or explicitly
  admitted sanitized inputs. Run candidate procedures on clean resets, with a
  fixed baseline for comparison. Cap attempts, elapsed time, and provider usage;
  when monetary cost is unknown, enforce available time/turn/token limits and
  report the missing estimate.
- **FR-15 — Evidence and failure classification.** Preserve observations,
  action/result references, state changes, errors, relevant UI evidence, and
  measured outcomes. Classify product defects, missing knowledge, procedural
  errors, and environment failures separately. A code defect can create a
  linked development proposal under the existing task policy. An environment
  outage alone must not teach a universal product rule.
- **FR-16 — Candidate lessons.** A derived lesson links its source attempts,
  applicable versions/capabilities, counterexamples, proposed change, and
  validation requirements. It begins unverified. Keep lessons, official product
  knowledge, validated procedures, and user-specific preferences scoped and
  distinguishable. Treat retrieved content and traces as data, not authority
  to change tools or grants.
- **FR-17 — Promotion and revocation.** Only an independent evaluator/reviewer
  can produce a promotion receipt for an identified candidate and evaluation
  set. Use repeat runs and held-out scenarios outside the author's writable
  environment. Compare task success, correctness, policy violations, human
  intervention, elapsed time, and measured cost/usage against the baseline.
  All critical correctness/policy checks must pass; a favorable aggregate cannot
  offset them. Promotion pins the evaluated digest. Changed content requires
  reevaluation; failed or obsolete methods can be revoked without deleting the
  historical receipt.
- **FR-18 — Privacy and retention.** Runtime retains execution evidence within
  its boundary; Platform owns product lessons and procedure promotion. Scope
  retrieval by owner/project/product as appropriate. Exporting or contributing
  a lesson must exclude private traces and credentials unless the relevant
  data-sharing scope is explicitly authorized. Deletion/revocation invalidates
  retrieval projections and derived active content while honoring the owning
  store's retention policy. Do not introduce a parallel companion-memory ledger.
- **FR-19 — Persistence and compatibility.** Define schemas and validation for
  new records before persistence. Use atomic replacement and restart recovery;
  migrations of existing data require validation, backup, and failure/restart
  tests. Preserve compatibility within a 0.x minor line; breaking public or
  persisted-data contracts need the next minor boundary. Bumps/publication stay
  outside this documentation task. Restoring a binary is not a data downgrade.

### Non-functional requirements

- **Auditability:** correlate work, agent sessions, revisions, candidate profile,
  tools, knowledge/skills, and evaluation receipts without copying secrets.
- **Availability:** candidate failure cannot terminate the controller or block
  normal product navigation. Surface precise capability limits.
- **Portability:** distinguish fixture, provider-live, native UI, packaged-build,
  and installed-upgrade evidence. One platform's success does not establish
  another's support, and an exact CLI version is provenance, not an allowlist.
- **Maintainability:** use existing API/delegate boundaries and frozen-contract
  integration review. Inspectable structured/local retrieval is sufficient for
  the first bundle.

## Design Overview

```text
Installed Desktop / existing Core Task + Run
  -> admitted source assignments -> per-repo worktrees
  -> candidate build in a separate environment
  -> independent outcome checks -> reviewable change-set receipt

Platform capabilities + versioned operation bundle + current surface
  -> Catlas explanation / guidance / supervised tool request
  -> verified outcome evidence
  -> candidate lesson -> replay + held-out evaluation
  -> reviewed code / knowledge / skill revision
```

The controller and candidate exchange bounded requests and artifact/evidence
references. Candidate failures return to the controller's run state. Knowledge
promotion changes which validated version a later run can select; it does not
silently rewrite an active run's inputs.

### Proposed record responsibilities

| Record | Required information | Owner |
|--------|----------------------|-------|
| Development change set | Core task/run refs, member revision set, assignments/grants, workspace ownership, candidate and validation refs, delivery state | Platform; Runtime owns actual session/worktree state |
| Candidate environment | Build identity, allocated data/profile roots, endpoints, owned processes, fixture revision, recovery/retention disposition | Desktop/Platform, using Runtime primitives |
| Operation definition | Stable id/revision, compatibility/capabilities, prerequisites, guide steps, action bindings, postconditions, recovery | Platform; Apps contributes utility-owned content |
| Practice attempt | Scenario/reset recipe, input digests, model/skill/knowledge identities, run/evidence refs, measured result | Platform projection over Runtime evidence |
| Procedure candidate and promotion receipt | Proposed digest, source/counterexample refs, evaluation-set revision, independent reviewer/evaluator, outcomes, active/revoked state | Platform |

These records extend/link existing owning objects where possible. Exact storage
shapes and new control-surface names are a Phase 0 integration deliverable.

### Proposed skill packages

| Package | Canonical authoring owner | Delivery and scope |
|---------|--------------------------|--------------------|
| `cats-inc-development` | cats-one developer `skills/` | Managed workspace discovery; provider-visible instructions/resources must be verified for the selected session |
| `cats-platform-operation` | Runtime `runtime-skills/` | Runtime delivery of procedural instructions; current product facts come from the Platform bundle/observation |
| `cats-practice-and-distill` | Runtime `runtime-skills/` | Runtime delivery for explicitly admitted practice; consumes evaluator results and proposes lessons, never grants promotion authority |

Reuse existing handoff, project-memory, development/review roles, and native UI
automation where appropriate. Do not copy all developer skills into the shipped
product catalog. Any missing resource-delivery capability is an explicit Runtime
work item, not a claim that instruction text makes helper files accessible.

## Acceptance Criteria

All criteria start **pending**. A phase may report only its own achieved gates.

| ID | Required observable result | Requirements |
|----|----------------------------|--------------|
| AC-01 | Readiness identifies the actual installed controller and candidate separately; unavailable provider/capability prevents the dependent mutation with an actionable reason | FR-01, FR-02 |
| AC-02 | A single-repo task and a later two-repo fixture resolve correct worktrees; unrelated/dirty sources remain unchanged; the non-Git parent is never used as a Git repository | FR-02, FR-03 |
| AC-03 | Candidate and controller coexist; wrong endpoint, path alias, and out-of-grant writes are rejected; candidate termination leaves controller health and user data intact | FR-04, FR-05 |
| AC-04 | Duplicate start, cancellation, timeout, and restart preserve one recoverable task and its diff/evidence; retry does not repeat an already-applied action; cleanup cannot delete user-owned sources | FR-06 |
| AC-05 | Independent checks identify the exact candidate/revision set and produce a reviewable local delivery; no external publication occurs outside its grant | FR-07 |
| AC-06 | A live selected provider receives the required instructions and resources; a fresh/resumed session records effective content, degradation, and changed fingerprints accurately | FR-08 |
| AC-07 | An installed build without source resolves compatible operation knowledge; incompatible build/capability/locale cases do not produce executable stale advice | FR-09, FR-10 |
| AC-08 | Explain/guide/execute consume the same operation definition; UI targets and authoritative session cwd/access agree; duplicate, stale-state, rejected, and interrupted actions return truthful results | FR-11, FR-12 |
| AC-09 | Disabled/offline Catlas leaves normal product flow usable; dismissed hints and cooldown suppress duplicates; private conversations and implicit background practice are excluded | FR-13 |
| AC-10 | Resettable practice captures failure classes, counterexamples and budget exhaustion; a product defect can yield a linked code proposal without silently broadening scope | FR-14, FR-15, FR-16 |
| AC-11 | An incorrect self-reported success, changed evaluator, contaminated holdout, stale digest, or failed critical check cannot promote a procedure; a passing reviewed candidate can be selected and revoked | FR-17 |
| AC-12 | Private input cannot leak into another scope/export; revocation/delete removes active retrieval; atomic-write interruption and any applicable old-profile migration recover without losing source data | FR-18, FR-19 |

For the first practice promotion gate, freeze at least ten named scenarios
before optimization, with at least four held out from the candidate-authoring
context and writable scope. Run required positive/recovery paths on at least
three clean resets. Require all critical assertions to pass, no correctness or
policy regression against the baseline, and a demonstrated improvement in the
preselected target metric within the fixed budget. These are initial engineering
gates, not a statistical claim of general competence.

## Dependencies and Open Decisions

- Existing [Guide Cat assist scope](SPEC-060-guide-cat-optional-surface-assist-capability.md)
  and [cache](SPEC-067-guide-cat-assist-content-cache-and-offline-refresh.md).
- Existing [Work supervision](SPEC-082-cats-work-agent-supervision-and-tool-boundary.md),
  [Core delivery path](SPEC-114-telegram-work-delivery-golden-path.md), and
  [product integration rules](../product-integration-guide.md); reuse their
  primitives without adding Telegram as a first-slice dependency.
- [Runtime worktree lifecycle](../../../cats-runtime/docs/specs/SPEC-014-session-maintenance-worktree-isolation-and-compaction-hooks.md)
  and the [pending retention review](../../../cats-runtime/docs/research/2026-09-18-playground-workspace-retention.md).
- [Desktop release/update contract](SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md)
  and [cross-repository release policy](../../../cats-one/docs/release-guide.md).

Phase 0 must settle the Core record extensions, candidate-profile startup and
enforcement contract, operation-bundle schema/package location, and exact first
operation/tool loop. Native acceptance will identify its controller build,
provider, model, and CLI version from the actual machine rather than prescribing
an unverified version here. Broader OS support and independent bundle updates
remain later work, each requiring evidence and an explicit rollout decision.

---

*Created: 2026-09-24*
*Last updated: 2026-09-24*
