# ADR-155: Offer an Asking Kimi Target and Owner-Present Standing Grants

> Desktop keeps print-mode Kimi Code as the default and adds an opt-in Kimi target that
> asks before acting, so Kimi's computer use runs under the owner's approval. On any target
> that tags its prompts, the owner can allow one kind of action once, for the conversation or
> for 30 minutes. Only messages the owner types into the chat composer on this computer use
> such an allowance, and a Stop is always in reach.

## Status

Accepted, 2026-11-16, at the owner's decisions of that day (below). This ADR covers
implementation only. It does not authorize a release, a Runtime repin or a version bump.

## Context

- **What Desktop runs today.** Since ADR-153, Desktop runs Kimi Code on `kimi/cli/native`, in
  print mode (`kimi -p`).
  - Print mode never asks, and it runs every installed plugin unasked.
  - That includes Moonshot's computer-use plugin `kimi-cu-win`. This was verified by
    executing it on 2026-11-16 (Runtime ADR-054 decision 11).
- **What Runtime offers.**
  - A hosted `kimi acp` target (`protocol: hosted`, Runtime ADR-049). It asks before commands,
    file changes and plugin tools, through the interaction cards of SPEC-132.
  - Standing grants (Runtime ADR-055):
    - A grant is per Runtime session and held in memory, for one category: `computer_use`,
      `command` or `file`.
    - A send uses grants only when it carries `standingGrants: true`.
    - `DELETE /sessions/:id/interactions/grants` revokes them.
- **The owner's decisions on 2026-11-16.** Clicking an approval card for every action is
  unusable while Kimi holds the mouse and windows. The owner decided:
  - Keep print mode as the default, and make the asking target optional, like Codex.
  - A grant is given once, either for the whole conversation or for 30 minutes.
  - Only messages the owner sends in person may use a grant. In Desktop that means the chat
    composer only. Telegram, heartbeats, schedules, Work, collaboration loops and Boss Cat
    never may.
  - Stop must always be reachable.
  - Cats desktop control (`cats-desktop`, SPEC-133) stays as it is.
  - Cats Bot made the same decisions in its ADR-028.
- **Facts the design depends on.**
  - The hosted target starts only with an interaction host and a provider-mode policy with
    full machine and network access (`HostedAcpProvider.buildSpawnArgs`).
  - Desktop control injects only under an explicit policy whose approval is `on-request` or
    `untrusted` (`src/platform/desktopControl/policy.ts`). The two policies exclude each
    other, so desktop control can never run in an asking-Kimi session.
  - Desktop assumes one target per provider in three places: the host's setup-target
    mapping, the CLI inventory probe and the setup wizard. Runtime's provider universe also
    has one entry per provider.
  - SPEC-133 (DC-11, DC-12) already gives desktop control a hold watcher, a topmost notice
    that takes no focus, and a tray Stop. They learn hold state from Platform's
    key-authenticated internal routes.

## Decision

1. **Two Kimi targets.**
   - `kimi/cli/native` stays print mode and stays the default.
   - `kimi/cli/hosted` is opt-in. The Kimi row in Settings → AI tools offers it as "Also offer
     Kimi that asks before acting". Turning the option off removes the target.
   - Runtime owns the hosted target's configuration as a selection template. The template is
     not an entry in the provider universe, so setup and install rows stay one per provider.
   - A provider's implicit default is never a hosted instance while another instance exists.
     Adding the asking target therefore never moves a conversation that names no instance.
2. **Choosing it.**
   - Pickers name the two targets "Kimi Code — never asks" and "Kimi Code — asks before
     acting".
   - A new conversation that picks the asking target is given the only policy that target
     accepts: provider mode, full access, network on. The draft shows that policy.
   - An existing participant can move to the asking target only when the conversation
     already has that policy. Otherwise the option is disabled, with the reason shown.
   - Some surfaces have no owner to answer a card: schedules, Work runs, Catlas, relay,
     heartbeats and agent decisions. If one of them resolves to the asking target, it fails
     before the turn with Runtime's message. It never falls back to print mode.
