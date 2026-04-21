# PLAN-071: Region Screenshot Composer Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress |
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

- [x] Add a shared renderer helper that accepts captured PNG data and appends a
      `File` to the active draft or channel composer attachment list.
- [x] Add a "Take screenshot" menu item beside "Add photos and files" in draft
      and existing-channel composer surfaces.
- [x] Detect desktop bridge capability and fall back to browser capture when it
      is not available.
- [x] Resolve and cache the capture route before the menu click completes
      (`desktop_region`, `web_picker`, or `unavailable`). The click handler
      must not await desktop IPC before deciding to use the web picker because
      `getDisplayMedia()` requires preserved user-gesture context.
- [x] Update composer send enablement so text or at least one attachment can
      submit.
- [x] Add targeted tests for screenshot action visibility, attachment append,
      cancellation no-op, and attachment-only send enablement.

**Deliverables**: Screenshot action is wired in the UI with a mocked capture
provider and existing attachment previews.

### Phase 2: Electron Host Capture Bridge

- [x] Define the screenshot IPC contract in `desktop/host/contracts.ts`:
      request shape, success result (`{ png: Uint8Array; mime: 'image/png';
      filename: string; width: number; height: number }`), and explicit
      outcome variants (`ok`, `cancelled`, `permission_denied`,
      `platform_unsupported`, `error`).
- [x] Extend the preload bridge with a narrow `captureScreenshotRegion()`
      method that returns the contract result above.
- [x] Add an `ipcMain.handle` implementation in the Electron host that
      rejects calls where `event.sender !== mainWindow.webContents`
      (prevents the overlay window or any embedded view from invoking it).
- [x] `hide()` the main Cats window before capture (not `minimize()`).
      Record prior state (`isMaximized`, `isFocused`, `isMinimized`) so it
      can be restored exactly.
- [x] Wait one compositor frame (~80–150ms or `requestAnimationFrame`-equiv)
      after hide before invoking `desktopCapturer.getSources()`, so Cats is
      no longer in the display buffer at capture time. Measure empirically
      on the primary Windows target.
- [x] Use `desktopCapturer.getSources({ types: ['screen'] })` with
      physical-pixel `thumbnailSize` derived from `display.bounds *
      display.scaleFactor`.
- [ ] Exclude the OS cursor from captured bitmaps (resolve SPEC Open
      Question on Windows mechanism before implementation). Follow-up
      mitigation now records the capture-time cursor point and cancels final
      crops that overlap a 32px cursor exclusion radius, so attachments are
      not emitted when they would include the captured cursor. The overlay
      renders that exclusion zone and the renderer shows actionable toast
      feedback on `cursor_overlap`; full source-bitmap cursor removal remains
      unresolved.
- [x] Wrap the full capture flow in `try…finally` so main window restoration
      is guaranteed on exceptions.
- [x] Normalize permission-denied, cancelled, and unsupported-platform
      results into the contract's outcome variants instead of generic
      failures.

**Deliverables**: Host can capture full-display snapshots, avoid emitting
cursor-overlap attachments, and return bounded results through the preload
bridge; main window always recovers. Full source-bitmap cursor removal remains
pending behind the SPEC open question.

### Phase 3: Region Selection Overlay

- [x] Create a dedicated overlay renderer entry (HTML + TSX) that receives
      the pre-captured per-display bitmap and draws it as the overlay's
      background. This is the LINE-style "frozen snapshot" — users select
      against the still image, not live pixels.
- [x] Decide and implement the overlay HTML loading strategy: packaged
      `file://` vs Vite multi-entry dev server vs inline `data:` URL.
      Affects `vite.config.ts` and packaging.
- [x] Add a dedicated preload script for the overlay BrowserWindow
      (separate from the main renderer preload — different trust boundary
      and different exposed API).
- [x] Open one overlay BrowserWindow per display with config:
      `transparent: true`, `frame: false`, `resizable: false`,
      `hasShadow: false`, `skipTaskbar: true`, `fullscreenable: false`,
      `alwaysOnTop` via `setAlwaysOnTop(true, 'screen-saver')`, positioned
      to each display's `bounds` (must handle negative-coordinate displays).
- [x] Implement pointer drag selection, live selection rectangle rendering,
      live dimensions indicator (e.g. "320×180"), automatic confirm on
      mouse-up, reject selections smaller than 8×8 physical pixels.
- [x] Implement cancellation via Escape, right-click, and click-without-drag
      outside any selection.
- [x] Map CSS selection coordinates to physical image coordinates using
      display bounds and scale factor. Unit-test this mapping with HiDPI
      and negative-coordinate display fixtures.
- [x] Crop selected image data using `nativeImage.crop()` in the main
      process (not in the overlay renderer — avoids marshaling the full
      bitmap back to main).
