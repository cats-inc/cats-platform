# ADR-092: Reposition Cats Mobile as a First-Class Product Client

> Replace the "limited companion scope" stance for mobile with a first-class
> product client that hosts Lobby, Chat, Code, Work, and Settings as bottom
> tabs, reuses the shared chat-view mental model, and treats user/assistant
> bubble visual parity with the web renderer as a hard requirement.

## Status

Proposed

> Supersedes the scope expressed by FR-025 and the "mobile as optional
> companion" notes in `architecture.md`, `deployment.md`, and
> `AGENT-GUIDE.md`. Reuses the connectivity, App Store, and pairing
> sub-decisions from the research note
> [2026-03-24 — Cats Mobile App Feasibility](../research/2026-03-24-cats-mobile-app-feasibility.md);
> only the *scope* of the mobile shell changes here, not the connectivity
> stack.

## Context

Today's documents describe mobile as a strictly secondary surface:

- `requirements.md` FR-025 — "If a mobile client is added later, it shall
  begin as a limited companion scope for Chat notifications, quick replies,
  and approvals rather than a second full primary product shell."
- `architecture.md` — "optional mobile companion later if needed",
  "any limited mobile companion scope, which is intentionally secondary to
  the desktop platform".
- `deployment.md` — "Mobile is not part of the first packaged primary
  product surface; if added later, treat it as companion scope."
- `AGENT-GUIDE.md` — "Mobile is optional companion scope later, not the
  current full-product focus."
- The 2026-03-24 research note proposed a Phase-1 MVP that is essentially a
  notification client (push + approval action buttons + a tiny dashboard).

The owner's actual mobile usage intent is materially different. The mobile
shell needs to host the same three products (Chat / Code / Work) that the
web shell hosts — not as full ports, but as **trimmed product surfaces** that
all funnel into a shared chat-view. Specifically:

- Five bottom tabs: **Lobby / Chat / Code / Work / Settings**.
- The **Chat tab** is the web Chat sidebar transposed onto mobile, intact —
  Recents, MY CATS contextual subset, and add-cat-in-chat all land here.
- The **Code tab** and **Work tab** are *trimmed* product sidebars: only
  `+New X`, the two product presets, `MY YYY`, and `RECENTS`. The other web
  Code/Work sidebar entries (Code's `Workspaces` / `Artifacts`, Work's
  Projects / Work Items / Tasks / Runs / Missions management views) are
  out of scope for mobile.
- Tapping any conversation entry in any of these three sidebars enters the
  same RN `ChatView`, with the product mode determining the side panels and
  composer chips. This matches the existing "one engine, many presets"
  invariant from FR-038, FR-046, FR-047, and NFR-014.
- User/assistant **bubble visual fidelity with the web renderer is a hard
  requirement** — the owner's instruction was explicit on this point.

The mobile codebase already exists as an Expo + expo-router skeleton at
`cats-platform/mobile/`. It carries Expo SDK 52, React Native 0.76, expo-
router 4 with `typedRoutes`, and `expo-notifications` — all consistent with
the connectivity strategy in the 2026-03-24 research note. The gap is
entirely on the *scope* side: the skeleton was provisioned for a companion
app, but the target shape is now a first-class product client.

The split between "companion stance" in the existing docs and "first-class
client" in current intent is an active source of design ambiguity. Every
mobile-touching plan that lands without resolving this split forces a
choice between two incompatible scopes.

## Decision

Reposition Cats Mobile as a **first-class product client** for Chat, Code,
and Work, with bottom-tab navigation and shared chat-view reuse.

Concretely:

- **Surface inventory**: five bottom tabs, in this order — `Lobby`, `Chat`,
  `Code`, `Work`, `Settings`. No additional top-level mobile surfaces are
  introduced by this ADR.
- **Lobby tab**: the platform's `/lobby` projection, scoped to mobile —
  today summary, quick entry into the other product tabs, and Guide Cat
  assist (per FR-031 and the architecture note at `architecture.md:813`).
- **Chat tab**: the web Chat sidebar (`src/products/chat/renderer/components/Sidebar.tsx`)
  reimplemented as a React Native list. Full sidebar entry set is kept —
  Recents, MY CATS lens of Chat, Add cat in chat. The Chat tab is the only
  product tab whose sidebar is *not* trimmed.
