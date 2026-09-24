# ADR-119: Share Product Knowledge and Role Procedures with Supervised Agents

## Status

Accepted for the shared knowledge and role-procedure architecture, 2026-09-24.
The owner requested documentation followed by wiring in the same work package.
K1 implements inline knowledge consumption; collaboration operation mapping and
K2-K4 acceptance remain pending. Publication remains a separate authorization.

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
*Last updated: 2026-09-24*
