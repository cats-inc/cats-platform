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
      `CoreTaskRecord.metadata.codeCanvasFocus`, including the
      `iframeSandboxProfile` field and a schema-version-aware reader that
      drops malformed metadata.
- [ ] Task 1.2: Add `show_in_canvas` and `clear_canvas` tool input/result
      helpers with context-free validation, the SPEC-101 error code union,
      and the active-task precondition.
- [ ] Task 1.3: Add a Code assistant-effect processor that resolves
      `artifactId` or same-turn `declarationId`, validates active task/session
      compatibility, picks the iframe sandbox profile via the runtime
      preview origin allowlist, and updates task metadata. The processor
      owns the per-turn declaration index keyed by
      `(turnId, producerKey, declarationId)` (with `producerKey` matching
      SPEC-092's idempotency tuple). The index is same-turn-only — there is
      no cross-turn lookup; misses simply reject as
      `artifact_canvas_declaration_unknown`.
- [ ] Task 1.6: Add `codeCanvas.runtimePreviewOriginAllowlist` to Code
      product config with default `['127.0.0.1', '::1', 'localhost']` and
      operator-extensible local hostnames. Wire the allowlist into the
      sandbox-profile decision and surface the resolved profile to clients
      via the projection.
- [ ] Task 1.4: Expose read-only `canvasFocus` (including
      `iframeSandboxProfile`) from Code task/detail and dashboard
      projections, dropping malformed metadata.
- [ ] Task 1.5: Register the tools in active Code runtime onboarding without
      changing `declare_artifact`.

**Deliverables**: Tool helpers, processor registration, task metadata state,
projection fields, and tests for accepted/rejected focus changes.

### Phase 2: Split Pane and Iframe Viewer

- [ ] Task 2.1: Add a Cats Code product-local split canvas layout that keeps the
      active chat/task surface mounted while the Artifact Canvas opens on the
      right.
- [ ] Task 2.2: Add `CodeArtifactCanvasPane` with pane-local top bar:
      close (server-write delegate), collapse / expand (renderer-only),
      refresh, open-external, and unsupported-state UI.
- [ ] Task 2.3: Add reusable `IframeViewer` that consumes the projected
      `iframeSandboxProfile` literally, applies the SPEC-101 scheme allowlist,
      re-runs the same-origin test on the renderer, and demotes to `static`
      or `unsupported` on any defense-in-depth failure.
- [ ] Task 2.4: Wire **only** the close (X) control through the
      `clear_canvas` delegate; the collapse / expand affordance shall stay
      renderer-only and shall not write task metadata.
- [ ] Task 2.5: Update the existing artifact detail / builder preview iframe
      path (`ArtifactDetailView.tsx`, `BuildPreviewPanel.tsx`) to share the
      same preview target, sandbox-profile decision, and renderer-side
      defense-in-depth checks. Verify that vite / Next.js / Lovable preview
      URLs still render after the migration (they qualify for the
      `scripted-cross-origin` profile).

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
| `src/products/code/shared/canvasFocus.ts` | Create | Code canvas focus types, normalizers, presentation resolution, sandbox-profile selection, and SPEC-101 error code union |
| `src/products/code/state/runtimeCanvasFocusExecution.ts` | Create | Assistant-effect processor for `show_in_canvas` and `clear_canvas`; owns the per-turn `(turnId, declarationId)` declaration index |
| `src/products/code/state/runtimeArtifactTooling.ts` | Modify | Add onboarding/catalog entries for the canvas tools |
| `src/products/code/api/projection.ts` | Modify | Expose `canvasFocus` (with `iframeSandboxProfile`) from task metadata |
| `src/products/code/renderer/components/CodeArtifactCanvasPane.tsx` | Create | Right-pane shell, top bar with separate close vs collapse controls, and unsupported-state fallback |
| `src/products/code/renderer/components/viewers/IframeViewer.tsx` | Create | Safe iframe viewer; consumes `iframeSandboxProfile`, re-validates scheme, re-runs the renderer-side same-origin test |
| `src/products/code/renderer/components/ArtifactDetailView.tsx` | Modify | Replace local `sandbox="allow-scripts allow-same-origin"` iframe with `IframeViewer` |
| `src/products/code/renderer/components/BuildPreviewPanel.tsx` | Modify | Replace local `sandbox="allow-scripts allow-same-origin"` iframe with `IframeViewer` |
| `src/products/code/renderer/AppRoutes.tsx` or product shell wrapper | Modify | Mount split layout around active Code routes |
| `docs/tool-calls.md` | Modify | Keep tool-call registry aligned (short summary, link to SPEC-101) |
| `tests/code-canvas-focus*.test.tsx` | Create | Tool, projection, and renderer tests |

## Technical Decisions

- `codeCanvasFocus` is task-scoped in Phase 1 because active Cats Code is
  task-first and `CoreConversationRecord` has no metadata field. The storage
  decision is captured in
  [ADR-097](../decisions/097-store-code-canvas-focus-on-task-metadata.md).
- `show_in_canvas` accepts `declarationId` as well as `artifactId` so the
  assistant can present an artifact declared in the same turn before it knows
  the materialized artifact id. The same-turn index is keyed by
  `(turnId, declarationId)` and lives in the assistant-effect processor;
  cross-turn collisions are rejected.
- Manual close has two distinct controls: `Close` (server write through the
  `clear_canvas` delegate, persists across reload) and `Collapse / expand`
  (renderer-only ephemeral toggle). The two-control split prevents
  collapse-state churn from writing task metadata while still letting users
  permanently dismiss the pane.
- Phase 1 routes image and PDF presentations through the iframe viewer with
  the `static` sandbox profile (no `allow-scripts`). Phase 2 adds dedicated
  `image`, `pdf`, and `code` viewers without changing tool inputs or
  accepted results.
- The runtime preview origin allowlist (Phase 1: loopback +
  operator-configured local hostnames) is the single eligibility gate for
  `scripted-cross-origin`. `normalizePreviewSurfaceUrl` is treated as a
  syntactic gate only; the security boundary is the allowlist. Allowlist
  failure silently demotes; scheme failure hard-rejects. The renderer
  re-runs the same check and may only demote.
- Phase 3 (live preview substrate, separate SPEC) replaces / narrows the
  Phase 1 allowlist with a session-bound preview registry — Phase 1 leaves
  hooks for that without binding to a registry shape now.
- Live `npm start`-style previews are deliberately separate from the canvas
  pane. The canvas consumes safe preview artifacts; it does not spawn them.

## Testing Strategy

- **Unit tests**:
  - input normalization rejects missing/both identities, unknown
    presentation values, and `presentation: 'unsupported'` as input;
  - malformed `codeCanvasFocus` metadata is dropped by projection;
  - `presentation = 'auto'` resolves preview URL artifacts whose origin
    passes the runtime preview origin allowlist to `iframe` +
    `scripted-cross-origin`, the same artifact with an off-allowlist origin
    to `iframe` + `static` (silent demote, no error), image / PDF URL
    artifacts to `iframe` + `static`, and `inline_summary` / no-safe-target
    shapes to `unsupported`;
  - explicit `presentation = 'iframe'` against an artifact with no safe URL
    rejects with `artifact_canvas_presentation_unsupported`;
  - explicit `presentation = 'iframe'` against a URL whose origin fails the
    allowlist accepts and silently demotes to `static` (asserts no error
    code raised);
  - origin allowlist: loopback origins (`127.0.0.1`, `::1`, `localhost`)
    qualify; an external `https://example.com` does not;
  - origin allowlist: a URL whose origin equals the Cats shell origin
    silently demotes to `static`, even when it would otherwise be on the
    allowlist;
  - scheme allowlist: `javascript:` / `file:` / `data:` / `blob:` URLs
    reject with `artifact_canvas_iframe_scheme_rejected` (hard reject; no
    static fallback);
  - credential rejection: `https://user:pass@host/` URLs silently demote
    `scripted-cross-origin` to `static`;
  - per-turn declaration index: `show_in_canvas({declarationId})` issued in a
    turn with no accepted declaration of that id under
    `(turnId, producerKey, declarationId)` rejects with
    `artifact_canvas_declaration_unknown`;
  - multi-producer collision in one turn: agent and tool both emit
    `declarationId: 'X'`; `show_in_canvas({declarationId: 'X'})` resolves
    against the producer-matching entry (or rejects with
    `artifact_canvas_declaration_unknown` when no matching producer key
    exists) and never accidentally binds to the other producer's
    declaration;
  - same-id-prior-turn: `show_in_canvas({declarationId})` issued in turn
    N+1 referencing a declaration accepted in turn N rejects with
    `artifact_canvas_declaration_unknown` (the per-turn index does not see
    turn N — there is no separate cross-turn lookup);
  - active-task precondition: both tools reject with
    `artifact_canvas_no_active_task` when invoked without an active task.
- **Integration tests**:
  - same-turn `declare_artifact` result can be referenced by
    `show_in_canvas(declarationId)`;
  - foreign task/session artifacts are rejected with
    `artifact_canvas_artifact_not_anchored`;
  - `clear_canvas` removes task metadata and is idempotent on already-clear
    focus;
  - the persisted tool trace surfaces accepted / rejected canvas tool
    results matching the `declare_artifact` pattern.
- **Renderer tests**:
  - pane opens when `canvasFocus` exists and closes through the delegate
    (close button) but does NOT write through the delegate when collapse /
    expand is toggled;
  - iframe includes the projected `iframeSandboxProfile`'s sandbox /
    referrer / allow attributes literally — `static` profile must NOT
    include `allow-scripts` or `allow-same-origin`;
  - **defense in depth**: when the projection emits a
    `scripted-cross-origin` profile but the URL scheme fails the renderer's
    allowlist (e.g. a `javascript:` URL slipped past the server), the
    renderer renders the unsupported pane and does not mount the iframe;
  - **defense in depth**: when the projection emits a
    `scripted-cross-origin` profile but the URL origin fails the renderer's
    own runtime-preview-origin / Cats-shell-origin re-check, the renderer
    silently demotes to `static`. The renderer never promotes `static` to
    `scripted-cross-origin`;
  - unsupported artifacts show metadata and external-open fallback instead
    of a blank frame.
- **Manual checks**:
  - active Code chat remains mounted when the pane opens;
  - pane top bar aligns with existing route top bars;
  - narrow viewport collapses or stacks without overlapping composer text;
  - existing builder/artifact preview iframes still render after Task 2.5
    migration (vite, Next.js dev, Lovable preview, Storybook).

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Assistant presents unsafe URL | High | Server picks sandbox profile and re-checks scheme; renderer re-validates and may only demote |
| Migrating existing builder/artifact iframes silently regresses dev-server previews (vite / Next.js / Lovable) | High | Loopback default in the runtime preview origin allowlist preserves `scripted-cross-origin` for `127.0.0.1` / `localhost` dev servers; manual check on Task 2.5 verifies real preview URLs still load |
| External `https://...` artifacts marked `kind = 'preview'` qualify for `allow-scripts allow-same-origin` (issue raised in first-round security review) | High | Allowlist replaces "is not Cats shell origin" with explicit positive enumeration; off-allowlist URLs silently demote to `static` even when `kind = 'preview'` |
| Task metadata becomes a dumping ground | Medium | Single `codeCanvasFocus` key with schema version and normalizer |
| Split pane breaks chat/composer layout | Medium | Product-local layout first; targeted renderer tests and manual viewport check |
| `declarationId` ambiguity across turns | Medium | Per-turn declaration index keyed by `(turnId, declarationId)`; cross-turn collisions explicitly rejected with `artifact_canvas_declaration_cross_turn` |
| User confusion between collapse and close (collapse "loses" their pane on reload) | Low | Two visually distinct controls; collapse uses an obvious chevron-style affordance, close uses an X |
| Live preview scope creeps into Phase 1 | High | Keep process spawning in separate Phase 4 security plan |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-30 | Plan created from split-canvas artifact panel review. |
| 2026-04-30 | Reworked sandbox profiles, two-control close model, per-turn declaration index, active-task precondition, and renderer defense-in-depth tests after first-round review; added ADR-097 dependency. |
| 2026-04-30 | Second-round security follow-up: replaced "is not Cats shell origin" with explicit runtime preview origin allowlist; rekeyed declaration index with `producerKey` for multi-producer same-turn collisions; dropped cross-turn error code (cross-turn lookup is intentionally absent); pinned reject-vs-demote semantics for explicit-presentation vs auto and for scheme-vs-origin failures. |

---

*Created: 2026-04-30*
*Author: Codex*
