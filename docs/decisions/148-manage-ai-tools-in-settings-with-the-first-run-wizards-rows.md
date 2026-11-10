# ADR-148: Manage AI Tools in Settings with the First-Run Wizard's Rows

## Status

Accepted — 2026-11-11, by the owner's request to bring Settings' install and upgrade guidance up
to the first-run wizard "in function and in look". Specified by
[SPEC-138](../specs/SPEC-138-settings-ai-tools.md) and carried out by
[PLAN-131](../plans/PLAN-131-settings-ai-tools.md).

This reverses [ADR-146](146-make-desktop-first-run-one-wizard-that-runs-only-what-the-owner-asks.md)
point 16, under which Settings > Runtime kept the shared provider manager. It amends ADR-146
point 11 and [SPEC-136](../specs/SPEC-136-desktop-first-run-wizard.md) FR-38, which kept helper
runs, terminals and model downloads to the host's own page. ADR-116's shared host operations stand.

## Context

The first run became one wizard (ADR-146). Nothing runs until the owner asks. Every change is
ticked and shows what it will do, the command it runs and the script's SHA-256. A log shows each
run, and every failure reaches the details page.

Settings > Runtime still mounts the old provider manager (`packages/provider-setup/manager.js`):

- Install is one click. On an npm tool it goes through `ensureNpmPrerequisites`, which can start
  an elevated Node.js install that the page never named.
- Apply and "Detect after applying" are separate controls.
- No plan, command, script hash or log.
- No sign-in terminal and no Ollama model download.
- Its own look, unlike the wizard's.
- Update, Repair and Uninstall sit in a collapsed "Details" with no word on what they run.

Facts that bound the design:

- **No read-only "is there a newer version".** In check mode the helpers never report an update:
  `_NpmCliInstaller.ps1` forces `$isOutdated` false, and the native helpers compare versions only
  when asked to upgrade. A dry run is allowed only for uninstall.
- **The host already lets the main window run any helper mode.** `cats-host:run-setup-helper` is
  open to the Platform page. The wizard's channels are narrower in helper id and stricter on
  sender: main frame, and the host's own page.

## Decision

1. **Settings > Runtime shows the wizard's rows.** The section "AI tools" mounts the wizard module
   in a Settings layout. There is no rail, the log sits at the section's foot and the details page
   opens in place. Row wording, tags and states come from the same functions as first run, so the
   two surfaces no longer drift (ADR-146's stated cost).
2. **Nothing runs when Settings opens.** Rows say what is already known, without starting a
   process:
   - Runtime's last scan for tools;
   - the host's launch-time check for prerequisites.

   Plans and tick boxes come from "Check this computer", which is the consent to read-only checks,
   as on first run. Results last for the window's session.
3. **Changing the selection is the wizard's page 1, inside Settings.** "Choose tools" opens the tile
   picker. "Save and check" saves with `expectedRevision` and then checks. There is no separate
   Apply and no "Detect after applying".
4. **Every change is ticked by the owner**, runs top down one at a time with a fresh check after
   each, and never installs a dependency implicitly. Settings stops using `ensureNpmPrerequisites`;
   Node.js is its own row above what needs it.
5. **Update is offered, not announced.**
   - A ready row whose helper supports upgrade gets an "Update" tick. Its details say it installs
     the newest release if there is one, and that nothing changes if this one is already the newest.
     They also give the exact upgrade command and the script's hash.
   - After it runs, the row reports the version before and after from the fresh check.
   - There is no "update available" badge, because nothing read-only can know.
6. **Reinstall and Uninstall stay**, behind a ready row's "More", only where the helper supports
   them.
   - Reinstall is a ticked change.
   - Uninstall first runs the helper's dry run, which is read-only, then shows what it would remove
     as a ticked change marked as a removal.
7. **Sign-in, Codex first-time setup and Ollama's first model** appear under the rows once a check
   has found the tool ready, with the wizard's fixed commands and checks.
8. **The host accepts these runs from Settings > Runtime too.** Running a helper, cancelling checks,
   opening a sign-in or Codex terminal, and listing or downloading an Ollama model may come from the
   host's own page or from the main frame at the app origin under `/settings/runtime`.
   - Wizard state, the draft kept across a restart, and returning to host pages stay with the host's
     own page.
   - The run-helper channel also takes upgrade, force (reinstall) and uninstall. A dry run is allowed
     only for uninstall, and every change mode is refused for candidate profiles, as before.
9. **Settings' feedback rule holds.** Saving the selection is a settings change, so its result goes
   to a toast (AGENTS.md, Settings UI Conventions). Row states, alerts about Runtime or
   `providers.yaml`, and the log describe the computer and stay in the section.
10. **The old presentation goes.** `mountProviderManager` and its view tests are removed in the same
    change. The host's `DesktopProviderManager` stays for saving and Runtime scans, and the
    manager's type declarations stay for the host and preload.

## Consequences

### Positive

- One way to install, update or fix a tool anywhere in Cats, with the same words and the same
  evidence.
- Settings can no longer start an installer the page did not name.
- Updating a tool says what it ran and what changed.

### Negative

- Settings shows less before a check: no tick boxes until the owner asks.
- The update tick cannot say whether an update exists. A run against a current version costs one
  check of the vendor's latest release, and the log says nothing changed.
- The wizard module grows a second layout, which stays free of imports because the host embeds it.

### Neutral

- Browser Settings (no Desktop host) is unchanged: it never showed the manager.
- Later launches keep the prerequisite audit (ADR-146 D1 only covered the first run).
- No persisted format or Runtime route changes.

## Alternatives Considered

### Alternative 1: Restyle the old manager

- **Pros**: smallest change.
- **Cons**: keeps one-click installs, implicit Node.js, and no plan, command or log.
- **Why rejected**: the owner asked for the function too, not only the look.

### Alternative 2: Send Settings back to the first-run wizard

- **Pros**: no new layout.
- **Cons**: the wizard's pages hand off to account setup and the Lobby, which a configured profile
  does not need. Settings would lose its place and context.
- **Why rejected**: Settings is where a person returns to one tool; a five-step flow is the wrong
  frame for it.

### Alternative 3: Teach the helpers a read-only update check

- **Pros**: an honest "update available".
- **Cons**: a contract change in every helper on three operating systems, and in Cats Bot's vendored
  copies. SPEC-136 kept helper scripts out of scope.
- **Why rejected**: too wide for this change. It can follow as its own decision.

## References

- [SPEC-138](../specs/SPEC-138-settings-ai-tools.md)
- [PLAN-131](../plans/PLAN-131-settings-ai-tools.md)
- [ADR-116](116-share-desktop-provider-management-across-onboarding-and-settings.md)
- [ADR-146](146-make-desktop-first-run-one-wizard-that-runs-only-what-the-owner-asks.md)
- [SPEC-054](../specs/SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md)
- [SPEC-136](../specs/SPEC-136-desktop-first-run-wizard.md)
- [Cats Bot SPEC-010](https://github.com/cats-inc/cats-bot/blob/main/docs/specs/SPEC-010-setup-wizard.md)

---

*Decision made: 2026-11-11*
*Decision makers: Owner; drafted by Claude*
