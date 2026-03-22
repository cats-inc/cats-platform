# PLAN-012: First-Run Setup Wizard and Boss Cat Bootstrap

Status: Draft (Aligned with SPEC-027)

## Scope

Implement the onboarding direction defined in
[SPEC-012](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
without turning the first-run experience into a cloud-auth or SaaS login flow.

This plan covers the first implementation path for:

- detecting an uninitialized local environment
- routing the operator into `/setup`
- capturing minimal owner profile data
- checking `cats-runtime` readiness
- auto-provisioning the initial neutral default `Boss Cat` when needed
- finishing in the normal `/new` draft flow without auto-creating a persisted
  first chat

This plan is explicitly **not** a full authentication plan, a full transport
binding plan, or a full desktop-packaging plan.

## Hard Constraints

- Do not frame first-run as `login` unless a future auth-specific decision
  explicitly changes the product model.
- Do not require users to understand channel registry, Cats registry, or
  orchestration internals before they can complete setup.
- Do not require users to create, choose, or name a custom Cat during setup.
- Keep transport setup optional or deferrable in the first slice.
- Keep the setup path compatible with current route-driven navigation.
- Keep `cats-runtime` as the only runtime boundary.

## Phases

### Phase 1: Setup State and Readiness Contract

- [ ] Define the minimum readiness conditions for a usable first-run state.
- [ ] Decide how setup completion is persisted:
      - simple boolean
      - structured setup state
      - readiness checklist
- [ ] Define the partial-setup resume behavior for interrupted onboarding.
- [ ] Freeze the rule that uninitialized environments land in `/setup` instead
      of normal chat routes.

**Deliverables**: approved readiness contract and route-gating rules.

### Phase 2: Store and API Seams

- [ ] Extend persisted state to record setup completion and minimal onboarding
      progress.
- [ ] Add or refine product APIs needed to write:
      - owner profile basics
      - default Boss Cat bootstrap or later assignment
      - first-run completion state
- [ ] Reuse or extend runtime-health APIs for the setup readiness check.
- [ ] Keep setup writes compatible with the current Cats registry and Boss Cat
      model.

**Deliverables**: persistence and API support for onboarding state.

### Phase 3: Renderer Setup Shell and Routing

- [ ] Add a `/setup` route and a setup-shell renderer surface.
- [ ] Ensure uninitialized app starts land in setup instead of normal chat
      entry.
- [ ] Ensure setup-complete app starts bypass setup and enter normal chat
      routes.
- [ ] Decide whether the first slice needs one route with internal steps or
      multiple setup subroutes.

**Deliverables**: routeable setup shell with correct gating behavior.

### Phase 4: Wizard Steps

- [ ] Add the Welcome step.
- [ ] Add the Runtime Check step with clear remediation messaging.
- [ ] Add the Owner Profile step.
- [ ] Add the default Boss Cat bootstrap step:
      - ensure one current Boss Cat exists
      - auto-provision a neutral default Boss Cat when needed
      - do not require Cat naming or full personalization

**Deliverables**: guided setup flow with the core onboarding steps in place.

### Phase 5: Completion and First Chat Bootstrap

- [ ] Mark setup complete only after the minimum required state exists.
- [ ] Route the operator directly into `/new` after setup.
- [ ] Keep the current `Boss Cat` as the default visible chat entrypoint in
      that draft flow.
- [ ] Do not auto-create or auto-select a first persisted chat during setup.
- [ ] Optionally offer post-setup prompts such as renaming the Boss Cat or
      adding another Cat without blocking first use.

**Deliverables**: smooth first-run handoff into the normal draft-first product flow.

### Phase 6: Validation and Cleanup

- [ ] Add tests for setup gating when the environment is uninitialized.
- [ ] Add tests for bypassing setup once initialization is complete.
- [ ] Add tests for Boss Cat creation or selection during onboarding.
- [ ] Update architecture, requirements, and progress docs once implementation
      starts landing.

**Deliverables**: validated onboarding flow and aligned documentation.

## Candidate Code Areas

| Area | Action | Why |
|------|--------|-----|
| `src/shared/app-shell.ts` | Review / extend | Current shell contract needs setup readiness or onboarding state |
| `src/shared/core.ts` | Review | Owner profile and Boss Cat bootstrap need clean shared-core alignment |
| `src/products/chat/state/store.ts` | Modify | Persist onboarding state and setup completion |
| `src/app/server/index.ts` | Extend | Add or refine setup-related reads and writes |
| `src/products/chat/renderer/App.tsx` | Refactor carefully | Add setup routing, setup shell, and first-run gating |
| `src/products/chat/renderer/api.ts` | Extend | Support onboarding writes and readiness checks |
| `tests/` | Expand | Cover route gating, setup persistence, and Boss Cat bootstrap |
| `docs/` | Update | Keep onboarding direction aligned once implementation begins |

## Validation

- A brand-new environment lands in setup instead of an unhelpful empty chat UI.
- The setup flow does not read like an auth or SaaS login flow.
- The operator can finish setup without understanding internal orchestration
  structure.
- Setup completion leaves the app with a current Boss Cat and a usable `/new`
  draft path.
- Returning app launches skip setup once initialization is complete.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Setup state becomes too simplistic and blocks future resumable onboarding | Medium | Prefer a structured readiness model if the first implementation needs more than one required step |
| Runtime remediation becomes too technical for new users | High | Keep the first wizard copy simple and defer advanced diagnostics to later support surfaces |
| First-run flow becomes too long and discouraging | High | Make transport setup skippable and keep the required path minimal |
| Setup quietly becomes a hidden proxy for broader Cat registry complexity | Medium | Keep Cat naming and richer personalization out of the required setup path |
| Setup and normal settings start to duplicate each other too early | Medium | Treat setup as the first-run path, not a replacement for the later settings system |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement SPEC-012 / PLAN-012. Add a first-run setup wizard at `/setup`
> instead of a login-first flow. Detect uninitialized local environments, guide
> the operator through welcome, runtime readiness, and owner profile, then
> auto-provision a neutral default Boss Cat if needed and land them directly in
> the normal `/new` draft flow, without auto-creating a first persisted chat.
> Keep transport setup optional and preserve the existing `cats-runtime`
> boundary.

---

*Last updated: 2026-03-23*
