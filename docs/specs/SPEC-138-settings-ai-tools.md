# SPEC-138: Settings AI Tools

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved 2026-11-11 (owner request); implementation in PLAN-131 |
| **Owner** | Product owner |
| **Reviewer** | Independent agent before each merge |
| **Related decision** | [ADR-148](../decisions/148-manage-ai-tools-in-settings-with-the-first-run-wizards-rows.md) |
| **Related plan** | [PLAN-131](../plans/PLAN-131-settings-ai-tools.md) |
| **Updates** | SPEC-136 Non-Goals (Settings > Runtime), FR-38 and FR-41; SPEC-116 FR-2 and FR-3 for Settings |

## Summary

Settings > Runtime's "AI tools" section becomes the first-run wizard's rows in a Settings layout.
It runs nothing until the owner asks, every change is ticked, the log shows what ran, and failures
reach the details page. Installed tools can be updated, reinstalled or removed through the same
ticks.

## Goals

- Opening Settings starts no process.
- Installing, updating, reinstalling and removing a tool say beforehand what will run, and
  afterwards what it did.
- Settings and first run use the same row words, tags, states and evidence.

## Non-Goals

- A read-only "update available" signal (ADR-148 Alternative 3).
- Changing helper scripts, Runtime routes or persisted formats.
- Browser Settings, which has no Desktop host.
- The rest of Settings > Runtime: status, Claude in Chrome, desktop control, session settings and
  catalogs are unchanged.

## Requirements

### Functional Requirements

**The section**

1. FR-1: On Desktop, Settings > Runtime's first section mounts `mountSetupWizard` with
   `mode: 'settings'`, replacing `mountProviderManager`.
   - The section has no rail.
   - Its heading is "AI tools", with a lead saying what the rows are and when they were read.
   - A "Choose tools" button sits beside the heading.
   - The action foot and the log stay at the bottom of the visible canvas while the section is on
     screen.
   - Text follows the Settings language.
2. FR-2: Opening the section reads `/setup-state` and the packaged helper facts only, as first-run
   page 1 does.
   - Before a check in this window session, each chosen tool's row is "Not checked yet". It notes
     Runtime's last scan result ("Found in the last scan" with its version, or "Not found in the
     last scan") or the host's launch check for a prerequisite.
   - No tick box appears until a check has read the row.
3. FR-3: "Check this computer", or "Check again" once a check has run, reads the rows exactly as
   first-run page 2 does:
   - the same groups, reading order and bounded concurrency;
   - Node.js before what waits on it;
   - Runtime's scan of the chosen tools afterwards.

   The hint says how many read-only checks run. "Stop" ends a running check and keeps the results
   so far.
4. FR-4: The last check's rows, ticks and connection results last for the window's session, across
   Settings navigation. The lead then says when they were read and that nothing has run since.

**Choosing tools**

5. FR-5: "Choose tools" replaces the rows with first-run page 1's tile picker, in selector order,
   with Show more and the Ollama and OpenClaw groups.
   - There is no language selector: Settings owns the language.
   - The foot offers "Cancel" and "Save and check". With nothing ticked, the save button reads
     "Save without tools".
   - Saving uses `expectedRevision`, then runs FR-3's check for the new selection.
6. FR-6: A failed save is a toast (AGENTS.md, Settings UI Conventions), and the picker keeps the
   ticks. Alerts about the state of the configuration stay in the section:
   - the list could not load;
   - the connection was lost;
   - `providers.yaml` is unreadable;
   - the selection was changed elsewhere.

   A successful save is silent, because the rows that follow show it.

**Changes**

7. FR-7: A row that needs work has first run's tick box, summary, tags and details:
   - It will;
   - Runs;
   - Script;
   - By hand;
   - Next.

   "Apply N ticked" runs ticked rows top down, one at a time, each with a fresh check. "Stop after
   this one" keeps the remaining ticks. A failure stops the queue, keeps the ticks and offers Try
   again. Nothing installs a dependency implicitly; `ensureNpmPrerequisites` is not used.
8. FR-8: A ready row whose helper reports `supportsUpgrade`, other than the npm folder and
   PowerShell scripts, shows an "Update" tick after its version.
   - Ticking it shows its tags and details:
     - It will: install the newest release if there is one; if this one is already the newest,
       nothing changes.
     - Runs: the upgrade command.
     - Script: the helper's SHA-256.
   - "Tick all N updates" appears from two updatable rows.
   - After the run, the fresh check decides the row. It says "Updated" with the old and new
     versions, or "Already the newest" with the version. A failure is reported as on first run.
9. FR-9: A ready row's "More" offers "Reinstall" and "Uninstall…" where the helper reports
   `supportsForce` or `supportsUninstall`.
   - Reinstall becomes a ticked change in force mode.
   - Uninstall… runs the helper's uninstall dry run, which is logged as a check, and then becomes a
     ticked change. The tick shows the dry run's planned actions and a removal tag in the danger
     style.
   - A dry run that plans nothing says so and offers no tick.
10. FR-10: Changes queue together: needs rows, updates, reinstalls and removals run in row order
    under one "Apply N ticked". While one runs, the window cannot close, and other rows' controls
    are locked.

