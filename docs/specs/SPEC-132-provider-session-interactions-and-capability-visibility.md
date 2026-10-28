# SPEC-132: Provider Session Interactions and Capability Visibility

## Metadata

| Field | Value |
| --- | --- |
| Status | Implemented; product/Windows candidate fixture and native calls verified, successful external operations still limited by the helper |
| Owner | Platform shared interaction, Desktop integration |
| Reviewer | Product owner, Runtime/Bots maintainers |
| Baseline | Platform `595e9ca2`; 2026-10-28 |
| Plan | [PLAN-124](../plans/PLAN-124-provider-session-interactions-and-capability-visibility.md) |
| Governing decisions | [ADR-020](../decisions/020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md); Runtime ADR-048 (accepted) |

## Summary

Let Chat/Work/Code in Cats Desktop receive and answer provider-native approvals, questions
and MCP forms, while showing the current session's effective permissions, the actual source of
tools, and the desktop/browser dependency status. Platform owns user operations and product
permissions; Runtime owns the native protocol and execution.

The shared contract follows
`cats-runtime/docs/specs/SPEC-039-provider-session-capabilities-and-interactions.md`;
the coordinated plans are Runtime PLAN-049 and Bots SPEC-004/PLAN-004.
The contract is based on Runtime PR #194; the final native acceptance used the 0.6.2 pack of
source `50ef02b4686c1fff6b60819d292acc5b2e1ef773`, SHA-1
`5f360927ece194dc3e0abbd690fb7b43cb292fc3`; no new package version has been published.
This work extends the existing ADR-020 and the shared interaction engine, and does not create
a duplicate Platform architecture ADR.

## Goals and User Stories

- The user completes a pending Codex choice/approval in the conversation, and the answer
  returns to the same running request.
- The user can tell apart "plugin installed", "tools visible to the session" and "tool
  successfully connected/used".
- Chat/Work/Code share request state and reply boundaries, while keeping their own
  conversation and operation presentation.
- Under the same environment conditions, comparing Terminal and Desktop, the source of
  capability differences can be identified.

## Non-Goals

- Platform launching Codex directly, parsing app-server JSON-RPC, or replacing Runtime's MCP
  management.
- Turning the Cats plugin installer into a manager of all the user's Codex plugins/credentials.
- Making standalone Bots depend on Platform; guaranteeing that other providers or all OSes
  already have the same capability.
- In this phase, adding Mobile/remote native approval, redesigning Work supervision, or
  repackaging upstream private helpers.

## Before implementation

The existing approval queue is mainly presented through the `dispatch_plan` of Cats tasks, and
supervision also records approvals by task/binding; neither forms a round-trip path for Codex
native requests. The existing Plugins settings page manages managed Cats plugins/skills and
cannot be used as the Codex live MCP list. The "full access" of ordinary conversations maps to
`read_write + skip`, while the Codex adapter inspected still uses `workspace-write`. These
three are, respectively, gaps in interaction wiring, capability visibility and permission
semantics.

## Requirements

### P1. Shared interaction wiring and identity

Platform's runtime client consumes the negotiation, snapshot, events and response APIs of
SPEC-039. Only when a session is created does it declare the kinds the current host actually
supports; an old Runtime/unsupported target is shown as unsupported, and must not silently
downgrade the interaction mode the user chose to automatic rejection or full authorization.

Each interaction is bound to the conversation, participant/lane, run, runtime session, worker
generation and interaction ID. Switching conversations, multi-person concurrency and provider
retargeting must not send an answer to a different executor. The backend checks the logged-in
user's operation right on the conversation, then sends the reply using managed Runtime
authentication; the renderer does not obtain the Runtime key, the native request ID or direct
connection permission.

### P2. UI for native interactions

The common data model distinguishes `provider_interaction`, the existing task approval and
supervision approval. Entries/visual components can be shared, but the different reply
commands, states and permission sources are kept. Each native question is not disguised as a
dispatch plan, and approving a Cats task does not let a native tool through along with it.

The conversation provides a card with its source, showing the owning Cat, action/question,
scope and wait deadline. It supports command/file approval, limited permission grants,
choice and free-text questions, MCP forms with supported schemas, and external URL flows
opened by the user. Only the options/grant scopes Runtime allows are presented. Opening an
external page does not mean authorization succeeded; the state is updated by Runtime's
provider-specific result.

Waiting, submitting, replied, ended by the provider, timed out, cancelled and process
interrupted must be distinguishable. Repeated clicks reuse the same idempotency key;
conflicting/expired replies re-read the authoritative state. Secret fields must not be
written to the transcript, debug trace, activity feed or global state snapshot. An unknown
schema shows an actionable unsupported/cancel result, and produces no blank successful answer.

### P3. Lifecycle and Work wiring

A run waiting for human input shows "Waiting for your response" (「等待你的回覆」), and does
not count as successful completion or a new model execution round. The reply goes through the
control API and is not queued in the message queue already occupied by that turn. The original
execution gate stays in force. Work's supervision, budget, cancel and scheduling mechanisms
can recognize human wait; they must not judge it stuck because there are no tokens during the
wait, re-dispatch the same work, or loosen permissions.

