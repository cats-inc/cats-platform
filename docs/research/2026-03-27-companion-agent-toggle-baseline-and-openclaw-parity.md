# Companion / Agent 一鍵切換研究：Baseline 技能工具組與架構調整

## Metadata

- **Date**: 2026-03-27
- **Author**: Codex
- **Scope**: `Cats Chat`（產品層）+ `cats-runtime`（執行層）+ `openclaw` submodule 參考狀態
- **Goal**: 支援「companion/agent 一鍵 toggle 的雙重人格」，且 `agent mode` 代理能力需對標 OpenClaw 目前最強能力帶
- **Related**:
  - [2026-03-20-openclaw-chat-runtime-gap-analysis](./2026-03-20-openclaw-chat-runtime-gap-analysis.md)
  - [2026-03-20-openclaw-killer-feature-gap-analysis](./2026-03-20-openclaw-killer-feature-gap-analysis.md)
  - [2026-03-26-companion-core-capabilities](./2026-03-26-companion-core-capabilities.md)

---

## 1) 目前進度快照（cats / cats-runtime / openclaw）

### 1.1 `cats`（產品層）

目前 `cats` 已是 chat-first 產品殼，並已完成：

- 以 `cats-runtime` 作為唯一執行邊界
- chat/work/code 平行產品樹
- orchestrator execution-loop 與 operator loop（approval/reroute/retry）
- companion-box（來源、衍生記憶、response-profile、session-context）
- Cats-owned canonical memory/retrieval 基礎

但仍處於「Launch Track In Progress」：

- Chat 仍有待補（例如更深的 automation、group replan、escalation/takeover）
- companion 能力有基礎資料層，但尚未成為「一鍵雙人格」產品體驗
- 目前仍缺少明確的 companion ↔ agent mode 切換契約（UI 與 runtime request contract）

### 1.2 `cats-runtime`（執行層）

`cats-runtime` 目前已具備關鍵代理執行底座：

- `cli + api + agent` 三類 backend
- runtime-managed skills（含 catalog、hydration、delivery mode）
- local tool runtime（檔案/搜尋/shell/patch 等）
- MCP facade（HTTP + stdio）
- usage guardrail、diagnostics、session lifecycle

其中 **Agent Backend = In Progress**，但已落地：

- OpenClaw gateway adapter（`openclaw_gateway`）
- 第二驗證目標 agent SDK bridge
- OpenClaw health/model/tool catalog 的第一層診斷接軌

未完成重點是：

- broader remote tool discovery
- 更完整 agent-target semantic probes
- 更深的工具能力語義驗證與政策分層

### 1.3 `openclaw` submodule 狀態（本 repo 內）

在此 monorepo 內，`openclaw` 是已登記 submodule 依賴（`.gitmodules` 有 path+url）；
但目前工作樹顯示為未初始化內容（根目錄僅資料夾、無 checkout 檔案），代表此 repo 當前狀態下**無法直接在本地對 openclaw 原始碼做最新實作比對**。

因此本研究的 OpenClaw 對標基準採用：

1. 既有研究文件中已紀錄的 OpenClaw 能力地圖
2. `cats-runtime` 已宣告並已實作的 OpenClaw adapter 能力

> 結論：你現在可以先做「對標等級契約」而不是被 submodule checkout 狀態阻塞。

---

## 2) 目標定義：雙人格 toggle 要解的不是 UI，而是「契約切換」

你要的「companion/agent 一鍵 toggle」本質上有三層：

1. **Interaction Contract（互動契約）**
   - companion mode：關係連續性、角色感、低干擾、偏對話
   - agent mode：任務完成、工具導向、可中斷重規劃、可追蹤治理

2. **Execution Contract（執行契約）**
   - 同一 Cat identity，可切換不同 runtime strategy / skill bundles / tool policy

3. **Governance Contract（治理契約）**
   - 哪些動作需要 owner approval
   - 哪些通道可自動執行（尤其 transport）

如果只做 UI toggle，不會達到 OpenClaw 等級；
必須把 toggle 直接連到 runtime request + skill/tool policy 選擇。

---

## 3) Baseline 技能與工具組（先求「可用代理人」，再談最強）

以下是建議的 **MVP baseline（必備）**，可讓 agent mode 達到「可靠可用」；
再往上堆到 OpenClaw parity。

### 3.1 Skills Baseline（runtime-managed skills）

#### A. `companion-core`（預設）

- identity/style/presence 指令層（語氣、回應長度、打擾閾值）
- memory recall discipline（只拉必要記憶，避免過度工具化）
- transport-safe response formatting（短句、可 chunk）

#### B. `agent-core`（toggle 後主 skill）

- task intake normalization（目標、限制、完成定義）
- plan-execute-report loop（最小可追蹤步驟）
- blocked-state policy（需升級時回報、請求 reroute）
- retry-safe semantics（避免重複副作用）

