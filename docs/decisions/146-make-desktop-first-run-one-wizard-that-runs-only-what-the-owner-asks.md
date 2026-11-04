# ADR-146: Make Desktop First Run One Wizard That Runs Only What the Owner Asks

## Status

Accepted — 2026-11-04, by the owner after operating an interactive mock
(`tmp/onboarding-redesign/`, not tracked). The owner approved the mock with "定案".
Specified by [SPEC-136](../specs/SPEC-136-desktop-first-run-wizard.md) and carried
out by [PLAN-130](../plans/PLAN-130-desktop-first-run-wizard.md). Four points reverse
earlier owner decisions and are listed under
[Decisions to confirm](#decisions-to-confirm).

This amends [ADR-116](116-share-desktop-provider-management-across-onboarding-and-settings.md)
points 1, 3 and 5 and [ADR-144](144-install-git-as-a-desktop-setup-prerequisite.md)
point 1. Selection, admission, retained observations and helper ownership in those
records stand. It extends [ADR-021](021-keep-packaged-setup-and-provider-installation-in-the-host.md):
OS installation stays in the host.

## Context

The owner compared Cats Desktop's first run with Cats Bot's wizard
([Cats Bot ADR-015](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/015-make-creating-a-cat-bot-a-wizard-whose-scripts-the-owner-ticks.md))
and asked for the same discipline, adjusted for a product with many tools.

What the first run does today:

- Desktop runs `check` on its prerequisites in the background before anyone asks
  (`maybePrimeSetupAudit`).
- Saving a selection and checking it are two controls, Apply and "Detect after
  applying", beside per-card Detect and Install buttons.
- Install on an npm tool also installs Node.js when it is missing
  (`ensureNpmPrerequisites`), so one click can start an elevated install the person
  never saw named.
- Nothing shows what a script would do, which command ran or what it reported. Helper
  errors from the shared manager reach neither the recovery page nor its details.
- Provider setup and Platform `/setup` are two unrelated designs, joined by a
  navigation. Finishing `/setup` turns on start at login without saying so.
- The failure details page ([SPEC-054](../specs/SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md))
  is reachable only when the host phase is `failed` or after the 80 s wait.

Cats is not Cats Bot:

- The owner may choose any of 16 CLIs, or none, and a valid empty selection must
  still finish ([SPEC-116](../specs/SPEC-116-desktop-provider-management.md) FR-8).
- Node.js is a shared dependency of seven tools.
- Ollama has three stages (install, start the service, get a model).
- OpenClaw and remote Ollama are connections: nothing is installed for them.

## Decision

1. **One five-step wizard across two surfaces.** The Desktop host draws 1 tools,
   2 this computer and 3 sign-in and models, because they must work before Platform
   starts (ADR-116's reason stands). Platform draws 4 your account and 5 Catlas and
   start. One rail shows all five, and finished steps can be revisited until the final
   button is pressed. A browser without a Desktop host sees steps 4 and 5 only.
2. **Page 1 runs nothing.** It reads the static catalog and the saved selection. No
   process starts and no PATH is scanned. No tool is preselected.
3. **"Check this computer" saves the selection and then reads.** There is no separate
   Apply and no "Detect after applying". Pressing it is the consent to read-only
   checks. With nothing chosen the button becomes "Continue without tools", which saves
   an empty selection and goes straight to account setup.
4. **Nothing runs before the owner asks during first run.** Desktop's background
   prerequisite audit and first-run inventory scan do not start until setup is complete.
   Later launches keep them.
5. **Every script that changes anything is ticked by the owner**, and all are unticked by
   default. The wizard runs ticked rows top down, one at a time, with a fresh read after
   each. A row shows what the helper reports it would do, the exact command, the script's
   SHA-256 and a command for doing it by hand. Nothing installs a dependency implicitly:
   the wizard does not go through `ensureNpmPrerequisites`.
6. **Tools appear in the provider/model selector's order** (`PRODUCT_PROVIDER_ORDER`) on
   every page, native and npm tools mixed. Page 2 alone groups by dependency, because its
   rows run top down and Node.js must come before what needs it. Inside a group, the
   selector's order holds. The owner confirmed this on 2026-11-04.
7. **Node.js stops being a tile on the picker.** It is the root row of page 2's Node.js
   group, with the npm folder and npm tools hanging from it, shown only when a chosen tool
   needs it. A tile says when a tool needs Node.js.
8. **The log is a read-only text area in the host, not a terminal.** Each run adds its
   kind, command and the helper's structured result. A failure opens it. The host keeps it
   in memory, so the Platform pages show the same log. `host.log` records only fixed words
   about a run ([ADR-145](145-keep-bounded-production-desktop-host-diagnostics.md)).
9. **Sign-in is its own page, in a real terminal.** The host opens one with a fixed command
   per provider. No text from a page or a model reaches it, and no credential file is read.
   A tool without a verified command gets Runtime's hint and documentation link instead.
10. **Ollama and connections say what they are.**
    - Ollama's row shows its three stages.
    - Pulling a first model is a host setup action against the loopback endpoint Runtime has
      saved. Runtime keeps ownership of execution and model discovery.
    - A connection row never says "installed". Its address is saved and tested through
      Runtime's existing selection and scan routes.
11. **Every setup failure reaches the details page.** A "Show details" entry sits on each
    failure message and failed row, on the host and Platform pages, under SPEC-054's rules:
    one summary card, at most three actions with Quit Cats always among them, four
    collapsed sections, and a visible way back to the same page with its state. It is not
    offered without a Desktop host.
12. **The record behind that page gets filled in.** The host and Platform record the events
    that are missing today, named in SPEC-136.
13. **A failed tool never blocks finishing** (SPEC-116 FR-8). Moving on past unfinished work
    is worded as skipping it.
14. **The final button lists what it does**: the admin account, Catlas with its tool and
    model or off, start at login as a visible checkbox, and opening the Lobby. It also states
    how many changes setup made to the computer.
15. **Runtime backs up an unreadable `providers.yaml` before replacing it.** The file holds
    the person's configuration, and the wizard's page 1 offers to replace it.
16. **Settings > Runtime keeps the shared provider manager's rows.** The manager loses its
    onboarding presentation, and onboarding gets the wizard module. Host-owned operations
    stay shared.

## Decisions to confirm

The owner approved the mock, whose behavior includes these. Each reverses a recorded owner
decision, so each is named here rather than left implied. The owner can reverse any of them
without undoing the rest.

- **D1. No background checks during first run.** Reverses ADR-144 point 1 (2026-10-31) and
  SPEC-116 FR-11 for the first run only. Consequence: on a clean computer nothing about
  Node.js or Git is known until the owner presses the button.
- **D2. Node.js leaves the picker, and page 2 uses rows.** On 2026-09-17 the owner rejected
  the shared row layout for onboarding and the loss of visible Node/npm preparation
  (PLAN-107, "User acceptance correction"). This returns to rows, on a different page. Node.js
  stays visible once a chosen tool needs it, and is shown only then.
- **D3. Apply and "Detect after applying" go away.** Reverses SPEC-116 FR-2 and FR-3 for
  onboarding. Settings > Runtime keeps both.
- **D4. Selector order replaces native-then-npm.** Reverses SPEC-116 FR-12 and ADR-116
  point 1's grouping. The owner set this explicitly on 2026-11-04, so it is recorded here for
  completeness.

## Consequences

### Positive

- A person can see, before and after, each change setup makes to their computer.
- One click can no longer start an installer that the page did not name.
- First run and `/setup` read as one flow with one log.
- Each failure path ends at the same details page, with real evidence behind it.

### Negative

- Onboarding and Settings no longer share a presentation, so ADR-116's drift protection now
  covers operations only. Row wording can drift between them.
- A clean computer shows less at first, because nothing is checked until asked (D1).
- Going back from Platform to host pages reloads `/setup`. Its name and email are kept, and
  the password is asked again because it is never stored.
- The first-run view is large for a page embedded by `.toString()`. It stays free of imports,
  which is the cost of working before Platform starts.

### Neutral

- A Windows check still starts one PowerShell per row, once the owner presses the button.
- Later launches behave as before, including the prerequisite audit.
- The Desktop host version and persisted formats do not change. `providers.yaml` gains a
  sibling backup file only when it was unreadable.

## Alternatives Considered

### Alternative 1: Keep the cards and add a log

- **Pros**: least change, keeps the 2026-09-17 layout.
- **Cons**: a card has no room for a plan, tags and command. Install stays one click with
  implicit prerequisites.
- **Why rejected**: it does not let a person read what a script does before it runs.

### Alternative 2: Copy Cats Bot's three pages

- **Pros**: one design across products, and tested code.
- **Cons**: one provider, no empty selection, no connections, and account setup belongs to
  Platform here.
- **Why rejected**: Cats needs multi-select, dependency groups and the Platform pages. The
  patterns and the terminal code carry over; the page structure does not.

### Alternative 3: Move all five pages into Platform

- **Pros**: one renderer, React, the shared picker.
- **Cons**: Platform may be the service that failed, and first-run setup has to recover from
  that.
- **Why rejected**: ADR-116 already decided this.

### Alternative 4: Pull Ollama models through Runtime

- **Pros**: Runtime already speaks to Ollama.
- **Cons**: it needs a new long-running Runtime operation for one setup moment. Runtime's
  contract is execution and observation, and installation is the host's under ADR-021.
- **Why rejected**: the host can do it with the saved loopback endpoint, and refuses others.

### Alternative 5: An embedded terminal

- **Pros**: sign-in without leaving the window.
- **Cons**: a pty dependency in the host and credentials typed through Cats.
- **Why rejected**: Cats Bot ADR-015 rejected it too. A real terminal keeps secrets away from
  Cats.

## References

- [SPEC-136](../specs/SPEC-136-desktop-first-run-wizard.md)
- [PLAN-130](../plans/PLAN-130-desktop-first-run-wizard.md)
- [ADR-021](021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-047](047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md)
- [ADR-116](116-share-desktop-provider-management-across-onboarding-and-settings.md)
- [ADR-138](138-converge-google-and-password-admin-bootstrap.md)
- [ADR-144](144-install-git-as-a-desktop-setup-prerequisite.md)
- [ADR-145](145-keep-bounded-production-desktop-host-diagnostics.md)
- [SPEC-054](../specs/SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md)
- [SPEC-116](../specs/SPEC-116-desktop-provider-management.md)
- [SPEC-129](../specs/SPEC-129-desktop-admin-bootstrap-and-google-sign-in.md)

---

*Decision made: 2026-11-04*
*Decision makers: Owner; drafted by Claude*
