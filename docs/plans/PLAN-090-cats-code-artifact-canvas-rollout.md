# PLAN-090: Cats Code Artifact Canvas Rollout

> Implement the URL-driven split-canvas artifact presentation surface
> defined by [SPEC-101](../specs/SPEC-101-cats-code-artifact-canvas.md)
> under [ADR-098](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md).
> Phase 1 lands the platform-shared canvas pane primitive,
> `show_in_canvas` / `clear_canvas` tools that record audit + push
> navigate-intent, the iframe viewer with full safety policy, and
> first-product (Code) integration. Phase 2 wires Cats Work to the
> same primitive.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |

## Related Spec

[SPEC-101: Cats Code Artifact Canvas](../specs/SPEC-101-cats-code-artifact-canvas.md)

## Overview

The rollout lands the Artifact Canvas in small slices: contract /
projection / tool effect first, then the platform-shared canvas pane
primitive, then the per-product nested-route registration (Code first;
Work and Chat in Phase 3). The first implementation must not start
local processes. Live app preview work depends on a separate
process-supervision and security review (Phase 4).

## Implementation Phases

### Phase 1: Contract, Projection, and Tool Effect

- [ ] Task 1.1: Add `CodeCanvasProjection` and
      `CodeCanvasNavigateIntent` types in
      `src/products/shared/canvasFocus/contracts.ts` (platform-shared
      because Work and Chat will consume them too). Drop the prior
      `CoreTaskRecord.metadata.codeCanvasFocus` shape — the URL is
      the visible state and the server stores no focus record.
- [ ] Task 1.2: Add `show_in_canvas` and `clear_canvas` tool input/result
      helpers with context-free validation, the SPEC-101 error code union,
      and the active-surface precondition. The accepted result includes
      `targetUrl`; the legacy `cleared: true` boolean is removed.
- [ ] Task 1.3: Add a Code assistant-effect processor that resolves
      `artifactId` or same-turn `declarationId`, validates active
      surface compatibility, hard-rejects credential URLs, applies
      the runtime preview origin allowlist + scripted preview producer
      allowlist to pick the iframe sandbox profile, stamps a
      `policyVersion`, writes a `code_canvas_show_intent` Activity
      record, and pushes a `CodeCanvasNavigateIntent` event over the
      ADR-075 per-entity subscription channel keyed by the caller's
      surface. The processor does NOT mutate any product `metadata`.
      The processor owns the
      per-turn declaration index keyed by
      `(turnId, producerKey, scopeKey, declarationId)` where
      `producerKey = "<producerKind>:<producerIdentity>"` (the two
      SPEC-092 idempotency fields stored under
      `CoreArtifactRecord.metadata.codeArtifactDeclaration.idempotency`;
      `producerIdentity` is the encoded value such as `actor:<id>` or
      `tool:<name>`, not a bare actor id / tool name)
      and `scopeKey = "<scopeKind>:<scopeId>"` where `scopeKind` is one
      of SPEC-092's frozen scope kinds `run` / `runtime` /
      `conversation` / `workspace` (the canvas does NOT add a `task`
      scope). Both keys are taken from the caller's own resolved
      identity / scope — same-caller-only resolution. Same-turn
      cross-producer references reject with
      `artifact_canvas_declaration_producer_mismatch`; same-turn
      cross-scope references reject with
      `artifact_canvas_declaration_unknown`. Multiple accepted
      declarations sharing one key must point at the same
      `artifactId` (idempotent no-op); differing `artifactId` rejects
      with `artifact_canvas_declaration_collision`. The index is
      same-turn-only — no cross-turn lookup; prior-turn matches reject as
      `artifact_canvas_declaration_unknown`.
- [ ] Task 1.6: Add `codeCanvas.runtimePreviewOriginAllowlist` to Code
      product config as the **flat array**
      `{ hostname: string; schemes?: ('http' | 'https')[]; ports?: number[] | '*' }[]`
      (no `{ entries: [...] }` wrapper). SPEC-101 default value:
      `[{hostname:'127.0.0.1',schemes:['http'],ports:'*'}, {hostname:'::1',...}, {hostname:'localhost',...}]`.
      Implement the URL-matching algorithm with explicit hostname
      normalization (lower-case + manual bracket strip — Node's WHATWG
      URL parser does NOT strip IPv6 brackets from `URL.hostname`).
      Boot-time validation rejects empty hostnames, unknown schemes, and
      non-positive port numbers.
