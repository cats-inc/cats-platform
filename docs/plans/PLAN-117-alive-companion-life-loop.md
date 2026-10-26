# PLAN-117: Alive Companion Life Loop

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Implemented; real-bot and Desktop visual acceptance pending |
| **Owner** | Claude |
| **Reviewer** | Owner |

## Related Spec

[SPEC-124: Alive Companion Life Loop](../specs/SPEC-124-alive-companion-life-loop.md)

## Related Decision

[ADR-127: Keep Companion Cats Alive with a Platform-Owned Life Loop](../decisions/127-keep-companion-cats-alive-with-a-platform-owned-life-loop.md)

## Overview

分四個可以各自展示的 PR：先讓「醒著」變成真的並有作息，再讓他主動開口，
接著補 Telegram 的在職守體驗，最後加照片。

## Phase 1: 真的醒著與作息

- [x] `CompanionBox.life` 型別、讀取時補預設值、記憶體與檔案 store 的讀寫。
- [x] `GET/PATCH /api/cats/:catId/companion-box/life` 與驗證。
- [x] `rhythm.ts`：每天固定的起床時間、清醒／休息時段判斷、下一次起床時間。
- [x] 從 REST handler 抽出 channel activation / deactivate 本體，REST 與 loop 共用。
- [x] life loop：期望狀態、以 runtime 觀察確認 session、喚醒、閒置後入睡、上限退避。
- [x] `presence_changed` 動態紀錄（喚醒、入睡、owner 操作、無法喚醒）。
- [x] owner 的 activation / deactivate 作用在陪伴貓私訊 lane 時更新 `sleepUntil`。
- [x] 正式入口開啟 loop；測試用 `createServer` 預設不啟動。
- [x] 測試：舊檔讀取補預設、作息邊界（含跨午夜）、同日起床時間固定、loop 在 session
  已活著時不寫狀態、runtime 重啟後自動醒回、上限滿時退避且只記一次、休息時段閒置後入睡、
  owner 睡覺後不會被 loop 叫醒。

**Exit**：重啟 runtime 後一分鐘內，陪伴貓私訊 session 自動回到 ready；就寢時間後閒置
15 分鐘釋放 session；動態紀錄看得到醒來與入睡。

## Phase 2: 心跳

- [x] 以 runtime session 為鍵的程序內 gate；`executeDispatch` 送出前等待。
- [x] 心跳排程（記憶體、隨機間隔、醒來後的 `wake` 心跳、延後條件、重啟不重複道早安）。
- [x] 心跳 prompt（本地時間、醒了多久、主人上次說話、陪伴記憶）與 `[quiet]` 判斷。
- [x] 回覆以該 Cat 的一般訊息寫入 lane（`senderKind: 'agent'`、origin `runtime`），但事件是
  `companion_heartbeat` 而不是 `assistant_turn_segment`，避免 live indicator 把它當成 owner
  訊息的回覆；發出 `message_added`，由 fanout 送到 Telegram 一次。
- [x] 入睡前的 `bedtime` 心跳。
- [x] 測試：安靜不寫入、開口寫入並鏡像到 Telegram、心跳進行中 owner 訊息會等待、runtime busy
  時重排、重啟後不重複道早安、正在聊天時不插話。

**Exit**：清醒時段內他會在同一段對話裡自己開口，Telegram 收得到。

## Phase 3: Telegram 在職守

- [x] 私訊進來立即送 `typing`，回覆前每 4 秒續送；走獨立的 `sendChatAction`，不產生 delivery
  receipt，也不更新 `lastOutboundMessageId`。
- [x] `/sleep`、`/wake` 指令，與 Desktop 按鈕共用 owner 意圖（`setCatDirectLanePresence`）。
- [x] 綁定變更與手動重新連線重建的 polling consumer 帶入 transport 指令（重新連線也補上 `/work`
  的 golden path）。

## Phase 4: 照片

- [x] `life.photoFolder` 與陪伴設定的「作息與相簿」卡片（也涵蓋就寢時間與起床區間）。
- [x] 心跳列出候選檔名（最多 6 個、≤ 10 MB），解析 `[photo: 檔名]`，只接受列出的檔名。
- [x] Telegram multipart `sendPhoto`；fanout 對帶照片的訊息送圖片、文字當圖說；照片也複製到
  lane 附件資料夾讓 Desktop 顯示。