#### C. `agent-openclaw-parity-pack`（對標包）

聚焦 OpenClaw 強項：

- queue mode policy（steer/followup/collect 對等語義）
- transport chunking policy
- pre-compaction memory flush discipline
- cross-session subagent messaging policy
- exec approval + escalation protocol

### 3.2 Tools Baseline（runtime tool policy）

#### 必備 `standard` 集

- `read_file`, `read_files`, `list_files`, `inspect_path`, `grep`, `glob`
- `run_shell`（受政策限制）
- `apply_patch`, `write_file`, `edit_file`（需要 approval gate）

#### 代理必備控制面工具

- session inspect/observe
- provider diagnostics
- runtime skills catalog
- maintenance / compaction follow-through 回報

#### OpenClaw 對標增補工具語義

- queue management controls（中斷/排隊/合併）
- transport delivery controls（chunk / coalesce / thread reply）
- subagent messaging primitives（list/send/history）
- memory flush trigger + durable note write primitives

---

## 4) 一鍵 Toggle 的建議架構（不破壞現有分層）

### 4.1 `cats` 產品層：新增 mode contract（不改 runtime boundary）

在 `Cats Chat` 增加 `personaMode`：

- `companion`
- `agent`

並在每次 dispatch 時，送出結構化 execution hints（而非散落 prompt）：

- `personaMode`
- `requestedSkillProfiles[]`
- `toolPolicyProfile`（read_only / standard / extended）
- `approvalPolicyRef`
- `transportPolicyRef`

> 關鍵：`cats` 只決定「意圖與政策」，不直接綁死 provider 或 backend 細節。

### 4.2 `cats-runtime` 執行層：新增 mode-aware policy resolver

在 runtime 端增加統一 resolver：

- 輸入：session metadata + message request hints
- 輸出：
  - resolved skill bundles
  - resolved tool capability profile
  - execution strategy family
  - approval hooks requirement

這讓同一 session 可在 turn-level 切換行為（受政策保護）。

### 4.3 Agent Backend（OpenClaw adapter）強化點

為對標 OpenClaw 強代理能力，建議優先補三件：

1. **Remote tool catalog semantic map**
   - 不只列舉工具，還要映射到 runtime capability taxonomy
2. **Queue/interrupt semantics bridge**
   - 將 OpenClaw queue mode 抽象成 runtime-neutral contract
3. **Session-memory lifecycle bridge**
   - 對齊 pre-compaction flush 與 maintenance hooks

---

## 5) 建議分期（務實可交付）

### Phase 0（本週可啟動）

- 定義 `personaMode` request/response contract（Cats API + runtime metadata）
- 定義 `agent-core` / `companion-core` skills baseline
- 建立 `toolPolicyProfile` 三層：`read_only`, `standard`, `extended`

### Phase 1（先做可用 agent mode）

- UI 一鍵 toggle 串接上述 contract
- Agent mode 預設使用 `agent-core + standard tools + approval-required mutations`
- 補觀測：mode 切換後每 turn 實際套用 skill/tool policy 的 inspectability

### Phase 2（OpenClaw parity 第一階）

- queue mode（steer/followup/collect）runtime 契約落地
- transport chunking / coalescing
- pre-compaction memory flush 自動化

### Phase 3（OpenClaw parity 第二階）

- subagent messaging primitives
- 更完整 remote tool semantic probes
- escalation/takeover 全鏈路（含 transport）

---

## 6) 風險與防呆

### 6.1 主要風險

- 只做 UI toggle，沒有 runtime policy resolver（會變成假切換）
- agent mode 工具權限過大，缺少 approval gate
- companion mode 被 agent 工具語氣污染，失去陪伴體驗

### 6.2 防呆設計

- 預設 `companion => read_only/standard`，禁止高風險 mutation
- `agent => standard` 起步，`extended` 一律 owner 明確授權
- 所有高風險工具呼叫帶 `policy reason + approval trail`

---

## 7) 可執行結論

若你的目標是：

- 在 Cats Chat 內一鍵切換 companion/agent
- agent mode 仍對標 OpenClaw 最強代理能力

那麼最短路徑是：

1. 先把 toggle 變成「mode-aware execution contract」
2. 立刻建立 `companion-core` / `agent-core` / `agent-openclaw-parity-pack`
3. 在 `cats-runtime` 補 mode-aware policy resolver + queue/memory lifecycle bridge
4. 再逐步追上 OpenClaw 的 queue/subagent/transport 細節成熟度

這條路能保持既有架構原則：

- `cats` 仍是產品與治理層
- `cats-runtime` 仍是唯一執行邊界
- OpenClaw 以 adapter 能力吸收，而不是把產品綁回外部實作細節
