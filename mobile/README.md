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

The current desktop card exposes LAN readiness and the diagnostic manifest URL.
The final Expo Go QR remains blocked on PLAN-088 Phase 1 physical-device
validation of the manifest schema and pairing URL form.
