# SPEC-085: Companion Profile, Feed, and Library IA

> Define the revised companion profile surface for Cats Chat: posts, separate
> media tabs, files, activity, and a control/inspector side panel without
> duplicating canonical settings.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

The visible companion surface should feel like a Cat's persistent profile and
content library. It should not feel like a generic dashboard or a second
settings area.

This spec replaces the older visible IA from SPEC-036 for the companion main
surface. It keeps the first-class companion direction, but changes the
navigation and ownership model:

- main tabs: `Posts / Photos / Videos / Music / Files / Activity`
- no `About` tab
- `Activity` last
- `Files` visible on the main surface
- side panel sections: `Status / Sources / Memory / Behavior / Inspector`
- no companion-local `Settings` section
- transport binding management remains canonical under `Settings > My Cats`

## Goals

- Make companion mode read as a persistent Cat profile, not a settings
  dashboard.
- Keep posts visible while explicitly leaving the full post model undefined.
- Keep photos, videos, music, and files as separate primary tabs.
- Keep activity discoverable but secondary by placing it last.
- Give the side panel a focused control/inspection role.
- Avoid duplicating Telegram/LINE configuration outside canonical settings.
- Avoid duplicating companion memory as a second copy of `Settings > My Cats`
  memory.
- Define projection rules for `Sources` versus `Files` so implementation does
  not invent the boundary.
- Prepare the UI for companion content that can later be inserted into chat as
  previewable share references.

## Non-Goals

- Defining the full post authoring, publication, reaction, comment, or
  subscription model.
- Defining public internet share pages.
- Replacing `Settings > My Cats` as the canonical Cat settings route.
- Merging `DurableMemoryItem` and `CompanionMemoryRecord` schemas.
- Merging photos, videos, and music into a single `Media` tab.
- Replacing the direct-lane chat transcript contract.
- Moving companion-owned profile or library state into `cats-runtime`.

## User Stories

- As an owner, I want a companion page to feel like the Cat's profile, so I can
  browse what it has posted, collected, and produced.
- As an owner, I want files to be visible as a first-class library, so I can
  quickly find and reuse them.
- As an owner, I want activity to exist without dominating the page, so I can
  inspect recent actions only when needed.
- As an owner, I want transport setup to remain in Settings, so there is only
  one place to manage Telegram or LINE binding.
- As an owner, I want controls such as wake/sleep, memory, behavior, and source
  management close by without turning the main profile into a configuration
  form.

## Requirements

### Functional Requirements

#### Profile shell

1. The companion surface shall render as a Cat-scoped profile page above the
   existing direct-lane routing foundation.
2. The profile page shall include a prominent profile header with at least:
   - Cat name
   - avatar
   - cover image when available
   - companion-mode navigation back to chat
   - `Share` only where it can insert or copy a SPEC-086 companion content
     reference
   - header-level `Share` rendered as a disabled button with an explanatory
     tooltip in v1 unless a companion profile reference type is specified
   - `Subscribe` rendered as a disabled button with an explanatory tooltip in
     v1 until subscription semantics are specified
3. The profile page shall not include an `About` tab in the primary tab bar.
4. If profile metadata is needed later, it shall be displayed in the header or
   another scoped profile region rather than added as a primary `About` tab by
   default.

#### Main tabs

5. The main companion tab order shall be:
   1. `Posts`
   2. `Photos`
   3. `Videos`
   4. `Music`
   5. `Files`
   6. `Activity`
6. `Activity` shall be the last primary tab.
7. Photos, videos, and music shall remain separate primary tabs in this IA.
8. The main tabs shall be horizontal on desktop and horizontally scrollable on
   narrow viewports when needed.

Existing implementations that render `Posts / Videos / Photos / Music / Files`
shall migrate to `Posts / Photos / Videos / Music / Files / Activity`.
`Activity` is a new primary tab in this IA, not a rename of an existing media
tab.

