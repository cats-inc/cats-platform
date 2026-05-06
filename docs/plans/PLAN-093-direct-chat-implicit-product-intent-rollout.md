# PLAN-093: Direct Chat Implicit Product Intent Rollout

> Implement the follow-up direct-message flow where ordinary Web or Telegram
> text can suggest Work/Code intent, but only explicit owner confirmation enters
> the slash-mode intake pipeline.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-105: Direct Chat Implicit Product Intent Confirmation](../specs/SPEC-105-direct-chat-implicit-product-intent.md)

## Dependencies

- [ADR-101: Use the Direct-Audience Cat for Slash-Mode Work Intake](../decisions/101-use-direct-audience-cat-for-slash-mode-work-intake.md)
- [SPEC-104: Direct Chat Slash-Mode Work Intake](../specs/SPEC-104-direct-chat-slash-mode-work-intake.md)
- [PLAN-092: Direct Chat Slash-Mode Work Intake Rollout](./PLAN-092-direct-chat-slash-mode-work-intake-rollout.md)
- [SPEC-038: Telegram Bot Commands and Transport Control Surface](../specs/SPEC-038-telegram-bot-commands-and-transport-control-surface.md)
- [SPEC-082: Cats Work Agent Supervision and Tool Boundary](../specs/SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)

## Overview

This plan intentionally builds on the explicit command MVP instead of creating
a second intake system. The detector may notice that ordinary direct-chat text
looks like Work or Code, but it cannot change posture or create durable product
state by itself. A confirmed candidate is translated into the same command
semantics as SPEC-104: `/work <original message>` or `/code <original message>`.

## Implementation Guardrails

- Do not bypass the SPEC-104 slash-mode intake pipeline.
- Do not create Work Items, Tasks, Runs, Code execution, or active anchors from
  classifier output alone.
- Do not rewrite the original user transcript into a slash command.
- Do not run implicit detection in non-direct channels for this MVP.
- Do not infer Cat strength from product-intent classification.
- Do not introduce retired prototype labels or new channel kinds.

## Implementation Phases

### Phase 1: Detection contract and metadata

- [x] Task 1.1: Define a Chat-owned deterministic
      `detectImplicitProductIntent` contract for ordinary direct-message text.
      V1 is local heuristic only: no provider, runtime session, or LLM
      classifier call per ordinary chat message.
- [x] Task 1.2: Add the candidate metadata builder for original message id,
      source channel/conversation, transport, target product, confidence,
      reason code, `candidateId`, and expiry timestamp.
- [x] Task 1.2a: Add append-only system-segment metadata for candidate
      transitions: `suggested`, `confirmed`, `declined`, and `expired`.
      Projection status is derived from these events rather than mutating the
      original user message as the audit source. Candidate and transition
      metadata live under `metadata.implicitProductIntentCandidate` and
      `metadata.implicitProductIntentTransition` on their system segments.
- [x] Task 1.3: Ensure explicit `/chat`, `/work`, and `/code` messages remain
      owned by SPEC-104 and are never reclassified by this detector.
- [x] Task 1.4: Add unit tests for Work, Code, none, low-confidence ambiguity,
      and obvious casual-chat false positives.
- [x] Task 1.5: Add non-direct negative tests proving the detector is not
      applied outside `direct_message` lanes.
- [x] Task 1.6: Add tests proving ordinary direct-chat dispatch still proceeds
      when a candidate is suggested. The suggestion is a system/UI sidecar, not
      a replacement for the Cat's ordinary reply.

**Deliverables**: shared candidate detection exists as a pure contract with no
durable product side effects.

### Phase 2: Web confirmation UX

- [x] Task 2.1: Show a Web direct-lane confirmation affordance for Work/Code
      candidates using localized copy and the existing `ChatMessage.choices`
      schema from SPEC-104's human-gate UI (`confirm_work` /
      `confirm_code` / `decline` option ids).
- [x] Task 2.2: Add decline/ignore behavior that leaves posture and active
      anchors unchanged.
- [x] Task 2.3: Add idempotent confirm behavior so one candidate cannot create
      duplicate anchors.
- [x] Task 2.4: Add Web tests proving candidate suggestion does not create
      Work Items before confirmation.
- [x] Task 2.5: Add the minimum Web happy-path integration test:
      strong-Cat Work candidate -> confirm -> SPEC-104 draft anchor appears.

