# SPEC-132: Provider Session Interactions and Capability Visibility

## Metadata

| Field | Value |
| --- | --- |
| Status | Implemented；產品／Windows candidate fixture 與原生呼叫已驗證，成功外部操作仍受 helper 限制 |
| Owner | Platform shared interaction、Desktop integration |
| Reviewer | Product owner、Runtime／Bots maintainers |
| Baseline | Platform `595e9ca2`；2026-10-28 |
| Plan | [PLAN-124](../plans/PLAN-124-provider-session-interactions-and-capability-visibility.md) |
| Governing decisions | [ADR-020](../decisions/020-own-mcp-intent-in-product-and-tool-delivery-in-runtime.md)；Runtime ADR-048（已接受） |

## Summary

讓 Cats Desktop 的 Chat／Work／Code 能接收並回答 provider 原生批准、提問及 MCP 表單，
同時看見目前 session 的有效權限、實際工具來源與桌面／瀏覽器依賴狀態。
Platform 負責使用者操作與產品權限，Runtime 負責原生協定與執行。

共用契約以 `cats-runtime/docs/specs/SPEC-039-provider-session-capabilities-and-interactions.md`
為準；協作計畫是 Runtime PLAN-049、Bots SPEC-004／PLAN-004。
契約基於 Runtime PR #194；最後原生驗收採 source
`50ef02b4686c1fff6b60819d292acc5b2e1ef773` 的 0.6.2 pack，SHA-1
`5f360927ece194dc3e0abbd690fb7b43cb292fc3`；尚未發布新版套件。
本案延伸既有 ADR-020 與共用互動引擎，不另立一份重複的 Platform 架構 ADR。

## Goals and User Stories

- 使用者在對話中完成 Codex 等待中的選擇／批准，回答回到同一個執行中的請求。
- 使用者能分辨「已安裝插件」、「session 看得到工具」與「工具已成功連線／使用」。
- Chat／Work／Code 共用請求狀態與回覆邊界，並保留各自的對話與操作呈現。
- 在相同環境條件下比較 Terminal 與 Desktop，能指出能力差異的來源。

## Non-Goals

- Platform 直接啟動 Codex、解析 app-server JSON-RPC 或取代 Runtime 的 MCP 管理。
- 把 Cats 插件安裝器變成使用者全部 Codex 插件／憑證的管理器。
- 讓 standalone Bots 依賴 Platform；保證其他 provider 或所有 OS 已具有相同能力。
- 本期加入 Mobile／遠端原生批准、重新設計 Work supervision，或重新包裝上游私有 helper。

## Before implementation

現有批准佇列主要以 Cats task 的 `dispatch_plan` 呈現，supervision 也以 task／binding
記錄批准；它們尚未形成 Codex 原生請求的往返路徑。現有 Plugins 設定頁管理受管的 Cats
插件／skills，不能用作 Codex live MCP 清單。一般對話的「完整存取」映射為
`read_write + skip`，而已檢查的 Codex adapter 仍採 `workspace-write`。
這三項分別是互動接線、能力可見性與權限語意的缺口。

## Requirements

### P1. 共用互動接線與身分

Platform 的 runtime client 消費 SPEC-039 的 negotiation、snapshot、events 與 response API。
建立 session 時才宣告目前 host 真正支援的種類；舊 Runtime／不支援的 target 顯示不支援，
不可默默把使用者選擇的互動模式降成自動拒絕或完整授權。

每項互動綁定 conversation、participant／lane、run、runtime session、worker generation
與 interaction ID。對話切換、多人並行、provider retarget 都不能把回答送到別的執行者。
後端檢查登入使用者與 conversation 的操作權，再使用受管的 Runtime 認證送出回覆；
renderer 不取得 Runtime key、原生 request ID 或直接連線權限。

### P2. 原生互動的 UI

