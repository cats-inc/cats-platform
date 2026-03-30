# Cats Code: Peer Review Workflow with Parallel Cats

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Cats Code 產品面的 peer review 工作流
- **UI Layout**: 未定 — 本文件不涉及具體 UI 排版設計
- **Related**:
  - `cats-platform/docs/research/2026-03-24-task-substrate-as-heartbeat-foundation.md`
  - `cats-platform/docs/research/2026-03-24-structured-choices-design-reference.md`
  - `cats-platform/docs/specs/SPEC-020-embedded-preview-surfaces-for-runtime-artifacts-and-services.md`
  - `cats-platform/docs/plans/PLAN-016-dynamic-room-workflow-orchestration.md`
  - `cats-runtime/docs/specs/SPEC-003-agent-backend.md`

---

## 背景

Cats Code 面向兩種使用者：

- **不會寫程式的人**：透過 structured choices（SKILL.md 注入的釐清問題）確認需求
  後，由 Coder Cat 全權處理
- **會寫但懶得寫的人**：更在意品質保證。常見做法是 peer review，且為了效率會設
  2 個 Peer 同時 review，形成 **1 Coder + 2 Peers 的 pair programming 模式**

本文件探討第二種場景的工作流設計。

---

## 工作流定義

### 角色

- **Owner**：發起需求、最終決策者
- **Boss Cat**（或 Lead Cat）：orchestrator，負責派工和匯總
- **Coder Cat**：負責寫程式
- **Peer Cat A / B**：負責 review，各自獨立產出意見

### Flow

```
Owner 發需求
  → Boss Cat 釐清需求（structured choices，如需要）
  → Boss Cat 建 task，assign 給 Coder Cat
  → Coder Cat 工作
  → Coder Cat 完成，產出結構化摘要
  → Boss Cat 觸發 fan-out：同時 dispatch 兩個 review task
    → Peer Cat A review（獨立 session）
    → Peer Cat B review（獨立 session）
  → 兩個 Peer 都完成（converge）
  → Boss Cat 匯總兩份 review，呈現給 Owner
  → Owner 決策：全部採納 / 挑選採納 / 要求修改 / 跟 Coder 討論
  → （如需修改）Coder Cat 根據 review 修改 → 可能再次觸發 review cycle
```

### 觸發條件

- **自動觸發**：Coder Cat 完成時自動進入 review（適合不會寫程式的 Owner）
- **手動觸發**：Owner 確認 Coder 產出後才觸發 review（適合會寫程式的 Owner，
  可能先自己看過）
- **可選觸發**：Owner 事先設定此 task 不需要 review，直接跳過

---

## 技術可行性分析

### 已有能力

**Multi-cat 並行執行**
- cats-runtime 支援多個 session 同時運行
- 每個 Peer Cat 有獨立 session，互不干擾
- Session observe API（SSE/NDJSON）可即時追蹤每個 session 的進度

**Orchestrator dispatch**
- Boss Cat 可 dispatch task 給多隻 Cat（現有 orchestration 合約）
- Task substrate（見相關 research）提供 assignment → wakeup 的串接

**結構化輸出**
- SKILL.md 注入機制可教 Cat 輸出特定 JSON 格式
- Structured choices 機制（見相關 research）可讓 Cat 呈現決策選項
- Renderer 解析 JSON 並渲染為互動元件

**Session observe 即時回饋**
- 每個 session 的 progress events 可即時推送到前端
- 前端可同時 subscribe 多個 session 的 observe stream

### 需要新做的

**Fan-out / Converge workflow**
- Boss Cat 同時 dispatch 多個 task（fan-out）
- 等所有 task 完成後匯總（converge）
- PLAN-016 已設計此 pattern 但尚未實作
- 最小實作：Boss Cat prompt 中描述 fan-out 行為 + 產品層追蹤多個
  task 的 status，全部 completed 後通知 Boss Cat 匯總

**Canvas / Preview 呈現**
- Coder Cat 的程式碼摘要和 Peer Cat 的 review 結果需要一個
  結構化呈現面（非純 chat transcript）
- SPEC-020 已定義 embedded preview surfaces 的概念
- 具體 UI layout 不在本文件範圍

**Review-specific SKILL.md**
- Peer Cat 需要注入 review skill，指導其輸出結構化的 review 結果
- Coder Cat 需要注入 summary skill，指導其在完成時輸出結構化摘要

---

## SKILL.md 設計

### coder-summary skill（Coder Cat 注入）

指導 Coder Cat 在完成一段工作後輸出結構化摘要：

```json
{
  "coderSummary": {
    "title": "User Auth Module",
    "description": "實作了 JWT-based auth，包含 login/register/refresh",
    "filesChanged": ["src/auth/jwt.ts", "src/middleware/guard.ts"],
    "keyDecisions": [
      "選用 jose 而非 jsonwebtoken（更輕量）",
      "token expiry 設為 1 小時"
    ],
    "reviewFocus": ["安全性", "error handling", "edge cases"]
  }
}
```

### review-summary skill（Peer Cat 注入）

指導 Peer Cat 輸出結構化的 review 結果：

