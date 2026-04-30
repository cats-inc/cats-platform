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
    `artifact_canvas_declaration_collision` and the canvas focus shall
    not be written.
12. `artifactId` shall resolve only to a Code-relevant artifact that is
    compatible with the active Code task/session context.
13. `show_in_canvas` shall require an active Code task on the caller's
    surface; calls without an active task shall be rejected with
    `artifact_canvas_no_active_task` and shall not store partial focus.
14. `show_in_canvas` shall accept `presentation = 'auto' | 'iframe' | 'image' |
    'pdf' | 'code'` only; `'unsupported'` is **never** a valid input — it is
    a server-resolved output state. Phase 1 resolution rules are explicit:
    - `presentation: 'auto'` may resolve to any of `iframe`, `image`, `pdf`,
      `code`, or `unsupported`. When the artifact has no safe inline target,
      `auto` accepts and opens the metadata-only `unsupported` pane.
    - Explicit `'iframe'`, `'image'`, `'pdf'`, or `'code'` requests against
      an artifact that cannot be served as that family **reject** with
      `artifact_canvas_presentation_unsupported`. They do not silently
      downgrade to `unsupported`.
    - Phase 1 implements all viewer-shaped presentations through the iframe
      viewer using a content-appropriate sandbox profile (see §Iframe
      Policy); Phase 2 splits image / pdf / code into dedicated viewers
      without changing this rule.
15. `clear_canvas` shall clear the active task's `codeCanvasFocus` and shall
    require the same active-task precondition as `show_in_canvas`.
16. The renderer shall ignore transcript prose, markdown links, and JSON-looking
    snippets as canvas commands.
17. The pane top bar shall show artifact title, resolved presentation, status,
    close, collapse/expand, refresh, and open-external controls when supported.
18. The first viewer shall render only server-approved iframe preview targets.
19. The renderer shall re-validate the resolved URL scheme and the
    server-emitted iframe sandbox profile before mounting the viewer; a
    mismatch or rejected scheme shall fall back to the metadata / external-link
    state without mounting the iframe.
20. The Artifacts sidebar and artifact detail route shall continue to work
    without opening the split pane unless the user or assistant explicitly
    requests presentation.
21. Accepted / rejected canvas tool results shall be projected into the
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
  // Identifier for the iframe-policy snapshot that produced
  // iframeSandboxProfile. Lower-case hex string of the first 16 chars of
  // SHA-256 over the canonicalized policy tuple
  // (see §Policy Version Canonicalization). Null when the focus was
  // resolved without consulting the iframe policy
  // (presentationResolved = 'code' or 'unsupported').
  policyVersion: string | null;
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

`policyVersion` is the projection's primary signal that the iframe policy
config has not drifted since the focus was resolved. When the projection
runs and `policyVersion` differs from the server's current iframe policy
version, the projection shall **demote** the projected
`iframeSandboxProfile` to `static` for that read (without rewriting the
stored focus) and surface the demotion to the renderer. A subsequent
`show_in_canvas` call re-resolves under the current policy. Operators
changing the allowlist therefore force existing canvases to demote until
re-pinned, which is the safe default.

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
- resolved artifact must exist and be Code-relevant;
- the resolved artifact URL (when any) must contain no embedded credentials
  (`user:pass@host` syntax). Credential URLs hard-reject with
  `artifact_canvas_url_credentials_not_allowed`; they shall not appear in
  the iframe `src`, `open-external` href, or any other surface;
- resolved artifact must be anchored to the active task, run, conversation, or
  codespace according to the same anchor rules used by SPEC-092;
- the caller must be the active Code assistant/session or the authenticated
  owner user;
- the caller's surface must have an active Code task; calls with no active
  task are rejected with `artifact_canvas_no_active_task`;
- explicit non-`auto` presentation requests that cannot be served against
  the artifact are rejected with `artifact_canvas_presentation_unsupported`;
- `presentation: 'auto'` requests that find no safe inline target are
  accepted and resolve to `presentationResolved: 'unsupported'`, opening
  the metadata-only pane.

Accepted result:

