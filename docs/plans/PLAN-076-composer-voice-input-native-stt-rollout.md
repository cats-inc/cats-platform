# PLAN-076: Composer Voice Input Native STT Rollout

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
through the existing toast pattern. No app-managed cloud STT, no bundled
local model; Windows follows the user's OS speech privacy settings and
surfaces `mode: 'unknown'` until a reliable locality detector exists.

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
      `ready` (including `mode`) / `partial` / `final` / `end` /
      `error` events as a stable hook surface, treats partials as
      non-textarea diagnostic events in v1, and degrades gracefully when
      the bridge is absent.
- [ ] Refactor
      `src/products/shared/renderer/hooks/useVoiceInputComposer.ts` to
      pick `useNativeVoiceInput` when the bridge is present and otherwise
      keep the current `useWebSpeechInput` path unchanged. Selection-trust
      and cursor-insertion semantics are preserved.
- [ ] Map each `VoiceCaptureErrorReason` to the existing platform toast
      copy. `cancelled` and `aborted` shall be silent (no toast). Add
      one new toast string per remaining reason.
- [ ] Add targeted renderer tests for: bridge present vs absent
      detection, finals-only textarea insertion, ignored partial events
      in v1, `ready.mode` privacy-indicator routing (`on-device` vs
      `unknown`), click-to-stop behavior, Escape-to-cancel behavior, and
      toast routing for each error reason.
- [ ] Confirm composer mic button visibility logic continues to gate on
      `voiceInputSupported` and that supported = true whenever either
      path can run, so the button is never silently hidden when the
      bridge would work.

**Deliverables**: Renderer can drive a mocked bridge end-to-end through
the composer; legacy path continues to work unchanged on Linux and web.

### Phase 2: Host Voice Capture Orchestrator and IPC Wiring

- [ ] Define the IPC contract in `desktop/host/contracts.ts`: request
      shapes (`voice:start`, `voice:stop`, `voice:cancel`), event shape
      (`voice:event`), the typed `VoiceCaptureEvent` payload, and the
      `VoiceCaptureMode` union carried by `ready.mode`.
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
- [ ] Implement helper-side preflight as the helper's first action
      (SPEC-084 Req 13): query
      `SFSpeechRecognizer.authorizationStatus()` plus
      `AVCaptureDevice.authorizationStatus(for: .audio)` before opening
      any audio device; emit `permission_denied` and exit immediately on
      `.denied` / `.restricted`; request OS authorization when status is
      `.notDetermined`, then fail closed unless the user grants access.
- [ ] Wire optional host-side fast-fail via Electron
      `systemPreferences.getMediaAccessStatus('microphone')` to
      short-circuit before launching the helper when mic is denied.
      The helper preflight remains the authoritative check because no
      Electron API exposes Speech Recognition status.
- [ ] Enforce `requiresOnDeviceRecognition = true` on every recognition
      request in the macOS helper (SPEC-084 Req 4). Before opening the
      audio device, check
      `SFSpeechRecognizer.supportsOnDeviceRecognition` for the requested
      locale; emit `language_not_supported` and exit when on-device
      support is unavailable. Never fall back to network-mediated
      recognition.
- [ ] Emit `mode: 'on-device'` on the macOS `ready` event (SPEC-084
      Req 21).
- [ ] Add a host smoke test that spawns the helper with a recorded
      WAV fixture (helper accepts an `--input <wav>` flag for testing
      only) and asserts `ready.mode === 'on-device'` plus at least one
      final event. Partial events may be asserted only if the helper
      emits them; they are not required for the v1 textarea contract.
- [ ] Manually verify on a fresh macOS user profile: first-run
      permission prompts (Speech Recognition + Microphone), first-utterance
      latency, on-device mode active (assert `ready` event emits
      `mode: 'on-device'`), `language_not_supported` fail-closed path
      using a locale known to lack on-device support, locale matches
      system language, stop and cancel cleanup, and post-error microphone
      release. This validation must explicitly confirm TCC attribution for
      the spawned helper binary versus the parent Cats app bundle.

**Deliverables**: macOS Electron build produces real composer transcripts
on a notarized installer.

### Phase 4: Windows Native Helper (Windows.Media.SpeechRecognition)

- [x] Decide C# (.NET 8 self-contained) vs C++ /WinRT for the helper
      (SPEC-084 Open Question). Decision: use the C# / WinRT helper and
      publish it self-contained because Windows 10 19041+ does not guarantee
      a .NET 8 runtime.
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
      errors to `permission_denied`. Map missing-speech-pack /
      unsupported-language errors from the SpeechRecognizer's
      compilation step to `language_not_supported`. Map any other
      startup failure to `engine_unavailable`.
