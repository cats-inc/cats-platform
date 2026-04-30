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
      `artifactId` or same-turn `declarationId`, validates active
      task/session compatibility, hard-rejects credential URLs, applies
      the runtime preview origin allowlist + scripted preview producer
      allowlist to pick the iframe sandbox profile, stamps a
      `policyVersion`, and updates task metadata. The processor owns the
      per-turn declaration index keyed by
      `(turnId, producerKey, scopeKey, declarationId)` where
      `producerKey = ResolvedProducerIdentity.encoded` and
      `scopeKey = "<ResolvedScope.kind>:<ResolvedScope.id>"` (both per
      SPEC-092). Both keys are taken from the caller's own resolved
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
      look up `(producer.kind, ResolvedProducerIdentity.value)` in this
      allowlist. The default empty list means **no producer earns
      `scripted-cross-origin` out of the box** — operators must
      explicitly enumerate trusted producers. Task 2.5's migration
      decides whether to add the specific producer identities behind
      existing builder/artifact preview iframes or accept the
      static-only regression; that decision is captured separately and
      not baked into the Phase 1 default.
- [ ] Task 1.8: Add `policyVersion` to `CodeCanvasFocus` and to the
      `show_in_canvas` accepted result. Compute the version as the first
      16 hex chars of a SHA-256 over the canonicalized
      `(runtimePreviewOriginAllowlist + scriptedPreviewProducerAllowlist + catsShellOrigin)`
      tuple at decision time. The Code projection compares the stored
      `policyVersion` against the server's current version on every
      read; mismatch demotes the projected `iframeSandboxProfile` to
      `static` for that read **without rewriting the stored focus**, so
      a subsequent `show_in_canvas` can re-resolve under the new policy.
      Server config reload republishes the version.
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
| `src/products/code/shared/canvasFocus.ts` | Create | Code canvas focus types (incl. `policyVersion`), normalizers, presentation resolution, and SPEC-101 error code union |
| `src/products/code/shared/canvasIframePolicy.ts` | Create | Runtime preview origin allowlist matcher (host normalization + bracket strip + scheme + port), scripted preview producer allowlist lookup, scheme allowlist, credential URL rejector, and `policyVersion` digest helper |
| `src/products/code/state/runtimeCanvasFocusExecution.ts` | Create | Assistant-effect processor for `show_in_canvas` and `clear_canvas`; owns the per-turn `(turnId, producerKey, scopeKey, declarationId)` declaration index keyed by SPEC-092's `ResolvedProducerIdentity.encoded` and `ResolvedScope` components |
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
  assistant can present an artifact declared in the same turn before it
  knows the materialized artifact id. The same-turn index is keyed by
  `(turnId, producerKey, scopeKey, declarationId)` — the SPEC-092
  idempotency components plus `turnId`, where `producerKey` is
  `ResolvedProducerIdentity.encoded` and `scopeKey` is
  `"<ResolvedScope.kind>:<ResolvedScope.id>"`. Both keys come from the
  canvas caller (same-caller-only); same-turn cross-producer rejects
  with `artifact_canvas_declaration_producer_mismatch`; same-turn
  cross-scope rejects with `artifact_canvas_declaration_unknown`.
  Multiple accepts at one key must resolve to the same `artifactId`
  (SPEC-092 idempotency); differing artifactId rejects with
  `artifact_canvas_declaration_collision`. The index has no cross-turn
  lookup, and prior-turn matches reject as
  `artifact_canvas_declaration_unknown`.
- Manual close has two distinct controls: `Close` (server write through the
  `clear_canvas` delegate, persists across reload) and `Collapse / expand`
  (renderer-only ephemeral toggle). The two-control split prevents
  collapse-state churn from writing task metadata while still letting users
  permanently dismiss the pane.
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
  (e.g. the runtime preview bridge tool name, approved system
  detectors). `agent`-kind producers are short-circuited to `static` and
  cannot appear in the allowlist. Phase 3 narrows further via
  session-bound preview registry. `normalizePreviewSurfaceUrl` is
  treated as a syntactic gate only; the security boundary is the two
  allowlists.
