# SPEC-095: Cats Mobile Shell — Five Tabs and Product Sidebar Variants

> Define the first-class mobile shell: five bottom tabs (Lobby / Chat /
> Code / Work / Settings), one full Chat sidebar, two trimmed product
> sidebars, one shared ChatView, and a bubble renderer with visual parity
> to the web renderer.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD |
| **Reviewer** | Owner |
| **Related ADR** | [ADR-092](../decisions/092-reposition-cats-mobile-as-first-class-product-client.md) |
| **Related Plan** | [PLAN-084](../plans/PLAN-084-cats-mobile-shell-rollout.md) |
| **Related Research** | [2026-03-24 — Cats Mobile App Feasibility](../research/2026-03-24-cats-mobile-app-feasibility.md) |

## Summary

Cats Mobile is the React Native / Expo application that lives at
`cats-platform/mobile/`. ADR-092 changes its scope from a notification
companion to a first-class product client. This spec defines the resulting
shell: five bottom tabs in a fixed order, what each tab contains, how the
three product tabs (Chat / Code / Work) all funnel into a shared `ChatView`,
which web renderer pieces are reused on RN, and which web surfaces are
explicitly excluded from mobile. Connectivity, pairing, and App Store
posture are out of scope for this spec — they remain owned by the
2026-03-24 research note.

## Goals

- One canonical bottom-tab layout for mobile (`Lobby`, `Chat`, `Code`,
  `Work`, `Settings`).
- `Chat` tab carries the web Chat sidebar in full; `Code` and `Work` tabs
  carry trimmed product sidebars with exactly the entry kinds the owner
  asked for (`+New X`, two product presets, `MY YYY`, `RECENTS`).
- One shared RN `ChatView` reached from all three product sidebars, taking
  a `productMode` prop instead of forking three separate chat screens.
- Reuse the shared `MessageBody` segmenter and attachment extractor on RN
  without forking; replace only the DOM renderer.
- User / assistant bubble visual parity with the web renderer at canonical
  viewports.
- `MY YYY` and `RECENTS` entries on Code / Work tabs route through the
  same MY CATS lens projections that web uses (FR-046, FR-047), so mobile
  does not introduce a parallel agent home.
- Honour the platform / product / runtime layering invariants — the shell
  imports `@cats-inc/cats-platform/core` types only, never runtime code.

## Non-Goals

- Connectivity stack, pairing protocol, push notification design, App
  Store / Play Store submission posture — owned by the 2026-03-24 research
  note. This spec consumes the conclusions, not redefines them.
- A mobile port of Code's `Workspaces` and `Artifacts` sidebar entries
  (FR-048).
- A mobile port of Work's Projects / Work Items / Tasks / Runs / Missions
  management surfaces.
- A mobile port of the `Settings > Cats` registry editor.
- Inline rendering of product-mode side panels (`CodeBuilderView`,
  `ProjectDetailView`, `ApprovalQueuePanel`, etc.) on the conversation
  surface. They surface on mobile as bottom sheets or fullscreen modals
  instead.
- Any mobile-only data model. Mobile consumes the same product APIs the
  web renderer consumes; no mobile-specific schema is introduced.
- A redesign of `MessageBody` segmentation or attachment extraction.
- Performance optimisations for very long conversations (virtualisation
  budget is a Phase 4 polish item, not a v1 acceptance criterion).

## User Stories

- As an owner, I want to open `Cats Mobile` on my phone and immediately
  see the same Chat sidebar I have on desktop, so I can resume a
  conversation without re-orienting myself.
- As an owner, I want to start a new Code task from my phone with one tap
  on `+New code`, choose between `+Team code` and `+Peer code` as quick
  presets, and otherwise not be distracted by Workspaces / Artifacts that
  I don't need on a small screen.
- As an owner, I want the user and assistant bubbles on mobile to look
  the same as the web bubbles I am used to, including link rendering,
  mention chips, image previews, and file attachment chips.
- As an owner, I want one mobile chat screen that adapts to whichever
  product I came from (Chat / Code / Work), not three different ChatView
  implementations to learn.
- As an owner, I want my mobile Settings tab to control connection mode
  and notifications without trying to recreate the desktop Settings
  surface.

