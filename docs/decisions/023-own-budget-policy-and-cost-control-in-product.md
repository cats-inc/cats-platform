# ADR-023: Own Budget Policy and Cost Control in Product

> Keep budget policy, override rules, and operator-facing cost control inside
> `cats-inc`, while `cats-runtime` provides the metering and rate-limit
> telemetry needed to enforce those policies.

## Status

Accepted

## Date

2026-03-20

## Context

Paperclip's operator model treats costs, budgets, approvals, and audit trails
as product-level control-plane objects rather than hidden runtime details.

The Cats architecture already makes a similar split elsewhere:

- product owns skill intent
- runtime owns skill delivery
- product owns MCP/tool intent
- runtime owns tool delivery
- product owns delivery policy
- runtime owns executable delivery primitives

Budget policy should follow the same pattern.

`cats-runtime` should know usage facts, cooldowns, and blocked states. But the
questions below are product/control-plane questions:

- how much budget should a workspace, Cat, or provider get?
- is a limit soft or hard?
- when a limit is exceeded, should the system warn, pause, downgrade, or ask
  for approval?
- how should this appear in a Cats Work war-room or operator dashboard?

Those concerns belong in `cats-inc`.

## Decision

`cats-inc` will own budget policy, approval/override behavior, and operator
cost-control surfaces.

1. `cats-inc` owns budget policy semantics.
   - budget scopes
   - soft vs hard limits
   - escalation and approval behavior
   - operator-visible explanations and alerts

2. Budget policy is distinct from runtime metering.
   - runtime reports usage, incidents, and cooldown state
   - product decides what those facts mean for owner policy and work routing

3. Product policy should be able to act on runtime telemetry without re-parsing
   provider-specific events.
   - cost or usage dashboards
   - warnings and approvals
   - downgrade or reroute decisions
   - temporary pauses or blocks at the product layer

4. Cats Work or later operator surfaces may present war-room budget views.
   - current runtime/dashboard inspection does not block richer product views
   - the product remains free to aggregate by Cat, workspace, provider, or
     work item above the runtime boundary

5. `cats-inc` should not absorb provider-specific rate-limit parsing or token
   accounting logic that properly belongs in runtime adapters.

## Consequences

### Positive

- Cost and budget behavior can match owner preferences and work context.
- Runtime stays reusable and focused on execution facts instead of company
  policy.
- Cats Work can later present a strong operator dashboard without weakening the
  runtime boundary.
- Budget overrides can reuse product-owned approval flows.

### Negative

- Another explicit product-to-runtime seam is required.
- The product must design budget scopes and override UX rather than relying on
  raw runtime counters alone.
- Aggregation above runtime may require new product storage/read models.

### Neutral

- This ADR does not require a full Cats Work UI immediately.
- This ADR does not require runtime to stay blind to usage; it requires runtime
  to stop short of owning product policy.
- This ADR does not require one global budget model for every future deployment
  or tenant shape.

## Alternatives Considered

### Alternative 1: Put most budget behavior inside `cats-runtime`

- **Pros**: fewer conceptual layers at first glance
- **Cons**: runtime would grow product governance semantics and approval logic
- **Why rejected**: budget policy belongs to the product/control plane

### Alternative 2: Keep costs visible only as raw token counters in product

- **Pros**: very small product change
- **Cons**: no explicit policy, weak alerting, and no war-room level control
- **Why rejected**: the suite needs inspectable budget policy, not only passive
  telemetry

### Alternative 3: Delay all budget policy until after a full company-control
plane rewrite

- **Pros**: less immediate product work
- **Cons**: leaves operator cost control too vague while runtime execution
  already grows
- **Why rejected**: budget and cost visibility are already important before the
  full Paperclip-style control plane arrives

## References

- [ADR-022](./022-own-workspace-delivery-policy-in-product.md)
- [ADR-020](./020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md)
- [SPEC-005](../specs/SPEC-005-company-control-plane-evolution.md)
- [cats-runtime ADR-017](../../../cats-runtime/docs/decisions/017-own-usage-metering-rate-limit-detection-and-execution-guardrails.md)
- [Paperclip Control-Plane Analysis](../research/paperclip-control-plane-analysis.md)

---

*Accepted: 2026-03-20*
*Decision makers: user + Codex*
