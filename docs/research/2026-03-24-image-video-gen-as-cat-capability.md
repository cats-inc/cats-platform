# Image/Video Generation as Cat Capability

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: 將 image/video generation 封裝為 Cat 的能力，非 API gateway
- **Related**:
  - `cats-runtime/src/core/browser/previewSurfaces.ts` — 已能辨認 image 副檔名
  - `cats-runtime/src/core/browser/RuntimeBrowserService.ts` — preview surface 註冊
  - `cats-runtime/docs/specs/SPEC-005-runtime-managed-skills-v0.md`
  - `cats-runtime/docs/decisions/011-runtime-owned-browser-preview-subsystem.md`

---

## 核心主張

> **Image/video generation 是 Cat 的一種能力（capability），不是 API gateway。
> Runtime 不代理 API、不管 API key、不做 rate limit。
> Cat 透過自己的 CLI subscription 呼叫 provider 提供的生成功能，
> 產出檔案存在 workspace，產品層負責呈現。**

---

## 為什麼不是 API Gateway

| | API Gateway 做法 | Capability 做法（本提議） |
|--|------------------|-------------------------|
| API key | Runtime 代管 | Cat 的 CLI subscription 自帶 |
| 呼叫方式 | Runtime 轉發 HTTP request | Cat 在 session 中自己呼叫 CLI tool |
| 計費 | Runtime 需要追蹤 | Provider 直接向 subscription owner 收費 |
| 產出 | API response（base64 / URL） | 檔案落在 workspace 目錄 |
| 錯誤處理 | Runtime 需要處理每個 provider 的 error | Cat 自己處理，回報成功或失敗 |
| 新 provider 支援 | Runtime 要加 adapter | 寫新的 SKILL.md 即可 |

**Capability 做法的好處**：Runtime 完全不需要懂 image generation 的細節。
對 runtime 來說，Cat 產出 `.png` 跟產出 `.ts` 沒有差別 — 都是 workspace 裡的檔案。

---

## 運作方式

### Cat 端（SKILL.md 注入）

宣告 Cat 擁有 image/video generation 能力：

```yaml
# SKILL.md frontmatter
family: work
role: designer
capabilityTags:
  - image_gen
  - video_gen
```

Prompt 指引（SKILL.md body）告訴 Cat：

- 你可以使用 provider 提供的 image generation tool
- 產出的檔案存到 workspace 的指定目錄（例如 `output/`）
- 回報產出的檔案路徑和 metadata（尺寸、格式、prompt used）
- 如果 provider 不支援或生成失敗，誠實回報

### Runtime 端（不需要改動）

cats-runtime 已有的機制足以支撐：

**Workspace**
- Cat 的 session 有獨立的 workspace 目錄（shared / isolated / worktree）
- 生成的檔案直接寫入 workspace，跟 code 產出無異

**Preview Surface 辨識**
- `previewSurfaces.ts` 已能辨認 image 副檔名：
  `.png` / `.jpg` / `.jpeg` / `.gif` / `.webp` / `.svg`
- 會自動標記 `mediaType: 'image/png'` 等
- 會設定 `renderHint: 'download'`（目前）

**Delivery Primitives**
- 已有 artifact publish / export 機制
- 生成的圖片可作為 delivery artifact 交付

**Usage Metering**
- 已有 token 追蹤
- 如果 provider 在 image gen 時消耗 token，metering 照常記錄

### 產品端（需要小幅擴充）

**Canvas / Chat 中顯示圖片**
- 目前 preview surface 的 `renderHint` 對 image 是 `'download'`
- 需要新增 `'inline_image'` 或類似的 render hint
- 產品層收到此 hint 後，用 `<img>` 直接顯示 workspace 中的檔案
- 影片同理，用 `<video>` 顯示

**圖片出現在對話中**
- Cat 的訊息中附帶圖片路徑 → renderer 偵測到圖片 → inline 顯示
- 類似 chat app 中傳圖片的體驗

---

## 支援的場景

