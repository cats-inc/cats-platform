# PLAN-117: Alive Companion Life Loop

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented; real-bot and Desktop visual acceptance pending |
| **Owner** | Claude |
| **Reviewer** | Owner |

## Related Spec

[SPEC-124: Alive Companion Life Loop](../specs/SPEC-124-alive-companion-life-loop.md)

## Related Decision

[ADR-127: Keep Companion Cats Alive with a Platform-Owned Life Loop](../decisions/127-keep-companion-cats-alive-with-a-platform-owned-life-loop.md)

## Overview

Four PRs that can each be demonstrated on their own: first make "awake" real and give the Cat a rhythm, then let him speak up on his own, then add the on-duty experience for Telegram, and finally add photos.

## Phase 1: Truly Awake, with a Rhythm

- [x] The `CompanionBox.life` type, defaults filled in on read, and read/write in the in-memory and file stores.
- [x] `GET/PATCH /api/cats/:catId/companion-box/life` with validation.
- [x] `rhythm.ts`: a fixed wake-up time each day, awake/rest period checks, and the next wake-up time.
- [x] Extract the channel activation / deactivate body from the REST handler so REST and the loop share it.
- [x] Life loop: desired state, session confirmation by runtime observation, waking, sleeping after idle, and backoff at the cap.
- [x] `presence_changed` activity entries (waking, sleeping, owner actions, unable to wake).
- [x] The owner's activation / deactivate on a companion Cat's DM lane updates `sleepUntil`.
- [x] The production entry point starts the loop; the test `createServer` does not start it by default.
- [x] Tests: old files read with defaults filled in, rhythm boundaries (including across midnight), a fixed wake-up time within a day, the loop writing no state when the session
  is already alive, automatically waking back up after a runtime restart, backing off at the cap and recording only once, sleeping after idle in the rest period,
  and the loop not waking the Cat after the owner put him to sleep.

**Exit**: within one minute of a runtime restart, the companion Cat's DM session automatically returns to ready; after bedtime, the session is released after
15 minutes of idle; the activity log shows waking and sleeping.

## Phase 2: Heartbeat

- [x] An in-process gate keyed by runtime session; `executeDispatch` waits on it before sending.
- [x] Heartbeat scheduling (in memory, random interval, a `wake` heartbeat after waking, deferral conditions, no repeated good-morning after a restart).
- [x] The heartbeat prompt (local time, how long he has been awake, when the owner last spoke, companion memory) and the `[quiet]` decision.
- [x] The reply is written to the lane as that Cat's ordinary message (`senderKind: 'agent'`, origin `runtime`), but the event is
  `companion_heartbeat` rather than `assistant_turn_segment`, so the live indicator does not treat it as a reply to an owner
  message; it emits `message_added`, and fanout delivers it to Telegram once.
- [x] A `bedtime` heartbeat before sleeping.
- [x] Tests: quiet writes nothing, speaking up writes and mirrors to Telegram, an owner message waits while a heartbeat is in progress, rescheduling when the runtime is busy,
  no repeated good-morning after a restart, and no interjecting while a chat is in progress.

**Exit**: during awake hours he speaks up on his own in the same conversation, and Telegram receives it.

## Phase 3: Telegram On Duty

- [x] On an incoming DM, send `typing` immediately and resend every 4 seconds before the reply; it uses a separate `sendChatAction`, produces no delivery
  receipt, and does not update `lastOutboundMessageId`.
- [x] The `/sleep` and `/wake` commands share the owner's intent with the Desktop buttons (`setCatDirectLanePresence`).
- [x] Polling consumers rebuilt by binding changes and manual reconnects carry the transport commands (reconnecting also restores the `/work`
  golden path).

## Phase 4: Photos

- [x] `life.photoFolder` and the "Rhythm and Album" card in companion settings (which also covers bedtime and the wake-up window).
- [x] The heartbeat lists candidate file names (at most 6, ≤ 10 MB each), parses `[photo: filename]`, and accepts only listed file names.
- [x] Telegram multipart `sendPhoto`; fanout sends the image for messages that carry a photo, with the text as the caption; the photo is also copied to the
  lane attachment folder so Desktop can show it.

