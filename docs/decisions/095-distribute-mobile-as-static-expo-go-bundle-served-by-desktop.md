# ADR-095: Distribute Cats Mobile as a Static Expo Go Bundle Served by the Desktop

## Status

Proposed (2026-04-30)

## Context

Cats Mobile (`cats-platform/mobile/`) currently runs only through the
developer's `npx expo start` Metro bundler. Anyone outside the source
repo cannot pair a phone — they have no way to obtain or run the JS
bundle.

Three distribution paths are technically viable:

1. **Static bundle + stock Expo Go.** Pre-build the mobile JS bundle
   at Cats Desktop build time, ship it inside the desktop installer,
   serve it from cats-platform server endpoints. The user installs
   the public Expo Go app on their phone, scans a QR shown in Cats
   Desktop, Expo Go fetches the manifest + bundle from the desktop
   over LAN.
2. **Custom dev client (.ipa / .apk).** Use `eas build` to produce a
   branded Expo client. Ship the `.ipa` via TestFlight (paid Apple
   Developer Program) or sideload via Apple Configurator, ship `.apk`
   directly. Cats Desktop still serves the JS bundle the same way as
   #1, but to our own client instead of stock Expo Go.
3. **Full native production app.** `eas build --profile production`
   produces a standalone app bundled with the JS — no desktop
   manifest involvement at runtime. Distribute via App Store, Play
   Store, or direct `.apk`.

The product is in early dev. Mobile is one source tree, one developer
iterating actively. The natural priority order is:

- Get a working pair-with-phone path **today** with zero per-user
  install friction beyond "install Cats Desktop".
- Defer Apple Developer Program ($99/year) and store-submission
  overhead until there is a real user base to justify them.
- Keep `npx expo start` as the dev hot-reload loop.

## Decision

Adopt **path 1** (static bundle + stock Expo Go) as the first
distribution mechanism for Cats Mobile.

Concretely:

- A Cats Desktop installer carries the pre-built mobile JS bundle
  inside its Electron resources (`build/mobile/`). The bundle is
  produced at desktop build time by `npm run build:mobile`, which
  delegates to `cd mobile && npx expo export --platform all`.
- The cats-platform HTTP server (already running on `CATS_HOST:CATS_PORT`)
  exposes new routes that serve the Expo Go manifest plus the bundle
  + asset payloads. Call this surface `/api/mobile/`.
- The Cats Desktop renderer adds a "Mobile pairing" card under
  `Settings → Desktop`. The card displays the LAN-facing pairing
  URL plus a QR code that encodes the URL Expo Go uses to
  discover the manifest. The exact URL form is confirmed by the
  Phase 1 spike (see SPEC-099 §Open Questions Q2) — the earlier
  draft of this ADR cited `exp://${LAN_IP}:${CATS_PORT}/--/api/mobile/manifest`,
  but `--/path` is Expo's app-internal deep-link path, not a
  manifest URL, and the spec has been amended accordingly.
- The card is **gated**: it only renders when
  `CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true` is set in the env Cats
  Desktop loads (project `.env` for source builds, or a build-time
  env injection for distributed installers — see below).
- The QR is not an auth grant. It loads the mobile bundle only.
  Workspace data access is still governed by ADR-096 / SPEC-100:
  Cats Mobile must establish a mobile device session through local
  login or mobile Google OAuth before calling product-data APIs.

Distribution paths #2 and #3 remain on the roadmap for later phases.
This ADR does not preclude them; it picks the most lightweight path
for the current product stage.

### Why an env flag, not a build variant

The user asked whether the Mobile-pairing card should be controlled
by an `.env.example` flag or by a separate build artifact (a "Cats
Desktop Internal" installer that has the card, vs a public installer
that doesn't).

We chose a **runtime env flag** for these reasons:

- One installer, one binary — installer count matters: every variant
  doubles release-engineering surface (CI matrices, sign-off, support
  triage). Two artifacts is not justified at this product stage.
- The flag is opt-in (`false` by default in `.env.example`), so a
  public installer ships with the feature off unless explicitly
  enabled.
- The build pipeline can override the default at electron-builder
  time by injecting `CATS_DESKTOP_MOBILE_PAIRING_ENABLED=true` into
  the packaged installer's env layer (e.g. for a TestFlight-style
  internal build), without forking the source.
- Source-build dev workflows can set the flag in `.env` directly
  without touching distribution.

This is the same pattern already used for
`CATS_DESKTOP_FORCE_QUIT_ON_CLOSE` and
`CATS_DESKTOP_SETUP_AUDIT_PARALLEL`: opt-in env flags that gate
desktop-specific affordances without fragmenting the installer.

If a "build variant" becomes necessary later (e.g. fully separate
internal builds for paid customers), the env flag stays the
underlying gate; the variant just chooses the env injection at
package time.

## Consequences

### Positive

- Users on a clean machine install Cats Desktop, install Expo Go from
  the App Store / Play Store, scan a QR — done. No source repo, no
  Node, no Xcode, no Apple Developer account.
- Mobile dev iteration loop unchanged: developer still runs
  `npx expo start` for hot reload.
- One installer artifact. The Mobile-pairing card is opt-in via env
  flag — public builds ship with it off, internal builds can opt in
  at install time.
