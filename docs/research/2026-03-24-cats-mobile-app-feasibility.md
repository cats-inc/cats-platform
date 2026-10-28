# Cats Mobile App: Feasibility, Tech Stack, and Connectivity

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Partially superseded — see Scope Update below
- **Scope**: Mobile app needs analysis, tech stack evaluation, self-hosted connectivity options, App Store review strategy
- **Related**:
  - [ADR-092](../decisions/092-reposition-cats-mobile-as-first-class-product-client.md) — repositions mobile as a first-class product client (supersedes the companion framing in Part 1 / Part 5 of this document)
  - [SPEC-095](../specs/SPEC-095-cats-mobile-shell-five-tabs-and-product-sidebar-variants.md) — new mobile shell spec
  - [PLAN-084](../plans/PLAN-084-cats-mobile-shell-rollout.md) — new rollout plan
  - [ADR-013](../decisions/013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md) — npm distribution strategy
  - [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md) — API contract
  - [ADR-037](../decisions/037-serve-runtime-dashboard-and-playground-from-platform-host.md) — runtime hosting
  - `cats-platform/docs/deployment.md` — existing desktop/Electron deployment
  - [Plugin Research](./2026-03-24-cats-plugin-architecture-and-packaging.md) — package split strategy

## Scope Update — 2026-04-29

ADR-092 repositions mobile as a first-class product client with five bottom tabs
(`Lobby` / `Chat` / `Code` / `Work` / `Settings`), a full sidebar for Chat,
slimmed-down sidebars for Code and Work, a shared `ChatView`, and a requirement
that bubble visuals match the web. The following parts of this research
document still apply and are kept as is:

- Part 2 (connectivity option comparison and phased strategy: cloud relay → tunnel → Tailscale)
- Part 3 (Tailscale App Store review analysis)
- Part 6 (interaction between the npm package and the plugin architecture)
- Part 7 Phases 2 and 3 (real-time connectivity, power-user options)
- Part 8 (App Store / Play Store review checklist)

The following parts are **superseded by ADR-092 / SPEC-095** and must no longer
be used as a design basis:

- Part 1 (the "mobile is a companion app, not a full port" positioning)
- Part 5, lines 314-337: the mobile project structure (the three-page version
  with dashboard / approvals / activity) — use the five-tab structure from SPEC-095 instead
- Part 7 Phase 1 (Push Notification MVP is the only Day 1 scope) — replaced by
  the connectivity phase that PLAN-084 Phase 7 adds after the shell is complete

---

## Part 1: Needs Analysis

### Why a mobile app is needed

The core use case of cats is "one person running an AI company". These are
scenarios only mobile can satisfy:

- **Approval notifications**: after the Boss Cat plans a task it waits for the
  owner's approval — the owner may be commuting, eating, or walking. With
  desktop only, the owner must sit at the computer to clear the blocked state,
  and the whole company stalls because the owner is away from the computer.

- **Real-time response to escalations**: when a Telegram/LINE bot hits an
  important customer issue that needs escalating to the owner — the owner sees
  the notification on the phone and can immediately decide "I'll reply" or
  "let the bot keep handling it".

- **Status monitoring**: a quick glance at "how many tasks the workers
  completed today" and "are there any failed runs" — no need to open a computer.

- **Quick commands**: "Look up the key points of my last conversation with
  customer A", "Mark this task as done" — brief interactions that mobile suits best.

### What does not need to be on mobile

- The full Chat UI (long conversations, switching between many channels) — better on desktop
- Settings / Cat management — low-frequency operations, fine on desktop
- Code review / PR management — needs a large screen
- Dashboard / Playground — developer tools, desktop only

### Conclusion: mobile is a companion app, not a full port

The mobile app is positioned as a **notification hub + approval gate + quick
command**, not moving the whole desktop experience onto the phone. This greatly
reduces the development scope.

---

## Part 2: The Biggest Technical Challenge — Connectivity

cats is self-hosted — it runs on the user's own computer or server. The mobile
app needs to be able to reach it. This is the core difficulty of the whole plan.

### The challenge