## Phase 5: The Cat Browses the Album Himself (ADR-127 §5)

- [x] The companion context (`CompanionSessionContext.photoAlbum`) carries the album path; `formatCompanionContext`
  explains the album, the read-only convention and `[photo: path]` only to the companion Cat. The heartbeat becomes a one-line nudge and no longer picks candidate file names.
- [x] `resolveCompanionAlbumPhoto`: a relative or absolute path that, after `realpath`, must be inside the album; when the case does not match,
  it matches within the same folder.
- [x] Ordinary replies: `executeDispatch` handles `[photo: …]` after the turn ends (`applyCompanionPhotoDirective`),
  and `results.ts` stamps `transportMedia` onto the last segment; the Telegram bridge sends the photo directly for replies that carry one.
- [x] The attachment copy (`channelAttachments.ts`) moves from `api/` to `state/` so the dispatch flow can use it too.
- [x] Photos arriving from Telegram are downloaded into the room attachment folder so the Cat can see them (SPEC-124 FR-33).

## Follow-ups (not in this plan)

- The full golden path for proactively generating images to Telegram is in
  [PLAN-121](PLAN-121-shared-image-service-and-controlled-cat-generation.md):
  the shared Platform service, limited Cat grants, Studio sharing and durable delivery; it is a planning document and
  is not yet implemented, and it does not change the acceptance status of this plan's existing album / text heartbeat.

- The companion posting-decision sidecar before a companion Cat's DM turn roughly doubles latency, which hurts the feel of being on duty;
  it could be changed to decide only when needed.
- The runtime returns 409 for concurrent messages to the same session, which an ordinary owner sending two messages in a row also hits.
- Every heartbeat photo is copied into the lane's `.cats-attachments/`, so the same photo accumulates as `x (1).png`,
  `x (2).png`; this could be changed to reuse an existing copy by content hash.
- When the album is large, the Cat has to browse it himself every time; he could leave notes on photos he has seen, or the platform could provide a "recently sent" list.
- While Desktop streams a reply, the `[photo: …]` line may appear briefly before the turn finishes and is removed only afterwards.

## Progress Log

- 2026-10-26: Fixed conversation continuity for DM wake-ups and proactive turns.
  - Desktop 0.10.1 read-only check on a real machine: a new Runtime created at 07:48 sent an English greeting at 09:59; the first
    hidden prompt contained only an English time / greeting instruction and a mixed expression, with none of the earlier Chinese conversation.
    Hydration was `fresh_start` / `none`; the product DM transcript was not lost.
  - Going to sleep no longer clears the DM session id; waking uses the existing native resume; a retarget prefers replacing the execution, and
    if resume fails the attachment and the error are kept. Ordinary room deactivate keeps its semantics.
    Also fixed the equivalence check between model-only and Runtime explicit selection, and when a closed lease
    lacks an old-version selection, it is recovered from Runtime observation; an old attachment with no selected model is not misjudged as a retarget.
  - The heartbeat shares the ordinary Cat turn's role / language / checkpoint and memory-aware envelope, and sends in
    the same DM's bounded continuity instructions. Short history is sent verbatim, long history reuses the existing digest within 12,000 characters,
    and an unspecified language follows what the owner speaks. This also rescues Runtimes that an older version had opened but failed to carry over.
  - Layered memory used to be placed only in hydration metadata; the shared prompt formatter now presents the filtered
    facts, owner hints and open loops, limited in count and to 280 characters each, and does not present excluded records.
    A hydration failure no longer swallows the error and goes on to send a greeting with empty context.
  - The first 5 regression cases all failed on the old code. In the end, the 9 related files with 149 tests pass, and the candidate compiled output also
    passes 149; architecture boundaries 101, selection/continuity 38 and the Runtime native wake/close contract
    33 pass. The server build and the test TypeScript check pass. The first local routing fixture waited because the
    default attachment path was blocked by the sandbox; I stopped that test and reran it with a private `CATS_RUNTIME_DIR`, and it passed;
    permissions were not raised to let that fixture write into the user profile. The image fanout fixture was given a real active lease.
  - The final isolated Desktop candidate completed the Runtime/server/host/renderer builds and the first-run screen was inspected,
    with a normal drain (exit 0). Platform source digest
    `4337f4414b5c56347197889b62d23f61af5bc381ae02f832e05cf4fe12f54b7e`, Runtime `5212fa59`;
    the four production fix files match the working tree by SHA-256. Starting the UI is not counted as functional acceptance.
  - The same candidate compiled output was also run through 3 real turns on an isolated Codex `gpt-6.1-sol`: remember a random passphrase,
    answer it correctly after a production sleep/wake in a request that did not resend the passphrase, with the Runtime/provider session id
    staying the same; then explicitly switch to a new Runtime, and the first proactive turn mentioned, in Chinese, the same DM's 「虹石灣」 ("Rainbow Stone Bay")
    and the companion memory's 「桂花烏龍茶」 ("osmanthus oolong tea"). The old model-only check did cause the first live probe to rebuild;
    it passed after the fix; the final private evidence is in the workspace parent `.dm-continuity-live-20261026-6/report.json`.
    The probe's own Runtime has been stopped and the copied login deleted. Nothing was written to `將將` and no Telegram message was sent;
    I have not claimed that the installed build is updated, nor that high-level long-conversation condensation or lossless recall is done. No version bump this time.
  - All 5 failures in PR #321's first full CI were downstream fixtures / assertions: an explicit retarget no longer resumes the
    old provider first, the Telegram duty stub gained resume, and the diagnostic attachment stub takes its path from the current owner message
    (the channel checkpoint may contain a single-lined old attachment fragment). The 3 related files with 18 tests pass locally, and
    2 JS files with 8 tests also pass on the candidate compiled output; production source is unchanged.
    I also restarted the whole private Runtime process with the same candidate; the native ID and the recall without a resent passphrase still passed,
    evidence `.dm-continuity-live-20261026-7/report.json`; the probe's own services and temporary logins were all cleaned up.