- [x] Close all overlay windows before returning the result to the bridge
      caller, so the overlay is never briefly visible alongside the
      restored Cats window.
- [ ] Smoke test multi-monitor, HiDPI, and negative-coordinate display
      behavior on the primary Windows target.

**Deliverables**: Desktop MVP supports LINE-style region selection against a
frozen snapshot and returns cropped PNG attachments.

### Phase 4: Web Fallback

- [x] Invoke `navigator.mediaDevices.getDisplayMedia()` **synchronously from
      the click event handler** — no `await` or intermediate confirm dialog
      between the click and the API call, or browsers will reject it for
      lost user-gesture context. Any preflight state must be fetched
      before the click.
- [x] Capture the first video frame into an `OffscreenCanvas` (or `<canvas>`
      if OffscreenCanvas is unavailable) and call `canvas.toBlob('image/png')`.
- [x] Stop all `MediaStreamTrack` instances immediately after frame capture,
      so the browser's "this tab is being recorded" indicator dismisses.
- [x] Attach the captured PNG through the same renderer helper used by the
      desktop path.
- [x] Feature-detect `getDisplayMedia` support; when unavailable, render the
      button disabled with an explanatory tooltip rather than hiding it
      (per SPEC Web Fallback UI Affordance).
- [x] Use the precomputed capture route from Phase 1. Do not attempt desktop
      IPC first and then fall through to `getDisplayMedia()` after an awaited
      `platform_unsupported` result, because that loses browser user-gesture
      context.
- [x] Show truthful permission-denied feedback via the platform toast
      pattern — not inline in the composer.
- [x] For MVP: attach the full selected source frame directly (no in-app
      crop). In-app crop can be added in Phase 5+ if desired.

**Deliverables**: Web users get a functional fallback without desktop-overlay
claims; browser user-gesture requirement is respected.

### Phase 5: Validation and Documentation

- [x] Run focused renderer tests for composer attachment behavior.
- [x] Run `npm run build:web` and `npm run build:host` because the work touches
      both renderer and desktop host boundaries.
- [ ] Manually verify Windows desktop capture: app hide/restore, compositor
      timing (no self-capture), drag select against frozen snapshot,
      live dimensions indicator, Escape/right-click cancel, multi-monitor
      baseline, HiDPI crop, negative-coordinate display, cursor excluded
      from bitmap, and screenshot-only send.
- [ ] Manually verify macOS Screen Recording permission flow on a fresh user
      profile (first-run denial, system-settings grant, app restart, retry).
- [ ] Manually verify browser fallback on at least one Chromium-based desktop
      browser, covering: user-gesture preservation, MediaStreamTrack
      shutdown, unavailable-API disabled-button state.
- [ ] Document macOS Screen Recording permission behavior after validation.
- [ ] Document Linux X11 and Wayland behavior. Confirm Wayland uses the
      fallback path and not the native overlay.

