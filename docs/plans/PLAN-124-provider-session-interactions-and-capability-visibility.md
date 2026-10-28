# PLAN-124: Provider Session Interactions and Capability Visibility

## Metadata

| Field | Value |
| --- | --- |
| Status | Implementation complete；產品與 Windows candidate fixture 通過，原生呼叫已比對；成功 Chrome／桌面操作受上游 helper 限制 |
| Owner | Platform shared interaction、Desktop integration |
| Assigned To | Unassigned |
| Reviewer | Product owner、Runtime maintainers |
| Related spec | [SPEC-132](../specs/SPEC-132-provider-session-interactions-and-capability-visibility.md) |

## Overview

Owner 於 2026-10-28 授權文件 PR 自動合併後，拉最新程式碼切片實作並陸續提交。
本授權不包含版本發布。
先跟 Runtime PLAN-049 凍結共用契約，再接入既有互動引擎與各產品表面。
不在 Platform 複製 provider adapter；Bots PLAN-004 是另一個獨立消費者。

## Implementation Phases

### P0 — 契約與產品對應

- [x] 和 Runtime P0 對齊 capability、reply、snapshot/event、policy 及 receipt fixtures。
- [x] 確認 conversation／lane／participant／run 的身分對應，定義 provider interaction
  與 task/supervision approval 的不同操作，列出關閉與撤銷路徑。
- [x] 決定必要的持久化資料與 migration；凍結 legacy 權限呈現及不擴權升級行為。

**Exit:** 回覆控制路徑不依賴訊息 turn queue；舊 Runtime 的降級呈現已有測試案例。

### P1 — 後端與 runtime client

- [x] 消費 Runtime P1/P2，加入 authenticated product response API、身分驗證與去敏感 projection。
- [x] 整合 shared interaction／run lifecycle 的 waiting、cancel、expiry、resolve 和重連。
- [x] 處理多人並行、provider retarget、對話關閉及重複回答；保留既有 task approvals。

**Exit:** MemoryCoreStore／fixture Runtime 測試通過 A1–A3/A7 的後端部分。

### P2 — 對話互動 UI

- [x] 在 shared renderer 提供已證明可共用的請求卡片／表單，Chat／Work／Code 各自接線。
- [x] 支援來源、scope、deadline、送出／衝突狀態、重連與可取消的 unsupported 表單。
- [x] 實作外部 URL 流程的受控開啟；去敏感輸入不進 transcript／trace。
- [x] 以產品 regression 與隔離 Electron 檢查 composer、捲動、標題及批准入口；
  Code／Work 的操作契約由 fixture 覆蓋，不宣稱每個產品均做過完整 native UI 操作。

**Exit:** 三個產品皆有 fixture 可重現的請求→回答→provider resolution 行為。

### P3 — 權限與工具可見性

- [x] 消費 Runtime P2/P3，分離 approval 與 access，顯示 requested/effective 差異。
- [x] 加入 live session 工具來源／連線／部分清單；舊 plugin settings 保持其管理用途。
- [x] 在既有 Desktop settings 接入 helper／Chrome 觀測與設定入口；無健康證據時顯示 unknown。
- [x] 加入舊 Runtime、不支援 provider、無 worker、快取過期和 helper 離線的呈現。

**Exit:** A4/A5 通過；一般對話的政策設定不能擴張 Work 的受限工作。

### P4 — 整合與候選 Desktop 驗收

- [x] 執行受影響的 focused Node／renderer／shared interaction 測試及必要 build/type checks。
- [x] 使用獨立 candidate profile 驗證原生卡片往返、reload 與診斷；
  A1–A5/A7 的其他契約由隔離 fixture 覆蓋，不向使用者的開發 state 寫測試對話。
- [x] 在相同 CLI/config/cwd/policy/helper 條件下比較 Terminal，分別記錄受控 Chrome 與
  桌面操作的工具呼叫和可見結果，包含 helper 不可用時的行為。
- [x] 記錄採用的 Runtime source/artifact 身分與平台限制；其他 OS、packaged 及 Mobile
  驗收未跑就維持待驗。版本與發布另依授權處理。

**Exit:** 完成的是具體使用路徑，不以 catalog 非空或視窗啟動成功代替工具驗收。

**環境限制：** A6 的成功 Chrome 導航／桌面按鈕操作及 helper 恢復尚未通過；
Terminal、Bot、Platform 均實際呼叫工具並得到相同的上游不可用錯誤。

## Files to Create/Modify

| Area | Intended change |
| --- | --- |
| `src/runtime/client.ts` | Runtime capability、interaction 與 response 消費端 |
| `src/shared/runtimeSessionPolicy.ts` | 新政策與 legacy UI 對應 |
| Platform/shared interaction、supervision | 身分、owner authorization、waiting／cancel 投影 |
| `src/products/shared/renderer`、各產品接線 | 請求卡片／表單及生命週期 |
| `src/app/renderer/settings`、Desktop host | 設定入口與依賴診斷，沿用單一 settings shell |

