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

After the owner enters their name in the suite setup wizard, the product should
offer an optional `Guide Cat`. `Guide Cat` remains a Cat in product language,
but it should be modeled as a suite-level reusable helper that can support
`Cats Chat`, `Cats Work`, and `Cats Code`.

This setup step should stay lightweight:

- ask whether the owner wants a `Guide Cat`
- if yes, capture only the Guide Cat name plus runtime target
- do not ask for persona, skill profile, or memory profile during setup

This spec also establishes the product-direction baseline that conversation
participants should be generalized beyond Cat-only assumptions. `Guide Cat`
should therefore land as part of a broader `entity` / `participant` direction,
not as another one-off special Cat mode.

## Goals

- give setup users one clear, optional first helper without forcing them to
  understand `Boss Cat`, orchestrator internals, or chat routing modes
- use `Guide Cat` as the consistent product and developer term for this helper
- capture a visible configured Cat identity for the first chosen
  provider/instance/model target
- keep setup lightweight enough that non-technical users are not scared off
- let `Guide Cat` support multiple suite products, not only `Cats Chat`
- establish a product baseline that conversations are about generalized
  participants, while Cats remain one product-facing participant class
- support starter ideas and empty-state guidance that can be generated instead
  of hard-coded when Guide Cat exists

## Non-Goals

- asking for persona, skill profile, memory profile, or advanced behavioral
  settings during setup
- forcing every owner to create a `Guide Cat` before the suite is usable
- deciding that `Guide Cat` is automatically the same thing as `Boss Cat`
- deciding that `Guide Cat` is the only orchestrator or the only runtime-backed
  brain in the system
- replacing all Cat terminology in the UI with neutral system terminology
- completing the full entity/participant migration in the same delivery slice

## User Stories

- As a first-time owner, I want setup to ask whether I want a `Guide Cat` so I
  can opt into help without being forced into it.
- As a first-time owner, I want to choose the runtime target for that Guide Cat
  so I know which model/provider I configured.
- As an owner, I want setup to stay short and not ask me to design a whole
  persona before I can use the suite.
- As an owner, I want the suite to work even if I skip Guide Cat creation.
- As a product developer, I want one stable term for this helper so naming does
  not drift between `assistant`, `Boss Cat`, `orchestrator`, and other aliases.
- As a product developer, I want future chat entry surfaces to depend on a
  generalized participant model instead of Cat-only state.

## Requirements

### Functional Requirements

1. After owner-name capture, the suite setup wizard shall offer optional Guide
   Cat creation.
2. The setup wizard shall use `Guide Cat` as the primary user-facing and
   developer-facing term for this helper.
3. If the owner opts into Guide Cat creation, setup shall collect only:
   - Guide Cat name
   - provider
   - optional instance
   - optional model
   - optional explicit model selection if that is already part of the runtime
     target picker
4. Setup shall not require persona, skill-profile, or memory-profile authoring
   for Guide Cat creation.
5. Setup completion shall succeed whether or not a Guide Cat was created.
6. The created Guide Cat shall be stored as a suite-level reusable Cat/entity,
   not merely as an ephemeral setup preference.
7. The suite shall be able to reuse Guide Cat in `Chat`, `Work`, and `Code`
   without implying that each product owns a separate first helper.
8. The product shall not automatically equate `Guide Cat` with `Boss Cat` or
   with the invisible orchestration system layer.
9. The suite may use Guide Cat to generate starter ideas, onboarding guidance,
   and product-entry suggestions for surfaces such as `+New chat` and future
   `+Group chat`.
10. When Guide Cat is unavailable, missing, sleeping, or has no cached output,
    the suite shall fall back to deterministic static starter suggestions.
11. Guide Cat-generated entry suggestions shall be cacheable local product
    data; they shall not require a permanently running session.
12. The long-term conversation model shall support generalized participants so
    future non-Cat specialists can participate in rooms without inventing a
    second routing model.

### Non-Functional Requirements

- **Setup simplicity**: Guide Cat setup should stay understandable in one quick
  decision and one target-selection step.
- **Naming consistency**: Product and implementation docs should prefer
  `Guide Cat` over `assistant` for this role.
- **Optionality**: No product should become unusable merely because Guide Cat
  is absent.
- **Runtime efficiency**: Guide Cat should use on-demand leased sessions rather
  than an always-on background runtime requirement.
- **Compatibility**: The first slice should coexist with current `Boss Cat`,
  routing-mode, and Cat-registry contracts while the participant model is being
  generalized.

## Design Overview

```text
Setup start
    |
    +--> Owner name
    |
    +--> Choose starting product
    |
    +--> Do you want a Guide Cat? ---- no ----> runtime readiness -> finish
    |                        |
    |                        yes
    |                        |
    |                        +--> runtime readiness
    |                        +--> Guide Cat name + target
    |                        +--> persist suite-level Guide Cat
    |
    +--> enter selected product
             |
             +--> use Guide Cat for starter ideas when available
             +--> otherwise use static fallback ideas
```

## Product Direction

### Guide Cat

- `Guide Cat` is the first optional helper identity the owner may create during
  setup.
- It is a Cat in product language.
- It is not automatically the same as:
  - `Boss Cat`
  - the invisible orchestration system layer
  - the only runtime-backed intelligence surface in the suite

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

1. use recent cached Guide Cat suggestions if available
2. refresh them on demand when stale and runtime is available
3. fall back to static deterministic ideas when Guide Cat is absent or runtime
   work is unavailable

## Open Questions

- [ ] Should the first delivered slice create a Guide Cat only when `Chat` is
      the selected starting product, or should every starting product be able
      to opt into it immediately?
- [ ] Should a created Guide Cat appear in the Chat cat registry immediately,
      or should that visibility be a later explicit product mapping?
- [ ] Which empty-state surfaces should consume Guide Cat suggestions first:
      `+New chat` only, or also the suite landing and future `+Group chat`?

## References

- [SPEC-012](./SPEC-012-first-run-setup-wizard-and-boss-cat-bootstrap.md)
- [SPEC-018](./SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-030](./SPEC-030-composer-scoped-lead-cat-and-boss-auto-helper-semantics.md)
- [ADR-011](../decisions/011-model-primary-orchestrator-as-visible-cat.md)
- [ADR-042](../decisions/042-separate-channel-topology-from-routing-mode.md)
- [PLAN-038](../plans/PLAN-038-guide-cat-setup-and-participant-generalization.md)
- [ADR-051](../decisions/051-generalize-participants-and-adopt-guide-cat-terminology.md)

---

*Created: 2026-04-04*
*Author: Codex*
*Related Plan: [PLAN-038](../plans/PLAN-038-guide-cat-setup-and-participant-generalization.md)*
