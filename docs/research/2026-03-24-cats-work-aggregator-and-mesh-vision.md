# Cats Work: Freelance Aggregator Pipeline and Distributed Agent Mesh

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Cats Work 產品定位、freelance 自動接案 pipeline、分散式 agent mesh
- **Related**:
  - `freelance-job-aggregator/` — 現有 scraping + matching + pipeline 基礎設施
  - `cats-platform/docs/research/2026-03-24-task-substrate-as-heartbeat-foundation.md`
  - `cats-platform/docs/research/2026-03-24-cats-code-peer-review-workflow.md`
  - `cats-platform/docs/research/2026-03-24-structured-choices-design-reference.md`
  - `cats-runtime/docs/decisions/009-keep-cats-runtime-separately-packageable-with-app-managed-local-startup.md`
  - `ws-gateway/` — 現有 event bus（pub/sub + webhook）

---

## 核心主張

Cats Work 不只是一個「看 task 的 dashboard」。它的終極定位是：

> **一個自動化的接案到交付 pipeline，讓一個人用 AI 跑整間接案公司，
> 並可擴展為分散式 agent mesh 讓多人合力開發大型專案。**

---

## Part 1: Freelance Aggregator Pipeline

### 願景

```
自動爬案子 → AI 評估 ROI → 自動寫 proposal → Owner 決定接不接
→ Boss Cat 拆 task → Coder Cat 實作 → Peer Cat review
→ Owner final review → 交付 → 收錢 → 下一案
```

Owner 只在關鍵決策點介入，其他全自動。

### 現有基礎設施（freelance-job-aggregator）

`freelance-job-aggregator/` 已實作的能力：

**Scraping & Data**
- 多平台爬蟲框架（httpx adapter + Firecrawl adapter）
- Job normalizer（跨平台欄位標準化）
- Scraping run 追蹤（狀態、歷史）
- PostgreSQL 持久化（Alembic migration）

**智慧分析**
- GenAI analyzer（AI 驅動的 job 分析）
- Embedding service（向量化 job 描述）
- Clustering engine（相似 job 分群）
- Group manager（job 群組管理）

**匹配與評估**
- Matching service（skill-based job 匹配）
- ROI analysis model（投資報酬率估算）
- Cost estimate model（成本估算）
- Skill gap analysis（技能缺口分析）

**Pipeline 管理**
- Pipeline 狀態追蹤（Zustand store）
- Proposal 生成（AI-powered）
- Market intelligence（市場趨勢分析）
- Simulator（收益模擬）

**前端**
- Dashboard（統計、篩選、搜尋）
- Pipeline view（看板式案件管理）
- Job detail panel（案件詳情）
- Proposal modal（提案撰寫）
- Skill profile panel（技能管理）

### 與 Cats 的整合路徑

**Phase 1: Cats Work 消費 aggregator 資料**

- freelance-job-aggregator 作為資料源，定期爬案子、算 matching score
- Cats Work dashboard 從 aggregator API 拉資料，呈現在 Work 介面中
- Owner 在 Cats Chat 中收到 Boss Cat 通知：「找到 3 個高匹配案子，要看嗎？」
- Owner 透過 structured choices 決定要不要進一步評估

**Phase 2: 自動 proposal + Owner 審核**

- Boss Cat 對高匹配案子自動生成 proposal draft
- Owner 審核 proposal（approve / edit / reject）
- Approve 後自動投遞（透過各平台 API 或 RPA）

**Phase 3: 自動實作 + 交付**

- 接到案子 → Boss Cat 建 CoreTaskRecord（task substrate）
- Boss Cat 拆解需求 → 建 sub-tasks → assign 給 Coder Cat(s)
- Coder Cat 在 cats-runtime session 中實作
- Peer Cat review（1 Coder + 2 Peers workflow）
- Owner final review → approve delivery
- 交付成果 → 更新 pipeline 狀態 → 記錄收入

**Phase 4: 閉環優化**

- 每次交付後記錄：實際花費時間 / token cost / 客戶滿意度
- 回饋到 ROI model，改善未來的案件評估
- Boss Cat 學習 owner 的接案偏好（Know Your Boss）
- Skill gap analysis 指導 owner 或 Cat 精進哪些技能

### Owner 決策點（structured choices）

整個 pipeline 中 owner 只需要在以下節點介入：

- **接案決策**：「這個案子要接嗎？」→ [接] [跳過] [稍後再看]
- **Proposal 審核**：「Proposal draft 如下，要送出嗎？」→ [送出] [修改] [放棄]
- **需求釐清**：Boss Cat 對需求有疑問 → structured choices 問 owner
- **Delivery 審核**：「完成了，要交付嗎？」→ [交付] [要求修改] [跟 Coder 討論]
- **異常處理**：budget 超標、deadline 壓力、客戶追加需求 → escalation

