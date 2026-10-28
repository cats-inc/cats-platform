# ADR-127: Keep Companion Cats Alive with a Platform-Owned Life Loop

## Status

Accepted, 2026-09-29. In conversation the owner agreed to the direction and the phasing
(first "really awake" and the heartbeat, with sleep using autonomous rhythm option A; the
source of the good-morning picture is the album folder set in the companion settings). Revised
the same day: the album is now browsed by the Cat itself (§5).
The spec is [SPEC-124](../specs/SPEC-124-alive-companion-life-loop.md) and the
implementation is [PLAN-117](../plans/PLAN-117-alive-companion-life-loop.md); all four Phases
are implemented, and the real Telegram bot and the Desktop screens are still awaiting
acceptance.

## Context

What the owner wants is a companion Cat who "looks alive and also sleeps": after Telegram is
bound and the Cat is set as a companion, besides replying he stays awake all the time
(unless the session limit is full), occasionally says something on his own or sends a
good-morning picture; when it is time to rest he goes to sleep, and after waking continues the
same conversation. The owner explicitly ruled out the approach of "wake up when the scheduled
time comes, and sleep immediately after sending the message".

Current state (surveyed 2026-09-29):

- Being awake is only a persisted state on the lease (`ready`), and nothing maintains it.
  After a runtime restart all sessions become `closed`, yet the platform still shows awake,
  and only notices and revives it when the next message arrives (the stale-session recovery
  in `runtime-dispatch/wake.ts`).
- [ADR-015](015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md) defines Awake /
  Sleeping / Waking up and also announced idle auto-sleep, but nothing executes it; nobody
  enforces the idle time in `session-continuity/rules.ts`.
- No mechanism sends a turn into a Cat's session when there is no user message.
- The schedule rules of [ADR-090](090-adopt-generic-schedule-rules-for-mission-triggers.md)
  (SPEC-094) open a separate isolated Work session on each trigger (`sharingMode:
  'isolated'`), unrelated to the chat session; that is exactly the pattern the owner ruled
  out. ADR-090 §5 also deferred the heartbeat.
- Runtime has only the global limit `CATS_RUNTIME_MAX_SESSIONS` (default 10); when full it
  rejects new sessions outright, with no queueing and no eviction.

## Decision

### 1. The unit of being alive is "the one session on the Cat's DM lane"

- A companion Cat's life state is the lease of the Cat participant on his DM lane
  (`direct_message`, with `defaultRecipientId` being that Cat). Desktop DMs and Telegram DMs
  share the same lane (the Telegram bridge reuses it by `defaultRecipientId`), so both sides
  see the same Cat and the same memory.
- Speaking up proactively always happens inside this session, with no separate session. This
  is the fundamental difference from the SPEC-094 schedule.
- Going to sleep only closes the worker and releases capacity, keeping the session id of the
  DM lease. On waking, when the execution target is compatible, Runtime resume reattaches the
  same provider-native session; if resume fails, the original attachment is kept and an error
  is shown, and it must not be silently replaced by a blank session. Only an explicit reset or
  retarget changes it.
- 2026-10-26 correction: every proactive turn also carries the product conversation handoff
  pack of the same DM, together with the role, reply language, Cat/channel checkpoint and
  filtered companion memory shared with ordinary turns. This lets an explicitly replaced
  session, or a session created by an older version that missed the history, continue the same
  conversation. When no language is specified, the owner's conversation language is followed;
  the English of the hidden heartbeat prompt itself is not a language preference.
- The handoff pack keeps the 12,000-character limit of ADR-068 / SPEC-069: the original text
  for short conversations, and the existing digest plus recent content for long ones. The
  source read is the transcript of the same product conversation; it does not concatenate the
  raw history of the underlying sessions, and does not claim that this lossy digest has done
  high-level memory consolidation or lossless long-term recall. Native resume keeps the
  provider's existing context and compaction; durable cross-session memory is still owned by
  Cats.

### 2. A platform-owned life loop maintains rhythm and wakefulness

- A companion life loop is added inside the platform process (mounted the same way as the
  scheduler loop), checking the eligible companion Cats once a minute. The logic sits in the
  chat product tree, and `src/app/server` is only responsible for starting and stopping it.
- It is enabled explicitly by the owner's official entry (`src/index.ts`); the test
  `createServer` does not start it by default.
- The rhythm (`CompanionBox.life`) decides the desired state: awake during waking hours,
  asleep during rest hours; when the owner puts him to sleep (`sleepUntil`), he sleeps until
  the next wake-up time.
- When he should be awake but the session is absent (the lease is not `ready`, or runtime
  observes the session as closed), the existing channel activation path wakes him; when he
  should be asleep but the session is still there, after the lane is idle the existing
  deactivate path puts him to sleep.
- Waking and sleeping write `presence_changed` activity records (long defined in SPEC-085,
  but with no writer until now).
- When the limit is full (`Max sessions (N) reached`), other sessions are not evicted; it
  backs off and retries, and records the reason once.
- When runtime cannot be reached it is treated as "unknown", not as asleep, and no action is
  taken.

### 3. The owner's actions and the life loop share one intent source

- When Desktop's wake/sleep (the profile page and the DM toolbar both call `/activations`
  and `/deactivate`) acts on a companion Cat's DM lane, it also updates `life.sleepUntil`,
  which is the field the life loop reads. This avoids the owner just putting him to sleep
  and the loop waking him again a minute later.