After the UI is closed/reconnected, cards are restored from the snapshot plus revision;
requests still in Runtime can continue. Old cards after a worker/Runtime restart are marked
interrupted, and a durable card must not be treated as a still-living callback. When the user
closes/cancels a run or deletes its owner, the reply capability must be revoked; external
effects must not be re-executed automatically.

### P4. Permission settings and compatibility

Present "approval method" separately from "accessible file/network scope", showing the
requested value and the effective value verified by Runtime. Provider settings with an
explicit choice keep the inherited mode; only an explicit policy that is supported and
admitted by the host can select true full access. Deriving full machine access from the
existing `skip` value is wrong.

Existing settings keep their original execution effect. When meeting a legacy session, show
its effective scope/legacy setting state; it cannot claim the new policy is complete merely by
changing a label, and cannot be migrated automatically to a broader permission. Work's
read-only/whitelist/supervised jobs keep their narrower limits; the user's choice in ordinary
conversations does not override them. A change affects only the next admission boundary; an
active turn keeps its original policy, or the user explicitly cancels it.

### P5. Visibility of tools and dependencies

The settings page provides an entry for provider/session capabilities, and the conversation
can open the detailed information of the current session. It shows the source, time,
completeness, connection/authentication state and known policy limits of built-in tools,
provider MCP, Cats-injected MCP and Runtime dynamic tools. The old plugin install list keeps
its own purpose. Different sources can share a name; identify by source and server, and do
not claim consistency by total tool count.

With no active worker, show not yet observed; expired caches are clearly marked. Refresh sends
no prompt, does not test all tools, and creates no new model turn just to see the list. When a
nested/lazy host is observed only at its entry, mark the list as partial. An authentication
mechanism's `unsupported` is not translated into tool unavailable.

Desktop shows the dependency checks and repair entries for Computer use / Chrome: the observed
results of the selected CLI, native helper, upstream host, browser extension and OS access
capability. Items that cannot be confirmed are shown as unknown, and Runtime is not required
to fake ready. The existing safe external-link/application-opening boundary is kept; it does
not take over the user's MCP processes, nor bypass upstream login/trust or OS permissions.

### P6. Storage and security boundaries

Persistence is limited to necessary product associations and de-sensitized state, and stores
no live callbacks or secret form answers. If the implementation extends the Core/settings
schema, it must first list tests for validation, backup, atomic replacement and failure
recovery. Existing product authorization is kept; model-provided text, Markdown, schema and
URLs are all data, and do not become host instructions or executable UI.

## Acceptance Criteria

| ID | Acceptance |
| --- | --- |
| A1 | Chat, Code and Work each complete one native request, and the answer returns to the same session/turn, with no new turn opened |
| A2 | Multiple Cats / parallel lanes do not cross answers; unauthorized, duplicate, expired or pre-retarget answers take no effect |
| A3 | After the renderer reopens, live requests are restored; after Runtime restart, cancel or provider resolve, the card is invalidated |
| A4 | read-only/whitelist and existing settings do not broaden; the new UI's effective permission matches what Runtime reports |
| A5 | The list distinguishes sources, partial data and offline helpers; installing a plugin or discovering tools alone cannot show verified success |
| A6 | In an isolated candidate Desktop, verify controlled Chrome and desktop operation separately, and record the Terminal comparison conditions |
| A7 | Existing task/supervision approvals, ordinary conversation and cancel behavior pass appropriate regression; no secrets are written to history |

## Implementation and compatibility boundary (2026-10-28)

- The shared control API is `/api/provider-interactions/conversations/:id`, protected by the
  existing login/CSRF gate, then restricted to owner/admin browser sessions on the direct
  loopback transport; Mobile bearer, forwarded requests and non-local sources are rejected.
  The Runtime bearer does not enter the renderer.
- Chat/Code/Work conversations keep the lane/session mapping of participant lease + active
  turn. For a supervised run that has a visible conversation in Work and belongs to an owner
  task/mission, `metadata.providerInteraction = {version:1,sessionId}` and the Runtime bridge
  needed for cancel are created before the first message. Before spawn, the same run is
  atomically claimed; repeated admission does not create a second worker. After a confirmed
  cancel/close an ended receipt is kept, and an explicit retry can create a new session;
  unconfirmed cleanup saves the known sessionId and cleanupRequired, blocking retry and reply.
  When the process disappears mid-claim, no replay is guessed; the old run must be ended
  first. This record contains no prompt, answer or live callback; on read, generation,
  execution and revision are still verified against Runtime, and the product association is
  verified again before replying. An ended/blocked run cannot answer.
- Work human wait keeps the original turn; a native wait extends the token-idle judgement but
  does not extend the existing explicit wall-clock budget. When the Golden Path expires it
  aborts/cancels the original provider execution; a late create does not start the message.
  After cancellation, both success and failure write-backs keep the latest terminal state.
