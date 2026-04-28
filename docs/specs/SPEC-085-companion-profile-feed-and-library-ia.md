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
11. **Authorship is agent-only.** Posts shall come exclusively from the Cat
    (or future agent producers). The owner shall not have a UI affordance
    to publish, promote, edit, or remove posts. The companion profile is the
    Cat's surface — the owner views it as a passive observer. There is no
    `Promote to post` action, no promote dialog, and no
    `Remove from Posts` button in v1.
12. Posts shall render from `CompanionDerivedRecord` entries the Cat (or
    future agent producer) wrote with `metadata.profileSurface === 'post'`.
    Until an agent producer ships, the Posts tab will render an empty state
    on a fresh install — that is correct, not a bug. Production runtime
    shall not use mock fixtures.
13. Post records shall set:
    - `metadata.profileSurface === 'post'`
    - `metadata.profilePostStatus === 'active'` or `'removed'`
    - `metadata.profilePublishedAt` (ISO timestamp; falls back to
      `record.createdAt` if absent)
    - `metadata.profilePostMediaRefs` (optional ordered array; see rule 14)
    - `sourceIds` preserving the underlying source lineage when the agent
      published from owner-provided material
14. `metadata.profilePostMediaRefs` shall be an ordered array of
    `{ kind: 'source' | 'derived' | 'artifact'; id: string }` entries naming
    the media items rendered by the post card's optional media grid. It is a
    curated rendering subset and is decoupled from `sourceIds` (which records
    provenance, not display selection). An empty array means the post card
    renders no media grid even when the underlying source has media. The
    helper that reads post cards shall ignore entries whose targets cannot be
    resolved rather than dropping the whole post.
15. The agent-driven producer is out of scope for v1; it shall land in a
    follow-up spec/plan once the post model is decided. Until then the read
    model exists, the schema is fixed, and the projection sorts by
    `metadata.profilePublishedAt` (falling back to `createdAt`).
16. Post cards should support at least:
    - author Cat identity
    - time or relative timestamp
    - body/excerpt
    - optional hashtags or tags
    - optional media grid
    - optional item-level share action
17. The product shall not add comment input to companion posts by default.

#### Photos, videos, and music

18. `Photos` / `Videos` / `Music` shall surface only **agent-published** media:
    `CompanionDerivedRecord` entries the Cat (or future agent producer)
    wrote with `metadata.profileSurface === 'photo' | 'video' | 'music'`.
19. **Owner-supplied sources shall NOT be projected into these tabs.** When
    the owner adds a source to the Cat — including a file, folder reference,
    or path that contains photos, videos, or audio inside — the source goes
    only to the side-panel `Sources` section. The agent reads from those
    sources but decides for itself whether to surface anything publicly.
    Files that the agent designates as published media may live in a
    separate agent-controlled directory.
20. These tabs may render empty states on a fresh install (no agent producer
    has published yet). Production runtime shall not use mock fixtures.

#### Files

21. `Files` shall be a primary main-surface tab.
22. `Files` shall show **agent-published** document/file-like content:
    `CompanionDerivedRecord` entries the Cat wrote with
    `metadata.profileSurface === 'file'`. The agent decides what to surface;
    the owner does not upload directly into this tab.
23. `Files` shall not be hidden inside the side panel.
24. **Owner-supplied source files shall NOT auto-project into `Files`.** The
    same rule as Photos / Videos / Music applies: a source the owner
    provides goes to `Sources` only. The agent may choose to publish a
    derived file record that points back to that source via `sourceIds`.
25. The v1 `Files` tab is not the all-uploads view. All raw owner-provided
    material remains visible in `Sources` only; a cross-type `All content`
    or `All uploads` browsing/filter surface is tracked separately in
    SPEC-089.

#### Activity

35. `Activity` shall show a companion-scoped event stream.
36. The v1 Activity vocabulary is exhaustive. Only the following event groups
    shall render in v1; anything else is reserved for a later spec:
    - companion presence changes (`presence_changed`)
    - source add/remove (`source_added`, `source_removed`)
    - owner memory add/update/remove (`memory_added`, `memory_updated`,
      `memory_removed`)
    - profile-post promote/edit/remove (`post_promoted`, `post_edited`,
      `post_removed`)
    - file/media share insertion (`share_inserted`)
    - transport ingestion milestones (`transport_ingested`)

    Generic derived-record creation events shall not render unless they fall
    under one of the listed groups. Adding a new group requires amending this
    list.
