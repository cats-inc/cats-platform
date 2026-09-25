# ADR-118: Use Isolated Development and Verified Practice for Cats Improvement

## Status

Proposed overall, 2026-09-24. After the drafting pass, the owner authorized the
initial Code-entry knowledge-consumption work package. That explain/guide slice
is implemented; live-provider and installed-Desktop acceptance remain pending.
On 2026-09-25 the owner authorized implementation of preview development skills,
release exclusion, practice and knowledge distillation on feature branches.
The concrete contract and recovery checkpoints are in PLAN-109. Broader managed
development/native acceptance remains pending. This work does not authorize
publication or a change to an installed Desktop.

Owner clarification, 2026-09-24: preview/debug carries the extra Cats-development
and practice skills and produces knowledge; end-user release omits those skills
and uses accumulated knowledge with Catlas's bound provider/model. This audience
split is the requested direction; the remaining implementation design is proposed.

## Context

A development machine can have a preview/debug Cats Desktop and the four Cats
source repositories. Its managed agents should improve those repositories and
produce knowledge for Catlas. End users install a release without those extra
development/practice skills or a source checkout. Their Catlas still reasons
about the user's situation, likely intent, and obstacles using accumulated
product knowledge and its bound provider/model.

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

### 1. Separate development skills from end-user knowledge delivery

Use two build profiles, provisionally called preview/debug and release:

| Content or behavior | Preview/debug | End-user release |
|---------------------|---------------|------------------|
| Extra Cats-development, operation-practice and distillation skills | Explicit development supplement, delivered to admitted managed sessions | Excluded from the shipped supplement assets, Cats catalog and automatic injection |
| Managed feedback into Cats source | Authorized tasks with source binding and independent validation | No built-in self-development/practice workflow |
| Knowledge production | Generate candidates from code work and verified practice, then review them | Consume the promoted knowledge bundle |
| Catlas inference | Current context plus compatible knowledge, using the bound provider/model | The same inference contract without a development-skill dependency |

The split applies to this extra self-development package, not to every general
Code capability or unrelated Runtime skill. Build provenance selects the
content/capability profile; a debug switch or a label does not grant filesystem,
tool or publishing authority. Artifact signing and update identity continue to
follow ADR-117. These audience names do not redefine signing or make previews
automatically privileged.

Release packaging must prove absence of the development supplement, including
transitive resources and catalog entries; hiding its UI is insufficient. A
machine having Cats source or old preview state does not enable the release
profile's development supplement. This is a Cats-owned distribution boundary,
not a promise to prevent an independently authorized general coding agent from
reading instructions in a user-selected repository.

### 2. Keep the development controller separate from the candidate

An identified preview/debug Desktop manages sessions that prepare and test a
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

### 3. Compose existing work and execution records

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

### 4. Give Catlas bounded observations and supervised actions

Catlas remains the optional Guide Cat capability described by ADR-061. It does
not inherit Boss Cat orchestration authority or become necessary for basic
navigation, chat, or recovery.

In both profiles, Platform supplies current surface state, the user's request
or relevant bounded event, applicable knowledge, and any permitted tools to
Catlas's bound provider/model. The model infers likely intent and blockers and
returns a grounded explanation, diagnostic question, or suggested next step.
Missing knowledge or ambiguous intent remains explicit. The model may propose
an action; Platform validates current state and executes through the owning
delegate and supervised boundary. Runtime delivers the agent/tool interaction. The internal
delegate, provider adapter, and result return path all need verification before
an operation is advertised as agent-callable.

Semantic actions are the primary operating interface. Native desktop/browser
automation validates the user-visible flow and covers explicitly supported
gaps. Neither a successful API call nor a screenshot alone proves the intended
user outcome.

### 5. Deliver knowledge to the model and share operation definitions

Maintain versioned operation definitions with prerequisites, steps, expected
results, recovery instructions, and stable UI targets where applicable. The
same definition supports explanation, guided user steps, and authorized tool
execution. Execution authority remains an independent input.

Platform owns product concepts, intent/symptom cues, diagnostic guidance,
operation definitions, known limitations, and capability projections. Resolve
them against the running build, available capabilities, OS, and locale. Source
documentation for a future build is not automatically valid advice for an older
installation. Start with inspectable local Markdown/structured files plus a
versioned manifest and bounded retrieval; a vector database is not a prerequisite.

Knowledge must actually reach the selected model. Platform may select and inject
relevant content into the inference request, or let a capable local agent read
an explicitly provided, read-only knowledge root through bounded tools. A
remote/API model needs transmitted content or a supported retrieval tool; a
local pathname alone is not delivery. Record selected entry revisions and
delivery outcomes without requiring private model reasoning traces.

