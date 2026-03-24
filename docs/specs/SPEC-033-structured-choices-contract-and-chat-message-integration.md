# SPEC-033: Structured Choices Contract and Chat Message Integration

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Claude |
| **Reviewer** | User |

## Summary

Define a `ChatMessageChoice` data contract that allows any Cat to present
clickable structured options to the owner within a chat message. The owner
selects options via buttons (not typing), and the selection is sent back to the
Cat's runtime session to continue the conversation. The contract is
first-class in the chat message model, and answered choices remain replayable
in transcript history. This mechanism is the standard implementation for all
human approval gates (ADR-034) and pre-dispatch clarification workflows.

## Goals

- Let any Cat (Boss Cat, Lead Cat, Normal Cat) attach structured options to
  any chat message
- Provide a clickable button UI that requires no typing from the owner
- Support multi-select, custom input, and skip
- Route owner selections back to the originating Cat's runtime session
- Preserve owner choice responses in transcript history and governance audit
  records
- Serve as the standard mechanism for ADR-034 approval gates

## Non-Goals

- Telegram / LINE inline keyboard rendering (future transport mapping)
- Rich card / widget system beyond simple choice buttons
- Modifying cats-runtime (existing session message API is sufficient)
- Replacing the existing approval queue panel immediately (it remains as a
  secondary inbox/fallback surface backed by the same approval source)

## User Stories

- As an owner, I want Boss Cat to ask me clarifying questions with clickable
  options so I can quickly specify my requirements without typing long answers
- As an owner, I want to see review results from Peer Cats with approve/revise
  buttons so I can make decisions with one click
- As an owner, I want to skip clarifying questions when my intent is already
  clear

## Requirements

### Functional Requirements

1. The chat message data model shall support an optional `choices` field
   containing an array of `ChatMessageChoice` objects.

2. The chat message data model shall support an optional
   `choiceResponse` field on reply messages so answered choices remain
   replayable in transcript history.

3. Each `ChatMessageChoice` shall contain:
   - `question` (string, required) — the question text
   - `options` (array of `ChatMessageOption`, required) — the available choices
   - `multiSelect` (boolean, optional, default false) — allow selecting
     multiple options
   - `allowCustom` (boolean, optional, default false) — show a free-text
     input field alongside options
   - `allowSkip` (boolean, optional, default false) — show a skip button

4. Each `ChatMessageOption` shall contain:
   - `id` (string, required) — option identifier sent back in the response
   - `label` (string, required) — button display text
   - `description` (string, optional) — tooltip or secondary text
   - `style` (enum: `primary` | `secondary` | `danger`, optional) — visual
     styling hint

5. Each `ChatMessageChoiceResponse` shall contain:
   - `sourceMessageId` (string, required) — the choice-bearing message being
     answered
   - `status` (enum: `submitted` | `skipped`, required)
   - `answers` (array, required) — one item per answered or skipped question
   - `submittedAt` (string, required)

6. The chat renderer shall detect messages with `choices` and render them as
   interactive button groups below the message body.

7. When the owner selects option(s) and confirms, the product layer shall send
   the selection back to the Cat's runtime session via the existing
   `POST /sessions/:id/messages` API. The response payload shall include:
   - The original question text
   - Selected option id(s)
   - Custom input text (if provided)

8. After the owner submits a choice, the buttons shall become disabled and show
   the selected state (visual confirmation of what was chosen).

9. A Cat shall be able to include multiple `ChatMessageChoice` objects in a
   single message (e.g., 3 questions at once).

10. If `allowSkip` is true and the owner clicks skip, the product layer shall
   send a skip signal to the Cat's session, and the Cat shall proceed without
   the clarification.

11. After a choice submission or skip, the product layer shall append a new
    transcript message containing `choiceResponse` and a human-readable summary
    of what the owner selected. This transcript message is the replay/export
    record for the decision.

12. If a choice corresponds to a governance event (approval, budget override,
    release gate, etc.), the product layer shall also record the decision in
    the existing Core approval/activity records. Transcript history does not
    replace governance audit state.

13. The canonical product contract shall be first-class `choices` and
    `choiceResponse` fields on `ChatMessage`. If a model emits an embedded JSON
    block in the message body, an adapter layer may parse it once and normalize
    it before persistence/rendering. The renderer, store, and transport layers
    shall not depend on regex/body parsing as the steady-state contract.

14. `ApprovalQueuePanel` shall continue to surface pending approvals as a
    secondary inbox/fallback view, but any active-conversation approval prompt
    shall prefer inline structured choices backed by the same underlying
    approval record.