- [ ] Emit `mode: 'unknown'` in the Windows `ready` event because the
      WinRT API does not expose the user's "Online speech recognition"
      privacy setting (SPEC-084 Req 21). Do not attempt to detect or
      override the user's OS privacy choice from inside the helper.
- [ ] Route `mode: 'unknown'` to conservative renderer copy indicating
      the session may use Microsoft online speech. Do not label it as
      "cloud" or "local" unless future detection makes that assertion
      reliable.
- [ ] Document, alongside the Phase 5 validation steps, the user-facing
      requirement to disable "Online speech recognition" in Windows
      Settings → Privacy → Speech and verify the speech pack for their
      locale is installed in order to keep recognition fully local on
      Windows.
- [ ] Add a host smoke test that spawns the helper with a recorded
      WAV fixture (helper accepts an `--input <wav>` flag for testing
      only) and asserts `ready.mode === 'unknown'` plus at least one
      final event. Partial events may be asserted only if the helper
      emits them; they are not required for the v1 textarea contract.
- [ ] Manually verify on a fresh Windows 10 / 11 user profile: first-run
      microphone consent, first-utterance latency, locale matches
      installed speech pack, stop and cancel cleanup, post-error
      microphone release, AND both privacy postures: (a) "Online speech
      recognition" enabled (recognition succeeds, audio leaves the
      machine via Microsoft online dictation); (b) "Online speech
      recognition" disabled with a matching speech pack installed
      (recognition succeeds locally). Both should report
      `mode: 'unknown'` in the `ready` event per Req 21 unless future
      detection is added.

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
- [ ] Document Windows microphone permission AND speech privacy behavior
      in the same place: the `mode: 'unknown'` posture, the conservative
      "may use Microsoft online speech" renderer indicator, the
      requirement to disable "Online speech recognition" in Windows
      Settings → Privacy → Speech for fully-local recognition, and the
      speech-pack install path.
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
| `src/shared/voiceCaptureBridge.ts` | Create | Typed bridge contract: events, error reasons, session ids, `VoiceCaptureMode` |
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
| `tests/voice-input-composer.test.tsx` | Create | Renderer tests for bridge-vs-web fall-through, finals-only insertion, ignored partial events, privacy-mode indicator routing, error toast routing |
| `tests/desktop-voice-capture-contract.test.js` | Create | Host contract tests for IPC shape, sender check, event dispatch, ready timeout |
| `tests/macos-stt-helper.test.swift` | Create | Helper smoke test against a WAV fixture (Phase 3) |
| `tests/windows-stt-helper.test.cs` | Create | Helper smoke test against a WAV fixture (Phase 4) |
| `docs/setup-guide.md` | Modify | Document macOS and Windows permission flows; document the Linux v1 limitation |

(Exact macOS plist source path and packaging entry point will be confirmed
when Phase 3 lands; existing packaging scripts are the source of truth.)

## Technical Decisions

