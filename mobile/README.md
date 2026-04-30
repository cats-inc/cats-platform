# Cats Mobile

Cats Mobile is the Expo shell that the desktop app can bundle for LAN-scoped
mobile pairing.

## Build

From `cats-platform/`:

```bash
npm run build:mobile:check
```

That installs `mobile/` dependencies, runs the mobile boundary/typecheck, and
exports iOS + Android bundles into `build/mobile/`.

## Desktop Pairing

Desktop pairing is documented in
[`docs/setup-guide.md`](../docs/setup-guide.md#mobile-pairing-desktop).

The desktop card exposes LAN readiness, the diagnostic manifest URL, and an
Expo Go QR (`exp://<LAN-IP>:8181`). Expo Go resolves that QR through the
desktop server, downloads the bundled Cats Mobile export, and receives the
desktop LAN base URL in the manifest so the first launch can connect without
manual URL entry.
