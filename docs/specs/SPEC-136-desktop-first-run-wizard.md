# SPEC-136: Desktop First-Run Wizard

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Approved by the owner after an interactive mock, 2026-11-04. Implementation in progress under PLAN-130 |
| **Owner** | Product owner |
| **Reviewer** | Independent agent before each merge |
| **Related decision** | [ADR-146](../decisions/146-make-desktop-first-run-one-wizard-that-runs-only-what-the-owner-asks.md) |
| **Related plan** | [PLAN-130](../plans/PLAN-130-desktop-first-run-wizard.md) |
| **Updates** | SPEC-116 FR-2, FR-3, FR-11 and FR-12 for onboarding; SPEC-054's entry points; SPEC-129's setup page layout, not its account rules |

## Summary

First run becomes one five-step wizard. The Desktop host draws tools, this computer and
sign-in; Platform draws your account, and Catlas and start. Nothing runs until the owner asks,
every script that changes the computer is ticked by the owner, a log shows what ran, and every
failure reaches the details page. Settings > Runtime keeps its rows.

## Goals

- Choosing or looking at a tool starts no process.
- A person can read what each script does before it runs, and see afterwards what it did.
- A clean computer reaches a working tool without a relaunch on the normal path.
- Any failure says what happened and offers the evidence, and none of them traps the person.
- Tools sit in the same order everywhere in Cats.

## Non-Goals

- Changing helper scripts or their JSON contract.
- An embedded terminal or live helper output.
- Redesigning Settings > Runtime, the Environment entry (SPEC-053) or the post-setup recovery
  behavior beyond its entry points.
- Removing the prerequisite audit from launches after setup is complete.
- Changing account, Google or session rules (SPEC-129).
- Running installers or sign-in as an agent verification step (SPEC-116 non-goal stands).

## User Stories

- As a person on a clean computer, I want to see what each script does before it runs, so I can
  decide or do it myself.
- As a person who changed their mind about a tool, I want nothing to have run yet.
- As a person whose install failed, I want to skip it, and to have what support would ask for.
- As a person with Ollama on another computer, I want Cats to connect without installing anything.

## Requirements

### Functional Requirements

**The wizard**

1. FR-1: The host's bootstrap page shows pages 1–3 wherever it shows onboarding today
   (`resolvePageMode` returns `onboarding`). Platform's `/setup` shows pages 4–5. When setup is
   already complete and only the selection is missing, the rail has steps 1–3, and the last
   button opens Cats instead of account setup.
2. FR-2: A rail on the left lists the steps, each with its title and a one-line promise. A
   finished step can be revisited until the final button is pressed, except while a script, a
   pull, a hand-off or the final request runs. A skipped step shows as skipped. Below 720 px of
   width the rail collapses to a row of numbers.
3. FR-3: Every page fits the Desktop minimum window (960×600) in English and Traditional Chinese
   with the log closed. Page bodies scroll; the footer stays in one place. Each page change moves
   focus to its heading.
4. FR-4: Text is in English and Traditional Chinese, from `resolveBootstrapLocale` until the
   person changes it. Page 1 has a language selector, which also sets Platform's language
   preference at hand-off. Catalog, helper and CLI text is shown as reported.

**Page 1: choose tools**

5. FR-5: Page 1 reads `/setup-state` and packaged helper facts only. It starts no process and
   scans no PATH. No tool is preselected. An existing selection loads ticked, and a selected tool
   stays visible.
6. FR-6: Tiles follow `PRODUCT_PROVIDER_ORDER`, with native and npm tools mixed. Collapsed, the
   grid shows Codex, Claude and Antigravity (those three in selector order), plus any
   selected tool, and a "Show N more" tile. There is no search field. Ollama and OpenClaw are
   separate groups, always visible. Custom targets stay as they are, and a footnote says so.
