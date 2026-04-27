# ADR-085: Bundle whisper.cpp with Linux Desktop Builds for Composer Voice Input

## Status

Proposed

## Context

ADR-079 deferred Linux native STT explicitly. The composer microphone button
on Linux Electron currently falls through to `webkitSpeechRecognition`, which
is broken in Electron because Chromium ships without Google's private
speech-service key. ADR-079 accepted "click-to-toast" as v1 Linux behavior
because Linux has no OS-provided system speech engine and the team had ruled
out two alternatives:

- **App-managed cloud STT vendors** (OpenAI Whisper, Deepgram, Azure Speech,
  etc.) — out of scope for the slice.
- **Bundled local STT engines** (whisper.cpp, faster-whisper, Vosk, etc.) —
  also ruled out at the time, primarily because macOS and Windows have
  free, system-native engines that obviate the size cost.

Linux is now the odd one out: macOS uses `SFSpeechRecognizer` enforced
on-device, Windows uses `Windows.Media.SpeechRecognition` with a conservative
`unknown` privacy posture, and Linux still surfaces a broken button. The
team has agreed to lift the "no bundled local STT" exclusion **specifically
for Linux**, where there is genuinely no OS-native alternative. macOS and
Windows continue to use their respective system speech APIs as decided in
ADR-079; the bundled whisper.cpp helper is reserved for Linux by default
and is kept toggleable for the other two platforms via a build flag, so a
future opt-in (e.g. as a fallback when `language_not_supported` fires on
macOS) is a config change rather than a code restructure.

The Linux desktop build is currently distributed as `.deb` only, but the
team expects to add AppImage and `.rpm` later. Any solution must work
across electron-builder's Linux installer formats without per-format
branching.

## Decision

The Linux desktop build will bundle a whisper.cpp helper plus the
multilingual `ggml-base.bin` model (~140 MB) inside the desktop installer.
The helper integrates with the existing voice capture bridge contract from
SPEC-084, emits the same JSON events as the macOS / Windows helpers, and
runs entirely on-device.

- **Helper binary**: `cats-stt-linux`, a small native CLI built from a
  vendored whisper.cpp submodule plus a `libpulse-simple` audio capture
  wrapper. It accepts the same CLI shape (`--session-id`, optional
  `--locale`, gated `--input` for tests) and emits the same JSON event
  protocol (`ready` with `mode: 'on-device'`, `final`, `error`, `end`)
  used by the macOS Swift and Windows .NET helpers.
- **Model**: `ggml-base.bin` (multilingual, 99 languages, ~140 MB) is
  fetched at build time from the official whisper.cpp distribution,
  SHA256-verified, and staged alongside the helper.
- **Packaging**: the helper and model are placed under
  `extraResources/native/linux-stt/`, mirroring the macOS / Windows
  helpers. electron-builder's `extraResources` mechanism copies this
  directory into the unpacked app for every Linux installer format
  (deb today, AppImage / rpm / snap / tar.gz when added later), so the
  staging path does not change per format.
- **Audio capture**: `libpulse-simple` (PulseAudio API). PipeWire's
  PulseAudio compatibility shim covers the modern PipeWire-default
  distros (Ubuntu 22.10+, Fedora 35+). Pure ALSA-only environments are
  unsupported in v1 and surface `mic_unavailable`.
- **Build flag**: `CATS_BUNDLE_WHISPER_PLATFORMS` (comma-separated
  platform list). Default value: `linux`. Setting it to a list such as
  `linux,darwin,win32` also stages the whisper helper on those platforms.
  Runtime selection logic on macOS / Windows when whisper is bundled
  alongside the native helper is **out of scope for this ADR** — a
  follow-up decision will choose between "replace native", "fallback
  after native errors", or "user-selectable". The default behavior keeps
  macOS and Windows on their native helpers.

The macOS / Windows decision tree from ADR-079 is unchanged. Linux moves
from "deferred / toast on click" to "first-class on-device STT".

### Scope

This decision covers the Linux composer voice input slice only. Out of
scope:

