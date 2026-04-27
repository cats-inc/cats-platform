# PLAN-075: Composer Voice Input Native STT Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | Sammy |

## Related Spec

[SPEC-084: Composer Voice Input via Platform-Native STT](../specs/SPEC-084-composer-voice-input-via-platform-native-stt.md)

## Overview

Replace the broken `webkitSpeechRecognition` driver behind the composer
microphone button with a host-owned native STT bridge. macOS uses a bundled
Swift helper that drives `SFSpeechRecognizer`. Windows uses a bundled .NET /
WinRT helper that drives `Windows.Media.SpeechRecognition`. Linux and the web
renderer fall through to the existing path and continue to surface failure
through the existing toast pattern. No cloud STT, no bundled local model.

## Implementation Phases

### Phase 1: Renderer Bridge Integration and Capability Detection

- [ ] Add a shared `VoiceCaptureBridge` type in
      `src/shared/voiceCaptureBridge.ts` with the contract sketched in
      SPEC-084 (`startVoiceCapture`, `stopVoiceCapture`,
      `cancelVoiceCapture`, `onVoiceCaptureEvent`,
      `VoiceCaptureEvent` discriminated union, `VoiceCaptureErrorReason`
      closed enum).
- [ ] Extend `DesktopHostBridge` in
      `src/shared/desktopRecoveryBridge.ts` with optional
      `startVoiceCapture?` / `stopVoiceCapture?` / `cancelVoiceCapture?` /
      `onVoiceCaptureEvent?` so renderer code can feature-detect by
      property presence.
- [ ] Create `src/products/shared/renderer/hooks/useNativeVoiceInput.ts`
      that drives the bridge methods, manages session ids, surfaces
      `ready` / `partial` / `final` / `end` / `error` events as a stable
      hook surface, and degrades gracefully when the bridge is absent.
- [ ] Refactor
      `src/products/shared/renderer/hooks/useVoiceInputComposer.ts` to
      pick `useNativeVoiceInput` when the bridge is present and otherwise
      keep the current `useWebSpeechInput` path unchanged. Selection-trust
      and cursor-insertion semantics are preserved.
- [ ] Map each `VoiceCaptureErrorReason` to the existing platform toast
      copy. `cancelled` and `aborted` shall be silent (no toast). Add
      one new toast string per remaining reason.
- [ ] Add targeted renderer tests for: bridge present vs absent
      detection, partial/final dispatch ordering, click-to-stop behavior,
      Escape-to-cancel behavior, and toast routing for each error reason.
- [ ] Confirm composer mic button visibility logic continues to gate on
      `voiceInputSupported` and that supported = true whenever either
      path can run, so the button is never silently hidden when the
      bridge would work.

**Deliverables**: Renderer can drive a mocked bridge end-to-end through
the composer; legacy path continues to work unchanged on Linux and web.

### Phase 2: Host Voice Capture Orchestrator and IPC Wiring

- [ ] Define the IPC contract in `desktop/host/contracts.ts`: request
      shapes (`voice:start`, `voice:stop`, `voice:cancel`), event shape
      (`voice:event`), and the typed `VoiceCaptureEvent` payload.
- [ ] Extend `desktop/host/preload.cts` with the four bridge methods on
      `catsDesktopHost`. Subscribe-style `onVoiceCaptureEvent` shall
      return an unsubscribe function and shall not leak listeners across
      window reloads.
- [ ] Add an `ipcMain.handle` implementation that rejects calls where
      `event.sender !== mainWindow.webContents`, matching the screenshot
      bridge sender check.
- [ ] Create `desktop/host/voiceCapture.ts` as the orchestrator: owns
      the helper subprocess, parses line-delimited JSON events from
      stdout, forwards typed events to the renderer, drops events with
      stale session ids, and tears down the helper on stop / cancel /
      crash within the 1-second budget.
- [ ] Implement helper subprocess supervision using the existing
      `processSupervisor.ts` patterns. Helper crashes shall translate to
      `error: helper_crashed` and an `end` event for the affected
      session.
- [ ] Implement the 3-second `ready`-timeout from SPEC-084 Req 17.
- [ ] Register `session.defaultSession.setPermissionRequestHandler` in
      host startup before the main window loads (SPEC-084 Req 20).
      Allowlist `display-capture` (preserves the existing screenshot web
      fallback path). Deny `media` (microphone/camera) explicitly so the
      renderer cannot reach audio capture through Chromium. Deny all
      other permission types by default. The handler applies to
      renderer-originated requests only; host-owned `desktopCapturer`
      and the native voice helper subprocess are unaffected.
