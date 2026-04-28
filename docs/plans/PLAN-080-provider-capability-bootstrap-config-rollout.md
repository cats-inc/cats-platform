# PLAN-080: Provider Capability Bootstrap Config Rollout

> Replace hard-coded provider-name strong/weak bootstrap with an explicit
> operator-owned YAML capability bootstrap registry.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Complete |
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

- Ship a checked-in `config/provider-capability-bootstrap.yaml.example`
  covering Claude / Codex / Ollama with the same treatment the hard-coded
  bootstrap produced today, plus a clear comment that operators MUST opt in by
  copying it to the active config path (it is not loaded automatically).
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
  - id: claude-native-sonnet-strong-candidate
    selector:
      provider: claude
      instance: native
      model: sonnet
      control: default
    initialTreatment: strong_agent
    confidenceLevel: catalog_only
    reason: Operator-approved strong-agent candidate for supervised chat/work demos.
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

- YAML profiles are treatment grants. `initialTreatment` is exactly one of
  `strong_agent` or `weak_worker`. A target that needs no differential
  treatment must omit the profile; YAML must not encode
  `initialTreatment: default`.
- YAML treatment grants always use `confidenceLevel: catalog_only`.
  `unknown` is the resolver output for absent, invalid, or unmatched config;
  `evaluated` and `observed` require eval/history evidence. YAML must not
  encode any of those levels.
- `provider` is required. `instance`, `model`, and `control` are each optional
  and act as additional explicit narrowing of the rule. Selectors must use the
  same `ProviderCapabilityTarget` axes (`provider`, `instance`, `model`,
  `control`) that `providerCapabilityProfiles.ts` already declares; PLAN-080
  must not invent a parallel axis set.
- matching is normalized but not inferred. No code path may special-case
  `claude`, `codex`, `ollama`, `local`, or future providers by name.
- each matching rule creates `bootstrap_config` evidence with rule id, config
  version/path, timestamp, and reason.
- default/unknown resolutions never create capability evidence and always keep
  `confidenceSources: []`.
- invalid config fails closed to default/unknown and emits a diagnostic event
  (see Diagnostic Destination below); it must not silently grant strong/weak
  treatment.
- duplicate rule ids are a validation error because rule id is the stable audit
  identity for `bootstrap_config` evidence. Duplicate ids make the entire config
  fail closed; there is no last-wins behavior for ids.
- a YAML rule's authorization weight is operator-attestation-equivalent: it
  shall be bounded by the same FR-19 floor that ADR-082 §3 evidence source #4
  (operator override) enforces — it cannot grant `broad_write` or unrestricted
  `outcome_delegation`, and `evaluated` / `observed` confidence still require
  real eval/history evidence and may not be set in this YAML. However, the
  evidence source kind recorded on the resolved profile and in policy
  snapshots is `bootstrap_config` (a startup attestation kind), distinct from
  `operator_override` (a runtime override event). Source-conflict resolution
  and FR-19 audit logic must treat the two kinds as different sources that
  share an authorization ceiling, not as the same source.
- implementation may add a small YAML parser dependency if none exists; do not
  silently downgrade this contract to JSON or an ad hoc line parser.

### Control Selector Canonicalization

The `control` selector is a normalized control-profile key derived from
`ProviderCapabilityTarget.modelSelection` after runtime reconciliation and
unsupported-control filtering:

- `control: default` matches only targets with no persistent control overrides.
- non-default control keys serialize persistent key/value pairs in stable key
  order, for example `reasoning_effort=high;tool_mode=plan`. Product labels and
  display text are never part of the key.
- request-scoped controls, transient UI state, unsupported controls, and values
  rejected by the provider adapter are excluded before key generation.
- the resolver compares only this canonical string. Implementations should keep
  canonicalization in a small helper so Chat, Work, Code, tests, and operator
  examples cannot drift.

### Selector Precedence