```ts
interface ShowInCanvasAccepted {
  status: 'accepted';
  artifactId: string;
  presentationResolved: 'iframe' | 'image' | 'pdf' | 'code' | 'unsupported';
  iframeSandboxProfile: 'static' | 'scripted-cross-origin' | null;
  policyVersion: string | null;
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
| `kind = 'preview'` and URL passes scheme + runtime-preview-origin allowlist (and other §Iframe Policy conditions) | `iframe` | `scripted-cross-origin` |
| `kind = 'preview'` and URL passes scheme but fails the origin allowlist | `iframe` (silently demoted) | `static` |
| URL path ending in a known image extension and URL passes scheme | `iframe` | `static` |
| URL path ending in `.pdf` and URL passes scheme | `iframe` | `static` |
| `location.kind = 'inline_summary'` or text/code mime type | `unsupported` in Phase 1; `code` in Phase 2 | `null` |
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
interface CodeCanvasRuntimePreviewOriginEntry {
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

// codeCanvas.runtimePreviewOriginAllowlist is THE flat array; no wrapper.
type CodeCanvasRuntimePreviewOriginAllowlist =
  CodeCanvasRuntimePreviewOriginEntry[];
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
`codeCanvas.runtimePreviewOriginAllowlist` to add LAN dev hostnames; they
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
interface CodeCanvasScriptedPreviewProducerEntry {
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

type CodeCanvasScriptedPreviewProducerAllowlist =
  CodeCanvasScriptedPreviewProducerEntry[];
```

Phase 1 default value:

```ts
[]
```

The default is **empty**: out of the box, no producer earns
`scripted-cross-origin` and every preview iframe runs under the `static`
profile. Operators must explicitly enumerate the producers they trust
through `codeCanvas.scriptedPreviewProducerAllowlist`. The Phase 1
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

The `policyVersion` field on `CodeCanvasFocus` (see §Canvas Focus Shape)
is the projection-side guard against config drift across time: the
server publishes its current policy version alongside the projection;
the projection compares the stored `policyVersion` against the current
version on every read; a mismatch demotes the projected
`iframeSandboxProfile` to `static` for that read without rewriting the
stored focus. The next `show_in_canvas` call re-resolves under the new
policy and stamps a fresh `policyVersion`.

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
| `artifact_canvas_declaration_unknown` | `declarationId` does not match any entry in the current turn's declaration index under the caller's `(turnId, producerKey, scopeKey, declarationId)` key — covers the "no accepted declaration this turn", "id only seen in a prior turn", and "id only seen under a different scope (e.g. a different runtime session)" cases uniformly. |
| `artifact_canvas_declaration_producer_mismatch` | A declaration with that id exists in the current turn under the caller's scope but under a different producer's `producerKey`. Callers who need to present a foreign-producer declaration must pass `artifactId` instead. |
| `artifact_canvas_declaration_collision` | The processor has observed accepted `declare_artifact` results sharing the same `(turnId, producerKey, scopeKey, declarationId)` key but resolving to **different** materialized `artifactId` values. This indicates a SPEC-092 idempotency invariant violation upstream and must hard-reject; the canvas focus shall not be written. |
| `artifact_canvas_artifact_not_found` | `artifactId` does not resolve to a Code-relevant `CoreArtifactRecord`. |
| `artifact_canvas_artifact_not_anchored` | The resolved artifact is not anchored to the active task, run, conversation, or codespace. |
| `artifact_canvas_no_active_task` | The caller's surface has no active Code task; canvas focus cannot be set or cleared. |
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
  `codeCanvas.runtimePreviewOriginAllowlist: CodeCanvasRuntimePreviewOriginEntry[]`
  with no `{ entries: [...] }` wrapper. Same flat-array shape for
  `codeCanvas.scriptedPreviewProducerAllowlist`. See §Iframe Policy.
- **Renderer authority boundary**: renderer does NOT receive the
  allowlists or re-run the matcher; it re-runs only the cheap
  config-free defense-in-depth checks (scheme allowlist, profile-name
  validity, same-origin-with-shell short-circuit). `policyVersion` on
  `CodeCanvasFocus` guards against config drift across time. See
  §Policy Version and Renderer Authority Boundary.
- **Credential URL handling**: hard reject with
  `artifact_canvas_url_credentials_not_allowed`, never demote. Mirrors
  SPEC-092 at the canvas boundary so credentials never reach iframe
  `src` or external-open hrefs. See §Credential URLs.

## Open Questions

- [ ] Should Phase 2 add a route query override so users can temporarily inspect
      a sidebar artifact without changing task-scoped focus?
- [ ] Should canvas focus changes also append `CoreActivityRecord` rows, or is
      the persisted tool trace enough for Phase 1 audit?

---

*Created: 2026-04-30*
*Author: Codex*
*Related Plan: [PLAN-090](../plans/PLAN-090-cats-code-artifact-canvas-rollout.md)*
