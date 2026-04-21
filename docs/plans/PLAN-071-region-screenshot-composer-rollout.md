# PLAN-071: Region Screenshot Composer Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | Sammy |

## Related Spec

[SPEC-079: Region Screenshot Composer Attachments](../specs/SPEC-079-region-screenshot-composer-attachments.md)

## Overview

Implement a single composer "Take screenshot" action that dispatches to either
an Electron-native region selector or a web-compatible screen-capture fallback.
Keep OS capture in the desktop host, keep attachment state in the renderer, and
reuse the existing channel attachment upload path.

## Implementation Phases

### Phase 1: Renderer Attachment Integration

- [ ] Add a shared renderer helper that accepts captured PNG data and appends a
      `File` to the active draft or channel composer attachment list.
- [ ] Add a "Take screenshot" menu item beside "Add photos and files" in draft
      and existing-channel composer surfaces.
- [ ] Detect desktop bridge capability and fall back to browser capture when it
      is not available.
- [ ] Update composer send enablement so text or at least one attachment can
      submit.
- [ ] Add targeted tests for screenshot action visibility, attachment append,
      cancellation no-op, and attachment-only send enablement.

**Deliverables**: Screenshot action is wired in the UI with a mocked capture
provider and existing attachment previews.

### Phase 2: Electron Host Capture Bridge

- [ ] Extend the preload bridge with a narrow `captureScreenshotRegion()`
      method that returns PNG bytes, MIME type, filename, width, and height.
- [ ] Add an `ipcMain.handle` implementation in the Electron host.
- [ ] Validate that capture requests originate from the trusted app window.
- [ ] Hide or minimize the main Cats window before desktop capture and restore
      it after complete, cancel, or error.
- [ ] Use `desktopCapturer.getSources()` with display-aware thumbnail sizing.
- [ ] Normalize permission-denied and cancelled results into explicit outcomes
      instead of generic failures.

**Deliverables**: Host can capture full-display snapshots and return bounded
results through the preload bridge.

### Phase 3: Region Selection Overlay

- [ ] Create a minimal overlay renderer for frozen desktop screenshots.
- [ ] Open transparent, frameless, always-on-top overlay windows for the active
      display set.
- [ ] Implement pointer drag selection, selection rectangle rendering, confirm
      on mouse release, and Escape cancellation.
- [ ] Map CSS selection coordinates to physical image coordinates using display
      bounds and scale factor.
- [ ] Crop selected image data and return PNG bytes to the bridge caller.
- [ ] Smoke test multi-monitor and HiDPI behavior on the primary Windows target.

**Deliverables**: Desktop MVP supports LINE-style region selection and returns
cropped PNG attachments.

### Phase 4: Web Fallback

- [ ] Implement `getDisplayMedia()` capture after explicit user click.
- [ ] Capture the first video frame into a canvas and stop media tracks
      immediately.
- [ ] Attach the captured PNG through the same renderer helper.
- [ ] Show truthful unavailable or permission-denied feedback where browser
      support is missing.
- [ ] Decide whether the first web slice attaches the full selected source frame
      or adds an in-app crop step.

**Deliverables**: Web users get a functional fallback without desktop-overlay
claims.

### Phase 5: Validation and Documentation

- [ ] Run focused renderer tests for composer attachment behavior.
- [ ] Run `npm run build:web` and `npm run build:host` because the work touches
      both renderer and desktop host boundaries.
- [ ] Manually verify Windows desktop capture: app hide/restore, drag select,
      cancel, multi-monitor baseline, HiDPI crop, and screenshot-only send.
- [ ] Manually verify browser fallback on at least Chromium-based desktop
      browser.
- [ ] Document macOS Screen Recording permission behavior after validation.
- [ ] Document Linux support limits after X11 and Wayland checks.

**Deliverables**: The feature has targeted automated coverage plus explicit
desktop/browser smoke evidence.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `desktop/host/preload.cts` | Modify | Expose the bounded screenshot bridge method |
| `desktop/host/main.ts` | Modify | Register host IPC and window hide/restore orchestration |
| `desktop/host/contracts.ts` | Modify | Add screenshot bridge result contracts |
| `desktop/host/*screenshot*` | Create | Isolate desktop capture and overlay support if the main file would grow too much |
| `src/products/shared/renderer/components/ChatNewChatDraft.tsx` | Modify | Add draft composer screenshot action |
| `src/products/shared/renderer/components/chat-view/ChatComposerArea.tsx` | Modify | Add existing-channel composer screenshot action |
| `src/products/shared/renderer/*screenshot*` | Create | Shared renderer capture provider and `File` conversion helpers |
| `tests/*screenshot*.test.tsx` | Create | Targeted renderer tests for menu and attachment behavior |
| `tests/*desktop*.test.js` | Create/Modify | Narrow host contract tests where practical |

## Technical Decisions

- Use one user-facing screenshot action with environment-specific behavior.
- Keep native desktop capture in Electron host and preload bridge; do not expose
  Electron or Node APIs directly to the renderer.
- Reuse existing `File[]` attachment state and channel attachment upload path.
- Treat web capture as a fallback, not as equivalent to LINE-style desktop
  region selection.
- Target Windows first for native selector validation.

## Testing Strategy

- **Unit Tests**: Renderer capability detection, action dispatch, PNG-to-`File`
  conversion, attachment-only send enablement, and cancellation no-op.
- **Integration Tests**: Preload/host contract shape and permission/cancel
  result handling where Electron host tests are practical.
- **Manual Testing**: Windows desktop overlay, app hide/restore, Escape cancel,
  multi-monitor, HiDPI, screenshot-only send, and web fallback capture.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Display coordinate mismatch on HiDPI screens | High | Use Electron display scale factor and test physical crop output |
| Main window remains hidden after error | High | Centralize restore in `finally` and add cancellation/error smoke checks |
| macOS permission denial confuses users | Medium | Preflight status when available and show explicit recovery guidance |
| Wayland capture behaves differently | Medium | Ship Windows-first, document Linux support limits, validate PipeWire separately |
| Renderer receives too much native authority | High | Keep bridge payload narrow and one-shot; never expose raw Electron modules |
| Screenshot-only sends break message body assumptions | Medium | Add tests for attachment-only sends and decide stored body behavior before implementation |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-21 | Plan created from LINE-style screenshot feasibility discussion |

---

*Created: 2026-04-21*
*Author: Codex*
