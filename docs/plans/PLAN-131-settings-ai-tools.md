# PLAN-131: Settings AI Tools

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In progress |
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

- [ ] The sender rule: the host's own page, or the main frame at the app origin under
      `/settings/runtime`, for run-helper, cancel-checks, open-terminal, Codex initialization
      open, and Ollama list, download and cancel.
- [ ] Run-helper accepts check, apply, upgrade, force and uninstall, with `dryRun` for uninstall
      only. Candidate profiles refuse every change.
- [ ] Facts carry the upgrade, force and uninstall commands and the `supports*` flags.
- [ ] Tests for the sender rule and the payload checks.

### Phase 2: The module

**Goal:** the same rows in a Settings layout (FR-1 to FR-14).

- [ ] Chrome `layout: 'settings'`: no rail; the log and foot stick to the section's bottom; the
      details page opens in place.
- [ ] Wizard `mode: 'settings'`:
  - [ ] passive row states before a check;
  - [ ] the picker behind Choose tools;
  - [ ] update, reinstall and uninstall changes;
  - [ ] the sign-in group under the rows;
  - [ ] session state through `onSettingsState`;
  - [ ] save failures through `onFeedback`.
- [ ] Facts for the three changes.
- [ ] The first-run wizard's behavior is unchanged: its renderer checks pass as they are.

### Phase 3: Settings

**Goal:** Settings > Runtime shows it, and the old presentation is gone (FR-1, FR-6).

- [ ] `PlatformSettingsRuntime.tsx` mounts the module with toasts and session state.
- [ ] Remove `mountProviderManager` and its view tests; keep the type declarations the host and
      preload use.
- [ ] Renderer checks in headless Chrome with a fake host:
  - [ ] passive state;
  - [ ] a check;
  - [ ] ticks and Apply;
  - [ ] Update before and after;
  - [ ] uninstall dry run;
  - [ ] sign-in;
  - [ ] a failure with details;
  - [ ] in both languages, at the Desktop minimum window.

### Phase 4: Acceptance

- [ ] An isolated candidate on Windows renders the section against real helper checks. Candidates
      refuse changes, so applying stays covered by the fake host only.
- [ ] Not on this machine's real profile: an Update would change the owner's CLIs.

## Validation

To be recorded at merge.

## References

- [ADR-147](../decisions/147-manage-ai-tools-in-settings-with-the-first-run-wizards-rows.md)
- [SPEC-137](../specs/SPEC-137-settings-ai-tools.md)
- [PLAN-130](PLAN-130-desktop-first-run-wizard.md)
