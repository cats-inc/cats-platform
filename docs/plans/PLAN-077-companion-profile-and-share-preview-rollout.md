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

The first implementation should keep post semantics intentionally narrow. It
shall use explicit profile-post projections backed by `CompanionDerivedRecord`
for production runtime, while keeping mock posts limited to dev fixtures,
storybook, or tests. It should not claim that the final post model is complete.

## Implementation Phases

### Phase 1: IA Rename and Shell Alignment

- [ ] Update companion main tab labels/order from the current
      `Posts / Videos / Photos / Music / Files` to:
      `Posts / Photos / Videos / Music / Files / Activity`.
- [ ] Add `Activity` as a new primary tab and keep it last.
- [ ] Keep `Files` on the main surface.
- [ ] Migrate the current companion side panel from
      `Overview / Resources / Creations / Memory / Settings` to:
      `Status / Sources / Memory / Behavior / Inspector`.
- [ ] Map the old side-panel concepts as follows:
      `Overview` -> `Status`, `Resources` -> `Sources`,
      response/profile controls from `Settings` -> `Behavior`,
      contextual details -> `Inspector`.
- [ ] Do not keep `Creations` as a side-panel section; project created output
      into Posts, Photos, Videos, Music, Files, or Activity.
- [ ] Remove `Settings` wording from the companion side panel.
- [ ] Make Telegram/LINE binding display read-only in companion, with deep
      links to `Settings > My Cats` when management is needed.
- [ ] Hide or visibly disable `Subscribe` with an explanatory tooltip until
      subscription semantics are specified.
- [ ] Keep `Share` enabled only for items that can insert or copy the SPEC-086
      companion content reference.
- [ ] Hide or visibly disable header-level `Share` with an explanatory tooltip
      until a companion profile reference type or concrete selected-item target
      exists.

**Deliverables**: companion UI language and navigation match ADR-084.

### Phase 2: Companion Content Projection Read Model

- [ ] Define product-owned read-model helpers for companion profile items:
      posts, photos, videos, music, files, and activity.
- [ ] Map existing companion-box sources and derived records into the new UI
      surfaces without collapsing raw `Sources` and user-facing `Files`.
- [ ] Implement `Posts` as explicit profile-post projections backed by
      `CompanionDerivedRecord` records, such as records with
      `metadata.profileSurface === 'post'`.
- [ ] Keep mock posts out of production runtime and use an empty state when no
      eligible profile-post projection exists.
- [ ] Implement the `Sources`/`Files` projection rule:
      owner-uploaded file-like sources, including PDFs, appear in `Sources` for
      provenance/ingestion management and in `Files` for browsing/opening/chat
      insertion.
- [ ] Keep `Sources` keyed to raw `CompanionSourceRecord` inputs.
- [ ] Keep `Files` keyed to file-like projections that preserve their source id
      or artifact id.
- [ ] Keep companion `Memory` as one side-panel surface backed by
      `CompanionMemoryRecord`; do not render the `Settings > My Cats`
      `DurableMemoryItem` list as a second companion memory ledger.
- [ ] Add a small activity vocabulary for first-slice events.

**Deliverables**: renderer can read a coherent companion profile model without
finalizing post storage.

### Phase 3: Share Reference Contract

- [ ] Add a product-owned `CompanionContentReference` shape for:
      `post`, `photo`, `video`, `music`, and `file`.
- [ ] Add a resolver that returns a preview envelope with stable snapshot
      metadata.
- [ ] Implement the first local serialized form:
      `cats://companion/{catId}/{type}/{targetId}`.
- [ ] Add parser/recognition helpers for the canonical local form and reject
      unknown target types or malformed segments.
- [ ] Ensure `available`, `missing`, `deleted`, and `inaccessible` states follow
      SPEC-086 definitions and resolve to the right fallback preview data.

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
- [ ] Add smoke coverage for the current-to-target tab migration, including
      `Videos` moving after `Photos` and `Activity` appearing last.
- [ ] Add coverage for the owner-uploaded PDF rule: same source projects into
      both `Sources` and `Files` with one preserved source identity.
- [ ] Add coverage that companion `Memory` does not render a duplicate
      `DurableMemoryItem` ledger.
- [ ] Add coverage that `Share` is not an enabled inert button and `Subscribe`
      is hidden or disabled in v1.
- [ ] Add coverage for Inspector empty state and unavailable-item fallback.
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
- Treat posts as explicit `CompanionDerivedRecord` profile-post projections
  until a post-model spec lands.
- Keep mock posts out of production runtime.
- Treat `Sources` as raw `CompanionSourceRecord` management and `Files` as
  file-like browsing/insertion projections; the same PDF can appear in both.
- Treat companion side-panel `Memory` as `CompanionMemoryRecord` in v1 and do
  not duplicate the `DurableMemoryItem` Settings ledger.
- Use `cats://companion/{catId}/{type}/{targetId}` as the first local
  serialized reference form.
- Hide or disable `Subscribe` in v1 with an explanatory tooltip when disabled;
  enable `Share` only when it performs insertion or copy.
- Hide or disable header-level `Share` with an explanatory tooltip until it has
  a concrete supported reference target.
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
| Companion Memory duplicates Settings memory | High | Use `CompanionMemoryRecord` as the only companion side-panel memory ledger in v1 and require a bridge contract before merging with `DurableMemoryItem` |
| Files and Sources blur together | High | Implement explicit projection rules and preserve one source identity when a PDF appears in both |
| Production Posts stay mock-backed indefinitely | High | Ban production `MOCK_POSTS`; show empty state until explicit profile-post projections exist |
| Header actions render as inert buttons | Medium | Hide/disable `Subscribe`; only enable `Share` when insertion or copy works |
| Chat previews break old transcripts when content changes | High | Persist snapshot metadata with messages |
| Runtime preview and companion reference preview models get conflated | Medium | Keep SPEC-020 runtime preview surfaces separate from companion object previews |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-28 | Plan created for revised companion profile IA and shareable chat previews |

---

*Created: 2026-04-28*
*Author: Codex*
