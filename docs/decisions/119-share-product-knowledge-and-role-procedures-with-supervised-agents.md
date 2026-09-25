# ADR-119: Share Product Knowledge and Role Procedures with Supervised Agents

## Status

Accepted for the shared knowledge and role-procedure architecture, 2026-09-24.
The owner requested documentation followed by wiring in the same work package.
K1 implements inline knowledge consumption. K2 implements opt-in supervised
teammate/context reads and collaboration preparation, with same-session feedback
and isolated HTTP acceptance fixtures. K3 adds owner-confirmed conversation,
membership and Work execution with durable recovery; scoped validation and full
CI pass, as recorded in [PLAN-110](../plans/PLAN-110-orchestrator-knowledge-and-collaboration-rollout.md).
K4's bounded live K3 and native saved-state projections pass; model-driven K2 and
release/preview profile exclusion remain open. Publication remains a separate authorization.

## Context

The initial Code-entry Catlas slice supplies packaged knowledge contents and a
bounded observation to Catlas's bound model. The visible Orchestrator, called
God Cat by the owner and Boss Cat in current Chat prompts, also needs product
knowledge: how conversations work, when to involve another Cat, how to transfer
context, and how to verify delegated work. These names refer to an existing
capability; this decision does not introduce another agent identity.

Before K1, Orchestrator prompts included a roster, recent messages, memory and
instructions to mention existing participants. A separate provider-agent seam
accepts bounded observations and structured decisions under Platform policy.
Neither path consumed shared product knowledge. Existing HTTP
operations and internal delegates do not by themselves establish a complete
model-callable conversation-creation/recruitment loop.

MCP/tool use and skills answer different questions. An operation contract states
what can execute and with which arguments. A procedure teaches when and how to
combine operations. MCP can transport either tools or knowledge resources; it
does not replace procedural knowledge or grant execution authority.

## Decision

### Share the knowledge mechanism and specialize its consumers

Platform owns one product-knowledge reader, compatibility/selection mechanism
and provenance model. Catlas and Orchestrator select relevant concepts and role
procedures from that system; they do not keep separate copies of product facts.
Physical bundles may be split by product/role to bound packaging and input size.

Catlas's existing explain-only response path remains separate from Orchestrator
execution. Orchestrator must work when optional Catlas is absent or dismissed.
Reuse knowledge loading and delivery, not Catlas's identity, model binding,
read-only help session or advice-only response envelope.

### Supply operations, procedures and current observations together

| Input | Source of truth | Purpose |
|-------|-----------------|---------|
| Role instruction | Platform's role adapter | Establish the actor's responsibilities and response contract |
| Tool capabilities | Executable manifests and verified product adapters, filtered by current policy | Describe callable operations, arguments, effects, results and limits |
| Product concepts and procedures | Reviewed versioned knowledge | Explain operation choice, prerequisites, sequencing, handoff, verification and recovery |
| Current observation | Authorized product/Core reads and Runtime readiness | Describe the actual user request, candidate Cats, conversation, active work and applicable grant |
| Operation results | Owning delegate, authoritative state and existing evidence | Establish what happened and inform the next decision |

Generate tool signatures from executable contracts. Procedures reference stable
operation identities and compatible revisions, without copying their schemas.
Do not advertise a missing or unverified operation because a procedure mentions
it. Knowledge may explain an unavailable capability, but execution selection
must exclude procedures whose required operations cannot be delivered.

### Make procedure delivery provider-independent

The first implementation selects bounded content in Platform and injects the
actual contents into both the visible coordinator prompt and, when used, the
provider-agent decision request. Inject only the entries needed by each path;
keep structured decision output separate from the user-facing response.

A procedure is a skill in the behavioral sense. It need not be a provider-native
installed skill package. Verified native-skill or MCP-resource delivery may be
added later over the same authoritative content. Such delivery requires an
index/trigger, a successful content read, applicable tool access and an effective
delivery receipt. A filename, skill label or resource URI alone is insufficient.
Runtime remains responsible for provider-specific skill delivery and execution;
Platform does not create a competing native-skill catalog or workspace sync.

### Preserve supervision and finish the result loop

Use the existing provider-agent decision, policy, product delegate, Runtime and
Core/evidence seams. Bind the caller, target scope and grant on the server. A
procedure cannot enlarge those grants or override deterministic room routing.
Adding a participant is an explicit product mutation; `@Name` only hands off to
an already valid participant.

Each permitted action returns a structured result to the same coordinating
run. Re-read its postcondition before reporting success. Reuse canonical
Conversation, participant, Task/Run and Runtime session identities; these are
different resources. Persist idempotency and recovery references with existing
owners before enabling resumable mutations. A second coordinator scheduler,
roster or transcript store is outside this decision.

K3 keeps the model coordinator at `narrow_write`. Its role request only queues
a fixed Work Run, then the host checks the persisted owner choice independently
before using the expensive Runtime boundaries. Queue acceptance is persisted
before that drain; a separate inspection receipt returns the actual result.
This preserves FR-19's unknown-model restrictions without promoting catalog
metadata into capability evidence or treating execution as a local-state tool.

Chat and Core mutations share one atomic snapshot writer. Concurrent Chat
dispatch/settings writers merge their own changes into current state. Work owns
the parent intent, two role Tasks and Runs, verified local revision, attributed
review and cancellation/recovery metadata. Review remains non-dispatchable until
implementation proof is committed. Runtime creates an isolated worktree; the
reviewer must observe its exact clean commit before and after review. This proves
revision identity, not passing tests. Remote publishing remains outside the grant.

Repeated confirmation acknowledges the existing attempt without replacing its
active Chat turn. Recovery fences unfinished roles, persists late session IDs,
and records cleanup only after Runtime confirms it; it never silently relaunches
an ambiguous create or deletes retained work.