- No App Store / Play Store dependency. Distribution latency is the
  Cats Desktop installer release cadence, not store review.

### Negative

- **Stock Expo Go SDK alignment.** Expo Go in the App Store / Play
  Store ships with a fixed Expo SDK runtime (currently 54). The
  pre-built bundle must target the same SDK. Whenever Apple / Google
  push a newer Expo Go (which Expo updates roughly every 6 months),
  our pre-built bundle has to be re-exported on the matching SDK or
  newer Expo Go installs will refuse to load it. This is real
  ongoing maintenance.
- **No native modules beyond stock Expo Go.** Stock Expo Go ships a
  fixed set of native libraries (the ones documented at
  https://docs.expo.dev/versions/v54.0.0/). If mobile needs a native
  module that Expo Go does not bundle (e.g. native push tokens,
  biometric APIs, custom NFC readers), this distribution path
  breaks for that feature and we have to switch to path #2 or #3.
  Today's mobile dependency set is inside the stock Expo Go envelope,
  so this is fine for now.
- **LAN-only.** Pairing only works when the phone and the desktop
  are on the same LAN (or share a Tailscale/VPN that exposes the
  desktop's LAN IP). Cross-network pairing requires real tunneling
  infrastructure, which is out of scope for this ADR.
- **Separate mobile auth work.** Static bundle distribution does not
  make Expo Go a browser session. Mobile login, secure token storage,
  and bearer-session route-gate behavior are owned by ADR-096 /
  SPEC-100.
- **Desktop must be running for pairing.** Closing Cats Desktop
  takes the manifest server with it; the phone shows a connection
  error. Acceptable since the mobile app is a thin client of the
  desktop runtime anyway.

### Neutral

- Desktop's existing LAN-binding gates apply
  (`CATS_DESKTOP_APP_HOST` defaults to `127.0.0.1` per ADR-074).
  To make the manifest server reachable from the phone, the user
  must also override `CATS_DESKTOP_APP_HOST=0.0.0.0`. This is the
  same constraint as today and is documented in `.env.example`.
- Pre-built bundle is tied to the mobile package's pinned SDK
  version at build time. Bumping `expo` in `mobile/package.json`
  and re-running `expo export` is what aligns the bundle to a newer
  Expo Go runtime.

## Alternatives Considered

### Custom dev client (.ipa / .apk)

- **Pros**: insulates from stock Expo Go SDK churn (we control the
  client runtime); native modules can include anything; same desktop
  manifest server architecture works.
- **Cons**: requires Apple Developer Program ($99/year) for iOS
  distribution via TestFlight, OR Apple Configurator + UDID
  registration for ad-hoc; Android side is `.apk` only which is fine.
  Adds a second install step ("install our custom client") on top of
  "install Cats Desktop". Net: more work for the user, more revenue
  + admin cost for us.
- **Why deferred**: not justified at current product stage.
  Reconsider when we hit the first stock-Expo-Go limitation or when
  paid users want a branded client.

### Full native production app

- **Pros**: standalone app, no desktop dependency at runtime, store
  presence, push notifications work natively.
- **Cons**: full Apple Developer + App Store overhead; release
  cadence gated by store review; the mobile app becomes a separate
  product with its own update lifecycle, decoupling it from the
  desktop installer the team already controls.
- **Why deferred**: orthogonal to "let me pair my phone today".
  Reconsider once the mobile shell stabilises and there's a real
  user base.

### "Cats Desktop Internal" build variant

- **Pros**: hard-codes the Mobile-pairing card on for internal users,
  off for public users. No env flag to manage.
- **Cons**: doubles installer artifacts (two builds, two CI runs,
  two sign-offs, two telemetry funnels). Fragments support
  ("which Cats Desktop do you have?"). Single env flag covers the
  same need with one installer.
- **Why rejected**: env flag is the simpler equivalent. A build
  variant can layer on top of the env flag later if real
  segmentation appears.

## References

- [SPEC-099: Mobile pairing manifest server in Cats Desktop](../specs/SPEC-099-mobile-pairing-manifest-server.md)
- [PLAN-088: Mobile pairing manifest server rollout](../plans/PLAN-088-mobile-pairing-manifest-server-rollout.md)
- [SPEC-095: Cats Mobile Shell — Five Tabs and Product Sidebar Variants](../specs/SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md)
- [PLAN-084: Cats Mobile Shell Rollout](../plans/PLAN-084-cats-mobile-shell-rollout.md)
- [ADR-096: Adopt Platform-Owned Auth Sessions with Google as an Identity Provider](./096-adopt-platform-owned-auth-sessions-with-google-as-identity-provider.md)
- [SPEC-100: Platform Authentication, Admin Bootstrap, and Google Identity](../specs/SPEC-100-platform-authentication-admin-bootstrap-and-google-identity.md)
- [ADR-074: Keep browser ingress at platform host and phase LAN before tunnels](./074-keep-browser-ingress-at-platform-host-and-phase-lan-before-tunnels.md)
- Expo Updates self-hosting: https://docs.expo.dev/eas-update/serving-updates/
- Expo CLI export: https://docs.expo.dev/distribution/publishing-websites/
