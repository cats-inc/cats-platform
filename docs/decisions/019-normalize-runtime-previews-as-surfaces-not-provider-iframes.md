# ADR-019: Normalize Runtime Previews as Surfaces, Not Provider Iframes

> Treat in-place previews as normalized runtime-reported surfaces and let
> `cats-inc` decide rendering, instead of letting providers emit raw iframe
> payloads directly.

## Status

Accepted

## Context

`cats-inc` is moving toward richer room-native work, and some tasks will
eventually produce outputs that are better shown in place than only as text:

- web previews
- HTML reports
- dashboards
- documents and generated artifacts
- local services started as part of a run

The current stack already contains useful groundwork:

- `cats-runtime` has backend-neutral `outputDir`, `artifacts`, `summary`, and
  `services` concepts
- the `agent` backend already anticipates surfaced runtime services and preview
  URLs
- `cats-inc` architecture documents already leave room for a preview-ready pane

However, there is not yet a formal product/runtime rule for how in-place
preview should work across providers, especially CLI-backed providers.

The tempting but wrong question is:

- "Can a provider return an iframe?"

That is the wrong contract boundary because:

- a provider should not dictate frontend embed markup
- raw iframe HTML is not a portable runtime contract
- rendering and security policy belong in the product shell

What the stack actually needs is:

- a normalized preview-surface model from runtime
- a product-owned rendering decision in `cats-inc`

## Decision

`cats-inc` and `cats-runtime` will treat in-place preview as a normalized
surface contract, not as provider-returned iframe markup.

1. Providers and runtime adapters should report preview-capable outputs as
   surface metadata.
   - runtime services with URLs
   - artifacts such as HTML files
   - other normalized output references

2. `cats-runtime` should normalize those outputs into backend-neutral preview
   surfaces when possible.
   - CLI providers may participate if runtime can infer or surface a local
     service URL, HTML artifact, or equivalent preview target
   - `agent` backends may surface services and artifacts more directly

3. `cats-inc` owns rendering policy.
   - decide whether a surface is shown inline
   - decide whether inline rendering uses an iframe
   - decide whether the safer fallback is open-in-browser, download, or summary

4. Raw provider-generated iframe markup is not the contract.
   - providers should not be expected to emit `<iframe>` HTML
   - runtime should not expose arbitrary raw iframe blobs as a normative API

5. The first preview-capable surface types should be conservative.
   - local service URL suitable for preview
   - HTML artifact
   - explicit unsupported/unsafe fallback for other cases

6. Security policy belongs above the provider layer.
   - `cats-inc` should apply allowlists, sandboxing, and/or proxy serving as
     needed
   - not every reported surface must be embedded inline

## Consequences

### Positive

- The contract works across `cli`, `api`/`local`, and `agent` backends.
- `cats-inc` keeps control over UI and safety policy.
- CLI providers can participate without pretending they natively know what an
  iframe is.
- Artifact and service surfacing remain useful even when inline embedding is
  not allowed.

### Negative

- The team must define another normalized contract above raw provider output.
- `cats-inc` needs a preview pane/read model instead of just transcript text.
- Some providers will only support summary/download flows at first.

### Neutral

- This ADR does not require every provider to support inline preview.
- This ADR does not require the first slice to embed arbitrary remote URLs.
- This ADR does not force preview UX into the main transcript.

## Alternatives Considered

### Alternative 1: Let providers emit raw iframe HTML

- **Pros**: looks simple
- **Cons**: leaks frontend markup into runtime/provider contracts; poor
  portability and security
- **Why rejected**: rendering belongs to the product shell

### Alternative 2: Only allow plain-text transcript outputs

- **Pros**: simple implementation
- **Cons**: too weak for web previews, reports, and service-backed outputs
- **Why rejected**: the product needs richer in-place result presentation

### Alternative 3: Restrict previews to agent backends only

- **Pros**: easier first implementation
- **Cons**: unnecessarily excludes CLI-driven outputs such as local previews or
  generated HTML artifacts
- **Why rejected**: the contract should stay backend-neutral

## References

- [ADR-008](./008-expose-cats-runtime-via-direct-api-and-mcp-facade.md)
- [ADR-018](./018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- [SPEC-005](../specs/SPEC-005-company-control-plane-evolution.md)
- [cats-runtime ADR-006](../../../cats-runtime/docs/decisions/006-agent-backend-and-shared-runtime-contracts.md)
- [cats-runtime SPEC-003](../../../cats-runtime/docs/specs/SPEC-003-agent-backend.md)

---

*Accepted: 2026-03-19*
*Accepted by: user direction captured through Codex*
