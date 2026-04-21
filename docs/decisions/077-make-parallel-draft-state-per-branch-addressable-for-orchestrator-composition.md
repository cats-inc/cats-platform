# ADR-077: Make Parallel Draft State Per-Branch-Addressable So Orchestrators Can Compose M×N Team Plans

> Treat the parallel draft as a serializable team plan, not a UI form
> with parallel targets bolted on. Move per-branch state (cwd, session
> policy, prompt override, task ref) onto `DraftParallelTarget` itself
> with lead-default fallback, so an orchestrator (Guide Cat or any
> programmatic composer) can author a fully populated multi-branch
> draft and the renderer simply projects it.

## Status

Proposed

## Context

ADR-076 / SPEC-077 / PLAN-069 promoted the compare-draft layout into a
3D carousel where every branch travels with its own header / footer
chrome. The rollout deliberately limited non-lead branches to "follows
lead" — they mirror the lead's prompt, attachments, and cwd, and the
"Follows lead" chip explicitly signals the read-only relationship.
That decision was a UI scope cap, not a long-term contract.

The reason it was a cap: the underlying draft state is **not yet
per-branch-addressable**. Today, `DraftParallelTarget` carries only
provider / model / instance / modelSelection / executionLabel. Per-
branch audience and workflow shape are tracked outside the target via
parallel arrays keyed by branch index (`parallelBranchAudienceKeys[i]`,
`parallelBranchWorkflowShapes[i]`). Per-branch cwd, per-branch
runtime session policy, per-branch prompt, per-branch task identity —
none of these have a home in the data model. The renderer therefore
*cannot* render them differently per branch even if it wanted to.

The deeper need is `Cats Platform`'s long-term direction, captured in
the `project_cats_draft_orchestrator.md` memory record:

> Cats draft's full M×N capability (N cwds × M agents per cwd) is
> reserved primarily for orchestrator-composed drafts, not for manual
> user UI. User states a requirement conversationally → orchestrator
> decomposes it into an M×N team plan → draft renders populated → user
> reviews / tweaks / sends.
>
> Data model completeness comes first. `DraftParallelTarget` should be
> able to carry per-branch cwd, worktree pin, session policy, and
> eventually prompt override — so an orchestrator can serialize any
> valid M×N team into a draft the renderer will accept.

In other words, the data model is the *enabler* of three downstream
capabilities, all of which are blocked today:

1. **Per-branch cwd / workspace overrides** (the "real" answer to "what
   does the cwd chip on a non-lead branch mean?") — needs per-branch
   cwd in state.
2. **Per-branch session policy** (a branch can run "read-only" while
   another runs "full access" against the same prompt) — needs per-
   branch `RuntimeSessionPolicy`.
3. **Orchestrator-composed drafts** (Guide Cat or any composer
   programmatically authors a fully populated multi-branch draft for
   the user to review) — needs every per-branch dimension to be
   serializable end-to-end.

The current parallel-arrays approach (`parallelBranchAudienceKeys[]`,
`parallelBranchWorkflowShapes[]`) has shipped fine for two fields, but
adding cwd, session policy, prompt, and task identity as four more
parallel arrays would explode the prop surface, scatter the source of
truth across loose arrays, and make orchestrator serialization
unwieldy ("here's a team plan: take these eight arrays of length N,
correlate them by index"). The fields belong **on the target**, where
they are conceptually about that branch.

We also have a precedent: `RuntimeSessionPolicy` (ADR-071) and the
shared draft primitives in ADR-067 are already keyed per-draft, with
default-from-lead semantics implicit in how the renderer composes them.
Lifting them to per-target with explicit `null = inherit` semantics
generalizes that pattern instead of introducing a new one.

This ADR is **architecture-only**. It does not pick a specific
implementation strategy for orchestrator ingestion; that's downstream
once the schema lands.

## Decision

### 1. `DraftParallelTarget` becomes the per-branch source of truth

Extend `DraftParallelTarget` from a provider/model tuple into a
self-contained branch spec:

```ts
interface DraftParallelTarget {
  // Existing fields (unchanged)
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
  executionLabel?: string | null;

  // New per-branch overrides (all optional; null/undefined = inherit
  // from draft-level lead value)
  cwd?: string | null;
  runtimeSessionPolicy?: RuntimeSessionPolicy | null;
  promptOverride?: string | null;
  taskRef?: TaskRef | null;
  audienceKeys?: string[] | null;     // absorbs parallelBranchAudienceKeys[i]
  workflowShape?: DraftRoomWorkflowShape | null;  // absorbs parallelBranchWorkflowShapes[i]
  attachmentsOverride?: AttachmentRef[] | null;   // future-reserved; not Phase 1
}
```

A target with all per-branch fields `null`/`undefined` is the
"Follows lead" case shipping today. Setting a field to a concrete
value detaches that dimension on that branch; the renderer renders
the override and the chrome flips from "Follows lead" to "Detached".

### 2. Lead-default fallback is explicit and centralized

A small set of resolution helpers (likely in `draftChatUtils.ts` or a
new `draftBranchResolution.ts`) computes the effective per-branch
value at render / submit time:

```ts
function resolveBranchCwd(target: DraftParallelTarget, leadCwd: string | null): string | null
function resolveBranchSessionPolicy(target, leadPolicy): RuntimeSessionPolicy
function resolveBranchPrompt(target, leadPrompt: string): string
// ...etc
```

Renderer and dispatch code go through these helpers — no caller
hand-rolls "if target.cwd != null then target.cwd else draftCwd"
inline. This keeps the inheritance contract in one file.

### 3. Parallel arrays for audience / workflow are deprecated, then removed

`parallelBranchAudienceKeys[]` and `parallelBranchWorkflowShapes[]`
become aliases to the new fields on `DraftParallelTarget` during a
single migration step (Phase 1.5 in PLAN-070). Once renderer + API
are updated, the parallel-array props are removed.

### 4. Draft-level shared state stays for "what hasn't been overridden"

Lead-level fields (`composerDraft`, `draftFiles`, `draftCwd`,
`draftRuntimeSessionPolicy`, `draftAudienceKeys`,
`draftWorkflowShape`) remain on the draft; they continue to be the
default that branches inherit unless a target overrides. This is
backwards-compatible — every existing call site that reads
`draftCwd` keeps working, it just becomes "the lead branch's cwd
which other branches default to".

### 5. Renderer can flip a branch from "Follows lead" to "Detached"

The carousel's "Follows lead" chip becomes interactive: clicking
opens the per-branch override UI for that dimension (cwd picker,
session policy editor, eventually prompt detach). Detached cards
swap the chip for the concrete value (e.g.,
`composerCwdChip` showing the branch's own cwd). Reverting to
inherit is a "Re-link to lead" action that nulls the field.

The carousel ships flipped first for cwd (the most-requested
override), then session policy, then prompt — staged so each
detach UX is its own slice.

### 6. Orchestrator-composed drafts are the primary motivation, not the
   only consumer

The same schema serves three consumers, in priority order:

1. **Orchestrator (Guide Cat / future composers)** — produces a
   fully-authored multi-branch draft, mounts it as the user's
   current draft state.
2. **Manual user override** — power users tweak per-branch
   dimensions through the carousel UI.
3. **API / scripting** — third-party tools or CLI flows can author
   drafts programmatically with the same shape.

The schema must be simple enough that orchestrator output is
indistinguishable from a draft a user clicked together by hand. No
"orchestrator-only" fields, no shadow state.

## Consequences

### Positive

- Per-branch cwd / session policy / prompt finally have a home in
  state. The renderer can render them, the API can dispatch them,
  the orchestrator can author them — all reading from the same
  source of truth.
- "Follows lead" stops being a UX-level cap and becomes a real
  data state ("this field is null on this target"). The chip and
  the data agree; no special-case mirroring code in the renderer.
- Orchestrator integration becomes a serialization problem, not an
  architectural one. Once the schema is stable, Guide Cat or any
  composer just produces `DraftParallelTarget[]` with the fields
  it wants, and the renderer projects it.
- Inheritance is centralized in a small set of helpers, so changing
  the fallback rule (e.g., "cwd inherits, but session policy never
  inherits") is a one-file change, not a code-base sweep.
- The draft becomes copy-paste-able / template-able, since every
  per-branch dimension is on the target. Useful for "Save this team
  as a preset" features later.

### Negative

- `DraftParallelTarget` grows from 5 fields to ~12 (some Phase 1,
  some reserved). Larger surface for review, more null-handling at
  render time. We mitigate with the resolution helpers.
- Migration touches every call site that reads
  `parallelBranchAudienceKeys[i]` /
  `parallelBranchWorkflowShapes[i]`. Manageable today (small set of
  call sites), but the longer we wait, the more there are to update.
- The "Detached" UX adds new states the user has to learn. We can
  blunt this by gating advanced detach behind the existing
  "Enable advanced draft controls" setting (only power users see
  per-branch cwd pickers).
- Per-branch attachments (`attachmentsOverride`) is reserved in the
  schema but not implemented in Phase 1; we add the field to avoid
  another schema migration later, but defer the UX. Risk: schema
  fields that nothing reads tend to attract drift. We mitigate by
  documenting the reserved status in SPEC-078 and not exposing the
  field in any builder.

### Neutral

- The carousel UI from ADR-076 is unchanged structurally. Only the
  chip in the non-lead header slot changes meaning (from "Follows
  lead, locked" to "Follows lead, click to detach").
- Send-time dispatch logic gains a step ("resolve effective per-
  branch value") but the wire format to runtime is unchanged — the
  resolved values flow into the same dispatch payload that exists
  today.
- ADR-071 (runtime session policy boundary validation) continues to
  apply — per-branch policies still go through the same
  reject-invalid-combinations gate at dispatch time.

## Alternatives Considered

### Alternative 1: Keep per-branch fields as parallel arrays alongside the target

Just add `parallelBranchCwds[i]`, `parallelBranchRuntimeSessionPolicies[i]`,
`parallelBranchPrompts[i]`, `parallelBranchTaskRefs[i]` next to the
existing two parallel arrays.

- **Pros**: Smallest immediate diff. Existing parallel-arrays
  pattern, no schema migration on `DraftParallelTarget`.
- **Cons**: Source of truth scatters across 6+ arrays. Orchestrator
  serialization becomes "produce 6 parallel arrays of length N"
  which is awkward and error-prone (off-by-one, length mismatch).
  Adding a 7th field later is the same pain again. The "team plan"
  conceptually lives on the target; arrays make this implicit and
  invite drift.
- **Why rejected**: Doesn't fix the architectural problem, just
  defers it. Each new per-branch dimension reopens the same
  argument.

### Alternative 2: Introduce a separate `BranchSpec` type that wraps `DraftParallelTarget`

Keep `DraftParallelTarget` as the provider/model tuple it is today,
and add a new wrapper type `BranchSpec` that contains
`{ target: DraftParallelTarget, cwd, sessionPolicy, prompt, ... }`.

- **Pros**: `DraftParallelTarget` stays narrow — provider/model
  only. Layering reads cleanly: "a branch is a target plus
  per-branch overrides".
- **Cons**: Two-level indirection at every call site
  (`branch.target.provider`, `branch.cwd`). Migration cost is
  comparable to (1) but with one more layer of types to learn.
  Orchestrator output is still "produce N BranchSpec" — same shape
  as the adopted decision but with extra wrapping that adds no
  semantic value.
- **Why rejected**: Layering for layering's sake. The
  provider/model tuple and the per-branch overrides are
  conceptually one thing ("how this branch runs"); splitting them
  doesn't earn the indirection.

### Alternative 3: Defer the schema work; ship orchestrator first with bespoke draft format

Have orchestrator emit its own internal draft format (separate from
`DraftParallelTarget[]`), and have the renderer convert at mount
time.

- **Pros**: Doesn't block orchestrator work on schema migration.
  Orchestrator team owns its own format.
- **Cons**: Two draft formats to maintain (orchestrator's
  intermediate + the renderer's `DraftParallelTarget[]`).
  Conversion layer becomes a permanent feature with its own bugs.
  Manual user edits and orchestrator edits need different code
  paths. Round-trip ("user tweaks an orchestrator draft, sends it,
  orchestrator wants to refine") becomes lossy.
- **Why rejected**: Two formats is worse than one well-designed
  format. The orchestrator should produce the same shape the
  renderer renders — full stop.

### Alternative 4: Overload `executionLabel` (existing field) to encode per-branch overrides as JSON

Stuff per-branch JSON into the existing `executionLabel` string.

- **Pros**: No schema change. Backward compatible by inspection.
- **Cons**: Type safety thrown away. Any consumer of
  `executionLabel` must now parse JSON. Forward compatibility is
  fragile. Discoverability is zero (a field called `executionLabel`
  silently carrying a structured override).
- **Why rejected**: Trivially obvious anti-pattern; listed only to
  document why we didn't take the "smallest diff" temptation.

## References

- [SPEC-078: Per-Branch Draft State Schema and Lead-Default Fallback Semantics](../specs/SPEC-078-per-branch-draft-state-schema.md)
- [PLAN-070: Programmable Per-Branch Draft Rollout](../plans/PLAN-070-programmable-per-branch-draft-rollout.md)
- [ADR-076: Lay parallel-draft branches in a 3D compare carousel](./076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md)
- [SPEC-077: Compare Draft Carousel and Per-Card Chrome Contract](../specs/SPEC-077-compare-draft-carousel-and-per-card-chrome.md)
- [PLAN-069: Compare Draft Carousel Rollout](../plans/PLAN-069-compare-draft-carousel-rollout.md)
- [ADR-067: Use shared draft primitives with product-owned code-entry drafts](./067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md)
- [ADR-071: Reject invalid runtime session policy combinations at the create boundary](./071-reject-invalid-runtime-session-policy-combinations-at-create-boundary.md)
- Memory: `project_cats_draft_orchestrator.md` — design north star for orchestrator-composed drafts (dictates field-completeness priority)

---

*Decision made: 2026-04-21*
*Decision makers: User (architectural direction), Claude (drafting)*
