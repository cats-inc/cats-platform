# SPEC-087: Linux Composer Voice Input via Bundled whisper.cpp

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | Sammy |

## Summary

The composer microphone button on Linux Electron currently falls through to a
broken `webkitSpeechRecognition` path and surfaces a `network` toast on click.
This spec defines a Linux-specific replacement: a bundled whisper.cpp helper
with the multilingual `ggml-base.bin` model performs on-device speech
recognition and emits the same JSON event protocol used by the macOS / Windows
native helpers from SPEC-084. Audio stays on the user's machine; the helper
emits `mode: 'on-device'` per session; the renderer wiring established in
SPEC-084 needs no behavioral changes other than extending the preload
platform gate to include Linux.

## Goals

- Make the composer microphone button produce real on-device transcripts on
  Linux desktop builds without any cloud key, vendor account, or user-side
  configuration.
- Bundle the helper binary and the `ggml-base.bin` model so the user's first
  session works immediately after install (no first-run download).
- Stage helper assets in a way that works for `.deb` today and for
  AppImage / `.rpm` / Snap when those formats are added, with no per-format
  code branching.
- Reuse the existing voice capture bridge contract (`ready` / `partial` /
  `final` / `error` / `end` with `mode`) from SPEC-084.
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
   opening any audio device — by attempting to construct a libpulse-simple
   recording stream against the default source. If construction fails
   (no PulseAudio / PipeWire-pulse server, denied by the OS, no input
   device), the helper emits `mic_unavailable` and exits.
4. The helper captures microphone audio at 16 kHz mono S16LE — the format
   whisper.cpp's standard inference pipeline expects — via
   `libpulse-simple` (`pa_simple_new` / `pa_simple_read`).
5. The helper buffers captured audio in memory until `stop` is received
   on stdin. On `stop`, the helper closes the PulseAudio stream
   (releasing the microphone), runs `whisper_full(...)` over the buffer
   with the bundled `ggml-base.bin` model, emits a single `final` event
   with the concatenated transcript, then `end`, then exits.
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
9. The renderer's `useNativeVoiceInput` is platform-agnostic and works
   with the Linux helper without changes. Because the Linux helper emits
   `mode: 'on-device'`, the renderer privacy badge / chip is hidden,
   matching the macOS path.
10. The Linux installer (`.deb` today, future AppImage / `.rpm` / Snap)
    places the helper binary and model file under
    `app.asar.unpacked/native/linux-stt/` via electron-builder's
    `extraResources` mechanism. The helper resolves the model path
    relative to its own location, so it works identically across all
    Linux installer formats with no per-format code.
11. The build flag `CATS_BUNDLE_WHISPER_PLATFORMS` controls which
    platforms include the whisper helper. Its default value is `linux`.
    When set to a comma-separated list such as `linux,darwin,win32`,
    the whisper helper is also staged for those platforms. Empty value
    (`CATS_BUNDLE_WHISPER_PLATFORMS=`) skips the whisper bundle entirely
    (Linux falls back to the broken Web Speech path). Runtime selection
    logic on macOS / Windows when whisper is staged alongside the native
    helper is **explicitly out of scope** for this slice.
12. License obligations: the Linux installer ships whisper.cpp's MIT
    NOTICE and the OpenAI ggml-base model card under
    `resources/native/linux-stt/NOTICE`. The build script copies these
    alongside the binary and model.
13. The host's `setPermissionRequestHandler` rule is unchanged. The
    Linux helper does its own audio capture via libpulse and never goes
    through Chromium `getUserMedia`. The renderer remains denied for
    `media`.
14. The Linux helper's stop cleanup follows the macOS pattern: closing
    the libpulse stream returns immediately (microphone released);
    whisper.cpp inference may run for several hundred milliseconds; the
    host's existing 5-second stop cleanup window is sufficient for
    typical 30-second utterances on the base model. If inference exceeds
    the host cleanup window the helper is killed and the user sees no
    final event for that session — surface as `engine_unavailable` to
    the renderer toast.
15. The helper preloads the whisper model on `ready` rather than lazily
    on `stop`, so first-utterance latency is dominated by inference
    time rather than model load. The helper exits if model load fails
    with `engine_unavailable`.

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
- **Reliability**: the helper terminates within the host stop cleanup
  window even if libpulse stalls. libpulse reads use bounded timeouts.
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
            -> helper preflights pa_simple_new; on failure emits mic_unavailable
            -> helper opens 16 kHz S16LE mono PA stream
            -> helper preloads ggml-base.bin model
            -> on success: helper emits `ready` with mode: 'on-device'
            -> user speaks; helper buffers PCM samples in memory
            -> renderer ignores partial events (helper emits none in v1)
            -> user clicks stop (or Escape, which routes to cancel)
            -> helper closes PA stream (microphone released immediately)
            -> helper runs whisper.cpp inference on the audio buffer
            -> helper emits `final` with the transcript, then `end`
            -> helper exits; host emits `end` to renderer; cleanup timer no-op
       -> bridge absent (e.g. browser deployment, or whisper helper missing on Linux)
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
  whisper.cpp + libpulse-simple + JSON event emission.
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

# Disable entirely (Linux falls back to the broken Web Speech path).
CATS_BUNDLE_WHISPER_PLATFORMS=
```

## Dependencies

- whisper.cpp (MIT, https://github.com/ggerganov/whisper.cpp) as a
  build-time git submodule pinned to a release tag.
- `ggml-base.bin` model file (~140 MB, multilingual).
- libpulse-simple (system library, available on every desktop Linux
  distribution that ships PulseAudio or PipeWire-pulse).
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

## References

- [ADR-085: Bundle whisper.cpp with Linux Desktop Builds for Composer Voice Input](../decisions/085-bundle-whisper-cpp-on-linux-for-composer-voice-input.md)
- [PLAN-078: Linux Composer Voice Input whisper.cpp Rollout](../plans/PLAN-078-linux-composer-voice-input-whisper-cpp-rollout.md)
- [ADR-079: Use Platform-Native STT](../decisions/079-use-platform-native-stt-with-linux-toast-fallback.md) — superseded for Linux by ADR-085
- [SPEC-084: Composer Voice Input via Platform-Native STT](./SPEC-084-composer-voice-input-via-platform-native-stt.md) — the macOS / Windows side; this slice extends the same bridge contract to Linux
- whisper.cpp: https://github.com/ggerganov/whisper.cpp
- ggml-base.bin model card: https://huggingface.co/ggerganov/whisper.cpp

---

*Created: 2026-04-28*
*Author: Claude*
*Related Plan: [PLAN-078](../plans/PLAN-078-linux-composer-voice-input-whisper-cpp-rollout.md)*
