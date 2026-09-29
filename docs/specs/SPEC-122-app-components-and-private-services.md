# SPEC-122: App Components and Private Services

## Status and scope

User-confirmed product requirements, amended 2026-09-29.
An unpublished local prototype exists on `feat/app-components`; the shared
Platform/Mobile/App ingress contract below is planned and not implemented. Governing decision: [ADR-125](../decisions/125-own-multiple-frontends-and-backends-in-one-app.md).
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
| ACMP-05 | Give each installation a sandboxed frontend and bound service namespace on the shared ingress. Enforce installation/owner identity, approved routes and cross-App/host isolation at the service boundary. A path prefix, browser CORS or a renderer-supplied App ID alone is insufficient authorization. |
| ACMP-06 | Platform supervises dependency-aware startup, readiness, bounded restart and shutdown. One frontend closing need not terminate background work or other frontends. Explicit App disable/remove stops components and revokes active routes/connections. |
| ACMP-07 | Stage and validate the whole release before switching the active installation. All newly activated components use the same release generation; stale pages cannot keep writing through revoked routes. Partial startup/update failure yields a recoverable App state. |
| ACMP-08 | App-owned data survives updates outside package bytes. App supplies schema validation/migration logic; host coordinates quiescence, backup, atomic activation and restart/failure recovery. Uninstall retention and explicit data deletion follow SPEC-120. |
| ACMP-09 | Only declared external endpoints may be published. Authentication, ingress readiness/revocation, request limits and offline behavior are explicit; public endpoint access does not confer internal service or host permissions. Local-only Apps need no tunnel. |
| ACMP-10 | SDK capabilities remain available for host integration. API-only App communication neither depends on SDK domain wrappers nor grants shell, Runtime, cross-App or general host-store access. |
| ACMP-11 | Desktop management authorization under ADR-121 governs the complete App. Ordinary frontend interaction is not an install/update permission. Existing trust restrictions also apply to executable services/workers. |
| ACMP-12 | One public origin/HTTPS port/tunnel serves Platform, remote Mobile clients and all enabled Apps. Route by App ID; internal ports stay private. App lifecycle changes never stop unrelated routes or the shared tunnel. |

## Communication model and shared ingress (required, not implemented)

```text
Remote browser / Cats Mobile / external assistant
                  |
        one HTTPS origin and public port
          one tunnel -> Platform router
                  |
       +----------+-----------------------+
       |                                  |
  Platform UI/API                /apps/<appId>/...
  existing authentication          App-scoped authentication
                                          |
                               private component HTTP / IPC
                                          |
                                  App-owned services/data
```

Platform owns the common listener, remote-access settings and tunnel lifecycle.
Apps own their domain APIs, MCP handlers and data. The App SDK remains for host
capabilities; frontends use ordinary `fetch`/streams for their own services.
Desktop still manages each complete package, including multiple frontends,
services and workers. Internal OS-assigned loopback ports do not reserve public
ports. This extends the existing Platform ingress in ADR-074/SPEC-075; do not
build a second App-only external gateway or expose Runtime directly.

### Route contract

Example public origin: `https://cats.example` (illustrative, not provisioned).

| Public path | Destination and authority |
| --- | --- |
| `/`, `/chat`, `/work`, existing product routes | Platform UI; existing session/auth rules |
| `/api/...` and existing approved Platform proxy routes | Publicly eligible Platform/Mobile APIs only; existing session/device auth and capability checks; internal agent/management routes excluded |
| `/apps/<appId>/` | Host launch shell; authenticates the viewer before issuing an App view grant |
| `/apps/<appId>/ui/<frontendId>` | Declared self-contained App HTML, served in an opaque sandbox |
| `/apps/<appId>/api/...` | Declared private App API; scoped owner/App/generation view grant |
| `/apps/<appId>/mcp` | Declared external App MCP; App connection and operation credentials |

`cats.ask` therefore uses `/apps/cats.ask/api/...` and `/apps/cats.ask/mcp`.
Other declared service paths are mounted inside their App prefix subject to
validation; `ui` and launch routes are reserved by the host. Frontend IDs select
documents without requiring an App navigation SDK. Per-answer URLs/history are
still deferred.

