# Paperclip Killer-Feature Gap Analysis for Cats Chat + cats-runtime

## Metadata

- **Date**: 2026-03-20
- **Author**: Codex
- **Scope**: `Cats Chat` + `cats-runtime` only
- **Explicit exclusions**: `Cats Work`-specific control-plane surfaces and `Cats Code`-specific IDE/developer surfaces
- **Baseline**: local `paperclip/` submodule updated to latest local checkout on 2026-03-20

## Purpose

Re-audit the current Cats roadmap against the latest local `paperclip/`
submodule and identify the remaining high-value features that would materially
close the gap for the `Cats Chat + cats-runtime` product line.

This note intentionally does **not** ask "what is still missing for a full
Paperclip-style company control plane?" That would mostly pull in future
`Cats Work` scope.

Instead, it asks:

- what still feels uniquely strong in Paperclip today
- what would most improve `Cats Chat` as a product shell
- what would most improve `cats-runtime` as a trustworthy execution boundary

## Sources Reviewed

Latest Paperclip sources re-checked in this session:

- `paperclip/doc/PRODUCT.md`
- `paperclip/docs/agents-runtime.md`
- `paperclip/doc/CLI.md`
- `paperclip/docs/adapters/creating-an-adapter.md`
- `paperclip/docs/adapters/claude-local.md`
- `paperclip/docs/adapters/codex-local.md`
- `paperclip/docs/specs/agent-config-ui.md`

Current Cats references re-checked in this session:

- `cats-platform/docs/research/paperclip-control-plane-analysis.md`
- `cats-runtime/docs/research/2026-03-19-paperclip-gap-assessment.md`
- `cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md`
- `cats-platform/docs/specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md`
- `cats-platform/docs/specs/SPEC-016-chat-session-sleep-wake-lifecycle.md`
- `cats-platform/docs/specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md`
- `cats-platform/docs/specs/SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md`
- `cats-platform/docs/specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md`
- `cats-runtime/docs/specs/SPEC-007-provider-compatibility-and-evidence-engine.md`
- `cats-runtime/docs/specs/SPEC-010-usage-metering-rate-limit-detection-and-execution-guardrails.md`

## What Should Not Count as a New Gap

The 2026-03-20 spec/ADR pass already established the design direction for these
areas:

- packaged setup and provider installation
- provider install metadata
- lightweight runtime setup and diagnostics
- provider compatibility and evidence capture
- workspace substrate init/audit/update tooling
- workspace delivery policy vs runtime delivery primitives
- budget policy vs runtime metering/rate-limit guardrails

Those are still implementation work, but they should no longer be treated as
"unknown killer gaps" at the roadmap level.

## Core Conclusion

For `Cats Chat + cats-runtime`, the biggest remaining gap versus Paperclip is
not "more control-plane nouns." It is **operational magic and trust**:

1. make local CLIs feel like first-class managed Cats
2. make runtime-managed skills real at execution time
3. make live execution understandable from inside Chat
4. make wake/resume/reset behavior predictable and honest

Paperclip currently feels stronger in these areas because it combines:

- local agent enlistment
- environment diagnostics
- skills delivery
- run history and live logs
- wakeup semantics
- session reset

without requiring the operator to manually glue those pieces together.

## Recommended Killer Features

### 1. Managed Local-Cat Enlistment

**Priority**: Highest

**Paperclip strength**

Paperclip's `agent local-cli` flow and adapter-level "Test environment" support
do more than verify installation. They turn an already-installed local CLI into
a managed agent with:

- adapter-aware diagnostics
- working-directory validation
- auth/readiness checks
- a live hello probe
- skill-install or skill-link setup
- session continuity support

**Cats today**

Cats now has the architectural pieces for packaged setup and runtime
diagnostics, especially:

- packaged host-owned setup in `cats`
- lightweight provider setup/diagnostics in `cats-runtime`
- provider compatibility/evidence direction

What is still missing is the end-to-end product/runtime flow:

- pick an installed local CLI
- test whether it can really run
- bind it into Cats as a managed execution target
- keep it inspectable and reusable as a Cat

**Why this is a killer feature**

This is the fastest path to a "that is obviously better" user experience.

The operator should be able to say, in effect:

- "Use my local Claude Code"
- "Use my local Codex"
- "Show me if it is healthy"
- "Make it available as a Cat"

without manually reasoning about runtime homes, flags, auth mode, or whether
the CLI is only half-installed.

**Recommended ownership**

- `cats`: `Add Local Cat` UX and operator flow
- `cats-runtime`: probe/test/fingerprint/readiness APIs and local-target binding

### 2. Runtime-Managed Skills That Actually Execute

**Priority**: Highest

**Paperclip strength**

Paperclip skills are not only repo assets. They are delivered into the
execution environment on real runs, using adapter-aware mechanisms such as
tmpdir injection, runtime-home linking, or equivalent delivery paths.

**Cats today**

Cats already has the right direction:

- runtime-owned skills in `SPEC-005`
- product-owned capability and skill-profile mapping in `SPEC-015` and
  `SPEC-019`

But this is still mostly design and metadata. Skills are not yet a dependable
execution input across real sessions.

**Why this is a killer feature**

Without runtime-managed skills, `Boss Cat` and specialist Cats may have product
labels, but they do not yet receive the same execution-time behavioral payload
in a consistent, inspectable way.

This is one of the most direct gaps between:

- "Cats have roles"
- and
- "Cats actually behave as distinct operational collaborators"

**Recommended ownership**