```
┌─────────┐         ┌──────────┐
│ Mobile  │── ? ──→ │ Desktop  │
│  App    │         │ cats     │
│ (public)│         │ (LAN)    │
└─────────┘         └──────────┘
```

The desktop is usually behind NAT with no public IP, so mobile cannot connect directly.

### Option comparison

#### Option A: Tailscale / ZeroTier (mesh VPN)

- **Principle**: desktop and mobile both join the same Tailscale network and
  connect to each other over 100.x.x.x
- **Pros**:
  - End-to-end encryption, no third-party server
  - Simple setup (install the app, log in, done)
  - The free tier is enough for personal use
  - The mobile app only needs to connect to `http://100.x.x.x:8181`, same as localhost
- **Cons**:
  - The user must install the Tailscale app separately
  - The user must understand the "mesh VPN" concept
  - The desktop must stay powered on with Tailscale connected

#### Option B: Cloudflare Tunnel / ngrok

- **Principle**: run a tunnel client on the desktop to expose localhost:8181 at
  a public URL (such as `https://my-cats.trycloudflare.com`)
- **Pros**:
  - The mobile app connects to an HTTPS URL, completely standard
  - No VPN needed, no extra app to install
  - Cloudflare Tunnel is free
- **Cons**:
  - Traffic goes through Cloudflare — not end-to-end
  - The URL may be random (free tier); DNS setup is needed for a stable URL
  - Needs a Cloudflare account
  - Must prevent unauthorized access to the public URL (needs an auth layer)

#### Option C: Cloud Relay Server (self-built relay)

- **Principle**: cats desktop keeps a WebSocket connection to a cloud relay,
  and the mobile app also connects to the same relay. The relay forwards messages.
- **Pros**:
  - The user does not need to install any extra tools
  - Best UX — install the app, log in, use it directly
  - Push notifications are naturally supported (the relay server can send APNs/FCM)
- **Cons**:
  - A cloud server must be operated
  - Monthly cost (though not high)
  - Data passes through your server — the trust model changes
  - An auth / pairing protocol must be designed

#### Option D: Push Notification Only (no direct connection)

- **Principle**: no real-time connection. Desktop cats sends push notifications
  to the phone through FCM/APNs, and the phone shows only the notification and
  pre-prepared action buttons (approve/reject). Actions are sent back through a
  very light cloud relay.
- **Pros**:
  - The simplest mobile app (almost just a notification client)
  - No VPN or tunnel needed
  - Low-latency approval flow (notification + action button)
  - The cloud relay handles only small payloads (approval responses), at almost zero cost
- **Cons**:
  - Cannot chat in real time or browse the full UI on the phone
  - Functionality is limited by what a notification can carry

### Recommended strategy: phased

- **Phase 1 (MVP)**: Option D — push notification + approval actions
  - The smallest mobile app with the greatest business value (the owner does not have to stay at the computer)
  - The cloud relay needs only a very light Lambda / Cloudflare Worker
  - Can pass App Store review (the app is functionally complete and does not depend on a VPN)

- **Phase 2**: Option B or C — add real-time connectivity
  - Allows viewing conversations and sending commands on the phone
  - If B (tunnel): cats desktop creates a Cloudflare Tunnel automatically
  - If C (relay): build a WebSocket relay

- **Phase 3 (optional)**: Option A as a power-user option
  - Offers technical users a direct Tailscale connection mode
  - End-to-end encryption, no relay of any kind

---

## Part 3: Can Tailscale Pass App Store Review

### Short answer: yes, with conditions

Tailscale itself is listed on the iOS App Store and Google Play, so the VPN
technology itself is not the problem.

### Practical review considerations

**iOS App Store (stricter):**

- Apple will not reject your app just because it connects to a private IP (100.x.x.x)
- But the Apple reviewer **cannot access your Tailscale network**, and if the
  app shows a blank screen or an error when not connected, it may be rejected
- **Key requirement**: the app must be able to demonstrate its functionality
  without Tailscale (demo mode, onboarding flow, or cloud fallback)
- Apple reviews apps that "need another app to work" carefully, but does not
  reject them automatically (many IoT apps need a matching hardware/server)

**Google Play (more lenient):**

