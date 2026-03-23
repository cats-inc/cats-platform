# ADR-030: Own per-Cat companion boxes in product and hydrate runtime sessions

> Keep each Cat's Pandora-box-style companion storage, ingestion records, and
> response profile in `cats`, while using `cats-runtime` only for shared
> companion skill delivery and execution-time session context.

## Status

Draft (Pending Review)

## Date

2026-03-23

## Context

`cats` already has direct Cat chat, `skillProfile` mapping, and a reusable
runtime `companion` skill. That provides a minimal "companion" behavior, but
it does not yet match the intended product direction for `My Cats`.

The desired product shape is stronger:

- each Cat should be able to accumulate owner-provided media, notes, logs, and
  descriptions
- each Cat should carry its own response style and companion mode
- direct chat with a Cat should feel informed by that Cat's own materials
- `My Cats` should eventually feel like one Pandora box per Cat, not merely one
  session launcher per Cat

Without a clearer ownership rule, the implementation could drift into a poor
shape:

1. a single giant `SKILL.md` could try to contain both companion behavior and
   all Cat-specific data
2. `cats-runtime` could start acting like the long-lived owner of Cat identity
   memory
3. temporary session sandboxes could be mistaken for the canonical home of
   companion inputs

Existing project direction already argues against that drift:

- ADR-017 keeps direct-Cat behavior product-owned
- ADR-018 keeps product skill intent separate from runtime skill hosting
- SPEC-022 keeps durable memory semantics product-owned rather than provider-
  or runtime-owned

## Decision

`cats` will own per-Cat companion boxes as a product concern, and
`cats-runtime` will continue to own only execution-time skill delivery and
session execution.

### 1. Each Cat may own a product-level companion box

The product will introduce a per-Cat `CompanionBox` concept.

That box is the long-lived home for:

- raw companion sources
- derived records
- durable companion memory
- response profile and related companion settings

This is the product-owned Pandora box for that Cat.

### 2. The runtime `companion` skill remains shared and reusable

The runtime `companion` skill will remain a shared execution skill package.

It provides:

- companion behavior framework
- memory-aware and emotionally aware response guidance
- a reusable base capability that any companion-configured Cat can request

It does not become the canonical owner of one Cat's personal materials.

### 3. Cat-specific materials stay in product storage, not in runtime storage

Owner-provided files, linked paths, articles, logs, notes, and derived
knowledge should remain product-owned records.

Temporary runtime locations may still be used when a session needs copied files
or generated instruction bundles, but those are execution artifacts rather than
the canonical source of truth.

### 4. Runtime receives hydrated session context, not the whole box as its
storage model

When a direct companion conversation starts, wakes, or resumes, `cats` should
prepare a normalized `CompanionSessionContext`.

That hydrated context may include:

- requested runtime skills such as `companion`
- selected companion source references
- selected derived/memory records
- response profile
- session-local companion notes or constraints

`cats-runtime` consumes that context for one execution path. It does not become
the persistent database for the companion box itself.

### 5. Response modes are product-owned configuration

Per-Cat response behavior such as:

- animal-like expression
- anthropomorphic expression
- text output
- audio clip output
- TTS output

should be modeled as product-owned response profile data attached to the Cat or
its companion box.

The runtime may later help execute some of those outputs, but the product owns
which mode a Cat uses.

## Consequences

### Positive

- `My Cats` can evolve into true per-Cat Pandora boxes rather than thin session
  launchers.
- The `cats -> cats-runtime` boundary stays intact.
- One reusable runtime `companion` skill can serve many Cats without forcing
  Cat-specific data into runtime-owned package files.
- Product-owned privacy, scope, and memory rules stay above the runtime
  boundary.

### Negative

- The product now needs its own Cat-scoped companion storage model and
  ingestion routes.
- Session hydration becomes an explicit translation layer rather than a simple
  "attach one skill and send the prompt" path.
- Some multimodal capabilities may need phased rollout before the full vision
  is executable.

### Neutral

- This ADR does not require the final visible companion UI to ship now.
- This ADR does not require immediate semantic-search or vector-memory
  implementation.
- This ADR does not prevent some companion-box materials from being copied into
  runtime session sandboxes when execution needs them.

## Alternatives Considered

### Alternative 1: Use one shared `SKILL.md` as the main companion storage model

- **Pros**: simple at first glance, little new product structure
- **Cons**: mixes shared behavior with Cat-specific memory, does not scale to
  per-Cat sources, and weakens the product/runtime boundary
- **Why rejected**: `SKILL.md` should remain a reusable capability package, not
  a per-Cat Pandora box

### Alternative 2: Let `cats-runtime` own long-lived per-Cat companion storage

- **Pros**: fewer conceptual stores
- **Cons**: pushes durable Cat identity and privacy policy into the runtime
- **Why rejected**: per-Cat companion memory is product-owned, not runtime-
  owned

### Alternative 3: Treat provider-native transcripts and session sandboxes as
the canonical companion memory

- **Pros**: cheap implementation shortcut
- **Cons**: weak portability, weak privacy boundaries, and fragile cross-
  provider continuity
- **Why rejected**: provider/session artifacts are execution aids, not the
  canonical Pandora box

## References

- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-018](./018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [SPEC-018](../specs/SPEC-018-direct-cat-chat-and-conversation-routing-layer.md)
- [SPEC-019](../specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [SPEC-022](../specs/SPEC-022-cats-memory-layering-and-ownership.md)
- [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [cats-runtime SPEC-005](../../../cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md)

---

*Draft: 2026-03-23*
