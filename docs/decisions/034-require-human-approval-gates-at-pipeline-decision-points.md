# ADR-034: Require Human Approval Gates at Pipeline Decision Points

> All externally-consequential actions in the Cats ecosystem require explicit
> human approval. This is a permanent design constraint, not a temporary
> safety measure.

## Status

Proposed

## Context

Cats Work envisions an automated freelance pipeline (find jobs → write
proposals → implement → deliver → collect payment) and a distributed agent
mesh where participants contribute idle AI subscriptions. Both scenarios
involve actions with real-world consequences:

- Submitting proposals to freelance platforms on behalf of the owner
- Committing to deadlines and budgets with external clients
- Delivering work products to paying customers
- Consuming another participant's AI subscription quota in a mesh network

These actions create legal, financial, and reputational exposure. Additionally,
AI provider Terms of Service and freelance platform Terms of Service may
restrict automated usage. Full automation without human oversight creates
unacceptable risk.

## Decision

**Every externally-consequential pipeline action requires an explicit human
approval gate implemented via structured choices (SPEC-033). This requirement
is permanent and cannot be overridden by a global toggle.**

### Actions that require human approval (non-exhaustive)

- **Job acceptance**: AI recommends a job; human must approve before entering
  pipeline
- **Proposal submission**: AI drafts proposal; human must review and confirm
  before sending to any platform
- **Implementation start**: task breakdown complete; human must approve before
  committing agent resources
- **Delivery to client**: work product complete; human must review and approve
  before sending to customer
- **Mesh task acceptance**: a task arrives at a mesh node; node owner must
  approve before their runtime accepts it
- **Budget commitment**: spending exceeds a threshold; human must approve
  continuation

### Rules

- Removal of any individual approval gate must be an owner **per-action,
  explicit opt-in** decision, never a global "auto-approve all" setting
- The opt-in decision itself must be presented as a structured choice with
  clear risk disclosure
- Audit trail must record every approval decision (who, when, what was
  approved)
- Default state for all gates is **approval required**

### What this decision does NOT restrict

- Internal agent-to-agent communication (Cat dispatching work to another Cat)
- File operations within the workspace
- Code generation, testing, and local dev server operations
- Memory and knowledge operations
- Any action whose blast radius is contained within the owner's local
  environment

## Consequences

### Positive

- Eliminates risk of unauthorized external actions (legal, financial,
  reputational)
- Ensures compliance with provider and platform TOS by keeping human in the
  loop
- Builds trust — owner always knows what the system did on their behalf
- Structured choices mechanism (SPEC-033) makes approval low-friction
  (one click, not a form)
- Audit trail enables post-hoc review and improvement

### Negative

- Latency at every approval gate (human response time)
- Owner must be available for decisions, limiting fully autonomous operation
- Some owners may find frequent approval prompts annoying

### Neutral

- This constraint shapes all future SPECs involving external actions — every
  such SPEC must include approval gate design
- The structured choices mechanism (SPEC-033) serves as the standard
  implementation for all approval gates

## Alternatives Considered

### Alternative 1: Full Automation with Guardrails

- **Pros**: faster pipeline, no human bottleneck, maximizes agent autonomy
- **Cons**: single guardrail failure can cause real-world damage (wrong
  proposal sent, wrong deliverable shipped, TOS violation); liability unclear
- **Why rejected**: the risk/reward ratio is unacceptable at this stage and
  likely for the foreseeable future for externally-consequential actions

### Alternative 2: Tiered Automation (Auto-approve Below Threshold)

- **Pros**: reduces friction for small/low-risk actions
- **Cons**: defining "low-risk" is subjective and error-prone; a $50 job
  auto-accepted could still cause reputational damage if delivered poorly;
  creates a false sense of safety
- **Why rejected**: the complexity of risk assessment exceeds the friction
  saved; better to keep all external gates explicit and make the approval
  UX fast (structured choices) rather than trying to classify risk levels

## References

- [Research: Cats Work Aggregator and Mesh Vision](../research/2026-03-24-cats-work-aggregator-and-mesh-vision.md) (天條 section)
- [Research: Structured Choices Design Reference](../research/2026-03-24-structured-choices-design-reference.md)
- [SPEC-033](../specs/SPEC-033-structured-choices-contract-and-chat-message-integration.md) (implementation mechanism)

---

*Drafted: 2026-03-24*
*Drafted by: Claude*