When multiple rules match a target, the most-specific selector wins.
Specificity is the count of explicit narrowing keys among `instance`,
`model`, and `control` (since `provider` is required by every rule, it does
not contribute to the count). Any rule with N narrowing keys beats any rule
with N-1 narrowing keys regardless of which combination is used; for example
`provider + model` (1 narrowing key) and `provider + control` (1 narrowing
key) are tied with each other but both lose to `provider + instance + model`
(2 narrowing keys). Ties at the same count are broken by file order (later
rule wins). Diagnostics emit the matched rule id and any rules that lost a
tie, so operators can spot accidental shadowing.

### Reload Behavior

The resolver reads YAML once at process startup and caches the parsed config.
Live edits do not take effect until the platform process restarts. This keeps
provider treatment deterministic across a session and avoids mid-run policy
drift. A future plan may add file-watch reload, but only after a structured
audit-log entry pattern is in place to record every reload event with its
matched-rule diff.

### Diagnostic Destination

Diagnostics from this resolver — missing config, parse failure, duplicate rule
id, invalid treatment, invalid confidence, ambiguous matches, losing tie rules,
matched rule id / treatment / confidence / reason — are recorded as
**structured platform log events plus `SupervisionDiagnosticRecord` records**.
The minimum record shape is:

```ts
interface SupervisionDiagnosticRecord {
  id: string;
  kind: 'provider_capability_bootstrap_config';
  severity: 'info' | 'warning' | 'error';
  code:
    | 'missing_config'
    | 'parse_failed'
    | 'duplicate_rule_id'
    | 'invalid_treatment'
    | 'invalid_confidence'
    | 'ambiguous_match'
    | 'losing_tie_rule'
    | 'matched_rule';
  observedAt: string;
  configPath?: string;
  ruleIds?: string[];
  target?: ProviderCapabilityTarget;
  message: string;
}
```

These diagnostics are explicitly **not** capability evidence: the resolved
profile's
`confidenceSources` array stays empty for default/unknown resolutions and
contains only the matched rule's `bootstrap_config` evidence for resolved
strong/weak treatment. No diagnostic event ever appears in
`confidenceSources`, and no diagnostic-only path ever upgrades a profile
above default/unknown.

## Implementation Phases

### Phase 1: Contract and fixture

- [x] Task 1.1: Extend supervision contracts with
      `bootstrapTreatment`, `bootstrap_config` source metadata, and
      `SupervisionDiagnosticRecord`.
- [x] Task 1.2: Add a checked-in example fixture for
      `provider-capability-bootstrap.yaml` under tests or docs; do not ship it
      as an active default config.
- [x] Task 1.3: Add parser/validator tests proving absent config, invalid
      config, and unmatched targets all resolve to default/unknown.
- [x] Task 1.4: Define and test the canonical control key helper that turns
      reconciled `modelSelection.controls` into `default` or a stable
      non-default control string before YAML matching.

**Deliverables**: Contract shape and failing-closed config validation are
defined before resolver behavior changes.

### Phase 2: Resolver replacement

- [x] Task 2.1: Replace the hard-coded `classifyProviderCapability(provider)`
      mapping with a YAML-backed resolver.
- [x] Task 2.2: Keep provider/model catalogs available for display and adapter
      inventory, but prevent catalog facts from assigning strong/weak treatment
      without a matched YAML rule.
- [x] Task 2.3: Add diagnostics for missing config, parse failure, duplicate
      rule id, invalid treatment, invalid confidence, and ambiguous matches.
      Duplicate rule id is a fatal validation error for the whole config, not a
      warning or last-wins case.

**Deliverables**: No provider receives initial differential treatment unless
the YAML explicitly grants it.

### Phase 3: Policy and product verification

- [x] Task 3.1: Update capability profile tests so `claude`, `codex`,
      `ollama`, and unknown providers all resolve default/unknown without test
      config.
- [x] Task 3.2: Add fixture-backed tests proving configured `claude` / `codex`
      can appear as strong-agent candidates and configured `ollama` can appear
      as a weak-worker candidate.
- [x] Task 3.3: Update Chat/Work/Code preset capability-review tests to use
      explicit fixture config when they need a strong or weak demo path.
- [x] Task 3.4: Verify temp participants resolve capability through their bound
      execution target plus YAML rule without promotion to durable Cats.