## Testing Strategy and Risks

優先以 isolated MemoryCoreStore、scripted Runtime/provider fixtures 驗證。
最大的風險是回答串到別的 lane、把 live callback 當耐久資料復活、與 legacy 權限升級擴權；
SPEC-132 A2–A4 對應這些情境。真實 UI 驗證使用隔離 candidate，清楚區分觀測與操作證據。
初始文件 PR 沒有模型回合；目前實作已使用隔離 memory/file fixtures，後續候選與真實
工具驗收分開記錄，不把 discovery 當成功操作。

## Progress Log

| Date | Update |
| --- | --- |
| 2026-10-28 | 依 Platform `595e9ca2` 建立文件草案；P0–P4 尚未實作，無版本或資料變更。 |
| 2026-10-28 | Runtime PR #194 契約接入；新增 authenticated native controls、同 turn idle waiting、Work 早期 session 關聯／取消防復活；Core format 6 migration 備份與 failure recovery。首批 55 項 focused checks 通過；細節與 0.12 發布邊界見 SPEC-132。 |
| 2026-10-28 | P1 完整收斂：Work durable claim、visible conversation admission、Golden Path budget abort、late result terminal fence、canonical session binding 及 current request 優先；65 項 affected Node、16 項 product checks 與 10 項 Code operations 回歸通過。獨立 reviewer 再驗 27 項 focused assertions，包含實際 Collaboration／Golden Path 路徑。 |
| 2026-10-28 | P2/P3 renderer slice：六種卡片、same-turn typed reply、受控 URL、近 composer 的 pending 區與最後 4 筆 receipts；沿用 Settings 顯示 requested/effective policy、工具來源和 helper unknown。Chat／Code 草稿與 workspace/cwd 切換保留 explicit policy，chip 顯示 requested policy。3 項 bundled DOM tests 與 renderer/test typechecks 通過，實際 hook/editor 切換由獨立 review 驗證；server/desktop typechecks 及 candidate server/host/web build 通過。 |
| 2026-10-28 | 隔離 Windows Electron 41.2.0 candidate：setup／login、provider picker、group draft avatar、parallel branch switch、sidebar overflow、transcript spacing/copy、composer avatar；scripted 原生問題回答回到同 turn。最終 CSS candidate 另驗 reload 前後同 interaction/session/generation/execution，required 空字串／空陣列及 optional 空 enum 送出後顯示 empty form accepted，receipt resolved/providerConfirmed。最後的 policy chip/hook forwarding 由 source DOM/typecheck 驗證，未重建為第三份 Electron candidate。 |
| 2026-10-28 | 原生比較使用 Codex 0.164.0、相同使用者／config／測試 cwd、workspace-write/offline/on-request/reviewer=user，經真實 CatsRuntimeClient + Chat dispatch（MemoryChatStore），沒有繞過 Runtime。發現並修正 Runtime 同 cwd 舊 thread discovery race；改用 50ef02b4686c1fff6b60819d292acc5b2e1ef773 精確 pack 後 policy verified、configured MCP 279/3/4。Chrome 與 computer use 均真正呼叫，分別得到 Chrome unavailable 和 native pipe missing，與 Terminal/Bot 相同。成功外部操作與 helper 恢復仍待環境可用；Electron fixture 與此原生產品 dispatch 證據分開記錄。 |
| 2026-10-28 | CI 補正 slice：共享 Runtime client 的 UTF-8 bounds／stream decoder 改用 Web API，timer unref 僅在支援時呼叫，保持 Mobile 的 transitive type graph 可編譯。Mobile boundary/typecheck、server build、39 項 client tests 通過，包含跨 chunk 中文／emoji 與超限串流取消／UTF-8 byte limit；這是 Mobile 編譯相容性，未新增 Mobile 原生控制功能。 |
| 2026-10-28 | 完整 CI 收斂：Chat binding adapter 改由 app composition 注入共用 API，保留原 owner／lease／turn/run 檢查；更新舊 UI expectation，URL fixture 在每個測試開始時計時。新增控制介面接入 74 組 en／zh-TW catalog，不擴增 raw-string allowlist。30 項 control/product/client/boundary、27 項 UI/i18n checks 及 Mobile typecheck 通過；獨立 review 另驗 101 項 architecture、兩語系插值一致、延後一小時的 fixture TTL 與過期拒絕。最後 source 重建隔離 Windows Electron candidate（Runtime main e043d5b2），確認繁中原生表單／requested-policy chip，空值回覆得到同 turn 的 empty form accepted 與 providerConfirmed receipt。這份候選包含後續 chip/hook 與翻譯修正；先前候選的範圍紀錄仍保留。 |

*Created / last updated: 2026-10-28*