- `cats`: decide which skill profile a Cat should request
- `cats-runtime`: resolve, materialize, inject, and report which skills were
  actually applied

### 3. Chat-Native Run Inspector and Live Trace Surface

**Priority**: High

**Paperclip strength**

Paperclip already has strong operator-facing run inspection:

- run history
- live updates
- stderr/stdout excerpts
- full logs
- token/cost summaries
- session reset
- explicit run states

Even when the broader product is not a chat app, the runtime behavior is
readable and debuggable.

**Cats today**

Cats has several pieces on paper:

- transcript vs trace separation
- preview surfaces
- sleep/wake language
- budget/rate telemetry split

What is still missing is the actual operator surface inside Chat that says:

- what is running
- why it woke
- what it produced
- whether it is blocked or cooling down
- whether the session should be reset

**Why this is a killer feature**

For `Cats Chat`, trust is not won by more hidden orchestration. It is won by
letting the operator understand active work without drowning them in raw CLI
noise.

The right first slice is a transcript-adjacent inspector that can show:

- Cat state
- wake reason
- current/last run status
- summarized result
- log excerpt and full log link
- preview/service/artifact links
- session reset / retry / re-probe actions

### 4. Wakeup, Coalescing, and Session-Reset Semantics

**Priority**: High

**Paperclip strength**

Paperclip's runtime model is explicit about:

- why an agent woke
- whether it is already running
- when wakeups merge instead of spawning duplicates
- when sessions should be reset

This gives the operator a believable model of "alive but bounded" behavior.

**Cats today**

Cats already has good product language in `SPEC-016`:

- `Sleeping`
- `Waking up`
- `Awake`

But the runtime/product seam is still thinner here than Paperclip's. The system
does not yet have a clearly surfaced chat-centric wakeup model such as:

- `user_message`
- `manual_nudge`
- `transport_inbox`
- `automation`

plus coalescing rules and reset semantics.

**Why this is a killer feature**

This is what makes multi-Cat behavior feel intentional rather than flaky.

Cats does **not** need to copy Paperclip's full heartbeat scheduler to gain the
benefit. A chat-first subset is enough:

- explicit wake reasons
- duplicate wake merge/coalescing
- honest "already running" behavior
- visible reset when context is stale or confused

### 5. Thin Extension Seam

**Priority**: Medium

**Paperclip strength**

Paperclip keeps pointing toward "thin core, rich edges." It already has a
plugin/extension story even though that is not its primary product abstraction.

**Cats today**

Cats already has the right stance:

- do not bloat the core early
- leave room for MCP and extension seams later

What is still missing is a minimal executable extension seam for non-core
capabilities that should not be hard-coded into Chat or the runtime forever.

**Why this matters**

This is valuable, but it is not the first thing that closes the experiential
gap with Paperclip. It should follow the first four items, not precede them.

The target is a thin seam, not:

- a marketplace
- a big SDK
- a second runtime hidden inside the product

## Features Deliberately Deprioritized for This Scope

These are real Paperclip features, but they should not drive the next
`Cats Chat + cats-runtime` roadmap slice:

- company root and multi-company management
- org charts and reporting hierarchies
- goals, projects, issues, and full work graph
- board-level approvals UI and company governance surfaces
- plugin marketplace / ClipHub-style packaging
- full autonomous heartbeat scheduler as a runtime centerpiece

Those belong more naturally to later `Cats Work` or broader platform-control-plane
scope.

## Secondary Gaps Worth Revisiting Later

These are still important, but they are not the strongest "killer feature"
opportunities for the current chat/runtime slice:

- session compaction and automatic long-context rotation
- broader structured activity/audit ledger
- richer approval substrate
- deeper provider/service observability beyond the current setup/diagnostics
  direction

They should remain on the roadmap, but the first four features above are more
likely to create an immediate product step-change.

## Recommended Implementation Order

1. Managed local-Cat enlistment and environment doctor
2. Runtime-managed skills as real execution input
3. Chat-native run inspector and live trace surface
4. Wakeup/coalescing/session-reset semantics
5. Thin extension seam

## Bottom Line

If only one gap is addressed next, it should be:

**turn existing local Claude/Codex-style CLIs into truly managed `Local Cats`**

That one capability naturally pulls in:

- diagnostics
- readiness
- skill delivery
- session continuity
- run inspection

and makes the Chat/runtime stack feel much closer to the best parts of
Paperclip without importing Paperclip's broader company-control-plane scope.

## References

- [Paperclip Control-Plane Analysis](./paperclip-control-plane-analysis.md)
- [cats-runtime Paperclip Gap Assessment](../../../cats-runtime/docs/research/2026-03-19-paperclip-gap-assessment.md)
- [cats-runtime Runtime-Managed Skills v0](../../../cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md)
- [cats Capability Registry and Skill/MCP Mapping](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [cats Chat Session Sleep/Wake Lifecycle](../specs/SPEC-016-chat-session-sleep-wake-lifecycle.md)
- [cats Product Skill Profiles and Runtime Skill Manifests](../specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [cats Packaged Setup Wizard and Provider Installation](../specs/SPEC-023-packaged-setup-wizard-and-provider-installation.md)
- [cats-runtime Provider Compatibility and Evidence Engine](../../../cats-runtime/docs/specs/SPEC-007-provider-compatibility-and-evidence-engine.md)
- [cats-runtime Usage Metering and Execution Guardrails](../../../cats-runtime/docs/specs/SPEC-010-usage-metering-rate-limit-detection-and-execution-guardrails.md)

---

*Last updated: 2026-03-20*
