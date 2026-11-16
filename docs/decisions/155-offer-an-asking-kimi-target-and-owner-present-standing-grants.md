# ADR-155: Offer an Asking Kimi Target and Owner-Present Standing Grants

> Desktop keeps print-mode Kimi Code as the default and adds an opt-in Kimi target that
> asks before acting, so Kimi's computer use can run under the owner's approval. On a target
> that tags its prompts, the owner can allow one kind of action once, for the conversation or
> for 30 minutes. Only messages the owner sends from a local Desktop window use such an
> allowance, and a Stop is always in reach.

## Status

Accepted, 2026-11-16, on the owner's decisions of that day, listed below. This covers
implementation only. It does not authorize a release, a Runtime repin or a version bump.

## Context

- **What Desktop runs today.** Since ADR-153, Desktop runs Kimi Code on `kimi/cli/native` in
  print mode (`kimi -p`).
  - Print mode never asks, and it runs every installed plugin unasked. That includes
    Moonshot's computer-use plugin `kimi-cu-win`; running it on 2026-11-16 confirmed this
    (Runtime ADR-054 decision 11).
- **What Runtime offers.**
  - A hosted `kimi acp` target (`protocol: hosted`, Runtime ADR-049). It asks before
    commands, file changes and plugin tools, through the interaction cards of SPEC-132.
  - Standing grants (Runtime ADR-055):
    - A grant belongs to one Runtime session, lives only in memory, and covers one category:
      `computer_use`, `command` or `file`.
    - A send uses grants only when it carries `standingGrants: true`.
    - `DELETE /sessions/:id/interactions/grants` revokes them.
- **The owner's decisions on 2026-11-16.** Clicking a card for every action is unusable while
  Kimi holds the mouse and windows. The owner decided:
  - Keep print mode as the default, and make the asking target optional, as with Codex.
  - A grant is given once, for the whole conversation or for 30 minutes.
  - Only messages the owner sends in person may use a grant. In Desktop that means the chat
    composer. Telegram, heartbeats, schedules, Work, collaboration loops and Boss Cat never may.
  - Stop must always be reachable.
  - Cats desktop control (`cats-desktop`, SPEC-133) stays as it is.
  - Cats Bot made the same decisions in its ADR-028.
- **Facts the design depends on.**
  - **Policies.**
    - The hosted target starts only with an interaction host and a provider-mode policy with
      full machine and network access (`HostedAcpProvider.buildSpawnArgs`).
    - Desktop control injects only under an explicit policy whose approval is `on-request` or
      `untrusted` (`src/platform/desktopControl/policy.ts`).
    - A worker's policy cannot change while it runs, and a respawn checks it again.
    - Execution policy belongs to the conversation (`channel.runtimeExecutionPolicy`), not to
      one participant.
    - Print-mode Kimi does not support an execution policy.
  - **Sessions.** Each participant in a conversation has its own Runtime session.
    - Heartbeats, Telegram, Boss Cat and collaboration turns run in that conversation's
      sessions, under the interaction host the session was created with.
    - Work admission and other surfaces that create their own sessions carry no
      provider-mode policy.
  - **Local-owner stamps.**
    - `ownerStarted` is written by the server from the owner role.
    - `desktopControlEntry: 'local'` is written by the channel route for a loopback,
      unforwarded, non-mobile owner request.
    - A retry reuses the stored message with its stamps, and the retry route does not check
      its caller again.
  - **Desktop host.**
    - The supervisor starts and stops Platform and Runtime together.
    - The host holds Runtime's address. Runtime requires a key only when the environment
      sets `CATS_RUNTIME_API_KEY`; the host then reads the same variable.
    - SPEC-133's hold watcher, topmost notice and tray Stop exist only on Windows with the
      desktop-control helper, and they clear after two failed polls.

## Decision

