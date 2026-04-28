# SPEC-025: Budget Policy, Override Flows, and War-Room Dashboard

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Not Planned (War Room dashboard retired) |
| **Owner** | Codex |
| **Reviewer** | User / cost-control workstream |

## Retired Direction

The Cats Work War Room dashboard direction in this specification is no longer
being developed. Future budget, quota, approval, and recovery visibility must
land in narrower Work surfaces such as task detail, Cockpit, Broken Links, or a
new explicitly scoped operator surface. Do not add new War Room dashboard
requirements, UI panels, or follow-up implementation tasks from this spec.

## Summary

Cats needs a product-owned budget and cost-control model that sits above
runtime telemetry.

> Historical note: the budget-policy model remains useful background, but the
> War Room dashboard surface described below is retired.

`cats-runtime` should report usage, rate-limit incidents, and guardrail states.
`cats` should decide how those facts turn into owner policy:

- warnings
- approval requests
- temporary pauses
- provider downgrade or reroute
- budget override decisions
- operator-facing dashboard views

This should support current chat-first and Work task/detail control surfaces
without reviving the retired War Room dashboard.

## Goals

- define explicit budget policy above runtime telemetry
- support soft and hard limits across multiple scopes
- support approval and override flows when costs or quotas become risky
- make cost and rate-limit visibility possible in focused Cats Work UI surfaces
  without a War Room dashboard

## Non-Goals

- reimplementing provider token accounting in product code
- moving runtime rate-limit parsing or cooldown logic into `cats`
- requiring the first slice to ship a full multi-company finance module
- replacing runtime dashboards as the source of execution facts

## User Stories

- As an owner, I want to set spending or quota guardrails for a chat, Cat,
  provider, or overall environment.
- As a Boss Cat, I want warnings before dispatching expensive or risky work.
- As an operator, I want focused Work views that show current burn, alerts,
  and blocked states without requiring a War Room dashboard.
- As a specialist Cat, I want policy outcomes to be clear when a task is paused
  or requires approval due to budget or quota.

## Requirements

### Functional Requirements

1. `cats` shall define a product-owned budget-policy model.
2. Budget policy shall consume runtime telemetry rather than re-parsing
   provider-native output.
3. Budget policy scopes should be able to include at least:
   - global
   - chat
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
    - top-spending Cats or chats
    - provider usage distribution
    - rate-limit / cooldown alerts
    - blocked or approval-pending states
12. Cats Work or later operator surfaces may render these reads in focused
    task/detail, Cockpit, Broken Links, or other explicitly scoped operator
    views without changing the runtime boundary. They shall not revive the
    retired War Room dashboard without a new spec.
13. Budget policy should integrate with existing or planned approval,
    escalation, and takeover flows.
14. Budget policy should remain compatible with artifact-only and low-governance
    work; not every chat requires the same strictness.
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
  | 'chat'
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

## Retired War-Room Direction

The long-term Cats Work War Room dashboard is retired.

The historical dashboard idea would have shown:

- current total spend or usage
- active burn rate and recent trend
- per-Cat and per-chat breakdowns
- provider mix and cooldown/rate-limit incidents
- hard-limit blocks, approval queues, and active overrides

Any future product-owned read model should be hydrated from runtime telemetry
and product approval records rather than from direct provider APIs, but it must
be scoped outside the retired War Room dashboard.

## Dependencies

- [ADR-023](../decisions/023-own-budget-policy-and-cost-control-in-product.md)
- [SPEC-005](./SPEC-005-company-control-plane-evolution.md)
- [SPEC-024](./SPEC-024-chat-delivery-policy-and-governance-levels.md)
- [cats-runtime SPEC-010](../../../cats-runtime/docs/specs/SPEC-010-usage-metering-rate-limit-detection-and-execution-guardrails.md)

## Open Questions

- [ ] Which budget scopes should ship first in the current chat-first product:
      chat only, or chat plus provider and Cat?
- [ ] Should provider downgrade behavior be part of first-slice policy, or
      should the first slice limit itself to warnings, blocking, and override?
- [x] War Room dashboard is no longer pursued; future budget visibility must
      use narrower surfaces or a new spec.

## References

- [Paperclip Control-Plane Analysis](../research/paperclip-control-plane-analysis.md)
- [requirements.md](../requirements.md)
- [PLAN-005](../plans/PLAN-005-company-control-plane-evolution.md)

---

*Created: 2026-03-20*
*Author: Codex*
*Related Plan: Not planned; War Room dashboard development retired.*


