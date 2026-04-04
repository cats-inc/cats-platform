# ADR-026: Use cats as the Flagship Platform Name under cats-inc Brand

> Keep `Cats Inc` as the umbrella brand and future GitHub owner/org name, while
> naming the main platform repo and flagship product `cats` rather than
> `cats-inc`.

## Status

Superseded by [ADR-045](./045-use-cats-platform-as-the-main-platform-host-under-cats-brand.md)

## Date

2026-03-21

## Context

The current app repo and package are named `cats-inc`.

That was a reasonable working name while the project was still mainly framed as
the product shell for the broader Cats initiative. However, recent product
direction has clarified several points:

- the main product host now contains `Cats Chat`, `Cats Work`, `Cats Code`, and
  shared `Cats Core`
- `Cats Work` is only one product line, not the whole flagship product identity
- `cats-runtime` remains a separate runtime repo with a stable boundary
- the likely future public GitHub owner/org name may become `cats-inc`

If the owner/org becomes `cats-inc`, keeping the main platform repo named
`cats-inc` would create:

```text
cats-inc/cats-inc
```

That path is awkward and semantically misleading.

It over-emphasizes the "company" framing and makes the flagship platform sound
closer to the future `Cats Work` surface than to the broader platform that also
includes Chat and Code.

The project therefore needs a simple naming rule that works across:

- GitHub org/repo naming
- repo identity
- flagship product naming
- future open-source sharing
- package and executable naming

## Decision

The umbrella brand remains `Cats Inc`, but the flagship platform name becomes
`Cats`.

### Naming matrix

| Layer | Canonical Name |
|-------|----------------|
| Umbrella brand | `Cats Inc` |
| GitHub owner/org target | `cats-inc` |
| Main platform repo target | `cats` |
| Main platform product name | `Cats` |
| Runtime repo/package | `cats-runtime` |

This means the intended public repo layout becomes:

```text
cats-inc/cats
cats-inc/cats-runtime
```

### Additional naming rules

1. `Cats` is the flagship platform name, not just the Chat surface.
2. `Cats Chat`, `Cats Work`, and `Cats Code` remain product lines or surfaces
   within `Cats`.
3. `cats-runtime` keeps its current name and remains separate.
4. Public-facing platform naming should gradually move from `cats-inc` to `cats`.
5. Temporary internal compatibility names may remain during migration when
   needed to avoid unnecessary churn.

## Consequences

### Positive

- The GitHub path becomes natural: `cats-inc/cats`.
- The flagship platform name no longer sounds biased toward `Cats Work`.
- The naming model scales cleanly across Chat, Work, Code, and Core.
- The future open-source identity becomes easier to explain:
  `cats-inc` publishes `cats` and `cats-runtime`.

### Negative

- Existing docs, package metadata, and some public strings currently still say
  `cats-inc`.
- Packaging and self-hosted instructions will need a coordinated rename plan.
- Compatibility choices must be made for env vars, executable names, and any
  future published package names.

### Neutral

- This ADR does not require immediate code-level renaming of every internal
  symbol.
- This ADR does not force a repo rename before the structural platform-host
  refactor begins.
- This ADR does not change the `cats-runtime` brand or boundary.

## Alternatives Considered

### Alternative 1: Keep `cats-inc` as both owner/org and main repo name

- **Pros**: no rename effort
- **Cons**: creates `cats-inc/cats-inc`, which is awkward and sounds too close
  to the future company-control-plane identity
- **Why rejected**: the flagship platform should not read as only the "Inc"
  product shell

### Alternative 2: Rename the main platform repo to `cats-app`

- **Pros**: clearer app semantics than `cats-inc`
- **Cons**: sounds narrower and slightly more deployment-form-specific; weaker
  as the flagship platform name
- **Why rejected**: `Cats` is the stronger neutral platform identity

### Alternative 3: Rename the main platform repo to `cats-platform`

- **Pros**: explicitly communicates a platform
- **Cons**: more formal and less natural as the product's everyday name
- **Why rejected**: `Cats` is simpler and better aligned with the desired
  flagship identity

### Alternative 4: Use `OpenCats` as the main platform name

- **Pros**: stronger search distinctiveness and explicit open-source flavor
- **Cons**: sounds more like an open-source edition label than the core product
  name itself
- **Why rejected**: the platform should keep `Cats` as the product name and remain
  free to describe itself as open source without baking that into the core name

## References

- [ADR-013](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
- [ADR-025](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
- [Codex product-boundaries note](../research/2026-03-20-codex-cats-chat-work-code-product-boundaries.md)

---

*Accepted: 2026-03-21*  
*Decision makers: user + Codex*
