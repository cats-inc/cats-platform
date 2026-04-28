# PLAN-080: Provider Capability Bootstrap Config Rollout

> Replace hard-coded provider-name strong/weak bootstrap with an explicit
> operator-owned YAML capability bootstrap registry.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |
| **Related ADR** | [ADR-082](../decisions/082-recast-orchestrator-as-capability-shell-with-policy-dial-supervision.md) |
| **Related Spec** | [SPEC-082](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md) |
| **Follows** | [PLAN-075](./PLAN-075-real-provider-orchestrator-integration.md) |

## Goal

Make capability bootstrap explicit and inspectable:

- every provider/model/control target starts as default/unknown unless a YAML
  rule explicitly says otherwise
- strong/weak treatment is a bootstrap hint, not a provider-name assumption
- runtime delivery richness and provider catalogs remain inventory signals, not
  intelligence/capability proof
- the same policy engine continues to decide per-action dials from capability
  evidence, task risk, tool manifest, budget, approvals, and invariants

This corrects the PLAN-075 first slice that classified `claude` / `codex` as
`strong_agent` and `ollama` as `weak_worker` in code.

## Non-Goals

- no UI/admin editor in this slice
- no eval-suite runner or session-history producer
- no alternate weak-model dispatcher
- no automatic promotion based on provider id, model name, runtime availability,
  or `ProductProviderEventCapabilities`

## Migration

Existing deployments that ran on the hard-coded PLAN-075 bootstrap will see all
provider/model/control targets default to unknown after PLAN-080 lands unless
they ship a YAML config. To avoid silent regression:

- Ship a checked-in `provider-capability-bootstrap.example.yaml` covering
  Claude / Codex / Ollama with the same treatment the hard-coded bootstrap
  produced today, plus a clear comment that operators MUST opt in by copying
  it to the active config path (it is not loaded automatically).
- The first-run / upgrade flow logs a structured warning when no config is
  found and points at the example file. The warning is a diagnostic event, not
  a UI prompt; the host or a future onboarding wizard can surface it.
- Releases shipping PLAN-080 must call out in release notes that operators who
  relied on the implicit Claude/Codex strong-agent bootstrap need to copy and
  edit the example file before live runs resume.
- A UI/admin editor for this YAML is explicit follow-up scope, not part of
  PLAN-080.

## Config Contract

The first implementation shall read an operator-owned YAML file from the
platform config directory:

```text
config/provider-capability-bootstrap.yaml
```

An environment override may be added for developer/test runs:

```text
CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG
```

If the file is absent, invalid, or has no matching rule, the target resolves to:

```ts
{
  bootstrapTreatment: 'default',
  confidenceLevel: 'unknown',
  confidenceSources: []
}
```

YAML schema:

```yaml
version: 1
profiles:
  - id: codex-cloud-gpt-5-4-strong-candidate
    selector:
      provider: codex
      instance: cloud
      model: gpt-5.4
      control: default
    initialTreatment: strong_agent
    confidenceLevel: catalog_only
    reason: Operator-approved strong-agent candidate for supervised coding demos.
  - id: ollama-local-worker
    selector:
      provider: ollama
    initialTreatment: weak_worker
    confidenceLevel: catalog_only
    reason: Local Ollama targets start as SOP workers unless evals say otherwise.
```

Rules:

- `initialTreatment` is exactly one of `default`, `strong_agent`, or
  `weak_worker`.
- `confidenceLevel` may be only `unknown` or `catalog_only` in this bootstrap
  file; `evaluated` and `observed` require eval/history evidence.
- `provider` is required. `instance`, `model`, and `control` are each optional
  and act as additional explicit narrowing of the rule. Selectors must use the
  same `ProviderCapabilityTarget` axes (`provider`, `instance`, `model`,
  `control`) that `providerCapabilityProfiles.ts` already declares; PLAN-080
  must not invent a parallel axis set.
- matching is normalized but not inferred. No code path may special-case
  `claude`, `codex`, `ollama`, `local`, or future providers by name.
