# PLAN-121: Shared image service and controlled Cat generation

## Metadata

| Field | Value |
| --- | --- |
| Status | Draft — documentation only; implementation not started |
| Owner | Platform integration; Apps Studio and Runtime execution owners consulted at contract gates |
| Reviewer | Owner; independent implementation review pending |
| Spec | [SPEC-128](../specs/SPEC-128-shared-image-service-and-controlled-cat-generation.md) |
| Decision | [ADR-136](../decisions/136-share-controlled-image-capabilities-between-cats-and-studio.md) |

## Overview

先讓 Platform 圖片服務同時服務既有 Studio 與受限 Cat，再完成陪伴心跳產圖到
Telegram 的持久閉環。第一階段保留 Grok／單張 1:1 JPEG 與現有 App SDK 契約。
Runtime 參與相容性驗證，依證據決定最小修改；修圖／多 provider 另循 Apps PLAN-006。

本計畫是可審閱的提案，不授權現在實作、建立真實政策、生成圖片、發 Telegram、
升版、發布或安裝。所有 implementation checklist 保持未完成。

## Work ownership and scope

| Member | 本階段工作 | 邊界 |
| --- | --- | --- |
| Platform | 共用服務、App/Cat adapters、政策／預算、資產、工具 delivery、對話及 Telegram intent | 不執行 native CLI、不把 Chat 實作 import 到 platform/core |
| Apps | 既有 Studio built package 的 consumer 契約與驗收；文件回鏈 | 第一階段無必需 UI／manifest／SDK 呼叫變更；無新的 Studio 生圖 server |
| Runtime | 確認現有 HTTP／receipt、resource admission、cancel、restart 可供 Cat 呼叫 | 不新增 App/Cat policy；只有具體相容性缺口才開 Runtime successor |
| Later Studio track | 修圖／合成、PNG、多 provider、跨 caller 作品分享 | 不併入第一階段成功條件 |

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

*Created: 2026-10-23. Proposed implementation sequence; not an implementation approval.*
