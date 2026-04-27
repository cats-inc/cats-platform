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
- Prepare the UI for companion content that can later be inserted into chat as
  previewable share references.

## Non-Goals

- Defining the full post authoring, publication, reaction, comment, or
  subscription model.
- Defining public internet share pages.
- Replacing `Settings > My Cats` as the canonical Cat settings route.
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
   - optional visible actions such as `Subscribe` or `Share`, without requiring
     their final semantics in this spec
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

#### Posts

9. `Posts` shall be a visible feed surface.
10. A post shall be treated as a companion content projection until a later spec
    defines the durable post model.
11. The first implementation may render posts from mock data, derived records,
    memory highlights, or other product-owned projections as long as the UI does
    not imply a finalized authoring/publication model.
12. Post cards should support at least:
    - author Cat identity
    - time or relative timestamp
    - body/excerpt
    - optional hashtags or tags
    - optional media grid
    - optional share action
13. The product shall not add comment input to companion posts by default.

#### Photos, videos, and music

14. `Photos` shall show image-like companion content from product-owned sources,
    derived records, or artifact projections.
15. `Videos` shall show video-like companion content from product-owned sources,
    derived records, or artifact projections.
16. `Music` shall show audio/music-like companion content from product-owned
    sources, derived records, or artifact projections.
17. These tabs may use placeholder/mock projections in early UI slices, but the
    IA shall keep their labels distinct.

#### Files

18. `Files` shall be a primary main-surface tab.
19. `Files` shall show document/file-like companion content that can be opened,
    referenced, or inserted into chat.
20. `Files` shall not be hidden inside the side panel.
21. `Files` may include imported resources, linked files, and generated
    artifacts when they are file-like and user-browsable.

#### Activity

22. `Activity` shall show a companion-scoped event stream.
23. Activity entries may include:
    - companion presence changes
    - source additions/removals
    - memory additions/updates/removals
    - generated artifact or derived-record creation
    - chat/transport ingestion milestones
    - file or media publish/share actions
24. Activity shall not be treated as the default tab unless a later user
    direction changes the IA.
25. Activity entries should be concise, scan-friendly, and link to the relevant
    object or inspector details when possible.

#### Side panel

26. The companion side panel shall not expose a section named `Settings`.
27. The companion side panel shall use these sections:
    - `Status`
    - `Sources`
    - `Memory`
    - `Behavior`
    - `Inspector`
28. `Status` shall include presence, wake/sleep, runtime/session health, and
    recent errors.
29. `Sources` shall manage raw owner-provided material used to feed or curate
    the companion.
30. `Sources` shall not be treated as the same user-facing surface as `Files`.
31. `Memory` shall expose the private durable memory ledger and owner edit
    actions.
32. `Behavior` shall expose response style/profile controls that are directly
    relevant to this companion.
33. `Inspector` shall show contextual details for the selected post, photo,
    video, music item, file, or activity entry.
34. The word `Profile` shall refer to the whole companion page, not a side-panel
    section.

#### Transport binding visibility

35. Telegram, LINE, and other transport binding management shall remain
    canonical in `Settings > My Cats`.
36. The companion profile may show read-only badges such as `Telegram
    connected` or `Available on Telegram`.
37. When management is needed, the companion surface shall deep-link to the
    canonical settings route rather than duplicating controls.

#### Content references

38. Every main content tab shall be able to expose items that can later become
    shareable companion content references.
39. Chat insertion and preview behavior is specified separately in SPEC-086.

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
| Posts | future post records, derived summaries, curated memory highlights, Cat-authored projections |
| Photos | image sources, image artifacts, image derived records |
| Videos | video sources, video artifacts, video derived records |
| Music | audio/music sources, audio artifacts, music derived records |
| Files | documents, file resources, generated artifacts, linked paths |
| Activity | companion events, source/memory/artifact lifecycle records |
| Sources side panel | raw companion-box sources and ingestion controls |
| Memory side panel | durable memory records |
| Behavior side panel | response profile and companion behavior controls |

## Dependencies

- [ADR-084](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md)
- [SPEC-029](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [SPEC-036](./SPEC-036-companion-workspace-presence-and-settings.md)
- [SPEC-086](./SPEC-086-shareable-companion-content-links-and-chat-previews.md)
- [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)

## Open Questions

- [ ] What is the durable post model?
- [ ] Who can author posts: owner, Cat, system, or all three?
- [ ] Are `Subscribe` and `Share` local-only actions in v1, or do they reserve
      future public sharing?
- [ ] Should companion profile visibility have public/private states, or is
      everything local/private until a future public sharing spec?
- [ ] Which derived records should automatically appear as posts instead of
      files or activity entries?
- [ ] Which Activity event vocabulary should ship first?

## References

- [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md)
- [Companion Core Capabilities](../research/2026-03-26-companion-core-capabilities.md)
- [Cats Chat Spatial Layout Guidelines](../research/2026-03-26-cats-chat-spatial-layout-guidelines.md)

---

*Created: 2026-04-28*
*Author: Codex*
*Related Plan: [PLAN-077](../plans/PLAN-077-companion-profile-and-share-preview-rollout.md)*