- each matching rule creates `bootstrap_config` evidence with rule id, config
  version/path, timestamp, and reason.
- invalid config fails closed to default/unknown and emits a diagnostic; it must
  not silently grant strong/weak treatment.
- a YAML rule with `confidenceLevel: catalog_only` is operator attestation,
  equivalent to ADR-082 §3 evidence source #4 (operator override). It is
  bounded by the FR-19 floor: it cannot grant `broad_write` or unrestricted
  `outcome_delegation`. `evaluated` and `observed` confidence still require
  real eval/history evidence and may not be set in this YAML.
- implementation may add a small YAML parser dependency if none exists; do not
  silently downgrade this contract to JSON or an ad hoc line parser.

### Selector Precedence

When multiple rules match a target, the most-specific selector wins.
Specificity counts the number of explicit selector keys, ordered as
`provider` < `provider + instance` < `provider + instance + model` <
`provider + instance + model + control`. Ties are broken by file order
(later rule wins). Diagnostics emit both the matched rule id and any rules
that lost the tie, so operators can spot accidental shadowing.

### Reload Behavior

The resolver reads YAML once at process startup and caches the parsed config.
Live edits do not take effect until the platform process restarts. This keeps
provider treatment deterministic across a session and avoids mid-run policy
drift. A future plan may add file-watch reload, but only after a structured
audit-log entry pattern is in place to record every reload event with its
matched-rule diff.

## Implementation Phases

### Phase 1: Contract and fixture

- [ ] Task 1.1: Extend supervision contracts with
      `bootstrapTreatment` and `bootstrap_config` source metadata.
- [ ] Task 1.2: Add a checked-in example fixture for
      `provider-capability-bootstrap.yaml` under tests or docs; do not ship it
      as an active default config.
- [ ] Task 1.3: Add parser/validator tests proving absent config, invalid
      config, and unmatched targets all resolve to default/unknown.

**Deliverables**: Contract shape and failing-closed config validation are
defined before resolver behavior changes.

### Phase 2: Resolver replacement

- [ ] Task 2.1: Replace the hard-coded `classifyProviderCapability(provider)`
      mapping with a YAML-backed resolver.
- [ ] Task 2.2: Keep provider/model catalogs available for display and adapter
      inventory, but prevent catalog facts from assigning strong/weak treatment
      without a matched YAML rule.
- [ ] Task 2.3: Add diagnostics for missing config, parse failure, duplicate
      rule id, invalid treatment, invalid confidence, and ambiguous matches.

**Deliverables**: No provider receives initial differential treatment unless
the YAML explicitly grants it.

### Phase 3: Policy and product verification

- [ ] Task 3.1: Update capability profile tests so `claude`, `codex`,
      `ollama`, and unknown providers all resolve default/unknown without test
      config.
- [ ] Task 3.2: Add fixture-backed tests proving configured `codex` can appear
      as a strong-agent candidate and configured `ollama` can appear as a
      weak-worker candidate.
- [ ] Task 3.3: Update Chat/Work/Code preset capability-review tests to use
      explicit fixture config when they need a strong or weak demo path.
- [ ] Task 3.4: Verify temp participants resolve capability through their bound
      execution target plus YAML rule without promotion to durable Cats.
- [ ] Task 3.5: Re-run PLAN-075 Phase 5.4 (Work) and Phase 6.4 (Code) live
      Claude/Codex smoke under the PLAN-080 YAML fixture. Slices 64 / 65
      passed against the old hard-coded bootstrap; PLAN-080 closure requires
      proving the same paths still work when strong-agent treatment comes from
      explicit YAML rather than provider-name special-casing. Record the
      re-run in the PLAN-075 progress log.

**Deliverables**: Product demos become deterministic because the fixture says
who is strong/weak; defaults remain neutral.

### Phase 4: Documentation and operator surface