28. Activity shall not be treated as the default tab unless a later user
    direction changes the IA.
29. Activity is not a raw write log. The first implementation shall coalesce
    high-frequency source, memory, and derived-record writes by object type and
    local day.
30. Burst aggregation shall use this key:
    `{catId, correlationId || minuteBucket, eventGroup, targetKind}`.
    `minuteBucket` is the event timestamp rounded down to a 60-second local
    window. Import/ingestion commands should pass a stable `correlationId` so
    one operation becomes one rendered activity group even if it emits many
    writes.
31. The first implementation shall cap the visible Activity feed to the most
    recent 100 rendered entries or the most recent 30 days, whichever is
    smaller. v1 shall not expose `Load more`; when older matching activity is
    hidden, the UI should show a bounded "Older activity is hidden" indicator
    instead of pretending the feed is complete.
32. Selecting an Activity entry shall open that activity entry in `Inspector`.
    If the entry has a primary target, the entry shall expose a separate `Open`
    action that navigates to the target item.
33. Activity entries should be concise and scan-friendly.

#### Side panel

34. The companion side panel shall not expose a section named `Settings`.
35. The companion side panel shall use these sections:
    - `Status`
    - `Sources`
    - `Memory`
    - `Behavior`
    - `Inspector`
36. `Status` shall include presence, wake/sleep, runtime/session health, and
    recent errors.
37. `Sources` shall manage raw owner-provided material the owner gives the Cat
    to read from. Sources are the Cat's ingredients, not the Cat's published
    output.
38. `Sources` shall list raw `CompanionSourceRecord` inputs and their
    ingestion controls. **`Sources` shall NOT be auto-projected into Posts /
    Photos / Videos / Music / Files** — those tabs are agent-published only
    (rules 11, 18, 22).
39. `Sources` shall not be treated as the same user-facing surface as `Files`.
40. `Memory` shall expose one companion-scoped memory surface backed by
    `CompanionMemoryRecord` in v1. The companion side panel shall not render
    the `Settings > My Cats` `DurableMemoryItem` list as a second ledger.
41. `CompanionMemoryRecord` remains the side-panel source of truth because it
    carries companion-box lineage (`sourceIds`), curation state (`curatedBy`),
    lifecycle state (`status`), and replacement linkage (`replacedById`).
42. Any future merge or synchronization between `DurableMemoryItem` and
    `CompanionMemoryRecord` requires the bridge contract tracked in SPEC-088.
    Until that exists, the UI shall label this as companion memory rather than
    implying it is the canonical Settings memory registry.
43. `Behavior` shall expose response style/profile controls that are directly
    relevant to this companion.
44. `Inspector` shall show contextual details only after the user selects a
    concrete post, photo, video, music item, file, source, memory record, or
    activity entry.
45. When no item is selected, `Inspector` shall show an empty state equivalent
    to "No selection."
46. If the selected item becomes unavailable, `Inspector` shall show captured
    snapshot metadata plus the appropriate unavailable state instead of
    becoming a miscellaneous fallback container.
47. `Inspector` shall not host global transport, behavior, or memory controls;
    those controls belong to their named side-panel sections.
48. Inspector selection shall be scoped to the current companion Cat. Changing
    Cat, leaving the companion profile route, or full page reload without an
    explicit inspector selection parameter shall clear the selection.
49. Switching main tabs within the same companion Cat shall not clear the
    selection. If the selected item is deleted or becomes unavailable while the
    user remains on the same Cat, `Inspector` shall keep the selection and show
    the snapshot/unavailable state until the user selects another item or
    clears the Inspector.
50. Inspector snapshots shall freeze at the last successful resolve of the
    selected item. If the item is edited while selected and the edit resolves
    successfully, the snapshot updates to the edited state. If the next resolve
    returns deleted, missing, or inaccessible, the snapshot freezes at the last
    successful resolved state before that unavailable transition.
51. A full reload with a valid explicit inspector selection parameter shall
    attempt to restore the selection by resolving the parameter. If it resolves,
    `Inspector` shows the item; if it resolves unavailable, `Inspector` shows
    the unavailable fallback; if the parameter is malformed, selection clears.
52. The word `Profile` shall refer to the whole companion page, not a side-panel
    section.

#### Transport binding visibility

53. Telegram, LINE, and other transport binding management shall remain
    canonical in `Settings > My Cats`.
54. The companion profile may show read-only badges such as `Telegram
    connected` or `Available on Telegram`.