- [ ] Task 1.7: Add `codeCanvas.scriptedPreviewProducerAllowlist` to
      Code product config as the **flat array**
      `{ producerKind: 'tool' | 'system' | 'user'; producerIdentity: string }[]`,
      defaulting to `[]` (empty). The producer-eligibility check is:
      `producer.kind === 'agent'` short-circuits to `static`; otherwise
      look up the artifact's frozen `(producerKind, producerIdentity)`
      pair (the SPEC-092 idempotency fields) in this allowlist. The
      default empty list means **no producer earns
      `scripted-cross-origin` out of the box** — operators must
      explicitly enumerate trusted producers. Task 2.5's migration
      decides whether to add the specific producer identities behind
      existing builder/artifact preview iframes or accept the
      static-only regression; that decision is captured separately and
      not baked into the Phase 1 default.
- [ ] Task 1.8: Add `policyVersion` to the projection (`CodeCanvasProjection`),
      to the `show_in_canvas` accepted result, to the
      `CodeCanvasNavigateIntent`, and to the
      `code_canvas_show_intent` Activity record metadata. Implement the
      §Policy Version Canonicalization algorithm from SPEC-101: per-entry
      hostname normalization (lower-case + manual bracket strip),
      default expansion (`schemes ?? ['http']`, `ports ?? '*'`),
      port deduping + numeric ascending sort, origin-allowlist sort by
      canonical-JSON of normalized entry, producer-allowlist sort by
      `(producerKind, producerIdentity)`, `catsShellOrigin`
      normalization (drop default port), then canonical-JSON
      serialization (sorted keys, no whitespace) → SHA-256 → first 16
      hex chars lower-case. Treat the canonical-JSON helper as a
      shared utility (sorted-keys recursive serializer). Because the
      projection is computed on each URL hit, it always reflects the
      current policy — there is no stored stale focus to demote.
      Server config reload republishes the version, and any in-flight
      `CodeCanvasNavigateIntent` from before the reload that still
      reaches the renderer will be reconciled when the renderer
      fetches the projection.
- [ ] Task 1.9: Add canonicalization test vectors at
      `tests/code-canvas-policy-version.test.tsx`: empty config, default
      config, default config with reordered entries (must equal default
      hash), default config with a single entry's `ports` written as
      `[5173, 4321]` vs `[4321, 5173]` (must equal each other), and a
      config with one extra producer entry (must differ). These vectors
      must include literal expected canonical JSON strings and exact
      16-hex hashes, not only equality/difference assertions, so they
      pin the canonicalization across implementations.
- [ ] Task 1.4: Add the canvas projection HTTP route at
      `/api/canvas/:artifactId` (or the platform-shared equivalent)
      returning `CodeCanvasProjection`. The route is read-only and
      stateless; calling it does not write any record. 4xx errors
      (artifact not found / not Code-relevant / not anchored) are
      surfaced verbatim to the renderer so the `unsupported` /
      error pane can render a useful message.
- [ ] Task 1.5: Register `show_in_canvas` and `clear_canvas` in the
      active Code runtime tool catalog without changing
      `declare_artifact`. The catalog entry references SPEC-101's
      shape and the SPEC-101 § Error Code Registry.
- [ ] Task 1.10: Implement the navigate-intent push channel using the
      ADR-075 per-entity subscription primitive. Surface key is
      `(productKind, surfaceKind, surfaceId)` — e.g.
      `('code', 'task', 'task-abc')`. The renderer subscribes for the
      surface it currently has mounted; intents for unfocused
      surfaces are queued and replayed when that surface remounts.

**Deliverables**: Platform-shared contract types, iframe-policy module
with allowlists / canonicalization, Code assistant-effect processor
that records audit + pushes navigate-intent (no metadata writes),
read-only projection HTTP route, and tests for accepted/rejected tool
calls + projection responses.

### Phase 2: Platform-Shared Pane, Iframe Viewer, and Code Integration

- [ ] Task 2.1: Add the platform-shared shell layout helper at
      `src/products/shared/renderer/withSharedViewerRoutes.ts` that
      attaches the `/canvas/:artifactId` child route to any product
      surface route in one call. The helper renders the parent route
      with `<Outlet />` for the right pane.
- [ ] Task 2.2: Add `<CanvasPane>` at
      `src/products/shared/renderer/CanvasPane.tsx` with pane-local
      top bar: close (renderer-only `navigate()` to drop the
      child segment), collapse / expand (renderer-only), refresh,
      open-external, and unsupported-state UI. The pane fetches the
      projection from `/api/canvas/:artifactId` on mount and on
      `:artifactId` change.