**Deliverables**: The feature has targeted automated coverage plus explicit
desktop/browser smoke evidence.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `desktop/host/preload.cts` | Modify | Expose the bounded `captureScreenshotRegion()` bridge method |
| `desktop/host/main.ts` | Modify | Register host IPC and wire window hide/restore orchestration |
| `desktop/host/contracts.ts` | Modify | Add screenshot IPC request/result contracts and outcome variants |
| `desktop/host/screenshotCapture.ts` | Create | Owns capture lifecycle, overlay windows, compositor wait, crop |
| `desktop/overlay/index.html` + `overlay.tsx` | Create | Dedicated overlay renderer with frozen-snapshot background and drag-select |
| `desktop/overlay/preload.cts` | Create | Narrow preload for the overlay BrowserWindow |
| `vite.config.ts` / `tsconfig.desktop.json` | Modify | Add overlay as a second desktop entry point |
| `src/shared/desktopRecoveryBridge.ts` | Modify | Extend `DesktopHostBridge` type with optional `captureScreenshotRegion?` |
| `src/products/shared/renderer/components/ChatNewChatDraft.tsx` | Modify | Add draft composer screenshot action |
| `src/products/shared/renderer/components/chat-view/ChatComposerArea.tsx` | Modify | Add existing-channel composer screenshot action; update send-enablement to allow attachment-only |
| `src/products/chat/renderer/hooks/useAppDraftUiActions.ts` | Modify | Add `captureAndAttachScreenshot()` handler next to existing `openChannelFilePicker` |
| `src/products/shared/renderer/screenshotCapture.ts` | Create | Shared renderer capture provider: desktop bridge path + web `getDisplayMedia` fallback + PNG→`File` helper |
| `tests/screenshot-composer.test.tsx` | Create | Targeted renderer tests for menu visibility, attachment append, cancellation, attachment-only send |
| `tests/desktop-screenshot-contract.test.js` | Create | Narrow host contract tests for IPC shape and sender validation |

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
| Self-capture: Cats window appears in snapshot due to hide→capture race | High | Insert deterministic compositor-flush wait between `hide()` and `desktopCapturer.getSources()`; verify via visual smoke test on Windows |
| Overlay-in-capture: overlay window briefly visible during snapshot | High | Capture must complete fully before any overlay window is created or shown |
| Display coordinate mismatch on HiDPI screens | High | Use Electron display scale factor and test physical crop output |
| Negative-coordinate multi-monitor layouts mis-position overlay | High | Unit-test coordinate mapping with Windows secondary-left fixtures; verify overlays cover negative bounds |
| Main window remains hidden after error | High | Centralize restore in `finally` and add cancellation/error smoke checks |
| macOS permission denial confuses users | Medium | Preflight `systemPreferences.getMediaAccessStatus('screen')` when available and show explicit recovery toast pointing at System Settings |
| Wayland capture cannot deliver LINE-style UX | Medium | Accepted platform limit; Wayland routes through the web fallback path with an explicit SPEC non-goal |
| Renderer receives too much native authority | High | Keep bridge payload narrow and one-shot; never expose raw Electron modules; reject IPC where sender ≠ main window webContents |
| Screenshot-only sends break message body assumptions | Medium | Add tests for attachment-only sends; stored body is empty, no synthetic caption (SPEC Req 13) |
| Web fallback loses user-gesture context via intermediate `await` | High | Invoke `getDisplayMedia()` synchronously from the click handler; any preflight state must be fetched before the click; cover with a test that mocks a deferred gesture |
| Oversized captures break upload pipeline | Medium | Downscale to ≤8000×8000 and ≤10 MB per SPEC Req 16; test with simulated 8K multi-monitor snapshot |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-21 | Plan created from LINE-style screenshot feasibility discussion |
| 2026-04-22 | Review pass: tightened Phase 2/3/4 tasks (frozen snapshot, compositor wait, cursor exclusion, overlay config, user-gesture); expanded Risks; corrected Files table to include `useAppDraftUiActions.ts`, overlay entry, and shared bridge type |
| 2026-04-22 | Follow-up: clarified pre-click capture-route caching so web fallback keeps user-gesture context |
| 2026-04-22 | Implementation started: renderer screenshot action, web fallback, attachment-only send, desktop bridge contract, capability-gated desktop route, host hide/restore guard, crop geometry, display snapshot/crop pipeline, overlay renderer entry, overlay IPC/preload contract, overlay session/controller helpers, and targeted tests landed in incremental commits. Native desktop capability remains intentionally disabled until the Electron overlay flow is wired end-to-end and manually smoke-tested. |
| 2026-04-22 | Native desktop flow enabled: main-window hide/restore now invokes `desktopCapturer`, opens one frozen-snapshot overlay per display, crops selected regions through `nativeImage`, returns PNGs through the preload bridge, and appends them as composer attachments. Validation run: `npm run build`, `npm run typecheck`, focused desktop screenshot tests, focused renderer screenshot tests, and an alternate-port Electron host smoke where `cats-runtime` and `cats-platform` reached ready state and `/desktop/overlay/index.html` returned 200. Full `npm test` hit the 10-minute tool timeout without returning output, so broad-suite completion remains pending. |
| 2026-04-22 | Added macOS Screen Recording preflight: Electron now maps denied/restricted `screen` media access to the screenshot contract's `permission_denied` outcome before opening overlays, while allowing `not-determined` to continue so the first capture attempt can trigger the platform consent path. |
| 2026-04-22 | Follow-up review fixes: desktop cropped PNGs now apply the same 8000×8000 / 10 MB bounds as the web path, web fallback stops `MediaStreamTrack`s immediately after drawing the frame to canvas, and desktop sessions cancel cursor-overlap selections using capture-time cursor metadata. |
| 2026-04-22 | Cursor-overlap UX follow-up: overlay payloads now include cursor exclusion metadata, the overlay renders a visible "Move cursor away" warning zone and blocked selection state, renderer cancellation handling turns `cursor_overlap` into toast feedback, and the exclusion radius was reduced from 64px to 32px. |
| 2026-04-22 | Contract cleanup: cancellation result now carries a typed `DesktopScreenshotCancelReason` (`user_cancel`/`too_small`/`cursor_overlap`/`unknown_display`) instead of a free-form `message`, so the renderer exhaustive-switches on a shared literal union. Overlay visual indicator switched from a circle to a square with a dashed border (matches the rectangular collision box); the "Move cursor away" chip is now only shown while a drag actually overlaps the exclusion zone. `unknown_display` now surfaces as a toast instead of a silent cancel. |

---

*Created: 2026-04-21*
*Last revised: 2026-04-22 (review pass)*
*Author: Codex*
