# PLAN-121: Shared image service and controlled Cat generation

## Metadata

| Field | Value |
| --- | --- |
| Status | In progress — owner authorized implementation and necessary releases; acceptance pending |
| Owner | Platform integration; Apps Studio and Runtime execution owners consulted at contract gates |
| Reviewer | Owner; independent execution, authorization, delivery and Studio namespace review completed; live acceptance pending |
| Spec | [SPEC-128](../specs/SPEC-128-shared-image-service-and-controlled-cat-generation.md) |
| Decision | [ADR-136](../decisions/136-share-controlled-image-capabilities-between-cats-and-studio.md) |

## Overview

### Implementation checkpoint — 2026-10-23

- owner 已授權完整實作、必要版本與 releases，Desktop 使用 standard preview；
  後續明確澄清這次共用對象是 Studio，Usage 不改。
- 起始 source：Platform `7e94d6b1`（SDK 1.7.0），Runtime `3aabcb5b`，
  Apps `1d352fe`。image contract 2／已啟用 profiles／PNG 已交付，下面原始
  schema 1 first-slice 描述需依這個新基線執行，不倒退或移除現有 Studio 功能。
- 本次 worktree：`cats-platform/.claude/worktrees/shared-media-golden-path`，
  branch `feat/shared-media-golden-path`。main 留在原 checkout。
- 已接共用 `ImageExecutionService`、保留原 App ID／Core records／asset location 的
  App adapter、SDK 1.8 的 `media.images` namespace，以及獨立 SQLite Cat 政策、
  預留、請求身分與傳送 intent。SDK 1.7／舊 image namespace 仍按已安裝 App 的 floor
  協商；不借用 Studio scope。Usage 未改。
- Cat 工具以 Runtime 原生 session MCP descriptor 的 host `cats` server 交付：
  session bearer 固定、每回合 scope 短暫生效；`image_generate` 每個 supervised action
  只產生一個 request ID，`image_status` 只讀原 job／真實傳送狀態。工具回應先保存 held
  工作；成功回合回執才釋放，未知回合結果需 host gate＋Runtime `turnInFlight=false`
  或 definite 404 證據。原 session／pool／singleton 交接需 Runtime 最小擴充。
- Telegram 使用獨立持久 claim；產圖／message append／delivery 可重入。生成圖片透過
  受管附件 ref 顯示在原對話，普通 fanout 跳過該 intent。明確 API 429 才自動有限退避；
  未知回應或過期 sending claim 為 uncertain，owner 明確重送仍使用原圖。傳送邊界在
  檔案讀取後再檢查完整 owner／Cat／睡眠／原 conversation／原 binding revision，
  claim 遺失的舊 dispatcher 不得外送。跨程序 reset fence 保護進行中／未知外送。
- owner/admin 管理入口、預設關閉的設定卡、取消及 uncertain 重送確認已寫入；
  Settings 回饋用 Toast。尚待完整 renderer fixture、手動 UI 與 isolated Desktop 驗證。
- 已有 server／renderer TypeScript、Web production bundle 與隔離單元、MCP、Chat／
  Telegram regression 證據。較廣的 239 項 affected run 曾有 2 項舊作息 fixture 因漏設
  runtimeDataDir 而嘗試預設目錄、被 sandbox 拒絕；改到 fixture 暫存目錄後作息 20/20
  通過。後續 44 項 source-turn／claim／owner／async read 授權 regression 全過；
  新 UI 與附件原 5 項通過，加入停止傳送後該 UI suite 4/4 通過（其他 2 項沿用原證據）。
  舊 App 可選取消意圖欄位的 schema 1 read-shape 回歸已修正，最後 App suite 15/15 通過。
  不把 mock provider／bot 測試當作 live acceptance。尚無新版本發布。
- independent review 列出的五個 P1 已在 source 與對應 regression 關閉；另補 owner
  明確停止 unknown delivery，保留未知事實並解除失效 binding 導致的 reset dead end。
  candidate command suite 5/5 通過；Runtime profiles 原在 `src/catalogs/`，沿用既有 src
  snapshot，不擴大 source allowlist。
- Studio 0.4.0 已切到 SDK 1.8 `media.images`；Apps 41 項及後續 preview/package 2 項通過，
  required build/docs 通過。真 built archive＋production host SDK/routes＋隔離 Runtime fixtures
  驗證 contract 2 JPEG/PNG、取消／刪除、重開／離線、原始 bytes、窄版與隔離通過，CLI calls 0。
  Independent review 的 preview fixture namespace 問題已修正並確認關閉。Usage bytes 不變。
- 獨立 Desktop source candidate 已啟動，Platform/Runtime readiness 通過；完成首次設定並建立
  普通（非主控）Cat，未碰安裝版或預設 profile。最後 renderer types 與 UI suite 4/4 通過。