- [ ] Task 2.3: Add `<IframeViewer>` at
      `src/products/shared/renderer/viewers/IframeViewer.tsx`. It
      consumes the projection's `iframeSandboxProfile` literally,
      applies the SPEC-101 scheme allowlist, re-runs the same-origin
      with-shell short-circuit on the renderer, and demotes to
      `static` or `unsupported` on any defense-in-depth failure.
- [ ] Task 2.4: Subscribe the shell-level renderer to the
      `CodeCanvasNavigateIntent` channel for the currently mounted
      surface. On intent receipt, call `navigate(targetUrl)`. Phase 1
      auto-navigates; the soft-suggest mode is a Phase 2 follow-up
      open question per SPEC-101.
- [ ] Task 2.5: Register Code's product surfaces with
      `withSharedViewerRoutes` so the canvas pane mounts under
      Code task / Code codespace routes. **No** server clear delegate
      wiring is needed — close is renderer-only `navigate()`.
- [ ] Task 2.6: Update the existing artifact detail / builder preview iframe
      path (`ArtifactDetailView.tsx`, `BuildPreviewPanel.tsx`) to share the
      same preview target, sandbox-profile decision, and renderer-side
      defense-in-depth checks. If the migration chooses to preserve scripted
      dev previews, enumerate the exact encoded producer identities behind
      vite / Next.js / Lovable preview URLs in
      `codeCanvas.scriptedPreviewProducerAllowlist` and verify they still
      render with `scripted-cross-origin`; otherwise document and accept the
      static-only regression for those previews.

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

### Phase 3 also: Cross-Product Mount (Work / Chat)

- [ ] Task 3.6: Wire Cats Work product surfaces (Work Item, Work
      Project) to `withSharedViewerRoutes`. Sidebar / detail-page
      links to anchored artifacts use renderer-only `navigate()` to
      enter the shared canvas child route. No server tool call from
      Work side.
- [ ] Task 3.7: Wire Cats Chat conversation surfaces likewise. A chat
      message that references an artifact can become a clickable
      navigate target.
- [ ] Task 3.8: Add platform-viewer-policy entry for any new
      Materialization-tier viewer (image / pdf / code) added in
      Phase 3 to the entity viewer-ownership table — each new viewer
      is a row in the table, not just a Code-product feature.

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
| `src/products/shared/canvasFocus/contracts.ts` | Create | Platform-shared `CodeCanvasProjection`, `CodeCanvasNavigateIntent`, tool input/result types, error code union |
| `src/products/shared/canvasFocus/iframePolicy.ts` | Create | Platform-shared origin allowlist matcher (host normalization + bracket strip + scheme + port), producer allowlist lookup, scheme allowlist, credential URL rejector, `policyVersion` canonicalization + digest helper |
| `src/products/code/state/runtimeCanvasFocusExecution.ts` | Create | Code assistant-effect processor for `show_in_canvas` / `clear_canvas`; resolves declarationId via per-turn index keyed by `(turnId, producerKey, scopeKey, declarationId)`, writes `code_canvas_show_intent` / `code_canvas_clear_intent` Activity, pushes `CodeCanvasNavigateIntent`. Does NOT write product `metadata`. |
| `src/products/code/state/runtimeArtifactTooling.ts` | Modify | Add onboarding/catalog entries for the canvas tools |
| `src/products/shared/api/canvasProjectionRoute.ts` | Create | Read-only HTTP route `/api/canvas/:artifactId` returning `CodeCanvasProjection`. Stateless; computes `iframeSandboxProfile` and `policyVersion` on each call |
| `src/products/shared/renderer/CanvasPane.tsx` | Create | Platform-shared right-pane shell + top bar (close = `navigate()` to drop child segment; collapse = local state); fetches projection from `/api/canvas/:artifactId` |
| `src/products/shared/renderer/viewers/IframeViewer.tsx` | Create | Platform-shared safe iframe viewer; consumes projected `iframeSandboxProfile`, re-validates scheme, re-runs same-origin-with-shell short-circuit |
| `src/products/shared/renderer/withSharedViewerRoutes.ts` | Create | Helper that adds the `/canvas/:artifactId` child route to a parent route; one-line registration per product surface |
| `src/products/shared/renderer/useCanvasNavigateIntent.ts` | Create | Renderer hook that subscribes to the ADR-075 channel for the active surface and calls `navigate()` on accepted intents |
| `src/products/code/renderer/AppRoutes.tsx` | Modify | Wrap Code task / codespace routes with `withSharedViewerRoutes` |
| `src/products/code/renderer/components/ArtifactDetailView.tsx` | Modify | Replace local `sandbox="allow-scripts allow-same-origin"` iframe with shared `<IframeViewer>` |
| `src/products/code/renderer/components/BuildPreviewPanel.tsx` | Modify | Replace local `sandbox="allow-scripts allow-same-origin"` iframe with shared `<IframeViewer>` |
| `docs/tool-calls.md` | Modify | Keep tool-call registry aligned (short summary, link to SPEC-101) |
| `tests/code-canvas-projection.test.tsx` | Create | Server-side projection tests (sandbox profile resolution, error codes, policyVersion correctness) |
| `tests/code-canvas-tool.test.tsx` | Create | `show_in_canvas` / `clear_canvas` tool effect tests (Activity write + navigate-intent push; no metadata writes) |
| `tests/code-canvas-policy-version.test.tsx` | Create | Canonicalization vectors with literal expected JSON + 16-hex hashes |
| `tests/canvas-pane.test.tsx` | Create | Renderer tests: child route mount/unmount on URL change; close button = `navigate()` only; collapse = local state; iframe attributes per profile; defense-in-depth scheme + same-origin-with-shell |