### 場景一：Designer Cat 生成素材

```
Owner: 幫我的 landing page 做一張 hero image，科技感、藍色調

Boss Cat: 了解，派給 Designer Cat

Designer Cat:（透過 CLI provider 的 image gen tool 生成圖片）
Designer Cat: 生成了 3 張候選，請看：
  [圖片 1] [圖片 2] [圖片 3]
  你喜歡哪一張？

Owner: [選擇圖片 2]

Designer Cat: 好的，已存到 output/hero-image.png
```

### 場景二：Coder Cat 生成 placeholder 圖

```
Coder Cat 在實作 landing page 時，需要 placeholder 圖片
→ 自己呼叫 image gen tool 生成
→ 存到 public/images/
→ 直接引用在 code 中
→ Canvas 中可以看到跑起來的 page 含圖片
```

### 場景三：Marketing Cat 生成社群素材

```
Owner: 幫我做一張 Instagram post 圖

Marketing Cat: 你想要什麼風格？
  [簡約文字] [產品照風格] [插畫風格] [...]

Owner: [插畫風格]

Marketing Cat:（生成圖片）
  完成，已存到 output/ig-post.png
  [預覽圖片]
  要直接發布嗎？

Owner: [下載] [修改] [發布]
```

### 場景四：Video gen（未來）

同樣的模式適用於 video generation：
- Cat 呼叫 provider 的 video gen tool
- 產出 `.mp4` / `.webm` 存到 workspace
- Canvas 用 `<video>` 顯示
- 時間較長 → 可搭配 wakeup substrate（生成完通知 owner）

---

## 哪些 Provider 可能支援

不同 CLI provider 的 image gen 能力不同，但 capability 模型不需要
關心具體是哪個 provider：

- **Claude**：目前 CLI 不直接支援 image gen，但可透過 MCP tool 串接
- **Codex / OpenAI**：可能透過 DALL-E tool 生成
- **Gemini**：原生支援 image generation
- **Ollama + local model**：可串接本地 Stable Diffusion 等
- **未來的 provider**：只要 CLI 有 image gen 能力，寫 SKILL.md 即可支援

**重點：新增 provider 支援不需要改 runtime code，只需要新的 SKILL.md。**

---

## 品質與限制

**不保證產出品質**
- Image/video generation 的品質完全取決於 provider 和 model
- Cat 可以在 prompt 中盡可能描述需求，但最終品質不由我們控制
- Owner 的 approval gate（structured choices）是品質控制的最後一道防線

**不保證一定能生成**
- Provider 可能拒絕（content policy）
- Provider 可能暫時不可用（rate limit / downtime）
- Cat 應該誠實回報失敗，不要硬湊

**不做 prompt engineering 代管**
- Cat 的 SKILL.md 可以提供基本的 image prompt 撰寫指引
- 但 owner 描述的需求怎麼轉成 image prompt 是 Cat 自己的能力
- 不同 provider 的 prompt 風格不同，由 SKILL.md 針對性指引

---

## 與既有 Research 的關係

- **Structured Choices**：Owner 選擇候選圖片時使用
- **Peer Review**：Designer Cat 產出可由 Peer Cat 評審（構圖、品牌一致性）
- **Task Substrate**：image gen 任務作為 CoreTaskRecord 追蹤
- **Cats Work Aggregator**：freelance 案子如果需要設計素材，Designer Cat 可以直接產出

---

## 結論

- Image/video generation 自然地作為 Cat 的 capability 存在，不需要 API gateway
- Runtime 不需要任何改動 — workspace 檔案 + preview surface metadata 已足夠
- 產品層只需小幅擴充 Canvas 的 render hint 來 inline 顯示圖片/影片
- 新 provider 支援只需寫 SKILL.md，不需要改 code
- 品質和成功率由 provider 決定，owner approval 作為最終 gate

---

*本文件供 review 討論用。如 review 通過，建議作為 SKILL.md capability
標準的一部分納入 cats-runtime 的 skill library 文件。*
