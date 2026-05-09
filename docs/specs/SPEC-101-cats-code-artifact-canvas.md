# SPEC-101: Cats Code Artifact Canvas

> Define the split-canvas artifact presentation surface for Cats Code,
> including assistant-driven `show_in_canvas` / `clear_canvas` tool
> calls and the first safe iframe viewer contract. Canvas view-state
> lives in the URL (per [ADR-098](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md))
> and the canvas pane component is a platform-shared primitive that
> Cats Work and Cats Chat may also mount; the canvas safety policy
> (sandbox profiles, allowlists, `policyVersion`) is centralized with
> the platform viewer.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | middl |
| **Related Plan** | [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md) |

## Summary

Cats Code needs a right-hand Artifact Canvas that can open beside the
active Code chat/task surface without replacing it. The assistant may
request this canvas through structured tool calls, but the visible
content must remain bound to a validated `CoreArtifactRecord` or
same-turn accepted artifact declaration.

This spec covers the Phase 1 contract:

- **URL-addressable canvas state** via a nested child route
  `/canvas/:artifactId[/view/:presentation]` that any product surface
  (Code, Work, Chat) can mount, per ADR-098. The URL is the source of
  truth for what the user is looking at; server stores **no** "current
  focus" record.
- `show_in_canvas` and `clear_canvas` tools whose effect is to record
  audit (Activity) and push a platform render-intent to the renderer.
  This intent uses the same app push connection as ADR-075, but it is
  not an entity snapshot or durable visible state. The renderer
  responds by calling `navigate()` to enter or pop the child route.
- A **platform-shared viewer component** (`<CanvasPane>` +
  `<IframeViewer>`) that lives in `src/products/shared/renderer/`,
  with the safety policy (sandbox profiles, scheme allowlist, runtime
  preview origin allowlist, scripted preview producer allowlist,
  credential URL hard reject, hostname normalization, `policyVersion`
  canonicalization) centralized at the platform layer.
- An iframe viewer for safe preview URL artifacts. Image, PDF, code
  viewers, and live `npm start`-style process supervision are follow-up
  work.

## Goals

- Let a Code assistant request that a recorded artifact be shown in the
  main canvas beside the conversation.
- Keep presentation requests structured; transcript prose is not a UI
  command.
- Reuse the `declare_artifact` / Core artifact pipeline as the durable
  source of truth.
- Give the Artifact Canvas its own pane-local top bar and controls,
  independent of the chat top bar and sidebar.
- Establish a safe iframe policy before live preview work starts.
- Allow other product surfaces (Cats Work, Cats Chat) to mount the same
  canvas pane against the same artifact through a shared URL convention
  without re-implementing the safety policy.

## Non-Goals

- Starting or supervising local preview servers.
- Letting providers or assistants emit raw iframe HTML.
- Adding a new Core record family for canvas focus (handled by ADR-098:
  visible state lives in URL, audit lives in Activity, no new family).
- Storing visible canvas state on `CoreTaskRecord.metadata` or any
  per-product `metadata` field (this was ADR-097's choice and is
  superseded by ADR-098).
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

1. Each product surface that opts in shall register a nested child route
   under its own route tree at the path segment
   `/canvas/:artifactId[/view/:presentation]`, so that any of the
   following compose into one URL the user can share, bookmark, and
   navigate:
   - `/code/tasks/:taskId/canvas/:artifactId`
   - `/code/tasks/:taskId/canvas/:artifactId/view/iframe`
   - `/code/codespaces/:codespaceId/canvas/:artifactId`
   - `/work/items/:itemId/canvas/:artifactId`
   - `/work/projects/:projectId/canvas/:artifactId`
   - `/work/tasks/:taskId/canvas/:artifactId`
   - `/chat/conversations/:convId/canvas/:artifactId`
   The canvas pane component, viewer registry, and safety policy are
   platform-shared (see FR3); each product only registers the child
   route and supplies its own surrounding chrome on the parent route.
   The optional `/view/:presentation` segment is used only for explicit
   presentation requests (`iframe` / `image` / `pdf` / `code`). Absence
   of that segment means `presentation = 'auto'`. Query string is not
   used for presentation identity.
2. The Artifact Canvas pane shall mount only when the URL contains a
   `/canvas/:artifactId` segment under the active product surface route.
   When the URL has no such segment, no pane is mounted.
3. Phase 1 visible canvas state lives in the URL **only**. The server
   stores no "current focus" record. The
   `CoreTaskRecord.metadata.codeCanvasFocus` storage location proposed
   by the earlier draft is no longer used; ADR-097 is superseded by
   ADR-098.
4. The canvas pane component, viewer registry, route registry, scheme allowlist,
   runtime preview origin allowlist, scripted preview producer
   allowlist, credential URL hard-reject, hostname normalization,
   `policyVersion` canonicalization, and the iframe sandbox profile
   selection algorithm shall all live as **platform-shared code**
   under `src/products/shared/renderer/` (or `src/design/`); they are
   not Code-product-private. The platform exposes a
   `withSharedViewerRoutes(parent: RouteObject): RouteObject` helper
   so each product registers the child route in a single line, and a
   `CanvasSurfaceRouteRegistry` that composes and parses parent URLs,
   canvas URLs, and projection API URLs for `(surfaceKind, surfaceId)`.
5. The artifact addressed by `:artifactId` must resolve to a
   materialized `CoreArtifactRecord`. The server projection endpoint is
   surface-scoped; it receives `(surfaceKind, surfaceId,
   artifactId, presentationRequested)` and validates that the artifact
   is anchored to that surface before returning the resolved
   `iframeSandboxProfile`, `policyVersion`, and the artifact metadata
   the viewer needs.
6. Assistant-driven focus shall be accepted only through the
   `show_in_canvas` runtime tool, or through a product-internal
   delegate that applies the same validation. The tool's effect is
   **not** to write any product `metadata` field; instead it (a)
   records an Activity entry of kind
   `artifact_canvas_show_intent` (audit), and (b) pushes an
   `ArtifactCanvasNavigateIntent` over the platform render-intent
   stream carrying the target URL. The render-intent stream uses the
   same app push transport as ADR-075 but is not an ADR-075
   entity-state patch. The renderer subscribes for the active surface,
   responds by calling `navigate(targetUrl)`, and acknowledges through
   `POST /api/canvas/intents/ack` with `{ intentId }` after route commit.
7. The pane shall expose two distinct user controls with different
   semantics:
   - **Close (X)**: renderer-only `navigate()` that pops the
     `/canvas/:artifactId` segment from the URL (keeping the parent
     surface). It does **not** call any server endpoint and does
     **not** require an Activity entry. Reload preserves the
     URL-without-canvas state naturally.
   - **Collapse / expand**: renderer-only ephemeral toggle that hides
     the pane chrome without changing the URL. It is local UI state
     only (`useState` and / or `localStorage`) and does not survive
     deep-link reloads of a fresh URL — i.e. opening a
     `/canvas/:artifactId` URL in a new tab always shows the pane
     expanded by default.
8. `show_in_canvas` shall accept exactly one identity:
   - `artifactId`
   - `declarationId`
9. `declarationId` shall resolve only against accepted `declare_artifact`
   results recorded in the Code assistant-effect processor's per-turn
   declaration index for the **current** assistant turn. The index shall be
   keyed by `(turnId, producerKey, scopeKey, declarationId)`, derived
   from SPEC-092's frozen idempotency components plus `turnId`.
   - `producerKey = "<producerKind>:<producerIdentity>"` where
     `producerKind` and `producerIdentity` are the SPEC-092 idempotency
     fields stored under
     `CoreArtifactRecord.metadata.codeArtifactDeclaration.idempotency`.
     `producerKind` is one of `agent` / `tool` / `system` / `user`;
     `producerIdentity` is the SPEC-092 encoded identity string
     (`actor:<id>` for `agent` / `user`, `tool:<name>` for `tool`,
     `system:<detector>` for `system`). Examples:
     `agent:actor:actor-abc`, `tool:tool:declare_artifact`,
     `system:system:patch-bundle-detector`, `user:actor:owner-id`.
     One string field synthesized from SPEC-092's two stored fields;
     consumers shall not recover the fields by naive two-part colon
     splitting. The key does NOT include `runtimeSessionId` (that's
     scope, not identity).
   - `scopeKey = "<scopeKind>:<scopeId>"` where `scopeKind` is the
     SPEC-092 frozen `scopeKind` (one of `run` / `runtime` /
     `conversation` / `workspace` — SPEC-092 does NOT define a `task`
     scope kind, and the canvas does not introduce one) and `scopeId`
     is the corresponding frozen `scopeId`. Examples:
     `runtime:sess-abc`, `run:run-xyz`, `conversation:conv-1`,
     `workspace:ws-1`. One string field; this carries the
     `runtimeSessionId` (when `scopeKind = 'runtime'`) and other scope
     disambiguation. Without it, the same actor or tool spanning
     multiple runtime sessions in one turn would collide.
