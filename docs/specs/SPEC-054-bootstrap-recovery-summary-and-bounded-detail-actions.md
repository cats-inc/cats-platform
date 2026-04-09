# SPEC-054: Bootstrap Recovery Summary and Bounded Detail Actions

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | User |
| **Reviewer** | Codex |

## Summary

The current desktop bootstrap recovery/details page is too close to an
engineering dump:
it mixes service state, runtime state, prerequisites, packaged setup, and
diagnostics in one flat page, and it can show too many competing actions at the
same time.

This spec keeps the existing bootstrap pipeline and diagnostics depth, but
restructures the user-facing recovery/details page into a summary-first,
bounded-action surface:

- the top of the page should explain the problem in human language
- the main action row should stay stable and capped
- `Quit Cats` should remain visible in the same row because window close may
  minimize to tray instead of exiting the app
- low-level diagnostics should remain available, but collapsed by default
- the page should stay understandable to ordinary users without hiding
  technical evidence from power users

The recovery/details page should feel like a receptionist with receipts, not a
raw debug dump.

## Goals

- keep the existing bootstrap and diagnostics behavior intact
- make the recovery/details page understandable within a few seconds
- cap visible recovery actions so users do not have to compare many competing
  buttons
- keep `Quit Cats` visible in the main action row for tray-mode safety
- preserve technical evidence for power users behind expandable sections
- remove action-priority ambiguity such as `Retry` appearing with different
  visual weight in different states

## Non-Goals

- skipping provider diagnostics, setup audit, or bootstrap checks
- redesigning the post-setup product `Environment` entry from [SPEC-053](./SPEC-053-post-setup-environment-status-and-recovery-entry.md)
- moving runtime or packaged-setup ownership out of the desktop host
- inventing new host actions beyond the existing `retry`, `resume_setup`,
  `open_setup`, `open_chat`, `open_runtime_diagnostics`, and `quit`
- turning the bootstrap page into a second full runtime dashboard
- changing the bootstrap loading screen pacing or slow-hint strategy in this
  spec

## User Stories

- As a first-run user, if startup fails before setup, I want one clear summary
  and a small set of actions so I know whether to retry or continue into setup.
- As a returning user, if Cats can still open but runtime repair is needed, I
  want the page to tell me that I can safely enter Cats first.
- As a tray-mode desktop user, I want an explicit `Quit Cats` action because
  closing the window may only minimize to tray.
- As a power user, I want service state, diagnostics, and paths to remain
  available, but only when I ask for them.

## Requirements

### Functional Requirements

1. The desktop bootstrap recovery/details page shall begin with one summary
   card before any raw diagnostics sections.
2. That summary card shall contain:
   - a plain-language title
   - a one- or two-sentence summary
   - one stable main action row
3. The main action row shall show at most three buttons at once.
4. Those three action slots shall have fixed semantics:
   - a **continue** slot
   - a **repair** slot
   - a **quit** slot
5. The continue slot may show at most one of:
   - `Continue to Setup`
   - `Open Setup`
   - `Open Cats`
6. The repair slot may show at most one of:
   - `Retry Startup`
   - `Retry Check`
   - `Resume Setup`
7. The same state shall never show both `Retry*` and `Resume Setup` in the
   main action row at the same time.
8. The quit slot shall render `Quit Cats` in the same action row rather than
   moving it into a footer or overflow menu.
9. `Open Runtime Diagnostics` shall not appear in the main action row. It shall
   move into a lower-level expandable section.
10. The recovery/details page shall expose a visible way to collapse or leave
    the detailed mode after the user enters it from `Show details`.
11. Low-level sections shall be collapsed by default.
12. The first slice shall support these expandable sections:
    - `Why am I seeing this?`
    - `Service status`
    - `Diagnostics`
    - `Logs and paths`
13. `Setup recovery` content shall only appear when packaged setup state is
    actually relevant.
14. Helper-catalog, capability-pack, rollout, chronology, and path-heavy data
    shall not appear in the default top-level viewport before expansion.
