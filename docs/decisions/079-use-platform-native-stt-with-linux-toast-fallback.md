# ADR-079: Use Platform-Native STT for Composer Voice Input with Linux Toast Fallback

## Status

Proposed

## Context

The Cats composer surfaces a microphone button that today drives
`useWebSpeechInput`, which depends on the Chromium `webkitSpeechRecognition`
API. In Chrome the browser, that API works because Google ships a private
speech-service API key inside their Chrome build. Electron's bundled Chromium
does **not** carry that key (Google's OEM policy disallows reuse), so on
Windows, macOS, and Linux the API object exists, `start()` returns without
throwing, but the underlying request fails with `network` (or silently never
delivers a result). The button is non-functional on every desktop target.

The team has explicitly ruled out two otherwise viable repair paths for this
slice:

- **App-managed cloud STT vendors** (OpenAI Whisper, Deepgram, Azure Speech,
  Google STT, etc.) are out of scope. Voice input must not depend on a
  Cats-owned cloud key, paid service, or app-managed vendor route. The one
  exception is the Windows OS speech stack itself: if the user's Windows
  privacy settings allow Microsoft online dictation, Cats does not override
  that OS-level choice and must surface a conservative privacy warning instead
  of claiming the session is local.
- **Bundled local STT engines** (whisper.cpp, faster-whisper, Vosk,
  sherpa-onnx, Whisper WASM) are out of scope. The team does not want to ship
  model artifacts, native runtime binaries, or download-on-first-use flows
  inside the Electron app at this stage.

Both desktop OS vendors expose a free, system-native speech capability that
Electron can drive through the existing host/preload boundary established by
ADR-003 and ADR-078:

- macOS provides `SFSpeechRecognizer` (Speech.framework) with on-device
  recognition supported on macOS 10.15+ for the languages the user has
  installed for Siri / system dictation. It requires
  `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription`
  in the bundled Info.plist and a one-time user permission grant.
- Windows provides `Windows.Media.SpeechRecognition` (WinRT). It can use
  installed speech packs, but free-form dictation may route through Microsoft's
  online speech service depending on the user's Windows Privacy → Speech
  setting. The microphone permission flow is governed by Windows Settings >
  Privacy > Microphone for desktop apps.
- Linux has **no** equivalent OS-provided STT engine. There is no
  cross-distribution native API to fall back to.

The team is willing to leave Linux unsupported for v1 — the existing toast
error path (surfaced when `webkitSpeechRecognition` fails or is unavailable) is
acceptable Linux behavior.

## Decision

The composer voice input button will be powered by **platform-native STT
engines**, accessed through the Electron host and preload bridge, with no
app-managed cloud dependency and no bundled model artifacts:

- **macOS desktop** uses a bundled Swift helper that drives
  `SFSpeechRecognizer` against microphone audio captured by the helper.
  The helper enforces on-device recognition by setting
  `requiresOnDeviceRecognition = true` on every session. If the requested
  locale is not on-device-supported, the helper fails closed with
  `language_not_supported` rather than silently falling back to Apple's
  servers. macOS audio is therefore guaranteed to stay on the user's
  machine.
- **Windows desktop** uses a bundled .NET / WinRT helper that drives
  `Windows.Media.SpeechRecognition`. The actual recognition route
  (on-device speech pack vs Microsoft's online speech service) is governed
  by the user's Windows Privacy → Speech "Online speech recognition"
  setting and the installed speech pack; the WinRT API does **not** expose
  a runtime flag to force on-device recognition for free-form dictation.
  Windows audio therefore may or may not leave the machine depending on
  the user's OS-level privacy choice. The host surfaces
  `mode: 'unknown'` to the renderer as a conservative privacy posture
  (SPEC-084 Req 21), and the user-facing documentation explains how to
  keep recognition fully local on Windows.
- **Linux desktop and any non-Electron context** keep the current
  `useWebSpeechInput` path. That path will continue to surface
  "speech recognition unavailable" through the existing platform toast
  pattern. No native engine is introduced for Linux in this slice.

The renderer continues to expose a single composer voice action. Platform
selection happens behind a typed bridge method:
`window.catsDesktopHost.startVoiceCapture()` /
`stopVoiceCapture()` / `cancelVoiceCapture()`. When the bridge method is
absent (web app, Linux Electron, or older host without the capability), the
renderer transparently falls through to `useWebSpeechInput` and inherits its
failure-as-toast semantics.

OS audio capture, helper-process lifecycle, and language/permission detection
stay in the Electron host. The renderer only sees sanitized transcript events
through the preload bridge.

### Scope

This decision covers the composer voice input capture boundary only. Related
but separate decisions, not made here:

- **Voice output / TTS** — separate capability, not part of this slice.
- **Mid-utterance language switching** — v1 uses a single language per
  capture session, derived from the host's STT default locale.
- **Push-to-talk vs always-listening UX** — UX semantics live in SPEC-084.
- **Linux native STT** — explicitly deferred. A subsequent attempt to lift
  the deferral via
  [ADR-085](./085-bundle-whisper-cpp-on-linux-for-composer-voice-input.md)
  (bundling whisper.cpp on Linux) was **rejected** because the chosen
  delivery mechanism required a git submodule for whisper.cpp source and
  the maintainer declined to introduce submodule prerequisites into the
  cats-platform repo. ADR-085 / SPEC-087 / PLAN-078 are kept as
  not-adopted historical references; the Linux deferral in this ADR
  remains in effect, and any future revival must use a non-submodule
  vendoring path.
- **Cross-product reuse** — voice capture stays composer-scoped for v1.
  Platform-wide voice features remain a separate question.

## Consequences

### Positive

- The voice button works on macOS and Windows without requiring the user
  to provide any API key, sign in to a vendor, or sign up for an external
  paid service.
- macOS recognition is enforced to on-device mode and audio is guaranteed
  not to leave the user's machine. Sessions for locales without on-device
  support fail closed rather than silently routing through Apple's servers.
- Windows recognition routes through the OS speech engine in whichever
  mode the user has chosen via Windows Privacy settings. With "Online
  speech recognition" disabled and a matching speech pack installed,
  recognition stays fully local; otherwise audio is sent to Microsoft's
  online dictation service. The slice cannot override this choice but
  surfaces a conservative `unknown` privacy posture to the renderer per
  session and documents the configuration required for fully-local
  recognition.
- The renderer does not import Electron, native modules, or audio runtime
  APIs. The capture surface stays consistent with the screenshot precedent.
- Accuracy and language coverage track each OS vendor's investment in their
  own dictation stack — typically high for the user's primary system locale.
- No model artifacts ship inside the app. Installer size is unchanged for
  the renderer; native helpers are small (Swift binary single-digit MB,
  WinRT helper similar with framework-dependent .NET deployment).

### Negative

- Two native helper code paths must be maintained, plus their bundling and
  code-signing/notarization steps (Apple notarization for the macOS helper;
  Authenticode signing for the Windows helper).
- Locale support is bounded by what the user has installed at the OS
  level. macOS users on a fresh install whose primary language has no
  on-device pack installed will not get useful recognition until they
  enable it; on macOS the session fails closed (we do not silently
  degrade to network recognition).
- Windows users who have not turned off "Online speech recognition" in
  Privacy settings will have their captured audio routed to Microsoft's
  online speech service, because the WinRT API does not expose a runtime
  flag to force on-device for free-form dictation. This is an OS-level
  user choice the app cannot override; the slice surfaces a conservative
  privacy warning to the renderer per session and documents the
  configuration requirement, but cannot prevent it programmatically.
- Linux users continue to see a non-functional voice button that fails to
  a toast. This is an explicit, acknowledged gap, not a planning oversight.
- Adding a new helper subprocess broadens the host's process supervision
  surface. The host already supervises packaged setup processes (ADR-046),
  so the pattern is established but not free.
- macOS Speech Recognition permission state changes typically require an
  app restart to take effect, mirroring the macOS screen-recording
  permission caveat already documented in ADR-078.

### Neutral

- The first slice should target macOS and Windows in parallel rather than
  sequencing one before the other, because the renderer-side IPC contract
  is shared and testing each platform end-to-end requires the contract to
  be stable on both.
- Helper processes communicate with the host via a line-delimited JSON
  stream over stdin/stdout (the same pattern used by the existing setup
  helpers), so no new IPC mechanism is introduced.
- The composer continues to use a single user-facing voice action; platform
  selection is invisible to the user except through tooltip copy and
  failure messages.

## Alternatives Considered

### Alternative 1: Cloud STT (OpenAI Whisper, Deepgram, Azure, Google STT)

- **Pros**: Single code path across all three desktop platforms plus web;
  best-in-class accuracy; simple to implement.
- **Cons**: Requires a vendor API key; sends user audio to a third party;
  carries per-minute cost; offline-unfriendly; introduces a vendor binding
  the team does not want.
- **Why rejected**: The team has explicitly excluded cloud STT for this
  slice ("我不要A").

### Alternative 2: Bundled local STT (whisper.cpp / Vosk / sherpa-onnx / WASM Whisper)

- **Pros**: Offline; no API key; cross-platform parity including Linux;
  privacy-preserving; permanent zero-cost.
- **Cons**: Adds 50 MB – 500 MB of model artifacts to the installer or
  to a first-run download; introduces a new native runtime to sign and
  notarize; raises CPU/RAM requirements; first-utterance latency on cold
  models is noticeable.
- **Why rejected**: The team has explicitly excluded bundled local STT for
  this slice ("我不要B").

### Alternative 3: Continue relying on `webkitSpeechRecognition` and document as broken

- **Pros**: Zero engineering work.
- **Cons**: The composer ships with a non-functional button on every
  desktop platform; users have no path to recovery; misleading UX.
- **Why rejected**: The button is currently advertised in the composer
  surface; leaving it broken is not acceptable for a v1 composer.

### Alternative 4: macOS-only or Windows-only first slice

- **Pros**: Smaller initial implementation surface; faster to land one
  platform.
- **Cons**: The renderer-side IPC contract and capability detection logic
  is the same investment regardless; doing one platform leaves the other's
  validation deferred and risks contract drift when the second platform
  lands.
- **Why rejected**: The renderer cost is shared. Cutting one OS does not
  meaningfully reduce the slice; it just delays parity.

### Alternative 5: Strict on-device-only on Windows (refuse to start when "Online speech recognition" is enabled)

- **Pros**: Windows audio guaranteed not to leave the machine, matching
  the macOS posture exactly.
- **Cons**: There is no public WinRT API to read the "Online speech
  recognition" privacy setting state, so the slice cannot reliably
  detect it; refusing to start would have to rely on user-driven
  configuration steps and best-effort heuristics. Users with online
  speech enabled would see the button silently fail with no in-app
  remedy. This trades a real working Windows feature for a hard
  guarantee that we cannot enforce reliably from inside the app.
- **Why rejected**: The cost (Windows feature broken for many default
  user configurations with no programmatic recovery) outweighs the
  privacy benefit. The chosen design (route per OS privacy choice,
  surface a conservative `mode: 'unknown'` warning in UI, document the
  requirement) puts the privacy decision in the user's hands while keeping
  the feature usable and honest about what the app can and cannot prove.

## References

- [ADR-003: Electron host manages local services](./003-electron-host-manages-local-services.md)
- [ADR-044: Adopt Windows x64 Electron plus self-hosted npm as initial distribution strategy](./044-adopt-windows-x64-electron-plus-self-hosted-npm-as-initial-distribution-strategy.md)
- [ADR-046: Drive packaged setup through runtime bootstrap APIs](./046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [ADR-078: Use Electron-Native Region Screenshot with Web Fallback](./078-use-electron-native-region-screenshot-with-web-fallback.md)
- [SPEC-084: Composer Voice Input via Platform-Native STT](../specs/SPEC-084-composer-voice-input-via-platform-native-stt.md)
- [PLAN-076: Composer Voice Input Native STT Rollout](../plans/PLAN-076-composer-voice-input-native-stt-rollout.md)
- Apple `SFSpeechRecognizer`: https://developer.apple.com/documentation/speech/sfspeechrecognizer
- Microsoft `Windows.Media.SpeechRecognition`: https://learn.microsoft.com/uwp/api/windows.media.speechrecognition

---

*Decision proposed: 2026-04-28*
*Last revised: 2026-04-28 (review pass: clarified per-platform privacy posture; macOS enforces on-device with fail-closed when locale unsupported, Windows is honest that recognition routes per OS privacy setting and surfaces conservative `mode: 'unknown'` rather than claiming active-mode detection; Alternative 5 explains why strict on-device-only on Windows was rejected)*
*Decision makers: Sammy, Claude*