10. `declarationId` resolution shall be **same-caller-only**: both the
    `producerKey` and the `scopeKey` used for lookup are the
    `show_in_canvas` caller's own resolved producer identity and active
    scope, not fields on the input. Cross-producer references (e.g. an
    agent requesting presentation of a `tool:`-declared artifact via
    `declarationId`) shall reject with
    `artifact_canvas_declaration_producer_mismatch`; cross-scope
    references shall reject with `artifact_canvas_declaration_unknown`
    (the entry simply does not exist under the caller's scope key).
    Callers that need to present a foreign-producer or foreign-scope
    declaration shall pass `artifactId` instead, after the materialized
    artifact is available.
11. The per-turn declaration index is **same-turn-only**; the processor
    does not consult any cross-turn history. A `declarationId` that does
    not appear in the current turn's index under the caller's
    `(producerKey, scopeKey)` pair is rejected with
    `artifact_canvas_declaration_unknown` regardless of whether a prior
    turn happened to accept the same id. There is no separate cross-turn
    rejection path because the processor cannot — and intentionally does
    not — see across turn boundaries.
11b. **Duplicate handling within one key**: when the processor observes
    multiple accepted `declare_artifact` results sharing the same
    `(turnId, producerKey, scopeKey, declarationId)`, SPEC-092
    idempotency guarantees they all resolve to the **same** materialized
    `artifactId` (frozen scope). The canvas index records only the
    `artifactId`; repeated accepts are no-ops. If the processor ever
    observes the same key paired with a **different** `artifactId`
    (which would indicate a SPEC-092 invariant violation upstream), the
    `show_in_canvas` call for that id shall reject with
    `artifact_canvas_declaration_collision` and no navigate-intent
    shall be pushed.
12. `artifactId` shall resolve only to a canvas-eligible artifact that
    is compatible with the calling product's surface context (Code task /
    Code codespace for Code; Work item / project / task for Work;
    conversation for Chat).
13. `show_in_canvas` shall require an active product surface (Code
    task, Work item, etc.) for the caller; calls without such an active
    surface shall reject with `artifact_canvas_no_active_surface` and
    shall not record audit or push intent.
14. `show_in_canvas` shall accept `presentation = 'auto' | 'iframe' | 'image' |
    'pdf' | 'code'` only; `'unsupported'` is **never** a valid input — it is
    a server-resolved output state. Phase 1 resolution rules are explicit:
    - `presentation: 'auto'` may resolve to any of `iframe`, `image`, `pdf`,
      `code`, or `unsupported`. When the artifact has no safe inline target,
      `auto` accepts and the navigate-intent target is the metadata-only
      `unsupported` pane.
    - Explicit `'iframe'`, `'image'`, `'pdf'`, or `'code'` requests against
      an artifact that cannot be served as that family **reject** with
      `artifact_canvas_presentation_unsupported` and no navigate-intent is
      pushed. They do not silently downgrade.
    - Phase 1 implements all viewer-shaped presentations through the
      shared iframe viewer using a content-appropriate sandbox profile
      (see §Iframe Policy); Phase 2 splits image / pdf / code into
      dedicated viewers without changing the tool surface.
15. `clear_canvas` shall push a navigate-intent that pops the
    `/canvas/:artifactId` child route from the caller's current URL.
    It records the corresponding Activity audit entry of kind
    `artifact_canvas_clear_intent`. It does NOT mutate any product
    `metadata`.
16. The renderer shall ignore transcript prose, markdown links, and JSON-looking
    snippets as canvas commands. The only renderer-side mutation paths
    for canvas state are: (a) reacting to navigate-intent from the
    server push channel, (b) explicit user actions (close button →
    `navigate()` to drop the segment; clicking a sidebar item →
    `navigate()` to a new artifact id).
17. The pane top bar shall show artifact title, resolved presentation,
    status, close, collapse/expand, refresh, and open-external controls
    when supported. Top-bar styling and layout follow the platform
    `channelTopBar` / pane-local pattern (see CLAUDE.md §Canvas Top Bar
    Edge Alignment).
18. The first viewer shall render only server-approved iframe preview targets.
19. The renderer shall re-validate the resolved URL scheme and the
    server-emitted iframe sandbox profile before mounting the viewer; a
    mismatch or rejected scheme shall fall back to the metadata / external-link
    state without mounting the iframe.
20. The Artifacts sidebar and artifact detail route shall continue to
    work as before. Sidebar clicks on an artifact navigate the surface
    to the corresponding `/canvas/:artifactId` child route — they do
    not require server tool calls because user-driven navigation is
    URL-only.
21. Accepted / rejected canvas tool results shall be projected into the
    persisted assistant turn, matching the `declare_artifact` trace
    pattern. The `artifact_canvas_show_intent` / `artifact_canvas_clear_intent`
    Activity records are the durable audit trail; the projected tool
    result is the synchronous acknowledgement to the assistant.

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

### Canvas URL Schema and Server Projection

Phase 1 stores **no** "current focus" record. The visible canvas state
is the URL. The server is the authority for safety policy resolution
and for assistant-driven navigate-intent.

#### URL schema and route registry

The shared child route segment is
`/canvas/:artifactId[/view/:presentation]`, mounted under each opted-in
product surface route. `:artifactId` is the Core artifact id.
`:presentation`, when present, is one of `iframe` / `image` / `pdf` /
`code` and represents an explicit presentation request. Absence of the
`/view/:presentation` segment means `presentationRequested = 'auto'`.

All products compose these routes through one platform registry:

```ts
type CanvasSurfaceKind =
  | 'code_task'
  | 'code_codespace'
  | 'work_item'
  | 'work_project'
  | 'work_task'
  | 'chat_conversation';

interface CanvasSurfaceRef {
  surfaceKind: CanvasSurfaceKind;
  surfaceId: string;
}

type CanvasPresentationRequested = 'auto' | 'iframe' | 'image' | 'pdf' | 'code';

type CanvasUrlParse =
  | {
      kind: 'canvas';
      surface: CanvasSurfaceRef;
      artifactId: string;
      presentationRequested: CanvasPresentationRequested;
    }
  | {
      kind: 'parent';
      surface: CanvasSurfaceRef;
    }
  | null;

interface CanvasSurfaceRouteRegistry {
  parentUrl(surface: CanvasSurfaceRef): string;
  canvasUrl(
    surface: CanvasSurfaceRef,
    artifactId: string,
    presentationRequested?: CanvasPresentationRequested,
  ): string;
  projectionApiUrl(
    surface: CanvasSurfaceRef,
    artifactId: string,
    presentationRequested?: CanvasPresentationRequested,
  ): string;
  parse(url: string): CanvasUrlParse;
}
```

`CanvasSurfaceRouteRegistry` is the only code allowed to compose or
parse canvas URLs. Products do not hand-build `targetUrl`, and the
server projection does not infer surface context from only
`:artifactId`. The registry must be symmetric:
`parse(canvasUrl(surface, artifactId, presentation)).presentationRequested`
must equal the requested presentation, and `auto` must round-trip as
the shorter `/canvas/:artifactId` URL without a `/view/auto` segment.

#### Server projection (read on every URL hit)

The renderer extracts the surface and artifact route params and asks a
surface-scoped projection endpoint:

```text
GET /api/canvas/:surfaceKind/:surfaceId/artifacts/:artifactId
GET /api/canvas/:surfaceKind/:surfaceId/artifacts/:artifactId/view/:presentation
```