### Non-Functional Requirements

- Button rendering shall feel instant (no loading state for displaying choices)
- Selection submission shall use the existing session message API — no new
  endpoints required
- The contract shall be JSON-serializable for transport compatibility
  (Telegram inline keyboards, future transports)

## Design Overview

### Data Contract

```typescript
interface ChatMessageChoice {
  question: string;
  options: ChatMessageOption[];
  multiSelect?: boolean;
  allowCustom?: boolean;
  allowSkip?: boolean;
}

interface ChatMessageOption {
  id: string;
  label: string;
  description?: string;
  style?: 'primary' | 'secondary' | 'danger';
}

interface ChatMessageChoiceAnswer {
  question: string;
  selectedOptionIds: string[];
  customText?: string;
  skipped?: boolean;
}

interface ChatMessageChoiceResponse {
  sourceMessageId: string;
  status: 'submitted' | 'skipped';
  answers: ChatMessageChoiceAnswer[];
  submittedAt: string;
}

// Extension to existing ChatMessage
interface ChatMessage {
  // ...existing fields (id, body, senderName, senderKind, metadata)
  choices?: ChatMessageChoice[];
  choiceResponse?: ChatMessageChoiceResponse | null;
}
```

### How a Cat Produces Choices

Two mechanisms, both requiring no runtime changes:

**Via SKILL.md prompt guidance:**

A Cat with the `structured-choices` skill is instructed to embed a JSON block
in its response when it needs owner input:

```json
{"choices": [
  {
    "question": "你偏好哪種風格？",
    "options": [
      {"id": "minimal", "label": "簡約現代"},
      {"id": "corporate", "label": "企業正式"}
    ],
    "allowCustom": true
  }
]}
```

The product layer may parse this embedded JSON as a compatibility shim, but it
must normalize the result into first-class `choices` before persistence and
rendering.

**Via structured tool output:**

If the Cat's provider supports structured output or tool calls, the Cat can
emit choices as a structured tool result. The product layer intercepts and
renders accordingly.

### Response Flow

```
Cat message with choices → Chat renderer shows buttons
  → Owner clicks [簡約現代]
  → Product layer appends a response message with `choiceResponse`
  → Product layer sends to POST /sessions/:id/messages:
    { message: "Q: 你偏好哪種風格？\nA: 簡約現代" }
  → Source choice message becomes resolved/disabled
  → Cat receives answer, continues conversation
```

### UI Reference

`prompt-forge/src/components/ClarifyQuestions.tsx` provides a proven
implementation of:

- `toggleOption()` — multi-select toggle state management
- `toggleCustom()` / `setCustom()` — custom input expand/collapse
- `allAnswered` — validation that all questions have responses
- `handleSubmit()` — merge selections + custom text into final answer
- Selected/unselected button styling (Tailwind-based)

## Dependencies

- [ADR-034](../decisions/034-require-human-approval-gates-at-pipeline-decision-points.md)
  — this SPEC provides the mechanism for ADR-034's approval gates
- `prompt-forge/src/components/ClarifyQuestions.tsx` — UI reference
  implementation
- `prompt-forge/supabase/functions/enhance-prompt/providers/types.ts` —
  `ClarifyQuestion` / `ClarifyResult` data structure reference
- cats-runtime session message API — `POST /sessions/:id/messages` (existing,
  no changes needed)
- `cats` approval queue / core approval APIs — inline choices and
  `ApprovalQueuePanel` share the same approval source of truth

## Resolved Direction

- The canonical contract is first-class `choices` / `choiceResponse` on
  `ChatMessage`. Embedded JSON in `body` is only an adapter-layer compatibility
  input.
- Answered choices are stored as transcript messages with `choiceResponse` and,
  when governance-relevant, also written to core approval/activity records.
- `ApprovalQueuePanel` coexists as a secondary inbox/fallback surface; inline
  structured choices are the primary UX inside an active conversation.

## References

- [Research: Structured Choices Design Reference](../research/2026-03-24-structured-choices-design-reference.md)
- [Research: OpenManus Reference Analysis](../research/2026-03-24-openmanus-reference-analysis.md)
  (AskHuman tool — confirms interrupt/resume pattern)
- [SPEC-032](./SPEC-032-core-task-lifecycle-and-wakeup-integration.md) —
  task lifecycle uses structured choices for owner decisions at checkpoints
- `prompt-forge/src/components/ClarifyQuestions.tsx`
- `prompt-forge/supabase/functions/enhance-prompt/providers/types.ts`

---

*Created: 2026-03-24*
*Author: Claude*
