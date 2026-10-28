# SPEC-124: Alive Companion Life Loop

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented (owner approved 2026-09-29); real-bot and Desktop visual acceptance pending |
| **Owner** | Claude |
| **Reviewer** | Owner |

## Summary

Once Telegram is bound, a companion Cat should behave like a living cat: stay awake during
waking hours (the session is warm, and replies feel like being on duty), occasionally say
something or send a photo to the owner by himself within the same conversation, go to sleep at
night and wake by himself in the morning. For the decision see
[ADR-127](../decisions/127-keep-companion-cats-alive-with-a-platform-owned-life-loop.md).

## Proposed controlled image generation

[SPEC-128](SPEC-128-shared-image-service-and-controlled-cat-generation.md) and
[PLAN-121](../plans/PLAN-121-shared-image-service-and-controlled-cat-generation.md)
add the complete golden path defined by the owner: the heartbeat may request image generation
under limited pre-authorization, and after saving, the image is attached to the same DM and
delivered to Telegram by a durable intent. This part is not yet implemented; the album picture
sending and text heartbeat in this SPEC do not imply image-generation authorization. Studio
installation and Boss Cat identity are not prerequisites for the new capability.

## Goals

- During waking hours, the companion Cat's DM session is really alive; after a runtime restart
  or the session being closed, he wakes back up automatically.
- During rest hours the session is released; when the owner sends a message he wakes as usual
  to reply, then goes back to sleep.
- While awake, he occasionally speaks first within the same session, and most of the time
  chooses to stay quiet.
- When the owner puts him to sleep or wakes him from Desktop or Telegram, the life loop
  respects that intent.

## Non-Goals

- No OS-level background launch; when Cats is not open he neither wakes nor speaks.
- No change to the SPEC-094 schedule rules, and the heartbeat does not go through mission/run.
- No time zone setting; rhythm is computed in the host's local time.
- No quota or preemption for the session limit; when full, back off and retry.
- Phases 1–3 do no images; images are in Phase 4.
- No local image-viewing or image-generation model; whether photos can be understood depends
  on the companion Cat's provider.
- Album read-only is not enforced; that needs runtime support for read-only access.

## Definitions

- **Companion Cat**: a Cat with `status: 'active'` and `roles` containing `'companion'`
  (ADR-124).
- **DM lane**: a channel with `status: 'active'`, `roomRouting.mode === 'direct_message'` and
  `roomRouting.defaultRecipientId` equal to that Cat id. When several match, the most recently
  updated one is taken.
- **lease**: the `execution.lease` of that Cat participant on the lane.
- **Session alive**: the lease has a session id attached, its state is `ready` or
  `initializing`, and runtime `observeSession` has not reported a closed state that can be
  revived. A native CLI may leave `initializing` only at the first turn; the proactive
  heartbeat may be that first turn. When runtime cannot be reached it is "unknown".

## Requirements

### Life profile (`CompanionBox.life`)

1. FR-1: The `life` field:
   - `enabled: boolean`, default `true`.
   - `bedtime: 'HH:MM'`, default `'23:00'`.
   - `wakeWindowStart: 'HH:MM'`, default `'07:00'`.
   - `wakeWindowEnd: 'HH:MM'`, default `'09:00'`.
   - `sleepUntil: string | null` (ISO time), set when the owner puts him to sleep, default
     `null`.
   - `updatedAt: string`.
2. FR-2: When reading, if `life` is missing or a field is invalid, apply the default per
   field; existing files are not rewritten.
3. FR-3: `GET/PATCH /api/cats/:catId/companion-box/life` reads and writes `enabled`,
   `bedtime`, `wakeWindowStart`, `wakeWindowEnd`. Times must be `HH:MM`; `wakeWindowEnd` must
   not be earlier than `wakeWindowStart`; `bedtime` must not fall inside the wake window.
   Violations return `400`. `sleepUntil` is written only by the wake/sleep actions.

### Rhythm

4. FR-4: Each day's wake-up time `W(d)` = `wakeWindowStart` + a minute offset (falling within
   the wake window) hashed from `catId` and the local date `d`. A restart on the same day does
   not redraw.
5. FR-5: With local minutes `m`, `w = W(today)`, `b = bedtime`:
   - `b > w`: `w <= m < b` is waking hours, the rest is rest hours.
   - `b <= w` (bedtime crosses midnight): `m >= w` or `m < b` is waking hours.
6. FR-6: The next wake-up time = today's `W` if it has not yet arrived, otherwise tomorrow's
   `W`.

### Desired state

