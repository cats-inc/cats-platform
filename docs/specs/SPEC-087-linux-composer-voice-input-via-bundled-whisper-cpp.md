# SPEC-087: Linux Composer Voice Input via Bundled whisper.cpp

> **Status: Cancelled — not adopted.** This SPEC is preserved as a
> historical record alongside [ADR-085](../decisions/085-bundle-whisper-cpp-on-linux-for-composer-voice-input.md)
> and [PLAN-078](../plans/PLAN-078-linux-composer-voice-input-whisper-cpp-rollout.md).
> The Linux deferral from [ADR-079](../decisions/079-use-platform-native-stt-with-linux-toast-fallback.md)
> remains in effect. Do not implement these requirements without a
> successor ADR / SPEC.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Cancelled (not adopted; see ADR-085 Rejection Rationale) |
| **Owner** | Claude |
| **Reviewer** | Sammy |

## Summary

The composer microphone button on Linux Electron currently falls through to a
broken `webkitSpeechRecognition` path and surfaces a `network` toast on click.
This spec defines a Linux-specific replacement: a bundled whisper.cpp helper
with the multilingual `ggml-base.bin` model performs on-device speech
recognition and extends the JSON event protocol used by the macOS / Windows
native helpers from SPEC-084 with Linux-only recording-limit and processing
events. Audio stays on the user's machine; the helper emits
`mode: 'on-device'` per session; renderer wiring remains shared but must learn
the Linux cap warning / processing states so long utterances are not silently
truncated.

## Goals

- Make the composer microphone button produce real on-device transcripts on
  Linux desktop builds without any cloud key, vendor account, or user-side
  configuration.
- Bundle the helper binary and the `ggml-base.bin` model so the user's first
  session works immediately after install (no first-run download).
- Stage helper assets in a way that works for `.deb` today and for
  AppImage / `.rpm` / Snap when those formats are added, with no per-format
  code branching.
- Reuse the existing voice capture bridge contract from SPEC-084 and extend
  it with `limit_warning` / `processing` events for the Linux recording cap.
- Keep macOS / Windows behavior unchanged by default; allow opt-in
  cross-platform whisper bundling via a build flag for future flexibility.

## Non-Goals

- Do not stream partial transcripts in v1 (finals-only per SPEC-084 Req 7
  still applies).
- Do not expose a locale picker UI; the helper resolves locale from the
  system or relies on whisper's language auto-detect.
- Do not implement a first-run model download.
- Do not implement runtime fallback semantics on macOS / Windows when the
  whisper helper is bundled alongside the native helper. That behavior is
  out of scope and will be addressed by a separate ADR if the build flag is
  ever set in production.
- Do not add Snap / Flatpak sandbox-specific audio permission declarations
  in v1; they are deferred until those installer formats are added.
- Do not bundle multiple model variants. `ggml-base.bin` (multilingual,
  ~140 MB) only.
- Do not vendor the whisper.cpp source tree into the cats-platform repo;
  use a build-time git submodule pinned to a release tag.
- Do not target ALSA-only Linux environments. PulseAudio / PipeWire-pulse
  is required.

## User Stories

- As a Linux desktop user, I want to dictate into the composer and get real
  text back without configuring an API key, so the feature works immediately
  after I install Cats.
- As a privacy-sensitive user on Linux, I want a reliable signal that audio
  stays on my machine, so I can trust the feature with confidential drafts.
- As a Cats Inc maintainer, I want a single staging step that places the
  helper and model into the Linux installer for any electron-builder format,
  so adding AppImage or `.rpm` later does not require new build code.
- As a Cats Inc operator, I want a build flag that toggles whisper bundling
  on macOS / Windows so I can ship an opt-in build for evaluation without
  changing application code.

## Requirements

### Functional Requirements

1. Linux Electron exposes the same `catsDesktopHost.startVoiceCapture` /
   `stopVoiceCapture` / `cancelVoiceCapture` / `onVoiceCaptureEvent` bridge
   methods as macOS and Windows. The preload `process.platform` gate adds
   `linux` to the existing `darwin || win32` allow list. No other
   renderer-side change is required.
