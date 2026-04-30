# ADR-097: Store Code Canvas Focus on Task Metadata, Not a New Core Record Family

> **SUPERSEDED by [ADR-098](./098-url-driven-canvas-and-platform-shared-viewer.md).**
> ADR-098 moves visible canvas state to URL (cross-product nested route)
> and promotes the canvas pane to a platform-shared primitive. Task
> metadata is no longer the source of truth; an Activity record retains
> the assistant intent for audit. Read this ADR for the historical
> context that produced ADR-098, but do not use its decision in new
> implementation.

> Cats Code's right-hand Artifact Canvas focus is presentation state attached
> to the active Code task. It lives at
> `CoreTaskRecord.metadata.codeCanvasFocus` instead of being promoted to a
> dedicated Core record family or attached to `CoreConversationRecord`.

## Status

Superseded by [ADR-098](./098-url-driven-canvas-and-platform-shared-viewer.md) — 2026-04-30

## Context

[SPEC-101](../specs/SPEC-101-cats-code-artifact-canvas.md) introduces a Code
right-hand Artifact Canvas pane that renders one validated artifact beside
the active Code chat/task surface. The contract requires a server-side
"focus" field that:

- references exactly one materialized `CoreArtifactRecord`,
- carries the resolved presentation choice (`iframe` / `image` / `pdf` /
  `code` / `unsupported`),
- carries the iframe sandbox profile picked by the same-origin rule,
- carries audit fields (`openedAt`, `openedBy`),
- survives reload, and
- is mutated only through `show_in_canvas` / `clear_canvas` (or the
  product-internal delegate that backs the user "Close (X)" button).

The shape is small. The lifetime is bounded by the active Code task. The
operations are limited to "set", "clear", and "read". The question is
**where** this state should live.

The `cats-platform/src/core/types.ts` constraints relevant to this decision:

- `CoreTaskRecord.metadata: CoreRecordMetadata` exists and
  `CoreRecordMetadata` is `{ [key: string]: unknown }` — it accepts arbitrary
  product-owned keys behind a normalizer.
- `CoreConversationRecord` has **no** `metadata` field. Adding one would be a
  shared-contract change touching every product that reads conversations.
- New Core record families require a model migration, projection wiring in
  every product, and integration-review approval per
  `docs/product-integration-guide.md`.

Cats Code is task-first in the conversational + task entry materialization
described by ADR-081 and the terminology twentieth-round follow-up: a Code
chat always has an active task to anchor the canvas to. Code-product surfaces
that intentionally have no task (e.g. the Codespaces or Artifacts sidebar
when no task is open) are explicitly outside the canvas's contract — those
calls are rejected with `artifact_canvas_no_active_task`.

## Decision

Cats Code will store canvas focus state under
`CoreTaskRecord.metadata.codeCanvasFocus`, behind the
`CodeCanvasFocus` schema defined in SPEC-101.

The Code product owns:

1. the schema (`schemaVersion: '1.0'`, normalizer, version-aware reader),
2. the assistant-effect processor that mutates this metadata key, and
3. the Code projection that exposes it as read-only `canvasFocus` to the
   renderer.

Canvas focus shall NOT be:

- promoted to a dedicated `CoreCanvasFocusRecord` (or similar) family in
  Phase 1,
- attached to `CoreConversationRecord` (which would require adding a new
  `metadata` field to a frozen shared contract used by every product),
- attached to `CoreRunRecord` (run lifetime is too narrow; previews remain
  useful after the run closes), or
- left as renderer-only state (it has to survive reload and be auditable from
  the assistant tool trace).

If a future requirement needs canvas focus to span products (e.g. Cats Work
adopting a similar pane, or canvas focus following a conversation across
tasks), this ADR shall be superseded by a follow-up ADR that promotes the
state into Core and migrates the existing Code metadata.

## Consequences

### Positive

- No frozen shared-contract changes: `CoreConversationRecord` and the Core
  record families stay as they are.
- One product owns the schema, normalizer, mutation, and projection. The
  blast radius of a focus-shape change is contained inside
  `src/products/code/`.
- Task-scope falls out naturally. Peer Code / Team Code member tasks each
  get an independent canvas focus without extra plumbing.
