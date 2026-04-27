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
- [SPEC-088: Companion Memory Bridge Contract Placeholder](../specs/SPEC-088-companion-memory-bridge-contract-placeholder.md)
- [SPEC-089: Companion All-Content Library Placeholder](../specs/SPEC-089-companion-all-content-library-placeholder.md)
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
- [ ] Render `Subscribe` as a disabled button with an explanatory tooltip until
      subscription semantics are specified.
- [ ] Keep `Share` enabled only for items that can insert or copy the SPEC-086
      companion content reference.
- [ ] Render header-level `Share` as a disabled button with an explanatory
      tooltip until a companion profile reference type or concrete selected-item
      target exists.
- [ ] Introduce an app-shell feature-flags channel. Today neither
      `PlatformHostEnvelope` (`src/shared/platform-contract.ts`) nor
      `AppShellPayload` (`src/products/shared/api/workspaceContracts.ts`)
      carries a flags map; this phase shall add a `featureFlags` channel to
      both shapes (e.g., `featureFlags: Readonly<Record<string, boolean>>` on
      `PlatformHostEnvelope`, surfaced unchanged on `AppShellPayload`) plus
      the platform-host wiring that populates it. `PlatformHostEnvelope` shall
      also carry a build-baked `buildChannel: 'development' | 'production'`
      constant that the host derives from the cats-platform build pipeline (not
      from runtime input), so the production guard below cannot be defeated by
      patching flag state.
- [ ] Persist `cats.chat.companionProfileIA` as a host-owned flag (default
      `false`) next to the durable product data root, broadcast updates over
      the existing app-shell refresh path so renderers pick up new values
      without restart, and gate every Phase 1 main-surface and side-panel
      change on the flag at both renderer and product-API entry points.
- [ ] Implement the flag-handler contract as one platform-host
      `setFeatureFlag(name, value)` function that every writer (HTTP / IPC /
      CLI / settings UI) shall route through. The function shall:
      - resolve the flag definition from a host-owned registry; unknown names
        return `unknown_flag`
      - for `cats.chat.companionProfileIA`: when `buildChannel === 'production'`
        and `value === true`, return the typed error
        `feature_flag_blocked: phase2_unlocked_required` and refuse to write
      - return `ok` for all other accepted writes and broadcast the new value
      Both the renderer-facing API endpoint and any CLI / settings UI that
      writes flags shall import this function rather than touching persisted
      state directly.
- [ ] Implement the read-side guard: when reading the persisted
      `cats.chat.companionProfileIA` value on a `production` build, the host
      shall coerce a stored `true` to `false` until the future Phase 2 unlock
      flips the gate. Renderers shall always observe the coerced value, never
      the raw persisted bit.
- [ ] Add the Phase 2 unlock procedure as a documented spec hook (a follow-up
      commit during Phase 2 lifts both the write block and the read coercion
      together; the procedure is documented but the unlock itself is not part
      of Phase 1).
- [ ] Add a developer flag-toggle entry point (CLI subcommand or settings-page
      action; not a public UI) that calls `setFeatureFlag` so dev builds can
      enable Phase 1 IA without bypassing the production guard above.

**Deliverables**: companion UI language and navigation match ADR-084.

**Release rule**: Phase 1 is an internal alignment slice, not an independent
production ship point. A production release of the revised companion profile
requires the Phase 2 read-model guards for Posts, classifier behavior,
Inspector lifecycle, and Activity aggregation. If Phase 1 is merged earlier, it
shall remain behind the runtime-checked feature flag
`cats.chat.companionProfileIA` (default `false`), surfaced through the
app-shell feature-flags channel introduced as part of this phase (see Phase 1
tasks below). The platform host (the cats-platform process owning the durable
product data root, i.e. the desktop main process for local-first installs)
shall persist the flag value next to the data root, expose it through
`AppShellPayload` / `PlatformHostEnvelope`, and broadcast updates so renderers
re-evaluate without restart.

The "production toggling is disallowed" rule is enforced by code, not by
documentation:

- `PlatformHostEnvelope` carries a build-baked `buildChannel` constant.
- All flag writes (HTTP, IPC, CLI, settings UI) route through one
  `setFeatureFlag` host-side function.
- That function rejects `cats.chat.companionProfileIA = true` writes when
  `buildChannel === 'production'`, returning
  `feature_flag_blocked: phase2_unlocked_required`.
- Reads coerce a persisted `true` back to `false` on production builds, so a
  data root carried over from a dev install cannot inadvertently flip the IA
  on in production.
- Phase 2 lifts both the write block and the read coercion as one commit when
  the read-model guards land; until that lift ships, production cannot run
  Phase 1 IA.