**Deliverables**: Web users can confirm or decline implicit Work/Code
suggestions without automatic materialization, and the Web confirm path proves
the bridge into SPEC-104 before Telegram work starts.

### Phase 3: Telegram confirmation UX

- [x] Task 3.1: Route ordinary Telegram direct text through the same detector
      contract after transport-control and slash-command parsing.
- [x] Task 3.2: Add Telegram-safe localized suggestion copy that does not expose
      classifier or provider terminology.
- [x] Task 3.3: Implement Telegram confirmation with inline keyboard
      `callback_data` carrying a compact candidate reference plus
      confirm/decline transition. The bridge resolves the full `candidateId`
      from the candidate message metadata because Telegram limits callback data
      to 64 bytes. Reply-keyboard and free-form text confirmation are out of v1.
- [x] Task 3.4: Add transport parity tests for Telegram and Web candidate
      semantics.
- [x] Task 3.5: Add the minimum Telegram happy-path integration test:
      strong-Cat Code candidate -> inline-keyboard confirm -> SPEC-104 draft
      anchor appears with `targetProduct: 'code'`.

**Deliverables**: Telegram ordinary text can suggest Work/Code intent with the
same confirmation semantics as Web.

### Phase 4: Confirmed handoff to slash-mode intake

- [x] Task 4.1: Convert confirmed Work candidates into the same product-intent
      command input as `/work <original message>`.
- [x] Task 4.2: Convert confirmed Code candidates into the same product-intent
      command input as `/code <original message>`.
- [x] Task 4.3: Preserve original-message source context while keeping the
      transcript text unchanged.
- [x] Task 4.4: Reuse SPEC-104 direct audience capability gating for strong,
      weak, and unknown Cats.
- [x] Task 4.5: Extend product-intent command metadata for implicit
      confirmation: `argumentText` is the trimmed original message body,
      `productIntentArgumentProvided` is always true, `rawCommandToken` is the
      fixed non-slash sentinel `(implicit-confirmation)`, and metadata carries
      `implicitConfirmed`, `originalCandidateId`, and `originalMessageId`.
- [x] Task 4.6: Add integration tests proving confirmed implicit intent follows
      the same weak/unknown human-gate, active-anchor lifecycle, supersede,
      abandon, and projection paths as explicit slash commands.

**Deliverables**: confirmed implicit intent enters the existing slash-mode
pipeline, with no parallel durable intake path.

### Phase 5: Anti-nag controls and close-out

- [x] Task 5.1: Add candidate cooldown or suppression state for declined and
      repeated suggestions: 15-minute candidate TTL, five-minute lane cooldown
      after decline, and expiry of outstanding suggestions when explicit
      `/chat` posture is selected.
- [x] Task 5.1a: At the candidate-write layer, treat a re-detected
      `(messageId, targetProduct)` pair as an idempotent duplicate: do not
      append a second candidate system segment for the same `candidateId`. The
      detector itself is deterministic, so this guard sits at the persistence
      boundary, not inside the pure detection contract from Phase 1.
- [x] Task 5.2: Add tests proving declined candidates are not immediately
      re-suggested for the same message, and that repeated detection for the
      same `messageId` does not append duplicate candidate segments.
- [ ] Task 5.3: Add i18n coverage for Web and Telegram suggestion/confirmation
      copy.
- [ ] Task 5.4: Run the targeted implicit-intent suite plus the existing
      SPEC-104 slash-mode regression suite.
- [ ] Task 5.5: Update SPEC-105 and PLAN-093 with implementation differences
      and verification notes.