7. FR-7: A tile states how the tool arrives: "Needs Node.js", "Official installer", "Runs models on
   this computer" or "Connects to a running gateway".
8. FR-8: The footer button reads "Check this computer", and its hint says how many read-only checks
   run. It saves with `expectedRevision` and then runs them. With nothing ticked it reads "Continue
   without tools", saves an empty selection, marks steps 2–3 skipped and hands off to page 4.
9. FR-9: Page 1 covers these states without losing ticks:
   - catalog still loading: placeholders, button disabled;
   - catalog unreadable: alert, Try again, details;
   - connection lost after loading: alert, Reconnect, details;
   - `providers.yaml` unreadable: alert naming the file, stating that saving replaces it and keeps a
     backup (FR-40);
   - changed elsewhere: alert, Reload, which replaces the ticks;
   - saved but not reloaded by Runtime: alert saying nothing needs choosing again, Try again.

**Page 2: this computer**

10. FR-10: Pressing the button is the consent. Rows run their helpers in `check` mode, read-only,
    only after the button, "Check again" or a row's "Check this again". Back cancels a running
    check and keeps results. No check starts when the page is revisited: it shows the last results
    and says when they were read.
11. FR-11: Rows are grouped by dependency, and the owner confirmed this on 2026-11-04. In a group,
    tools follow `PRODUCT_PROVIDER_ORDER`.
    - "Installed through Node.js": Node.js and npm, the npm folder, then npm tools, drawn as a stem
      from Node.js. Shown when an npm tool is chosen.
    - "With their own installer": the Visual C++ runtime when a chosen tool needs it (Windows),
      GitHub CLI when Copilot is chosen, then native tools.
    - "Local models and connections": Ollama, OpenClaw.
    - "Optional, and fine to leave for later": Git, and PowerShell scripts on Windows.

      These never count as pending and never block anything.
12. FR-12: Reading order: Node.js first. While it is not ready, the npm folder and npm tools wait
    unread, because their plans cannot be known. Everything else is read together, with a bounded
    number at once. A row that fails its check does not stop the others.
13. FR-13: After the helpers, one Runtime scan of the chosen targets, without connection rows, records observations for the
    sign-in page and Catlas. A failure there is an alert on the page
    that does not claim tools are missing, with Check again, Skip and details.
14. FR-14: A row has one state:
    - ready, with version;
    - needs work, with a tick box;
    - waiting on Node.js, grey, with no tick box;
    - queued or running, with a timer;
    - failed, including a declined elevation prompt, which says nothing changed;
    - check failed, with "Check this again" and details;
    - installed but not found, with Check again first and Restart Cats after;
    - install it yourself, where this OS has no helper, with the documentation link.
15. FR-15: Every script that changes anything runs only if ticked, and all are unticked by default.
    "Tick all N required" appears from two required tickable rows, ticks required rows only and turns
    into its undo. A helper's `supportsApply: false` shows the manual step and no tick box.
16. FR-16: A needs-work row shows a plain summary and tags for its consequences. Its details are
    collapsed, and only a failed row's open by themselves. The details hold what the helper reports
    it would do (`plannedActions`, verbatim), the command that really runs, the SHA-256 of the file about
    to run, and a command for doing it by hand with a copy button.
    Tags follow the OS and the plan: administrator rights, a download, a remote install script,
    winget's agreements, the user PATH, npm settings, the PowerShell policy, a shell profile, removal
    of an old npm package, a background program, restarting Cats.
17. FR-17: "Apply N" runs ticked rows one at a time from the top, then re-reads that row and any row
    that was waiting on it. "Stop after this one" keeps the remaining ticks. A failure stops the queue
    and keeps the remaining ticks; the footer then offers Try again and Skip. While a script runs, the
    window cannot close and rail steps are locked.
18. FR-18: The next button reads "Next" when nothing is pending and "Skip for now, next" otherwise, and
    the latter is not the primary button. No failed row or unticked row blocks it (SPEC-116 FR-8).
    With nothing to sign in to and no Ollama model to get, it skips page 3.
