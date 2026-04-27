# PLAN-077: Companion Profile and Share Preview Rollout

> Roll out the revised companion profile/feed/library IA and the companion
> content reference previews that let posts, media, and files be inserted into
> chat.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Related Specs

- [SPEC-085: Companion Profile, Feed, and Library IA](../specs/SPEC-085-companion-profile-feed-and-library-ia.md)
- [SPEC-086: Shareable Companion Content Links and Chat Previews](../specs/SPEC-086-shareable-companion-content-links-and-chat-previews.md)
- [ADR-084: Adopt Companion Profile IA and Shareable Content References](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md)

## Overview

The rollout has two linked tracks:

1. Companion IA: make the companion main surface a profile/library with
   `Posts / Photos / Videos / Music / Files / Activity`, and move control
   concepts into `Status / Sources / Memory / Behavior / Inspector`.
2. Share previews: define and implement product-owned companion content
   references that can be inserted into chat and rendered as preview cards.

The first implementation should keep post semantics intentionally narrow. It may
ship a mock or projection-backed `Posts` surface, but it should not claim that
the final post model is complete.

## Implementation Phases

### Phase 1: IA Rename and Shell Alignment

- [ ] Update companion tab labels/order to:
      `Posts / Photos / Videos / Music / Files / Activity`.
- [ ] Remove `Overview`, `Resources`, `Creations`, and `Settings` as primary
      companion main-surface labels.
- [ ] Keep `Files` on the main surface.
- [ ] Keep `Activity` last.
- [ ] Rename side-panel sections to:
      `Status / Sources / Memory / Behavior / Inspector`.
- [ ] Remove `Settings` wording from the companion side panel.
- [ ] Make Telegram/LINE binding display read-only in companion, with deep
      links to `Settings > My Cats` when management is needed.

**Deliverables**: companion UI language and navigation match ADR-084.

### Phase 2: Companion Content Projection Read Model

- [ ] Define product-owned read-model helpers for companion profile items:
      posts, photos, videos, music, files, and activity.
- [ ] Map existing companion-box sources and derived records into the new UI
      surfaces without collapsing raw `Sources` and user-facing `Files`.
- [ ] Keep post items projection-backed or mock-backed until the durable post
      model is specified.
- [ ] Add a small activity vocabulary for first-slice events.

**Deliverables**: renderer can read a coherent companion profile model without
finalizing post storage.

### Phase 3: Share Reference Contract

- [ ] Add a product-owned `CompanionContentReference` shape for:
      `post`, `photo`, `video`, `music`, and `file`.
- [ ] Add a resolver that returns a preview envelope with stable snapshot
      metadata.
- [ ] Decide the first local serialized form for copied/inserted references.
- [ ] Ensure unavailable/deleted/inaccessible content resolves to fallback
      preview data.

**Deliverables**: stable reference and preview contract for companion content.

### Phase 4: Chat Composer Insertion

- [ ] Add share/insert actions on companion profile items.
- [ ] Insert references into the active chat composer when available.
- [ ] Detect recognized companion references in pasted composer text.
- [ ] Render composer preview cards before send when possible.
- [ ] Preserve removable/editable composer behavior.

**Deliverables**: companion content can be inserted into chat before sending.

### Phase 5: Transcript Preview Rendering

- [ ] Persist companion reference snapshot metadata on sent chat messages.
- [ ] Render transcript preview cards for companion references.
- [ ] Add open actions back to the companion item route.
- [ ] Render stable fallback cards for missing/deleted/inaccessible content.
- [ ] Keep these cards visually distinct from runtime iframe/service previews
      and ordinary file attachments.

**Deliverables**: sent chat messages show durable companion content previews.

### Phase 6: Verification and Follow-Up Spec Hooks

- [ ] Add focused tests for reference resolution and fallback snapshots.
- [ ] Add renderer tests or smoke coverage for tab order and side-panel labels.
- [ ] Add smoke coverage for inserting a file reference into chat and rendering
      a preview.
- [ ] Document remaining post-model open questions in the relevant follow-up
      spec or plan.

**Deliverables**: IA and share-preview behavior are covered without pretending
the post model is finalized.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/renderer/components/companion/*` | Modify/Create | Companion profile tabs, feed/library/activity surfaces, side-panel sections |
| `src/products/chat/renderer/styles/chat-companion.css` | Modify | Companion profile, tab, card, preview, and side-panel styling |
| `src/products/chat/companion/*` | Modify/Create | Companion profile read-model and content projection helpers |
| `src/products/chat/shared/*` | Modify/Create | Browser-safe companion reference helpers if renderer and API both need them |
| `src/products/chat/api/*` | Modify/Create | Preview/reference resolver routes if needed |
| `src/products/chat/state/*` | Modify | Message storage/read models for reference snapshots if needed |
| `src/products/shared/renderer/components/*` | Modify/Create | Shared preview card primitives only if used by more than companion |
| `tests/**` | Modify/Create | Reference resolver, snapshot fallback, and renderer-adjacent regression tests |
| `docs/specs/*` | Modify/Create | Follow-up post model spec when post semantics are ready |

## Technical Decisions

- Use `Behavior`, not `Settings`, inside the companion side panel.
- Keep transport binding management canonical in `Settings > My Cats`.
- Treat posts as previewable content projections until a post-model spec lands.
- Treat companion content previews as product-owned object previews, separate
  from SPEC-020 runtime preview surfaces.
- Preserve snapshot metadata in chat messages so old transcripts remain useful.

## Testing Strategy

- **Unit Tests**
  - companion tab/read-model projection helpers
  - content reference serialization/parsing helpers
  - preview resolver fallback behavior
  - message snapshot preservation
- **Renderer Tests**
  - tab order: Posts, Photos, Videos, Music, Files, Activity
  - side panel labels: Status, Sources, Memory, Behavior, Inspector
  - composer preview rendering for inserted companion references
  - transcript fallback card rendering
- **Manual Smoke**
  - open a companion profile from a direct lane
  - verify `Files` is a main tab
  - verify `Activity` is last
  - insert a file reference into chat
  - send and reopen the chat to confirm the preview persists
  - verify Telegram management links to canonical settings rather than showing
    duplicate controls

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Post UI implies a finalized post model too early | High | Keep Posts projection-backed and mark post model open in docs |
| Companion side panel duplicates Settings | Medium | Ban `Settings` section label and deep-link transport management to canonical settings |
| Files and Sources blur together | High | Keep `Files` main-surface and `Sources` side-panel substrate with separate read-model labels |
| Chat previews break old transcripts when content changes | High | Persist snapshot metadata with messages |
| Runtime preview and companion reference preview models get conflated | Medium | Keep SPEC-020 runtime preview surfaces separate from companion object previews |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-28 | Plan created for revised companion profile IA and shareable chat previews |

---

*Created: 2026-04-28*
*Author: Codex*
