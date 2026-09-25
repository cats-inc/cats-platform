# SPEC-117: Cats Self-Development and Catlas Practice

## Metadata

| Field | Value |
|-------|-------|
| Status | Initial Code knowledge assistance implemented; live/native acceptance and broader architecture pending |
| Owner | Platform integration, with member-owned work packages |
| Reviewer | Product owner; implementation reviewers not yet assigned |
| Decision | [ADR-118](../decisions/118-use-isolated-development-and-verified-practice-for-cats-improvement.md) |
| Plan | [PLAN-109](../plans/PLAN-109-cats-self-development-and-catlas-practice.md) |
| Last updated | 2026-09-26 |

## Summary

Preview/debug Cats Desktop shall carry additional skills for admitted managed
agents to improve Cats source and produce knowledge files. End-user release
shall omit that development/practice supplement while shipping the promoted
knowledge. In both profiles, Catlas shall give relevant knowledge and current
user/product context to its bound provider/model, which reasons about the user's
situation, likely intent and obstacles and produces useful guidance. Supported
operations may execute through their separate authorization boundary.

This distribution split incorporates the owner's 2026-09-24 clarification. The
learning output is versioned external knowledge, alongside reviewable code/skill
changes; installing release does not require source access, development skills,
or training/fine-tuning the user's selected model.

The requirements describe the target architecture. The implemented subset is
listed below; remaining named records are conceptual contracts, not existing
APIs, schemas, CLI commands, or promised installed capabilities.

The follow-up [SPEC-118](SPEC-118-orchestrator-knowledge-and-collaboration-operations.md)
implements shared product-knowledge consumption by Orchestrator and stages
verified collaboration tools/results separately. Those ordinary role procedures can
ship in both profiles without the preview-only development/practice supplement.
That work does not complete this spec's source-development or promotion gates.

## Implemented preview content boundary (feature branches)

The 2026-09-25 P1/P2 slices implement Runtime artifact eligibility, monotonic
preview exposure, retained-context release admission and three managed preview
skills. Desktop staging defaults to release, derives preview content from the
explicit installer preview mode, and captures a closed selected resource tree
before replacing its owned stage. Normal npm release and Desktop release omit
the supplement physically; both ordinary knowledge bundles remain present.

Real-library checks prove 36 preview versus 33 release skills and reject a source
preview catalog override from a packaged release Runtime. The paired-artifact
check can be repeated after building Platform host and Runtime:

```text
node tools/check-skill-distribution.mjs --runtime-root <Runtime checkout>
```

This developer-only check does not launch providers or touch installed state.
Runtime's strict denial of previously unverified retained sessions requires its
next minor before shipping. Unknown/reset contexts remain inspectable and use a
fresh context for release execution. No version was bumped. Native installed
transition, managed source-fix and practice/promotion acceptance remain pending;
passing content checks does not close the broader G1/G2/G4 gates.

P3 adds the [developer practice workflow](../knowledge-practice.md): explicit
preview admission, frozen baseline/evaluator/curriculum, bounded isolated attempts,
authenticated evidence and unverified candidate drafts. Its public deterministic
fixture exercises the ten-case/four-held-out-slot/three-reset mechanics, not a
real protected holdout or live model improvement. P4 adds digest-bound independent
review, complete-bundle/revision and actual consumer compatibility checks,
knowledge-only export, and uncached local selection with revocation. The promoted
projection must preserve the evaluated entries under the prompt-size budget.
Fixture evidence is limited to explicit fixture exports and never authorizes
product publication. Export creates a new reviewable artifact for the normal
PR/release process; it does not replace an installed bundle. Prior exports are
historical snapshots, while revocation prevents future local reads/exports.
The operator guide defines the concurrent export/revocation snapshot boundary.
A passing P3 receipt alone cannot promote knowledge. These developer tools do
not add a shipped endpoint, automatic practice loop, or installed overlay.

## Implemented Code-Entry Assistance

