# PLAN-136: Cat Profile Posts, Media Creation and Sharing

## Metadata

| Field | Value |
| --- | --- |
| Status | PoC implemented on feature branches — local/native acceptance passed; external tunnel/Telegram acceptance pending |
| Owner | Platform integration; Runtime media contract owner |
| Assigned To | Codex; independent agent review |
| Reviewer | Product owner; independent implementation review |
| Spec | [SPEC-143](../specs/SPEC-143-cat-profile-posts-media-and-sharing.md) |
| Decision | [ADR-151](../decisions/151-build-cat-profile-posts-on-managed-media-and-share-links.md) |

## Overview

使用者在文件合併後指示「開始實作」。實作以兩個可展示里程碑交付：

1. **M1：巴黎照片完整路徑** — 真正以 avatar 生成旅遊照片、Cat 圖文河道、心跳發表、
   可外部打開的分享頁與 DM／Telegram 通知。P0–P5 完成照片範圍即可展示。
2. **M2：影片完整路徑** — 來源影片取格／圖片輸入生成新短片，沿用相同發表與分享流程。
   P6 及對應恢復／升級驗收完成後才關閉整份 spec。

不把新審批系統、全部 provider 支援、社交互動或 managed Funnel 全套設定排在 M1 前面。
每個 phase 都有可觀察的結果；沒有要求等待估計工期或無關規劃完成。

## P0 — 鎖定可執行媒體能力與現有接縫

- [x] 盤點目前文字貼文、blank media tiles、`life.photoFolder`、localStorage 封面、
  Cat image service、零輸入 image contract 2、shared ingress 及 owner Telegram。
- [x] 記錄[現況與外部連線依據](../research/2026-11-11-cat-profile-publishing-baseline.md)。
- [ ] 先找一個可實際帶 avatar 的圖片 profile、一個可產出短片的 profile，驗證 native
  輸入／輸出方式、格式、長度、取消與 originating-turn 資源 handoff；不由聊天模型名稱推論。
- [x] 在 Runtime 以最小 contract extension 定義 managed input upload/reference、operation、
  capabilities、receipt、output bytes。保留舊 schema 2 消費，不把未知操作塞入舊 parser。
- [x] 確認目前 `cats` MCP 注入點；新增 role tools 與既有 image/Code 工具共用一個組合入口。
  不等待 PLAN-135 的 Work proposals 或整體工具重寫。

**Exit:** 有輸入圖片確實進入 provider、輸出檔可被收集的證據與明確契約。
影片 profile 的實作可留 P6，但缺口在此列出；沒有 profile 時不宣稱支援影片生成。

## P1 — 持久化素材、封面與升級

- [x] Snapshot v2 schema、單 writer、備份／原子替換／失敗恢復，保留既有 post id 與 tombstone。
- [x] 管理 asset ID／bytes／hash／provenance，串接共用 image ledger，準備影片 metadata。
- [ ] 素材卡選取／清除／重新整理同一 `life.photoFolder`；分頁列舉圖片／影片，選用時
  realpath 檢查、快照、限制檔案數量與大小；不把整個資料夾複製／公開。
- [x] Avatar adapter、平台持久化 cover、舊 localStorage 匯入 journal／備份／readback。
  沒有 renderer 時可回報 cover 未匯入；不破壞舊封面或默默替換成別張圖。

**Exit:** 背景 host 可使用指定資料夾、avatar、cover，來源變動不會改掉已保存作品；
舊使用者 profile 升級、重跑及中斷恢復測試通過。

## P2 — 真實河道與 Agent 貼文生命週期

- [x] 把 `post_create/list/get/update/delete` 接到同一 companion domain service；保留
  原 sidecar producer 的相同 identity／dedupe，owner delete 路由共用 tombstone 行為。
- [x] 有序媒體附件、read projection、穩定 cursor pagination、revision conflict、request key
  與 hash；發布和 outbox 在同一 snapshot mutation 保存。
- [ ] Directory 的實際 `src/app/renderer/entities/companion/` 加入照片拼排、viewer、
  影片 poster／播放器、作者與時間、AI 標示、分享／刪除入口、製作狀態與空狀態。
- [ ] 「請牠創作」沿用 direct lane；文案使用既有 i18n，設定成功由狀態反映，錯誤走 Toast。
  確認舊 Chat component re-export 不變成第二套 UI。

