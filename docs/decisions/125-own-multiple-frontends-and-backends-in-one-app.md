# ADR-125: Own Multiple Frontends and Backends in One App

## Status

Accepted product boundary, 2026-09-29. Execution and manifest changes are not
implemented. [SPEC-122](../specs/SPEC-122-app-components-and-private-services.md)
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
   Platform supplies an isolated application origin, routing and access control;
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
6. An App may expose a declared backend endpoint, including MCP, to an external
   client through configured ingress. Public exposure and connection credentials
   are scoped to that App and endpoint. They cannot expose the host or Runtime
   tool surface by implication. Ingress operation is integrated into the App's
   lifecycle and connection UX, not a separately installed user-facing App.
7. Apps remain independently versioned under ADR-121. Frontend/backend components
   activate as one coherent release. Failed updates preserve recoverable data
   and the last coherent installation; rollback must respect data-schema support.

The accepted first delivery target is Desktop-managed local components. Cloud
hosting is a separate deployment option with explicit availability/data terms;
installing a local package does not provision an unspecified cloud service.

## Consequences

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