The second form is used only for explicit `iframe` / `image` / `pdf` /
`code`; `auto` is represented by the first form.

```ts
interface ArtifactCanvasProjection {
  schemaVersion: '1.0';
  surface: CanvasSurfaceRef;
  artifactId: string;
  artifact: {
    id: string;
    title: string;
    kind: CoreArtifactKind;
    status: CoreArtifactStatus;
    summary: string | null;
    location: { kind: CoreArtifactLocationKind; value: string | null };
  };
  // Presentation requested by the URL. No /view segment means auto.
  presentationRequested: CanvasPresentationRequested;
  // Server's resolved presentation. Explicit URL requests that cannot
  // be served return artifact_canvas_presentation_unsupported instead
  // of silently downgrading. Auto may resolve to unsupported.
  presentationResolved: 'iframe' | 'image' | 'pdf' | 'code' | 'unsupported';
  iframeSandboxProfile: 'static' | 'scripted-cross-origin' | null;
  safeUrl: string | null;
  externalUrl: string | null;
  // Server-projected text for inline_summary artifacts. Server-served
  // text/code URL artifacts use safeUrl and let the renderer fetch text.
  textContent: string | null;
  // Identifier for the iframe-policy snapshot under which
  // iframeSandboxProfile was decided. Lower-case hex string, first 16
  // chars of SHA-256 over the canonicalized policy tuple (see §Policy
  // Version Canonicalization). Null when iframeSandboxProfile is null.
  policyVersion: string | null;
  // What the server cannot serve gets its own non-2xx error code (see
  // §Error Code Registry); the projection response in that case
  // contains only the error.
}
```

The projection is read-only and idempotent. Reading it does not write
any record. URLs that reference an unknown / non-canvas-eligible /
unanchored artifact return the corresponding 4xx error from the
projection endpoint, and the renderer shows the error pane. The
`artifact_canvas_artifact_not_anchored` check is evaluated against the
surface params passed to the projection endpoint, not against whichever
surface happens to be active in the client.

#### Server-pushed render-intent (assistant tool effect)

When `show_in_canvas` is accepted, the server publishes an
`ArtifactCanvasNavigateIntent` to the platform render-intent stream
keyed by the caller's surface:

```ts
interface ArtifactCanvasNavigateIntent {
  kind: 'artifact_canvas_navigate_intent';
  // Server-generated unguessable secret (>=128 bits of entropy,
  // base64url-encoded). Treated as a capability token: knowing
  // intentId is sufficient to ack the intent. Therefore intentId
  // MUST NOT appear in any artifact-visible surface — Activity
  // metadata, projection responses, transcript tool results, URL
  // paths, log lines indexed alongside conversations, etc. Use
  // activityId for anything user-visible / cross-actor; keep intentId
  // on the push connection and the ack request body only.
  intentId: string;
  // Stable Activity record id for audit / transcript correlation.
  // This IS the public correlation handle and may appear anywhere.
  activityId: string;
  surface: CanvasSurfaceRef;
  // The full nested-route path the renderer should navigate to. Server
  // composes this through CanvasSurfaceRouteRegistry.
  targetUrl: string;
  // Mirror of the projection fields, included so the renderer can
  // optimistically render before fetching the projection.
  artifactId: string;
  presentationRequested: CanvasPresentationRequested;
  presentationResolved: 'iframe' | 'image' | 'pdf' | 'code' | 'unsupported';
  iframeSandboxProfile: 'static' | 'scripted-cross-origin' | null;
  policyVersion: string | null;
  // Caller identity for the renderer to display "the agent moved your
  // canvas to X" affordance if desired (Phase 2).
  triggeredBy: { kind: 'agent' | 'user' | 'system'; actorId: string | null };
  triggeredAt: string;
}
```

This stream uses the same app push transport as ADR-075, but it is not
an ADR-075 entity snapshot and must not be implemented as a generic
`subscribeEntity` patch. It is a short-lived render intent:

- the server writes the Activity record first and uses the Activity id
  as `activityId`;
- the renderer opens a render-intent subscription for exactly the
  currently mounted `CanvasSurfaceRef`; the server delivers only to
  matching active subscriptions;
- the renderer acknowledges by `intentId` only after route commit
  confirms `CanvasSurfaceRouteRegistry.parse(currentUrl)` is a
  `kind: 'canvas'` entry matching the intent's `surface`, `artifactId`,
  and `presentationRequested`;
- the server may replay an unacknowledged intent only for the same
  focused surface and only while the intent TTL is live (Phase 1 TTL:
  30 seconds);
- unfocused intents must not be queued for later automatic navigation.
  They remain visible through Activity audit / transcript tool result,
  but remounting a surface later must not surprise-navigate the user.

##### Render-Intent Stream Protocol

Phase 1 uses the existing app push transport for server-to-renderer
delivery. Because that transport is server-to-renderer, acknowledgements
are a separate HTTP call:

```text
POST /api/canvas/intents/ack
Content-Type: application/json

{ "intentId": "<server-generated capability token>" }
```

If a future bidirectional transport replaces the stream, it may carry an
equivalent `{ kind: 'artifact_canvas_intent_ack', intentId }` frame, but
the acknowledgement semantics (and authorization rules) stay the same.

###### intentId-as-capability and ack authorization

`intentId` is a capability token, not a public id:

- the server generates `intentId` with at least 128 bits of entropy,
  base64url-encoded, and never replays the same value across intents;
- `intentId` MUST NOT appear in: the Activity record body, the
  projection response, transcript tool results, render-intent
  subscriber broadcasts other than the targeted subscriber, or any
  log line indexed alongside cross-actor data. Audit / transcript
  correlation uses `activityId`, which is stable and public;
- `intentId` flows on exactly two paths: from server out to the
  targeted subscriber's push connection, and from that subscriber back
  in the JSON body of `POST /api/canvas/intents/ack`. It is never placed
  in the URL path or query string. Ack handlers, access logs, telemetry,
  and error logs must redact request bodies for this endpoint or log
  only `activityId` / fixed status fields.

The ack endpoint requires authorization:

- the request MUST carry the same session credentials (cookie / auth
  header) the renderer used to open the render-intent subscription;
- the server resolves the request's session, looks up the pending
  intent by `intentId`, and returns the same fixed `200 OK` response
  when the intent is unknown, expired, already acked, or owned by a
  different session. Unauthorized callers never receive a distinct
  status, body, header, or timing signal that proves whether an
  `intentId` exists;
- session-bound auth means an attacker who scrapes `intentId` from a
  log file or memory dump still cannot ack it from another session.

###### Server-side ack idempotency

The ack endpoint is idempotent by design — renderers retry under
network failure and the server must not let "ack already received" or
"intent already TTL-expired" look like a hard failure:

- first ack for a live intent: server marks intent as acked, drops it
  from the replay queue, returns `200 OK` with the fixed body
  `{ "status": "ok" }`;
- second-and-later ack for the same `intentId` (already acked or
  TTL-expired): server returns the exact same `200 OK` fixed body. The
  renderer cannot tell the difference and does not need to;
- ack for an unknown / never-issued `intentId`: returns `200 OK` with
  the exact same fixed body. This is intentional — combined with
  session-bound auth, this prevents probing for valid `intentId` values;
  an unauthorized caller never sees a `404`, `403`, or alternate body
  distinguishable from a normal accept.

###### Renderer ack retry policy

Renderer ack delivery is best-effort. The protocol guarantees the URL
is correct after navigate; the ack is purely a hint that lets the
server stop replaying:

- after route commit, the renderer POSTs the ack;
- on transport failure (network error, 5xx), the renderer retries up
  to 3 times with exponential backoff (250 ms, 500 ms, 1 s), capped
  at 15 seconds total wall time (TTL/2);
- on retry exhaustion, the renderer gives up. It does NOT re-navigate
  — the URL is already correct, and the worst case is one duplicate
  push from the server within TTL, which the renderer also
  treats idempotently (no-op navigate, ack again);
- on `200` response, the renderer stops retrying immediately. There
  is no need to confirm "really acked" because the server's ack
  endpoint is idempotent.

###### Other protocol invariants

- server creates `intentId`, writes the Activity record, and starts a
  30-second TTL window at `triggeredAt`;