共同資料模型區分 `provider_interaction`、既有 task approval 與 supervision approval。
可共用入口／視覺元件，但保留不同的回覆命令、狀態與權限來源。
不把每個原生問題偽裝成 dispatch plan，也不讓批准 Cats task 順帶放行原生工具。

對話內提供有來源的卡片，顯示所屬 Cat、動作／問題、範圍與等待期限。
支援命令／檔案批准、限定權限授予、選項與自由文字問題、已支援 schema 的 MCP 表單，
以及由使用者開啟的外部 URL 流程。只呈現 Runtime 所允許的選項／授權範圍。
外部頁面開啟不代表授權成功；依 Runtime 的 provider-specific 結果更新狀態。

等待、送出中、已回覆、被 provider 結束、逾時、取消、程序中斷必須可分辨。
重複點擊沿用同一 idempotency key；衝突／過期回覆重新讀取權威狀態。
保密欄位不得寫入 transcript、debug trace、活動 feed 或全域 state snapshot。
未知 schema 顯示可操作的 unsupported／cancel 結果，不產生空白成功回答。

### P3. 生命週期與 Work 接線

等待真人輸入的 run 顯示「等待你的回覆」，不算成功完成或新一輪模型執行。
回覆走控制 API，不排進已被該 turn 佔住的訊息佇列。原有執行 gate 保持有效。
Work 的監督、預算、cancel 與排程機制能辨識 human wait；不得因等待期間沒有 token
就判成卡死、重派相同工作或放寬權限。

UI 關閉／重連後以 snapshot 加 revision 恢復卡片；仍在 Runtime 的請求可繼續。
worker／Runtime 重啟後的舊卡片標示中斷，不能把 durable 卡片視為仍存活的 callback。
使用者關閉／取消 run 或刪除其擁有者時須撤銷回覆能力；不得自動重新執行外部效果。

### P4. 權限設定與相容性

把「批准方式」與「可存取的檔案／網路範圍」分開呈現，顯示請求值與 Runtime 驗證後
的有效值。提供明確選擇的 provider 設定沿用模式；只有已支援且經 host admission 的
explicit policy 才能選真正的 full access。以現有 `skip` 值推導完整機器存取是錯誤的。

既有設定保留原執行效果。遇到 legacy session 時呈現其有效範圍／舊設定狀態，
不能單靠改標籤自稱完成新政策，也不能自動遷移成較寬權限。
Work 的 read-only／whitelist／監督工作保留其較窄限制；使用者一般對話的選擇不覆蓋它們。
變更只影響下一個接納邊界，活躍 turn 保留原政策，或由使用者明確取消。

### P5. 工具與依賴的可見性

設定頁提供 provider／session 能力入口，對話內可開啟目前 session 的詳細資訊。
顯示內建工具、provider MCP、Cats 注入 MCP、Runtime dynamic tools 的來源、時間、
完整度、連線／認證狀態與已知政策限制。舊的插件安裝清單維持自己的用途。
不同來源可以同名；按來源及 server 識別，不以工具總數宣稱一致。

沒有活躍 worker 時顯示尚未觀測；過期快取明確標記。刷新不送 prompt、不測試所有工具，
也不為看清單建立新模型回合。巢狀／lazy host 只觀測到入口時標示部分清單。
認證機制的 `unsupported` 不翻譯成工具不可用。

Desktop 顯示 Computer use／Chrome 的依賴檢查與修復入口：已選 CLI、原生 helper、
上游 host、瀏覽器擴充、OS 存取能力的觀測結果。無法確認的項目顯示未知，
不要求 Runtime 假造 ready。沿用現有安全的外部連結／應用程式開啟邊界；
不接管使用者的 MCP 程序，不繞過上游登入／信任或 OS 權限。

### P6. 儲存與安全邊界