2. The Linux helper binary lives at
   `desktop/native/linux-stt/cats-stt-linux`. Its CLI accepts
   `--session-id <id>`, optional `--locale <bcp47>`, and (test-only, behind
   `CATS_STT_ENABLE_FIXTURE_INPUT=1`) `--input <wav>`, matching the macOS
   helper's CLI surface.
3. The helper preflights its environment as its first action — before
   opening any audio device — by attempting to construct a PulseAudio
   recording stream against the default source. If construction fails
   (no PulseAudio / PipeWire-pulse server, denied by the OS, no input
   device), the helper emits `mic_unavailable` and exits.
4. The helper captures microphone audio at 16 kHz mono S16LE — the format
   whisper.cpp's standard inference pipeline expects — through PulseAudio's
   asynchronous API with `pa_threaded_mainloop` / `pa_stream_readable_size`
   / `pa_stream_peek` / `pa_stream_drop`. The audio thread owns the
   PulseAudio context and stream for their entire lifetime. The stdin command
   thread must not close or free PulseAudio objects directly while the audio
   thread may be inside PulseAudio; it requests stop/cancel via an atomic
   flag plus a wakeup primitive that the audio thread observes.
5. The helper buffers captured audio in memory until `stop` is received
   on stdin. When stop triggers, the audio thread closes the PulseAudio
   stream first (releasing the microphone within milliseconds), then runs
   `whisper_full(...)` synchronously over the buffered audio with the
   bundled `ggml-base.bin` model, emits a single `final` event with the
   concatenated transcript, then `end`, then exits. Inference time can
   exceed the audio duration on slower hardware; Req 14 budgets a
   per-platform stop cleanup window long enough to cover this.
6. On `cancel`, the helper discards the buffered audio, emits
   `error: cancelled`, then `end`, then exits.
7. The helper emits `ready` immediately after the audio capture stream is
   established and the model is loaded. The `ready` event carries
   `locale` set to the requested locale (or the helper-resolved default)
   and `mode: 'on-device'`. whisper.cpp inference is 100% local and the
   bundled installer ships no network code in this binary; the
   `on-device` claim is API-enforceable, unlike the Windows `unknown`
   posture.
8. Multilingual support: the bundled model is `ggml-base.bin`
   (multilingual, 99 languages, ~140 MB). When the helper receives a
   `--locale`, it sets whisper.cpp's `language` parameter to bias
   detection. When unset, whisper.cpp auto-detects from the audio.
9. The renderer's `useNativeVoiceInput` stays platform-agnostic for
   transcripts and privacy mode, but it must handle two bridge events added
   for this Linux slice: `limit_warning` and `processing`. `limit_warning`
   tells the composer to surface that recording is about to stop at the
   configured cap. `processing` switches the composer out of its recording
   state after the host sends the cap-triggered stop command, so the user
   can see that audio capture is finished and local transcription is running.
   Because the Linux helper emits `mode: 'on-device'`, the renderer privacy
   badge / chip is hidden, matching the macOS path.
10. The Linux installer (currently AppImage / deb / tar.gz for x64 and
    arm64 per `package.json`; future rpm / Snap as new formats are
    added) places the helper binary and model file under
    `<process.resourcesPath>/native/linux-stt/` via electron-builder's
    `extraResources` mechanism. The helper resolves the model path
    relative to its own location, so it works identically across all
    Linux installer formats with no per-format code. (Note: this is the
    `extraResources` location — `<resourcesPath>/native/...` — not the
    `app.asar.unpacked/...` path that applies to `asarUnpack` entries.)