## Phase 5: 貓自己翻相簿（ADR-127 §5）

- [x] 陪伴脈絡（`CompanionSessionContext.photoAlbum`）帶相簿路徑；`formatCompanionContext`
  只對陪伴貓說明相簿、唯讀約定與 `[photo: 路徑]`。心跳改為一句提示，不再抽候選檔名。
- [x] `resolveCompanionAlbumPhoto`：相對或絕對路徑，`realpath` 後必須在相簿內；大小寫不符時
  以同資料夾比對。
- [x] 一般回覆：`executeDispatch` 在回合結束後處理 `[photo: …]`（`applyCompanionPhotoDirective`），
  `results.ts` 把 `transportMedia` 蓋在最後一段；Telegram bridge 對帶照片的回覆直接送照片。
- [x] 附件複製（`channelAttachments.ts`）從 `api/` 移到 `state/`，讓派送流程也能使用。
- [x] Telegram 傳進來的照片下載到房間附件資料夾，讓貓看得到（SPEC-124 FR-33）。

## Follow-ups (not in this plan)

- 主動生圖到 Telegram 的完整 golden path 見
  [PLAN-121](PLAN-121-shared-image-service-and-controlled-cat-generation.md)：
  Platform 共用服務、有限 Cat grant、Studio 共用與 durable delivery；規劃文件，
  尚未實作，不改本計畫既有相簿／文字心跳的驗收狀態。

- 陪伴貓私訊回合前的 companion 發文決策 sidecar 讓延遲約加倍，影響在職守的感覺；
  可改為只在需要時才做決策。
- runtime 對同一 session 的併發訊息回 409，一般 owner 連發兩則訊息時也會碰到。
- 每次心跳照片都會複製一份到 lane 的 `.cats-attachments/`，同一張照片會累積 `x (1).png`、
  `x (2).png`；可改為依內容雜湊重用既有副本。
- 相簿很大時，貓每次都得自己翻；可讓他替看過的照片留筆記，或由平台提供「最近傳過的」清單。
- Desktop 串流回覆時，`[photo: …]` 那一行可能在收尾前短暫出現，收尾後才被移除。

## Progress Log

- 2026-10-26：修復 DM 睡醒與主動回合的 conversation continuity。
  - Desktop 0.10.1 實機唯讀確認：07:48 建立的新 Runtime 在 09:59 發英文問候；第一個
    hidden prompt 只有英文時間／問候指令與 mixed expression，沒有先前中文對話。
    hydration 為 `fresh_start` / `none`；產品 DM transcript 並未遺失。
  - 入睡不再清空 DM session id，醒來走既有原生 resume；retarget 優先更換 execution，
    resume 失敗保留 attachment 與錯誤。一般房間 deactivate 維持原語意。
    同時修復 model-only 與 Runtime explicit selection 的等價判斷，並在 closed lease
    缺少舊版 selection 時從 Runtime 觀察恢復；未選模型的舊 attachment 不誤判成 retarget。
  - 心跳共用一般 Cat 回合的角色／語言／checkpoint 與 memory-aware envelope，並送入
    同一 DM 的 bounded continuity instructions。短歷史原文、長歷史沿用 12,000 字元內
    的既有 digest，未指定語言依主人交談。這也補救舊版本已開啟但漏承接的 Runtime。
  - 分層記憶原本只被放進 hydration metadata；共用 prompt formatter 現在呈現已篩選
    的 facts、owner hints、open loops，限制數量與每則 280 字元，不呈現 excluded records。
    hydration 失敗不再吞錯後繼續發出空白脈絡問候。
  - 前 5 個回歸案例在舊程式全數失敗。最終相關 9 檔 149 個通過，候選編譯輸出同樣
    149 個通過；架構邊界 101、selection/continuity 38、Runtime 原生 wake/close 契約
    33 個通過。Server build 與 test TypeScript 檢查通過。首次本機 routing fixture 因
    預設附件路徑被 sandbox 阻擋而等待，停止該測試並改用私有 `CATS_RUNTIME_DIR` 後通過；
    沒有提高權限讓該 fixture 寫入使用者 profile。圖片 fanout fixture 補上真實 active lease。
  - 最終隔離 Desktop 候選完成 Runtime/server/host/renderer 建置並檢視 first-run 畫面，
    正常 drain（exit 0）。Platform source digest
    `4337f4414b5c56347197889b62d23f61af5bc381ae02f832e05cf4fe12f54b7e`，Runtime `5212fa59`；
    四個 production 修正檔案與工作樹 SHA-256 一致。UI 啟動本身不當成功能驗收。
  - 同一候選編譯輸出另以隔離 Codex `gpt-6.1-sol` 做 3 個真實回合：記住隨機暗號、
    經 production sleep/wake 後在未重送暗號的請求中正確回答，Runtime/provider session id
    均維持相同；再明確換成新 Runtime，首個主動回合用中文提到同一 DM 的「虹石灣」
    與陪伴記憶的「桂花烏龍茶」。舊版 model-only 判斷確曾使首次 live probe 重建，
    修正後通過；最終私有證據在 workspace parent `.dm-continuity-live-20261026-6/report.json`。
    probe 自有 Runtime 已停止、複製的登入已刪除。沒有寫入將將或傳送 Telegram 訊息；
    尚未聲稱安裝版已更新，也不聲稱已完成高階長對話濃縮或無損召回。本次不升版。

