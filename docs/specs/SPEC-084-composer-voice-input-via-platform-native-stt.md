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
Electron host using each desktop OS's free, system-native speech engine —
`SFSpeechRecognizer` on macOS and `Windows.Media.SpeechRecognition` on
Windows — exposed to the renderer through a typed preload bridge. The
privacy posture is per-platform and surfaced to the renderer per session:
macOS enforces on-device recognition (audio stays on the machine), while
Windows routes through whichever path the user's Windows speech privacy
setting permits and the slice surfaces a conservative privacy warning
because the WinRT API cannot prove the active path. Linux and non-Electron contexts
continue to use the existing `useWebSpeechInput` path and surface failure
through the existing platform toast pattern.

## Goals

- Make the composer microphone button produce real transcripts on
  macOS and Windows desktop builds, using each platform's system-native
  speech engine and without requiring any third-party API key.
- Enforce on-device recognition on macOS so captured audio is guaranteed
  not to leave the user's machine; fail closed when the locale lacks
  on-device support rather than silently routing through Apple's servers.
- Be honest about the Windows privacy posture: the chosen WinRT API does
  not expose a runtime flag to force on-device recognition for free-form
  dictation, so the actual route is governed by the user's OS-level
  privacy setting; surface that Cats cannot prove the session is local
  (`mode: 'unknown'`) and explain the configuration requirement in
  user-facing docs.
- Reuse the existing voice-input composer hook surface
  (`useVoiceInputComposer`) so callers do not change.
- Keep all OS audio capture, helper-process lifecycle, and permission state
  inside the Electron host (or the helper subprocess) — never in the
  renderer.
- Provide truthful, actionable failure feedback through the platform toast
  pattern when capture cannot proceed.
- Keep the user-facing button in a single shape across platforms — the user
  sees one action, not "macOS voice input" vs "Windows voice input".

## Non-Goals

- Do not introduce any app-managed cloud STT vendor (OpenAI Whisper,
  Deepgram, Azure Speech, Google STT, etc.) or any Cats-owned cloud STT
  key. The Windows OS speech service is not configured by Cats; when the
  user's Windows privacy setting allows Microsoft online dictation, Cats
  must surface that the session's locality cannot be proven rather than
  presenting it as local.
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
- As a Linux desktop user, I want the microphone button to remain
  visible and clickable on my platform and to surface a clear toast when
  recognition cannot proceed, so I do not get stuck wondering whether my
  microphone is broken.
- As a privacy-sensitive Windows user, I want the renderer to clearly
  show when Cats cannot prove audio stays on my machine, because Windows
  may route free-form dictation through Microsoft online speech depending
  on OS privacy settings, so I am not misled by a generic "voice input"
  indicator into believing recognition is local.
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
   helper. The helper shall enforce on-device recognition by setting
   `requiresOnDeviceRecognition = true` on every recognition request.
   If `SFSpeechRecognizer.supportsOnDeviceRecognition` is false for the
   requested locale, the helper shall emit `language_not_supported` and
   exit before opening any audio device. The helper shall **never** fall
   back to network-mediated recognition; macOS audio is guaranteed to
   stay on the user's machine.
5. On Windows, the host shall drive `Windows.Media.SpeechRecognition` via
   a bundled helper using `ContinuousRecognitionSession` with the user's
   configured `SystemSpeechLanguage`. The WinRT API does not expose a
   runtime flag to force on-device recognition for free-form dictation;
   the actual route (on-device speech pack vs Microsoft's online speech
   service) is governed by the user's Windows Privacy → Speech "Online
   speech recognition" setting and the installed speech pack. The helper
   shall not attempt to override or work around the user's OS-level
   choice. The user-facing documentation shall explain that, to keep
   audio fully local, the user must disable "Online speech recognition"
   in Windows Settings and verify the speech pack for their locale is
   installed.
6. On Linux Electron and any non-Electron renderer (web app, mobile
   shell), the host bridge method shall be absent. The renderer's
   `useVoiceInputComposer` shall fall through to `useWebSpeechInput`.
   The microphone button shall remain visible (gated only on the
   `SpeechRecognition` constructor presence, which is true in Electron's
   Chromium build), so the user can always click and receive feedback;
   `start()` shall succeed-to-begin and subsequent failures
   (`network`, `service-not-allowed`, etc.) shall surface through the
   toast wiring established in commit 55c15f5a (`fix(chat-view): keep
   mic button and surface errors via toast instead of disabling`). No
   new code path or toast copy is required for Linux in v1; the
   contract is that the existing path remains reachable rather than the
   button silently disappearing on first failure.