11. The build flag `CATS_BUNDLE_WHISPER_PLATFORMS` controls which
    platforms include the whisper helper. Its default value is `linux`.
    When set to a comma-separated list such as `linux,darwin,win32`,
    the whisper helper is also staged for those platforms. Empty value
    (`CATS_BUNDLE_WHISPER_PLATFORMS=`) skips the whisper bundle entirely.
    When the bundle is skipped on Linux, the host's helper-path
    resolution finds nothing on disk, the orchestrator emits
    `engine_unavailable`, and the renderer surfaces the existing toast.
    The bridge methods remain exposed because the preload's platform
    gate is `process.platform`-only and does not check the helper file
    at preload time — the renderer therefore does **not** fall through
    to `useWebSpeechInput` on a missing-helper Linux build. Restoring
    Web Speech fallthrough would require gating the preload's bridge
    exposure on helper presence; that is out of scope for this slice
    and tracked as an open question. Runtime selection logic on macOS /
    Windows when whisper is staged alongside the native helper is
    **explicitly out of scope** for this slice.
12. License obligations: the Linux installer ships whisper.cpp's MIT
    NOTICE and the OpenAI ggml-base model card under
    `resources/native/linux-stt/NOTICE`. The build script copies these
    alongside the binary and model.
13. The host's `setPermissionRequestHandler` rule is unchanged. The
    Linux helper does its own audio capture via libpulse and never goes
    through Chromium `getUserMedia`. The renderer remains denied for
    `media`.
14. The Linux helper releases the microphone immediately after the host sends
    `stop`: closing the PulseAudio stream returns within milliseconds.
    whisper.cpp inference then runs synchronously over the buffered audio.
    Because the base model runs at roughly 0.3-1.5x real-time depending on
    CPU, inference for the 30-second host-owned recording cap (Req 16) can
    take from ~9 seconds on a fast Intel i5 to ~45 seconds on the slowest
    supported hardware. The host therefore uses a per-platform stop cleanup
    window of 60 seconds for Linux helpers (vs the 5-second default applied to
    macOS / Windows native helpers), and this cleanup timer starts whenever
    the host sends `stop`, whether the stop was user-initiated or triggered by
    the host recording cap. If inference exceeds 60 seconds (very rare; only
    on hardware below the supported baseline), the host kills the helper and
    the user sees `engine_unavailable` for that session; the setup-guide
    documents this as a known limitation on underpowered hardware.
15. The helper preloads the whisper model on `ready` rather than lazily
    on `stop`, so first-utterance latency is dominated by inference
    time rather than model load. The helper exits if model load fails
    with `engine_unavailable`.
16. The host bounds Linux recording duration to 30 seconds (16 kHz mono S16LE
    × 30 s = ~960 KB buffer). At 25 seconds, the host emits
    `limit_warning { secondsRemaining: 5 }` to the renderer. At 30 seconds,
    the host emits `processing`, sends the normal `stop` control message to
    the helper, and starts the same 60-second Linux stop cleanup timer used
    for a user-initiated stop. The helper may keep a defensive buffer cap at
    31 seconds to avoid unbounded memory if the host timer fails, but that
    path must emit `error: aborted` rather than silently pretending a normal
    stop occurred. The 30-second cap is a v1 trade-off chosen so worst-case
    inference time stays inside the 60-second Linux stop cleanup window
    (Req 14); a follow-up SPEC may introduce streaming inference to lift this
    cap.

### Non-Functional Requirements

- **Privacy**: audio never leaves the user's machine on Linux.
  whisper.cpp has no network code path; the model is bundled locally.
  The setup-guide explicitly documents this guarantee for Linux and
  contrasts it with the Windows `unknown` posture.
- **Performance (cold start)**: first-utterance latency budget is 1500 ms
  on a typical Linux laptop CPU (Intel i5 ≥ 8th gen / AMD Ryzen 3 ≥ 3000
  / Apple equivalents).
- **Performance (warm)**: subsequent inferences should complete in
  ≤ 1.5x real-time on the same hardware. Older / lower-power hardware
  degrades but stays usable for short utterances.
- **Installer size**: the Linux installer delta from this slice is
  ~140-150 MB. Documented in the setup-guide.