#### Posts

9. `Posts` shall be a visible feed surface.
10. A post shall be treated as a companion content projection until a later spec
    defines the durable post model.
11. The first production implementation shall render `Posts` from
    product-owned profile-post projections backed by `CompanionDerivedRecord`
    records explicitly marked for the profile feed, for example
    `metadata.profileSurface === 'post'`. Production runtime shall not use
    open-ended `MOCK_POSTS`, shall not silently promote all memory highlights,
    and shall show an empty state when no eligible post projection exists.
12. The v1 producer for these records shall be a product-owned companion
    profile-post projection command in the companion-box ingestion/update
    layer. It may be implemented near `createDerivedRecordsForSource`, but it
    must be callable as an item-level overflow action named `Promote to post`
    from:
    - a `Sources` row
    - a Photos/Videos/Music tile
    - a `Files` row
    - a selected source, media item, file, or derived record in `Inspector`
13. `Promote to post` shall open a lightweight dialog before writing. The
    dialog shall let the owner review or edit title, body/excerpt, tags, and
    media inclusion; `Cancel` shall close without writing.
14. The v1 producer shall create or update a `CompanionDerivedRecord` with:
    - `metadata.profileSurface === 'post'`
    - `metadata.profilePostStatus === 'active'`
    - `metadata.profilePostProducer === 'owner_promotion_v1'`
    - `metadata.profilePostOriginType` in `source`, `derived`, or `artifact`
    - `metadata.profilePostOriginId` set to the selected item id
    - `sourceIds` preserving the underlying source lineage when available
15. `sourceIds` is the authoritative source-lineage field for profile posts.
    The product shall not duplicate source truth in
    `metadata.profilePostSourceId`; if future metadata conflicts with
    `sourceIds`, `sourceIds` wins.
16. Once an item is promoted, the item-level action shall become `Edit post`
    and `Remove from Posts`. `Edit post` reopens the same dialog and updates
    the profile-post derived record; it shall not mutate the original source
    record. `Remove from Posts` shall set
    `metadata.profilePostStatus === 'removed'`, and `Posts` readers shall only
    include records whose status is `active`.
17. Source ingestion shall not automatically promote every summary, caption,
    note, event, or memory highlight into `Posts`. Automatic post producers
    require a later post-model decision.
18. Post cards should support at least:
    - author Cat identity
    - time or relative timestamp
    - body/excerpt
    - optional hashtags or tags
    - optional media grid
    - optional item-level share action
19. The product shall not add comment input to companion posts by default.

#### Photos, videos, and music

20. `Photos` shall show image-like companion content from product-owned sources,
    derived records, or artifact projections.
21. `Videos` shall show video-like companion content from product-owned sources,
    derived records, or artifact projections.
22. `Music` shall show audio/music-like companion content from product-owned
    sources, derived records, or artifact projections.
23. These tabs may use placeholder/mock projections in early UI slices, but the
    IA shall keep their labels distinct.
24. Media records whose source substrate is also owner-provided material shall
    still appear in `Sources`; their media-tab appearance is a browsing
    projection, not a second stored object.

#### Files

25. `Files` shall be a primary main-surface tab.
26. `Files` shall show document/file-like companion content that can be opened,
    referenced, or inserted into chat.
27. `Files` shall not be hidden inside the side panel.
28. `Files` may include imported resources, linked files, and generated
    artifacts when they are file-like and user-browsable.
29. A source shall project into `Files` only when the shared classifier marks it
    as `file`. The classifier shall use `kind`, normalized `mimeType`, and the
    extension from `originalFileName`, `linkedPath`, or `sourceUrl`;
    `storedPath` alone is not enough because imported notes may also have
    materialized storage.
30. The same owner-uploaded PDF shall appear in both `Sources` and `Files`:
    `Sources` is provenance and ingestion management; `Files` is browsing,
    opening, insertion, and sharing. This is one underlying object with two
    UI projections, not duplicate storage.
