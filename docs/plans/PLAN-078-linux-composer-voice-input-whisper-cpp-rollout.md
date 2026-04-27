# PLAN-078: Linux Composer Voice Input whisper.cpp Rollout

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | Sammy |

## Related Spec

[SPEC-087: Linux Composer Voice Input via Bundled whisper.cpp](../specs/SPEC-087-linux-composer-voice-input-via-bundled-whisper-cpp.md)

## Overview

Add a third native helper to the existing voice capture bridge: a
Linux-only whisper.cpp helper that runs on-device, batches audio until
stop, and emits the same JSON events as the macOS / Windows helpers.
Bundle the helper and the `ggml-base.bin` model in the Linux installer
via electron-builder's `extraResources`. Default off for macOS / Windows;
toggleable via a build flag (`CATS_BUNDLE_WHISPER_PLATFORMS`).

## Implementation Phases

### Phase 1: Vendor whisper.cpp and Set Up the Model Build Pipeline

- [ ] Add `desktop/native/linux-stt/whisper.cpp` as a git submodule
      pinned to a specific whisper.cpp release tag (avoid floating
      `master`).
- [ ] Add `desktop/native/linux-stt/CMakeLists.txt` that compiles
      whisper.cpp as a static library and exposes a single executable
      target `cats-stt-linux`.
- [ ] Add `desktop/native/linux-stt/scripts/fetch-model.sh` (POSIX
      shell) that downloads `ggml-base.bin` from the whisper.cpp release
      distribution, verifies a pinned SHA256, and writes the file to a
      build cache directory under `build/native-cache/linux-stt/`.
      Re-runs are idempotent: if the cached file matches the SHA256,
      skip the download.
- [ ] Add `desktop/native/linux-stt/NOTICE` containing whisper.cpp's
      MIT NOTICE and the ggml-base model card / license. Include this
      file in the staging output alongside the binary and model.

### Phase 2: Linux Helper Implementation (C++)

- [ ] Write `desktop/native/linux-stt/src/main.cpp` (~300 lines):
  - CLI parsing (`--session-id`, `--locale`, `--input` behind
    `CATS_STT_ENABLE_FIXTURE_INPUT=1` env gate, mirroring the macOS
    helper).
  - libpulse-simple capture: open a record stream at 16 kHz mono S16LE
    against the default source; non-blocking reads with bounded
    timeout.
  - JSON event emission: `ready { mode: 'on-device' }`, `final`,
    `error`, `end`. No `partial` events in v1.
  - stdin command parsing using a real JSON parser (e.g. nlohmann/json
    header-only) with `sessionId` matching, mirroring the macOS /
    Windows helper pattern.
  - Capture buffer: append libpulse reads to an `std::vector<int16_t>`
    until stop or cancel. Bound the buffer to a maximum size
    (e.g. 5 minutes of audio) to prevent runaway memory.
  - On stop: close the libpulse stream first (microphone released),
    convert S16LE samples to float32, run `whisper_full(...)` with
    the loaded model context, walk segments, concatenate text, emit
    `final`, then `end`.
  - On cancel: discard the buffer, emit `error: cancelled`, then
    `end`, exit.
  - Error mapping: PulseAudio failures → `mic_unavailable`; whisper
    init / inference failures → `engine_unavailable`; locale issues
    → `language_not_supported` (rare with multilingual base).
- [ ] Add a fixture-input mode (gated by
      `CATS_STT_ENABLE_FIXTURE_INPUT=1`) that reads a 16 kHz mono WAV
      file directly into the audio buffer and skips libpulse, for
      repeatable unit tests on CI.
- [ ] Verify that the helper does NOT link any networking libraries
      (no `libcurl`, no `libssl`). The build should fail explicitly if
      the linker accidentally pulls in network deps via whisper.cpp's
      optional features.

### Phase 3: Build and Packaging Integration

- [ ] Extend `scripts/build-desktop-installer.mjs`'s
      `buildNativeVoiceHelpers` to handle the Linux target: invoke
      CMake configure + build, copy the resulting binary + model + NOTICE
      into `build/native/linux-stt/`.
- [ ] Add the new build flag: `CATS_BUNDLE_WHISPER_PLATFORMS`. Read it
      in `buildNativeVoiceHelpers`. Default value: `linux`. The build
      script reads the env var, parses it as a comma list, and stages
      the whisper helper output only on the platforms in the list.
      Empty value skips bundling entirely.
- [ ] Confirm `package.json`'s `extraResources` already covers
      `build/native -> native` (added in commit 6f67b913); if not,
      extend it.
- [ ] Add an assertion in `tests/desktop-packaging.test.js` that the
      `extraResources` mapping covers `build/native/linux-stt`
      (binary + `models/ggml-base.bin` + `NOTICE`) when the build flag
      includes `linux`.

### Phase 4: Renderer Bridge Integration (Minimal)

- [ ] Extend `desktop/host/preload.cts`'s platform gate from
      `process.platform === 'darwin' || process.platform === 'win32'`
      to also include `process.platform === 'linux'`, so the bridge
      methods are exposed on Linux Electron.
