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
7. The pane shall expose two distinct user controls with different semantics:
   - **Close (X)**: invokes the same clear delegate used by `clear_canvas`,
     persists the server change, and survives reload. This is the only path
     that mutates `codeCanvasFocus`.
   - **Collapse / expand**: renderer-only ephemeral toggle. It hides the pane
     visually without touching `codeCanvasFocus`, and a reload restores the
     pane to its expanded state. The renderer shall not surface the collapsed
     state as "cleared".
8. `show_in_canvas` shall accept exactly one identity:
   - `artifactId`
   - `declarationId`
9. `declarationId` shall resolve only against accepted `declare_artifact`
   results recorded in the Code assistant-effect processor's per-turn
   declaration index. The index shall be keyed by
   `(turnId, declarationId)` and shall be populated only by accepted
   same-turn declarations. Cross-turn collisions on `declarationId` shall be
   rejected, even when the prior turn accepted the same id.
10. `artifactId` shall resolve only to a Code-relevant artifact that is
    compatible with the active Code task/session context.
11. `show_in_canvas` shall require an active Code task on the caller's
    surface; calls without an active task shall be rejected with
    `artifact_canvas_no_active_task` and shall not store partial focus.
12. `show_in_canvas` shall accept `presentation = 'auto' | 'iframe' | 'image' |
    'pdf' | 'code'`. Phase 1 resolves all viewer-shaped presentations through
    the iframe viewer using a content-appropriate sandbox profile (see
    §Iframe Policy); only artifacts with no safe inline target resolve to
    `unsupported`.
13. `clear_canvas` shall clear the active task's `codeCanvasFocus` and shall
    require the same active-task precondition as `show_in_canvas`.
14. The renderer shall ignore transcript prose, markdown links, and JSON-looking
    snippets as canvas commands.
15. The pane top bar shall show artifact title, resolved presentation, status,
    close, collapse/expand, refresh, and open-external controls when supported.
16. The first viewer shall render only server-approved iframe preview targets.
17. The renderer shall re-validate the resolved URL scheme and the
    server-emitted iframe sandbox profile before mounting the viewer; a
    mismatch or rejected scheme shall fall back to the metadata / external-link
    state without mounting the iframe.
18. The Artifacts sidebar and artifact detail route shall continue to work
    without opening the split pane unless the user or assistant explicitly
    requests presentation.