- **Reliability**: the helper terminates within the platform-specific
  stop cleanup window (60 seconds on Linux, 5 seconds on macOS /
  Windows) even if PulseAudio stalls. Linux audio capture uses
  PulseAudio's asynchronous API under `pa_threaded_mainloop`; all
  PulseAudio context/stream operations are owned by the audio thread and
  guarded by the threaded-mainloop lock. The stdin command thread only
  flips stop/cancel state and wakes the audio thread; it never frees or
  closes a PulseAudio stream/context handle that another thread may be using.
- **Compatibility**: target Ubuntu 22.04 LTS, Debian 12, and Fedora 40
  for the v1 deb. PipeWire-pulse compatibility is required (default on
  Ubuntu 22.10+ and Fedora 35+). Pure ALSA-only systems surface
  `mic_unavailable`.
- **License**: ship whisper.cpp MIT NOTICE and OpenAI ggml-base model
  NOTICE in the installer. The deb's `copyright` file references both.

## Design Overview

```text
Linux composer microphone button
  -> useVoiceInputComposer
    -> useNativeVoiceInput detects bridge availability
       -> bridge present (linux Electron)
            -> window.catsDesktopHost.startVoiceCapture({ locale, sessionId })
            -> host spawns cats-stt-linux helper
            -> helper preflights a PulseAudio recording stream; on failure emits mic_unavailable
            -> helper opens 16 kHz S16LE mono PA stream on the audio thread
            -> helper preloads ggml-base.bin model
            -> on success: helper emits `ready` with mode: 'on-device'
            -> user speaks; helper buffers PCM samples in memory
            -> renderer ignores partial events (helper emits none in v1)
            -> at 25 s host emits `limit_warning { secondsRemaining: 5 }`
            -> user clicks stop, host cap reaches 30 s, or Escape routes to cancel
            -> host emits `processing` for stop/cap paths and sends stop
            -> host starts the Linux 60 s stop cleanup timer
            -> helper closes PA stream (microphone released immediately)
            -> helper runs whisper.cpp inference on the audio buffer
            -> helper emits `final` with the transcript, then `end`
            -> helper exits; host emits `end` to renderer; cleanup timer no-op
       -> bridge present but Linux helper missing (build flag empty / file absent)
            -> startVoiceCapture() returns engine_unavailable from the host
            -> renderer surfaces the existing "Voice input is not available
               on this device" toast; useWebSpeechInput is NOT consulted
       -> bridge absent (browser deployment / non-Electron renderer)
            -> falls through to existing useWebSpeechInput
            -> button stays visible; click invokes start(); failure surfaces
               via the existing toast wiring (commit 55c15f5a)
```

### Helper Binary Structure

- `desktop/native/linux-stt/CMakeLists.txt`: CMake build that compiles
  whisper.cpp as a static library and links the helper binary against
  it.
- `desktop/native/linux-stt/whisper.cpp/`: git submodule pinned to a
  whisper.cpp release tag (avoid floating `master`).
- `desktop/native/linux-stt/src/main.cpp`: ~300 lines of C++ wrapping
  whisper.cpp + PulseAudio async capture + JSON event emission.
- `desktop/native/linux-stt/scripts/fetch-model.sh`: downloads
  `ggml-base.bin` from the official whisper.cpp distribution, verifies
  SHA256, writes to a build cache.

### Build Flag Semantics

```
# Default: only Linux gets the whisper helper.
CATS_BUNDLE_WHISPER_PLATFORMS=linux

# Bundle on all three platforms (mac/win runtime behavior is decided
# by a separate, future ADR).
CATS_BUNDLE_WHISPER_PLATFORMS=linux,darwin,win32

# Disable entirely (Linux bridge stays exposed and start surfaces engine_unavailable).
CATS_BUNDLE_WHISPER_PLATFORMS=
```

## Dependencies

