# Structured Choices in Chat: Design Reference from prompt-forge

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Cats Chat GUI interactive choice mechanism
- **Design Reference**: `prompt-forge/` subproject (same monorepo)
- **Related**:
  - `prompt-forge/src/components/ClarifyQuestions.tsx` — UI component reference
  - `prompt-forge/supabase/functions/enhance-prompt/providers/fleet.ts` — runtime integration reference
  - `prompt-forge/supabase/functions/enhance-prompt/providers/types.ts` — data structure reference
  - `cats-platform/docs/research/2026-03-24-task-substrate-as-heartbeat-foundation.md` — related proposal

---

## Problem

Today in Cats Chat, a Cat (God Cat / Boss Cat / Lead Cat / Normal Cat) cannot attach
clickable structured options to a chat message. The only existing interaction mechanisms are:

- **Approval decision buttons** (Approve / Reroute / Reject) — triggered only by a Boss Cat
  dispatch plan and shown in the right-hand operator rail
- **Incident action buttons** (Retry / Acknowledge) — shown in the operator rail when a run fails

There is no general mechanism for any Cat to ask the owner a question in the conversation
and present clickable options.

This conflicts with the product vision in `CLAUDE.md`:

> Before dispatching work, have a few rounds of interaction with the owner and offer options so the owner can refine the decision

---

## Design Reference: prompt-forge

The `prompt-forge/` subproject in the monorepo already implements the full flow of "AI
generates structured options → user clicks to answer → result is fed back to the AI", and
its backend supports agent-fleet (the predecessor of cats-runtime) as the AI provider.

### Data structures

`prompt-forge/supabase/functions/enhance-prompt/providers/types.ts`:

```typescript
interface ClarifyQuestion {
  question: string;
  options: string[];
}

interface ClarifyResult {
  questions: ClarifyQuestion[];
}

interface AIProvider {
  clarify(systemPrompt: string, userPrompt: string): Promise<ClarifyResult>;
  enhance(systemPrompt: string, userPrompt: string): Promise<Response>;
}
```

### AI side: how options are generated

The `clarify()` method in `prompt-forge/supabase/functions/enhance-prompt/providers/fleet.ts`:

- Creates a runtime session (`POST /sessions`)
- Sends the clarify prompt, asking the AI to return JSON:
  `{"questions": [{"question": "...", "options": ["A", "B", "C"]}]}`
- Collects the full text of the NDJSON stream
- Parses the JSON and returns a `ClarifyResult`
- Deletes the session

The AI can decide "no clarification needed" → return an empty array `{"questions": []}` and
go straight to the next step.

### UI side: how options are presented

`prompt-forge/src/components/ClarifyQuestions.tsx`:

- Each question is rendered as a row of **toggle buttons** (multi-select)
- Clicking an option toggles it between selected and unselected
- An extra `…` button expands a custom text input
- The bottom has **Confirm** and **Skip** buttons (labeled "Confirm" and "Skip" in the UI)
- When answering is done, all choices are joined into text and appended to the original prompt before sending

### State machine

`prompt-forge/src/pages/Index.tsx`:

```
idle → clarifying (waiting for the AI to generate questions)
     → answering (the user sees the buttons and clicks to answer)
     → enhancing (final processing with the answers)
     → idle
```

### Runtime integration

The API used by the prompt-forge fleet provider:

```
POST   /sessions                    → create session
GET    /sessions/:id                → wait for ready
POST   /sessions/:id/messages       → send message (NDJSON stream)
DELETE /sessions/:id                → clear session
```

**This is exactly the same as the cats-runtime HTTP API** — cats-runtime evolved from
agent-fleet, and these endpoints were all kept. cats-runtime needs no changes to support
this flow.

---

## Proposed Cats Chat Contract

Extends prompt-forge's `ClarifyQuestion` with more generality:

