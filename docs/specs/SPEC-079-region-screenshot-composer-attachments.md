# SPEC-079: Region Screenshot Composer Attachments

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | Sammy |

## Summary

Cats Chat should add a screenshot action to the composer attachment menu. In
the Electron desktop app, the action should behave like LINE Desktop: hide or
minimize Cats, let the user drag-select any rectangular desktop region, then
insert the captured PNG as an attachment preview in the composer. In the web
app, the same action should use a browser-compatible fallback based on screen
capture picker APIs.

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
   bridge and shall require an explicit user click.
3. The Electron desktop action shall hide or minimize the main Cats window
   before capture so Cats is not included in the default screenshot target.
4. The Electron host shall capture the current desktop state, present a
   full-screen selection overlay, and let the user drag a rectangular region.
5. The Electron overlay shall support cancel through Escape and an obvious
   cancel interaction.
6. The Electron host shall crop the selected region to PNG with correct
   multi-monitor and display-scale handling.
7. The Electron host shall restore the main Cats window after completion,
   cancellation, or error.
8. The renderer shall convert the returned PNG into a `File` with image MIME
   type and append it to the active composer attachment list.
9. Screenshot attachments shall use a deterministic filename prefix such as
   `cats-screenshot-YYYYMMDD-HHMMSS.png`.
10. The composer shall allow send when the draft has non-empty text or at least
    one attachment.
11. The web fallback shall use `getDisplayMedia()` when available and shall
    attach a PNG captured from the selected screen, window, or tab.
12. When screenshot capture is unavailable, denied, or cancelled, the composer
    shall remain unchanged and show a non-disruptive error or cancellation
    state consistent with existing product feedback patterns.

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
      -> host captures screens and opens selection overlay
      -> user selects region
      -> host returns PNG bytes and metadata
      -> renderer creates File and appends attachment
    -> otherwise web fallback
      -> getDisplayMedia picker
      -> capture frame to canvas
      -> renderer creates File and appends attachment
```

The first implementation should integrate with existing attachment state rather
than inventing a separate screenshot entity. The screenshot becomes just another
image `File` before upload.

## Dependencies

- Electron host and preload bridge already used by Cats desktop.
- Existing composer attachment UI and channel attachment API.
- Browser `getDisplayMedia()` for web fallback.
- Electron `desktopCapturer`, `BrowserWindow`, `screen`, and `nativeImage` for
  desktop capture and crop behavior.

## Open Questions

- [ ] Should desktop capture hide the main window or minimize it for the first
      Windows implementation?
- [ ] Should the overlay support multi-display selection across display
      boundaries, or only one display per selection in the first slice?
- [ ] What exact toast or status feedback should permission denial use outside
      Settings pages?
- [ ] Should the web fallback include an in-app crop UI in the first slice, or
      attach the selected source frame directly?
- [ ] Should screenshot-only sends use an empty text body or a generated caption
      such as "Screenshot attached" in the stored message body?

## References

- [ADR-078: Use Electron-Native Region Screenshot with Web Fallback](../decisions/078-use-electron-native-region-screenshot-with-web-fallback.md)
- [PLAN-071: Region Screenshot Composer Rollout](../plans/PLAN-071-region-screenshot-composer-rollout.md)
- [Region Screenshot Composer Feasibility](../research/2026-04-21-region-screenshot-composer-feasibility.md)

---

*Created: 2026-04-21*
*Author: Codex*
*Related Plan: [PLAN-071](../plans/PLAN-071-region-screenshot-composer-rollout.md)*
