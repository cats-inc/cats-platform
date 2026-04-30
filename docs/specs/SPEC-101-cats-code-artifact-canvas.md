# SPEC-101: Cats Code Artifact Canvas

> Define the split-canvas artifact presentation surface for Cats Code, including
> assistant-driven `show_in_canvas` / `clear_canvas` tool calls and the first
> safe iframe viewer contract.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |
| **Related Plan** | [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md) |

## Summary

Cats Code needs a right-hand Artifact Canvas that can open beside the active
Code chat/task surface without replacing it. The assistant may request this
canvas through structured tool calls, but the visible content must remain bound
to a validated `CoreArtifactRecord` or same-turn accepted artifact declaration.

This spec covers the Phase 1 contract: task-scoped canvas focus, `show_in_canvas`
and `clear_canvas`, split-pane layout, a pane-local top bar, and an iframe
viewer for safe preview URL artifacts. Image, PDF, code viewers, and live
`npm start`-style process supervision are follow-up work.

## Goals

- Let a Code assistant request that a recorded artifact be shown in the main
  canvas beside the conversation.
- Keep presentation requests structured; transcript prose is not a UI command.
- Reuse the `declare_artifact` / Core artifact pipeline as the durable source
  of truth.
- Give the Artifact Canvas its own top bar and controls, independent of the
  chat top bar and sidebar.
- Establish a safe iframe policy before live preview work starts.

## Non-Goals

- Starting or supervising local preview servers.
- Letting providers or assistants emit raw iframe HTML.
- Adding a new Core record family for canvas focus in Phase 1.
- Replacing the Artifacts sidebar or artifact detail route.
- Implementing image, PDF, or code snippet viewers in Phase 1.
- Exposing the canvas tools as public HTTP APIs.

## User Stories

- As an operator, I want the assistant to show a generated preview beside the
  chat while the conversation remains visible.
- As an operator, I want to close or open the preview externally without
  changing the current Code chat.
- As a Code assistant, I want a structured way to ask Cats Code to present an
  artifact I just declared.
- As a platform integrator, I want all presented content to pass through the
  same artifact validation and safety gates as the sidebar.

## Requirements

### Functional Requirements

1. Cats Code shall support a split canvas with the active Code chat/task on the
   left and an Artifact Canvas pane on the right.
2. The Artifact Canvas pane shall mount only when there is a valid canvas focus.
3. Phase 1 canvas focus shall be task-scoped and stored under
   `CoreTaskRecord.metadata.codeCanvasFocus`.
4. Cats Code shall not add `CoreConversationRecord.metadata` or a new Core
   canvas-focus record family for Phase 1.
5. Canvas focus shall reference exactly one materialized `CoreArtifactRecord`.
6. Assistant-driven focus shall be accepted only through the `show_in_canvas`
   runtime tool, or through a product-internal delegate that applies the same
   validation.
7. Manual close shall call the same clear delegate used by `clear_canvas`;
   renderer-only hiding may be used for transient UI collapse, but it must not
   claim the server focus was cleared.
8. `show_in_canvas` shall accept exactly one identity:
   - `artifactId`
   - `declarationId`
9. `declarationId` shall resolve only against accepted same-turn
   `declare_artifact` results from the active Code assistant turn.
10. `artifactId` shall resolve only to a Code-relevant artifact that is
    compatible with the active Code task/session context.
11. `show_in_canvas` shall accept `presentation = 'auto' | 'iframe' | 'image' |
    'pdf' | 'code'`; Phase 1 may reject or downgrade non-iframe requests to
    `unsupported`.
12. `clear_canvas` shall clear the active task's `codeCanvasFocus`.
13. The renderer shall ignore transcript prose, markdown links, and JSON-looking
    snippets as canvas commands.
14. The pane top bar shall show artifact title, resolved presentation, status,
    close, refresh, and open-external controls when supported.
15. The first viewer shall render only server-approved iframe preview targets.
16. The Artifacts sidebar and artifact detail route shall continue to work
    without opening the split pane unless the user or assistant explicitly
    requests presentation.
17. Accepted / rejected canvas tool results shall be projected into the
    persisted assistant turn, matching the `declare_artifact` trace pattern.

### Non-Functional Requirements

- **Safety**: iframe URLs must pass server-side and client-side policy checks.
- **Traceability**: assistant-driven focus changes must be visible in the
  persisted tool-use / tool-result transcript.
- **Separation**: artifact materialization and artifact presentation remain
  distinct contracts.
- **Responsiveness**: the split-pane layout must preserve usable minimum widths
  for the chat and preview pane.
- **Extensibility**: viewer selection must be registry-shaped so image, PDF,
  code, and future app preview viewers can be added without changing tool names.

## Contract

### Canvas Focus Shape

Phase 1 stores focus under `CoreTaskRecord.metadata.codeCanvasFocus`:

