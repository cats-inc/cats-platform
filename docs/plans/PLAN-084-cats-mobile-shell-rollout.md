# PLAN-084: Cats Mobile Shell Rollout

> Phased implementation plan for the first-class mobile shell defined in
> ADR-092 and SPEC-095. Carries the connectivity / push / App Store
> sub-plan from the 2026-03-24 research note as Phase 7 input rather than
> redesigning it.

## Metadata

| Field | Value |
|-------|-------|
| **Status** | In Progress (Phases 1–6 + 4b/4c live data + SSE landed; mobile-safe boundary + import-guard; Phase 5 product modal panels and Phase 7/8 outstanding) |
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

- [x] Mount the bottom-tab navigator at
      `cats-platform/mobile/app/(tabs)/_layout.tsx` with the five tabs in
      fixed order: `Lobby`, `Chat`, `Code`, `Work`, `Settings`.
- [x] Stub each tab's landing screen with the tab name and a placeholder
      so navigation works end-to-end before any content lands.
- [x] Set up theme primitives in `cats-platform/mobile/src/renderer/theme.ts`
      (colours, type scale, spacing) sourced from the web design tokens
      where available. Initial dark draft replaced in Phase 2 with the
      actual web palette from `src/design/tokens.css`.
- [x] Wire `expo-router/types` so route params (`channelId`) are typed.
- [ ] Verify `expo run:ios` and `expo run:android` boot the shell.
      *(Operator-side verification — typecheck clean; simulator-level
      boot still pending owner.)*

**Deliverables**: bootable mobile shell with five empty tabs and tab-bar
icons in place. No product content.

### Phase 2: Bubble PoC and visual gate

- [x] Add `cats-platform/mobile/src/renderer/MessageBody.tsx` as the RN
      bubble renderer. The shared
      `messageBodySegmenter.ts` from
      `src/products/shared/renderer/components/` is **not** imported
      directly yet — see the deferred-import note at the bottom of this
      plan. Local `src/renderer/types/messageBody.ts` mirrors the
      segment / attachment shape and is removed once Metro / tsconfig
      path resolution from mobile to `cats-platform/src` lands.
- [x] Map every CSS class used by the web `MessageBody` to a
      `StyleSheet.create` entry in
      `cats-platform/mobile/src/renderer/styles/messageBody.ts`.
- [x] Cover all segmenter outputs: text, URL, mention, image attachment,
      file attachment chip.
- [x] Build a side-by-side visual harness — a dev-only screen at
      `app/(dev)/bubble-harness.tsx` rendering a fixed corpus of seven
      bubble shapes against the same StyleSheet. Discoverable from the
      Settings tab → Developer tools.
- [ ] Run the visual gate at viewports 320 × 568, 390 × 844, 768 × 1024
      (NFR-002). Record results.
      *(Operator-side verification — harness is in place; simulator
      screenshot comparison still pending owner.)*
- [ ] If the gate fails: open the WebView fallback decision per SPEC-095
      Open Questions and update PLAN-084 / SPEC-095 before proceeding.

**Deliverables**: working RN bubble renderer with a recorded visual-gate
result. A go / no-go on RN-native ChatView vs WebView fallback for
ChatView.

### Phase 3: Chat sidebar tab

- [x] Port `src/products/chat/renderer/components/Sidebar.tsx` to
      `cats-platform/mobile/src/renderer/sidebars/ChatSidebar.tsx`.
      Implementation renders the canonical entry set (three primary
      action chips + Recents section + MY CATS section + add-cat
      trailing action).
- [x] Use `FlatList` with a unioned row data model so all entry kinds
      sit in the same list primitive.
- [ ] Reuse the chat API client from `cats-platform/mobile/src/api/`.
      *(Phase-3 PoC ships against fixture data at
      `src/api/fixtures/chatSidebar.ts`; live API client wiring lands
      with Phase 4b.)*
- [x] Tap-through navigates to a stub ChatView screen — the screen
      itself lands in Phase 4.
- [x] Acceptance: full Chat sidebar entries render on mobile and tapping
      a Recents entry pushes to a stub.

**Deliverables**: Chat tab renders the full web sidebar set on mobile.

### Phase 4: Shared ChatView (chat mode)

Phase 4 was split into four sub-slices in flight:

- **4a — ChatView shell**: visual scaffolding with FlatList of
  fixture messages and a no-op composer.
- **4b — Live data**: swap fixture conversation for the live chat
  store; streaming updates.
- **4c — Real send path**: composer dispatches into the shared
  engine.
- **4d — Polish**: scroll-to-bottom + pull-to-refresh + keyboard
  avoidance.

Status:

- [x] Build `cats-platform/mobile/src/renderer/ChatView.tsx` taking
      `productMode` and `channelId` props. *(Phase 4a — landed in
      commit `15a8f7ef`.)*
