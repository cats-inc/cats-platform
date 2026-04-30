# Cats Code Split Canvas Artifact Panel

Date: 2026-04-30
Topic: Assistant-driven split-canvas artifact panel for Cats Code

## Question

Can Cats Code, on the canvas area outside the sidebar, dynamically split out
a right-hand pane with its own top bar, where the assistant — through a tool
call or equivalent mechanism — requests the renderer to display artifact
content (image, PDF, code snippet, or iframe)? The longer-term goal is that a
strong-model agent capable of running `npm start`-style processes can use the
same pane to host live web-app previews, in the spirit of Manus / Lovable.

This is a feasibility study against the current codebase, not a build
commitment.

## Scope

- In scope: Cats Code product surface, the canvas region rendered next to the
  Code sidebar, the existing `declare_artifact` pipeline, and the runtime
  enrichment / assistant-effect-processor seam.
- Out of scope (deliberately): live `npm start`-style preview servers,
  process supervision, port allocation, and command-execution sandboxing.
  Those belong to a separate effort; this doc only sketches their interface
  with the canvas pane.
- Adjacent prior work, referenced not duplicated:
  - `2026-03-26-cats-chat-spatial-layout-guidelines.md` — chat-side split
    artifact view conceptual model.
  - `2026-04-20-draft-canvas-and-composer-layout-guidance.md` — composer-side
    canvas vocabulary.
  - SPEC-092 / PLAN-081 — `declare_artifact` contract and rollout (already
    landed and stabilized as of `a637c2060`).
  - ADR-088 — structured artifact declarations for code materialization.
  - ADR-019 — runtime previews are surfaces, not provider iframes.

## Findings

### 1. Shell layout is single-pane today

- `src/products/code/renderer/App.tsx` mounts the Code product through
  `createWorkspaceProductApp()` from
  `src/products/shared/renderer/WorkspaceProductApp.tsx`.
- Layout is sidebar plus a single main-content slot driven by React Router
  inside `src/products/code/renderer/AppRoutes.tsx`. Routes
  (`artifacts/:artifactId`, `relay`, `build`, `codespaces/:codespaceId`,
  etc.) swap the entire main canvas.
- There is no split / pane / docking primitive in `src/design/**` or
  `src/products/shared/renderer/**`. Adding a second pane is greenfield UI
  work, not retrofit of an existing primitive.

### 2. Artifact pipeline is in place

- Tool: `declare_artifact` in `src/products/code/shared/artifactDeclaration.ts`.
- Server route: `src/products/code/api/artifactDeclarationRoutes.ts`.
- Materialization: `src/products/code/state/artifactMaterialization.ts` —
  resolves producer identity (including `runtimeSessionId`), enforces anchors,
  and supports idempotent reuse keyed on declaration content.
- Supported `location.kind` values: `none`, `local_path`, `url`,
  `inline_summary`, `external_ref`.
- Detail projection: `CodeArtifactDetailProjection` in
  `src/products/code/api/projection.ts`.
- Renderer entry: `src/products/code/renderer/components/ArtifactDetailView.tsx`
  resolves preview targets via `resolvePreviewSurfaceTargetFromArtifacts()`
  but only renders link / download / action-button shapes. There is no image,
  PDF, code-syntax, or iframe viewer today.

### 3. Tool registration model is reusable

- `createCodeArtifactRuntimeAssistantEffectProcessor()` in
  `src/products/code/state/runtimeArtifactExecution.ts` is the canonical shape:
  - `id`: stable hook id.
  - `priority`: `RuntimeEnricherPriority.POST_PROCESS` (100).
  - `shouldApplyAssistantEffects(segment)`: matches `tool_use` segments by
    `toolName`.
  - `applyAssistantEffects(...)`: validates, mutates core, returns a tool
    result enriched back into the assistant transcript.
- A new tool such as `show_in_canvas` or `clear_canvas` can be registered by
  exporting a sibling processor from `src/products/code/state/`. No frozen
  contract changes required.

### 4. No iframe / preview-rendering infrastructure exists

- No iframe / WebView / BrowserView usage anywhere in
  `src/products/code/**` or `src/platform/runtime/**`.
- `src/core/previewSurfaces.js` resolves preview targets from artifact records
  but does not render. There is currently no client-side renderer that
  embeds a preview URL inline.
- All artifact rendering is link- or download-shaped. Inline preview is new.

### 5. No local dev-server runtime exists

