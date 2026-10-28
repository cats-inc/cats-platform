# PLAN-126: Desktop Control Session MCP

## Metadata

| Field | Value |
| --- | --- |
| Status | Phase A delivered (P0–P3 merged or in review, P4 recorded); waiting for owner sign-off before P5 |
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

- [x] Create `desktop/native/windows-desktop-control/` and implement `hello`,
  `resolve_apps`, `list_windows`, `capture_window` (`PrintWindow`, per P0), `read_ui`,
  `open_app`, `state` and `cancel`. Packaged apps launch through their AUMID.
- [x] Implement the exclusion list, per-monitor DPI awareness v2 and lock detection (DC-13).
  UIPI only blocks input, so the `elevated_target` check moves to P5 with the input ops.
- [x] Wire it into `build-desktop-installer.mjs`, `verify-desktop-licenses.mjs` and the
  per-architecture check in `verify-desktop-app-bundle.mjs`; it is signed with the installer
  like the voice helper.
- [x] Helper tests: resolution, exclusions, protocol errors and capture under a covering
  window (A4). `native-check/check.mjs` passed 13/13 on Windows 11 on 2026-10-29: the overlap of
  a red covering window contained 0 red pixels, password values were absent, 「記事本」
  ("Notepad") resolved to the packaged Notepad and PowerShell resolved as observe only.

**Exit:** the helper alone passes A4 and the helper part of A6 on Windows. A4 passed; the
crash-restart and idle-exit parts of A6 belong to the P2 supervisor.

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

- [x] Settings switch and the reason when unavailable (Settings > Runtime, under Claude in
  Chrome; hidden where the platform is not Windows).
- [x] The per-conversation switch and grant cards; grant cards do not share a reply path
  with provider interaction cards. They answer through `/api/desktop-control/grant-requests`,
  next to the provider controls in the conversation view, with Stop for the conversation.
- [x] The "Cats desktop control" status (DC-18) shows in that conversation panel, with the
  reason when the descriptor is not attached; the provider capability panel keeps showing
  provider-native computer use unchanged.
- [x] The Desktop host passes `CATS_DESKTOP_CONTROL_HELPER` (packaged resources, or the
  development Release build) and `CATS_DESKTOP_HOST_EXECUTABLE` to Platform on Windows only.
  Tray state and the tray stop item move to P5 with DC-11's holding notice: in phase A nothing
  holds control, and stop stays available in the conversation and through the settings switch.

**Exit:** UI tests and an isolated Desktop smoke test pass. UI and host tests pass
(`tests/desktop-control-renderer.test.tsx` 3/3, supervisor tests 47/47, i18n parity and
related renderer tests 33/33); the Desktop smoke test runs with P4.

### P4 — Phase A native acceptance

- [x] Run A1–A6 and A8 on a real Windows machine with a real Claude Code; for Codex, check
  image content (Open Questions). See the record below; Codex was not checked.
- [x] Record the Defender result, redacted samples of real screenshots and UIA output, and
  any items that did not pass.

**Exit:** the owner confirms phase A's consent flow is usable and authorizes phase B.

P4 record (2026-10-29, Windows 11, Claude Code 2.1.312 `haiku` with the owner's own sign-in).
A private Runtime built from `origin/main` (`0b387ae5`) ran with a temporary
`CATS_RUNTIME_DIR` and only the `claude` native instance configured. A script drove it through
Platform's `CatsRuntimeClient` and the P2 desktop control service with the real helper. It
answered each provider approval with "Allow once" and each grant as the owner would, against
two throwaway windows: a blue target with controls and a red window over part of it. 13/13
checks passed:

- A2: the explicit `on-request` session carried `cats-desktop`; Runtime reported the policy
  `verified` with reviewer `user`; each of the 4 desktop tool calls produced a `tool_approval`
  naming server `cats-desktop`; a `never` session did not get the descriptor.
- A3: the app grant came only through the service's owner path (`decideGrant`).
- Phase A tools: the model described the window as blue from `screenshot_window` and quoted
  the button and text field values from `read_ui`; the password value never reached it (A4).
- DC-05: a turn that was not owner-present got `not_owner_present`, and its send kept the
  descriptor, so the worker was not restarted.
- A5: after Stop, tools answered `stopped`. A6: after the helper process was killed, the next
  owner turn started a new helper; Defender recorded no detection during the run.

Not exercised natively: the Desktop UI (settings switch, grant cards and the route-level
`local` stamp through a signed-in renderer), the screen-lock pause, the 5-minute idle exit,
a packaged installer's helper, and Codex. These are covered by fixtures only and wait for
the owner's Desktop check. The native helper check (A4 with pixel counts) is recorded under P1.

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
