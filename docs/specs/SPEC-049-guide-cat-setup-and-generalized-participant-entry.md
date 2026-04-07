# SPEC-049: Guide Cat Setup and Generalized Participant Entry

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`Cats` should stop treating the first optional intelligent helper as a hidden
setup implementation detail of `Boss Cat` bootstrap.

Immediately after the owner enters their name in the platform setup wizard, the
product should offer an optional `Guide Cat`, before starting-product
selection. `Guide Cat` remains a Cat in product language, but it should be
modeled as a platform-level reusable helper that can support `Cats Chat`,
`Cats Work`, and `Cats Code`.

This setup step should stay lightweight:

- ask whether the owner wants a `Guide Cat`
- if yes, capture only the Guide Cat name plus runtime target
- do not ask for persona, skill profile, or memory profile during setup

It should also stay truthful:

- only show provider/model choices that are truly usable right now
- if no usable target exists, explain that inline and deep-link to
  `cats-runtime /setup`
- do not pad the dropdown with theoretical or fallback catalog choices

This spec also establishes the product-direction baseline that conversation
participants should be generalized beyond Cat-only assumptions. `Guide Cat`
should therefore land as part of a broader `entity` / `participant` direction,
not as another one-off special Cat mode.

## Goals

- give setup users one clear, optional first helper without forcing them to
  understand `Boss Cat`, orchestrator internals, or chat routing modes
- use `Guide Cat` as the consistent product and developer term for this helper
- capture a visible configured Cat identity for the first chosen usable runtime
  target
- keep setup lightweight enough that non-technical users are not scared off
- let `Guide Cat` support multiple platform products, not only `Cats Chat`
- make setup and later product provider/model pickers follow the same truthful
  selector rule
- establish a product baseline that conversations are about generalized
  participants, while Cats remain one product-facing participant class
- support starter ideas and empty-state guidance that can be generated instead
  of hard-coded when Guide Cat exists

## Non-Goals

- asking for persona, skill profile, memory profile, or advanced behavioral
  settings during setup
- forcing every owner to create a `Guide Cat` before the platform is usable
- showing fallback provider/model catalogs in setup or in-product execution
  pickers when those choices are not currently usable
- deciding that `Guide Cat` is automatically the same thing as `Boss Cat`
- deciding that `Guide Cat` is the only orchestrator or the only runtime-backed
  brain in the system
- replacing all Cat terminology in the UI with neutral system terminology
- completing the full entity/participant migration in the same delivery slice

## User Stories

- As a first-time owner, I want setup to ask whether I want a `Guide Cat` so I
  can opt into help without being forced into it.
- As a first-time owner, I want to choose the runtime target for that Guide Cat
  from options that can actually be used right now.
- As an owner, I want setup to stay short and not ask me to design a whole
  persona before I can use the platform.
- As an owner, I want the platform to work even if I skip Guide Cat creation.
- As an owner, I want runtime failures after setup to show up as recovery, not
  as being thrown back into onboarding.
- As a product developer, I want one stable term for this helper so naming does
  not drift between `assistant`, `Boss Cat`, `orchestrator`, and other aliases.
- As a product developer, I want future chat entry surfaces to depend on a
  generalized participant model instead of Cat-only state.

## Requirements

### Functional Requirements

1. Immediately after owner-name capture, and before starting-product
   selection, the platform setup wizard shall offer optional Guide Cat creation.
2. The setup wizard shall use `Guide Cat` as the primary user-facing and
   developer-facing term for this helper.
3. If the owner opts into Guide Cat creation, setup shall collect only:
   - Guide Cat name
   - provider
   - optional instance
   - optional model
   - optional explicit model selection if that is already part of the runtime
     target picker
4. Setup shall lazy-load runtime selector state only when the owner opts into
   Guide Cat creation.
5. The Guide Cat selector UI shall only show currently usable runtime-backed
   targets and models. It shall not show static or informational product
   catalogs as execution choices.
6. If the runtime is reachable but no usable target exists, the Guide Cat step
   shall show an inline blocking card that:
   - explains that Guide Cat needs a usable AI provider first
   - offers a link to `cats-runtime /setup`
   - offers Refresh / Recheck
   - keeps `Skip for now` available
7. If the runtime is unreachable, the Guide Cat step shall show inline retry
   and recovery affordances instead of fake provider/model dropdowns.
8. Setup shall not require persona, skill-profile, or memory-profile authoring
   for Guide Cat creation.
9. Setup completion shall succeed whether or not a Guide Cat was created.
10. The created Guide Cat shall be stored as a platform-level reusable
    Cat/entity, not merely as an ephemeral setup preference.
11. The platform shall be able to reuse Guide Cat in `Chat`, `Work`, and
    `Code` without implying that each product owns a separate first helper.
12. The product shall not automatically equate `Guide Cat` with `Boss Cat` or
    with the invisible orchestration system layer.
13. The same truthful runtime-backed selector rule shall apply to later
    in-product provider/model pickers that choose execution targets after
    setup.
14. After setup completes, runtime failure or provider loss shall be handled as
    product or host recovery, not by routing the user back through onboarding.