- Reload behaves correctly: focus persists with the task it belongs to and
  is cleared by the product-internal delegate the user clicked, not by the
  fact that they happened to navigate.
- Audit trail is uniform. The `show_in_canvas` / `clear_canvas` tool trace
  plus the task metadata write are both visible to operators through the
  same trace surfaces that already exist for `declare_artifact`.

### Negative

- "No active task" Code surfaces (Codespaces / Artifacts sidebar without a
  task) cannot use the canvas at all. The canvas tools must reject those
  calls with `artifact_canvas_no_active_task`, and the renderer cannot host
  the pane on no-task routes. If we later want a no-task pane (e.g. browse a
  shared artifact from the sidebar without picking a task), it will need a
  separate state slot.
- `CoreRecordMetadata` is `{ [key: string]: unknown }`; the type system
  cannot prevent a sibling product or runtime path from writing a different
  shape under `codeCanvasFocus`. The Code projection must defensively
  validate the schema and drop malformed metadata.
- Cross-product reuse is not possible without a follow-up migration. If Cats
  Work or Cats Chat adopt a similar canvas pane, they would either duplicate
  the pattern under their own metadata keys or trigger the supersede path
  above.
- Schema versioning becomes a Code-product responsibility. Bumping
  `schemaVersion` from `'1.0'` requires a Code-side migration helper plus a
  projection-side reader that handles both versions during the rollout
  window.

### Neutral

- This is consistent with how other Code-task UI state has accreted on
  `CoreTaskRecord.metadata` (`codeWorkspace`, `planning`, etc.). Canvas focus
  becomes one more namespaced key under the same convention.
- The decision does not block Phase 3 live `npm start`-style previews. Those
  work by emitting a `kind = 'preview'` URL artifact and calling
  `show_in_canvas`; nothing about the storage location changes.

## Alternatives Considered

### Alternative 1: New `CoreCanvasFocusRecord` family

- **Pros**: First-class Core entity with proper foreign keys; natural place
  for cross-product reuse; type-safe shape at the Core layer.
- **Cons**: Frozen-shared-contract change requiring integration review,
  migration, projection plumbing in every product, and a new Core mutation
  surface. Significantly larger blast radius than the feature warrants.
- **Why rejected**: Phase 1 is one product, one pane, one focus key per
  task. The added Core surface is not paid back by anything the SPEC-101
  contract actually requires.

### Alternative 2: Add `metadata` to `CoreConversationRecord`

- **Pros**: Conversation-scoped focus is intuitively "one canvas per chat".
- **Cons**: `CoreConversationRecord` is a frozen shared contract; adding a
  metadata field touches Chat / Work / Code projections and tests. Also,
  conversation scope is wrong — a single Code conversation can host
  multiple tasks (Peer Code / Team Code member tasks), and they need
  independent canvas focus.
- **Why rejected**: Shared-contract churn for the wrong scope.

### Alternative 3: Attach to `CoreRunRecord.metadata`

- **Pros**: Already has `metadata`; run-bound focus auto-clears when the
  run ends.
- **Cons**: Runs are short-lived execution attempts. A preview URL is
  typically still useful after the run finishes (the user is reviewing it).
  Run-scope would also lose the focus across run retries.
- **Why rejected**: Lifetime mismatch.

### Alternative 4: Renderer-only state

- **Pros**: Zero server changes.
- **Cons**: No reload survival; no audit trail of which artifact the
  assistant asked the renderer to show; no way for a server-side guard
  (e.g. compliance review) to inspect what the user saw; the assistant has
  no acknowledgement of whether its presentation request actually landed.
- **Why rejected**: Loses the audit invariants SPEC-101 requires.

## References

- [SPEC-101](../specs/SPEC-101-cats-code-artifact-canvas.md)
- [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md)
- [ADR-088](./088-use-structured-artifact-declarations-for-code-materialization.md)
- [ADR-081](./081-canonicalize-three-tier-core-record-taxonomy.md)
- [ADR-019](./019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [SPEC-092](../specs/SPEC-092-code-artifact-declaration-contract.md)
- [Research note](../research/2026-04-30-cats-code-split-canvas-artifact-panel.md)

---

*Decision made: 2026-04-30*
*Decision makers: middl, Claude*