- server sends an intent only to render-intent subscribers whose
  subscribed `CanvasSurfaceRef` equals the intent surface. No subscriber
  means no automatic delivery and no later queue;
- if the push connection reconnects while the same surface is still
  subscribed and the TTL has not expired, the server may replay any
  unacknowledged intent for that surface;
- after TTL expiry, the server drops the pending intent regardless of
  acknowledgement state. The Activity audit remains durable;
- renderer handling is idempotent by `intentId`. A duplicate intent for
  the same `targetUrl` may call `navigate(targetUrl)` again; React
  Router should treat that as a no-op if already there. The renderer
  still sends / repeats the ack after the route is committed;
- `targetUrl`, `presentationRequested`, and `artifactId` must agree:
  `CanvasSurfaceRouteRegistry.parse(targetUrl)` must produce
  `{ kind: 'canvas', surface, artifactId, presentationRequested }`
  equal to the fields in the intent. If not, the server must reject
  before publishing the intent.

#### Audit (server-side Activity record)

Each accepted `show_in_canvas` writes one Activity record:

```ts
type CanvasSurfaceAnchorSource =
  | 'taskId'
  | 'workItemId'
  | 'projectId'
  | 'conversationId'
  | 'metadata';

{
  kind: 'artifact_canvas_show_intent',
  artifactId,
  conversationId, taskId, runId, projectId, workItemId, // anchors per ADR-081
  metadata: {
    surfaceKind,
    surfaceId,
    surfaceAnchorSource, // typed CanvasSurfaceAnchorSource
    presentationRequested,
    presentationResolved,
    iframeSandboxProfile,
    policyVersion,
    targetUrl,
    triggeredBy: { kind, actorId, runtimeSessionId, toolCallId },
  }
}
```

`CanvasSurfaceAnchorSource` is exported from
`src/products/shared/artifactCanvas/contracts.ts` so server writers
and projection / activity readers reference one canonical union
instead of free strings.

`clear_canvas` writes a sibling `artifact_canvas_clear_intent` Activity
record. These records are the durable audit trail. They are not the
visible state. Implementation must add these Activity kinds to
`CoreActivityKind` in `src/core/types.ts` and include them in any
Activity filters / projections that enumerate known kinds.

Activity top-level anchors are the source of truth for surfaces backed
by Core anchor fields:

| `surfaceKind` | Top-level Activity anchor source | `surfaceAnchorSource` |
|---------------|----------------------------------|------------------------|
| `code_task` | `taskId` | `'taskId'` |
| `work_task` | `taskId` | `'taskId'` |
| `work_item` | `workItemId` | `'workItemId'` |
| `work_project` | `projectId` | `'projectId'` |
| `chat_conversation` | `conversationId` | `'conversationId'` |
| `code_codespace` | `metadata.surfaceId` | `'metadata'` |

`metadata.surfaceKind`, `metadata.surfaceId`, and
`metadata.surfaceAnchorSource` are derived audit convenience fields.
For Core-anchor-backed surfaces, writers must derive
`metadata.surfaceId` and `metadata.surfaceAnchorSource` from the
top-level anchor and reject / fail fast before write if the derived
surface identity disagrees with the top-level anchor. Readers resolving
an identity conflict must trust the top-level Activity anchor over
metadata.

`metadata.surfaceKind` is different for task-backed surfaces:
`code_task` vs `work_task` is stamped from the referenced
`CoreTaskRecord`'s product binding at Activity write time. That value
is a historical audit snapshot, not a re-derived live projection. A
later task-binding change can make the current task surface differ from
the recorded `metadata.surfaceKind`; readers must not treat that as a
metadata/top-level-anchor conflict because the top-level `taskId`
cannot encode historical product binding.

The only Phase 1 exception is `code_codespace`, which has no top-level
Core Activity anchor field; there `metadata.surfaceId` is authoritative
and `surfaceAnchorSource` is `'metadata'`.

###### Historical-snapshot rule for `metadata.surfaceKind`

`CoreTaskRecord.productBinding` can change after the Activity record is
written (see terminology.md tenth-round follow-up: chat-originated
tasks may later be promoted to a Code or Work binding through draft
activation). The recorded `metadata.surfaceKind` is a **historical
snapshot** of the binding at write time and is never retroactively
rewritten:

- Writers stamp `metadata.surfaceKind` from the task's binding at the
  moment of the Activity write.