- [ ] Extend `desktop/host/voiceCapture.ts`'s
      `resolveVoiceCaptureHelperPath` with a Linux branch that returns
      the packaged path (`<resourcesPath>/native/linux-stt/cats-stt-linux`)
      and the dev path (`<packageRoot>/desktop/native/linux-stt/build/cats-stt-linux`),
      mirroring the macOS / Windows resolution logic.
- [ ] No changes required in `useNativeVoiceInput.ts`, the renderer
      hook, or the privacy badge logic. The Linux helper's
      `mode: 'on-device'` event is handled by the existing code path.

### Phase 5: Tests

- [ ] Add helper-source assertions to
      `tests/voice-native-helper-source.test.js`: grep
      `desktop/native/linux-stt/src/main.cpp` for libpulse-simple usage
      (`pa_simple_new`), the bundled-model load
      (`ggml-base.bin`), the JSON event shape (`"mode": "on-device"`,
      `"language_not_supported"`, etc.), the stdin JSON parser
      (`nlohmann::json` or equivalent), session-id matching, and the
      fixture env gate.
- [ ] Add a contract test to
      `tests/desktop-voice-capture-contract.test.js` that asserts
      `resolveVoiceCaptureHelperPath` for `platform: 'linux'` returns
      the expected packaged path under `<resourcesPath>/native/linux-stt/`
      and the expected dev path.
- [ ] Add a build-script assertion that the default
      `CATS_BUNDLE_WHISPER_PLATFORMS` value is `linux` and that empty
      / `linux,darwin,win32` are honored.
- [ ] Add a fixture-mode helper smoke test that compiles the Linux
      helper (skip on non-Linux CI runners) and runs it against a
      bundled WAV fixture (~3 seconds of clear English speech),
      asserting at least one `final` event with non-empty text.

### Phase 6: Validation and Documentation

- [ ] Manually verify on Ubuntu 22.04 LTS deb install: bridge methods
      present on `catsDesktopHost`, first-utterance latency, multi-language
      utterance accuracy (English + at least one non-Latin-script
      language), stop / cancel cleanup, post-error microphone release.
- [ ] Manually verify on Debian 12 deb install (PipeWire-pulse default
      on Debian 12): same checks as Ubuntu.
- [ ] Manually verify on Fedora 40 deb-equivalent (rpm) when the rpm
      format is added; document any distro-specific gotchas surfaced.
- [ ] Document the Linux behavior in `docs/setup-guide.md`: bundled
      base model, on-device guarantee, libpulse runtime requirement,
      ALSA-only systems unsupported, expected installer size delta.
- [ ] Update ADR-079's "Linux native STT — explicitly deferred" clause
      to cross-reference ADR-085 as the supersedence for Linux
      specifically.
- [ ] Document the build flag for opt-in macOS / Windows bundling in
      both the setup-guide (briefly) and a build-pipeline doc.
- [ ] Confirm Linux mic permission story on a fresh user account:
      verify the user is added to the `audio` group at install time
      (default for desktop installs) and that PulseAudio / PipeWire
      grants record access without an explicit prompt.

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `desktop/native/linux-stt/CMakeLists.txt` | Create | CMake build that links whisper.cpp as a static library and produces `cats-stt-linux` |
| `desktop/native/linux-stt/whisper.cpp/` | Create | git submodule pinned to a whisper.cpp release tag |
| `desktop/native/linux-stt/src/main.cpp` | Create | Helper source: libpulse capture + whisper inference + JSON event protocol |
| `desktop/native/linux-stt/scripts/fetch-model.sh` | Create | Downloads `ggml-base.bin` and verifies SHA256 |
| `desktop/native/linux-stt/NOTICE` | Create | whisper.cpp + ggml-base license obligations |
| `desktop/host/voiceCapture.ts` | Modify | Add `linux` branch in `resolveVoiceCaptureHelperPath` |
| `desktop/host/preload.cts` | Modify | Extend platform gate to include `linux` |
| `scripts/build-desktop-installer.mjs` | Modify | Build whisper helper + stage model for the platforms in `CATS_BUNDLE_WHISPER_PLATFORMS` (default `linux`) |
| `package.json` | Modify if needed | Confirm `extraResources` covers `build/native/linux-stt`; add deb `dependencies` for `libpulse0` |
| `docs/setup-guide.md` | Modify | Document Linux setup, bundled model, libpulse requirement, on-device guarantee, build flag |
| `docs/decisions/079-use-platform-native-stt-with-linux-toast-fallback.md` | Modify | Add a "supersedence" note pointing at ADR-085 for the Linux deferral clause |
| `tests/voice-native-helper-source.test.js` | Modify | Add Linux helper source contract assertions |
| `tests/desktop-voice-capture-contract.test.js` | Modify | Add Linux helper-path resolution test + build-flag honor test |
| `tests/desktop-packaging.test.js` | Modify | Add Linux `extraResources` staging assertion |
| `tests/fixtures/voice/short-utterance.wav` | Create | ~3 s mono 16 kHz WAV fixture for the helper smoke test |