- [ ] Add narrow host contract tests for IPC shape, sender validation,
      event dispatch ordering, stale-session-id filtering, the
      ready-timeout path, and the permission handler (assert `media` is
      denied and `display-capture` is allowed for renderer-originated
      requests).

**Deliverables**: Host bridge is callable from the renderer, dispatches
to a stub helper, and surfaces typed events. No real native helper yet.

### Phase 3: macOS Native Helper (SFSpeechRecognizer)

- [ ] Create the Swift CLI source under `desktop/native/macos-stt/`
      (Swift Package Manager project). Single binary target
      `cats-stt-macos`.
- [ ] Implement `AVAudioEngine` tap, `SFSpeechAudioBufferRecognitionRequest`
      with `shouldReportPartialResults = true`, and on-device flag set
      from `SFSpeechRecognizer.supportsOnDeviceRecognition` for the
      requested locale.
- [ ] Print one JSON event per line on stdout, matching the
      `VoiceCaptureEvent` shape. Read line-delimited control commands
      (`stop`, `cancel`) on stdin.
- [ ] Add an `Info.plist` overlay in cats-platform packaging with
      `NSSpeechRecognitionUsageDescription` and
      `NSMicrophoneUsageDescription`. Strings shall match existing Cats
      voice copy if any, otherwise plain explanatory copy.
- [ ] Build the helper as part of the macOS packaging step
      (`scripts/build-desktop-installer.mjs` extension). The compiled
      binary lands in `app.asar.unpacked/native/macos-stt/`.
- [ ] Sign and notarize the helper as part of the existing macOS
      notarization step. Verify `codesign -dv --deep` reports the
      helper's signature post-build.
- [ ] Implement the host preflight from SPEC-084 Req 13:
      `SFSpeechRecognizer.authorizationStatus()` plus
      `AVCaptureDevice.authorizationStatus(for: .audio)`. Map `.denied` /
      `.restricted` to `permission_denied` before launching the helper.
- [ ] Add a host smoke test that spawns the helper with a recorded
      WAV fixture (helper accepts an `--input <wav>` flag for testing
      only) and asserts at least one partial and one final event.
- [ ] Manually verify on a fresh macOS user profile: first-run
      permission prompts (Speech Recognition + Microphone), first-utterance
      latency, on-device mode active, locale matches system language,
      stop and cancel cleanup, and post-error microphone release.

**Deliverables**: macOS Electron build produces real composer transcripts
on a notarized installer.

### Phase 4: Windows Native Helper (Windows.Media.SpeechRecognition)

- [ ] Decide C# (.NET 8 self-contained) vs C++ /WinRT for the helper
      (SPEC-084 Open Question). Default proposal: .NET 8 framework-dependent
      to avoid bundling the .NET runtime, with a fallback to self-contained
      if the targeted Windows 10 19041+ baseline does not include the
      required .NET runtime version.
- [ ] Create the helper source under `desktop/native/windows-stt/`.
      Single executable target `cats-stt-windows.exe`.
- [ ] Implement `SpeechRecognizer` with `ContinuousRecognitionSession`,
      subscribe to `HypothesisGenerated` for partials and
      `ResultGenerated` for finals, configure language from
      `--locale`, and emit one JSON event per line on stdout.
- [ ] Read line-delimited stdin commands (`stop`, `cancel`).
- [ ] Build the helper as part of the Windows packaging step. Output
      lands in `app.asar.unpacked/native/windows-stt/`.
- [ ] Authenticode-sign the helper as part of the existing Windows
      packaging signing step.
- [ ] Map `UnauthorizedAccessException` and equivalent permission
      errors to `permission_denied`. Map missing speech-pack errors to
      `language_not_supported`. Map any other startup failure to
      `engine_unavailable`.
- [ ] Add a host smoke test that spawns the helper with a recorded
      WAV fixture (helper accepts an `--input <wav>` flag for testing
      only) and asserts at least one partial and one final event.
- [ ] Manually verify on a fresh Windows 10 / 11 user profile: first-run
      microphone consent, first-utterance latency, locale matches
      installed speech pack, stop and cancel cleanup, and post-error
      microphone release.

**Deliverables**: Windows Electron build produces real composer
transcripts on a signed installer.

### Phase 5: Validation, Linux Verification, Documentation

