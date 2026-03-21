# SPEC-012: First-Run Setup Wizard and Boss Cat Bootstrap

Status: Draft (Pending Review)

## Summary

`cats` is moving toward a native-feeling, desktop-first product experience.
That means the first-run experience should not assume the operator already
understands channels, cat registry structure, runtime dependencies, or transport
bindings.

The current product shell can already load chats and settings, but it does not
yet define how a brand-new environment should become ready. The proposed
direction is to add a first-run setup wizard instead of a login-first flow.

That wizard should:

- welcome the user into the product
- capture minimal owner profile setup
- check runtime readiness
- create or select the first `Boss Cat`
- finish by opening the first chat with that Boss Cat

## Goals

- Give new users a guided first-run path instead of dropping them into an
  uninitialized chat.
- Prefer onboarding and readiness setup over account-auth language such as
  `login`.
- Establish one initial `Boss Cat` before normal chat usage begins.
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
- As a first-time operator, I want to create or choose my Boss Cat during setup
  so my first chat has a clear entry identity.
- As an operator, I want the product to open directly into a ready chat after
  setup instead of leaving me in a half-configured state.

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
- The setup flow shall include a `Boss Cat` step where the operator can either:
  - create the first Boss Cat
  - or select an existing Cat as the Boss Cat if one already exists
- The setup flow shall allow the operator to confirm provider and model choices
  for the initial Boss Cat.
- Optional transport setup such as Telegram or LINE bindings shall be deferrable
  or skippable in the first version.
- Completing setup shall leave the environment with:
  - a persisted Boss Cat selection
  - a setup-complete state
  - an initial conversation entry path ready for normal use
- After successful setup, the product shall open directly into the first chat
  with the Boss Cat.
- The Boss Cat should be able to greet the user on first entry after setup.

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
        +--> Owner Profile
        +--> Runtime Check
        +--> Boss Cat Setup
        +--> Done
        |
        v
First chat with Boss Cat
```

## Proposed Flow

### Step 1: Welcome

- headline: "Welcome to Cats Chat" (not "Welcome to Cats")
- brief product introduction
- short explanation of what the product is
- clear CTA to start setup

### Step 2: Owner Profile

- owner display name
- minimal initial preferences or defaults
- enough data to seed future `Know Your Boss` behavior later

### Step 3: Runtime Check

- check whether the runtime is reachable
- display as "Cats Runtime" in the UI (not the internal identifier `cats-runtime`)
- if it is not ready, explain the issue and provide a guided remediation path

### Step 4: Boss Cat Setup

- create or choose the first Boss Cat
- default Boss Cat name: "Smelly"
- set provider and model
- confirm this Cat as the default public orchestrator identity

### Step 5: Done

- show success state
- route directly into the first ready chat
- allow the Boss Cat to greet the user

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
- Should the first version create one initial chat automatically, or should it
  create a ready Boss Cat and open a draft chat that becomes real on first
  message?
- How much transport setup should appear in the first-run flow before it starts
  feeling too heavy?

## References

- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-012](../decisions/012-keep-cat-naming-in-product-apis-and-neutral-terms-in-system-apis.md)
- [Requirements](../requirements.md)
- [Architecture](../architecture.md)
- [ROADMAP](../../ROADMAP.md)
- [PLAN-012](../plans/PLAN-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)

---

*Last updated: 2026-03-19*

