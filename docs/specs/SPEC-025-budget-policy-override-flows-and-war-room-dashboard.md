# SPEC-025: Budget Policy, Override Flows, and War-Room Dashboard

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User / cost-control workstream |

## Summary

Cats needs a product-owned budget and cost-control model that sits above
runtime telemetry.

`cats-runtime` should report usage, rate-limit incidents, and guardrail states.
`cats` should decide how those facts turn into owner policy:

- warnings
- approval requests
- temporary pauses
- provider downgrade or reroute
- budget override decisions
- operator-facing dashboard views

This should support both the current chat-first product and a future Cats Work
war-room dashboard.

## Goals

- define explicit budget policy above runtime telemetry
- support soft and hard limits across multiple scopes
- support approval and override flows when costs or quotas become risky
- make war-room cost and rate-limit visibility possible in future Cats Work UI

## Non-Goals

- reimplementing provider token accounting in product code
- moving runtime rate-limit parsing or cooldown logic into `cats`
- requiring the first slice to ship a full multi-company finance module
- replacing runtime dashboards as the source of execution facts

## User Stories

- As an owner, I want to set spending or quota guardrails for a workspace, Cat,
  provider, or overall environment.
- As a Boss Cat, I want warnings before dispatching expensive or risky work.
- As an operator, I want a war-room view that shows current burn, alerts, and
  blocked states across active Cats and workspaces.
- As a specialist Cat, I want policy outcomes to be clear when a task is paused
  or requires approval due to budget or quota.

## Requirements

### Functional Requirements

1. `cats` shall define a product-owned budget-policy model.
2. Budget policy shall consume runtime telemetry rather than re-parsing
   provider-native output.
3. Budget policy scopes should be able to include at least:
   - global
   - workspace
   - Cat
   - provider family or provider instance
   - work item or task when that model exists
4. Budget policy shall support at least two enforcement levels:
   - soft limit
   - hard limit
5. Soft-limit behavior should be able to include:
   - warning badges or alerts
   - owner notification
   - Boss Cat confirmation before further work
6. Hard-limit behavior should be able to include:
   - block new execution
   - pause or sleep a Cat
   - require explicit owner override
   - prefer cheaper provider routing where policy allows
7. Budget overrides shall be explicit and auditable.
8. The product shall preserve why an effective budget state exists.
   At minimum that should be able to reflect:
   - policy source
   - observed runtime metric or incident
   - who approved an override when one exists
9. Budget policy should be able to react to both:
   - usage accumulation
   - rate-limit or quota incidents reported by runtime
10. `cats` shall be able to present operator-facing cost-control reads.
11. The first dashboard slice should leave room for at least:
    - current usage totals
    - burn or trend summaries
    - top-spending Cats or workspaces
    - provider usage distribution
    - rate-limit / cooldown alerts
    - blocked or approval-pending states
12. Cats Work or later operator surfaces may render these reads as a war-room
    dashboard without changing the runtime boundary.
13. Budget policy should integrate with existing or planned approval,
    escalation, and takeover flows.
14. Budget policy should remain compatible with artifact-only and low-governance
    work; not every workspace requires the same strictness.
15. Product read models should be able to distinguish exact vs estimated
    telemetry when runtime does not have exact provider cost data.

### Non-Functional Requirements

- **Boundary integrity**: product owns budget policy; runtime owns metering and
  rate-limit facts
- **Observability**: owners and operators should be able to understand why
  a warning or block occurred
- **Flexibility**: the same model should work for chat-first operations now and
  Cats Work war-room surfaces later
- **Safety**: hard limits and overrides must not be bypassed silently

## Conceptual Model

### Product Layer

- `BudgetPolicy`
  - scope
  - metric
  - threshold
  - enforcement level
- `BudgetAlert`
  - warning or hard-stop signal derived from runtime telemetry
- `BudgetOverride`
  - explicit override request and decision record
- `BudgetReadModel`
  - operator-facing aggregate and incident view

### Runtime Boundary

- `RuntimeUsageRecord`
- `RuntimeRateLimitIncident`
- `RuntimeGuardrailState`

## Recommended Shape

Illustrative product-owned types:

```ts
type BudgetScope =
  | 'global'
  | 'workspace'
  | 'cat'
  | 'provider'
  | 'task';

type BudgetMetric =
  | 'total_tokens'
  | 'estimated_cost'
  | 'rate_limit_incidents';

type BudgetEnforcement = 'soft' | 'hard';

interface BudgetPolicy {
  id: string;
  scope: BudgetScope;
  metric: BudgetMetric;
  threshold: number;
  enforcement: BudgetEnforcement;
  rationale?: string;
}

interface BudgetAlert {
  policyId: string;
  level: 'warning' | 'blocked';
  source: 'runtime_usage' | 'rate_limit_incident' | 'guardrail_state';
  summary: string;
}

interface BudgetOverride {
  policyId: string;
  approvedBy?: string;
  reason?: string;
  expiresAt?: string;
}
```

## War-Room Direction

The long-term Cats Work surface may present budget and quota information as a
war-room dashboard.

The dashboard should be able to show:

- current total spend or usage
- active burn rate and recent trend
- per-Cat and per-workspace breakdowns
- provider mix and cooldown/rate-limit incidents
- hard-limit blocks, approval queues, and active overrides

This is a product-owned read model. It should be hydrated from runtime
telemetry and product approval records rather than from direct provider APIs.

## Dependencies

- [ADR-023](../decisions/023-own-budget-policy-and-cost-control-in-product.md)
- [SPEC-005](./SPEC-005-company-control-plane-evolution.md)
- [SPEC-024](./SPEC-024-workspace-delivery-policy-and-governance-levels.md)
- [cats-runtime SPEC-010](../../../cats-runtime/docs/specs/SPEC-010-usage-metering-rate-limit-detection-and-execution-guardrails.md)

## Open Questions

- [ ] Which budget scopes should ship first in the current chat-first product:
      workspace only, or workspace plus provider and Cat?
- [ ] Should provider downgrade behavior be part of first-slice policy, or
      should the first slice limit itself to warnings, blocking, and override?
- [ ] How much of the first war-room view should live in chat-adjacent surfaces
      before Cats Work is a fuller product line?

## References

- [Paperclip Control-Plane Analysis](../research/paperclip-control-plane-analysis.md)
- [requirements.md](../requirements.md)
- [PLAN-005](../plans/PLAN-005-company-control-plane-evolution.md)

---

*Created: 2026-03-20*
*Author: Codex*
*Related Plan: TBD*