```typescript
interface ChatMessageChoice {
  question: string;              // question text
  options: ChatMessageOption[];  // selectable options
  allowCustom?: boolean;         // corresponds to the prompt-forge "…" button
  allowSkip?: boolean;           // corresponds to prompt-forge Skip
  multiSelect?: boolean;         // corresponds to prompt-forge toggle multi-select
}

interface ChatMessageOption {
  id: string;                    // option identifier
  label: string;                 // button text
  description?: string;          // tooltip description
  style?: 'primary' | 'secondary' | 'danger';
}

interface ChatMessage {
  // ...existing fields (id, body, senderName, senderKind, metadata)
  choices?: ChatMessageChoice[];  // structured options attached by the Cat
}
```

### Differences from prompt-forge

| Aspect | prompt-forge | Cats Chat (proposed) |
|------|-------------|-------------------|
| Trigger point | Fixed: asks once before enhance | Any Cat can attach choices to any message |
| Embedding | Separate panel (outside the transcript) | Inside the message in the chat transcript |
| Option source | The clarify prompt asks the AI to generate them | The Cat's skill/prompt instructions or runtime structured output |
| Return path | Joined into text appended to the prompt | Payload sent back to the corresponding Cat session to continue the conversation |
| Multiple rounds | Single clarify → enhance | A Cat can ask repeatedly, each time with choices |
| Option metadata | None (plain text) | id + description + style |

### UI logic that can be reused directly

The following logic in `ClarifyQuestions.tsx` can be referenced or ported directly:

- `toggleOption()` — multi-select toggle state management
- `toggleCustom()` / `setCustom()` — expanding/collapsing the `…` custom input
- `allAnswered` — validates that every question has been answered
- `handleSubmit()` — merges multi-select and custom input into the final answer
- CSS styles — visual switch between selected/unselected buttons (already in Tailwind)

---

## Implementation Path

### What needs to change (cats product layer)

1. **ChatMessage extension** — add a `choices?: ChatMessageChoice[]` field
2. **Chat renderer** — add a `MessageChoices` component (modeled on `ClarifyQuestions.tsx`)
   that renders the buttons inside the message bubble
3. **Choice return** — after the user clicks, send the payload back to the Cat's runtime
   session through the existing message route
4. **Cat prompt guidance** — add instructions to the Cat's skill/prompt telling the AI it can
   return the `{"choices": [...]}` format to trigger interactive buttons

### What does not need to change

- **cats-runtime** — the existing session/message API is sufficient. prompt-forge already
  runs end to end on the same API with agent-fleet (the predecessor of cats-runtime)
- **Runtime message format** — the `type: "text"` events in the NDJSON stream can already carry
  any text content, including JSON structured output
- **Session lifecycle** — no new session for choices and no change to session behavior

---

## Use Cases

### Scenario 1: Boss Cat asks the owner before dispatching work

```
Boss Cat: Got it, you want to build a landing page. I have a few questions to confirm:

  1. Which style do you prefer?
     [Minimal modern] [Corporate formal] [Lively creative] [...]

  2. Which sections do you need?
     [Hero Banner] [Feature overview] [Pricing plans] [Customer testimonials] [...]

  3. Any preferred tech stack?
     [React + Tailwind] [Vue + UnoCSS] [Plain HTML/CSS] [...]

  [Confirm] [Skip, just start]
```

### Scenario 2: Coder Cat hits a design decision

```
Coder Cat: There are two options for the database schema, each with trade-offs:

  Option A or Option B?
  [A: normalized, flexible queries] [B: denormalized, fast reads]

  [Choose]
```

### Scenario 3: Boss Cat asks on Telegram (future)

Telegram itself supports inline keyboard buttons, so the same `choices` structure can be
mapped to Telegram's `InlineKeyboardMarkup` with no extra data structure.

---

## Conclusion

- prompt-forge has already validated the full flow of "AI generates structured options → button UI → return and continue the conversation"
- The runtime API it uses is the same as cats-runtime, so no runtime-side change is needed
- The logic of the UI component (`ClarifyQuestions.tsx`) can be referenced and ported directly
- What Cats Chat needs is to generalize this mechanism from a "fixed two-stage flow" to "any Cat can use it on any message"
- Recommend including the `ChatMessageChoice` contract in the Chat renderer's scope of work (Team 1)

---

*This document is for review discussion. If the review passes, it is recommended to fold it into the Cats Chat SPEC or into a supplementary section of an existing SPEC.*