- 2026-10-26：修復原生 CLI 新會話的首次主動回合死等。
  - 實機 Desktop 0.10.0 的陪伴貓在 10/25 08:53 自動建立會話後，lease 持續
    `initializing`，整日 Runtime 訊息數為 0；23:00 才依作息關閉。舊 loop 直接略過
    所有 `initializing` lease，不觀察也不送首回合。以當時唯讀快照在記憶體模擬
    09:00–22:59，共 840 次均停在 `waking`；未修改實際 profile 或傳送驗證訊息。
  - 已有 session id 的 `initializing` 與 `ready` 同樣檢查存活並排心跳；首次成功
    （含安靜）後，只將仍指向同一 session 的 initializing lease 推進為 ready。
    無 session id 的喚醒等待最多 5 分鐘，再沿用 activation/backoff；不介入 owner
    仍在進行的回合。程序重啟後等待與心跳計時重新安排，不改持久化格式。
  - 每次 heartbeat 記錄 kind 與 spoke/quiet/busy/failed，方便區分模型選擇安靜與
    執行失敗，不記錄 prompt、回覆或憑證。
  - 驗證：初版新增 9 個回歸案例在舊程式全數失敗、修正後通過；之後加上檔案
    store 重建後的初始化恢復、真實 activation body、首個 hidden turn、安靜後狀態
    推進、Telegram fanout 一次投遞，以及會話替換／關閉競爭。候選編譯輸出相關
    4 檔 72 個通過；另 4 檔邊界／Telegram／lease attachment 共 108 個通過。
    Server build 與 test TypeScript 檢查通過（worktree 使用既有 Platform/mobile 依賴）。
  - 隔離 Desktop 候選以 Platform `a36a0c52` 加本修正、Runtime `5212fa59` 建立；
    Runtime、server、host、renderer build 通過，檢視首次設定畫面後正常 drain（exit 0）。
    候選內兩個修正來源的 SHA-256 與工作樹一致。這是 fixture 與候選來源驗證，
    尚非安裝版的白天實際 provider／Telegram 長時間驗收；本修正不升版。
  - 額外抽查既有 `chat-session-lease-projection` 在 Windows 單獨執行會報
    `missing core session session-1`；未修改的主線也可重現同一失敗，本次未改該範圍。

