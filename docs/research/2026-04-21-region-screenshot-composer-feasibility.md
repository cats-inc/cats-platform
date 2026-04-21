# Region Screenshot Composer Feasibility

Date: 2026-04-21
Topic: LINE-style region screenshot attachment for Cats Chat composer

## Question

Can Cats Chat add a screenshot action beside "Add photos and files" that behaves
like LINE Desktop: the app gets out of the way, the user drags a rectangle over
any visible desktop area, and the selected image lands in the composer as an
attachment?

## Findings

### Web app capability

The web platform can request screen capture through
`navigator.mediaDevices.getDisplayMedia()`, but that API is intentionally
permission-gated and picker-driven. It can let the user select a screen,
window, or tab and then the app can capture a frame into a canvas. It cannot
provide the LINE Desktop experience by itself because a browser page cannot:

- Minimize or hide its containing app window as part of a trusted desktop flow.
- Draw a full-screen transparent selection overlay above other applications.
- Track drag selection outside the browser viewport.
- Capture an arbitrary desktop rectangle without the browser or OS picker.
- Silently reuse screen-capture permission.

For web-only Cats, the feasible fallback is a browser-native screen picker plus
in-app crop or direct full-source attachment. It is usable but not equivalent to
the requested LINE Desktop interaction.

### Electron desktop capability

Electron can provide the requested desktop behavior when the screenshot action
is implemented in the host process and exposed through the existing preload
bridge pattern. The viable flow is:

1. Renderer invokes a bounded desktop bridge method after an explicit user click.
2. The Electron host hides the main Cats window via `BrowserWindow.hide()`
   (not `minimize()`; minimize animations on Windows and macOS can be captured
   into the snapshot as the compositor is mid-transition).
3. The host waits briefly (~80–150ms, or until the next compositor frame) so
   the hidden Cats window is actually gone from the display buffer before
   capture. Without this wait, Cats itself appears in the snapshot.
4. The host captures full-resolution desktop bitmaps with
   `desktopCapturer.getSources({ types: ['screen'] })`, requesting
   `thumbnailSize` sized in physical pixels (`bounds.width * scaleFactor`).
5. The host opens one transparent, frameless, always-on-top
   (`setAlwaysOnTop(true, 'screen-saver')`) overlay window per display,
   positioned to cover each display's bounds.
6. The overlay renders the pre-captured desktop bitmap as its background and
   lets the user drag-select a rectangle. This "frozen snapshot" approach is
   what LINE Desktop, ShareX, Flameshot, and Slack use — the user selects
   against a still image, so clocks do not tick, notifications do not pop, and
   other apps' animations do not shift pixels mid-selection.
7. The host crops the captured bitmap with display scale-factor correction,
   mapping CSS selection coordinates to physical image coordinates.
8. The host returns PNG bytes, MIME type, dimensions, and filename metadata to
   the renderer.
9. The renderer wraps the PNG as a `File` and appends it to the existing
   composer attachment state.
10. The host restores the main window to its previous state
    (maximized / normal / focused).

Cats already has an Electron host, a sandboxed renderer, context isolation, and
a typed preload bridge. The screenshot capability should follow that boundary:
host owns OS capture and window management; renderer owns composer state and
attachment preview.

#### Why `desktopCapturer` over `setDisplayMediaRequestHandler` inside Electron

Electron also supports the standard `navigator.mediaDevices.getDisplayMedia()`
API from the renderer side, wired via `session.setDisplayMediaRequestHandler()`.
That path still centers the interaction on a source-picker UI rather than an
OS-wide region selector, so it does not by itself deliver the LINE-style UX.
`desktopCapturer` gives the host a raw per-display bitmap with no picker, which
is the primitive needed to build the frozen-snapshot overlay. The two APIs are
complementary — `setDisplayMediaRequestHandler` remains relevant if Cats later
wants to expose screen sharing for calls or live collaboration — but the
region-screenshot feature is `desktopCapturer`-based.

### Current Cats attachment fit

The current composer attachment model is compatible with screenshot output:

- Composer surfaces already hold attachment files as `File[]`.
- Existing upload code turns files into base64 payloads for the channel
  attachment API.
- Existing message rendering recognizes image attachments and displays preview
  links through channel attachment URLs.

The main product gap is that send-button enablement appears oriented around
non-empty text. A screenshot-only turn should be allowed when at least one
attachment is present.

## Platform Notes

- Windows should be the first target for the native desktop selector because
  Cats currently prioritizes Windows x64 desktop packaging.
- macOS requires Screen Recording permission for desktop capture. First-run
  permission denial should be handled explicitly and may require app restart
  after permission changes.
- Linux X11 supports the LINE-style UX; Linux Wayland **does not**. On Wayland
  `desktopCapturer` is routed through the xdg-desktop-portal / PipeWire stack,
  which always surfaces a system picker dialog before releasing pixels. The
  "Cats hides, user draws a rectangle over the live desktop" flow is
  architecturally unavailable on Wayland — the best Wayland can do is the
  portal picker path. This is a hard platform limit, not a validation gap.
- Multi-monitor support needs display scale-factor aware coordinate mapping.
  Cropping must use physical image coordinates, not only CSS pixels. Windows
  multi-monitor setups commonly use negative-coordinate displays (secondary
  screen to the left of primary); overlay positioning must handle negative
  bounds.
- `BrowserWindow.hide()` followed by immediate capture will include the Cats
  window itself in the snapshot on Windows and macOS because the compositor has
  not yet finished removing it. A short deterministic wait (~80–150ms, or one
  `requestAnimationFrame` tick) between hide and capture is required.
- On Windows, `desktopCapturer` includes the OS cursor in the bitmap by
  default; LINE-style capture should exclude it. Capture implementations must
  either hide the cursor before capture or composite a cursor-free bitmap.

## Recommendation

Adopt one product action named "Take screenshot" with two environment-specific
implementations:

- Electron desktop (Windows / macOS / Linux-X11): native region selector,
  LINE-style, using `desktopCapturer` + frozen-snapshot overlay.
- Web app and Linux-Wayland desktop: browser/portal screen-picker fallback
  using `getDisplayMedia()`.

The web fallback must be invoked synchronously from the user click event
handler — browsers reject `getDisplayMedia()` calls that have lost their user
gesture context through intermediate async work (confirm dialogs, permission
preflight, etc.).

This keeps the Cats Chat UI consistent while giving desktop users the intended
native capture experience on the majority of target platforms.

## Follow-Up Work

- Create an ADR for the host-owned native screenshot boundary.
- Create a SPEC for the user-visible composer behavior and edge cases.
- Create a PLAN for renderer, preload, Electron host, overlay, and validation
  rollout.

## Sources

- MDN: `MediaDevices.getDisplayMedia()`, https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
- MDN: Screen Capture API, https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API
- Electron: `desktopCapturer`, https://www.electronjs.org/docs/latest/api/desktop-capturer
- Electron: `BrowserWindow`, https://www.electronjs.org/docs/latest/api/browser-window
- Electron: `screen`, https://www.electronjs.org/docs/latest/api/screen
- Electron: `nativeImage`, https://www.electronjs.org/docs/latest/api/native-image
- Electron: `session.setDisplayMediaRequestHandler`, https://www.electronjs.org/docs/latest/api/session
- Electron: `systemPreferences.getMediaAccessStatus`, https://www.electronjs.org/docs/latest/api/system-preferences

---

*Last updated: 2026-04-22 (review pass: frozen-snapshot mechanism, compositor timing, Wayland limit, cursor exclusion, `desktopCapturer` vs `setDisplayMediaRequestHandler` rationale)*