- [x] Conversation list updates land on the same store as web.
      *(Phase 4b — landed in commits `0aba95c2` (live messages) and
      `a87329e0` (live MY lens / Recents). Streaming for assistant
      replies still lands later as a Phase 4c follow-up; for now
      pull-to-refresh + auto-refetch after send picks up new
      assistant messages.)*
- [x] Composer is wired to the real shared-engine send path.
      *(Phase 4c — landed in commit `f9b73bc1`. POSTs to
      `/api/channels/{id}/messages` with body, refetches on success,
      surfaces MobileApiError inline on failure. Streaming is the
      remaining Phase-4c follow-up.)*
- [x] Keyboard avoidance, scroll-to-bottom, and pull-to-refresh.
      *(Phase 4d — landed in commit `823f4319`; pull-to-refresh now
      genuinely refetches after `f9b73bc1`.)*
- [x] Acceptance: a Chat conversation can be entered, messages can
      be sent and received, and bubbles match the visual gate from
      Phase 2. *(Send / receive end-to-end against the live desktop;
      bubble parity remains pending operator screenshot
      comparison.)*

**Deliverables**: working Chat conversation surface on mobile.

#### Phase 4 dependency note

Phases 4b and 4c required either (a) a published
`@cats-inc/cats-platform` package mobile could `import` from, or (b)
Metro / tsconfig path resolution from mobile to `cats-platform/src`.
The 2026-04-29 probe showed naive (b) pulls the entire
`cats-platform/src` tree into mobile typecheck through transitive
imports (`node:crypto` via `guideCatAssist`).

The resolution that landed: `src/mobile/**` mobile-safe boundary
(commits `cc0dea4b` and `3f7a1b9c`). The boundary exposes narrow DTO
types and pure selectors only; an import-guard script
(`scripts/check-mobile-boundary.mjs`) plus a server-side alignment
file (`__mobileAlignment.ts`) enforce that the boundary stays clean
and that the narrow DTOs remain structural subsets of the full
server contracts. Mobile imports types and selectors from the
boundary via TypeScript bundler resolution; the segmenter signature
was narrowed (`MentionResolverCat` instead of `ChatCat`) so it does
not drag the heavy contract chain.

### Phase 5: Code and Work tabs

- [x] Add a single shared
      `cats-platform/mobile/src/renderer/sidebars/TrimmedProductSidebar.tsx`
      that takes a `TrimmedSidebarConfig` and renders the same five-row
      shape for both products. Code config holds `+New code`,
      `+Team code`, `+Peer code`, `MY CODES`, `Recents (Code)`. Work
      config mirrors the shape — the two Work presets are TBD-marked
      placeholders pending the SPEC-095 Open Question.
- [ ] Source the entries through product-owned mobile selectors
      exposed by `src/products/code/api/index.ts` and
      `src/products/work/api/index.ts`. *(Phase-5 PoC ships a static
      config in `src/api/fixtures/productSidebar.ts`; the product-owned
      mobile selector contract is deferred to the same
      shared-source-import slice as Phase 4b.)*
- [x] Extend the shared `ChatView` to switch composer chips, header
      side-panel triggers, and empty-state copy on `productMode`.
      *(Header eyebrow + composer placeholder switch on `productMode`;
      side-panel triggers wait on Phase 5 modal extension below.)*
- [ ] Surface product-mode side panels (`CodeBuilderView`,
      `ProjectDetailView`, `ApprovalQueuePanel`, etc.) as RN bottom
      sheets / fullscreen modals — not as inline columns.
      *(Outstanding — modals stack on the deferred shared-source-import
      slice.)*
- [x] Acceptance: `+New code` from the Code tab opens a Code-mode
      ChatView; `+New work` from the Work tab opens a Work-mode ChatView.
      Side panels in modals — outstanding per the row above.

**Deliverables**: Code and Work tabs functional end-to-end with shared
ChatView.

### Phase 6: Lobby and Settings tabs

- [x] Mount Lobby tab with a fixture-backed mobile projection of
      `/lobby` (today summary cards, Guide Cat assist card, quick entry
      chips into Chat / Code / Work, recent activity rows linking into
      chat channels).
- [x] Mount Settings tab with the canonical four sections: connection
      mode (relay / tunnel / Tailscale, local-state radio for now),
      notification preferences (master + approvals-only toggles), owner
      / account read-only rows, deep link out to web for advanced
      settings. Developer tools row preserves the bubble-harness link.
- [ ] Resolve SPEC-095 Open Questions on Settings depth and Lobby
      content scoping before this phase closes.
      *(Both surfaces note the open questions inline as scope notes;
      owner decision still required.)*
