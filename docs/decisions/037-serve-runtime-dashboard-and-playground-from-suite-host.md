# ADR-037: Serve Runtime Dashboard and Playground from Suite Host

> When packaged as an Electron app, cats-runtime's dashboard and playground
> pages are served by cats' HTTP server on the same port, under
> `/runtime/dashboard` and `/runtime/playground`, with runtime JSON exposed
> under `/runtime/api/*` rather than mixed into `/api/*`.

## Status

Proposed

## Date

2026-03-24

## Context

`cats` and `cats-runtime` are separate npm packages with separate HTTP
servers. In development, they run on different ports (e.g., cats on 3000,
cats-runtime on 3100).

`cats-runtime` ships two self-contained HTML pages:

- `public/index.html` — **Dashboard**: provider status, session monitoring,
  health overlay
- `public/playground.html` — **Playground**: multi-agent chat interface for
  testing runtime sessions directly

Both files are fully self-contained (inline CSS, CDN-loaded JS), have no
build step, and are served via `readFileSync()` in `cats-runtime/src/http/app.ts`.

When the final product is packaged as an Electron app, users should see a
single application on a single port. Having cats-runtime's dashboard on a
separate port is an implementation detail that should not leak to the user.

## Decision

### 1. Copy runtime pages into Electron resource directory at build time

```
electron-dist/
  cats-platform/dist/              ← cats Vite build output (React SPA)
  runtime-pages/          ← copied from cats-runtime/public/
    dashboard.html
    playground.html
```

The build/packaging script copies `cats-runtime/public/*.html` into a known
location relative to the Electron app resources.

### 2. Cats server serves these pages under the runtime route tree

```typescript
// app/server/index.ts
if (url.pathname === '/runtime/dashboard') {
  const html = readFileSync(
    path.join(RUNTIME_PAGES_ROOT, 'dashboard.html'),
    'utf-8',
  );
  sendBinary(response, 200, Buffer.from(html), 'text/html; charset=utf-8');
  return;
}

if (url.pathname === '/runtime/playground') {
  const html = readFileSync(
    path.join(RUNTIME_PAGES_ROOT, 'playground.html'),
    'utf-8',
  );
  sendBinary(response, 200, Buffer.from(html), 'text/html; charset=utf-8');
  return;
}
```

### 3. Runtime pages and runtime JSON live under separate subtrees

URL namespace rules:

- `/` — cats React SPA (Chat / Work / Code)
- `/runtime/dashboard` — runtime dashboard (static HTML)
- `/runtime/playground` — runtime playground (static HTML)
- `/runtime/api/*` — runtime JSON proxied or hosted by the suite server
- `/api/*` — JSON API endpoints only

This creates one dedicated namespace for runtime tools without putting HTML
pages under `/api/*` or scattering operator routes across the root.

### 4. Runtime API access uses a suite-owned `/runtime/api/*` seam

The dashboard and playground make `fetch()` calls to cats-runtime's API
(e.g., `/health`, `/sessions`, `/providers`).

Cats server proxies `/runtime/api/*` to cats-runtime:

```
GET /runtime/api/health    →  proxy to  http://localhost:3100/health
GET /runtime/api/sessions  →  proxy to  http://localhost:3100/sessions
```

Dashboard/playground `fetch()` calls use the suite-owned `/runtime/api/`
prefix. Users see only one port and the runtime HTML pages stay colocated with
their runtime JSON namespace.

### 5. Suite shell can link to these pages

The product switcher or sidebar can include navigation links:

```
┌─────────────────┐
│ 🐱 Cats  Chat ▾ │
│─────────────────│
│   Chat          │
│   Work          │
│   Code          │
│   ──────────    │
│   Dashboard     │  ← opens /runtime/dashboard
│   Playground    │  ← opens /runtime/playground
└─────────────────┘
```

These are full-page navigations (not SPA routes) since they load separate
HTML files. The browser's back button returns to the SPA.

## Consequences

### Positive

- Users see one application on one port in the Electron app
- Runtime dashboard and playground are accessible without knowing
  cats-runtime's port
- URL scheme is clean — runtime tools live under `/runtime/*`, suite APIs under
  `/api/*`
- Runtime HTML and runtime JSON now share one dedicated namespace

### Negative

- Build/packaging script must copy HTML files from cats-runtime to the
  Electron resource directory
- If cats-runtime updates its pages, the Electron app must be rebuilt
- Runtime pages must be patched to call `/runtime/api/*` instead of raw runtime
  paths when suite-hosted

### Neutral

- This ADR does not change cats-runtime's standalone behavior — it still
  serves its own pages on its own port when running independently
- This ADR does not require the dashboard/playground to be converted to
  React or integrated into the SPA
- In development mode (non-Electron), these routes can be skipped or return
  404 if runtime pages are not present

## Alternatives Considered

### Alternative 1: Embed dashboard/playground as React components inside the SPA

- **Pros**: fully integrated UX; same design tokens; SPA navigation
- **Cons**: requires rewriting two self-contained HTML pages as React
  components; the dashboard uses its own dark theme and inline styles
  that would conflict with cats' design system; significant effort for
  admin/debug pages that are not user-facing product surfaces
- **Why rejected**: these are developer/operator tools, not product
  surfaces — full integration is not worth the rewrite cost

### Alternative 2: Open dashboard/playground in a separate Electron window

- **Pros**: complete isolation; no route conflicts
- **Cons**: feels like two separate apps; user must manage multiple
  windows; loses the single-app experience
- **Why rejected**: the whole point of Electron packaging is a unified
  experience

### Alternative 3: Use an iframe inside the SPA

- **Pros**: visually integrated; SPA navigation works
- **Cons**: iframe communication is awkward; scrolling, sizing, and
  theming issues; security restrictions (CSP) may block CDN resources
  that the pages load
- **Why rejected**: iframes create more problems than they solve for
  full-page content with external dependencies

## References

- [ADR-036](./036-unify-api-contract-and-namespace-endpoints-by-product.md) — endpoint namespace rules
- [ADR-025](./025-make-cats-inc-a-suite-host-with-core-owned-product-projections.md) — suite host structure
- `cats-runtime/src/http/app.ts` lines 177-188 — current page serving
- `cats-runtime/public/index.html` — dashboard source
- `cats-runtime/public/playground.html` — playground source

---

*Proposed: 2026-03-24*
*Decision makers: user + Claude*