- 2026-09-29：ADR-127、SPEC-124、PLAN-117 建立；Phase 1 開始。
- 2026-09-29：Phase 1 完成。
  - 順手修掉 `FileCompanionBoxStore` 的既有風險：原本寫入不是原子的，讀取遇到任何錯誤
    （包括讀到寫到一半的檔案）都會把整份 companion 資料蓋成空的。loop 每分鐘讀一次會放大
    這個風險，所以改為暫存檔加 rename，且只在檔案不存在時建立新檔；格式損壞時回報錯誤、
    保留原檔。
  - 活動紀錄的 render entry 帶上最新事件的 `metadata`，`presence_changed` 由 renderer 以
    在地化文字顯示。
  - 驗證：`tests/companion-life.test.js`（19）、`companion-box-store`、`companion-box-routes`、
    `channel-deactivate`、`config`、`architecture-boundaries` 等 13 個 server 測試檔共 286 個通過；
    renderer 相關 10 個測試檔 43 個通過。`provider-telegram-routes` 的「file-backed restart」
    在合併執行時失敗一次，重跑通過（原因見 Phase 2 紀錄）。
  - 尚未驗證：實機 Desktop 畫面（動態紀錄文字、狀態卡片在 loop 喚醒後的更新）。
  - 已確認 Desktop 讓他睡的三個入口（個人頁、私訊工具列、`useDirectLaneCompanionMode`）都走
    `POST /api/channels/:id/deactivate`，所以都會寫入 `sleepUntil`；進入私訊不會自動呼叫
    activation。在清醒時段按一次睡覺，他會睡到下一次起床時間；期間 owner 傳訊息仍會醒來
    回覆，閒置 15 分鐘後再睡回去。
  - 已知取捨：休息時段裡卡在 `initializing` 超過 15 分鐘且 lane 安靜的 session 也會被關掉。
- 2026-09-29：Phase 1 以 #186 merge（`7e2efe17`）。Phase 2 完成。
  - Telegram bridge 選回覆時跳過 `companion_heartbeat` 訊息：owner 那一輪失敗而 lane 上只剩
    心跳訊息時，原本會把它當成回覆再送一次（fanout 已經送過）。
  - `provider-telegram-routes` 的「file-backed restart」是既有的不穩定測試：單獨執行各 10 次，
    Phase 1 之前（`19b52694`）失敗 1 次、Phase 1 後的 main（`7e2efe17`）失敗 2 次、Phase 2
    分支失敗 2 次。失敗時都是 `waitForTelegramLinkedRoom` 的 4 秒逾時（成功約 1.1 秒），
    呈雙峰分布，像寫入競爭而非變慢；companion 檔案 store 在該測試中完全沒有被讀寫。差距在
    樣本誤差內，另案追蹤。
  - 驗證：`companion-heartbeat`（11）、`transport-fanout`（6，含心跳送到 Telegram 一次）、
    `telegram-work-delivery-bridge`（11，含心跳不會被當成回覆）等，server 12 檔 248 個、
    `provider-telegram-routes` 35 個、bundled 4 檔 21 個通過。
  - 尚未驗證：實機 Desktop 私訊裡心跳訊息的呈現，以及真的 Telegram bot。
- 2026-09-29：Phase 2 以 #187 merge（`015acac1`）。Phase 3 完成。
  - 修正「喚醒」的變化判斷：channel activation 對已經活著的 session 也回報 `started`，原本會讓
    Desktop 喚醒按鈕在已醒著時多記一筆「被你叫醒了」，`/wake` 也會回「醒來了」。改為看喚醒前
    lead lease 是否已是 `ready`（`activateChannelLocked` 回傳 `leadWasReady`）。
  - 驗證：`companion-telegram-duty`（3）、`telegram-commands-i18n`、`telegram-work-delivery-bridge`
    （12，含 typing 在回合開始前送出且不產生 receipt）、`architecture-boundaries`、
    `provider-telegram-routes` 等，server 15 檔 236 個與 bundled 5 檔 55 個通過。
  - 尚未驗證：真的 Telegram bot 上的 typing 與 `/sleep` `/wake`。
- 2026-09-29：Phase 3 以 #188 merge（`4ef1386f`）。Phase 4 完成。
  - 驗證：`companion-photos`（5，含 multipart 實際上傳位元組）、`transport-fanout`（8，含心跳照片
    在 Desktop 以附件顯示、Telegram 收到附圖說的照片、長文字先圖後文）、`companion-life`
    （20，含相簿資料夾必須存在）、`companion-life-card`，server 12 檔 224 個與 bundled 8 檔通過。
  - 尚未驗證：真的 Telegram bot、Desktop 上「作息與相簿」卡片與私訊照片的實際畫面。