## Requirements

### Functional Requirements

#### Shell layout

1. The mobile shell shall mount exactly five bottom tabs, in this fixed
   order: `Lobby`, `Chat`, `Code`, `Work`, `Settings`.
2. The bottom-tab navigator shall be implemented through expo-router's
   `(tabs)` group at `cats-platform/mobile/app/(tabs)/`.
3. Tab labels and icons shall use the same naming as the web renderer
   (`Lobby`, `Chat`, `Code`, `Work`, `Settings`); icons follow the web
   product wordmarks where they exist, otherwise SF Symbols / Material
   icons.
4. Switching tabs shall preserve each tab's navigation stack — re-entering
   a tab returns the user to the screen they last had open.

#### Lobby tab

5. The `Lobby` tab shall render the platform's `/lobby` projection scoped
   to mobile — today summary, quick entry chips into Chat / Code / Work,
   and Guide Cat assist content (FR-031, architecture.md `/lobby`).
6. Lobby content shall come from existing platform APIs; this spec does
   not introduce a mobile-only lobby contract.

#### Chat tab

7. The `Chat` tab shall be a React Native port of the web Chat sidebar
   (`src/products/chat/renderer/components/Sidebar.tsx`).
8. The full sidebar entry set shall be preserved: Recents,
   `MY CATS` (Chat lens contextual subset), and `Add cat in chat`
   (FR-026, FR-027).
9. Tapping a Recents entry shall push the shared `ChatView` with
   `productMode = 'chat'`.

#### Code tab

10. The `Code` tab shall expose exactly five entry kinds and no others:
    - `+New code`
    - `+Team code`
    - `+Peer code`
    - `MY CODES` (the Code lens of `MY CATS`, per FR-046, FR-047)
    - `RECENTS (Code)` (Code-scoped recents, per the product-scoped
      recents pattern in SPEC-070)
11. Code's `Workspaces` and `Artifacts` sidebar entries (FR-048) shall not
    appear on the mobile Code tab.
12. Tapping any entry shall push the shared `ChatView` with
    `productMode = 'code'`.

#### Work tab

13. The `Work` tab shall expose exactly five entry kinds and no others:
    - `+New work`
    - Two work-product presets (specific names tracked in Open Questions)
    - `MY WORKS` (the Work lens of `MY CATS`)
    - `RECENTS (Work)`
14. Work's Projects, Work Items, Tasks, Runs, and Missions management
    surfaces shall not appear on the mobile Work tab.
15. Tapping any entry shall push the shared `ChatView` with
    `productMode = 'work'`.

#### Settings tab

16. The `Settings` tab shall include at minimum:
    - Connection mode and pairing controls (relay / tunnel / Tailscale,
      per the 2026-03-24 research note)
    - Notification preferences
    - Owner / account info
    - A deep link out to the web for advanced settings
17. The `Settings > Cats` registry editor shall not be reimplemented on
    mobile.
18. Settings content beyond the four items above is an Open Question.

#### Shared ChatView

19. The mobile `ChatView` shall be a single React Native screen taking
    `productMode: 'chat' | 'code' | 'work'` and `channelId: string` as
    props.
20. Composer chips, side-panel triggers, and product-mode-specific
    headers shall vary on `productMode`; the conversation column shall
    not.
21. Product-mode side panels (`CodeBuilderView`, `ProjectDetailView`,
    `ApprovalQueuePanel`, etc.) shall surface on mobile as bottom sheets
    or fullscreen modals, not as inline columns.
22. The mobile `ChatView` shall reuse the same chat APIs as the web
    `ChatView` — no new product API contract is introduced for mobile.

#### Bubble rendering

23. The shared `MessageBody` segmenter
    (`src/products/shared/renderer/components/messageBodySegmenter.ts`)
    and attachment extractor shall be imported by mobile without
    modification.
24. The mobile bubble renderer shall map the segmenter outputs onto RN
    primitives:
    - text segment → `<Text>`
    - URL segment → `<Text onPress={Linking.openURL}>`
    - mention segment → nested `<Text>` with avatar-coloured background
    - image attachment → `expo-image` `<Image>`
    - file attachment chip → tappable row with vector icon and filename