31. The v1 `Files` tab is not the all-uploads view. All raw owner-provided
    material remains visible in `Sources`; a cross-type `All content` or
    `All uploads` browsing/filter surface is tracked separately in SPEC-089.

The v1 source classifier shall normalize `mimeType` and file extension to
lowercase before comparison and shall follow this precedence:

| Signal | Surface classification |
|--------|------------------------|
| `mimeType === "image/svg+xml"` or extension is `.svg` | `file` |
| `kind === "image"` or `mimeType` starts with `image/` or extension is `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.heic`, `.heif`, `.bmp`, `.tif`, `.tiff` | `photo` |
| `kind === "video"` or `mimeType` starts with `video/` or extension is `.mp4`, `.mov`, `.m4v`, `.webm`, `.mkv`, `.avi` | `video` |
| `kind === "audio"` or `mimeType` starts with `audio/` or extension is `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.opus` | `music` |
| `mimeType` is `application/pdf`, `application/json`, `application/x-ndjson`, `application/xml`, `text/xml`, `text/plain`, `text/markdown`, `text/csv`, `text/tab-separated-values`, `application/zip`, `application/x-zip-compressed`, `application/x-tar`, `application/gzip`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/vnd.ms-powerpoint`, `application/vnd.openxmlformats-officedocument.presentationml.presentation`, `application/vnd.oasis.opendocument.text`, `application/vnd.oasis.opendocument.spreadsheet`, or `application/vnd.oasis.opendocument.presentation` | `file` |
| extension is `.pdf`, `.md`, `.markdown`, `.txt`, `.csv`, `.tsv`, `.json`, `.jsonl`, `.xml`, `.yaml`, `.yml`, `.zip`, `.tar`, `.gz`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.odt`, `.ods`, `.odp` | `file` |
| `mimeType === "application/octet-stream"` with a recognized extension | classify by the recognized extension |
| `mimeType === "application/octet-stream"` without a recognized extension | `file` as unknown binary |
| `kind === "path_ref"` with a recognized media or file extension in `linkedPath` or `sourceUrl` | classify by that extension |
| `kind === "path_ref"` with no recognized media/file extension or MIME | `file` as unknown linked file |
| `kind === "note"`, `kind === "article"`, or `kind === "conversation_log"` with no file name/path and no file MIME | `source_only` |

The classifier shall be implemented as one shared helper for profile read-model
assembly. Individual tabs shall not duplicate their own MIME or extension
tables.

#### Activity

29. `Activity` shall show a companion-scoped event stream.
30. Activity entries may include:
    - companion presence changes
    - source additions/removals
    - memory additions/updates/removals
    - generated artifact or derived-record creation
    - chat/transport ingestion milestones
    - file or media publish/share actions
31. Activity shall not be treated as the default tab unless a later user
    direction changes the IA.
32. The first Activity vocabulary shall include source add/remove, owner memory
    add/update/remove, profile-post promote/edit/remove, file/media share
    insertion, and transport ingestion milestone groups. Other derived-record
    creation events shall appear only when they create user-visible profile
    content.
33. Activity is not a raw write log. The first implementation shall coalesce
    high-frequency source, memory, and derived-record writes by object type and
    local day.
34. Burst aggregation shall use this key:
    `{catId, correlationId || minuteBucket, eventGroup, targetKind}`.
    `minuteBucket` is the event timestamp rounded down to a 60-second local
    window. Import/ingestion commands should pass a stable `correlationId` so
    one operation becomes one rendered activity group even if it emits many
    writes.
35. The first implementation shall cap the visible Activity feed to the most
    recent 100 rendered entries or the most recent 30 days, whichever is
    smaller. v1 shall not expose `Load more`; when older matching activity is
    hidden, the UI should show a bounded "Older activity is hidden" indicator
    instead of pretending the feed is complete.
