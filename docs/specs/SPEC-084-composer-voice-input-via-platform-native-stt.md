# SPEC-084: Composer Voice Input via Platform-Native STT

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | Sammy |

## Summary

The composer microphone button currently drives `useWebSpeechInput`, which
relies on `webkitSpeechRecognition`. In Electron Chromium that API never
returns a transcript because the build does not carry Google's private
speech-service key, so the button is broken on Windows, macOS, and Linux. This
spec defines a replacement: composer voice input is captured through the
Electron host using each desktop OS's free, on-device speech engine —
`SFSpeechRecognizer` on macOS and `Windows.Media.SpeechRecognition` on
Windows — exposed to the renderer through a typed preload bridge. Linux and
non-Electron contexts continue to use the existing path and surface failure
through the existing platform toast pattern.

## Goals

- Make the composer microphone button produce real, on-device transcripts on
  macOS and Windows desktop builds.
- Reuse the existing voice-input composer hook surface
  (`useVoiceInputComposer`) so callers do not change.
- Keep all OS audio capture, helper-process lifecycle, and permission state
  inside the Electron host.
- Surface partial transcripts to the composer cursor as soon as they are
  available, matching the existing UX expectation that voice text appears
  while speaking.
- Provide truthful, actionable failure feedback through the platform toast
  pattern when capture cannot proceed.
- Keep the user-facing button in a single shape across platforms — the user
  sees one action, not "macOS voice input" vs "Windows voice input".

## Non-Goals

- Do not introduce any cloud STT vendor (OpenAI Whisper, Deepgram, Azure,
  Google STT, etc.). Voice input must not depend on a cloud key.
- Do not bundle a local STT model or runtime (whisper.cpp, faster-whisper,
  Vosk, sherpa-onnx, WASM Whisper). No model artifacts in this slice.
- Do not integrate with `voice-gateway` or any other monorepo subproject's
  voice service. Voice capture stays inside cats-platform / cats-runtime.
- Do not implement Linux native STT in v1. Linux desktop continues to fall
  through to the existing `useWebSpeechInput` path and toast the failure.
- Do not implement TTS (text-to-speech) in this slice.
- Do not implement push-to-talk hotkeys, voice activation, wake-word, or
  global OS shortcuts.
- Do not support mid-utterance language switching. A capture session uses
  a single locale chosen at session start.
- Do not expose voice capture to surfaces other than the composer voice
  button in v1.
- Do not expose Electron, Node, or native helper APIs to the renderer.

## User Stories

- As a macOS desktop user, I want to dictate into the composer and see my
  words appear at the cursor without sending audio to a cloud service, so
  that I can keep my drafts private and offline.
- As a Windows desktop user, I want the same dictation experience in the
  composer using my installed Windows speech packs, so I do not need to
  configure any vendor key.
- As a Linux desktop user, I want the microphone button to clearly tell me
  it is unavailable on my platform when I click it, so I do not get stuck
  wondering whether my microphone is broken.
- As a user whose OS-level microphone permission is denied, I want a
  recovery toast that points me at the right system settings panel, so I
  can grant permission without leaving the app to search.

## Requirements

### Functional Requirements

1. The composer microphone button shall remain a single user-facing action
   across all platforms. Tooltip copy may differ by environment but the
   button identity, position, and active-state visuals shall be unchanged
   from today.
2. On macOS Electron and Windows Electron, the button shall start a
   platform-native STT capture session through a typed preload bridge
   method `window.catsDesktopHost.startVoiceCapture(options)`, where
   `options` includes the requested locale and a session-correlation id.
3. The host IPC handler shall reject `startVoiceCapture` calls whose
   `event.sender` is not the main Cats window's `webContents`, matching
   the screenshot bridge precedent.
4. On macOS, the host shall drive `SFSpeechRecognizer` via a bundled
   helper. The helper shall request on-device recognition
   (`requiresOnDeviceRecognition = true`) when the recognizer reports
   on-device support for the requested locale, and shall fall back to the
   recognizer's default mode when on-device support is unavailable.