```json
{
  "reviewSummary": {
    "score": 8,
    "verdict": "approve_with_suggestions",
    "highlights": ["JWT 實作正確", "middleware 結構清晰"],
    "concerns": [
      {
        "severity": "suggestion",
        "file": "src/auth/jwt.ts",
        "line": 42,
        "description": "token expiry 建議改成 15 分鐘"
      },
      {
        "severity": "warning",
        "file": "src/middleware/guard.ts",
        "description": "缺少 rate limiting 保護"
      }
    ]
  },
  "choices": [
    {"id": "approve", "label": "採納此 Review", "style": "primary"},
    {"id": "revise", "label": "要求修改", "style": "secondary"}
  ]
}
```

### 兩個 Peer 的差異化

兩個 Peer Cat 可注入不同 focus 的 review skill：

- **Peer A**：focus 在正確性、安全性、edge cases
- **Peer B**：focus 在可讀性、架構品質、效能

這樣兩份 review 會從不同角度出發，減少重複，增加覆蓋面。
差異化透過 SKILL.md 的 prompt 指引實現，不需要程式碼差異。

---

## 與 Task Substrate 的整合

Peer review workflow 自然對應到 task substrate：

```
Boss Cat 建 task (type: "implementation")
  → assign Coder Cat
  → Coder Cat checkout → in_progress → completed
  → Boss Cat 建 2 個 sub-tasks (type: "review", parentTaskId: 上面的 task)
    → assign Peer A → wakeup trigger
    → assign Peer B → wakeup trigger
  → Peer A completed + Peer B completed
  → Boss Cat 查詢 parent task 的所有 sub-tasks 都 completed
  → converge：匯總 review 結果，呈現給 Owner
  → Owner 決策（structured choices）
  → 更新 parent task status
```

task 的 `parentTaskId` 欄位（`CoreWorkItemRecord` 已有 `parentWorkItemId`）
天然支援這種 parent → sub-task 的 fan-out 結構。

---

## Coder Cat 的工作產出與 Preview

Coder Cat 完成工作後，產出可能包括：

- **程式碼變更**（diff / 新檔案）
- **本地 dev server**（如果是 web app，可自動 `npm run dev`）
- **結構化摘要**（上面定義的 coder-summary JSON）

cats-runtime 已有的支援：

- **Delivery primitives**（commit、push）— 已實作
- **Browser preview substrate**（page lifecycle、session 綁定）— 已實作
- **Workspace isolation**（worktree-backed）— 已實作

缺的是產品層把這些串成「Coder Cat 寫完 → 自動 deploy 到 local dev server →
preview 可在 Canvas 中嵌入檢視」的 end-to-end flow。

---

## Owner 的決策點

Review 完成後，Owner 面對的決策（透過 structured choices 呈現）：

- **全部採納**：接受兩個 Peer 的所有建議，派 Coder Cat 修改
- **挑選採納**：Owner 逐一選擇哪些建議要採納（每個 concern 可獨立 accept/dismiss）
- **要求修改**：退回給 Coder Cat，附帶額外指示
- **討論**：開啟跟 Coder Cat 的對話，針對特定 concern 深入溝通
- **略過 Review**：Owner 自己看過覺得沒問題，直接 approve

---

## 迭代 Review（多輪）

修改後可能需要再次 review：

- **自動 re-review**：Coder Cat 修改完自動觸發新一輪 review
- **差異 review**：第二輪 Peer Cat 只看 diff，不重看全部（透過 skill prompt 指引）
- **Owner 可設定 review 輪數上限**：避免無限迴圈（例如最多 3 輪）
- **快速通道**：如果修改幅度小（只改了 Peer 指出的問題），可由 Boss Cat 判斷
  不需要再次 full review，只做 sanity check

---

## 與其他 Research 的關係

- **Task Substrate**（`2026-03-24-task-substrate-as-heartbeat-foundation.md`）：
  提供 task CRUD、fan-out sub-tasks、assignment → wakeup 觸發
- **Structured Choices**（`2026-03-24-structured-choices-design-reference.md`）：
  提供 Owner 決策的互動 UI 機制
- **SPEC-020**（Embedded Preview Surfaces）：
  提供 Canvas 嵌入 preview 的概念框架
- **PLAN-016**（Dynamic Room Workflow Orchestration）：
  提供 fan-out / converge 的 workflow pattern 設計

這四份文件加上本文件，構成了 Cats Code peer review 場景的完整技術基礎。

---

## 結論

- 1 Coder + 2 Peers 的 parallel review workflow **技術上可行**
- 核心依賴：multi-session 並行（已有）、task substrate fan-out（需實作）、
  structured output SKILL.md（需撰寫）、Canvas 呈現（需實作，layout 未定）
- 透過 SKILL.md 差異化兩個 Peer 的 review focus，可以用同一套機制
  產出互補的 review 結果
- Owner 的決策點透過 structured choices 呈現，支援全部採納、挑選、退回、討論
- 整個 flow 不需要 cats-runtime 新增功能，產品層串接即可

---

*本文件供 review 討論用。UI layout 設計不在本文件範圍，待另行定義。
如 review 通過，建議納入 Cats Code 的 SPEC 規劃。*
