# Cats Mobile App: Feasibility, Tech Stack, and Connectivity

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: mobile app 需求性分析、tech stack 評估、self-hosted 連線方案、App Store 審核策略
- **Related**:
  - [ADR-013](../decisions/013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md) — npm 分發策略
  - [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md) — API contract
  - [ADR-037](../decisions/037-serve-runtime-dashboard-and-playground-from-suite-host.md) — runtime hosting
  - `cats/docs/deployment.md` — 現有 desktop/Electron 部署
  - [Plugin Research](./2026-03-24-cats-plugin-architecture-and-packaging.md) — package 拆分策略

---

## Part 1: 需求性分析

### 為什麼需要 mobile app

cats 的核心使用情境是「一個人管一家 AI 公司」。以下是只有 mobile 才能
滿足的場景：

- **Approval 通知**：Boss Cat 規劃好任務後等 owner 批准 — owner 可能在
  通勤、吃飯、散步。如果只有 desktop，owner 必須坐在電腦前才能解除
  blocked 狀態，整家公司因為 owner 不在電腦前而停擺。

- **Escalation 即時回應**：Telegram/LINE bot 遇到重要客戶問題需要
  escalate 給 owner — owner 在手機上看到通知，可以立刻決定「我來回覆」
  或「讓 bot 繼續處理」。

- **狀態監控**：快速看一眼「今天 worker 完成了幾個 task」「有沒有 failed
  run」— 不需要開電腦。

- **快速指令**：「幫我查一下上次跟客戶 A 的對話重點」「把這個 task 標記
  完成」— 短暫的互動，mobile 最適合。

### 哪些功能不需要在 mobile 上

- 完整的 Chat UI（長對話、多 channel 切換）— desktop 體驗更好
- Settings / Cat 管理 — 低頻操作，desktop 做就好
- Code review / PR 管理 — 需要大螢幕
- Dashboard / Playground — 開發者工具，desktop only

### 結論：mobile 是 companion app，不是完整 port

Mobile app 的定位是 **notification hub + approval gate + quick command**，
不是把整個 desktop 體驗搬到手機上。這大幅降低了開發範圍。

---

## Part 2: 最大的技術挑戰 — 連線問題

cats 是 self-hosted — 跑在使用者自己的電腦或 server 上。Mobile app 需要
能連到它。這是整個方案的核心困難。

### 挑戰

```
┌─────────┐         ┌──────────┐
│ Mobile  │── ? ──→ │ Desktop  │
│  App    │         │ cats     │
│ (外網)  │         │ (內網)   │
└─────────┘         └──────────┘
```

Desktop 通常在 NAT 後面，沒有 public IP，mobile 無法直連。

### 方案比較

#### 方案 A: Tailscale / ZeroTier（Mesh VPN）

- **原理**：Desktop 和 mobile 都加入同一個 Tailscale network，
  透過 100.x.x.x 互連
- **優點**：
  - 端對端加密，不經過第三方 server
  - 設定簡單（裝 app、登入、done）
  - 免費 tier 足夠個人使用
  - mobile app 只需要連 `http://100.x.x.x:8181`，跟 localhost 一樣
- **缺點**：
  - 使用者必須另外安裝 Tailscale app
  - 使用者必須理解「mesh VPN」概念
  - Desktop 必須保持開機且 Tailscale 連線中

#### 方案 B: Cloudflare Tunnel / ngrok

- **原理**：Desktop 上跑一個 tunnel client，把 localhost:8181 暴露到
  public URL（如 `https://my-cats.trycloudflare.com`）
- **優點**：
  - Mobile app 連的是 HTTPS URL，完全標準
  - 不需要 VPN，不需要裝額外 app
  - Cloudflare Tunnel 免費
- **缺點**：
  - 流量經過 Cloudflare — 不是端對端
  - URL 可能是隨機的（免費 tier），需要 DNS 設定才有穩定 URL
  - 需要 Cloudflare 帳號
  - 要防止 public URL 被未授權存取（需要 auth layer）

#### 方案 C: Cloud Relay Server（自建中繼）

- **原理**：cats desktop 持續 WebSocket 連線到一個 cloud relay，
  mobile app 也連到同一個 relay。Relay 轉發訊息。
- **優點**：
  - 使用者不需要裝任何額外工具
  - 最好的 UX — 裝 app、登入、直接用
  - push notification 自然支援（relay server 可以發 APNs/FCM）