持久化僅限必要的產品關聯與去敏感狀態，不保存活 callback 或秘密表單答案。
實作若擴充 Core／設定 schema，必須先列出驗證、備份、原子替換與失敗復原測試。
沿用現有 product authorization；模型提供的文字、Markdown、schema、URL 都是資料，
不成為 host 指令或可執行 UI。

## Acceptance Criteria

| ID | 驗收 |
| --- | --- |
| A1 | Chat、Code、Work 各自完成一筆原生請求，回答送回同一 session／turn，沒有另開回合 |
| A2 | 多 Cat／parallel lane 不串回答；未授權、重複、過期或 retarget 前的回答不生效 |
| A3 | renderer 重開後恢復 live 請求；Runtime restart、cancel、provider resolve 後卡片失效 |
| A4 | read-only／whitelist 與既有設定不變寬；新 UI 的有效權限與 Runtime 回報一致 |
| A5 | 清單區分來源、部分資料與離線 helper；安裝插件或發現工具不能單獨顯示驗證成功 |
| A6 | 在隔離候選 Desktop 中分別驗證受控 Chrome 與桌面操作，記錄 Terminal 比較條件 |
| A7 | 既有 task／supervision 批准、普通對話與取消行為通過適當回歸；無秘密寫入歷史 |

## Implementation and compatibility boundary (2026-10-28)

- 共用控制 API 是 `/api/provider-interactions/conversations/:id`，由既有登入／CSRF gate
  保護，再限定直接 loopback transport 的 owner/admin browser session；Mobile bearer、
  forwarded request、非本機來源拒絕。Runtime bearer 不進 renderer。
- Chat／Code／Work 對話沿用 participant lease + active turn 的 lane/session 對應。
  Work 有可見對話且屬於 owner task／mission 的 supervised run，在首次訊息前建立
  `metadata.providerInteraction = {version:1,sessionId}` 及取消所需 Runtime bridge。
  spawn 前先原子 claim 同一 run；重複 admission 不建立第二個 worker。已確認 cancel/close
  後保留 ended receipt，明確 retry 可建立新 session；cleanup 未確認會保存已知 sessionId
  與 cleanupRequired，阻止重試與回覆。程序在 claim 途中消失時不猜測重播，須先結束舊 run。
  此記錄不含 prompt、answer 或 live callback；讀取時仍向 Runtime 驗證 generation、
  execution、revision，回覆前再驗證產品關聯。已結束／blocked run 不能回答。
- Work human wait 保持原 turn；原生等待會延長 token-idle 判定，但不延長既有明確的
  wall-clock budget。Golden Path 到期會 abort/cancel 原 provider 執行；晚到的 create
  不會開始訊息。取消後，成功／失敗回寫都保留最新 terminal 狀態。
- 沒有可回覆對話的 headless/relay execution 不宣告互動 host；不把無 UI 的工作
  偽裝成可等待真人的 session。Code 的對話有 host，獨立 relay/task 執行維持原邊界。
- 舊 Runtime 保留既有 policy；明確選取新政策而 target 不支援時拒絕建立。
  新 policy 不和舊 `permissionMode`／`allowedTools` 同送；read-only／whitelist ceiling
  在持久化讀取及 session admission 兩次檢查。診斷 refresh 不建立模型 turn。

### Persisted format 6

Core snapshot 由 5 升為 6，防止舊版忽略新 `runtimeExecutionPolicy` 後擴權。
升級在 store mutation lock 內驗證已識別格式，保存原始 bytes 到
`<state>.pre-provider-policy.bak`，再以同目錄 temporary file + rename 原子替換。
既有 backup 必須內容相同，不能覆蓋其他來源；primary 與常規 `.bak` 的未知 policy／
outer schema 均 fail closed，不能用預設設定或較舊副本覆寫。
寫入失敗保留原檔，可修復 I/O 原因後重試；malformed primary 仍沿用既有 backup recovery。
舊版會拒絕 format 6，**不支援直接降版開啟新資料**；若需回復舊版，先關閉程序並另行
保存新資料，再由 owner 明確選擇升級前的原始備份，會捨棄升級後變更。

