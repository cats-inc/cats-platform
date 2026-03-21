# ADR-003: Use Electron as a Thin Desktop Host Around Local Services

## Status

Accepted

## Context

`cats` is still iterating on the chat product model, so the project
correctly deferred Electron during the first renderer and chat-core
delivery phases.

That said, the long-term product target still includes desktop-installable
distribution, tray behavior, background lifecycle management, and runtime/debug
surfaces on Windows.

This became more concrete once `cats-runtime` embedded the CLI runtime directly.
`cats-runtime` now owns subprocess spawning, local session discovery, and
provider-specific native execution. Those responsibilities are Node-only and
must not move into a browser renderer process.

Later discussion revisited Tauri and Flutter as alternatives. Under the current
topology, those options do not improve the primary desktop path:

- both `cats` and `cats-runtime` still need Node-friendly sidecar
  supervision
- Electron already matches the chosen React/Vite renderer stack
- introducing Rust- or Dart-based hosts would add another runtime or language
  without removing the Node sidecars that matter most

The project needs a written answer for the future desktop shape before the
implementation work starts, so later packaging work does not revisit the same
boundary decisions.

## Decision

When `cats` grows a desktop-installable shell, it will use Electron as a
thin desktop host with this default process topology:

```text
Electron main
  ├─ owns tray, windows, auto-start, updates, and process supervision
  ├─ starts cats-runtime as a managed local process
  ├─ starts cats as a managed local process
  └─ loads a BrowserWindow from the local cats URL

Renderer (React/Vite bundle inside BrowserWindow)
  └─ talks only to cats

cats Node server
  └─ talks only to cats-runtime over loopback HTTP

cats-runtime
  └─ spawns provider CLIs and manages local runtime state
```

Implementation guidance:

- Keep the current React/Vite renderer model for the desktop UI.
- Keep `cats` as the product-facing Node server boundary.
- Keep `cats-runtime` out of the renderer entirely.
- Start with `cats-runtime` as a managed sidecar process, not an in-renderer or
  preload import.
- Treat in-process embedding of `cats-runtime` inside Electron `main` or a
  utility process as an optimization to revisit later, not the default first
  packaging step.

## Consequences

### Positive

- Preserves the current `cats -> cats-runtime` contract with minimal
  product-layer rewrites
- Keeps CLI spawning, WSL handling, and native session discovery in a Node-safe
  process boundary
- Lets Electron focus on desktop concerns such as tray, windows, and startup
  lifecycle
- Makes it easier to debug desktop issues because app host, product server, and
  runtime can be observed as distinct components

### Negative

- Desktop packaging will still involve more than one local process
- The Electron host must supervise readiness, shutdown ordering, and crash
  recovery for both `cats` and `cats-runtime`
- Loopback ports and local service discovery need an explicit desktop startup
  contract

## Alternatives Considered

### Put `cats-runtime` Logic in the Renderer

Rejected because `cats-runtime` owns subprocess spawning and local native
runtime access. That is not a renderer-safe responsibility.

### Embed Everything Into Electron Immediately

Rejected because it couples desktop packaging too tightly to current Node
service internals and increases version-coupling pressure too early.

### Skip Electron and Stay Web-Only

Rejected because the target product shape includes tray-driven and background
desktop behavior that a normal web deployment cannot satisfy well.

### Replace Electron with Tauri Under the Current Sidecar Topology

Rejected because the current product package still needs to supervise Node-based
`cats` and `cats-runtime` processes. Tauri can run sidecars, but doing so
would add packaging complexity without removing the Node runtime assumptions
that already fit Electron.

## Follow-up

- Add a desktop-host implementation phase under Phase 3 productization
- Define a local readiness contract for Electron to wait on `cats-runtime` and
  `cats`
- Revisit whether `cats` and `cats-runtime` should keep fixed ports or move
  to host-selected local ports for desktop packaging
- Decide whether a runtime/debug window is a second BrowserWindow backed by
  `cats`, `cats-runtime`, or both

---

*Decision date: 2026-03-11*


