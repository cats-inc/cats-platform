# ADR-084: Adopt Companion Profile IA and Shareable Content References

> Amend the first-class companion workspace direction by treating the visible
> companion surface as a profile/feed/library, reserving canonical settings for
> `Settings > My Cats`, and making companion content shareable into chat with
> previews.

## Status

Proposed

## Date

2026-04-28

## Context

ADR-040 established companion as a first-class `Cats Chat` mode with a
workspace, presence, settings, resources, and creations. That remains the right
product-level direction, but the visible IA needs a sharper split.

The companion UI direction explored in commit `6f7816b0` points toward a
Facebook-style profile surface: cover/avatar, actions, feed tabs, posts, media,
files, and activity. That shape is closer to the intended companion feel than a
dashboard whose primary navigation is `Overview / Resources / Creations /
Settings`.

The older section labels also create product ownership problems:

- `Settings` conflicts with the canonical platform settings route at
  `Settings > My Cats`.
- Telegram and future LINE bindings already belong to the Cat registry/settings
  ownership layer and should not be duplicated as independent companion-local
  configuration.
- `Resources` and `Creations` are useful data-layer distinctions, but they are
  not always the right user-facing tabs for a profile surface.
- `Files` should be visible as first-class browsable content, not hidden in a
  side panel.
- `Sources` and `Files` need a projection rule. A single owner-uploaded PDF
  should not force implementation to guess whether it appears in provenance
  management, the user-facing file library, or both.
- Companion memory already has two nearby schemas: `CompanionMemoryRecord` in
  the companion box and `DurableMemoryItem` in `Settings > My Cats`. The
  companion side panel must not expose both as competing memory ledgers.
- Posts are not defined yet. The UI may show posts, but the product should not
  prematurely freeze the full post content model, authoring workflow, reaction
  semantics, or public sharing model.
- Companion posts, photos, videos, music, and files need share references that
  can be inserted into chat and rendered as previews.

## Decision

Cats Chat will revise companion IA around a profile/feed/library surface and a
separate control/inspector side panel.

### 1. Companion main surface is a profile/feed/library

The main companion surface shall present the selected Cat as a profile with a
content library, not as a settings dashboard.

The primary tabs are:

1. `Posts`
2. `Photos`
3. `Videos`
4. `Music`
5. `Files`
6. `Activity`

`Activity` is intentionally last. It is useful, but the default mental model is
the companion's content and identity, not an audit log.

There is no `About` tab in this IA. Profile identity is carried by the header,
cover, avatar, visible actions, and later optional profile metadata.

### 2. Posts are a reserved content surface, not a finalized model

`Posts` is accepted as a visible tab, but the full post model is not decided in
this ADR.

For now, a post is only a companion content projection that may be previewed,
linked, and displayed in a feed card. The first production slice shall use
explicit profile-post projections backed by `CompanionDerivedRecord`, such as
records with `metadata.profileSurface === 'post'`. Mock posts are allowed only
in dev fixtures, storybook, and tests.

The following remain open:

- whether posts are owner-authored, Cat-authored, system-generated, or all of
  those
- whether posts are durable source records, derived records, or projections
- visibility, reactions, comments, subscriptions, and public web sharing
- whether posts have their own authoring UI

### 3. Files stay on the main surface

`Files` is a primary tab. It is a browsing and reuse surface for companion
attachments, documents, generated artifacts, and imported file-like resources.

`Files` is not the same as `Sources`. `Sources` is the owner-facing substrate
used to feed or curate the companion. `Files` is the content library users
inspect, insert into chat, and share.

The same underlying object may project into both surfaces. For example, an
owner-uploaded PDF appears in `Sources` for provenance and ingestion management
and in `Files` for browsing, opening, insertion, and sharing. The projection
must preserve the same source id rather than creating duplicate storage.

### 4. The side panel is control and inspection, not duplicate settings

The companion side panel shall use operational labels and must not present a
`Settings` section.

The accepted side-panel sections are:

- `Status` - presence, wake/sleep, runtime/session health, recent errors
- `Sources` - raw owner-given materials and ingestion substrate
- `Memory` - companion-box memory ledger and owner edits
- `Behavior` - response style/profile controls local to the companion
- `Inspector` - contextual provenance/actions for a selected post, media item,
  file, or activity entry

