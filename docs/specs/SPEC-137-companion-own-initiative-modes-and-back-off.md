# SPEC-137: Companion Own Initiative, Modes and Back-off

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented on 2026-11-11; direction set by the owner in conversation, to match Cats Bot |
| **Owner** | Product owner |
| **Reviewer** | Owner |
| **Updates** | SPEC-124 FR-1 to FR-3 (the life profile), FR-18 and FR-19 (the heartbeat schedule), FR-21 (what a heartbeat reads) and FR-24 (the good night) |
| **Matches** | Cats Bot (cats-bot) SPEC-011 FR-1, FR-7 to FR-10 and FR-13 to FR-15 |
| **Amended** | 2026-11-12 by [SPEC-141](SPEC-141-conversation-product-scope.md) S1: FR-7 says "created on Chat" where it said "Chat conversation" |

## Summary

A companion Cat's heartbeat is now shown as **own initiative** (zh-TW 自主活動): on its daily
rhythm the Cat wakes and now and then does something on its own, which is not always a message
to the owner. Each Cat decides what it is for: `companion` keeps the owner company, and
`assist` looks over the Cat's own recent Chat conversations for work the owner left unfinished
and suggests how to continue. A Cat that keeps speaking to an owner who does not answer slows
down and then stops until the owner writes. Neither a restart of Cats nor a reboot counts as an
answer. Cats Desktop and Cats Bot behave and read alike.

## Goals

- An unprompted message is useful: in `assist` it names unfinished work and one next step.
- The Cat's proactivity decays while the owner does not answer, and that state survives
  restarts.
- Desktop and Cats Bot use the same names, modes, prompts, limits and back-off.

## Non-Goals

- A Boss Cat reviewing other Cats' conversations; `assist` covers the Cat's own conversations.
- Starting unfinished work on its own: `assist` only suggests it.
- Owner-adjustable heartbeat delays (Cats Bot has them); Desktop keeps SPEC-124's fixed 2–10
  and 30–120 minutes, which are Cats Bot's defaults.
- A "waiting for you" status line on Desktop (Cats Bot's Life tab has one).

## Requirements

### Functional Requirements

1. FR-1: `life` adds `mode: auto | assist | companion` (default `auto`). `auto` is `assist`
   for a Boss Cat (a Cat whose `group` is `admin`) and `companion` otherwise; the effective
   mode is resolved at every tick, so making a Cat the Boss Cat changes it.
2. FR-2: A box written before this spec reads as `auto` with `enabledAt: null`, field by field,
   with no schema bump. A PATCH with an unknown mode is refused with
   `invalid_companion_life_mode`.
3. FR-3: The Life card shows the switch as "Own initiative: stays awake on a daily rhythm and
   does things on its own now and then" (zh-TW 自主活動：依作息醒著，定時自己做點事), the mode as
   "What it does on its own initiative" with `auto` naming what it means for this Cat now, and
   a hint that the Cat sleeps between bedtime and waking up, that a message wakes it, and how
   the back-off works.
4. FR-4: `life.enabledAt` is set when the owner turns own initiative on after it was off;
   heartbeats before it no longer count as unanswered.
5. FR-5: The unanswered count is the number of `wake` and `regular` heartbeat messages in the
   Cat's direct lane after the later of the owner's latest message (FR-6) and `enabledAt`.
   The lane is the record, so a restart never resets it. The regular delay is multiplied by
   `2^n` (1, 2, 4, 8, 16); wake delays are not. At 5 nothing is scheduled until the owner
   writes; the keep-alive and the night's sleep go on. When the owner writes after a delay
   drawn with a count above 0, the next heartbeat is drawn afresh. No morning greeting is
   scheduled while the count is above 0.
6. FR-6: Only the owner answers: a `user` message typed in Cats, or a transport message in a
   direct lane, in any active Chat conversation the Cat is assigned to. A transport message in
   a channel bound to a group chat may come from someone else and does not count; neither does
   another Cat's message.
7. FR-7: An `assist` heartbeat carries a review the server builds without the model: every
   active conversation created on Chat, or stored with no recorded origin, that the Cat is
   assigned to (its direct lane included; conversations created on Work or Code and other
   Cats' conversations excluded) whose owner last wrote within 14 days, newest first, each
   with its last 6 owner, Cat and notice lines (the Cat's unprompted ones marked), each line
   at most 240 characters and the whole at most 6,000. When the budget runs short a
   conversation keeps its heading and the owner's last line, and the rest are counted as left
   out. The prompt asks for one short message naming the unfinished item, one concrete next
   step and an offer to continue, in the direct lane, and for `[quiet]` when nothing is
   unfinished or the Cat would only repeat itself. It does not start the work, and it offers no
   album photo.
   - Amended 2026-11-12 (SPEC-141 S1): it said "Chat conversation". The review reads where a
     conversation was created, not its product scope, so a conversation raised from Chat to
     Code or Work is still reviewed, and one created on Code or Work is not. FR-6's "Chat
     conversation" uses the same rule.
8. FR-8: An `assist` heartbeat with nothing to review, or whose fingerprint (the newest
   non-heartbeat message of each conversation in it) equals the one its last quiet review saw
   in this process, runs no turn (`skipped`) and draws the next regular delay.
   - A Boss Cat's review leaves out other Cats' words, also second-hand (a run of their
     messages shows as their names having replied), keeps them out of its fingerprint, and gains
     a peer section whose items are fingerprinted by id (SPEC-139 FR-13, FR-14).
9. FR-9: Only `companion` says good night (SPEC-124 FR-24), and only while nothing is
   unanswered.
10. FR-10: Both prompts state how many unprompted messages went unanswered, and the `companion`
    prompt asks not to repeat an earlier unprompted message. The owner's last message in the
    prompt is the latest across the Cat's conversations (FR-6).

### Non-Functional Requirements

- **Cost**: `assist` runs no turn when nothing is new, and the back-off caps an unanswered
  Cat at five more heartbeats in total.
- **Privacy**: the review stays with the Cat: it reads only conversations the Cat takes part in
  and writes only to its own direct lane, which may be mirrored to a bound Telegram chat as
  before (SPEC-124 FR-22).

## Design Overview

`src/products/chat/companion/life/heartbeat.ts` holds both prompts, the back-off delay, the
owner test and the unanswered count. `review.ts` builds the `assist` review with Cats Bot's
limits. `loop.ts` reads the mode and the count from the lanes at every tick, so nothing new is
persisted apart from `mode` and `enabledAt` in the box's `life`.

## References

- SPEC-124: the life loop, rhythm, sleep and the heartbeat this spec updates.
- Cats Bot (cats-bot) SPEC-011: the same behavior for Cats Bot.
