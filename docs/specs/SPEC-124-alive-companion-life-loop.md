# SPEC-124: Alive Companion Life Loop

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented (owner approved 2026-09-29); real-bot and Desktop visual acceptance pending |
| **Owner** | Claude |
| **Reviewer** | Owner |

## Summary

陪伴貓綁好 Telegram 後，應該像一隻活著的貓：清醒時段一直醒著（session 是熱的，
回話像在職守），偶爾自己在同一段對話裡對主人說一句話或傳一張照片，晚上去睡、
早上自己醒來。決策見 [ADR-127](../decisions/127-keep-companion-cats-alive-with-a-platform-owned-life-loop.md)。

## Goals

- 清醒時段內，陪伴貓的私訊 session 真的活著；runtime 重啟或 session 被關掉後自動醒回來。
- 休息時段釋放 session；owner 傳訊息時照常醒來回覆，之後再睡回去。
- 醒著時偶爾在同一個 session 裡主動開口，大部分時候選擇安靜。
- owner 從 Desktop 或 Telegram 讓他睡或叫醒他，life loop 尊重這個意圖。

## Non-Goals

- 不做 OS 層級的背景啟動；Cats 沒開時他不會醒，也不會說話。
- 不改 SPEC-094 排程規則，也不讓心跳經過 mission/run。
- 不做時區設定；作息以主機本地時間計算。
- 不做 session 上限的配額或搶占；滿了就退避重試。
- Phase 1–3 不做圖片；圖片見 Phase 4。
- 不做本機看圖或產圖模型；看不看得懂照片取決於陪伴貓的 provider。
- 不強制相簿唯讀；這需要 runtime 支援唯讀存取。

## Definitions

- **陪伴貓**：Cat `status: 'active'` 且 `roles` 含 `'companion'`（ADR-124）。
- **私訊 lane**：`status: 'active'` 的 channel，`roomRouting.mode === 'direct_message'` 且
  `roomRouting.defaultRecipientId` 等於該 Cat id。多個符合時取最近更新的一個。
- **lease**：lane 上該 Cat participant 的 `execution.lease`。
- **session 活著**：lease `status === 'ready'` 且 runtime `observeSession` 沒有回報可復活的
  關閉狀態。runtime 無法連線時為「未知」。

## Requirements

### Life profile（`CompanionBox.life`）

1. FR-1：`life` 欄位：
   - `enabled: boolean`，預設 `true`。
   - `bedtime: 'HH:MM'`，預設 `'23:00'`。
   - `wakeWindowStart: 'HH:MM'`，預設 `'07:00'`。
   - `wakeWindowEnd: 'HH:MM'`，預設 `'09:00'`。
   - `sleepUntil: string | null`（ISO 時間），owner 讓他睡覺時設定，預設 `null`。
   - `updatedAt: string`。
2. FR-2：讀取時缺少 `life` 或欄位不合法，逐欄套用預設值；不改寫既有檔案。
3. FR-3：`GET/PATCH /api/cats/:catId/companion-box/life` 讀寫 `enabled`、`bedtime`、
   `wakeWindowStart`、`wakeWindowEnd`。時間必須是 `HH:MM`；`wakeWindowEnd` 不得早於
   `wakeWindowStart`；`bedtime` 不得落在起床區間內。違反時回 `400`。`sleepUntil` 只由
   喚醒／睡覺操作寫入。

### 作息（rhythm）

4. FR-4：每天的起床時間 `W(d)` = `wakeWindowStart` + 以 `catId` 與本地日期 `d` 雜湊出的
   分鐘偏移（落在起床區間內）。同一天重啟不會重新抽。
5. FR-5：本地分鐘數 `m`、`w = W(今天)`、`b = bedtime`：
   - `b > w`：`w <= m < b` 為清醒時段，其餘為休息時段。
   - `b <= w`（就寢跨過午夜）：`m >= w` 或 `m < b` 為清醒時段。
