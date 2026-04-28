# ADR-087: Open Default Bootstrap Treatment, Bounded by an Evidence Floor

> Replace the fail-closed unknown-default supervision policy with three
> open tiers (`weak_worker` / `default` / `strong_agent`) sourced from
> the operator-owned capability bootstrap YAML. Keep the FR-19 evidence
> floor for `broad_write` and unrestricted `outcome_delegation`.

## Status

Accepted

> This ADR refines ADR-082 (Recast the Orchestrator as a Capability
> Shell with Policy-Dial Supervision) and supersedes the FR-18 / FR-19
> wording captured by PLAN-080's first slice.

## Context

PLAN-080 landed the YAML-backed capability bootstrap and explicitly
moved off the hard-coded `claude / codex strong, ollama weak` mapping
that PLAN-075 shipped. The slice took the safest possible default:
any provider/model/control target without an explicit YAML rule
resolved to `bootstrapTreatment: 'default'` + `confidenceLevel:
'unknown'`, and the policy engine treated that pair as identical to
weak: `read_only` toolScope, `single_step` autonomy, `tiny` task
granularity, `sop_template` scaffolding, `schema_required` validation,
`every_step` checkpoints, and `ask_human` recovery.

In practice this means a fresh install pointed at any common provider
(Claude API, OpenAI, GPT-4, Gemini, etc.) cannot do useful work: it can
read but not write; it can do tiny tasks one at a time; it asks the
human on every failure. Every workable session requires the operator
to write a `strong_agent` rule first. The default is "off" and the
opt-in cost makes the YAML feel mandatory rather than configurational.

PLAN-080's intent was governance — not paternalism. Its rationale was
"do not infer strong/weak from provider names". That goal does not
require treating an explicitly-chosen, unlisted provider the same as
an explicitly-labelled weak worker. The user clicking "use this
model" is itself a trust signal; a YAML allowlist or denylist exists
to override that signal in either direction.

## Decision

Bootstrap treatment becomes a three-tier label that maps to three
distinct dial sets at boot time. The FR-19 evidence floor stays for
the two highest-impact dials.

### Tier dial table

| dial | weak_worker | default (no rule) | strong_agent | evaluated/observed |
|------|-------------|-------------------|--------------|--------------------|
| autonomy | single_step | single_step | milestone_plan | milestone_plan / outcome_delegation* |
| toolScope | read_only | narrow_write | narrow_write | narrow_write / broad_write* |
| taskGranularity | tiny | step | step | milestone |
| scaffolding | sop_template | sop_template | few_shot | few_shot |
| validation | schema_required | semantic_check | semantic_check | semantic_check |
| checkpointCadence | every_step | every_step | milestone | milestone |
| fallbackPolicy | ask_human | ask_human | retry | retry |

`*` Capped by the FR-19 evidence floor: `broad_write` and unrestricted
`outcome_delegation` require `confidenceLevel >= evaluated` regardless
of bootstrap treatment.

### Tier semantics

- **`weak_worker`** = explicit operator denylist. Clamped to the most
  restrictive dial set. Applies to local SOP workers, untrusted
  models, or anything the operator wants to fence off.
- **`default`** = no YAML rule matched. The operator implicitly
  trusted the model by selecting it; the policy grants the open
  middle tier (narrow writes, step planning, semantic validation).
  Still keeps `single_step` autonomy and `every_step` checkpoints
  because we have no signal beyond the user's pick.
- **`strong_agent`** = explicit operator allowlist. Unlocks
  multi-step planning (`milestone_plan`), looser scaffolding
  (`few_shot`), milestone-level checkpoints, and self-recovery
  (`retry`). Does **not** unlock `broad_write` or
  `outcome_delegation` until eval evidence arrives — the operator's
  vouching is a planning trust signal, not safety evidence.
- **`evaluated`/`observed` confidence** lifts the FR-19 floor and
  unlocks `broad_write` (with high-approval gate) and unrestricted
  `outcome_delegation` for `default` and `strong_agent` treatments
  (still rejected for `weak_worker`).

### What FR-19 still floors

`broad_write` toolScope and unrestricted `outcome_delegation`
autonomy require `evaluated`/`observed` evidence — full stop, even
under `strong_agent` YAML and even with operator override. These are
the two dials whose worst-case blast radius (rm -rf, unbounded
external mutations, irreversible delegation) is too large to grant on
trust alone. Every other dial (`milestone_plan`, `narrow_write`,
`step`, `few_shot`, `semantic_check`, `milestone` checkpoints,
`retry`) is **not** floored by FR-19; treatment + override compose
freely under the evidence ceiling.

### What FR-19 used to floor (and why we removed it)

The pre-ADR-087 implementation rejected `milestone_plan` autonomy
under unknown/catalog_only confidence as part of the FR-19 floor.
This was over-zealous: `milestone_plan` is a **planning** dial, not
an **action authority** dial — the agent still calls supervised
tools that enforce their own scope and approval. Multi-step planning
without `broad_write` cannot harm the system; it just lets the agent
think ahead. Removing it from the floor lets `default` and
`strong_agent` produce useful agentic work without weakening the
real safety boundary.

## Consequences

### Positive

- A fresh install pointed at Claude / OpenAI / Gemini / GPT-4 can
  immediately write narrow scopes, do step-sized tasks, and use
  semantic validation. Operators no longer need to write a YAML rule
  to make the system useful.
- Operators retain explicit control via `weak_worker` (denylist) and
  `strong_agent` (allowlist) YAML rules. Each tier has a distinct
  dial signature so the choice is visible and meaningful.
- The high-impact dials (`broad_write`, `outcome_delegation`) remain
  evidence-gated. The safety story for destructive operations is
  unchanged: `evaluated`/`observed` evidence is still required.
- The policy engine reads `bootstrapTreatment` from
  `CapabilityAssessment` directly, so operator overrides, eval
  evidence, and treatment compose orthogonally.

### Negative

- Existing deployments running on the PLAN-080 fail-closed default
  will see the dials change for unlisted providers when this lands.
  Operators who depended on the implicit clamp must add
  `weak_worker` rules for any model they want to keep restricted.
- The bundle version `supervision-policy@2` invalidates replay of
  `supervision-policy@1` snapshots: stored decisions cannot be
  re-evaluated against the new rules without re-running the policy
  engine.
- Three meaningful tiers raise the YAML-authoring surface from
  "rare" to "common". Documentation and onboarding flows must
  explain when to add a rule (rare — only for explicit
  allow/denylist) versus when to leave default (the norm).

### Mitigations

- Release notes and `docs/deployment.md` call out the dial table
  explicitly so operators can decide whether to author
  `weak_worker` rules during the upgrade.
- The bundle/dial version bump (`supervision-policy@2`,
  `autonomy@2`, `tool-scope@2`) makes the change visible in every
  policy snapshot — replay tools can detect the cutover instead of
  silently re-deciding old runs.
- The `missing_config` diagnostic still points at the bundled
  example file, so operators who want to author rules have a clear
  starting point.

## References

- [SPEC-082](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
  FR-18 + FR-19 (rewritten under this ADR)
- [ADR-082](./082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md)
- [PLAN-080](../plans/PLAN-080-provider-capability-bootstrap-config-rollout.md)
  (capability bootstrap rollout this ADR builds on)
