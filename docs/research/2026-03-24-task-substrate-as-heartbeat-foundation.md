# Task Substrate as Heartbeat Foundation

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: `cats` Core 層 task substrate + `cats-runtime` wakeup 整合
- **Related**:
  - `cats-platform/src/core/types.ts` — `CoreTaskRecord`, `CoreWorkItemRecord`
  - `cats-platform/src/core/model.ts` — `upsertCoreTask`, `upsertCoreWorkItem`
  - `cats-runtime/src/core/wakeup/RuntimeWakeupService.ts`
  - `cats-runtime/docs/specs/SPEC-012-scheduled-wakeup-substrate.md`
  - `paperclip/server/src/services/heartbeat.ts`（3,466 行參考實作）

---

## 問題

cats-runtime 已有 wakeup substrate（`RuntimeWakeupService`，622 行），能定時叫醒
session。但它**不知道醒來要做什麼**——沒有 work item 可以 checkout、追蹤、回報。

Paperclip 的 heartbeat（3,466 行）之所以有效，是因為它的 wakeup 跟 issue system
緊密結合：

```
cron 觸發 → heartbeat 醒來 → 查 DB 有無 assigned issues
→ atomic checkout → 在 issue workspace 裡工作
→ 結果寫回 issue → 更新 agent 狀態 → 記錄 cost
```

我們缺的不是 timer（已有），而是 timer 背後的 **work item lifecycle**。

---

## 提議

在 Cats Core 層建立 **task substrate**，作為 Chat 和 Work 共用的工作追蹤機制，
並串接 cats-runtime wakeup 作為自動觸發來源。

### 核心主張

> Task substrate 是**產品層（cats Core）的職責**，不是 runtime 層的職責。

理由：

- **Runtime 擁有的是執行事實**：session lifecycle、provider 呼叫、token metering、
  workspace isolation、skill resolution
- **產品擁有的是業務意圖**：「什麼工作要做」「誰負責」「是否需要 approval」
  「預算有沒有超」
- Task 的 CRUD、status transition、assignment、approval 都是業務決策，不是執行細節
- 這跟既有的分工一致：
  - ADR-018：Separate Product Skill Intent from Runtime Skill Hosting
  - ADR-022：Own Chat Delivery Policy in Product
  - ADR-023：Own Budget Policy and Cost Control in Product

Runtime 唯一需要知道的是：「某個 session 要被叫醒」——這已經由 wakeup substrate
提供。產品層決定**何時、為何**建立 wakeup request。

---

## 現有資產盤點

### 已經存在的（cats Core types + model）

`cats-platform/src/core/types.ts` 已定義：

- **`CoreTaskRecord`**
  - id, title, status, conversationId, ownerActorId, orchestratorActorId,
    assignedActorIds, summary, approval (nested), metadata
  - Status 狀態機：`draft → pending_approval → approved → in_progress →
    blocked / completed / cancelled / archived`

- **`CoreWorkItemRecord`**
  - id, title, status, projectId, conversationId, taskId, parentWorkItemId,
    ownerActorId, assignedActorIds, summary, metadata
  - Status 狀態機：`draft → planned → ready → in_progress →
    blocked / completed / cancelled / archived`

- **`CoreApprovalRecord`** — 內嵌在 task 中
  - status, requestedAt, decidedAt, decidedByActorId, decisionAction, notes

- **`CoreApprovalQueueItem`** — 用於 UI 呈現待批列表

`cats-platform/src/core/model.ts` 已實作：

- `upsertCoreTask()` — task 的 create/update（含 approval 欄位合併）
- `upsertCoreWorkItem()` — work item 的 create/update

### 已經存在的（cats-runtime wakeup）

`cats-runtime/src/core/wakeup/RuntimeWakeupService.ts` 已實作：

- create / list / cancel / trigger wakeup requests
- JSON file persistence（restart-safe）
- bounded timer loop（1 秒一次掃 due requests）
- coalesce key 去重
- session wakeup state 查詢
- HTTP routes：`POST /wakeups`, `GET /wakeups`, `DELETE /wakeups/:id`,
  `POST /wakeups/:id/trigger`

### 還不存在的（gap）

- Task assignment → wakeup trigger 的串接邏輯
- Task checkout（atomic，防止兩隻 Cat 同時做同一個 task）
- Budget pre-check before task execution
- Task completion / failure 的 callback（Cat 做完後回寫 task status）
- Recurring / cron schedule（目前只有 one-shot `scheduleAt`）
- Run history（per-task 的執行紀錄）

---

## 兩層協作模型

```
┌──────────────────────────────────────────────────┐
│  cats (Product / Core)                            │
│                                                   │
│  Owner 說「做一個 landing page」                    │
│    ↓                                              │
│  Boss Cat (Orchestrator) 建立 CoreTaskRecord       │
│    ↓                                              │
│  assign task → Coder Cat                          │
│    ↓                                              │
│  [Hook] assignment 觸發 →                          │
│    呼叫 cats-runtime POST /wakeups                 │
│    { target: { sessionId: coderCat.sessionId },    │
│      scheduleAt: now,                              │
│      coalesceKey: "task:{taskId}",                 │
│      metadata: { taskId, assignedActorId } }       │
│                                                   │
├──────────────────────────────────────────────────┤
│  cats-runtime (Execution)                         │
│                                                   │
│  wakeup timer fires → wake session                 │
│    ↓                                              │
│  session resumes with task context                 │
│    (via existing skill/hydration mechanism)        │
│    ↓                                              │
│  Cat 工作 → 產出 artifact                          │
│    ↓                                              │
│  session 結束 → runtime 回報 metering facts         │
│                                                   │
├──────────────────────────────────────────────────┤
│  cats (Product / Core) — callback                 │
│                                                   │
│  收到 runtime 完成通知                              │
│    ↓                                              │
│  更新 CoreTaskRecord status → completed            │
│    ↓                                              │
│  Boss Cat 在 chat / Telegram 回覆 owner             │
│    ↓                                              │
│  同一個 task 顯示在 Work dashboard（未來）            │
│                                                   │
└──────────────────────────────────────────────────┘
```