7. The renderer shall insert finalized transcripts at the cached cursor
   position when the host emits a `final` event, using the same
   selection-trust rules already present in `useVoiceInputComposer`
   (selection-update events from the user invalidate cached selection,
   blocking accidental overwrites). The host MAY emit `partial` events
   for diagnostic or future-UI purposes, but in v1 the renderer SHALL
   NOT modify the textarea on `partial` events. Live partial-driven UI
   (e.g., a transient hint chip, underlined preview text) is reserved
   for a follow-up slice; deferring it avoids the duplication risk that
   arises when partials are inserted inline and a final later overwrites
   them.
8. The host shall emit a `final` event for each completed utterance the
   recognizer produces during the session. Multiple `final` events may
   occur within a single session (e.g., between pauses); each shall be
   inserted at the current cursor position per Req 7. A session ends
   only on `stop`, `cancel`, or `error` — not on the first `final`.
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
    microphone within 1 second of `cancel`. For `stop`, the helper shall
    release the microphone as fast as the platform speech API allows: on
    macOS the helper stops `AVAudioEngine` and removes the input tap
    synchronously, while on Windows the helper relies on WinRT `StopAsync`,
    which gracefully ends the recognition session and releases the
    microphone when the session completes (typically within hundreds of
    milliseconds; the WinRT API does not separate audio capture from
    session lifetime). After audio capture has ended, the helper may keep
    the recognition task alive for a bounded cleanup window to deliver
    buffered final results before the host kills the helper. The macOS
    helper additionally schedules a bounded fallback so empty or very short
    utterances cannot leave the helper waiting for an `isFinal` callback
    that `SFSpeechRecognizer` may never deliver. Helper exit shall not be
    required for the renderer to consider the session ended — the renderer
    state transitions on the bridge `end` event, and host cleanup proceeds
    in the background.
13. On macOS, the helper shall preflight permission status as its first
    action — before opening any audio device — by querying
    `SFSpeechRecognizer.authorizationStatus()` and
    `AVCaptureDevice.authorizationStatus(for: .audio)`. Status `.denied`
    or `.restricted` for either shall cause the helper to emit
    `permission_denied` and exit immediately. Status `.notDetermined`
    shall cause the helper to request OS authorization for Speech Recognition
    and Microphone before opening audio; if the user still has not granted
    access, the helper emits `permission_not_determined` or
    `permission_denied` and exits fail-closed. The host MAY
    additionally fast-fail before launching the helper using Electron's
    `systemPreferences.getMediaAccessStatus('microphone')` (Node-callable
    on macOS), but the authoritative check lives in the helper because
    no equivalent Electron API exists for Speech Recognition status.
    The renderer toast for `permission_denied` points at the relevant
    System Settings pane (Privacy > Speech Recognition or Privacy >
    Microphone).
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
21. The host's `ready` event shall include a `mode` field describing the
    recognition locality known to the app: `'on-device'`, `'cloud'`, or
    `'unknown'`. `unknown` means the app cannot prove whether audio stays
    local; it is not an assertion that the session is local. macOS
    sessions shall always emit `mode: 'on-device'` (Req 4 makes this
    enforceable). Windows sessions shall emit `mode: 'unknown'` because
    the WinRT API does not expose the user's "Online speech recognition"
    privacy setting; the renderer shall surface a conservative
    per-session indicator for non-`on-device` modes (e.g., a small chip
    on the active microphone button saying the session may use Microsoft
    online speech) so privacy-sensitive users are not misled into
    believing audio stays local. Helper implementations MAY upgrade
    `unknown` to `'on-device'` or `'cloud'` in the future if a reliable
    detection path is found.

### Non-Functional Requirements

- **Privacy**: The privacy guarantee is per-platform and is surfaced to
  the renderer per session via the `mode` field of the `ready` event
  (Req 21). On macOS, audio shall not leave the user's machine; the
  helper enforces on-device recognition (Req 4) and fails closed when
  the locale is unsupported. On Windows, audio routing follows the
  user's OS-level "Online speech recognition" privacy choice; the slice
  cannot override this from inside the app and surfaces
  `mode: 'unknown'` so the renderer can warn privacy-sensitive users
  that Cats cannot prove locality for the session. The host shall not
  write captured audio to disk on any platform. Documentation shall
  explain the Windows configuration required for fully-local recognition.
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
- **Performance**: The host shall forward each helper `final` event to the
  renderer without material delay (target: under 100 ms of helper emission).
  Startup readiness is governed by Req 17. Live partial-latency targets are
  deferred with the partial-driven UI follow-up.
- **Accessibility**: The microphone button shall remain keyboard
  reachable. The active recording state shall be conveyed via
  `aria-pressed` and visible label change, not by color alone.
- **Compatibility**: Targets macOS 10.15+ for strict on-device recognition
  and Windows 10 19041+ for the WinRT speech helper. Windows locality remains
  governed by OS speech privacy settings (Req 5 / Req 21). Older OS versions
  fall through to the unsupported path with a toast.

## Design Overview