- 2026-10-26: Fixed the first proactive turn waiting forever on a new native CLI session.
  - On real-machine Desktop 0.10.0, after a companion Cat's session was created automatically at 08:53 on 10/25, the lease stayed
    `initializing` and the Runtime message count for the whole day was 0; it was closed by the rhythm only at 23:00. The old loop skipped
    every `initializing` lease directly, neither observing nor sending the first turn. Simulating 09:00–22:59 in memory from a read-only snapshot taken then,
    all 840 ticks stayed at `waking`; the real profile was not modified and no verification message was sent.
  - An `initializing` lease that already has a session id is now checked for liveness and gets heartbeats scheduled just like `ready`; after the first success
    (including quiet), only an initializing lease still pointing at the same session is advanced to ready.
    A wake with no session id waits at most 5 minutes, then reuses activation/backoff; it does not interfere with a turn the owner
    still has in progress. After a process restart, the wait and heartbeat timers are rescheduled, and the persisted format is unchanged.
  - Each heartbeat records its kind and spoke/quiet/busy/failed, making it easy to tell the model choosing quiet apart from an
    execution failure; it does not record the prompt, the reply or credentials.
  - Verification: the 9 regression cases added at first all failed on the old code and pass after the fix; later I added recovery from initialization after the file
    store is rebuilt, the real activation body, the first hidden turn, state advance after quiet, Telegram fanout delivering exactly once,
    and the session replace / close race. On the candidate compiled output, 4 related files with 72 tests pass; another 4 files for boundaries / Telegram / lease attachment pass 108.
    The server build and the test TypeScript check pass (the worktree used the existing Platform/mobile dependencies).
  - The isolated Desktop candidate was built from Platform `a36a0c52` plus this fix and Runtime `5212fa59`;
    the Runtime, server, host and renderer builds pass, and after the first-setup screen was inspected it drained normally (exit 0).
    The SHA-256 of the two fixed sources in the candidate matches the working tree. This is fixture and candidate-source verification,
    not yet a daytime, long-running real provider / Telegram acceptance on the installed build; this fix does not bump the version.
  - As an extra spot check, the existing `chat-session-lease-projection`, run alone on Windows, reports
    `missing core session session-1`; the unmodified mainline reproduces the same failure, and this change does not touch that scope.