6. FR-6：下一次起床時間 = 今天的 `W` 若還沒到，否則明天的 `W`。

### 期望狀態

7. FR-7：`life.enabled === false` 時 loop 完全不管這隻貓。
8. FR-8：`sleepUntil` 在未來 → 應睡著（原因 `owner`）；休息時段 → 應睡著（原因 `rest`）；
   否則應醒著。`sleepUntil` 已過去時視同 `null`。

### Life loop

9. FR-9：平台啟動後約 5 秒第一次檢查，之後每 60 秒一次；同一時間只跑一輪。
10. FR-10：應醒著時：
    - lease 是 `ready`：以 `observeSession` 確認；session 活著則不做事（不寫狀態、不發事件）。
    - lease 不是 `ready`，或 session 已關閉：走 channel activation 路徑喚醒。
    - runtime 無法連線：不做事。
11. FR-11：喚醒失敗時退避 5 分鐘。錯誤訊息符合 `Max sessions (N) reached` 時原因為
    `no_capacity`，其他為 `wake_failed`。同一段失敗只記一次動態紀錄。
12. FR-12：應睡著而 lease 是 `ready` 或 `initializing` 時：lane 最後一則訊息在 15 分鐘內
    則等待；否則走 channel deactivate 路徑讓他入睡。
13. FR-13：喚醒或入睡成功時寫一筆 `presence_changed` 動態紀錄，`metadata` 含
    `presence`（`awake` / `sleeping`）與 `reason`（`rhythm`、`keep_alive`、`rest`、`owner`、
    `idle`、`no_capacity`、`wake_failed`）。session 原本就活著時不寫。
14. FR-14：loop 的每次狀態寫入都在該 channel 的 mutation gate 內，並發出與 REST
    activation / deactivate 相同的 room 更新事件，讓 Desktop 的狀態卡片即時更新。

### owner 意圖

15. FR-15：`POST /api/channels/:id/deactivate` 作用在陪伴貓的私訊 lane 且 `life.enabled`
    時，設定 `life.sleepUntil` = 下一次起床時間，並記 `presence_changed`（`owner`）。
16. FR-16：`POST /api/channels/:id/activations` 作用在陪伴貓的私訊 lane 時清除
    `life.sleepUntil`，並在確實醒來時記 `presence_changed`（`owner`）。
17. FR-17：休息時段或 `sleepUntil` 期間 owner 傳訊息，沿用既有延遲喚醒；
    之後由 FR-12 讓他再睡（原因 `idle`）。

### 心跳（Phase 2）

18. FR-18：只在「應醒著、session 活著、清醒時段」時排心跳。間隔為 30–120 分鐘隨機，
    存在記憶體；重啟後重新抽。
19. FR-19：醒來後第一次心跳在 2–10 分鐘內，類型為 `wake`；但今天 `W(d)` 之後 lane 已經有
    `wake` 心跳訊息、或已超過 `W(d)` 3 小時時改為一般心跳，重啟不會重複道早安。
20. FR-20：lane 最後一則訊息在 10 分鐘內時，延後到那則訊息後 10 分鐘再重新抽一般心跳
    （已經在聊天就不再道早安）；session 正在處理訊息時延後 4 分鐘。
21. FR-21：心跳回合送進同一個 session，內容包含本地時間、醒了多久、主人上次說話距今多久、
    陪伴記憶摘要，並要求不想說話時只回 `[quiet]`。
22. FR-22：回覆是 `[quiet]`（忽略大小寫與前後空白）時丟棄；否則以該 Cat 的一般訊息
    （origin `runtime`，metadata `companionHeartbeat`）寫入 lane，並發出 `message_added`，
    由 transport fanout 鏡像到 Telegram。
23. FR-23：心跳持有以 runtime session 為鍵的程序內 gate；一般派送送出前等待該 gate。
    心跳本身若遇到 runtime busy（409），直接放棄並在 4 分鐘後重試同一次心跳。
    心跳訊息的事件是 `companion_heartbeat`，不是 `assistant_turn_segment`，
    不會被當成 owner 訊息的回覆。
