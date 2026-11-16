# PLAN-138: Feature packs, Linux dictation and dictation language

## Metadata

| Field | Value |
| --- | --- |
| Status | In progress; Phases 0–4 authorized by the owner and implemented, 2026-11-16 |
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
- [x] Inventory the current voice paths and record them in the progress log:
  - `desktop/host/voiceCapture.ts`, `desktop/host/preload.cts` and the voice
    IPC in `desktop/host/main.ts`;
  - `src/shared/voiceCaptureBridge.ts`;
  - the hooks `useNativeVoiceInput`, `useWebSpeechInput` and
    `useVoiceInputComposer`;
  - the helpers in `desktop/native/`.
- [x] Fix the pack manager's location as a Node-only directory under
  `desktop/host/featurePacks/`. A boundary test fails on any Electron import, any
  relative value import, or any import other than `node:` built-ins and type-only
  imports (FR-B9 and Bot SPEC-016 FR-A2).
  - `tests/desktop-feature-pack-boundary.test.js` parses each file with the
    TypeScript compiler API. It also catches re-exports, dynamic `import()`,
    `require` and `createRequire`.
  - Only a clause-level `import type` from a sibling passes. An inline
    `import { type X }` still loads its module once types are stripped, which
    a probe under Node confirmed.
  - The same test loads every file under Node's type stripping, which is the
    only real check of erasable syntax. This was planned for Phase 2.
  - Probes confirmed that it fails on a sibling value import and on an `enum`.

## Phase 1 — Contract and verifier (SPEC-145 FR-A1–FR-A4)

- [x] **Lock parser (FR-A1).**
  - It accepts schema 1 only and fails closed on a missing, malformed or
    unknown lock.
  - It selects the entry for the machine's OS and architecture.
  - One invalid entry rejects the whole lock, and an entry whose
    `helperProtocol` this host does not implement is invalid.
- [x] **Manifest validator (FR-A3).** It covers every field, including
  `languages`, and the equality checks against the lock.
- [x] **Streaming archive verifier (FR-A2).**
  - It rejects symbolic links, absolute paths, `..`, colliding paths and files
    outside the manifest.
  - It ignores the modes stored in the archive.
  - It is a central-directory reader over `node:zlib`, because the closure
    allows `node:` built-ins only. SPEC-145 FR-A2 now states the ZIP subset it
    accepts, so the cats-plugins writer is built to the same rules.
- [x] **Helper protocol (FR-A4).** The `helperProtocol` value is checked, and the
  event parser handles `ready.locale` set to `"auto"`.
  - The parser already accepted any `locale` string, so this needed a test, not
    a code change. No renderer code passes `ready.locale` to `Intl`.
- [x] **Fixture pack builder for tests.** It produces `.catspack` files around a
  scripted protocol-1 helper, plus malformed variants for each AC-01 case.
  - It is `tests/fixtures/featurePackFixtures.mjs`, plain JavaScript, so the
    `.test.js` host tests of later phases can import it.
  - fflate writes the valid archives, so the reader is not only ever tested
    against its own author's writer. Defects fflate cannot express are byte
    patches.

**Covers:** SPEC-145 AC-01, as rejection only. Phase 1 has no activation, so
"nothing activated" is proven in Phase 2.

## Phase 2 — Pack manager (SPEC-145 FR-B1–FR-B10)

The manager is `desktop/host/featurePacks/featurePackManager.ts`. Its tests are
`tests/desktop-feature-pack-manager.test.ts`, against an in-memory transport
from `tests/fixtures/featurePackFixtures.mjs`.

- [x] **Layout and status (FR-B1, FR-B2).**
  - All statuses are implemented.
  - The glibc check reads `glibcVersionRuntime`.
  - A prerequisite check that cannot decide counts as satisfied.
  - The default probe reports a library missing only when `ldconfig -p` also
    lists this architecture's `libc.so.6`.
  - Each snapshot carries the active version and `usable`, because dictation
    follows the FR-B5 check, not the status. SPEC-145 FR-B2 now says so.
