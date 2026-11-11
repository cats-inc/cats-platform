# SPEC-143: Cat Profile Posts, Media Creation and Sharing

## Metadata

| Field | Value |
| --- | --- |
| Status | PoC implemented on feature branches — 2026-11-11; full external acceptance pending |
| Owner | Platform integration; Runtime owns media execution |
| Reviewer | Product owner; independent implementation review |
| Decision | [ADR-151](../decisions/151-build-cat-profile-posts-on-managed-media-and-share-links.md) |
| Plan | [PLAN-136](../plans/PLAN-136-cat-profile-posts-media-and-sharing.md) |

Implementation evidence and bounded PoC differences: [PLAN-136 checkpoint](../plans/PLAN-136-cat-profile-posts-media-and-sharing.md#implementation-checkpoint--2026-11-11).

## Summary

在 Cats Desktop Directory 的貓咪個人檔案建立以 Cat 為作者的圖文／影片河道。
Cat 可使用來源資料夾、大頭照、封面生成新的 AI artifact，主動或依指示發表，
再把能閱讀的分享連結送進 DM／Telegram。先交付完整照片示範，接著完成影片切片。

## Goals and scope

- 支援 agent 建立、讀取、編輯、刪除附有圖片／影片的貼文。
- 原始素材與 AI 產出分開保存；媒體生成、發表、分享與通知可各自恢復。
- Companion 心跳可以選擇安靜、聊天或創作發表，不強制每次心跳貼文。
- 用一次設定取代逐篇審批；沿用現有 Directory、平台媒體服務、Remote access、owner 綁定。

第一版不做公開留言／按讚計數、社交關係、推薦排序、多人共編、排程日曆或雲端常駐託管。
「仿 Facebook」指個人頁與河道的閱讀／分享體驗，不是複製整個社群產品。

## Current baseline

依 2026-11-11 原始碼盤點，詳細位置見[現況筆記](../research/2026-11-11-cat-profile-publishing-baseline.md)：

| 已有 | 這次要補上 |
| --- | --- |
| Directory profile、頭像／封面、六個內容分頁 | 真正的媒體卡片、頁面內請 Cat 發文入口 |
| `companion.content.post.create` 文字發文、owner soft remove | Agent edit/delete、媒體附件、穩定重試與 pending publish |
| `CompanionDerivedRecord` 貼文投影 | 附件 read model、生成來源、分頁與外部分享 |
| `life.photoFolder`、`[photo: ...]` 相簿傳圖 | 影片素材與受控素材 ID、頭像／封面快照 |
| 平台 Cat image jobs、Runtime image contract 2 | 參考圖輸入、圖片轉換、短片生成；現有契約只有零輸入的 `image.generate` |
| 封面 localStorage | 背景服務可讀的持久化封面與一次性匯入 |
| `cats://companion/v1/...`、心跳、Telegram owner pin | HTTPS 分享頁及連結通知，發布完成後不重送原圖 |

## User journey and layout

1. 在 Cat 個人檔案的「創作素材」選一個來源資料夾，確認大頭照／封面可作為參考。
2. 選擇可用生成工具；可開啟「自主發文」及「發文後傳給我」，一次儲存。
3. 在頁面「請牠發一篇近況」輸入「去巴黎，拍一張你在鐵塔前的照片」。
4. Cat 建立媒體工作及待發表意圖；頁面顯示製作中。媒體完成才出現完整圖文卡。
5. 貼文下方「分享」建立網址；已開啟自動分享時 Host 接續執行。
6. 使用者在 DM／Telegram 收到連結，打開後可讀文章與照片，或播放影片。

```text
┌──────────────────── 封面 ──────────────────────────┐
│  頭像  貓咪名稱／簡介                 私訊  ⋯         │
├ 貼文 │ 照片 │ 影片 │ 音樂 │ 檔案 │ 動態 ─────────────┤
│ 創作素材／自主活動       │ 請牠發一篇近況…             │
│ 來源資料夾、頭像、封面   │ [請牠創作]                 │
│ 最近作品縮圖            ├───────────────────────────┤
│                         │ 頭像 貓咪名 · 時間 · AI創作 ⋯│
│                         │ 我今天到巴黎了！             │
│                         │ [鐵塔前的貓咪照片／影片]     │
│                         │ 分享  傳給我  查看作品       │
└─────────────────────────┴───────────────────────────┘
```

### FR-1 — 河道與互動

- 保留 `/entities/cats/:catId` 頁首及現有分頁順序，預設「貼文」。寬畫面雙欄，
  窄畫面把輔助區收起，貼文單欄可閱讀；分享頁在手機 390px 寬不橫向溢出。
- 每張卡有 Cat 頭像／名稱、相對時間（可查看完整時間）、內文、媒體、AI 標示、更多選單。
  長文可展開；內文作為文字處理。照片點開 viewer；影片有 poster、播放／暫停與音量，
  不自動有聲播放。1 張大圖、2 張並排、3–4 張拼排，其餘用 `+N` 開啟 viewer。
- 支援文字、純媒體、文字＋媒體；單篇最多 10 張圖片或 1 段影片，第一版不混排影片與圖片。
  body 上限沿用 4,000 字元，title 可省略、不強迫把貼文做成有標題的文件。
- 時間倒序以 `(publishedAt, id)` 穩定分頁，每頁 20 筆；製作中與失敗意圖只在 owner
  的製作狀態區顯示，不冒充已發表文章。刷新不得重置已讀位置或重複插入貼文。
- 「請牠創作」把指令送進該 Cat 的既有 DM；owner 仍可移除文章、分享、查看作品及重試。
  不加入沒有功能的按讚／留言按鈕；空狀態引導設定素材或請 Cat 發第一篇。
- 照片／影片分頁投影已發表文章的附件，以 asset ID 去重；最後一篇引用文章移除後，
  該媒體退出公開內容投影，仍留在 owner 私有作品庫。「查看作品」可下載新生成的原檔。

### FR-2 — 來源與個人圖片

- 來源目錄以既有 `life.photoFolder` 為唯一值，原作息卡與新素材卡讀寫同一欄位。
  原相簿傳圖行為維持；創作讀素材不受作息開關控制。PoC 一隻 Cat 一個目錄。
- 首次選擇及「重新整理素材」進行有上限的遞迴掃描；先回傳最多 200 筆及續頁游標，
  不做全磁碟索引、持續 watcher 或一次把所有檔案送給 provider。
- JPEG／PNG／WebP 圖片與 MP4／WebM 影片可列為素材；實際生成輸入受 profile 能力限制。
  不支援的格式標明原因；若需轉碼，由 host 建立新衍生檔並記錄來源。
- Agent 取得素材 ID、類型、尺寸／長度、縮圖與簡述；使用時由 host 驗證 realpath 仍在指定
  目錄內（含 symlink／junction），再保存此次使用的不可變內容快照。移除目錄阻止新讀取，
  不刪除已保存作品；原檔變動產生新的素材版本，既有貼文維持原內容。
- 頭像及封面顯示為特別素材 `avatar`／`cover`；呼叫時解析目前版本並凍結 asset ID。
  有實際圖片才提供，色塊／縮寫／預設漸層不算參考圖。設定圖像引用預設勾選，可關閉。
- 封面改由平台保存。首次開啟舊 profile 時驗證 localStorage 圖片、保存原值備份、上傳、
  readback 校驗後才記錄匯入完成；失敗保留舊圖與可重試入口。無 renderer 時回報尚未匯入，
  不假裝背景程序能讀 localStorage。相同 hash 的重試不建立第二個資產。
- 只複製本次需要的素材。未被選為附件的來源不會進入照片／影片分頁或外部分享。

### FR-3 — 媒體生成與 artifact

以下為新增目標能力，不能當成目前 Runtime 已提供的 operation 名稱；wire schema 在實作的
Runtime companion change 中版本化並測試，Platform 依 capabilities 選擇。

| 目標操作 | 輸入 | 輸出與最小驗收 |
| --- | --- | --- |
| 文字生圖 | prompt | 保留現有 `image.generate`；既有 Studio／Cat 呼叫不改語意 |
| 參考圖轉換 | prompt ＋ 1–4 張圖片（含 avatar／cover／資料夾圖） | 新 JPEG／PNG；巴黎例子至少帶真實 avatar，人工確認角色外觀 |
| 短片生成 | prompt ＋ profile 支援的 0–N 張圖片 | 真正新產生、可播放的 MP4；PoC 以 5 秒為目標，實際長度由 profile 宣告 |
| 來源影片再創作 | 來源影片＋指定時間點／區間＋prompt | 先明示擷取影格，再走參考圖生圖／短片；保存時間點與原影片 lineage |

- 原生影片編修非首波必要；影格路徑 UI 標示「從影片畫面再創作」，不承諾保留原動作、
  音訊或完整時序。不能把靜態圖 slideshow 假裝成完成 AI 影片生成。
- Platform 共用媒體服務管理工作與資產，Runtime 負責 provider profile、輸入傳送及產出收集。
  先選一個已實測的 reference-image profile 及一個 video profile，無須等所有 provider。
  Capability 必須包括輸入類型／數量／大小、輸出格式／長度、取消能力及 source-session handoff。
- Agent 提交後得到 job ID；同一 job 以原 Runtime receipt 查詢恢復，不因 timeout 另啟生成。
  未完成的 originating turn 先結束，再由現有 handoff 機制釋放執行資源。
- Artifact 保存 managed ID、MIME、bytes、hash、尺寸／duration、poster、input snapshot IDs、
  prompt、provider/profile/revision、Runtime job ID 與建立時間；公開 projection 不含磁碟路徑。
  提示詞及來源細節僅 owner Inspector 可看，分享頁只呈現已選擇內容與「AI 創作」。
- 單筆限制由 host 與 profile 取較小值；PoC host 上限：圖片 20 MiB、輸入影片 100 MiB／
  60 秒、輸出影片 100 MiB／15 秒。超限先拒絕並回報原因，不在生成後才發現無法保存。
- 輸出成功先保存真實檔案並驗證，再給貼文引用。圖片／影片生成失敗不發佈缺圖的成功貼文。
  完成的未發表作品可在 owner「最近作品」看到並重用，不自動成為對外可見媒體。

### FR-4 — Agent tools 與發表流程

工具透過 session 的既有 `cats-images` MCP server（PLAN-135 Phase 1 由 `cats` 改名，以免與 host 的 `cats` server 同名），角色工具在 Chat scope 可用，不依賴尚未完成的
Work proposal queue。Cat、owner、conversation 由 host 決定，模型不能指定別的 Cat 或收件者。
以下名稱為 PoC 對外工具介面，現有 domain executor 繼續共用。

| Tool | 核心 input | Result／行為 |
| --- | --- | --- |
| `media_list` | `cursor?`, `kind?` | 可用來源、avatar／cover 及自己已保存的作品 |
| `media_generate` | `requestKey`, `operation`, `prompt`, `inputRefs[]` | `jobId`, generation state；post 用途不自動傳送圖片 |
| `media_status` | `jobId` | 原 job 狀態、成功的 asset IDs、錯誤；不重生 |
| `post_create` | `requestKey`, `body?`, `title?`, `attachments[]`, `share?`, `notify?` | 穩定 `postId`、`publicationId`、state；可能等待媒體 |
| `post_list` / `post_get` | `cursor?` / `postId` | 自己的貼文與附件，含 pending 結果查詢 |
| `post_update` | `postId`, `expectedRevision`, `requestKey`, changed fields | 更新文字／已完成媒體；revision 衝突回傳明確結果 |
| `post_delete` | `postId`, `requestKey` | soft remove；也可取消 pending publication |
| `post_share` | `postId`, `action: create\|revoke` | 本地參照、可用外部 URL／未設定原因 |
| `post_notify` | `postId`, `destinations`（`dm`／`telegram` 陣列）, `requestKey` | 各目的地 delivery 狀態；只送至 owner |

- 附件輸入可引用已保存 asset、已列出的 source（由 host 匯入）、或生成 job 的 output slot；
  不接受任意 filesystem path 或任意外部 URL。發表時全部轉為有序 managed asset refs。
- `post_create` 可宣告等待附件；host 保存完整意圖。完成、校驗所有媒體後才原子發表，
  不需 agent 持續輪詢。接受意圖時即配置穩定 post ID，get/delete 可用它查詢／取消待發表
  內容；一般河道 list 只列已發表內容。文字與媒體皆空則拒絕。
- 現有 `companion.content.post.create` sidecar 接同一 service；同一 turn 不能再由新 MCP
  入口重複執行同一發表意圖。沒有所需工具的 provider 顯示 capability unavailable。
- 每項 mutation 的 key 以 trusted Cat＋operation＋requestKey 去重，保存 request hash；
  相同 key 不同內容回 conflict。同一心跳只准一個新 publication intent，重啟不重設。
- `post_update` 保持 `publishedAt` 與 id，增加 revision／updatedAt，分享頁顯示更新版本。
  通知預設不重發；已移除文章不能更新復活。使用者可直接刪除，agent 可刪自己的文章。
- 刪除先留下 tombstone，使河道、分享 HTML、媒體及後續通知立即失效；已完成的媒體保留
  在私有作品庫。若其他貼文仍引用同 asset，不能刪掉它。刪除待發表文章會取消／抑制其
  後續發表；晚到的生成結果可保存為私有作品，但不能把貼文復活。

示例（結構化呼叫，不是文字指令解析）：

```json
{"tool":"media_generate","input":{"requestKey":"paris-image-1","operation":"image.transform","prompt":"保留這隻貓的外觀，在巴黎鐵塔前旅行拍照","inputRefs":[{"kind":"avatar"}]}}
```

```json
{"tool":"post_create","input":{"requestKey":"paris-post-1","body":"我今天到巴黎了！","attachments":[{"jobId":"<returned-job-id>","outputIndex":0,"alt":"貓咪在巴黎鐵塔前的 AI 旅行照"}],"share":true,"notify":["dm","telegram"]}}
```

### FR-5 — 持久化與恢復

- Published post 沿用 derived record 與 `profileSurface=post`、`profilePostStatus`、
  `profilePublishedAt`、`profilePostMediaRefs`；加入 post schema/revision 與 typed attachment
  descriptors，投影回既有 post id。`sourceIds` 是素材 lineage，不代表自動附圖。
- Companion snapshot v2 增加 typed `mediaAssets`、`publicationIntents`、`shareGrants`、
  `notificationIntents` 及每 Cat media settings。媒體 job 狀態仍由共用媒體 ledger 持有，
  companion 只保存 job ID；不再複製 provider 工作狀態作第二個 authority。
- 新增資料也經由同一序列化 writer 與 atomic replace；post、完成的 intent、必要 outbox
  在同一 snapshot 寫入。跨 image ledger 的連結以穩定 job ID 與可重入 reconciliation 恢復。
  檔案先寫 temp、驗證、rename，再寫引用；重啟掃描孤立 temp／未引用檔時不動原始素材。
- Publication 狀態：`waiting_for_media → ready → published`，另有 `failed`／`cancelled`；
  share 狀態為 `off`／`active`／`revoked`；notification 分開為
  `pending`／`sending`／`sent`／`failed`／`uncertain`／`suppressed`。
- v1→v2 升級先識別、驗證完整轉換、備份、原子替換、readback；保留既有 source／post／
  memory／life、removed tombstone、ID 與舊參照。既有文字貼文讀為無附件，不能變成空河道。
  未知版本或失敗保留原檔並顯示 recovery；重跑及中斷必須可恢復。
- 舊媒體 metadata 若沒有可驗證的實體檔案，顯示「附件無法使用」，保留記錄，不把 path
  發佈到網路。升級不替舊貼文建立分享權限。保留現有 image API／SDK 契約與歷史工作。
- 此為內部 schema 的受測升級，不自動要求破壞性版本；若實作選擇移除已支援 API／config，
  下一次授權 release 必須跨 minor。這次不 bump、不發版。

### FR-6 — Companion 自主活動與一次設定

- 沿用 SPEC-124／137 的 life loop、awake/quiet 規則、owner busy gate、back-off 與模式。
  手動要求適用於一般 Cat；自動新創作只在有效 `companion` mode 且開啟自主發文時執行。
  `assist` 不因新增工具自行變成旅遊貼文產生器。
- 單次設定提供來源目錄、引用頭像／封面、自主發文、自動建立分享連結、發文後傳給我
  （DM／已綁定 Telegram）。
  既有設定保持；新開啟的 PoC 建議值為每 Cat 每日最多 2 次自主媒體工作／2 篇自主貼文、
  間隔至少 4 小時、同時 1 個媒體工作。圖片與影片共用該自動創作額度，不另生無限影片額度。
  這是有限預設，owner 可在同一設定調整；既有 image policy 的更嚴限制仍有效。
- 不新增每篇審批，也不為文字貼文開 Work task/proposal。明確的手動要求不受心跳時間與
  自主貼文次數限制，但仍遵守既有 manual generation policy、provider 能力及並行限制。
- 心跳可選 quiet、普通訊息或一個創作意圖；給模型最近貼文與未完成意圖摘要，避免重複。
  產生意圖即保留此次行為計數；自動純貼文也記一筆 hidden heartbeat activity，使它不能
  因為沒送 DM 而繞過 SPEC-137 最多五次未回應的停頓。一次 post＋DM＋Telegram 只算一次。
  quiet 不計入未回應；owner 回覆的判定沿用 SPEC-137。
- 晚到的已接受工作可跨 bedtime 完成，沿用 ADR-136；停用自主活動只停止新的心跳創作，
  不取消明確已接受工作。刪除該意圖、停用 Cat 或撤銷相關生成／發送設定則停止對應後續步驟。

### FR-7 — 分享頁與遠端連線

- 保留內部 `cats://companion/v1/{scopeId}/{catId}/post/{postId}`。
  對外另發不透明高熵 token（至少 192-bit randomness），token 只對一篇文章。
  Grant 保存驗證 hash；原 token 僅存於 owner-only 的本地 grant record，供同一 share-create
  重試及 origin 重組，不輸出到一般列表或日誌。撤銷後再分享建立新 grant，不復活舊 token。
  分享設定明示「持有連結可閱讀」；手動分享或已開啟自動分享均不逐篇再審批。
- 新增 `GET/HEAD /s/companion/{token}` 及
  `GET/HEAD /s/companion/{token}/media/{assetId}`（含該 asset 的縮圖／poster）。
  它們在 dedicated shared ingress 的明確 route matrix 中先完成 token 驗證，再渲染 HTML／
  輸出 bytes；不經完整 Desktop 登入頁，也不放行其他 `/api`、MCP 或素材目錄。
- 分享頁是簡潔、手機可讀、server-rendered 的單篇貼文：作者、時間、文字、AI 標籤與媒體。
  圖片 URL 與影片 poster 指向相同 grant；影片支援 byte-range／206、Content-Type、
  Content-Length。無 Desktop cookie 也能打開，不依賴 Electron bridge 或 `file://`。
- 提供 escaped Open Graph title／description／image 供服務嘗試預覽；不承諾 Telegram 一定
  產生預覽。頁面 noindex、no-store、no-referrer；輸出及日誌不含 source path、prompt、
  身分憑證或完整 token。撤銷／刪除後 HTML 與媒體均無法讀取，無效 token 回一般 unavailable。
- 使用 Settings → Remote access 的 origin／readiness：ngrok 先完成；Tailscale 可先透過
  existing tunnel 對到同一 ingress。Serve 顯示「限 Tailscale 網路」，Funnel／ngrok 顯示
  「持有連結可閱讀」。實際可達範圍不能只依網域猜測；existing tunnel 設定要保存
  `tailnet`／`internet` 選項，預設未驗證，經外部裝置檢查後才標示可達。
  這裡不實作第二套登入或 tunnel 管理。
- 無遠端連線仍可發文、用內部 DM 參照；分享回 `remote_access_unavailable` 及設定入口，
  不送 localhost 或 `cats://` 到 Telegram 冒充可外部開啟的網址。保存已建立的 share intent，
  同一已設定連線恢復後可接續；尚未設定時不無限重試。
- URL 以目前 origin 組合，origin 變動時更新待送連結；已送舊 domain 不保證可用。
  主機必須保持運行。刪除無法撤回收件者下載、第三方預覽快取與歷史文字快照。

### FR-8 — DM／Telegram 通知

- 發表成功才通知，使用短訊息＋canonical reference／HTTPS URL。同時要求兩者時各自保存
  delivery receipt；DM 成功不等於 Telegram 成功。Telegram 只用 SPEC-140 的 owner 私聊綁定，
  agent 無法任填 chat id。
- 既有 `image_generate` 的直接傳圖語意不改。新 post 用途的 `media_generate` 使用 asset-only
  destination；生成完不先發一張圖，稍後又由普通 heartbeat fanout 再送一次貼文。
  Post notification 只走一個 outbox sender，普通 fanout 排除已交給它的事件。
- 去重 key 至少包含 post id／revision／destination／notification intent；重啟復用原 job、
  post、grant。Telegram claim 在傳送前保存，網路結果未知標記 `uncertain`；不盲目重送。
  明確可重試錯誤依既有有限退避，owner 可重試「同一連結」，不觸發新的生成或貼文。
- 沒有綁定、連線離線、文章已刪或分享已撤銷時，保存具體狀態並停止相應發送；文章仍可在
  本地閱讀。真正發送時重新確認文章、grant、Cat 及 binding 仍有效。

## Acceptance criteria

| ID | 必須觀察到的結果 |
| --- | --- |
| A1 | Directory 真實圖文卡、照片 viewer、影片播放器、窄畫面可用；不含 production mock posts |
| A2 | Agent 建立、列出、更新、刪除自己的文章；owner remove 仍可用，重試不重複發文 |
| A3 | 資料夾圖／影片、avatar、cover 可作素材；實際生成 receipt 有輸入內容，原檔 hash 不變 |
| A4 | 巴黎例子有真正的參考圖生成檔、可辨認同一 Cat、文章「我今天到巴黎了」及 AI 標籤 |
| A5 | Companion 心跳可自行完成 A4，無 owner 逐篇批准；quiet、退避、busy、停用與限額有效 |
| A6 | ngrok 分享連結在另一裝置無 Cats session 可讀圖文；Tailscale 測試記錄 Serve／Funnel 與可達範圍 |
| A7 | DM／owner Telegram 收到同一篇連結；外部實際打開頁面，不能只以 sender API 200 當驗收 |
| A8 | Agent／owner 刪文或撤銷後，河道隱藏，分享 HTML／媒體拒絕；既有其他文章附件不受影響 |
| A9 | 斷線、生成完成前後 crash、發布完成未 ack、Telegram unknown、刪除與完成競態均不重生或復活 |
| A10 | 舊 snapshot／localStorage 封面升級、重啟、失敗恢復；既有文字貼文、舊 links、image jobs 可讀 |
| A11 | 真實短片生成並發表／分享／通知；來源影片影格再創作有 lineage，不僅是匯入舊影片 |

第一個照片 PoC 需 A1–A10 的照片範圍成立；整份 spec 完成還需 A11 與影片的 A1–A10。
正式 provider／外部裝置驗收若尚未執行，逐項記錄 pending，不能以 fixture 冒充 live 結果。

## Dependencies and follow-ups

- Runtime 參考圖輸入及 video profile 是實際新工作；尚未選定或驗證特定 provider。
  在 PLAN-136 P0 選定最小可行組合，不以新權限系統作 blocker。
- Studio/App SDK 的既有 schema 2 消費需回歸；此 PoC 不要求修改或發布 cats-apps。
- 後續才評估原生影片編修、混合媒體、反應／留言、永久託管與獨立作品分享網址。

*Last updated: 2026-11-11*