36. Selecting an Activity entry shall open that activity entry in `Inspector`.
    If the entry has a primary target, the entry shall expose a separate `Open`
    action that navigates to the target item.
37. Activity entries should be concise and scan-friendly.

#### Side panel

36. The companion side panel shall not expose a section named `Settings`.
37. The companion side panel shall use these sections:
    - `Status`
    - `Sources`
    - `Memory`
    - `Behavior`
    - `Inspector`
38. `Status` shall include presence, wake/sleep, runtime/session health, and
    recent errors.
39. `Sources` shall manage raw owner-provided material used to feed or curate
    the companion.
40. `Sources` shall list raw `CompanionSourceRecord` inputs and their ingestion
    controls, including records that also project into Photos, Videos, Music,
    or Files.
41. `Sources` shall not be treated as the same user-facing surface as `Files`.
42. `Memory` shall expose one companion-scoped memory surface backed by
    `CompanionMemoryRecord` in v1. The companion side panel shall not render
    the `Settings > My Cats` `DurableMemoryItem` list as a second ledger.
43. `CompanionMemoryRecord` remains the side-panel source of truth because it
    carries companion-box lineage (`sourceIds`), curation state (`curatedBy`),
    lifecycle state (`status`), and replacement linkage (`replacedById`).
44. Any future merge or synchronization between `DurableMemoryItem` and
    `CompanionMemoryRecord` requires the bridge contract tracked in SPEC-088.
    Until that exists, the UI shall label this as companion memory rather than
    implying it is the canonical Settings memory registry.
45. `Behavior` shall expose response style/profile controls that are directly
    relevant to this companion.
46. `Inspector` shall show contextual details only after the user selects a
    concrete post, photo, video, music item, file, source, memory record, or
    activity entry.
47. When no item is selected, `Inspector` shall show an empty state equivalent
    to "Select an item to inspect."
48. If the selected item becomes unavailable, `Inspector` shall show captured
    snapshot metadata plus the appropriate unavailable state instead of
    becoming a miscellaneous fallback container.
49. `Inspector` shall not host global transport, behavior, or memory controls;
    those controls belong to their named side-panel sections.
50. Inspector selection shall be scoped to the current companion Cat. Changing
    Cat, leaving the companion profile route, or full page reload without an
    explicit inspector selection parameter shall clear the selection.
51. Switching main tabs within the same companion Cat shall not clear the
    selection. If the selected item is deleted or becomes unavailable while the
    user remains on the same Cat, `Inspector` shall keep the selection and show
    the snapshot/unavailable state until the user selects another item or
    clears the Inspector.
52. Inspector snapshots shall freeze at the last successful resolve of the
    selected item. If the item is edited while selected and the edit resolves
    successfully, the snapshot updates to the edited state. If the next resolve
    returns deleted, missing, or inaccessible, the snapshot freezes at the last
    successful resolved state before that unavailable transition.
53. A full reload with a valid explicit inspector selection parameter shall
    attempt to restore the selection by resolving the parameter. If it resolves,
    `Inspector` shows the item; if it resolves unavailable, `Inspector` shows
    the unavailable fallback; if the parameter is malformed, selection clears.
54. The word `Profile` shall refer to the whole companion page, not a side-panel
    section.

#### Transport binding visibility

55. Telegram, LINE, and other transport binding management shall remain
    canonical in `Settings > My Cats`.
56. The companion profile may show read-only badges such as `Telegram
    connected` or `Available on Telegram`.
57. When management is needed, the companion surface shall deep-link to the
    canonical settings route rather than duplicating controls.

#### Content references

58. Every main content tab shall be able to expose items that can later become
    shareable companion content references.
59. Item-level `Share` belongs to concrete post cards, media tiles, file rows,
    and activity entries with a primary shareable target. It may be enabled
    only when that concrete item can produce a SPEC-086 reference. Header-level
    `Share` remains separate and disabled in v1 unless a companion profile
    reference type is later specified.