- **Code tab**: a trimmed product sidebar with exactly four entry kinds —
  `+New code`, `+Team code`, `+Peer code`, `MY CODES`, `RECENTS (Code)`.
  Code's `Workspaces` / `Artifacts` sidebar entries (FR-048) do **not**
  appear on mobile. The two existing presets `+Team code` and `+Peer code`
  satisfy the "two presets" slot.
- **Work tab**: a trimmed product sidebar with the same shape — `+New work`,
  two work presets (specific names tracked as an open question pending
  product-team confirmation), `MY WORKS`, `RECENTS (Work)`. Work's
  Projects / Work Items / Tasks / Runs / Missions management surfaces do
  **not** appear on mobile.
- **Settings tab**: scoped to mobile-relevant settings — connection mode
  (relay / tunnel / Tailscale, per the 2026-03-24 research), notifications,
  owner / account, and a deep link out to the web for advanced settings
  (cat registry editor, transport bindings, etc.). The full
  `Settings > Cats` registry editor stays desktop-only.
- **Shared ChatView**: tapping any sidebar entry pushes a single shared RN
  `ChatView` screen. The screen takes a `productMode: 'chat' | 'code' | 'work'`
  prop. Product-mode-specific side panels (`CodeBuilderView`,
  `ProjectDetailView`, etc.) are **not** rendered inline on mobile; they
  surface as bottom sheets or fullscreen modals instead, so the
  conversation column owns the screen.
- **Bubble fidelity**: the shared `MessageBody` segmenter logic
  (`src/products/shared/renderer/components/MessageBody.tsx` and
  `messageBodySegmenter.ts`) is reused 1:1 — it is pure TypeScript with no
  DOM dependencies. The DOM renderer is replaced by an RN renderer that
  maps `<div>` / `<p>` / `<span>` / `<a>` / `<img>` to `<View>` / nested
  `<Text>` / `<Image>`. Bubble shape, padding, mention chip background,
  attachment chip layout, and link / mention semantics are matched to the
  web renderer at canonical viewports (320 / 390 / 768 logical CSS px on
  iOS; equivalent on Android).
- **Connectivity strategy**: unchanged from the 2026-03-24 research note.
  Phase 1 cloud relay + push, Phase 2 tunnel / WebSocket relay direct,
  Phase 3 Tailscale for power users. App Store / Play Store posture
  (Tailscale never required, demo / onboarding mode for review) carries
  forward.
- **Plugin / package shape**: unchanged. `cats-platform/mobile` consumes
  `@cats-inc/cats-platform/core` types only; it does not import runtime
  code. The mobile shell is an API consumer, not a plugin or platform
  module.

The downstream documents that classify mobile as "companion scope" are
amended by this ADR's adoption. The 2026-03-24 research note is **not**
deprecated — its Parts 2, 3, 7, and 8 (connectivity, Tailscale audit,
phasing of network access, App Store checklist) remain the live guidance.
Only its Parts 1 and 5 ("companion stance" framing, mobile project
structure scoped to dashboard / approvals) are superseded.

## Consequences

### Positive

- One clear scope for every mobile-touching plan. The "companion vs
  first-class" ambiguity is removed.
- Owner's actual mobile usage of Chat / Code / Work is unblocked.
- The shared chat-view invariant from FR-038 / FR-046 / NFR-014 extends to
  mobile naturally — the same engine, the same presets, the same MY CATS
  lens projections.
- `MessageBody` segmenter reuse means the bubble parity goal is reachable
  without forking the segmenter or building a parallel content model.
- The connectivity research is preserved verbatim; this ADR does not
  reopen the relay / tunnel / Tailscale design.

### Negative

- The mobile work surface grows substantially compared to the companion
  scope. The 2-3 week MVP estimate from the research note no longer
  applies; PLAN-084 will set a fresh estimate against the new scope.
- Bubble visual parity is genuinely harder than visual approximation. RN
  text metrics differ from the browser, and CSS class styling must be
  re-expressed as `StyleSheet` objects. Some classes (e.g.
  `.messageBodyMention` background colour) need cross-platform care for
  iOS nested Text behaviour. PLAN-084 carries explicit visual-diff
  acceptance criteria.
- Code / Work tabs are sidebar *subsets*, not standalone screens. The
  filtering logic must be derived from the same product sidebar source so
  that "what shows up in mobile" stays in lockstep with "what the web
  sidebar exposes". A drift here would silently desync mobile.
- Settings tab is a documented subset of the desktop Settings surface.
  Owner needs to choose the cut-off for "mobile-relevant settings" (open
  question) before SPEC-095 closes.

### Neutral

