# ADR-098: URL-Driven Canvas View-State and Platform-Shared Viewer for Core-Tier Entities

> Cats canvas pane state is addressable via the URL (nested route per
> product), not stored under a product record's `metadata`. The canvas
> pane itself is a platform-shared primitive that any product surface
> can mount with a consistent `/canvas/:artifactId[/view/:presentation]`
> convention. Server
> remains the authority for safety decisions (sandbox profile, allowlists,
> policy snapshot); the URL is the authority for what the user is looking
> at.

## Status

Proposed (Supersedes [ADR-097](./097-store-code-canvas-focus-on-task-metadata.md))

## Context

[ADR-097](./097-store-code-canvas-focus-on-task-metadata.md) put canvas
focus state in `CoreTaskRecord.metadata.codeCanvasFocus`. That decision
was correct in isolation (avoided a frozen-shared-contract change for one
small UI signal) but two follow-up questions exposed structural problems:

1. **"Don't Manus / Lovable use URLs for canvas state?"** — yes. The
   industry pattern for assistant-driven canvas products is URL-driven
   visible state with server-side persistence for audit / domain data.
   Server-state-driven canvas focus loses shareable links, browser
   back/forward navigation, bookmarkability, and reload-by-URL. The
   "assistant writes server" simplicity that ADR-097 optimized for can
   be preserved without making the URL secondary — the assistant tool
   call writes audit and pushes a navigate-intent, the renderer changes
   the URL, the URL drives the visible pane.

2. **"How does Cats Work view a Code Artifact while keeping Work
   context?"** — under ADR-097, it can't, because canvas focus lives in
   `CoreTaskRecord.metadata.codeCanvasFocus`, which is Code-task-scoped.
   Work Items have no canvas. Generalizing the storage to per-product
   metadata duplicates schema across products; promoting it to a new
   Core record family is exactly what ADR-097 rejected. URL-driven
   sidesteps both problems: any product surface can mount the same
   canvas pane primitive at `/canvas/:artifactId`, server-side
   safety policy applies uniformly, no per-product metadata schema.

The deeper principle these two questions share: **for Core-tier entities
(records anchorable from multiple products), the surface that renders
their inherent content should be a platform primitive, and the visible
"what is being viewed" state should be URL-addressable so any product
context can mount it.**

This ADR captures both pivots — URL-driven view-state and
platform-shared viewer — together because they are the same correction
viewed from different angles.

## Decision

### View-State Authority

The URL is the source of truth for what the canvas is showing. The
canvas pane is mounted as a **nested route child** of any product
surface that opts in:

```
/code/tasks/:taskId                              ← left pane only
/code/tasks/:taskId/canvas/:artifactId           ← left + right
/code/tasks/:taskId/canvas/:artifactId/view/iframe  ← explicit viewer
/work/items/:itemId/canvas/:artifactId           ← same pane in Work
/chat/conversations/:convId/canvas/:artifactId   ← same pane in Chat
```

`/canvas/:artifactId[/view/:presentation]` is a shared child-route
convention. Each product registers it once; the canvas pane component
is one platform primitive shared across products. The optional
`/view/:presentation` segment preserves explicit presentation requests
(`iframe` / `image` / `pdf` / `code`) across reload, share-link, and
browser back/forward. Absence of the segment means `auto`.

Query string is **not** used for canvas state. Query string remains
reserved for ephemeral parameters (search filters, etc.) that do not
identify a navigable view.

### Platform-Shared Viewer