- The renderer is NOT a mirror of the matchers. The renderer re-runs
  only the cheap config-free defense-in-depth checks (scheme allowlist,
  profile-name validity, same-origin-with-shell short-circuit using
  `window.location.origin`); the server is the authority for the origin
  and producer allowlists. `policyVersion` on `CodeCanvasFocus` guards
  against config drift across time: stored version != current server
  version → projection demotes to `static` for that read without
  rewriting the focus.
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
    `[{ producerKind: 'tool', producerIdentity: 'cats_runtime_preview_bridge' }]`,
    a `tool`-declared `kind = 'preview'` artifact whose
    `producer.value === 'cats_runtime_preview_bridge'` and whose URL
    passes the origin allowlist resolves to `scripted-cross-origin`;
  - producer allowlist (agent short-circuit): with the same allowlist
    above, an `agent`-declared artifact still demotes to `static` even
    if `producer.value` somehow appeared in the producer allowlist —
    the agent short-circuit runs first;
  - producer allowlist (kind mismatch): an entry of
    `{ producerKind: 'tool', producerIdentity: 'X' }` does NOT match a
    `system` producer with identity `'X'`;
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
    `artifact_canvas_declaration_collision` and `codeCanvasFocus` is
    not written;
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
  - active-task precondition: both tools reject with
    `artifact_canvas_no_active_task` when invoked without an active task;
  - policy version (drift demote): stored
    `canvasFocus.policyVersion = 'v1'`; server reloads with a new
    allowlist producing version `'v2'`; the projection demotes the
    projected `iframeSandboxProfile` to `static` and surfaces the
    demotion to the renderer, **without** rewriting the stored focus.
    A subsequent `show_in_canvas` re-resolves under `'v2'` and rewrites
    the focus.
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
| Migrating existing builder/artifact iframes silently regresses dev-server previews (vite / Next.js / Lovable) | High | Task 2.5 explicitly enumerates the producer identities behind real preview URLs and adds them to `codeCanvas.scriptedPreviewProducerAllowlist`, OR accepts the static-only regression. Manual check verifies real preview URLs still load under the chosen posture |
| External `https://...` artifacts marked `kind = 'preview'` qualify for `allow-scripts allow-same-origin` (first-round security review) | High | Structured runtime preview origin allowlist replaces "is not Cats shell origin"; off-allowlist URLs silently demote to `static` even when `kind = 'preview'` |
| Agent escalates to script-eligible iframe by declaring a loopback `kind = 'preview'` URL (second / third-round security review) | High | Two-allowlist gate: `agent` short-circuits to `static`; non-agent producers must additionally match a named entry in `codeCanvas.scriptedPreviewProducerAllowlist` (default empty, operator-enumerated). URL allowlist alone is no longer sufficient; a specific producer entry is required |
| Producer-by-kind gate too wide (third-round security review): not every tool / system detector is a preview-origin owner | High | Replaced kind-based gate with named producer allowlist `{ producerKind, producerIdentity }[]`; default empty so the platform earns nothing automatically |
| Credential URLs leak into iframe `src` / open-external href / pane metadata (second-round security review) | High | Hard reject at canvas boundary with `artifact_canvas_url_credentials_not_allowed`, mirroring SPEC-092's `artifact_url_credentials_not_allowed` declaration-time rule |
| Task metadata becomes a dumping ground | Medium | Single `codeCanvasFocus` key with schema version, `policyVersion`, and normalizer |
| Split pane breaks chat/composer layout | Medium | Product-local layout first; targeted renderer tests and manual viewport check |
| `declarationId` ambiguity across turns / producers / scopes (third-round security review) | Medium | Per-turn index keyed by `(turnId, producerKey, scopeKey, declarationId)` matching SPEC-092 idempotency components plus `turnId`. Same-caller-only resolution; same-turn cross-producer → `artifact_canvas_declaration_producer_mismatch`; same-turn cross-scope or prior-turn → `artifact_canvas_declaration_unknown` (no cross-turn lookup) |
| Duplicate-key declaration collision | Medium | Same-key duplicates resolving to the same `artifactId` are no-ops; differing `artifactId` rejects with `artifact_canvas_declaration_collision` and the focus is not written |
| Server / renderer config drift across time (third-round security review) | Medium | `policyVersion` stamped on `CodeCanvasFocus` at decision time; projection demotes to `static` on version mismatch without rewriting stored focus; next `show_in_canvas` re-resolves under current policy |
| Renderer holds stale or copied allowlist (third-round security review) | Medium | Renderer does NOT receive the allowlists; it re-runs only scheme + same-origin-with-shell + profile-name validity. Server is the single authority for the matchers |
| User confusion between collapse and close (collapse "loses" their pane on reload) | Low | Two visually distinct controls; collapse uses an obvious chevron-style affordance, close uses an X |
| Live preview scope creeps into Phase 1 | High | Keep process spawning in separate Phase 4 security plan |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-30 | Plan created from split-canvas artifact panel review. |
| 2026-04-30 | Reworked sandbox profiles, two-control close model, per-turn declaration index, active-task precondition, and renderer defense-in-depth tests after first-round review; added ADR-097 dependency. |
| 2026-04-30 | Second-round security follow-up: replaced "is not Cats shell origin" with explicit runtime preview origin allowlist; rekeyed declaration index with `producerKey` for multi-producer same-turn collisions; dropped cross-turn error code (cross-turn lookup is intentionally absent); pinned reject-vs-demote semantics for explicit-presentation vs auto and for scheme-vs-origin failures. |
| 2026-04-30 | Third-round security follow-up: pinned the runtime preview origin allowlist as a structured `{ hostname, schemes?, ports? }[]` schema with explicit URL-matching algorithm; added the producer-eligibility gate that denies `scripted-cross-origin` to all agent-declared artifacts in Phase 1; promoted credential URL handling from silent demote to hard reject; defined `producerKey = ResolvedProducerIdentity.encoded` per SPEC-092; pinned `declarationId` resolution as same-caller-only with the new `artifact_canvas_declaration_producer_mismatch` error code; scrubbed stale `(turnId, declarationId)` and `artifact_canvas_declaration_cross_turn` references from PLAN-090. |
| 2026-04-30 | Fourth-round security follow-up: added `scopeKey = "<ResolvedScope.kind>:<ResolvedScope.id>"` to the index key so same-actor / same-tool spanning multiple runtime sessions in one turn no longer collide; added duplicate-key collision detection (`artifact_canvas_declaration_collision`); flattened both allowlist config shapes (no `{ entries: [...] }` wrapper) and made them consistent across SPEC / PLAN / tool-calls; corrected IPv6 hostname normalization (Node's `URL.hostname` does NOT strip brackets — manual strip required); replaced producer-by-kind gate with named `scriptedPreviewProducerAllowlist` defaulting to empty; added `policyVersion` to `CodeCanvasFocus` and projection-side demote-on-mismatch; clarified renderer is NOT a matcher mirror (scheme + same-origin-with-shell + profile-name validity only). |

---

*Created: 2026-04-30*
*Author: Codex*
