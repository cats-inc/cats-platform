# PLAN-090: Cats Code Artifact Canvas Rollout

> Implement the task-scoped split-canvas artifact presentation surface defined
> by SPEC-101.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |

## Related Spec

[SPEC-101: Cats Code Artifact Canvas](../specs/SPEC-101-cats-code-artifact-canvas.md)

## Overview

The rollout should land the Artifact Canvas in small slices: first the
contract/state path, then the renderer split pane, then viewer breadth. The
first implementation must not start local processes. Live app preview work
depends on a separate process-supervision and security review.

## Implementation Phases

### Phase 1: Contract and Task-Scoped Focus

- [ ] Task 1.1: Add Code-owned canvas focus types and normalizers for
      `CoreTaskRecord.metadata.codeCanvasFocus`.
- [ ] Task 1.2: Add `show_in_canvas` and `clear_canvas` tool input/result
      helpers with context-free validation.
- [ ] Task 1.3: Add a Code assistant-effect processor that resolves
      `artifactId` or same-turn `declarationId`, validates active task/session
      compatibility, and updates task metadata.
- [ ] Task 1.4: Expose read-only `canvasFocus` from Code task/detail and
      dashboard projections, dropping malformed metadata.
- [ ] Task 1.5: Register the tools in active Code runtime onboarding without
      changing `declare_artifact`.

**Deliverables**: Tool helpers, processor registration, task metadata state,
projection fields, and tests for accepted/rejected focus changes.

### Phase 2: Split Pane and Iframe Viewer

- [ ] Task 2.1: Add a Cats Code product-local split canvas layout that keeps the
      active chat/task surface mounted while the Artifact Canvas opens on the
      right.
- [ ] Task 2.2: Add `CodeArtifactCanvasPane` with pane-local top bar, close,
      refresh, open-external, and unsupported-state UI.
- [ ] Task 2.3: Add reusable `IframeViewer` with the SPEC-101 sandbox and
      scheme policy.
- [ ] Task 2.4: Wire manual close through the same clear delegate used by
      `clear_canvas`.
- [ ] Task 2.5: Update the existing artifact detail / builder preview iframe
      path to share the same preview target and iframe policy where practical.

**Deliverables**: Visible split pane, safe iframe rendering for preview URL
artifacts, close/refresh/open controls, and renderer tests for pane state.

### Phase 3: Viewer Breadth

- [ ] Task 3.1: Add image viewer for safe image artifacts.
- [ ] Task 3.2: Add PDF viewer for safe PDF artifacts.
- [ ] Task 3.3: Add code/text viewer for `inline_summary` and server-served
      text artifacts.
- [ ] Task 3.4: Add persisted pane width and resizable divider.
- [ ] Task 3.5: Add keyboard accessibility checks for pane controls and divider.

**Deliverables**: Image, PDF, and code/text rendering plus pane resizing.

### Phase 4: Live Preview Substrate Planning

- [ ] Task 4.1: Create separate research/spec work for command whitelist,
      process supervision, port allocation, lifecycle, logs, and preview URL
      declaration.
- [ ] Task 4.2: Define how a runtime-owned preview origin qualifies for
      iframe `allow-same-origin`.
- [ ] Task 4.3: Only after approval, wire a live-preview producer that creates
      a `preview_url` artifact and then calls `show_in_canvas`.

**Deliverables**: Approved live-preview security plan; no process spawning in
this plan before Phase 4 approval.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/code/shared/canvasFocus.ts` | Create | Code canvas focus types, normalizers, and presentation resolution helpers |
| `src/products/code/state/runtimeCanvasFocusExecution.ts` | Create | Assistant-effect processor for `show_in_canvas` and `clear_canvas` |
| `src/products/code/state/runtimeArtifactTooling.ts` | Modify | Add onboarding/catalog entries for the canvas tools |
| `src/products/code/api/projection.ts` | Modify | Expose `canvasFocus` from task metadata |
| `src/products/code/renderer/components/CodeArtifactCanvasPane.tsx` | Create | Right-pane shell and top bar |
| `src/products/code/renderer/components/viewers/IframeViewer.tsx` | Create | Safe iframe viewer |
| `src/products/code/renderer/AppRoutes.tsx` or product shell wrapper | Modify | Mount split layout around active Code routes |
| `docs/tool-calls.md` | Modify | Keep tool-call registry aligned |
| `tests/code-canvas-focus*.test.tsx` | Create | Tool, projection, and renderer tests |

## Technical Decisions

- `codeCanvasFocus` is task-scoped in Phase 1 because active Cats Code is
  task-first and `CoreConversationRecord` has no metadata field.
- `show_in_canvas` accepts `declarationId` as well as `artifactId` so the
  assistant can present an artifact declared in the same turn before it knows
  the materialized artifact id.
- The first viewer is iframe-only because preview URL artifacts are the path
  that unlocks app-preview UX. Image/PDF/code viewers can follow without
  changing tool names.
- Live `npm start`-style previews are deliberately separate from the canvas
  pane. The canvas consumes safe preview artifacts; it does not spawn them.

## Testing Strategy

- **Unit tests**:
  - input normalization rejects missing/both identities and unknown
    presentation;
  - malformed `codeCanvasFocus` metadata is dropped by projection;
  - `presentation = auto` resolves preview URL artifacts to iframe and other
    kinds to unsupported in Phase 1.
- **Integration tests**:
  - same-turn `declare_artifact` result can be referenced by
    `show_in_canvas(declarationId)`;
  - foreign task/session artifacts are rejected;
  - `clear_canvas` removes task metadata.
- **Renderer tests**:
  - pane opens when `canvasFocus` exists and closes through the delegate;
  - iframe includes required sandbox/referrer/allow attributes;
  - unsupported artifacts show metadata and external-open fallback instead of a
    blank frame.
- **Manual checks**:
  - active Code chat remains mounted when the pane opens;
  - pane top bar aligns with existing route top bars;
  - narrow viewport collapses or stacks without overlapping composer text.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Assistant presents unsafe URL | High | Server and renderer both enforce URL/presentation policy |
| Task metadata becomes a dumping ground | Medium | Keep a single `codeCanvasFocus` key with schema version and normalizer |
| Split pane breaks chat/composer layout | Medium | Product-local layout first; targeted renderer tests and manual viewport check |
| `declarationId` ambiguity across turns | Medium | Only same-turn accepted declaration results may resolve through `declarationId` |
| Live preview scope creeps into Phase 1 | High | Keep process spawning in separate Phase 4 security plan |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-30 | Plan created from split-canvas artifact panel review. |

---

*Created: 2026-04-30*
*Author: Codex*
