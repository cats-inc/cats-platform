# ADR-040: Make Companion a First-Class Chat Mode with Workspace and Presence

> **2026-04-28 amendment**: This ADR is amended in part by
> [ADR-084](./084-adopt-companion-profile-ia-and-shareable-content-references.md).
> Still binding: companion as a first-class `Cats Chat` mode, product-owned
> presence, long-lived companion state, and the `cats -> cats-runtime`
> execution boundary. Amended: the visible `Overview / Resources / Creations /
> Settings` dashboard IA and companion-local transport/settings ownership.
> ADR-084 defines the revised profile/feed/library IA, canonical
> `Settings > My Cats` ownership, and shareable companion content references.

> Treat companion as a first-class `Cats Chat` mode above direct Cat chat by
> giving it a product-owned workspace, presence model, settings surface, and
> resource/creation dashboard, while keeping `cats-runtime` as the execution
> boundary.

## Status

Proposed

## Date

2026-03-26

## Context

`cats` already has several companion-adjacent building blocks:

- direct Cat chat
- per-Cat companion boxes and hydration seams
- Cats-owned memory extraction and retrieval
- Cat-scoped response profiles
- Telegram/public bot binding direction

Those pieces are valuable, but the visible product shape is still too thin.
Today, companion risks being interpreted as:

- a direct chat lane with a nicer prompt
- a sidecar storage model without a product workspace
- a Cat with some memory, but without clear presence, settings, or resource
  management

That is not enough for the intended product direction.

The desired shape is stronger:

- each companion should feel like a persistent being, not merely a session
- companion should have a dedicated product workspace, not just an artifact
  viewer or a generic settings page
- companion should own visible presence state and behavior style
- companion should be able to manage what the owner gave it and what it has
  created
- the system should support long-lived companion identity without forcing the
  same Cat to fragment into many duplicate records for Chat, Work, and Code

The existing companion-memory/Pandora-box direction also implies a stronger
emotional and archival role than a generic utility bot. That makes a
first-class companion mode more important, not less.

## Decision

`cats` will treat companion as a first-class `Cats Chat` mode above direct Cat
chat.

### 1. Companion is not just "direct Cat chat with better prompts"

Direct Cat chat remains the conversational routing foundation, but companion is
now a product mode with additional structure:

- product-owned workspace
- product-owned presence state
- product-owned settings
- product-owned resource/creation management

### 2. Companion shall own a dedicated workspace shape

Companion conversations should be able to open a companion workspace composed
of:

- transcript
- companion dashboard

The dashboard should support at least these sections:

- `Overview`
- `Resources`
- `Creations`
- `Settings`

Focused artifact viewing is allowed, but artifact view is not the whole
companion product surface.

### 3. Presence and reply style remain product-owned

Companion state such as:

- `awake`
- `sleeping`
- reply style such as `verbal` vs `vocalization`

shall remain product-owned.

`Disturb` is not a separate state. Waking a sleeping companion is already the
disturbance.

### 4. Companion settings are first-class, not buried generic metadata

Companion mode should own its own settings surface for at least:

- Telegram/public transport binding
- avatar
- background image
- background music
- response style / profile
- awake/sleeping state

### 5. Resources and creations are separate concepts

Companion shall distinguish between:

- `Resources`: what the owner gave the companion
- `Creations`: what the companion produced

This distinction matters both emotionally and functionally, and should not be
collapsed into one generic artifact list.

### 6. One Cat identity may serve multiple product profiles

The same Cat identity may participate across:

- companion
- work
- code

But the system should not model this as one crude global mode switch.

Instead, the product should move toward:

- shared Cat identity
- profile/behavior pack per product mode
- room-local working memory

### 7. `cats-runtime` remains the execution boundary

This ADR does not move companion dashboard, settings, transport lifecycle, or
long-lived storage into `cats-runtime`.

`cats-runtime` still owns:

- execution
- skills
- session-local work

`cats` still owns:

- companion identity and workspace
- companion box and long-lived memory
- visible settings and presence
- transport configuration

## Consequences

### Positive

- Companion stops being a thin flavor layer and becomes a real product mode.
- The product gains a clearer path to emotionally meaningful companion use
  cases, including memory-heavy and memorial use.
- Direct chat, companion memory, transport, and settings can converge under one
  coherent surface.
- Future app-store/platform ambitions gain a stronger first-party app category.

### Negative

- The product now needs a real companion dashboard/workspace, not just storage
  contracts.
- More UI/read-model work is required before the companion vision is visible.
- Presence, transport, rituals, and multimodal creation flows will need phased
  delivery instead of one narrow feature slice.

### Neutral

- This ADR does not require a public marketplace.
- This ADR does not require all multimodal generation stacks to ship in one
  slice.
- This ADR does not force Work or Code to mirror companion UX.

## Alternatives Considered

### Alternative 1: Keep companion as a direct-chat variant only

- **Pros**: less product work, easier short-term scope
- **Cons**: weak identity, weak settings story, weak resource/creation model,
  and insufficient emotional/archival weight
- **Why rejected**: it is too thin for the intended product direction

### Alternative 2: Treat companion as just another artifact-oriented workspace

- **Pros**: reuses existing artifact concepts
- **Cons**: collapses companion resources, creations, settings, and presence
  into one wrong container
- **Why rejected**: companion needs a broader dashboard than artifact view

### Alternative 3: Give each product mode a separate Cat identity

- **Pros**: easy conceptual separation
- **Cons**: duplicates identity, memory, and relationship continuity
- **Why rejected**: the preferred direction is shared identity with
  mode-specific behavior packs

## References

- [ADR-017](./017-allow-direct-cat-chat-and-move-routing-into-system-layer.md)
- [ADR-028](./028-allow-multiple-public-bot-bindings-with-one-boss-cat.md)
- [ADR-030](./030-own-per-cat-companion-boxes-in-product-and-hydrate-runtime-sessions.md)
- [SPEC-029](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [Companion Core Capabilities](../research/2026-03-26-companion-core-capabilities.md)
- [Cats Chat Spatial Layout Guidelines](../research/2026-03-26-cats-chat-spatial-layout-guidelines.md)
- [Cats as an AI-First App Store](../research/2026-03-26-cats-ai-first-app-store-vision.md)

---

*Proposed: 2026-03-26*
*Author: Codex*
