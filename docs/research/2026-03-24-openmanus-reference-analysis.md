# OpenManus Reference Analysis for Cats Ecosystem

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: 從 OpenManus（FoundationAgents）中提取對 Cats 有參考價值的設計與實作
- **Source**: `OpenManus/` submodule（MIT 授權，MetaGPT 團隊，Python，~6,449 行）
- **Related**:
  - `cats/docs/research/2026-03-24-cats-code-peer-review-workflow.md`
  - `cats/docs/research/2026-03-24-cats-work-aggregator-and-mesh-vision.md`
  - `cats/docs/research/2026-03-24-structured-choices-design-reference.md`
  - `cats/docs/research/2026-03-24-task-substrate-as-heartbeat-foundation.md`

---

## 概述

OpenManus 是 MetaGPT 團隊的開源 AI agent 框架，定位為開源版 Devin。
本文件不評估 OpenManus 的整體成熟度，只聚焦於**對 Cats 有直接參考價值的部分**。

---

## 參考項目 1: PlanningFlow（Multi-Agent Task Decomposition）

### OpenManus 的做法

`OpenManus/app/flow/planning.py`

- 大任務進來 → LLM 自動拆成多個 step
- 每個 step 分派給不同的 specialist agent（Manus / DataAnalysis / SandboxAgent）
- 有完整的 step 狀態追蹤（pending → running → completed / failed）
- Plan 可以在執行過程中動態調整（新增 / 修改 step）

### 對 Cats 的參考價值

**直接對應 Boss Cat 的 dispatch 行為：**

```
Owner: 「幫我做一個有登入功能的 landing page」

Boss Cat（PlanningFlow 等價物）:
  Step 1: 設計 UI mockup → assign Designer Cat
  Step 2: 實作 auth module → assign Coder Cat A
  Step 3: 實作 landing page → assign Coder Cat B（依賴 Step 1）
  Step 4: Review → assign Peer Cat A + B（依賴 Step 2, 3）
  Step 5: 整合測試 → assign QA Cat（依賴 Step 4）
```

**可借鑑的設計：**

- **Step 狀態機**：OpenManus 用 `not_started` / `in_progress` / `completed` /
  `blocked` — 跟我們的 `CoreTaskStatus` 幾乎一致
- **動態 re-planning**：執行到一半發現需要額外步驟，LLM 可以修改 plan —
  Boss Cat 也需要這個能力
- **Agent 選擇邏輯**：PlanningFlow 根據 step 的性質選 specialist —
  Boss Cat 根據 SKILL.md capabilityTags 選 Cat

**我們已有但 OpenManus 沒有的：**

- Task substrate 的 DB 持久化（OpenManus 只在 memory 中）
- Approval gate（OpenManus 的 plan 不需要 owner 批准）
- Budget pre-check（OpenManus 不追蹤 cost）

### 建議

PlanningFlow 的 step decomposition 邏輯可作為 Boss Cat dispatch prompt
的 reference。不需要移植 code，但 plan 的資料結構和 re-planning 機制
值得在 orchestrator SKILL.md 中參考。

---

## 參考項目 2: A2A Protocol 整合

### OpenManus 的做法

`OpenManus/protocol/a2a/`

- 實作了 Google 的 Agent-to-Agent protocol
- Agent 暴露為 JSON-RPC 2.0 endpoint
- 有標準的 agent-card（能力宣告）
- 支援 task 的 send / get / cancel

### 對 Cats 的參考價值

**直接對應 mesh network 的跨節點通訊：**

我們的 monorepo 裡 `docs/a2a/` 已有 A2A 的 agent-card 和 task example files。
OpenManus 有**跑通的實作**可以對照。

**Mesh 場景下的用途：**

```
Node A (cats-runtime) ── A2A ── Node B (cats-runtime)
                                  │
                            A2A agent-card:
                            {
                              "name": "node-b",
                              "capabilities": ["code_gen", "review"],
                              "provider": "claude",
                              "available_quota": "80%"
                            }
```

- 每個 cats-runtime node 暴露 A2A agent-card，宣告自己的能力
- Hub 透過 A2A 發現節點、dispatch task、收集結果
- 不需要自己發明 discovery protocol — A2A 已經定義好了

**比自造協議的好處：**

- Google 維護的開放標準，有生態系
- 已有多個框架支援（OpenManus、LangChain、CrewAI）
- Agent-card 的 capability 宣告跟 SKILL.md 的 capabilityTags 天然對應
- Task 的 send / get / cancel 跟 CoreTaskRecord 的 lifecycle 對應

