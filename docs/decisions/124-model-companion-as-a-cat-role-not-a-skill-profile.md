# ADR-124: Model Companion as a Cat Role, Not a Skill Profile

## Status

Accepted, 2026-09-29。使用者同意這個方向。實作依
[PLAN-114](../plans/PLAN-114-companion-as-cat-role.md) 完成；Settings 面板尚未截圖驗收。
owner 決定 Settings UI 一併納入並採最小變動：原本的 Companion pill 留在原位、外觀不變，
改為獨立開關（PLAN-114 Decision 8）。

## Context

[ADR-040](040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) §6
的方向是：同一個 Cat 身分可以同時用於 companion、Work 與 Code，依 mode 疊加行為，
不做粗糙的全域 mode 開關；Alternative 3「每個 mode 各有一個 Cat 身分」已被否決。
[ADR-065](065-keep-my-cats-as-one-platform-agent-home-with-lenses.md) 也要求 MY CATS
只有一個 registry，不同產品只是不同的 lens。

實作卻把 companion 做成 `skillProfile` 的一個值（`'companion'`）。`skillProfile` 是
單一字串欄位（`src/core/types.ts:277`），原本用來選擇「這隻貓用哪一套行為 skill」。
companion 的身分判斷雖然也接受 `roles.includes('companion')`，但使用者只能透過
`skillProfile` 設定，`roles` 在 UI 與 PATCH API 都沒有入口。

[ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md) 的 Agency pilot 把
plugin skill 也放進同一個 `skillProfile` 欄位，身分與行為的混用因此變成具體問題：

- 選了 Agency skill，這隻貓就失去 companion 身分：個人頁 feed 被隱藏，companion box
  的判斷也跟著改變。
- Telegram `/mode agent` 會把 `skillProfile` 寫成 `'chat-default'`，蓋掉已選的 Agency skill。
- 身分判斷看 role 或 skillProfile，runtime skill 卻只看 skillProfile，兩者已經不一致。

另外，cats-runtime 的 managed plugin 路徑只接受純 plugin skill 的 manifest
（`cats-runtime/src/core/skills/managedPlugins.ts:193`，"with managed skills only"），
所以不能把內建 `companion` skill 直接疊在 plugin skill 上。

## Decision

### 1. companion 是 Cat 的身分特質，存放在 Cat 層級的 `roles`

- 一隻 Cat 是否為陪伴者，只由 Cat 層級 `roles` 是否包含 `'companion'` 決定。
- `'companion'` 不再是合法的 `skillProfile` 值。依 pre-release 政策不保留 alias；
  API 收到這個值回 `400 bad_request`。
- `skillProfile` 回到原本的意義：選擇一套行為 skill（內建預設或 plugin skill）。
  channel 與 orchestrator 的 `skillProfile` 不受影響。

### 2. 身分面與行為面分開推導

- 身分面由 role 決定：個人頁 feed、companion box hydration 條件、Telegram `/mode`、
  registry 與 inspect 標示。
- runtime `companion` skill 在 Cat 有 companion role，且 `skillProfile` 是內建值
  （`null` 或 `'chat-default'`）時請求。
- `skillProfile` 是 `plugin:*` 時不請求 companion skill，以符合 cats-runtime 目前
  「只允許 managed skills」的限制。companion box 的記憶上下文經由 manifest 的
  `context.metadata` 傳遞，不受這個限制影響。
- cats-runtime 日後允許混用後，移除這個排除條件即可，不需要再改身分模型。

### 3. 身分以 Cat 層級為準，channel 視圖負責投影

- 身分一律由 Cat 本身的 `roles` 決定。
- channel assignment 的 roles 是加入 channel 當下的快照，也可以是 channel 專屬 role，
  而 read model 與 prompt 會優先使用它。因此 channel 的 cat 視圖在讀取時以 Cat 本身的
  狀態投影 `'companion'`，不在寫入時同步 assignment，也不遷移 assignment。

### 4. 既有資料一次性遷移

- 既有 `skillProfile: 'companion'` 的 Cat 改為帶 `'companion'` role、`skillProfile`
  設為 `null`。
- 遷移遵守 AGENTS.md：替換前寫專用備份、驗證後原子替換、失敗時保留原檔並送出診斷。
  細節見 PLAN-114 Decision 6。

## Consequences

### Positive

- 同一隻貓可以同時是陪伴者，又在 Chat 帶 Agency skill，不必二選一。這正是 ADR-040 §6
  「共用身分、疊加行為」的意思。
- Telegram `/mode` 不會再蓋掉使用者選的 skill。
- companion 身分可以用 core actor 的 role 查詢（`GET` actors 的 `role` 篩選）。
- 身分判斷集中在單一 helper，不再有兩條路徑不一致。

### Negative

- 帶 Agency skill 的陪伴者在 Chat 暫時沒有 companion 語氣 skill，要等 cats-runtime
  放寬限制。
- 移除公開 API 的一個可接受值並改寫既有資料，屬於 persisted-data 與 API contract
  變更，版本邊界是 cats-platform `0.6.0`。
- Settings 的 Companion pill 不再與其他 skill pill 互斥；陪伴者搭配預設技能時兩顆會同時亮。

### Neutral

- Cats Work 不讀 `skillProfile`，Cat 是否參與 Work 仍由 `products[]` 決定，不受影響。
- 不改變 companion 在 Chat 各 room mode 的適用範圍。
- 與 companion 從 Chat 搬到平台 entity 的工作（SPEC-102 收尾）互相獨立。

## Alternatives Considered

### Alternative 1: 維持 companion 為 skillProfile 值

- **Pros**：不用改資料與 API。
- **Cons**：companion 與 Agency skill 永遠互斥；Telegram `/mode` 持續蓋掉 skill；
  等於 ADR-040 否決的全域 mode 開關。
- **Why rejected**：違反 ADR-040 §6，而且問題已經在 Agency pilot 出現。

### Alternative 2: 讓 skillProfile 變成多值

- **Pros**：companion 與 plugin skill 可以並存於同一欄位。
- **Cons**：要改凍結的 `src/core/types.ts` 與 orchestration contracts；身分與行為仍然
  混在同一個概念裡；plugin 混用限制照樣存在。
- **Why rejected**：改動面大，卻沒有解決「身分不該是 skill」的根本問題。

### Alternative 3: 新增專用欄位（例如 `companionEnabled`）

- **Pros**：語意最明確，不會和 channel role 混在一起。
- **Cons**：要改凍結的 `CoreActorRecord` 形狀與持久化格式；`roles` 已有 Cat 層級欄位、
  core 投影與查詢篩選，重做一套沒有額外好處。
- **Why rejected**：`roles` 已經能表達身分特質，也是既有程式碼接受的第二條路。

### Alternative 4: 開放 PATCH 自由編輯 `roles`

- **Pros**：通用，將來其他 role 也能用。
- **Cons**：`roles` 是自由字串，目前沒有編輯需求；公開自由編輯會擴大 contract。
- **Why rejected**：PATCH 只新增專用的 `companion?: boolean`，建立 Cat 時沿用既有的
  `roles`。

## References

- [ADR-040](040-make-companion-a-first-class-chat-mode-with-workspace-and-presence.md) §6
- [ADR-065](065-keep-my-cats-as-one-platform-agent-home-with-lenses.md)
- [ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md)
- [SPEC-019](../specs/SPEC-019-product-skill-profiles-and-runtime-skill-manifests.md)
- [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)
- [PLAN-114](../plans/PLAN-114-companion-as-cat-role.md)

---

*Decision made: 2026-09-29*
*Decision makers: Product owner (approval), Claude (author)*