K4 live acceptance exposed a response-contract delivery gap: a schema name and
tool manifests did not teach the model the required decision envelope. The
adapter now supplies complete response examples and field rules alongside the
observation, independently of optional knowledge. Existing decision validation
and policy remain authoritative; malformed output is never repaired into an
authorized action. Coordinator usage is recorded at the Runtime response boundary
before parsing, so a rejected decision still consumes the admitted budget.

K2/K3 continuation reuses exact tool and knowledge bytes already delivered to its
own coordinating session. Current selections, policy, budget, scope and complete
decision shapes remain explicit on every turn. Content hashes include metadata;
fresh or changed blocks are delivered inline, and delivery receipts distinguish
inline bytes from same-session references. The host always validates against
the full current observation. This is a run-local prompt optimization, not a
second knowledge store or a resumable execution mechanism. An unknown session
or failed request cannot inherit a cached delivery base. Provider-native coding
instructions and tool inventories are a separate Runtime concern; reducing
Platform payloads alone does not establish an adequate live token budget.
K2 explicitly retains its four-result delivery bound, five-request ceiling and
30-second/8,000-token preparation budget; it does not inherit K3's owner-confirmed
execution budget. Ordinary decisions outside these collaboration surfaces retain
complete snapshots.

K2 also captures Runtime response usage before parsing or policy rejection. An
attempted inference failure ends preparation with a terminal report, avoiding an
unreported second inference through ordinary Chat fallback. The report preserves
known tokens, Runtime request/response counts, original limits and whether usage
is complete; late responses cannot change that snapshot. Existing reports may
omit this additive metadata. A valid ordinary first decision and setup failure
before any send retain their original fallback behavior. This is an accounting
and failure-reporting correction, not authority to enlarge preparation budgets.

The next measured run confirmed that per-primitive model decisions remain too
expensive for the bounded fixture. An additive `request_execution({})` therefore
accepts only the already owner-confirmed fixed collaboration. It persists a
local request; the host performs the existing conversation/membership delegates
and implementation-to-review drains, with every current grant, revision, budget,
cancellation and recovery check intact. Complete receipts remain durable; bounded
feedback projections of every new outcome return to the same coordinator, with
explicit summary truncation/digests and canonical evidence references. Outcomes
are persisted before a projection limit can stop further execution. This removes
redundant model decisions about predetermined steps,
without interpreting a model-authored action batch or changing primitive tools.

Worker execution resolves and pins the exact configured backend/instance before
readiness. CLI targets use bounded version/help compatibility diagnostics because
passive CLI availability is metadata-only and cannot establish executable `ok`.
Other backends retain their light checks: their full diagnostics can create
transient sessions outside the recorded worker bridge. Neither diagnostic result
grants execution authority or replaces the persisted owner grant and budget.

Candidate Desktop acceptance uses an explicit isolated launch identity before
Electron's instance lock, private storage/sidecar working directories and owned
loopback listeners. Installer/update/OS-login mutations are unavailable there.
This additive acceptance profile is distinct from release trust, OS sandboxing
and the future release/preview development-content selection in ADR-118.

### Keep normal product procedures available in both profiles

Release and preview/debug both consume reviewed product concepts and ordinary
Orchestrator collaboration procedures. This includes operating Cats for the
user's work, subject to the user's normal permissions.

ADR-118's extra Cats-source development, practice and distillation skill
supplement remains preview/debug-only. Release does not need that supplement to
coordinate ordinary work. A future native wrapper for a normal procedure must
use an explicit product distribution classification; it must not inherit the
development supplement's classification from an ambiguous skill name.

Practice produces candidate procedures with evidence. Independent validation
and promotion under ADR-118 are still required before either consumer uses them
as official knowledge. This work does not introduce model-weight training.

## Consequences

- Catlas explanations and Orchestrator execution can share product semantics
  while retaining their different identities and authority.
- A model receives both callable capabilities and practical methods, including
  when to ask for missing information or stop after a failed prerequisite.
- Maintaining compatibility between procedures, adapters and running builds
  becomes an explicit packaging and validation responsibility.
- Native skills are an optional delivery optimization; their presence is not
  evidence that a particular session received the relevant content.
- Full collaboration needs more work than loading knowledge. Delivery,
  operation admission, persistence, feedback and live acceptance have separate
  gates in PLAN-110.

## Alternatives Considered

| Alternative | Benefit | Reason not selected |
|-------------|---------|---------------------|
| Only tool schemas and short descriptions | Small context footprint | Does not supply workflow selection, handoff or recovery methodology |
| One large always-loaded skill prompt | Simple initial delivery | Duplicates schemas, consumes context and can describe unavailable capabilities |
| Separate Catlas and Orchestrator knowledge stores | Independent iteration | Product facts and version applicability can diverge |
| Require provider-native skills for all models | Familiar local-agent workflow | Excludes ordinary content-based inference and makes delivery provider-dependent |
| Let procedures call public HTTP APIs directly with broad credentials | Reuses endpoints | Bypasses per-action caller resolution, supervision and result ownership |

## References

- [SPEC-118](../specs/SPEC-118-orchestrator-knowledge-and-collaboration-operations.md)
- [PLAN-110](../plans/PLAN-110-orchestrator-knowledge-and-collaboration-rollout.md)
- [ADR-118: development and verified practice](118-use-isolated-development-and-verified-practice-for-cats-improvement.md)
- [ADR-082: supervised capability shell](082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [Product integration rules](../product-integration-guide.md)
- [Agent control surfaces](../agent-control-surfaces.md) and [tool registry](../tool-calls.md)

---

*Proposed: 2026-09-24*
*Last updated: 2026-09-25*