- 下一步：完成普通 Cat 設定與對話 UI、真 provider／Telegram golden path，以及完整 hosted
  CI 與必要版本發布。預設 profile 無 Telegram 綁定；已請 owner 指定驗收 bot/profile，尚待回覆。
- 完整 hosted CI 首輪 5856 項中 5794 通過、60 skipped、2 失敗：共用 transcript helper
  的 Chat import 改到 browser-safe `src/shared`，依賴圖回歸通過；file-backed Telegram
  fixture 補自己的 platformDir，restart 回歸通過。未把這一輪稱為全綠，後續 CI 仍是 gate。
- 真 native 首輪建立 Codex source session 後，在 MCP descriptor recycle 階段碰到舊
  worker 尚未完全停止即 spawn 的 Runtime 缺陷；沒有 image admission／生成。Runtime
  0.6.1 patch 加入有界完整停止等待與新 run／取消／刪除 fence，MCP/handoff 22/22 通過；
  第二候選版及 native rerun 進行中，Desktop 發布須改 pin 通過驗收的 patch source。

下方階段清單仍用於逐項驗收；實作授權與當前基線以上述 checkpoint 為準。

先讓 Platform 圖片服務同時服務 Studio 與受限 Cat，再完成陪伴心跳產圖到 Telegram
的持久閉環。保留已交付的四個 provider、profile／PNG／JPEG 與新舊 App SDK 契約；
不重新限制為 Grok-only。修圖／合成與跨 caller 私有作品分享仍是後續獨立範圍。

## Work ownership and scope

| Member | 本階段工作 | 邊界 |
| --- | --- | --- |
| Platform | 共用服務、App/Cat adapters、政策／預算、資產、工具 delivery、對話及 Telegram intent | 不執行 native CLI、不把 Chat 實作 import 到 platform/core |
| Apps | Studio 使用 `media.images` SDK 與必要 floor／artifact 更新 | 沒有 Studio 生圖 server；Usage 不改；browser SDK 1.8 由 host 注入，archive encoder 的公開 exact 0.6.0 pin 不變 |
| Runtime | 原 source session 的 turn proof／idle handoff、HTTP receipt 與 pool／singleton admission | 不新增 App/Cat policy；保留現有 profile 及輸出能力 |
| Later Studio track | 修圖／合成、跨 caller 作品分享 | 不併入本次成功條件 |

## P0 — Freeze admission, caller and recovery contracts

- [ ] 對照既有 App image routes/service、Companion heartbeat、session tool delivery、
      transport fanout 與 Runtime SPEC-033，建立 baseline fixtures。
- [ ] 凍結 caller context、Cat policy、canonical request、scope、job/asset/delivery
      schema 與安全錯誤；標清 internal types、public SDK 及 Runtime payload 的界線。
- [ ] 凍結 policy UI 與 owner 管理入口、有限每日／總次數、間隔、時段／時區、
      到期與 output binding；主動生圖預設關閉，文字心跳不隱含授權。
- [ ] 凍結 durable reservation、扣回／釋放證據、跨程序鎖、request dedupe、取消與
      message/intent 的交易／可重入邊界；含跨午夜及改 timezone/revision。
- [ ] 驗證 Cat/chat 與 image target 的不同／相同 instance、singleton、worker pool
      及 gate；選定可支持的第一組 tuple，列出未支持組合及原因。
- [ ] 必要時建立最小 Runtime successor，記錄具體 contract／resource 缺口及 owner；
      不以提高 max sessions 或 prompt 約定代替 execution/resource correctness。
- [ ] 凍結資料 upgrade 與相容矩陣；保留現有 Studio 公開行為及 scope。
- [ ] 在 owner 審閱規格後才進入實作；若需要改 frozen shared contracts，完成 integration review。

**Exit**：有可實作型別／交易設計、Runtime 相容性判定與明確測試矩陣，沒有
「Cat 自然就能呼叫 SDK／工具」或「Runtime 一定不用改」的假設。

## P1 — Extract shared service and preserve Studio

- [ ] 把工作 admission、冪等、Runtime dispatch/read/cancel、圖片驗證及持久保存
      抽成 caller-aware service；保留一份共用執行邏輯。
- [ ] 現有 App image service/routes 成為 App adapter，保留 App/account/version/digest、
      bridge／CSRF 與 revoke 的驗證，映射相同 SDK payload/response。
- [ ] 實作版本化 jobs/assets／policy/delivery 儲存及舊 Studio 升級：
      全面 validate、可驗證 backup、atomic activation、中斷及磁碟滿 recovery。
