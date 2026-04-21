# ADR-078: Use Electron-Native Region Screenshot with Web Fallback

## Status

Proposed

## Context

Cats Chat should support a screenshot action in the composer attachment menu.
The requested experience matches LINE Desktop: when the user chooses screenshot,
Cats gets out of the way, the user draws a rectangle over any visible desktop
area, and the resulting image appears as an attachment in the composer.

The web platform can request screen capture with `getDisplayMedia()`, but the
browser remains picker-driven and cannot create an OS-wide transparent selection
overlay, capture outside its viewport, or silently choose arbitrary desktop
regions. Cats also has an Electron desktop host that already owns native window
management and exposes a narrow preload bridge to a sandboxed renderer.

## Decision

Cats Chat will expose one user-facing composer action, "Take screenshot", with
environment-specific implementation:

- Electron desktop on Windows, macOS, and Linux-X11 uses a host-owned native
  region screenshot flow built on `desktopCapturer` plus a frozen-snapshot
  overlay window (LINE-style).
- Web and Linux-Wayland desktop use a browser/portal screen-capture fallback
  based on `getDisplayMedia()`.

The Electron implementation will keep OS capture, main-window hide/restore,
display enumeration, overlay windows, and PNG cropping in the Electron host
side of the boundary. The renderer will only request a screenshot after an
explicit user action and receive sanitized image data that it converts into a
composer attachment.

The web/Wayland fallback uses the same "Take screenshot" button and attaches
the resulting PNG via the same attachment pipeline, but its tooltip and
unavailable-state copy must not promise LINE-style desktop selection when the
underlying platform can only provide a picker-driven flow. User-visible copy
for each path is specified in SPEC-079.

### Scope

This decision is limited to the region screenshot capture boundary. Related
but separate decisions, not covered here:

- Clipboard-paste image attachment (pasting an OS screenshot already on the
  clipboard into the composer) — a lighter orthogonal feature, can ship
  independently under a separate note.
- Runtime/model multimodal interpretation of the captured image — separate
  capability question.
- Screen sharing for calls or live collaboration — would use
  `session.setDisplayMediaRequestHandler()`, not `desktopCapturer`.

## Consequences

### Positive

- Desktop users get the requested LINE-style region screenshot UX.
- The composer UI remains consistent across web and desktop.
- OS capture privileges stay out of the React renderer.
- The existing `File[]` attachment pipeline can be reused for screenshot
  results.
- The feature degrades gracefully for web-only access instead of hiding the
  action entirely.

### Negative

- Electron and web implementations will not be behaviorally identical.
- Multi-monitor and HiDPI crop correctness require platform-specific testing.
- macOS needs explicit Screen Recording permission handling, and permission
  changes typically require an app restart to take effect.
- Linux Wayland **cannot provide the LINE-style UX** — `desktopCapturer` on
  Wayland is routed through xdg-desktop-portal / PipeWire, which always shows
  a system picker dialog. Wayland users get the web-fallback experience, not
  the native overlay. This is a hard platform limit, not a validation gap.
- Overlay-window behavior introduces a new desktop UX surface that needs
  manual smoke testing beyond unit tests.
- Maintaining two capture code paths (host-native and web fallback) adds a
  long-term maintenance cost; feature changes must be considered against both.

### Neutral

- The first desktop slice should target Windows x64 before full cross-platform
  parity.
- The feature should allow attachment-only sends when a screenshot is attached,
  which slightly broadens composer send semantics.
- Runtime/model multimodal interpretation is a separate capability question;
  this ADR only decides the screenshot attachment capture boundary.

## Alternatives Considered

### Alternative 1: Web-only `getDisplayMedia()`

- **Pros**: Lowest desktop-host complexity; works in browser deployments where
  supported.
- **Cons**: Cannot hide Cats, cannot draw a desktop-wide selector, cannot
  capture arbitrary OS rectangles, and always depends on browser picker UX.
- **Why rejected**: It does not satisfy the LINE Desktop-style requirement.

### Alternative 2: Electron `setDisplayMediaRequestHandler()` only

- **Pros**: Keeps closer parity with browser media APIs and can avoid custom
  thumbnail plumbing for some cases.
- **Cons**: Still centers the interaction around screen-source selection rather
  than an OS-wide rectangle selector, and does not by itself solve overlay,
  crop, or main-window hide/restore behavior.
- **Why rejected**: Useful as a compatibility tool, but insufficient as the
  primary desktop UX.

### Alternative 3: External screenshot helper binary

- **Pros**: Could reuse native OS screenshot tooling and platform-specific
  selection affordances.
- **Cons**: Adds packaging, trust, update, and cross-platform dependency
  complexity. It also conflicts with the current preference for host-owned,
  bounded desktop capabilities before introducing helper processes.
- **Why rejected**: Too much packaging surface for the first implementation.

## References

- [Region Screenshot Composer Feasibility](../research/2026-04-21-region-screenshot-composer-feasibility.md)
- [SPEC-079: Region Screenshot Composer Attachments](../specs/SPEC-079-region-screenshot-composer-attachments.md)
- [PLAN-071: Region Screenshot Composer Rollout](../plans/PLAN-071-region-screenshot-composer-rollout.md)
- [ADR-003: Electron host manages local services](./003-electron-host-manages-local-services.md)
- [ADR-044: Adopt Windows x64 Electron plus self-hosted npm as the initial distribution strategy](./044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy.md)
- Electron `desktopCapturer`: https://www.electronjs.org/docs/latest/api/desktop-capturer
- MDN `getDisplayMedia()`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

---

*Decision proposed: 2026-04-21*
*Last revised: 2026-04-22 (review pass: scope section added, Wayland limit hardened, maintenance cost acknowledged)*
*Decision makers: Sammy, Codex*
