# ADR-118: Use Isolated Development and Verified Practice for Cats Improvement

## Status

Proposed, 2026-09-24. The owner requested an ADR/SPEC/PLAN drafting pass.
Architecture acceptance and implementation are pending; this document does not
authorize publication or a change to an installed Desktop.

## Context

A machine can have an installed GitHub release or preview of Cats Desktop and
the four Cats source repositories. Its managed agents should be able to improve
those repositories together. Catlas should also learn how to explain and operate
the product, offer timely guidance, and reuse methods proven through practice.

The useful connection is a shared evidence loop: a failed product task can
identify a code defect, missing operation knowledge, or a poor procedure. A
verified improvement can deliver a code change, an updated procedure, and a
regression case together. This concerns software and external procedural memory;
model-weight training is not required for the first delivery.

Existing foundations include Runtime workspace isolation and skill delivery,
Platform supervised tools and execution evidence, Cats Core work/run records,
and optional Guide Cat surfaces. They do not yet constitute this end-to-end
workflow. In particular, current Guide Cat assist refresh only rehydrates
deterministic or last-good content. The dated source baseline and gaps are in
[SPEC-117](../specs/SPEC-117-cats-self-development-and-catlas-practice.md).

The shared workspace parent need not be a Git repository. A Runtime worktree
belongs to one repository; it cannot isolate all four members by treating their
parent as a single Git checkout. Installed packages and sibling source revisions
are also independent. Editing source does not update a running installation.

## Decision

### 1. Keep the installed controller separate from the candidate

An identified installed Desktop manages sessions that prepare and test a
candidate in explicitly owned workspaces. Candidate Platform, Runtime, Desktop
state, Electron profile, listeners, and process ownership are separate from the
controller. A preview release label alone does not establish that separation.

Agents may modify the authorized source and candidate assets. They do not
replace the running controller, rewrite its user data, or grant themselves new
permissions. Worktrees provide source separation; provider/OS controls and
supervised execution must enforce the actual write and credential boundaries.
An unsupported enforcement boundary is reported before admitting the task.

Changes to enforcement or evaluation code are ordinary candidate changes and
cannot redefine the active run's grant or the evaluator that judges that run.
Adoption follows the existing integration, compatibility, and release policies.
Existing user authorization carries forward within its scope.

### 2. Compose existing work and execution records

Reuse Cats Core Task/Run identities, Work supervision and delivery state,
Runtime session lineage, and existing evidence/artifact mechanisms. A change
set links repository revisions, workspaces, runs, and validation receipts; it
does not create another task scheduler, Cat registry, or transcript ledger.

Use one integration owner, bounded implementation assignments, and an
independent reviewer or evaluator. Concurrent writers get separate worktrees.
Cross-repository changes record a revision set and explicit integration order;
there is no claim of an atomic Git transaction across repositories.

Stop, cancellation, provider failure, and controller restart preserve work and
recoverable references. Cleanup follows ownership and delivery retention rules,
not merely the end of a participant session. This feature must reconcile with
the pending workspace-lifecycle review before enabling automatic cleanup.

### 3. Give Catlas bounded observations and supervised actions

Catlas remains the optional Guide Cat capability described by ADR-061. It does
not inherit Boss Cat orchestration authority or become necessary for basic
navigation, chat, or recovery.

Platform supplies current surface state, applicable operation knowledge, and
the tools permitted by the effective grant. The agent proposes an action;
Platform validates current state and executes through the owning delegate and
supervised boundary. Runtime delivers the agent/tool interaction. The internal
delegate, provider adapter, and result return path all need verification before
an operation is advertised as agent-callable.

Semantic actions are the primary operating interface. Native desktop/browser
automation validates the user-visible flow and covers explicitly supported
gaps. Neither a successful API call nor a screenshot alone proves the intended
user outcome.

### 4. Share operation definitions between teaching and execution

Maintain versioned operation definitions with prerequisites, steps, expected
results, recovery instructions, and stable UI targets where applicable. The
same definition supports explanation, guided user steps, and authorized tool
execution. Execution authority remains an independent input.

Platform owns product-specific knowledge and capability projections. Resolve
them against the running build, available capabilities, OS, and locale. Source
documentation for a future build is not automatically valid advice for an older
installation. Start with curated, inspectable content and structured retrieval;
a vector database is not a prerequisite.

Proactive assistance uses bounded product events and user preferences, with
deduplication and cooldown. It does not continuously ingest private transcripts
or launch background practice by implication.

### 5. Promote methods only after independent validation

Practice runs in resettable candidate environments. Keep execution evidence,
unverified lessons, validated procedures, and private user preferences distinct.
Record failures and counterexamples as well as successes.

A lesson is a candidate for a knowledge, skill, or code change. Promotion needs
repeatable outcome checks, held-out scenarios, a comparison with the previous
version, and review independent of the author. The evaluator and its acceptance
criteria are fixed outside the candidate's writable scope for each evaluation.
Self-reported success and favorable prose are not acceptance evidence.

