# PLAN-130: Desktop First-Run Wizard

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented, uncommitted, awaiting the owner. Clean-machine acceptance pending |
| **Owner** | Product owner |
| **Assigned To** | Claude |
| **Reviewer** | Independent agent before each merge |

## Related Spec

[SPEC-136: Desktop First-Run Wizard](../specs/SPEC-136-desktop-first-run-wizard.md), under
[ADR-146](../decisions/146-make-desktop-first-run-one-wizard-that-runs-only-what-the-owner-asks.md).

## Overview

The owner reviewed an interactive mock through several rounds on 2026-11-04 and approved it. The
order keeps the app working at each step: the old onboarding runs on the new backend until Phase 3
replaces it, and the background audit stops only when the wizard that replaces it lands.

Commits and pull requests wait for the owner's word. No version bump or publication is part of
this plan.

## Implementation Phases

### Phase 1: Runtime backup

**Goal:** saving over an unreadable `providers.yaml` keeps a copy (FR-40). A separate Runtime change,
under Runtime's own rules.

- [x] `ProviderSelectionService.save` copies an unparsable file to a timestamped sibling, keeping the
      latest five, and refuses the save when the copy fails.
- [x] Vitest coverage with an isolated runtime directory.

### Phase 2: The host backend

**Goal:** everything the pages need, with the old page still working (FR-21, FR-22, FR-24, FR-25,
FR-37 to FR-39).

- [x] `setupRunLog.ts`: bounded runs, events to the main window, fixed-word records in `host.log`.
- [x] `runSetupAction` opens and closes a run with the real command line.
- [x] `setupTerminal.ts`: fixed sign-in commands per OS; port and tests from Cats Bot.
- [x] `ollamaModels.ts`: list and pull with progress and cancel, loopback only.
- [x] `setupWizardDraft.ts`: read once, removed at next start.
- [x] New event kinds with labels in the bootstrap page's copy.
- [x] Facts IPC: script SHA-256, sign-in commands, curated Ollama names.
- [x] Main-window close guard while a change or a pull runs.
- [x] Preload and bridge types, under the main-window sender checks.

### Phase 3: Pages 1–3

**Goal:** the host half of the wizard (FR-1 to FR-20, FR-23 to FR-26, FR-34 to FR-36, FR-41).

- [x] `packages/provider-setup/`: `setupWizard.js`, `setupChrome.js`, `setupFacts.js`,
      `setupWizardStyles.js`, each self-contained, with `.d.ts` files.
- [x] `bootstrapPage.ts` mounts the wizard; the recovery row becomes Try again, Show details, Quit Cats.
- [x] Remove onboarding cards, Apply and "Detect after applying", and `context: 'onboarding'` from the
      manager. Settings keeps working.
- [x] Gate the background audit and first-run scan on setup completion (FR-5, FR-10).
- [x] `tests/desktop-provider-selection-page.test.js`: the real page in jsdom with a fake bridge.
- [x] `scripts/test-first-run-wizard-renderer.mjs`: the real page in headless Chrome with a fake host,
      in both languages and both window sizes.

### Phase 4: Pages 4–5

**Goal:** the Platform half (FR-27 to FR-33, FR-37, FR-38).

- [x] `PlatformSetupWizard` with the rail, log and details from `setupChrome.js` on Desktop.
- [x] `flow.ts`, account page and Catlas page, with the summary list.
- [x] Start at login applied after the final button succeeds.
- [x] `setup_rejected` in `platformSetupRoutes.ts`.
- [x] Message catalogs in both languages.
- [x] Renderer tests for each refusal, the browser-only path and the back path.

### Phase 5: Acceptance and documents

**Goal:** what can be shown on real machines, and documents that match.

- [x] Drive the real main process, preload and pages in an isolated candidate profile, on the read-only
      path. No script that changes this machine runs.
- [x] `docs/setup-guide.md`, `docs/testing.md`, `docs/deployment.md` if touched, and the pending notes in
      SPEC-054, SPEC-116, ADR-116 and ADR-144.
