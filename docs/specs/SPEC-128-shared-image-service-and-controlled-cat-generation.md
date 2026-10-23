# SPEC-128: Shared image service and controlled Cat generation

## Metadata

| Field | Value |
| --- | --- |
| Status | Approved for implementation — 2026-10-23; implementation in progress, acceptance pending |
| Owner | Platform integration; Apps owns Studio consumer acceptance; Runtime owns execution |
| Reviewer | Owner and subsequent independent implementation review |
| Decision | [ADR-136](../decisions/136-share-controlled-image-capabilities-between-cats-and-studio.md) |
| Plan | [PLAN-121](../plans/PLAN-121-shared-image-service-and-controlled-cat-generation.md) |

## Summary

讓 Studio 與 Cat 使用同一個 Platform 圖片服務。Studio 透過 App SDK，Cat 透過
受 session／actor scope 約束的 agent tool。Cat 的能力不依賴 Studio 是否安裝，
也不要求 Boss Cat。主動產圖以 owner 預先授予的有限政策執行；圖片保存後附到
原私訊並送往已授權的 Telegram binding。

本文件定義實作契約；已完成的範圍與實際驗證記錄於 PLAN-121，未完成驗收不得視為已交付。

## Delivery baseline and scope

2026-10-23 implementation rebaseline：owner 已核准實作與必要 releases，並澄清
共用對象為 Studio，Usage 不改。開始時 SDK 已是 1.7.0；Runtime SPEC-038 與
Studio 已提供 image contract 2，Runtime 的 Grok／Muse／Codex／Antigravity profiles
均已啟用，輸出包含 JPEG／PNG。保留新舊 App contract 與已交付能力，不降回 Grok-only。

2026-10-24 source extension adds Cursor to Runtime image projection and SDK contract 2 provider
types. The shared Cat ledger uses the same provider set so a valid new profile cannot be offered
then rejected during reservation or receipt reload. Existing grants, App/account scoping and
schema 1 projection remain unchanged. Cursor's pinned generation profile is GLM 5.3 / max,
native 1:1 requested; its image backend is not identified by the agent model.
The isolated Studio package/host check now accepts `--expect-cursor` to verify five services in
Codex / Antigravity / Grok / Muse / Cursor order, centered/default Grok, Cursor JPEG retention
and reopening without generation. This is fixture coverage, not paid runner acceptance or an
installed Desktop update. Runtime owns that runner and its enablement evidence: one separately
authorized extra image passed the corrected native Windows runner, retaining an original
1024-square JPEG (90,500 bytes). The Cursor profile is enabled. This host exposes it through
SDK 1.9 without changing existing App scopes or the image request schema.
實際發布仍須通過對應 release SOP 與所有完成條件。

| 項目 | 已存在 | 本計畫 |
| --- | --- | --- |
| Studio／SDK | App/account/version/digest-scoped contract 1／2 生圖、作品讀取／匯出 | 共用執行層；SDK 1.8 新增 `media.images`，保留既有 namespace／scope |
| Cat 陪伴 | 作息、文字心跳、相簿圖片附到 Telegram | 加受控生圖與圖片資產附件 |
| Runtime | SPEC-038 contract 2 四個已啟用 profiles、JPEG／PNG、無自動 regeneration | 加原 source turn 的完成證據與必要 idle handoff；保留執行界線 |
| 修圖／合成 | Apps SPEC-006 的 successor 規劃及研究證據 | 保留 extension seam；本階段只使用已交付 generation |
| 送達 | Chat event fanout 與 Telegram 回執 | 為產圖結果增加 durable intent、回執判斷及恢復 |

### Goals

- owner 授權一隻普通陪伴貓後，牠可在清醒時段自己產生圖片並傳到同一段 Telegram 私訊。
- Studio 與 Cat 使用同一套 admission、工作狀態、結果驗證及原檔保存。
- 併發、重啟、重送及 Telegram 故障不造成未授權或重複生圖。
- 可分辨「未授權」「沒有可用圖片服務」「產圖中」「已產圖但未送達」。

### Non-goals