Compile-time `import.meta.env.DEV` paths and `vite` dev-only branches do not
satisfy this release rule because they cannot be enforced from server-side or
host-side write paths.

### Phase 2: Companion Content Projection Read Model

- [ ] Define product-owned read-model helpers for companion profile items:
      posts, photos, videos, music, files, and activity.
- [ ] Map existing companion-box sources and derived records into the new UI
      surfaces without collapsing raw `Sources` and user-facing `Files`.
- [ ] Implement `Posts` as explicit profile-post projections backed by
      `CompanionDerivedRecord` records, such as records with
      `metadata.profileSurface === 'post'`.
- [ ] Add the v1 profile-post producer as an explicit owner `Promote to post`
      action that creates or updates a `CompanionDerivedRecord` with
      `metadata.profileSurface === 'post'`,
      `metadata.profilePostStatus === 'active'`,
      `metadata.profilePostProducer === 'owner_promotion_v1'`,
      `metadata.profilePostOriginType` and `metadata.profilePostOriginId`
      pointing at the promoted item,
      `metadata.profilePostMediaRefs` set to the dialog's checked-media list
      as an ordered `Array<{ kind: 'source' | 'derived' | 'artifact'; id }>`
      (empty array when nothing is checked, never `undefined` on write), and
      preserved source lineage in top-level `sourceIds`.
- [ ] Expose `Promote to post` as an item-level overflow action from Sources
      rows, media tiles, Files rows, and eligible Inspector selections.
- [ ] Add the promotion dialog with required Title (auto-prefilled from
      selection title / derived title / filename without extension / first 60
      chars of body, in that order), optional Body/excerpt, optional Tags,
      optional per-media-item inclusion checkboxes (default-checked from the
      selection's natural media set, fed back into
      `metadata.profilePostMediaRefs` on `Promote`), `Cancel`, and `Promote`
      (disabled until Title is non-empty).
- [ ] Implement the post-card media-grid reader: render the entries listed in
      `metadata.profilePostMediaRefs` in order, resolving each `{kind, id}`
      to the matching source/derived/artifact thumbnail, and silently drop
      entries that no longer resolve rather than blocking the post.
- [ ] Add `Edit post` and `Remove from Posts`. `Remove` flips
      `metadata.profilePostStatus` to `removed` (no GC, leave the matching
      `post_removed` Activity entry) and re-promoting the same item flips it
      back to `active`.
- [ ] Use `(catId, profilePostOriginType, profilePostOriginId)` as the
      promoted-post dedup key so re-promote updates the existing record.
- [ ] Treat top-level `sourceIds` as authoritative source lineage for promoted
      posts; treat `metadata.profilePostOriginId` as a provenance pointer for
      the promoted item itself (overlapping `sourceIds` only when
      `originType === 'source'`); do not introduce
      `metadata.profilePostSourceId`.
- [ ] Do not auto-promote every source summary, caption, event, memory
      highlight, or derived record into `Posts`.
- [ ] Keep mock posts out of production runtime and use an empty state when no
      eligible profile-post projection exists.
- [ ] Implement the shared source-surface classifier from SPEC-085 for MIME and
      extension cases, including HEIC images, Markdown/text files, CSV/JSON,
      ZIP variants, SVG-as-file, case-insensitive extensions, octet-stream with
      and without recognized extensions, path refs with media extensions,
      unknown linked files, and source-only notes.
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
- [ ] Implement the first Activity vocabulary from SPEC-085.
- [ ] Add Activity aggregation: coalesce high-frequency source/memory/derived
      writes by object type and local day, with burst aggregation keyed by
      `{catId, correlationId || minuteBucket, eventGroup, targetKind}` where
      `minuteBucket` is a 60-second local-time bucket.
- [ ] Keep Activity v1 capped to 100 rendered entries or 30 days with no `Load
      more`; show a bounded older-activity-hidden indicator when relevant.
- [ ] Add Inspector selection lifecycle behavior: preserve selection across tab
      switches within the same Cat, clear on Cat/route change, and preserve
      deleted/unavailable selections as snapshot fallback until user clears or
      selects another item.
- [ ] Freeze Inspector snapshot state at the last successful resolve of the
      selected item, updating it after successful edits and before any later
      deleted/missing/inaccessible transition.
- [ ] Add a URL/route parameter for Inspector selection (e.g.,
      `?inspector={type}:{id}` on the companion route). Reload with a valid
      parameter restores selection by re-resolving; reload without it clears
      selection; malformed parameters clear selection per SPEC-085.
- [ ] Project `source_only` classifier results as Sources-only (no Posts,
      Photos, Videos, Music, or Files projection); they remain promotable.

