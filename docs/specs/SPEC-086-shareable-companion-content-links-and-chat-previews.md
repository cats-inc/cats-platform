# SPEC-086: Shareable Companion Content Links and Chat Previews

> Define how companion posts, photos, videos, music, and files become
> product-owned references that can be inserted into chat and rendered as
> previews.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

The companion profile surface exposes content that users will want to reuse in
conversation. A raw string link is not enough. Companion content references
should be insertable into chat and render as preview cards in the composer and
transcript.

This spec defines the share/reference and preview contract for companion
content types:

- `post`
- `photo`
- `video`
- `music`
- `file`

It deliberately does not define the full durable post model. Posts only need a
minimum preview contract in this slice.

## Goals

- Let companion content be inserted into chat as structured references.
- Render preview cards for companion content references in chat.
- Support posts, photos, videos, music, and files.
- Keep references product-owned and local-first.
- Avoid coupling this feature to runtime iframe/service preview surfaces.
- Preserve room/transcript legibility when referenced content is missing,
  deleted, or unavailable.

## Non-Goals

- Defining public internet URLs or externally accessible share pages.
- Defining a complete post model, feed algorithm, authoring workflow, comments,
  reactions, or subscription behavior.
- Defining remote permission sharing across different users or machines.
- Replacing attachment uploads.
- Replacing SPEC-020 runtime preview surfaces for services and runtime
  artifacts.

## User Stories

- As an owner, I want to insert a companion file into chat so another Cat can
  reference it with context.
- As an owner, I want to share a companion post into a room so the transcript
  shows a readable preview.
- As an owner, I want photo/video/music references to render with a thumbnail or
  compact media card rather than a plain string.
- As an owner, I want old transcripts to stay understandable even if the
  referenced companion item is later removed.

## Requirements

### Functional Requirements

#### Reference targets

1. The product shall support companion content references for these target
   types:
   - `post`
   - `photo`
   - `video`
   - `music`
   - `file`
2. Each reference shall identify at least:
   - target type
   - target id
   - owning Cat id
   - owning product surface (`companion`)
3. References shall be local product objects first. Public web URLs are out of
   scope for this spec.
4. References may have a human-readable route or copied text form, but the
   renderer must resolve them through product-owned metadata rather than parsing
   arbitrary prose.

#### Minimum preview model

5. Every resolved companion content reference shall provide a preview envelope
   with at least:
   - reference id
   - type
   - title
   - optional subtitle
   - optional description or excerpt
   - optional thumbnail or icon
   - owning Cat id and display name
   - source route or open action
   - availability state
6. A post preview shall require only:
   - title or fallback label
   - excerpt/body preview
   - owning Cat
   - optional media thumbnail
   - optional created/updated timestamp
7. The post preview envelope shall not imply final post storage, authoring, or
   public visibility semantics.
8. Photo previews should prioritize an image thumbnail.
9. Video previews should prioritize a thumbnail plus duration when available.
10. Music previews should prioritize title, artist/source label when available,
    and duration when available.
11. File previews should prioritize filename, kind/media type, size when
    available, and updated timestamp when available.

#### Composer insertion

12. A companion content item shall expose an insert/share action from the
    companion profile surface.
13. The action shall be able to insert the reference into the active chat
    composer when a target chat context exists.
14. If no active chat context exists, the product may copy a local app link or
    ask the user to pick a destination in a later slice.
15. Pasting or typing a recognized companion content reference into the composer
    should resolve to a preview before send when possible.
16. The composer shall retain an editable textual representation so the user can
    remove or move the reference before sending.

#### Transcript rendering

17. Sent messages containing companion content references shall render preview
    cards in the transcript.
18. Preview cards shall be visually distinct from plain attachments and from
    runtime iframe/service previews.
19. Preview cards shall provide an open action that navigates to the companion
    content item when available.
20. If the content is missing, deleted, or inaccessible, the transcript shall
    render a stable fallback card instead of losing the reference.
21. Fallback cards shall preserve at least the original type, title/fallback
    label, and Cat identity when that metadata was captured at send time.

#### Storage and snapshots

22. Messages shall store enough snapshot metadata to keep old transcripts
    understandable if the referenced object changes.
23. Snapshot metadata should include title, type, Cat label, and thumbnail/icon
    hints when available.
24. The product may re-resolve a reference for fresh metadata, but transcript
    rendering must not depend exclusively on live lookup.

#### Scope and safety

25. Companion content references shall not grant new filesystem or transport
    permissions.
26. A preview shall not expose raw local filesystem paths unless the product UI
    already has permission to show that path.
27. A reference to a linked file shall resolve through product-owned routes or
    safe open actions.
28. External share links, public access tokens, and cross-device permission
    grants require a future spec.

#### Relationship to runtime preview surfaces

29. Companion content references are product-owned object previews.
30. SPEC-020 runtime preview surfaces remain the contract for runtime services,
    HTML artifacts, and embed-capable outputs.
31. A companion file may point at a runtime-produced artifact, but chat preview
    rendering shall still go through the companion content reference envelope.

### Non-Functional Requirements

- **Durability**: chat transcripts must remain understandable after referenced
  content changes.
- **Safety**: preview rendering must not expose unapproved paths or execute
  arbitrary embedded content.
- **Local-first**: internal references must work without a public server.
- **Extensibility**: future public share links and post semantics can build on
  this reference model without replacing it.

## Design Overview

Illustrative product-side shape:

```ts
type CompanionContentType = 'post' | 'photo' | 'video' | 'music' | 'file';

interface CompanionContentReference {
  type: CompanionContentType;
  targetId: string;
  catId: string;
  surface: 'companion';
}

interface CompanionContentPreview {
  reference: CompanionContentReference;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  icon?: string | null;
  catName: string;
  openRoute?: string | null;
  availability: 'available' | 'missing' | 'deleted' | 'inaccessible';
  snapshot?: Record<string, unknown>;
}
```

The exact serialized URL/path form is left to the implementation plan. The
contract requirement is the product-owned reference and preview envelope.

## Dependencies

- [ADR-084](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md)
- [SPEC-085](./SPEC-085-companion-profile-feed-and-library-ia.md)
- [SPEC-020](./SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)
- [SPEC-079](./SPEC-079-region-screenshot-composer-attachments.md)
- [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)

## Open Questions

- [ ] What exact local app-link format should be used for copied references?
- [ ] Should references use the same message attachment pipeline or a separate
      `embeddedReference` field?
- [ ] Should the first slice support multiple references in one message?
- [ ] Should unresolved pasted references stay as plain text or become fallback
      cards immediately?
- [ ] Which post fields are required once the durable post model is specified?
- [ ] Should a future public share route reuse the same reference ids or issue
      separate share tokens?

## References

- [ADR-019](../decisions/019-normalize-runtime-previews-as-surfaces-not-provider-iframes.md)
- [ADR-084](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md)

---

*Created: 2026-04-28*
*Author: Codex*
*Related Plan: [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)*
