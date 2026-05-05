# SPEC-019: Product Skill Profiles and Runtime Skill Manifests

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats` should own which skills a Cat ought to use in a given product
context, while `cats-runtime` should own how execution-ready `SKILL.md`
packages are validated, hosted, and attached to sessions.

This spec defines the product/runtime contract that keeps those responsibilities
separate.

## Goals

- let `cats` bind Cats, room modes, and transport contexts to reusable
  skill profiles
- let `cats-runtime` remain the canonical host for execution-ready `SKILL.md`
  packages
- define a clean request flow from product skill intent to runtime skill
  application
- keep `Boss Cat` skillful without moving orchestrator authority into skills

## Non-Goals

- building the full skill authoring UI in this slice
- turning `cats` into a second runtime skill catalog
- replacing product routing or policy with skill content
- designing a marketplace or public package distribution model

## User Stories

- As a product owner, I want `Boss Cat` and specialist Cats to reuse curated
  skills without hardcoding giant prompt blocks into every session launch.
- As a runtime integrator, I want one execution catalog for `SKILL.md`
  packages, not two competing hosts.
- As an operator, I want room mode and transport context to influence the
  skills a Cat gets, even though runtime delivery remains behind the scenes.

## Requirements

### Functional Requirements

1. `cats` shall support product-owned `SkillProfile` definitions.
2. A `SkillProfile` shall be able to map product context into runtime skill
   requests.
3. Product context for skill resolution should include at least:
   - Cat identity
   - room mode
   - transport context
   - optional channel-level overrides
4. `cats` shall resolve product context into a runtime-facing skill request
   manifest before session creation or wake.
5. The runtime-facing manifest shall refer to skills by stable runtime-facing
   identifiers, not arbitrary product-local file paths.
6. Execution-ready `SKILL.md` packages attached to sessions shall be hosted and
   resolved by `cats-runtime`.
7. `cats-runtime` shall remain responsible for validating, resolving,
   materializing, and delivering requested skills to adapters.
8. `cats-runtime` should report back requested, resolved, applied, skipped, and
   warned skill state in session metadata or API responses.
9. `cats` shall keep product-owned routing, wake/sleep, transport binding,
   and approval policy outside of skill package contents.
10. `Boss Cat` skill usage shall be profile-driven and contextual.
    - example: `boss_web_room`
    - example: `boss_telegram_inbox`
    - example: `boss_room_summary`
11. `cats` may later support authoring or curating product-managed skills,
    but execution-ready publication should flow into the runtime catalog before
    runtime use.
12. Repo-native skills discovered from the target repository should be treated
    as a separate skill source from product-managed profiles.

### Non-Functional Requirements

- **Boundary integrity**: `cats` should not become a parallel runtime skill
  host
- **Determinism**: the same Cat + context should resolve to the same requested
  skill manifest unless explicitly overridden
- **Extensibility**: future Cats Work roles should reuse the same profile and
  manifest mechanism
- **Observability**: applied runtime skill state should be visible for debugging
  and later settings surfaces

## Conceptual Model

### Product Layer

- `SkillProfile`
  - product-owned capability bundle
  - maps one role or context to runtime skill names
- `CatSkillBinding`
  - which profile a Cat uses by default
- `ContextualSkillOverride`
  - room mode or transport-specific changes

### Runtime Layer

- `RuntimeSkillCatalog`
  - execution-ready `SKILL.md` packages
- `ResolvedSkillSet`
  - validated skill packages actually available for a session
- `SkillDeliveryMode`
  - `filesystem`
  - `instructions`
  - `none`

## Flow

```text
cats product context
  (cat + room mode + transport + overrides)
        |
        v
SkillProfile resolution
        |
        v
runtime skill manifest
  (requested skill ids + policy metadata)
        |
        v
cats-runtime skill catalog
        |
        v
validation + resolution + mount/delivery
        |
        v
session metadata with applied skill state
```

## Recommended Manifest Shape

Illustrative product-to-runtime request shape:

```ts
interface RuntimeSkillManifest {
  profileId?: string;
  requestedSkills: string[];
  context: {
    catId?: string;
    roomMode?: 'chat_channel' | 'direct_message';
    transport?: 'telegram' | 'line' | 'web' | null;
  };
  strict?: boolean;
}
```

Notes:

- `requestedSkills` is the execution contract
- `profileId` and context help observability and future policy
- `strict` leaves room for future "fail if unavailable" behavior

## Product Rules

### Boss Cat

- `Boss Cat` may use different skill profiles depending on context.
- `Boss Cat` in a web room should not automatically get the same skill set as
  `Boss Cat` in Telegram.
- Skills help `Boss Cat` perform triage, summarization, or specialist
  selection, but they do not decide room authority or routing truth.

### Specialist Cats

- Specialist Cats should be able to share base profiles such as coding,
  research, or marketing while still supporting Cat-specific overrides.
- `Direct Cat Chat` should be able to request a profile tuned for direct
  operator collaboration rather than orchestrated room behavior.

### Repo-Native Skills

- Repo-native skill discovery should remain possible.
- Those skills are not owned by `cats`, even when a room is product-owned.
- The runtime should be the place that merges repo-native and runtime-catalog
  skill availability for execution.

## Design Notes

- This spec complements, not replaces, `SPEC-015`. `SPEC-015` defines capability
  registry direction; this spec fixes where execution-ready skill packages
  actually live and how the request crosses the runtime boundary.
- The safest initial rule is: `cats` resolves profile -> requested skill
  names; `cats-runtime` resolves skill names -> real packages.
- If later product-managed skill authoring exists, publication into
  `cats-runtime` should be an explicit sync/publish step.

## Dependencies

- [SPEC-015](./SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [ADR-008](../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-017](../decisions/017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-018](../decisions/018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [cats-runtime SPEC-005](../../../cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md)

## Open Questions

- [ ] Should `cats` support version pinning or content fingerprints in the
      runtime skill manifest, or leave that entirely to runtime resolution in
      the first slice?
- [ ] What is the smallest publish/sync workflow that lets product-authored
      skill changes reach `cats-runtime` safely?
- [ ] Should the product expose strict vs best-effort skill delivery policy per
      profile, per Cat, or only per advanced debug surface?

## References

- [terminology.md](../terminology.md)
- [Architecture](../architecture.md)

---

*Created: 2026-03-19*
*Author: Codex*