3. **Desktop control is unchanged.** It cannot run in an asking-Kimi session, because the
   policies above exclude each other. It is not a grant category.
4. **Grant buttons.**
   - A card whose prompt carries a `grantCategory` offers "Allow for this conversation" and
     "Allow for 30 minutes" beside the provider's one-time choice. The grant answers with the
     provider's first choice, as Runtime requires.
   - A computer-use card adds a warning: operating the desktop is as broad as the owner at the
     keyboard. It can start programs and change files, and KimiCU blocks only command prompt,
     PowerShell and Windows Terminal windows.
5. **Only the owner at this computer.** A chat dispatch carries `standingGrants: true` only
   when both stamps the server writes on the source message are present:
   `ownerStarted === 'desktop'` and `desktopControlEntry === 'local'`.
   - The flag follows that message. It survives a retry or a queued send of the same message.
   - These never carry the flag:
     - mobile and remote ingress
     - Telegram
     - choice answers, continuations and parallel-group fan-out
     - turns that another cat starts from it
     - Work, schedules, collaboration loops and Boss Cat
     - Catlas, relay and heartbeats
6. **Never waiting.** A request Runtime answered from a grant never shows as a card, never
   counts as waiting for the owner, and never extends the human-wait idle timer.
7. **Visible and stoppable.**
   - **In the conversation.** A conversation whose sessions hold grants shows a bar with the
     categories, the time left and Stop.
   - **Notice and tray.** While any session holds grants, the host shows a topmost notice
     that takes no focus, "Kimi may act without asking", with Stop, and a tray Stop. This is
     the SPEC-133 pattern, behind new key-authenticated internal routes. Those routes ask
     Runtime for every session's grants, so a Platform restart still finds them.
   - **Hotkey.** The host registers Ctrl+Alt+Shift+D only while grants exist. Cats Bot's Hub
     uses Ctrl+Alt+Shift+S, so both apps can hold their chord at once. If registration
     fails, the notice says so.
   - **What Stop does:**
     - It cancels the running turn in each granted conversation, then revokes those
       sessions' grants in parallel.
     - It trusts only the snapshot Runtime returns. A 404 counts as confirmed; anything else
       fails visibly and keeps Stop in view.
     - No send carries the flag while Stop runs.
   - Kimi Computer Use's physical Escape still interrupts its input.
8. **Lifetime.** Grants live in Runtime memory. They end on Stop, on expiry, on a Runtime
   restart, or when the session is replaced. Changing the participant's target, for example,
   replaces the session.
9. **No persisted change.** No channel, state or profile field is added;
   `execution.target.instance` already exists. Released Desktop 0.17.1, built with Runtime
   `512c0747`, has neither the asking target nor grants until a release the owner authorizes.
10. **Delivery.**
    - **Runtime:** the template, the implicit-default rule, and a read-only listing of every
      session's grants.
    - **Platform targets and policy:** decisions 1–3.
    - **Platform grants and Stop:** decisions 4–8. The new internal routes are registered in
      the integration-owned `src/app/server/**`, as SPEC-133's were.
    - Each change gets an independent review before it merges.

## Consequences

### Positive

- Kimi can work through a desktop task after one decision by the owner, while background
  triggers still ask or fail.
- Print-mode Kimi behaves exactly as before for every owner who never turns the option on.
- The grant UI applies to every target that tags its prompts. Today that is Kimi's computer
  use, plus commands and file changes on the hosted ACP targets.

### Negative

- While a grant is in force, Stop is the only control left in that category. A computer-use
  grant is broader than its name.
- The owner has two Kimi entries to tell apart, and two Stop hotkeys if Cats Bot also runs.
- On the asking target, schedules and other unattended surfaces fail rather than run.

### Neutral

- Desktop control, its policy gate and its notice are unchanged.
- Grants are never written to disk by Platform.

## References

- Runtime ADR-049, ADR-054 decision 11, ADR-055; Cats Bot ADR-028
- SPEC-132 (provider interactions), SPEC-133 (desktop control), ADR-153 (Kimi setup)
