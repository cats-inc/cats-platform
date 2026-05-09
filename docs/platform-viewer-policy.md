# Platform Viewer Policy

> When a Core-tier entity needs a viewer that works the same way across
> Cats Code, Cats Work, Cats Chat (and future products), use a
> platform-shared component mounted via a nested-route convention.
> Product surfaces wrap it with their own surrounding chrome; the
> platform owns the viewer's inherent-content rendering and safety
> policy.

## Status

Active.

Created together with [ADR-098](./decisions/098-url-driven-canvas-and-platform-shared-viewer.md);
maintained as the operational entry point for cross-product viewer
decisions. New entity types added to the table below by the
SPEC / ADR that introduces them.

## Principle

For a Core-tier entity (records that ADR-081 places in the Interaction,
Planning, Execution, or Materialization tiers — anchorable from
multiple products), three statements should hold together or not at all:

1. **The viewer that renders the entity's inherent content is a
   platform primitive**, living in `src/products/shared/renderer/` (or
   `src/design/`). It does not depend on any product's runtime, store,
   or sidebar.
2. **Visible "what is being viewed" state is URL-addressable** through
   a shared nested-route convention, so any product surface can mount
   the viewer at that entity without a product context switch.
3. **Server-side safety policy and assistant-driven mutations are
   centralized** with the viewer (one sandbox policy, one allowlist,
   one set of error codes). Products do not re-implement these.

The "context wrapping" — surrounding chrome, breadcrumbs, available
actions, related sidebar items — remains product-scoped. Each product
mounts the platform viewer inside its own route layout and supplies
context-specific affordances around it.

## When This Applies

| Tier (ADR-081) | Default posture |
|----------------|-----------------|
| Materialization (Artifact / Activity / Outcome / Checkpoint / Trace) | Candidate YES — these were defined as cross-cutting / cross-layer, but Activity / Trace viewers still require explicit redaction, privacy, and safety policy before becoming platform-shared |
| Interaction (Conversation / Cat / Channel / Participant) | Inherent-content viewer YES (e.g. message rendering, cat card); product-scoped main surface still belongs to the originating product (transcript stays Chat-primary) |
| Planning + Execution (Project / WorkItem / Task / Run / Mission) | "Summary card" YES (platform); "full editor / interactive surface" NO (product-scoped because semantics differ across products) |
| Configuration-style (TransportBinding, etc.) | NO by default — settings surfaces, not in-product viewers |

These are starting points, not laws. Each new entity walks through the
deciding-the-cut algorithm below.

## Deciding the Cut

For any Core entity, when designing a way for users to view it from
multiple products, ask in order:

1. **Is the inherent content the same regardless of which product
   surface the user came from?** (e.g. an artifact URL renders the same
   in any iframe; an activity entry's payload is the same JSON.) If
   yes, that content viewer is a candidate platform primitive. If no
   (product-specific presentations differ in core meaning), keep
   product-scoped.
2. **Does any safety / privacy / policy decision attach to viewing the
   entity?** (e.g. iframe sandbox profile, redaction rules, access
   control.) If yes, that decision should be centralized with the
   viewer — duplicating across products invites drift.
3. **Will users plausibly want to see this entity while staying in a
   non-originating product context?** (e.g. Work Item supervising a
   Code Artifact; Chat showing a Work Item summary.) If yes, URL
   addressability and platform-shared mount are needed. If genuinely
   not, product-scoped is fine.
4. **Does the entity's record family already live in Core, with anchor
   foreign keys (`artifactId`, `taskId`, etc.) reachable from multiple
   products?** If yes, the URL-addressable viewer pattern is a natural
   fit. If the entity is genuinely product-private, default to
   product-scoped.

If 1 + 2 are yes, the inherent-content viewer should be a platform
primitive. If 3 is also yes, add URL addressability via the nested-route
convention below. If 4 is no, reconsider whether the entity should
actually be Core.

## URL Convention

Nested route under each product surface:

```
/<product>/<surface>/:<surfaceId>/<viewer>/:<entityId>
```

Where `<viewer>` is a stable, entity-shaped name (currently `canvas`
for artifacts; future viewers add their own segment when introduced).

Examples (current and illustrative future):

```
/code/tasks/:taskId/canvas/:artifactId
/code/tasks/:taskId/canvas/:artifactId/view/iframe
/work/items/:itemId/canvas/:artifactId
/work/tasks/:taskId/canvas/:artifactId
/chat/conversations/:convId/canvas/:artifactId

# Hypothetical future viewers (not implemented):
/code/tasks/:taskId/activity/:activityId
/work/items/:itemId/approval/:approvalId
```

Implementation guidance:

- Each product's route table calls a single helper, e.g.
  `withSharedViewerRoutes(parent: RouteObject): RouteObject`, that
  attaches the platform-owned child routes once. The helper lives in
  `src/products/shared/renderer/` next to the viewers themselves.
- Shared viewers use one valid surface enum rather than a free product /
  surface cartesian product. For Artifact Canvas, valid surface kinds
  are `code_task`, `code_codespace`, `work_item`, `work_project`,
  `work_task`, and `chat_conversation`.
- The viewer pane mounts via React Router `<Outlet />` in the product's
  shell layout.
- Query string is **not** used for canvas / viewer identity. Preserve
  explicit viewer modes in path segments (e.g.
  `/canvas/:artifactId/view/:presentation`). Reserve query string for
  ephemeral parameters (filters, search) that do not identify a
  navigable view.

## Server-Side Safety Authority

Whatever safety policy attaches to the viewer is server-decided and
centralized. The viewer projection takes the entity id plus the
mounting surface ref, validates anchoring / authorization for that
surface, runs the policy, and returns:

- the resolved presentation parameters (sandbox profile, masking, etc.);
- a `policyVersion` snapshot identifier so stale renderer cache demotes
  to safe defaults;
- the entity metadata the renderer needs to display.

The renderer treats the projection as authoritative. Server-pushed
render intents carry navigate-intent when an assistant tool wants to
surface a specific entity to the user. They may share the same app push
transport as ADR-075, but they are not generic entity snapshots /
patches. The renderer responds by calling `navigate()`, acknowledges
according to the owning SPEC's protocol, and never mutates
product-scope domain state.

## Entity Viewer-Ownership Table

This table is the operational record. Add a row whenever a SPEC / ADR
introduces a new platform-shared viewer or formally rejects one for an
entity.

| Entity (Core record) | Inherent-content viewer | Owning location | URL convention | Safety policy authority | Source of decision |
|----------------------|-------------------------|-----------------|----------------|-------------------------|--------------------|
| `CoreArtifactRecord` | `<CanvasPane>` (`IframeViewer` / `ImageViewer` / `PdfViewer` / `CodeViewer`) | Platform primitive in `src/products/shared/renderer/` | `/<product>/<surface>/:id/canvas/:artifactId[/view/:presentation]` | Server: sandbox profile + origin allowlist + producer allowlist + scheme + credential reject + `policyVersion`; renderer fetches server-served text URLs as read-only text | [SPEC-101](./specs/SPEC-101-cats-code-artifact-canvas.md), [ADR-098](./decisions/098-url-driven-canvas-and-platform-shared-viewer.md) |

Future entries are added via the SPEC / ADR that introduces the viewer.
Each row records what the viewer is, where it lives, the URL
convention, who owns the safety check, and the decision document.

## Anti-Patterns

- **Re-implementing iframe sandbox / allowlist logic per product.**
  This is exactly what the platform-shared viewer rule prevents.
- **Storing visible canvas / viewer state on `<Product>Record.metadata`.**
  Visible state goes in the URL; metadata stores domain truth (artifact
  records, activity entries, audit). See ADR-098 for the
  superseded-by-URL approach.
- **Using query string when the right answer is a nested route.** A
  navigable second view is a child route, not a query parameter. Query
  string is for filters / non-navigable parameters.
- **Letting the renderer re-run the full server safety matcher.**
  Defense-in-depth on the renderer is limited to the cheap config-free
  checks (URL scheme, profile-name validity, same-origin-with-shell
  short-circuit). The full allowlist matchers are server-only.
- **Adding a new Core record family for what is actually URL state.**
  If the question is "what is the user looking at right now", the
  answer is URL, not a Core record. New record families are reserved
  for durable domain entities, per ADR-081.
- **Promoting product-private records to platform-shared viewers
  without entity-tier review.** The decision tree above protects against
  scope creep: a Codespace or a Team Template is product-internal even
  if some other product wants to "link out" to it.

## Maintenance

Each new platform-shared viewer adds one row to the table above and one
URL-convention example. Reverting a viewer to product-scoped requires a
new ADR superseding the row's source-of-decision ADR.

When the deciding-the-cut algorithm above produces a borderline answer,
prefer **product-scoped first**, then promote to platform-shared once
the cross-product use case is concrete and reviewed. Promotion is
cheaper than demotion (the platform component lives in a known
location; demotion would require splitting and re-implementing the
safety logic per product).
