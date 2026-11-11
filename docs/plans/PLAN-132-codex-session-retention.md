# PLAN-132: Codex Session Retention in Desktop

## Metadata

| Field | Value |
| --- | --- |
| Status | Implemented and locally validated; unpublished; release pins pending |
| Owner | Platform Catlas and conversation lifecycle |
| Reviewer | Independent read-only review completed; findings fixed and regression-tested |
| Date | 2026-11-11 |
| Baseline | 5610d09cc9b88d8541d72df0e35f03291aba1f61 |

## Related Spec

[SPEC-131: Catlas curated assist and titles](../specs/SPEC-131-catlas-curated-assist-and-conversation-titles.md),
[ADR-140](../decisions/140-let-catlas-curate-assist-content-and-titles-through-host-validated-output.md),
[SPEC-069: Chat continuity](../specs/SPEC-069-chat-continuity-semantics-and-context-transplant.md)
and [ADR-068](../decisions/068-own-chat-continuity-semantics-above-runtime-session-boundaries.md).
Runtime owns the protocol in its SPEC-041 / ADR-050 / PLAN-052.

## Overview

ChatGPT Desktop now exposes the native Codex histories created by Catlas jobs.
Closing the Runtime worker retains that history. Request ephemeral native
persistence for these independent jobs while preserving SPEC-131's separation of
prompt and navigation inputs. Persistent product conversations keep their usual
resume behavior and receive recognizable product labels through Runtime.

Work is isolated in `.claude/worktrees/codex-session-retention` on
`fix/codex-session-retention`. No UI setting, schema bump or release is proposed.

## Implementation Phases

### P1. Consume Runtime's persistence contract

- [x] Extend the Runtime client types/parser for the proposed optional
      providerSessionPersistence and support/readback fields. Keep protocol logic
      in Runtime; the platform client wrapper continues reexporting it.
- [x] Set ephemeral for Codex in inferCatlasData and inferCatlasAdvice. Check
      selected-provider support and admitted create readback before any send.
- [x] For unsupported Runtime, keep background cache/builtin content and a bounded
      failure receipt; explicit help retains its current failure presentation.
      Never retry as persistent or silently switch provider.
- [x] Keep non-Codex behavior, read-only sandbox, skill/MCP restrictions, strict
      JSON/host-operation validation and close/finally cleanup.

### P2. Preserve job boundaries and persistent conversations

- [x] Cover title, prompt, navigation, Chat help and Code help through their shared
      inference entrypoints. Prompt and navigation never share a native thread.
- [x] Keep two-turn operation feedback in the original live ephemeral worker.
      Worker loss must not replay a host operation that may have executed.
- [x] Consume optional sessionLabel for owned persistent conversation creation;
      bound product text and preserve the native user's later name changes.
- [x] Retain #398's typed missing-session handoff, original cwd, visible notice
      and one-replacement fence. Temporary failures keep the current attachment.

### P3. Verification and documentation

- [x] Extend Catlas fixtures to assert persistence admission before send, separate
      jobs, second-turn continuity and failure/cancel cleanup.
- [x] Re-run focused conversation lifecycle/rotation regressions and relevant
      server/UI type checks using the repository's scoped test build workflow.
- [x] Use built Platform client/Catlas with the exact Runtime candidate in isolated
      Runtime/Codex profiles (headless consumer integration). After
      completed native jobs, assert zero saved Codex threads and recognizable
      names for intentional persistent fixture conversations.
- [x] Inspect organic installed ChatGPT activity read-only. No fixture messages,
      native index edits or cleanup in the owner's real profile.
- [x] Amend SPEC-131 and the Runtime integration guide with the implemented
      behavior; retain separate evidence for any unverified packaged/OS outcome.

## Files to Create/Modify

| File/area | Planned change |
| --- | --- |
| src/runtime/client.ts | Transport optional fields, support/readback and errors. |
| src/platform/catlas/inference.ts | Shared ephemeral admission for both inference paths. |
| src/products/chat/state/runtime-session/sessionStart.ts | Product labels for intentional persistent sessions. |
| src/products/chat/state/runtime-session/sessionResume.ts | Preserve continuity and any explicitly pending product label. |
| tests/catlas-curation.test.js; tests/catlas-titles.test.js; tests/catlas-code-help.test.js | Assert admission, isolation and bounded advice behavior. |
| tests/chat-runtime-session-lifecycle.test.tsx; tests/chat-provider-session-rotation.test.tsx | Preserve current restart/terminal-loss behavior. |

