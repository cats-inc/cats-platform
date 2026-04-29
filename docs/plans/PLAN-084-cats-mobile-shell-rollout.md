# PLAN-084: Cats Mobile Shell Rollout

> Phased implementation plan for the first-class mobile shell defined in
> ADR-092 and SPEC-095. Carries the connectivity / push / App Store
> sub-plan from the 2026-03-24 research note as Phase 7 input rather than
> redesigning it.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft |
| **Owner** | TBD |
| **Assigned To** | Unassigned |
| **Reviewer** | Owner |
| **Related ADR** | [ADR-092](../decisions/092-reposition-cats-mobile-as-first-class-product-client.md) |
| **Related Spec** | [SPEC-095](../specs/SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md) |
| **Related Research** | [2026-03-24 — Cats Mobile App Feasibility](../research/2026-03-24-cats-mobile-app-feasibility.md) |

## Related Spec

[SPEC-095: Cats Mobile Shell — Five Tabs and Product Sidebar Variants](../specs/SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md)

## Overview

Build the mobile shell from the inside out. Three early phases prove the
hardest risks (bubble parity, Chat sidebar port, shared ChatView). Two
middle phases extend the shell to Code / Work / Lobby / Settings. The last
two phases pull in the connectivity research and ship to the stores.

```text
Phase 1  Skeleton                       (~3-4 days)
Phase 2  Bubble PoC + visual gate       (~1 week)
Phase 3  Chat sidebar tab               (~1 week)
Phase 4  Shared ChatView (chat mode)    (~1.5 weeks)
Phase 5  Code + Work tabs               (~1.5 weeks)
Phase 6  Lobby + Settings tabs          (~1 week)
Phase 7  Connectivity + push + pairing  (~2 weeks)
Phase 8  App Store + Play Store         (~1-2 weeks)
```

The estimates are fresh against the new scope and supersede the
companion-app 2-3 week MVP estimate from the 2026-03-24 research.

## Implementation Phases

### Phase 1: Skeleton

- [ ] Mount the bottom-tab navigator at
      `cats-platform/mobile/app/(tabs)/_layout.tsx` with the five tabs in
      fixed order: `Lobby`, `Chat`, `Code`, `Work`, `Settings`.
- [ ] Stub each tab's landing screen with the tab name and a placeholder
      so navigation works end-to-end before any content lands.
- [ ] Set up theme primitives in `cats-platform/mobile/src/renderer/theme.ts`
      (colours, type scale, spacing) sourced from the web design tokens
      where available.
- [ ] Wire `expo-router/types` so route params (`channelId`) are typed.
- [ ] Verify `expo run:ios` and `expo run:android` boot the shell.

**Deliverables**: bootable mobile shell with five empty tabs and tab-bar
icons in place. No product content.

### Phase 2: Bubble PoC and visual gate

- [ ] Add `cats-platform/mobile/src/renderer/MessageBody.tsx` as the RN
      bubble renderer, importing the existing
      `messageBodySegmenter.ts` from
      `src/products/shared/renderer/components/`.
- [ ] Map every CSS class used by the web `MessageBody` to a
      `StyleSheet.create` entry in
      `cats-platform/mobile/src/renderer/styles/messageBody.ts`.
- [ ] Cover all segmenter outputs: text, URL, mention, image attachment,
      file attachment chip.
- [ ] Build a side-by-side visual harness — a dev-only screen that
      renders a fixed corpus of test messages on RN and shows a known
      web screenshot for comparison.
- [ ] Run the visual gate at viewports 320 × 568, 390 × 844, 768 × 1024
      (NFR-002). Record results.
- [ ] If the gate fails: open the WebView fallback decision per SPEC-095
      Open Questions and update PLAN-084 / SPEC-095 before proceeding.

**Deliverables**: working RN bubble renderer with a recorded visual-gate
result. A go / no-go on RN-native ChatView vs WebView fallback for
ChatView.

### Phase 3: Chat sidebar tab

- [ ] Port `src/products/chat/renderer/components/Sidebar.tsx` to
      `cats-platform/mobile/src/renderer/sidebars/ChatSidebar.tsx`.
- [ ] Use `FlatList` with the same data model the web sidebar uses
      (Recents, MY CATS contextual subset, Add cat in chat).
- [ ] Reuse the chat API client from `cats-platform/mobile/src/api/`
      (already on the skeleton).
- [ ] Tap-through navigates to a stub ChatView screen — the screen itself
      lands in Phase 4.
- [ ] Acceptance: full Chat sidebar entries render on mobile and tapping
      a Recents entry pushes to a stub.