- [x] **Resumable download (FR-B3).**
  - It writes the partial file and its sidecar, and resumes with `Range`:
    - a `206` response continues;
    - a `200` restarts;
    - any other response pauses with reason `network`.
  - It records the pause reasons `owner`, `network` and `quit`.
  - It checks free space with `statfs`, allows HTTPS-only redirects and
    enforces the size cap.
  - It runs one download per `id`.
  - It does not re-hash on resume, unlike FR-B3's first wording. The verifier
    hashes the whole archive once, and SPEC-145 now says so. The sidecar
    records only fsynced bytes, and a complete partial skips the request.
  - The transport must not follow redirects. Electron's `net.request` with
    `redirect: 'manual'` can return them, which Phase 3 confirms.
- [x] **Verify and activate (FR-B4).** Hashing and extraction stream. Modes,
  fsync, the receipt, the rename and the atomic `active.json` follow FR-B4, and
  the old version is deleted only when no helper uses it.
  - Extraction is an option of the contract's verifier, which awaits each
    write and honors an `AbortSignal` for Pause and Cancel while verifying.
  - Started helpers hold a lease from `acquireHelper`. The previous version is
    deleted when the last lease is released.
- [x] **Start-time check (FR-B5)** and **Check files**, which hashes fully.
- [x] **Remove (FR-B6)** and **startup cleanup (FR-B7)**, which keeps a partial
  download that matches the lock.
- [x] **Data reset (FR-B8).**
  - `feature-packs` stays out of `PLATFORM_RESET_DIRECTORIES`.
  - "downloaded optional features" joins `PLATFORM_RESET_RETAINED`.
  - The reset confirmation shows it.
- [x] **Boundary and logging (FR-B9, FR-B10).**
  - The transport, directories and clock are injected.
  - Log lines carry the stage.
  - The manager is its own file and takes the contract's types through
    `import type`. The Desktop wiring passes in the contract's functions with
    the transport, directories and clock.
  - Code outside the contract file reads an error's `stage` and `code`, not
    `instanceof FeaturePackError`.
- [x] **Guard Linux-only assertions** (file modes, the glibc report) by
  platform. A local `npm test` also runs on Windows and macOS.
- [x] Record the manager's file closure for Bot in the progress log. The Phase 0
  boundary test already loads every file in the directory under Node's type
  stripping, so the manager is covered once it is added.

**Covers:** SPEC-145 AC-02, AC-03, and the "nothing activated" half of AC-01:
the AC-01 defects run through `download()` and leave no version directory, no
`active.json` and an empty `.staging/`.

## Phase 3 — Host wiring (SPEC-145 FR-C1 host side, FR-C4, FR-D1–FR-D4, FR-D8)

The wiring is `desktop/host/featurePackHost.ts`, outside the vendored
directory. Its tests are `tests/desktop-feature-pack-host.test.js`.

- [x] **Transport and pack bridge (FR-C4).** The transport uses Electron `net`.
  The bridge channels accept the main frame only and validate `id` against the
  lock.
  - `net.request` with `redirect: 'manual'` hands each 3xx back to the
    manager. Probes on Electron 41.2.0 confirmed this and two more facts:
    - the response is a Readable, read as an async iterable;
    - aborting mid-body makes that read throw at once ("Premature close").
      Pause and quit therefore never wait on the network.
  - The main-frame check compares the sender frame's process and routing ids.
  - The renderer's types are `src/shared/featurePackBridge.ts`, exposed as
    `featurePacks` on the Desktop bridge.
- [x] **Bridge exposure on Linux (FR-D1).** The window-creation code decides
  whether to expose it and passes the answer to preload through
  `additionalArguments`. Preload reads no files.
  - The argument is `--cats-feature-packs=<ids>`. Linux voice needs
    `linux-stt` among the ids.
  - A probe on Electron 41.2.0 confirmed that a sandboxed preload sees it in
    `process.argv`.
