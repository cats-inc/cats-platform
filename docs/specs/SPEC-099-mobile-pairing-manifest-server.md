# SPEC-099: Mobile Pairing Manifest Server in Cats Desktop

## Status

Draft (2026-04-30)

## Related

- Decision: [ADR-095](../decisions/095-distribute-mobile-as-static-expo-go-bundle-served-by-desktop.md)
- Plan: [PLAN-088](../plans/PLAN-088-mobile-pairing-manifest-server-rollout.md)
- Mobile shell context: [SPEC-095](./SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md)

## Summary

Cats Desktop ships the mobile JS bundle inside its installer and
serves it to stock Expo Go via a manifest endpoint. A new
"Mobile pairing" card under `Settings → Desktop` displays a QR
code that Expo Go scans to load the bundle. Pairing works on a
clean machine — no source repo, no Node, no Xcode, no Apple
Developer account.

## Goals

- A user with `Cats Desktop` installed and `Expo Go` installed on
  their phone can pair the two by scanning one QR code, with no
  intermediate setup.
- Cats Desktop ships one installer artifact. Visibility of the
  Mobile pairing affordance is controlled by a runtime env flag,
  defaulting to off.
- Mobile dev iteration (`npx expo start`) keeps working unchanged.
- Bundle artifacts are produced as part of the existing Cats
  Desktop build chain and committed only to release artifacts, not
  to the source tree.

## Non-Goals

- Cross-network pairing (requires tunnel / relay infrastructure).
- Hot reload of the bundle for end users (intentionally absent —
  static bundle).
- Custom Expo dev client (`.ipa` / `.apk` distribution). Tracked
  separately if stock Expo Go limitations bite.
- Push notification delivery (orthogonal; out of scope).
- Per-device authorisation / pairing tokens. The manifest endpoint
  is open to anyone who can reach the LAN port. Future hardening
  belongs in a separate spec.
- Mobile-side build pipeline beyond `expo export`. EAS Build,
  TestFlight, App Store submission stay deferred per ADR-095.
- Re-export automation for SDK upgrades. Triaged manually until
  the cadence justifies CI work.

## Functional Requirements

### Build

- **FR-1.** A new `npm run build:mobile` script in `cats-platform/`
  produces `cats-platform/build/mobile/` containing the static
  Expo export. Implementation delegates to `cd mobile && npx expo
  export --platform all`.
- **FR-2.** `npm run build` (existing top-level desktop build)
  invokes `build:mobile` so a single `npm run build` produces a
  ready-to-package installer with the bundle inside.
- **FR-3.** `electron-builder` config bundles `build/mobile/` into
  the packaged installer's resources, accessible at
  `<resources>/mobile/` at runtime.

### Server

- **FR-4.** cats-platform server exposes routes under `/api/mobile/`:
  - `GET /api/mobile/manifest` — returns a manifest JSON for the
    requesting client. The exact schema and the per-platform
    discrimination mechanism are determined by Phase 1 spike (see
    Open Questions). Likely shape: a single endpoint that reads
    Expo Go's `expo-platform`, `expo-runtime-version`, and
    `expo-protocol-version` request headers and returns the
    manifest variant the client negotiates for.
  - `GET /api/mobile/bundle/{platform}/{hash}.js` — returns the
    JS bundle. URLs are content-hash addressed: the path encodes
    the bundle hash so the same URL is bit-for-bit immutable. The
    manifest's launch-asset URL points at the current hash.
  - `GET /api/mobile/assets/{hash}` — returns the asset matching
    the hash. Same content-hash addressing.
- **FR-5.** All routes serve from `<resources>/mobile/` at runtime
  (or `cats-platform/build/mobile/` in dev). Routes 404 cleanly if
  the bundle is absent.
- **FR-6.** Cache headers are aligned with content addressability:
  - The `/api/mobile/manifest` response sets
    `Cache-Control: no-store` because the manifest is computed per
    request (host echo in FR-9, platform discrimination in FR-8a).
  - The hash-addressed bundle and asset routes set
    `Cache-Control: public, max-age=31536000, immutable` since the
    URL itself changes whenever content changes.
  - There is no stable "current bundle" URL alongside the
    hash-addressed one — clients always reach the bundle through
    the manifest's launch-asset URL, which the server rebuilds
    per request from the on-disk metadata.
- **FR-7.** The server returns a manifest only when
  `CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true`. Otherwise all
  `/api/mobile/*` routes return `404 Not Found`. Disabling the
  feature must be sufficient to take it off the network surface,
  not just hide the UI.

### Manifest format