```text
Composer microphone button
  -> useVoiceInputComposer
    -> useNativeVoiceInput (new) detects bridge availability
       -> bridge present (macOS / Windows Electron)
            -> window.catsDesktopHost.startVoiceCapture({ locale, sessionId })
            -> host fast-fails on systemPreferences.getMediaAccessStatus('microphone') if denied (macOS only)
            -> host spawns platform helper subprocess
            -> helper preflights authorization (Speech + Microphone) as its first action
            -> on denied: helper emits `permission_denied` and exits
            -> macOS helper checks supportsOnDeviceRecognition; emits language_not_supported and exits if false
            -> helper acquires mic, starts recognizer, emits `ready` with privacy `mode`
            -> helper streams `final` JSON events as utterances complete
               (partials may also be emitted but are not consumed by renderer in v1)
            -> renderer inserts each `final` at cursor honoring selection-trust rules
            -> user clicks button again → bridge.stop(sessionId)
            -> helper finalizes, exits, host releases mic, emits `end`
       -> bridge absent (Linux Electron, web)
            -> falls through to existing useWebSpeechInput
            -> button stays visible (constructor-presence gate)
            -> click invokes start(); subsequent failures surface via existing toast wiring (commit 55c15f5a)
```

### Bridge Contract Sketch

```ts
// src/shared/voiceCaptureBridge.ts
type VoiceCaptureSessionId = string;
type VoiceCaptureMode = 'on-device' | 'cloud' | 'unknown';

interface VoiceCaptureStartOptions {
  sessionId: VoiceCaptureSessionId;
  locale?: string;
}

type VoiceCaptureEvent =
  | {
      type: 'ready';
      sessionId: VoiceCaptureSessionId;
      locale: string;
      mode: VoiceCaptureMode;
    }
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
  `--session-id <id> [--locale <bcp47>]`. It opens an `AVAudioEngine` tap,
  feeds buffers into `SFSpeechAudioBufferRecognitionRequest`, and prints
  one JSON event per line to stdout.
- **Windows helper**: a small self-contained .NET CLI bundled in
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
- [x] On Windows, should the helper be C# (.NET 8 self-contained) or
      C++ /WinRT? C# is faster to write and ship; C++ /WinRT avoids the
      .NET runtime size. Decision: ship the C# helper as self-contained so
      users do not need a separate .NET 8 runtime install.
- [ ] What happens when the user starts typing while a capture session
      is active? The selection-trust rules already protect against
      mid-utterance overwrite; but should typing implicitly cancel the
      session, or coexist? Default proposal: typing leaves the session
      active and the next `final` lands at the (now-moved) cursor.
      Confirm with UX.
- [ ] Is the Windows `mode: 'unknown'` posture acceptable for v1, or
      should we attempt programmatic detection of the "Online speech
      recognition" privacy setting? No public WinRT API exists for the
      former, but a UWP app capability or undocumented registry probe
      may be possible. v1 default: emit `unknown`, show a conservative
      "may use Microsoft online speech" indicator, and document the
      requirement to users.

Resolved and promoted to Requirements:

- Partial-vs-final insertion contract → finals only in v1; partials
  reserved for a follow-up slice (Req 7).
- macOS on-device-only enforcement → fail closed when locale is not
  on-device-supported, no silent network fallback (Req 4).
- Permission preflight execution boundary → first action of the helper,
  with optional host fast-fail via Electron `systemPreferences` (Req 13).
- Per-session privacy posture reporting → `ready` event carries `mode`
  field; renderer surfaces a conservative warning for non-`on-device`
  modes in UI (Req 21).

## References

- [ADR-079: Use Platform-Native STT for Composer Voice Input with Linux Toast Fallback](../decisions/079-use-platform-native-stt-with-linux-toast-fallback.md)
- [PLAN-076: Composer Voice Input Native STT Rollout](../plans/PLAN-076-composer-voice-input-native-stt-rollout.md)
- [ADR-078: Use Electron-Native Region Screenshot with Web Fallback](../decisions/078-use-electron-native-region-screenshot-with-web-fallback.md)
  (precedent for host-owned native capabilities)
- Apple `SFSpeechRecognizer`: https://developer.apple.com/documentation/speech/sfspeechrecognizer
- Microsoft `Windows.Media.SpeechRecognition`: https://learn.microsoft.com/uwp/api/windows.media.speechrecognition

---

*Created: 2026-04-28*
*Last revised: 2026-04-28 (review follow-up #2: macOS now schedules a bounded `isFinal` fallback so empty/short utterances do not stall the host stop cleanup window; Req 12 wording aligned with Windows WinRT graceful-stop reality so the spec no longer claims an immediate microphone release the API cannot guarantee; cleanup-timeout split has dedicated contract test coverage; macOS TCC helper attribution remains a required fresh-profile validation item.)*
*Author: Claude*
*Related Plan: [PLAN-076](../plans/PLAN-076-composer-voice-input-native-stt-rollout.md)*
