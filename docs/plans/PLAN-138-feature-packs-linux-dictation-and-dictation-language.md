# PLAN-138: Feature packs, Linux dictation and dictation language

## Metadata

| Field | Value |
| --- | --- |
| Status | Draft |
| Owner | Product owner |
| Specs | [SPEC-145](../specs/SPEC-145-feature-packs-and-linux-dictation.md), [SPEC-146](../specs/SPEC-146-dictation-language-for-desktop-voice-input.md) |
| Decision | [ADR-154](../decisions/154-deliver-optional-native-dependencies-as-host-managed-feature-packs.md) |
| Producer plan | [cats-plugins PLAN-002](https://github.com/cats-inc/cats-plugins/blob/main/docs/plans/PLAN-002-linux-stt-pack-producer.md) |

This plan does not authorize implementation, a version bump or a publication.
Each phase starts only after the owner authorizes it.

## Scope and boundaries

- **Integration-owned work.** This touches the Desktop host and the shared
  composer and Settings renderer, which AGENTS.md assigns to integration, not to
  a product tree.
  - No frozen shared contract changes.
  - The `src/shared/voiceCaptureBridge.ts` changes are additive.
- **Fixture packs until Phase 6.** Phases 1–5 need nothing from cats-plugins.
  Desktop first meets a real `linux-stt` archive in Phase 6.
- **Bot.** Bot vendors this work after milestone M2 (ADR-029 D1).
  - The pack manager's file closure must stay vendorable verbatim (Bot
    [SPEC-016](https://github.com/cats-inc/cats-bot/blob/main/docs/specs/SPEC-016-linux-dictation-pack-and-dictation-language-in-notes.md)
    FR-A2):
    - no relative value imports (type-only imports are allowed);
    - Node built-ins only;
    - erasable TypeScript syntax only.
  - The reason: Bot runs vendored TypeScript through Node's type stripping, so a
    relative `./x.js` value import would not resolve there.
  - Phase 2 records the closure's file list here.
- **Upgrade boundary.** Two additions, both additive within the current minor
  line:
  - the `feature-packs/` directory under the Platform root;
  - the optional `dictationLanguage` field in the Desktop preferences file,
    which means Automatic when it is missing.

  There is no migration and no version bump in this plan. Release notes come
  with the release that ships it.

## Milestones

- **M1 — Fixture complete.** Phases 1–5 pass on fixture packs, and Linux shows no
  microphone with the empty lock.
- **M2 — Real candidate accepted.** Phase 6 passes with real `linux-stt`
  candidates on x64 and on the arm64 reference board. Bot may start vendoring
  (ADR-029 D1).
- **M3 — Release-bound.** Phase 7, after the owner authorizes the first
  `linux-stt` release and a Desktop release.

The SPEC-146 slice in Phase 5 can merge on its own before M1.

## Phase 0 — Preconditions

- [ ] **Owner:** authorize implementation of SPEC-145 and SPEC-146.
- [ ] Inventory the current voice paths and record them in the progress log:
  - `desktop/host/voiceCapture.ts`, `desktop/host/preload.cts` and the voice
    IPC in `desktop/host/main.ts`;
  - `src/shared/voiceCaptureBridge.ts`;
  - the hooks `useNativeVoiceInput`, `useWebSpeechInput` and
    `useVoiceInputComposer`;
  - the helpers in `desktop/native/`.
- [ ] Fix the pack manager's location as a Node-only directory under
  `desktop/host/featurePacks/`. A boundary test fails on any Electron import, any
  relative value import, or any import other than `node:` built-ins and type-only
  imports (FR-B9 and Bot SPEC-016 FR-A2).

## Phase 1 — Contract and verifier (SPEC-145 FR-A1–FR-A4)

- [ ] **Lock parser (FR-A1).**
  - It accepts schema 1 only and fails closed on a missing, malformed or
    unknown lock.
  - It selects the entry for the machine's OS and architecture.
- [ ] **Manifest validator (FR-A3).** It covers every field, including
  `languages`, and the equality checks against the lock.
- [ ] **Streaming archive verifier (FR-A2).**
  - It rejects symbolic links, absolute paths, `..`, colliding paths and files
    outside the manifest.
  - It ignores the modes stored in the archive.
- [ ] **Helper protocol (FR-A4).** The `helperProtocol` value is checked, and the
  event parser handles `ready.locale` set to `"auto"`.
- [ ] **Fixture pack builder for tests.** It produces `.catspack` files around a
  scripted protocol-1 helper, plus malformed variants for each AC-01 case.

**Covers:** SPEC-145 AC-01.

## Phase 2 — Pack manager (SPEC-145 FR-B1–FR-B10)

- [ ] **Layout and status (FR-B1, FR-B2).**
  - All statuses are implemented.
  - The glibc check reads `glibcVersionRuntime`.
  - A prerequisite check that cannot decide counts as satisfied.
- [ ] **Resumable download (FR-B3).**
  - It writes the partial file and its sidecar, and resumes with `Range`:
    - a `206` response continues;
    - a `200` restarts;
    - any other response pauses with reason `network`.
  - It records the pause reasons `owner`, `network` and `quit`.
  - It checks free space with `statfs`, allows HTTPS-only redirects and
    enforces the size cap.
  - It runs one download per `id`.
- [ ] **Verify and activate (FR-B4).** Hashing and extraction stream. Modes,
  fsync, the receipt, the rename and the atomic `active.json` follow FR-B4, and
  the old version is deleted only when no helper uses it.
- [ ] **Start-time check (FR-B5)** and **Check files**, which hashes fully.
- [ ] **Remove (FR-B6)** and **startup cleanup (FR-B7)**, which keeps a partial
  download that matches the lock.
- [ ] **Data reset (FR-B8).**
  - `feature-packs` stays out of `PLATFORM_RESET_DIRECTORIES`.
  - "downloaded optional features" joins `PLATFORM_RESET_RETAINED`.
  - The reset confirmation shows it.
- [ ] **Boundary and logging (FR-B9, FR-B10).**
  - The transport, directories and clock are injected.
  - Log lines carry the stage.
- [ ] **Guard Linux-only assertions** (file modes, the glibc report) by
  platform. A local `npm test` also runs on Windows and macOS.
- [ ] Record the manager's file closure for Bot in the progress log, and prove
  it runs under Node's type stripping, unchanged, in one test.

**Covers:** SPEC-145 AC-02, AC-03.

## Phase 3 — Host wiring (SPEC-145 FR-C1 host side, FR-C4, FR-D1–FR-D4, FR-D8)

- [ ] **Transport and pack bridge (FR-C4).** The transport uses Electron `net`.
  The bridge channels accept the main frame only and validate `id` against the
  lock.
- [ ] **Bridge exposure on Linux (FR-D1).** The window-creation code decides
  whether to expose it and passes the answer to preload through
  `additionalArguments`. Preload reads no files.
- [ ] **Helper path (FR-D2).** `resolveVoiceCaptureHelperPath` resolves the
  active pack's `entry`, and `CATS_VOICE_CAPTURE_HELPER` still overrides it.
- [ ] **Voice events.**
  - `pack_required` (FR-C1) is added to `VOICE_CAPTURE_ERROR_REASONS`.
  - `limit_warning` and `processing` (FR-D3) are added to `VoiceCaptureEvent`.
- [ ] **Recording cap (FR-D3).** It is timed from `ready`, with a warning at 25
  seconds and a stop at 30 seconds. Every stop emits `processing` first.
- [ ] **Linux timeouts (FR-D4).** Provisionally 10 seconds for ready and 60 for
  stop. A helper that exits before `ready` reports `helper_crashed`.
- [ ] **Permission handler (FR-D8).** A regression test proves it is unchanged
  and that the renderer stays denied for `media`.
- [ ] **Helper contract tests (FR-D6).** The scripted fixture helper drives every
  FR-D6 event sequence through the host: `mic_unavailable`,
  `engine_unavailable`, a single `final`, `cancelled` and `aborted`. The real
  helper is tested by cats-plugins.
- [ ] **Lock packaging.** `config/desktop-feature-packs.lock.json` ships in the
  packaged app, starting empty, and the packaging test covers it.

**Covers:** the host parts of SPEC-145 AC-04.

## Phase 4 — Renderer (SPEC-145 FR-C1–FR-C3, FR-D1, FR-D5)

- [ ] **No Web Speech in Desktop (FR-D1).** `useVoiceInputComposer` never falls
  back to Web Speech in the Desktop renderer, and the Web deployment is
  unchanged (AC-05).
- [ ] **The composer toast (FR-C1).** `pack_required` reads the pack status and
  shows the right toast. **Open Settings** opens
  `/settings/desktop#optional-downloads` and keeps the draft.
- [ ] **Optional downloads section (FR-C2).**
  - Every status shows its actions; pause, resume and discard included.
  - Progress is announced through `aria-live`.
  - The row links to Voice input, and feedback is toast-only.
  - Section order: Updates, Mobile pairing, Startup behavior, Voice input,
    Optional downloads.
- [ ] **Composer states (FR-D5).** The `limit_warning` chip, and the
  `processing` busy state, which Escape cancels.
- [ ] **Strings (FR-C3).** `en` and `zh-TW` entries for every new key.

**Covers:** SPEC-145 AC-04 (renderer), AC-05 and AC-06.

## Phase 5 — Dictation language (SPEC-146; SPEC-145 FR-C5)

This slice can merge on its own. Its Linux options appear once Phase 1's
manifest reader exists.

- [ ] **Preference (SPEC-146 FR-1).** `dictationLanguage` is stored in the
  Desktop preferences file, unknown fields there are preserved, and an invalid
  value reads as Automatic.
- [ ] **macOS helper `--list-languages` (FR-3).** Implemented in `main.swift`,
  with Swift tests under `desktop/native/macos-stt/Tests`.
  - It must not request permission.
  - Whether listing causes a prompt is checked on a real Mac.
- [ ] **Windows helper `--list-languages` (FR-3).** Implemented in
  `Program.cs`, listing the dictation topic languages.
- [ ] **Listing in the host (FR-3, FR-4).**
  - A 5-second kill; a timeout, a non-zero exit or malformed output means
    Automatic only.
  - Results are cached per session and refreshed when the section opens.
  - On Linux, options come from the active manifest (SPEC-145 FR-C5).
- [ ] **Session arguments (FR-2, FR-5).**
  - A tag becomes `--locale`, and Automatic passes none: detection on Linux,
    the system language elsewhere.
  - Renderer locales are ignored on every platform.
  - On macOS and Windows, `language_not_supported` gets **Open Settings** to
    Voice input.
  - On Linux, a subtag missing from the manifest runs as Automatic.
- [ ] **Voice input section (FR-6), bridge (FR-7) and strings (FR-8).**
  - The Automatic label differs per platform.
  - Native names come from `Intl.DisplayNames`.
  - On Linux, the select stays disabled until the pack allows dictation.
- [ ] **Owner:** real-Mac acceptance (SPEC-146 AC-04).
- [ ] **Owner:** real-Windows acceptance (SPEC-146 AC-05). It is blocked
  externally by SPEC-084's open Windows defect, in which text never reaches the
  composer.

**Covers:** SPEC-146 AC-01–AC-03 automatically, and AC-04 and AC-05 manually.

## Phase 6 — First contact with real packs (gate M2)

This phase depends on cats-plugins PLAN-002 Phase 6.

- [ ] **Run Desktop's verifier on candidate archives.** Feed the real x64 and
  arm64 candidates, taken from cats-plugins workflow artifacts, through
  Desktop's verifier and pack manager.
  - Use a development-only lock and a local HTTPS test server. Production locks
    stay empty.
  - Any FR-A2 or FR-A3 mismatch is fixed in the owning repository before
    continuing.
- [ ] **Owner or assigned operator: measure on the arm64 reference board.**
  - Follow cats-plugins SPEC-002 FR-E2, with the fixture runs and the live
    `ready` time from host log timestamps.
  - Fill in the measurement record below.
- [ ] **Choose the model and the final timeouts.**
  - The model is the first candidate that passes ADR-154 D4.
  - Each timeout is at least twice the worst run, and not below 3 and 60
    seconds (SPEC-145 FR-D4, Q4).
  - Update the host constants.
- [ ] **Live microphone dictation.**
  - It works on x64 and on the reference board.
  - Record the script finding for 中文 (SPEC-145 FR-D7) and how well
    Automatic detects languages (AC-07).
- [ ] Record M2 here. Bot vendoring may start.

## Phase 7 — Release-bound (gate M3; owner-authorized only)

- [ ] **Owner:** authorize the first `linux-stt` release in cats-plugins.
- [ ] **Desktop lock.** Copy the released lock fragments into
  `config/desktop-feature-packs.lock.json` in a Desktop PR. Verify against the
  real release asset, including a resumed download (AC-07).
- [ ] **Owner:** authorize the Desktop release. Its release notes state the new
  feature and the upgrade boundary.
- [ ] **Status updates.** Update the statuses of SPEC-145, SPEC-146 and ADR-154 in
  the release-preparation change, per the release guide.

## Measurement record

Empty until Phase 6. One row per run set.

| Date | Candidate | Arch / device | Fixture | Ready median / worst (fixture) | Live ready | Transcription median / worst | Threads | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Files to create or modify

| File | Action | Purpose |
| --- | --- | --- |
| `desktop/host/featurePacks/*` | Create | Node-only lock, manifest, archive and manager (FR-A1–FR-A3, FR-B*) |
| `desktop/host/voiceCapture.ts` | Modify | Pack helper path, cap, events, timeouts, language arguments |
| `desktop/host/preload.cts`, `desktop/host/main.ts` | Modify | Linux bridge exposure, pack bridge, dictation language bridge |
| `src/shared/voiceCaptureBridge.ts` | Modify | `pack_required`, `limit_warning`, `processing` |
| `src/products/shared/renderer/hooks/useVoiceInputComposer.ts`, `useNativeVoiceInput.ts` | Modify | No Web Speech in Desktop, pack toasts, composer states |
| `src/app/renderer/settings/PlatformSettingsDesktop*.tsx` | Modify / create | Voice input and Optional downloads sections |
| `desktop/host/desktopStartup.ts` | Modify | `dictationLanguage` preference |
| `src/shared/platformDataReset.ts` | Modify | Disclosure of retained packs |
| `desktop/native/macos-stt/Sources/CatsSttMacos/main.swift`, `desktop/native/windows-stt/Program.cs` | Modify | `--list-languages` |
| `config/desktop-feature-packs.lock.json` | Create | Empty lock |
| `src/shared/i18n/catalogs/en.ts`, `zh-TW.ts`, `messageKeys.ts` | Modify | Strings |
| `tests/*` | Create / modify | Contract, manager, host, renderer, reset, packaging and preload tests |

## Testing strategy

- **Local scope.** Follow AGENTS.md's Local Validation Scope.
  - Run focused tests with `npm run test:file -- <tests>`, after the builds
    those tests consume.
  - Host and OS-helper changes also need the relevant packaging or process
    checks.
- **Fixture packs** drive AC-01–AC-06 and the automated parts of SPEC-146.
- **Manual acceptance** covers SPEC-145 AC-07 and SPEC-146 AC-04 and AC-05, on
  real devices.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A real pack differs from the fixtures | High | Gate M2 runs Desktop's verifier on real candidates before any release |
| The reference board misses the D4 bar | Medium | Candidate order in cats-plugins ADR-002 D3; measure before choosing |
| Bot vendoring drifts | Medium | Keep the closure vendorable verbatim, enforced by the boundary test; record its file list; Bot starts at M2 |
| Listing on macOS causes a permission prompt | Medium | Manual check in Phase 5; an empty list falls back to Follow system |

## Progress log

| Date | Update |
| --- | --- |
| 2026-11-16 | Plan drafted; no phase started. |

---

*Created: 2026-11-16*