- [x] **Helper path (FR-D2).** `resolveVoiceCaptureHelperPath` resolves the
  active pack's `entry`, and `CATS_VOICE_CAPTURE_HELPER` still overrides it.
  - The controller takes a lease from the manager instead, because the FR-B5
    check is asynchronous. `resolveVoiceCaptureHelperPath` keeps the override
    and the macOS and Windows paths. SPEC-145 FR-D2 now says so.
  - Linux sessions ignore the renderer's locale and run as Automatic until
    Phase 5.
- [x] **Voice events.**
  - `pack_required` (FR-C1) is added to `VOICE_CAPTURE_ERROR_REASONS`.
  - `limit_warning` and `processing` (FR-D3) are added to `VoiceCaptureEvent`.
- [x] **Recording cap (FR-D3).** It is timed from `ready`, with a warning at 25
  seconds and a stop at 30 seconds. Every stop emits `processing` first.
- [x] **Linux timeouts (FR-D4).** Provisionally 10 seconds for ready and 60 for
  stop. A helper that exits before `ready` reports `helper_crashed`.
  - Only Linux sessions report `engine_unavailable` when the stop window
    passes. macOS and Windows keep ending quietly.
  - A newer start supersedes one still waiting for the pack check, so only one
    helper runs.
- [x] **Permission handler (FR-D8).** A regression test proves it is unchanged
  and that the renderer stays denied for `media`.
- [x] **Helper contract tests (FR-D6).** The scripted fixture helper drives every
  FR-D6 event sequence through the host: `mic_unavailable`,
  `engine_unavailable`, a single `final`, `cancelled` and `aborted`. The real
  helper is tested by cats-plugins.
  - The fixture helper gained the `overrun` and `hang_on_stop` scenarios.
- [x] **Lock packaging.** `config/desktop-feature-packs.lock.json` ships in the
  packaged app, starting empty, and the packaging test covers it.
  - It is staged to `app-sidecar/config/`, which is where the host reads it.
    The npm package's `files` list carries it too.
  - Removing a pack stops a running helper first, with `aborted`. Quitting
    pauses a download with reason `quit`, waiting at most 5 seconds.

**Covers:** the host parts of SPEC-145 AC-04.

## Phase 4 — Renderer (SPEC-145 FR-C1–FR-C3, FR-D1, FR-D5)

The tests are `tests/desktop-feature-pack-renderer.test.tsx`.

- [x] **No Web Speech in Desktop (FR-D1).** `useVoiceInputComposer` never falls
  back to Web Speech in the Desktop renderer, and the Web deployment is
  unchanged (AC-05).
  - A Desktop renderer without a native voice bridge shows no button. A test
    proves the `SpeechRecognition` constructor is never called there.
- [x] **The composer toast (FR-C1).** `pack_required` reads the pack status and
  shows the right toast. **Open Settings** opens
  `/settings/desktop#optional-downloads` and keeps the draft.
  - The toast asks the app to navigate with a `cats:navigate` event, which
    `App` handles inside the router. A full reload would drop the draft.
  - Drafts live in `conversationViewMemory`. A routed test types a draft, opens
    Settings and returns to find it intact.
  - A snapshot the host cannot give gets the plain message. A pack that became
    usable meanwhile gets "start voice input again" without Open Settings.
    SPEC-145 FR-C1 now says so.
- [x] **Optional downloads section (FR-C2).**
  - Every status shows its actions; pause, resume and discard included.
  - Progress is announced through `aria-live`, in 10 % steps. The visible
    progress keeps its full rate.
  - Feedback is toast-only. Failures map their `stage` and `code` to catalog
    strings; raw host messages never reach the owner.
  - It sits after Startup behavior, and its `id` exists before the list loads,
    so the hash can scroll to it.
- [ ] **Voice input link and final order (FR-C2).** The row links to Voice
  input, and the order is Updates, Mobile pairing, Startup behavior, Voice
  input, Optional downloads. This needs Phase 5's Voice input section, so it
  stays open.