- Basically no restriction on connection methods
- It passes as long as the app is not malware and does not violate policy
- It is still recommended to have a demo mode so reviewers can try it

### The safest review strategy

1. **A built-in demo/onboarding mode in the app**:
   - On first launch, show the product introduction and a simulated UI
   - Onboarding can be completed without connecting to any server
   - This satisfies Apple's requirement that "the app itself has functionality"

2. **Connection method as a setting option**, not a hard requirement:
   - The settings page offers multiple connection methods:
     - Cloud relay (default, zero setup)
     - Cloudflare Tunnel URL (manual entry)
     - Tailscale IP (power user)
     - Local IP (same WiFi)

3. **Submit review notes at review time**:
   - Tell the reviewer this is a companion app for a self-hosted service
   - Provide demo credentials or a demo server URL
   - Provide screenshots and a video showing the complete flow

### Conclusion

Tailscale **can** pass review, but it should not be the **only** connection
method. Making the cloud relay the default and Tailscale a power-user option
carries the lowest review risk.

---

## Part 4: Tech Stack Evaluation

### Premises

- Existing codebase: React 18 + TypeScript + Vite
- Needs to ship on the iOS App Store + Google Play
- The API layer is already unified (after ADR-036 completes)
- Team size: one person

### Option comparison

#### React Native + Expo

- **Shared**: TypeScript, the React component model, some business logic
- **Pros**:
  - Shares TypeScript and the React mental model with the cats web codebase
  - Expo provides a managed workflow — build, deploy, and OTA update without touching Xcode/Gradle
  - Expo Notifications has built-in push notification support (FCM + APNs)
  - Expo Router provides file-based routing
  - Large community, mature ecosystem
