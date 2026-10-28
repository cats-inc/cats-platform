# PLAN-126: Desktop Control Session MCP

## Metadata

| Field | Value |
| --- | --- |
| Status | In progress; P0 complete, P1–P4 authorized, P5 needs owner sign-off after P4 |
| Owner | Platform Desktop integration |
| Assigned To | Claude |
| Reviewer | Product owner, Runtime maintainers |
| Related spec | [SPEC-133](../specs/SPEC-133-desktop-control-session-mcp.md) |
| Decision | [ADR-141](../decisions/141-host-a-consented-desktop-control-mcp-for-provider-sessions.md) |

## Overview

Following ADR-141 and SPEC-133, deliver phase A (observe) first. Phase B (act) starts only
after native acceptance passes and the owner confirms it. Reuse the existing session MCP
contribution mechanism, the `cat-image-tools` endpoint pattern, the `windows-stt` native
helper packaging, and the interaction cards and capability panel from PLAN-124 and PLAN-125;
build no parallel mechanism. Cats Bots runs its own plan,
[Bots PLAN-006](../../../cats-bots/docs/plans/PLAN-006-desktop-control-session-mcp.md),
against the same contract. This plan includes no version bump or release.

## Implementation Phases

### P0 — Freeze contracts

- [x] Freeze phase A tool input/output schemas, error codes and the wording returned to
  the model (SPEC-133 "Frozen contract details").
- [x] Freeze the helper protocol (DC-14) and the `hello` version and protocol fields.
- [x] Confirm which fields and values of Runtime SPEC-039's policy report decide DC-04 (now
  spelled out in DC-04). What Claude Code and Codex actually report is recorded in P4.
- [x] Define how the DC-10 exclusion list matches (executable file name; "self" comes from
  `hello`) and its test cases.
- [x] Confirm that everything needed to decide a DC-05 "local owner turn" is available on
  the send path: `sourceMessageId` and `supervisionRunId` are, and the route stamps the entry.
- [x] Freeze SPEC-133's cross-implementation contract together with Bots PLAN-006 P0, so
  both sides refer to the same version (2026-10-29).

**Exit:** schemas, protocol, exclusion list and injection decisions have fixtures, the
cross-implementation contract is aligned with Bots, and the owner confirms.

P0 record (2026-10-29): the owner authorized continuous slices through every phase that does
not need them, which covers this exit's confirmation. P0 also found that session MCP
contributors only reach Code sessions, so Chat injection uses a `wrapClient` proxy, and chose
`PrintWindow` over Windows Graphics Capture for P1. Fixtures land with the code in P1 and P2.

### P1 — Helper (observe)

- [ ] Create `desktop/native/windows-desktop-control/` and implement `hello`,
  `resolve_apps`, `list_windows`, `capture_window` (Windows Graphics Capture with a
  `PrintWindow` fallback), `read_ui`, `open_app`, `state` and `cancel`.
- [ ] Implement the exclusion list, UIPI checks, per-monitor DPI awareness v2 and lock
  detection (DC-13).
- [ ] Wire it into `build-desktop-installer.mjs`, signing and `verify-desktop-licenses.mjs`.
- [ ] Helper tests: resolution, exclusions, protocol errors and capture under a covering
  window (A4).

**Exit:** the helper alone passes A4 and the helper part of A6 on Windows.

### P2 — Platform server

- [x] Global setting and per-conversation switch (DC-02, DC-03), stored in Platform
  preferences and changed only by the local-owner `/api/desktop-control/` routes.
- [x] Helper supervisor: lazy start, idle exit and crash restart limit (DC-16)
  (`src/platform/desktopControl/helper.ts`).
- [x] The `/api/internal/desktop-control/mcp` endpoint and `isInternalPlatformRoute` (DC-07);
  the owner API is internal too.
- [x] The `cats-desktop` `wrapClient` proxy (outermost on the shared Chat client, per P0) with
  injection and turn decisions (DC-04, DC-05); the channel message route stamps local owner
  sends.
- [x] Grant requests and the in-memory grant table (DC-08, DC-09).
- [x] Log redaction (DC-17): the service logs nothing, and the owner state API carries names,
  paths and statuses only, never screenshot bytes or UI text.
- [x] Backend parts of A1–A3 and A8 tested with a fake helper (`tests/desktop-control.test.js`,
  8 tests). The route-level stamp needs a signed-in browser cookie, so P4 checks it on a real
  Desktop.

**Exit:** backend tests pass, including a test that ingress cannot reach the endpoint.
Met on 2026-10-29. Affected suites: 466/470 JavaScript tests passed; the 4 failures were
`platform-data-reset` expectations (updated) and two route tests that also fail on a clean
`origin/main` checkout on this Windows machine. Affected TypeScript tests: 48/48.

### P3 — Renderer and Desktop host

- [ ] Settings switch and the reason when unavailable.
- [ ] The per-conversation switch and grant cards; grant cards do not share a reply path
  with provider interaction cards.
- [ ] The "Cats desktop control" row in the capability panel (DC-18).
- [ ] The Desktop host passes `CATS_DESKTOP_CONTROL_HELPER`; tray state and the stop item
  (DC-12).

**Exit:** UI tests and an isolated Desktop smoke test pass.

### P4 — Phase A native acceptance

- [ ] Run A1–A6 and A8 on a real Windows machine with a real Claude Code; for Codex, check
  image content (Open Questions).
- [ ] Record the Defender result, redacted samples of real screenshots and UIA output, and
  any items that did not pass.

**Exit:** the owner confirms phase A's consent flow is usable and authorizes phase B.

### P5 — Phase B (act)

- [ ] Add `click`, `invoke`, `type`, `key`, `scroll`, `clipboard_read` and
  `clipboard_write` to the helper, porting the PR #336 guards.
- [ ] Pause while the owner is operating, hold state and the topmost notice (DC-11).
- [ ] The matching MCP tools and guard fixtures; native acceptance against a throwaway test
  window (A7).

**Exit:** A7 passes and is recorded; anything that did not pass is stated as such.

## Validation

Follow [AGENTS.md: Local Validation Scope](../../AGENTS.md#local-validation-scope) and record
the checks each slice actually ran and their results; full CI remains the gate before merge.
Native acceptance and fixture tests prove different things, so report them separately.

*Created: 2026-10-29. Planned; implementation not authorized.*