24. FR-24：因休息時段入睡前，可送一次 `bedtime` 心跳讓他道晚安，規則同 FR-21–22。

### Telegram 在職守（Phase 3）

25. FR-25：Telegram 私訊進來時立即送 `typing` chat action，回覆送出前每 4 秒續送一次。
26. FR-26：新增 `/sleep`、`/wake` 指令，作用於該 bot 綁定的陪伴貓，行為同 FR-15、FR-16。
27. FR-27：綁定變更或重新連線後重建的 polling consumer 也要帶入 transport 指令。

### 照片（Phase 4）

28. FR-28：`life.photoFolder: string | null`，owner 在陪伴設定填寫本機資料夾。
29. FR-29：相簿資料夾是這隻陪伴貓的相簿。每個回合的陪伴脈絡告訴他相簿路徑、可以隨時用
    自己的工具翻閱與打開照片、只能看不能改，以及送照片的方式。心跳不列候選檔名，只在
    醒著的心跳（不含就寢）提一句「合適的話可以附一張相簿照片」。
30. FR-30：他在回覆中以獨立一行 `[photo: 相對於相簿的路徑]` 表示要附上的照片，該行一律從
    訊息移除。只送解析連結後仍在相簿內、副檔名為 jpg、jpeg、png、gif、webp 且 ≤ 10 MB
    的檔案；副檔名大小寫不符時，以同一資料夾內不分大小寫的檔名比對。送出時照片複製到
    lane 的附件資料夾，Desktop 以既有的附件區塊顯示；訊息 metadata 的 `transportMedia`
    指向原始檔，Telegram 以 multipart `sendPhoto` 上傳並把文字當圖說，文字超過 1024 字時
    先送圖片再送文字。
31. FR-31：陪伴設定頁的「作息與相簿」卡片可調整是否啟用、就寢時間、起床區間與相簿資料夾。
32. FR-32：一般回覆也能附照片，不限心跳。回覆的最後一段文字帶附件區塊與 `transportMedia`；
    Telegram 進來的訊息由 bridge 直接送照片，其他來源由 transport fanout 送。照片不符合
    FR-30 時不送；若回覆只剩那一行，保留原文，不以「沒有文字輸出」的預設句代替。
33. FR-33：owner 從 Telegram 傳來的照片（含以檔案傳送的圖片）以 Bot API `getFile` 下載，
    存進該房間的附件資料夾；訊息以與 Desktop 上傳相同的附件區塊記下路徑，貓用自己的工具
    打開來看，Desktop 也以附件顯示。超過 20 MB（Bot API 下載上限）或下載失敗時，
    訊息維持原本的 `Attachments: photo` 標示。適用所有 Telegram 房間，不限陪伴貓。

### Non-Functional Requirements

- **成本**：每次心跳都是一個 provider 回合；預設間隔下，每隻醒著的陪伴貓每天約 8–30 次。
- **容量**：每隻醒著的陪伴貓佔一個 runtime session 名額（預設上限 10）。
- **狀態衛生**：life loop 的測試只用記憶體 store 與假的 runtime client。

## Design Overview

- `src/products/chat/companion/life/`：`rhythm.ts`（純函式）、`loop.ts`（檢查與動作）、
  `presence.ts`（owner 意圖與動態紀錄）。
- `src/products/chat/api/resources/channelActivation.ts`：從 REST handler 抽出的
  activation / deactivate 本體，REST 與 loop 共用。
- `src/app/server/index.ts` 只負責在 `chat.startCompanionLifeLoop` 為真時啟動、關閉時停止。

## Open Questions

- 心跳間隔與起床區間是否要在設定頁開放調整（Phase 1 只開放作息時間）。
- 休息時段被叫醒回覆時，是否要在 prompt 告訴他「剛被吵醒」。