55. When management is needed, the companion surface shall deep-link to the
    canonical settings route rather than duplicating controls.

#### Header actions

56. The header shall expose two reserved-button stubs whose v1 semantics are
    deliberately deferred:
    - `Subscribe` — reserved for a future audience/notification model
    - `Share` — reserved for a future "share this profile" reference type
    Both shall render as visible buttons. Their behavior is TBD; do not
    delete them while the open questions in §"Open Questions" are still open,
    and do not design new behavior into them without amending this section
    plus a new ADR.

#### Content references

57. Every main content tab shall be able to expose items that can later become
    shareable companion content references.
58. Item-level `Share` belongs to concrete post cards, media tiles, file rows,
    and activity entries with a primary shareable target. It may be enabled
    only when that concrete item can produce a SPEC-086 reference. Header-level
    `Share` is the stub described in rule 56 and shall not be wired to a
    real reference until the open question resolves.
59. Chat insertion and preview behavior is specified separately in SPEC-086.

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

The UI labels do not have to mirror storage labels one-to-one. The main tabs
and `Sources` are deliberately separate spaces with separate authors:

| UI surface | Author | Inputs |
|------------|--------|--------|
| Posts | Cat / agent producer | `CompanionDerivedRecord` with `metadata.profileSurface === 'post'` |
| Photos | Cat / agent producer | `CompanionDerivedRecord` with `metadata.profileSurface === 'photo'` |
| Videos | Cat / agent producer | `CompanionDerivedRecord` with `metadata.profileSurface === 'video'` |
| Music | Cat / agent producer | `CompanionDerivedRecord` with `metadata.profileSurface === 'music'` |
| Files | Cat / agent producer | `CompanionDerivedRecord` with `metadata.profileSurface === 'file'` |
| Activity | system | aggregated `CompanionActivityEvent` log (source/memory lifecycle, presence, share, transport) |
| Sources side panel | owner | raw `CompanionSourceRecord` inputs and ingestion controls — never auto-projected into the agent-published tabs |
| Memory side panel | shared | `CompanionMemoryRecord` companion-box memory records |
| Behavior side panel | owner | response profile and companion behavior controls |

A `CompanionSourceRecord` and its derived agent-published media remain
**separate stored objects** linked by `sourceIds`. The agent decides which (if
any) source material to surface publicly; nothing is auto-projected. Files the
agent designates as published may live in a separate agent-controlled
directory.

### Relationship to SPEC-036

SPEC-036 remains binding for first-class companion mode, presence, reply style,
companion boxes, long-lived memory direction, response profiles, and the
`cats -> cats-runtime` boundary.

SPEC-085 amends SPEC-036 for visible IA labels, ownership, and authorship:

- `Overview / Resources / Creations / Settings` no longer define the primary
  companion dashboard sections.
- `Settings` and transport management move out of the companion side panel and
  remain canonical under `Settings > My Cats`.
- `Resources` becomes `Sources` in the side panel. `Sources` is owner input
  only; it is **not** auto-projected into the agent-published tabs (Posts /
  Photos / Videos / Music / Files).
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

- [ ] What is the durable post model? (Posts are agent-only; the question is
      now about durable storage shape, not authorship.)
- [ ] Which agent producers ship in v1? (Cat-driven post / photo / video /
      music / file producers are out of scope here; they need a follow-up
      spec/plan.)
- [ ] What are the eventual semantics behind the reserved header `Subscribe`
      action? (It exists as a stub per rule 56; do not delete.)
- [ ] What are the eventual semantics behind the reserved header `Share`
      action? (Same: stub per rule 56.)
- [ ] Should companion profile visibility have public/private states, or is
      everything local/private until a future public sharing spec?
- [ ] Which future Activity event groups should be added beyond the first
      source/memory/profile-post/share/transport groups?

Resolved:
- ~~Who can author posts: owner, Cat, system, or all three?~~ → Cat / agent
  producer only. Owner has no UI affordance to publish, promote, or remove
  posts. (Rule 11.)
- ~~Which automatic post producers should supplement the explicit
  owner-promotion producer?~~ → There is no owner-promotion producer.
  All producers are agent-driven; the producer set is open.

## References

- [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md)
- [Companion Core Capabilities](../research/2026-03-26-companion-core-capabilities.md)
- [Cats Chat Spatial Layout Guidelines](../research/2026-03-26-cats-chat-spatial-layout-guidelines.md)

---

*Created: 2026-04-28*
*Author: Codex*
*Related Plan: [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)*
