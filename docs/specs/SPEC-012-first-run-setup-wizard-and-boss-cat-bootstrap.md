# SPEC-012: First-Run Setup Wizard and Boss Cat Bootstrap

Status: In Progress (First Slice Landed)

## Summary

`cats` now has a first delivered setup slice, but the overall onboarding
contract still needs to stay explicit. The first-run experience should not
assume the operator already understands channels, cat registry structure,
runtime dependencies, or transport bindings.

The current product shell now routes uninitialized environments to `/setup`
instead of dropping them into the normal chat shell, and the first slice ships
a three-screen wizard rather than a login-first flow.

That wizard should:

- welcome the user into the product
- capture minimal owner profile setup
- check runtime readiness
- auto-provision a neutral default `Boss Cat` if none exists
- finish by routing the user into the normal `/new` draft flow with the current
  `Boss Cat` as the default visible entrypoint

## Goals

- Give new users a guided first-run path instead of dropping them into an
  uninitialized chat.
- Prefer onboarding and readiness setup over account-auth language such as
  `login`.
- Ensure one initial `Boss Cat` exists before normal chat usage begins without
  forcing Cat design during setup.
- Keep the setup path compatible with future desktop packaging and local
  onboarding.
- Reduce the need for users to understand internal concepts before they can
  start chatting.

## Non-Goals

- Full multi-user authentication
- Cloud identity, SaaS account management, or subscription login
- Shipping Telegram or LINE relay integration in the same slice
- Solving all advanced provider credential management in one pass
- Replacing the broader settings experience after setup is complete

## User Stories

- As a first-time operator, I want the app to guide me through initial setup so
  I can start using it without understanding the whole system first.
- As a first-time operator, I want the product to give me a usable Boss Cat by
  default so I can personalize it later instead of having to design one during
  setup.
- As an operator, I want the product to finish setup by taking me into the
  normal new-chat entry flow instead of leaving me in a half-configured state.

## Requirements

### Functional Requirements

- The product shall detect whether the current environment is uninitialized for
  first-run use.
- When the environment is uninitialized, the renderer shall route the user into
  a setup flow instead of the normal chat entry experience.
- The first-run flow shall be framed as setup or onboarding, not as login.
- The setup flow shall include a welcome step.
- The setup flow shall include an owner-profile step with minimal initial
  identity and preference capture.
- The setup flow shall include a runtime-readiness check for `cats-runtime`.
- The setup flow shall not require the user to create, name, or choose a custom
  Cat before first chat use.
- If no Cat exists when setup reaches completion, the product shall
  auto-provision one neutral default `Boss Cat`.
- The setup flow shall still capture or confirm the provider/model target needed
  for first use, but provider choice must not require Cat identity design.
- Optional transport setup such as Telegram or LINE bindings shall be deferrable
  or skippable in the first version.
- Completing setup shall leave the environment with:
  - a persisted current `Boss Cat`
  - a setup-complete state
  - the normal `/new` draft entry path ready for normal use
- After successful setup, the product shall route the operator into `/new`.
- Setup completion shall not auto-create or auto-select a first persisted chat
  thread.
- The `/new` surface may later include greeting or starter affordances, but
  setup shall not depend on a forced greeting behavior.

### Non-Functional Requirements

- The setup experience should feel more like local onboarding than enterprise
  auth.
- The setup flow should use simple product language and avoid unnecessary
  technical jargon.
- The flow should remain compatible with current route-driven navigation.
- The design should anticipate future Electron-hosted onboarding without
  assuming Electron implementation is already complete.

## Design Overview

```text
Uninitialized app start
        |
        v
      /setup
        |
        +--> Welcome
        +--> Owner Profile + Boss Cat naming
        +--> Provider / Runtime
        +--> Default Boss Cat Bootstrap
        +--> Done
        |
        v
/new draft with Boss Cat as default entrypoint
```

## Proposed Flow

### Step 1: Welcome

- headline: "Welcome to Cats Chat" (not "Welcome to Cats")
- brief product introduction
- short explanation of what the product is
- clear CTA to start setup

### Step 2: Owner Profile and Boss Cat Naming

- owner display name
- optional Boss Cat display-name override, defaulting to `Boss Cat`
- a short hint that the Boss Cat is the personal AI agent coordinating other
  Cats
- enough data to seed future `Know Your Boss` behavior later

### Step 3: Runtime Check / Provider Readiness

- check whether the runtime is reachable
- display as "Cats Runtime" in the UI (not the internal identifier `cats-runtime`)
- if it is not ready, explain the issue and provide a guided remediation path
- capture or confirm the provider/model target that the initial default
  `Boss Cat` will use after bootstrap

### Step 4: Default Boss Cat Bootstrap

- ensure the environment has one current `Boss Cat`
- auto-provision a neutral default `Boss Cat` if none exists
- use the provider/model target chosen during setup or the environment default
- do not force Cat naming, memory authoring, or full persona configuration here

### Step 5: Done

- show success state
- route directly into the normal `/new` draft surface
- do not auto-create or auto-select a first persisted chat thread during setup
- optionally offer later prompts such as:
  - rename your Boss Cat
  - add another Cat
  - personalize memory

When the Boss Cat has not been explicitly named yet, the UI fallback display
name should remain `Boss Cat`.

## Routing Direction

- The preferred entry route for the first slice is `/setup`.
- Additional wizard subroutes may be added later if needed, but they are not
  required to validate the product direction.
- Normal chat routes should remain unavailable as the default landing surface
  until setup is complete.

## Open Questions

- Should setup completion be persisted as a simple boolean, a structured setup
  state object, or a more explicit readiness checklist?
- How much provider configuration should be included in the first wizard slice
  versus deferred to later settings?
- Should `/new` stay fully empty after setup, or should it include a lightweight
  starter prompt while still remaining a draft page?
- How much transport setup should appear in the first-run flow before it starts
  feeling too heavy?

## References

- [ADR-027](../decisions/027-adopt-chat-first-information-architecture-with-default-boss-cat.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-012](../decisions/012-keep-cat-naming-in-product-apis-and-neutral-terms-in-system-apis.md)
- [SPEC-027](./SPEC-027-chat-first-information-architecture-and-default-boss-cat.md)
- [Requirements](../requirements.md)
- [Architecture](../architecture.md)
- [ROADMAP](../../ROADMAP.md)
- [PLAN-012](../plans/PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)

---

*Last updated: 2026-03-23*