- The Expo skeleton already in `cats-platform/mobile` continues to be the
  starting point. No platform retoolchain (Capacitor / Tauri / Flutter) is
  introduced or replaced.
- Push notifications and approval action buttons (the original companion
  features) remain — they sit inside the new shell instead of being the
  whole shell.
- WebView remains a fallback option for the ChatView screen if RN bubble
  parity proves intractable, but is *not* the default path. PLAN-084's
  Phase 2 includes the parity gate that decides this.

## Alternatives Considered

### Keep mobile as companion-only (status quo)

- **Pros**: Smallest delivery surface. The existing FR-025 / docs require
  no rewrites. Push-notification MVP can ship in 2-3 weeks per the research
  note.
- **Cons**: Does not match the owner's stated mobile usage. The owner
  expects to enter Chat / Code / Work conversations on mobile, not just to
  approve or reject from a notification. Holding the companion stance
  forces the owner to keep returning to desktop for the actual interaction.
- **Why rejected**: The owner's instruction was explicit. The companion-
  only stance is a planning artefact from when mobile was being scoped
  defensively against unclear demand. The demand is now clear.

### WebView wrapper for everything (Capacitor-style)

- **Pros**: Maximum web reuse. Bubble parity is automatic — it *is* the
  web renderer. Smallest implementation surface.
- **Cons**: Native tab feel, OS-integrated push, and biometric auth all
  have to bridge through plugin layers. Apple guideline 4.2 ("minimum
  functionality") creates non-zero rejection risk for pure WebView apps.
  Composer keyboard handling, scroll-to-bottom, and gesture interaction
  are all worse than native.
- **Why rejected**: WebView remains a Phase-2 fallback for the ChatView
  screen *only*, not the shell. The shell (tabs / sidebars / Lobby /
  Settings) needs to feel native because it dominates the time the owner
  spends not typing into the composer.

### Hybrid: native shell, WebView for ChatView only

- **Pros**: Bubble parity is automatic for the conversation surface.
  Native feel for navigation / Lobby / Settings / sidebars. Clear scope
  boundary.
- **Cons**: Two rendering models, two scroll behaviours, two keyboard
  models in one app. The seam between RN sidebar and WebView ChatView
  becomes a recurring polish problem (SafeArea, status bar, transport
  events).
- **Why rejected as default**: The shared `MessageBody` segmenter is
  small (114 lines) and pure TypeScript. The expected effort to render it
  in RN is much smaller than the expected effort to keep an RN/WebView
  seam polished. This option remains as the documented Phase-2 fallback
  path if bubble parity fails the visual gate in PLAN-084 Phase 2.

### Flutter rewrite

- **Pros**: Best UI consistency. Hot reload and pixel-level layout
  control.
- **Cons**: Dart language. Zero overlap with the existing TypeScript /
  React mental model. Forces a separate codebase for `MessageBody`
  segmenter logic and types from `@cats-inc/cats-platform/core`.
- **Why rejected**: Already rejected by the 2026-03-24 research note for
  the companion case. The case against it is stronger now that the
  mobile shell needs to consume more shared TypeScript.

## References

- [SPEC-095: Cats Mobile Shell — Five Tabs and Product Sidebar Variants](../specs/SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md)
- [PLAN-084: Cats Mobile Shell Rollout](../plans/PLAN-084-cats-mobile-shell-rollout.md)
- [Research note: 2026-03-24 — Cats Mobile App Feasibility](../research/2026-03-24-cats-mobile-app-feasibility.md)
- [ADR-013](./013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md) — npm distribution
- [ADR-025](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md) — platform host with core-owned product projections
- [ADR-027](./027-adopt-chat-first-information-architecture-with-default-boss-cat.md) — chat-first IA and default Boss Cat
- `requirements.md` FR-025, FR-038, FR-046, FR-047, FR-048
- `architecture.md` Presentation Surfaces, Concurrent / Parallel / Code Presets, future direction list
- `cats-platform/src/products/shared/renderer/components/MessageBody.tsx` — segmenter to reuse on RN
- `cats-platform/src/products/chat/renderer/components/Sidebar.tsx` — Chat tab port source
- `cats-platform/mobile/` — existing Expo skeleton

---

*Proposed: 2026-04-29*
*Proposed by: Claude, after the owner clarified that all three product
sidebars (full Chat sidebar; trimmed Code / Work sidebars) plus Lobby and
Settings should sit on mobile as bottom tabs, with bubble visual fidelity to
the web renderer as a hard requirement.*