## Technical Decisions

- Visible canvas state lives in the URL (`/canvas/:artifactId` nested
  child route). Server stores no "current focus" record. Audit lives
  in `Activity` records of kind `code_canvas_show_intent` /
  `code_canvas_clear_intent`. Storage decision captured in
  [ADR-098](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md);
  [ADR-097](../decisions/097-store-code-canvas-focus-on-task-metadata.md)
  is superseded.
- The canvas pane and iframe viewer are platform-shared primitives in
  `src/products/shared/renderer/`; Code, Work, and Chat all mount the
  same component via `withSharedViewerRoutes`. The safety policy (two
  allowlists, scheme allowlist, credential reject, hostname
  normalization, `policyVersion` canonicalization) lives next to the
  viewer at the platform layer, not in any product. See
  [`platform-viewer-policy.md`](../platform-viewer-policy.md).
- `show_in_canvas` accepts `declarationId` as well as `artifactId` so the
  assistant can present an artifact declared in the same turn before it
  knows the materialized artifact id. The same-turn index is keyed by
  `(turnId, producerKey, scopeKey, declarationId)` — the SPEC-092
  idempotency components plus `turnId`. `producerKey =
  "<producerKind>:<producerIdentity>"` and `scopeKey =
  "<scopeKind>:<scopeId>"` are derived from the four SPEC-092
  idempotency fields stored under
  `CoreArtifactRecord.metadata.codeArtifactDeclaration.idempotency`;
  `producerIdentity` is the encoded SPEC-092 value (`actor:<id>`,
  `tool:<name>`, or `system:<detector>`), not a bare id/name;
  `scopeKind` is one of `run` / `runtime` / `conversation` /
  `workspace` (the canvas does NOT add a `task` scope). Both keys come from the
  canvas caller (same-caller-only); same-turn cross-producer rejects
  with `artifact_canvas_declaration_producer_mismatch`; same-turn
  cross-scope rejects with `artifact_canvas_declaration_unknown`.
  Multiple accepts at one key must resolve to the same `artifactId`
  (SPEC-092 idempotency); differing artifactId rejects with
  `artifact_canvas_declaration_collision`. The index has no cross-turn
  lookup, and prior-turn matches reject as
  `artifact_canvas_declaration_unknown`.
- Manual close is renderer-only `navigate()` that pops the
  `/canvas/:artifactId` segment from the URL. There is no server
  delegate involved. Collapse / expand is renderer-only local state
  (`useState` + `localStorage`) with no URL effect. The earlier
  ADR-097-era "Close calls clear_canvas delegate" model is superseded
  because there is no stored visible state to clear.
- Phase 1 routes image and PDF presentations through the iframe viewer with
  the `static` sandbox profile (no `allow-scripts`). Phase 2 adds dedicated
  `image`, `pdf`, and `code` viewers without changing tool inputs or
  accepted results.
