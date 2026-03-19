# ADR-021: Keep Packaged Setup and Provider Installation in the Host

> Let the packaged Cats host own provider installation orchestration, while the
> renderer stays UI-only and `cats-runtime` stays the runtime boundary.

## Status

Accepted

## Context

The product direction is now explicit:

- Cats should be installable like a normal desktop product
- the app itself should open without requiring users to install Node.js,
  Python, or a local development stack first
- first-run setup should guide the user through provider readiness instead of
  pushing them into manual shell setup

At the same time, the current architecture already fixes several boundaries:

- the renderer is React/Vite and should not become a shell/process manager
- `cats-inc` remains the product-facing boundary
- `cats-runtime` remains the runtime boundary
- `environment-bootstrap` now contains valuable provider install/check logic
  and platform edge-case knowledge, but its top-level scripts are still
  developer-oriented orchestration

That leaves a packaging/setup question:

- should the renderer run scripts directly?
- should `cats-runtime` own provider installation?
- should the packaged host own install/check orchestration and feed progress
  back into the product UI?

## Decision

Packaged setup and provider installation will be owned by the packaged Cats
host, with Electron `main` as the default implementation direction for the
consumer desktop path.

This decision includes:

1. The packaged host owns provider install, verify, resume, and privilege
   orchestration.
   - Electron `main` is the default first implementation direction; a separate
     setup helper binary is optional later, not required up front
2. The renderer remains UI-only for setup.
   - it requests actions
   - it displays progress, failure, and recovery states
   - it does not spawn shell commands or provider scripts directly
3. `cats-runtime` remains the runtime boundary and does not become the owner of
   provider installation execution.
4. App installation and provider installation are separate concerns.
   - the Cats product must be able to open before optional CLI providers are
     installed
   - API-backed providers remain the recommended baseline path
5. `environment-bootstrap` is reused at the provider-primitive level rather
   than by exposing its full developer-facing install orchestration directly to
   end users.
6. Long-running and interruptible setup actions such as UAC elevation, sudo,
   relaunch, restart, Docker warm-up, or first WSL boot are host-managed flows
   that must be resumable.

## Consequences

### Positive

- preserves the current renderer/product/runtime boundaries
- keeps shell execution and privilege handling out of the renderer
- avoids overloading `cats-runtime` with installer responsibilities
- allows the packaged product to reuse `environment-bootstrap` knowledge
  without inheriting its developer-oriented UX directly
- gives one place to manage resume, restart, and privileged setup behavior

### Negative

- Electron `main` (or a later equivalent host) now needs a real setup and
  progress bridge, not just simple process supervision
- host-side setup state and resume logic become a first-class product concern
- packaging must bundle or otherwise resolve the provider install/check assets
  the host needs

### Neutral

- this ADR does not remove the technical self-hosted npm path
- this ADR does not require every provider to be installable in the first
  packaged release
- this ADR does not force all provider setup into first-run; some providers may
  remain post-setup options

## Alternatives Considered

### Alternative 1: Let the Renderer Execute Provider Scripts Directly

- **Pros**: fewer layers on paper
- **Cons**: pushes shell execution, privilege handling, and resume logic into
  a UI process that should not own them
- **Why rejected**: the renderer should stay focused on product UI

### Alternative 2: Let `cats-runtime` Own Provider Installation

- **Pros**: installer metadata and runtime topology appear closer together
- **Cons**: turns the runtime into an installer/process orchestrator instead of
  keeping it focused on execution-time behavior
- **Why rejected**: runtime ownership should stop at runtime readiness and
  provider execution, not packaged onboarding orchestration

### Alternative 3: Expose `environment-bootstrap` Full Install Scripts as the
End-User Setup Flow

- **Pros**: fast reuse of existing automation
- **Cons**: the current top-level scripts are aimed at developer workstation
  setup, not minimal product onboarding
- **Why rejected**: the product needs guided, selective, resumable setup rather
  than a developer full-install experience

### Alternative 4: Require All Provider Installation to Stay Manual

- **Pros**: avoids packaged setup complexity
- **Cons**: repeats the same installation pain that made OpenClaw hard to adopt
- **Why rejected**: product direction explicitly prioritizes a low-friction
  install-and-use path

## References

- [ADR-003](./003-electron-host-manages-local-services.md)
- [ADR-013](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [SPEC-023](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [cats-runtime ADR-009](../../../cats-runtime/docs/decisions/009-keep-cats-runtime-separately-packageable-with-app-managed-local-startup.md)
- [environment-bootstrap README](../../../environment-bootstrap/README.md)

---

*Accepted: 2026-03-20*
*Decision makers: user + Codex*