25. Bubble shape, padding, mention chip background, and attachment chip
    layout shall match the web renderer at the canonical visual checks
    defined in NFR-002 below.
26. Markdown, syntax highlighting, and other rich content kinds **not**
    present in the web `MessageBody` are out of scope for this spec.

#### Type / package boundaries

27. The mobile shell shall depend on `@cats-inc/cats-platform/core` for
    types only. It shall not import from product runtime, platform
    runtime, or the desktop renderer modules outside the shared renderer
    folder.
28. Mobile-only RN renderer code lives at
    `cats-platform/mobile/src/renderer/`. It shall mirror the responsibility
    boundaries of `src/products/shared/renderer/` but not its DOM
    primitives.

### Non-Functional Requirements

- **NFR-001 — Shared engine fidelity**: The mobile `ChatView` and the web
  `ChatView` shall produce the same dispatch decisions for the same
  inputs (one engine, many presets — NFR-014). Mobile does not implement a
  parallel mention router or recipient-state branch.
- **NFR-002 — Bubble visual gate**: Side-by-side screenshots of the same
  conversation rendered by the web `MessageBody` and the mobile `MessageBody`
  shall match at three viewports: 320 × 568 (iPhone SE class),
  390 × 844 (iPhone 14 class), 768 × 1024 (iPad portrait class). Match
  criteria: bubble bounding box within ±2 px, mention chip colour exact
  match, attachment chip layout identical at the chip level.
- **NFR-003 — TypeScript strictness**: Mobile shall keep `strict: true`
  and use `expo-router/types` for typed routes (already on the skeleton).
- **NFR-004 — File-based routing**: Tab and screen routes shall be
  expressed under `app/` per expo-router conventions; no manual routing
  layer.
- **NFR-005 — No mobile-specific schema**: Persisted records read on
  mobile shall be the same `@cats-inc/cats-platform/core` records the web
  reads. Mobile contributes no new persisted shape.
- **NFR-006 — No mocked APIs in build**: Mobile shall consume the real
  product APIs even in dev — no mobile-only mock layer that diverges
  from the desktop client.

## Design Overview

### Tab and screen tree

```text
cats-platform/mobile/
  app/
    (tabs)/
      _layout.tsx               ← bottom-tab navigator
      lobby.tsx                 ← Lobby tab landing
      chat/
        index.tsx               ← Chat sidebar (full)
        [channelId].tsx         ← shared ChatView, productMode='chat'
      code/
        index.tsx               ← Code sidebar (trimmed)
        [channelId].tsx         ← shared ChatView, productMode='code'
      work/
        index.tsx               ← Work sidebar (trimmed)
        [channelId].tsx         ← shared ChatView, productMode='work'
      settings.tsx              ← Settings tab landing
    _layout.tsx                 ← root navigator (tabs + auth gate)
  src/
    api/                        ← API client (existing skeleton)
    hooks/                      ← shared hooks
    notifications/              ← push notification handlers
    renderer/
      ChatView.tsx              ← shared ChatView (productMode prop)
      MessageBody.tsx           ← RN bubble renderer
      sidebars/
        ChatSidebar.tsx
        CodeSidebar.tsx
        WorkSidebar.tsx
```

### Sidebar derivation pattern

- Code and Work tabs are *not* hand-curated entry lists. They are derived
  by filtering the product's web sidebar configuration:
  - Code mobile sidebar = web Code sidebar entries where
    `entry.kind in {'new', 'preset', 'my', 'recents'}` and
    `entry.id !== 'workspaces' && entry.id !== 'artifacts'`.
  - Work mobile sidebar = web Work sidebar entries where
    `entry.kind in {'new', 'preset', 'my', 'recents'}` and
    `entry.id` not in the management-surface list.
- Filter rules live in product-owned mobile delegates so they cannot
  silently desync from the web sidebar:
  - `src/products/code/api/index.ts` exposes a mobile sidebar selector.
  - `src/products/work/api/index.ts` exposes a mobile sidebar selector.

### Shared ChatView shape

- One screen, one composer, one bubble list.
- `productMode` flips:
  - composer chips (Chat: cat mention; Code: artifact / task; Work: work-
    item linkage)
  - the side-panel triggers in the header
  - the empty-state copy