- **缺點**：
  - 需要維運一個 cloud server
  - 月費成本（雖然不高）
  - 資料經過你的 server — trust model 改變
  - 需要設計 auth / pairing protocol

#### 方案 D: Push Notification Only（不直連）

- **原理**：不做即時連線。Desktop cats 透過 FCM/APNs 發 push
  notification 到手機，手機只顯示通知和預先準備好的 action button
  （approve/reject）。Action 透過一個極輕的 cloud relay 回傳。
- **優點**：
  - 最簡單的 mobile app（幾乎是 notification client）
  - 不需要 VPN 或 tunnel
  - 低延遲的 approval flow（notification + action button）
  - Cloud relay 只處理小 payload（approval response），幾乎零成本
- **缺點**：
  - 不能在手機上即時聊天或瀏覽完整 UI
  - 功能受限於 notification 能承載的內容

### 推薦策略：分階段

- **Phase 1（MVP）**：方案 D — push notification + approval actions
  - 最小 mobile app，最大商業價值（owner 不用守在電腦前）
  - Cloud relay 只需要一個極輕的 Lambda / Cloudflare Worker
  - 可以通過 App Store 審核（app 功能完整且不依賴 VPN）

- **Phase 2**：方案 B 或 C — 加上即時連線
  - 允許在手機上看對話、發指令
  - 如果選 B（tunnel）：cats desktop 自動建立 Cloudflare Tunnel
  - 如果選 C（relay）：自建 WebSocket relay

- **Phase 3（可選）**：方案 A 作為 power user 選項
  - 給技術使用者提供 Tailscale 直連模式
  - 端對端加密，不經過任何中繼

---

## Part 3: Tailscale 能否通過 App Store 審核

### 短答：可以，但有條件

Tailscale 本身在 iOS App Store 和 Google Play 上架，所以 VPN 技術本身
不是問題。

### 審核的實際考量

**iOS App Store（較嚴格）：**

- Apple 不會因為你的 app 連 private IP（100.x.x.x）就拒絕
- 但 Apple reviewer **無法存取你的 Tailscale network**，如果 app
  在沒有連線時顯示空白或錯誤，可能被拒
- **關鍵要求**：app 必須在沒有 Tailscale 的情況下也能展示功能
  （demo mode、onboarding flow、或 cloud fallback）
- Apple 對「需要另一個 app 才能運作」的 app 會審慎審查，但不是
  自動拒絕（很多 IoT app 需要對應的硬體/server）

**Google Play（較寬鬆）：**

- 基本上不限制連線方式
- 只要 app 不是 malware、不違反 policy 就會過
- 但同樣建議有 demo mode 方便 reviewer 體驗

### 最安全的審核策略

1. **App 內建 demo/onboarding mode**：
   - 首次開啟時展示產品介紹和模擬 UI
   - 不需要連到任何 server 也能完成 onboarding
   - 這滿足了 Apple 的「app 本身有功能」要求

2. **連線方式作為設定選項**，不是硬性要求：
   - 設定頁面提供多種連線方式：
     - Cloud relay（預設，零設定）
     - Cloudflare Tunnel URL（手動輸入）
     - Tailscale IP（power user）
     - Local IP（同 WiFi）

3. **審核時提交 review notes**：
   - 告訴 reviewer 這是一個 self-hosted 服務的 companion app
   - 提供 demo credentials 或 demo server URL
   - 提供 screenshots 和 video 展示完整流程

### 結論

Tailscale **可以**通過審核，但不應該是**唯一**的連線方式。以 cloud relay
作為預設、Tailscale 作為 power user 選項，審核風險最低。

---

## Part 4: Tech Stack 評估

### 前提

- 現有 codebase：React 18 + TypeScript + Vite
- 需要上 iOS App Store + Google Play
- API layer 已統一（ADR-036 完成後）
- 團隊規模：一個人

### 方案比較

#### React Native + Expo

- **共享**：TypeScript、React component model、部分業務邏輯
- **優點**：
  - 跟 cats web codebase 共享 TypeScript 和 React 心智模型
  - Expo 提供 managed workflow — build、deploy、OTA update 不用碰 Xcode/Gradle
  - Expo Notifications 內建 push notification 支援（FCM + APNs）
  - Expo Router 提供 file-based routing
  - 社群大、生態成熟