`Profile` is not used as a side-panel section because the whole page is the
profile surface. `Configuration` is too broad and risks sounding like canonical
settings.

The `Memory` side panel is backed by `CompanionMemoryRecord` in v1 because that
schema carries source lineage, curation state, lifecycle state, and replacement
links. `Settings > My Cats` may continue to use `DurableMemoryItem`, but the
companion page shall not render that as a second memory ledger. Any future
merge or synchronization between those schemas needs a separate bridge contract.

### 5. Transport bindings stay canonical in Settings > My Cats

Telegram, LINE, and similar transport binding management remain owned by
`Settings > My Cats`.

The companion profile may show read-only transport badges, availability labels,
or a deep link to the canonical settings route, but it must not duplicate the
management UI or create a second source of truth.

### 6. Companion content needs shareable references and chat previews

Posts, photos, videos, music, and files exposed by the companion profile shall
have product-owned share references that can be inserted into chat.

The first local serialized reference form is
`cats://companion/{catId}/{type}/{targetId}` for target types `post`, `photo`,
`video`, `music`, and `file`.

When a reference is inserted or pasted into a chat composer, the transcript
should render a preview card rather than showing only a raw string.

This is a product-owned content reference and preview problem. It is related to,
but distinct from, runtime-owned preview surfaces for services and artifacts.

Visible `Share` actions are enabled only when they can insert the reference
into chat or copy this local form. Header-level `Share` is hidden or visibly
disabled with an explanatory tooltip until it has a concrete companion profile
reference type or selected content target. `Subscribe` is reserved for a future
model and should be hidden or visibly disabled with an explanatory tooltip in
v1.

## Consequences

### Positive

- The companion surface now matches the intended profile/feed feel.
- Canonical settings remain cleanly owned by `Settings > My Cats`.
- `Files` becomes discoverable and reusable.
- Side panel scope becomes clearer: control, source management, memory,
  behavior, and contextual inspection.
- Memory has one companion-side source of truth in v1 instead of competing
  `CompanionMemoryRecord` and `DurableMemoryItem` lists.
- `Sources` and `Files` can share one underlying object identity without making
  implementation invent projection rules.
- Share links and chat previews become first-class requirements instead of an
  afterthought.

### Negative

- SPEC-036 and PLAN-025 need revision because their visible IA used older
  `Overview / Resources / Creations / Settings` language.
- The product needs a separate content-reference contract before share previews
  are implemented.
- Posts cannot be fully implemented until the post model is specified.
- The product needs a later memory bridge decision if `DurableMemoryItem` and
  `CompanionMemoryRecord` should converge.

### Neutral

- This ADR does not change the `cats -> cats-runtime` execution boundary.
- This ADR does not define public web sharing.
- This ADR does not collapse photos, videos, and music into one `Media` tab.

## Alternatives Considered

### Alternative 1: Keep Overview / Resources / Creations / Settings

- **Pros**: smaller change from SPEC-036 and PLAN-025
- **Cons**: feels like a management dashboard, hides files, duplicates settings,
  and does not match the profile/feed UI direction
- **Why rejected**: the companion surface should feel like the Cat's profile and
  library, not a settings panel

### Alternative 2: Add About and merge media into one Media tab

- **Pros**: fewer tabs and a familiar profile-page structure
- **Cons**: the user explicitly prefers no `About` tab and wants photos,
  videos, and music to remain separate
- **Why rejected**: it conflicts with the current product direction

### Alternative 3: Put transport binding controls in companion side panel

- **Pros**: convenient from the companion page
- **Cons**: duplicates `Settings > My Cats` and creates unclear ownership
- **Why rejected**: transport binding management must have one canonical owner

## References

- [ADR-040](./040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md)
- [SPEC-036](../specs/SPEC-036-companion-workspace-presence-and-settings.md)
- [PLAN-025](../plans/PLAN-025-companion-workspace-presence-and-settings.md)
- [SPEC-085](../specs/SPEC-085-companion-profile-feed-and-library-ia.md)
- [SPEC-086](../specs/SPEC-086-shareable-companion-content-links-and-chat-previews.md)
- [SPEC-020](../specs/SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md)

---

*Decision made: 2026-04-28*
*Decision makers: User, Codex*
