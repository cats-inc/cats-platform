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
Cat's runtime session to continue the conversation. This mechanism is the
standard implementation for all human approval gates (ADR-034) and pre-dispatch
clarification workflows.

## Goals

- Let any Cat (Boss Cat, Lead Cat, Normal Cat) attach structured options to
  any chat message
- Provide a clickable button UI that requires no typing from the owner
- Support multi-select, custom input, and skip
- Route owner selections back to the originating Cat's runtime session
- Serve as the standard mechanism for ADR-034 approval gates

## Non-Goals

- Telegram / LINE inline keyboard rendering (future transport mapping)
- Rich card / widget system beyond simple choice buttons
- Modifying cats-runtime (existing session message API is sufficient)
- Replacing the existing approval queue panel (it continues to work for
  formal dispatch approvals)

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

2. Each `ChatMessageChoice` shall contain:
   - `question` (string, required) — the question text
   - `options` (array of `ChatMessageOption`, required) — the available choices
   - `multiSelect` (boolean, optional, default false) — allow selecting
     multiple options
   - `allowCustom` (boolean, optional, default false) — show a free-text
     input field alongside options
   - `allowSkip` (boolean, optional, default false) — show a skip button

3. Each `ChatMessageOption` shall contain:
   - `id` (string, required) — option identifier sent back in the response
   - `label` (string, required) — button display text
   - `description` (string, optional) — tooltip or secondary text
   - `style` (enum: `primary` | `secondary` | `danger`, optional) — visual
     styling hint

4. The chat renderer shall detect messages with `choices` and render them as
   interactive button groups below the message body.

5. When the owner selects option(s) and confirms, the product layer shall send
   the selection back to the Cat's runtime session via the existing
   `POST /sessions/:id/messages` API. The response payload shall include:
   - The original question text
   - Selected option id(s)
   - Custom input text (if provided)

6. After the owner submits a choice, the buttons shall become disabled and show
   the selected state (visual confirmation of what was chosen).

7. A Cat shall be able to include multiple `ChatMessageChoice` objects in a
   single message (e.g., 3 questions at once).

8. If `allowSkip` is true and the owner clicks skip, the product layer shall
   send a skip signal to the Cat's session, and the Cat shall proceed without
   the clarification.

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

// Extension to existing ChatMessage
interface ChatMessage {
  // ...existing fields (id, body, senderName, senderKind, metadata)
  choices?: ChatMessageChoice[];
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

The product layer detects and parses this JSON from the message body, then
renders it as buttons.

**Via structured tool output:**

If the Cat's provider supports structured output or tool calls, the Cat can
emit choices as a structured tool result. The product layer intercepts and
renders accordingly.

### Response Flow

```
Cat message with choices → Chat renderer shows buttons
  → Owner clicks [簡約現代]
  → Product layer sends to POST /sessions/:id/messages:
    { message: "Q: 你偏好哪種風格？\nA: 簡約現代" }
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

## Open Questions

- [ ] Should the JSON choices block be detected via regex in the message body,
  or should it be a first-class field set by the product layer before rendering?
- [ ] Should answered choices be stored in the message record (for history/
  replay), or only forwarded to the session?
- [ ] How should the existing `ApprovalQueuePanel` (approve/reroute/reject)
  relate to this new mechanism? Coexist? Migrate to structured choices?

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
