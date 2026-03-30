# Structured Choices in Chat: Design Reference from prompt-forge

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Cats Chat GUI interactive choice mechanism
- **Design Reference**: `prompt-forge/` subproject (same monorepo)
- **Related**:
  - `prompt-forge/src/components/ClarifyQuestions.tsx` — UI 元件參考
  - `prompt-forge/supabase/functions/enhance-prompt/providers/fleet.ts` — runtime 整合參考
  - `prompt-forge/supabase/functions/enhance-prompt/providers/types.ts` — 資料結構參考
  - `cats-platform/docs/research/2026-03-24-task-substrate-as-heartbeat-foundation.md` — 相關提議

---

## 問題

目前 Cats Chat 中，Cat（God Cat / Boss Cat / Lead Cat / Normal Cat）無法在聊天訊息中
附帶可點選的結構化選項。現有的互動機制只有：

- **Approval 決策按鈕**（Approve / Reroute / Reject）— 僅 Boss Cat dispatch plan 觸發，
  在右側 operator rail 中呈現
- **Incident 操作按鈕**（Retry / Acknowledge）— run 失敗時出現在 operator rail

沒有通用機制讓任何 Cat 在對話中向 owner 提問並呈現可點選的選項。

這與 `CLAUDE.md` 中的產品願景衝突：

> 發包工作前應與 owner 有幾輪互動，提供選項讓 owner 優化決策

---

## Design Reference: prompt-forge

monorepo 中的 `prompt-forge/` 子專案已實作了完整的「AI 生成結構化選項 → 使用者點選
回答 → 結果餵回 AI」的 flow，且底層支援 agent-fleet（cats-runtime 的前身）作為
AI provider。

### 資料結構

`prompt-forge/supabase/functions/enhance-prompt/providers/types.ts`：

```typescript
interface ClarifyQuestion {
  question: string;
  options: string[];
}

interface ClarifyResult {
  questions: ClarifyQuestion[];
}

interface AIProvider {
  clarify(systemPrompt: string, userPrompt: string): Promise<ClarifyResult>;
  enhance(systemPrompt: string, userPrompt: string): Promise<Response>;
}
```

### AI 端：如何生成選項

`prompt-forge/supabase/functions/enhance-prompt/providers/fleet.ts` 的 `clarify()` 方法：

- 建立 runtime session（`POST /sessions`）
- 送出 clarify prompt，要求 AI 回傳 JSON：
  `{"questions": [{"question": "...", "options": ["A", "B", "C"]}]}`
- 收集 NDJSON stream 的完整文字
- 解析 JSON，回傳 `ClarifyResult`
- 刪除 session

AI 可以判斷「不需要釐清」→ 回傳空陣列 `{"questions": []}`，直接進入下一步。

### UI 端：如何呈現選項

`prompt-forge/src/components/ClarifyQuestions.tsx`：

- 每個問題渲染為一排 **toggle buttons**（多選）
- 每個選項點擊後 toggle selected/unselected 狀態
- 額外的 `…` 按鈕可展開自訂文字輸入框
- 底部有 **確認** 和 **跳過** 按鈕
- 回答完成後，所有選擇拼成文字附在原始 prompt 後面送出

### 狀態機

`prompt-forge/src/pages/Index.tsx`：

```
idle → clarifying（等 AI 生成問題）
     → answering（使用者看到按鈕，點選回答）
     → enhancing（帶著答案做最終處理）
     → idle
```

### Runtime 整合

prompt-forge 的 fleet provider 使用的 API：

```
POST   /sessions                    → 建 session
GET    /sessions/:id                → 等 ready
POST   /sessions/:id/messages       → 送訊息（NDJSON stream）
DELETE /sessions/:id                → 清 session
```

**這跟 cats-runtime 的 HTTP API 完全相同**——cats-runtime 從 agent-fleet 演化而來，
這些端點都保留了。cats-runtime 不需要任何改動即可支援此 flow。

---

## 建議的 Cats Chat Contract

基於 prompt-forge 的 `ClarifyQuestion` 延伸，增加通用性：

```typescript
interface ChatMessageChoice {
  question: string;              // 問題文字
  options: ChatMessageOption[];  // 可選項
  allowCustom?: boolean;         // 對應 prompt-forge 的 "…" 按鈕
  allowSkip?: boolean;           // 對應 prompt-forge 的 Skip
  multiSelect?: boolean;         // 對應 prompt-forge 的 toggle 多選
}

interface ChatMessageOption {
  id: string;                    // 選項識別碼
  label: string;                 // 按鈕文字
  description?: string;          // tooltip 說明
  style?: 'primary' | 'secondary' | 'danger';
}

interface ChatMessage {
  // ...existing fields (id, body, senderName, senderKind, metadata)
  choices?: ChatMessageChoice[];  // Cat 附帶的結構化選項
}
```