## Technical Decisions

- **whisper.cpp** chosen over OpenAI Whisper API (cloud, ruled out by
  ADR-079) and Vosk (lower accuracy at the size). Open-source, MIT,
  on-device, well-supported.
- **`ggml-base` multilingual model**: 99-language coverage at the
  smallest size that still gives acceptable accuracy. tiny is too
  inaccurate for general dictation; small triples installer size and
  is sub-real-time on older CPUs.
- **libpulse-simple** for audio capture: maximum compat across desktop
  distros. PipeWire's PulseAudio shim covers modern distros; pure-ALSA
  systems are rare and explicitly unsupported in v1.
- **git submodule** for whisper.cpp source rather than vendoring: keeps
  cats-platform clean, makes whisper.cpp updates explicit and
  auditable.
- **Bundled model** rather than first-run download: simpler UX, no
  network gating on first session, fits the ~140 MB installer delta
  budget.
- **Same IPC contract** as macOS / Windows helpers: zero renderer-side
  behavioral changes; bridge is already platform-agnostic. The
  `mode: 'on-device'` reuse is genuine because whisper.cpp is fully
  local.
- **Build flag default `linux` only**: keeps macOS / Windows installer
  sizes unchanged while leaving room for a future opt-in path.
- **Preload model on `ready`** rather than lazily on `stop`: the user's
  stop click should produce a final quickly; ready event already gates
  the recording-active visual state, so the ~500 ms model load is
  perceived as part of session setup.

## Testing Strategy

- **Unit Tests**: helper-source assertions (CMakeLists, libpulse use,
  ggml-base load, JSON protocol shape, stdin JSON parsing with
  sessionId match, fixture env gate, build flag default).
- **Integration Tests**: contract test for
  `resolveVoiceCaptureHelperPath` on Linux; build-script flag-honoring
  test; `desktop-packaging.test.js` extension for the staged Linux
  resources.
- **Helper Smoke Test**: fixture-mode WAV input run on Linux CI; assert
  at least one `final` event is emitted with non-empty text.
- **Manual**: Ubuntu 22.04 fresh install, Debian 12 fresh install,
  multi-language accuracy spot-check, stop / cancel cleanup, post-error
  microphone release, install-size validation.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Linux installer +140 MB surprises users on metered connections | Low | Documented in setup-guide; consider future first-run download flow if complaints surface |
| whisper.cpp inference exceeds real-time on low-end CPUs | Medium | base model is the cross-CPU sweet spot; setup-guide notes that very old / underpowered hardware may see noticeable latency on long utterances |
| libpulse not installed on minimal Linux systems (rare) | Low | Declare `libpulse0` as a `Depends` in the deb's control file; surface `mic_unavailable` if absent at runtime |
| ALSA-only environments cannot use the helper | Medium | Out of scope for v1; documented limitation. Future ADR can add an ALSA fallback if user demand justifies it |
| whisper.cpp release ABI changes during a future bump | Low | Submodule is pinned to a release tag; ABI changes are caught at CMake configure / build time during the bump |
| Snap / Flatpak sandbox audio permission denied (when those formats are added) | Medium | Out of scope for v1 (deb only). Phase 6 documents the known issue. Snap requires `audio-record` interface; Flatpak requires PortalAudio. Each gets its own follow-up SPEC |
| Build flag default (`linux`) accidentally bundles whisper on mac/win in a developer's local env | Low | Default is `linux`, which excludes mac/win unless explicitly opted in. Build-script test asserts the default behavior |
| `ggml-base.bin` download fails during CI | Low | Cache the model under `build/native-cache/linux-stt/` and pin the SHA256; build script falls back to the cache before re-downloading. Long-term, vendor the model via a release-pipeline artifact store |
| First-utterance latency feels slow vs mac/win native | Medium | Helper preloads the model on `ready` so the user-perceived "click stop → get text" path is just whisper inference (~real-time on base model) |
| Multi-display / multi-microphone systems pick the wrong PulseAudio source | Low | Use PA's default source (`NULL` device argument). Future ADR can add a device picker if requested |
| OpenAI ggml model license obligations missed in the installer | High | Phase 1 includes a NOTICE file alongside the model; deb's `copyright` file references both whisper.cpp and ggml-base; packaging test asserts the NOTICE is staged |
| Helper accidentally pulls in network deps via whisper.cpp's optional features | High | CMake build explicitly disables whisper.cpp's optional `WHISPER_CURL` / equivalent flags; build assertion checks the helper binary does not link `libcurl` / `libssl` |
| Inference exceeds host's 5 s stop cleanup window on long utterances | Medium | Helper closes libpulse stream early so microphone is released; if inference times out, host kills helper and renderer surfaces `engine_unavailable`. Future tuning option: bound buffer size and run inference in chunks |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-28 | Plan created from ADR-085 / SPEC-087. Awaiting Sammy review before Phase 1 start. |

---

*Created: 2026-04-28*
*Author: Claude*
