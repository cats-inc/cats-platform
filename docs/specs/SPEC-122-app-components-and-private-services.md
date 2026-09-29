# SPEC-122: App Components and Private Services

## Status and scope

User-confirmed product requirements; technical contract draft, 2026-09-29.
Implementation not started. Governing decision: [ADR-125](../decisions/125-own-multiple-frontends-and-backends-in-one-app.md).
Delivery: [PLAN-115](../plans/PLAN-115-app-components-and-private-services.md).

Extend the package foundation so one installed App can own multiple frontends,
services and workers. A renderer-only App is a valid special case. Ask is the
first consumer; the contract must not encode Ask-specific request/answer APIs.

## Requirements

| ID | Contract |
| --- | --- |
| ACMP-01 | One App ID, selected release, registry entry and install/update/repair/remove action covers all bundled components. Users never manage a frontend and its backend as separate installations. |
| ACMP-02 | A versioned manifest represents named collections of frontend, service and worker components, their built entrypoints, dependency relationships and permitted routes. Define exact syntax before coding; singular server/renderer fields do not establish multi-component support. |
| ACMP-03 | Validate unique component IDs, contained paths, dependency references/cycles, route conflicts, compatibility and trust before executing code. Built packages contain required executable assets; no source-checkout dependency or install-time npm build. |
| ACMP-04 | Frontends use ordinary fetch/HTTP and, when declared, streaming connections to their App's services. Host-injected deployment metadata or relative routes work without SDK calls for each request. App API changes do not require new Platform domain methods. |
| ACMP-05 | Give each installation an isolated application origin and bound service namespace. Enforce installation/owner identity, approved routes and cross-App/host isolation at the service boundary. A path prefix, browser CORS or a renderer-supplied App ID alone is insufficient authorization. |
| ACMP-06 | Platform supervises dependency-aware startup, readiness, bounded restart and shutdown. One frontend closing need not terminate background work or other frontends. Explicit App disable/remove stops components and revokes active routes/connections. |
| ACMP-07 | Stage and validate the whole release before switching the active installation. All newly activated components use the same release generation; stale pages cannot keep writing through revoked routes. Partial startup/update failure yields a recoverable App state. |
| ACMP-08 | App-owned data survives updates outside package bytes. App supplies schema validation/migration logic; host coordinates quiescence, backup, atomic activation and restart/failure recovery. Uninstall retention and explicit data deletion follow SPEC-120. |
| ACMP-09 | Only declared external endpoints may be published. Authentication, ingress readiness/revocation, request limits and offline behavior are explicit; public endpoint access does not confer internal service or host permissions. Local-only Apps need no tunnel. |
| ACMP-10 | SDK capabilities remain available for host integration. API-only App communication neither depends on SDK domain wrappers nor grants shell, Runtime, cross-App or general host-store access. |
| ACMP-11 | Desktop management authorization under ADR-121 governs the complete App. Ordinary frontend interaction is not an install/update permission. Existing trust restrictions also apply to executable services/workers. |

## Communication model

```text
App frontend(s) -- normal HTTP/stream --> App-owned service(s) --> App data
       |                                      |
       +-- permissioned Cats host capability -+

External client -- configured App ingress --> declared App endpoint
```

Platform may host the gateway, allocate ephemeral ports or supervise processes.
These choices do not transfer App API/schema ownership to Platform. A single
process per App or per component is not a product constraint. Backend-to-backend
discovery follows declared dependencies and the same installation boundary.

The current opaque `srcDoc` iframe denies network and cannot deliver ACMP-04 as
it stands. A new serving/origin mechanism must be validated in the real host;
simply allowing arbitrary localhost fetch or making Apps same-origin with the
privileged host does not satisfy this specification.

## Acceptance

- Install one fixture containing two independent frontend entrypoints, two
  services and a background worker; both frontends reach their declared services
  using native web requests without an App-domain SDK addition.
- Stop/reopen one frontend while the other and the declared background task
  continue. Show one App in inventory throughout install, update and removal.
- Deny requests from another App/owner, direct unauthorized loopback clients,
  undeclared public routes and an old installation generation after revocation.
- Test required-service failure, readiness timeout, crash/restart bounds,
  disable/remove during streams, interrupted updates, and migration failures.
  Verify process/port cleanup and coherent state after repeat startup.
- Load existing Usage/Studio packages under their declared compatibility and
  exercise the real installed host. Validate Windows, macOS and Linux separately.
- For Ask, install one package, create a question by its private API, retrieve
  and submit by its authenticated external MCP, then reopen/copy the answer.
  No separately installed server or terminal command is an acceptance step.

All fixtures use temporary registry/data roots. A document or source preview
is not installed-package acceptance.

## Decisions to freeze before implementation

Manifest/schema version and migration mapping; frontend origin/URL scheme;
service discovery/auth bootstrap; process runtime and trust enforcement; bounds
and readiness protocol; upgrade transaction and App data migration hooks; ingress
provider/configuration and endpoint lifetime. These are implementation choices
within the accepted requirements, not permission to split the App installation.

## Compatibility

Preserve existing supported App contracts within the current minor line. Record
the necessary host/SDK/package-format boundary before executable changes. A
breaking change needs a new allowed version boundary and validated, backed-up,
atomic migration with failure recovery. No version bump or publication here.