19. Accepted / rejected canvas tool results shall be projected into the
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
  iframeSandboxProfile: 'static' | 'scripted-cross-origin' | null;
  openedAt: string;
  openedBy: {
    kind: 'agent' | 'user' | 'system';
    actorId: string | null;
    runtimeSessionId: string | null;
    toolCallId: string | null;
  };
}
```

`iframeSandboxProfile` is non-null only when `presentationResolved` is one of
`iframe`, `image`, or `pdf`; for `code` and `unsupported` it shall be `null`.
The server is the authority that picks the profile (see §Iframe Policy); the
renderer shall not upgrade a `static` profile to `scripted-cross-origin`.

The Code task/detail projection shall expose this as read-only `canvasFocus`.
Projection code shall drop malformed focus metadata rather than surfacing a
partial or unsafe pane. The storage location is fixed by
[ADR-097](../decisions/097-store-code-canvas-focus-on-task-metadata.md);
do not migrate this state to `CoreConversationRecord.metadata` or a new Core
record family without superseding that ADR.

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
- `declarationId` must resolve through the per-turn declaration index keyed
  by `(turnId, declarationId)`; misses (no accepted declaration this turn)
  and stale hits (matching id from a different turn) are both rejected;
- resolved artifact must exist and be Code-relevant;
- resolved artifact must be anchored to the active task, run, conversation, or
  codespace according to the same anchor rules used by SPEC-092;
- the caller must be the active Code assistant/session or the authenticated
  owner user;
- the caller's surface must have an active Code task; calls with no active
  task are rejected with `artifact_canvas_no_active_task`;
- unsupported presentation is rejected or normalized to `unsupported` with a
  clear tool result.

Accepted result:

```ts
interface ShowInCanvasAccepted {
  status: 'accepted';
  artifactId: string;
  presentationResolved: 'iframe' | 'image' | 'pdf' | 'code' | 'unsupported';
  iframeSandboxProfile: 'static' | 'scripted-cross-origin' | null;
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

- active Code task context is required; calls without an active task are
  rejected with `artifact_canvas_no_active_task`;
- agent callers must come from the active runtime session;
- user callers may clear through the product-internal delegate;
- `clear_canvas` is idempotent: calling it when no `codeCanvasFocus` is set
  shall accept and return `cleared: true` without writing task metadata.

Accepted result:

```ts
interface ClearCanvasAccepted {
  status: 'accepted';
  cleared: true;
}
```

### Presentation Resolution

`presentation = 'auto'` resolves from server-normalized artifact metadata.
Phase 1 routes all viewer-shaped presentations through the iframe viewer, but
selects the sandbox profile (see §Iframe Policy) per content type so that
static media never receives `allow-scripts`.

| Artifact signal | Phase 1 `presentationResolved` | `iframeSandboxProfile` |
|-----------------|--------------------------------|------------------------|
| `kind = 'preview'` and preview target is a safe iframe URL | `iframe` | `scripted-cross-origin` |
| URL path ending in a known image extension | `iframe` | `static` |
| URL path ending in `.pdf` | `iframe` | `static` |
| `location.kind = 'inline_summary'` or text/code mime type | `unsupported` in Phase 1; `code` in Phase 2 | `null` |
| no safe inline target | `unsupported` | `null` |

`unsupported` is a valid resolved state. It opens a pane with artifact metadata
and external-open/download affordances rather than embedding unsafe content.
The Phase 2 dedicated `image`, `pdf`, and `code` viewers replace the iframe
fallback for media presentations without changing tool inputs or accepted
results.

## Iframe Policy

Phase 1 iframe rendering shall obey all of these rules.

### URL Scheme Allowlist

- allowed URL schemes: `http:`, `https:`, and app-served relative URLs that
  pass the server-side preview-safe classifier (`normalizePreviewSurfaceUrl`
  or its successor);
- rejected URL schemes: `file:`, `javascript:`, `data:`, `blob:`, and raw
  local filesystem paths;
- the renderer shall re-check the scheme of the projected URL before
  embedding (defense in depth).

### Sandbox Profiles

The server projection picks one of two named sandbox profiles per resolved
focus and emits the choice as `iframeSandboxProfile`. The renderer applies the
profile literally and shall not promote `static` to `scripted-cross-origin`.

- `static` (used for static media: images, PDFs, future binary previews):

  ```tsx
  <iframe
    sandbox=""
    referrerPolicy="no-referrer"
    allow=""
  />
  ```

  No script execution, no same-origin access, no top-level navigation.

- `scripted-cross-origin` (used for `kind = 'preview'` URL artifacts that
  point at a runtime-owned dev server origin distinct from the Cats shell
  origin — typical examples: vite, Next.js dev, Lovable preview, Storybook):

  ```tsx
  <iframe
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    referrerPolicy="no-referrer"
    allow=""
  />
  ```