- When the owner sends a message during rest hours, the existing delayed-wake reply is kept;
  after the conversation has stopped for a while, the loop lets him sleep again.

### 4. Heartbeat: let him decide in the same session whether to speak (SPEC-124 Phase 2)

- While awake and within waking hours, the loop sends a system turn that is not shown to the
  user into the same session at random intervals, telling him the current time, how long he
  has been awake, and how long ago the owner last spoke, and asks him to decide whether to
  talk to the owner; if he does not want to, he replies `[quiet]`, which the platform
  discards.
- When he has something to say, the content is written to the DM lane as an ordinary message
  of that Cat, and Telegram sends it out by the existing transport fanout mirror. It is a chat
  reply, not a scheduled task, so it does not go through the mission/run of ADR-090.
- The heartbeat holds an in-process gate keyed by runtime session; ordinary dispatch waits on
  the gate before sending, so the owner's message does not collide with the heartbeat and get
  a 409 from runtime.
- This decision overturns "heartbeat deferred" of
  [ADR-090](090-adopt-generic-schedule-rules-for-mission-triggers.md) §5 only within the scope
  of the companion Cat's life loop; the schedule rules themselves are unchanged.

### 5. The album is a folder the Cat browses himself; the platform only gates the files sent out (2026-09-29 revision)

- The album folder the owner sets is this Cat's album. The path is written into the companion
  context of every turn; the Cat uses his own provider CLI's tools to list the folder, open
  photos to look at, and choose himself; the platform no longer picks candidate filenames for
  him.
- To send a photo, he indicates it in his reply on a line of its own with `[photo: <path
  relative to the album>]`; this applies both to proactive speech and to ordinary replies
  (messages arriving from Desktop or Telegram).
- The platform sends only images from the album: it sends only if, after resolving links, the
  file is still inside the album, is an image and is ≤ 10 MB; otherwise nothing is sent, and
  that line does not appear in the message.
- "Look but do not modify" is a convention in the prompt, not enforced: the companion Cat's
  session runs with fully automatic permissions and can technically reach the whole computer.
  Enforcing read-only needs runtime support for read-only access, which does not exist
  currently.
- Whether photos can be understood depends on the provider: Claude's file-read tool and
  Codex's image-viewing tool can open images; other providers can at least choose by filename
  and date. A local vision model is out of scope, because users are not required to have a
  high-end graphics card.
- This replaces the earlier approach of "the platform randomly picks 6 filenames and the Cat
  can only choose from them without seeing the content": that left the Cat only passively
  ordering from a menu, which did not match the owner's idea that "after a folder is
  designated, the Cat can proactively access any file under it".

## Consequences

### Positive

- "Awake" becomes real: after a runtime restart or a session being closed, the companion Cat
  wakes back up by himself within a minute, and when the owner sends a message during waking
  hours the session is already warm.
- Sleep truly releases a runtime session slot.
- Proactive speech carries the full conversation context, because it happens in the same
  session.

### Negative

- Every awake companion Cat occupies a runtime session slot for a long time; Claude / Codex
  also keep a resident process.
- Even when the heartbeat ends up choosing `[quiet]`, it is a real provider turn and uses
  quota.
- Browsing the album and viewing photos are extra tool calls and tokens; photos are uploaded
  to that provider's cloud.
- When the computer is asleep or Cats is not open, he neither wakes nor speaks (the same
  limit as ADR-090 §5).
- Rhythm is computed in the host's local time.

### Neutral

- `CompanionBox` gains a `life` field; when reading an old file the missing field gets the
  default value, so existing data need not be rewritten. An older version reading a new file
  ignores the field (acceptable under the pre-release policy).
- The presence state machine used for display (awake / waking_up / sleeping / error) is
  unchanged.

## Alternatives Considered

### Alternative 1: Use SPEC-094 schedule rules for good morning and proactive messages

- **Pros**: already implemented, with idempotency and misfire handling.
- **Cons**: each trigger is an isolated new session with no conversation context; it ends when
  the trigger finishes; it cannot currently be delivered to Telegram.
- **Why rejected**: it is exactly the "wake up, send, go back to sleep" that the owner
  explicitly ruled out.

### Alternative 2: Hand it to the wakeup service of cats-runtime

- **Pros**: runtime already has a 1-second tick and cron recurrence.
- **Cons**: runtime SPEC-012 is explicitly not a heartbeat system; it only revives workers and
  sends no messages; rhythm, companion Cat identity and the Telegram binding are all platform
  product state.
- **Why rejected**: product judgment should stay in the platform, keeping runtime generic.

### Alternative 3: Wake only when the owner sends a message (keep the status quo)

- **Pros**: occupies no session slot and uses no quota.
- **Cons**: never speaks first, and is not "alive"; the awake state still lies after a
  restart.
- **Why rejected**: does not meet the requirement.

## References

- [ADR-015](015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-040](040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md)
- [ADR-090](090-adopt-generic-schedule-rules-for-mission-triggers.md) §5
- [ADR-124](124-model-companion-as-a-cat-role-not-a-skill-profile.md)
- [SPEC-036](../specs/SPEC-036-companion-workspace-presence-and-settings.md) §21–22
- [SPEC-085](../specs/SPEC-085-companion-profile-feed-and-library-ia.md) (`presence_changed`)
- [SPEC-124](../specs/SPEC-124-alive-companion-life-loop.md)

---

*Decision made: 2026-09-29*
*Decision makers: Product owner (approval), Claude (author)*
