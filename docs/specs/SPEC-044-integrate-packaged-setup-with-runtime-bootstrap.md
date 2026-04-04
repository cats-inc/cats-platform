# SPEC-044: Integrate Packaged Setup with Runtime Bootstrap

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Owner** | Codex |
| **Reviewer** | User / packaging + runtime workstreams |

## Summary

`cats-platform` already owns the packaged setup UI and Electron host bootstrap
surfaces, while `cats-runtime` already owns provider readiness and bootstrap
config materialization. What is missing is the integration step that makes the
packaged product finish setup only after runtime bootstrap has actually been
applied.

This spec defines that missing integration layer. The packaged app must keep a
single product-owned setup UI, but that UI must drive `cats-runtime`
bootstrap through headless runtime APIs so a runtime-owned usable config exists
before the product enters the ready chat flow.

## Goals

- make packaged setup produce a runtime-owned usable provider config before the
  product declares setup complete
- keep one packaged setup UI in `cats-platform`
- keep `cats-runtime` as the authority for readiness, bootstrap state, and
  config materialization
- keep Electron host-owned install/check/resume flows above the runtime
  boundary
- remove the current state where owner/product setup may finish while runtime
  bootstrap still has not been applied

## Non-Goals

- replacing the runtime's standalone `/setup` UI for direct operators
- embedding the runtime's HTML setup page inside the packaged app
- making `cats-platform` generate `providers.yaml` directly
- shipping every future provider pack in the first implementation slice
- reworking the broader Chat/Work/Code platform routing beyond what setup gating
  needs

## User Stories

- As a packaged-app user, I want the setup wizard to leave me with a working
  runtime path, not just saved owner preferences.
- As a packaged-app user, I want provider install or repair steps to stay in
  the packaged setup flow rather than being redirected into a separate runtime
  app.
- As a standalone runtime operator, I want `cats-runtime /setup` to remain
  available even if the packaged app chooses not to show it.
- As a maintainer, I want runtime config generation to stay inside
  `cats-runtime` so the product host does not duplicate provider config logic.

## Requirements

### Functional Requirements

1. Packaged setup shall use `cats-platform /setup` as the only primary setup UI
   shown to packaged end users.
2. The packaged setup flow shall query `cats-runtime` bootstrap state through
   runtime-owned APIs before setup completion.
3. The packaged setup flow shall refresh runtime readiness after host-managed
   install/check helpers complete.
4. The packaged setup flow shall ask `cats-runtime` to materialize runtime
   config through a runtime-owned apply API rather than writing
   `providers.yaml` directly.
5. Completing packaged setup shall require all of the following:
   - owner/product onboarding data saved
   - at least one usable provider path selected under product policy
   - runtime-owned config apply completed successfully
   - runtime bootstrap exited or otherwise reported a ready runtime-owned
     provider path
6. `setupCompleteAt` shall not be written until the runtime-owned apply step
   succeeds.
7. If setup is interrupted after install/check work but before runtime apply,
   the packaged setup flow shall resume from the runtime/bootstrap state rather
   than starting over.
8. The packaged setup UI shall surface at least these runtime/bootstrap
   sub-states:
   - no usable provider path yet
   - install/check needed
   - provider ready to apply
   - apply in progress
   - runtime ready
   - recovery or remediation required
9. The packaged setup flow shall keep an explicit advanced or recovery route
   that can open standalone runtime diagnostics or runtime setup, but that path
   shall not replace the main packaged setup experience.
10. `cats-runtime` bootstrap APIs consumed by packaged setup shall be stable
    enough for host/product orchestration and not treated as dashboard-only
    implementation details.
11. The first implementation slice shall support runtime-owned config
    materialization for provider paths already representable by the current
    bootstrap/apply contract.
12. The integration design shall reserve a clear extension point for API/local/
    agent-backed runtime targets so later packaged setup paths still converge
    on runtime-owned config apply rather than creating a second writer.

### Non-Functional Requirements

- packaged setup should keep a single user-facing narrative even when multiple
  layers participate behind the scenes
- runtime config writes should remain idempotent and attributable to the
  runtime contract
- setup recovery should prefer machine-readable state from the runtime or host
  over inference from UI-only local state
- the packaged app should not require users to know what `providers.yaml` is

## Design Overview

```text
Electron host starts
        |
        v
Desktop bootstrap page
        |
        v
cats-platform /setup
        |
        +--> host helper install/check/resume when needed
        |
        +--> runtime GET /setup-state
        +--> runtime POST /setup-scan
        +--> runtime POST /setup-apply
        |
        v
runtime exits bootstrap / reports ready provider path
        |
        v
cats-platform persists setupCompleteAt
        |
        v
ready_for_chat
```

## Detailed Flow

### Phase A: Host and Runtime Bootstrap Readiness

- Electron host starts `cats-runtime` with the packaged runtime config path.
- If no usable runtime config exists, `cats-runtime` enters bootstrap mode but
  still exposes bootstrap/readiness APIs.
- The host and packaged setup UI read that runtime state rather than assuming
  runtime readiness from process liveness alone.

### Phase B: Product Setup and Provider Choice

- `cats-platform /setup` collects owner/product onboarding inputs.
- The same setup surface also shows provider readiness or install/remediation
  state derived from runtime/bootstrap plus host helper outcomes.
- The packaged UI may invoke host-managed setup helpers where runtime install
  knowledge needs packaged execution.

### Phase C: Runtime-Owned Config Materialization

- Once a provider path is ready under packaged setup policy,
  `cats-platform` calls the runtime-owned apply endpoint.
- `cats-runtime` writes the runtime config artifact and exits bootstrap mode
  when appropriate.
- The packaged setup flow re-reads runtime readiness and only then considers
  setup completion eligible.

### Phase D: Setup Completion and Entry

- `cats-platform` persists `setupCompleteAt` only after the runtime-owned apply
  step and readiness re-check succeed.
- The packaged host then resolves into `ready_for_chat`.
- If readiness regresses after onboarding was partially completed, the host
  resolves into a remediation/setup phase rather than a ready chat phase.

## Current Gap Being Closed

Today the system still allows this mismatch:

1. runtime boots in bootstrap mode because no usable runtime config exists
2. packaged product setup can still persist owner-facing setup completion
3. runtime config apply has not occurred yet

This spec closes that mismatch by moving runtime apply into the canonical
packaged setup completion chain.

## Dependencies

- [ADR-021](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [SPEC-023](./SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [cats-runtime ADR-014](../../../cats-runtime/docs/decisions/014-keep-lightweight-provider-setup-and-diagnostics-in-cats-runtime.md)

## Open Questions

- [ ] Should the first implementation slice block setup completion until a
      ready local/CLI path exists, or should it also land the first
      runtime-owned API-baseline config apply in the same slice?
      - this is the current implementation-slice scope blocker referenced by
        [PLAN-033](../plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md)
- [ ] Should the packaged host expose "Open Runtime Setup" only under advanced
      recovery, or also as an explicit operator shortcut from the setup wizard?

## References

- [PLAN-033](../plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md)
- [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [SPEC-023](./SPEC-023-packaged-setup-wizard-and-provider-installation.md)

---

*Created: 2026-03-30*  
*Author: Codex*  
*Related Plan: [PLAN-033](../plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md)*