**Deliverables**: renderer can read a coherent companion profile model without
finalizing post storage.

### Phase 3: Share Reference Contract

- [ ] Add a product-owned `CompanionContentReference` shape for:
      `post`, `photo`, `video`, `music`, and `file`.
- [ ] Add a resolver that returns a preview envelope with stable snapshot
      metadata.
- [ ] Implement the first local serialized form:
      `cats://companion/v1/{scopeId}/{catId}/{type}/{targetId}`.
- [ ] Add the platform-host product data `scopeId`: generate a UUIDv4 once per
      durable Cats product data root in the cats-platform host process (the
      desktop main process for local-first installs), persist it next to that
      data root, and surface it to all renderer surfaces through the shared
      app-shell record (the same payload that already carries cats, cat
      bindings, and channel state).
- [ ] Add parser/recognition helpers that apply checks in this fixed order:
      scheme → host → percent-decoding → version (short-circuit
      `unsupported_version` here) → segment count → target type. Each rejected
      check returns the matching `CompanionReferenceParseInvalidReason`.
      Percent-decoding runs before the version check so malformed references
      such as `cats://companion/v2/%ZZ/...` return
      `invalid: malformed_percent_encoding`, not `unsupported_version`.
- [ ] Resolve `scopeId` mismatches as `inaccessible`, not as malformed
      references.
- [ ] Return a distinct `unsupported_version` parser result for syntactically
      valid `cats://companion/...` references with unsupported versions; render
      composer affordance as an inline subdued chip labelled
      `Unsupported version`, transcript fallback card labelled
      `Unsupported reference version` plus the parsed version token, and
      Inspector/other surfaces as plain text with tooltip; never throw or drop
      the raw text.
- [ ] Keep Phase 3 to in-app parser/resolver behavior; do not register a global
      OS-level `cats://` protocol handler in this rollout.
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
- [ ] Add coverage for MIME/extension classifier edge cases: `.heic`,
      uppercase extensions such as `.JPG` and `.PDF`, extension-only linked
      paths, path refs with media extensions, `.svg`, `.md`, `.txt`,
      `application/json`, `text/csv`, `application/octet-stream` with and
      without recognized extensions, `application/zip`, and
      `application/x-zip-compressed`.
- [ ] Add coverage that companion `Memory` does not render a duplicate
      `DurableMemoryItem` ledger.
- [ ] Add coverage that the profile-post producer creates
      `metadata.profileSurface === 'post'`, and that missing producer metadata
      yields an empty state rather than falling back to production mock posts.
- [ ] Add round-trip coverage for `metadata.profilePostMediaRefs`: dialog
      checkbox selection persists into the derived record, the post-card
      reader renders the listed media items in order, an entry whose target
      no longer resolves is silently skipped, and an empty array renders no
      media grid even when the underlying source has media.
- [ ] Add coverage for the `cats.chat.companionProfileIA` production guard:
      `setFeatureFlag('cats.chat.companionProfileIA', true)` with
      `buildChannel === 'production'` returns
      `feature_flag_blocked: phase2_unlocked_required` for HTTP, IPC, CLI,
      and settings-UI write paths; with `buildChannel === 'development'` the
      same call returns `ok` and broadcasts the new value; reads on a
      production build coerce a persisted `true` to `false`; reads on a
      development build return the persisted value verbatim. Include a guard
      that the Phase 2 unlock path lifts both the write block and the read
      coercion atomically.
- [ ] Add a build-time lint/test guard, not a runtime throw, that production
      companion feed code cannot import `MOCK_POSTS` or fixture-only post data.
- [ ] Add parser fuzz coverage for `cats://` references, including wrong
      scheme, wrong host, extra segments, missing segments, unknown version,
      unsupported version, unknown type, malformed percent-encoding, and
      `scopeId` mismatch. Include the
      `cats://companion/v2/%ZZ/...` case to verify
      `invalid: malformed_percent_encoding` short-circuits ahead of any
      `unsupported_version` decision.
- [ ] Add coverage that item-level `Share` is not an enabled inert button, and
      header-level `Share` plus `Subscribe` are disabled with explanatory
      tooltips in v1.
- [ ] Add coverage for Inspector empty state and unavailable-item fallback.
- [ ] Add coverage for Inspector selection lifecycle across tab change, Cat
      change, deletion, and reload-without-selection.
- [ ] Add coverage for reload-with-valid-selection-param restore and
      reload-with-malformed-selection-param clear behavior.