- 2026-09-29：Phase 4 以 #189 merge（`d96ea611`）。追查 `provider-telegram-routes` 的「file-backed
  restart」不穩定測試，確認是產品 bug：`FileChatStore` 的讀取只等待、不持有寫入鎖，卻會在讀取時
  寫回檔案（初始設定完成時間的修正、ADR-124 的 companion 轉換、備份還原、建立預設檔）。這個寫回
  若晚於同時進行的儲存才落地，就會把剛存的資料蓋回舊版（測試中被蓋掉的是 Telegram bot 名稱）。
  修正為讀取只讀；需要寫回時改在同一把寫入鎖內重新讀取再寫。修正後該測試單獨連跑 20 次全數通過
  （修正前約 15% 失敗）。
- 2026-09-29：讀取修正以 #193 merge（`8a1e94f0`）。owner 指出「平台抽 6 個檔名」與他的想法不同：
  指定資料夾後，貓應該能主動存取底下任何檔案。Phase 5 完成（ADR-127 §5、SPEC-124 FR-29～FR-32）。
  - 測試 harness 的假 runtime 原本把每個 session 的工作目錄固定在系統暫存資料夾下的同一路徑，
    附件會跨次執行殘留、造成檔名變成 `sunset-3.png`；改為放在每次 harness 自己的暫存資料夾，
    並設定 `runtimeDataDir`，避免附件複製落到真的 `~/.cats/runtime/data`。
  - 驗證：`companion-photos`（8，含 `../`、相簿外絕對路徑、指向相簿外的 junction、超過 10 MB）、
    `companion-heartbeat`（12，含一般回覆從子資料夾送照片、相簿外路徑不送、提示含相簿路徑）、
    `telegram-work-delivery-bridge`（Telegram 進來的回覆直接送照片）、`transport-fanout` 等，
    server 26 檔 384 個與 bundled 173 個通過；`tsc` 的 server、desktop、root、test 專案通過
    （mobile 因工作區未安裝 mobile 依賴未檢查）。
  - 尚未驗證：真的 provider（Claude、Codex）是否會照提示翻相簿、打開圖片；真的 Telegram bot。
- 2026-09-29：Phase 5 相簿以 #206 merge（`ac33f5d3`）。Telegram 傳進來的照片（FR-33）完成。
  - 平台的 Telegram HTTP 層原本把回應一律解成 UTF-8 文字，二進位下載會壞掉；改為保留原始位元組
    並提供 `arrayBuffer()`。
  - 下載是 best effort：relay 的 `downloadFile` 失敗一律回 null，bridge 退回原本的附件標示。
    儲存由 room bridge 選配的 `storeInboundAttachments` 負責，平台不直接依賴 chat 的附件模組。
  - 驗證：`telegram-inbound-photos`（4，含非 UTF-8 位元組完整、超過上限不下載、存進房間附件資料夾）、
    `telegram-work-delivery-bridge`（15，含照片以附件區塊交給貓、下載失敗維持標示）、
    `provider-telegram-routes`、`telegram-*`、`dependency-graph`、`architecture-boundaries` 等，
    server 19 檔 233 個與 bundled Telegram 測試 64 個通過；`tsc` 的 server、desktop、root 專案通過。
  - 尚未驗證：真的 Telegram bot 傳照片，以及貓實際打開照片。
- 2026-09-30：Telegram 照片以 #208 merge（`206e2488`）。拿掉 Telegram 回覆前的房間說明：原本每則回覆
  都以 `Continuing room "…" in Cats Chat.` 開頭，照片圖說也會帶著。現在只有群組 bot 開新房間時才加
  `Opened room "…"`；Cat 自己的 bot（私訊 lane）只送他說的話，第一則也不加。
  - 驗證：`telegram-work-delivery-bridge`（17，含私訊 lane 進行中與第一則訊息都只有 Cat 的話、照片圖說
    只有回覆文字）、`provider-telegram-routes`（群組開新房間仍有 `Opened room`）等，server 8 檔 181 個與
    bundled Telegram 測試 66 個通過；`tsc` 的 server 與 test 專案通過（mobile 依賴未安裝）。