## Acceptance and Risks

The primary oracle is native saved-thread growth, not a successful close call.
Repeated successful and failed Catlas jobs must add zero saved native threads
after model turns. An old Runtime must send no Catlas model content when it cannot
guarantee the contract. Existing chat recovery tests must continue to pass.

Ephemeral does not erase Platform/Runtime receipts. A single shared Catlas thread
would violate input isolation. Renaming alone would only disguise accumulated
jobs, and source/originator tags do not guarantee exclusion from ChatGPT.

## Validation and rollout

Server build and scoped UI-test bundle completed; 56 Catlas/client tests and 32
Chat lifecycle/rotation/parsing tests passed. The first lifecycle run was blocked
by sandbox filesystem access; the same isolated tests passed outside that sandbox.
Independent review found no Platform correctness issue.

The first PR CI run exposed six setup-wizard cases whose shared Runtime stub did
not return the new persistence admission field. A focused reset case reproduced
the failure locally. The stub now returns the requested policy, matching Runtime;
all 34 setup-wizard and session-retention tests passed together. Production
admission remains strict, including the existing missing-readback rejection tests.

The actual built client and both Catlas inference paths ran against the Runtime
candidate with SHA-256
`256fb37a5b218fc9137910969a5d3b4c1e77a138f09273d8caa6018b0d087a76` on Windows
Codex 0.167.0. Two independent data jobs plus one advice job completed four turns.
Advice feedback reused its session; the host operation incremented only a fixture
counter exactly once. Native thread/list, read-only SQLite and rollout inventory
all reported zero saved threads after shutdown. Login copies were removed.

This validates the consumer/Runtime/native chain, not a newly packaged Desktop
installation or macOS/Linux. Failure, invalid-output and cancellation paths have
scoped fixtures. The installed user profile was not modified. Runtime source and
artifact pins must be refreshed during coordinated delivery; no version bump or
release is included. Existing native histories remain intact.

## Progress Log

### Installed-profile follow-up (2026-11-11)

Read-only CDP identified installed Desktop 0.15.1 and Bot 0.5.9. Native metadata
showed two internal provider-agent decisions still saved as persistent unnamed
threads. Two Desktop DM recovery notices also named the same old session but
different replacements; ordinary dispatch and companion activity had each
recovered it. Bot's observed restarts resumed its existing mapping.

Provider-agent session creation now forces ephemeral for Codex and verifies
admission before sending any content, including a reused decision session.
Missing/wrong persistence is rejected without a persistent retry. An owned
session that fails admission or its initial decision is closed even when a
collaboration loop would otherwise retain it; externally supplied sessions are
not closed by that cleanup.

Dispatch merging accepts a replacement when concurrent updates still refer to
the baseline old ID. Reset, retarget and a different concurrent replacement
retain their authority. A concurrent DM sleep keeps the new resume identity
closed. The merged writer releases revoked workers while holding the channel
gate; prepared dispatches recheck the persisted lease before sending. This
prevents heartbeat from recovering the old ID again and avoids waking a lane
the owner put to sleep. No schema, version or release pin changes are included.

Runtime's accompanying repair uses acknowledged native developer items rather
than putting instructions/handoffs in user-message previews (Runtime ADR-050 /
PLAN-052). Existing native histories remain intact; future packaged releases
must select that exact Runtime source through the normal release SOP.

The 125 focused decision, DM lifecycle/rotation, heartbeat, life-loop, knowledge
and packaged-distribution tests passed. Server and Desktop-host builds passed;
independent read-only review closed all findings, including cleanup ordering and
the non-atomic writer's removed-conversation case. Installed user profiles were
not modified by verification.

| Date | Update |
| --- | --- |
| 2026-11-11 | Updated main and created worktree. Shared inference and #398 recovery traced; implementation and acceptance remain pending. |
| 2026-11-11 | Implemented persistence admission/readback, both Catlas paths and Chat labels. Scoped tests, headless native integration and independent review passed; unpublished. |