**Exit:** 用隔離素材能由 agent 建立圖文、修改、刪除，實際 UI 可閱讀／操作；無假媒體佔位。

## P3 — 參考圖生成、自動接續發表與心跳

- [x] `media_generate/status/list` 重用 Platform image execution 與 Runtime P0 契約，新增
  post asset-only destination；既有 image_generate 直接傳圖不受影響。
- [x] 保存 `publicationIntent` 後等待原 job；完成檔案驗證才發表。恢復採相同 job ID，
  不在持有 provider slot 的 turn 裡同步等待，不用第二次 model 呼叫完成程序性發表。
- [x] 素材 refs 固定為使用當下版本；巴黎 prompt 帶真 avatar，輸出保留 lineage／AI 標記。
- [x] 新增每 Cat 一次設定的自動發文／分享／通知與有限預設；重用既有 image policy，
  不建立 per-post approval；ordinary Cat 的手動創作不依賴 Companion mode。
- [ ] 心跳提供近期貼文與未完成意圖，quiet／companion／assist、busy gate、作息與退避
  繼續有效。純自動貼文也記一次未回應行為；DM 與 Telegram 不重複增加計數。
- [x] 覆蓋刪除／取消與生成晚到的競態，跨午夜限額與重啟不重設；bedtime 不取消已接受工作。

**Exit:** 一次指令或一次適合發文的心跳能產生巴黎圖文；可關閉 renderer 等待 host 完成。
發文、生成及通知的失敗各自可辨認。

## P4 — 單篇分享頁與既有遠端入口

- [x] 私有 share-create/revoke operation 及 hash-based grant；HTML／media 路由只允許
  GET/HEAD，逐次檢查 post tombstone／grant／asset membership。
- [ ] Server-rendered 手機版頁面、AI 標籤、OG metadata、縮圖／poster、Range streaming。
  接在 shared ingress 的明確路由位置，不把 `/api/*` 或 Desktop shell 放寬成匿名。
- [x] 讀 Settings → Remote access 的 active origin／readiness。先走既有 ngrok；
  Tailscale Serve/Funnel 用 existing tunnel 對同一 listener，不增加固定公開 port。
- [ ] 無 tunnel、斷線、origin 換掉、主機離線、撤銷、刪文的 UI／API 結果清楚；
  原始來源資料夾及生成 prompt 不出現在分享頁。

**Exit:** 無 Cats cookie 的外部裝置可開啟單篇照片貼文；撤銷後 HTML 與媒體均拒絕。
Serve 的 tailnet 連線與公開 Funnel/ngrok 分開記錄，不互相冒充驗收。

## P5 — DM／Telegram 通知及 M1 展示

- [x] Post outbox 使用既有 direct lane／owner Telegram binding；每目的地 receipt，
  send claim、uncertain 與同內容重試；剔除 ordinary fanout 的第二次投遞。
- [x] 無 binding／remote origin 時保留本地成功及具體通知狀態，不送 localhost 網址。
  待送 URL 重新讀 origin，刪文／撤銷可抑制後續通知。
- [ ] 執行下列 M1 golden path 及照片相關 A1–A10；保留真實 source／Runtime revision、
  profile、job、artifact hash、post id、分享模式與 delivery receipt 的驗收記錄。

**Exit:** 使用者能看到巴黎 AI 照片貼文，在 DM／Telegram 收到連結並用另一裝置打開。
生成／發表／分享／送信任何一項未驗證都明列 pending，不能用前三項成功代替第四項。

## P6 — 新影片與來源影片再創作（M2 必要）

- [ ] 落實一個 Runtime video profile；圖片／影片輸出共用 Platform job/asset/recovery
  概念，保留舊 image API。確認取消與 timeout 沒有遺留執行程序。
- [ ] 對來源影片讀 metadata、指定影格時間點、擷取 poster／references，記錄來源 hash、
  timestamp 及 transform operation；有原生 video input 時才宣告該能力。
- [ ] 實際生成短片並驗證 codec／duration／bytes，播放、seek、Range、手機頁與通知。
- [ ] 執行 A11 及影片的 A1–A10；來源影片取格生圖及取格生短片皆有至少一筆真實證據。
  只匯入現成影片、只產生 poster 或文字宣稱完成均不算。

**Exit:** 同一 Cat 可由來源照片或影片畫面生成新短片、發文、分享及通知；更新 spec 狀態。

## Implementation ownership and files