- The only `spawn()` call is `handleShellOpenFolder` in
  `src/app/server/requestRouter.ts`, which detaches an OS-level
  open-folder command and immediately `unref`s it.
- The runtime client (`src/platform/runtime/client.ts`) is a proxy to an
  external `cats-runtime` service and does not host long-lived child
  processes.
- There is no port allocator, process supervisor, lifecycle manager, log
  multiplexer, or command whitelist. A live-preview tool would need all of
  these and is therefore out of scope here.

### 6. No multi-pane state today

- `src/products/code/renderer/appViewState.ts` re-exports a single-route
  view-state model from `src/products/shared/renderer/workspaceAppViewState.js`.
- There is no panel registry, view-state machine, or split context. Routes
  are mutually exclusive; the canvas shows exactly one route at a time.

### 7. Top-bar alignment is a known platform-shell hazard

- Per `cats-platform/CLAUDE.md` ("Canvas Top Bar Edge Alignment"), a new
  `<header className="channelTopBar …">` mounted inside `main.canvas`
  visually insets unless three platform-shell rules are countered:
  `padding: 0 28px`, `scrollbar-gutter: stable`, and grid-column
  `justify-items: center`. A canvas-pane top bar must follow the
  canonical override pattern at
  `src/products/work/renderer/components/projects/projects.css`. This is
  resolvable with existing CSS recipes; flagging it so the implementation
  step does not rediscover the pitfall.

## Recommended Design

### Core principle

Canvas display is always **artifact-bound**. Every panel show is an artifact
that has already passed through `declare_artifact` (or is declared in the
same turn). The new tool only changes which artifact is currently focused
in the canvas. This:

- Inherits SPEC-092's idempotency, anchor checks, and producer-identity
  semantics.
- Keeps audit trail uniform: every "thing the assistant put in the user's
  view" is a Core artifact record.
- Avoids inventing a parallel free-form render channel that would compete
  with the artifact pipeline.

The trade-off is one extra round-trip when the assistant wants to render
something previously not declared. That is acceptable, and the two calls can
be issued in the same turn.

### Tool surface

- New tool `show_in_canvas` (Code product):
  - Input: `{ artifactId: string, presentation?: 'iframe' | 'image' | 'pdf' |
    'code' | 'auto' }`.
  - Default `presentation: 'auto'` lets the projection choose by artifact
    kind and `location.kind`.
  - `normalizeInput` rejects unknown presentation, missing id, foreign-product
    artifact ids, and unmaterialized / unanchored artifacts.
- New tool `clear_canvas`:
  - No input. Result clears the canvas focus.
- Both tools are registered as sibling assistant-effect processors next to
  `runtimeArtifactExecution.ts`, with a new file
  `src/products/code/state/runtimeCanvasFocusExecution.ts`.

### Core state shape

- New optional field on the Code dashboard projection root, e.g.
  `canvasFocus: { artifactId: string; presentation: 'iframe' | 'image' |
  'pdf' | 'code'; openedAt: string; openedBy: { kind, actorId,
  runtimeSessionId } } | null`.
- Persisted in Core under a Materialization-tier record per ADR-081, so it
  survives reloads and is replayable.
- Mutated only through the two new tools (server-side); the renderer treats
  it as read-only state.

### Client-side wiring

- New hook `useCanvasFocus()` in
  `src/products/code/renderer/state/useCanvasFocus.ts` reads
  `canvasFocus` from the dashboard projection (already pushed via the
  existing per-entity subscription channel from ADR-075).
- `WorkspaceProductApp` gains a conditional split-pane layout:
  flex-row, default 60 / 40, with a min-width on each side; the right pane
  mounts only when `canvasFocus` is non-null.
- The right pane has its own top bar (title from artifact, close button
  calling `clear_canvas`, optional "open externally" link). It must follow
  the canvas-top-bar alignment recipe noted above.

### Viewer components

- `IframeViewer` for `presentation: 'iframe'`:
  - `<iframe>` with
    `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`,
    `referrerPolicy="no-referrer"`,
    `allow=""` (no powerful-feature delegation by default).
  - URL scheme whitelist: `http:`, `https:`, `blob:`. Reject `file:`,
    `javascript:`, `data:` (with explicit error code surfaced into the
    artifact projection so the assistant can see the rejection).
- `ImageViewer` for `presentation: 'image'`: `<img>` with the artifact url,
  loading=lazy, decoding=async, max-height bounded to the pane.