- **缺點**：
  - 不能直接共用 web components（React Native 的 View/Text 不是 div/span）
  - 但可以共用 types、API client、business logic
- **適合度**：最高

#### Flutter

- **優點**：效能好、UI 一致性高、一套 code 兩平台
- **缺點**：
  - Dart 語言 — 跟現有 TypeScript codebase 完全不共享
  - 無法共用任何 React component 或 hook
  - 學習成本高
- **適合度**：低（技術斷層太大）

#### Capacitor（Web Wrapper）

- **優點**：
  - 直接把 cats web app 包成 native app
  - 幾乎零額外開發
  - 共用 100% web code
- **缺點**：
  - 效能是 WebView 等級，體驗像 mobile web 不像 native app
  - Push notification 需要 Capacitor plugin，設定不如 Expo 簡單
  - Apple 對「純 WebView wrapper」的 app 有時會拒絕（guideline 4.2）
- **適合度**：中（如果 mobile 只是 companion 且功能少，可以考慮）

#### PWA（Progressive Web App）

- **優點**：
  - 不需要上 App Store
  - 直接從瀏覽器「加到主畫面」
  - 完全共用 web code
- **缺點**：
  - iOS 上 push notification 支援有限（Safari 17+ 才支援，且行為不穩定）
  - 不在 App Store 裡 = 使用者找不到
  - iOS 上 PWA 存儲會被系統清理
  - 沒有 App Store presence 影響產品信譽
- **適合度**：低（push notification 是核心需求，iOS PWA 不可靠）

### 推薦：React Native + Expo

理由：

- Push notification 是 Day 1 需求 — Expo 內建支援，開箱即用
- 跟 cats web 共享 TypeScript + React 心智模型
- 不需要共用 UI components（mobile 是 companion app，UI 完全不同）
- 但可以共用：types（`@cats-inc/cats/core`）、API client、business logic
- Expo EAS Build 可以 CI/CD build iOS + Android，不需要 Mac 做 iOS build
- 一個人也能維護

---

## Part 5: 技術架構

### 整體架構

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

### Cloud Relay（Phase 1 MVP 的核心元件）

極輕量的中繼服務，只負責兩件事：

1. **Desktop → Mobile**：轉發 push notification
   - Desktop cats 發生 approval request / escalation / task completion
   - cats server POST 到 cloud relay
   - relay 透過 FCM/APNs 發 push 到手機

2. **Mobile → Desktop**：轉發 approval action
   - Owner 在手機上點 approve/reject
   - mobile app POST 到 cloud relay
   - relay 轉發到 desktop cats（透過持續連線的 WebSocket）

```typescript
// Cloud Relay — 可以用 Cloudflare Worker 實作
// 總共不到 200 行 code

// Desktop → Relay: 註冊 WebSocket
// Relay → Mobile: FCM push
// Mobile → Relay: POST approval
// Relay → Desktop: forward via WebSocket
```

### Mobile App 結構（Expo）

```
cats-mobile/
  app/                          ← Expo Router (file-based)
    (tabs)/
      index.tsx                 ← Dashboard: 今日摘要
      approvals.tsx             ← Pending approvals 列表
      activity.tsx              ← Recent activity feed
    settings.tsx                ← 連線設定
  src/
    api/
      client.ts                 ← API client（共用 @cats-inc/cats/core types）
      relay.ts                  ← Cloud relay client
    hooks/
      useApprovals.ts
      useActivity.ts
      useConnection.ts          ← 連線狀態管理
    notifications/
      handler.ts                ← Push notification 處理
      actions.ts                ← Notification action buttons
  app.json                      ← Expo config
  package.json
```

### Pairing Protocol

Desktop 和 mobile 首次配對的流程：

```
1. Desktop cats 生成一個 pairing code（6 位數字或 QR code）
2. Desktop cats 把 pairing code + device info 發送到 cloud relay
3. Mobile app 輸入 pairing code（或掃 QR）
4. Cloud relay 驗證配對，建立 device binding
5. Cloud relay 發一個 device token 給 mobile app
6. 後續 push notification 用這個 token 定向發送
```

### Notification Payload 設計

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

### iOS Notification Actions（免開 app 直接操作）

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

Owner 收到 approval 通知 → 長按或下拉 → 直接點 Approve → 不用開 app。
這是 mobile companion app 的殺手體驗。

---

## Part 6: npm Package 的影響

### 跟 plugin 架構的關係