The canvas pane lives in `src/products/shared/renderer/` (or
`src/design/`) as a platform primitive. Each product wraps it with its
own surrounding chrome (top-bar handlers, sidebar relations, "open in
external" links specific to that product) but does not re-implement the
viewer.

The viewer's safety policy — iframe sandbox profile selection, scheme
allowlist, runtime preview origin allowlist, scripted preview producer
allowlist, credential URL hard reject, hostname normalization, and the
`policyVersion` canonicalization algorithm — moves with the viewer to
the platform layer. Products that mount the viewer all benefit from one
copy of these checks.

### Server's Role

The server is the authority for safety decisions and for assistant-driven
intent, not for visible state:

- Given a surface-scoped canvas path, the server returns a projection
  with the resolved `iframeSandboxProfile`, `policyVersion`, and any
  artifact metadata the viewer needs. The projection API receives
  `(productKind, surfaceKind, surfaceId, artifactId,
  presentationRequested)` and validates that the artifact is anchored
  to that surface.
- Assistant tool `show_in_canvas` writes an Activity record (audit /
  trace) and pushes an `ArtifactCanvasNavigateIntent` to the renderer
  through the platform render-intent stream. The stream may use the
  same app push transport as
  [ADR-075](./075-adopt-push-based-per-entity-state-subscription.md),
  but it is not a generic `subscribeEntity` entity snapshot / patch.
  Intents are short-lived (Phase 1 TTL: 30 seconds), acknowledged by
  `intentId`, and applied only to the currently mounted surface. The
  renderer receives a matching intent and calls `navigate()`. The URL
  changes; the viewer remounts.
- User actions on the canvas (close, switch artifact via sidebar click)
  are renderer-only `navigate()` calls. They do **not** require server
  writes.

### What Goes Away

- `CoreTaskRecord.metadata.codeCanvasFocus` — no longer the source of
  truth; visible state lives in URL. Assistant intent audit persists
  in `artifact_canvas_show_intent` / `artifact_canvas_clear_intent`
  Activity records, not in product metadata.
- The two-control "Close vs Collapse" model from earlier SPEC-101
  drafts remains visually distinct, but only assistant / delegate
  `clear_canvas` touches the server. User Close pops the
  `/canvas/:artifactId` segment from the URL; Collapse remains
  renderer-only via local state / `localStorage`.

### What Stays

The hard-won safety rules survive the pivot intact:

- iframe sandbox profiles (`static`, `scripted-cross-origin`) and the
  rules for picking each;
- structured runtime preview origin allowlist with explicit hostname
  normalization (manual IPv6 bracket strip);
- scripted preview producer allowlist (default empty);
- credential URL hard reject;
- scheme allowlist hard reject;
- `policyVersion` canonicalization (SHA-256 over canonicalized config
  tuple);
- per-turn declaration index keyed by
  `(turnId, producerKey, scopeKey, declarationId)` for resolving
  same-turn `declarationId` in `show_in_canvas`;
- producer-eligibility short-circuit (`agent` producers never
  eligible).

These are renderer-and-server orthogonal to where visible state lives.

### Cross-Product Viewer Policy

The principle behind moving the viewer to the platform layer applies
beyond Artifact. It is captured in
[`docs/platform-viewer-policy.md`](../platform-viewer-policy.md), which
is the operational entry point for deciding when a Core-tier entity
needs a platform-shared viewer vs a product-owned one.

## Consequences

### Positive

- **Cross-product viewing works**: Cats Work can mount the same canvas
  pane on a Work Item; Cats Chat can mount it on a conversation. No
  per-product duplication.
- **Shareable URLs**: pasting `…/canvas/:artifactId` to a colleague
  shows them the same view.
- **Browser navigation works**: back/forward toggles the canvas pane
  naturally.
- **Reload preserves user-chosen state via URL** (was previously by
  server round-trip).
- **No write storm on user close**: closing the canvas is a
  renderer-only `navigate()` away from the child path. ADR-097's
  "manual close write" risk goes away.
- **Audit / domain data still server-authoritative**: assistant intent
  is logged via Activity; security policy is server-evaluated. Visible
  state and domain state are separated cleanly.
- **The platform-shared viewer concept generalizes**: future Core
  entities (Activity feeds, Approval requests, transcripts) can use the
  same "platform primitive + product wrapper + nested route convention"
  pattern. See `platform-viewer-policy.md` for the framework.

### Negative

- **URL becomes part of the API surface**: changes to the
  `/canvas/:artifactId` path shape become breaking changes for
  bookmarks / shared links. Mitigated by treating the path as a stable
  contract from Phase 1 onward.
- **Cross-product navigation requires URL coordination**: each product
  must register the child route. Mitigated by a single shared route
  helper (e.g.
  `withCanvasChildRoute(parent: RouteObject): RouteObject`) so the
  registration is one line per product.
- **Audit trail for "user dismissed canvas" requires opt-in
  client-side telemetry** (since user close no longer writes server).
  This is fine for Phase 1 — we did not actually need this audit.
- **Small renderer churn**: the existing Code-only canvas pane
  scaffolding planned in PLAN-090 needs to be relocated to the platform
  layer before it gets too entrenched. Doing this BEFORE PLAN-090
  Phase 2 starts is strictly cheaper than doing it later.

### Neutral

- The security work from rounds 1–5 of SPEC-101 review survives intact.
  The pivot does not invalidate the iframe sandbox / allowlist /
  policyVersion machinery.
- ADR-081's three-tier Core taxonomy is the underlying basis for the
  cross-product-viewer policy: Materialization-tier records (Artifact /
  Activity / Outcome / Checkpoint / Trace) are the natural candidates
  for platform-shared viewers.
- Phase 3 live preview substrate is unaffected — it still produces a
  `kind = 'preview'` artifact and the Phase 1 viewer renders it; only
  the storage / state layer underneath changes.

## Alternatives Considered

### Alternative 1: Keep ADR-097 (server-state-driven canvas focus)

- **Pros**: Already reviewed across five rounds of security tightening.
  Fewer files to change.
- **Cons**: Loses shareable URLs, browser back/forward, bookmarks. Does
  not extend to Cats Work / Chat without per-product metadata schema or
  a new Core record family. Forces the assistant tool to write task
  metadata, creating a write-storm pressure on user-close that we then
  patched with a "two-control close vs collapse" model.
- **Why rejected**: Optimizes for "assistant writes server are simple"
  at the cost of every other UX axis. Does not generalize beyond Code.

### Alternative 2: Query string for right pane (`?canvas=:artifactId`)

- **Pros**: Slightly simpler to add to existing routes; no nested route
  config changes per product.
- **Cons**: Semantically wrong — the right pane is a navigable view,
  not a parameter. Breadcrumb / focus management / route-meta hooks
  cannot attach cleanly. Cross-product convention is weaker (each
  product can disagree on the query name). Composes badly with future
  multi-pane extensions.
- **Why rejected**: When the same problem can be solved cleanly with
  nested routes, query string is a downgrade. We already use nested
  routes elsewhere; canvas should match.

### Alternative 3: Promote canvas focus to a `CoreCanvasFocusRecord` family

- **Pros**: First-class Core entity, clean cross-product semantics,
  type-safe shape.
- **Cons**: Frozen-shared-contract change. Migration. Projection wiring
  in every product. Larger blast radius. Still doesn't give us
  shareable URLs unless we also add URL routing.
- **Why rejected**: Even after paying the migration cost, we still need
  URLs. URL-driven gives us cross-product viewing without the Core
  schema change.

### Alternative 4: Per-product canvas surfaces (Code, Work, Chat each ship their own)

- **Pros**: No shared-contract changes; each product evolves
  independently.
- **Cons**: Three implementations of iframe safety, three sandbox
  profile decisions, three policyVersion algorithms, three sets of
  defense-in-depth checks. Drift is guaranteed; security review for one
  product doesn't cover the others.
- **Why rejected**: Safety boundaries should not be duplicated.

## References

- [ADR-097](./097-store-code-canvas-focus-on-task-metadata.md) (superseded)
- [ADR-081](./081-canonicalize-three-tier-core-record-taxonomy.md) — the
  Core / Materialization tier framing
- [ADR-075](./075-adopt-push-based-per-entity-state-subscription.md) —
  app push substrate; SPEC-101's render-intent stream must not be
  implemented as a generic `subscribeEntity` patch
- [ADR-019](./019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [SPEC-101](../specs/SPEC-101-cats-code-artifact-canvas.md)
- [SPEC-092](../specs/SPEC-092-code-artifact-declaration-contract.md) —
  artifact declaration contract; `producerKind` / `producerIdentity` /
  `scopeKind` / `scopeId` idempotency components survive into the
  per-turn declaration index
- [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md)
- [`docs/platform-viewer-policy.md`](../platform-viewer-policy.md) —
  cross-product viewer policy and entity viewer-ownership table
- [Research note](../research/2026-04-30-cats-code-split-canvas-artifact-panel.md)

---

*Decision made: 2026-04-30*
*Decision makers: middl, Claude*
