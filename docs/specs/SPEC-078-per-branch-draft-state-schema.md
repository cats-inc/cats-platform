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
- **Per-branch task identity (`taskRef`)**. Deferred until an
  upstream task model spec lands. Phase 1 deliberately omits the
  field from the schema — adding a placeholder type now would
  invite premature task-contract speculation. Wired in Phase 3
  alongside the carousel task chip work that SPEC-077 reserved.
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
  // Exception: promptOverride treats "" as inherit-from-lead; see invariants.

  /** Per-branch working directory. Lead default: draft.draftCwd. */
  cwd?: string | null;

  /** Per-branch runtime session policy. Lead default: draft.draftRuntimeSessionPolicy. */
  runtimeSessionPolicy?: RuntimeSessionPolicy | null;

  /**
   * Per-branch audience keys (absorbs the `audienceKeys` field on the
   * existing `DraftParallelBranchState<T>` wrapper defined in
   * `src/products/shared/renderer/draftParallelBranches.ts`, which is
   * the canonical per-branch state today; the renderer-facing
   * `parallelBranchAudienceKeys[]` prop is derived from that wrapper).
   * Lead default: draft.draftAudienceKeys ?? []. Lead branch's own
   * audienceKeys replaces the wrapper's `branches[0].audienceKeys`.
   */
  audienceKeys?: string[] | null;

  /**
   * Per-branch workflow shape (absorbs the `workflowShape` field on
   * `DraftParallelBranchState<T>`). Lead default: draft.draftWorkflowShape.
   */
  workflowShape?: DraftRoomWorkflowShape | null;

  /** Per-branch prompt body. Lead default: draft.composerDraft; "" also inherits. */
  promptOverride?: string | null;

  /**
   * Reserved for future per-branch attachment overrides. Phase 1 writes
   * nothing to this field; renderer ignores it; dispatch rejects it
   * with a clear error if set. See PLAN-070 Phase 3.
   */
  attachmentsOverride?: AttachmentRef[] | null;

  // Reserved for Phase 3 (not in Phase 1 schema):
  //   `taskRef?: TaskRef | null`        — wired only once an upstream
  //     task model spec defines `TaskRef`. Adding either placeholder
  //     type in Phase 1 would invite premature contract speculation.
}
```

`AttachmentRef` is a placeholder — its concrete shape will be defined
by a future per-branch attachments spec. Phase 1 ignores the field;
dispatch rejects any non-null value with the documented error.

### Phase 1 Landed Fields

As of 2026-04-21, Phase 1 has landed the target-owned fields
`cwd`, `runtimeSessionPolicy`, `audienceKeys`, `workflowShape`, and
schema-reserved `attachmentsOverride` on `DraftParallelTarget`.
The former `DraftParallelBranchState<T>` wrapper and the derived
`parallelBranchAudienceKeys[]` / `parallelBranchWorkflowShapes[]`
renderer props have been removed; `DraftParallelTarget[]` is now the
canonical renderer draft state.

As of 2026-04-21, Phase 3 Task 3.1 has landed
`promptOverride?: string | null` on `DraftParallelTarget`.
`resolveBranchPrompt(...)` resolves it against `lead.composerDraft`,
and parallel submit dispatch sends each branch's `effectivePrompt`
through the existing `channelInputs[].body` wire.

As of 2026-04-21, Phase 3 Task 3.2 has landed prompt detach UI on
non-lead carousel cards. The followed prompt textarea opens an
explicit detach confirmation; detached prompts are edited directly in
that branch textarea; re-link clears `promptOverride` to return to
lead inheritance.

The resolver module is present at
`src/products/shared/renderer/draftBranchResolution.ts`, including
`createDraftLeadContext`, the landed field resolvers,
`resolveBranch(...)`, and the Phase 1 rejection guard for non-null
`attachmentsOverride`. Renderer submit resolves effective branch
prompt / audience / workflow before first-message dispatch; the
per-channel runtime message wire remains unchanged by design.

### Lead-level draft state (unchanged)

The draft-shared fields stay where they are. They now act as the
"lead value" that branches fall back to:

| Draft-level field | Inherited by target field |
|-------------------|---------------------------|
| `draftCwd` | `DraftParallelTarget.cwd` (Phase 1) |
| `draftRuntimeSessionPolicy` | `DraftParallelTarget.runtimeSessionPolicy` (Phase 1) |
| `draftAudienceKeys` | `DraftParallelTarget.audienceKeys` (Phase 1) |
| `draftWorkflowShape` | `DraftParallelTarget.workflowShape` (Phase 1) |
| `composerDraft` | `DraftParallelTarget.promptOverride` (Phase 3 Task 3.1) |
| `draftFiles` | `DraftParallelTarget.attachmentsOverride` (Phase 3+, schema-reserved) |

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

// Branch-level resolvers (Phase 1)
export function resolveBranchCwd(
  target: DraftParallelTarget, lead: DraftLeadContext,
): string | null;

export function resolveBranchSessionPolicy(
  target: DraftParallelTarget, lead: DraftLeadContext,
): RuntimeSessionPolicy | null;

export function resolveBranchAudienceKeys(
  target: DraftParallelTarget, lead: DraftLeadContext,
): string[];

export function resolveBranchWorkflowShape(
  target: DraftParallelTarget, lead: DraftLeadContext,
): DraftRoomWorkflowShape;

export function resolveBranchAttachments(
  target: DraftParallelTarget, lead: DraftLeadContext,
): File[];  // Phase 1 always returns lead.draftFiles; attachmentsOverride ignored

// Aggregate: one call, one resolved branch view
export function resolveBranch(
  target: DraftParallelTarget, lead: DraftLeadContext,
): ResolvedBranch;

interface ResolvedBranch {
  target: DraftParallelTarget;                          // raw target kept for provenance
  effectivePrompt: string;                              // Phase 3 Task 3.1: resolved
  effectiveCwd: string | null;                          // Phase 1: resolved
  effectiveSessionPolicy: RuntimeSessionPolicy | null;  // Phase 1: resolved
  effectiveAudienceKeys: string[];                      // Phase 1: resolved
  effectiveWorkflowShape: DraftRoomWorkflowShape;       // Phase 1: resolved
  effectiveAttachments: File[];                         // Phase 1: always lead.draftFiles
  isDetached: {
    prompt: boolean;
    cwd: boolean;
    sessionPolicy: boolean;
    audienceKeys: boolean;
    workflowShape: boolean;
  };
}
```

