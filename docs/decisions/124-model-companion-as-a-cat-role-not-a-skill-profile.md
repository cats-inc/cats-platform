# ADR-124: Model Companion as a Cat Role, Not a Skill Profile

## Status

Accepted, 2026-09-29. The user agreed with this direction. Implementation was completed per
[PLAN-114](../plans/PLAN-114-companion-as-cat-role.md); the Settings panel has not yet been
accepted by screenshot. The owner decided to include the Settings UI with minimal change: the
original Companion pill stays in place with its look unchanged, and becomes an independent
toggle (PLAN-114 Decision 8).

## Context

The direction of [ADR-040](040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) §6
is that the same Cat identity can be used for companion, Work and Code at once, layering
behavior by mode rather than using a crude global mode switch; its Alternative 3, "one Cat
identity per mode", was rejected.
[ADR-065](065-keep-my-cats-as-one-platform-agent-home-with-lenses.md) also requires MY CATS
to have a single registry, with different products being only different lenses.

The implementation instead made companion a value of `skillProfile` (`'companion'`).
`skillProfile` is a single string field (`src/core/types.ts:277`), originally used to choose
"which set of behavior skills this Cat uses". The companion identity check also accepts
`roles.includes('companion')`, but users can set it only through `skillProfile`; `roles` has
no entry point in the UI or the PATCH API.

The Agency pilot of [ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md) also
put plugin skills into the same `skillProfile` field, so mixing identity and behavior became
a concrete problem:

- Choosing an Agency skill makes the Cat lose its companion identity: the profile-page feed
  is hidden, and the companion box check changes with it.
- Telegram `/mode agent` writes `skillProfile` as `'chat-default'`, overwriting the chosen
  Agency skill.
- The identity check looks at role or skillProfile, while the runtime skill looks only at
  skillProfile, so the two are already inconsistent.

In addition, the managed plugin path of cats-runtime accepts only manifests with pure plugin
skills (`cats-runtime/src/core/skills/managedPlugins.ts:193`, "with managed skills only"), so
the built-in `companion` skill cannot simply be layered on top of a plugin skill.

## Decision

### 1. Companion is an identity trait of the Cat, stored in Cat-level `roles`

- Whether a Cat is a companion is decided only by whether its Cat-level `roles` contains
  `'companion'`.
- `'companion'` is no longer a valid `skillProfile` value. Per the pre-release policy no
  alias is kept; the API returns `400 bad_request` when it receives this value.
- `skillProfile` returns to its original meaning: choosing one set of behavior skills
  (the built-in default or a plugin skill). The `skillProfile` of channels and the
  orchestrator is unaffected.

### 2. The identity side and the behavior side are derived separately

- The identity side is decided by role: the profile-page feed, the companion box hydration
  condition, Telegram `/mode`, and the registry and inspect labels.
- The runtime `companion` skill is requested when the Cat has the companion role and
  `skillProfile` is a built-in value (`null` or `'chat-default'`).
- When `skillProfile` is `plugin:*`, the companion skill is not requested, to match the
  current "managed skills only" limit of cats-runtime. The memory context of the companion
  box is passed through the manifest's `context.metadata` and is not affected by this limit.
- Once cats-runtime later allows mixing, removing this exclusion is enough; the identity
  model does not need to change again.

### 3. Identity follows the Cat level; the channel view does the projection

- Identity is always decided by the Cat's own `roles`.
- The roles of a channel assignment are a snapshot taken when the Cat joined the channel and
  may also be channel-specific roles, and the read model and prompt prefer them. The
  channel's cat view therefore projects `'companion'` at read time from the Cat's own state;
  it does not sync the assignment at write time and does not migrate assignments.

### 4. Existing data is migrated once

- Existing Cats with `skillProfile: 'companion'` are changed to carry the `'companion'` role,
  with `skillProfile` set to `null`.
- The migration follows AGENTS.md: write a dedicated backup before replacement, atomically
  replace after validation, and on failure keep the original file and emit diagnostics. See
  PLAN-114 Decision 6 for details.

## Consequences

### Positive

- The same Cat can be a companion and also carry an Agency skill in Chat, with no need to
  choose one. This is exactly what ADR-040 §6 means by "shared identity, layered behavior".
- Telegram `/mode` no longer overwrites the skill the user chose.
- Companion identity can be queried by a core actor's role (the `role` filter of `GET`
  actors).
- The identity check is centralized in a single helper, with no more inconsistent paths.

### Negative

- A companion with an Agency skill temporarily has no companion-tone skill in Chat, until
  cats-runtime relaxes the restriction.
- Removing one accepted value of a public API and rewriting existing data is a persisted-data
  and API contract change; the version boundary is cats-platform `0.6.0`.
- The Settings Companion pill is no longer mutually exclusive with the other skill pills; a
  companion with the default skill lights up both.

### Neutral

- Cats Work does not read `skillProfile`; whether a Cat takes part in Work is still decided
  by `products[]` and is unaffected.
- The scope of companion across the Chat room modes does not change.
- This is independent of the work moving companion from Chat to a platform entity (the
  SPEC-102 wrap-up).

## Alternatives Considered

### Alternative 1: Keep companion as a skillProfile value

- **Pros**: no data or API change.
- **Cons**: companion and Agency skills are permanently mutually exclusive; Telegram `/mode`
  keeps overwriting the skill; it amounts to the global mode switch that ADR-040 rejected.
- **Why rejected**: it violates ADR-040 §6, and the problem has already appeared in the
  Agency pilot.

### Alternative 2: Make skillProfile multi-valued

- **Pros**: companion and plugin skills can coexist in the same field.
- **Cons**: requires changing the frozen `src/core/types.ts` and orchestration contracts;
  identity and behavior are still mixed in one concept; the plugin mixing limit still
  applies.
- **Why rejected**: a large change surface that does not solve the root problem that
  "identity should not be a skill".

### Alternative 3: Add a dedicated field (for example `companionEnabled`)

- **Pros**: the clearest semantics, with no confusion with channel roles.
- **Cons**: requires changing the frozen `CoreActorRecord` shape and the persistence format;
  `roles` already has a Cat-level field, core projection and query filter, so rebuilding one
  has no extra benefit.
- **Why rejected**: `roles` can already express an identity trait, and is the second path the
  existing code accepts.

### Alternative 4: Open PATCH to free editing of `roles`

- **Pros**: general; other roles could use it later.
- **Cons**: `roles` is a free-form string with no editing need today; public free editing
  would widen the contract.
- **Why rejected**: PATCH only adds a dedicated `companion?: boolean`, and Cat creation keeps
  using the existing `roles`.

## References

- [ADR-040](040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) §6
- [ADR-065](065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md)
- [SPEC-019](../specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)
- [PLAN-114](../plans/PLAN-114-companion-as-cat-role.md)

---

*Decision made: 2026-09-29*
*Decision makers: Product owner (approval), Claude (author)*