- 2026-09-29: ADR-127, SPEC-124 and PLAN-117 created; Phase 1 started.
- 2026-09-29: Phase 1 completed.
  - Also fixed an existing risk in `FileCompanionBoxStore`: writes were not atomic, and on any read error
    (including reading a half-written file) it overwrote the whole companion data with an empty one. The loop reads once a minute, which amplifies
    this risk, so it now writes a temp file and renames it, and creates a new file only when the file does not exist; on a corrupt format it reports the error and
    keeps the original file.
  - The activity log's render entry now carries the latest event's `metadata`, and the renderer shows `presence_changed` with
    localized text.
  - Verification: `tests/companion-life.test.js` (19), `companion-box-store`, `companion-box-routes`,
    `channel-deactivate`, `config`, `architecture-boundaries` and others, 13 server test files with 286 tests in total, pass;
    10 renderer-related test files with 43 tests pass. The "file-backed restart" in `provider-telegram-routes`
    failed once in a combined run and passed on rerun (see the Phase 2 entry for the cause).
  - Not yet verified: the real-machine Desktop screens (activity log text, the status card updating after the loop wakes him).
  - Confirmed that all three Desktop entry points for putting him to sleep (the profile page, the DM toolbar, `useDirectLaneCompanionMode`) go through
    `POST /api/channels/:id/deactivate`, so all of them write `sleepUntil`; entering a DM does not call
    activation automatically. If you press sleep once during awake hours, he sleeps until the next wake-up time; during that time, if the owner sends a message he still wakes up to
    reply, and goes back to sleep after 15 minutes of idle.
  - Known trade-off: a session stuck in `initializing` for more than 15 minutes in the rest period with a quiet lane is also closed.
- 2026-09-29: Phase 1 merged as #186 (`7e2efe17`). Phase 2 completed.
  - When the Telegram bridge picks a reply, it skips `companion_heartbeat` messages: when the owner's turn failed and only a
    heartbeat message was left on the lane, it used to be treated as the reply and sent again (fanout had already sent it).
  - The "file-backed restart" in `provider-telegram-routes` is an existing flaky test: running alone 10 times each, it failed 1 time before
    Phase 1 (`19b52694`), 2 times on main after Phase 1 (`7e2efe17`), and 2 times on the Phase 2
    branch. Every failure was a 4-second timeout in `waitForTelegramLinkedRoom` (a success takes about 1.1 seconds),
    with a bimodal distribution that looks like a write race rather than slowness; the companion file store is not read or written at all in that test. The difference is
    within sampling error and is tracked separately.
  - Verification: `companion-heartbeat` (11), `transport-fanout` (6, including the heartbeat delivered to Telegram once),
    `telegram-work-delivery-bridge` (11, including a heartbeat not being treated as a reply) and others, 12 server files with 248 tests,
    35 `provider-telegram-routes` tests and 21 tests in 4 bundled files pass.
  - Not yet verified: how heartbeat messages look in a real-machine Desktop DM, and a real Telegram bot.
- 2026-09-29: Phase 2 merged as #187 (`015acac1`). Phase 3 completed.
  - Fixed the change check for "waking": channel activation also reports `started` for an already-alive session, which would have made the
    Desktop wake button log an extra "woken by you" entry when he was already awake, and `/wake` would also reply "woke up". It now looks at whether the
    lead lease was already `ready` before the wake (`activateChannelLocked` returns `leadWasReady`).
  - Verification: `companion-telegram-duty` (3), `telegram-commands-i18n`, `telegram-work-delivery-bridge`
    (12, including typing being sent before the turn starts and producing no receipt), `architecture-boundaries`,
    `provider-telegram-routes` and others, 15 server files with 236 tests and 5 bundled files with 55 tests pass.
  - Not yet verified: typing and `/sleep` `/wake` on a real Telegram bot.