### 關鍵邊界

- **cats 決定**：建什麼 task、assign 給誰、何時觸發 wakeup、approval 要不要
  gate、budget 有沒有超
- **cats-runtime 決定**：怎麼叫醒 session、session 用哪個 provider、workspace
  怎麼隔離、token 花了多少
- **兩者之間的合約**：wakeup HTTP API（已存在）+ session observe/history API（已存在）

---

## 需要新增的工作

### Phase 1：Task → Wakeup 串接（最小可行）

- **位於 cats**：
  - 在 task assign 邏輯中加入 wakeup trigger hook
  - 定義 task checkout 語意（status `approved` → `in_progress` 為 atomic transition）
  - Task completion callback route（runtime session 結束時 cats 更新 task status）

- **位於 cats-runtime**：
  - **不需要改動**。現有 wakeup HTTP API 已足夠。
    產品層呼叫 `POST /wakeups` 即可。

### Phase 2：Budget Gate + Run History

- **位於 cats**：
  - Task dispatch 前查詢 runtime metering（已有 `GET /metering`），
    超預算則 block task assignment
  - 每次 task execution 記錄一筆 `CoreRunRecord`（已有 type 定義）
  - Activity log 記錄 task lifecycle events

### Phase 3：Recurring Schedule

- **位於 cats**：
  - Task 上加 `schedule` 欄位（cron expression 或 intervalSec）
  - 產品層 scheduler service 定期為 recurring tasks 建立 wakeup requests
  - 仍然透過 `POST /wakeups` 跟 runtime 溝通——runtime 不需要知道 cron

### Phase 4：Work Dashboard 消費

- **位於 cats（Work 產品面）**：
  - 直接讀取 Core 的 task / workItem / activity 資料
  - 呈現 dashboard、inbox、timeline
  - 不需要額外的 data source

---

## 為什麼不放在 cats-runtime

如果把 task 管理放在 runtime，會發生：

- Runtime 需要知道「誰是 Boss Cat」「誰有權 assign」——這是產品邏輯
- Runtime 需要做 approval gate——但 ADR-022/023 明確說 policy 在產品層
- Runtime 需要追蹤跨 session 的 task 狀態——但 runtime session 是獨立的，
  不應該帶著產品層的 task graph
- Runtime 的 wakeup substrate spec (SPEC-012) 明確說這**不是** scheduler、
  不是 heartbeat system、不是 product workflow engine
- 結果是 runtime 膨脹成 Paperclip 的 heartbeat.ts（3,466 行混合了
  execution + policy + workspace + budget + session + logging）

保持分離的好處：

- Runtime 保持輕量，只做「叫醒 + 執行 + 回報 facts」
- 產品層可以換不同的觸發策略（manual / event / cron）而不改 runtime
- Task 資料天生跨 Chat 和 Work——放在 Core 層一次解決
- 測試更容易：產品測 task logic，runtime 測 wakeup + session，各自獨立

---

## 對各 Team 的影響

- **Team 1（Chat UI）**：Chat 介面需要能顯示 task 狀態（進行中 / 完成），
  但資料來自 Core——只需要讀，不需要自己管理
- **Team 2（Runtime Engine）**：**不需要改動 wakeup substrate**。
  現有 API 已足夠。專注在 compaction engine 和 skill execution
- **Team 3（Memory）**：無直接影響
- **Team 4（Core + DB）**：**主要負責方**。Task CRUD 已有 type + model，
  需要加上 assignment hook → wakeup trigger、checkout 語意、completion callback
- **Team 5（Orchestrator）**：Boss Cat 的 dispatch 邏輯改為「建 Core task + assign」
  而不是直接操作 runtime session
- **Team 6（Work）**：直接消費 Core task data，不用自建 data source

---

## 與 Paperclip 的差異

| 面向 | Paperclip | Cats（本提議） |
|------|-----------|----------------|
| Task + 執行引擎 | 合在 heartbeat.ts（3,466 行） | 分離：Core task + Runtime wakeup |
| Task 儲存 | PostgreSQL（heartbeatRuns + agentTaskSessions） | Core state（現 file-backed，未來 DB） |
| 觸發機制 | 內建 cron + event | 產品層 scheduler → runtime wakeup API |
| Budget check | heartbeat.ts 內做 | 產品層 dispatch 前查 runtime metering |
| Session 管理 | heartbeat.ts 內做 | Runtime 自行管理（已存在） |
| Workspace | heartbeat.ts 解析 | Runtime worktree isolation（已存在） |

**核心差異是架構選擇**：Paperclip 用一個 3,466 行的 god service 做所有事；
我們選擇分層，讓每一層各司其職。這意味著單一元件比較小、好測試、好替換，
但需要明確定義層間合約。

---

## 結論

- Task substrate **屬於 cats Core 層**
- cats-runtime wakeup substrate **不需要改動**，已提供足夠的觸發 API
- 產品層負責 task CRUD + assignment → wakeup hook + budget gate + completion callback
- 同一份 task 資料同時服務 Chat（背地使用）和 Work（檯面呈現）
- 這個做法符合既有的 ADR 分工原則，避免 runtime 膨脹成 Paperclip 的 god service

---

*本文件供 review 討論用，尚未構成正式 ADR 或 SPEC。
如 review 通過，建議拆分為一份 ADR（architectural decision）和一份 SPEC（implementation spec）。*