- The runtime preview origin allowlist is a **flat structured array**
  (`{ hostname, schemes?, ports? }[]`; no `{ entries: [...] }` wrapper).
  Phase 1 default is loopback (`127.0.0.1` / `::1` / `localhost`) on
  `http:` with any port; operators may extend it through
  `codeCanvas.runtimePreviewOriginAllowlist`. URL matching is
  hostname-equality (lower-cased, with explicit manual bracket strip
  because Node's WHATWG `URL.hostname` does NOT strip IPv6 brackets) +
  scheme-membership + port-membership.
- The scripted preview producer allowlist
  (`codeCanvas.scriptedPreviewProducerAllowlist:
  { producerKind, producerIdentity }[]`) is a separate **flat array**,
  defaulting to empty. Out of the box, no producer earns
  `scripted-cross-origin` — operators must enumerate trusted producers
  using encoded SPEC-092 identities (e.g.
  `{ producerKind: 'tool', producerIdentity: 'tool:<bridge-tool-name>' }`
  or `{ producerKind: 'system', producerIdentity: 'system:<detector>' }`).
  `agent`-kind producers are short-circuited to `static` and cannot
  appear in the allowlist. Phase 3 narrows further via
  session-bound preview registry. `normalizePreviewSurfaceUrl` is
  treated as a syntactic gate only; the security boundary is the two
  allowlists.
- The renderer is NOT a mirror of the matchers. The renderer re-runs
  only the cheap config-free defense-in-depth checks (scheme allowlist,
  profile-name validity, same-origin-with-shell short-circuit using
  `window.location.origin`); the server is the authority for the origin
  and producer allowlists. The projection is fetched on every URL
  hit, so it always reflects the current `policyVersion`; there is no
  stored "stale focus" record to demote.
- Credential URLs (`user:pass@host`) hard-reject at the canvas with
  `artifact_canvas_url_credentials_not_allowed`; they shall not appear in
  iframe `src` or external-open hrefs even when the rest of the artifact
  passes. Mirrors SPEC-092's declaration-time rejection.
- Live `npm start`-style previews are deliberately separate from the canvas
  pane. The canvas consumes safe preview artifacts; it does not spawn them.

## Testing Strategy

- **Unit tests**:
  - input normalization rejects missing/both identities, unknown
    presentation values, and `presentation: 'unsupported'` as input;
  - the projection HTTP route returns 404 / 422 for missing /
    not-Code-relevant / not-anchored `:artifactId`, and a normal
    payload otherwise (server stores no focus record, so there is
    no "stale metadata" failure mode);
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
  - origin allowlist (matching algorithm): default loopback entries
    (`127.0.0.1`, `::1`, `localhost`) match same-host any-port URLs;
    external `https://example.com` does not;
  - origin allowlist (IPv6): `http://[::1]:5173/` matches the
    `{ hostname: '::1' }` entry (manual bracket strip applied to both
    sides); `http://[0:0:0:0:0:0:0:1]:5173/` ALSO matches because Node's
    WHATWG URL parser canonicalizes input IPv6 to `[::1]` before
    `URL.hostname` is read;
  - origin allowlist (port restriction): with an entry `{ hostname:
    'dev.local', schemes: ['http'], ports: [5173, 4321] }`, port 5173 and
    4321 match; port 8080 demotes to `static`;
  - origin allowlist (default port): with an entry `{ hostname:
    'dev.local', ports: [80] }`, `http://dev.local/` (no explicit port)
    matches because the effective port is 80;
  - origin allowlist (scheme restriction): with `schemes: ['http']`, an
    `https://127.0.0.1/` URL demotes to `static`;
  - origin allowlist: a URL whose origin equals the Cats shell origin
    silently demotes to `static`, even when it would otherwise match the
    allowlist;
  - producer allowlist (default empty): with the Phase 1 default
    `scriptedPreviewProducerAllowlist = []`, every `kind = 'preview'`
    artifact (regardless of producer kind / URL) demotes to `static`;
  - producer allowlist (entry match): with
    `[{ producerKind: 'tool', producerIdentity: 'tool:cats_runtime_preview_bridge' }]`,
    a `tool`-declared `kind = 'preview'` artifact whose
    stored SPEC-092 `producerIdentity === 'tool:cats_runtime_preview_bridge'`
    and whose URL passes the origin allowlist resolves to
    `scripted-cross-origin`;
  - producer allowlist (agent short-circuit): with the same allowlist
    above, an `agent`-declared artifact still demotes to `static` even
    if its encoded `producerIdentity` somehow appeared in the producer
    allowlist — the agent short-circuit runs first;
  - producer allowlist (kind mismatch): an entry of
    `{ producerKind: 'tool', producerIdentity: 'tool:X' }` does NOT
    match a `system` producer with identity `'system:X'`;
  - boot-time validation: server boot rejects allowlist entries with
    empty hostname, unknown schemes, or non-positive ports;
  - scheme allowlist: `javascript:` / `file:` / `data:` / `blob:` URLs
    reject with `artifact_canvas_iframe_scheme_rejected` (hard reject; no
    static fallback);
  - credential rejection (hard reject): `https://user:pass@host/` URLs
    reject with `artifact_canvas_url_credentials_not_allowed` and the
    URL must not appear in any subsequent surface (iframe `src`,
    open-external href, or pane metadata);
  - declaration index (scope component): an agent in turn T declares
    `'X'` under runtime session A; the same agent under runtime session
    B (same turnId T but different `scopeKey`) calls
    `show_in_canvas({declarationId: 'X'})` and rejects with
    `artifact_canvas_declaration_unknown`;
  - declaration index (duplicate idempotent): two `declare_artifact`
    calls with identical `(turnId, producerKey, scopeKey, declarationId)`
    accept and resolve to the same `artifactId`; subsequent
    `show_in_canvas({declarationId})` resolves cleanly with no error;
  - declaration index (duplicate collision): if the processor observes
    the same key paired with two different `artifactId`s,
    `show_in_canvas({declarationId})` rejects with
    `artifact_canvas_declaration_collision`; no Activity audit
    record is written and no `CodeCanvasNavigateIntent` is pushed;
  - per-turn declaration index: `show_in_canvas({declarationId})` issued
    by an agent in a turn with no accepted declaration of that id under
    `(turnId, agent's producerKey, agent's scopeKey, declarationId)`
    rejects with `artifact_canvas_declaration_unknown`;
  - multi-producer same-turn (same-caller-only resolution): agent and
    tool both emit `declarationId: 'X'` under the same scope; the agent
    calls `show_in_canvas({declarationId: 'X'})` and resolves to the
    agent's declaration entry (NOT the tool's). When the agent did not
    declare `'X'` itself but the tool did,
    `show_in_canvas({declarationId: 'X'})` from the agent rejects with
    `artifact_canvas_declaration_producer_mismatch`;
  - same-id-prior-turn: `show_in_canvas({declarationId})` issued in turn
    N+1 referencing a declaration accepted in turn N rejects with
    `artifact_canvas_declaration_unknown` (the per-turn index does not see
    turn N — there is no separate cross-turn lookup);
  - active-surface precondition: both tools reject with
    `artifact_canvas_no_active_surface` when invoked without an active
    product surface;
  - policy version: each `show_in_canvas` accepted result and each
    `code_canvas_show_intent` Activity record carries the
    `policyVersion` snapshot under which the decision was made.
    Reloading the server with new allowlists produces a new version,
    but does NOT touch any stored visible state (there is none) — the
    next URL hit fetches a projection under the new version
    automatically.