Phase-3 additions (listed here so implementers know what the
aggregate will grow into, but MUST NOT ship as placeholders in
Phase 1):

```ts
// Phase 3 additions to ResolvedBranch:
//   effectiveTaskRef: TaskRef | null;
//
// Phase 3 additions to the resolver suite:
//   export function resolveBranchTaskRef(...): TaskRef | null;
```

Phase 3 Task 3.1 introduced `resolveBranchPrompt(...)` alongside
`promptOverride`; parallel submit call sites now read
`resolvedBranch.effectivePrompt` for each branch.

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

### Phase 2: detach UI for cwd / session policy

Schema fields and the contract / server work for cwd + session
policy are landed in Phase 1 (above). Phase 2 only adds UI:

1. Per-branch pickers on the carousel — cwd chip becomes clickable
   on non-lead cards, session policy detach follows the same
   pattern. Authoring writes to `target.cwd` /
   `target.runtimeSessionPolicy`.
2. "Re-link to lead" affordance nulls the override.

As of 2026-04-21, Phase 2 cwd / session-policy UI has landed:

1. Non-lead carousel cards render a clickable "Follows lead" cwd
   chip under advanced draft controls. It opens the existing folder
   picker scoped to the branch and writes the selected path to
   `parallelTargets[i].cwd`.
2. Detached branch cwd renders as a `composerCwdChip`; its re-link
   action clears `parallelTargets[i].cwd` back to `null`.
3. Non-lead cards render a "Policy follows lead" chip under advanced
   draft controls. Activating it writes the resolved lead policy to
   `parallelTargets[i].runtimeSessionPolicy`.
4. Detached branch session policy renders editable permission controls
   immediately. Workspace-mode controls are shown only after the branch
   cwd repo probe succeeds, matching the lead draft's repo-ready gating.
5. Re-link clears `parallelTargets[i].runtimeSessionPolicy` back to
   `null`, returning the branch to lead inheritance.

### Phase 3: prompt detach + taskRef + attachments

1. Add `promptOverride?: string | null` to `DraftParallelTarget`.
   Add `resolveBranchPrompt` to the resolver suite and dispatch
   through `channelInputs[].body`. Landed in Phase 3 Task 3.1.
   Carousel prompt detach UI landed in Phase 3 Task 3.2: followed
   prompt textareas open an explicit detach confirmation, detached
   prompt textareas edit `promptOverride`, and re-link clears the
   override.
2. Add `taskRef?: TaskRef | null` to `DraftParallelTarget` once
   the upstream task model spec defines `TaskRef`. Add
   `resolveBranchTaskRef` to the resolver suite. Wire to the
   task chip slot reserved by SPEC-077.