- Inline product panels are demoted to:
  - bottom sheet for `Approve / Reject` quick actions
  - fullscreen modal for `CodeBuilderView`, `ProjectDetailView`, etc.

### Bubble renderer mapping

| Web (`MessageBody.tsx`) | Mobile (RN renderer) |
|---|---|
| `<div className="messageBodyWrapper">` | `<View>` |
| `<p className="messageBody">` | `<Text>` (parent for inline text) |
| `<span>` text segment | inline `<Text>` |
| `<a className="messageBodyLink">` | `<Text onPress={Linking.openURL}>` |
| `<span className="messageBodyMention" style={{background}}>` | nested `<Text style={{backgroundColor}}>` |
| `<img className="messageBodyImage">` | `expo-image` `<Image>` |
| `<a className="messageBodyFileChip">` | `<Pressable>` with `react-native-svg` icon + filename |

CSS class styles are mapped to `StyleSheet.create` objects. The mapping
lives in `cats-platform/mobile/src/renderer/styles/messageBody.ts` and is
the single source of truth for bubble styling on mobile.

## Dependencies

- `cats-platform/mobile/` — existing Expo skeleton (`package.json`,
  `app.json`, `tsconfig.json`).
- `expo-router` for routing.
- `expo-image` for image attachments.
- `react-native-svg` (or `@expo/vector-icons`) for file-chip and tab-bar
  icons.
- `@cats-inc/cats-platform/core` for types.
- The 2026-03-24 research note for connectivity / pairing decisions.

## Open Questions

- [ ] **Two Work presets**: which two product presets sit on the Work
  tab next to `+New work`? Pending product-team confirmation.
- [ ] **Settings tab depth**: beyond connection / notifications / owner /
  deep-link-to-web, does mobile Settings include any additional surface
  (e.g. companion controls, transport pairing entry, Cats registry
  read-only browse)? Owner decision needed before PLAN-084 Phase 6.
- [ ] **MY YYY routing target**: does `MY CODES` / `MY WORKS` push into
  the platform `MY CATS` lens (FR-046) directly, or does each product
  expose a product-local lens screen that re-uses platform projection
  data? Both satisfy FR-047; product-team preference pending.
- [ ] **WebView fallback gate**: PLAN-084 Phase 2 owns the visual-diff
  acceptance criteria; if the gate fails, ChatView falls back to a
  WebView pointing at the web ChatView. The exact pass/fail bar (image
  similarity threshold? manual sign-off?) needs an explicit decision.
- [ ] **Lobby content scoping**: the platform `/lobby` projection is
  desktop-shaped today. Does mobile show the same projection truncated,
  or a mobile-specific subset (e.g. omit the Guide Cat assist column on
  small viewports)?

## References

- [ADR-092: Reposition Cats Mobile as a First-Class Product Client](../decisions/092-reposition-cats-mobile-as-first-class-product-client.md)
- [PLAN-084: Cats Mobile Shell Rollout](../plans/PLAN-084-cats-mobile-shell-rollout.md)
- [Research: 2026-03-24 — Cats Mobile App Feasibility](../research/2026-03-24-cats-mobile-app-feasibility.md)
- [SPEC-070: Product-Scoped Recents and Channel Origin Surfaces](./SPEC-070-product-scoped-recents-and-channel-origin-surfaces.md)
- `requirements.md` FR-025 (rewritten by ADR-092), FR-026, FR-027,
  FR-038, FR-046, FR-047, FR-048, NFR-014
- `architecture.md` `/lobby` route, Concurrent / Parallel / Code Presets,
  Presentation Surfaces (rewritten by ADR-092)
- `cats-platform/src/products/shared/renderer/components/MessageBody.tsx`
- `cats-platform/src/products/shared/renderer/components/messageBodySegmenter.ts`
- `cats-platform/src/products/chat/renderer/components/Sidebar.tsx`
- `cats-platform/mobile/` — Expo skeleton

---

*Created: 2026-04-29*
*Author: Claude*
*Related Plan: [PLAN-084](../plans/PLAN-084-cats-mobile-shell-rollout.md)*
