# PLAN-025: Companion Workspace, Presence, and Settings

> Implement the next visible companion slice in `cats` by building a
> companion-first workspace above the existing companion-box, memory, and
> runtime-hydration substrate.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | Codex |
| **Assigned To** | Codex |
| **Reviewer** | User |

## Related Spec

[SPEC-036: Companion Workspace, Presence, and Settings](../specs/SPEC-036-companion-workspace-presence-and-settings.md)

## Overview

Earlier companion work intentionally focused on invisible substrate:

- companion box sidecar
- session hydration
- canonical memory and retrieval
- response-profile contracts

This plan covers the next step: visible companion product surfaces.

The target is not "one more settings form". The target is a recognizable
companion mode with:

- dedicated workspace
- visible presence
- resource and creation management
- companion-owned settings
- future room for rituals and proactive behavior

**Prerequisite**: [PLAN-019](./PLAN-019-companion-box-sidecar-and-session-hydration.md)
Phase 3 runtime-side hydration consumption should be resolved before or in
parallel with this plan's Phase 2.

## Implementation Phases

### Phase 1: Companion Read Models and Contracts

- [ ] Define a product-owned `CompanionWorkspaceView` / equivalent read model
- [ ] Normalize companion dashboard sections:
      - overview (including curated memory highlights and memory management entry)
      - resources (maps to CompanionBox `sources`)
      - creations (projection of runtime-produced artifacts)
      - settings
- [ ] Add stable presence-state and reply-style records/helpers aligned with
      SPEC-029's `replyStyle` (`verbal` / `vocalization`)
- [ ] Define a `CompanionSettings` contract that wraps `CompanionResponseProfile`
      and adds:
      - Telegram binding linkage
      - avatar
      - background image
      - background music
      - awake/sleeping presence state

**Deliverables**: stable product-owned contracts for visible companion state.

### Phase 2: Workspace Shell and Header Controls

- [ ] Add a companion-aware workspace shell above direct Cat chat
- [ ] Add transcript-side quick controls for:
      - awake/sleeping
      - verbal/vocalization (reply style)
- [ ] Keep `Disturb` implicit rather than introducing a separate toggle
- [ ] Ensure the workspace can coexist with the broader Chat layout rules
      without reviving always-on operator clutter

**Deliverables**: visible companion-mode shell and header controls.

### Phase 3: Resources, Creations, and Memory Surfaces

- [ ] Build `Resources` view from companion-box sources
- [ ] Build `Creations` view as a projection/index of runtime-produced
      artifacts attributed to the companion Cat
- [ ] Keep the distinction between owner-given and companion-produced items
      explicit in the UI/read model
- [ ] Add focused artifact promotion/open behavior from those views
- [ ] Build a dedicated memory management entry point (browsable, editable,
      deletable durable memory records) accessible from Overview or as a
      distinct dashboard sub-view

**Deliverables**: companion library surfaces that make resources and creations
legible.

### Phase 4: Settings and Transport

- [ ] Add companion-owned settings surface with:
      - Telegram/public binding management
      - avatar controls
      - background image
      - background music
      - response-profile editing
- [ ] Keep transport configuration product-owned and scoped correctly to the
      selected Cat/companion
- [ ] Align bot-binding visibility rules with archived/non-chat/product
      participation invariants

**Deliverables**: coherent companion settings that are not buried in generic
registry panels.

### Phase 5: Rituals and Proactive Behavior Foundation

- [ ] Define standing-request / ritual records
- [ ] Add a minimal read model for upcoming or active rituals/check-ins
- [ ] Define the first bounded proactive-behavior seams without requiring a
      full autonomous scheduling system
- [ ] Ensure future proactive triggers respect presence state and transport
      rules

**Deliverables**: foundation for companion behavior beyond reactive chat.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/products/chat/companion/*` | Modify/Create | Companion workspace/read-model/view helpers |
| `src/products/chat/state/companion-box/*` | Modify | Extend companion records into visible resource/creation views |
| `src/products/chat/state/*` | Modify | Presence, behavior, and workspace state integration |
| `src/products/chat/renderer/components/**` | Modify/Create | Companion workspace shell, dashboard sections, settings surfaces |
| `src/products/chat/renderer/styles/**` | Modify/Create | Companion workspace layout and section styling |
| `src/products/chat/api/**` | Modify | Companion settings/transport routes where needed |
| `src/server/routes/telegram.ts` | Modify only if required | Align companion transport settings with Telegram binding behavior |
| `tests/**` | Modify/Create | Companion workspace, settings, presence, and transport regression tests |

## Technical Decisions

- Build on top of existing companion-box and memory substrate rather than
  inventing a new companion storage system.
- Treat companion dashboard as broader than artifact view.
- Keep presence and behavior as product-owned state, not runtime-owned
  preferences.
- Reuse the shared secondary-surface framework where possible, but keep
  companion mode boundaries explicit.
- Preserve the `cats -> cats-runtime` boundary: runtime consumes hydrated
  companion context but does not own companion workspace or long-lived
  settings.

## Testing Strategy

- **Unit Tests**
  - presence/reply-style state normalization
  - companion settings normalization
  - resource vs creation read-model assembly
  - memory management CRUD operations
- **Integration Tests**
  - companion routes/settings persistence
  - Telegram binding interactions for companion settings
  - direct companion room hydration with updated presence/profile settings
  - memory browse/edit/delete flows
- **Renderer/Behavior Tests**
  - header quick toggles (awake/sleeping, verbal/vocalization)
  - dashboard section switching
  - artifact promotion from resources/creations
  - memory highlights in overview and memory management entry

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Companion scope expands into a full social-product rewrite | High | Keep first slice focused on workspace, presence, settings, and resource/creation legibility |
| Companion UI duplicates generic registry/settings flows | Medium | Give companion a dedicated workspace/settings surface instead of hiding everything in generic settings |
| Runtime/session concerns leak back into product-owned identity state | High | Keep hydration additive and product contracts authoritative |
| Resource and creation lists become one confusing artifact bucket | High | Preserve two distinct read models and labels from the first visible slice |

## Progress Log

| Date | Update |
|------|--------|
| 2026-03-26 | Plan created to move companion from invisible substrate into visible workspace/presence/settings surfaces |

---

*Created: 2026-03-26*
*Author: Codex*