- 2026-09-29: Phase 3 merged as #188 (`4ef1386f`). Phase 4 completed.
  - Verification: `companion-photos` (5, including the bytes actually uploaded via multipart), `transport-fanout` (8, including a heartbeat photo
    shown as an attachment on Desktop, a photo with a caption received on Telegram, and long text sent as image first and text after), `companion-life`
    (20, including the album folder having to exist), `companion-life-card`, 12 server files with 224 tests and 8 bundled files pass.
  - Not yet verified: a real Telegram bot, and the actual screens of the "Rhythm and Album" card and DM photos on Desktop.
- 2026-09-29: Phase 4 merged as #189 (`d96ea611`). Tracked down the flaky "file-backed
  restart" test in `provider-telegram-routes` and confirmed it was a product bug: `FileChatStore` reads only waited and did not hold the write lock, yet wrote back to the file
  during a read (the initial-setup completion time fix, ADR-124's companion conversion, backup restore, creating the default file). If this write-back
  landed after a concurrent save, it overwrote the just-saved data with the old version (in the test, what got overwritten was the Telegram bot name).
  Fixed so a read is read-only; when a write-back is needed, it re-reads and then writes inside the same write lock. After the fix, that test run alone 20 times in a row all passed
  (about 15% failed before the fix).
- 2026-09-29: The read fix merged as #193 (`8a1e94f0`). The owner pointed out that "the platform picks 6 file names" differs from his idea:
  once a folder is designated, the Cat should be able to access any file under it on his own. Phase 5 completed (ADR-127 §5, SPEC-124 FR-29–FR-32).
  - The test harness's fake runtime used to fix each session's working directory at the same path under the system temp folder,
    so attachments lingered across runs and made file names become `sunset-3.png`; it now sits in each harness's own temp folder,
    with `runtimeDataDir` set, to keep attachment copies from landing in the real `~/.cats/runtime/data`.
  - Verification: `companion-photos` (8, including `../`, an absolute path outside the album, a junction pointing outside the album, and over 10 MB),
    `companion-heartbeat` (12, including an ordinary reply sending a photo from a subfolder, a path outside the album not being sent, and the nudge containing the album path),
    `telegram-work-delivery-bridge` (a reply coming in on Telegram sends the photo directly), `transport-fanout` and others,
    26 server files with 384 tests and 173 bundled tests pass; the `tsc` server, desktop, root and test projects pass
    (mobile was not checked because the workspace has no mobile dependencies installed).
  - Not yet verified: whether a real provider (Claude, Codex) follows the nudge to browse the album and open images; a real Telegram bot.
- 2026-09-29: Phase 5 album merged as #206 (`ac33f5d3`). Photos arriving from Telegram (FR-33) completed.
  - The platform's Telegram HTTP layer used to parse every response as UTF-8 text, which broke binary downloads; it now keeps the raw bytes
    and provides `arrayBuffer()`.
  - Downloading is best effort: the relay's `downloadFile` failure always returns null, and the bridge falls back to the original attachment marker.
    Storage is handled by the room bridge's optional `storeInboundAttachments`; the platform does not depend directly on chat's attachment module.
  - Verification: `telegram-inbound-photos` (4, including non-UTF-8 bytes kept intact, no download when over the limit, saving into the room attachment folder),
    `telegram-work-delivery-bridge` (15, including a photo handed to the Cat as an attachment block and a download failure keeping the marker),
    `provider-telegram-routes`, `telegram-*`, `dependency-graph`, `architecture-boundaries` and others,
    19 server files with 233 tests and 64 bundled Telegram tests pass; the `tsc` server, desktop and root projects pass.
  - Not yet verified: a real Telegram bot sending a photo, and the Cat actually opening the photo.
- 2026-09-30: Telegram photos merged as #208 (`206e2488`). Removed the room note before Telegram replies: every reply used to
  start with `Continuing room "…" in Cats Chat.`, and photo captions carried it too. Now `Opened room "…"` is added only when a group bot opens a new room;
  the Cat's own bot (DM lane) sends only what he says, with nothing added to the first message either.
  - Verification: `telegram-work-delivery-bridge` (17, including a DM lane in progress and the first message both having only the Cat's words, and photo captions
    having only the reply text), `provider-telegram-routes` (a group opening a new room still has `Opened room`) and others, 8 server files with 181 tests and
    66 bundled Telegram tests pass; the `tsc` server and test projects pass (mobile dependencies not installed).
