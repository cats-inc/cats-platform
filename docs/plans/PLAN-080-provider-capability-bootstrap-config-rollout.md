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
  - id: codex-gpt-5-4-strong-candidate
    selector:
      provider: codex
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
- `provider` is required. `model` and `control` are optional only as explicit
  broad rules for that provider.
- matching is normalized but not inferred. No code path may special-case
  `claude`, `codex`, `ollama`, `local`, or future providers by name.
- each matching rule creates `bootstrap_config` evidence with rule id, config
  version/path, timestamp, and reason.
- invalid config fails closed to default/unknown and emits a diagnostic; it must
  not silently grant strong/weak treatment.
- implementation may add a small YAML parser dependency if none exists; do not
  silently downgrade this contract to JSON or an ad hoc line parser.

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

**Deliverables**: Product demos become deterministic because the fixture says
who is strong/weak; defaults remain neutral.

### Phase 4: Documentation and operator surface

- [ ] Task 4.1: Document the YAML path and schema in setup/deployment docs.
- [ ] Task 4.2: Add an operator-facing diagnostic summary to existing provider
      capability review surfaces: matched rule id, treatment, confidence, and
      reason.
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

---

*Created: 2026-04-28*
*Author: Codex*