- **FR-8.** *(SCHEMA TBD — Phase 1 spike).* The manifest schema is
  not pre-locked in this Draft. The Expo ecosystem has two extant
  manifest formats:
  - **Classic (legacy)** — the older Expo Go format
    (`name` / `slug` / `version` / `bundleUrl` / `iconUrl` /
    `splash` / `extra`).
  - **Updates v1 (current)** — the modern self-hosted protocol
    (`id` / `createdAt` / `runtimeVersion` / `launchAsset` /
    `assets[]` / `metadata` / signed envelope).
  Phase 1 spike confirms which one stock Expo Go SDK 54 actually
  fetches against a non-EAS host, including any header/protocol
  negotiation, and replaces this FR-8 with a concrete schema
  example. Until then the implementation owner should treat
  schema choice as an Open Question.
- **FR-8a.** *(Platform discrimination).* The manifest endpoint is
  a single URL; per-platform variants come from request headers.
  Expo Go sends `expo-platform: ios` (or `android`) on its
  manifest fetch. The server reads this header and emits the
  matching launch-asset URL inside the manifest body. Query-string
  variants like `?platform=ios` are NOT used in the QR / pairing
  URL — the QR encodes one host-only URL, and the platform is
  resolved server-side per request.
- **FR-9.** The manifest's launch-asset URL and asset URLs are
  generated using the **incoming request's host header** so that
  whether the request reached us via `localhost`, the LAN IP, or a
  Tailscale/tunnel address, the manifest always points back to the
  same origin. Without this, Expo Go fetches the manifest over LAN
  but tries to fetch the bundle over `127.0.0.1` and fails.
- **FR-10.** The manifest format is versioned alongside the SDK.
  Bumping `expo` in `mobile/package.json` and re-running
  `npm run build:mobile` is the only step required to align with a
  newer Expo Go runtime — assuming the manifest schema choice in
  FR-8 stays valid for that SDK. SDK upgrades that change the
  protocol require re-running the Phase 1 spike before the
  artifact is shipped.

### Settings UI

- **FR-11.** A new "Mobile pairing" card lives in
  `Settings → Desktop`. Visibility is gated by
  `CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true` (read at app start,
  not hot-reloaded).
- **FR-12.** When visible, the card shows:
  - Section title "Mobile pairing".
  - The current LAN-facing pairing URL. *(URL FORMAT TBD —
    Phase 1 spike).* The earlier Draft used
    `exp://${LAN_IP}:${CATS_PORT}/--/api/mobile/manifest`, but
    `--/path` in `exp://` URLs is Expo's app-internal deep-link
    path, not a manifest endpoint locator — Expo Go would treat
    `/api/mobile/manifest` as a route to navigate to inside the
    bundle, not as the manifest URL. The actual URL Expo Go
    expects is determined by the Phase 1 spike (a likely
    candidate is plain `exp://${LAN_IP}:${CATS_PORT}` with the
    server serving the manifest at a stock-Expo-Go-compatible
    path, but this needs to be confirmed against real devices).
  - A QR code rendered from that URL.
  - Step-by-step copy: "Install Expo Go on your phone, scan this
    QR with the Camera app or Expo Go's scanner."
- **FR-13.** LAN IP detection happens server-side in the desktop
  host: the desktop main process calls `os.networkInterfaces()`,
  filters to a non-loopback IPv4 candidate, and ships the result
  to the renderer through the existing `AppShellPayload`
  desktop-feature plumbing. The renderer never calls
  `os.networkInterfaces()` directly. If no candidate is found,
  the payload carries an explicit "no LAN candidate" signal and
  the card shows a recoverable error explaining that the desktop
  is bound to loopback only
  (`CATS_DESKTOP_APP_HOST=127.0.0.1`).
- **FR-14.** The card surfaces the desktop bind state explicitly:
  if the server is loopback-only, the QR is hidden and the card
  shows a one-click button to copy the canonical override
  (`CATS_DESKTOP_APP_HOST=0.0.0.0`) to the user's clipboard with a
  short note that they need to restart Cats Desktop.

### Env / config

- **FR-15.** A new env var `CATS_DESKTOP_MOBILE_PAIRING_ENABLED`
  ships in `.env.example` with the value `false`, plus a comment
  explaining that flipping it to `true` exposes the manifest
  routes and reveals the Settings card. The flag is read by both
  server (route gating) and renderer (card gating) via existing
  config plumbing.

## Non-Functional Requirements

- **NFR-1.** No new persistent state. The feature is stateless —
  bundle is on disk, manifest is computed per request.
