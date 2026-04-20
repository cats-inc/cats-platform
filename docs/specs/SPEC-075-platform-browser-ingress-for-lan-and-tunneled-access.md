# SPEC-075: Platform Browser Ingress for LAN and Tunneled Access

> Define how Cats becomes reachable from other devices without moving browser
> ingress down to `cats-runtime` or changing the packaged Electron sidecar
> architecture.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

Cats needs a clean way to open the app from another device such as an iPad on
the same LAN, with a later optional phase for trusted remote access through
Tailscale or ngrok. The system should keep `cats-platform` as the only
browser-facing ingress surface, keep `cats-runtime` behind the host boundary,
and preserve the current packaged Electron loopback-only sidecar topology.

## Goals

- Allow trusted LAN browser access to the Cats web UI without exposing
  `cats-runtime` directly.
- Preserve the current packaged Electron sidecar architecture and loopback-only
  defaults.
- Add a follow-through path for optional tunnel/overlay access that still
  targets `cats-platform`.
- Make runtime setup and operator pages usable from the platform origin.

## Non-Goals

- Making the app safe for direct public internet exposure.
- Turning `cats-runtime` into a general browser ingress surface.
- Replacing the Electron sidecar model with a LAN-native packaged topology.
- Designing a full multi-user auth system in this slice.

## User Stories

- As a developer, I want to open Cats from an iPad on the same Wi-Fi so that I
  can test the UI away from the desktop browser.
- As a self-hosted operator, I want runtime setup and diagnostics to stay under
  the Cats origin so that remote browsers do not need to know the runtime port.
- As a desktop user, I want the packaged app to remain local-first so that LAN
  experimentation does not change the shipped default behavior.
- As an operator, I want a future Tailscale/ngrok phase to reuse the same app
  host boundary instead of exposing lower-level runtime routes.

## Requirements

### Functional Requirements

1. The self-hosted/dev `cats-platform` HTTP server shall support a LAN-visible
   bind host without changing packaged Electron defaults.
2. The packaged Electron host shall keep the app host and runtime host on
   loopback by default, using desktop-specific host configuration.
3. `cats-platform` shall host runtime setup, dashboard, and playground pages
   under `/runtime/*`.
4. `cats-platform` shall proxy runtime JSON and streaming routes under
   `/runtime/api/*`.
5. Platform-hosted runtime pages shall use `/runtime/*` and `/runtime/api/*`
   instead of sending the browser directly to the runtime origin.
6. `cats-runtime` shall remain loopback-only by default for browser access use
   cases.
7. The dev web workflow shall support LAN testing without requiring packaged
   Electron changes.
8. A later tunnel/overlay phase shall terminate at `cats-platform`, not at
   `cats-runtime`.
9. Any future external-base-url or webhook-facing absolute URL setting shall be
   owned by the platform host, not by the runtime.

### Non-Functional Requirements

- **Security**: The feature is trusted-LAN / trusted-tunnel only. It must not
  silently widen runtime exposure or imply public-internet safety.
- **Architecture**: The change must preserve the `cats-platform` -> `cats-runtime`
  boundary and keep packaged Electron loopback-first.
- **Compatibility**: `cats-runtime` standalone behavior must continue to work
  unchanged on its own origin.
- **Operability**: The host-facing routes should stay same-origin so browser
  sessions and future tunnel routing remain simple.

## Design Overview

```
Phase 1 (LAN)

iPad/browser
   |
   v
cats-platform  (/ , /api/*, /runtime/*, /runtime/api/*)
   |
   v
cats-runtime   (loopback upstream)

Phase 2 (Tunnel)

browser -> Tailscale/ngrok -> cats-platform -> cats-runtime
```

The platform host owns browser ingress. Runtime pages are adapted at the host
boundary so their fetch/EventSource/navigation behavior resolves against the
platform's `/runtime/*` and `/runtime/api/*` routes. Packaged Electron keeps
using loopback-specific env overrides and does not participate in LAN hosting by
default.

## Dependencies

- `cats-platform` request routing and runtime client configuration
- `cats-runtime` runtime pages and operator APIs
- Existing desktop host env separation (`CATS_DESKTOP_*`)
- Existing runtime surface namespace decisions in ADR-036 / ADR-037

## Open Questions

- [ ] Does phase 2 need a dedicated `CATS_PUBLIC_BASE_URL`, or can that wait
      until a concrete absolute-URL consumer exists?
- [ ] Should tunnel-mode diagnostics surface the effective remote entry URL, or
      is deployment documentation enough for the first tunnel slice?
- [ ] Do we want a later host-auth layer for trusted-tunnel access, or is that
      a separate security epic?

## References

- [ADR-074](../decisions/074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md)
- [ADR-037](../decisions/037-serve-runtime-dashboard-and-playground-from-platform-host.md)
- [ADR-003](../decisions/003-electron-host-manages-local-services.md)

---

*Created: 2026-04-20*
*Author: Codex*
*Related Plan: [PLAN-067](../plans/PLAN-067-platform-browser-ingress-rollout.md)*