- **Native engines only, no Cats-owned cloud STT and no bundled model.**
  Drives the whole architecture; explicitly rules out app-managed cloud
  vendors while documenting that Windows may use Microsoft's OS speech
  service according to the user's privacy settings.
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
  finals-only insertion, ignored partial events, `ready.mode` indicator
  routing, click-to-stop, Escape-to-cancel, selection-trust preservation,
  error reason → toast mapping.
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
| Selection-trust race overwrites user-typed text with transcripts | Medium | Reuse the existing `useVoiceInputComposer` selection-trust rules; add a renderer test that types into the composer mid-session and asserts ignored partials and later finals do not overwrite typed text |
| Locale request is unsupported (no installed speech pack) | Medium | Map to `language_not_supported` with a toast; do not silently fall back to a different locale because the user's draft would silently change language |
| .NET runtime version mismatch on user's Windows install | Medium | Publish the Windows helper self-contained so the installer does not depend on a preinstalled .NET 8 runtime |
| First utterance feels slow on target hardware | Medium | Measure startup, first final, and host forwarding latency during Phase 3/4 validation; if OS engine warm-up dominates, investigate prewarming after the user explicitly starts capture or defer live partial preview to the follow-up slice |
| New helper subprocess broadens the host attack surface | Medium | Renderer access stays behind sender-validated IPC (Phase 2); helper accepts only line-delimited JSON commands; no shell, no eval |
| Linux users perceive the feature as "broken on Linux" rather than "intentionally deferred" | Low | Document the limitation in `docs/setup-guide.md` and reference ADR-079; consider a future Linux toast copy refresh, but not in v1 |
| Cross-talk between rapid start/stop cycles | Medium | Session-id filtering on every event in the orchestrator; renderer ignores events for unknown session ids |
| Future renderer change accidentally introduces `getUserMedia({ audio })` and bypasses the native helper | Medium | Phase 2 permission handler explicitly denies `media`; host contract test asserts the deny path so any future renderer code that tries to capture audio through Chromium fails loudly during tests rather than silently succeeding |
| macOS user with an unsupported on-device locale is silently routed to Apple's servers under the helper's default settings | High | Helper sets `requiresOnDeviceRecognition = true` and fails closed with `language_not_supported` rather than network-fallback (SPEC-084 Req 4); helper smoke test asserts the closed-fail path with a known-unsupported locale fixture |
| Windows users believe audio is local because the button label says "voice input", but Microsoft's online dictation may be in use (privacy mismatch) | High | Renderer surfaces a per-session privacy-mode chip when `mode !== 'on-device'`; Windows `mode: 'unknown'` copy must conservatively say the session may use Microsoft online speech rather than claiming a detected cloud/local path; user-facing documentation explains the Windows privacy-setting requirement; Phase 4 manual validation exercises both privacy postures |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-28 | Plan created from ADR-079 / SPEC-084. Awaiting Sammy review before Phase 1 start. |
| 2026-04-28 | Added Phase 2 task to install the Electron renderer permission allowlist (`display-capture` allowed, `media` denied) per SPEC-084 Req 20, plus corresponding host contract test coverage and a risk entry guarding against future renderer drift back into `getUserMedia`. |
| 2026-04-28 | Review-pass follow-up: macOS path now strict on-device with fail-closed (`requiresOnDeviceRecognition = true`, `language_not_supported` when locale unsupported); Windows path made honest about OS privacy routing (no API to force on-device, `mode: 'unknown'` emitted, documentation requirement added); helper-side preflight replaces the unworkable host-side preflight (host is Node, no Speech.framework binding); finals-only insertion in v1 with partials reserved for follow-up; Linux button-visibility / toast contract made explicit per the existing 55c15f5a behavior. |
| 2026-04-28 | Contract cleanup: `ready.mode` is now an explicit bridge field via `VoiceCaptureMode`; Windows `unknown` is treated as a conservative "may use Microsoft online speech" posture rather than an active-mode claim; renderer/helper tests no longer require optional partial events for the v1 textarea contract. |
| 2026-04-28 | Phase 1 renderer bridge slice landed: added the shared `VoiceCaptureBridge` / `VoiceCaptureMode` contract, optional desktop bridge methods, native renderer hook selection ahead of the Web Speech fallback, finals-only transcript insertion, Escape cancellation, non-`on-device` privacy badge plumbing, and focused source-contract coverage. Host IPC and native helpers remain Phase 2+. |
| 2026-04-28 | Host/native slice landed: added Electron IPC channels, main-window sender validation, renderer permission allowlist (`display-capture` only), voice helper subprocess orchestration with ready timeout / stale-session filtering / stop-cancel cleanup, platform-gated preload methods, macOS Swift helper source, Windows WinRT helper source, native helper installer staging, macOS speech/microphone plist copy, and focused host/helper contract coverage. |
| 2026-04-28 | Review follow-up hardening: macOS stop now ends audio and waits for a final/natural recognizer callback instead of immediately cancelling the task; Windows helper packaging switched to self-contained .NET publish; helper stdin commands parse JSON with session id matching; ready-timeout and finals-only regression coverage tightened; setup docs now call out the required fresh-profile macOS TCC validation before release. |
| 2026-04-28 | Review follow-up #2: bounded macOS `isFinal` fallback (800 ms after `stopAudioInput`) closes the empty-utterance hang so the renderer indicator does not linger up to the full host stop cleanup window when the user clicks stop without speaking; Req 12 wording aligned with Windows WinRT graceful-stop reality so the spec no longer claims an immediate microphone release the WinRT API cannot guarantee; added contract test coverage that asserts the stop-vs-cancel cleanup-timeout split (cancel kills inside its short window, stop survives past the cancel window and is killed inside its longer window). |

---

*Created: 2026-04-28*
*Author: Claude*