The host validates canonical App/component IDs, exact path-segment boundaries,
route/method conflicts and reserved paths before activation. Reject traversal,
encoded separators and ambiguous normalization; never let an App shadow Platform
routes or another App. Unknown or disabled App paths fail inside the App router,
not through the Platform SPA fallback. Bind the route table and grants to the
active installation generation; registration/revocation is atomic.

The transparent proxy strips `/apps/<appId>` for service dispatch (Ask continues
to own internal `/api` and `/mcp`). Preserve method, query, bounded body and
declared stream/MCP headers; strip hop-by-hop headers, spoofed internal identity
and Platform cookies/credentials. Validate view grants at the gateway; pass only
host-established same-App identity internally. External MCP credentials are
forwarded only to that App's declared MCP handler. Bound redirects, response
cookies and caching so a component cannot acquire Platform authority or leak
private responses. Set-Cookie from App components is rejected in the initial
contract; no shared-cookie App authentication.

Frontend bootstrap supplies the reachable App base URL and scoped authorization
headers. A remote client must never receive a server-loopback URL. Resolve local,
LAN and public URLs against trusted host configuration; generate absolute MCP
URLs from the configured public origin, never arbitrary Host/X-Forwarded input.
Existing `GET /api/platform/ingress` diagnostics include `remoteAccess`: provider,
state, enabled/configured, public URL/configured origin and listen port. Only
Desktop also receives the local tunnel target and legacy migration choices.
`POST /api/platform/ingress` requires the exact Desktop management credential
through main-frame IPC; its bounded body accepts `enabled`, `provider`,
`authtoken`, `publicOrigin`, `listenPort` and optional `migrationSource`.
Secrets are never included in responses. Apps read a scoped GET
`/apps/<appId>/_cats/ingress` through their view grant and may open host settings
through `catsApp.openRemoteAccess()`.

### Authorization and browser isolation

The one tunnel targets a Platform-owned ingress listener, shared by all public
Platform/Mobile/App routes. The existing internal Platform listener stays private
for Desktop management and Code session MCP. Both use the same product router;
the public entry enforces its route boundary before dispatch. This requires no
second public port/tunnel and does not move MCP handlers into the ingress layer.
Never tunnel the internal listener. Deny `/api/code/agent-tools/mcp` and other
internal agent/management paths at public entry even with valid internal grants,
no Origin header and a loopback proxy peer. Do not derive entry classification
from client-controlled headers. Retain Host/origin checks on the internal entry.

Sharing a path-routed origin is not browser isolation. The initial per-port
iframe's `allow-same-origin` policy cannot be used for shared-origin App HTML.
The target is an opaque-origin iframe (`allow-scripts`, no `allow-same-origin`),
also enforced with HTTP CSP `sandbox` on every App HTML response so direct
navigation cannot execute App scripts with Platform origin privileges. The
host shell remains trusted; App documents cannot access host DOM/storage,
register a service worker for the host or obtain its management credentials.

Authenticated Desktop or remote viewers receive a single-use short-lived launch
ticket and an owner/App/view/generation-scoped grant. Tickets/grants must not be
logged, cached or leaked via referrers. Native install/update/remove authorization
remains Desktop-only; ordinary remote App launch is not package management.
Private App requests use the grant as a bearer and `credentials: omit`. A shared
public listener does not make a `private` route anonymous: exposure describes
its allowed caller, not a second network port.

Opaque documents send `Origin: null`. CORS may allow only the declared App API
methods/headers and non-credentialed responses, with the grant checked for every
data request. Preflight returns only route metadata. Never trust `null` alone or
allow credentialed wildcard CORS; Platform APIs reject opaque-origin mutations
and preserve their existing CSRF/session/device checks. The host bridge binds
the exact frame Window, a one-use nonce and MessageChannel to its grant; origin
string matching alone is insufficient. Revalidate clipboard in this sandbox;
if browser write fails, use a permission-checked text-only host bridge triggered
by the user. Denial must remain visible.