### 與 prompt-forge 的差異

| 面向 | prompt-forge | Cats Chat（建議） |
|------|-------------|-------------------|
| 觸發點 | 固定在 enhance 前問一次 | 任何 Cat 在任何訊息都能附帶 |
| 嵌入方式 | 獨立 panel（transcript 外） | 嵌在聊天 transcript 的訊息內 |
| 選項來源 | clarify prompt 要求 AI 生成 | Cat 的 skill/prompt 指示或 runtime 結構化輸出 |
| 回傳方式 | 拼成文字附在 prompt 後面 | payload 送回對應 Cat session 繼續對話 |
| 多輪 | 單次 clarify → enhance | Cat 可多次提問，每次都帶 choices |
| 選項 metadata | 無（純文字） | 有 id + description + style |

### 可直接複用的 UI 邏輯

`ClarifyQuestions.tsx` 中以下邏輯可直接參考或移植：

- `toggleOption()` — 多選 toggle 狀態管理
- `toggleCustom()` / `setCustom()` — `…` 自訂輸入展開/收合
- `allAnswered` — 驗證所有問題都已回答
- `handleSubmit()` — 將多選 + 自訂輸入合併為最終回答
- CSS 樣式 — selected/unselected button 的視覺切換（已用 Tailwind）

---

## 實作路徑

### 需要改動的（cats 產品層）

1. **ChatMessage 擴充** — 加入 `choices?: ChatMessageChoice[]` 欄位
2. **Chat renderer** — 新增 `MessageChoices` 元件（參考 `ClarifyQuestions.tsx`），
   在訊息泡泡內渲染按鈕
3. **選擇回傳** — 使用者點選後，將 payload 透過現有的 message route 送回
   Cat 的 runtime session
4. **Cat prompt 指引** — 在 Cat 的 skill/prompt 中加入指示，告知 AI 可以回傳
   `{"choices": [...]}` 格式來觸發互動按鈕

### 不需要改動的

- **cats-runtime** — 現有 session/message API 已足夠。prompt-forge 用 agent-fleet
  （cats-runtime 前身）的同一套 API 已經跑通
- **Runtime message format** — NDJSON stream 中的 `type: "text"` 事件已能攜帶
  任何文字內容，包含 JSON 結構化輸出
- **Session lifecycle** — 不需要為 choices 建新 session 或改變 session 行為

---

## 使用場景

### 場景一：Boss Cat 派工前詢問 Owner

```
Boss Cat: 了解，你想做一個 landing page。我有幾個問題想確認：

  1. 你偏好哪種風格？
     [簡約現代] [企業正式] [活潑創意] [...]

  2. 需要哪些區塊？
     [Hero Banner] [功能介紹] [定價方案] [客戶見證] [...]

  3. 有沒有偏好的技術棧？
     [React + Tailwind] [Vue + UnoCSS] [純 HTML/CSS] [...]

  [確認] [跳過，直接開始]
```

### 場景二：Coder Cat 遇到設計決策

```
Coder Cat: 資料庫 schema 有兩種方案，各有取捨：

  方案 A 或方案 B？
  [A: 正規化，查詢彈性高] [B: 反正規化，讀取快]

  [選擇]
```

### 場景三：Boss Cat 在 Telegram 詢問（未來）

Telegram 本身支援 inline keyboard buttons，同一套 `choices` 結構可以映射為
Telegram 的 `InlineKeyboardMarkup`，不需要額外的資料結構。

---

## 結論

- prompt-forge 已驗證「AI 生成結構化選項 → 按鈕 UI → 回傳繼續對話」的完整 flow
- 底層使用的 runtime API 跟 cats-runtime 相同，不需要 runtime 端改動
- UI 元件（`ClarifyQuestions.tsx`）的邏輯可直接參考移植
- Cats Chat 需要的是將此機制從「固定兩階段 flow」泛化為「任何 Cat 任何訊息都能用」
- 建議將 `ChatMessageChoice` contract 納入 Chat renderer 的工作範圍（Team 1）

---

*本文件供 review 討論用。如 review 通過，建議納入 Cats Chat 的 SPEC 或
既有 SPEC 的補充章節。*