- **Integration tests**:
  - `show_in_canvas` happy path: tool result accepted, Activity record
    of kind `code_canvas_show_intent` written, navigate-intent pushed
    on the surface's ADR-075 channel with the composed `targetUrl`;
  - same-turn `declare_artifact` result can be referenced by
    `show_in_canvas(declarationId)`;
  - foreign-surface artifacts are rejected with
    `artifact_canvas_artifact_not_anchored`;
  - `clear_canvas` writes a `code_canvas_clear_intent` Activity
    record and pushes a navigate-intent whose `targetUrl` drops the
    `/canvas/:artifactId` segment. It writes no product `metadata`
    and is idempotent: calling it from a URL without the segment
    still emits one Activity record and one navigate-intent (no-op
    navigation);
  - the persisted tool trace surfaces accepted / rejected canvas tool
    results matching the `declare_artifact` pattern.
- **Renderer tests**:
  - child route mounts when the URL is `/<surface>/canvas/:artifactId`
    and unmounts when the user navigates back; close button calls
    `navigate(parentUrl)` and does NOT call any server endpoint;
    collapse toggles local state without changing the URL;
  - iframe includes the projected `iframeSandboxProfile`'s sandbox /
    referrer / allow attributes literally — `static` profile must NOT
    include `allow-scripts` or `allow-same-origin`;
  - **defense in depth**: when the projection emits a
    `scripted-cross-origin` profile but the URL scheme fails the renderer's
    allowlist (e.g. a `javascript:` URL slipped past the server), the
    renderer renders the unsupported pane and does not mount the iframe;
  - **defense in depth**: when the projection emits a
    `scripted-cross-origin` profile but the URL origin equals the
    renderer's `window.location.origin` (the cheap config-free
    same-origin-with-shell short-circuit), the renderer silently demotes
    to `static`. The renderer does NOT re-run the runtime-preview-origin
    or scripted-preview-producer allowlists — those are server-only —
    and never promotes `static` to `scripted-cross-origin`;
  - unsupported artifacts show metadata and external-open fallback instead
    of a blank frame.