以下為實作接點；詳細驗收與尚未完成的範圍見文末 checkpoint：

| 範圍 | 接點／預計工作 |
| --- | --- |
| Directory UI | `src/app/renderer/entities/companion/CompanionFeed.tsx`、`CompanionWorkspace.tsx` 與 hooks |
| Profile 圖片 | `src/products/shared/renderer/catCoverStorage.ts`、`components/DraftHeader.tsx` 的 host-backed cover adapter |
| 貼文／素材 | `src/products/chat/companion/` 的 service、`profileReadModel.ts`、`supervisedContentTools.ts` |
| Durable state | `src/core/companionContracts.ts`、`src/products/chat/state/companion-box/`；integration review 覆蓋受影響 consumers |
| API | `src/products/chat/api/companionBoxRoutes.ts` 與 product-owned share delegate；host 只作註冊 |
| Session tools | `src/platform/multimedia/catImageTools.ts` 與既有 session tool composition；避免同名 MCP 衝突 |
| 媒體執行 | `src/platform/multimedia/`、`src/runtime/images.ts` 的版本化 extension，Runtime `src/core/media/` 與 HTTP adapters |
| 心跳 | `src/products/chat/companion/life/`、原 `companionPostSidecar.ts` |
| 分享／通知 | `src/platform/apps/ingressBoundary.ts`、existing Remote access、`src/platform/transports/`，companion outbox sender |

第一個 UI／post 切片可只改 Platform。參考圖／影片 execution 是 Runtime 的配套 change，
進入該 member 前讀其 AGENTS／CODEX。Apps 不需改版；用現有 SDK 消費測試守住相容性。
新 endpoint 共用既有 ingress，無需分配新 service port。若實作改變 listener，再更新 services。

## Testing and demonstration

先用 Memory store／temporary profiles／受控媒體 fixture 驗證 domain 與失敗恢復，再作真實生成：

| 範圍 | 最小有意義的驗證 |
| --- | --- |
| Domain | create/update/delete、cursor、媒體順序、重試 conflict、delete/complete 競態、跨 Cat 拒絕 |
| 素材／升級 | original hash 不變、path/junction 越界、檔案消失、大小格式限制、v1→v2、封面匯入／失敗重跑 |
| Media | reference bytes 確實到 Runtime、舊 schema 2 消費、source-turn handoff、取消、重啟只查原 job |
| 自主活動 | 真正 companion 才自動貼文、assist／quiet 不誤發、post-only back-off、用量／busy／停用 |
| 分享 | 未登入 HTML／圖／影片、Range、grant revoke、tombstone、無 path 泄露、internal routes 仍拒絕 |
| 通知 | DM／Telegram 各自 receipt、未知網路結果、origin 變動、binding 失效、無重複 fanout |
| UI | 真實 Desktop 的 Directory profile、viewer、delete/share、製作中／錯誤、手機分享頁 |

延伸既有 companion-post-tool、companion-feed-remove-post、companion-profile-read-model、
companion-heartbeat、companion-initiative、companion-photos、cat-image、shared-ingress、
transport suite；依實際依賴執行 scoped tests 與受影響 build/typecheck。
文件-only slice 不跑 application tests/build；跨 repo 實作的 CI 仍須完整通過其必要檢查。

M1 手動腳本：用隔離 candidate profile 與測試素材設定 Cat → 設定 source/avatar/cover →
要求巴黎貼文 → 等待真圖與文章 → 驗證新檔／原檔 → 建立分享 → 在 owner DM／測試 Telegram
收連結 → 外部手機打開 → agent 刪文 → 重開原網址與媒體驗證撤銷 → 重啟確認無重複。
再以隔離時鐘觸發一次真正 heartbeat 走同一流程，驗證不用逐篇確認。
影片切片替換素材／輸出，重走相同步驟。不要向使用者平常的 dev state 塞測試貼文。

## Risks and limits

| 風險 | 處理 |
| --- | --- |
| 參考圖／影片 provider 未驗證 | P0 提前確認；未具備時如實標記，不能用文字生圖假替代 |
| 現有 sidecar、MCP、image delivery 重複副作用 | 共用 domain service、request key、asset-only post 工作與單一 outbox |
| 分享入口意外暴露整個主機 | 只加單篇 HTML／授權媒體路由，重用 ingress route matrix |
| 圖像或封面升級遺失資料 | 已知格式驗證、備份、atomic replace/readback、失敗保留及恢復驗收 |
| 無背景主機／可達 tunnel | 本地仍可發表，外部狀態如實顯示；不引入雲端架構作 PoC 前置 |