```ts
interface CodeCanvasFocus {
  schemaVersion: '1.0';
  artifactId: string;
  presentationRequested: 'auto' | 'iframe' | 'image' | 'pdf' | 'code';
  presentationResolved: 'iframe' | 'image' | 'pdf' | 'code' | 'unsupported';
  openedAt: string;
  openedBy: {
    kind: 'agent' | 'user' | 'system';
    actorId: string | null;
    runtimeSessionId: string | null;
    toolCallId: string | null;
  };
}
```

The Code task/detail projection shall expose this as read-only `canvasFocus`.
Projection code shall drop malformed focus metadata rather than surfacing a
partial or unsafe pane.

### Tool: `show_in_canvas`

Caller-visible input:

```ts
interface ShowInCanvasInput {
  artifactId?: string | null;
  declarationId?: string | null;
  presentation?: 'auto' | 'iframe' | 'image' | 'pdf' | 'code' | null;
}
```

Validation:

- exactly one of `artifactId` or `declarationId` is required;
- `presentation` defaults to `auto`;
- `declarationId` must match an accepted same-turn `declare_artifact` result;
- resolved artifact must exist and be Code-relevant;
- resolved artifact must be anchored to the active task, run, conversation, or
  codespace according to the same anchor rules used by SPEC-092;
- the caller must be the active Code assistant/session or the authenticated
  owner user;
- unsupported presentation is rejected or normalized to `unsupported` with a
  clear tool result.

Accepted result:

```ts
interface ShowInCanvasAccepted {
  status: 'accepted';
  artifactId: string;
  presentationResolved: 'iframe' | 'image' | 'pdf' | 'code' | 'unsupported';
}
```

Rejected result:

```ts
interface ShowInCanvasRejected {
  status: 'rejected';
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

### Tool: `clear_canvas`

Caller-visible input is empty:

```ts
interface ClearCanvasInput {}
```

Validation:

- active Code task context is required;
- agent callers must come from the active runtime session;
- user callers may clear through the product-internal delegate.

Accepted result:

```ts
interface ClearCanvasAccepted {
  status: 'accepted';
  cleared: true;
}
```

### Presentation Resolution

`presentation = 'auto'` resolves from server-normalized artifact metadata:

| Artifact signal | Phase 1 result |
|-----------------|----------------|
| `kind = 'preview'` and preview target is safe iframe URL | `iframe` |
| URL path ending in a known image extension | `unsupported` in Phase 1; `image` in Phase 2 |
| URL path ending in `.pdf` | `unsupported` in Phase 1; `pdf` in Phase 2 |
| `location.kind = 'inline_summary'` or text/code mime type | `unsupported` in Phase 1; `code` in Phase 2 |
| no safe inline target | `unsupported` |

`unsupported` is a valid resolved state. It opens a pane with artifact metadata
and external-open/download affordances rather than embedding unsafe content.

## Iframe Policy

Phase 1 iframe rendering shall obey all of these rules:

- allowed URL schemes: `http:`, `https:`, and app-served relative URLs that the
  server has explicitly classified as preview-safe;
- rejected URL schemes: `file:`, `javascript:`, `data:`, `blob:`, and raw
  local filesystem paths;
- iframe attributes:

```tsx
<iframe
  sandbox="allow-scripts allow-forms allow-popups"
  referrerPolicy="no-referrer"
  allow=""
/>
```

- `allow-same-origin` is not default. It may be added only for server-verified
  runtime-owned preview origins, not arbitrary remote URLs and not Cats app
  routes.
- Renderer code must re-check the safe target before embedding, even when the
  server projection already accepted it.

## Design Overview

```text
assistant output
  -> declare_artifact
  -> CoreArtifactRecord
  -> show_in_canvas(artifactId or same-turn declarationId)
  -> validate artifact/task/session/presentation policy
  -> CoreTaskRecord.metadata.codeCanvasFocus
  -> Code projection exposes canvasFocus
  -> renderer mounts split Artifact Canvas pane
```

The canvas tools are presentation tools, not artifact creation tools. They do
not bypass `declare_artifact`, and they do not scan the filesystem.

## Dependencies

- [SPEC-092](./SPEC-092-code-artifact-declaration-contract.md)
- [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md)
- [SPEC-091](./SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)
- [ADR-019](../decisions/019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [ADR-088](../decisions/088-use-structured-artifact-declarations-for-code-materialization.md)
- [Tool Call Registry](../tool-calls.md)
- [Research note](../research/2026-04-30-cats-code-split-canvas-artifact-panel.md)

## Open Questions

- [ ] Should Phase 2 add a route query override so users can temporarily inspect
      a sidebar artifact without changing task-scoped focus?
- [ ] Should canvas focus changes also append `CoreActivityRecord` rows, or is
      the persisted tool trace enough for Phase 1 audit?
- [ ] Which exact runtime-owned origins may receive `allow-same-origin` for
      iframe previews?

---

*Created: 2026-04-30*
*Author: Codex*
*Related Plan: [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md)*
