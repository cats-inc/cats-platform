# ADR-127: Keep Companion Cats Alive with a Platform-Owned Life Loop

## Status

Accepted, 2026-09-29。owner 在對話中同意方向與分段（先做「真的醒著」與心跳，
睡眠採自主作息 A 方案；早安圖來源為 companion 設定的相簿資料夾）。
規格見 [SPEC-124](../specs/SPEC-124-alive-companion-life-loop.md)，
實作見 [PLAN-117](../plans/PLAN-117-alive-companion-life-loop.md)；Phase 1（清醒與作息）已實作，
心跳（§4）待 Phase 2。

## Context

owner 要的是一隻「看起來活著、也會睡覺」的陪伴貓：綁好 Telegram、設為 companion 後，
他除了回話，平常會一直醒著（除非 session 上限已滿），偶爾自己開口說一句話或傳一張
早安圖；到了該休息的時間會去睡，醒來後接著同一段對話。owner 明確排除「排程時間到才
叫醒、發完訊息立刻休眠」的做法。

現況（2026-09-29 盤點）：

- 醒著只是 lease 上的持久化狀態（`ready`），沒有任何東西維持它。runtime 重啟後 session
  全部變成 `closed`，平台卻仍顯示醒著，要等下一則訊息進來才會發現並復活
  （`runtime-dispatch/wake.ts` 的 stale-session 復原）。
- [ADR-015](015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md) 定義了 Awake /
  Sleeping / Waking up，也預告了閒置自動入睡，但沒有任何執行者；
  `session-continuity/rules.ts` 的閒置時間沒有人強制。
- 沒有任何機制會在沒有使用者訊息時送一個回合進 Cat 的 session。
- [ADR-090](090-adopt-generic-schedule-rules-for-mission-triggers.md) 的排程規則
  （SPEC-094）每次觸發都另開一個隔離的 Work session（`sharingMode: 'isolated'`），
  跟聊天 session 無關；它正是 owner 排除的模式。ADR-090 §5 也把 heartbeat 延後。
- runtime 只有全域上限 `CATS_RUNTIME_MAX_SESSIONS`（預設 10），滿了直接拒絕新 session，
  不排隊也不踢人。

## Decision

### 1. 活著的單位是「Cat 的私訊 lane 上那一個 session」

- 陪伴貓的生命狀態就是他私訊 lane（`direct_message`、`defaultRecipientId` 為該 Cat）
  上 Cat participant 的 lease。Desktop 私訊與 Telegram 私訊共用同一個 lane
  （Telegram bridge 依 `defaultRecipientId` 重用），所以兩邊看到的是同一隻貓、同一段記憶。
- 主動開口一律在這個 session 內發生，不另開 session。這是與 SPEC-094 排程的根本差別。

### 2. 由平台擁有的 life loop 維持作息與清醒

- 平台程序內新增一個 companion life loop（與 scheduler loop 同樣的掛載方式），每分鐘
  檢查一次符合條件的陪伴貓。邏輯放在 chat 產品樹，`src/app/server` 只負責啟動與停止。
- 由 owner 的正式入口（`src/index.ts`）明確開啟；測試用的 `createServer` 預設不啟動。
- 作息（`CompanionBox.life`）決定期望狀態：清醒時段內應醒著；休息時段應睡著；
  owner 讓他睡覺時（`sleepUntil`）睡到下一次起床時間。
- 應醒著而 session 不在（lease 不是 `ready`，或 runtime 觀察到 session 已關閉）時，
  走既有的 channel activation 路徑喚醒；應睡著而 session 還在時，等 lane 閒置後走既有的
  deactivate 路徑讓他入睡。
- 喚醒與入睡寫入 `presence_changed` 動態紀錄（SPEC-085 早已定義、此前沒有寫入者）。
- 上限滿了（`Max sessions (N) reached`）不踢別的 session，退避後重試，並記一次原因。
- runtime 無法連線時視為「未知」，不當成睡著，也不做任何動作。

### 3. owner 的操作與 life loop 共用同一個意圖來源

- Desktop 的喚醒／睡覺（個人頁與私訊工具列都呼叫 `/activations`、`/deactivate`）作用在
  陪伴貓的私訊 lane 時，同時更新 `life.sleepUntil`，life loop 讀的就是這個欄位。
  這樣不會出現 owner 剛讓他睡、下一分鐘又被 loop 叫醒。