5. On Windows, the host shall drive `Windows.Media.SpeechRecognition` via
   a bundled helper. The helper shall use a `ContinuousRecognitionSession`
   with the user's installed speech pack for the requested locale.
6. On Linux Electron and any non-Electron renderer (web app, mobile shell),
   the host bridge method shall be absent. The renderer shall fall through
   to the existing `useWebSpeechInput` path with no behavior change. Linux
   failures shall surface through the existing platform toast pattern; no
   new toast or copy is required for v1.
7. The renderer shall stream partial transcript chunks to the composer
   text input as they arrive, inserting at the current cursor position
   using the same selection-trust rules already present in
   `useVoiceInputComposer` (selection-update events from the user
   invalidate cached selection, blocking accidental overwrites).
8. The renderer shall finalize the transcript when the host emits a
   `final` event for the session. A final event without preceding partials
   shall be inserted whole at the cached cursor position.
9. The host shall emit `error` events with a typed reason from a closed
   set: `permission_denied`, `permission_not_determined`, `mic_unavailable`,
   `language_not_supported`, `engine_unavailable`, `helper_crashed`,
   `cancelled`, `aborted`. The renderer shall map each to user-facing
   toast copy (or silent dismissal for `cancelled` / `aborted`).
10. The user shall be able to stop a capture session by clicking the
    microphone button again. Clicking-to-stop shall emit a `stop` request
    that finalizes any in-flight partials and closes the session.
11. The user shall be able to cancel a capture session by pressing
    `Escape` while focus is on the composer textarea. Cancellation shall
    discard any unfinalized partials and not insert text.
12. The host shall always tear down the helper subprocess and release the
    microphone within 1 second of `stop` or `cancel`. Helper exit shall
    not be required for the renderer to consider the session ended — the
    renderer state transitions on the bridge `end` event, and host cleanup
    proceeds in the background.
13. On macOS, before starting the helper, the host shall preflight
    `SFSpeechRecognizer.authorizationStatus()` and
    `AVCaptureDevice.authorizationStatus(for: .audio)`. Status `.denied`
    or `.restricted` for either shall short-circuit to a
    `permission_denied` error with a toast pointing at the relevant
    System Settings pane (Privacy > Speech Recognition or Privacy >
    Microphone). Status `.notDetermined` shall be allowed to proceed so
    the first attempt triggers the OS prompt.
14. On Windows, the helper shall handle `UnauthorizedAccessException` and
    similar permission errors by emitting `permission_denied` with a
    toast pointing at Settings > Privacy & Security > Microphone.
15. The capture session shall use a single locale per session. The locale
    shall default to the host's STT default locale (queried from
    `SFSpeechRecognizer.supportedLocales()` intersected with the system
    preferred languages on macOS, and from
    `SpeechRecognizer.SystemSpeechLanguage` on Windows). The renderer may
    override via `options.locale` when explicitly chosen by the user; v1
    does not expose a UI for this.
16. The host shall emit a `ready` event when the helper has acquired the
    microphone and recognition is active. The composer shall not show
    the active recording state to the user until `ready` arrives, so the
    indicator never lies about whether audio is being captured.
17. If the helper does not emit `ready` within 3 seconds of
    `startVoiceCapture`, the host shall abort the session, emit
    `engine_unavailable`, and clean up the helper subprocess.
18. Helper process lifecycle shall use line-delimited JSON over
    stdin/stdout, with one event per line. Each event shall carry the
    session id. Events with mismatched or stale session ids shall be
    dropped silently to avoid cross-talk between rapid start/stop cycles.
19. The host shall log helper stderr to the existing host log surface
    (truncated per line) but shall **not** forward stderr content to the
    renderer. Renderer-visible failures use the typed `error` event only.