60. Chat insertion and preview behavior is specified separately in SPEC-086.

### Non-Functional Requirements

- **IA clarity**: main content browsing and side-panel control must remain
  visually and semantically distinct.
- **No duplicate settings**: canonical Cat settings must stay owned by
  `Settings > My Cats`.
- **Extensibility**: posts can grow into a real model later without invalidating
  the profile/feed IA.
- **Responsiveness**: tabs, cards, and side panel must remain usable on narrow
  desktop and mobile-sized viewports.

## Design Overview

```text
Companion profile
  header
    name / avatar / cover / actions / chat toggle
  main tabs
    Posts
    Photos
    Videos
    Music
    Files
    Activity
  side panel
    Status
    Sources
    Memory
    Behavior
    Inspector
```

### Data projection guidance

The UI labels do not have to mirror storage labels one-to-one.

| UI surface | Likely inputs |
|------------|---------------|
| Posts | explicit owner-promoted profile-post projections from `CompanionDerivedRecord`; future durable post records |
| Photos | image sources, image artifacts, image derived records |
| Videos | video sources, video artifacts, video derived records |
| Music | audio/music sources, audio artifacts, music derived records |
| Files | document/file-like sources, generated file artifacts, linked paths |
| Activity | aggregated companion events, source/memory/artifact lifecycle records |
| Sources side panel | all raw `CompanionSourceRecord` inputs and ingestion controls |
| Memory side panel | `CompanionMemoryRecord` companion-box memory records |
| Behavior side panel | response profile and companion behavior controls |

A single underlying object may appear in more than one UI surface when the user
jobs differ. For example, an owner-uploaded PDF appears in `Sources` for
provenance/ingestion management and in `Files` for browsing, insertion, and
sharing. The projection must preserve the original object id/source id so
actions do not fork state.

### Relationship to SPEC-036

SPEC-036 remains binding for first-class companion mode, presence, reply style,
companion boxes, long-lived memory direction, response profiles, and the
`cats -> cats-runtime` boundary.

SPEC-085 amends SPEC-036 only for visible IA labels and ownership:

- `Overview / Resources / Creations / Settings` no longer define the primary
  companion dashboard sections.
- `Settings` and transport management move out of the companion side panel and
  remain canonical under `Settings > My Cats`.
- `Resources` becomes `Sources` in the side panel, while user-browsable content
  projects into Posts, Photos, Videos, Music, Files, and Activity.
- `Creations` is not a side-panel section in this IA; companion-produced
  outputs project into the relevant main tab or Activity.

## Dependencies

- [ADR-084](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md)
- [SPEC-029](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [SPEC-036](./SPEC-036-companion-workspace-presence-and-settings.md)
- [SPEC-086](./SPEC-086-shareable-companion-content-links-and-chat-previews.md)
- [SPEC-088](./SPEC-088-companion-memory-bridge-contract-placeholder.md)
- [SPEC-089](./SPEC-089-companion-all-content-library-placeholder.md)
- [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)

## Open Questions

- [ ] What is the durable post model?
- [ ] Who can author posts: owner, Cat, system, or all three?
- [ ] What are the eventual subscription semantics behind the reserved
      `Subscribe` action?
- [ ] Should companion profile visibility have public/private states, or is
      everything local/private until a future public sharing spec?
- [ ] Which automatic post producers, if any, should supplement the explicit
      owner-promotion producer?
- [ ] Which future Activity event groups should be added beyond the first
      source/memory/profile-post/share/transport groups?

## References

- [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md)
- [Companion Core Capabilities](../research/2026-03-26-companion-core-capabilities.md)
- [Cats Chat Spatial Layout Guidelines](../research/2026-03-26-cats-chat-spatial-layout-guidelines.md)

---

*Created: 2026-04-28*
*Author: Codex*
*Related Plan: [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)*
