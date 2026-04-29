# PLAN-088: Mobile Pairing Manifest Server Rollout

## Status

Draft (2026-04-30)

## Related

- Decision: [ADR-095](../decisions/095-distribute-mobile-as-static-expo-go-bundle-served-by-desktop.md)
- Spec: [SPEC-099](../specs/SPEC-099-mobile-pairing-manifest-server.md)

## Overview

Phased delivery of the static-bundle Expo Go pairing path. Each
phase is intended to land as a single PR-sized commit set.

```
Phase 1  Manifest format spike + open questions
Phase 2  Build chain — npm run build:mobile + electron-builder bundling
Phase 3  Server endpoints (gated, off by default)
Phase 4  Settings → Desktop "Mobile pairing" card + QR
Phase 5  Env flag wiring + .env.example update + docs
Phase 6  End-to-end smoke on real iOS + Android Expo Go
```

Phases 2-5 are mostly independent except Phase 5 depends on Phase 3
shipping the server side. Phase 1 must come first because it
resolves the four Open Questions in SPEC-099 that affect every
later phase.

## Phase 1 — Manifest format and pairing-URL spike

**Goal**: confirm both the manifest schema AND the QR URL form
Expo Go SDK 54 expects against a non-EAS host, before writing
real code. The 2026-04-30 review escalated these from
"single-file format question" to "blocker for the rest of the
plan".

- [ ] Stand up a throwaway HTTP server (~30-line Express or
      Node http) that serves stub manifests under multiple
      candidate schemas (classic + Updates v1) and hand-built
      bundles.
- [ ] Test scanning from physical iOS Expo Go and Android Expo Go.
- [ ] For each scenario, capture the exact URL Expo Go fetched
      manifest from, the request headers it sent
      (`expo-platform`, `expo-runtime-version`,
      `expo-protocol-version`), and the response shape it accepted.
- [ ] Resolve SPEC-099 Open Questions Q1–Q5 with concrete answers.
- [ ] Update SPEC-099 §FR-8 with the chosen schema (with a JSON
      example), §FR-12 with the chosen QR URL form, and §Open
      Questions to mark each one resolved.

**Deliverable**: SPEC-099 Open Questions all resolved; a working
proof-of-concept HTTP server + bundle that loads on real iOS and
Android Expo Go via the chosen URL form.

## Phase 2 — Build chain

**Goal**: produce `cats-platform/build/mobile/` as part of
`npm run build`, and bundle it into the desktop installer.

The repo is **not an npm workspace**: `cats-platform/` and
`cats-platform/mobile/` are independent packages with separate
`node_modules/`. The build chain has to install mobile deps
itself instead of assuming they exist.

- [ ] Add a `mobile:install` script to `cats-platform/package.json`:
      `npm ci --prefix mobile` (or `npm install --prefix mobile`
      for first-time scaffolding). Document that this assumes
      Node + npm are already on the build machine.
- [ ] Add a `build:mobile` script that depends on
      `mobile:install` first, then runs
      `cd mobile && npx expo export --platform all --output-dir
      ../build/mobile` (exact flags subject to Phase 1 findings).
- [ ] Hook `build:mobile` into `npm run build` (the existing
      pre-package build pipeline) so a clean CI / fresh desktop
      build does not need a separate manual step.
- [ ] Add a CI preflight check: `mobile:install` succeeds, the
      mobile workspace's `npm run typecheck` is clean, and
      `build/mobile/` is non-empty after `build:mobile`.
- [ ] Update `electron-builder` config to include `build/mobile/`
      in `extraResources`. Confirm path resolution at runtime
      (`process.resourcesPath/mobile/`).
- [ ] Confirm bundle size impact on installer (.dmg / .exe / .deb)
      and add an ADR amendment if it's > 50 MB.
- [ ] Document the SDK-bump → re-export path in
      `cats-platform/docs/setup-guide.md`, including the
      `mobile:install` requirement on a clean machine.

**Deliverable**: `git clone <repo> && cd cats-platform && npm ci
&& npm run build` (with no manual `cd mobile && npm install`
step) produces an installer that has the mobile bundle on disk
after install.

## Phase 3 — Server endpoints

