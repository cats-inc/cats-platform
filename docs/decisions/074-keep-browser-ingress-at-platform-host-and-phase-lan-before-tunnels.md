# ADR-074: Keep Browser Ingress at the Platform Host and Phase LAN Before Tunnels

> Browser access from other devices should terminate at `cats-platform`, not at
> `cats-runtime`. Trusted LAN access lands first; optional Tailscale/ngrok
> ingress follows later without changing the packaged Electron sidecar
> topology.

## Status

Accepted

## Date

2026-04-20

## Context

The current product direction needs two related capabilities:

1. A phone or tablet on the same LAN should be able to open the Cats web UI by
   local IP during development or self-hosted use.
2. A later phase may allow the same web UI to be reached through a trusted
   overlay or tunnel such as Tailscale or ngrok.

At the same time, the packaged Electron app must keep its current sidecar
architecture:

- Electron hosts the platform app and runtime as local child services.
- The packaged desktop app should keep using loopback addresses.
- `cats-runtime` remains the runtime boundary and should not become the direct
  browser/public ingress surface.

Today, `cats-platform` can already bind to a configurable host, and the desktop
host already has desktop-specific host overrides. The real gaps are:

- Vite dev hosting is still loopback-only.
- `/runtime/setup` currently redirects the browser to the runtime origin, which
  breaks remote-browser access when the runtime stays on `127.0.0.1`.
- Runtime operator pages still assume they are running from the runtime origin
  unless the platform host adapts them.

## Decision

### 1. `cats-platform` is the only browser ingress surface

Browsers, tablets, and future tunnel entrypoints should connect to
`cats-platform`.

`cats-runtime` remains an internal upstream service for the platform host. Even
when remote browser access is enabled, the runtime itself should stay off the
LAN/public edge by default.

### 2. Phase delivery is explicit

#### Phase 1: Trusted LAN / dev self-hosted access

- `cats-platform` may bind to a LAN-visible host for dev or self-hosted use.
- Packaged Electron keeps loopback-only defaults via desktop-specific env.
- Runtime setup, dashboard, and playground are hosted from the platform origin
  under `/runtime/*`.
- Runtime JSON and streaming APIs are proxied through `/runtime/api/*`.

#### Phase 2: Trusted overlay / tunnel access

- Optional remote access may be added through Tailscale, ngrok, or an
  equivalent trusted tunnel.
- The tunnel still targets `cats-platform`, not `cats-runtime`.
- Public/tunneled ingress remains explicit opt-in and does not change the
  packaged desktop defaults.
- Any future absolute external URL setting belongs to the platform host, not to
  the runtime.

### 3. Packaged Electron stays loopback-only

The packaged desktop host continues to use desktop-specific host settings such
as:

- `CATS_DESKTOP_APP_HOST`
- `CATS_DESKTOP_RUNTIME_HOST`

These remain `127.0.0.1` by default, even if dev/self-hosted web binds to LAN
interfaces.

### 4. Platform-hosted runtime pages use a host-owned adaptation seam

When the platform serves runtime HTML pages, it may adapt them so the browser
uses:

- `/runtime/setup`
- `/runtime/dashboard`
- `/runtime/playground`
- `/runtime/api/*`

This adaptation is allowed at the host boundary because it preserves the
runtime's standalone behavior while avoiding a second browser-visible origin.

## Consequences

### Positive

- iPad / phone browser access on the same LAN does not require exposing the
  runtime directly.
- Future tunnel access can reuse the same platform-only ingress boundary.
- Packaged Electron keeps the current sidecar mental model and does not need LAN
  support to function.
- Runtime operator pages can work from the same origin as the platform app.

### Negative

- `cats-platform` now owns a thin runtime-page adaptation layer.
- Runtime operator pages need path/base rewriting when platform-hosted.
- Tunnel mode will still need explicit trust-boundary documentation and likely a
  later external-base-url setting if absolute links are required.

### Neutral

- `cats-runtime` still supports standalone use on its own port.
- This decision does not by itself add multi-user auth or make public internet
  exposure safe.
- Trusted LAN and trusted tunnel access remain operator workflows, not default
  consumer product behavior.

## Alternatives Considered

### Alternative 1: Expose `cats-runtime` directly on the LAN

- **Pros**: less host adaptation work; runtime pages already exist.
- **Cons**: exposes a lower-level, more privileged surface; breaks the intended
  product/runtime boundary; makes later tunnel access riskier.
- **Why rejected**: the browser ingress boundary should stay at the product
  host, not move down into the runtime.

### Alternative 2: Let packaged Electron opt into LAN hosts too

- **Pros**: one topology for dev and desktop.
- **Cons**: weakens the sidecar/local-app model; creates bad defaults like
  `0.0.0.0` app URLs inside the desktop shell; increases packaged complexity for
  a non-default scenario.
- **Why rejected**: packaged desktop should stay local-first and loopback-only.

### Alternative 3: Keep redirecting `/runtime/setup` to the runtime origin

- **Pros**: trivial to implement.
- **Cons**: remote browsers resolve `127.0.0.1` or other loopback runtime URLs
  against themselves; setup breaks immediately outside the host machine.
- **Why rejected**: it fails the actual multi-device browser use case.

## References

- [ADR-003](./003-electron-host-manages-local-services.md) - Electron as a thin
  desktop host around local services
- [ADR-036](./036-unify-api-contract-and-namespace-endpoints-by-product.md) -
  `/runtime/*` and `/runtime/api/*` namespace rules
- [ADR-037](./037-serve-runtime-dashboard-and-playground-from-platform-host.md)
  - platform-hosted runtime surfaces
- [ADR-045](./045-use-cats-platform-as-the-main-platform-host-under-cats-brand.md)
  - `cats-platform` as the main platform host

---

*Decision made: 2026-04-20*
*Decision makers: user + Codex*