## Implementation checkpoint — 2026-11-11

Platform `feat/companion-profile-poc` 與 Runtime `feat/companion-media-poc` 已實作 PoC。
文件依使用者指示直接送 main；程式碼留功能分支，不代表已安裝新版或發布。

- Directory：所有 Cat 的貼文河道、圖文 composer、AI 圖／6 秒影片 composer、參考素材
  選取、待完成意圖、照片 viewer、影片播放、編輯、刪除、分享／撤銷及通知入口。
  河道先顯示 20 篇、逐批載入畫面；API 使用穩定 cursor，profile aggregate 目前仍讀完整集合。
- Host：同一 cats MCP 的 media/post tools、managed immutable assets、v1→v2 備份與原子
  升級、同 turn request identity、原 job 的續接發表、單一通知 outbox。
- Runtime：additive contract 3、Grok image_edit/image_to_video；影片素材先取中間影格。
  舊 contract 2 與 App image consumer 保留。輸出／來源皆量測 hash、尺寸及影片 duration。
- Heartbeat：共用既有生命週期／額度，post-only 算一次未回應；停止自主活動不取消已接受
  工作，取消意圖／停用 Cat／撤銷 autoPost 或引用頭像設定會阻止對應後續動作。
- 分享：真實 host router 與 dedicated ingress 的匿名單篇 HTML／媒體、Range、撤銷及
  internal-tool 拒絕測試已通過。實際外部 origin、第二台裝置、Telegram 仍待連線驗收。

### Observed validation

- Platform server、renderer typecheck、test UI bundle 與隔離 Desktop candidate 全部建置成功。
  Sharp 為 native dependency，test bundler 必須 external；已修正新相依的 CJS bundling 問題。
- 110 項原 focused Platform checks 通過，另補 policy identity、commit-time sharing、
  life stop versus autoPost revoke、Cat removal、profile-reference revoke、通知最後一次
  recipient lookup race、real host + ingress 等回歸。最終命令結果見[驗收筆記](../research/2026-11-11-cat-profile-publication-poc.md)。
- Runtime 18 項媒體測試通過。真實 native 四條路徑成功：avatar→巴黎照片、照片→短片、
  來源影片影格→新照片、來源影片影格→新短片。詳見 Runtime SPEC-044 的 native evidence。
- 獨立 Windows Candidate 實際觀察 cover/avatar、河道、照片 dialog、未設定 remote 的提示、
  影片分頁與播放器逐格前進；實際 MP4 API 206 回傳指定的 1024 bytes。
  沒有對使用者平常的 Cats state 寫入示範資料。
- Independent review 的來源上傳、v3 poll、未知工作恢復、設定撤銷、通知競態及 shutdown
  問題已修正；本機 regression probes 與對應持久測試已確認。

### Remaining acceptance / bounded PoC differences

- 完整 M1/M2 外部閉環仍未通過：未建立真實 tunnel、未向真實 Telegram 發信，未用手機開啟。
  Native provider 執行與 host publication 分別有實測／整合證據；尚未在同一 Candidate 登入
  provider 後從 composer 一路走到遠端手機。不能把分層證據稱為整條 golden path。
- 專用 video poster／OG poster、影格時間選擇器、source listing 的 cursor、純 server-side
  feed pagination 尚未實作；目前原生 video metadata preview、中間影格、最多 200 個來源。
- AI composer 直接提交 host publication intent；既有 DM 入口也可請 agent 用同一套工具。
  尚未另造「請牠創作」對話 modal。錯誤使用局部狀態文字，沒有新增逐篇審批。
- Release 前仍需 FFmpeg/FFprobe 跨 OS binary、授權 notices、source-free packaging 驗證。
  Companion snapshot v2 的持久格式邊界需在下一次授權 release 按 0.x minor 政策處理；
  本次不 bump。回退前 drain pending v3 工作並保留升級備份，不用舊版本寫新 snapshot。

| Date | Update |
| --- | --- |
| 2026-11-11 | ADR/SPEC/PLAN 文件先送 main；使用者接著授權實作 |
| 2026-11-11 | PoC 功能、真實圖／影片生成、隔離 Desktop 視覺與 focused regressions 完成；外部連線驗收 pending |

*Last updated: 2026-11-11*
