# SPEC-036: Companion Workspace, Presence, and Settings

> **2026-04-28 IA revision**: This spec's first-class companion direction
> remains relevant, but its visible `Overview / Resources / Creations /
> Settings` dashboard IA is superseded by
> [SPEC-085](./SPEC-085-companion-profile-feed-and-library-ia.md) and
> [ADR-084](../decisions/084-adopt-companion-profile-ia-and-shareable-content-references.md).
> Shareable companion content references and chat previews are specified in
> [SPEC-086](./SPEC-086-shareable-companion-content-links-and-chat-previews.md).

> Turn companion from a thin direct-chat variant into a first-class `Cats Chat`
> product mode with a dedicated workspace, presence state, resource and
> creation management, and companion-owned settings.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Superseded in part by SPEC-085/SPEC-086 |
| **Owner** | Codex |
| **Reviewer** | User |

## Summary

`cats` already owns per-Cat companion boxes, response profiles, and direct
companion session hydration. What is still missing is the visible product
surface that makes companion feel real.

This spec defines that missing surface.

Companion should become a first-class mode inside `Cats Chat`, not just a
direct room with a different prompt. It needs:

- a dedicated workspace
- a visible presence model
- a distinction between user-given resources and companion-created outputs
- a settings area for transport, appearance, and atmosphere
- a path for rituals, recurring requests, and proactive behavior

## Goals

- make companion feel like a persistent being rather than a generic session
- define the visible workspace structure for companion mode
- separate `Resources` from `Creations`
- define companion presence and behavior toggles
- define companion-owned settings, including Telegram and appearance/atmosphere
- preserve the `cats -> cats-runtime` boundary while building a richer
  product-owned surface

## Non-Goals

- shipping the entire companion UI in one slice
- implementing every media-generation stack in the first pass
- defining a public marketplace or social sharing layer
- replacing direct Cat chat with companion-only semantics
- moving long-lived companion ownership into `cats-runtime`

## User Stories

- As an owner, I want a companion to feel like the same being across sessions,
  not a fresh assistant every time.
- As an owner, I want to see what I gave this companion and what it created for
  me, without mixing those into one confusing list.
- As an owner, I want to configure the companion's avatar, background,
  background music, and Telegram presence in one coherent place.
- As an owner, I want to wake or let a companion sleep, rather than treating it
  as stateless chat.
- As an owner, I want to choose whether the companion behaves more
  human-like or cat-like.
- As an owner, I want companion memory-heavy experiences to feel suitable for
  emotionally meaningful or memorial use cases, not only productivity chat.

## Requirements

### Functional Requirements

#### Companion workspace

1. A companion conversation shall be able to open a dedicated companion
   workspace above the existing direct-chat routing foundation.
2. The companion workspace shall include:
   - transcript
   - companion dashboard
3. The companion dashboard shall support at least these sections:
   - `Overview`
   - `Resources`
   - `Creations`
   - `Settings`
4. Focused artifact viewing may open from `Resources` or `Creations`, but
   artifact view shall not replace the whole companion dashboard model.

#### Resources and creations

5. `Resources` shall represent owner-given or owner-curated materials for the
   companion, including:
   - photos
   - videos
   - audio
   - text notes
   - documents
   - linked references
6. `Creations` shall represent outputs produced by the companion, including:
   - images
   - audio clips
   - songs
   - videos
   - documents
   - plans or mixed-media outputs

   `Creations` are runtime-produced artifacts indexed by the product dashboard,
   not a data layer inside `CompanionBox`.
7. The product shall not collapse `Resources` and `Creations` into one generic
   artifact bucket in companion mode.

#### Presence and behavior

8. Companion shall expose a visible presence state with at least:
   - `awake`
   - `sleeping`
9. Companion shall expose a visible reply-style toggle mapped to the
   `replyStyle` field in `CompanionResponseProfile`:
   - `verbal` — full human-language text
   - `vocalization` — onomatopoeia and sound words only
10. The first slice shall not require a separate visible `disturb` toggle.
    Waking a sleeping companion is already the disturbance.
11. Presence and behavior settings shall remain product-owned, even if runtime
    execution later consumes them.

#### Companion settings