Mobile app 不是 plugin — 它是一個獨立的 consumer，消費 cats 的 API。

```
@cats-inc/cats          ← host（不變）
@cats-inc/chat          ← Chat plugin（不變）
@cats-inc/mobile        ← mobile app（獨立 Expo project）
@cats-inc/relay         ← cloud relay（獨立 Worker）
```

Mobile app 的 dependency：

```jsonc
// @cats-inc/mobile/package.json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-notifications": "~0.29.0"
  },
  "devDependencies": {
    "@cats-inc/cats": "^1.0.0"    // 只用 type imports
  }
}
```

Mobile app 只 import types，不 import runtime code：

```typescript
import type { CoreTaskRecord, CoreApprovalStatus } from '@cats-inc/cats/core';
```

### 共用的 types 自然來自 `@cats-inc/cats/core`

ADR-036 統一 API contract 後，mobile app 和 web renderer 消費同一份
API，用同一套 types。不需要額外的 shared package。

---

## Part 7: 開發路線圖

### Phase 1: Push Notification MVP（2-3 週）

- [ ] 建立 Expo project（`@cats-inc/mobile`）
- [ ] 實作 cloud relay（Cloudflare Worker，~200 行）
- [ ] cats server 加 notification emitter（task approval / escalation / completion 事件）
- [ ] Mobile app: pairing flow（QR code / 6-digit code）
- [ ] Mobile app: notification handler + action buttons
- [ ] Mobile app: minimal dashboard（pending approvals + recent activity）
- [ ] 提交 App Store + Google Play

此階段的 mobile app 功能：
- 收通知
- 在通知上直接 approve/reject（不用開 app）
- 開 app 看 pending approvals 列表和 activity feed
- 這就夠了 — 解決了「owner 不在電腦前公司就停擺」的核心問題

### Phase 2: 即時連線（2-3 週）

- [ ] Cloud relay 升級為 WebSocket relay（雙向即時通訊）
- [ ] Mobile app: 簡化版 Chat UI（看對話、發文字指令）
- [ ] Mobile app: task detail view
- [ ] 可選：Cloudflare Tunnel 直連模式

### Phase 3: Power User Options（1-2 週）

- [ ] Tailscale 直連模式（設定頁面輸入 Tailscale IP）
- [ ] Local IP 直連模式（同 WiFi）
- [ ] Biometric auth（Face ID / fingerprint）

---

## Part 8: App Store 審核 Checklist

### iOS App Store

- [ ] App 在無連線時有完整的 onboarding / demo mode
- [ ] Privacy policy URL（必須）
- [ ] App 不要求使用者安裝其他 app（Tailscale 是可選的，不是必須的）
- [ ] Push notification entitlement 正確設定
- [ ] 提供 review notes 說明這是 self-hosted companion app
- [ ] 提供 demo server URL 或 test account 給 reviewer
- [ ] 不要在 app 內顯示「請安裝 Tailscale」— 而是在設定頁面列為
  optional 進階連線方式
- [ ] Screenshots 展示有內容的 UI（不是空白狀態）

### Google Play

- [ ] Privacy policy（必須）
- [ ] Data safety section 填寫完整
- [ ] Push notification 正確申請 POST_NOTIFICATIONS permission（Android 13+）
- [ ] 提供 demo mode 或 test account

### 兩平台共通

- [ ] App icon, splash screen
- [ ] Deep link scheme 設定（cats://approve/task_1）
- [ ] Crash-free rate > 99%（否則會被下架）
- [ ] 最低 OS 版本：iOS 16+, Android 10+（API 29+）

---

## 結論

- **需求明確**：mobile companion app 解決的是「owner 不在電腦前整家公司停擺」的
  核心痛點，不是 nice-to-have
- **Tech stack**：React Native + Expo — 跟 cats 共享 TypeScript 心智模型，
  push notification 開箱即用
- **連線方案**：cloud relay 為預設（審核最安全、UX 最好），Tailscale 為
  power user 選項
- **Tailscale 審核**：可以通過，但不能是唯一連線方式。App 必須有 demo mode
  且 Tailscale 只作為可選的進階設定
- **MVP 範圍**：push notification + approval action buttons + pending list —
  2-3 週可完成，解決 80% 的 mobile 使用場景
- **跟 plugin 架構互不衝突**：mobile app 是 API consumer，不是 plugin，
  自然消費 `@cats-inc/cats/core` 的 types