- 本階段不新增修圖、合成、新 provider 或任意 CLI／圖片 URL／檔案路徑；保留現有 PNG 與 profiles。
- 不建立通用 App 執行框架，不讓 Cat 操作 Studio iframe，也不把所有 App 邏輯搬到 Platform。
- 不預設共用 Studio 與 Cat 的作品清單；跨 caller 分享另有明確授權。
- 不新增 OS 喚醒或雲端常駐；Cats／主機不運作時不承諾即時生成或傳送。
- 不改 companion heartbeat 預設間隔，也不把每次文字心跳變成生圖。
- 不變更 Usage。版本／發布依本次 owner 授權與 release SOP；驗證使用隔離 profile，
  不將 demo 資料寫入使用者 dev state。

## Owner-visible golden path

1. owner 選一隻 active companion Cat，建立其私訊及 Telegram 對應。
2. owner 為該 Cat 開啟主動生圖，選可用圖片 target，設定有限的每日次數、最短間隔、
   生效時段／時區、到期時間，以及可送達的對話與 binding。
3. 清醒時段的心跳讓 Cat 選擇安靜、說話、使用既有相簿，或請求生圖。
4. Platform 重新檢查授權與可用性，原子預留次數並保存工作，再提交一次 Runtime。
5. Cat 回合可先結束；不持有 session gate 或 channel mutation gate 等待圖片完成。
6. 圖片經驗證與保存後，以該 Cat 的圖片訊息出現在原私訊，並有同一筆 durable
   delivery intent。文字圖說可使用提交時已保存的 Cat 文案，不強制再跑一個模型回合。
7. Telegram 收到圖片與圖說。owner 回覆繼續同一對話；失敗與未知送達狀態可被檢視。

早上喚醒、文字心跳及 owner 睡覺意圖仍由 SPEC-124 管理。產圖／送達各自必須符合
當下適用政策；進入休息、owner 讓 Cat 睡覺或 binding 失效後，晚到結果可保存，
但不得不經政策檢查直接傳出。

## Architecture and ownership

```text
Studio -> existing App SDK -> App identity adapter ----+
                                                      |
Cat session / heartbeat -> scoped agent tool adapter --+-> Platform image service
                                                           | admission + budgets
                                                           | durable jobs + assets
                                                           v
                                                     Runtime image HTTP API
                                                           |
                                              verified result / same receipt
                                                           v
Platform asset -> conversation attachment + delivery intent -> Telegram
```

共同服務只依賴受信 caller context、圖片工作／資產 store、Runtime client 與政策介面。
它不 import Studio、Chat renderer 或 Telegram 的實作。Chat adapter 管理 Cat 訊息，
transport adapter 管理 Telegram。Platform host 只做 composition；product-local routes
不向外暴露共用 Runtime 憑證。

Apps 自己的模板、編輯歷史及作品管理邏輯仍歸 Apps。共同 image job 的來源與共享
權限由 Platform 管理。Core task/run/artifact 可沿用，但不把每個心跳變成 Work
Mission／Work Item，也不新增第二份工作真相。

## Functional requirements