- Readers who only need a stable audit value (e.g. "what surface did
  the assistant ask the user to navigate to?") use the recorded
  `metadata.surfaceKind` directly.
- Readers who need the **current** surfaceKind for the same anchored
  task (e.g. for a "go to current canvas for this task" affordance)
  must re-derive from the anchored task's current `productBinding` and
  may produce a different value than the historical metadata.

Backfill / migration code that updates Activity records in bulk MUST
NOT touch existing `metadata.surfaceKind`; the historical value is
preserved by definition.

###### Future anchor-less canvas surfaces

`code_codespace` is the only Phase 1 surface that goes
metadata-authoritative because Core Activity has no codespace anchor
field. When future canvas surfaces appear without a corresponding
top-level Activity anchor, the order of preference is:

1. **Add a new top-level Activity anchor** in
   `CoreActivityRecord` (as a sibling to `taskId` / `workItemId` /
   `projectId` / `conversationId`) under ADR-081's Materialization-tier
   guidance, and use it as the anchor source. This is the strongly
   preferred path for any surface that has a stable Core record family
   it can point at.
2. **Fall back to metadata-authoritative** (`surfaceAnchorSource =
   'metadata'`) only when (a) the surface is genuinely not first-class
   in Core (e.g. a transient projection-only entity), and (b) the
   trade-off has been documented in a follow-up ADR. The downside of
   this path is weaker audit query — you cannot fan out queries on the
   anchor field — and it should only be accepted when option 1 is not
   appropriate.

Adding a new metadata-authoritative surface without an ADR is not
allowed, even when it would be technically simpler than extending Core.

#### Notes on policy and authority

`iframeSandboxProfile` is non-null only when `presentationResolved` is
one of `iframe`, `image`, or `pdf`; for `code` and `unsupported` it
shall be `null`. The server is the authority that picks the profile
(see §Iframe Policy); the renderer shall not upgrade a `static` profile
to `scripted-cross-origin`.

`policyVersion` is the cross-time staleness guard. Because the
projection is computed on each URL hit, it is naturally always under
the current `policyVersion`. The persisted Activity records carry the
`policyVersion` that applied when the assistant requested the canvas;
those serve as audit evidence ("at the time of the request, this
profile was applicable"). The renderer trusts whatever the projection
says now.

The storage location for visible canvas state is the URL.
`CoreTaskRecord.metadata.codeCanvasFocus` and any sibling per-product
`metadata` field shall NOT be used for this. ADR-097 is superseded by
[ADR-098](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md);
the migration path described here reflects that supersede.

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
- `presentation` defaults to `auto`. `'unsupported'` is not accepted as an
  input value;
- `declarationId` resolves through the per-turn declaration index keyed by
  `(turnId, producerKey, scopeKey, declarationId)` — the SPEC-092
  idempotency components plus `turnId`. Both `producerKey` and `scopeKey`
  are taken from the caller's own resolved producer identity and active
  scope, not from the input. Misses reject with
  `artifact_canvas_declaration_unknown`. A same-turn entry under a
  different producer rejects with
  `artifact_canvas_declaration_producer_mismatch`. Multiple accepted
  declarations at the same key must all resolve to the same materialized
  `artifactId` (SPEC-092 idempotency); a key paired with a conflicting
  `artifactId` rejects with `artifact_canvas_declaration_collision`;
- resolved artifact must exist and be canvas-eligible;
- the resolved artifact URL (when any) must contain no embedded credentials
  (`user:pass@host` syntax). Credential URLs hard-reject with
  `artifact_canvas_url_credentials_not_allowed`; they shall not appear in
  the iframe `src`, `open-external` href, or any other surface;
- resolved artifact must be anchored to the active surface from
  `CanvasSurfaceRef` according to the same anchor rules used by
  SPEC-092. The server validates this from the surface-scoped
  projection / tool context, not from client-only route state;
- the caller must be the active Code assistant/session or the authenticated
  owner user;
- the caller's surface must be an active product surface (Code task,
  Code codespace, Work item, Work project, Work task, or Chat conversation
  depending on the calling product); calls with no active surface are
  rejected with `artifact_canvas_no_active_surface`;
- explicit non-`auto` presentation requests that cannot be served against
  the artifact are rejected with `artifact_canvas_presentation_unsupported`;
- accepted explicit non-`auto` presentation requests compose a `targetUrl`
  with `/view/:presentation`; accepted `auto` requests compose the shorter
  `/canvas/:artifactId` URL;
- `presentation: 'auto'` requests that find no safe inline target are
  accepted and resolve to `presentationResolved: 'unsupported'`; the
  navigate-intent target is the short `/canvas/:artifactId` URL — the
  pane will mount in metadata-only state because the projection's
  `presentationResolved` is `unsupported`.

Accepted result:

```ts
interface ShowInCanvasAccepted {
  status: 'accepted';
  // Public correlation handle for the Activity audit record. This is
  // safe for transcript / UI surfaces and replaces any temptation to
  // expose intentId.
  activityId: string;
  artifactId: string;
  presentationResolved: 'iframe' | 'image' | 'pdf' | 'code' | 'unsupported';
  iframeSandboxProfile: 'static' | 'scripted-cross-origin' | null;
  policyVersion: string | null;
  // The full URL the renderer was asked to navigate to. Explicit
  // presentation requests use /canvas/:artifactId/view/:presentation.
  // Mirrors the navigate-intent's targetUrl field.
  targetUrl: string;
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

- an active product surface is required; calls without one are
  rejected with `artifact_canvas_no_active_surface`;
- agent callers must come from the active runtime session;
- user callers may clear through the product-internal delegate;
- `clear_canvas` is idempotent: calling it when the caller's URL has
  no `/canvas/:artifactId` segment shall accept (the pushed
  navigate-intent simply navigates to the parent surface URL, which
  is a no-op if already there) and emit no audit churn beyond a
  single `artifact_canvas_clear_intent` Activity record.

Accepted result:

```ts
interface ClearCanvasAccepted {
  status: 'accepted';
  // Public correlation handle for the Activity audit record.
  activityId: string;
  // The URL the renderer was asked to navigate to (the parent surface
  // URL, with the /canvas/:artifactId segment popped). Mirrors the
  // navigate-intent's targetUrl.
  targetUrl: string;
}
```

The legacy `cleared: true` boolean from the prior draft is removed —
"cleared" is no longer a meaningful flag because there is no stored
focus to clear; the only outcome is "renderer was asked to navigate".

### Presentation Resolution

`presentation = 'auto'` resolves from server-normalized artifact metadata.
Phase 1 routes all viewer-shaped presentations through the iframe viewer, but
selects the sandbox profile (see §Iframe Policy) per content type so that
static media never receives `allow-scripts`.

| Artifact signal | Current `presentationResolved` | `iframeSandboxProfile` |
|-----------------|--------------------------------|------------------------|
| `kind = 'preview'` and URL passes scheme + runtime-preview-origin allowlist (and other §Iframe Policy conditions) | `iframe` | `scripted-cross-origin` |
| `kind = 'preview'` and URL passes scheme but fails the origin allowlist | `iframe` (silently demoted) | `static` |
| URL path ending in a known image extension and URL passes scheme | `image` | `static` |
| URL path ending in `.pdf` and URL passes scheme | `pdf` | `static` |
| `location.kind = 'inline_summary'` or text/code mime type | `code` | `null` |
| URL fails scheme allowlist | rejected with `artifact_canvas_iframe_scheme_rejected` | n/a |
| no safe inline target (and `presentation: 'auto'`) | `unsupported` | `null` |

`unsupported` is a valid resolved state. It opens a pane with artifact metadata
and external-open/download affordances rather than embedding unsafe content.
The Phase 2 dedicated `image`, `pdf`, and `code` viewers replace the iframe
fallback for media presentations without changing tool inputs or accepted
results.

## Iframe Policy

Phase 1 iframe rendering shall obey all of these rules.

### URL Scheme Allowlist

- allowed URL schemes: absolute `http:` / `https:`, and app-served relative
  URLs (paths beginning with `/`);
- rejected URL schemes: `file:`, `javascript:`, `data:`, `blob:`, raw local
  filesystem paths, and any URL whose scheme cannot be parsed;
- the existing `normalizePreviewSurfaceUrl` helper enforces only this
  syntactic gate — it is **not** a security classifier. Origin / port /
  producer / session checks are layered on top of it (see §Runtime Preview
  Origin Allowlist below);
- the renderer shall re-check the scheme of the projected URL before
  embedding (defense in depth);
- a request that fails the scheme allowlist is **rejected** with
  `artifact_canvas_iframe_scheme_rejected` and never falls back to a less
  permissive sandbox profile.

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

### Credential URLs (Hard Reject)

Before any sandbox or origin reasoning, the server shall reject URLs that
embed credentials (`user:pass@host` syntax) with
`artifact_canvas_url_credentials_not_allowed`. This is **not** a demote — a
credential-bearing URL must not appear in iframe `src`, in the
open-external href, or anywhere else the renderer can surface to the user.
This mirrors SPEC-092's `artifact_url_credentials_not_allowed` at the
declaration boundary; the canvas re-applies the rule because URLs may
arrive through `external_ref` resolution or legacy artifacts.

### Runtime Preview Origin Allowlist

`scripted-cross-origin` requires `allow-scripts` + `allow-same-origin`,
which is the riskier combination. It must not be granted just because a URL
"isn't the Cats shell origin" — that would let any external `https://...`
artifact escalate. The eligibility test is therefore an **explicit
allowlist** of origins that the platform recognizes as runtime-owned
preview hosts, paired with a **producer-eligibility gate** so an agent
cannot synthesize a preview-script-eligible artifact by just calling
`declare_artifact` with a loopback URL.

Phase 1 allowlist config schema (flat array, no wrapper):

```ts
interface ArtifactCanvasRuntimePreviewOriginEntry {
  // Required. Compared against the URL's normalized host (see Hostname
  // Normalization below). Exact string match only — no wildcards in the
  // hostname segment. For IPv6, write the address WITHOUT enclosing
  // brackets, e.g. '::1' not '[::1]'. Operators are responsible for
  // listing the form Node's WHATWG URL parser canonicalizes to: write
  // '::1', not '0:0:0:0:0:0:0:1' (Node canonicalizes inputs of the
  // latter form to '::1').
  hostname: string;

  // Optional. Default ['http']. Matches URL.protocol minus the trailing
  // colon. The renderer also asserts the same set during defense-in-depth.
  schemes?: ('http' | 'https')[];

  // Optional. Default '*' (any port). When a number array is supplied, the
  // URL's effective port must equal one of the entries' values. The
  // effective port is URL.port parsed as a number, or the scheme default
  // (80 for http:, 443 for https:) when URL.port is the empty string.
  ports?: number[] | '*';
}

// artifactCanvas.runtimePreviewOriginAllowlist is THE flat array; no wrapper.
type ArtifactCanvasRuntimePreviewOriginAllowlist =
  ArtifactCanvasRuntimePreviewOriginEntry[];
```

Phase 1 default value:

```ts
[
  { hostname: '127.0.0.1', schemes: ['http'], ports: '*' },
  { hostname: '::1',       schemes: ['http'], ports: '*' },
  { hostname: 'localhost', schemes: ['http'], ports: '*' },
]
```

Operators may extend the array through
`artifactCanvas.runtimePreviewOriginAllowlist` to add LAN dev hostnames; they
may also tighten `ports` to a finite list per host. The list is **not** an
origin-string list — it is a structured schema, parsed and validated at
server boot. Boot-time validation rejects entries with empty hostname,
unknown schemes, or non-positive port numbers.

#### Hostname Normalization

Node's WHATWG `URL` parser does **not** strip the brackets from IPv6
hostnames: `new URL('http://[::1]:5173').hostname` returns `'[::1]'`,
including brackets. The matcher therefore must normalize **both** sides
(URL and entry) before comparison:

1. lower-case the string;
2. if the result starts with `'['` and ends with `']'`, remove those two
   characters (this is how IPv6 brackets get stripped — Node does not do
   it for us);
3. compare for exact string equality.

Node's URL parser **does** canonicalize IPv6 numeric form (so
`new URL('http://[0:0:0:0:0:0:0:1]/').hostname` already returns `'[::1]'`
before bracket stripping). Operators therefore only need to list the
canonical short form (`::1`); they do not need to enumerate every
equivalent textual representation.

