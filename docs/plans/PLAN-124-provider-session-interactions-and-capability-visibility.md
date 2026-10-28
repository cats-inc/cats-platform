# PLAN-124: Provider Session Interactions and Capability Visibility

## Metadata

| Field | Value |
| --- | --- |
| Status | Implementing；P0/P1 接線與測試完成，P2–P4 驗證進行中 |
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

- [ ] 在 shared renderer 提供已證明可共用的請求卡片／表單，Chat／Work／Code 各自接線。
- [ ] 支援來源、scope、deadline、送出／衝突狀態、重連與可取消的 unsupported 表單。
- [ ] 實作外部 URL 流程的受控開啟；去敏感輸入不進 transcript／trace。
- [ ] 驗證各產品既有 composer、捲動、標題及批准入口沒有被泛化元件破壞。

**Exit:** 三個產品皆有 fixture 可重現的請求→回答→provider resolution 行為。

### P3 — 權限與工具可見性

- [ ] 消費 Runtime P2/P3，分離 approval 與 access，顯示 requested/effective 差異。
- [ ] 加入 live session 工具來源／連線／部分清單；舊 plugin settings 保持其管理用途。
- [ ] 在 Desktop settings 接入 helper／Chrome readiness 與修復入口，避免重複 settings shell。
- [ ] 加入舊 Runtime、不支援 provider、無 worker、快取過期和 helper 離線的呈現。

**Exit:** A4/A5 通過；一般對話的政策設定不能擴張 Work 的受限工作。

### P4 — 整合與候選 Desktop 驗收

- [ ] 執行受影響的 focused Node／renderer／shared interaction 測試及必要 build/type checks。
- [ ] 使用獨立 candidate profile，驗證 A1–A7；不得向使用者的開發 state 寫測試對話。
- [ ] 在相同 CLI/config/cwd/policy/helper 條件下比較 Terminal，分別記錄受控 Chrome 與
  桌面操作的工具呼叫和可見結果，包含 helper 不可用時的行為。
- [ ] 記錄採用的 Runtime source/artifact 身分與平台限制；其他 OS、packaged 及 Mobile
  驗收未跑就維持待驗。版本與發布另依授權處理。

**Exit:** 完成的是具體使用路徑，不以 catalog 非空或視窗啟動成功代替工具驗收。

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

*Created / last updated: 2026-10-28*
