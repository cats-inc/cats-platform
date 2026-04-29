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
  - `GET /api/mobile/manifest` — returns the Expo manifest JSON
    (see Manifest format below).
  - `GET /api/mobile/index.bundle?platform=ios` — returns the iOS
    JS bundle.
  - `GET /api/mobile/index.bundle?platform=android` — returns the
    Android JS bundle.
  - `GET /api/mobile/assets/:hash` — returns the asset matching the
    hash.
- **FR-5.** All routes serve from `<resources>/mobile/` at runtime
  (or `cats-platform/build/mobile/` in dev). Routes 404 cleanly if
  the bundle is absent.
- **FR-6.** Routes set `Cache-Control: no-store` on the manifest
  and `Cache-Control: public, max-age=31536000, immutable` on the
  hash-named bundle / asset URLs.
- **FR-7.** The server returns a manifest only when
  `CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true`. Otherwise the routes
  return `404 Not Found`. Disabling the feature must be sufficient
  to take it off the network surface, not just hide the UI.

### Manifest format

- **FR-8.** The manifest returned at
  `GET /api/mobile/manifest?platform=ios|android` matches the
  schema Expo Go SDK 54 expects from a self-hosted manifest:
  - `name`, `slug`, `version` derived from `mobile/app.json`.
  - `bundleUrl` absolute URL pointing at
    `${baseUrl}/api/mobile/index.bundle?platform=${platform}`.
  - `iconUrl` and `splash` if defined in `app.json`.
  - `extra` carries arbitrary fields the bundle reads at runtime
    (e.g. baseUrl pre-populated for the mobile API client).
- **FR-9.** The manifest's `bundleUrl` and asset URLs are
  generated using the **incoming request's host header** so that
  whether the request reached us via `localhost`, the LAN IP, or a
  Tailscale/tunnel address, the manifest always points back to the
  same origin. (Without this, Expo Go fetches the manifest over
  LAN but tries to fetch the bundle over `127.0.0.1` and fails.)
- **FR-10.** The manifest format is versioned alongside the SDK.
  Bumping `expo` in `mobile/package.json` and re-running
  `npm run build:mobile` is the only step required to align with a
  newer Expo Go runtime.

### Settings UI

- **FR-11.** A new "Mobile pairing" card lives in
  `Settings → Desktop`. Visibility is gated by
  `CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true` (read at app start,
  not hot-reloaded).
- **FR-12.** When visible, the card shows:
  - Section title "Mobile pairing".
  - The current LAN-facing pairing URL
    (`exp://${LAN_IP}:${CATS_PORT}/--/api/mobile/manifest`).
  - A QR code rendered from that URL.
  - Step-by-step copy: "Install Expo Go on your phone, scan this
    QR with the Camera app or Expo Go's scanner."
- **FR-13.** The card auto-detects the LAN IP using
  `os.networkInterfaces()` filtered to a non-loopback IPv4
  candidate. If no candidate is found, the card shows a
  recoverable error explaining that the desktop is bound to
  loopback only (`CATS_DESKTOP_APP_HOST=127.0.0.1`).
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
  release.
- **NFR-3.** Off by default. Opt-in.
- **NFR-4.** No new dependencies in the runtime cats-platform
  server. QR rendering happens in the renderer using a small
  pure-JS QR generator (e.g. `qrcode` or `qrcode-svg`).
- **NFR-5.** Bundle assets must be content-addressable so an old
  cached fetch from a previous Cats Desktop install of a bundle
  with a different hash never gets returned for a new request.
  Hash-named files satisfy this; manifest cache must be
  `no-store`.

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
  GET /api/mobile/index.bundle
  GET /api/mobile/assets/:hash
                                                                       
Renderer process (Settings → Desktop)
  shows Mobile pairing card
  computes exp://${LAN}:${PORT}/--/api/mobile/manifest
  renders QR
```

## Open Questions

- **Q1.** Confirm exact manifest format Expo Go SDK 54 accepts when
  served by a non-EAS host. Reference the runtime version field
  matching constraints (`expo-runtime-version`).
- **Q2.** Whether the manifest needs the
  `expo-protocol-version: 0` and `expo-protocol-version: 1`
  variants present (some Expo Go releases negotiate the protocol
  version via headers).
- **Q3.** Whether the bundled `app.json` needs `android.package`
  and `ios.bundleIdentifier` fields for stock Expo Go to load the
  bundle, or whether those are unused in stock-Expo-Go context.
- **Q4.** Whether `extra.baseUrl` injection at manifest time
  belongs in this spec or in a follow-up. Today the mobile client
  reads `baseUrl` from AsyncStorage; if the desktop knows its own
  baseUrl it can pre-populate that on first launch.

These get triaged in PLAN-088 Phase 1.

## References

- [ADR-095](../decisions/095-distribute-mobile-as-static-expo-go-bundle-served-by-desktop.md)
- [PLAN-088](../plans/PLAN-088-mobile-pairing-manifest-server-rollout.md)
- [SPEC-095](./SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md)
- Expo CLI export reference: https://docs.expo.dev/distribution/publishing-websites/
- Expo Updates self-hosting protocol: https://docs.expo.dev/eas-update/serving-updates/