- [x] Task 3.5: Re-run PLAN-075 live Claude/Codex smoke under the PLAN-080
      YAML fixture for **all three** product paths covered by PLAN-075
      acceptance: one Chat turn, one Work supervised run (Phase 5.4), and one
      Code task/relay (Phase 6.4). Slices 64 / 65 covered Work and Code under
      the old hard-coded bootstrap; the Chat live path was never gated by a
      `CATS_*_LIVE_PROVIDER_SMOKE` env var, so PLAN-080 closure must add a
      `CATS_CHAT_LIVE_PROVIDER_SMOKE` gate (or equivalent) and exercise it
      under the YAML fixture. PLAN-080 closure requires proving every product
      path still works when strong-agent treatment comes from explicit YAML
      rather than provider-name special-casing. Record each re-run in the
      PLAN-075 progress log.

**Deliverables**: Product demos become deterministic because the fixture says
who is strong/weak; defaults remain neutral.

### Phase 4: Documentation and operator surface

- [x] Task 4.1: Document the YAML path and schema in setup/deployment docs.
- [x] Task 4.2: Emit operator-facing diagnostic events covering matched rule
      id, treatment, confidence, reason, and any losing tie rules. In this
      slice the surface is the structured platform log plus
      `SupervisionDiagnosticRecord` persistence (no new UI panel, and no
      evidence/snapshot record reuse). A future plan may add an admin UI editor
      that consumes the same diagnostic records.
- [x] Task 4.3: Record that a UI/admin editor is follow-up scope, not part of
      this rollout.

