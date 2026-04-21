# SPEC-078: Per-Branch Draft State Schema and Lead-Default Fallback Semantics

> Concrete schema for moving per-branch draft state onto
> `DraftParallelTarget` with `null = inherit from lead` semantics,
> centralized resolution helpers, the migration path for the two
> existing parallel-arrays fields, and the reject / accept rules
> dispatch applies to the resolved per-branch values.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Related ADR** | [ADR-077](../decisions/077-make-parallel-draft-state-per-branch-addressable-for-orchestrator-composition.md) |
| **Related Plan** | [PLAN-070](../plans/PLAN-070-programmable-per-branch-draft-rollout.md) |
| **Depends on** | [ADR-067](../decisions/067-use-shared-draft-primitives-with-product-owned-code-entry-drafts.md), [ADR-071](../decisions/071-reject-invalid-runtime-session-policy-combinations-at-create-boundary.md), [ADR-076](../decisions/076-lay-parallel-draft-branches-in-a-3d-compare-carousel.md), [SPEC-077](./SPEC-077-compare-draft-carousel-and-per-card-chrome.md) |
| **Reviewer** | User |

## Goals

1. Make every per-branch dimension of a parallel draft expressible on
   `DraftParallelTarget` itself, with `null`/`undefined` meaning
   "inherit from lead" and a concrete value meaning "this branch has
   detached for this dimension".
2. Absorb today's two parallel arrays
   (`parallelBranchAudienceKeys[]`, `parallelBranchWorkflowShapes[]`)
   into the same per-target shape, so the schema has one home not
   three.
3. Centralize lead-default fallback in a small set of resolution
   helpers so no caller hand-rolls "if override != null then
   override else lead" logic inline.
4. Keep the submit-time dispatch payload unchanged on the wire —
   resolution happens on the renderer side, producing the same
   concrete values the runtime already accepts.
5. Enable orchestrator-composed drafts by making the schema
   round-trippable: an orchestrator produces
   `DraftParallelTarget[]` + lead-level defaults, the renderer
   mounts it, the user reviews/tweaks, the submit flows to
   dispatch unchanged.

## Non-Goals

- **The orchestrator itself**. This spec defines the schema; who
  produces the schema (Guide Cat, future composers, CLI tools) is
  out of scope here. A separate ADR/SPEC pair will cover
  orchestrator ingestion once the schema lands.
- **Per-branch attachments implementation**. The schema reserves
  `attachmentsOverride` for future use, but no renderer / dispatch
  code reads or writes it in Phase 1.
- **Per-branch cat identity**. Cats still live in the shared draft
  pool (`draftCatIds`, `draftTemporaryParticipants`). Per-branch
  membership is expressed through `audienceKeys`, referring into
  that shared pool. Forking the cat pool itself is a bigger
  question for a future ADR.
- **Detach UX visual design**. SPEC-077 covers the carousel chrome;
  this spec defines the data shape that chrome will mutate.
  Specific pickers / toggles for each field are Phase-2+ work in
  PLAN-070.
- **Validation fan-out beyond ADR-071**. Runtime session policy
  validation continues to follow ADR-071 rules; this spec just
  clarifies where per-branch policies get validated in the new
  flow.

## Schema

### `DraftParallelTarget` (extended)

```ts
interface DraftParallelTarget {
  // ── Existing fields (unchanged semantics) ────────────────────────
  provider: string;
  model: string | null;
  instance: string | null;
  modelSelection: ProviderModelSelection | null;
  executionLabel?: string | null;

  // ── New per-branch overrides (all nullable / optional) ───────────
  // Absolute rule: null | undefined  ⇒  inherit from lead-level field.
  //                concrete value     ⇒  detached; use as-is for this branch.

  /** Per-branch working directory. Lead default: draft.draftCwd. */
  cwd?: string | null;

  /** Per-branch runtime session policy. Lead default: draft.draftRuntimeSessionPolicy. */
  runtimeSessionPolicy?: RuntimeSessionPolicy | null;

  /** Per-branch prompt override. Lead default: draft.composerDraft. */
  promptOverride?: string | null;

  /** Per-branch task linkage (when the branch drives or is driven by a task). */
  taskRef?: TaskRef | null;

  /**
   * Per-branch audience keys (absorbs parallelBranchAudienceKeys[branchIndex]).
   * Lead default: draft.draftAudienceKeys ?? []. Lead branch's own audienceKeys
   * replaces the old `parallelBranchAudienceKeys[0]`.
   */
  audienceKeys?: string[] | null;

  /**
   * Per-branch workflow shape (absorbs parallelBranchWorkflowShapes[branchIndex]).
   * Lead default: draft.draftWorkflowShape.
   */
  workflowShape?: DraftRoomWorkflowShape | null;

  /**
   * Reserved for future per-branch attachment overrides. Phase 1 writes
   * nothing to this field; renderer ignores it; dispatch rejects it
   * with a clear error if set. See PLAN-070 Phase 3.
   */
  attachmentsOverride?: AttachmentRef[] | null;
}
```