The first authorized work package implements part of FR-09, FR-10, FR-13,
FR-22 and FR-23 on the default New Code surface. The user opens **Help me get
started** / **協助我開始**, writes a separate help question, and explicitly asks
Catlas. Opening the page or typing a coding task does not call a model.

- **Authoritative knowledge:** [catlas-knowledge.json](../../config/catlas-knowledge.json)
  contains schema version 1, bundle revision, Platform version range, required
  capabilities and five curated entries covering Code entry, execution target,
  workspace, permissions and recovery. Each entry has an ID, revision, topics,
  verification date, source references and English/Traditional Chinese content.
  This seed was authored from current product behavior; automated practice and
  promotion have not produced it.
- **Loading and distribution:** the [loader](../../src/platform/catlas/knowledge.ts)
  validates UTF-8, size/schema, compatibility and locale, computes bundle and
  content digests, and selects bounded topic content. npm includes the JSON;
  Desktop staging requires it and copies it into the shared Platform config
  assets, then the packaged app-sidecar config directory. Loading requires no
  source checkout. Missing, invalid or incompatible knowledge uses basic help.
- **Observation:** Code reads Runtime reachability and the selected coding
  target's availability. A local-host workspace check reports only whether the
  selected path is a directory; a remote Runtime reports `remote_unverified`.
  The model receives target selection and requested policy, not the full path,
  source files or composer contents. Git status stays `unknown`; draft access
  is not represented as an effective running-session grant.
- **Inference:** the [inference service](../../src/platform/catlas/inference.ts)
  resolves Catlas's own Core provider/model binding independently of the coding
  target. Existing supervised Runtime wrappers create an isolated sandbox
  session with `read_only` / `default`, no source cwd and no requested skills.
  Selected knowledge contents and the observation are delivered inline.
  Runtime/provider policy enforcement remains authoritative; unsupported
  execution falls back to basic help.
- **Response and lifecycle:** strict `{ advice, knowledgeIds }` validation rejects
  unknown references, extra action fields and non-text result segments. The UI
  renders plain text and supplies no product-action executor. A receipt records
  provider/model, session/request IDs, knowledge revision/digests, observation
  digest and cleanup outcome. One request is admitted at a time with a 90-second
  deadline, cancellation and best-effort closing of the owned session, including
  late session creation. Runtime retains history under its normal policy; this
  slice adds no Core task or memory ledger.
- **Invalidation:** question, draft, locale and Catlas binding changes clear old
  UI results and abort pending requests. The server rechecks the Core binding
  and disabled surface before returning model advice. Missing/disabled Catlas,
  unavailable knowledge/Runtime/model, invalid output, cancellation, timeout
  and busy admission return clearly labeled basic guidance.