**Deliverables**: Operators can see why a provider/model/control target received
initial treatment even without an editor.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/platform/supervision/contracts.ts` | Modify | Add `bootstrapTreatment`, `bootstrap_config` metadata, and `SupervisionDiagnosticRecord`. |
| `src/platform/supervision/providerCapabilityProfiles.ts` | Modify | Replace provider-name hard-coding with config-backed resolution. |
| `src/platform/supervision/providerCapabilityBootstrapConfig.ts` | Create | Parse, validate, normalize, and diagnose YAML config. |
| `src/platform/supervision/providerCapabilityControlKey.ts` | Create | Canonicalize reconciled `modelSelection.controls` into the selector `control` key. |
| `src/platform/supervision/providerCapabilityBootstrapDiagnostics.ts` | Create | Persist `SupervisionDiagnosticRecord` records and mirror them to structured platform logs. |
| `package.json` / `package-lock.json` | Modify if needed | Add a real YAML parser dependency and add `smoke:live:chat`; update `smoke:live:providers` to include Chat/Work/Code. |
| `src/config.ts` | Modify | Add active provider capability bootstrap config path and env override. |
| `src/app/server/dependencies.ts` / `src/app/server/contracts.ts` | Modify | Load active YAML once at server startup and retain diagnostics. |
| `src/products/chat/state/runtime-dispatch/**` / `src/products/chat/api/**` | Modify | Pass the active bootstrap config into Chat provider-agent observation construction. |
| `tests/supervision-provider-capability-profiles.test.tsx` | Modify | Default-neutral and fixture-backed strong/weak tests. |
| `tests/provider-capability-bootstrap-config.test.tsx` | Create | YAML validation, fatal duplicate ids, control key normalization, and fail-closed behavior. |
| `tests/fixtures/provider-capability-bootstrap.yaml` | Create | Checked-in inactive fixture covering Claude / Codex / Ollama for tests and rollout examples. |
| `tests/chat-live-provider-smoke.test.tsx` | Create | Chat live provider smoke gated by `CATS_CHAT_LIVE_PROVIDER_SMOKE` and PLAN-080 YAML fixture. |
| `docs/deployment.md` | Modify | Document config path and environment override. |
| `docs/specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md` | Modify | Keep normative bootstrap contract aligned. |
| `docs/plans/PLAN-075-real-provider-orchestrator-integration.md` | Modify | Mark hard-coded bootstrap as superseded by this rollout. |
| `config/provider-capability-bootstrap.yaml.example` | Create | Operator-ready example covering Claude / Codex / Ollama with the same treatment the hard-coded bootstrap produced; not auto-loaded; opt-in by copying to the active config path. Bundled with the cats-platform package and staged into the packaged Electron host at `<resources>/cats-platform/config/`. |
| `src/shared/bootstrapDiagnostics.ts` (or equivalent first-run/upgrade entry) | Modify | Emit a structured warning event when no provider capability bootstrap config is found, pointing at the example fixture. |
| `cats-platform/PROGRESS.md` | Modify | Add a release-notes-style migration callout for operators who relied on the implicit Claude/Codex strong-agent bootstrap. |

## Testing Strategy

- No config file: all providers resolve `bootstrapTreatment: 'default'` and
  `confidenceLevel: 'unknown'`.
- Valid config: only exact/broad YAML matches receive `strong_agent` or
  `weak_worker` treatment.
- Invalid config: resolver fails closed to default/unknown (empty
  `confidenceSources`) and emits a structured diagnostic event per Diagnostic
  Destination, never a strong/weak grant.
- Invalid config with duplicate rule ids fails closed for the whole config and
  emits `duplicate_rule_id`; it does not choose first-wins or last-wins.
- YAML rules using `initialTreatment: default` or `confidenceLevel: unknown`
  are invalid. Default/unknown is only a resolver result for absent, invalid, or
  unmatched config.
- Provider catalog/runtime delivery tests prove rich delivery does not classify
  capability.
- Policy tests prove configured weak-worker profiles clamp dials and configured
  strong-agent candidates still respect FR-19 until evaluated/observed evidence
  exists.
- Preset/temp-participant tests prove demo flows depend on explicit fixture
  config, not provider-name assumptions.
- Live smoke tests include `CATS_CHAT_LIVE_PROVIDER_SMOKE=1 npm run
  smoke:live:chat`, plus Work/Code live provider smokes, all using the same
  PLAN-080 YAML fixture.
- Attestation-boundary tests prove a `catalog_only` YAML rule can grant
  `strong_agent` or `weak_worker` initial treatment but cannot bypass the
  FR-19 floor on `broad_write` or unrestricted `outcome_delegation`, and that
  attempts to set `evaluated` or `observed` in YAML are rejected.
- Selector-precedence tests prove most-specific match wins, ties broken by
  file order, and diagnostics record losing tie rules.
- Control-key tests prove `default` means no persistent overrides, non-default
  keys are stable sorted serializations of reconciled supported controls, and
  unsupported/transient controls do not affect matching.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| YAML becomes a hidden privilege escalation surface | High | Fail closed, validate allowed fields, expose matched rule id/reason, and keep FR-19 floors. |
| YAML reintroduces a third "catalog default" tier | High | Forbid `initialTreatment: default` and `confidenceLevel: unknown` inside YAML profiles; only absent/invalid/unmatched targets resolve default/unknown. |
| Tests accidentally depend on developer-local config | High | Unit tests pass fixture config explicitly and run absent-config cases first. |
| Provider catalog facts creep back into capability treatment | Medium | Static/test coverage forbids provider-name classification and verifies delivery/capability split. |
| Broad provider-only rules classify too much | Medium | Treat omitted model/control as explicit broad rules, show that breadth in diagnostics, and require reason text. |
| Control selector strings drift across products | Medium | Centralize canonical key generation and require tests for Chat/Work/Code selector fixtures. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-28 | Plan opened after review found hard-coded strong/weak provider bootstrap unacceptable; target changed to explicit YAML-only initial treatment. |
| 2026-04-28 | Review close-out: added `instance` to selector axes, declared YAML attestation as ADR-082 §3 evidence source #4 under FR-19 floor, defined selector precedence and process-restart reload behavior, scoped a Migration section with example fixture + release-notes guidance, scheduled re-run of PLAN-075 Phase 5.4 / 6.4 live smoke under YAML config (Task 3.5), bound Phase 4 diagnostic surface to logs + supervision evidence rather than a new UI panel, and added attestation-boundary + selector-precedence test categories. |
| 2026-04-28 | Review follow-up: extended Task 3.5 to require a Chat live smoke gate alongside Work/Code re-runs (PLAN-075 acceptance covers Chat turn too); split `bootstrap_config` evidence kind from `operator_override` while keeping the FR-19 authorization ceiling shared; rewrote selector precedence to count narrowing keys so non-linear combos (`provider+model`, `provider+control`, etc.) get a defined ordering; added a Diagnostic Destination sub-section pinning diagnostics to log + supervision diagnostic records (never `confidenceSources`); added migration deliverables (example YAML, first-run warning entry, PROGRESS.md callout) to Files Likely; updated `plans/README.md` PLAN-075 status. |
| 2026-04-28 | Review close-out: removed `default` / `unknown` from valid YAML grants so only explicit `strong_agent` / `weak_worker` rules create startup treatment; added Claude to the example fixture; defined canonical `control` selector serialization from reconciled controls; made duplicate rule ids fatal; replaced vague supervision evidence reuse with a concrete `SupervisionDiagnosticRecord` owner; added Chat live smoke files/scripts to the delivery list; added tests and risks for duplicate ids, forbidden YAML defaults, live Chat smoke, and control-key drift. |
| 2026-04-28 | Implementation slice 1: added `bootstrap_config` evidence metadata, `SupervisionDiagnosticRecord`, canonical control-key helper, YAML parser/validator, explicit-config resolver, fatal duplicate-id handling, and tests proving no-config default/unknown plus configured strong/weak behavior. Validation: targeted supervision tests and `npm run typecheck` passed. |
| 2026-04-28 | Implementation slice 2: added active config path resolution, server startup YAML loading, retained bootstrap diagnostics, and Chat dispatch plumbing so provider-agent observations receive the active config. Validation: Chat/config targeted tests, `npm run typecheck`, `npm run build:server`, and `node --test tests/config.test.js` passed. |
| 2026-04-28 | Implementation slice 3: added operator-facing example YAML, deployment guidance for `CATS_PROVIDER_CAPABILITY_BOOTSTRAP_CONFIG`, YAML validity/fail-closed rules, and a PROGRESS migration callout. |
| 2026-04-28 | Implementation slice 4: added a gated Chat live provider smoke (`CATS_CHAT_LIVE_PROVIDER_SMOKE=1 npm run smoke:live:chat`) and included it in `npm run smoke:live:providers`; default execution loads and skips the gate unless the live runtime/provider environment is explicitly enabled. |
| 2026-04-28 | Implementation slice 5: removed provider-name hard-coding from shared Chat/Work/Code draft preset capability review; default targets now show conservative policy unless the review is given an explicit PLAN-080 bootstrap treatment fixture. |
| 2026-04-28 | Implementation slice 6: added a provider capability bootstrap diagnostic sink that emits structured platform log events, persists `SupervisionDiagnosticRecord` records, and receives Chat matched-rule diagnostics during provider-agent observation preparation. |
| 2026-04-28 | Implementation slice 7: documented that a UI/admin editor for provider capability bootstrap is follow-up scope; PLAN-080 keeps YAML as the operator surface and diagnostics as the audit trail. |
| 2026-04-28 | Implementation slice 8: wired Chat, Work, and Code live provider smoke gates to the same PLAN-080 YAML fixture path; default smoke execution still skips live providers unless each `CATS_*_LIVE_PROVIDER_SMOKE=1` gate is explicitly enabled. |
| 2026-04-28 | Implementation slice 9: aligned live smoke targets with available runtime targets (`claude/native/sonnet`, `codex/native/gpt-5.4`) and re-ran live gates. Chat and Code passed with Claude+Codex. Work passed with Codex+Claude after the Codex target was run in sandbox/no-cwd mode and the Work live smoke order was set to run Codex first. |
| 2026-04-28 | Implementation slice 10: completed Task 3.5 by running `CATS_CHAT_LIVE_PROVIDER_SMOKE=1 CATS_WORK_LIVE_PROVIDER_SMOKE=1 CATS_CODE_LIVE_PROVIDER_SMOKE=1 npm run smoke:live:providers`; Chat, Work, and Code all passed under the PLAN-080 YAML fixture with Claude/Codex live targets, and runtime sessions were closed after the run. |

---

*Created: 2026-04-28*
*Author: Codex*
