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

- [ ] Task 1.1: Define a Chat-owned `detectImplicitProductIntent` contract for
      ordinary direct-message text, returning `none`, `work`, or `code` plus
      confidence/reason metadata.
- [ ] Task 1.2: Add the candidate metadata builder for original message id,
      source channel/conversation, transport, target product, confidence,
      reason code, and status.
- [ ] Task 1.3: Ensure explicit `/chat`, `/work`, and `/code` messages remain
      owned by SPEC-104 and are never reclassified by this detector.
- [ ] Task 1.4: Add unit tests for Work, Code, none, low-confidence ambiguity,
      and obvious casual-chat false positives.
- [ ] Task 1.5: Add non-direct negative tests proving the detector is not
      applied outside `direct_message` lanes.

**Deliverables**: shared candidate detection exists as a pure contract with no
durable product side effects.

### Phase 2: Web confirmation UX

- [ ] Task 2.1: Show a Web direct-lane confirmation affordance for Work/Code
      candidates using localized copy.
- [ ] Task 2.2: Add decline/ignore behavior that leaves posture and active
      anchors unchanged.
- [ ] Task 2.3: Add idempotent confirm behavior so one candidate cannot create
      duplicate anchors.
- [ ] Task 2.4: Add Web tests proving candidate suggestion does not create
      Work Items before confirmation.

**Deliverables**: Web users can confirm or decline implicit Work/Code
suggestions without automatic materialization.

### Phase 3: Telegram confirmation UX

- [ ] Task 3.1: Route ordinary Telegram direct text through the same detector
      contract after transport-control and slash-command parsing.
- [ ] Task 3.2: Add Telegram-safe localized suggestion copy that does not expose
      classifier or provider terminology.
- [ ] Task 3.3: Choose and implement the first Telegram confirmation affordance
      (reply keyboard, deep link, or text confirmation).
- [ ] Task 3.4: Add transport parity tests for Telegram and Web candidate
      semantics.

**Deliverables**: Telegram ordinary text can suggest Work/Code intent with the
same confirmation semantics as Web.

### Phase 4: Confirmed handoff to slash-mode intake

- [ ] Task 4.1: Convert confirmed Work candidates into the same product-intent
      command input as `/work <original message>`.
- [ ] Task 4.2: Convert confirmed Code candidates into the same product-intent
      command input as `/code <original message>`.
- [ ] Task 4.3: Preserve original-message source context while keeping the
      transcript text unchanged.
- [ ] Task 4.4: Reuse SPEC-104 direct audience capability gating for strong,
      weak, and unknown Cats.
- [ ] Task 4.5: Add integration tests proving confirmed implicit intent follows
      the same Work Item anchor, human-gate, active-anchor, and projection
      paths as explicit slash commands.

**Deliverables**: confirmed implicit intent enters the existing slash-mode
pipeline, with no parallel durable intake path.

### Phase 5: Anti-nag controls and close-out

- [ ] Task 5.1: Add candidate cooldown or suppression state for declined and
      repeated suggestions.
- [ ] Task 5.2: Add tests proving declined candidates are not immediately
      re-suggested for the same message.
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
- Detection and Cat capability are separate. The detector identifies product
  intent, while SPEC-104 provider capability profiles decide durable action.
- MVP scope is direct-message only.

## Testing Strategy

- **Unit tests**:
  - detector returns `none`, `work`, or `code`
  - false positives return `none`
  - explicit slash commands bypass implicit detection
  - candidate metadata includes original message id and transport
  - non-direct messages are ignored
- **Integration tests**:
  - candidate suggestion creates no Work Item before confirmation
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
| Web and Telegram drift | Medium | Shared detector contract and transport parity tests. |
| Implicit path forks away from SPEC-104 | High | Confirmed candidates translate into the existing slash-mode command input. |
| Original transcript loses user wording | Medium | Store slash-equivalent data as metadata only; keep transcript unchanged. |
| Weak Cat bypasses human gate | High | Reuse SPEC-104 provider capability gate after confirmation. |

## Progress Log

| Date | Update |
|------|--------|
| 2026-05-06 | Plan created as a follow-up to PLAN-092. Natural-language Work/Code detection is candidate-only and must bridge into SPEC-104 after explicit owner confirmation. |

---

*Created: 2026-05-06*
*Author: Codex*