See the [HTTP contract](../api.md#code-catlas-help) and
[agent control surface](../agent-control-surfaces.md#catlas-code-help).
Fixture tests cover inline delivery through the real Runtime HTTP adapter;
live-provider behavior and an installed Desktop are still separate pending
acceptance checks. The preview content boundary above is implemented separately;
autonomous practice, reviewed promotion and broader product-operation execution
remain later work packages.

To maintain knowledge, verify the documented behavior against the owning
implementation, edit the authoritative JSON, update changed entry revisions,
bundle revision, verification dates and applicability, then run loader,
inference and packaging checks. Review content and provenance as product code.
The existing deterministic assist cache is not this knowledge source and is
not promoted automatically. No model-weight training is introduced.

## Goals

- Complete source improvements without disturbing the controlling installation.
- Coordinate agents and repositories through existing Task/Run/session records.
- Keep Catlas guidance accurate for the product actually running on the machine.
- Reuse one operation definition for explanation, guidance, and execution.
- Improve procedures using reproducible outcomes, including failure evidence.
- Transfer reviewed development/practice knowledge to source-free release users
  without transferring the development supplement or private raw traces.

## Non-Goals

- Unbounded background self-modification or changing foundation-model weights.
- A replacement for Core work records, Runtime, A2A, or a new skill marketplace.
- Hot-patching the active installation or silently replacing its bundled Runtime.
- Automatic publication, update installation, or cross-user trace collection.
- Full automation of every Platform surface in the first slice.
- Solving the separate companion/settings memory-ledger bridge or requiring a
  vector database.

## Inspected Baseline

Pre-implementation static inspection on 2026-09-24 used Platform `f10dc011`, Runtime `edfec39`,
cats-one `af2e2d3`, and Apps `97e9005`. No installed-build or live-provider
acceptance was performed for this proposal. Existing tests are references to
coverage, not checks executed during this drafting task.

The Desktop isolation row was updated on 2026-09-25 to reflect PLAN-110's later
implementation/evidence. The dated G0 inventory in PLAN-109 records the current
content and delivery boundaries without closing the profile/practice gates.

| Area | Source evidence | Current limit relevant to this feature |
|------|-----------------|----------------------------------------|
| Session workspaces | [Runtime preparation](../../../cats-runtime/src/core/workspace/sessionWorkspace.ts), [worktree tests](../../../cats-runtime/src/http/sessionWorktree.test.ts) | Source/sandbox/worktree primitives exist; worktree preparation resolves one Git repository |
| Developer workspace | [cats-one SPEC-001](../../../cats-one/docs/specs/SPEC-001-developer-workspace-bootstrap.md) | Four-member inventory and managed skill sync exist; no cross-repository build/dev orchestration or established managed-session discovery acceptance |
| Runtime skills | [catalog/delivery](../../../cats-runtime/src/core/skills/catalog.ts), [hydration](../../../cats-runtime/src/core/hydration/sessionHydration.ts) | Delivery is provider-dependent; filesystem and instruction delivery differ, and re-entry can resolve newer content |
| Skill packaging | [Desktop staging](../../desktop/host/packaging.ts), [Runtime package inventory](../../../cats-runtime/package.json) | The Runtime skill library is included broadly today; preview/debug-only supplement filtering is not implemented |
| Supervised operations | [tool boundary](../../src/platform/supervision/toolBoundary.ts), [tool registry documentation](../tool-calls.md) | Delegates and decision contracts exist; several agent-callable adapter/result loops remain pending |
| Catlas assistance | [assist refresh](../../src/products/chat/api/guideCatAssist.ts), [sidecar](../../src/design/components/GuideCatSidecar.tsx) | Fixed navigation and deterministic/last-good cache hydration exist; runtime-generated assist and the proposed operation loop are absent |
| Desktop isolation | [candidate profile](../../desktop/host/candidateProfile.ts), [host startup](../../desktop/host/main.ts) | PLAN-110 now has private candidate roots, Electron identity/lock/listener handling and Windows native evidence; managed lifecycle and release/preview content-transition acceptance remain open |
| Product memory | [SPEC-031](SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md), [SPEC-088](SPEC-088-companion-memory-bridge-contract-placeholder.md) | Evidence/memory/retrieval have defined boundaries; a validated-procedure promotion store is not implemented |

## Distribution and Knowledge Contract

Release and preview/debug are provisional audience/profile names. Bind their
effective content/capabilities to build provenance, independently of signing
and update-feed identity under ADR-117. Both profiles may ship the same compatible
knowledge revision and use the same configured inference provider/model.

| Dimension | Preview/debug | End-user release |
|-----------|---------------|------------------|
| Extra Cats-development/practice skills | Present through an explicitly selected supplement | Absent from shipped assets, advertised catalog and automatic session injection |
| Managed Cats source feedback | Admitted development tasks may produce bounded changes | This built-in workflow is unavailable |
| Practice and knowledge production | Admitted exercises produce candidates and review evidence | No autonomous practice, distillation or knowledge-promotion workflow |
| Published knowledge files | Consume them and propose revised content | Consume compatible, reviewed content without source checkout |
| Catlas reasoning and help | Bound model receives relevant knowledge and current context | Same model/context path; no development-skill dependency |
| Ordinary user features | Existing permissions and supported product capabilities | Existing permissions and supported product capabilities |

The exclusion concerns the extra Cats self-development package. It does not
remove unrelated Runtime skills or ordinary Code use. This controls Cats-owned
packaging and orchestration; it is not a claim that a general agent can never
read user-selected repository instructions.

Knowledge entries cover product concepts, intent/symptom cues, diagnostic
checks, known limitations, recovery advice, and operation definitions. Files
shall be inspectable Markdown/structured content with a manifest of entry IDs,
revisions/digests, applicability, locale and provenance. A sanitized evidence
reference can establish why an entry was accepted without shipping raw private
traces. The first bundle is build-coupled and stored locally with the product;
derived indexes/caches must remain replaceable from the authoritative files.

Local storage and delivery to the model are separate steps. The first path
selects relevant entries and sends their actual content in the model request.
A capable local agent may instead read a bounded read-only knowledge root or
use a retrieval tool, after that path is verified. A remote/API model cannot
read the desktop's files just because its prompt contains their paths.

## Managed authoring refinement (2026-09-26)

The owner authorized the next managed-authoring slice and isolated validation.
A developer-only app entry composes the normal candidate Desktop lifecycle with
one admitted authoring session and the product's existing FileChatStore/Core
identities. It distills already verified development evidence, as permitted by
the preview practice skill, into an attributed unverified Code candidate artifact.
The host fixes evidence references and applicability, checks actual Runtime
preview skill delivery, persists operation intent before dispatch and retains
interrupted attempts without automatic replay. See the [operator guide](../knowledge-practice.md)
and [current checkpoint](../plans/PLAN-109-cats-self-development-and-catlas-practice.md).
This incremental path does not close the source-fix G2, product practice/promotion
G4 or source-free release acceptance gates. Native results are recorded separately
from deterministic provider fixtures.

## First Acceptance Slice

Use one machine, initially Windows, an identified preview/debug controller
with the required capabilities, and the four source members. Missing
controller capabilities must be reported; source availability alone is not
proof that an older installation implements this feature.

1. Assign one narrow bug fix in one writable member, with an independently
   reproducible expected result and a separate reviewer/evaluator.
2. Prepare an isolated worktree, resolve developer instructions and skills, and
   create managed implementation and verification sessions.
3. Build/test the candidate with separate data, listeners, and process ownership.
4. Produce a bounded diff, validation receipt, retained workspace and candidate
   knowledge entries. Independently verify and curate an initial knowledge
   bundle; the code path ends at reviewable local delivery.
5. Run an isolated release-profile candidate without the supplement or access
   to Cats source. Its Catlas uses that bundle plus a bounded user/context
   fixture through its bound provider/model to explain a situation and identify
   a useful next step. Verify actual content delivery to the model.
6. Catlas explains and guides selecting a usable execution target, selecting the
   intended user repository, and opening a Code session. The resulting session's
   actual workspace and access are checked through authoritative state. A
   release-profile user repository need not be the Cats source workspace.

Only one member is writable in this slice. Cross-member mutation, autonomous
practice, general authorized-operation mode, and native OS parity have later
gates in PLAN-109. The existing full-member skill sync still requires all four
valid sibling members if used in a candidate parent; a partial directory or
symlink arrangement must not be passed off as a supported full workspace.

## Requirements

### Development and candidate execution

- **FR-01 — Readiness and scope.** Resolve the controller's build/capability
  identity and development profile, Runtime endpoint, authorized source root,
  member identities, provider/model target, effective write grant, budget, and
  delivery intent.
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
  mirrors alone does not prove session discovery. Apply this supplement only
  to preview/debug development/practice sessions. Release Catlas readiness uses
  its normal model/context delivery, not installation of these skills.
- **FR-09 — Compatible product knowledge.** Supply a Platform-owned bundle
  containing concepts, intent/symptom cues, diagnostics, operation definitions,
  build compatibility, required capability revisions, OS/locale support,
  provenance, and a content digest. Installations must use it without a source
  checkout. Choose by observed
  capabilities as well as version; unsupported or stale instructions cannot
  authorize execution. Ship the initial bundle with the corresponding build;
  independently updated bundles require a later distribution/trust contract.
- **FR-10 — Bounded observation.** Provide the current surface and revision,
  relevant selected entities, workspace/access summary, provider readiness,
  the user's request or relevant help trigger, recent bounded failure signals,
  and policy-filtered operations. Exclude secrets and unrelated private
  conversations. Resolve authorization and target identifiers server-side.
  Retained display information is not current
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
  settings and budgets; practice is available only in preview/debug. Existing
  deterministic welcome/navigation remains available. Catlas does not join
  private conversations or receive development/publishing authority by default.

### Practice, evidence, and durable improvement

- **FR-14 — Resettable practice.** Preview/debug admits each exercise, which
  declares a goal, owned fixture, initial-state recipe, permitted actions,
  expected outcomes, timeout/budget, cleanup/retention policy, and evaluator
  revision. Use synthetic or explicitly
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

### Distribution and knowledge-fed inference

- **FR-20 — Build-profile separation.** Package the extra Cats development,
  operation-practice and distillation skills/resources only in the preview/debug
  supplement. Release artifacts must exclude them physically and omit them from
  Cats-owned catalogs, auto-discovery/injection, development/practice endpoints
  and hydration of inherited/resumed sessions. Validate both artifact inventories
  and runtime requests; a hidden control is not absence. Leftover preview state,
  nearby Cats source or caller-supplied metadata must not enable the supplement
  in release. Removing a skill from request metadata does not erase a provider's
  retained context: reject a development-session resume when that exclusion
  cannot be verified, or create a fresh context with only release-compatible
  inputs. Preserve unrelated product features and skill packages.
- **FR-21 — Reviewed knowledge production.** Preview/debug code work and practice
  shall produce reviewable knowledge-file candidates with evidence, applicability
  and digests. Independent validation/review promotes selected content into the
  Platform-owned bundle for both profiles. Do not ship raw private traces,
  development instructions or unverified lessons as end-user knowledge. Record
  the exact bundle in the artifact inventory. Knowledge promotion/publication
  remains separate from code integration and obeys existing authorization.
- **FR-22 — Deliver content to the bound model.** Assemble bounded relevant
  knowledge plus the current observation/user request for Catlas's configured
  provider/model. Initially inject selected entry contents into the inference
  request. File-reading or retrieval-tool delivery may be used only when the
  adapter and session can actually read the selected read-only resource; supply
  content/tool results for remote/API models rather than a desktop-only path.
  Verify effective delivery, record entry IDs/digests and provider target, and
  reselect on context/build/knowledge revision changes. Missing or incompatible
  content must be visible to the inference path and cannot support a completion
  claim. Neither source access nor a development skill is a release dependency.
- **FR-23 — Contextual inference.** The bound model shall use available evidence
  to identify the current situation, form a tentative understanding of intent
  and blockers, and suggest an explanation, diagnostic question or supported
  next step. Keep inferred intent distinct from observed facts; ask when the
  distinction affects the next action. Contextually different situations must
  not be answered solely by replaying the same canned help. Show brief grounded
  guidance and truthful action results without requiring storage of private
  model reasoning. Offline/model failures preserve basic product usability and
  are not presented as successful inference or completed operations.

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
Preview/debug Desktop + development supplement / existing Core Task + Run
  -> admitted source assignments -> per-repo worktrees
  -> candidate build in a separate environment
  -> independent outcome checks -> code + candidate knowledge files
  -> reviewed changes / promoted Platform knowledge bundle

Release Desktop (no development supplement) or preview/debug
  -> compatible local knowledge bundle + bounded current context/user request
  -> selected content injection or verified read/retrieval tool
  -> Catlas's bound provider/model reasons about situation, intent and blockers
  -> explanation / guidance / authorized operation + checked result

Preview/debug-only practice
  -> candidate lesson -> replay + held-out evaluation -> reviewed knowledge
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
| Product knowledge bundle | Concepts, symptom/intent cues, diagnostics and operations; manifest, entry revisions/digests, applicability, locale and sanitized provenance | Platform; promoted from reviewed preview/debug output |
| Catlas context receipt | Bound provider/model, observation revision, selected entry IDs/digests, content/tool delivery outcome; no required private reasoning trace | Platform projection over the Runtime inference boundary |
| Practice attempt | Scenario/reset recipe, input digests, model/skill/knowledge identities, run/evidence refs, measured result | Platform projection over Runtime evidence |
| Procedure candidate and promotion receipt | Proposed digest, source/counterexample refs, evaluation-set revision, independent reviewer/evaluator, outcomes, active/revoked state | Platform |

These records extend/link existing owning objects where possible. Exact storage
shapes and new control-surface names are a Phase 0 integration deliverable.

### Proposed skill packages

| Package | Canonical authoring owner | Delivery and scope |
|---------|--------------------------|--------------------|
| `cats-inc-development` | Runtime `runtime-skills/preview/` | Preview/debug managed supplement; repository routing follows cats-one's workspace composition and member instructions |
| `cats-platform-operation` | Runtime `runtime-skills/preview/` | Preview/debug operation-practice supplement; absent from release and not required for normal Catlas inference |
| `cats-practice-and-distill` | Runtime `runtime-skills/preview/` | Preview/debug practice supplement; consumes evaluator results and proposes knowledge candidates, never grants promotion authority |

The owner authorized this implementation on feature branches on 2026-09-25.
PLAN-109's Resume Checkpoint defines the concrete artifact/provenance and
practice contract. The managed `cats-inc-development` authoring owner is refined
from the original cats-one proposal to Runtime so the product supplement is
self-contained. cats-one continues to own developer workspace composition.

Reuse existing handoff, project-memory, development/review roles, and native UI
automation where appropriate. Do not copy all developer skills into the shipped
release product catalog. These canonical locations are authoring ownership, not
a rule that the full tree ships in every build. Define explicit supplement
selection and filtering for Desktop staging and Runtime catalog/hydration before
adding the packages; review the default Runtime npm inventory as part of that
contract. Release Catlas receives ordinary inference instructions and knowledge
content directly, without resolving any of these supplement IDs.
Any missing resource-delivery capability is an explicit Runtime
work item, not a claim that instruction text makes helper files accessible.

## Acceptance Criteria

The full criteria below remain **pending**. The initial Code-help fixtures cover
subsets of AC-07, AC-09 and AC-14; they do not close native, live-provider or
combined development-to-release gates. PLAN-109 records the executed checks.

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
| AC-13 | Preview/debug includes the selected supplement; release artifacts, catalogs and Cats-managed requests exclude it even with nearby Cats source or stale preview caches; a development-session resume with unverifiable retained context is rejected or replaced with a fresh release context; ordinary product capabilities remain available | FR-20 |
| AC-14 | Source-free release Catlas, with the supplement absent, receives relevant entry content through the enabled delivery path and its bound provider/model gives context-appropriate guidance for distinct intent/blocker fixtures; inaccessible paths, stale entries and provider failures are reported honestly | FR-22, FR-23 |
| AC-15 | A verified preview/debug task yields reviewed knowledge files whose promoted digest is packaged and usable in a compatible release candidate; raw traces, unverified lessons and developer instructions are excluded | FR-21 |

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

Phase 0 must settle the Core record extensions, build-profile supplement
selection and artifact/catalog filtering, candidate-profile startup and
enforcement contract, knowledge-file schema/package location, normal Catlas
inference/context delivery, and exact first operation/tool loop. Native
acceptance will identify its preview/debug controller and release candidate builds,
provider, model, and CLI version from the actual machine rather than prescribing
an unverified version here. Broader OS support and independent bundle updates
remain later work, each requiring evidence and an explicit rollout decision.

---

*Created: 2026-09-24*
*Last updated: 2026-09-26*
