# ADR-012: Keep Cat Naming in Product APIs and Neutral Terms in System APIs

> Preserve product-facing `Cat` naming where it belongs, while using more
> domain-neutral nouns for shared-core and orchestration APIs.

## Status

Accepted

Revision note (2026-04-08):

- [ADR-055](./055-retire-lead-and-separate-composer-recipients-from-dispatch-policy.md)
  retires lead-based composer terminology for current Cats Chat work.
- References to `leadCatId` in this ADR are historical examples of older room
  routing vocabulary, not the current forward naming target.

## Context

`cats` already made a deliberate public naming move:

- public product language uses `Cat / Cats`
- canonical product routes use `/api/cats` and `/api/channels/{id}/cats`
- `Boss Cat` is now the preferred user-facing label for the visible default
  public orchestrator identity

At the same time, the project also has a broader architectural direction:

- `Cats Core v1` uses more general shared product concepts such as actors,
  conversations, approvals, and owner profile
- the orchestration system layer needs concepts such as participants, runs,
  events, traces, retries, and diagnostics

This creates a naming question:

- should the project replace `Cat` in product APIs with a more neutral word
  such as `member`
- or should the project keep `Cat` at the product layer and use neutral nouns
  only where the domain is broader than the chat product surface

The project has already paid the churn cost of SPEC-009. Replacing `/api/cats`
again would create extra rename work without improving product clarity.

## Decision

`cats` will use layered naming based on API ownership and audience.

1. Product-facing APIs and product-facing routes keep `Cat` naming.
   - examples:
     - `/api/cats`
     - `/api/channels/{channelId}/cats`
     - `/settings/cats`
   - these surfaces exist to serve the cats product UI and should use the
     product's public nouns

2. Shared-core and orchestration APIs should use more neutral domain nouns when
   the scope is broader than product UI copy.
   - preferred terms include:
     - `actor`
     - `participant`
     - `run`
     - `event`
     - `trace`

3. The project does not adopt `member` as the new general replacement for
   `Cat`.
   - `member` is too conversation-local
   - it does not cover reusable identity, orchestrator roles, bot bindings, or
     broader shared-core actor concepts cleanly

4. `Boss Cat` remains a product/UI term, not a general system-layer noun.
   - shared-core and orchestration APIs should not depend on `Boss Cat` unless
     they are explicitly product-facing convenience surfaces

5. For product-internal code and schema names, prefer neutral product-level
   identifiers such as `primaryCatId` over UI-facing names such as `bossCatId`
   when a new field or contract is introduced.
   - this keeps the user-facing `Boss Cat` label intact
   - it avoids baking UX copy into long-lived product-internal contracts
   - `leadCatId` remains reserved for room-level or composer-level default
     speaker semantics, not the product-level default Cat identity

6. This is primarily an API-layering and ownership rule, not a single-global-
   noun rule.
   - product API: use product nouns
   - shared core: use broader domain nouns
   - orchestration system layer: use orchestration nouns

## Consequences

### Positive

- The project avoids unnecessary churn after the `Cat -> Cat` rename.
- Product APIs stay understandable to product developers and future UI work.
- Shared-core and orchestration layers can stay semantically broader than the
  chat UI.
- The architecture gets clearer ownership boundaries instead of forcing one noun
  across every layer.
- Future product-level internal contracts get a clearer split between:
  - UX terminology such as `Boss Cat`
  - internal identifiers such as `primaryCatId`
  - room-level routing terms such as `leadCatId`

### Negative

- The system now intentionally uses more than one vocabulary layer.
- Engineers need to understand when a surface is product-facing versus
  system-facing.
- Some adapters or mappings will remain necessary between product DTOs and
  shared-core/orchestration records.

### Neutral

- Existing `/api/cats` routes remain canonical for the product surface.
- This does not by itself define the exact shared-core or orchestration route
  table.
- This does not require changing current renderer routing.

## Alternatives Considered

### Alternative 1: Rename product APIs again to `member`

- **Pros**: A more neutral-looking product API.
- **Cons**: High churn and weaker product identity; `member` is still not broad
  enough for shared core.
- **Why rejected**: The rename cost is real and the semantic gain is weak.

### Alternative 2: Rename everything to `actor`

- **Pros**: One broad domain noun across more layers.
- **Cons**: Weakens product readability and throws away the intentionally chosen
  cats brand language.
- **Why rejected**: Product APIs should speak product language.

### Alternative 3: Keep `Cat` everywhere, including orchestration and shared
core

- **Pros**: One consistent visible noun.
- **Cons**: Overloads a product metaphor into layers that need broader domain
  semantics such as runs, participants, and system traces.
- **Why rejected**: System layers should not be forced into product-only
  language.

## References

- [ADR-007](./007-establish-cats-core-v1-for-chat-and-work.md)
- [ADR-010](./010-separate-read-model-app-shell-from-restful-resource-apis.md)
- [ADR-011](./011-model-primary-orchestrator-as-visible-cat.md)
- [SPEC-009](../specs/SPEC-009-public-surface-naming-refresh.md)
- [Architecture](../architecture.md)
- [Terminology](../terminology.md)

---

*Accepted: 2026-03-19*
*Accepted by: user direction captured through Codex*