- [ ] Add coverage for Activity aggregation so high-frequency memory/source
      writes do not render as a raw write log.
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
| `src/shared/platform-contract.ts` | Modify | Add `featureFlags` channel and build-baked `buildChannel` constant to `PlatformHostEnvelope` for the Phase 1 release-flag mechanism |
| `src/products/shared/api/workspaceContracts.ts` | Modify | Surface `featureFlags` (and `buildChannel` if renderers need it) from `AppShellPayload` so renderers can gate Phase 1 IA at runtime |
| `src/app/server/**` | Modify | Platform-host wiring that populates and broadcasts `featureFlags`, hosts the single `setFeatureFlag` write entry point with the production guard, and exposes the read-side coercion (integration-owned; coordinate before editing) |
| `tests/**` | Modify/Create | Reference resolver, snapshot fallback, and renderer-adjacent regression tests |
| `docs/specs/*` | Modify/Create | Follow-up post model spec when post semantics are ready |

## Technical Decisions

- Use `Behavior`, not `Settings`, inside the companion side panel.
- Keep transport binding management canonical in `Settings > My Cats`.
- Treat posts as explicit `CompanionDerivedRecord` profile-post projections
  until a post-model spec lands.
- Produce v1 post projections only through explicit owner promotion, not
  automatic source ingestion.
- Keep mock posts out of production runtime.
- Use one shared MIME/extension classifier for Sources, Files, Photos, Videos,
  and Music. The classifier is case-insensitive, treats SVG as file by default,
  handles `application/octet-stream` by extension first, and lets `path_ref`
  classify as media when its linked path/source URL has a media extension.
- Treat `Sources` as raw `CompanionSourceRecord` management and `Files` as
  file-like browsing/insertion projections; the same PDF can appear in both.
- Treat companion side-panel `Memory` as `CompanionMemoryRecord` in v1 and do
  not duplicate the `DurableMemoryItem` Settings ledger.
- Use `cats://companion/v1/{scopeId}/{catId}/{type}/{targetId}` as the first
  local serialized reference form.
- Define `scopeId` as the platform-host product data scope UUIDv4, generated
  once per durable Cats product data root by the cats-platform host process,
  persisted next to that root, and surfaced through the shared app-shell
  record. Local-first installs use the desktop main process as the platform
  host. `scopeId` is not an auth account id, browser storage value, or
  workspace id.
- Phase 1 release rule is enforced by code: a host-baked `buildChannel`
  constant on `PlatformHostEnvelope`, a single `setFeatureFlag` write
  function that rejects `cats.chat.companionProfileIA = true` on production
  builds with `feature_flag_blocked: phase2_unlocked_required`, and a
  read-side coercion that forces persisted `true` back to `false` on
  production. Build-time `import.meta.env.DEV` paths do not count because
  they cannot be enforced from server-side write paths.
- Promoted-post media inclusion persists in
  `metadata.profilePostMediaRefs` as an ordered
  `Array<{ kind: 'source' | 'derived' | 'artifact'; id }>`; the post-card
  reader silently drops entries that no longer resolve rather than blocking
  the post.
- Promote-to-post identity dedup key is
  `(catId, profilePostOriginType, profilePostOriginId)`; re-promote updates
  the existing record and can flip `removed` back to `active`.
- Inspector selection is restorable via a route parameter; reload without it
  clears selection.
- Keep `cats://` resolution in-app in this rollout; do not register a global OS
  protocol handler yet.
- Treat unsupported `cats://companion` versions as `unsupported_version`, not as
  `missing` or `inaccessible`.
- Render `Subscribe` disabled in v1 with an explanatory tooltip; enable item
  `Share` only when it performs insertion or copy.
- Render header-level `Share` disabled with an explanatory tooltip until it has
  a concrete supported reference target.
- Aggregate Activity entries rather than rendering a raw source/memory write
  log, using a 60-second burst bucket when no operation correlation id exists.
- Freeze Inspector unavailable snapshots at the last successful resolve.
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
| Production Posts stay empty indefinitely | High | Add explicit owner `Promote to post` producer in Phase 2 |
| Production Posts stay mock-backed indefinitely | High | Ban production `MOCK_POSTS`; show empty state until explicit profile-post projections exist |
| Header actions render as inert buttons | Medium | Render `Subscribe` and header-level `Share` disabled with explanatory tooltips; only enable item `Share` when insertion or copy works |
| Activity becomes a raw memory/source write log | Medium | Aggregate high-frequency writes and cap visible history |
| Chat previews break old transcripts when content changes | High | Persist snapshot metadata with messages |
| Runtime preview and companion reference preview models get conflated | Medium | Keep SPEC-020 runtime preview surfaces separate from companion object previews |

## Progress Log

| Date | Update |
|------|--------|
| 2026-04-28 | Plan created for revised companion profile IA and shareable chat previews |

---

*Created: 2026-04-28*
*Author: Codex*