URL matching algorithm (**server-only** — the renderer does NOT run this;
it lives on the server and the renderer trusts the resulting
`iframeSandboxProfile`):

1. parse the URL with the standard `URL` constructor; on parse error,
   reject the call as scheme-allowlist failure;
2. apply Hostname Normalization to `URL.hostname`;
3. for each entry, apply Hostname Normalization to `entry.hostname`, then
   compare for exact string equality. Skip non-matching entries;
4. if `URL.protocol.replace(/:$/, '')` is not in
   `entry.schemes ?? ['http']`, skip;
5. if `entry.ports ?? '*'` is `'*'`, accept any port; otherwise compute
   the effective port (`Number(URL.port) || (scheme === 'https' ? 443 : 80)`)
   and require membership in `entry.ports`;
6. an entry matches when host + scheme + port all pass; the URL matches
   the allowlist when **any** entry matches.

#### Scripted Preview Producer Allowlist (Phase 1)

The previous "all `tool` / `system` producers qualify" gate was too wide
— not every tool that can call `declare_artifact` is a preview-origin
owner. Phase 1 replaces it with an explicit named producer allowlist:

```ts
interface ArtifactCanvasScriptedPreviewProducerEntry {
  // 'tool' | 'system' | 'user'. 'agent' is intentionally absent — agent
  // producers are never eligible for scripted-cross-origin in Phase 1
  // regardless of allowlist membership. Matched against the SPEC-092
  // `producerKind` idempotency field stored under
  // CoreArtifactRecord.metadata.codeArtifactDeclaration.idempotency.
  producerKind: 'tool' | 'system' | 'user';

  // Matched against the SPEC-092 `producerIdentity` idempotency field
  // (the exact encoded string SPEC-092 stores under
  // CoreArtifactRecord.metadata.codeArtifactDeclaration.idempotency).
  // - For tool entries, this is `tool:<server-resolved-tool-name>`
  //   (e.g. 'tool:cats_runtime_preview_bridge').
  // - For system entries, this is `system:<server-detector-name>`
  //   (e.g. 'system:patch-bundle-detector').
  // - For user entries, this is `actor:<owner-actor-id>`.
  // It is NOT additionally prefixed with `producerKind` — that lives in
  // the sibling field above.
  producerIdentity: string;
}

type ArtifactCanvasScriptedPreviewProducerAllowlist =
  ArtifactCanvasScriptedPreviewProducerEntry[];
```

Phase 1 default value:

```ts
[]
```

The default is **empty**: out of the box, no producer earns
`scripted-cross-origin` and every preview iframe runs under the `static`
profile. Operators must explicitly enumerate the producers they trust
through `artifactCanvas.scriptedPreviewProducerAllowlist`. The Phase 1
rollout (PLAN-090 Task 2.5) decides whether to populate this list with
the specific encoded producer identities behind the existing
builder/artifact preview iframes or to accept the static-only regression
for those surfaces; the SPEC does not bake known producer names in.

Producer-eligibility check:

- if the artifact's frozen `producerKind` (from SPEC-092 idempotency
  metadata) is `'agent'`, the artifact is **never** eligible —
  short-circuit to `static`;
- otherwise, look up the artifact's frozen
  `(producerKind, producerIdentity)` pair in the producer allowlist —
  the same two SPEC-092 fields stored under
  `CoreArtifactRecord.metadata.codeArtifactDeclaration.idempotency`;
- only entries that match `(producerKind, producerIdentity)` exactly are
  eligible for `scripted-cross-origin`.

The server may emit `scripted-cross-origin` only when **all** the following
hold:

1. the URL passed the credential-rejection check above;
2. the URL passes the scheme allowlist as an absolute `http:` / `https:`
   URL (the credential and scheme checks are themselves preconditions to
   getting this far);
3. the URL parses successfully and yields a non-empty hostname;
4. the URL matches the runtime preview origin allowlist per the
   §Hostname Normalization + matching algorithm above;
5. the URL's origin is **not** equal to the Cats shell origin that serves
   the renderer (configured at server boot; in packaged Electron this is
   the app-served origin, in browser dev it is the host serving the
   renderer bundle) — note that with the loopback default this only
   matters when Cats itself is served on a loopback origin;
6. the artifact is `kind = 'preview'`;
7. the artifact's resolved producer matches an entry in the Scripted
   Preview Producer Allowlist (and is not `agent`-kind; agent is
   short-circuited above).

When the credential / scheme checks fail, the server **rejects**. When any
of the remaining conditions (4–7) fails, the server **silently demotes** to
the `static` profile. Demotion is not an error; the assistant gets back
`presentationResolved: 'iframe'` (or whichever family was requested) with
`iframeSandboxProfile: 'static'` and can decide whether the static frame is
useful.

#### Policy Version Canonicalization

`policyVersion` MUST be reproducible across implementations. Two servers
running the same config — or the same server before and after restart —
must produce the identical hash, while any meaningful config change must
produce a different hash. The algorithm:

1. **Normalize each origin allowlist entry** in input order:
   - `hostname`: lower-case the string; if it begins with `[` and ends
     with `]`, strip those two characters (manual IPv6 bracket strip);
   - `schemes`: if `undefined`, default to `['http']`; lower-case each
     value; remove duplicates (preserving first occurrence is fine, but
     the next step re-sorts); sort lexicographically (ASCII order);
   - `ports`: if `undefined`, set to the literal string `'*'`; if it
     is a number array, convert to integers, drop duplicates, then
     sort numerically ascending; if it is the string `'*'`, leave
     untouched.
2. **Sort origin allowlist** entries by the canonical-JSON string of the
   normalized entry (step 7's serializer applied to each entry). The
   comparator is bytewise lexicographic order over the UTF-8 bytes of
   those strings. Implementations MUST NOT use locale-sensitive
   collation such as `localeCompare`; a JavaScript implementation can
   use `Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))`.
3. **Normalize each producer allowlist entry**: keep `producerKind`
   as-is (one of `tool` / `system` / `user`); keep `producerIdentity`
   as-is (case-sensitive, opaque). No defaults to expand.
4. **Sort producer allowlist** entries by `(producerKind, producerIdentity)`
   tuple, comparing each tuple part in bytewise lexicographic order over
   UTF-8 bytes.
5. **Normalize `catsShellOrigin`**:
   - parse as `URL`; reject (treat as a server config error) if parse
     fails or origin is not http(s);
   - take `URL.protocol` minus the trailing `:`, lower-case;
   - apply Hostname Normalization to `URL.hostname`;
   - if `URL.port` is empty or equal to the scheme default
     (`'80'` for http, `'443'` for https), omit the port; otherwise
     include it as `:<port>`;
   - emit `<scheme>://<host>` or `<scheme>://<host>:<port>`.
6. **Compose the canonical object** with these top-level keys, in
   alphabetical order:
   ```
   {
     "catsShellOrigin": <normalized string>,
     "originAllowlist": <sorted normalized array>,
     "producerAllowlist": <sorted normalized array>
   }
   ```
7. **Serialize via canonical JSON**: every object's keys are emitted in
   ASCII-byte ascending order; arrays preserve the canonical sort
   order from steps 2 and 4; no whitespace; numbers as decimal
   integers (no trailing `.0`); strings as standard JSON-escaped UTF-8.
8. **Hash**: SHA-256 over the UTF-8 bytes of the serialized string;
   take the first 16 hex characters in lower case.

Implementation note: a small canonical-JSON helper (sorted-keys recursive
serializer) is the only non-obvious piece. Test vectors shall be checked
into `tests/code-canvas-policy-version.test.tsx` with literal expected
canonical JSON strings and 16-hex hashes, not only equality/difference
assertions. Minimum baseline vectors:

| Vector | Canonical JSON | Hash |
|--------|----------------|------|
| Empty allowlists, shell `http://127.0.0.1:5173` | `{"catsShellOrigin":"http://127.0.0.1:5173","originAllowlist":[],"producerAllowlist":[]}` | `24c20a6275ac4b18` |
| Phase 1 default origin allowlist, empty producer allowlist, shell `http://127.0.0.1:5173` | `{"catsShellOrigin":"http://127.0.0.1:5173","originAllowlist":[{"hostname":"127.0.0.1","ports":"*","schemes":["http"]},{"hostname":"::1","ports":"*","schemes":["http"]},{"hostname":"localhost","ports":"*","schemes":["http"]}],"producerAllowlist":[]}` | `cf7a2fc9e81778ff` |

The test file shall also include reordered-entry and ports-permutation
fixtures that assert the same literal hash as their canonical baseline,
plus a fixture with one extra producer entry that asserts its own literal
hash and differs from the default vector.

#### Policy Version and Renderer Authority Boundary

The server is the authority for both allowlists. The renderer:

- does **not** receive the runtime preview origin allowlist or the
  scripted preview producer allowlist over the projection — operators may
  reasonably treat these as server-only secrets (e.g. internal hostnames),
  and bandwidth is a non-goal;
- does NOT re-run the origin allowlist matcher; it trusts the server's
  `iframeSandboxProfile` decision;
- DOES re-run the cheap, config-free defense-in-depth checks (scheme
  allowlist, profile-name validity, same-origin-with-shell short-circuit
  using `window.location.origin`).

The earlier draft asked the renderer to "mirror the matcher" — that was
overstated. Removing the duplicate-config requirement also removes the
risk of server / renderer config drift.

`policyVersion` in this URL-driven model serves a different purpose
than in the superseded ADR-097 design. There is no stored canvas-focus
record to drift against. Instead, `policyVersion` plays two roles:

- it is included in the read-only canvas projection on every URL hit,
  so the renderer's optimistic-render path (using the navigate-intent
  payload) can be checked against the projection's current version on
  fetch — if they disagree (which only happens when the policy changed
  between push and fetch), the renderer prefers the projection;