- **Cons**:
  - Web components cannot be reused directly (React Native's View/Text are not div/span)
  - But types, the API client, and business logic can be shared
- **Fit**: highest

#### Flutter

- **Pros**: good performance, high UI consistency, one codebase for two platforms
- **Cons**:
  - The Dart language — shares nothing with the existing TypeScript codebase
  - Cannot reuse any React component or hook
  - High learning cost
- **Fit**: low (the technology gap is too large)

#### Capacitor (web wrapper)

- **Pros**:
  - Wraps the cats web app directly into a native app
  - Almost zero extra development
  - Shares 100% of the web code
- **Cons**:
  - Performance is WebView-level; the experience feels like mobile web, not a native app
  - Push notifications need a Capacitor plugin, with setup not as simple as Expo
  - Apple sometimes rejects "pure WebView wrapper" apps (guideline 4.2)
- **Fit**: medium (worth considering if mobile is only a companion with few features)

#### PWA (Progressive Web App)

- **Pros**:
  - No App Store listing needed
  - "Add to Home Screen" directly from the browser
  - Fully shares the web code
- **Cons**:
  - Push notification support on iOS is limited (only Safari 17+, and the behavior is unstable)
  - Not in the App Store = users cannot find it
  - PWA storage on iOS gets cleaned up by the system
  - No App Store presence hurts product credibility
- **Fit**: low (push notifications are a core requirement, and iOS PWA is unreliable)

### Recommendation: React Native + Expo

Reasons:

- Push notifications are a Day 1 requirement — Expo supports them out of the box
- Shares the TypeScript + React mental model with cats web
- No need to share UI components (mobile is a companion app, with a completely different UI)
- But these can be shared: types (`@cats-inc/cats-platform/core`), the API client, business logic
- Expo EAS Build can CI/CD build iOS + Android, with no Mac needed for iOS builds
- One person can maintain it

---

## Part 5: Technical Architecture

### Overall architecture

```
┌──────────────┐     push      ┌─────────────────┐
│ Mobile App   │◄─────────────│  Cloud Relay     │
│ (Expo)       │──────────────►│  (Worker/Lambda) │
│              │   approval    │                  │
└──────┬───────┘               └────────┬────────┘
       │                                │
       │  (Phase 2: direct)             │  WebSocket
       │                                │
       ▼                                ▼
┌──────────────┐               ┌─────────────────┐
│ Tailscale /  │               │  Desktop         │
│ Tunnel       │◄─────────────│  cats server     │
│ (optional)   │               │  (localhost:8181)│
└──────────────┘               └─────────────────┘
```

### Cloud Relay (the core component of the Phase 1 MVP)

A very lightweight relay service responsible for only two things:

1. **Desktop → Mobile**: forward push notifications
   - Desktop cats hits an approval request / escalation / task completion
   - The cats server POSTs to the cloud relay
   - The relay sends a push to the phone through FCM/APNs

2. **Mobile → Desktop**: forward approval actions
   - The owner taps approve/reject on the phone
   - The mobile app POSTs to the cloud relay
   - The relay forwards to desktop cats (through the persistent WebSocket connection)

```typescript
// Cloud Relay — can be implemented as a Cloudflare Worker
// Under 200 lines of code in total

// Desktop → Relay: register WebSocket
// Relay → Mobile: FCM push
// Mobile → Relay: POST approval
// Relay → Desktop: forward via WebSocket
```

### Mobile App structure (Expo)

```
cats-mobile/
  app/                          ← Expo Router (file-based)
    (tabs)/
      index.tsx                 ← Dashboard: today's summary
      approvals.tsx             ← Pending approvals list
      activity.tsx              ← Recent activity feed
    settings.tsx                ← Connection settings
  src/
    api/
      client.ts                 ← API client (shares @cats-inc/cats-platform/core types)
      relay.ts                  ← Cloud relay client
    hooks/
      useApprovals.ts
      useActivity.ts
      useConnection.ts          ← Connection state management
    notifications/
      handler.ts                ← Push notification handling
      actions.ts                ← Notification action buttons
  app.json                      ← Expo config
  package.json
```

### Pairing Protocol

The flow for the first pairing between desktop and mobile:

```
1. Desktop cats generates a pairing code (6 digits or a QR code)
2. Desktop cats sends the pairing code + device info to the cloud relay
3. The mobile app enters the pairing code (or scans the QR)
4. The cloud relay verifies the pairing and creates a device binding
5. The cloud relay issues a device token to the mobile app
6. Later push notifications are targeted using this token
```

### Notification Payload Design

```typescript
// Approval request notification
{
  title: "Approval Required",
  body: "Boss Cat wants to dispatch 3 workers for 'Website Redesign'",
  data: {
    type: "approval_request",
    taskId: "task_1",
    conversationId: "conv_1",
    actions: ["approve", "reject", "reroute"],
  },
  // iOS: actionable notification with buttons
  categoryId: "APPROVAL",
}

// Escalation notification
{
  title: "Escalation from Customer Channel",
  body: "Client A asks about delivery timeline — Bot unsure",
  data: {
    type: "escalation",
    channelId: "ch_telegram_1",
    messagePreview: "When will the project be delivered?",
    actions: ["take_over", "let_bot_handle"],
  },
  categoryId: "ESCALATION",
}

// Task completion notification
{
  title: "Task Completed",
  body: "Coder Cat finished 'Fix login bug' — PR ready for review",
  data: {
    type: "task_completed",
    taskId: "task_2",
    artifactUrl: "https://github.com/.../pull/42",
  },
}
```

### iOS Notification Actions (operate without opening the app)

```typescript
// Expo notification categories
Notifications.setNotificationCategoryAsync('APPROVAL', [
  { identifier: 'approve', buttonTitle: 'Approve', options: { opensAppToForeground: false } },
  { identifier: 'reject', buttonTitle: 'Reject', options: { isDestructive: true, opensAppToForeground: false } },
]);

Notifications.setNotificationCategoryAsync('ESCALATION', [
  { identifier: 'take_over', buttonTitle: 'I\'ll Handle It', options: { opensAppToForeground: true } },
  { identifier: 'let_bot', buttonTitle: 'Let Bot Continue', options: { opensAppToForeground: false } },
]);
```

The owner receives an approval notification → long-presses or pulls down →
taps Approve directly → no need to open the app. This is the killer experience
of the mobile companion app.

---

## Part 6: Impact on the npm Package

### Relationship to the plugin architecture

The mobile app is not a plugin — it is an independent consumer that consumes the cats API.

```
@cats-inc/cats-platform          ← host (unchanged)
@cats-inc/chat          ← Chat plugin (unchanged)
@cats-inc/mobile        ← mobile app (independent Expo project)
@cats-inc/relay         ← cloud relay (independent Worker)
```

The mobile app's dependencies:

```jsonc
// @cats-inc/mobile/package.json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-notifications": "~0.29.0"
  },
  "devDependencies": {
    "@cats-inc/cats-platform": "^1.0.0"    // type imports only
  }
}
```

The mobile app imports only types, not runtime code:

```typescript
import type { CoreTaskRecord, CoreApprovalStatus } from '@cats-inc/cats-platform/core';
```

### Shared types naturally come from `@cats-inc/cats-platform/core`

After ADR-036 unifies the API contract, the mobile app and the web renderer
consume the same API with the same types. No extra shared package is needed.

---

## Part 7: Development Roadmap

### Phase 1: Push Notification MVP (2-3 weeks)

- [ ] Create the Expo project (`@cats-inc/mobile`)
- [ ] Implement the cloud relay (Cloudflare Worker, ~200 lines)
- [ ] Add a notification emitter to the cats server (task approval / escalation / completion events)
- [ ] Mobile app: pairing flow (QR code / 6-digit code)
- [ ] Mobile app: notification handler + action buttons
- [ ] Mobile app: minimal dashboard (pending approvals + recent activity)
- [ ] Submit to the App Store + Google Play

The mobile app's functionality at this phase:
- Receive notifications
- Approve/reject directly on the notification (without opening the app)
- Open the app to see the pending approvals list and activity feed
- That is enough — it solves the core problem of "the company stalls when the owner is away from the computer"

### Phase 2: Real-time connectivity (2-3 weeks)

- [ ] Upgrade the cloud relay to a WebSocket relay (bidirectional real-time communication)
- [ ] Mobile app: simplified Chat UI (view conversations, send text commands)
- [ ] Mobile app: task detail view
- [ ] Optional: Cloudflare Tunnel direct-connection mode

### Phase 3: Power User Options (1-2 weeks)

- [ ] Tailscale direct-connection mode (enter the Tailscale IP on the settings page)
- [ ] Local IP direct-connection mode (same WiFi)
- [ ] Biometric auth (Face ID / fingerprint)

---

## Part 8: App Store Review Checklist

### iOS App Store

- [ ] The app has a complete onboarding / demo mode when offline
- [ ] Privacy policy URL (required)
- [ ] The app does not require users to install another app (Tailscale is optional, not required)
- [ ] The push notification entitlement is set up correctly
- [ ] Provide review notes explaining this is a self-hosted companion app
- [ ] Provide a demo server URL or test account for the reviewer
- [ ] Do not show "Please install Tailscale" inside the app — instead list it on
  the settings page as an optional advanced connection method
- [ ] Screenshots show a UI with content (not an empty state)

### Google Play

- [ ] Privacy policy (required)
- [ ] The Data safety section is filled out completely
- [ ] Push notifications correctly request the POST_NOTIFICATIONS permission (Android 13+)
- [ ] Provide a demo mode or test account

### Common to both platforms

- [ ] App icon, splash screen
- [ ] Deep link scheme set up (cats://approve/task_1)
- [ ] Crash-free rate > 99% (otherwise it gets removed from the store)
- [ ] Minimum OS versions: iOS 16+, Android 10+ (API 29+)

---

## Conclusion

- **The need is clear**: the mobile companion app solves the core pain point of
  "the whole company stalls when the owner is away from the computer"; it is not a nice-to-have
- **Tech stack**: React Native + Expo — shares the TypeScript mental model with
  cats, and push notifications work out of the box
- **Connectivity**: cloud relay as the default (safest for review, best UX),
  Tailscale as a power-user option
- **Tailscale review**: it can pass, but cannot be the only connection method.
  The app must have a demo mode and Tailscale only as an optional advanced setting
- **MVP scope**: push notification + approval action buttons + pending list —
  can be done in 2-3 weeks and covers 80% of mobile usage scenarios
- **No conflict with the plugin architecture**: the mobile app is an API
  consumer, not a plugin, and naturally consumes the types from `@cats-inc/cats-platform/core`
