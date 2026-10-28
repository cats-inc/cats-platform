# PLAN-125: Claude Code Provider Controls in Desktop

## Metadata

| Field | Value |
| --- | --- |
| Status | Implementation complete; real Claude Code acceptance passed, actual Chrome browser operation not yet verified |
| Owner | Platform shared interaction, Desktop integration |
| Assigned To | Claude |
| Reviewer | Product owner, Runtime maintainers |
| Related spec | [SPEC-132 § Claude Code](../specs/SPEC-132-provider-session-interactions-and-capability-visibility.md#claude-code-2026-10-28) |
| Runtime contract | Runtime SPEC-039 R8; PLAN-050 P1–P4 (#196–#200) |

## Overview

On 2026-10-28 the owner confirmed that the current Desktop cannot use Claude in Chrome, and authorized opening a worktree and implementing in slices.
Runtime has hooked up Claude Code's native approval, questions, MCP forms, execution policy and tool inventory in #196–#199,
and #200 adds the session-level `browserIntegration` (Claude in Chrome's `--chrome`).
This plan has Desktop consume these contracts, reusing PLAN-124's interaction engine, cards and settings entry rather than building a separate set.

This authorization does not include a version bump or release. Desktop is packaged from the Runtime checkout, so the Desktop build
must include the merge commit of Runtime #200. The owner later separately selected the Desktop 0.12.0 standard
preview, pinning Runtime `af405ff7` (including #200/#201); see the [release notes](../release-notes.md).

## Non-Goals

- Claude computer use on Windows: Claude Code opens it only to macOS interactive sessions, and Runtime reports `unavailable`.
- Modifying the user's own Claude Code settings (for example `/chrome`'s Enabled by default) or `providers.yaml`.
- Availability of the Codex helper; that is an upstream environment limitation recorded in PLAN-124.

## Implementation Phases

### P1 — Contract update and the `tool_approval` card

- [x] The shared contract is aligned with Runtime `043155a1`: `INTERACTION_KINDS` gains `tool_approval`,
  and the inventory's `builtins` is extended to `not_exposed_by_provider | not_observed | observed` and carries `builtinTools`.
- [x] Provider discovery parses `sessionCapabilities.admissibleCeilings`, and invalid entries are dropped (fail closed).
- [x] `PLATFORM_INTERACTION_HOST` is intersected with the target declaration, so Claude conversations negotiate `tool_approval`;
  the existing generic card shows the tool, MCP server, input summary and 「允許一次／本工作階段允許」 ("Allow once / Allow for this session").
- [x] The interaction binding carries the lease's provider; the session details list the built-in tools, and settings links are split by provider
  (Codex plugin docs / Claude in Chrome docs; an unknown provider shows none).

**Exit:** MCP and Chrome tool calls in a Claude conversation become same-turn cards under the on-request policy, and are no longer rejected for lack of negotiation.

### P2 — Permission ceiling prompts

- [x] Before sending, the runtime client rejects a policy beyond the target's `admissibleCeilings` (create and resume),
  and the error reuses `provider_policy_unsupported`, with a message listing the ceilings the target can enforce.
- [x] When a narrower ceiling is chosen, the policy editor hints that Claude Code can only run with "full access + network". A draft can contain
  Cats of different providers, and the editor does not know the final target, so this is shown as a hint and does not hide options available to Codex.

### P3 — Claude in Chrome preference

- [x] Settings > Runtime provides a Claude in Chrome switch that is off by default, stored in the platform preferences'
  `claudeInChromeEnabled`. Reads and writes go through `/api/provider-interactions/preferences`, the same as native controls,
  and accept only a local owner/admin browser session; the ordinary preferences routes cannot change it, and a data reset restores it to off.
  An old version ignoring this field only means Chrome is not loaded and does not widen privileges, so no data-format upgrade is needed.
- [x] The composition-layer wrapper sits outside the Work admission wrapper: only Chat/Code conversations whose caller carries its own interaction host
  request `browserIntegration: true`; the client sends it only when the host has negotiated and the target declares support.
  Work supervision/scheduling and relay execution do not send it, and when it is off it is not sent (keeping the user's own Claude Code default).
- [x] Explanatory text: the change affects only new sessions or the next worker start; which browser actions need approval is decided by Claude Code and the
  extension (P4 testing showed the tool that reads tabs does not ask), and full access (skip) skips Claude Code's prompts.
  The shared contract pin was updated to Runtime `b750d27e` (#200).

### P4 — Acceptance

- [x] Focused Node/renderer tests, affected typecheck and build (see each slice's progress log).
- [x] With isolated state, verified the `tool_approval` round-trip and `--chrome` loading through the real `CatsRuntimeClient` and Claude Code;
  actual Chrome operation requires the owner to open the browser and consent before proceeding, and was not done this time.

## Testing Strategy and Risks

Prefer scripted Runtime fixtures and DOM tests. Risks: bringing Chrome into unattended Work/scheduled runs;
offering a permission ceiling on the Claude target that it cannot enforce; showing Codex settings links in a Claude session.
P2/P3 are covered by admission tests and session create payload tests respectively.

## Progress Log

| Date | Update |
| --- | --- |
| 2026-10-28 | P1: contract aligned with Runtime `043155a1`, `tool_approval` negotiation and card DOM tests, admissible ceilings parsing, built-in tool inventory and provider-specific settings links. 15 client/renderer and 26 product/control/policy upgrade/raw-string audit tests pass; server build and renderer typecheck pass. |
| 2026-10-28 | P2: client-side ceiling rejection (`/sessions` is not sent) and the editor hint. 16 client/renderer tests pass, including explicit workspace-write, a provider-offline ceiling rejected, and full-access + network passing. |
| 2026-10-28 | P3: Claude in Chrome preference, local owner route, conversation-scoped `browserIntegration` and the Settings switch. Added 3 Node tests (client forwarding, wrapper scope, route permission and persistence) and 1 DOM test; updated 3 preferences full-shape fixtures. 39 control/client/products/policy/ingress/raw-string tests, 60 preferences/setup/reset/preview tests and 8 renderer tests pass; server/renderer/desktop/test typecheck and catalog check pass. |
| 2026-10-28 | P4: Claude Code 2.1.312 (haiku), Runtime source `b750d27e` (#200) started with a private temporary `CATS_RUNTIME_DIR`, with Claude Code using the owner's own login; through Platform `CatsRuntimeClient` and the conversation wrapper (preference on), explicit full-access/network/on-request. Results: discovery declared `tool_approval`, `admissibleCeilings` and `browserIntegration`; a workspace-write policy was rejected on the client side and `/sessions` was not sent; WebFetch produced a `tool_approval` and, once accepted, completed within the same turn; the session policy was `verified` (reported `default`, reviewer `user`), `claude-in-chrome` was connected (22 tools), 34 built-in tools, browser `unknown`, computer use `unavailable`; the session with the preference off (re-run on Runtime `af405ff7`, read after one turn completed) had 7 claude.ai connectors, no `claude-in-chrome`, 31 built-in tools (34 when on), and browser `unavailable`. `tabs_context_mcp` ran without sending an approval request and failed because the extension was not connected; there was no Chrome/Edge process at the time and the browser was not touched. Not yet verified: actual Chrome actions in a connected browser and how their site approvals are presented. |
| 2026-10-28 | P3 review: the Settings description was changed to say Cats does not "request" browser tools for Work/scheduled runs (the user's own Claude Code Enabled by default still applies); the new POST is protected by the cookie CSRF check of the existing auth gate (the renderer's global fetch attaches the token automatically); added a Work admission test that depends on the server composition order (it fails if the order is swapped); when resume meets a still-alive worker started with another configuration (409 `interaction_conflict`), it retries once without this field, keeping that worker, and the setting takes effect at the next admission. |
| 2026-10-28 | The owner selected the Desktop 0.12.0 standard preview (format 6 data boundary). Runtime pin `af405ff7`; isolated upgrade acceptance used a private profile produced by the installed 0.11.1 sidecar, and the results and release checks are in the release notes. |

*Created / last updated: 2026-10-28*