| ID | Requirement |
| --- | --- |
| FR-01 Shared execution | App 與 Cat adapter 使用同一工作服務、Runtime client 及資產驗證，不複製 runner 或 provider catalog |
| FR-02 App admission | 保留既有 App 啟用狀態、exact version、package digest、account、`ui.route`／`media.images` 與 CSRF／bridge 檢查；同帳號的其他 App 不能繼承權限 |
| FR-03 Cat identity | caller Cat/account/conversation/session 由 host-issued context 建立；模型不能傳 App scope、owner ID、原始路徑或 Runtime credentials 取得能力 |
| FR-04 Role separation | Boss/admin、companion role、Studio 安裝皆不自動賦予生圖權；授權可授予普通 Cat，主動觸發另要求 active companion 與有效私訊 |
| FR-05 Capability | 只提供 Runtime 已啟用操作與 target，再與 caller 政策交集；查詢不 probe CLI、不產圖。提交重新檢查；不得偷偷換 provider、模型、effort 或 operation |
| FR-06 Policy | 主動生圖預設關閉；owner 授予有限政策。明確請求生圖與主動生圖為不同 trigger mode；授權一者不暗含另一者或傳送權 |
| FR-07 Durable budget | admission 原子執行 request dedupe、政策 revision 檢查、每日／總次數及間隔預留、建立 job 與固定 Runtime ID；跨 caller 併發不能超額 |
| FR-08 Idempotency | 同 caller/request ID + 相同 canonical payload 回傳原 job；不同 payload conflict。payload 包含 operation、target、prompt 及授權的輸出脈絡 |
| FR-09 Execution | 第一階段只投遞 Runtime 現有 `{id, instance, prompt}`；呼叫者不能傳 shell args、執行 cwd、檔案 destination 或擴大原生工具清單 |
| FR-10 Async tools | Cat 實際收到可呼叫的 session-scoped tool descriptor／executor；只有 prompt、工具登錄或工具名字不算交付。submit 回 job reference，不等待被同一 Cat 回合占用的資源 |
| FR-11 Recovery | 不明 POST、重啟及 refresh 只 GET／collect／cancel 同一 Runtime ID；不重送新生成。未確認是否已呼叫 provider 時預留不自動退還 |
| FR-12 Cancellation | Cat/policy 撤銷、owner 取消與 App 停用只影響各自的工作。取消必須等待原執行停止；晚到成功不越過撤銷或取消意圖 |
| FR-13 Verified asset | 從 matching receipt 取得原檔，驗證 MIME、大小、尺寸及 hash，原子保存後才標 succeeded；以 asset ID 引用，無任意 filesystem read |
| FR-14 Access | read/list/cancel/reference 驗證 owner、initiator scope 或明確 sharing grant；猜 job/asset ID 不取得資料。Studio 不自動取得 Cat 全部作品 |
| FR-15 Attachment | 圖片以同一 Cat 身分附到既有私訊。資料含來源 job、asset、Cat/account、conversation、trigger、policy revision，避免被當成其他 owner turn 的回覆 |
| FR-16 Delivery admission | 圖片成功不等於允許送出；建立與執行傳送時重查 Cat/policy、對話、owner、binding identity／revision 及傳送時段，不跟著預設 bot 漂移 |
| FR-17 Durable delivery | message 與 delivery intent 以可恢復交易或同一冪等 command 建立；eventHub 丟失／程序重啟仍可處理。重複 completion 不增加圖片訊息或 logical intent |
| FR-18 Truthful receipt | 依 Telegram 回執實際 status 判定成功。確定未送達且可重試的失敗使用同 asset 退避；不明結果保留 uncertain，須明確 owner retry，不能宣稱 exactly-once |
| FR-19 Lifecycle | 卸載 Studio 撤銷 Studio scope，不撤銷 Cat grant／刪掉 Cat 資產。關閉 Cat 不影響 Studio；有 pending delivery 的 asset 不被 retention 提前移除 |
| FR-20 Observability | owner 可檢視 readiness、政策剩餘次數、最近 generation／delivery 結果與安全錯誤；未知費用／結果保留未知。Settings 寫入回饋遵循 Toast 規則 |

## Policy and record semantics

以下為 internal shape；Cat 身分／政策／binding 與 SDK／Runtime payload 分開。
公開 SDK 不接受 Cat 身分、source session hint、路徑或傳送目的地。

### Implemented boundaries

- SDK 1.8 的 `media.images` 與既有 `images` adapter 使用同一個 executor；新 namespace
  只對 manifest floor 至少 1.8 的 App 提供。Studio 使用 host 注入的 SDK，archive encoder
  的公開 exact Platform 0.6.0 pin 與此獨立；SDK 1.8 也隨本次 Platform npm 發布公開 types。
- 新 Cat store 為獨立 SQLite schema 1，使用 FULL synchronous／WAL／immediate
  transactions，原子保留 request identity、政策 revision、次數與單筆 active 工作。
  不搬動既有 App Core metadata／原檔，不清空未知或損壞 DB。SQLite lazy load：未具備
  `node:sqlite` 的舊 Node host 仍保留 App 功能，Cat 入口明確回報 storage unavailable。