- **NFR-2.** Manifest format must align with Expo Go SDK 54. SDK
  bumps require a re-export and a manual smoke test before
  release; protocol-changing SDK upgrades also require re-running
  the Phase 1 spike (FR-8 / FR-12 URL form).
- **NFR-3.** Off by default. Opt-in.
- **NFR-4.** No new dependencies in the runtime cats-platform
  server. QR rendering happens in the renderer using a small
  pure-JS QR generator (e.g. `qrcode` or `qrcode-svg`).
- **NFR-5.** Bundle and asset URLs are content-hash addressed
  (path includes hash); the manifest URL is no-cache. There is no
  stable URL that returns mutating content — every URL is either
  immutable-per-content or no-store. This avoids the
  "stable URL + immutable cache" trap where a stale CDN / phone /
  proxy cache pins a previous bundle byte stream.

## Design Overview

```
                                                   ┌─────────────────┐
[Cats Desktop installer]                           │   Phone         │
├── build/server/...                                │   Expo Go       │
├── build/desktop/...                               │                 │
└── build/mobile/                                   │  scans QR ──┐   │
    ├── _expo/static/js/ios/index-{hash}.js                        │   │
    ├── _expo/static/js/android/index-{hash}.js                    │   │
    ├── metadata.json                                              │   │
    └── assets/{hash}.{ext}                                        │   │
                                                                   ▼   │
[Cats Desktop runtime]                                                 │
                                                                       │
HTTP server on CATS_HOST:CATS_PORT (LAN-bound)                         │
  GET /api/mobile/manifest         ←──── from Expo Go ──────────────── ┘
    (reads expo-platform / expo-runtime-version /
     expo-protocol-version request headers; emits the
     hash-addressed launch-asset URL inside the body)
  GET /api/mobile/bundle/{platform}/{hash}.js
  GET /api/mobile/assets/{hash}
                                                                       
Renderer process (Settings → Desktop)
  shows Mobile pairing card
  receives LAN IP + gate flag via AppShellPayload
  renders QR for the pairing URL form chosen in Phase 1 spike
  (TBD — see Open Questions Q2; the earlier --/path draft
   was wrong)
```

## Open Questions

The five questions below (Q1–Q5) all need concrete answers
before any server / renderer code lands. Q1 and Q2 were
escalated by the 2026-04-30 review from "single-format / single
URL question" to "blocker for the rest of the plan"; the rest
were already in scope. PLAN-088 Phase 1 owns triage and is the
gate for Phases 2–6.

- **Q1.** *(SCHEMA — escalated.)* Confirm which manifest format
  stock Expo Go SDK 54 accepts when served by a non-EAS host:
  legacy classic (`name`/`slug`/`version`/`bundleUrl`/...) or
  Updates v1 (`id`/`createdAt`/`runtimeVersion`/`launchAsset`/
  `assets`/...). The Expo Updates docs reference the latter; the
  classic format may be deprecated for SDK 54 stock Expo Go.
  Update FR-8 with the chosen schema + a concrete JSON example
  before implementation.
- **Q2.** *(QR URL FORM — escalated.)* Confirm the URL form Expo
  Go expects in the QR. `exp://host:port/--/path` is Expo's
  app-internal deep-link path syntax, not a manifest URL — the
  earlier Draft mis-cited it. Likely correct forms include plain
  `exp://host:port` (with the server serving manifest at a stock
  path), or `exp+https://host:port/path` for self-hosted
  Updates. Test against real iOS + Android Expo Go and update
  FR-12.
- **Q3.** Confirm whether the manifest needs
  `expo-protocol-version: 0` vs `1` headers to be honoured (Expo
  Go negotiates protocol version via request headers in some
  releases).
- **Q4.** Whether the bundled `app.json` needs `android.package`
  and `ios.bundleIdentifier` fields for stock Expo Go to load the
  bundle, or whether those are unused in stock-Expo-Go context.
- **Q5.** Whether `extra.baseUrl` injection at manifest time
  belongs in this spec or in a follow-up. Today the mobile client
  reads `baseUrl` from AsyncStorage; if the desktop knows its own
  baseUrl it can pre-populate that on first launch.

## References

- [ADR-095](../decisions/095-distribute-mobile-as-static-expo-go-bundle-served-by-desktop.md)
- [PLAN-088](../plans/PLAN-088-mobile-pairing-manifest-server-rollout.md)
- [SPEC-095](./SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md)
- Expo CLI export reference: https://docs.expo.dev/distribution/publishing-websites/
- Expo Updates self-hosting protocol: https://docs.expo.dev/eas-update/serving-updates/