- it is recorded on each `artifact_canvas_show_intent` Activity record, so
  audit reviewers can correlate "the assistant requested presentation
  under this policy snapshot" with later policy changes.

There is no stored "stale focus" to demote because canvas focus is the
URL. URL navigation re-fetches the projection, which is always under
the current policy.

### Forward Compatibility: Session-Bound Preview Registry (Phase 3)

The Phase 1 producer-eligibility gate (only `tool` / `system` producers
qualify) and the loopback origin allowlist are intentionally coarse because
Phase 1 has no process supervisor that can witness which URL was bound by
which runtime session. Phase 3 (live `npm start`-style preview substrate,
separate SPEC) shall introduce a session-bound preview registry: the
runtime registers `(sessionId, origin, port)` tuples when it spawns a
preview server, and `scripted-cross-origin` becomes conditional on the
URL's origin matching a tuple registered by the **same runtime session**
that produced the artifact. The producer-eligibility gate then narrows
further: only producers whose runtime session owns the registered origin
qualify. When the registry lands, the Phase 1 producer-kind gate stays as
a deny-list backstop for non-supervised callers.

### Renderer Re-Check

The renderer shall:

- assert the projected `iframeSandboxProfile` is one of the two named
  values; an unknown value falls back to `unsupported`;
- re-validate the URL scheme through the same scheme allowlist (config-
  free; `http:`, `https:`, app-relative);
- when the projected profile is `scripted-cross-origin`, re-run the
  same-origin-with-shell short-circuit against the renderer's
  `window.location.origin` and demote to `static` if the URL origin
  equals the shell origin;
- never promote `static` to `scripted-cross-origin`.

Renderer failure outcomes are intentionally split: unknown sandbox
profiles and scheme failures render the `unsupported` pane and do not
mount an iframe; the same-origin-with-shell short-circuit silently
demotes only `scripted-cross-origin` to `static`.

The renderer does NOT re-run the runtime preview origin allowlist
matcher or the scripted preview producer allowlist check. The server is
the authority for those; `policyVersion` is the cross-time staleness
guard.

## Design Overview

```text
assistant output
  -> declare_artifact
  -> CoreArtifactRecord (durable domain truth)
  -> show_in_canvas(artifactId | same-turn declarationId)
  -> validate artifact / surface / presentation / iframe policy
  -> write Activity (artifact_canvas_show_intent) for audit
  -> push ArtifactCanvasNavigateIntent over platform render-intent stream
  -> renderer subscribes, calls navigate(targetUrl), acks after route commit
  -> URL becomes /<product>/<surface>/:id/canvas/:artifactId[/view/:presentation]
  -> route remounts shared <CanvasPane> + <IframeViewer> from
     src/products/shared/renderer/
  -> viewer fetches surface-scoped /api/canvas/... projection
  -> projection returns iframeSandboxProfile + policyVersion + artifact
  -> iframe renders under server-decided sandbox profile
```

User flow (no server tool involved):

```text
user clicks artifact in sidebar
  -> renderer navigate('/code/tasks/X/canvas/art_abc')
  -> route remounts shared <CanvasPane>
  -> viewer fetches projection
  -> iframe renders

user clicks Close (X)
  -> renderer navigate('/code/tasks/X')
  -> route remounts without canvas pane
  -> no server call

user clicks Collapse
  -> renderer setState({collapsed: true}); persist to localStorage
  -> URL unchanged; pane visually hidden; no server call
```

The canvas tools are presentation-intent tools, not artifact creation
tools and not URL writers — they nudge the renderer to navigate. They
do not bypass `declare_artifact`, do not scan the filesystem, and do
not mutate any product `metadata`.

### Error Code Registry

This registry is the canonical source for Cats Code Artifact Canvas error
codes. TypeScript helper unions and tool-call registry summaries shall
reference these codes instead of inventing local aliases.

| Error code | Trigger |
|------------|---------|
| `artifact_canvas_identity_required` | Neither `artifactId` nor `declarationId` is supplied. |
| `artifact_canvas_identity_conflict` | Both `artifactId` and `declarationId` are supplied. |
| `artifact_canvas_declaration_unknown` | `declarationId` does not match any entry in the current turn's declaration index under the caller's `(turnId, producerKey, scopeKey, declarationId)` key — covers the "no accepted declaration this turn", "id only seen in a prior turn", and "id only seen under a different scope (e.g. a different runtime session)" cases uniformly. |
| `artifact_canvas_declaration_producer_mismatch` | A declaration with that id exists in the current turn under the caller's scope but under a different producer's `producerKey`. Callers who need to present a foreign-producer declaration must pass `artifactId` instead. |
| `artifact_canvas_declaration_collision` | The processor has observed accepted `declare_artifact` results sharing the same `(turnId, producerKey, scopeKey, declarationId)` key but resolving to **different** materialized `artifactId` values. This indicates a SPEC-092 idempotency invariant violation upstream and must hard-reject; no Activity record or navigate-intent is emitted. |
| `artifact_canvas_artifact_not_found` | `artifactId` does not resolve to a canvas-eligible `CoreArtifactRecord`. |
| `artifact_canvas_artifact_not_anchored` | The resolved artifact is not anchored to the active surface (Code task / Code codespace / Work item / Work project / Work task / Chat conversation), per the same anchor rules SPEC-092 uses for declaration. |
| `artifact_canvas_no_active_surface` | The caller has no active product surface (Code task, Code codespace, Work item, Work project, Work task, or Chat conversation). Canvas tools require a surface to compose the navigate-intent target URL against. |
| `artifact_canvas_caller_not_authorized` | The caller is neither the active Code assistant/session nor the authenticated owner user. |
| `artifact_canvas_presentation_invalid` | `presentation` is not one of `auto`, `iframe`, `image`, `pdf`, `code` (in particular, `'unsupported'` as input is rejected here). |
| `artifact_canvas_presentation_unsupported` | An **explicit** `iframe` / `image` / `pdf` / `code` request cannot be served against the artifact (no safe inline target, no usable inline summary, etc.). `presentation: 'auto'` never raises this — it accepts and resolves to the `unsupported` pane state instead. |
| `artifact_canvas_iframe_scheme_rejected` | The artifact URL fails the scheme allowlist (e.g. `javascript:`, `file:`, `data:`, `blob:`, unparseable). Hard reject; not demoted to `static`. |
| `artifact_canvas_url_credentials_not_allowed` | The artifact URL embeds credentials (`user:pass@host` syntax). Hard reject; the URL must not appear in iframe `src`, open-external href, or any other surface. Mirrors SPEC-092's `artifact_url_credentials_not_allowed` at the canvas boundary. |