**Goal**: serve the manifest + hash-addressed bundle + assets from
cats-platform server, per the routes defined in SPEC-099 §FR-4.
Gated; default off.

- [ ] Add `cats-platform/src/server/routes/mobileManifest.ts` (or
      similar) implementing the routes from SPEC-099 §FR-4
      (`/api/mobile/manifest`, `/api/mobile/bundle/{platform}/{hash}.js`,
      `/api/mobile/assets/{hash}`). Exact route count and method
      list follow whatever the §FR-4 amendment lands on; the plan
      does not pin a number.
- [ ] Resolve the on-disk path: dev mode reads
      `cats-platform/build/mobile/`; packaged mode reads
      `process.resourcesPath/mobile/` (or whatever electron-builder
      decides — confirmed in Phase 2).
- [ ] Implement the manifest generator using the schema chosen in
      Phase 1 (FR-8). The generator reads `expo-platform`,
      `expo-runtime-version`, and `expo-protocol-version` headers
      (FR-8a) and uses the incoming request's host header (FR-9)
      to build the **launch-asset URL** plus the asset URLs that
      the manifest body returns. There is no separate "bundle URL"
      concept outside that launch-asset URL.
- [ ] Wire the gate: when
      `CATS_DESKTOP_MOBILE_PAIRING_ENABLED !== 'true'`, every
      `/api/mobile/*` route returns 404 (FR-7).
- [ ] Cache headers per FR-6 (manifest `no-store`, hash-addressed
      bundle/asset `public, max-age=31536000, immutable`).
- [ ] Tests:
      - [ ] Manifest fetched with `expo-platform: ios` returns
            an iOS launch-asset URL; same request with
            `expo-platform: android` returns an Android
            launch-asset URL.
      - [ ] Missing or unsupported `expo-runtime-version` /
            `expo-protocol-version` headers are handled per the
            schema chosen in Phase 1 (e.g. negotiated default vs
            error).
      - [ ] Every `/api/mobile/*` route returns 404 when the
            flag is off.
      - [ ] Launch-asset URL host matches the request host
            (loopback vs LAN IP).
      - [ ] Hash-addressed bundle and asset URLs serve the
            corresponding file from `<resources>/mobile/`.

**Deliverable**: a header-aware integration test (e.g. via
`supertest` against the in-process Express app) that fetches
`/api/mobile/manifest` with `expo-platform: ios` *and*
`expo-platform: android`, confirms the response body shape
matches the Phase 1 schema, and successfully resolves the
returned launch-asset URL plus one asset URL. A plain
`curl /api/mobile/manifest` is **not** a valid deliverable
because Expo Go's per-platform discrimination relies on
request headers.

## Phase 4 — Settings → Desktop "Mobile pairing" card

**Goal**: render the card in the desktop renderer, gated on the
same flag, with a working QR.

- [ ] Add the card component under
      `cats-platform/src/app/renderer/settings/PlatformSettingsDesktop.tsx`
      (or wherever the Desktop settings tab lives).
- [ ] Pull the gate value through the existing `AppShellPayload`
      desktop-feature plumbing so the renderer knows whether to
      show the card without an extra fetch.
- [ ] Add a small QR generator (renderer-side, pure JS — proposed
      `qrcode`).
- [ ] Compute the LAN-facing host server-side per SPEC-099 FR-13:
      the desktop main process calls `os.networkInterfaces()`,
      filters to a non-loopback IPv4 candidate, and ships both
      the LAN IP and the gate flag through the AppShell payload.
      The renderer reads them from the payload only — it never
      calls `os.networkInterfaces()` directly. If no candidate
      exists, the payload signals "no LAN candidate" so the card
      can fall through to the FR-14 escape hatch.
- [ ] Implement the loopback-only-bind escape hatch (FR-13, FR-14):
      copy-button for `CATS_DESKTOP_APP_HOST=0.0.0.0`.

**Deliverable**: the card renders end-to-end with a working QR
when both flags align.

## Phase 5 — Env flag + docs

**Goal**: ship the env flag in `.env.example` plus the operator-
facing documentation that explains the feature.