  `allow-same-origin` here is paired with a cross-origin URL, so the iframe
  document can fetch / route / read storage **inside its own origin** without
  reaching the Cats shell origin. This profile is the only path that may
  combine `allow-scripts` with `allow-same-origin`.

### Same-Origin Rule (the `allow-same-origin` test)

The server may emit `scripted-cross-origin` only when **all** the following
hold:

1. the projected URL is absolute (`http:` or `https:`);
2. the URL parses successfully and yields a non-empty origin;
3. the URL's origin is **not** equal to the Cats shell origin that serves
   the renderer (configured at server boot; in packaged Electron this is the
   app-served origin, in browser dev it is the host serving the renderer
   bundle);
4. the URL is `kind = 'preview'`.

If any condition fails, the server shall fall back to `static`. App-relative
preview URLs (which always resolve to the Cats shell origin) therefore never
qualify for `scripted-cross-origin` and shall always be served as `static`.

### Renderer Re-Check

The renderer shall:

- assert the projected `iframeSandboxProfile` is one of the two named values;
- re-validate the URL scheme through the same allowlist;
- when the projected profile is `scripted-cross-origin`, re-compute the
  same-origin test against the renderer's `window.location.origin` and
  downgrade to `static` rendering (or fall back to the `unsupported` pane)
  if the test fails — that is, the renderer may **only** demote, never
  promote.

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

### Error Code Registry

This registry is the canonical source for Cats Code Artifact Canvas error
codes. TypeScript helper unions and tool-call registry summaries shall
reference these codes instead of inventing local aliases.

| Error code | Trigger |
|------------|---------|
| `artifact_canvas_identity_required` | Neither `artifactId` nor `declarationId` is supplied. |
| `artifact_canvas_identity_conflict` | Both `artifactId` and `declarationId` are supplied. |
| `artifact_canvas_declaration_unknown` | `declarationId` does not match any accepted entry in the per-turn declaration index for the current `(turnId, declarationId)` key. |
| `artifact_canvas_declaration_cross_turn` | `declarationId` matches a declaration accepted in a different turn; cross-turn fallback is not allowed. |
| `artifact_canvas_artifact_not_found` | `artifactId` does not resolve to a Code-relevant `CoreArtifactRecord`. |
| `artifact_canvas_artifact_not_anchored` | The resolved artifact is not anchored to the active task, run, conversation, or codespace. |
| `artifact_canvas_no_active_task` | The caller's surface has no active Code task; canvas focus cannot be set or cleared. |
| `artifact_canvas_caller_not_authorized` | The caller is neither the active Code assistant/session nor the authenticated owner user. |
| `artifact_canvas_presentation_invalid` | `presentation` is not one of `auto`, `iframe`, `image`, `pdf`, `code`. |
| `artifact_canvas_presentation_unsupported` | The server cannot resolve the requested presentation against the artifact (e.g. an `iframe` request for an artifact with no safe URL). |
| `artifact_canvas_iframe_scheme_rejected` | The artifact URL fails the scheme allowlist or normalization. |
| `artifact_canvas_iframe_origin_not_allowed` | A `scripted-cross-origin` request resolves to the Cats shell origin and cannot keep `allow-same-origin`. |

The renderer's defense-in-depth checks shall surface scheme / origin
rejections to the user as the `unsupported` pane state, not as silently
broken iframes; the underlying server-side error code is the canonical record
in the persisted tool trace.

## Dependencies

- [SPEC-092](./SPEC-092-code-artifact-declaration-contract.md)
- [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md)
- [SPEC-091](./SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)
- [ADR-019](../decisions/019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [ADR-088](../decisions/088-use-structured-artifact-declarations-for-code-materialization.md)
- [ADR-097](../decisions/097-store-code-canvas-focus-on-task-metadata.md)
- [Tool Call Registry](../tool-calls.md)
- [Research note](../research/2026-04-30-cats-code-split-canvas-artifact-panel.md)

## Resolved Questions

- **Scope of canvas focus**: task-scoped under
  `CoreTaskRecord.metadata.codeCanvasFocus`. See
  [ADR-097](../decisions/097-store-code-canvas-focus-on-task-metadata.md).
- **Manual close semantics**: explicit two-control model (`Close` writes
  through `clear_canvas`; `Collapse / expand` is renderer-only). See FR7.
- **Phase 1 image / PDF rendering**: served through the iframe viewer with
  the `static` sandbox profile so they remain visible without `allow-scripts`;
  Phase 2 replaces the iframe fallback with dedicated viewers. See
  §Presentation Resolution.
- **`allow-same-origin` eligibility**: `scripted-cross-origin` profile only
  when the projected URL has a non-Cats-shell origin and is `kind = 'preview'`;
  enforced server-side and re-checked client-side. See §Iframe Policy.

## Open Questions

- [ ] Should Phase 2 add a route query override so users can temporarily inspect
      a sidebar artifact without changing task-scoped focus?
- [ ] Should canvas focus changes also append `CoreActivityRecord` rows, or is
      the persisted tool trace enough for Phase 1 audit?

---

*Created: 2026-04-30*
*Author: Codex*
*Related Plan: [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md)*
