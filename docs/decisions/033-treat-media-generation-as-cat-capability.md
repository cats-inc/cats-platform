# ADR-033: Treat Media Generation as Cat Capability, Not API Gateway

> cats-runtime will NOT become an API gateway for image/video generation
> providers. Media generation is a Cat capability declared via SKILL.md
> capabilityTags.

## Status

Proposed

## Context

Users will expect Cats to generate images, illustrations, and eventually video.
Multiple CLI providers already support media generation tools (Gemini natively,
OpenAI via DALL-E tool, others via MCP). The question is how to integrate this
into the Cats ecosystem.

There are two fundamental approaches:

1. Build provider-specific adapters in cats-runtime that proxy image generation
   API calls (the "gateway" approach)
2. Let Cats declare media generation as a capability and invoke their provider's
   tools directly (the "capability" approach)

## Decision

**Media generation is a Cat capability, not a runtime service.**

Specifically:

- Cat declares `capabilityTags: [image_gen]` (or `video_gen`) in its SKILL.md
- Cat's prompt instructs it to use the provider's native image generation tools
- Output files (`.png`, `.jpg`, `.mp4`, etc.) land in the Cat's workspace
  directory, identical to how code files are produced
- cats-runtime's existing preview surface metadata
  (`previewSurfaces.ts`) already recognizes image file extensions and
  generates appropriate `renderHint` values
- Product layer (Canvas / Chat) renders the output files inline
- New provider support requires only a new SKILL.md, not runtime code changes

**cats-runtime requires no changes for this capability.**

## Consequences

### Positive

- Zero runtime code changes — no new adapters, no new API surface
- Adding a new image generation provider is a SKILL.md edit, not a code deploy
- API keys, billing, and rate limiting stay between the Cat's CLI subscription
  and the provider — runtime has no proxy liability
- Consistent with how code generation works: Cat produces files in workspace
- Preview surface metadata already handles image extensions

### Negative

- Runtime has no visibility into image generation specifics (prompt used,
  generation parameters, cost) beyond what the provider reports via normal
  token metering
- Quality control depends entirely on the Cat's prompt engineering and the
  provider's model quality
- Not all providers support image generation via CLI — capability is
  provider-dependent

### Neutral

- Product layer needs a minor render hint extension (`inline_image` or similar)
  for Canvas to display images inline instead of offering download
- SKILL.md for media-capable Cats needs prompt guidance on how to structure
  image generation requests for different providers

## Alternatives Considered

### Alternative 1: Build Runtime Provider Adapters for Media Generation

- **Pros**: centralized control, consistent API surface, runtime-level
  metering of generation costs
- **Cons**: every new provider requires runtime code changes; runtime manages
  API keys it doesn't own; violates the product/runtime boundary established
  in ADR-018; turns runtime into a growing adapter collection
- **Why rejected**: the same reasons we don't build a "code generation adapter"
  — runtime provides the execution environment, not the generation logic

### Alternative 2: Dedicated Media Generation Microservice

- **Pros**: clean separation, could serve multiple products
- **Cons**: over-engineering; introduces a third service for something that
  already works through existing CLI provider tools; operational burden of
  managing API keys for multiple providers
- **Why rejected**: unnecessary when Cat's CLI subscription already has the
  capability

## References

- [Research: Image/Video Gen as Cat Capability](../research/2026-03-24-image-video-gen-as-cat-capability.md)
- [ADR-018](./018-separate-product-skill-intent-from-runtime-skill-hosting.md)
- `cats-runtime/src/core/browser/previewSurfaces.ts` — already recognizes
  `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg` extensions

---

*Drafted: 2026-03-24*
*Drafted by: Claude*
