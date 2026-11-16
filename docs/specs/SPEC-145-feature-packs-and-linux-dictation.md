# SPEC-145: Feature packs and Linux dictation (`linux-stt`)

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft; Q1–Q5 resolved under the owner's delegation, 2026-11-16 |
| **Owner** | Desktop host maintainers |
| **Reviewer** | Product owner |
| **Decision** | [ADR-154](../decisions/154-deliver-optional-native-dependencies-as-host-managed-feature-packs.md) |
| **Producer** | [cats-plugins ADR-002](https://github.com/cats-inc/cats-plugins/blob/main/docs/decisions/002-produce-native-feature-packs-beside-plugin-content.md) |
| **Replaces** | The helper and host requirements of cancelled [SPEC-087](SPEC-087-linux-composer-voice-input-via-bundled-whisper-cpp.md), minus its packaging and build |

## Summary

Cats Desktop on Linux has no working voice input. Its composer falls back to
Web Speech, which never transcribes in Electron
([SPEC-084](SPEC-084-composer-voice-input-via-platform-native-stt.md)).

This SPEC delivers on-device dictation through the first feature pack,
`linux-stt`: a whisper.cpp helper and model built by cats-plugins. It fixes the
contracts that ADR-154 says products and the producer share:

- the lock entry;
- the `.catspack` archive and its manifest;
- helper protocol 1.

It also specifies Desktop's side:

- a resumable download that the owner manages in Settings, with verification,
  activation and removal;
- the composer prompt that leads to Settings;
- voice input on Linux, with the host-owned recording cap.

## Goals

- **Dictation on Linux.** Desktop on Linux x64 and arm64 turns speech into
  composer text on the machine itself, after the owner downloads the pack from
  Settings.
- **Only verified bytes run.** Nothing runs that the Desktop release did not
  pin by SHA-256. A failure at any step leaves a known state.
- **A large download is manageable.** It can be paused, survives restarts, and
  resumes where it stopped.
- **Self-contained contracts.** The producer (cats-plugins) and a later Cats
  Bot adoption can implement against this SPEC without reading Desktop code.
- **A portable manager.** The pack manager has no Electron dependency, so it
  can move to `@cats-inc/platform-host` (SPEC-134).

## Non-Goals

- **Cats Bot.** Its own ADR amends Bot ADR-018 point 3 and reuses §A and §D.
- **macOS, Windows and the Web deployment.** None of them change. FR-D1's
  no-Web-Speech rule has no effect on macOS or Windows, where Desktop always
  has a native bridge.
- **More pack features.** Other packs such as FFmpeg, a pack catalog,
  third-party packs, and pack updates outside Desktop releases.
- **More recognition features.** Streaming transcripts and a locale picker.
- **Sandboxed formats.** Snap, Flatpak and other sandboxed Linux formats.
- **Helper internals and build.** PulseAudio threading, CMake, model fetching
  and CI belong to the cats-plugins producer SPEC.
- **Publishing `@cats-inc/platform-host`.**

## Terms

- **Pack.** One `.catspack` archive for one OS and architecture.
- **Lock entry.** Desktop's reviewed record of a pack it may install, shipped
  inside the Desktop release.
- **Manifest.** `feature-pack.json` inside the archive.
- **Active version.** The installed version that `active.json` points to.
- **Receipt.** The host's record of the files it wrote for one installed
  version.
- **Partial download.** Bytes received so far, kept for resuming.
- **Desktop renderer.** A renderer that has Desktop's host bridge. A browser
  tab on the sidecar URL is the Web path, not the Desktop renderer.

Each requirement names who implements it:

- **host**: the Desktop main process;
- **renderer**: Desktop's composer and Settings;
- **helper**: the `linux-stt` executable, built by cats-plugins;
- **producer**: cats-plugins.

## Requirements

### A. Shared contract

**FR-A1 — Lock file (host, producer).**

- Desktop ships `config/desktop-feature-packs.lock.json`, beside the existing
  Plugin lock, as `{ "schemaVersion": 1, "packs": [ … ] }`.
- Each entry carries everything the host needs before downloading:

  | Field | Meaning |
  |-------|---------|
  | `id` | Pack identifier; `linux-stt` for this SPEC |
  | `version` | Pack version |
  | `minUsableVersion` | Oldest installed version that may still run (FR-B2) |
  | `os`, `arch` | `linux`; `x64` or `arm64` |
  | `url` | HTTPS URL of the archive (a cats-plugins release asset) |
  | `size`, `sha256` | Exact byte size and SHA-256 of the archive |
  | `unpackedSize` | Total bytes after extraction, for the disk-space check |
  | `helperProtocol` | `1` |
  | `minGlibc` | Lowest supported glibc, such as `"2.35"` |
  | `prerequisites` | System libraries the helper loads, such as `["libpulse.so.0"]` |
  | `licenses` | `[{ "name", "component" }]`, shown in Settings |

- Entries change only in a reviewed Desktop release.
- A missing, malformed or unknown-schema lock yields no entries. The host fails
  closed and logs it.
- A machine with no entry for its OS and architecture has no pack (FR-D1).

**FR-A2 — Archive (producer, host).**

- The archive is a ZIP file named `<id>-<version>-<os>-<arch>.catspack`.
- Entries are stored or deflated.
- The archive contains no symbolic links, no absolute paths, no `..` segments,
  no paths that collide after normalization, and no entries outside the
  manifest's file list.
- `feature-pack.json` sits at the archive root.
- File modes stored in the archive are ignored. The host sets modes from the
  manifest.

**FR-A3 — Manifest (producer, host).**

- The manifest has `schemaVersion: 1` and carries:
  - `id`, `version`, `os`, `arch`, `helperProtocol`;
  - `entry`: the executable's relative path, `cats-stt-linux` for this pack;
  - `files`: `[{ path, size, sha256, executable }]` for every other entry;
  - `upstream`: `[{ name, repository, commit }]`;
  - `model`: `{ name, path, sha256 }`;
  - `prerequisites` and `minGlibc`;
  - `licenses`: `[{ name, component, path }]`.
- The host accepts the manifest only if all of the following hold:
  - `id`, `version`, `os`, `arch`, `helperProtocol`, `minGlibc` and
    `prerequisites` equal the lock entry;
  - every archive entry except the manifest appears in `files` exactly once,
    and nothing else does;
  - `entry` is listed and marked executable.
- This is the manifest that ADR-002 §1 describes, and it defines the helper
  protocol version that ADR-002 left open.

**FR-A4 — Helper protocol 1 (helper, host).**

- **Arguments.**
  - `--session-id <id>`.
  - An optional `--locale <bcp47>`.
  - The test-only `--input <wav>`, honored only when
    `CATS_STT_ENABLE_FIXTURE_INPUT=1`.
- **Model.** The helper finds it relative to its own location; the host passes
  no model path.
- **Input.** stdin carries JSON lines `{ "type": "stop" | "cancel", "sessionId" }`.
- **Output.** stdout carries one JSON event per line, as in SPEC-084:
  - `ready` with `locale` and `mode: "on-device"`;
  - `final` with `text`;
  - `error` with `reason`;
  - `end`.

  Protocol 1 emits no `partial`.
- **Robustness.** The host ignores stdout lines it cannot parse. It forwards
  stderr to its log, truncated, as it does today.
- **Version check.** The host refuses a pack whose `helperProtocol` it does not
  implement.

### B. Host pack manager

**FR-B1 — Layout (host).**

- Packs live under `<platformDir>/feature-packs/`, normally
  `~/.cats/platform/feature-packs/`:
  - `<id>/<version>-<os>-<arch>/` holds one installed version and its
    `.receipt.json`;
  - `<id>/active.json` names the active version;
  - `.staging/` holds partial downloads and extraction in progress.
- The host creates these directories writable only by the user.

**FR-B2 — Status (host).**

- For each lock entry that matches the machine, the host reports one of these
  statuses:
  - `not_installed`;
  - `downloading`, with bytes received and total;
  - `paused`, with bytes received and total, plus the reason: `owner`,
    `network` or `quit`;
  - `verifying`;
  - `installed`;
  - `update_available`: the active version differs from the lock, and it is
    still usable;
  - `update_required`: the active version differs from the lock, and it is
    below `minUsableVersion` or uses another `helperProtocol`;
  - `damaged`: the start-time check of FR-B5 failed;
  - `unsupported`, with the reason `glibc` or `prerequisite`.
- **The `glibc` check.** It compares the running glibc version (Node's
  `process.report.getReport().header.glibcVersionRuntime`) with `minGlibc`.
- **The `prerequisite` check.**
  - It applies when the host determined that a library in `prerequisites` is
    absent.
  - A check that cannot decide counts as satisfied. For example, the loader
    cache tool may be missing from a desktop session's `PATH`.
  - If the library really is missing, the helper fails to start (FR-D4).
- **Which statuses allow dictation.** `installed` and `update_available` do;
  `update_available` runs the older active version (Q5).

**FR-B3 — Resumable download (host).**

- **Who starts it.** A download starts only from Settings (FR-C2), naming a
  pack `id` that has a matching lock entry. The renderer never supplies a URL
  or a path.
- **Free space.** Before downloading or resuming, the host checks with `statfs`
  that the free space covers the remaining bytes plus `unpackedSize`.
  Otherwise it refuses with `insufficient_space`.
- **Transport.** The download uses the lock URL over HTTPS, through a
  transport that the product supplies.
  - Desktop supplies Electron's `net`, so system proxy settings apply.
  - Redirects are followed only to HTTPS URLs.
  - The host aborts when the received bytes would exceed `size`.
- **Partial state.** The partial download is
  `.staging/<id>-<version>-<os>-<arch>.part`. It has a sidecar `.part.json`
  that records the lock entry's `url`, `size` and `sha256`, and the bytes
  received.
- **Resuming.**
  - The host first re-hashes the bytes already received, then requests
    `Range: bytes=<received>-`.
  - A `206` response whose `Content-Range` total equals `size` continues the
    download.
  - A `200` response restarts from zero.
  - Any other response pauses the download with reason `network`.
  - A sidecar that does not match the current lock entry discards the partial
    download.
- **Pausing.** The owner can pause. A network failure pauses with reason
  `network`, and quitting Desktop pauses with reason `quit`. Desktop never
  resumes on its own; the owner chooses Resume.
- **Discarding.** Cancel, or Discard when paused, deletes the partial download.
- **Concurrency.** One download per `id` runs at a time. The download runs in
  the host, so leaving the Settings page does not affect it.

**FR-B4 — Verify and activate (host).**

- **Hash check.** When `size` bytes have arrived, the whole archive's SHA-256
  must equal the lock. On a mismatch the host discards the partial download,
  sets the status to `not_installed` and does not retry by itself.
- **Extraction.** The host extracts in streaming fashion, without holding the
  archive in memory. It enforces FR-A2 and FR-A3, and checks every file's size
  and SHA-256 against the manifest.
- **File modes.** Executables get mode `0755` and other files `0644`. Each file
  is fsynced.
- **Activation.**
  - The host writes the receipt and renames the extraction directory to the
    version directory.
  - It then replaces `active.json` by writing a new file and renaming it.
  - It deletes the archive and any earlier version once the new one is active
    and no helper from the old one is running.
- **No early execution.** No byte from the archive runs before activation
  completes.

**FR-B5 — Start-time check (host).**

- Before spawning the helper, the host confirms that:
  - `active.json` names a usable version (FR-B2);
  - the version's receipt exists;
  - every manifest file exists with its manifest size.
- It does not hash the model at start. Full hashing happens at install, and
  again when the owner chooses **Check files** (FR-C2).

**FR-B6 — Remove (host).**

- Remove cancels any helper started from the pack.
- It then deletes only the paths in the receipt, the version directory and
  `active.json`.
- The status becomes `not_installed`.

**FR-B7 — Startup cleanup (host).**

- At startup the host keeps a partial download, with its sidecar, that matches
  the current lock entry, and reports it as `paused` with reason `quit`.
- It deletes everything else in `.staging/`.
- It deletes any version directory that is neither active nor the lock's
  version.

**FR-B8 — Data reset keeps packs (host).** This is ADR-154 D5.

- `feature-packs` stays out of `PLATFORM_RESET_DIRECTORIES`.
- `PLATFORM_RESET_RETAINED` gains "downloaded optional features", so the reset
  dialog discloses it.

**FR-B9 — Boundary (host).**

- The manager is a Node-only module: it has no Electron imports, and the
  transport, directories and clock are injected.
- The Electron IPC wiring lives separately, so the manager can move to
  `@cats-inc/platform-host` unchanged.

**FR-B10 — Logging (host).** The host log records each operation's `id`,
`version`, outcome and failing stage. The stages are `space`, `download`,
`resume`, `hash`, `extract`, `manifest` and `activate`.

### C. Composer prompt and Settings

This section refines ADR-154 §4 at the owner's direction (2026-11-16). The
download and its consent live in Settings. The composer only points there and
never waits for a download, and dictation never starts by itself after a
download.

**FR-C1 — The composer prompt (host, renderer).**

- `VOICE_CAPTURE_ERROR_REASONS` gains `pack_required`, an additive change.
- When voice start finds the pack in a status that does not allow dictation,
  the host emits `error: pack_required` and then `end`.
- The renderer reads the pack's status through the pack bridge (FR-C4) and
  shows a toast:

  | Status | Toast | Action |
  |--------|-------|--------|
  | `not_installed` | Voice input needs offline speech recognition (about N MB) | **Open Settings** |
  | `update_required` | Voice input needs an update to offline speech recognition (about N MB) | **Open Settings** |
  | `damaged` | Offline speech recognition needs to be downloaded again | **Open Settings** |
  | `downloading`, `verifying` | Offline speech recognition is downloading (P%) | **Open Settings** |
  | `paused` | The offline speech recognition download is paused (P%) | **Open Settings** |
  | `unsupported` | Names the missing glibc version or library | none |

- **Open Settings** navigates to Settings > Desktop and scrolls to the
  Optional downloads row (`#optional-downloads`).
- The composer draft survives the round trip.
- This follows the toast-with-action pattern that ADR-147 uses for macOS
  permissions.

**FR-C2 — The Optional downloads section (renderer, host).**

- `Settings > Desktop` gains **Optional downloads** after Startup behavior.
  SPEC-111's existing order is unchanged.
- **Consent.** Each lock entry that matches the machine is a row. The row is
  the consent surface that ADR-154 §3 requires. It states:
  - what the pack enables: offline speech recognition for voice input;
  - its download size and source host;
  - its licenses;
  - that audio stays on the computer.
- **Actions by status.**

  | Status | Shows | Actions |
  |--------|-------|---------|
  | `not_installed` | — | **Download** |
  | `downloading`, `verifying` | Progress, as bytes received of total | **Pause**, **Cancel** |
  | `paused` | Progress and the pause reason | **Resume**, **Discard** |
  | `installed` | Version and size on disk | **Check files**, **Remove** |
  | `update_available` | Version and size on disk | **Update**, **Check files**, **Remove** |
  | `update_required`, `damaged` | — | **Download**, **Remove** |
  | `unsupported` | The reason | none |

- **Feedback.**
  - Errors go through the page's toast, including network failures, a hash
    mismatch, insufficient space and failed checks.
  - Success is silent when the row already shows the new state.
  - Both follow AGENTS.md's Settings UI rules.

**FR-C3 — Strings (renderer).** Every new string has `en` and `zh-TW` catalog
entries.

**FR-C4 — Pack bridge and IPC trust (host).**

- Preload exposes a pack bridge with these operations:
  - `list()` and `get(id)` return status, version, sizes and lock licenses;
  - `download(id)`, `pause(id)`, `resume(id)`, `cancel(id)`, `check(id)` and
    `remove(id)`;
  - `onChange(listener)` reports status and progress.
- Pack channels accept only the Platform window's main frame, like the
  existing voice channels.
- They validate `id` against the lock and accept no other input.

### D. Linux dictation

**FR-D1 — Bridge exposure (host, renderer).**

- Preload exposes the voice bridge on Linux when the lock has an entry for the
  machine's architecture. Otherwise there is no Linux bridge.
- The host decides this when it creates the window and passes the answer to
  preload, for example through `webPreferences.additionalArguments`. Preload
  reads no files.
- The Desktop renderer never falls back to Web Speech. Without a native bridge
  the composer shows no voice button.
- The Web deployment keeps its current Web Speech path.

**FR-D2 — Helper path (host).**

- On Linux, `resolveVoiceCaptureHelperPath` returns the active version's
  `entry`, or null when FR-B5 fails.
- `CATS_VOICE_CAPTURE_HELPER` still overrides the path for development and
  bypasses the pack checks.

**FR-D3 — Recording cap (host).** For `linux-stt` sessions, the clock starts at
`ready`, which matches the helper's 31-second overrun in FR-D6.

- After 25 seconds the host emits `limit_warning` with `secondsRemaining: 5`.
- After 30 seconds the host stops the session as if the owner had clicked stop.
- On every stop, whether from the owner or the cap, the host emits
  `processing`, then sends `stop` and starts the Linux stop window.
- `limit_warning` and `processing` are added to `VoiceCaptureEvent`. Only the
  host emits them.

**FR-D4 — Timeouts (host).**

- Linux's ready timeout and stop window come from ADR-154 D4's measurement. Each
  is at least twice the worst measured run, and never below 3 and 60 seconds
  respectively.
- Until the measurement is recorded in the PLAN, the provisional values are 10
  seconds for ready and 60 seconds for stop.
- A helper that exceeds either is killed, and the session reports
  `engine_unavailable`.
- A helper that exits before `ready` reports `helper_crashed`, as today. A
  missing system library ends this way.

**FR-D5 — Composer states (renderer).**

- `limit_warning` shows "Recording stops in 5 s" beside the button.
- `processing` puts the button in a busy state until `final` or `end`. The
  button gets `aria-busy` and the label "Transcribing…". Escape cancels.
- `mode: "on-device"` shows no privacy badge, as on macOS.

**FR-D6 — Helper behavior (helper).** Producer tests and host contract tests
verify each point.

- **Preflight.** Before `ready`, the helper opens a recording stream on the
  default PulseAudio source. On failure it emits `mic_unavailable` and `end`.
- **Model.** The helper loads the model before `ready`. A load failure emits
  `engine_unavailable`.
- **Stop.** The helper buffers audio until `stop`.
  - It then releases the microphone at once and transcribes.
  - It emits one `final`, only when the text is non-empty, then `end`, and
    exits.
- **Cancel.** The helper discards the audio and emits `error: cancelled` and
  `end`.
- **Overrun.** Past 31 seconds of audio without `stop`, the helper emits
  `error: aborted` and `end`.
- **Network.** The helper opens no network connection.

**FR-D7 — Locale and script (helper).**

- **Locale.** The helper uses `--locale` when given. Otherwise it uses the
  first of `LC_ALL`, `LC_MESSAGES` and `LANG`, mapped to BCP 47. `ready.locale`
  reports the result.
- **Language.** The spoken language is detected from the audio. The locale
  chooses only the script.
- **Script.** When the detected language is Chinese, the helper converts the
  final text deterministically with OpenCC (Q1). The conversion data is pinned
  in the producer's source lock, and its license ships in the pack.

  | Locale | OpenCC configuration |
  |--------|----------------------|
  | `zh-TW` | `s2twp`: Taiwan characters and phrasing |
  | `zh-HK` | `s2hk` |
  | Any other `zh-Hant` | `s2t` |
  | `zh-CN`, `zh-SG`, any `zh-Hans` | `t2s` |
  | Any other locale | No conversion |

- **Other platforms.** The macOS and Windows helpers are unchanged.

**FR-D8 — Microphone permission (host).** This is carried over from SPEC-087
Req 13.

- The host's `setPermissionRequestHandler` rule is unchanged, and the renderer
  stays denied for `media`.
- The helper captures audio itself through the PulseAudio client library, never
  through Chromium's `getUserMedia`.

### E. Changes from SPEC-087

- **Packaging.** The owner downloads the pack in Settings (ADR-154 D6), instead
  of it being placed in installer `extraResources`. There is no
  `CATS_BUNDLE_WHISPER_PLATFORMS` build flag and no submodule.
- **Missing helper.** A missing or damaged helper reports `pack_required`
  (FR-C1) instead of `engine_unavailable` (SPEC-087 Req 11).
- **Locale.** `--locale` chooses the output script, and the spoken language is
  detected (FR-D7). In SPEC-087 Req 8 the locale biased the language. The
  reasons: Desktop's composer passes no locale, and the system locale is often
  not the spoken language.
- **Addition for review: the script rule.** FR-D7's Traditional/Simplified
  conversion is new scope beyond ADR-154.
- **Timeouts.** They come from ADR-154 D4's measurement (FR-D4) instead of a
  fixed 60-second stop window and the shared 3-second ready timeout.
- **Web Speech.** The Desktop renderer never uses it (FR-D1). SPEC-087 left the
  Linux bridge exposed even without a helper.
- **Compatibility.** glibc 2.35 or later on Linux x64 and arm64 `.deb`
  installs, instead of a list of distributions.
- **Kept.**
  - Helper behavior: Req 3–7 and 14–16, now FR-D6, FR-D3 and FR-D4.
  - The `limit_warning` and `processing` events.
  - The permission rule, now FR-D8.
  - `mode: "on-device"`.

### Non-Functional Requirements

- **Privacy.** Audio never leaves the machine. The pack download is the only
  network activity, and only the owner starts it, from Settings.
- **Integrity.**
  - Only lock-pinned bytes run.
  - A crash at any step leaves one of three states: the previous active
    version, `not_installed`, or a resumable partial download. It never leaves
    a half-activated pack.
- **Memory.** Downloading and installing do not buffer the archive. The
  helper's audio buffer stays near 1 MB (30 s of 16 kHz mono 16-bit audio).
- **Performance.** ADR-154 D4 sets the bar on a 4-core Cortex-A76-class board,
  as the median of five runs:
  - `ready` arrives within 2 s;
  - a 30-second utterance is transcribed within 30 s of stop.
- **Compatibility.**
  - Supported: glibc 2.35 or later, Linux x64 and arm64, and `libpulse.so.0`,
    including through PipeWire.
  - ALSA-only systems report `mic_unavailable`.
  - Supported installs are `.deb` packages. Packs live in the user's platform
    directory, not the install directory.
- **Accessibility.** Download progress in Settings is announced through an
  `aria-live` region. The composer toast's action is reachable by keyboard.

## Design Overview

```text
mic click (Linux Desktop)
  -> renderer: voice bridge start({ sessionId })
  -> host: FR-B5 check on the active linux-stt
       not usable -> error pack_required, end
                     -> renderer: toast + "Open Settings" (FR-C1)
                     -> Settings > Desktop > Optional downloads (FR-C2)
                     -> Download | Pause | Resume (FR-B3, Range requests)
                     -> verify / activate (FR-B4) -> row shows Installed
                     -> owner returns and clicks the mic again
       usable     -> spawn <active>/cats-stt-linux --session-id …
                     -> ready (on-device) -> owner speaks
                     -> 25 s: limit_warning | stop or 30 s: processing -> stop
                     -> final (script per locale) -> end
```

## Acceptance Criteria

- **AC-01 — Archive and manifest rejection.** Fixture packs with any of these
  defects are rejected with nothing activated:
  - a wrong archive hash or size;
  - an extra, missing or duplicate file;
  - a path traversal or a symbolic link;
  - a mismatched `id`, `arch` or `helperProtocol`;
  - a wrong file hash.
- **AC-02 — Download lifecycle.** Against an injected transport:
  - progress, pause, resume, cancel and discard work;
  - resume with a `206` continues the download;
  - resume with a `200` restarts it;
  - any other response pauses with reason `network`;
  - a lock change discards the partial download;
  - a partial download survives a restart as `paused` (`quit`);
  - an oversize body, a non-HTTPS redirect and insufficient space are refused;
  - a crash between each FR-B4 step leaves a state allowed by Integrity.
- **AC-03 — Removal and reset.**
  - Remove deletes only receipt paths.
  - Platform data reset leaves `feature-packs/` untouched, and the reset
    disclosure lists it.
- **AC-04 — Voice flow on Linux CI.** A scripted protocol-1 helper inside a
  fixture pack covers:
  - each FR-C1 toast, and **Open Settings** reaching the row with the draft
    intact;
  - no automatic start after installation;
  - `update_available` still dictating with the older version;
  - `limit_warning` and `processing` at 25 and 30 seconds on a fake clock;
  - owner stop, cancel and both timeouts.
- **AC-05 — Web Speech.** The Desktop renderer never constructs Web Speech. The
  Web deployment is unchanged.
- **AC-06 — Settings.**
  - Every FR-C2 status shows its actions.
  - Feedback is toast-only.
  - `en` and `zh-TW` strings exist for every new key.
- **AC-07 — Real pack (manual, recorded in the PLAN).** On x64 and on the arm64
  reference board:
  - the D4 gate passes with English and Mandarin fixtures;
  - Mandarin under `zh-TW` yields Traditional characters with Taiwan phrasing,
    and under `zh-CN` yields Simplified;
  - a download interrupted mid-way resumes from the cats-plugins release asset;
  - live microphone dictation works in an installed Desktop.

## Dependencies

- **The producer SPEC.** The cats-plugins producer SPEC, not yet written,
  builds `linux-stt` to FR-A2–FR-A4, FR-D6 and FR-D7, including the OpenCC data.
- **The first release.** The first authorized cats-plugins `linux-stt`
  release. Until it exists, Desktop ships an empty lock, so Linux shows no voice
  button (FR-D1). AC-01 to AC-06 use fixture packs.
- **Range requests.** The release asset host must honor them. Without them,
  FR-B3 restarts from zero, which is still correct.
- **Existing pieces.** Two existing pieces are reused:
  - fflate's streaming unzip, already a dependency;
  - Electron `net`, for Desktop's transport.
- **Cats Bot.** A Bot ADR that adopts §A and §D.

## Resolved Questions

The owner delegated Q1–Q5 on 2026-11-16.

- **Q1 — Traditional script: deterministic conversion.** Prompting the decoder
  with Traditional text does not guarantee the script. FR-D7 converts Chinese
  output with pinned OpenCC configurations, which also gives `zh-TW` its Taiwan
  phrasing.
- **Q2 — Advertise the download before the first click: no.** The voice button
  looks the same until it is clicked. The first click explains and leads to
  Settings (FR-C1), and Settings lists the pack at all times.
- **Q3 — Resume interrupted downloads: yes.** FR-B3 implements it with partial
  files and HTTP `Range` requests, as the owner asked, and the final SHA-256
  still decides.
- **Q4 — Final timeouts: settled by rule, not by choice.** FR-D4 derives them
  from the PLAN's recorded runs. No further owner decision is needed.
- **Q5 — Keep using the older version during an update: yes, within limits.**
  - `update_available` keeps dictating with the verified active version, so a
    Desktop update does not break voice input. Settings offers **Update**.
  - The lock's `minUsableVersion` and a changed `helperProtocol` can stop the
    older version, for example after a security fix (`update_required`).

## References

- [ADR-154](../decisions/154-deliver-optional-native-dependencies-as-host-managed-feature-packs.md), [ADR-079](../decisions/079-use-platform-native-stt-with-linux-toast-fallback.md), [ADR-085](../decisions/085-bundle-whisper-cpp-on-linux-for-composer-voice-input.md), [ADR-135](../decisions/135-make-runtime-data-reset-explicit-and-preserve-installed-tools.md), [ADR-147](../decisions/147-send-the-owner-to-the-macos-system-settings-pane-a-permission-needs.md)
- [SPEC-084](SPEC-084-composer-voice-input-via-platform-native-stt.md), [SPEC-087](SPEC-087-linux-composer-voice-input-via-bundled-whisper-cpp.md), [SPEC-111](SPEC-111-packaged-desktop-update-surfaces-and-release-contract.md), [SPEC-134](SPEC-134-reusable-platform-packages-and-consumer-boundaries.md)
- [cats-plugins ADR-002](https://github.com/cats-inc/cats-plugins/blob/main/docs/decisions/002-produce-native-feature-packs-beside-plugin-content.md)
- [Bot ADR-018](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/018-dictate-through-native-speech-helpers.md)
- [OpenCC](https://github.com/BYVoid/OpenCC)

---

*Created: 2026-11-16*
*Related Plan: not yet written*