- [x] Independent review of the whole change.
- [ ] Still needs a person or a clean machine. None of this has been run:
  - installs through the wizard on a clean Windows 11 VM, including declining UAC;
  - first runs on macOS and Linux;
  - opening a real terminal on each OS, and signing in through it;
  - pulling a real Ollama model;
  - start at login left unticked on an installed copy;
  - restarting Cats from the wizard, on an installed copy.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/provider-setup/setupWizard.js`, `.d.ts` | Create | Pages 1–3 |
| `packages/provider-setup/setupChrome.js`, `.d.ts` | Create | Rail, log, details |
| `packages/provider-setup/setupFacts.js`, `.d.ts` | Create | Summary, tags, manual command per row and OS |
| `packages/provider-setup/setupWizardStyles.js`, `.d.ts` | Create | Tokens and CSS |
| `packages/provider-setup/manager.js`, `.d.ts` | Modify | Remove the onboarding presentation |
| `desktop/host/setupRunLog.ts`, `setupWizardEvents.ts` | Create | Host-owned log |
| `desktop/host/setupTerminal.ts` | Create | Fixed sign-in commands per OS |
| `desktop/host/ollamaModels.ts` | Create | List and pull, loopback only |
| `desktop/host/setupWizardDraft.ts` | Create | Draft across a restart |
| `desktop/host/main.ts`, `preload.cts`, `contracts.ts`, `setupBridge.ts` | Modify | IPC, events, gating, close guard |
| `desktop/host/bootstrapPage.ts` | Modify | Mount the wizard, recovery row, remove cards |
| `src/app/renderer/setup/*` | Modify | Pages 4–5 |
| `src/shared/desktopRecoveryBridge.ts` | Modify | Bridge types |
| `src/shared/i18n/*` | Modify | New strings in both languages |
| `src/app/server/platformSetupRoutes.ts` | Modify | `setup_rejected` |
| `cats-runtime: src/core/bootstrap/ProviderSelectionService.ts` | Modify | FR-40 |
| `tests/setup-wizard-host.test.js`, `tests/platform-setup-wizard-pages.test.tsx` | Create | Behavior above |
| `tests/provider-manager-view.test.js`, bootstrap page tests | Modify | Settings only; new page |
| `scripts/test-first-run-wizard-renderer.mjs` | Create | Real page, fake host |

## Technical Decisions

- **Self-contained functions, not a bundle.** The host page already embeds the manager through
  `.toString()`. A bundling step would add a build dependency to the one page that must always work.
- **The wizard calls helpers directly.** `ensureNpmPrerequisites` would install what no one ticked.
- **The host owns the log.** The bootstrap page is replaced at hand-off, so the renderer cannot keep it.
- **Read the SHA-256 from the file about to run**, not a manifest, so the page states what really runs.
- **Keep React for pages 4–5.** SPEC-013's picker contract and SPEC-129's Google flow already live there.
- **Page 1 reads, it does not probe.** `getProviderSetup('onboarding')` stays passive, and its hold on
  navigation stays.

## Testing Strategy

- **Unit:** run log bounds and redaction; terminal tables per OS; Ollama loopback and name rules; draft
  validation; row layout and reading order; event mapping.
- **Renderer:** the real page with a fake host, adapted from the mock's verification, for all pages and
  failures in both languages, at 960×600 and 1280×800.
- **Runtime:** backup, retention and refusal, under `createRuntimeTestEnv`.
- **Manual:** the Phase 5 list, reported as not done until someone does it.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Gating the audit hides prerequisite state that a later page relied on | Medium | Gate only until setup is complete; wizard runs its own check; tests cover the recovery path |
| Helper output differs per OS, and the mock used Windows samples | Medium | Rows read structured fields only; unknown states become a check failure; macOS and Linux acceptance is listed |
| The embedded page grows beyond what `.toString()` handles | Low | Each function stays import-free; a test parses the built page |
| A person leaves mid-install | Medium | Close guard; a failed or stopped run stays in the log; Settings can finish the work |
| `/setup` reload loses a typed password on the back path | Low | Stated on the page; only name and email are kept |

## Progress Log

| Date | Update |
|------|--------|
| 2026-11-04 | Plan created after the owner approved the mock |
| 2026-11-04 | Phases 1 to 4 implemented, uncommitted in worktrees. Runtime: 31 passed, and the refused-backup case is skipped on Windows |
| 2026-11-04 | A real Electron candidate found what tests could not: Platform's `.setupWizard` CSS narrowed the page to 460px, and a focus change showed the name error on arrival. Both fixed |
| 2026-11-04 | All 23 row helpers ran in check mode through the host's own code on the development machine: statuses `ready`, `auth_required`, `not_installed`, nothing applied |
| 2026-11-04 | Validation on the final code. Real page with a fake host: `scripts/test-first-run-wizard-renderer.mjs`, 44 of 44. Affected suites with each file isolated: 1,236 passed, 7 skipped, 1 failed: `desktop renderer CDP writes the decoded screenshot`, in a file this change does not touch. It also fails on the unmodified main checkout on this machine, expecting a Unix file mode on Windows. The old `platform-setup-wizard-auth-fields` Catlas test also failed on unmodified main here, because its fixture answered `native` for a request about `cli/native`; its rewrite answers for the target asked about. `tests/package-contract.test.js` did not finish locally because its build includes Mobile, so it is left to CI; `npm pack --dry-run` lists the new modules. Full `npm test` was not run |
| 2026-11-04 | Isolated Electron candidates, Windows: real main process, preload, Runtime and Platform. Tools to Lobby, back from Platform to page 2 and forward, start at login unticked persisted as false, `host.log` holding fixed words. A candidate cannot run helpers, so ticking and applying were not exercised in Electron |
| 2026-11-04 | CI caught what the focused local run could not: the new pages test left a stubbed `fetch` behind in the shared test process, which failed 18 later router and channel tests; it read `sessionStorage`, which Node 26 has and CI's Node 24 does not; and a raw "Google" string failed the localization audit. All fixed in the test and the page |
| 2026-11-04 | Independent review, fixed before handing back: the Windows terminal never ran its command because an unquoted `start` title is read as the program; the login item was registered at first launch; Platform pages could reach helper IPC; page text could reach `host.log`; page 5 undercounted changes; a failed save disabled the main button; Back during a scan broke the next save; a data reset restored stale wizard state; a stale ticket could orphan an apply; a restored page could be stuck on a skeleton |

---

*Created: 2026-11-04*
*Author: Claude*