此資料邊界需要 **下一次發布採 0.12 minor**。本次 owner 只授權實作與 PR，
package 仍為 0.11.1，未 bump／publish；不能把這份候選當作同 minor 已發布升級。

### Validation evidence

- 首批 55 項 Node tests 通過，另 62 項既有政策／Work／Chat／auth focused regression 通過：三產品同 turn 往返、跨 binding／generation／execution
  拒絕、owner/local authentication、未知資料版本、backup failure/retry、既有 store 回歸。
- 獨立 review 已修正 qualified provider/backend 選擇、caller kinds 交集、舊 reader 擴權、
  future backup 覆寫、原生等待 polling 的 late-finally timer、Work cancellation／歷史清單等問題。
- 產品接線後續回歸、3 項 renderer DOM tests、各層 typecheck 及 server/host/web build
  通過；獨立 review 驗證政策切換與原生 form 的空值／整數邊界。
- Windows Electron candidate 使用私有 profile 和 scripted provider，完成 reload 後
  同 execution 回覆、空值表單、terminal receipt、diagnostics 與既有對話 UI smoke。
- Codex 0.164.0 的真實 Platform Chat dispatch、Bot core 與 Terminal 均實際呼叫工具：
  Chrome 回報 `Browser is not available: chrome`；computer use 回報 native pipe
  unavailable（OS error 2）。Platform effective policy verified、configured MCP 為
  279/3/4，Bot 另外注入 4 個工具。這證明呼叫路徑與匹配觀測，沒有成功 Chrome／桌面操作。
  詳細 scope、候選 source 差異及未驗項見 PLAN-124 和 Runtime research。

## Claude Code (2026-10-28)

Runtime SPEC-039 R8 讓 Claude Code 成為第二個原生 target，由
[PLAN-125](../plans/PLAN-125-claude-code-provider-controls-in-desktop.md) 接入 Desktop：

- Claude 宣告 `tool_approval`（MCP 與 Claude in Chrome 等非命令、非檔案工具），不宣告
  `permission_grant`。Platform 渲染它；未渲染的種類不協商，Runtime 會直接拒絕該請求。
- Claude 在原生 Windows 沒有 sandbox，只接受「完整存取＋網路」上限。Desktop 不得提供或送出
  target 不能強制的上限，也不能把 Claude 的 `verified` 說成檔案／網路受限。
- Claude in Chrome 需要 Runtime session 的 `browserIntegration: true`。只有可回覆的對話 session
  才送出；沒有人能回覆卡片的 Work／排程／relay 執行不得載入瀏覽器工具。
  哪些 Chrome 工具需要核准由 Claude Code 與擴充決定（實測讀取分頁的 `tabs_context_mcp` 不詢問），
  因此 Desktop 不宣稱每個瀏覽器動作都會出現卡片。
- Computer use 在 Windows 為 `unavailable`（Claude Code 只開放給 macOS 互動 session），顯示原因即可。

## Remaining environment validation

- Runtime SPEC-039 的 supported fixture contract 已接線；新 native schema 仍需個別驗證。
- 表單支援範圍、URL completion 與 provider deadline 以 Runtime P0 的 fixtures 為準。
- Native Windows 為第一個整合驗收；其他 OS／遠端界面逐項記錄待驗，不繼承結果。
- 接線與上游 Desktop-only helper 的重分發是不同議題；本案只規劃已安裝環境的診斷。

## References

- [Product integration boundaries](../product-integration-guide.md)
- [Work supervision](SPEC-082-cats-work-agent-supervision-and-tool-boundary.md)
- [Managed Cats plugins](SPEC-121-managed-plugin-capabilities.md)
- Runtime ADR-048 / SPEC-039 / PLAN-049 and research `2026-10-28-codex-host-capability-gaps`.

*Created / last updated: 2026-10-28*