- `PdfViewer` for `presentation: 'pdf'`: `<iframe>` against the same url
  (browsers ship a built-in PDF viewer on Windows desktop / Chromium-based
  Electron). Same sandbox / scheme rules as iframe viewer.
- `CodeSnippetViewer` for `presentation: 'code'`: renders artifact
  `inline_summary` (or fetches `local_path` content via an existing API
  surface) as syntax-highlighted text. No external network reads.
- `presentation: 'auto'` resolution rule (server-side projection):
  - `location.kind === 'url'` and url ends in image extension → `image`.
  - `location.kind === 'url'` and url ends in `.pdf` → `pdf`.
  - `location.kind === 'url'` otherwise → `iframe`.
  - `location.kind === 'inline_summary'` → `code`.
  - Other kinds → fall back to existing `ArtifactDetailView` route (no
    canvas mount).

### Phasing

- **Phase 1 — minimum useful slice (this work item, scoped):**
  - `show_in_canvas` + `clear_canvas` tools, processor registration,
    Core `canvasFocus` field, projection wiring.
  - Split-pane layout with top bar and close.
  - `IframeViewer` only (the primary unlock for live-preview-style use
    cases when a url artifact already exists).
  - Tests: tool normalization, processor, projection auto-resolution,
    layout split-on / split-off, sandbox attribute presence.
- **Phase 2 — viewer breadth:**
  - `ImageViewer`, `PdfViewer`, `CodeSnippetViewer`.
  - Resizable divider, persisted width.
  - Pop-out / open-externally / refresh affordances on the panel top bar.
- **Phase 3 — live preview substrate (separate SPEC, not this work):**
  - Process-spawning runtime tool that boots `npm start`-class servers,
    publishes a `url` artifact pointing at the bound port, and pipes that
    artifact through `show_in_canvas`. Requires command whitelist,
    working-directory sandbox, port allocation, lifecycle (kill on
    artifact deletion / session end), and explicit security review.
  - Phase 1 already gives Phase 3 a clean target: the live-preview tool
    only has to produce a `url` artifact and call `show_in_canvas`.

## Security notes

- iframe `sandbox` must be present on day one. Default to
  `allow-scripts allow-same-origin allow-forms allow-popups`. Tighter
  variants (drop `allow-same-origin`) should be configurable per artifact
  later, but never the other way around (do not start permissive and tighten
  retroactively).
- URL scheme whitelist enforced both at projection time (server) and at
  render time (client). Defense in depth.
- Same-origin caveat: a Cats-served URL in an iframe with `allow-same-origin`
  could read the outer document's storage if also `allow-scripts`. Mitigate
  by serving canvas-rendered content from a distinct origin (e.g.
  `127.0.0.1:<runtime-port>`) or by dropping `allow-same-origin` for
  sensitive Cats-served origins. Decide before the first url that points at
  a Cats-served path.
- Anchor enforcement: `show_in_canvas` must reject artifacts that have not
  passed `validateAnchors`. Reuse the materialization-side anchor check;
  do not duplicate logic at the route layer.
- Producer-identity enforcement: only the producer that anchored an artifact
  (or a user) may pin it to canvas. Avoid letting a foreign agent session
  reframe another session's artifacts.

## Open questions

- Should `canvasFocus` be conversation-scoped, task-scoped, or run-scoped?
  Conversation-scoped is the simplest user-mental-model match (one canvas
  per chat surface) and aligns with how the sidebar currently scopes other
  state. Recommend conversation-scoped unless a specific Code surface needs
  finer scoping.
- Should the user be allowed to pin / unpin manually from the renderer,
  or is the canvas exclusively assistant-driven? Recommend allowing manual
  unpin (close button on top bar) but keeping pin server-side / tool-driven
  to preserve the audit trail.
- Should multiple canvases stack (e.g., tabs inside the right pane) or
  always replace? Recommend replace-only for Phase 1; stacking can be added
  later as a separate `canvas_stack` model without breaking the single-focus
  shape.

## Action Items

- Decide on conversation-scoped vs. task-scoped `canvasFocus` before kicking
  off Phase 1.
- Draft a SPEC entry capturing the `show_in_canvas` / `clear_canvas`
  contract and presentation-resolution table (sibling to SPEC-092).
- Open a PLAN entry for Phase 1 implementation; defer Phase 2 / Phase 3 to
  later PLANs.
- Out-of-band: open a separate research note on the live-preview Phase 3
  substrate (process supervision, port allocation, command whitelist) so
  the security model is debated before any spawn code lands.