1. **Two Kimi targets.**
   - `kimi/cli/native` stays print mode and stays the default.
   - `kimi/cli/hosted` is opt-in: the Kimi row in Settings → AI tools offers "Also offer Kimi
     that asks before acting". Turning that off removes the target.
   - Runtime owns the hosted target's configuration as a selection template, not as an entry in
     its provider universe, so setup and install rows stay one per provider.
   - Kimi's legacy default instance is `native`, so adding the asking target never moves a
     conversation that names no instance.
2. **A conversation that uses it.**
   - Pickers label the targets "Never asks (default)" and "Asks before acting (needs full access
     and network)".
   - The asking target needs the conversation's policy to be provider mode with full access and
     network on.
     - The owner sets that policy when creating the conversation, as for Claude Code's provider
       controls (PLAN-125). The policy editor's hint names both targets. This was amended on
       2026-11-16, at implementation: Desktop does not change a conversation's policy for the
       owner.
     - In a conversation without that policy, the asking target fails before the turn and gives
       the reason. It never falls back to print mode.
     - Because the policy is conversation-wide, a conversation that has it cannot run
       desktop control for any cat, and it cannot run print-mode Kimi or other targets without
       execution-policy support.
   - When the owner turns the option off, a participant whose stored target is gone fails
     before its turns.
     - If a picker later saves print-mode Kimi for that participant, that also fails before the
       turn, because the conversation's provider policy cannot run print mode.
     - Neither case runs Kimi unasked.
   - Turns that run in the conversation's sessions — heartbeats, Telegram, Boss Cat,
     collaboration loops and other cats' follow-on turns — show their cards and wait, up to the
     30-minute card deadline. They never use grants. This matches Cats Bot.
   - Surfaces that create their own sessions without that policy fail before the turn and never
     fall back to print mode. Only the conversation's own sessions resolve its execution policy
     (`runtime-session/policy.ts`, used by session launch and Boss Cat join requests). Work runs,
     schedules, Catlas, relay and agent decisions create sessions without one, so the hosted
     target refuses them when the session spawns.
3. **Desktop control is unchanged.** It never runs in an asking-Kimi conversation, because the
   two policies exclude each other. It is not a grant category.
4. **Grant buttons.**
   - A card whose prompt carries a `grantCategory` offers "Allow for this conversation" and
     "Allow for 30 minutes" beside the provider's one-time choice.
   - A grant answers with the provider's first choice, as Runtime requires.
   - It covers the asking cat's session in this conversation and ends when that session is
     replaced.
   - Only the owner role may send an answer that carries a grant; an admin cannot.
   - A computer-use card adds a warning: operating the desktop is as broad as the owner at the
     keyboard. Kimi can start programs and change files, and it can use Cats itself, including
     the composer and these buttons. KimiCU blocks only Command Prompt, PowerShell and Windows
     Terminal windows.
5. **Only the local owner's messages.** A chat dispatch carries `standingGrants: true` only
   when its source message bears both stamps: `ownerStarted === 'desktop'` and
   `desktopControlEntry === 'local'`.
   - **Who strips the stamp.** Every route that accepts client message metadata, including
     parallel groups, strips `desktopControlEntry`. Only the channel route adds it back.
   - **Retries.** A retry carries the flag only when the retry request itself passes the same
     local-owner check.
   - **Several cats.** One owner message addressed to several cats flags each cat's dispatch.
   - **What the flag proves.** Loopback plus the owner's cookie, not keystrokes. A local
     program holding the owner's cookie, or Kimi itself under a computer-use grant, also
     passes.
   - **Never flagged:**
     - Mobile and remote ingress
     - Telegram
     - Choice answers, continuations, parallel-group fan-out and other cats' turns
     - Work, schedules, collaboration loops and Boss Cat
     - Catlas, relay and heartbeats
6. **Never waiting.**
   - A request Runtime answered from a grant never shows as a card and never counts as waiting
     for the owner.
   - Its receipt expires when it is created, so it never extends the human-wait idle timer.
