# ADR-115: Bound Bootstrap and Provider Choices by Runtime Selection

## Status

Accepted — 2026-09-16. Implementation and verification are tracked in the shared
[Runtime PLAN-039](../../../cats-runtime/docs/plans/PLAN-039-provider-selection-bootstrap-rollout.md).

## Context

The complete provider example and bundled installer catalog describe everything
Cats supports. Treating either as an active inventory makes startup and refresh
pay for providers the user does not want. It also lets Desktop checks and cached
product pickers disagree with the connected Runtime's configuration.

Standalone Runtime, local Platform development, and packaged Desktop need the
same intent boundary while retaining their existing ownership of execution,
product onboarding, and operating-system installation.

## Decision

1. The connected Runtime's active provider configuration is the sole selection
   authority. Its default path is `~/.cats/runtime/config/providers.yaml`;
   `CATS_RUNTIME_DIR` selects a different Runtime root. Platform and Desktop do
   not maintain another allowlist or expand selection from helper metadata.
2. Selection identifies exact `(provider, backend, instance)` targets. Installed,
   authenticated, or reachable are observations, and cannot change user intent.
   Missing/invalid configuration requires selection/repair. An explicitly empty
   valid configuration is an idle mode that can complete product onboarding.
3. Desktop shows a static supported catalog before provider inventory. It saves
   through `PUT /setup-selection` with `expectedRevision`, then requests bounded
   scans. Runtime's standalone setup uses the same contract. Local Platform
   setup/settings link to that connected Runtime editor.
4. Runtime preserves retained custom commands, credentials references, variants,
   comments, and valid routing. External YAML edits require explicit reload;
   stale editors receive a conflict instead of overwriting a newer file.
5. Desktop provider inventory and provider helpers use Runtime's `nativeSetupTargets` eligibility,
   rather than assuming an instance named `native` is a native host install.
   As clarified by user acceptance on 2026-09-17 (ADR-116), Desktop independently
   checks Node/npm, npm prefix/PATH and GitHub CLI for clean consumer machines;
   their explicit host preparation does not add providers to Runtime selection.
   Ollama checks require a selected loopback local-model target. OpenClaw and API-only
   configurations do not require any installed CLI.
6. Provider helpers acquire an operation receipt for each exact target before work
   starts and release it in `finally`. Client-generated operation IDs make a
   lost admission response recoverable; unsuccessful releases are retried on
   the next inventory refresh, save, or helper invocation. Busy-target changes
   are rejected while non-cancellable provider work remains active. Desktop
   pauses new helpers and waits for running ones before retry/restart, shutdown,
   or update handoff so restarting Runtime cannot discard their admission.
   The three allowlisted Desktop prerequisite helpers participate in host
   draining but do not need a provider receipt or a nonempty selection.
7. Ordinary product selectors are bounded by current selection and usability.
   The server verifies selection on each registry/catalog request; renderer
   caches follow revisions and refresh on focus/visibility or a bounded visible
   timer. Disconnected Runtime state does not authorize stale cached choices.
   Backend-qualified instance values prevent same-name targets from colliding.
8. The superseded `POST /setup-apply` flow and `cli_inventory_gate` policy are
   removed. Runtime/Platform must ship matching contracts; an incompatible
   external Runtime cannot trigger a fallback scan of every supported provider.

This amends ADR-046's scan-then-materialize ordering and SPEC-093's lifecycle
scope. Host-owned installation, sandboxed IPC, and product-owned onboarding stay
in their existing layers. WSL/Docker editor redesign and package publication are
outside this delivery.

## Consequences

- New Code Relay rosters derive from the connected Runtime's selected providers.
  Starting a round revalidates exact targets before creating dispatches. Empty
  or unavailable selection requires setup/reconnection before thread creation.
- Startup and manual refresh spend provider resources only within user intent.
- Newly bundled helpers and newly installed CLIs do not expand active selection.
- Unavailable selected providers remain visible in repair surfaces; deselection
  does not uninstall software or delete history.
- Configuration changes must invalidate jobs/caches and coordinate busy work
  across Runtime and the Desktop host.
- Full native installer validation still needs separate Windows, macOS, and
  Linux evidence; mocked host-platform tests do not replace those runs.

## Alternatives Considered

- **Auto-select detected providers:** detection itself incurs the cost and
  confuses installation with user intent.
- **Separate Desktop/Platform selections:** creates multiple authorities and
  makes remote connections and developer setups behave differently.
- **Copy the full example, then disable providers in UI:** still permits hidden
  startup work and makes every caller responsible for remembering a second filter.

## References

- [Runtime ADR-039](../../../cats-runtime/docs/decisions/039-use-selected-provider-config-as-the-resource-boundary.md)
- [Runtime SPEC-030](../../../cats-runtime/docs/specs/SPEC-030-provider-selection-before-bootstrap-probes.md)
- [Shared PLAN-039](../../../cats-runtime/docs/plans/PLAN-039-provider-selection-bootstrap-rollout.md)
- [ADR-046](./046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [SPEC-093](../specs/SPEC-093-settings-runtime-cli-provider-lifecycle.md)