- [ ] Task 4.1: Document the YAML path and schema in setup/deployment docs.
- [ ] Task 4.2: Emit operator-facing diagnostic events covering matched rule
      id, treatment, confidence, reason, and any losing tie rules. In this
      slice the surface is the structured platform log plus existing
      supervision evidence/snapshot records (no new UI panel). A future plan
      may add an admin UI editor that consumes the same diagnostic events.
- [ ] Task 4.3: Record that a UI/admin editor is follow-up scope, not part of
      this rollout.

**Deliverables**: Operators can see why a provider/model/control target received
initial treatment even without an editor.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/platform/supervision/contracts.ts` | Modify | Add `bootstrapTreatment` and `bootstrap_config` metadata. |
| `src/platform/supervision/providerCapabilityProfiles.ts` | Modify | Replace provider-name hard-coding with config-backed resolution. |
| `src/platform/supervision/providerCapabilityBootstrapConfig.ts` | Create | Parse, validate, normalize, and diagnose YAML config. |
| `package.json` / `package-lock.json` | Modify if needed | Add a real YAML parser dependency rather than inventing ad hoc parsing. |
| `tests/supervision-provider-capability-profiles.test.tsx` | Modify | Default-neutral and fixture-backed strong/weak tests. |
| `tests/provider-capability-bootstrap-config.test.tsx` | Create | YAML validation and fail-closed behavior. |
| `docs/deployment.md` | Modify | Document config path and environment override. |
| `docs/specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md` | Modify | Keep normative bootstrap contract aligned. |
| `docs/plans/PLAN-075-real-provider-orchestrator-integration.md` | Modify | Mark hard-coded bootstrap as superseded by this rollout. |

## Testing Strategy

- No config file: all providers resolve `bootstrapTreatment: 'default'` and
  `confidenceLevel: 'unknown'`.
- Valid config: only exact/broad YAML matches receive `strong_agent` or
  `weak_worker` treatment.
- Invalid config: resolver fails closed to default/unknown and emits diagnostic
  evidence, never a strong/weak grant.
- Provider catalog/runtime delivery tests prove rich delivery does not classify
  capability.
- Policy tests prove configured weak-worker profiles clamp dials and configured
  strong-agent candidates still respect FR-19 until evaluated/observed evidence
  exists.
- Preset/temp-participant tests prove demo flows depend on explicit fixture
  config, not provider-name assumptions.
- Attestation-boundary tests prove a `catalog_only` YAML rule can grant
  `strong_agent` or `weak_worker` initial treatment but cannot bypass the
  FR-19 floor on `broad_write` or unrestricted `outcome_delegation`, and that
  attempts to set `evaluated` or `observed` in YAML are rejected.
- Selector-precedence tests prove most-specific match wins, ties broken by
  file order, and diagnostics record losing tie rules.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| YAML becomes a hidden privilege escalation surface | High | Fail closed, validate allowed fields, expose matched rule id/reason, and keep FR-19 floors. |
| Tests accidentally depend on developer-local config | High | Unit tests pass fixture config explicitly and run absent-config cases first. |
| Provider catalog facts creep back into capability treatment | Medium | Static/test coverage forbids provider-name classification and verifies delivery/capability split. |
| Broad provider-only rules classify too much | Medium | Treat omitted model/control as explicit broad rules, show that breadth in diagnostics, and require reason text. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-28 | Plan opened after review found hard-coded strong/weak provider bootstrap unacceptable; target changed to explicit YAML-only initial treatment. |
| 2026-04-28 | Review close-out: added `instance` to selector axes, declared YAML attestation as ADR-082 §3 evidence source #4 under FR-19 floor, defined selector precedence and process-restart reload behavior, scoped a Migration section with example fixture + release-notes guidance, scheduled re-run of PLAN-075 Phase 5.4 / 6.4 live smoke under YAML config (Task 3.5), bound Phase 4 diagnostic surface to logs + supervision evidence rather than a new UI panel, and added attestation-boundary + selector-precedence test categories. |

---

*Created: 2026-04-28*
*Author: Codex*