---

## Part 2: Distributed Agent Mesh

### 願景

類似 SETI@Home 的分散式運算，但目的不是找外星訊號，而是
**讓多人貢獻自己的 AI subscription 閒置產能，合力開發軟體專案**。

```
參與者 A（Claude Pro，台北）    ──┐
參與者 B（Codex，東京）          ──┼── Mesh Network ── 大型專案
參與者 C（Cursor Pro，舊金山）   ──┤
參與者 D（Gemini，倫敦）         ──┘
```

每個參與者：
- 跑一個 cats-runtime instance（`npx cats-runtime`）
- 貢獻自己的 CLI subscription token（Claude / Codex / Cursor / ...）
- 閒置時間自動接 task、跑 review、做 implementation
- 按貢獻（完成的 task 數量 / token 消耗 / 品質分數）分潤

### 為什麼可行

**訂閱制的浪費問題**

多數人付了 AI subscription 月費，實際使用量遠低於 quota 上限。
閒置的 subscription 就是浪費的錢。Mesh 把這些閒置產能匯聚起來，
對參與者來說是**零額外成本的被動收入**。

**cats-runtime 的架構天生支援**

- **Multi-backend**：不管參與者用的是 Claude、Codex、Gemini 還是 Ollama，
  cats-runtime 都能抽象成統一的 session 介面
- **Separately packageable**（ADR-009）：`npx cats-runtime` 一行指令加入 mesh
- **Standalone mode**：不依賴 cats 產品層即可獨立運行
- **Skill injection**：每個 task 帶著 SKILL.md，不管哪個節點接到都知道怎麼做
- **Workspace isolation**：worktree-backed session 保證各 task 互不干擾
- **Usage metering**：已有 token 追蹤，可作為貢獻度計算基礎

### 需要新建的

**Discovery Layer — 節點發現**

- 每個 cats-runtime instance 啟動時向 registry 註冊
- 暴露自己的能力（支援哪些 provider、目前負載、可用 quota）
- 心跳保持在線狀態

**Routing Layer — 工作分配**

- 接收 task 請求 → 根據 task 需求（provider 偏好、skill 需求）匹配節點
- 負載均衡（不要把所有 task 塞給同一個節點）
- Failover（節點離線 → 自動轉派）

**Trust & Quality Layer — 信任與品質**

- 節點信譽分數（完成率、品質、速度）
- Task 結果驗證（peer review 可以跨節點）
- 惡意節點防護（輸出品質低於閾值 → 降權）

**Settlement Layer — 結算**

- 貢獻度追蹤（task 完成數 × 複雜度 × 品質分）
- Token 消耗記錄（cats-runtime metering 已有基礎）
- 分潤計算與發放

### 拓撲模型

**Phase 1: Star Topology（中心化調度）**

```
         ┌─ Node A
Hub ─────┼─ Node B
         ├─ Node C
         └─ Node D
```

- 一個中心 Hub 負責 task dispatch 和結算
- 最簡單，先跑通 flow
- Hub 可以是 owner 自己的機器或雲端服務
- ws-gateway 可擴展為 Hub 的 event routing 層

**Phase 2: Federated Topology（聯邦制）**

```
Hub-1 ──── Hub-2
  │          │
  ├─ A       ├─ D
  ├─ B       └─ E
  └─ C
```

- 多個 Hub 各自管一群節點
- Hub 之間可以互相轉派 task
- 類似 Mastodon 的聯邦模式

**Phase 3: Full Mesh（去中心化）**

```
A ─── B
│ ╲ ╱ │
│  ╳  │
│ ╱ ╲ │
C ─── D
```

- 每個節點都能直接通訊
- 去中心化調度（需要共識機制）
- 最終願景，但複雜度最高

### 與 ws-gateway 的關係

現有的 `ws-gateway/`（port 8050）已經是 pub/sub + webhook 的 event bus。
擴展路徑：

- **現在**：單機內 cats ↔ cats-runtime 的事件路由
- **Phase 1**：加入跨網路的 node registration + task dispatch
- **Phase 2**：Hub-to-Hub federation protocol
- **Phase 3**：P2P discovery（mDNS / DHT / relay）

### 類比