- [ ] 原 IDs/hash、Runtime receipt linkage 與失敗狀態不變，不重新生成、不預授 Cat
      或跨 App sharing；資料未識別時保留並拒絕讀寫。
- [ ] 用真 built Studio archive＋host SDK＋fixture Runtime 驗證既有產圖、取消、
      重開、離線原圖匯出及 byte identity。

**Exit**：Studio 仍正常，既有 SDK 不改，shared service 已存在但沒有自動開 Cat 額度。

## P2 — Deliver controlled image tools to Cats

- [ ] 使用既有受控 agent tool/session descriptor 機制提供 capability、submit、
      status、cancel；session grant 綁 account/Cat/conversation／有效期。
- [ ] 提供 owner 的設定與安全 readiness；Boss、Studio 安裝和 prompt 不能授權。
- [ ] admission 原子保存 budget reservation、job/request ID 與固定 Runtime ID；
      政策更新、併發、程序重啟或取消不能重置用量。
- [ ] submit 回 durable job reference；Runtime dispatch 不在 channel mutation gate
      或 Cat session gate 裡同步等待圖片完成，也不阻塞其他 Cat 的 life tick。
- [ ] 測試無 Studio、有／無 grant、普通 Cat／Boss、偽 scope、猜 ID、revoked session、
      多程序併發，以及 Runtime same-instance/busy/full/unknown。

**Exit**：Cat 確實能呼叫受控工具並取得唯一 job；不能只以工具註冊測試宣稱完成。

## P3 — Complete companion generation and conversation attachment

- [ ] 將心跳決策接到相同工具，不直接使用聊天原生 image tool。
- [ ] 只對 active companion／有效私訊與生效政策開放 proactive mode；既有
      quiet、文字與相簿路徑不隱性產圖，model fallback 不能擴張授權。
- [ ] 保存 Cat 提交時的圖說／輸出 intent，completion 不必再跑一個 provider 回合。
- [ ] 以 asset ID 附到原對話；重複 completion／restart 只建立同一張圖片訊息。
      避免把背景 completion 當作 owner 正在進行回合的 assistant reply。
- [ ] 圖片完成時重查取消、Cat 狀態、政策與送出時段；失效時保存圖並抑制外送。
- [ ] 圖片附件直接讀受管資產，不繞道匯出至相簿，也不接受任意路徑。

**Exit**：來源與工作可追溯，owner 回訊息留在同一 Cat lane，背景工作不阻塞 owner。

## P4 — Persist and recover Telegram delivery

- [ ] message 與 durable intent 在同一交易或可恢復冪等 command 完成，依穩定
      job/asset/conversation/binding key 防重；不只靠 eventHub 及程序內 map。
- [ ] 保存 exact target binding identity/revision 與 owner；發送前再驗證，rotation、
      失效、對話刪除、owner sleep 或 grant 撤銷不得改送預設 bot。
- [ ] 依 Telegram 回執的 status 判定送達，不能「呼叫沒 throw」就算成功。
- [ ] 明確 transient failure 採 bounded backoff／retry-after，沿用相同圖片；模糊
      結果及重啟時的 sending 保留 uncertain，僅 owner 明確 retry 才重送。
- [ ] pending/uncertain intent pin 資產；取消／刪除的引用釋放與保留政策一致。
- [ ] 提供已產圖未送達／uncertain 狀態與精確 retry 操作，retry 不增加生成次數。

**Exit**：Telegram 故障只影響送達，不產生第二張圖、不誤稱 exactly-once。

## P5 — Integrated acceptance and implementation review

| Layer | Required scope |
| --- | --- |
| Service／auth | App/Cat/account isolation、有效工具 delivery、scope revoke、policy changes |
| Persistence | atomic admission、budget races、dedupe、lost response、crash matrix、upgrade recovery |
| Runtime consumer | unchanged HTTP vectors、same/different instance、pool/singleton、cancel、shutdown |
| Studio | real archive＋host SDK、原功能及 retained bytes、disable/uninstall 只影響 App |
| Companion | quiet 不產圖、允許時一張、睡覺／撤銷晚到結果、owner message/session gate |
| Telegram | failed receipts、確定／不明失敗、rotation、restart、asset retention、0 regeneration |

- [ ] 對 SPEC-128 AC-01～AC-16 逐條列實際命令、結果與未測項。
- [ ] 使用 temp roots／memory stores／fake provider／fake Telegram 完成全閉環，
      不把 demo job／policy／message 寫到使用者 dev state。
- [ ] 獨立 review caller authority、budget transaction、resource deadlock、migration、
      cancellation及 ambiguous send；author-run tests 不算獨立 review。
- [ ] 若另外核准 live acceptance，記錄支持的 Cat/image tuple、精確 source／package
      identity、生成次數及收發結果；先完成真工具暴露、installed Desktop 與 real bot 證據。
