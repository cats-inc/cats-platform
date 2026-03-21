# ADR-018: Separate Product Skill Intent from Runtime Skill Hosting

> Keep `cats` as the owner of skill intent, profile binding, and policy
> while keeping execution-ready `SKILL.md` packages hosted and delivered by
> `cats-runtime`.

## Status

Accepted

## Context

`cats` now needs a stable answer for how `SKILL.md` should work across the
product/runtime boundary.

The pressure comes from two directions:

- product roles and behaviors need reusable skill bundles
  - `Boss Cat`
  - direct specialist chats
  - future Cats Work roles such as PM, coder, marketer
- runtime execution already needs a backend-neutral way to validate, resolve,
  mount, and inject skill packages into sessions

Recent discussion clarified an important split:

- `Boss Cat` and other product roles should be able to use skill bundles
- but the orchestrator's authority must not collapse into a giant `SKILL.md`
- routing, wake/sleep, approvals, bot bindings, and room policy remain
  product/system concerns

There is also an existing runtime direction to respect:

- `cats-runtime` already has `SPEC-005 Runtime-Managed Skills v0`
- that spec treats runtime-managed skills as execution inputs resolved from a
  runtime-owned skill catalog rooted at `skills/`

Without a clear ownership rule, the two projects could drift into conflict:

1. `cats` could try to become a parallel skill package host
2. `cats-runtime` could start owning product role policy and Cat binding logic
3. both could invent different ideas of what "skill profile" means

## Decision

`cats` and `cats-runtime` will split skill ownership by layer.

1. `cats` owns product skill intent.
   - skill profiles
   - Cat-to-profile bindings
   - room-mode and transport-context mapping
   - policy decisions about which skills should be requested in a given
     situation

2. `cats-runtime` owns execution-ready skill package hosting and delivery.
   - canonical runtime skill catalog
   - `SKILL.md` package validation
   - materialization and mount strategy
   - adapter-specific delivery mode (`filesystem`, `instructions`, `none`)

3. Execution-time `SKILL.md` packages should be hosted in `cats-runtime`, not
   directly mounted from `cats`.
   - `cats-runtime` remains the runtime boundary and execution authority
   - `cats` should request skills by stable runtime-facing identity, not by
     pushing arbitrary local package paths into sessions

4. `cats` may still define product-authored skill profiles and curated
   runtime-skill selections.
   - a profile such as `boss_telegram_inbox` may map to several named runtime
     skills
   - a profile such as `coder_direct_chat` may map to a different set

5. `Boss Cat` should use skills as capability packs, not as its source of
   authority.
   - routing and room policy stay in `cats`
   - reusable know-how may live in runtime-hosted skills selected by
     `cats`

6. If `cats` later needs a skill authoring UX, that workflow should publish
   or sync execution-ready packages into the runtime catalog instead of
   bypassing it.

## Consequences

### Positive

- Product policy and execution mechanics stay cleanly separated.
- `cats-runtime` keeps one canonical execution catalog for skills.
- `cats` can bind different Cats, room modes, and transport contexts to
  different skill profiles without becoming a second runtime.
- `Boss Cat` can use runtime-hosted skills without turning product authority
  into prompt content.

### Negative

- Skill changes may require coordination between product mappings and runtime
  package availability.
- A later authoring flow will need a publication/sync step rather than direct
  in-place usage from `cats`.
- Teams must define stable runtime-facing skill identifiers and version rules.

### Neutral

- This ADR does not require all role definitions to ship now.
- This ADR does not force `cats` to build a full skill registry UI before
  execution contracts are proven.
- This ADR does not prevent repo-native skills from existing outside product
  management.

## Alternatives Considered

### Alternative 1: Let `cats` host execution-ready `SKILL.md` packages

- **Pros**: product feels more self-contained
- **Cons**: weakens the runtime boundary and creates a second skill-hosting
  system
- **Why rejected**: execution-time package hosting belongs with runtime

### Alternative 2: Let `cats-runtime` own all skill profile and Cat binding
logic

- **Pros**: fewer mapping layers
- **Cons**: product role policy leaks downward into runtime
- **Why rejected**: Cat/room/transport policy is product-owned

### Alternative 3: Make skills purely repo-local and unmanaged by the product

- **Pros**: simple for coding-only scenarios
- **Cons**: too weak for `Boss Cat`, transport inboxes, and cross-role product
  behavior
- **Why rejected**: the product needs reusable role-aware skill intent

## References

- [ADR-008](./008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [SPEC-015](../specs/SPEC-015-cat-capability-registry-and-runtime-skill-mcp-mapping.md)
- [cats-runtime SPEC-005](../../../cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md)
- [cats-runtime ADR-006](../../../cats-runtime/docs/decisions/006-agent-backend-and-shared-runtime-contracts.md)

---

*Accepted: 2026-03-19*
*Accepted by: user direction captured through Codex*