15. Headline and summary copy shall avoid internal terms such as `bootstrap`,
    `degraded`, `capability pack`, and `helper catalog`.

### UX Requirements

1. The page should read like product recovery, not like a debugger.
2. Action ordering should remain stable across states so users do not have to
   relearn button meaning.
3. `Retry`-class actions should not change visual importance from state to
   state.
4. `Quit Cats` should remain easy to find when tray mode would otherwise keep
   the app alive.
5. Power-user evidence should stay available without being the default first
   impression.

## Design Overview

### Action Model

The page uses one stable three-slot row:

```text
[Continue]   [Repair]   [Quit Cats]
```

- `Continue` is the safest forward path for the current state.
- `Repair` is the single best immediate repair action for the current state.
- `Quit Cats` is always an explicit real-exit action for recovery/details mode.

This spec intentionally avoids state-dependent primary/secondary emphasis for
the retry concept.

### Information Architecture

```text
Recovery summary
  - plain-language title
  - calm one- or two-sentence summary
  - stable 3-slot action row

Expandable sections
  - Why am I seeing this?
  - Service status
  - Diagnostics
  - Logs and paths
  - Setup recovery (only when relevant)
```

### Recovery State Mapping

| Host state | Continue slot | Repair slot | Quit slot |
|------------|---------------|-------------|-----------|
| `failed`, setup incomplete, app reachable | `Open Setup` | `Retry Startup` | `Quit Cats` |
| `failed`, setup complete, app reachable | `Open Cats` | `Retry Startup` | `Quit Cats` |
| `failed`, app not reachable | _empty_ | `Retry Startup` | `Quit Cats` |
| `ready_for_setup` | `Continue to Setup` | `Retry Check` | `Quit Cats` |
| `needs_prerequisites`, setup complete, resumable setup available | `Open Cats` | `Resume Setup` | `Quit Cats` |
| `needs_prerequisites`, setup complete, no resumable setup | `Open Cats` | `Retry Check` | `Quit Cats` |

### Example Wireframe

```text
Cats
Recovery

[Title]
[Summary]

[Continue/Open]   [Retry/Resume]   [Quit Cats]

▸ Why am I seeing this?
▸ Service status
▸ Diagnostics
▸ Logs and paths
▸ Setup recovery
```

## Dependencies

- existing desktop host action model in `desktop/host/readiness.ts`
- existing desktop bootstrap page in `desktop/host/bootstrapPage.ts`
- existing packaged setup snapshot model in `desktop/host/setupBridge.ts`
- existing cross-layer bootstrap diagnostics ownership from
  [ADR-047](../decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md)

## Resolved Decisions

- This change needs a new `SPEC` because it changes a multi-state desktop
  recovery surface and requires user approval before implementation.
- This change needs a matching `PLAN` because the implementation spans the
  host action policy, bootstrap rendering, and tests.
- This change does **not** need a new `ADR` because it does not change system
  ownership, runtime boundaries, or accepted host/runtime/platform layering.
- `Quit Cats` remains in the same action row as the other recovery buttons.
- The main action row is capped at three buttons with fixed semantics rather
  than state-dependent primary/secondary emphasis.

## References

- [SPEC-023](./SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [SPEC-045](./SPEC-045-cross-layer-bootstrap-and-onboarding-diagnostics.md)
- [SPEC-053](./SPEC-053-post-setup-environment-status-and-recovery-entry.md)
- [PLAN-043](../plans/PLAN-043-post-setup-environment-status-and-recovery-entry.md)
- [ADR-021](../decisions/021-keep-packaged-setup-and-provider-installation-in-the-host.md)
- [ADR-046](../decisions/046-drive-packaged-setup-through-runtime-bootstrap-apis.md)
- [ADR-047](../decisions/047-separate-bootstrap-diagnostics-by-layer-and-aggregate-in-the-host.md)

---

*Created: 2026-04-09*
*Author: Codex*
*Related Plan: [PLAN-044](../plans/PLAN-044-bootstrap-recovery-summary-and-bounded-detail-actions.md)*