There is no error code for runtime-preview-origin allowlist failure or
producer-eligibility-gate failure: both silently demote
`scripted-cross-origin` -> `static` server-side. The renderer's
same-origin-with-shell defense-in-depth check can also silently demote
`scripted-cross-origin` -> `static`; renderer-side scheme/profile
failures render `unsupported` instead. The `iframeSandboxProfile` field
on the accepted result is the assistant-visible signal that server-side
demotion happened.

The renderer's defense-in-depth path shall surface scheme rejections as the
`unsupported` pane state, not as silently broken iframes. Server-side
rejections appear in the persisted tool trace under the canonical error code
above.

## Dependencies

- [SPEC-092](./SPEC-092-code-artifact-declaration-contract.md)
- [PLAN-081](../plans/PLAN-081-code-artifact-declaration-rollout.md)
- [SPEC-091](./SPEC-091-cats-code-workspace-and-artifact-sidebar.md)
- [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)
- [ADR-019](../decisions/019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [ADR-075](../decisions/075-adopt-push-based-per-entity-state-subscription.md) — app push substrate; SPEC-101's render-intent stream must not be implemented as a generic `subscribeEntity` patch
- [ADR-081](../decisions/081-canonicalize-three-tier-core-record-taxonomy.md) — Materialization-tier framing for `Activity` audit records
- [ADR-088](../decisions/088-use-structured-artifact-declarations-for-code-materialization.md)
- [ADR-097](../decisions/097-store-code-canvas-focus-on-task-metadata.md) — superseded by ADR-098
- [ADR-098](../decisions/098-url-driven-canvas-and-platform-shared-viewer.md) — URL-driven canvas + platform-shared viewer
- [`platform-viewer-policy.md`](../platform-viewer-policy.md)
- [Tool Call Registry](../tool-calls.md)
- [Research note](../research/2026-04-30-cats-code-split-canvas-artifact-panel.md)

## Resolved Questions

- **Visible canvas state location**: URL nested child route
  `/canvas/:artifactId[/view/:presentation]` under each opted-in
  product surface. The server stores no "current focus" record.
  See ADR-098 and FR1-3.
- **Scope of canvas focus (legacy)**: ADR-097 originally scoped focus
  to `CoreTaskRecord.metadata.codeCanvasFocus`. ADR-098 supersedes
  that — visible state is the URL, audit lives in Activity records.
- **Cross-product viewing**: same `<CanvasPane>` platform component
  mounts under Code / Work / Chat surfaces via the shared
  `/canvas/:artifactId[/view/:presentation]` child route. One safety
  policy, one route registry, one viewer registry. See FR4 and
  `platform-viewer-policy.md`.
- **Manual close semantics**: Close = renderer-only `navigate()` that
  pops the `/canvas/:artifactId` segment. No server call. Collapse =
  renderer-only ephemeral toggle (does not change URL). The earlier
  "Close calls `clear_canvas` delegate" model from the superseded
  ADR-097 draft is gone. See FR7.
- **Assistant navigation transport**: assistant-driven navigation uses
  `ArtifactCanvasNavigateIntent` on the platform render-intent stream.
  That stream shares app push plumbing with ADR-075 but is not a
  generic `subscribeEntity` patch, has a 30-second TTL, and replays only
  to the same focused surface while unacknowledged. See
  §Server-pushed render-intent.
- **Phase 1 image / PDF rendering**: served through the iframe viewer with
  the `static` sandbox profile so they remain visible without `allow-scripts`;
  Phase 2 replaces the iframe fallback with dedicated viewers. See
  §Presentation Resolution.
- **`allow-same-origin` eligibility**: `scripted-cross-origin` profile
  requires (a) URL passes the structured runtime preview origin allowlist
  (Phase 1 default: loopback `127.0.0.1` / `::1` / `localhost` on `http:`
  with any port) and is not the Cats shell origin, (b) artifact is
  `kind = 'preview'`, and (c) producer matches an explicit entry in the
  Scripted Preview Producer Allowlist (Phase 1 default: empty — operators
  must enumerate trusted producers). Agent-declared artifacts are
  short-circuited to `static` regardless of allowlist membership.
  Allowlist or producer-gate failure silently demotes to `static`.
  Credential URLs and scheme failures hard-reject. Phase 3 narrows further
  to a session-bound preview registry. See §Iframe Policy.
- **Index key**: `(turnId, producerKey, scopeKey, declarationId)` — the
  SPEC-092 idempotency components plus `turnId`. `producerKey =
  "<producerKind>:<producerIdentity>"` and `scopeKey =
  "<scopeKind>:<scopeId>"` are derived from the four SPEC-092
  idempotency fields stored under
  `CoreArtifactRecord.metadata.codeArtifactDeclaration.idempotency`.
  `producerIdentity` is the encoded SPEC-092 identity string
  (`actor:<id>`, `tool:<name>`, or `system:<detector>`), so example
  `producerKey` values include `agent:actor:actor-abc` and
  `tool:tool:declare_artifact`.
  `scopeKind` is one of `run` / `runtime` / `conversation` /
  `workspace` (the canvas does NOT add a `task` scope).
  `runtimeSessionId` lives in `scopeKey` (when `scopeKind = 'runtime'`),
  not `producerKey`. See FR9.
- **`declarationId` resolution scope**: same-caller-only. Both
  `producerKey` and `scopeKey` are taken from the caller, not the input.
  Cross-producer rejects with `artifact_canvas_declaration_producer_mismatch`;
  cross-scope rejects with `artifact_canvas_declaration_unknown` (no
  entry under that scope key); foreign-producer / foreign-scope
  presentation must use `artifactId`. See FR10.
- **Duplicate accepts at same key**: idempotent same-`artifactId` is a
  no-op; differing-`artifactId` rejects with
  `artifact_canvas_declaration_collision`. See FR11b.
- **IPv6 hostname normalization**: Node's WHATWG URL parser does NOT
  strip enclosing `[...]` from `URL.hostname`; the matcher does it
  explicitly (lower-case + bracket strip on both sides). Operators list
  the canonical short form (`::1`); Node already canonicalizes input
  IPv6 addresses to that form before bracket stripping. See §Hostname
  Normalization.
- **Allowlist config shape**: flat array
  `artifactCanvas.runtimePreviewOriginAllowlist: ArtifactCanvasRuntimePreviewOriginEntry[]`
  with no `{ entries: [...] }` wrapper. Same flat-array shape for
  `artifactCanvas.scriptedPreviewProducerAllowlist`. See §Iframe Policy.
- **Renderer authority boundary**: renderer does NOT receive the
  allowlists or re-run the matcher; it re-runs only the cheap
  config-free defense-in-depth checks (scheme allowlist, profile-name
  validity, same-origin-with-shell short-circuit). The renderer
  fetches the canvas projection on every URL hit, so it always sees
  the current `policyVersion`. See §Policy Version and Renderer
  Authority Boundary.
- **Credential URL handling**: hard reject with
  `artifact_canvas_url_credentials_not_allowed`, never demote. Mirrors
  SPEC-092 at the canvas boundary so credentials never reach iframe
  `src` or external-open hrefs. See §Credential URLs.

## Open Questions

- [ ] Should the navigate-intent push include a "soft suggest" mode
      where the renderer shows a notification ("the agent suggested a
      canvas — click to open") instead of force-navigating? Phase 1
      auto-navigates; Phase 2 may add the soft mode for surfaces where
      the user is in the middle of typing or scrolled away.
- [ ] Telemetry for user-driven canvas open / close (sidebar clicks,
      Close button) — currently invisible to the server because those
      paths are pure renderer `navigate()`. If audit / product
      analytics need this, add a thin client → `/api/canvas/telemetry`
      ping that records an Activity record without affecting visible
      state. Phase 1 keeps user actions silent; Phase 2 may opt in.

---

*Created: 2026-04-30*
*Author: Codex*
*Related Plan: [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md)*