Platform sessions, App view grants, MCP connection/attempt credentials and
Desktop management credentials are distinct authority domains. No token works
for another App or Platform API. MCP authentication errors are protocol/HTTP
errors, not redirects to the Platform browser login. External clients cannot
enumerate private App state using an MCP bearer. Trusted native component code
remains outside an OS sandbox; the browser boundary does not change that trust
policy.

### Ingress configuration and lifecycle

Remote access is opt-in and configured once in Platform. ngrok or Tailscale is
an ingress adapter, not an App dependency or separate installed App. One adapter
may be implemented first; supporting both is not required for this slice. A
stable domain is optional host/provider configuration; no per-App domain or
public port is required. Apps show shared readiness and their scoped endpoint
and may open host setup; they do not collect/store tunnel account credentials.
Keep credentials host-owned and out of App environments/logs.

The candidate implementation stores schema v2 in
`platform/config/ingress.local.json`. `ngrok` uses the bundled official SDK
worker and permits a dynamic local ingress port. `external` uses an existing
operator-managed tunnel, requires a fixed local ingress port and HTTPS public
origin, and reports `configured` rather than claiming a verified connection.
That tunnel must target the displayed ingress address and preserve the public
Host header. Platform authentication setup must be complete before enabling
either provider; unsafe-disabled authentication cannot expose a public entry.

App close leaves declared background work running. Disable/update/remove revokes
that App's routes, grants and streams and stops its components; the shared tunnel,
Platform/Mobile sessions and other Apps keep working. Host shutdown ends local
availability. Tunnel/provider failure is shared status and never resends Ask
questions. A new public URL requires visible connector reconfiguration; it does
not imply a new request or discard saved answers.

The unpublished per-App ingress configuration is not a supported legacy runtime
mode. If development settings exist, migrate through validation, backup and an
atomic host-config replacement with failure recovery. Reuse a consistent single
provider configuration; conflicting accounts/domains require explicit operator
selection, never arbitrary selection or secret echoing. Preserve prior config
on failure and all App question/data generations. Test restart/idempotence and
failed migration before retiring the old config. Record the actual released
host/SDK floor before publishing; this document changes no version or user state.

## Acceptance

These are release acceptance gates. PLAN-115 records the new local shared-entry
and opaque-sandbox evidence; live external tunnel/Bot and other-OS checks remain
open. Historical per-App fixtures alone do not satisfy shared-ingress acceptance.

- Through one external HTTPS origin/port/tunnel, exercise Platform/Mobile APIs
  and at least two installed Apps concurrently, including two distinct MCP
  paths. The remote client cannot reach the host's loopback network.
- Verify no bootstrap, assets, redirects or connector instructions expose server
  loopback URLs. Check nested base paths, query strings, SSE/stream cancellation,
  MCP session/protocol headers, restart/rebinding and path-confusion denial.
- Verify App A cannot use App B's grants, Platform cookies or management auth;
  opaque-frame fetch, bridge spoofing, direct HTML navigation and service-worker
  attempts cannot cross the boundary. Exercise real browser/Electron Copy.
- At public entry, reject Code session MCP even with its valid grant and no
  Origin, including a loopback tunnel peer and forged Host/forwarded headers.
  Verify the same authorized session can reach its internal endpoint. App MCP
  remains reachable on its own path without sharing the Code grant or lifecycle.
- Disable/update/remove App A during a stream: only A is revoked; Mobile and B
  keep working over the same live tunnel. Stop/restart the host and validate
  route/config recovery without resending questions.
- Test config migration with zero/one/conflicting per-App settings, backup,
  interrupted writes and repeat startup. Retain all existing App data.

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

## Local prototype evidence and retained component contract

The following records `feat/app-components` before the shared-ingress correction.
Package/process/data behavior remains the starting point. Per-App origins,
external listeners and per-App ngrok setup below are historical implementation
facts to replace, not alternatives to the required shared ingress above.
This historical prototype was uncommitted/unpublished. PLAN-115 records the
shared-ingress implementation and PR delivery; release acceptance is separate.

