# ADR-022: Own Workspace Delivery Policy in Product

> Keep delivery governance as a product-owned control-plane concept in
> `cats`, while `cats-runtime` owns the executable delivery primitives used
> to realize that policy.

## Status

Accepted

## Date

2026-03-20

## Context

Cats work does not always end in the same kind of output:

- some work produces artifacts only, such as reports, slide decks, or other
  deliverables that never need a Git remote
- some work should edit an existing repo and stop at a local commit
- some work should push a branch
- some work should open a PR and wait for CI checks or preview gates

This raises a boundary question similar to earlier skill, tool, and preview
decisions:

- who decides whether a given workspace or task needs Git at all?
- who decides whether push, PR, CI, preview, or manual review are required?
- who actually performs the git/CI/preview actions when they are needed?

The accepted Cats architecture already establishes a pattern:

- `cats` owns product intent, approvals, room policy, and operator-visible
  control-plane state
- `cats-runtime` owns executable runtime behavior behind stable interfaces

That pattern has already been adopted for:

- product skill intent vs runtime skill hosting
- MCP/tool intent vs runtime tool delivery
- preview rendering policy vs runtime preview surfaces

Delivery governance belongs to the same family. It reflects workspace risk,
task type, owner preference, and product-level control, not only low-level
runtime capability.

## Decision

`cats` will own workspace delivery policy as a product/control-plane
concept, and `cats-runtime` will own the executable delivery primitives that
realize approved policy.

1. `cats` owns delivery intent.
   - whether the work is artifact-only or repo-backed
   - whether commit, push, PR, CI, preview, or manual review are required
   - whether a stricter workflow should apply for a specific workspace, room,
     or work item

2. Delivery policy is distinct from workspace substrate policy.
   - workspace substrate tools establish AAIF collaboration rules and project
     memory entry points
   - delivery policy governs how work outputs should be finalized or handed off
   - these concerns should not be collapsed into one substrate profile

3. `cats-runtime` owns executable delivery actions.
   - repo and remote inspection
   - artifact export/publication primitives
   - commit, push, PR, check-status, and preview/deploy primitives where
     supported
   - machine-readable execution results and capability gaps

4. `cats` should not directly encode backend-specific git/CI mechanics.
   - it should request approved delivery intent through stable policy/manifests
   - it should not become a second git host, CI adapter, or process manager

5. `cats-runtime` should not infer delivery governance on its own.
   - runtime may report capabilities, warnings, or blocked states
   - runtime should not decide that a workspace now requires PRs or CI simply
     because those capabilities are available

6. Effective delivery policy should be inspectable and approval-aware.
   - Boss Cat and system-layer flows may choose or tighten policy
   - specialist Cats may observe the effective policy but should not silently
     relax it
   - owner approval is required for explicit policy overrides when governance
     gates would otherwise be bypassed

## Consequences

### Positive

- Artifact-only work stays first-class instead of being forced into GitHub
  workflows.
- Product control over delivery risk remains visible and reviewable.
- The runtime can standardize git/CI/preview execution without owning product
  governance semantics.
- The same pattern now applies across skills, tools, previews, and delivery.

### Negative

- Another explicit product-to-runtime manifest seam is required.
- Product and runtime teams must keep delivery policy names aligned with
  runtime-understood primitives.
- Some workflows will need capability probes or degraded states before the
  runtime can fully execute them.

### Neutral

- This ADR does not require every workspace to use Git.
- This ADR does not require the first slice to support every forge or CI
  vendor.
- This ADR does not require CI template scaffolding to be part of workspace
  substrate generation.

## Alternatives Considered

### Alternative 1: Put delivery governance inside workspace substrate profiles

- **Pros**: one place for workspace setup knobs
- **Cons**: mixes collaboration substrate with output governance and inflates
  substrate-tool scope
- **Why rejected**: AAIF collaboration substrate and delivery governance are
  different control-plane concerns

### Alternative 2: Let `cats-runtime` decide delivery level from repo state

- **Pros**: less product configuration
- **Cons**: runtime would infer policy from capability instead of approved
  product intent
- **Why rejected**: workspace risk and owner preference are product concerns

### Alternative 3: Keep delivery decisions entirely manual and ad hoc

- **Pros**: smallest design surface
- **Cons**: inconsistent behavior across workspaces, weaker approvals, and no
  reusable control-plane model
- **Why rejected**: the suite needs explicit, inspectable delivery governance

## References

- [ADR-018](./018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [ADR-019](./019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [ADR-020](./020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md)
- [cats-runtime ADR-015](../../../cats-runtime/docs/decisions/015-own-workspace-substrate-tools-in-cats-runtime.md)
- [cats-runtime SPEC-008](../../../cats-runtime/docs/specs/SPEC-008-workspace-substrate-init-audit-and-update.md)
- [Paperclip Control-Plane Analysis](../research/paperclip-control-plane-analysis.md)

---

*Accepted: 2026-03-20*
*Decision makers: user + Codex*
