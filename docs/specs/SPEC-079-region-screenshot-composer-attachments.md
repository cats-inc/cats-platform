# SPEC-079: Region Screenshot Composer Attachments

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | Sammy |

## Summary

Cats Chat should add a screenshot action to the composer attachment menu. In
the Electron desktop app, the action should behave like LINE Desktop: hide Cats,
let the user drag-select any rectangular desktop region, then insert the
captured PNG as an attachment preview in the composer. In the web app, the same
action should use a browser-compatible fallback based on screen capture picker
APIs.

## Goals

- Add a single "Take screenshot" composer action beside "Add photos and files".
- Provide a LINE-style desktop region selector in Electron.
- Provide a truthful web fallback that attaches a captured image when browser
  screen capture is available.
- Reuse the existing composer attachment preview and upload pipeline.
- Support screenshot-only sends when at least one attachment is present.

## Non-Goals

- Do not add background or silent screenshot capture.
- Do not bypass browser or OS permission prompts.
- Do not make the React renderer directly import Electron or Node APIs.
- Do not require runtime/model multimodal image understanding in the first
  slice.
- Do not implement OCR, annotation, blur, redaction, or drawing tools in the
  first slice.
- Do not make mobile browser screenshot capture part of the first slice.
- Do not add a global OS hotkey for screenshot capture in the first slice.
  Capture is initiated only through the composer button.
- Do not support selection rectangles that span multiple displays in the first
  slice. Each selection must live on one display.
- Do not attempt to deliver LINE-style native overlay UX on Linux Wayland. The
  web fallback path is the intended Wayland behavior (see ADR-078).

## User Stories

- As a desktop user, I want to capture a rectangular area from any app on my
  screen so that I can send visual context to a chat without saving a file
  manually.
- As a web user, I want the same screenshot button to provide the best
  browser-supported capture flow so that the UI stays predictable.
- As a user, I want the captured image to appear in the composer before send so
  that I can remove it, add text, or cancel before posting.

## Requirements

### Functional Requirements

1. The composer plus menu shall include a "Take screenshot" action in draft and
   existing-channel composer surfaces.
2. The Electron desktop action shall be available only through the preload
   bridge and shall require an explicit user click. The host IPC handler
   shall reject requests whose `event.sender` is not the main Cats window's
   `webContents`.
3. The Electron desktop action shall `hide()` the main Cats window before
   capture — not `minimize()` — because minimize animations on Windows and
   macOS can be captured into the snapshot mid-transition.
4. The Electron host shall wait for at least one compositor frame (~80–150ms,
   or `requestAnimationFrame`-equivalent) between hiding the main window and
   invoking `desktopCapturer.getSources()`, so the hidden window is no longer
   in the display buffer at capture time.
5. The Electron host shall capture a full-resolution bitmap of every attached
   display using physical-pixel `thumbnailSize` (`bounds.width * scaleFactor`).
   Captured bitmaps shall **not** include the OS cursor.
6. The Electron host shall present a frozen-snapshot selection overlay: one
   transparent, frameless, always-on-top (`screen-saver` level) BrowserWindow
   per display, each showing the pre-captured bitmap as its background.
   Selection happens against the still image, not live desktop pixels.
7. The overlay shall render a live dimensions indicator (e.g. "320×180") next
   to the selection rectangle during drag, and shall reject selections smaller
   than 8×8 physical pixels as accidental clicks (returns cancellation).
8. The overlay shall confirm selection automatically on mouse-up (no separate
   confirm button) and shall support cancellation via Escape, right-click, or
   clicking outside any active drag.
9. The Electron host shall crop the selected region with display scale-factor
   correction, mapping CSS selection coordinates to physical image coordinates.
10. The Electron host shall restore the main Cats window to its prior state
    (normal / maximized / focused) after completion, cancellation, or error,
    using a `finally` block so hidden-window recovery is guaranteed even on
    exceptions.
11. The renderer shall convert the returned PNG into a `File` with image MIME
    type and append it to the active composer attachment list.
12. Screenshot attachments shall use the filename pattern
    `cats-screenshot-YYYYMMDD-HHMMSS-NNN.png` where `NNN` is a zero-padded
    per-second counter to disambiguate rapid successive captures.
13. The composer shall allow send when the draft has non-empty text or at
    least one attachment. Attachment-only sends shall store an empty message
    body (no synthetic caption).
14. The web fallback shall use `getDisplayMedia()` when available and shall
    attach a PNG captured from the selected screen, window, or tab. The
    fallback **must be invoked synchronously from the click event handler**
    with no intermediate `await` — browsers reject `getDisplayMedia()` calls
    that have lost user-gesture context.