7. **Visible and stoppable.**
   - **In the conversation.** A bar shows each cat's granted categories, the time left, and
     Stop for the conversation.
   - **On the desktop.** While any session holds grants, the host shows a topmost notice that
     takes no focus, "Kimi may act without asking", with Stop, plus a tray Stop.
     - Both appear on every platform, independent of the desktop-control helper.
     - The host reads Runtime's `GET /interactions/grants` directly. It therefore still finds
       grants while Platform is down, or held by orphan sessions Platform no longer
       references.
     - When it cannot read them, it keeps showing the notice, marked unconfirmed, rather than
       clearing it.
   - **Hotkey.** The host registers `CommandOrControl+Alt+Shift+D` only while grants exist.
     - Cats Bot's Hub uses `…+S`, so both apps can hold their chord at once.
     - If registration fails, the notice says so.
   - **What Stop does.** It revokes the grants and cancels the running turns at the same time,
     so no further action is approved while the cancel completes.
     - It trusts only what Runtime returns. A 404 counts as confirmed; any other failure shows
       and keeps Stop in view.
     - While Stop runs, no send carries the flag.
     - The host revokes through Runtime. It asks Platform to cancel the conversations' turns,
       and if Platform does not answer, it cancels the sessions in Runtime. A turn cancelled
       that way shows as failed and can be retried, not as stopped.
   - Kimi Computer Use's physical Escape still interrupts its input.
8. **Lifetime.** Grants live in Runtime memory. They end on Stop or expiry, on a Runtime
   restart, or when the session is replaced, for example when a participant's target changes.
9. **Data boundary.**
   - **No new fields.** No channel, state or profile field is added. `execution.target.instance`
     and the conversation's policy hold the new values.
   - **Older Desktops reject the file.** Turning the option on writes a hosted Kimi instance to
     Runtime's `providers.yaml`. Runtime `512c0747`, which released Desktop 0.17.1 is built
     with, rejects that file as a whole, so every provider stops loading, not only Kimi.
   - **Before downgrading.** Turn the option off, or remove
     `backends.cli.providers.kimi.instances.hosted`. Delivery includes tests that turning the
     option off removes the instance.
   - **Release notes.** The release that ships this records the boundary in its compatibility
     notes. Until that release, which the owner must authorize, 0.17.1 has neither the asking
     target nor grants.
10. **Delivery.**
    - **Runtime:** the template and the read-only grants listing (cats-runtime#232).
    - **Platform fix:** strip client-supplied `desktopControlEntry` on every route. SPEC-133
      relies on that stamp today.
    - **Platform targets and policy:** decisions 1 to 3.
    - **Platform grants and Stop:** decisions 4 to 8, with the host routes registered in the
      integration-owned `src/app/server/**`, as SPEC-133's were.
    - **Review and acceptance.** Each change gets an independent review before it merges.
      Acceptance runs in an isolated profile, never against `~/.cats`.

## Consequences

### Positive

- After one decision by the owner, Kimi can work through a desktop task, while background
  triggers still ask or fail.
- For an owner who never turns the option on, print-mode Kimi behaves exactly as before.
- The grant UI applies to every target that tags its prompts. Today that is Kimi's computer
  use, plus commands and file changes on hosted ACP targets.

### Negative

- While a grant is in force, Stop is the only control left in that category.
- A computer-use grant is as broad as the owner at the keyboard. It reaches Cats' own
  composer and grant buttons, so it can also turn into command and file grants.
- An asking-Kimi conversation cannot use desktop control or print-mode Kimi.
- An unattended turn in such a conversation waits on a card nobody may see, until the card
  expires.
- The owner has two Kimi entries to tell apart, and two Stop hotkeys if Cats Bot also runs.
- Downgrading needs the option turned off first.

### Neutral

- Desktop control, its policy gate and its notice are unchanged.
- Platform never writes grants to disk.

## References

- Runtime ADR-049, ADR-054 decision 11, ADR-055; Cats Bot ADR-028
- SPEC-132 (provider interactions), SPEC-133 (desktop control), ADR-153 (Kimi setup)