- Component packages use archive envelope **2** and manifest `components.schemaVersion: 1`.
  Renderer packages retain envelope 1 and their existing entrypoint/SDK behavior.
  Old decoders reject envelope 2 before installation. No registry format reset.
- `components` declares `primaryFrontend`, `frontends` (1–8), `services` (0–8),
  `workers` (0–8), and `data.schemaVersion` plus an optional bundled migration.
  IDs are unique across collections; service/worker `dependsOn` forms a DAG.
  Frontends name self-contained `.html`; processes and migrations name bundled `.mjs`.
- Each service declares bounded `{path, methods, exposure}` route prefixes.
  Exposure is `private` or `external`; overlapping paths/methods are rejected.
  Dependencies receive only their declared same-App service URLs and credentials.
- The local prototype gives each active App generation a separate OS-assigned `127.0.0.1` HTTP origin.
  A Desktop main-frame IPC call obtains a single-use, 30-second launch ticket.
  The served document receives `catsAppConnection.baseUrl` and authorization headers
  for ordinary `fetch`; each view grant expires after 12 hours. Grants never authorize
  installation or another App. No shared-port cookies or general HTTP SDK proxy.
- The iframe allows scripts and its own origin, with same-origin network CSP.
  It remains cross-origin from Cats. Existing MessageChannel host capabilities remain;
  clipboard write is delegated to the frame and requires successful browser completion.
- Desktop alone holds the random management credential; IPC checks the main frame
  and exact Cats origin. Browser login, a loopback address, or preload detection alone
  does not authorize App management. The credential is not sent to Runtime or Apps.
- Trusted local/system App modules execute in Node child processes with filtered
  environments and IPC lifetime binding. `start(context)` returns an HTTP `handle`
  for services and optional `close` for services/workers. This is trusted native code,
  not an OS sandbox. Readiness is 15 seconds; shutdown forces exit after 3.5 seconds;
  two automatic generation restarts are allowed before an explicit enable retry.
- Updates quiesce the App, copy data to a new generation, run its declared
  `migrate({dataDir, fromSchemaVersion, toSchemaVersion})`, then check readiness.
  One atomic registry write selects package and data generation together. Old and
  failed staged generations remain recoverable; crashes before activation retain
  the old selection. Disabled installs never start ordinary service/worker code.
  Snapshot limits: 10,000 files / 256 MiB; links and special files are rejected.
- Disable/uninstall intent is durable before cleanup. Retained uninstall records
  preserve the data generation for reinstall. Explicit destructive data removal
  must not silently erase this pointer while retaining the files. Component
  `purge` is rejected until the separate data deletion contract is implemented.
- The local prototype serves external routes through a separate gateway/listener with no private API, frontend,
  Platform or Runtime routes. Browser-origin requests and anonymous requests are
  denied. The App validates connection/attempt credentials. The gateway bounds
  request bodies to 2 MiB; the App can impose tighter limits.
- The local prototype ingress uses the official embedded `@ngrok/ngrok` SDK, run in a supervised
  host worker. Setup/status are private `/_cats/ingress` hosting operations; the
  App never receives the ngrok token back. It requires a user ngrok account/token,
  reuses the assigned URL, and stops with the App. A URL/account failure is visible
  and does not resend questions. Local availability ends when Desktop stops.

The prototype prepares the ngrok worker with Platform; no separate executable installation
or user terminal command. See the [official SDK](https://github.com/ngrok/ngrok-javascript)
for the embedded forwarding and listener close contract (checked 2026-09-29).

## Compatibility

Preserve existing supported App contracts within the current minor line. Record
the necessary host/SDK/package-format boundary before executable changes. A
breaking change needs a new allowed version boundary and validated, backed-up,
atomic migration with failure recovery. No version bump or publication here.

Management HTTP now requires a Desktop-owned credential even for legacy App
mutations; authenticated web sessions alone cannot install native code. This is
a tightened management contract: the next authorized release must account for
the 0.x minor boundary (0.7.x), and consumers must select the actual released
host/SDK floor. Current development candidates retain the 0.6.1 baseline solely
for coordinated worktree validation; released 0.6.1 does not accept envelope 2.