- [ ] 分開報告 fixture、真 provider、真 Telegram、各 OS 與 installed acceptance；
      未跑的項目維持 pending，不借用舊研究圖片的成功。

**Exit**：沒有尚未交付的條件被標成完成；發布另依明確授權處理。

## P6 — Later contracts and release preparation

- [ ] 修圖／合成／多 provider／PNG 由 Apps PLAN-006 A0/A1/A2 接 successor contract；
      新操作仍沿用本計畫的 caller/budget/asset/delivery。
- [ ] Studio 顯示或編輯 Cat 圖片需要明確 sharing／source authorization 與公開契約，
      不以相同帳號或 shared storage 作為授權。
- [ ] 如外部／persisted 契約需 breaking change，記錄 Platform/Runtime 0.x minor、
      SDK major 與 App compatibility boundary；不為內部抽取任意要求新 Studio。
- [ ] 只有另有 release 授權才填入 exact versions/pins、notes、upgrade/signing，
      bump／發布／選定 Desktop payload；照 shared release completion policy 驗證後結束。

## Implementation starting points

| Existing surface | Expected work |
| --- | --- |
| `src/platform/apps/images.ts`, `src/app/server/appImageRoutes.ts` | 提取共同本體，保留 App identity adapter 與 SDK contract |
| `src/runtime/images.ts`, Runtime client methods | 沿用 schema 1；新增操作只在後續 contract gate |
| `src/products/chat/api/companionLifeLoop.ts`, `companion/life/` | async tool decision/completion、owner presence 與 policy |
| Platform supervision／session tool delivery | Cat-scoped grant 與真正 provider tool invocation |
| `src/platform/transports/fanout/`, `telegram/media.ts` | 資產引用、durable delivery intent、真實 receipt status |
| `tests/app-images.test.js`, `companion-heartbeat.test.js`, `transport-fanout.test.js` | 保護既有行為並擴充 meaningful consumer/recovery scenarios |
| Apps `apps/studio/`／Platform `scripts/testing/check-studio-app.mts` | 真 package 消費驗收；無必要不改 Studio UI |
| Runtime `ImageGenerationService`／WorkerPool tests | 支持配對與資源／取消相容性；僅有缺口時修改 |

新增檔案與型別依 P0 決定；以上為現有入口，不宣稱本次已修改它們。

## Risks and controls

| Risk | Control |
| --- | --- |
| 抽共用服務意外打開跨 App/Cat 作品 | caller-aware access，舊資料不補 sharing grant |
| 背景圖片失控使用額度 | 持久有限預留、撤銷重查，未知不退款，改政策不重置 |
| Cat 工具等待自己持有的 provider | async submit/completion＋same-instance gate，做不到不開放 |
| 轉送／restart 重複生圖 | 固定 Runtime ID；送達只引用已保存圖片 |
| App 卸載取消別人的工作 | initiator-scoped revoke 及 resource references |
| 文件與現有 Studio expansion 混淆 | 本計畫先固定 schema 1；Apps PLAN-006 管新 operations |
| 檔案升級損壞原作品 | validate/backup/stage/atomic activate＋可重入 failure tests |

## Validation for this documentation slice

本次只撰寫 ADR/SPEC/PLAN、既有基線的 successor 說明與索引。
檢查範圍為 diff、連結、狀態與 owning-repository 邊界；不需應用程式測試或 build。
2026-10-23：兩個 worktree 的 `git diff --check` 通過；變更文件檢查覆蓋 17 個
Markdown、1208 個相對連結及 LF／結尾換行，跨 repository target 以本次 worktree
映射確認。Apps `npm run check:docs` 通過（55 個 Markdown、285 個 local targets；
因 worktree 布局跳過 63 個 sibling links，本次變更文件的跨 repository 連結已由
前述 mapped check 補驗）。
上方 implementation／live 驗收尚未執行，沒有應用程式測試或 build 的通過宣稱。

## Progress log

| Date | Update |
| --- | --- |
| 2026-10-23 | 依 owner 要求建立 shared service＋controlled Cat＋Studio 共用的文件；Runtime 評估納入 P0/P5，API 修改依具體缺口判定。所有 implementation phases 未開始 |

## References

- [SPEC-128](../specs/SPEC-128-shared-image-service-and-controlled-cat-generation.md)
- [Runtime SPEC-033](../../../cats-runtime/docs/specs/SPEC-033-bounded-image-generation.md)
- [Apps PLAN-006](../../../cats-apps/docs/plans/PLAN-006-studio-image-workspace.md)
- [Product integration guide](../product-integration-guide.md)

*Created: 2026-10-23. Implementation and necessary releases authorized; see the checkpoint for verified scope and pending acceptance.*