**Deliverables**: the flow is safe against false positives, duplicate
materialization, and command-pipeline drift.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/shared/**` | Create/Modify | Shared implicit product-intent detector and metadata helpers. |
| `src/products/chat/**` | Modify | Candidate metadata, confirmation handling, and bridge into SPEC-104 intake. |
| `src/products/chat/renderer/**` | Modify | Web confirmation affordance for direct-lane candidates. |
| `src/platform/transports/telegram/**` | Modify | Telegram ordinary-text detection and confirmation affordance after command parsing. |
| `src/shared/i18n/**` or current catalog location | Modify | Suggestion, confirm, decline, and human-gate strings. |
| `tests/**` | Create/Modify | Detector, confirmation, false-positive, transport parity, and slash-mode handoff coverage. |
| `docs/specs/SPEC-105-direct-chat-implicit-product-intent.md` | Modify | Keep contract aligned with implementation. |
| `docs/plans/PLAN-093-direct-chat-implicit-product-intent-rollout.md` | Modify | Track progress by slice. |

## Technical Decisions

- Implicit intent is a candidate only. Confirmation is required before posture
  or durable state changes.
- Confirmation bridges into SPEC-104 and must not fork the durable intake path.
- The original user message remains ordinary transcript text; slash-equivalent
  command data is derived metadata.
- Candidate, confirm, decline, and expire are append-only system segments keyed
  by `candidateId`.
- Web v1 reuses the existing `ChatMessage.choices` schema. Telegram v1 uses
  inline keyboards with compact `callback_data` carrying source message id,
  target product, and transition; the bridge resolves the full `candidateId`
  from transcript metadata.
- Mobile renders candidate/confirmation system segments as read-only entries
  in this MVP; accidental confirm/decline taps surface the standard
  desktop-only alert.
- Confirmed implicit commands keep `ProductIntentCommandMetadata.rawCommandToken`
  as a string and use the sentinel `(implicit-confirmation)`. Do not widen it
  to nullable for this MVP.
- Candidate-stage Cat behavior remains ordinary direct chat. The detector is a
  product sidecar and does not suppress the Cat's normal reply.
- Detection and Cat capability are separate. The detector identifies product
  intent, while SPEC-104 provider capability profiles decide durable action.
- MVP scope is direct-message only.

## Testing Strategy

- **Unit tests**:
  - detector returns `none`, `work`, or `code`
  - detector v1 does not call provider/runtime/LLM classifier dependencies
  - false positives return `none`
  - explicit slash commands bypass implicit detection
  - candidate metadata includes `candidateId`, original message id, transport,
    and expiry
  - candidate transition metadata is append-only and idempotent
  - repeated candidate writes for the same `messageId` and target product are
    a no-op at the persistence boundary
  - non-direct messages are ignored
- **Integration tests**:
  - candidate suggestion creates no Work Item before confirmation
  - ordinary Cat dispatch still proceeds on a candidate suggestion
  - Web strong-Cat Work confirm creates the same draft anchor as SPEC-104
  - Telegram strong-Cat Code confirm creates the same draft anchor as SPEC-104
  - mobile renders candidate/confirmation system segments read-only and blocks
    confirm/decline with the standard desktop-only alert
  - confirmed Work candidate follows explicit `/work` semantics
  - confirmed Code candidate follows explicit `/code` semantics
  - weak/unknown Cats remain human-gated after confirmation
  - decline/ignore leaves posture and active anchors unchanged
  - repeated confirmation is idempotent
- **Regression tests**:
  - existing SPEC-104 slash-mode parser, posture, anchor, and human-gate suite
    still passes
  - ordinary direct chat dispatch remains unchanged when detector returns none
- **Manual testing**:
  - Web direct lane: ordinary Work-like sentence, confirm, verify Work anchor
  - Telegram direct lane: ordinary Code-like sentence, confirm, verify same
    path as slash-mode
  - Casual direct chat: verify no repeated suggestion

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Classifier creates durable work without user intent | High | Candidate-only contract, confirmation gate, tests proving no pre-confirmation durable writes. |
| Natural chat gets nagged as Work/Code | High | Low-confidence returns `none`, false-positive tests, cooldown/suppression state. |
| Per-message detector overhead inflates cost on chatty direct lanes | High | V1 is deterministic/local only. Any future provider-backed detector requires opt-in budget, per-lane cooldown, and observability before activation. |
| Web and Telegram drift | Medium | Shared detector contract and transport parity tests. |
| Implicit path forks away from SPEC-104 | High | Confirmed candidates translate into the existing slash-mode command input. |
| Original transcript loses user wording | Medium | Store slash-equivalent data as metadata only; keep transcript unchanged. |
| Weak Cat bypasses human gate | High | Reuse SPEC-104 provider capability gate after confirmation. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-06 | Phase 5 duplicate-guard coverage landed: candidate-write idempotency is now expressed as a shared persistence-boundary helper used by routing and covered by tests proving the same `candidateId` is not appendable twice while a different target for the same message remains distinct. Decline cooldown coverage already proves immediate re-suggestion is suppressed. |
| 2026-05-06 | Phase 4 lifecycle close-out landed: confirmed implicit Work/Code candidates now have integration coverage for weak/unknown gates, active-anchor supersede, `/chat` abandonment, and Work projection visibility through the same core Work Item path as explicit slash-mode. |
| 2026-05-06 | Telegram parity close-out landed: targeted dispatch coverage now proves Telegram-sourced implicit Code candidates preserve `source: 'telegram'` through confirmation and create the same Code-target draft anchor as Web/explicit slash-mode. |
| 2026-05-06 | Phase 5 anti-nag slice landed: routing now suppresses new suggestions for five minutes after a decline, expires outstanding suggestions when `/chat` is selected, expires TTL-stale suggestions before later candidate writes, and skips duplicate candidate writes for the same `candidateId` at the persistence boundary. |
| 2026-05-06 | Phase 3 Telegram callback slice landed: Telegram callback queries can now be parsed as implicit-intent confirm/decline actions and bridged into the same Chat `choiceResponse` path used by Web. Callback data uses `ipi:v1:<sourceMessageId>:<w|c>:<confirm|decline>` and the bridge resolves the full candidate from transcript metadata to stay under Telegram's 64-byte callback limit. |
| 2026-05-06 | Phase 3 Telegram suggestion slice landed: ordinary Telegram direct text now uses the same routing-side detector path as Web, and candidate system messages can be delivered back to Telegram as a separate suggestion with inline keyboard markup. |
| 2026-05-06 | Phase 4 handoff coverage slice landed: confirmed implicit Work and Code candidates now have tests proving they synthesize the same product-intent command shape as explicit `/work` and `/code`, preserve original-message context without rewriting the transcript, and reuse SPEC-104's strong/weak audience gate. Full lifecycle coverage for supersede, abandon, projection, and weak/unknown variants remains in Task 4.6. |
| 2026-05-06 | Phase 2 Web confirmation slice landed: Web `decline` now appends a declined transition without dispatching a Cat or creating durable intake; Web `confirm_work` now synthesizes the `(implicit-confirmation)` command metadata and enters SPEC-104's slash-mode intake path; repeated confirmation of the same candidate is a no-op and does not create duplicate anchors. |
| 2026-05-06 | Phase 2 sidecar slice landed: ordinary direct messages that detect as Work/Code candidates now append a localized system suggestion with the existing `ChatMessage.choices` schema (`confirm_work` / `confirm_code` / `decline`) while preserving ordinary Cat dispatch and proving no Work Item is created before confirmation. |
| 2026-05-06 | Phase 1 detector/metadata slice landed: added the browser-safe deterministic `detectImplicitProductIntent` helper, candidate/transition metadata builders, typed channel metadata keys, and unit coverage for direct-only detection, slash-command bypass, casual false positives, candidate expiry, and sentinel confirmed-command metadata. |
| 2026-05-06 | Follow-up review close-out (round 2): metadata key names pinned (`metadata.implicitProductIntentCandidate` for suggestions, `metadata.implicitProductIntentTransition` for confirm/decline/expire) so renderers can disambiguate from SPEC-104's `metadata.directSlashMode` and weak-gate `ChatMessage.choices`; the candidate-write idempotency guard moved from Phase 1 (Task 1.2b) into Phase 5 (Task 5.1a) where the persistence layer can actually enforce it; mobile read-only constraint clarified as a v1 scope decision specific to implicit-intent confirmation rather than a global mobile rule. |
| 2026-05-06 | Follow-up review close-out: `rawCommandToken` now stays string-only with `(implicit-confirmation)` sentinel; Web confirmation reuses `ChatMessage.choices`; mobile renders candidate/transition segments read-only with desktop-only alert on accidental action taps; detector cue examples are illustrative and repeated same-message detection is idempotent. |
| 2026-05-06 | Follow-up review alignment: detector v1 is now locked to conservative deterministic heuristics; candidate/confirm/decline/expire are append-only system events; Web uses inline message choices, Telegram uses inline keyboard callback data; confirmed implicit commands synthesize routing metadata without rewriting transcript or faking slash tokens. |
| 2026-05-06 | Plan created as a follow-up to PLAN-092. Natural-language Work/Code detection is candidate-only and must bridge into SPEC-104 after explicit owner confirmation. |

---

*Created: 2026-05-06*
*Author: Codex*