15. The first migration slice shall replace the setup-time `Boss Cat`
    bootstrap framing with `Guide Cat` onboarding, while keeping `Boss Cat` as
    a distinct Chat role until a later product-mapping decision says otherwise.
16. The platform may use Guide Cat to generate starter ideas, onboarding
    guidance, and product-entry suggestions for surfaces such as `+New chat`
    and future `+Group chat`.
17. When Guide Cat is unavailable, missing, sleeping, or has no cached output,
    the platform shall fall back to deterministic static starter suggestions.
18. Guide Cat-generated entry suggestions shall be cacheable local product
    data; they shall not require a permanently running session.
19. The first slice shall attempt one initial Guide Cat suggestion generation
    after setup completes when a Guide Cat exists, then reuse cached
    suggestions on entry surfaces and only lazy-refresh them when the cache is
    stale or missing.
20. The long-term conversation model shall support generalized participants so
    future non-Cat specialists can participate in rooms without inventing a
    second routing model.

### Non-Functional Requirements

- **Setup simplicity**: Guide Cat setup should stay understandable in one quick
  decision and one truthful target-selection step
- **Truthful selection**: setup and in-product execution pickers should prefer
  omission plus recovery guidance over misleading fallback options
- **Naming consistency**: product and implementation docs should prefer
  `Guide Cat` over `assistant` for this role
- **Optionality**: no product should become unusable merely because Guide Cat
  is absent
- **Runtime efficiency**: Guide Cat should use on-demand leased sessions rather
  than an always-on background runtime requirement
- **Compatibility**: the first slice should coexist with current `Boss Cat`,
  routing-mode, and Cat-registry contracts while the participant model is being
  generalized

## Design Overview

```text
Setup start
    |
    +--> Owner name
    |
    +--> Do you want a Guide Cat? ---- no ----+
    |                        |
    |                        yes
    |                        |
    |                        +--> truthful runtime selector check
    |                        |      |
    |                        |      +--> usable target(s): Guide Cat name + target
    |                        |      +--> no usable target: inline runtime-setup link
    |                        |      +--> runtime unreachable: inline retry/recovery
    |                        |
    |                        +--> persist platform-level Guide Cat
    |                        |
    +------------------------+
    |
    +--> Choose starting product
    |
    +--> enter selected product
             |
             +--> use cached Guide Cat suggestions when available
             +--> lazy-refresh when cached suggestions are stale or missing
             +--> otherwise use static fallback ideas
             +--> if runtime later fails, stay in recovery, not onboarding
```

## Product Direction

### Guide Cat

- `Guide Cat` is the first optional helper identity the owner may create during
  setup.
- It is a Cat in product language.
- In the first migration slice, it replaces setup-time `Boss Cat` bootstrap
  framing, but it does not remove `Boss Cat` as a distinct Chat role.
- It is not automatically the same as:
  - `Boss Cat`
  - the invisible orchestration system layer
  - the only runtime-backed intelligence surface in the platform

### Truthful Target Selection

- Guide Cat setup and later in-product execution selectors must use the same
  truthful runtime-backed selection contract.
- Product-supported provider catalogs remain useful for explanation or future
  install guidance, but they are not valid execution dropdowns.
- The presence of a runtime-owned model catalog does not, by itself, prove a
  target is healthy; selector surfaces should combine usable-target truth with
  runtime-owned model/default metadata.

### Generalized Participants

The long-term model should separate:

- reusable `entity` identity
- channel-scoped `participant` membership
- conversation topology such as direct vs group
- per-turn strategy such as default routing vs compare/fan-out

Cats remain a first-class product-facing participant class, but they should no
longer be the only participant shape that the architecture can represent.

### Guide Cat Suggestions

Starter ideas on entry surfaces should follow this order:

1. attempt one initial background generation right after setup completes when a
   Guide Cat exists
2. use recent cached Guide Cat suggestions immediately when an entry surface
   opens
3. refresh them lazily on surface-open when the cache is stale or missing and
   runtime is available
4. do not require periodic background refresh in the first slice
5. fall back to static deterministic ideas when Guide Cat is absent or runtime
   work is unavailable

## Open Questions

- [ ] Should the first delivered slice keep Guide Cat setup platform-wide but only
      expose the first visible Guide Cat consumption surface in `Chat`, or
      should `Work` and `Code` consume it immediately too?
- [ ] Should a created Guide Cat appear in the Chat cat registry immediately,
      or should that visibility be a later explicit product mapping?
- [ ] Which empty-state surfaces should consume Guide Cat suggestions first:
      `+New chat` only, or also the platform landing and future `+Group chat`?
- [ ] Should Guide Cat remain a platform-level core helper component, or later
      grow into a small first-party product parallel to `Chat`, `Work`, and
      `Code`?

## References

- [SPEC-013](./SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-030](./SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-042](../decisions/042-separate-channel-topology-from-routing-mode.md)
- [ADR-051](../decisions/051-generalize-participants-and-adopt-guide-cat-terminology.md)
- [PLAN-038](../plans/PLAN-038-guide-cat-setup-and-participant-generalization.md)
- [PLAN-040](../plans/PLAN-040-simplify-setup-wizard-and-decouple-runtime-bootstrap.md)

---

*Created: 2026-04-04*
*Revised: 2026-04-07*
*Author: Codex*