The retained unit is a versioned, attributable method with supporting receipts
and invalidation conditions. Retire or revoke a method when its required product
capability changes or a counterexample invalidates it. Ordinary user activity
does not authorize publishing its traces or using it as a global learning set.

### 6. Preserve skill and repository ownership

| Owner | Responsibility under this proposal |
|-------|------------------------------------|
| cats-one | Cats-specific member composition, developer-workspace guidance, and the proposed development skill |
| cats-runtime | Generic workspace/session primitives, provider enforcement and execution, evidence, and runtime skill validation/delivery |
| cats-platform | Core/Work integration, Catlas observations/actions, versioned product operation knowledge, candidate Desktop profiles, and evaluation/promotion policy |
| cats-apps | Utility-specific procedures/tests and versioned App artifacts consumed through Platform contracts |

Developer skills stay in each owner's canonical `skills/` root and use
cats-one's managed workspace synchronization. Runtime-delivered product skills
stay in `cats-runtime/runtime-skills/`. Product procedures are Platform-owned
knowledge inputs, not another product-side skill catalog.

The proposed `cats-inc-development` developer skill teaches repository routing,
isolation, verification, and handoff. Runtime-delivered
`cats-platform-operation` and `cats-practice-and-distill` skills teach how to use
supplied capabilities, evidence, and operation definitions. They do not embed a
second copy of product truth or implement authorization. These packages are
proposed, not currently installed capabilities.

### 7. Deliver incrementally and preserve upgrade boundaries

First prove one bounded source fix and one Catlas-guided Code-session workflow
on an identified native OS. Then add authorized execution, repeatable practice,
cross-repository automation, and broader native acceptance.

Adding persistent change-set, knowledge, or evaluation records requires explicit
schemas, validated atomic writes, and tested recovery. Changes to existing data
require backup and migration tests. Compatibility boundaries and version changes
follow each member's release policy; documentation or a successful practice run
does not authorize a release. Binary rollback must not assume an older version
can read data migrated by a newer version.

## Consequences

### Positive

- Product fixes and teaching improvements can share reproducible evidence.
- A broken candidate does not have to interrupt the controller's sessions.
- Learning can survive session/provider changes through explicit artifacts.
- Existing Core, Runtime, skill, and release boundaries remain authoritative.

### Negative

- Candidate profiles, cross-repository workspaces, and real provider tool loops
  need engineering beyond the current primitives.
- Repeatable native/UI evaluation costs time and provider budget.
- Product knowledge needs compatibility maintenance when workflows change.

### Neutral

- Model fine-tuning can be evaluated later against collected evidence; no
  automatic model-weight improvement is claimed here.
- Direct source development remains possible. This proposal adds a managed,
  observable workflow rather than making Catlas mandatory for developers.

## Alternatives Considered

| Alternative | Benefit | Reason not selected |
|-------------|---------|---------------------|
| Patch the active installation during its own run | Short feedback path | Couples the controller, candidate, user data, and recovery into one failure boundary |
| Add a large prompt/skill only | Small initial change | Cannot supply missing tools, enforce permissions, prove outcomes, or resolve installed-version drift |
| Fine-tune a model before building the workflow | Could specialize behavior | Leaves observation, execution, evaluation, and versioned product truth unresolved |
| Build a separate autonomous-agent service | Dedicated lifecycle | Duplicates the existing Core/Work/Runtime control and evidence surfaces |

## References

- [SPEC-117](../specs/SPEC-117-cats-self-development-and-catlas-practice.md)
- [PLAN-109](../plans/PLAN-109-cats-self-development-and-catlas-practice.md)
- [Optional Guide Cat capability](061-treat-guide-cat-as-an-optional-surface-assist-capability.md)
- [Guide Cat content ownership](066-persist-guide-cat-assist-content-as-platform-owned-local-state.md)
- [Supervision direction](082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [Agent control surfaces](../agent-control-surfaces.md) and [tool registry](../tool-calls.md)
- [Product integration rules](../product-integration-guide.md)
- [Developer workspace contract](../../../cats-one/docs/specs/SPEC-001-developer-workspace-bootstrap.md)
- [Runtime workspace ownership](../../../cats-runtime/docs/decisions/015-own-workspace-substrate-tools-in-cats-runtime.md)
- [Skill root separation](../../../cats-runtime/docs/decisions/036-separate-repository-maintenance-skills-from-runtime-delivered-skills.md)
- [Evidence and memory ownership](../../../cats-runtime/docs/decisions/012-separate-evidence-memory-and-retrieval-layers.md)
- [Pending workspace retention review](../../../cats-runtime/docs/research/2026-09-18-playground-workspace-retention.md)
- [Cross-repository release policy](../../../cats-one/docs/release-guide.md)

---

*Proposed: 2026-09-24*
*Last updated: 2026-09-24*