**After a check**

11. FR-11: Under the groups, a "Sign in" group lists each chosen tool that the check found ready:
    - first run's sign-in row, with its fixed command and "Open terminal and run";
    - Codex first-time setup on Windows;
    - Ollama's first-model row where Ollama is local and has no model.

    Nothing there blocks anything.
12. FR-12: Connection rows (OpenClaw, remote Ollama) keep their address field and Test connection,
    saved and tested through Runtime as on first run.

**Log and details**

13. FR-13: The log is the host's log, the same one the first-run wizard writes, read and extended
    through the bridge. It opens on a run, closes after success, stays open after a failure, and
    offers Copy all.
14. FR-14: Every failure has "Show details", which opens SPEC-054's details page in the section.
    Back returns to the rows with their state.

### Non-Functional Requirements

- **Security:**
  - The host admits helper runs, check cancellation, sign-in and Codex terminals, and Ollama list,
    download and cancel from the main window's main frame when its URL is the host's own page, or
    the app origin under `/settings/runtime`.
  - Wizard state and the restart draft stay host-page only.
  - Only a fixed helper id and mode cross IPC, plus `dryRun` for uninstall. Candidate profiles
    refuse every helper run.
  - The host runs one change at a time. A change asked for while another runs is refused, so two
    pages cannot start two installers for the same tool.
  - Limits, stated plainly:
    - The route check keeps other Platform pages from using these channels by accident. It is not
      a boundary against code on the app's own origin, which can change its URL with
      `history.replaceState`.
    - The older `cats-host:run-setup-helper` channel, which bootstrap recovery uses, still accepts
      any main-window sender. This change does not narrow it.
- **Compatibility:** no change to Runtime, host state or Platform data. This fits the `0.x` minor
  line.
- **Accessibility:** the same as SPEC-136:
  - real buttons and labels, and visible focus;
  - tick boxes reachable by keyboard;
  - `role="log"` with polite announcements, and `role="alert"` on failures;
  - contrast of at least 4.5:1;
  - reduced motion respected.
- **Layout:** the section fits the Desktop minimum window (960×600) with the sidebar open, in
  English and Traditional Chinese.

## Design Overview

The look is the first-run wizard's (`SETUP_WIZARD_CSS`):
- paper `#FAFAF7` and panel `#FFFFFF`;
- ink `#1A1A1A` and muted `#6B6560`;
- accent `#A84724` and ok `#207A53`;
- the log's ink band `#1B2233`.

Type is the wizard's sans stack, with Cascadia for commands. The log band is the one strong
element. Rows stay terse with their details collapsed, and Settings adds no new palette.

```text
Settings > Runtime (canvas)
  ┌ AI tools ──────────────────────────────────────── [Choose tools] ┐
  │ Checked at 10:42. Nothing has run since.                          │
  │ Tick all 2 required · Tick all 3 updates                          │
  │ Installed through Node.js                                         │
  │  ✓ Node.js and npm          Ready v22.11.0   ☐ Update   More      │
  │  ┆ ☐ npm installation folder  Installs global packages in…        │
  │  └ ✓ Codex                  Ready 0.58.0     ☐ Update   More      │
  │ With their own installer                                          │
  │  ☐ Claude Code   Downloads and runs claude.ai/install.ps1 …       │
  │ Sign in                                                           │
  │  ◷ Codex   Cannot tell   codex login [Copy] [Open terminal and run]│
  ├───────────────────────────────────────────────────────────────────┤
  │ 2 ticked. Windows asks for permission.  [Check again] [Apply 2]   │  sticky foot
  │ ▸ Log  10:42 check Install-Node.ps1                    [Copy all] │  ink band
  └───────────────────────────────────────────────────────────────────┘
```

- `packages/provider-setup/setupWizard.js` gains `mode: 'settings'`:
  - page 1 is the picker and page 2 holds the rows and sign-in;
  - `options.onSettingsState` keeps the session state;
  - `options.onFeedback` sends the toast.
- `packages/provider-setup/setupChrome.js` gains `layout: 'settings'`: no rail, and the log inside
  the section.
- `packages/provider-setup/setupFacts.js` gains facts for update, reinstall and uninstall.
- `desktop/host/main.ts`:
  - the sender rule;
  - facts that include upgrade, force and uninstall commands and flags;
  - run-helper modes.
- `src/app/renderer/settings/PlatformSettingsRuntime.tsx` mounts it.

## Dependencies

- Helpers' existing modes: check, apply, upgrade, force, and uninstall with dry run. No helper
  changes.
- Runtime's `/setup-state`, `/setup-selection` and `/setup-scan`.

## Open Questions

- None for implementation. A read-only update check is a separate decision (ADR-148
  Alternative 3).

## References

- [ADR-148](../decisions/148-manage-ai-tools-in-settings-with-the-first-run-wizards-rows.md)
- [SPEC-054](SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md)
- [SPEC-116](SPEC-116-desktop-provider-management.md)
- [SPEC-136](SPEC-136-desktop-first-run-wizard.md)

---

*Created: 2026-11-11*
*Author: Claude*
*Related Plan: [PLAN-131](../plans/PLAN-131-settings-ai-tools.md)*