15. The web fallback shall stop all returned `MediaStreamTrack` instances
    immediately after capturing a single frame, to dismiss the browser's
    "this tab is being recorded" indicator.
16. If a captured PNG exceeds 8000×8000 physical pixels or 10 MB encoded, it
    shall be downscaled to fit within those bounds before attachment.
17. When screenshot capture is unavailable, denied, or cancelled, the composer
    shall remain unchanged. User feedback shall follow the platform toast
    pattern already used for non-inline product feedback — inline composer
    feedback is prohibited (matches the broader Settings feedback rule).

### Non-Functional Requirements

- **Security**: OS capture and window control must stay in the Electron host.
  Renderer access must be limited to a typed, user-gesture-driven bridge method.
- **Privacy**: The app must never capture in the background or without visible
  user initiation.
- **Reliability**: Cancellation and permission denial must restore the main
  window and leave composer state unchanged.
- **Performance**: The perceived hide-capture-overlay transition should feel
  immediate on the primary Windows target.
- **Accessibility**: The action must be reachable by keyboard, and the overlay
  must support Escape cancellation.
- **Compatibility**: Desktop MVP targets Windows first; macOS and Linux require
  explicit validation before parity is claimed.

## Design Overview

```text
Composer menu
  -> capture screenshot command
    -> desktop bridge available?
      -> Electron host hides main window
      -> wait one compositor frame
      -> host captures per-display bitmaps (cursor-free)
      -> host opens frozen-snapshot overlay window per display
      -> user drags rectangle against frozen image
      -> host crops bitmap with scale-factor correction
      -> host restores main window
      -> host returns PNG bytes and metadata
      -> renderer creates File and appends attachment
    -> otherwise web fallback (must run inside click handler, no await)
      -> getDisplayMedia picker
      -> capture frame to canvas, stop tracks
      -> renderer creates File and appends attachment
```

The first implementation should integrate with existing attachment state rather
than inventing a separate screenshot entity. The screenshot becomes just another
image `File` before upload.

### Web Fallback UI Affordance

- Button label is the same `"Take screenshot"` across web and desktop.
- Tooltip differs by environment:
  - Electron desktop (X11/Windows/macOS): `"Capture a region of your screen"`.
  - Web / Wayland: `"Capture a screen, window, or tab"`.
- If `navigator.mediaDevices.getDisplayMedia` is unavailable (e.g. older
  browsers, insecure origin), the button is rendered but disabled with a
  tooltip explaining why. It is not hidden, so the feature's existence is
  discoverable.
- Post-capture preview in the composer is identical across paths — the
  attachment UI does not distinguish how the image was produced.

## Dependencies

- Electron host and preload bridge already used by Cats desktop.
- Existing composer attachment UI and channel attachment API.
- Browser `getDisplayMedia()` for web fallback.
- Electron `desktopCapturer`, `BrowserWindow`, `screen`, and `nativeImage` for
  desktop capture and crop behavior.

## Open Questions

- [ ] Should the web fallback include an in-app crop UI in the first slice, or
      attach the selected source frame directly? (Leaning toward direct
      attachment for MVP — crop UI is a Phase 5+ enhancement.)
- [ ] What is the exact Windows-side mechanism for excluding the OS cursor
      from `desktopCapturer` bitmaps? (Candidates: `CURSOR_SHOWING` toggle,
      `SetCursorPos` temporarily off-screen, or post-capture bitmap
      differencing.) Decision needed before Phase 3.

Resolved and promoted to Requirements:

- Hide vs minimize → `hide()` (Requirement 3).
- Multi-display selection scope → single-display only for MVP (Non-Goals).
- Permission-denial feedback pattern → platform toast (Requirement 17).
- Screenshot-only send body content → empty body, no synthetic caption
  (Requirement 13).

## References

- [ADR-078: Use Electron-Native Region Screenshot with Web Fallback](../decisions/078-use-electron-native-region-screenshot-with-web-fallback.md)
- [PLAN-071: Region Screenshot Composer Rollout](../plans/PLAN-071-region-screenshot-composer-rollout.md)
- [Region Screenshot Composer Feasibility](../research/2026-04-21-region-screenshot-composer-feasibility.md)

---

*Created: 2026-04-21*
*Last revised: 2026-04-22 (review pass: hide-vs-minimize decided, frozen snapshot required, cursor exclusion, size/count bounds, user-gesture rule, Web Fallback UI Affordance, Open Questions pruned)*
*Author: Codex*
*Related Plan: [PLAN-071](../plans/PLAN-071-region-screenshot-composer-rollout.md)*