- **Streaming partial transcripts** — v1 finals-only contract from
  SPEC-084 still applies (whisper.cpp's batch mode is a natural fit).
- **Locale picker UI** — helper uses the system locale or whisper's
  language auto-detect.
- **First-run model download flow** — the model is always bundled in the
  installer.
- **Cross-platform runtime fallback semantics on macOS / Windows when
  whisper is bundled alongside native** — separate ADR if the build flag
  is ever set in production.
- **Snap and Flatpak sandbox audio permission integration** — `audio-record`
  interface for Snap, PortalAudio for Flatpak; deferred until those
  installer formats are added.
- **ALSA-only Linux environments** — documented limitation.

## Consequences

### Positive

- The Linux composer microphone button finally produces real transcripts
  without a cloud key, vendor signup, or any user-side configuration.
- Audio stays 100% on the user's machine on Linux. whisper.cpp has no
  network code path. The renderer's `mode: 'on-device'` indicator is
  genuinely accurate, unlike the Windows `unknown` posture.
- Multi-format Linux distribution (deb today, AppImage / rpm / snap
  later) is supported by the same staging code; no per-format build
  branching.
- macOS and Windows behavior is unchanged by default; the change is
  purely additive.
- Build-flag toggle leaves the door open for future macOS / Windows
  whisper bundling without code restructuring.

### Negative

- The Linux installer grows by ~140 MB (model file). Acceptable for a
  desktop app at this scale, but worth surfacing to users on metered
  connections.
- whisper.cpp is now a third native dependency to track (security
  updates, ABI changes, license obligations) on top of the macOS Swift
  and Windows .NET helpers.
- ggml model files (OpenAI-derived) carry license and provenance
  disclosures that must be added to the installer NOTICE.
- First-utterance cold-start latency on Linux is ~1.5 s on a typical
  laptop CPU (model load + inference). macOS and Windows native helpers
  are faster on first utterance because the OS keeps engines warm.
- whisper.cpp inference is CPU-bound. On low-power hardware (Atom, older
  Celeron) the base model may exceed real-time. The base model is the
  safest cross-CPU default; tiny is below the accuracy bar for general
  dictation, small is too slow on the same low-end hardware.
- Snap and Flatpak sandboxes will need explicit audio capture permission
  declarations when those formats are added; this is deferred but real.

### Neutral

- The renderer-side `useNativeVoiceInput` hook needs no behavioral change.
  The bridge contract is platform-agnostic; the only renderer-touching
  change is extending the preload `process.platform` gate from
  `darwin || win32` to `darwin || win32 || linux`.
- The IPC contract (`ready` / `partial` / `final` / `error` / `end` with
  `mode`) is unchanged. The Linux helper emits `mode: 'on-device'`.
- The slice does not enable streaming partials. whisper.cpp's batch-mode
  inference (transcribe on stop) is a natural fit for v1 finals-only.
- Helper inference cost lives in the helper subprocess, not the Electron
  main or renderer; CPU spikes are isolated.

## Alternatives Considered

### Alternative 1: Continue deferring Linux (ADR-079 status quo)

- **Pros**: zero engineering cost; ADR-079 framing stays intact.
- **Cons**: Linux composer voice button stays broken; Linux desktop users
  see a UI element that fails on first click with no path to recovery.
- **Why rejected**: the team has agreed this is no longer acceptable now
  that macOS and Windows are working.

### Alternative 2: First-run model download

- **Pros**: smaller installer (~40 MB instead of ~180 MB); user controls
  when to incur the storage cost.
- **Cons**: requires a download UX (progress, cancellation, error
  recovery, retries), checksum verification, and a "model not yet
  downloaded" state in the bridge; first session on a fresh install is
  gated on network plus download time.
- **Why rejected**: the team prefers ready-to-use behavior; the +140 MB
  delta is acceptable.

### Alternative 3: Use ggml-tiny model (~75 MB) instead of base

- **Pros**: half the installer delta.
- **Cons**: tiny is noticeably worse on accents, technical vocabulary,
  and noisy environments; Linux would feel measurably worse than the
  macOS / Windows native paths.
- **Why rejected**: base is the sweet spot at ~140 MB.

### Alternative 4: Use ggml-small model (~466 MB) for better accuracy

- **Pros**: closer to native speech-engine accuracy.
- **Cons**: triples the installer delta; small is sub-real-time on older
  Linux hardware.
- **Why rejected**: base is enough for composer voice input; small can
  be a future option if accuracy complaints surface.

### Alternative 5: Linux-specific cloud STT (Whisper API only when running on Linux)

- **Pros**: no installer bloat; cross-platform implementation simpler.
- **Cons**: violates ADR-079's "no app-managed cloud" stance, which the
  team has not relaxed.
- **Why rejected**: same reason ADR-079 rejected cloud across the board.

### Alternative 6: Ship whisper.cpp on all three platforms by default

- **Pros**: cross-platform consistency; "one engine, three platforms".
- **Cons**: contradicts ADR-079's decision to use system-native engines
  on macOS / Windows; adds 140 MB to those installers for no benefit
  when native is available.
- **Why rejected**: the team explicitly wants native on macOS / Windows
  and uses whisper only where there is no alternative.

### Alternative 7: Vosk or sherpa-onnx instead of whisper.cpp

- **Pros**: smaller models (Vosk has ~50 MB English-only models).
- **Cons**: Vosk's accuracy is below whisper-base, especially on accents
  and noisy environments; sherpa-onnx adds an ONNX runtime dependency
  with a larger combined footprint than whisper.cpp's static library.
- **Why rejected**: whisper.cpp's accuracy / size trade-off is better
  for general dictation.

## References

- [ADR-079: Use Platform-Native STT for Composer Voice Input with Linux Toast Fallback](./079-use-platform-native-stt-with-linux-toast-fallback.md)
  (this ADR supersedes ADR-079's "Linux deferred" clause for Linux only)
- [SPEC-087: Linux Composer Voice Input via Bundled whisper.cpp](../specs/SPEC-087-linux-composer-voice-input-via-bundled-whisper-cpp.md)
- [PLAN-078: Linux Composer Voice Input whisper.cpp Rollout](../plans/PLAN-078-linux-composer-voice-input-whisper-cpp-rollout.md)
- [SPEC-084: Composer Voice Input via Platform-Native STT](../specs/SPEC-084-composer-voice-input-via-platform-native-stt.md)
  (the macOS / Windows side; this slice extends the same bridge contract)
- whisper.cpp project: https://github.com/ggerganov/whisper.cpp
- ggml-base model card: https://huggingface.co/ggerganov/whisper.cpp

---

*Decision proposed: 2026-04-28*
*Decision makers: Sammy, Claude*