19. FR-19: Ollama's row shows three stages: install, start the service, get a model. On an OS with no
    Ollama helper it is an "install it yourself" row with the download link. "Use Ollama on another
    computer" turns the row into a connection row, and "Use this computer" turns it back.
20. FR-20: A connection row (OpenClaw, remote Ollama) never says "installed". It has an address field,
    validated by the same rules as Runtime, and a Test connection button. Saving the address and testing
    use Runtime's `PUT /setup-selection` and `POST /setup-scan` with `includeConnections: true`. Checking
    this computer does not test connections. Editing an address after a test asks for a new test.

**The log**

21. FR-21: The log is a read-only text area across the window's foot, one line when closed.
    - Each run adds its time, kind (check, change, terminal or service), command and the helper's reported
      status, version, plan, changes and warnings. A stopped or failed run says so in red. A run in
      progress shows a timer.
    - Any run opens it. It closes about 1.4 s after success, stays open after a failure, and waits while
      the pointer is on it.
    - Once the person toggles it, it stays as they set it, except that a failure opens it.
    - "Copy all" copies it.
22. FR-22: The host owns the log, in memory, for the life of the process, bounded to the latest 500 runs.
    The Platform pages read and extend the same log through the bridge. A password is never in it, and
    `/setup/complete` shows `(not logged)` in its place. `host.log` records each finished run in fixed
    words only: kind, helper ID, status, change count, duration (ADR-145).

**Page 3: sign-in and models**

23. FR-23: Page 3 has one row per chosen tool that page 2 found ready. A row's state comes from Runtime's
    `authStatus`: signed in, not signed in, or "cannot tell". Tools not installed are named in a footnote.
    Nothing on this page blocks moving on.
24. FR-24: "Open terminal and run" opens a new terminal with a fixed command per provider, and no text from
    the page or a model reaches it. Fixed commands: `claude`, `codex login`, `agy`, `grok login`,
    `muse login`, `kilo auth`, `goose configure`, `cline auth` and `devin auth login`. Others show Runtime's
    hint and documentation link until someone verifies a command. Where no terminal is found, the row says
    so and the command can be copied. After a change, the row says terminals already open need reopening to
    see the new PATH.
25. FR-25: Where Ollama is usable and has no models, a row offers a first download with a name field and
    suggestions taken only from Runtime's curated catalog for Ollama. Never invent names. It shows progress,
    a Stop button and any failure with Try again. It works only against a loopback endpoint Runtime has saved
    for the local target. The name must match `^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$`.
26. FR-26: "Continue to your account" hands off to `/setup`. If Platform does not answer, an alert says so,
    everything so far is kept, and it offers Try again and details.

**Page 4: your account**

27. FR-27: Page 4 keeps SPEC-129's methods and rules, with the method as two choices. Google without a client
    is disabled with its reason. Password: 8 to 256 code points, no composition rules, with Show. A password
    must be valid to press Next. Messages appear after a field loses focus or on Next, and update without
    re-rendering, so typing and IME composition are not disturbed.
28. FR-28: Nothing is created on this page. Going back to a host page keeps the name and email for this
    window's session. The password is held only in memory and is asked for again. Google verification is
    discarded and must be repeated, because its proof is bound to the transaction (SPEC-129 AUTH-06).

**Page 5: Catlas and start**

29. FR-29: Page 5 offers "Turn on Catlas" or "Not now". On first arrival Catlas is on when some tool is usable,
    and off otherwise. A single usable tool is selected by itself.
30. FR-30: The tool list follows `PRODUCT_PROVIDER_ORDER`. A usable row is a radio with its sign-in state. An
    unusable row says why and links back to the page that fixes it. A tool not signed in stays selectable,
    with a note. The model and control fields are Platform's `ProviderModelFields`, under SPEC-013's continuity
    contract: options are retained across failures and recover by themselves with a spinner, so this page adds no
    error text, Retry button or Runtime Setup link around them, even though the mock showed some. A menu mirrors the
    CLI's own picker and never invents an option.