3. `attachmentsOverride` remains reserved until the UX for
   per-branch attachments is spec'd separately.

## Dispatch Contract

There are two boundaries to consider, and only one is unchanged:

### Per-channel runtime dispatch (unchanged)

After a parallel group exists and child channels are wired up, the
*per-channel* dispatch path that delivers a turn into a single
runtime session is unchanged. Resolution happens before this layer:

1. Renderer builds
   `resolvedBranches = parallelTargets.map(t => resolveBranch(t, leadCtx))`.
2. Per-channel dispatch receives a resolved branch view; each branch
   already carries concrete prompt / cwd / policy / audience /
   workflow.
3. The wire format from product → runtime for an individual channel
   turn is unchanged — runtime sees concrete effective values, never
   `null = inherit`.
4. ADR-071 validation runs against `effectiveSessionPolicy` for each
   branch. A branch whose resolved policy is invalid rejects the
   whole submit with a clear per-branch error ("branch 2's session
   policy: <reason>").

### Parallel group create contract (DOES change)

The `CreateParallelChatGroupInput` contract in
`src/products/chat/api/contracts.ts` today only carries:

- `repoPath?: string` at the **group level** (one cwd shared across
  all child channels)
- `targets: Array<ParallelChatTarget & { audienceKeys?: string[] }>`
  where `ParallelChatTarget` is provider / instance / model /
  modelSelection only
- `RuntimeSessionCreateContractInput` is mixed into
  `CreateChatChannelInput` at the single-channel boundary, not into
  parallel-group creation

Per-branch cwd and per-branch session policy *cannot* round-trip
through that contract today. To deliver Phase 2 of PLAN-070, we
extend the contract with BOTH group-level lead defaults AND
per-target overrides:

1. Add a new **group-level** `runtimeSessionPolicy` field to
   `CreateParallelChatGroupInput` itself, mirroring the existing
   group-level `repoPath`. This carries the lead draft's policy
   so per-target `runtimeSessionPolicy = null` can inherit it.
   Without this field, a null per-target policy would collapse to
   a server-side default, not the lead draft's policy.
2. Add optional per-target overrides on the parallel-group create
   input shape:

   ```ts
   interface CreateParallelChatGroupInput {
     title: string;
     originSurface: PlatformSurfaceId;
     repoPath?: string;                                    // existing — lead default for per-target `cwd`
     runtimeSessionPolicy?: RuntimeSessionPolicy | null;   // NEW — lead default for per-target `runtimeSessionPolicy`
     responseLanguage?: string;
     targets: Array<ParallelChatTarget & {
       audienceKeys?: string[];
       // New, optional, all null/undefined = inherit from group level:
       cwd?: string | null;
       runtimeSessionPolicy?: RuntimeSessionPolicy | null;
     }>;
     participantCatIds?: string[];
     temporaryParticipants?: CreateTemporaryParticipantInput[];
   }
   ```

3. The renderer's parallel-group submit path populates the new
   group-level `runtimeSessionPolicy` from
   `draftRuntimeSessionPolicy` at submit time — without this
   wiring, the contract field is nominally present but never
   carries a real lead policy.
4. The parallel-group create handler (product-owned, see
   § Surfaces Affected) resolves per-target overrides against the
   group-level lead defaults:
   - Each target's effective `cwd` = `target.cwd ?? group.repoPath`
     (passed as the per-channel `repoPath`).
   - Each target's effective `runtimeSessionPolicy` =
     `target.runtimeSessionPolicy ?? group.runtimeSessionPolicy ??
     serverDefault` (forwarded via the existing
     `RuntimeSessionCreateContractInput` mix-in on the per-channel
     create).
   - ADR-071 validation runs per resolved per-channel policy;
     reject the whole group create if any child fails.
5. `ParallelChatTarget` itself (the runtime-facing read model used
   by `ParallelChatGroupMemberSummary`) does not need to grow —
   the per-channel `repoPath` and session policy are already
   projected onto each `ChatChannelView`. The contract change is
   on the create-input side only.

### Why `runtimeSessionPolicy` is nested, not flattened like on `CreateChatChannelInput`

The existing channel-create contract is
`CreateChatChannelInput = CreateChatChannelInputBase & RuntimeSessionCreateContractInput`
— a TypeScript intersection that hoists three top-level fields
(`runtimeWorkspaceKind`, `runtimeWorkspaceAccess`,
`runtimePermissionMode`) onto the input. That shape is correct for
single-channel creation where "unspecified means server default".

The parallel-create contract intentionally **diverges** and uses a
nested `runtimeSessionPolicy?: RuntimeSessionPolicy | null` both at
group level and at per-target level. The reason is that parallel
create needs three distinct states, not two:

- `undefined` — field absent; fall back one level up
  (per-target → group → server default).
- `null` — explicit "inherit from the next level up" (per-target
  `null` says "use the group-level policy", group `null` says
  "use server default"). Equivalent to `undefined` in behaviour,
  but orchestrator-authored drafts may want to serialize intent
  explicitly.
- Concrete `RuntimeSessionPolicy` — use as-is for that scope.

A flattened intersection can't cleanly distinguish these because
the three member fields
(`runtimeWorkspaceKind` / `runtimeWorkspaceAccess` /
`runtimePermissionMode`) can each be individually absent or set.
"Did this target override the whole policy?" becomes a
multi-field check with no single authoritative field — error-prone
for orchestrator authors and the state-model consumer alike.

**Caveat: `undefined` and `null` collapse at resolution time.**
The three-state distinction is authoring-intent only. The
resolver uses `??`, so `target.runtimeSessionPolicy ??
group.runtimeSessionPolicy ?? serverDefault` treats `undefined`
and `null` identically — both fall through to the next level.
Callers that want "this field was explicitly set to null" as a
runtime-observable signal (e.g., "orchestrator asserted this
branch must use server default, do NOT inherit group") would
need a separate discriminator; today's contract does not provide
one. If a later spec needs that distinction, it can add an
explicit `inherit: 'server-default' | 'group'` marker alongside
the nullable field. The intent-preservation note here exists so
future implementers don't mistake the `??` collapse for a bug.

The state-model consumer (§ Surfaces Affected) converts each
resolved per-target `RuntimeSessionPolicy` back into the flattened
`RuntimeSessionCreateContractInput` shape when calling the
existing per-channel create path, so the per-channel wire is
unchanged. Only the parallel-group create envelope carries the
nested shape.

This contract change is in scope for **PLAN-070 Phase 1** because
no Phase 2 UI work can land usefully without it. Once the contract
exists with sane defaults (group-level field present, per-target
fields nullable inheriting group defaults), Phase 1 ships the
schema + resolution + wire change together, even though nothing
in the UI yet *writes* to the new fields. Phase 2 then attaches
the UI affordances that populate them.

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
5. **Per-target `cwd` references that don't resolve to a usable
   path** at create time are rejected by the parallel-group
   create handler with a per-target error message. Resolution
   happens before the runtime ever sees the channel.
6. **`promptOverride` empty-string rule (Phase 3)**. When
   `promptOverride` ships, an empty-string override resolves to
   the lead prompt (empty override is indistinguishable from
   "follow lead" — intentional). Orchestrator authors SHOULD
   prefer `null` over `""` for clarity, but the renderer
   tolerates both.

## Surfaces Affected

Renderer:

- `src/products/shared/renderer/draftChatUtils.tsx` — `DraftParallelTarget`
  type extension (the type lives here, **not** in `ExecutionTarget.ts`,
  which only declares `ExecutionTargetValue`). The extended target
  subsumes the fields currently held on the branch wrapper.
- `src/products/shared/renderer/draftParallelTargets.ts` — target-list
  helpers for `DraftParallelTarget[]`. The old
  `draftParallelBranches.ts` wrapper module has been retired; renderer
  hooks now hold branch-owned fields directly on each target.
- `src/products/chat/renderer/composerParallelDispatch.ts`,
  `src/products/shared/renderer/composerParallelDispatch.ts`,
  `src/products/chat/renderer/hooks/useComposerSubmit.ts`,
  `src/products/shared/renderer/hooks/useWorkspaceComposerSubmit.ts`
  — today these accept
  `DraftParallelBranchState<ExecutionTargetValue>[]`; Phase 1 migrates
  them to read from the extended `DraftParallelTarget` (or the
  flattened branch shape) via the new resolver suite.
- `src/products/shared/renderer/draftBranchResolution.ts` (new) —
  resolution helpers, `ResolvedBranch` aggregate.
- `src/products/shared/renderer/components/ChatNewChatDraft.tsx` —
  render path consumes resolved branches for audience/workflow and
  owns the Phase 2 branch detach controls. The shadow-card cwd chip
  opens a branch-scoped folder picker, while detached session policy
  renders permission controls plus repo-ready workspace-mode controls.
  Phase 3 prompt detach UI also lives here: non-lead prompt textareas
  confirm detach, edit detached prompts, and re-link back to lead.
- `src/products/shared/renderer/components/DraftCompareCarousel.tsx`
  — unaffected; UI is already per-card.
- Draft state hooks (Chat's `src/products/chat/state/**` plus the
  Code/Work equivalents) — stop producing the derived parallel
  arrays; return `DraftParallelTarget[]` with per-branch fields
  populated. Verify every consumer of the old derived arrays
  migrates to the resolver suite.

Frozen API contract (per ADR-077, this is in-scope for Phase 1
because Phase 2 cannot ship per-branch cwd / policy without it):

- `src/products/chat/api/contracts.ts` — two coordinated extensions
  to `CreateParallelChatGroupInput`:
  1. **New group-level field**
     `runtimeSessionPolicy?: RuntimeSessionPolicy | null`,
     mirroring the existing group-level `repoPath`. This is the
     lead default that per-target `runtimeSessionPolicy` falls back
     to. Without this field, per-target `null` collapses to a
     server-side default instead of inheriting the lead draft's
     policy.
  2. **New per-target overrides** on the `targets[]` element:
     optional `cwd?: string | null` and
     `runtimeSessionPolicy?: RuntimeSessionPolicy | null`.
  `ParallelChatTarget` itself is a read-model export; it doesn't
  grow. The `runtimeSessionPolicy` field is intentionally nested
  (not flattened into the existing
  `RuntimeSessionCreateContractInput` shape used by
  `CreateChatChannelInput`) — see § Dispatch Contract ›
  "Why `runtimeSessionPolicy` is nested" for the rationale.
- `src/products/shared/renderer/api/chat.ts` mirrors the
  renderer-side `CreateParallelChatGroupInput` shape; extend
  BOTH the group-level `runtimeSessionPolicy` and the
  `targets[]` per-target overrides in lock-step.
- Renderer parallel-submit path — at submit time, populate the new
  group-level `runtimeSessionPolicy` from the lead draft's
  `draftRuntimeSessionPolicy`. Without this wiring, the contract
  field exists but never carries a real lead policy, and a
  per-target `null` would collapse to server default.

Product-owned API / state model (ADR-067: product APIs are
product-owned delegates, not `src/app/server/**`):

- `src/products/chat/api/resources/parallelChatGroupCrudRoutes.ts`
  — the product's parallel-group create route handler. It parses
  `CreateParallelChatGroupInput` and delegates to the state
  model. Phase 1 teaches this handler to pass BOTH the new
  group-level `runtimeSessionPolicy` AND the per-target
  overrides through (no `null = inherit` collapse at this layer
  — let the state model resolve).
- `src/products/chat/state/model/index.ts` — the consumer that
  actually creates the group and its child channels. For each
  target:
  - Resolve `cwd` as `target.cwd ?? group.repoPath`.
  - Resolve `runtimeSessionPolicy` as
    `target.runtimeSessionPolicy ?? group.runtimeSessionPolicy
    ?? serverDefault`. Flatten the resolved policy into the
    existing `RuntimeSessionCreateContractInput` field shape
    (`runtimeWorkspaceKind` / `runtimeWorkspaceAccess` /
    `runtimePermissionMode`) when building each child
    `CreateChatChannelInput`. Per-channel wire shape is
    unchanged — only the parallel-group envelope carries the
    nested shape.
  - ADR-071 validation runs per resolved per-channel policy;
    reject the whole group create with a per-target error if
    any child fails.

Per-channel runtime dispatch:

- `src/products/chat/state/runtime-dispatch/**` — consume resolved
  branches at submit time. Wire to the per-channel runtime is
  unchanged.

Tests:

- Contract-level fixtures for `CreateParallelChatGroupInput`:
  - Group-level `runtimeSessionPolicy` set, no per-target
    overrides → every child channel inherits the group policy.
  - Per-target `cwd` / `runtimeSessionPolicy` overrides set →
    overrides surface on the corresponding per-channel input.
  - Neither set → server default applies (regression guard for
    the "empty group-level field" case that motivated adding
    the field in the first place).
- Submit-chain propagation: a Workspace / Chat hook receiving a
  non-null `draftSessionPolicy` option populates the group-level
  `runtimeSessionPolicy` on the `CreateParallelChatGroupInput`
  it emits — no "dispatcher updated but hook never forwards"
  regression.
- Update existing fixtures to use target-shape per-branch data.
- Flattened wrapper migration: every existing test that
  constructs a `DraftParallelBranchState<T>` fixture either
  migrates to the new shape or asserts the resolver reads it
  correctly during the transitional diff.

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