**Deliverables**: Chat tab renders the full web sidebar set on mobile.

### Phase 4: Shared ChatView (chat mode)

- [ ] Build `cats-platform/mobile/src/renderer/ChatView.tsx` taking
      `productMode` and `channelId` props (default to `'chat'` for this
      phase).
- [ ] Conversation list uses `FlatList` with the Phase-2 RN
      `MessageBody`. Streaming updates land on the same store as web.
- [ ] Composer is a minimal RN composer (text input, send button). Cat
      mention and recipient state come from the same shared engine.
- [ ] Keyboard avoidance, scroll-to-bottom, and pull-to-refresh land
      here.
- [ ] Acceptance: a Chat conversation can be entered, messages can be
      sent and received, and bubbles match the visual gate from Phase 2.

**Deliverables**: working Chat conversation surface on mobile.

### Phase 5: Code and Work tabs

- [ ] Add `cats-platform/mobile/src/renderer/sidebars/CodeSidebar.tsx`
      with the trimmed entry set: `+New code`, `+Team code`, `+Peer code`,
      `MY CODES`, `RECENTS (Code)`. Source the entries through the
      product-owned mobile selector exposed by
      `src/products/code/api/index.ts` (delegate added in this phase).
- [ ] Add `cats-platform/mobile/src/renderer/sidebars/WorkSidebar.tsx`
      with the trimmed entry set: `+New work`, two work presets,
      `MY WORKS`, `RECENTS (Work)`. Mirror the Code pattern through
      `src/products/work/api/index.ts`.
- [ ] Extend the shared `ChatView` to switch composer chips, header
      side-panel triggers, and empty-state copy on `productMode`.
- [ ] Surface product-mode side panels (`CodeBuilderView`,
      `ProjectDetailView`, `ApprovalQueuePanel`, etc.) as RN bottom
      sheets / fullscreen modals — not as inline columns.
- [ ] Acceptance: `+New code` from the Code tab opens a Code-mode
      ChatView; `+New work` from the Work tab opens a Work-mode ChatView;
      side panels open in modals when triggered.

**Deliverables**: Code and Work tabs functional end-to-end with shared
ChatView.

### Phase 6: Lobby and Settings tabs

- [ ] Mount Lobby tab with the platform `/lobby` projection scoped to
      mobile (today summary, quick entry chips, Guide Cat assist).
- [ ] Mount Settings tab with: connection mode (relay / tunnel /
      Tailscale), notification preferences, owner / account, deep link
      out to web for advanced settings.
- [ ] Resolve SPEC-095 Open Questions on Settings depth and Lobby
      content scoping before this phase closes.
- [ ] Acceptance: all five tabs render their full first-class content.

**Deliverables**: complete mobile shell, ready to wire connectivity.

### Phase 7: Connectivity, push, and pairing

- [ ] Carry the Phase 1 plan from the 2026-03-24 research note: cloud
      relay (Cloudflare Worker, ~200 lines), pairing flow (QR / 6-digit
      code), notification handler with `setNotificationCategoryAsync`
      action buttons.
- [ ] Wire the cats-runtime notification emitter for approval requests,
      escalations, and task completions.
- [ ] Wire mobile push receipt + action handling end-to-end.
- [ ] Add Phase 2 (research) tunnel / direct WebSocket relay as a
      follow-up branch in this phase, gated behind the Phase 1 ship.
- [ ] Add Phase 3 (research) Tailscale power-user mode as a Settings tab
      option, never as a required step.

**Deliverables**: mobile receives push notifications, supports pairing,
and connects to the desktop cats either via relay or via direct mode.

### Phase 8: App Store and Play Store submission

- [ ] Run the App Store / Play Store checklist from Part 8 of the
      2026-03-24 research note (privacy policy, demo mode, review notes,
      crash-free rate, etc.).
- [ ] Configure Expo EAS Build for iOS + Android CI builds.
- [ ] Submit to App Store and Play Store. Iterate on review feedback.

**Deliverables**: Cats Mobile available on both stores under the first-
class shell scope.

## Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `cats-platform/mobile/app/(tabs)/_layout.tsx` | Create | Bottom-tab navigator (Phase 1) |
| `cats-platform/mobile/app/(tabs)/lobby.tsx` | Create | Lobby tab landing (Phase 6) |
| `cats-platform/mobile/app/(tabs)/chat/index.tsx` | Create | Chat sidebar screen (Phase 3) |
| `cats-platform/mobile/app/(tabs)/chat/[channelId].tsx` | Create | Chat-mode ChatView host (Phase 4) |
| `cats-platform/mobile/app/(tabs)/code/index.tsx` | Create | Code sidebar screen (Phase 5) |
| `cats-platform/mobile/app/(tabs)/code/[channelId].tsx` | Create | Code-mode ChatView host (Phase 5) |
| `cats-platform/mobile/app/(tabs)/work/index.tsx` | Create | Work sidebar screen (Phase 5) |
| `cats-platform/mobile/app/(tabs)/work/[channelId].tsx` | Create | Work-mode ChatView host (Phase 5) |
| `cats-platform/mobile/app/(tabs)/settings.tsx` | Create | Settings tab (Phase 6) |
| `cats-platform/mobile/src/renderer/MessageBody.tsx` | Create | RN bubble renderer (Phase 2) |
| `cats-platform/mobile/src/renderer/styles/messageBody.ts` | Create | StyleSheet mapping for bubble styling (Phase 2) |
| `cats-platform/mobile/src/renderer/theme.ts` | Create | Mobile design tokens (Phase 1) |
| `cats-platform/mobile/src/renderer/ChatView.tsx` | Create | Shared ChatView (Phase 4 / 5) |
| `cats-platform/mobile/src/renderer/sidebars/ChatSidebar.tsx` | Create | Chat sidebar port (Phase 3) |
| `cats-platform/mobile/src/renderer/sidebars/CodeSidebar.tsx` | Create | Code sidebar (Phase 5) |
| `cats-platform/mobile/src/renderer/sidebars/WorkSidebar.tsx` | Create | Work sidebar (Phase 5) |
| `cats-platform/src/products/code/api/index.ts` | Modify | Expose mobile sidebar selector (Phase 5) |
| `cats-platform/src/products/work/api/index.ts` | Modify | Expose mobile sidebar selector (Phase 5) |
| `cats-platform/mobile/src/notifications/handler.ts` | Create | Push notification handler (Phase 7) |
| `cats-platform/mobile/src/notifications/actions.ts` | Create | Notification action buttons (Phase 7) |

## Technical Decisions

- **Renderer split**: web renderer stays under `src/products/.../renderer/`;
  mobile RN renderer lives under `cats-platform/mobile/src/renderer/`.
  Both consume the same shared engine and segmenter logic.
- **Sidebar derivation**: Code / Work mobile sidebars filter their web
  sidebar through product-owned mobile selectors. This keeps the
  product-app boundary intact (CLAUDE.md parallel-delivery rules) and
  prevents drift.
- **No mobile-specific types**: mobile imports types from
  `@cats-inc/cats-platform/core` only.
- **Visual gate first**: bubble parity is the highest-risk technical
  question. Phase 2 settles it before any conversation surface lands.

## Testing Strategy

- **Unit tests**: bubble renderer mapping (`messageBodySegmenter` is
  already covered by web tests; mobile renderer adds RN-specific unit
  tests for nested-Text mention and attachment chip layout).
- **Visual tests**: Phase 2 visual harness with locked-in screenshots at
  three viewports.
- **Integration tests**: mobile chat-send / receive end-to-end against a
  local desktop cats — covered by Phase 4 and Phase 5 acceptance.
- **Manual testing**: each phase ends with manual run-through on a
  physical iOS and Android device.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Bubble visual parity does not pass the Phase-2 gate | High | Fall back to WebView for ChatView only, per SPEC-095 Open Questions; Phase 2 owns the decision before Phase 3 starts |
| Code / Work sidebar entries silently desync from web sidebar | Medium | Sidebars are derived through product-owned mobile selectors; no hand-curated mobile entry list |
| Side-panel modal density feels cramped on small viewports | Medium | Phase 5 tests on iPhone SE class viewport; reorganise into bottom sheet vs fullscreen modal split based on observed cramping |
| Push notification setup blocks earlier phases | Low | Phase 7 runs after the shell is complete; earlier phases work without push |
| App Store rejection on guideline 4.2 (minimum functionality) | Medium | Mobile is no longer companion-only; full Chat / Code / Work surfaces should clear the bar. Demo mode and review notes from the research note Part 8 still apply |
| RN nested-Text background colour for mention chips behaves differently on iOS | Low | Phase 2 includes iOS-specific check; fallback is to wrap mention text in `<View>` if cross-platform inline background is too unreliable |

## Progress Log

| Date | Update |
|---|---|
| 2026-04-29 | Plan drafted alongside ADR-092 and SPEC-095 |

---

*Created: 2026-04-29*
*Author: Claude*