31. FR-31: On Desktop, "Start Cats when I sign in" is a checkbox, ticked by default, tagged "Changes your login
    items". The final button writes the choice. Until setup is complete Desktop registers no login item, so
    someone who quits on page 1 does not find Cats starting at their next sign-in.
32. FR-32: Before the final button, a list states what it does: the admin account and its email or Google, Catlas
    with its tool and model or off, start at login when ticked, and opening the Lobby. It also states how many
    changes setup made to the computer.
33. FR-33: A refusal keeps everything entered. `invalid_admin_credentials` returns to page 4 with focus on the
    password. `already_complete` offers Go to sign-in. A network failure says it may or may not have finished, and
    retrying is safe. An expired Google proof offers Verify again.

**Details**

34. FR-34: "Show details" appears on every failure message and failed row, on page 1–5 and on the recovery and slow
    start screens, except the picker in FR-30, which reports no failures. The recovery row is Try again, Show details,
    Quit Cats. It is not offered without a Desktop host.
35. FR-35: The details page follows SPEC-054: one summary card with a plain title and one or two sentences; at most
    three buttons, with Quit Cats always among them and Open Runtime Diagnostics never; collapsed sections "What needs
    attention", "Service status", "Advanced diagnostics" and "Advanced logs and paths". "Copy diagnostics" sits in the summary card.
    Open Runtime Diagnostics is disabled with a reason when Runtime is down. Back or Esc returns to the same page with
    its state and focus. Choosing a rail step also leaves it.
36. FR-36: The diagnostics section lists the attempt ID and recent events for that attempt. The reason the person came
    from comes first, with its raw error.
37. FR-37: New events, through `appendHostEvent` for the host and the existing product events for Platform:
    - host: `selection_saved`, `selection_save_failed`, `connection_tested`, `connection_test_failed`, `model_pulled`,
      `model_pull_failed`, `terminal_opened`, `terminal_open_failed`, `setup_open_failed`, `scan_failed`;
    - product: `setup_rejected`, carrying the refusal code and no field values.

    Error text is subject to the same redaction as other events. An event never holds a password, proof or token.
38. FR-38: The Platform bridge exposes what pages 4–5 need: the host snapshot's diagnostics, the log and whether this is a
    Desktop session. Running a helper, opening a terminal, pulling a model and saving wizard state are refused unless the
    sender is the host's own page. Platform's pages may add their final request to the log, and the host fixes its kind and
    label; they can finish only a run they started.

**After an install**

39. FR-39: No step needs a relaunch on the normal path. Each helper run reads PATH afresh. When a helper asks for a restart
    and the fresh check cannot confirm the step, the row says it is installed but not found yet. Restart keeps the page,
    the ticks and how many changes setup made so far through a draft file read once and removed at the next start.

**Runtime**

40. FR-40: Before `ProviderSelectionService.save` replaces a `providers.yaml` it could not parse, it copies the file to a
    timestamped sibling, with owner-only permissions, and keeps the latest five. A failed copy refuses the save and leaves
    the file as it is. A readable file gets no backup.

**Removal**

41. FR-41: Onboarding's provider cards, Apply, "Detect after applying" and their tests go away in the same change, with
    the unused card code in the bootstrap page. `context: 'onboarding'` leaves the shared manager, and Settings keeps its
    behavior.

### Non-Functional Requirements

- **Security:**
  - Setup IPC stays limited to the main window's main frame, and takes a fixed helper, action and provider. No path, argument
    or free text crosses it, except a model name checked against FR-25's pattern.
  - An Ollama pull goes only to a loopback endpoint.
  - The page inserts text through DOM properties or an escape function. Helper output is treated as text.
  - A command for doing it by hand is product text or Runtime's catalog, shown to copy, and is never run by the page.
