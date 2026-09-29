# ADR-125: Own Multiple Frontends and Backends in One App

## Status

Accepted product boundary, amended 2026-09-29 for one shared Platform ingress.
A local component prototype exists in an unpublished worktree; shared ingress
and remote App access are not implemented. [SPEC-122](../specs/SPEC-122-app-components-and-private-services.md)
and [PLAN-115](../plans/PLAN-115-app-components-and-private-services.md) track delivery.

## Context

The Ask discussion exposed an incorrect inference from the delivered renderer
slice: an App would need a separately managed backend, and its own API would
need per-operation Platform SDK methods. The user explicitly rejected both.
ADR-094 already proposed server/worker entrypoints; the current opaque iframe
and unsupported server declarations are implementation limits, not the App model.

## Decision

1. One App owns one install identity, release version and management lifecycle.
   Its package may contain multiple frontend entrypoints, backend services and
   workers. Component count is not restricted to one renderer or one server.
2. Install, enable, disable, update, repair and uninstall operate on the complete
   App. Desktop manages component dependencies, startup, readiness and shutdown.
   Users do not install a companion backend package or run a server command to
   use an installed App. Component diagnostics may appear in advanced details.
3. App frontends call their App's declared services using ordinary web protocols.
   Platform supplies sandbox isolation, path routing and access control;
   it does not define or interpret each App's business API. Relative URLs or
   deployment-injected service URLs must work without App SDK request wrappers.
   A transparent reverse proxy is an infrastructure detail, not a domain API.
4. The App SDK exposes host capabilities such as clipboard, host navigation or
   Runtime-backed execution. It is not a mandatory transport for App-owned HTTP
   requests. A host capability remains permission checked even when the caller
   is an App backend. Apps do not gain access to other Apps or host credentials.
5. App code owns its schemas, business logic and data migrations in an allocated
   data directory outside immutable package bytes. Platform owns installation
   identity, process supervision, route binding and lifecycle transactions.
   Runtime owns provider execution and genuinely shared execution primitives;
   App-specific persistence or MCP handlers do not automatically belong there.
6. Platform UI/APIs, remote Cats Mobile access and every App share one configured
   public origin, HTTPS port and tunnel. Platform owns the listener/router and
   tunnel lifecycle. App mounts live under `/apps/<appId>/`; internal components
   may use dynamic loopback ports or IPC without consuming public endpoints.
   App disable/update/removal revokes only its routes and grants, not the shared
   ingress. Users configure remote access once in Platform; an App shows shared
   readiness and its own endpoint rather than managing another tunnel.
   Declared App MCP routes use App connection credentials; Platform/Mobile and
   private App APIs retain their respective authentication. Sharing a listener
   grants no cross-App, Platform management or Runtime tool authority.
7. Apps remain independently versioned under ADR-121. Frontend/backend components
   activate as one coherent release. Failed updates preserve recoverable data
   and the last coherent installation; rollback must respect data-schema support.

The accepted first delivery target is Desktop-managed local components. Cloud
hosting is a separate deployment option with explicit availability/data terms;
installing a local package does not provision an unspecified cloud service.

## Consequences

The amendment extends [ADR-074](074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md):
tunnels target Platform, including App routes. The initial per-App ngrok worker
and separate renderer ports are prototype evidence, not the delivery architecture.
Path prefixes do not isolate browser origins. SPEC-122 requires opaque App
sandboxes, scoped view grants and an authenticated host bridge before serving
App documents through the shared origin. The implementation plan reopens these
gates; existing local Copy tests do not validate the new sandbox.

The stable App mount is infrastructure routing. Per-answer deep links and host
back/forward synchronization remain outside the Ask MVP.

- Ask ships its UI, question API, storage and MCP as one `cats.ask` package.
- The current single-renderer schema/loader and no-network iframe need deliberate
  extension, including actual multi-frontend/multi-backend acceptance.
- Existing renderer-only Apps remain valid within their supported compatibility
  line. New capabilities are rejected explicitly by unsupported hosts; breaking
  contracts require the prescribed version boundary and tested state migration.
- This decision does not broaden executable third-party trust or promise that a
  child process alone is a security sandbox. Supported trust/execution policy
  must be established before activation.
- No package version, deployment, user configuration or release changes here.

## References

- [Original App proposal](094-adopt-cats-app-packages-as-extension-boundary.md)
- [Independent lifecycle](121-distribute-apps-independently-with-host-owned-lifecycle.md)
- [Current package implementation](../app-packages.md)
- [Ask specification](https://github.com/cats-inc/cats-apps/blob/main/docs/specs/SPEC-004-personal-assistant-questions-mvp.md)
