# Companion Core Capabilities

## Metadata

- **Date**: 2026-03-26
- **Author**: Codex
- **Scope**: Companion capability baseline for `Cats Chat`
- **Related**:
  - [Cats Chat Spatial Layout Guidelines](./2026-03-26-cats-chat-spatial-layout-guidelines.md)
  - [Cats Product Lines: Chat, Work, and Code](./2026-03-20-cats-product-lines-chat-work-code.md)
  - [Image and Video Generation as Cat Capability](./2026-03-24-image-video-gen-as-cat-capability.md)

## Purpose

Define what "companion" should mean in `Cats Chat`, beyond a plain direct chat
with a Cat.

This note captures the minimum product expectations for a believable companion,
the missing capability gaps today, and the relationship between companion mode,
work mode, and the broader Cats product family.

## Core Insight

A companion is not just:

- a direct chat
- a cute persona
- a renamed assistant

A companion needs continuity, presence, resources, creations, settings,
transport, and user-controlled relationship surfaces.

Without those, the experience remains a configurable chat agent rather than a
true companion product.

## What Companion Is

A companion should feel like:

- a persistent being with stable identity
- a relationship that continues across sessions
- a multimodal presence that can receive things and create things
- a configurable character with mood/state/behavior settings
- an entity that can exist in direct chat and transport channels

## What Companion Is Not

Companion should not be modeled as:

- "just another worker cat"
- "just a direct room with a bigger artifact panel"
- "just a bot with a profile picture"

Companion is a product mode with its own expectations.

## Capability Areas

### 1. Identity and Continuity

A companion needs:

- stable name and avatar
- persistent identity across rooms/sessions
- continuity of tone and relationship
- memory of important user preferences and shared history

This is the foundation of the companion effect. Without continuity, the
experience resets back to generic assistant behavior.

### 2. Presence and State

A companion needs explicit presence state, not just response generation.

Important states:

- awake
- sleeping
- busy/occupied
- available for interruption

For the first slice, the most important visible control is:

- `Awake` vs `Sleeping`

This also subsumes disturbance. If the companion is sleeping and the user
switches it to awake, that action is the disturbance. A separate `Disturb`
toggle is unnecessary.

### 3. Behavior Style

Companion behavior should support a user-facing behavioral toggle such as:

- `Human-like`
- `Cat-like`

This affects:

- wording style
- whether replies are fully textual or more onomatopoeic/playful
- presence style
- perhaps animation/audio defaults later

### 4. Resource Intake

A companion needs a durable place for things the user gives it:

- photos
- videos
- audio
- text files
- notes
- references

These are not ephemeral chat attachments only. They should become part of the
companion's accessible resource space.

Recommended framing:

- `Resources` = what the user gave the companion

### 5. Creation Output

A companion also needs a place for things it creates:

- images
- audio clips
- songs
- videos
- documents
- plans
- mixed media outputs

Recommended framing:

- `Creations` = what the companion produced

This distinction matters because user-given artifacts and companion-created
artifacts have different emotional meaning and different management needs.

### 6. Settings and Atmosphere

Companion needs a dedicated settings surface with at least:

- Telegram setup
- avatar
- background image
- background music
- behavior style
- awake/sleeping control

These are not generic product settings. They are part of the companion's
identity and atmosphere.

### 7. Transport Presence

A believable companion should not be trapped inside one local web view.

Transport matters:

- Telegram is the first obvious transport
- later surfaces may include others

Transport gives:

- continuity
- ambient presence
- the feeling that the companion exists outside the single tab/session

### 8. Rituals, Requests, and Skills

Companions also need structured user expectations over time:

- standing requests
- recurring rituals
- favorite activities
- companion-specific skill packs

Examples:

- morning greeting
- bedtime check-in
- music generation requests
- travel-photo roleplay
- recurring reminders with companion voice/personality

This is where companion begins to diverge strongly from a generic chat agent.

### 9. Editable Relationship Surface

Users need some ability to inspect and edit what defines the relationship:

- important memories
- pinned preferences
- relationship notes
- companion profile

Without this, memory becomes opaque and companion behavior feels random rather
than personal.

## Companion Dashboard Model

Companion should have a right-side dashboard/workspace, not just an artifact
viewer.

Recommended sections:

- `Overview`
- `Resources`
- `Creations`
- `Settings`

Artifact view is still useful, but it should be treated as a focused-object
viewer opened from `Resources` or `Creations`, not as the entire companion
workspace.

## Same Cat Across Work and Companion

One Cat can reasonably participate in different product roles, but this should
not be modeled as one crude global mode switch that mutates the entire Cat.

Better model:

- **Shared identity**
  - long-lived name, avatar, relationship memory, stable personality core
- **Profile / behavior pack**
  - companion
  - work
  - code
- **Room role**
  - direct companion
  - lead worker
  - specialist

This allows:

- one Cat identity
- different behavior in different contexts
- fewer duplicated Cat records

## Recommended Memory Split

To support the above cleanly, companion/work/code should eventually separate:

- **identity memory**
  - who this Cat is across products
- **profile-specific memory**
  - companion-specific behavior and rituals
  - work-specific role conventions
  - code-specific tool patterns
- **room working memory**
  - temporary, session-bound context

This prevents companion behavior from either:

- bleeding into work in weird ways
- or being reset every time the Cat changes context

## Minimum Bar for "Real Companion"

To feel like more than a themed chat assistant, companion needs at least:

1. persistent identity
2. long-term memory/continuity
3. presence state
4. multimodal resources and creations
5. companion-specific settings
6. transport presence
7. some degree of initiative or recurring ritual support

If several of these are missing, the product will likely read as "chatbot with
persona" rather than "companion".

## Current Gaps Relative to That Bar

Today the biggest likely gaps are:

- no dedicated companion dashboard/workspace
- weak separation between resources and creations
- limited presence/state model
- limited proactive behavior
- no robust ritual/request layer
- insufficient visible/editable memory surface
- limited companion-specific settings depth

These gaps do not make companion impossible, but they do explain why the
current experience is still closer to a configurable chat agent.

## Recommendation Summary

1. Treat companion as its own capability layer within `Cats Chat`, not just a
   direct-room variant.
2. Give companion a dashboard/workspace with `Overview`, `Resources`,
   `Creations`, and `Settings`.
3. Keep `Awake/Sleeping` as one state toggle; do not create a separate
   `Disturb` toggle.
4. Support companion-specific settings for Telegram, avatar, background image,
   and background music.
5. Model one Cat identity with multiple behavior packs/profiles, rather than
   separate Cat identities for every mode.
6. Build toward identity memory, profile memory, and room working memory as
   separate layers.

---

*Research note completed: 2026-03-26*
*Author: Codex*