- Headless/relay executions with no conversation to reply in do not declare an interaction
  host; a no-UI job is not disguised as a session that can wait for a human. Code's
  conversation has a host, and standalone relay/task executions keep their original boundary.
- An old Runtime keeps the existing policy; when a new policy is explicitly selected and the
  target does not support it, creation is rejected. The new policy is not sent together with
  the old `permissionMode`/`allowedTools`; the read-only/whitelist ceiling is checked twice, at
  persisted read and at session admission. A diagnostics refresh creates no model turn.

### Persisted format 6

The Core snapshot goes from 5 to 6, preventing an old version from ignoring the new
`runtimeExecutionPolicy` and broadening permissions. The upgrade validates the recognized
format inside the store mutation lock, saves the original bytes to
`<state>.pre-provider-policy.bak`, then replaces atomically with a same-directory temporary
file + rename. An existing backup must have identical content and cannot overwrite another
source; for unknown policy / outer schema in the primary and the regular `.bak`, both fail
closed, and cannot overwrite with default settings or an older copy. On write failure the
original file is kept and the I/O cause can be fixed and retried; a malformed primary still
uses the existing backup recovery. Old versions reject format 6, and **directly downgrading to
open new data is not supported**; if reverting to an old version is needed, first close the
process and save the new data separately, then the owner explicitly chooses the original
pre-upgrade backup, which discards post-upgrade changes.

This data boundary is carried by the **0.12.0 minor**: on 2026-10-28 the owner selected the
Desktop 0.12.0 standard preview, and the pin and upgrade acceptance are recorded in the
[release notes](../release-notes.md). Versions in the same 0.11 minor cannot read this data.

### Validation evidence

- The first batch of 55 Node tests passed, plus 62 existing focused regression tests for
  policy/Work/Chat/auth: same-turn round trip across the three products, rejection across
  binding/generation/execution, owner/local authentication, unknown data versions, backup
  failure/retry, and existing store regression.
- Independent review fixed issues including qualified provider/backend selection, caller kinds
  intersection, an old reader broadening permissions, future backup overwrite, a late-finally
  timer in native wait polling, and Work cancellation / history list.
- Follow-up regression after product wiring, 3 renderer DOM tests, typecheck at every layer
  and the server/host/web builds passed; independent review verified the empty-value/integer
  boundaries of policy switching and native forms.
- The Windows Electron candidate used a private profile and a scripted provider, and completed
  a same-execution reply after reload, an empty-value form, a terminal receipt, diagnostics and
  an existing conversation UI smoke.
- With Codex 0.164.0, the real Platform Chat dispatch, Bot core and Terminal all actually
  called the tools: Chrome reported `Browser is not available: chrome`; computer use reported
  native pipe unavailable (OS error 2). Platform effective policy verified, configured MCP was
  279/3/4, and the Bot additionally injected 4 tools. This proves the call path and matching
  observation, with no successful Chrome/desktop operation. For the detailed scope, the
  candidate source differences and unverified items see PLAN-124 and the Runtime research.

## Claude Code (2026-10-28)

Runtime SPEC-039 R8 makes Claude Code the second native target, wired into Desktop by
[PLAN-125](../plans/PLAN-125-claude-code-provider-controls-in-desktop.md):

- Claude declares `tool_approval` (MCP and non-command, non-file tools such as Claude in
  Chrome), and does not declare `permission_grant`. Platform renders it; kinds not rendered
  are not negotiated, and Runtime rejects such a request directly.
- Claude has no sandbox on native Windows and only accepts the "full access + network" ceiling.
  Desktop must not offer or send a ceiling the target cannot enforce, nor describe Claude's
  `verified` as file/network restricted.
- Claude in Chrome needs the Runtime session's `browserIntegration: true`. It is sent only for
  conversation sessions that can be replied to; Work/scheduled/relay executions with no one to
  answer the card must not load the browser tools. Which Chrome tools need approval is decided
  by Claude Code and the extension (measured: `tabs_context_mcp`, which reads tabs, does not
  ask), so Desktop does not claim that every browser action produces a card.
- Computer use is `unavailable` on Windows (Claude Code opens it only to macOS interactive
  sessions); showing the reason is enough.

## Remaining environment validation

- The supported fixture contract of Runtime SPEC-039 is wired; new native schemas still need
  separate verification.
- The supported form range, URL completion and provider deadline follow the fixtures of
  Runtime P0.
- Native Windows is the first integration acceptance; other OS / remote interfaces are
  recorded item by item as pending verification and do not inherit results.
- Wiring and the redistribution of upstream Desktop-only helpers are different topics; this
  work plans only diagnostics for installed environments.

## References

- [Product integration boundaries](../product-integration-guide.md)
- [Work supervision](SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [Managed Cats plugins](SPEC-121-managed-plugin-capabilities.md)
- Runtime ADR-048 / SPEC-039 / PLAN-049 and research `2026-10-28-codex-host-capability-gaps`.

*Created / last updated: 2026-10-28*