`TaskRef` and `AttachmentRef` are placeholders — their concrete shape
will be defined by downstream specs. Phase 1 treats `taskRef` as
opaque (the renderer surfaces it via the task chip slot reserved by
SPEC-077; dispatch passes it through).

### Lead-level draft state (unchanged)

The draft-shared fields stay where they are. They now act as the
"lead value" that branches fall back to:

| Draft-level field | Inherited by target field |
|-------------------|---------------------------|
| `draftCwd` | `DraftParallelTarget.cwd` |
| `draftRuntimeSessionPolicy` | `DraftParallelTarget.runtimeSessionPolicy` |
| `composerDraft` | `DraftParallelTarget.promptOverride` |
| `draftAudienceKeys` | `DraftParallelTarget.audienceKeys` |
| `draftWorkflowShape` | `DraftParallelTarget.workflowShape` |
| `draftFiles` | (no per-branch equivalent in Phase 1) |

### Lead branch is `parallelTargets[0]`

No structural change: the lead branch is still at index 0. Its
per-branch overrides that happen to match the draft-level value are
redundant — resolution helpers will produce the same effective value
either way. Orchestrators MAY set `parallelTargets[0]` overrides to
the lead default values explicitly (convenient for uniform
serialization); the renderer treats lead overrides identically to
draft-level fields.

## Resolution Helpers

New module (suggested location:
`src/products/shared/renderer/draftBranchResolution.ts`) exports the
canonical lead-default resolvers. Every renderer call site and every
submit-time pipeline uses these — no caller inlines the fallback.

```ts
// Inputs common to all resolvers
interface DraftLeadContext {
  composerDraft: string;
  draftCwd: string | null;
  draftRuntimeSessionPolicy: RuntimeSessionPolicy | null;
  draftAudienceKeys: string[] | null;
  draftWorkflowShape: DraftRoomWorkflowShape;
  draftFiles: File[];
}

// Branch-level resolvers
export function resolveBranchCwd(
  target: DraftParallelTarget, lead: DraftLeadContext,
): string | null;

export function resolveBranchSessionPolicy(
  target: DraftParallelTarget, lead: DraftLeadContext,
): RuntimeSessionPolicy | null;

export function resolveBranchPrompt(
  target: DraftParallelTarget, lead: DraftLeadContext,
): string;

export function resolveBranchAudienceKeys(
  target: DraftParallelTarget, lead: DraftLeadContext,
): string[];

export function resolveBranchWorkflowShape(
  target: DraftParallelTarget, lead: DraftLeadContext,
): DraftRoomWorkflowShape;

export function resolveBranchTaskRef(
  target: DraftParallelTarget,
): TaskRef | null;

export function resolveBranchAttachments(
  target: DraftParallelTarget, lead: DraftLeadContext,
): File[];  // Phase 1 always returns lead.draftFiles; attachmentsOverride ignored

// Aggregate: one call, one resolved branch view
export function resolveBranch(
  target: DraftParallelTarget, lead: DraftLeadContext,
): ResolvedBranch;

interface ResolvedBranch {
  target: DraftParallelTarget;     // raw target kept for provenance
  effectivePrompt: string;
  effectiveCwd: string | null;
  effectiveSessionPolicy: RuntimeSessionPolicy | null;
  effectiveAudienceKeys: string[];
  effectiveWorkflowShape: DraftRoomWorkflowShape;
  effectiveTaskRef: TaskRef | null;
  effectiveAttachments: File[];
  isDetached: {
    cwd: boolean;
    sessionPolicy: boolean;
    prompt: boolean;
    audienceKeys: boolean;
    workflowShape: boolean;
  };
}
```

The `isDetached` flags let the renderer decide, per dimension, which
chip to show on a branch card ("Follows lead" vs the detached value).

## Migration

### Phase 1.5: absorb `parallelBranchAudienceKeys[]` / `parallelBranchWorkflowShapes[]`

These two parallel arrays currently live on `NewChatDraftProps` and
are threaded through the shared draft state store and the carousel.
Migration:

1. Add `audienceKeys` / `workflowShape` to `DraftParallelTarget`.
2. Update the draft state store so writes to the parallel arrays also
   write to the corresponding target field (dual-write phase).
3. Update every reader to prefer the target field when present, fall
   back to the parallel array when null / undefined (dual-read phase).
4. Remove the parallel arrays from `NewChatDraftProps`, state store,
   reducers, and tests.

Because this project has never shipped (per
`feedback_no_backwards_compat.md`), we don't need to maintain the
dual-write phase across a release boundary. Migration is landed as a
single coordinated diff in PLAN-070 Phase 1.

### Phase 2: cwd / session policy per-branch

1. Add fields to `DraftParallelTarget`.
2. Wire resolution helpers into dispatch.
3. Add per-branch pickers to the carousel (cwd chip becomes clickable
   on non-lead cards; session policy detach follows).

