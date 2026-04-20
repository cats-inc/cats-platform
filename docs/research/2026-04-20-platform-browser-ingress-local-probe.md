# 2026-04-20 Platform Browser Ingress Local Probe

## Summary

Validated the new platform-owned browser ingress seam on a real Windows dev
machine by binding a temporary built `cats-platform` server to `0.0.0.0:8281`
and probing it through both the machine's Wi-Fi IPv4 address and Tailscale
IPv4 address.

Both probes passed:

- `http://192.168.1.251:8281`
- `http://100.66.45.5:8281`

The probe confirmed that:

- `/api/platform/ingress` reports the expected wildcard binding
- `/runtime` and `/runtime/setup` stay reachable on the Cats origin
- `/runtime/api/health` stays reachable on the Cats origin
- common virtual adapter addresses such as WSL / Hyper-V are excluded from the
  candidate browser-entry suggestions

## Environment

- Host OS: Windows
- Existing runtime upstream: `http://127.0.0.1:3110`
- Existing packaged/app-managed Cats app remained on `127.0.0.1:8181`
- Temporary smoke server: `CATS_HOST=0.0.0.0`, `CATS_PORT=8281`

Observed interface candidates during the probe:

- Wi-Fi: `192.168.1.251`
- Tailscale: `100.66.45.5`
- Virtual adapters (excluded from browser-entry suggestions):
  - `172.23.160.1`
  - `172.21.80.1`

## Commands

The temporary server used the normal built server entrypoint:

```powershell
$env:CATS_HOST='0.0.0.0'
$env:CATS_PORT='8281'
$env:CATS_RUNTIME_BASE_URL='http://127.0.0.1:3110'
node build/server/index.js
```

Ingress probes:

```bash
npm run ingress:smoke -- --base-url http://192.168.1.251:8281
npm run ingress:smoke -- --base-url http://100.66.45.5:8281
```

## Results

Both probe runs returned:

- `GET /health` -> `200`
- `GET /api/platform/ingress` -> `200`
- `GET /runtime` -> `200`
- `GET /runtime/setup` -> `200`
- `GET /runtime/api/health` -> `200`

The real runtime did **not** redirect `GET /runtime/dashboard?bootstrap=1`; it
returned `200` directly. That differs from the stubbed route coverage used in
tests, so the smoke helper intentionally accepts either:

- `302` to `/runtime/setup`
- `200` when the runtime serves the dashboard directly

## Relevance

This is not a physical second-device validation yet, so PLAN-067 task 2.3
remains open. It does, however, materially reduce risk for the trusted LAN /
trusted overlay slice by proving the current implementation works over real
non-loopback interface addresses on this machine.
