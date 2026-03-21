# PLAN-012: First-Run Setup Wizard and Boss Cat Bootstrap

Status: Draft (Pending Review)

## Scope

Implement the onboarding direction defined in
[SPEC-012](../specs/SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
without turning the first-run experience into a cloud-auth or SaaS login flow.

This plan covers the first implementation path for:

- detecting an uninitialized local environment
- routing the operator into `/setup`
- capturing minimal owner profile data
- checking `cats-runtime` readiness
- creating or selecting the initial `Boss Cat`
- finishing in a ready first chat

This plan is explicitly **not** a full authentication plan, a full transport
binding plan, or a full desktop-packaging plan.

## Hard Constraints

- Do not frame first-run as `login` unless a future auth-specific decision
  explicitly changes the product model.
- Do not require users to understand channel registry, Cats registry, or
  orchestration internals before they can complete setup.
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
      - Boss Cat selection or creation
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
- [ ] Add the Owner Profile step.
- [ ] Add the Runtime Check step with clear remediation messaging.
- [ ] Add the Boss Cat Setup step:
      - choose existing Cat
      - or create a new Cat and set it as Boss Cat
      - confirm provider and model

**Deliverables**: guided setup flow with the core onboarding steps in place.

### Phase 5: Completion and First Chat Bootstrap

- [ ] Mark setup complete only after the minimum required state exists.
- [ ] Create or open the first ready conversation path with the Boss Cat.
- [ ] Route the operator directly into that first chat after setup.
- [ ] Allow the Boss Cat to greet the user on first entry after completion.

**Deliverables**: smooth first-run handoff into normal product usage.

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
| `src/chat/store.ts` | Modify | Persist onboarding state and setup completion |
| `src/server.ts` | Extend | Add or refine setup-related reads and writes |
| `src/renderer/App.tsx` | Refactor carefully | Add setup routing, setup shell, and first-run gating |
| `src/renderer/api.ts` | Extend | Support onboarding writes and readiness checks |
| `tests/` | Expand | Cover route gating, setup persistence, and Boss Cat bootstrap |
| `docs/` | Update | Keep onboarding direction aligned once implementation begins |

## Validation

- A brand-new environment lands in setup instead of an unhelpful empty chat UI.
- The setup flow does not read like an auth or SaaS login flow.
- The operator can finish setup without understanding internal orchestration
  structure.
- Setup completion leaves the app with a Boss Cat and a usable first chat path.
- Returning app launches skip setup once initialization is complete.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Setup state becomes too simplistic and blocks future resumable onboarding | Medium | Prefer a structured readiness model if the first implementation needs more than one required step |
| Runtime remediation becomes too technical for new users | High | Keep the first wizard copy simple and defer advanced diagnostics to later support surfaces |
| First-run flow becomes too long and discouraging | High | Make transport setup skippable and keep the required path minimal |
| Boss Cat setup becomes a hidden proxy for broader Cat registry complexity | Medium | Limit the step to create/select + provider/model confirmation only |
| Setup and normal settings start to duplicate each other too early | Medium | Treat setup as the first-run path, not a replacement for the later settings system |

## Suggested Handoff Instruction

Use this when delegating implementation:

> Implement SPEC-012 / PLAN-012. Add a first-run setup wizard at `/setup`
> instead of a login-first flow. Detect uninitialized local environments, guide
> the operator through welcome, owner profile, runtime check, and Boss Cat
> setup, then land them directly in the first ready chat. Keep transport setup
> optional and preserve the existing `cats-runtime` boundary.

---

*Last updated: 2026-03-19*