7. FR-7: When `life.enabled === false` the loop ignores this Cat entirely.
8. FR-8: `sleepUntil` in the future -> should be asleep (reason `owner`); rest hours -> should
   be asleep (reason `rest`); otherwise should be awake. A `sleepUntil` in the past is treated
   as `null`.

### Life loop

9. FR-9: The first check happens about 5 seconds after the platform starts, then every 60
   seconds; only one round runs at a time.
10. FR-10: When he should be awake:
    - lease is `ready`, or `initializing` with a session id attached: confirm with
      `observeSession`; if the session is alive, keep it and enter heartbeat scheduling,
      without requiring the owner to send a message first.
    - `initializing` with no session id yet: wait at most 5 minutes; while an owner turn is
      still being processed, keep its wake right. With no owner turn and after the timeout, go
      through the existing channel activation and failure backoff; this wait timer is
      recomputed after a restart.
    - Any other lease, or the session closed: wake through the channel activation path.
      DM sleep keeps the session id and, when the execution target is compatible, resumes
      natively; on failure the attachment is kept and the error reported, without silent
      rebuild. An explicit retarget choice takes priority over resuming the old session.
    - runtime unreachable: do nothing.
11. FR-11: When waking fails, back off 5 minutes. When the error message matches
    `Max sessions (N) reached` the reason is `no_capacity`, otherwise `wake_failed`. The same
    stretch of failure records only one activity entry.
12. FR-12: When he should be asleep and the lease is `ready` or `initializing`: if the lane's
    last message is within 15 minutes, wait; otherwise go through the channel deactivate path
    to put him to sleep. The DM lease keeps the original session id for resume on waking, and
    the worker and capacity are still released; the deactivate behavior of ordinary
    multi-person rooms is unchanged.
13. FR-13: On a successful wake or sleep, write one `presence_changed` activity entry, whose
    `metadata` contains `presence` (`awake` / `sleeping`) and `reason` (`rhythm`,
    `keep_alive`, `rest`, `owner`, `idle`, `no_capacity`, `wake_failed`). Nothing is written
    when the session was already alive.
14. FR-14: Every state write by the loop happens inside that channel's mutation gate and emits
    the same room update events as REST activation / deactivate, so the Desktop status card
    updates immediately.

### Owner intent

15. FR-15: When `POST /api/channels/:id/deactivate` acts on a companion Cat's DM lane and
    `life.enabled`, set `life.sleepUntil` = the next wake-up time, and record
    `presence_changed` (`owner`).
16. FR-16: `POST /api/channels/:id/activations` acting on a companion Cat's DM lane clears
    `life.sleepUntil`, and records `presence_changed` (`owner`) when he actually wakes.
17. FR-17: When the owner sends a message during rest hours or during `sleepUntil`, the
    existing delayed wake is kept; afterwards FR-12 puts him back to sleep (reason `idle`).

### Heartbeat (Phase 2)

18. FR-18: Heartbeats are scheduled only when "should be awake, session alive, waking hours".
    The interval is random between 30 and 120 minutes, held in memory, and redrawn after a
    restart.
19. FR-19: The first heartbeat after waking falls within 2–10 minutes and is of type `wake`;
    but if the lane already has a `wake` heartbeat message after today's `W(d)`, or more than
    3 hours have passed since `W(d)`, it becomes an ordinary heartbeat, so a restart does not
    repeat the good-morning.
20. FR-20: When the lane's last message is within 10 minutes, defer to 10 minutes after that
    message and redraw an ordinary heartbeat (no good-morning when already chatting); when the
    session is processing a message, defer 4 minutes.
21. FR-21: The heartbeat turn is sent into the same session, containing the local time, how
    long he has been awake, how long ago the owner last spoke, the conversation handoff pack
    of the same DM, the shared role and Cat/channel checkpoint, the reply language and the
    companion memory, and requires replying only `[quiet]` when he does not want to speak.
    When no language is specified, the owner's conversation language is followed, not the
    language of the hidden prompt. The handoff pack keeps the 12,000-character limit and the
    long-conversation digest of SPEC-069, and does not read other channels or concatenate the
    underlying sessions one by one. The retrieved memory presents only filtered facts, owner
    hints and open loops, with a limited count and per-item length; raw/excluded records are
    not handed directly to the model. A memory hydration failure is reported as failed and
    backs off, and does not degrade to a greeting lacking context. This does not mean
    high-level summarization / full long-term recall is complete.