- **Manual checks**:
  - active Code chat remains mounted when the pane opens;
  - pane top bar aligns with existing route top bars;
  - narrow viewport collapses or stacks without overlapping composer text;
  - existing builder/artifact preview iframes still render after Task 2.5
    migration only under the chosen policy posture: either
    `scripted-cross-origin` after adding the exact encoded producer
    identities, or the documented static-only fallback.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Assistant presents unsafe URL | High | Server picks sandbox profile and re-checks scheme; renderer re-validates and may only demote |
| Migrating existing builder/artifact iframes silently regresses dev-server previews (vite / Next.js / Lovable) | High | Task 2.5 explicitly enumerates the encoded producer identities behind real preview URLs and adds them to `codeCanvas.scriptedPreviewProducerAllowlist`, OR accepts the static-only regression. Manual check verifies real preview URLs still load under the chosen posture |
| External `https://...` artifacts marked `kind = 'preview'` qualify for `allow-scripts allow-same-origin` (first-round security review) | High | Structured runtime preview origin allowlist replaces "is not Cats shell origin"; off-allowlist URLs silently demote to `static` even when `kind = 'preview'` |
| Agent escalates to script-eligible iframe by declaring a loopback `kind = 'preview'` URL (second / third-round security review) | High | Two-allowlist gate: `agent` short-circuits to `static`; non-agent producers must additionally match a named entry in `codeCanvas.scriptedPreviewProducerAllowlist` (default empty, operator-enumerated). URL allowlist alone is no longer sufficient; a specific producer entry is required |
| Producer-by-kind gate too wide (third-round security review): not every tool / system detector is a preview-origin owner | High | Replaced kind-based gate with named producer allowlist `{ producerKind, producerIdentity }[]`; default empty so the platform earns nothing automatically |
| Credential URLs leak into iframe `src` / open-external href / pane metadata (second-round security review) | High | Hard reject at canvas boundary with `artifact_canvas_url_credentials_not_allowed`, mirroring SPEC-092's `artifact_url_credentials_not_allowed` declaration-time rule |
| Task metadata becomes a dumping ground | Resolved | ADR-098 superseded ADR-097; canvas writes no product `metadata`. The risk is gone. |
| Split pane breaks chat/composer layout | Medium | Platform-shared `<CanvasPane>` lives next to other shared shell components; targeted renderer tests cover URL-driven mount/unmount and manual viewport check; nested route uses parent's `<Outlet />` so the parent layout owns the responsive split |
| `declarationId` ambiguity across turns / producers / scopes (third-round security review) | Medium | Per-turn index keyed by `(turnId, producerKey, scopeKey, declarationId)` matching SPEC-092 idempotency components plus `turnId`. Same-caller-only resolution; same-turn cross-producer → `artifact_canvas_declaration_producer_mismatch`; same-turn cross-scope or prior-turn → `artifact_canvas_declaration_unknown` (no cross-turn lookup) |
| Duplicate-key declaration collision | Medium | Same-key duplicates resolving to the same `artifactId` are no-ops; differing `artifactId` rejects with `artifact_canvas_declaration_collision` and the focus is not written |
| Server / renderer config drift across time | Low | Projection is computed on every URL hit and always returns the current `policyVersion`; navigate-intent payload's optimistic-render data is reconciled with the projection on fetch. There is no stored visible state to drift |
| Renderer holds stale or copied allowlist (third-round security review) | Medium | Renderer does NOT receive the allowlists; it re-runs only scheme + same-origin-with-shell + profile-name validity. Server is the single authority for the matchers |
| User confusion between close and collapse | Low | Close = `navigate()` away (URL changes, share-link drops the canvas); collapse = local UI only (URL unchanged). Two visually distinct controls — close uses an X, collapse uses a chevron. Reload: close-state survives via URL; collapse-state survives via `localStorage` per-surface key, but a fresh deep-link to `/canvas/:artifactId` always shows the pane expanded |
| Cross-product mount under-tested in Phase 1 | Medium | Phase 1 wires only Code; Phase 3 (Tasks 3.6-3.8) wires Work and Chat. Platform-shared component lives in `src/products/shared/` from day one so Phase 3 is route registration only, not new safety code |
| Live preview scope creeps into Phase 1 | High | Keep process spawning in separate Phase 4 security plan |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-30 | Plan created from split-canvas artifact panel review. |
| 2026-04-30 | Reworked sandbox profiles, two-control close model, per-turn declaration index, active-task precondition, and renderer defense-in-depth tests after first-round review; added ADR-097 dependency. |
| 2026-04-30 | Second-round security follow-up: replaced "is not Cats shell origin" with explicit runtime preview origin allowlist; rekeyed declaration index with `producerKey` for multi-producer same-turn collisions; dropped cross-turn error code (cross-turn lookup is intentionally absent); pinned reject-vs-demote semantics for explicit-presentation vs auto and for scheme-vs-origin failures. |
| 2026-04-30 | Third-round security follow-up: pinned the runtime preview origin allowlist as a structured `{ hostname, schemes?, ports? }[]` schema with explicit URL-matching algorithm; added the producer-eligibility gate that denies `scripted-cross-origin` to all agent-declared artifacts in Phase 1; promoted credential URL handling from silent demote to hard reject; defined `producerKey` from the SPEC-092 encoded producer identity; pinned `declarationId` resolution as same-caller-only with the new `artifact_canvas_declaration_producer_mismatch` error code; scrubbed stale `(turnId, declarationId)` and `artifact_canvas_declaration_cross_turn` references from PLAN-090. |
| 2026-04-30 | Fourth-round security follow-up: added `scopeKey = "<scopeKind>:<scopeId>"` to the index key so same-actor / same-tool spanning multiple runtime sessions in one turn no longer collide; added duplicate-key collision detection (`artifact_canvas_declaration_collision`); flattened both allowlist config shapes (no `{ entries: [...] }` wrapper) and made them consistent across SPEC / PLAN / tool-calls; corrected IPv6 hostname normalization (Node's `URL.hostname` does NOT strip brackets — manual strip required); replaced producer-by-kind gate with named `scriptedPreviewProducerAllowlist` defaulting to empty; added `policyVersion` to `CodeCanvasFocus` and projection-side demote-on-mismatch; clarified renderer is NOT a matcher mirror (scheme + same-origin-with-shell + profile-name validity only). |
| 2026-04-30 | Fifth-round contract follow-up: removed `task:` from `scopeKey` examples (SPEC-092 scope kinds are `run` / `runtime` / `conversation` / `workspace` only — the canvas does not add `task`); replaced internal type-name references with the public SPEC-092 idempotency fields while preserving encoded `producerIdentity` values (`actor:<id>`, `tool:<name>`, `system:<detector>`); scrubbed stale renderer-matcher mirror wording; added explicit §Policy Version Canonicalization algorithm (per-entry normalization, default expansion, port dedupe + numeric sort, sort orderings, `catsShellOrigin` default-port handling, canonical-JSON sorted-keys serialization, SHA-256 first-16 lower-case) plus test-vector requirements as Task 1.9. |
| 2026-04-30 | Sixth-round architectural pivot under ADR-098: visible canvas state moved from `CoreTaskRecord.metadata.codeCanvasFocus` to URL nested child route `/canvas/:artifactId`; canvas pane and iframe viewer promoted from Code-product to platform-shared (`src/products/shared/renderer/`) so Cats Work and Cats Chat can mount the same pane against any anchored artifact; `show_in_canvas` / `clear_canvas` effect changed from "write task metadata" to "write Activity audit + push `CodeCanvasNavigateIntent` over ADR-075 channel"; user close becomes renderer-only `navigate()` (no server delegate); `clear_canvas` accepted result drops the legacy `cleared: true` boolean in favor of `targetUrl`; `artifact_canvas_no_active_surface` renamed to `artifact_canvas_no_active_surface` to reflect cross-product applicability; ADR-097 superseded; `platform-viewer-policy.md` added as the operational entry point for cross-product viewer decisions. All hard-won security policy from rounds 1–5 (sandbox profiles, two flat-array allowlists with structured schema, hostname normalization with manual IPv6 bracket strip, scripted preview producer allowlist defaulting empty, credential URL hard reject, scheme allowlist hard reject, scope+producer-keyed declaration index, policyVersion canonicalization) survives intact and relocates with the platform viewer. |

---

*Created: 2026-04-30*
*Author: Codex*