- 休息時段內 owner 傳訊息，沿用既有的延遲喚醒回覆；對話停止一段時間後 loop 讓他再睡。

### 4. 心跳：在同一個 session 裡讓他自己決定要不要開口（SPEC-124 Phase 2）

- 醒著且在清醒時段時，loop 以隨機間隔送一個不顯示給使用者的系統回合進同一個 session，
  告訴他現在時間、醒了多久、主人多久前講過話，請他決定是否對主人說話；不想說就回
  `[quiet]`，平台丟棄。
- 有話要說時，內容以該 Cat 的一般訊息寫入私訊 lane，Telegram 由既有的 transport fanout
  鏡像送出。它是聊天回覆，不是排程任務，因此不經過 ADR-090 的 mission/run。
- 心跳持有以 runtime session 為鍵的程序內 gate；一般派送在送出前等待 gate，
  owner 的訊息不會撞上心跳而收到 runtime 的 409。
- 本決定推翻 [ADR-090](090-adopt-generic-schedule-rules-for-mission-triggers.md) §5
  「heartbeat 延後」的範圍限於陪伴貓的 life loop；排程規則本身不變。

## Consequences

### Positive

- 「醒著」變成真的：runtime 重啟或 session 被關掉後，陪伴貓會在一分鐘內自己醒回來，
  owner 在清醒時段傳訊息時 session 已經是熱的。
- 睡眠真的釋放 runtime 的 session 名額。
- 主動開口帶著完整對話脈絡，因為它發生在同一個 session 裡。

### Negative

- 每隻醒著的陪伴貓長期佔用一個 runtime session 名額；Claude / Codex 還會常駐一個程序。
- 心跳即使最後選擇 `[quiet]` 也是一個真實的 provider 回合，會用到額度。
- 電腦睡著或 Cats 沒開時，他不會醒來也不會說話（與 ADR-090 §5 的限制相同）。
- 作息以主機本地時間計算。

### Neutral

- `CompanionBox` 新增 `life` 欄位；讀取舊檔時缺少此欄位即套用預設值，不需要改寫既有資料。
  較舊的版本讀到新檔會忽略此欄位（pre-release 政策可接受）。
- 呈現用的 presence 狀態機（awake / waking_up / sleeping / error）不變。

## Alternatives Considered

### Alternative 1: 用 SPEC-094 排程規則做早安與主動訊息

- **Pros**：已經實作，有 idempotency 與 misfire 處理。
- **Cons**：每次觸發都是隔離的新 session，沒有對話脈絡；觸發完就結束；目前也送不到
  Telegram。
- **Why rejected**：正是 owner 明確排除的「叫醒、發完、睡回去」。

### Alternative 2: 交給 cats-runtime 的 wakeup service

- **Pros**：runtime 已有 1 秒 tick 與 cron recurrence。
- **Cons**：runtime SPEC-012 明確不是 heartbeat 系統；它只復活 worker、不送訊息；
  作息、陪伴貓身分與 Telegram 綁定都是平台的產品狀態。
- **Why rejected**：產品判斷應留在平台，runtime 維持通用。

### Alternative 3: 只在 owner 傳訊息時才喚醒（維持現狀）

- **Pros**：不佔 session 名額，不花額度。
- **Cons**：不會主動開口，也不是「活著」；醒著狀態在重啟後仍會說謊。
- **Why rejected**：不符合需求。

## References

- [ADR-015](015-adopt-cat-sleep-wake-lifecycle-for-chat-sessions.md)
- [ADR-040](040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md)
- [ADR-090](090-adopt-generic-schedule-rules-for-mission-triggers.md) §5
- [ADR-124](124-model-companion-as-a-cat-role-not-a-skill-profile.md)
- [SPEC-036](../specs/SPEC-036-companion-workspace-presence-and-settings.md) §21–22
- [SPEC-085](../specs/SPEC-085-companion-profile-feed-and-library-ia.md)（`presence_changed`）
- [SPEC-124](../specs/SPEC-124-alive-companion-life-loop.md)

---

*Decision made: 2026-09-29*
*Decision makers: Product owner (approval), Claude (author)*