20. The Electron host shall register
    `session.defaultSession.setPermissionRequestHandler` on host startup,
    before the main window loads. The handler shall:
    - Allow `display-capture` (preserves the existing screenshot web
      fallback path).
    - Deny `media` (microphone and camera), guaranteeing that the
      renderer cannot reach audio or video capture through Chromium and
      that all voice input flows through the native helper subprocess.
    - Deny all other permission types by default unless added by a
      future ADR/SPEC.
    The handler applies to renderer-originated requests only; host-side
    `desktopCapturer`, native voice helpers, and other host-owned OS
    APIs remain unaffected.

### Non-Functional Requirements

- **Privacy**: No audio shall leave the user's machine. macOS recognition
  shall use on-device mode when supported; Windows recognition shall use
  the system-installed speech pack. The host shall not write captured
  audio to disk.
- **Security**: OS audio capture and helper-process control stay in the
  Electron host. Renderer access is limited to the typed bridge methods.
  The host shall additionally lock the renderer out of Chromium-mediated
  audio and video acquisition through an explicit permission allowlist
  (Functional Requirement 20), so voice capture is guaranteed to route
  through the native helper subprocess and never through `getUserMedia`.
  Helper binaries shall be signed (Authenticode on Windows, Apple
  notarization on macOS) as part of the existing packaging pipeline.
- **Reliability**: Cancellation, error, or unexpected helper exit shall
  always release the microphone within 1 second and shall return the
  composer to a clean idle state.
- **Performance**: First partial transcript shall arrive within 800 ms of
  the user beginning to speak on the primary macOS and Windows targets,
  measured from the `ready` event.
- **Accessibility**: The microphone button shall remain keyboard
  reachable. The active recording state shall be conveyed via
  `aria-pressed` and visible label change, not by color alone.
- **Compatibility**: Targets macOS 10.15+ and Windows 10 19041+ for the
  on-device recognition guarantees. Older OS versions fall through to the
  unsupported path with a toast.

## Design Overview

```text
Composer microphone button
  -> useVoiceInputComposer
    -> useNativeVoiceInput (new) detects bridge availability
       -> bridge present (macOS / Windows Electron)
            -> window.catsDesktopHost.startVoiceCapture({ locale, sessionId })
            -> host preflights permission status
            -> host spawns platform helper subprocess
            -> helper acquires mic, starts recognizer, emits `ready`
            -> helper streams `partial` and `final` JSON events
            -> renderer inserts text at cursor honoring selection-trust rules
            -> user clicks button again → bridge.stop(sessionId)
            -> helper finalizes, exits, host releases mic, emits `end`
       -> bridge absent (Linux Electron, web)
            -> falls through to existing useWebSpeechInput
            -> failures continue to surface as the existing toast
```

### Bridge Contract Sketch

```ts
// src/shared/voiceCaptureBridge.ts
type VoiceCaptureSessionId = string;

interface VoiceCaptureStartOptions {
  sessionId: VoiceCaptureSessionId;
  locale?: string;
}

type VoiceCaptureEvent =
  | { type: 'ready'; sessionId: VoiceCaptureSessionId; locale: string }
  | { type: 'partial'; sessionId: VoiceCaptureSessionId; text: string }
  | { type: 'final'; sessionId: VoiceCaptureSessionId; text: string }
  | { type: 'error'; sessionId: VoiceCaptureSessionId; reason: VoiceCaptureErrorReason }
  | { type: 'end'; sessionId: VoiceCaptureSessionId };

type VoiceCaptureErrorReason =
  | 'permission_denied'
  | 'permission_not_determined'
  | 'mic_unavailable'
  | 'language_not_supported'
  | 'engine_unavailable'
  | 'helper_crashed'
  | 'cancelled'
  | 'aborted';

interface VoiceCaptureBridge {
  startVoiceCapture(options: VoiceCaptureStartOptions): Promise<void>;
  stopVoiceCapture(sessionId: VoiceCaptureSessionId): Promise<void>;
  cancelVoiceCapture(sessionId: VoiceCaptureSessionId): Promise<void>;
  onVoiceCaptureEvent(handler: (event: VoiceCaptureEvent) => void): () => void;
}
```

