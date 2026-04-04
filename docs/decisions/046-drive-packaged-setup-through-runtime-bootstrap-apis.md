# ADR-046: Drive Packaged Setup through Runtime Bootstrap APIs

> Keep `cats-platform` as the only packaged setup UI, but require it to drive
> runtime-owned bootstrap and config materialization through `cats-runtime`
> APIs rather than treating the runtime's `/setup` page as the packaged
> onboarding surface.

## Status

Accepted

## Date

2026-03-30

## Context

The current desktop host and setup stack already has three distinct layers:

- the Electron host bootstrap page
- the `cats-platform` product setup flow under `/setup`
- the standalone `cats-runtime` setup/bootstrap surface under `/setup`

That split preserved the host/runtime boundary accepted earlier, but the
current packaged flow still has one important gap:

- `cats-runtime` can start in bootstrap mode when no usable `providers.yaml`
  exists
- `cats-platform` can still finish product onboarding and write
  `setupCompleteAt`
- the packaged flow does not yet guarantee that a runtime-owned provider config
  was applied before the product declares setup complete

This leaves the packaged app with an ambiguous first-run story:

- the runtime is the authority for provider topology, provider readiness, and
  provider config materialization
- the host is the authority for packaged helper execution, resume, restart, and
  elevation
- the product UI is the authority for owner-facing onboarding and product entry

The project therefore needs one canonical packaged setup chain that keeps those
boundaries intact while removing the current "setup completed but runtime
bootstrap not actually applied" state.

## Decision

Packaged Cats setup will remain product-owned in `cats-platform`, but it must
drive runtime bootstrap through headless `cats-runtime` APIs rather than by
hand-writing runtime config or by redirecting packaged users into the runtime's
standalone `/setup` page.

This decision includes:

1. `cats-platform /setup` remains the only canonical packaged onboarding UI.
2. `cats-runtime` remains the owner of runtime bootstrap read/write behavior:
   - setup state
   - provider scan
   - provider readiness
   - config apply/materialization
   - bootstrap exit
3. The packaged flow shall call runtime-owned bootstrap APIs for config
   materialization instead of generating `providers.yaml` directly in
   `cats-platform`.
4. `cats-runtime /setup` remains a valid standalone/operator recovery surface,
   but it is not the packaged app's primary onboarding route.
5. Electron host-owned install/check/resume helpers remain above the runtime
   bootstrap layer:
   - install or repair a provider path when needed
   - then refresh runtime bootstrap state
   - then ask the runtime to apply the resulting config
6. Product setup completion shall no longer mean only "owner/Boss Cat info was
   saved." It shall also require a runtime-owned usable provider path to be
   materialized, or an explicitly supported deferral mode defined by spec.
7. The runtime bootstrap API surface must grow as needed so packaged setup can
   cover both already-ready local targets and broader product-supported
   provider paths without falling back to ad hoc config writers in the product.

## Consequences

### Positive

- removes the current ambiguity about who writes `providers.yaml`
- keeps runtime config generation inside the runtime boundary that already owns
  provider topology and readiness logic
- preserves the host's ownership of privileged or resumable install work
- preserves a single packaged setup UI for end users
- keeps the runtime's standalone setup page useful for direct operators and
  recovery without turning it into the packaged product's main UI

### Negative

- `cats-platform` setup must now orchestrate one more stateful dependency:
  runtime bootstrap progress and apply outcomes
- `cats-runtime` bootstrap APIs need to be treated as a first-class packaged
  integration contract, not only a standalone dashboard helper
- setup completion rules become stricter and may require renderer/server flow
  updates

### Neutral

- this ADR does not require embedding runtime HTML inside the product UI
- this ADR does not remove the runtime's own `/setup` page
- this ADR does not require every future provider mode to land in the first
  implementation slice; it only freezes the ownership model

## Alternatives Considered

### Alternative 1: Use `cats-runtime /setup` as the packaged setup UI

- **Pros**: fastest apparent reuse of an existing UI
- **Cons**: collapses product onboarding, host-managed install/resume, and
  runtime bootstrap into one operator-facing page that does not own packaged
  product concepts such as `setupCompleteAt`, owner setup, or platform entry
- **Why rejected**: packaged setup needs one product-owned UI above the runtime
  boundary, not a direct handoff into the runtime's standalone page

### Alternative 2: Keep the current split and let `cats-platform` finish setup
without runtime bootstrap apply

- **Pros**: smallest short-term change
- **Cons**: leaves the packaged app able to claim setup completion without a
  runtime-owned usable provider config
- **Why rejected**: this is the exact ambiguity the new packaged setup path
  needs to remove

### Alternative 3: Let `cats-platform` write `providers.yaml` directly

- **Pros**: simple product-owned implementation on paper
- **Cons**: duplicates runtime config logic and weakens the runtime boundary
- **Why rejected**: provider config materialization belongs to the runtime
  contract, not the product UI layer

## References

- [ADR-003](./003-electron-host-manages-local-services.md)
- [ADR-021](./021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [SPEC-023](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-044](../specs/SPEC-044-integrate-packaged-setup-with-runtime-bootstrap.md)
- [PLAN-033](../plans/PLAN-033-integrate-packaged-setup-with-runtime-bootstrap.md)
- [cats-runtime ADR-014](../../../cats-runtime/docs/decisions/014-keep-lightweight-provider-setup-and-diagnostics-in-cats-runtime.md)

---

*Accepted: 2026-03-30*  
*Decision makers: user + Codex*