- Cat 工具為 loopback-only `/api/internal/cat-image-tools/mcp` 的 host `cats` server；
  使用正式 session MCP descriptor。`image_generate(prompt,caption)` 的 request ID 由
  host supervised action 派生；`image_status(jobId)` 只讀原工作。bearer 不授權 owner API，
  每回合結束即失去 call 權限。公開 ingress 即使轉送自 loopback 仍拒絕此 route。
- owner/admin 路由為 `/api/cats/:catId/image-policy` 與同 Cat 下的 image／cancel／retry。
  actor、account、conversation、原 binding 及 revision 均由 host 解析；未知欄位拒絕。
  部分政策更新保留原 binding，disabled／失效帳號或移除管理角色即失去後續執行／外送權。
- 工作先 durable held，成功 turn receipt 才釋放；lost ack 只經 host active-turn gate
  與 Runtime 明確 `turnInFlight=false` 或 definite session 404 恢復。Runtime只交接自己的
  idle source，等待所有 owned helpers 停止；不搶別隻 Cat 的 worker，不調高 pool cap。
- Cat 圖片附件只含受管 ref、hash、MIME 與尺寸；owner image route 每次驗證 account／
  owner／Cat scope。圖片顯示於原對話，普通 transport fanout 不再代送此 durable intent。
- delivery 在 side effect 前取得持久 attempt claim。append 前後、外送前及 Telegram
  完成讀檔後都重查 claim；最後 network 邊界重查完整 owner／Cat／睡眠／conversation／
  binding revision。過期 sending 為 uncertain，需明確重送；只有 explicit API 429
  自動有限重試。正常關機只 drain 已開始工作，不抑制仍待送的圖片。
- reset 透過持久 maintenance fence，拒絕 active／未確認 generation 及 sending／uncertain
  delivery；owner 可明確停止 uncertain 的後續外送，留下 `abandonedAt` 並清除舊 claim，
  先前結果仍為 uncertain，之後才可 reset。跨程序新 admission／dispatch／delivery
  在清理期間被拒絕。

| Record | 必要內容 |
| --- | --- |
| Trusted caller | `kind: app | cat`、account／actor、受信 App installation 或 Cat/session、最小 tool grant |
| Cat image policy | policy ID/revision、Cat/account、manual/proactive modes、operation／target、正整數 daily/total limits、min interval、allowed windows、IANA timezone、expiry、enabled/revoked、允許的 conversation/binding |
| Image intent/job | stable ID/request ID、initiator、trigger source、canonical request/hash、policy snapshot／reservation、Runtime ID、generation state、取消意圖、safe error、output asset |
| Asset | stable ID、owner／origin scope、verified MIME/bytes/dimensions/hash、managed location、sharing grants／references；公開投影不含 path |
| Delivery intent | stable key（job/asset/conversation/binding）、immutable payload reference、binding revision、pending/sending/sent/failed/uncertain/suppressed、attempts、Telegram message IDs、safe reason |

政策預設沒有任何主動生圖額度；啟用必須選定有限值，未設定不以無限取代。
每日額度以政策 IANA timezone 的日期分桶；間隔以持久 UTC timestamps 計算。
變更 timezone／政策 revision 不重置當日／總用量，也不解除既有預留。
第一階段每 Cat 最多一筆 active image job；Studio 保留既有每 App/account 的 active
及 retention 限制，整體仍服從 Runtime 的全域單圖與 pool/singleton admission。

預留跨午夜仍歸原 admission bucket；只有可信證據證明未執行 provider 時才可原子釋放，
且 release 本身冪等。未知結果仍占次數，不能靠重啟、取消或改 policy 反覆生圖。
次數限制不保證金額；實際成本只呈現 Runtime 回報的資料。

既有 App 方法沿用：getCapabilities/list/submit/cancel/refresh/read/export。Cat 模型工具只
暴露 generate 與 status；owner 可取消。下載及送圖由 host 處理。
兩個 adapter 不共用可由呼叫端偽造的 scope。任何額外 agent transport 使用現有受控
session MCP／工具邊界，不從 public ingress 直接暴露內部工具。

## Result, delivery and failure behavior

Generation state 與 delivery state 分離。圖片保存成功但 Telegram 失敗時，工作仍為
succeeded，delivery 為 failed 或 uncertain；後續 retry 不再呼叫 provider。