- [ ] Add `CATS_DESKTOP_MOBILE_PAIRING_ENABLED=false` to
      `.env.example` with a multi-line comment covering: what it
      enables, the LAN-bind requirement, the SDK alignment
      caveat.
- [ ] Update `cats-platform/docs/setup-guide.md` with a new
      "Mobile pairing" section covering: install Expo Go, enable
      the flag, restart, scan the QR.
- [ ] Update `cats-platform/mobile/` README (if any) cross-linking
      to this flow.
- [ ] If `.env.example` is bundled into installers, confirm the
      flag default reaches packaged builds.

**Deliverable**: a new operator can enable the feature from a clean
checkout without reading source.

## Phase 6 — End-to-end smoke

**Goal**: a real iPhone and a real Android phone can pair against
a Mac running `npm run build && npm run start` (or a packaged
installer running on the same machine).

- [ ] Build the installer locally on macOS.
- [ ] Install to a clean test directory; launch.
- [ ] Enable the flag (via `.env` override or installer-time env).
- [ ] Open Settings → Desktop → Mobile pairing.
- [ ] Scan QR with Expo Go on iOS — confirm bundle loads, all five
      tabs render, real `/api/app-shell` data loads after the user
      sets the desktop URL.
- [ ] Scan QR with Expo Go on Android — same checklist.
- [ ] Document any platform-specific quirks (e.g. Android needing
      cleartext traffic permission, iOS local-network prompt).

**Deliverable**: a checklist passed on both platforms; ready to
flip the env flag for the first internal-release artifact.

## Files to create / modify

| Path | Action |
|---|---|
| `cats-platform/docs/decisions/095-...md` | created (ADR-095) |
| `cats-platform/docs/specs/SPEC-099-...md` | created (this slice) |
| `cats-platform/docs/plans/PLAN-088-...md` | created (this slice) |
| `cats-platform/package.json` | add `build:mobile` script, hook into `build` |
| `cats-platform/electron-builder.yml` (or equivalent) | bundle `build/mobile/` into resources |
| `cats-platform/src/server/routes/mobileManifest.ts` | new — manifest + bundle + assets routes |
| `cats-platform/src/server/...` (route registration) | wire the new routes |
| `cats-platform/src/config.ts` | parse `CATS_DESKTOP_MOBILE_PAIRING_ENABLED` |
| `cats-platform/src/products/shared/api/workspaceContracts.ts` | extend `PlatformDesktopPreferences` (or similar) with the gate flag + detected LAN IP |
| `cats-platform/src/app/renderer/settings/PlatformSettingsDesktop.tsx` | new card |
| `cats-platform/.env.example` | add the env var with comment |
| `cats-platform/docs/setup-guide.md` | new "Mobile pairing" section |

## Risks / mitigations

- **Manifest format drift**: Expo Go SDK changes break the
  manifest contract. *Mitigation*: SDK bump triggers a re-export
  (Phase 2) and Phase 1 spike confirms format. Document in
  setup-guide and operator notes.
- **Bundle size grows installer**: large mobile assets add to .dmg /
  .exe size. *Mitigation*: `expo export` already does
  Hermes-targeted minification + asset deduplication. If size becomes
  a problem, gate the bundle into a separate optional download.
- **Renderer / server gate desync**: card renders but server returns
  404. *Mitigation*: gate flag flows through AppShell payload; both
  layers read the same canonical value.
- **LAN bind misconfiguration**: user enables the flag but
  `CATS_DESKTOP_APP_HOST=127.0.0.1` keeps server loopback-only.
  *Mitigation*: card detects this state explicitly (FR-14) and
  guides the user.
- **No auth on manifest**: anyone on the LAN can hit
  `/api/mobile/manifest` and pull the bundle. *Mitigation*: the
  bundle is the same artifact users would obtain from a public
  installer. No PII / secrets in the bundle. Future hardening is a
  separate spec.

## Out of scope

- Pairing across networks (tunnel / relay) — separate spec.
- Custom dev client (`.ipa` / `.apk`) — separate spec triggered
  by stock-Expo-Go limitation.
- Push notifications — separate spec.
- Per-device pairing tokens — separate spec.
- Build-variant CI matrix — only revisit if env flag proves
  insufficient for distribution segmentation.
