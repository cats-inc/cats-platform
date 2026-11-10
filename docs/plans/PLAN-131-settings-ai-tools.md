# PLAN-131: Settings AI Tools

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented; real installs, updates and removals unverified (candidates refuse helpers) |
| **Owner** | Product owner |
| **Assigned To** | Claude |
| **Reviewer** | Independent agent before merge |

## Related Spec

[SPEC-137: Settings AI Tools](../specs/SPEC-137-settings-ai-tools.md), under
[ADR-147](../decisions/147-manage-ai-tools-in-settings-with-the-first-run-wizards-rows.md).

## Overview

One change on Desktop: the host admits Settings > Runtime to the wizard's channels, the wizard
module gains a Settings layout, and Settings mounts it in place of the old manager. Cats Bot's
matching change (a hub "Agent CLIs" tab) is its own plan in that repository. No version bump or
publication is part of this plan.

## Implementation Phases

### Phase 1: Host

**Goal:** Settings > Runtime can run what the rows need, and nothing else widens (FR-8 to FR-11,
NFR Security).

- [x] The sender rule: the host's own page, or the main frame at the app origin under
      `/settings/runtime`, for run-helper, cancel-checks, open-terminal, Codex initialization
      open, and Ollama list, download and cancel.
- [x] Run-helper accepts check, apply, upgrade, force and uninstall, with `dryRun` for uninstall
      only. Candidate profiles refuse every change.
- [x] Facts carry the upgrade, force and uninstall commands and the `supports*` flags.
- [x] Tests for the sender rule and the payload checks.

### Phase 2: The module

**Goal:** the same rows in a Settings layout (FR-1 to FR-14).

- [x] Chrome `layout: 'settings'`: no rail; the log and foot stick to the section's bottom; the
      details page opens in place.
- [x] Wizard `mode: 'settings'`:
  - [x] passive row states before a check;
  - [x] the picker behind Choose tools;
  - [x] update, reinstall and uninstall changes;
  - [x] the sign-in group under the rows;
  - [x] session state through `onSettingsState`;
  - [x] save failures through `onFeedback`.
- [x] Facts for the three changes.
- [x] The first-run wizard's behavior is unchanged: its renderer checks pass as they are.

### Phase 3: Settings

**Goal:** Settings > Runtime shows it, and the old presentation is gone (FR-1, FR-6).

- [x] `PlatformSettingsRuntime.tsx` mounts the module with toasts and session state.
- [x] Remove `mountProviderManager` and its view tests; keep the type declarations the host and
      preload use.
- [x] Renderer checks in headless Chrome with a fake host:
  - [x] passive state;
  - [x] a check;
  - [x] ticks and Apply;
  - [x] Update before and after;
  - [x] uninstall dry run;
  - [x] sign-in;
  - [x] a failure with details;
  - [x] in both languages, at the Desktop minimum window.

### Phase 4: Acceptance

- [x] An isolated Windows candidate rendered the section in the real Settings page. It showed the
      passive state, the picker, saving and checking, and the log. The candidate has no packaged
      helpers, so its rows were hand-install rows. That exposed a fix: a tool Runtime finds is ready
      even without a helper.
- [ ] A packaged build checks, installs, updates and removes a tool on a clean machine. Not run:
      candidates refuse helper runs, and running them on this machine's real profile would change the
      owner's CLIs.

## Validation

- `scripts/test-first-run-wizard-renderer.mjs`, real modules in headless Chrome with a fake host:
  65 of 65.
  - The 53 first-run checks are unchanged.
  - The 12 Settings checks cover: nothing runs on open; the settings read context; ticks and Apply;
    Update before and after; Uninstall's dry run; an empty dry run; a failed save as a toast; session
    state; sign-in; a failed update with details and Try again; a tool found without a helper; and
    layout at 700×600 in both languages.
- `tests/setup-wizard-host.test.js` (sender rule, helper request): 18 of 18. Affected suites:
  107 of 107.
- `tsc` for the desktop, renderer, server and test projects. The only errors are in `mobile/`, whose
  dependencies are not installed here.

## References

- [ADR-147](../decisions/147-manage-ai-tools-in-settings-with-the-first-run-wizards-rows.md)
- [SPEC-137](../specs/SPEC-137-settings-ai-tools.md)
- [PLAN-130](PLAN-130-desktop-first-run-wizard.md)