- **Compatibility:** no change to Runtime routes, host state or Platform's stored data. Later launches and Settings behave as
  before. This fits the current `0.x` minor line.
- **Accessibility:** real buttons and labels, visible focus, reduced motion respected, text contrast of at least 4.5:1, `role="log"`
  with polite announcements, `role="alert"` on failures, tick boxes reachable by keyboard.
- **Performance:** at most four helper checks at once. A slow check gets a 120 s limit and becomes a check failure.
- **Localization:** page text in English and Traditional Chinese, in the host's copy and Platform's catalogs.

## Design Overview

The host's page has no imports, so its shared code is self-contained functions embedded through `.toString()`, as the provider
manager is today. Platform mounts the same chrome in React, as Settings mounts the manager.

```text
Host page (desktop/host/bootstrapPage.ts)        Platform (/setup, React)
  splash, recovery                                 PlatformSetupWizard: pages 4, 5
  mountSetupWizard: pages 1, 2, 3                  GuideCatSetupFields, ProviderModelFields
        |                                                  |
        +------- mountSetupChrome: rail, log, details -----+
                 setupRowFacts, SETUP_WIZARD_CSS
                 (packages/provider-setup/)
                        |
              window.catsDesktopHost (preload)
                        |
Host main: runSetupAction, DesktopProviderManager, setupRunLog, setupTerminal, ollamaModels
                        |
              Runtime: /setup-state, /setup-selection, /setup-scan
```

- `packages/provider-setup/setupWizard.js`: pages 1–3.
- `packages/provider-setup/setupChrome.js`: rail, log and details.
- `packages/provider-setup/setupFacts.js`: summary, tags and manual command per row and OS.
- `packages/provider-setup/setupWizardStyles.js`: the tokens and CSS.
- `desktop/host/setupRunLog.ts`: the host's log.
- `desktop/host/setupTerminal.ts`: fixed commands, per OS, from Cats Bot.
- `desktop/host/ollamaModels.ts`: list and pull against a loopback endpoint.
- `desktop/host/setupWizardDraft.ts`: the draft kept across a restart.
- `src/app/renderer/setup/`: pages 4–5.

Host-side operations stay shared with Settings: `DesktopProviderManager` for save and scan, and `runSetupAction` for helpers.
The wizard calls a helper directly with `apply`, so `ensureNpmPrerequisites` stays Settings' behavior alone.

## Dependencies

- Helpers' existing JSON fields; no helper changes.
- Runtime's `/setup-state`, `/setup-selection`, `/setup-scan`, and the backup in FR-40.
- Platform's `ProviderModelFields` and `useDesktopGoogleAuth`.

## Open Questions

- None for implementation. ADR-146's D1–D3 are recorded for the owner to confirm, and code follows the approved mock until told
  otherwise.
- The mock's two extra Ollama suggestions (`llama3.2`, `gemma3`) are not in any catalog. FR-25 drops them, and the only suggestion
  today is `qwen2.5-coder:7b`.

## References

- [ADR-146](../decisions/146-make-desktop-first-run-one-wizard-that-runs-only-what-the-owner-asks.md)
- [SPEC-013](SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [SPEC-054](SPEC-054-bootstrap-recovery-summary-and-bounded-detail-actions.md)
- [SPEC-116](SPEC-116-desktop-provider-management.md)
- [SPEC-129](SPEC-129-desktop-admin-bootstrap-and-google-sign-in.md)
- [Cats Bot SPEC-010](https://github.com/cats-inc/cats-bot/blob/main/docs/specs/SPEC-010-setup-wizard.md)

---

*Created: 2026-11-04*
*Author: Claude*
*Related Plan: [PLAN-130](../plans/PLAN-130-desktop-first-run-wizard.md)*