- 沒有 profile／授權／容量或超額：不執行 provider，留下可理解的原因。Cat 可維持文字
  或安靜；不得把降級內容當已生成圖片，也不自動換 target。
- 心跳提案或模型輸出不是 authorization。生成與傳送必須各通過 host 檢查。
- Runtime／Platform 中斷：用相同 ID 查詢。確定找不到也不擅自開另一個 attempt；
  原本可能延遲抵達的 POST 必須被視為尚有歧義。
- 保存失敗：保留原 receipt 可重新收集；不得「修復」成再生一張。
- completion、訊息與 intent 以 stable keys 防重；pending/sending 重啟時，已開始但
  未確認的 Telegram 發送標 uncertain，不直接回 pending。
- Telegram 確定失敗的 retry 遵守 bounded attempts／retry-after；每次重查送出權限。
  失效 binding、owner sleep 或政策撤銷時暫停／抑制送達，不改選別的收件人。
- pending/uncertain 的資產必須仍可讀。刪除需先解除待送引用或明確取消，不能留下
  會在恢復時讀不到檔案的 intent。

## Runtime evaluation

Runtime 已確認需最小資源交接擴充，仍使用既有 image routes 與 schema 2。
見 [Runtime SPEC-038](../../../cats-runtime/docs/specs/SPEC-038-image-generation-contract-2.md)
與 [PLAN-048](../../../cats-runtime/docs/plans/PLAN-048-image-generation-contract-2.md)。

| 檢查 | Gate |
| --- | --- |
| 現有 contract 2 request／receipt／MIME／取消／restart | 可透過兩種 adapter 共用；只新增 host-only `sourceSessionId`，不增加 Cat／App policy 欄位 |
| Cat chat 與圖片 target 不同／相同 provider instance | 不同步等待自己持有的 worker／singleton；unsupported 組合清楚不可用，不宣稱所有 Cat/provider 配對都可執行 |
| 工具及 heartbeat/session gate | submit／completion 無重入 deadlock；owner 訊息可繼續，shutdown 可 bounded 停止 |
| Pool 滿／singleton busy | 原 Runtime 錯誤可正確映射；不搶占任意聊天、不自動調高上限、不放寬執行規則 |
| 需要 runtime resource handoff 的組合 | 等 source 的實際 turn／完整 process lifetime 證據；回歸涵蓋 persistent source、helper、abort 與舊 handle |
| 修圖／新 provider／新 options | 依 Apps PLAN-006 協調，不列入本階段成功條件 |

Runtime 不處理 owner 發訊意圖、App registry、Cat 預算、資產分享或 Telegram。
不為了避免 Studio 安裝依賴，就讓 Cat 持有 Runtime 通用憑證。

## Upgrade and compatibility

- 新服務在既有 SDK 下接住 Studio 的相同 payload／response、隔離及歷史 IDs。
  不以 SDK major 或新 App 發布作為純內部抽取的必要前提。
- 新 caller／policy／asset／delivery 紀錄必須有版本化格式。既有 Studio jobs 映射為
  App initiator，保留 App/account/version、request ID、Runtime ID、Core IDs 與圖片 hash；
  不補出 Cat owner、共享權或自動生圖額度。
- 既有 App schema 1／2 圖片不做大量改寫。新增可選 private `cancelRequestedAt`，
  老 cancelling receipt 以原 updatedAt 推得取消意圖，僅在既有 Core mutation 路徑持久化；
  該路徑沿用 snapshot backup／atomic replace。舊 interrupted receipt 不假造取消證據。
  新 Cat store 與舊 App records 無資料搬移，SQLite 回滾／WAL 保留未完成的原子更新。
- 先驗證全部來源、建立可驗證備份、stage 新 metadata／原檔引用並驗證，再 atomic
  activate；失敗保留原始資料並提供 recovery。跨 store 中斷須可重入，未知格式拒絕
  開啟，不能清空重建或把舊 job 重新執行。