`DesktopHostBridge` in `src/shared/desktopRecoveryBridge.ts` gains optional
`startVoiceCapture` / `stopVoiceCapture` / `cancelVoiceCapture` /
`onVoiceCaptureEvent` methods. Their absence is the renderer's signal to use
the legacy path.

### Helper Process Topology

- **macOS helper**: a small Swift CLI (single binary) bundled in
  `app.asar.unpacked/native/macos-stt/cats-stt-macos` and launched with
  `--locale <bcp47> --on-device <bool>`. It opens an `AVAudioEngine` tap,
  feeds buffers into `SFSpeechAudioBufferRecognitionRequest`, and prints
  one JSON event per line to stdout.
- **Windows helper**: a small .NET CLI (framework-dependent or
  self-contained, decided in PLAN-075 Phase 3) bundled in
  `app.asar.unpacked/native/windows-stt/cats-stt-windows.exe` and launched
  with the same CLI shape. It uses `SpeechRecognizer.ContinuousRecognitionSession`
  and prints JSON events.

The host orchestrator (`desktop/host/voiceCapture.ts`) hides this asymmetry
behind one interface. Renderer code never branches on `process.platform`.

## Dependencies

- Electron host preload bridge already used by Cats desktop (ADR-003,
  ADR-078).
- Existing `useVoiceInputComposer` hook and toast surface in the
  composer.
- macOS Speech.framework (system-provided, no SDK to vendor).
- Windows Runtime APIs `Windows.Media.SpeechRecognition` and
  `Windows.Media.Capture` (system-provided, accessed via .NET / C++).
- Existing host process supervision pattern from `processSupervisor.ts`.
- Code-signing / notarization pipeline already used for the Electron
  host (must extend to the new helpers).

## Open Questions

- [ ] Should the renderer expose a locale picker in v1, or always use the
      host default? Leaning toward host default for v1; locale picker can
      arrive in a follow-up if users complain.
- [ ] On Windows, should the helper be C# (.NET 8 self-contained) or
      C++ /WinRT? C# is faster to write and ship; C++ /WinRT avoids the
      .NET runtime size. Decision needed before PLAN-075 Phase 3.
- [ ] Should partial transcripts replace the previous partial in-place
      (overwrite) or accumulate? `useVoiceInputComposer` today inserts
      finals only. The transition should keep the existing insertion
      contract for finals and treat partials as a transient hint that
      gets replaced by the final on session end. Confirm during Phase 1
      design.
- [ ] What happens when the user starts typing while a capture session
      is active? The selection-trust rules already protect against
      partial-overwrite; but should typing implicitly cancel the session,
      or coexist? Default proposal: typing leaves the session active,
      partials still arrive at the (now-moved) cursor. Confirm with UX.

## References

- [ADR-079: Use Platform-Native STT for Composer Voice Input with Linux Toast Fallback](../decisions/079-use-platform-native-stt-with-linux-toast-fallback.md)
- [PLAN-075: Composer Voice Input Native STT Rollout](../plans/PLAN-075-composer-voice-input-native-stt-rollout.md)
- [ADR-078: Use Electron-Native Region Screenshot with Web Fallback](../decisions/078-use-electron-native-region-screenshot-with-web-fallback.md)
  (precedent for host-owned native capabilities)
- Apple `SFSpeechRecognizer`: https://developer.apple.com/documentation/speech/sfspeechrecognizer
- Microsoft `Windows.Media.SpeechRecognition`: https://learn.microsoft.com/uwp/api/windows.media.speechrecognition

---

*Created: 2026-04-28*
*Author: Claude*
*Related Plan: [PLAN-075](../plans/PLAN-075-composer-voice-input-native-stt-rollout.md)*
