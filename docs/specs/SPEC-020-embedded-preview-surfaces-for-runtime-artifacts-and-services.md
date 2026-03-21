# SPEC-020: Embedded Preview Surfaces for Runtime Artifacts and Services

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft (Pending Review) |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats` should be able to show preview-capable runtime outputs in place,
including some outputs produced by CLI-backed providers. The correct contract is
not "provider returns iframe HTML". The correct contract is:

- `cats-runtime` reports normalized preview-capable surfaces
- `cats` decides whether and how to render them inline

This spec defines that product/runtime direction.

## Goals

- allow in-place preview for some runtime outputs without coupling UI rendering
  to provider-specific markup
- let CLI-backed providers participate when they can expose previewable outputs
- keep preview support backend-neutral across `cli`, `api`/`local`, and
  `agent`
- preserve product-owned rendering and safety policy in `cats`

## Non-Goals

- requiring every provider to support inline preview
- allowing arbitrary raw HTML or arbitrary iframe payloads from providers
- finalizing the full preview-pane UI in this document
- replacing transcript, artifact history, or download flows

## User Stories

- As an operator, I want a Cat to generate a local preview or HTML report and
  let me inspect it directly inside `cats`.
- As an operator, I want the app to decide whether something can be safely
  embedded instead of blindly trusting provider output.
- As a runtime integrator, I want one normalized way to surface previewable
  outputs regardless of backend family.

## Requirements

### Functional Requirements

1. `cats-runtime` should be able to surface preview-capable outputs as
   normalized preview surfaces.
2. A preview surface may be derived from at least these source types:
   - runtime service with URL
   - HTML artifact
   - other explicit output references that the runtime can classify safely
3. CLI-backed providers may participate if `cats-runtime` can surface a
   previewable service URL or previewable artifact from that run.
4. Providers and adapters shall not be required to emit raw iframe HTML as part
   of the public contract.
5. `cats` shall decide whether a preview surface is:
   - embedded inline
   - opened externally
   - shown as a download/open artifact
   - summarized only
6. The first slice should prioritize these embed-friendly cases:
   - local service URL intended for preview
   - HTML artifact intended for preview
7. `cats` should expose preview surfaces in a dedicated pane, panel, or
   split-view surface rather than mixing full preview payloads into the main
   transcript.
8. Preview surfaces should remain associated with the room/run that produced
   them.
9. If a surface is not safe or suitable for inline embedding, the UI shall fall
   back gracefully instead of failing the run.
10. Runtime session/history surfaces should keep enough metadata for `cats`
    to reference surfaced previews later.

### Non-Functional Requirements

- **Backend neutrality**: the model should work across multiple runtime backend
  families
- **Safety**: inline embedding must remain subject to product-owned policy
- **Observability**: surfaced previews should be inspectable even when inline
  render is disabled
- **Graceful fallback**: unsupported preview surfaces should still be visible as
  outputs or artifacts

## Proposed Surface Model

Illustrative shape:

```ts
interface PreviewSurface {
  id: string;
  kind: 'service' | 'artifact';
  label?: string;
  renderHint?: 'iframe' | 'open_external' | 'download' | 'none';
  url?: string;
  artifactId?: string;
  mediaType?: string;
  provenance?: {
    sessionId?: string;
    roomId?: string;
    provider?: string;
  };
  metadata?: Record<string, unknown>;
}
```

Notes:

- this is intentionally product-facing
- runtime may use existing `services` and `artifacts` fields as the lower-level
  source
- not every surfaced output must become a `PreviewSurface`

## Rendering Rules

### Runtime Responsibilities

- expose artifacts, services, summary, and related metadata
- preserve enough information for product-side preview derivation
- stay backend-neutral

### Product Responsibilities

- derive or consume normalized preview surfaces
- apply safety policy
- choose inline iframe vs fallback behavior
- decide where preview appears in the UI

## Source-Type Guidance

### Runtime Service URL

Best fit for:

- local preview servers
- dashboards
- temporary dev/app previews

Expected product behavior:

- prefer inline embedding only when the URL is allowed by local policy
- otherwise offer external open

### HTML Artifact

Best fit for:

- generated reports
- exported dashboards
- rendered landing-page previews

Expected product behavior:

- serve through a controlled local route or equivalent safe mechanism
- embed if allowed, otherwise provide open/download fallback

### Other Artifacts

Best fit for:

- images
- PDFs
- structured files

Expected product behavior:

- may later gain specialized viewers
- not required to be iframe-embeddable in the first slice

## Design Notes

- This spec deliberately avoids promising that every runtime output will become
  an inline iframe.
- The existing `cats-runtime` contract already has the seeds of this model via
  `outputDir`, `artifacts`, `summary`, and `services`; `cats` still needs a
  richer read model and UI to consume it.
- The preview pane should complement the chat transcript rather than turn the
  transcript into an HTML dump or browser tab emulator.

## Dependencies

- [SPEC-005](./SPEC-005-company-control-plane-evolution.md)
- [ADR-019](../decisions/019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [cats-runtime ADR-006](../../../cats-runtime/docs/decisions/006-agent-backend-and-shared-runtime-contracts.md)
- [cats-runtime SPEC-003](../../../cats-runtime/docs/specs/SPEC-003-agent-backend.md)

## Open Questions

- [ ] Should preview surfaces be persisted directly in the `cats` read
      model, or derived lazily from runtime history/session metadata in the
      first slice?
- [ ] What is the minimum allowlist/sandbox policy for inline iframe rendering
      of local preview URLs?
- [ ] Should `cats` expose one generic preview pane first, or specialized
      viewers by media type from the start?

## References

- [terminology.md](../terminology.md)
- [Architecture](../architecture.md)
- [cats-runtime API](../../../cats-runtime/docs/api.md)

---

*Created: 2026-03-19*
*Author: Codex*