- App 移除／停用仍對 App scope 生效；不為共用服務取消現有撤銷語意。
- 若 persisted-data／外部契約確有 breaking boundary，依 0.x minor／SDK major 政策
  記錄所需邊界與最低相容組合；發布仍須符合本次明確授權與 release SOP。

## Acceptance criteria

| ID | Required evidence |
| --- | --- |
| AC-01 | Studio 未安裝，普通 active companion + 有限 grant 經實際工具 delivery 可產圖；Boss 無 grant 被拒，0 provider calls |
| AC-02 | 同一共用服務下，既有 Studio package 的提交／取消／重開／離線原圖匯出保持 byte-identical |
| AC-03 | 跨 App/account/Cat、假造 caller／session／job ID 或借 Studio scope 全被拒；無 raw path 或 credentials 洩漏 |
| AC-04 | 併發 heartbeat／owner 請求、重複 request、跨程序重啟、跨午夜／改時區都不超次數，預留釋放冪等 |
| AC-05 | 相同 ID 改 prompt/target/operation 衝突；丟失 POST response、GET 暫時 404、refresh/reopen 不增加 native invocation |
| AC-06 | 不同及相同 provider instance、busy/full pool、session gate、shutdown 無 deadlock；列出通過與尚不可用的配對 |
| AC-07 | 撤銷、Cat 停用、Studio 停用各只影響本 scope；取消先於晚到結果，其他 caller 工作不被取消 |
| AC-08 | 一筆成功生圖對應一張原檔、一個 logical Cat 圖片訊息、一個 delivery intent；丟失 event／重複 completion／restart 不複製它們 |
| AC-09 | Telegram `failed` 回執不標 delivered；確定失敗 bounded retry 使用同 asset；ambiguous send 保持 uncertain，0 次重新生圖 |
| AC-10 | binding rotation／owner sleep／政策撤銷／對話刪除／owner identity 改變後晚到結果不誤送；回覆仍落同一個 Cat 私訊 |
| AC-11 | Studio 卸載後 Cat 可依原 grant 產圖，Studio 看不到 Cat 私有圖；明確分享後只開放被分享的資產 |
| AC-12 | 舊 Studio 原圖及全部 IDs/hash、失敗／中斷狀態保存；malformed、ENOSPC、斷電、再次啟動與不支援降版均有 upgrade fixtures |
| AC-13 | Desktop 可辨識未授權／未設定／忙碌／產圖中／已產圖未送達；Settings 變更錯誤用 Toast；未生成不冒稱有圖 |
| AC-14 | pending/uncertain delivery 的資產不被 retention 移除；明確取消／清理後引用一致，不擴大任意檔案讀取 |
| AC-15 | isolated host＋built Studio＋fixture Runtime＋fake Telegram 完整閉環；另一個測試以真 session tool delivery 驗證 Cat 可實際呼叫 |
| AC-16 | 真 provider／Telegram／installed Desktop 驗收需記錄版本、支持配對與 owner 核准的生成次數；未執行就標 pending，不能用研究圖或 fixture 代替 |

## Open engineering gates

- [ ] P0 凍結 Cat 工具的實際 schema／session MCP 授權、policy defaults UI 與管理入口。
- [ ] P0 凍結 reservation/job/asset/delivery 的交易及跨程序鎖邊界。
- [ ] P0 用隔離 fixtures 判定哪些 caller／image target 配對可沿用 Runtime。
- [ ] P0 凍結 durable 格式、升級／恢復邊界，以及既有 Studio package 契約矩陣。
- [ ] 獨立 implementation review 與各 OS／真實 provider 驗收安排。

這些是實作前的 contract gates；不影響本次完成可審閱文件，也不暗含實作核准。

## References

- [ADR-136](../decisions/136-share-controlled-image-capabilities-between-cats-and-studio.md)
- [SPEC-119](SPEC-119-app-image-generation.md)、[SPEC-124](SPEC-124-alive-companion-life-loop.md)
- [Apps SPEC-006](../../../cats-apps/docs/specs/SPEC-006-studio-image-workspace.md)
- [Apps PLAN-006](../../../cats-apps/docs/plans/PLAN-006-studio-image-workspace.md)

*Created: 2026-10-23. Documentation only; all new implementation acceptance pending.*