12. Companion shall expose a dedicated settings area containing at least:
    - Telegram/public transport binding controls
    - avatar configuration
    - background image configuration
    - background music configuration
    - response profile / behavior defaults
    - presence state controls
13. Companion settings shall not be modeled as generic hidden metadata only.
14. Telegram binding shall remain product-owned even when runtime sessions
    participate in actual responses.

#### Identity and memory layering

15. Companion shall support one persistent Cat identity that can survive across
    rooms and sessions.
16. The long-term direction shall separate:
    - identity memory
    - profile-specific memory
    - room working memory
17. The product may later let one Cat identity participate across companion,
    work, and code modes, provided behavior packs remain distinct.

#### Memory visibility in companion dashboard

18. Companion `Overview` shall surface curated memory highlights including key
    memories, relationship notes, and important preferences.
19. The companion dashboard shall provide a dedicated memory management entry
    point that allows the owner to browse, edit, and delete durable memory
    records.
20. The memory management entry may live as a sub-view of `Overview` or as a
    distinct discoverable section within the dashboard.

#### Rituals and proactive behavior

21. Companion should support a future layer for:
    - recurring requests
    - rituals
    - check-ins
    - proactive nudges
22. The first visible workspace should reserve conceptual room for those
    behaviors even if they are not fully executable in the first slice.

#### Layout and surface rules

23. Companion dashboard shall not require permanent operator cards on the main
    canvas.
24. Companion-specific quick controls such as `awake/sleeping` and
    `verbal/vocalization` should live in the transcript-side header/action area.
25. Companion detailed settings and dashboard sections may use the same
    secondary-surface framework discussed in the `Cats Chat` spatial-layout
    guidance, as long as mode boundaries remain clear.

### Non-Functional Requirements

- **Continuity**: the experience must feel persistent across sessions.
- **Emotional legibility**: companion state and materials should be interpretable
  by the owner, not hidden in opaque storage.
- **Boundary integrity**: `cats` owns workspace, settings, and long-lived
  companion state; `cats-runtime` remains the execution boundary.
- **Extensibility**: companion mode must be able to grow into richer multimodal
  and ritual behaviors without redefining the basic workspace model.

## Conceptual Model

### Companion product stack

```text
Cat identity
  ├─ companion box
  │   ├─ sources/resources
  │   ├─ derived records
  │   ├─ durable memory
  │   └─ response profile
  ├─ presence + behavior state
  ├─ transport bindings
  ├─ companion dashboard
  │   ├─ overview
  │   ├─ resources
  │   ├─ creations
  │   └─ settings
  └─ runtime hydration / execution
```

### Suggested sections

- **Overview**
  - high-level status
  - recent creations
  - curated memory highlights and relationship notes
  - quick actions
  - entry point to full memory management
- **Resources**
  - what the owner gave the companion (maps to CompanionBox `sources`)
- **Creations**
  - what the companion produced (projection of runtime-produced artifacts)
- **Settings**
  - Telegram
  - avatar
  - background image
  - background music
  - response profile (including `replyStyle` and `outputMode`)
  - awake/sleeping

## Dependencies

- [ADR-030](../decisions/030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions.md)
- [ADR-040](../decisions/040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md)
- [SPEC-029](./SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [SPEC-031](./SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md)

## Open Questions

- [ ] Should the first visible companion dashboard live entirely inside
      `Cats Chat`, or should it also reserve a later mobile companion
      projection from the start?
- [ ] Should background music be stored as ordinary companion resources plus a
      selected setting, or as a separate first-class settings record family?
- [ ] Should companion `Creations` initially index only product-known outputs,
      or also include runtime-produced artifacts more generically?
- [ ] Which proactive behaviors should ship first: rituals, scheduled
      check-ins, or response-only presence?

## References

- [Companion Core Capabilities](../research/2026-03-26-companion-core-capabilities.md)
- [Cats Chat Spatial Layout Guidelines](../research/2026-03-26-cats-chat-spatial-layout-guidelines.md)
- [Cats as an AI-First App Store](../research/2026-03-26-cats-ai-first-app-store-vision.md)

---

*Created: 2026-03-26*
*Author: Codex*
*Related Plan: [PLAN-025](../plans/PLAN-025-companion-workspace-presence-and-settings.md)*