22. FR-22: A reply of `[quiet]` (ignoring case and surrounding whitespace) is discarded;
    otherwise it is written to the lane as an ordinary message of that Cat (origin `runtime`,
    metadata `companionHeartbeat`), and `message_added` is emitted, mirrored to Telegram by
    the transport fanout. A successful heartbeat (including `[quiet]`) updates the same
    `initializing` lease to `ready` inside the mutation gate; it does not overwrite a closed
    or replaced session. The background record contains each heartbeat's kind and its
    spoke/quiet/busy/failed outcome, without conversation content.
23. FR-23: The heartbeat holds an in-process gate keyed by runtime session; ordinary dispatch
    waits on that gate before sending. If the heartbeat itself meets runtime busy (409), it
    gives up directly and retries the same heartbeat 4 minutes later. The event of a heartbeat
    message is `companion_heartbeat`, not `assistant_turn_segment`, so it is not treated as a
    reply to an owner message.
24. FR-24: Before going to sleep because of rest hours, one `bedtime` heartbeat may be sent to
    let him say good night, with the same rules as FR-21–22.

### Telegram on duty (Phase 3)

25. FR-25: When a Telegram DM arrives, send a `typing` chat action immediately, renewed every
    4 seconds before the reply is sent.
26. FR-26: Add the `/sleep` and `/wake` commands, acting on the companion Cat bound to that
    bot, with the same behavior as FR-15 and FR-16.
27. FR-27: The polling consumer rebuilt after a binding change or reconnect must also carry
    the transport commands.

### Photos (Phase 4)

28. FR-28: `life.photoFolder: string | null`, a local folder the owner fills in the companion
    settings.
29. FR-29: The album folder is this companion Cat's album. The companion context of every turn
    tells him the album path, that he may browse and open photos at any time with his own
    tools, that he may look but not modify, and how to send a photo. The heartbeat lists no
    candidate filenames and only mentions, in awake heartbeats (not bedtime), "attach an album
    photo if appropriate".
30. FR-30: In his reply he indicates a photo to attach with a line of its own,
    `[photo: <path relative to the album>]`, and that line is always removed from the message.
    Only files that, after link resolution, are still inside the album, have the extension
    jpg, jpeg, png, gif or webp, and are ≤ 10 MB are sent; when the extension case does not
    match, match by case-insensitive filename within the same folder. On sending, the photo is
    copied to the lane's attachment folder and Desktop shows it with the existing attachment
    block; `transportMedia` in the message metadata points to the original file, and Telegram
    uploads it with multipart `sendPhoto` using the text as the caption; when the text exceeds
    1024 characters, the image is sent first and then the text.
31. FR-31: The "Daily rhythm and photos" card (「作息與相簿」) of the companion settings page
    can adjust whether it is enabled, bedtime, the wake window and the album folder.
32. FR-32: Ordinary replies can also attach photos, not limited to heartbeats. The last text
    segment of the reply carries the attachment block and `transportMedia`; for a message
    arriving from Telegram the bridge sends the photo directly, and for other sources the
    transport fanout sends it. A photo that does not satisfy FR-30 is not sent; if only that
    line is left in the reply, the original text is kept, and is not replaced by the default
    sentence for "no text output".
33. FR-33: A photo the owner sends from Telegram (including an image sent as a file) is
    downloaded with the Bot API `getFile` and stored in that room's attachment folder; the
    message records the path with the same attachment block as a Desktop upload, the Cat opens
    it to look with his own tools, and Desktop also shows it as an attachment. When it exceeds
    20 MB (the Bot API download limit) or the download fails, the message keeps the original
    `Attachments: photo` label. It applies to all Telegram rooms, not only companion Cats.

### Non-Functional Requirements

- **Cost**: each heartbeat is one provider turn; at the default intervals, each awake
  companion Cat runs about 8–30 per day.
- **Capacity**: each awake companion Cat occupies one runtime session slot (default limit 10).
- **State hygiene**: life loop tests use only an in-memory store and a fake runtime client.

## Design Overview

- `src/products/chat/companion/life/`: `rhythm.ts` (pure functions), `loop.ts` (checks and
  actions), `presence.ts` (owner intent and activity records).
- `src/products/chat/api/resources/channelActivation.ts`: the activation / deactivate body
  extracted from the REST handler, shared by REST and the loop.
- `src/app/server/index.ts` is only responsible for starting when `chat.startCompanionLifeLoop`
  is true and stopping on shutdown.

## Open Questions

- Whether the heartbeat interval and the wake window should be opened for adjustment in the
  settings page (Phase 1 opens only the rhythm times).
- When woken during rest hours to reply, whether the prompt should tell him he was "just woken
  up".
