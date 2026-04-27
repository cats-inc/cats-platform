# SPEC-089: Companion All-Content Library Placeholder

> Track the future cross-type companion library/filter surface for "all uploads"
> or "all content" without collapsing Photos, Videos, Music, and Files in
> SPEC-085.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Placeholder |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

SPEC-085 keeps Photos, Videos, Music, and Files as separate primary tabs. It
also defines `Sources` as the raw owner-provided material management surface.
That still leaves a valid owner question: "Where do I browse everything I gave
or created for this companion in one place?"

This placeholder reserves the future all-content library/filter decision so the
v1 IA does not drift by letting each tab invent its own "all files" behavior.

## Required Future Decisions

- Whether the surface is named `All`, `All Content`, `Library`, or something
  else.
- Whether it is a tab, filter within Files, search mode, or side-panel view.
- Whether raw `Sources`, generated artifacts, derived records, and activity
  references all appear together.
- Sort/group defaults across media, documents, notes, paths, generated outputs,
  and future posts.
- Whether media also appears in Files via an all-files filter or only in the
  future all-content surface.
- How share/insert actions behave for mixed raw sources and projected content.

## Binding Constraint Until This Spec Is Expanded

SPEC-085 remains authoritative for v1:

- Photos, Videos, Music, and Files stay separate.
- `Sources` remains the complete raw owner-provided material management surface.
- `Files` contains file-like browsing/insertion projections, not every uploaded
  image, video, audio clip, note, or source.

## Dependencies

- [SPEC-085](./SPEC-085-companion-profile-feed-and-library-ia.md)
- [SPEC-086](./SPEC-086-shareable-companion-content-links-and-chat-previews.md)
- [ADR-084](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md)
- [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)

---

*Created: 2026-04-28*
*Author: Codex*
