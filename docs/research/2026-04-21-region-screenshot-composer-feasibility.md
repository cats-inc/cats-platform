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
2. The Electron host hides or minimizes the main Cats window.
3. The host captures display thumbnails with `desktopCapturer.getSources()`.
4. The host opens one transparent, frameless, always-on-top overlay window per
   display, or one virtual-desktop overlay where supported by the platform.
5. The overlay renders the frozen desktop image and lets the user drag-select a
   rectangle.
6. The host crops the captured image with display scale-factor correction.
7. The host returns PNG bytes, MIME type, dimensions, and filename metadata to
   the renderer.
8. The renderer wraps the PNG as a `File` and appends it to the existing
   composer attachment state.
9. The host restores the main window.

Cats already has an Electron host, a sandboxed renderer, context isolation, and
a typed preload bridge. The screenshot capability should follow that boundary:
host owns OS capture and window management; renderer owns composer state and
attachment preview.

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
- Linux support depends on display server details. X11 is usually simpler.
  Wayland/PipeWire can require portal-driven capture behavior and should be
  validated separately.
- Multi-monitor support needs display scale-factor aware coordinate mapping.
  Cropping must use physical image coordinates, not only CSS pixels.

## Recommendation

Adopt one product action named "Take screenshot" with two environment-specific
implementations:

- Electron desktop: native region selector, LINE-style.
- Web app: browser screen-picker fallback using `getDisplayMedia()`.

This keeps the Cats Chat UI consistent while giving desktop users the intended
native capture experience.

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

*Last updated: 2026-04-21*