- [ ] Run `npm run build:web` and `npm run build:host` in cats-platform
      because the work touches both renderer and desktop host
      boundaries.
- [ ] Run focused renderer tests for composer voice behavior added in
      Phase 1.
- [ ] Run focused host contract tests added in Phase 2.
- [ ] Run focused macOS and Windows helper tests added in Phases 3
      and 4.
- [ ] Verify on Linux Electron: bridge methods are absent on
      `catsDesktopHost`, the renderer falls through to
      `useWebSpeechInput`, and the existing toast still appears on
      failure. No new code path is required for Linux; the verification
      is that nothing regressed.
- [ ] Verify on the web renderer (non-Electron): same fall-through and
      toast behavior as today. No regression.
- [ ] Document macOS Speech Recognition and Microphone permission
      behavior in `docs/setup-guide.md` (or the closest existing
      permission-docs file) after macOS validation lands.
- [ ] Document Windows microphone permission behavior in the same place.
- [ ] Document the explicit Linux limitation: the composer voice button
      is non-functional on Linux for v1, by design, with a toast on
      click. Reference ADR-079.

**Deliverables**: The slice has targeted automated coverage on all
three desktop platforms (real coverage on macOS / Windows, regression
coverage on Linux), plus signed and notarized installer evidence on
macOS and Windows.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/voiceCaptureBridge.ts` | Create | Typed bridge contract: events, error reasons, session ids |
| `src/shared/desktopRecoveryBridge.ts` | Modify | Add optional `startVoiceCapture` / `stopVoiceCapture` / `cancelVoiceCapture` / `onVoiceCaptureEvent` to `DesktopHostBridge` |
| `src/products/shared/renderer/hooks/useNativeVoiceInput.ts` | Create | New hook driving the desktop bridge with the same shape as `useWebSpeechInput` |
| `src/products/shared/renderer/hooks/useVoiceInputComposer.ts` | Modify | Pick native bridge when present, fall back to web speech otherwise |
| `desktop/host/contracts.ts` | Modify | Add `voice:start` / `voice:stop` / `voice:cancel` / `voice:event` IPC contracts |
| `desktop/host/preload.cts` | Modify | Expose the four bridge methods on `catsDesktopHost` |
| `desktop/host/main.ts` | Modify | Register host IPC handlers; wire orchestrator lifecycle; install renderer permission allowlist (`display-capture` allowed, `media` denied) |
| `desktop/host/voiceCapture.ts` | Create | Orchestrator owning helper subprocess and event dispatch |
| `desktop/native/macos-stt/Package.swift` | Create | Swift Package Manager manifest for macOS helper |
| `desktop/native/macos-stt/Sources/CatsSttMacos/main.swift` | Create | macOS helper using `SFSpeechRecognizer` |
| `desktop/native/windows-stt/CatsSttWindows.csproj` | Create | .NET project (or `CatsSttWindows.vcxproj` if C++ /WinRT chosen) |
| `desktop/native/windows-stt/Program.cs` | Create | Windows helper using `Windows.Media.SpeechRecognition` |
| `scripts/build-desktop-installer.mjs` | Modify | Build native helpers into `app.asar.unpacked/native/<platform>-stt/` and include in signing/notarization |
| `assets/info.plist.template` (or equivalent macOS plist source) | Modify | Add `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription` |
| `tests/voice-input-composer.test.tsx` | Create | Renderer tests for bridge-vs-web fall-through, partial/final ordering, error toast routing |
| `tests/desktop-voice-capture-contract.test.js` | Create | Host contract tests for IPC shape, sender check, event dispatch, ready timeout |
| `tests/macos-stt-helper.test.swift` | Create | Helper smoke test against a WAV fixture (Phase 3) |
| `tests/windows-stt-helper.test.cs` | Create | Helper smoke test against a WAV fixture (Phase 4) |
| `docs/setup-guide.md` | Modify | Document macOS and Windows permission flows; document the Linux v1 limitation |

(Exact macOS plist source path and packaging entry point will be confirmed
when Phase 3 lands; existing packaging scripts are the source of truth.)

## Technical Decisions

- **Native engines only, no cloud and no bundled model.** Drives the
  whole architecture; explicitly rules out alternatives in ADR-079.
- **Helper subprocess per session, not a long-lived helper.** Simpler
  lifetime model; matches the screenshot precedent of bounded host-owned
  capabilities. Cold-start cost is dominated by engine warm-up, not
  process spawn, on both target OSes.
- **Line-delimited JSON over stdin/stdout.** Reuses the
  `processSupervisor.ts` pattern. No new IPC mechanism.
- **Single user-facing button.** Platform asymmetry stays invisible to
  the user. Matches the SPEC-079 single-action precedent.
- **Permission preflight on macOS, post-call mapping on Windows.**
  macOS exposes a synchronous status query for both Speech Recognition
  and Microphone; Windows surfaces denial via exceptions at recognizer
  construction time, so post-call mapping is the natural shape.
- **Linux falls through to existing toast.** Explicit non-goal in
  SPEC-084; no Linux-specific code path is added.

## Testing Strategy

- **Unit Tests** (renderer): bridge availability detection,
  partial/final insertion ordering, click-to-stop, Escape-to-cancel,
  selection-trust preservation, error reason → toast mapping.
- **Unit Tests** (host): IPC sender validation, session-id filtering,
  ready-timeout fallback, helper-crash translation.
- **Helper smoke tests**: each native helper accepts a `--input <wav>`
  flag in test builds and asserts that JSON events arrive on stdout
  for a fixture utterance.
- **Manual macOS validation**: fresh user profile permission prompt,
  Spanish/English/Mandarin smoke if installed, stop/cancel cleanup,
  microphone release.
- **Manual Windows validation**: fresh user profile mic consent,
  installed speech-pack locales smoke, stop/cancel cleanup, microphone
  release.
- **Manual Linux verification**: confirm the bridge methods are absent
  on `catsDesktopHost` and the existing toast appears on failure. No
  positive functionality is expected; the test is "did not regress".

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| macOS notarization rejects the new helper binary | High | Land the helper bundling and notarization in Phase 3 ahead of any UI rollout; verify with `codesign -dv --deep` and a notarization dry-run before publishing |
| Windows installer is flagged by SmartScreen due to new helper exe | Medium | Authenticode-sign the helper with the existing publisher cert as part of Phase 4; do not introduce an unsigned secondary binary |
| Helper subprocess hangs and never emits `ready` | High | Enforce the 3-second `ready` timeout in Phase 2; map to `engine_unavailable`; helper supervisor force-kills after timeout |
| Microphone is held after error or unexpected helper exit | High | All session teardown paths route through the orchestrator's `finally` block; verify via a Phase 2 host-test that simulates each error path and asserts the helper is killed |
| Selection-trust race overwrites user-typed text with partials | Medium | Reuse the existing `useVoiceInputComposer` selection-trust rules; add a renderer test that types into the composer mid-session and asserts no partial overwrites typed text |
| Locale request is unsupported (no installed speech pack) | Medium | Map to `language_not_supported` with a toast; do not silently fall back to a different locale because the user's draft would silently change language |
| .NET runtime version mismatch on user's Windows install | Medium | Default to framework-dependent .NET 8; fall back to self-contained publish if the Windows 10 19041+ baseline does not guarantee .NET 8; decision before Phase 4 build step |
| First-utterance latency exceeds 800 ms target | Medium | Measure on the primary target hardware during Phase 3/4 validation; if exceeded, investigate engine warm-up via a silent `start` shortly before the user's actual `ready` UX exposure (post-v1 follow-up) |
| New helper subprocess broadens the host attack surface | Medium | Renderer access stays behind sender-validated IPC (Phase 2); helper accepts only line-delimited JSON commands; no shell, no eval |
| Linux users perceive the feature as "broken on Linux" rather than "intentionally deferred" | Low | Document the limitation in `docs/setup-guide.md` and reference ADR-079; consider a future Linux toast copy refresh, but not in v1 |
| Cross-talk between rapid start/stop cycles | Medium | Session-id filtering on every event in the orchestrator; renderer ignores events for unknown session ids |
| Future renderer change accidentally introduces `getUserMedia({ audio })` and bypasses the native helper | Medium | Phase 2 permission handler explicitly denies `media`; host contract test asserts the deny path so any future renderer code that tries to capture audio through Chromium fails loudly during tests rather than silently succeeding |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-28 | Plan created from ADR-079 / SPEC-084. Awaiting Sammy review before Phase 1 start. |
| 2026-04-28 | Added Phase 2 task to install the Electron renderer permission allowlist (`display-capture` allowed, `media` denied) per SPEC-084 Req 20, plus corresponding host contract test coverage and a risk entry guarding against future renderer drift back into `getUserMedia`. |

---

*Created: 2026-04-28*
*Author: Claude*