- [x] Acceptance: all five tabs render their full first-class content.

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
| Mobile cannot consume `cats-platform/src` types directly without pulling Node-only modules into the RN type graph (probed 2026-04-29, fails on transitive `node:crypto`) | Medium | Stay with the deferred-import pattern (local re-declarations + TODO) until either (a) `@cats-inc/cats-platform` ships a typed entry point for mobile, or (b) cats-platform exposes a build step that emits a mobile-safe declaration bundle. Phase 4b / 4c block on this. |

## Progress Log

| Date | Update |
|---|---|
| 2026-04-29 | Plan drafted alongside ADR-092 and SPEC-095 |
| 2026-04-29 | Phase 1 skeleton landed (`7f66ee42`): 5-tab navigator, theme draft, stub screens. |
| 2026-04-29 | Phase 2 bubble PoC + visual harness landed (`23ee49ce`): RN MessageBody, StyleSheet mapping, dev-only harness, theme palette corrected to web tokens. |
| 2026-04-29 | Phase 3 Chat sidebar landed (`07506eb0`): FlatList port of full Chat sidebar entry set against fixture data; nav into stub ChatView. |
| 2026-04-29 | Phase 4a ChatView shell landed (`15a8f7ef`): shared ChatView component, MessageBubble extraction, fixture conversation per productMode, no-op composer. |
| 2026-04-29 | Phase 5 Code + Work trimmed sidebars landed (`b9596df7`): TrimmedProductSidebar shared component, Code / Work configs, ChatView modes, MY-lens / RECENTS placeholder destinations. |
| 2026-04-29 | Phase 6 Lobby + Settings landed (`9d8d721f`): Lobby with stat cards, Guide Cat assist, recent activity; Settings with connection mode, notifications, owner, advanced, developer tools. |
| 2026-04-29 | Phase 4d polish landed (`823f4319`): scroll-to-bottom, pull-to-refresh, KeyboardAvoidingView offset; bubble harness consolidated onto MessageBubble. |
| 2026-04-29 | Shared-source-import probe: importing from `cats-platform/src` pulls the whole src tree into mobile typecheck through transitive `node:crypto` etc. Phase 4b / 4c blocked on a separate published-package or build-step slice. |
| 2026-04-29 | SPEC-095 Open Questions all resolved (`536215df`). Two Work presets locked, Settings tab depth locked, MY YYY routes through the platform MY CATS lens, visual gate is manual operator sign-off for v1, Lobby uses a mobile-specific subset over the same `/lobby` projection. |
| 2026-04-29 | Mobile-safe boundary lands (`196c5bd9`): `src/mobile/**` skeleton, segmenter narrow (drops ChatCat dep), import-guard script, server-side alignment check. Mobile migrates to consume from the boundary (`31c4abc2`). Settings persistence + manual base URL ship (`3dfe889a`). |
| 2026-04-29 | API client foundation (`012419dd`); boundary expansion with chat sidebar DTOs + selector (`3f7a1b9c`); ChatSidebar wired to live `/api/app-shell` (`8f061034`); ChatView wired to live `/api/channels/{id}/messages` (`0aba95c2`); composer wired to real `POST` send (`f9b73bc1`). Phase 4b/4c effectively complete on a poll-based read/write loop. |
| 2026-04-29 | Live MY CODES / MY WORKS / Recents (Code) / Recents (Work) screens (`a87329e0`). `useMobileAppShell` shared base hook composes the shell fetch; `selectMobileMyCatsLens` and `selectMobileProductRecents` selectors filter by product. Boundary exposes `MobilePlatformSurfaceId` and `MobileChatChannelSummary.originSurface` for the recents filter. |
| 2026-04-29 | Integrator review follow-ups (5 commits): cross-platform boundary path fix + Work preset finalisation (`0acd6fe0`); +New / +Team / +Peer actions now POST `/api/channels` and route to the real id (`84b9af8a`); `useMobileAppShell` and `useChannelMessages` refetch on tab focus (`f45e6c64`); push notification toggles persisted to AsyncStorage (`c3274529`); boundary check now also scans `mobile/app/**` and `mobile/src/**` for forbidden imports (`5b02abdb`). |
| 2026-04-29 | Phase 4c real-time path lands. 5s polling on focused ChatView (`39bdbb22`) is replaced by an SSE subscription against `/api/events/chat` (`a107ad42`) using `react-native-sse`. Lobby derives stats / activity / today from `/api/app-shell` instead of the fixture (`62854294`). |
| 2026-04-29 | Wrap-up: parallel chat / direct-cat tap / create-new-cat — three flows that cannot be honored on mobile yet (parallel needs `/api/parallel-chat-groups` with targets, direct-lane resolution lives in desktop renderer, cat creation is desktop-only) — replaced silently-broken behavior with explicit `Alert.alert` "desktop only for now" prompts plus a path back into Settings. Phase 5 product side-panel triggers in ChatView header marked with a TODO. |

---

*Created: 2026-04-29*
*Author: Claude*