### 建議

Mesh network 的 Phase 1（Star Topology）可以直接採用 A2A protocol
作為節點間通訊標準，而不是自建協議。OpenManus 的 `protocol/a2a/`
實作可作為 cats-runtime A2A adapter 的 reference。

---

## 參考項目 3: AskHuman Tool（Human-in-the-Loop 中斷）

### OpenManus 的做法

`OpenManus/app/tool/` 中的 AskHuman tool

- Agent 跑到不確定的地方 → 呼叫 AskHuman tool
- 執行暫停，等待人類輸入
- 人類回覆後，agent 繼續執行

### 對 Cats 的參考價值

**這就是 structured choices 的 runtime 端對應物：**

- Cat 在 session 中遇到需要 owner 決策的時刻
- Cat 呼叫一個類似 AskHuman 的 tool → session 暫停
- 產品層收到暫停事件 → 在 Chat UI 中渲染 structured choices
- Owner 選擇後 → 回覆送回 session → Cat 繼續

**跟我們既有架構的對應：**

- OpenManus 的 `AskHuman` → Cat 的 structured choices output
- OpenManus 的 tool call 暫停 → cats-runtime session 的 `busy` → `ready` 狀態轉換
- OpenManus 的人類回覆 → 產品層 `POST /sessions/:id/messages` 送回選擇結果

**差異：**

- OpenManus 的 AskHuman 是純文字 prompt（問什麼由 agent 自己寫）
- 我們的 structured choices 是結構化 JSON（帶 options、multiSelect、allowSkip）
- 我們的做法 UX 更好（按鈕 vs 打字），但底層的中斷/恢復機制相同

### 建議

AskHuman 的中斷/恢復模式確認了 structured choices 的 runtime 端不需要
特殊機制 — 就是一個 tool call 讓 session 等待外部輸入，跟現有的
session message flow 完全一致。

---

## 參考項目 4: StrReplaceEditor（File Editing Tool）

### OpenManus 的做法

`OpenManus/app/tool/str_replace_editor.py`

- 四個操作：`view` / `create` / `str_replace` / `insert`
- 支援 undo（每次 edit 記錄 history）
- Path validation + 安全檢查
- 行號顯示 + 範圍限制（避免讀太多）

### 對 Cats 的參考價值

**Coder Cat 在 cats-runtime session 中編輯檔案時的 tool contract：**

- 跟 Claude Code 的 Edit tool 幾乎一樣的介面
- cats-runtime 的 `LocalToolRuntime` 已有 read / write / patch / grep / shell
- OpenManus 多了 **undo** — 如果 Peer Cat review 後要 revert 某個 edit，
  undo history 會很有用

### 建議

低優先。我們的 LocalToolRuntime 已經覆蓋核心操作。
Undo 功能可以作為未來 Coder Cat 工作流的增強參考。

---

## 不需要參考的部分

- **Browser automation（browser-use + Playwright）**：我們有 `browser-rpa-core`，
  且 Cats Code 的 preview 用 iframe + local dev server 就夠了
- **Daytona sandbox**：跳過，不符合我們的 native 軟體方向
- **Web search tools（Google / DuckDuckGo / Baidu）**：不是 Cats 的重點
- **Data analysis agent**：跟 Cats 定位不同
- **crawl4ai**：我們的 freelance-job-aggregator 已有自己的 scraping 框架
- **ComputerUseTool（desktop automation）**：我們有 `rpa-automate`

---

## 與其他 Research 的關係

| OpenManus 參考項 | 對應的 Cats Research |
|------------------|---------------------|
| PlanningFlow | Task Substrate + Peer Review Workflow（fan-out/converge） |
| A2A Protocol | Aggregator + Mesh Vision（跨節點通訊） |
| AskHuman | Structured Choices（runtime 端中斷/恢復） |
| StrReplaceEditor | （cats-runtime LocalToolRuntime 已覆蓋） |

---

## 結論

OpenManus 對 Cats 最有價值的 reference 是：

- **PlanningFlow** — Boss Cat dispatch 的 step decomposition 和 re-planning
  機制的實作參考
- **A2A protocol** — mesh network 可以直接採用的跨節點通訊標準，
  不需要自建 discovery protocol
- **AskHuman** — 確認 structured choices 的 runtime 端不需要新機制，
  跟現有 session message flow 一致

其餘部分我們已有對應的解決方案，不需要重複引入。

---

*本文件供 review 討論用。如 review 通過，A2A protocol 的採用建議
可提升為正式 ADR。*