| 概念 | 傳統類比 | Cats Mesh |
|------|---------|-----------|
| 參與者貢獻的資源 | CPU cycles（SETI@Home） | AI subscription quota |
| 工作單位 | Work unit（Folding@Home） | CoreTaskRecord |
| 品質驗證 | Redundant computation | Peer Cat cross-node review |
| 激勵機制 | 排行榜 / 公益 | 分潤 / 被動收入 |
| 資源閒置問題 | 電腦晚上不用 | AI subscription 月費付了但沒用完 |
| 進入門檻 | 安裝 BOINC client | `npx cats-runtime` |

---

## Part 1 + Part 2 的串接

Freelance aggregator pipeline 和 mesh 不是兩個獨立的東西，而是**同一條 pipeline
的兩種運行模式**：

**Default Mode（Part 1）**
- 一個人的 cats-runtime → 自己接案、自己做、自己交付
- 適合個人 freelancer

**Mesh Mode（Part 2）**
- 多人的 cats-runtime mesh → 一起接大案子、分工做、合力交付
- 適合需要多人協作的大型專案
- aggregator 找到大案子 → 評估需要多少人力 → 從 mesh 中招募節點
  → 分配 sub-tasks → 各節點實作 → cross-node peer review → 匯總交付

Owner 可以從 Default Mode 開始，驗證 pipeline 跑通後，再開放 Mesh Mode。

---

## 競爭定位

- **Paperclip**：管理 AI agent 的 dashboard → 不接案、不賺錢
- **OpenClaw**：個人 AI 助理 → 不接案、不賺錢
- **Upwork / Fiverr**：人工接案平台 → 要自己做
- **Devin / Cursor**：AI coding assistant → 幫你寫 code 但不幫你接案
- **Cats Work**：**從找案子到交付到收錢的全自動 pipeline + 可擴展為分散式 mesh**

沒有現有產品覆蓋這個完整 scope。

---

## 天條：Human-in-the-Loop 強制原則

> **初期所有關鍵動作都必須有人類明確按下同意，不得全自動執行。**

此原則的目的是避免觸發任何 provider TOS 或接案平台的使用條款問題。

**強制 approval gate 的動作（不可略過）：**

- **接案決策** — AI 推薦案子後，人類必須明確同意才進入 pipeline
- **Proposal 投遞** — AI 撰寫 proposal draft 後，人類必須審核並按下送出
- **實作啟動** — 拆完 task 後，人類必須同意才開始派工
- **交付確認** — 完成品必須經過人類 final review 才交付給客戶
- **Mesh 節點接 task** — 節點 owner 必須同意自己的 runtime 接受特定 task

**絕對不做的事：**

- 不自動投遞 proposal 到任何平台
- 不自動承諾 deadline 或報價
- 不自動交付成果給客戶
- 不在節點 owner 不知情的情況下消耗其 subscription quota
- 不繞過任何 provider 或平台的 TOS 限制

**設計含義：**

- pipeline 中每個階段的轉換都需要 structured choices 呈現給人類決策
- 即使未來 pipeline 成熟到品質可信賴，解除 approval gate 也必須是
  owner **逐項、明確 opt-in** 的行為，不設全域開關
- 此原則適用於 Default Mode 和 Mesh Mode

---

## 風險與考量

**Part 1 風險**
- 各接案平台的 TOS 限制 — 已由天條約束，初期所有投遞皆需人工確認
- 交付品質控制（AI 寫的 code 品質能否達到客戶期望）
- 客戶溝通（需求變更、追加需求）仍需人工介入

**Part 2 風險**
- 信任問題（參與者可能提交低品質結果）
- 資料安全（task 內容可能含敏感資訊）
- 法律問題（跨國分潤、稅務、契約責任）
- Provider TOS — 已由天條約束，節點 owner 必須明確同意每個 task

**緩解策略**
- Phase 1 先做 Default Mode，驗證 pipeline 後再開放 Mesh
- Mesh 初期限制為 trusted network（朋友 / 同事），不公開
- Cross-node peer review 作為品質 gate
- 敏感 task 只派給高信譽節點
- 所有動作遵守天條，人類 approval 不可被程式碼繞過

---

## 結論

- Cats Work 的定位從「task dashboard」提升為「自動化接案引擎 + 分散式開發 mesh」
- freelance-job-aggregator 已提供 scraping / matching / ROI / proposal 的基礎設施
- cats-runtime 的架構（multi-backend / standalone / metering / skill injection）
  天生適合 mesh 模式
- Default Mode 先行驗證，Mesh Mode 後續擴展
- 這個定位在現有市場中沒有直接競品

---

*本文件供 review 討論用，涵蓋產品願景層級的方向性思考。
具體實作規格待拆分為獨立的 SPEC 文件。*
