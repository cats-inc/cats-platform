# SPEC-024: Workspace Delivery Policy and Governance Levels

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User / delivery-policy workstream |

## Summary

Cats workspaces need an explicit product-owned way to describe how work outputs
should be delivered.

Some tasks are artifact-only and should never require Git. Others should stop
at a local commit. Others should push a branch, open a PR, wait for CI checks,
or publish a preview before the work is considered complete.

This policy should live above `cats-runtime`, just as skill and MCP intent
already live above runtime execution.

## Goals

- make delivery governance explicit and inspectable in the product layer
- support artifact-only, Git-backed, and CI/preview-gated work without forcing
  one workflow on all workspaces
- let Boss Cat and system-layer flows choose delivery strictness per workspace
  or work item
- map product-owned delivery policy into stable runtime-facing delivery intents

## Non-Goals

- turning workspace substrate tools into delivery-governance tools
- requiring every workspace to use Git or GitHub
- encoding provider-specific git/CI commands directly in product code
- defining the full operator UI for every future delivery surface

## User Stories

- As a Boss Cat, I want a lightweight workspace to allow artifact-only output
  without blocking on repo workflows.
- As an owner, I want higher-risk repo work to require stronger gates such as
  push, PR, checks, previews, or manual approval.
- As a specialist Cat, I want to know the effective delivery policy before I
  finish work or ask runtime to publish results.
- As a product integrator, I want delivery intent to map cleanly into
  runtime-owned executable primitives.

## Requirements

### Functional Requirements

1. `cats` shall own a product-visible `WorkspaceDeliveryPolicy` concept.
2. Delivery policy shall be distinct from workspace substrate profile,
   `SkillProfile`, and MCP/tool-profile concepts.
3. The product shall support at least these delivery-policy modes:
   - `artifact_only`
   - `commit_only`
   - `push_branch`
   - `pr_with_checks`
   - `deploy_preview`
4. Delivery policy shall also support orthogonal governance gates such as:
   - `manual_review_required`
   - `owner_approval_required`
   - `publish_artifact_required`
5. The product shall support an effective-policy model with at least:
   - workspace default policy
   - optional task/work-item override
   - optional transport or room-mode tightening
6. Boss Cat or system-layer flows shall be able to choose or tighten delivery
   policy before specialist work is finalized.
7. Specialist Cats may inspect the effective delivery policy but shall not
   silently relax it.
8. Any explicit override that weakens an already-effective governance gate
   shall require owner approval.
9. Delivery policy shall be able to express non-repo workspaces cleanly.
10. Delivery policy shall be able to express repo-backed workspaces without
    forcing CI when the policy only requires local commit or push.
11. `cats` shall resolve effective delivery policy into a runtime-facing
    delivery intent or manifest before runtime delivery actions are requested.
12. The runtime-facing delivery manifest shall refer to stable action or
    capability identifiers rather than backend-specific commands.
13. Product state should retain enough metadata to explain why a workspace or
    task currently has its effective policy.
    At minimum, that explanation should be able to reflect:
    - workspace default
    - task override
    - room/transport tightening
    - approved exception
14. Delivery policy should integrate with approval and takeover flows already
    planned in `cats`.
15. Delivery policy should be visible to later settings or operator surfaces.

### Non-Functional Requirements

- **Boundary integrity**: product owns governance intent; runtime owns
  execution
- **Safety**: stricter gates should not be bypassed silently by specialists
  or background automation
- **Observability**: the effective policy and pending gates should be visible in
  product state
- **Flexibility**: the same model should work for reports, docs, local repos,
  and PR-based engineering work

## Conceptual Model

### Product Layer

- `WorkspaceDeliveryPolicy`
  - named policy mode
  - governance gates
  - optional rationale
- `WorkspaceDeliveryBinding`
  - workspace default policy
  - scope metadata
- `DeliveryPolicyOverride`
  - task/work-item or room/transport tightening
  - optional owner-approved relaxation
- `EffectiveDeliveryPolicy`
  - the final policy the Cats should follow right now

### Runtime Boundary

- `RuntimeDeliveryManifest`
  - normalized requested delivery actions
  - capability expectations
  - approval metadata

## Recommended Shape

Illustrative product-owned types:

```ts
type DeliveryMode =
  | 'artifact_only'
  | 'commit_only'
  | 'push_branch'
  | 'pr_with_checks'
  | 'deploy_preview';

interface WorkspaceDeliveryPolicy {
  id: string;
  mode: DeliveryMode;
  gates?: Array<
    'manual_review_required'
    | 'owner_approval_required'
    | 'publish_artifact_required'
  >;
  rationale?: string;
}

interface EffectiveDeliveryPolicy {
  policy: WorkspaceDeliveryPolicy;
  source:
    | 'workspace_default'
    | 'task_override'
    | 'room_tightening'
    | 'approved_exception';
}
```

Illustrative runtime-facing manifest:

```ts
interface RuntimeDeliveryManifest {
  policyId?: string;
  requestedActions: string[];
  gates: string[];
  context: {
    workspaceId?: string;
    taskId?: string;
    roomMode?: string;
    transport?: string | null;
  };
  strict?: boolean;
}
```

## Product Rules

1. Delivery policy is product-owned intent, not a runtime-owned inference.
2. Delivery policy is not the same as workspace substrate. A workspace may have
   full AAIF collaboration substrate and still use `artifact_only`.
3. Delivery policy should be resolved before the product asks runtime to
   finalize or publish work.
4. Higher-risk paths such as `pr_with_checks` or `deploy_preview` should leave
   room for explicit approval points before finalization.
5. Artifact-only work should not be forced through fake Git flows just to fit
   the same UI model as repo-backed work.

## Dependencies

- [ADR-022](../decisions/022-own-workspace-delivery-policy-in-product.md)
- [SPEC-019](./SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [SPEC-015](./SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)
- [cats-runtime SPEC-009](../../../cats-runtime/docs/specs/SPEC-009-executable-delivery-and-governance-primitives.md)

## Open Questions

- [ ] Should delivery policy bind first to workspace records, work items, or
      both together in the first product slice?
- [ ] Should `deploy_preview` imply `push_branch`, or should the product keep
      those as separately requested actions even when they often co-occur?
- [ ] Which gates should be user-visible in Chat first: only manual review and
      owner approval, or also PR/check status detail?

## References

- [ADR-018](../decisions/018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [ADR-019](../decisions/019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [ADR-020](../decisions/020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md)
- [Paperclip Control-Plane Analysis](../research/paperclip-control-plane-analysis.md)

---

*Created: 2026-03-20*
*Author: Codex*
*Related Plan: TBD*