- [x] **Composer states (FR-D5).** The `limit_warning` chip, and the
  `processing` busy state, which Escape cancels.
  - Escape is heard on the whole document while voice is active, because
    clicking the mic moves focus off the textarea.
  - A click on the busy button does nothing.
  - The chip clears on `processing`, `end` and `error`.
- [x] **Strings (FR-C3).** `en` and `zh-TW` entries for every new key.

**Covers:** SPEC-145 AC-04 (renderer) and AC-05. AC-06 is covered except for
the Voice input link, which waits for Phase 5.

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
| 2026-11-16 | The owner authorized Phases 0–1. This does not authorize the rest of SPEC-145 or SPEC-146, so the first Phase 0 item stays open. |
| 2026-11-16 | Phases 0–1 implemented. The Bot closure is `desktop/host/featurePacks/featurePackContract.ts`. SPEC-145 FR-A2 gained the ZIP subset, and its dependencies use `node:zlib` instead of fflate. |
| 2026-11-16 | The owner authorized Phase 2, and it was implemented. The Bot closure is now `desktop/host/featurePacks/featurePackContract.ts` and `featurePackManager.ts`. SPEC-145 FR-B2–FR-B7 and FR-B9 now match the manager. Electron 41.2.0 runs Node 24.14.0, which has what the manager uses: `AbortSignal.any`, `statfs` and the report's `glibcVersionRuntime` (2.41 on the arm64 board). |
| 2026-11-16 | The owner authorized Phase 3, and it was implemented. With the shipped empty lock, Linux still exposes no voice bridge. SPEC-145 FR-C4, FR-D1 and FR-D2 now match the wiring. |
| 2026-11-16 | The owner authorized Phase 4 ("cnr後繼續" after Phase 3), and it was implemented. The Voice input link and the final section order wait for Phase 5. |

### Voice path inventory (Phase 0, 2026-11-16)

- **`desktop/host/voiceCapture.ts`.**
  - `DesktopVoiceCaptureController` runs one helper per session.
    - Ready timeout 3 s, stop cleanup 5 s, cancel cleanup 1 s.
  - `resolveVoiceCaptureHelperPath`.
    - `CATS_VOICE_CAPTURE_HELPER` overrides everything.
    - On macOS, `CATS_STT_MACOS_HELPER` overrides next, then the packaged or
      source helper.
  - `buildVoiceCaptureHelperArgs` adds `--locale` only when the renderer sends
    one.
  - `parseVoiceCaptureHelperEvent` accepts any `ready.locale` string.
  - `shouldAllowDesktopRendererPermission` keeps the renderer denied for
    `media`.
- **`desktop/host/contracts.ts`.**
  - The channels `cats-host:voice-start`, `-stop`, `-cancel` and `-event`.
  - `VOICE_CAPTURE_MODES`, `VOICE_CAPTURE_ERROR_REASONS` and
    `VoiceCaptureEvent` (`ready`, `partial`, `final`, `error`, `end`).
- **`desktop/host/main.ts`.**
  - One controller is created at startup.
  - The three voice `ipcMain.handle` channels each check
    `assertMainWindowVoiceCaptureIpcSender`.
  - ADR-147's screen-capture access request reuses the voice helper path.
- **`desktop/host/preload.cts`.**
  - The voice bridge is exposed on `darwin` and `win32` only.
  - The channel names are repeated there, which
    `desktop-voice-capture-contract.test.js` checks against main.
- **`src/shared/voiceCaptureBridge.ts`.** The renderer-facing voice types.
- **Hooks.**
  - `useVoiceInputComposer` uses `useNativeVoiceInput` when the bridge has
    voice, and `useWebSpeechInput` otherwise. The Web Speech fallback is the
    Electron path that never transcribes (FR-D1).
  - `useNativeVoiceInput` sends the renderer's `lang` as `locale`. SPEC-146
    FR-5 removes this.
- **`desktop/native/`.**
  - `macos-stt`: Swift, `Locale.current`, on-device recognition required.
  - `windows-stt`: .NET `SpeechRecognizer` with the dictation topic.
  - `windows-desktop-control` is not part of voice.

---

*Created: 2026-11-16*
