# ADR-143: Separate product repositories after Platform contracts stabilize

## Status

Proposed — 2026-10-29, following merged
[Bot PR #51](https://github.com/cats-inc/cats-bots/pull/51).
This proposes a successor to ADR-110's repository/application placement after
the gates in [SPEC-135](../specs/SPEC-135-independent-product-repositories-and-distribution.md)
and [PLAN-128](../plans/PLAN-128-product-repository-extraction.md) pass.
ADR-110 remains the implemented layout; no repositories or release endpoints
have been created, renamed or moved by this documentation.

## Context

ADR-110 kept Web, server, Desktop and Mobile together while their contracts
changed together. It allowed real package boundaries and required evidence for
a later repository split. Desktop and standalone Bot now have distinct product
lifecycles, profiles and installers. Bot #51 further separates its ecosystem,
Hub and cores. Mobile remains tightly coupled to the Platform source tree.

The owner proposes independent product repositories over `cats-platform`, which
continues to use `cats-runtime`. This is a suitable target once shared dependencies
can be consumed without source checkouts. Moving folders first would increase
cross-repository coordination without resolving the existing duplication.

## Decision

### Target ownership

| Repository | Owns |
|------------|------|
| `cats-runtime` | Execution, provider/session/interaction protocols, catalogs, provider metadata, telemetry and workspace substrate |
| `cats-platform` | Shared packages from ADR-142; composable product services and interaction core; Platform API/server; App SDK, install/load and permission mechanisms; reusable host integrations |
| `cats-desktop` | Desktop application composition, navigation and product presentation, Electron entry, Desktop identity, selected capabilities, distribution pins, installers and release workflow |
| `cats-bot` | Bot domain, Hub/core composition, coordinator, fleet policy, Bot state and product distribution; rename remains Bot ADR-007's separate work |
| `cats-mobile` | React Native views/navigation, device adapters, connection and pairing UX, native app configuration and Mobile distribution |
| `cats-one` | User-facing launch composition and Cats developer-workspace composition; optional integration orchestration over declared artifacts |
| `cats-apps` / `cats-plugins` | Existing source/artifact producer responsibilities |

1. **Use Platform packages without a new base repository.** Products consume
   versioned artifacts. Platform never imports Desktop/Bot/Mobile implementations.
   A product release records its own tested Platform/Runtime/App payload pins.
2. **Keep a headless host and Web deployment.** The existing self-hosted server/Web
   entry remains a thin application in `cats-platform`. Its renderer composes shared
   Web/product modules also used by Desktop. Desktop-only navigation, native UI and
   deployment policy move to `cats-desktop`; server/domain code used by Mobile
   cannot move behind a Desktop-private interface. A separate `cats-web` is not
   needed for this extraction.
3. **Keep independent process and data ownership.** Mobile talks to an authenticated
   Platform endpoint. Bot uses selected libraries and its own Runtime; it does not
   need a running Desktop or full Platform server. Product roots, credentials,
   uninstall boundaries and lifecycle policies are explicit inputs to shared code.
4. **Keep cats-one outside the product library chain.** Its current default remains
   Runtime plus the self-hosted Platform CLI, including healthy-Runtime reuse,
   readiness and shutdown ownership. Products do not import cats-one. Desktop and
   Bot installers remain independently runnable. New launcher profiles or a
   compatibility-set command require their own scoped requirements.
5. **Stage source ownership changes.** Establish packages and dual-consumer evidence
   first, extract Desktop next, then extract Mobile after its public client and
   packed Metro build work. Distinct artifact formats alone do not satisfy the gate.
6. **Preserve distribution continuity.** A source move does not by itself change
   Desktop's application identity, data root, signing identity, update eligibility
   or public CLI. Resolve existing updater-feed continuity before any release
   handover. Existing published releases remain untouched.
7. **Keep version meanings separate.** Desktop and Mobile application versions can
   diverge from Platform libraries/host after their version sources are separated.
   App compatibility continues to use App SDK and ADR-128's minimum Platform-host
   version, not the Desktop application version. Library changes do not force
   unchanged products, Apps, Plugins or cats-one to publish.

## Consequences

### Positive

- Product builds and releases have explicit owners and selected dependencies.
- Platform supplies shared behavior without owning every product's presentation.
- cats-one retains a clear composition role with no product-state authority.

### Negative

- Cross-repository changes need package/version sequencing and consumer checks.
- Desktop update feeds, signing automation and Mobile bundle delivery require
  deliberate handovers; a successful source move alone proves none of them.
- More repositories are justified only after the dependency gates lower coordination cost.

### Neutral

- Bot's accepted identity/clean-break policy in ADR-007 is not generalized to
  Desktop or Mobile. Their persisted-data changes follow the workspace upgrade policy.
- Bot #51's open product questions remain in its SPEC-007/008/009; this proposal
  does not choose fleet limits, removal behavior or coordinator limits.
- No central daemon, shared global Runtime or new network service is introduced.

## Alternatives Considered

| Alternative | Benefit | Cost / reason not selected |
|------------|---------|----------------------------|
| Keep all Platform clients together indefinitely | Atomic source changes | Still valid while contracts stabilize; target ownership favors independent product delivery later |
| Split every client immediately | Fast folder separation | Sibling imports and copied code would become release dependencies |
| Move all current Platform code into Desktop | Simple initial move | Makes Web/Mobile backend ownership depend on the Desktop product |
| Make cats-one the shared runtime layer | One apparent umbrella | Mixes launcher/developer tooling with product APIs and state |

## References

- [ADR-142](142-publish-reusable-platform-packages-for-independent-products.md)
- [ADR-110](110-keep-platform-clients-in-one-repository-with-explicit-package-boundaries.md)
- [ADR-003: managed local services](003-electron-host-manages-local-services.md)
- [ADR-128: App compatibility](128-make-the-app-sdk-version-the-sole-app-compatibility-gate.md)
- [cats-one architecture](https://github.com/cats-inc/cats-one/blob/main/docs/architecture.md)
- [Bot ADR-007](https://github.com/cats-inc/cats-bots/blob/4fa3a395640799e9556fffca9d958b5249c3e179/docs/decisions/007-give-cats-bot-its-own-identity-and-data-root.md)

*Proposed: 2026-10-29*