Release Catlas uses the normal inference/context path and does not require
`cats-platform-operation` or any other development-supplement skill. Guidance
can combine facts to address a user's situation rather than only render a fixed
playbook. Tool execution still needs its separate supported, authorized path.

The knowledge path is preview/debug evidence -> candidate knowledge files ->
independent evaluation/review -> a promoted Platform-owned bundle -> packaging
for compatible release and preview/debug builds -> bounded model input. Keep
unverified lessons, raw private traces and developer instructions out of the
promoted bundle. Initial delivery is build-coupled; independent knowledge
updates require a later distribution contract.

Proactive assistance uses bounded product events and user preferences, with
deduplication and cooldown. It does not continuously ingest private transcripts
or launch background practice by implication.

### 6. Promote methods only after independent validation

Practice is admitted by the preview/debug profile and runs in resettable
candidate environments. Release inference does not start this practice or
source-feedback loop. Keep execution evidence,
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

### 7. Preserve skill and repository ownership

| Owner | Responsibility under this proposal |
|-------|------------------------------------|
| cats-one | Cats-specific member composition, developer-workspace guidance, and the proposed development skill |
| cats-runtime | Generic workspace/session primitives, provider enforcement and execution, evidence, profile-scoped supplement delivery, and normal model-context delivery |
| cats-platform | Core/Work integration, build-profile composition, Catlas observations/inference/actions, versioned knowledge files, candidate Desktop profiles, and evaluation/promotion policy |
| cats-apps | Utility-specific procedures/tests and versioned App artifacts consumed through Platform contracts |

Developer skills stay in each owner's canonical `skills/` root and use
cats-one's managed workspace synchronization. Runtime-delivered product skills
stay in `cats-runtime/runtime-skills/`. Product procedures are Platform-owned
knowledge inputs, not another product-side skill catalog.

The `cats-inc-development` managed product skill teaches repository routing,
isolation, verification, and handoff. Runtime-delivered
`cats-platform-operation` and `cats-practice-and-distill` skills teach how to use
supplied capabilities and evidence during development practice. All three are
preview/debug-only supplement entries in this proposal. They do not embed a
second copy of product truth, implement authorization, or become release
Catlas dependencies. Canonical authoring location does not decide which build
ships a package: explicit profile selection must govern staging, catalog
resolution, session hydration and inherited/resumed state. The current broad
Runtime-library packaging needs to change before these entries can be added
without leaking into release. These packages and filtering are not implemented
at the contract checkpoint. The 2026-09-25 refinement authors all three managed
packages in Runtime's reserved `runtime-skills/preview/` subtree. cats-one retains
developer workspace composition/instruction ownership; managed sessions must
not depend on its developer-discovery mirror. A package-local content manifest
governs selection, and default distributable/npm artifacts exclude the subtree.
Retained native context needs verifiable release-compatible provenance; clearing
skills cannot remove preview exposure. See PLAN-109 for the compatibility
boundary and fresh-context recovery policy before releasing this stricter path.

[ADR-119](119-share-product-knowledge-and-role-procedures-with-supervised-agents.md)
and [SPEC-118](../specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md)
plan the ordinary Orchestrator consumer of product concepts/procedures. Those
normal collaboration procedures belong in both profiles and can be delivered as
knowledge content. They are distinct from the three preview-only packages above;
their knowledge delivery and callable operation/result paths have separate gates.

### 8. Deliver incrementally and preserve upgrade boundaries

First prove one bounded source fix and one Catlas-guided Code-session workflow
on an identified native OS, then consume its reviewed knowledge in a source-free
release-profile candidate with no development supplement. Add authorized
execution, repeatable practice, cross-repository automation, and broader native
acceptance through separate gates.

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
- Release users receive accumulated product knowledge without installing the
  development/practice machinery; the bound model still reasons at runtime.
- Existing Core, Runtime, skill, and release boundaries remain authoritative.

### Negative

- Candidate profiles, cross-repository workspaces, and real provider tool loops
  need engineering beyond the current primitives.
- Repeatable native/UI evaluation costs time and provider budget.
- Product knowledge needs compatibility maintenance when workflows change.
- Two artifact inventories and their upgrade/cache boundaries require validation.

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
- [Artifact trust and release identity](117-separate-artifact-trust-from-desktop-release-identity.md)

---

*Proposed: 2026-09-24*
*Last updated: 2026-09-24*