- whisper.cpp (MIT, https://github.com/ggerganov/whisper.cpp) as a
  build-time git submodule pinned to a release tag.
- `ggml-base.bin` model file (~140 MB, multilingual).
- libpulse (system library, available on every desktop Linux distribution
  that ships PulseAudio or PipeWire-pulse). The helper uses the async API
  with `pa_threaded_mainloop`, not PulseAudio's simple API.
- CMake ≥ 3.16 and a C++17 compiler (g++ or clang) on the Linux build
  host.
- electron-builder's `extraResources` mechanism for cross-format
  staging (already used by the macOS / Windows helpers).
- Linux build environment for the Linux installer (electron-builder
  cannot cross-build Linux installers from macOS / Windows hosts in a
  trustworthy way for this slice's binary requirements).

## Open Questions

- [ ] Static vs dynamic link of libpulse: static increases the binary
      size by ~200 KB; dynamic depends on the user having `libpulse0`
      installed, which is true on every desktop distro that ships
      PulseAudio or the PipeWire shim. Recommendation: dynamic for v1;
      revisit if minimal headless distros surface user complaints.
- [ ] Should the helper preload the model on `ready` or lazily on
      `stop`? Preload makes `ready` slower (~500 ms) but the user's
      stop click is faster. Lazy is the opposite trade-off.
      Recommendation: preload — `ready` already gates the visual
      "recording" indicator, so users perceive it as part of session
      setup rather than added latency.
- [ ] Should the build flag also support per-platform model
      customization, e.g. `CATS_BUNDLE_WHISPER_PLATFORMS=linux:base,darwin:tiny`?
      Probably overkill for now; v1 keeps it simple and uses base
      everywhere.
- [ ] Does the deb's mic-permission story require any TCC-equivalent
      preflight? On Linux the OS does not gate mic per app (the desktop
      session-level permission is just "user is in the `audio` group" or
      similar). Confirm during Phase 6 manual validation.
- [ ] Should the preload also gate bridge exposure on whisper-helper
      file presence so that Linux builds without the bundled helper
      fall through cleanly to `useWebSpeechInput`? Currently the
      platform gate is `process.platform`-only and a missing helper
      surfaces as `engine_unavailable`. Implementing the file gate is
      straightforward (`existsSync` against the resolved packaged path
      from preload) but adds a Node `fs` import in preload that the
      current code avoids. v1 default is no file gate; revisit if the
      `CATS_BUNDLE_WHISPER_PLATFORMS=` empty path becomes a real
      production scenario.
- [x] Should the renderer add a "30-second cap approaching" warning
      chip in the last 5 seconds before the host stops recording
      (Req 16) so users are not surprised when long utterances end?
      Decision: yes. The host emits `limit_warning` at 25 seconds and
      `processing` at 30 seconds before it sends stop.

## References

- [ADR-085: Bundle whisper.cpp with Linux Desktop Builds for Composer Voice Input](../decisions/085-bundle-whisper-cpp-on-linux-for-composer-voice-input.md)
- [PLAN-078: Linux Composer Voice Input whisper.cpp Rollout](../plans/PLAN-078-linux-composer-voice-input-whisper-cpp-rollout.md)
- [ADR-079: Use Platform-Native STT](../decisions/079-use-platform-native-stt-with-linux-toast-fallback.md) — superseded for Linux by ADR-085
- [SPEC-084: Composer Voice Input via Platform-Native STT](./SPEC-084-composer-voice-input-via-platform-native-stt.md) — the macOS / Windows side; this slice extends the same bridge contract to Linux
- whisper.cpp: https://github.com/ggerganov/whisper.cpp
- ggml-base.bin model card: https://huggingface.co/ggerganov/whisper.cpp

---

*Created: 2026-04-28*
*Last revised: 2026-04-28 (review follow-up: the 30-second cap is now host-owned, starts the Linux stop cleanup timer, and emits renderer-visible `limit_warning` / `processing` events; PulseAudio capture uses the async API with a single audio-thread owner instead of unsafe cross-thread simple-API handle closure; Req 10/11 remain aligned to extraResources and the actual missing-helper outcome.)*
*Author: Claude*
*Related Plan: [PLAN-078](../plans/PLAN-078-linux-composer-voice-input-whisper-cpp-rollout.md)*