### Phase 3: prompt override + task ref + attachments

1. Add fields to `DraftParallelTarget`.
2. Carousel "Follows lead" prompt chip becomes clickable to detach.
3. Task chip slot reserved by SPEC-077 wires to `taskRef`.
4. `attachmentsOverride` remains reserved until the UX for per-branch
   attachments is spec'd separately.

## Dispatch Contract

At submit time, the existing dispatch pipeline receives a list of
branches. After this spec:

1. Renderer builds
   `resolvedBranches = parallelTargets.map(t => resolveBranch(t, leadCtx))`.
2. Dispatch receives resolved branches; each branch already carries
   concrete prompt / cwd / policy / audience / workflow / task /
   attachments.
3. The wire format sent to runtime is unchanged from today's
   per-branch dispatch — runtime does not see `null = inherit`; it
   only sees concrete effective values.
4. ADR-071 validation runs against `effectiveSessionPolicy` for each
   branch. A branch whose resolved policy is invalid rejects the
   whole submit with a clear per-branch error ("branch 2's session
   policy: <reason>").

## Invariants and Rejection Rules

1. **`parallelTargets[0]` is always lead.** Lead branch overrides are
   accepted (orchestrators may set them explicitly), but if `target[0]`
   is missing, the draft is malformed.
2. **`audienceKeys` referenced ids must exist in the draft cat pool**
   (`draftCatIds ∪ draftTemporaryParticipants` keys). Dispatch rejects
   dangling references.
3. **Resolved session policy** per branch goes through ADR-071; a
   branch's invalid combination is a per-branch error.
4. **`attachmentsOverride` in Phase 1 is rejected** if set. Produces
   a clear "attachments are not yet per-branch; remove the override"
   error. Schema has the field so we don't migrate again; runtime
   dispatch rejects until Phase 3 lands the real implementation.
5. **`promptOverride` that resolves to empty string** is treated as
   the lead prompt (empty override is indistinguishable from "follow
   lead" — intentional). Orchestrator authors SHOULD prefer `null`
   over `""` for clarity, but the renderer tolerates both.
6. **`taskRef` cross-branch duplication** is allowed (two branches
   can target the same task). Dispatch passes through; downstream
   task-scheduling concerns are out of scope here.

## Surfaces Affected

- `src/products/shared/renderer/components/ExecutionTarget.ts` — type
  definition
- `src/products/shared/renderer/components/ChatNewChatDraft.tsx` —
  render path consumes resolved branches; per-branch chip state
  reads `ResolvedBranch.isDetached`
- `src/products/shared/renderer/components/DraftCompareCarousel.tsx`
  — unaffected; UI is already per-card
- `src/products/shared/renderer/draftBranchResolution.ts` (new) —
  resolution helpers
- `src/products/shared/renderer/draftChatUtils.tsx` — absorb
  parallel-array constructors into target-based defaults
- Dispatch pipeline (`src/products/chat/state/runtime-dispatch/**`)
  — consume resolved branches
- Draft reducers / state store — track `DraftParallelTarget[]` as
  authoritative, drop parallel arrays
- Tests — update fixtures to use target-shape per-branch data

## Open Questions

1. **Where does `TaskRef` live in the type system?** Currently no
   shared task type; downstream spec will decide whether it's an
   id-plus-metadata shape or a full embedded task snapshot.
2. **Attachment ownership model.** Are per-branch attachments
   additive ("branch has lead's attachments + its own") or
   replacing? Reserved field is `attachmentsOverride: AttachmentRef[]`
   which implies replace; downstream SPEC will confirm.
3. **Per-branch provider fallback.** `provider` is already required
   on `DraftParallelTarget`. Should we extend the "inherit from lead"
   rule to it (so a branch can inherit provider too)? Current
   position: no — provider is the whole reason to have a branch;
   requiring it prevents degenerate branches. Revisit if
   orchestrator workflows demand it.

## References

- [ADR-077: Make parallel draft state per-branch-addressable](../decisions/077-make-parallel-draft-state-per-branch-addressable-for-orchestrator-composition.md)
- [PLAN-070: Programmable Per-Branch Draft Rollout](../plans/PLAN-070-programmable-per-branch-draft-rollout.md)
- [SPEC-077: Compare Draft Carousel and Per-Card Chrome Contract](./SPEC-077-compare-draft-carousel-and-per-card-chrome.md)
- [SPEC-052: Current-Turn Recipients, Dispatch Policy, and Parallel Chat Terminology](./SPEC-052-current-turn-recipients-dispatch-policy-and-parallel-chat-terminology.md)
- [SPEC-061: Concurrent vs Parallel Semantics and Code Entry Presets](./SPEC-061-concurrent-parallel-semantics-and-code-entry-presets.md)
- [SPEC-072: Runtime Session Policy Boundary Validation](./SPEC-072-runtime-session-policy-boundary-validation.md)

---

*Last updated: 2026-04-21*
