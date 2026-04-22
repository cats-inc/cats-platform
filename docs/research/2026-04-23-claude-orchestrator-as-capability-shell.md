# Orchestrator 的重新定位：從規則指揮者到能力塑形殼

> 2026-04-23 owner × Claude 討論結論之研究綜述
> 作者：Claude（Opus 4.7, 1M context）

## 導讀

本文記錄一次對 Cats 產品 orchestrator 架構的徹底重新審視。起點是一個看似微不足道的型別問題 — 聊天室裡的五類「對話對象」為什麼不能是同一種物件 — 延伸出對當前 orchestrator 定位的檢討，並與現代 agent coding 的典範演進相對照，最終收束到一個與我們對職場管理的直覺高度一致的單人格、多旋鈕設計。

重點結論有五：

1. 「Solo / Temp Participant / My Cat / Boss / Guide Cat」五類對象不是技術必然，是歷史累積。
2. 當前的 orchestrator 是規則驅動的靜態路由器，與以 LLM 為大腦、工具為能力的現代 agent 典範背道而馳 — 在 Cats Chat 尚可辯護，在 Cats Code / Work 則是結構性問題。
3. 重塑後的 orchestrator 只有四項責任：UI、Tool surface、Invariant、Lifecycle。所有「決定下一步」的主權交還模型。
4. 這個重塑對 Cats Work 的經濟可行性是決定性的 — Work 的使用場景是高頻批次，必須 hybrid（強模型駕駛 + 弱模型工人）才能成立。
5. 但 orchestrator 不是雙人格切換 — 它是一個人格、一組 policy dials 依當下 context 動態調整。用職場語彙說：「見人說人話，見鬼說鬼話」，不是分裂成兩個主管。

## 1. 起點：五類貓為什麼不是一類？

目前 Cats Chat 裡的「對話對象」有五種不同的型別表現：

- **Solo target**：只有 `provider / model / control`，無身分、無 persona，一次性。
- **Temp participant**：帶 role hint（譯者、面試官…），生命週期不超過 channel。
- **My Cat**：使用者羅列的常駐 cat，有名字、頭像、persona。
- **Boss Cat**：My Cat + `isBoss` 旗標。
- **Guide Cat (Catlas)**：built-in、不可刪、persona 鎖死。

仔細看這五者的差異只落在四個正交軸上：**頭像來源、名字來源、生命週期、身分旗標**。每一軸都是 optional 欄位或 enum。

但**統一要分兩層講**，否則會把不該一起的東西混在一起：

- **Runtime addressable-target / participant-like 層**：五者可共享同一個可被 mention、可被發話、可被渲染頭像的 participant shape。composer、participant resolver、audience 計算今天寫滿的 `if isSolo / else if isTemp / else if isCat` 分叉就是這層的稅金，應該抽掉。
- **Durable Cat registry 層**：**不共用**。Solo 與 Temp 沒有「我被加進書櫃、可 rename、有 direct lane、可 delete / archive、有 memory、有 transport binding」這些語意。把它們硬塞進同一個 registry 會讓它們意外繼承 My Cat 的持久化副作用，這是目前型別分家所唯一保住的正確東西。

用 Codex 平行研究的分法：**identity / execution / supervision 三軸正交**。Cat 是 identity（有沒有登記、會不會被記住）、provider/model 是 execution（這次用誰發話）、orchestration 是 supervision（誰管束它）。前面五類貓真正共享的是 participant 形狀，不是 identity 倉儲 — 這個區分必須明文。

- Solo = participant with no name, no avatar, no persona, lifetime-per-turn, **no registry record**
- Temp = participant with synthesized identity, lifetime-per-channel, **no registry record**
- My = 基準形態，persistent，**registry record**
- Boss = My + `flags.isBoss`
- Guide = My + `flags.isBuiltin` + `flags.isReadOnly`

現行碼分家的部分是誤差（runtime participant shape 沒抽出），部分是正確（durable registry 沒亂塞）。重構的正確路徑是**抽出 ParticipantLike / AddressableTarget 作為 runtime 抽象，保留 Cat registry 只容納 durable records**，不是把五者全塞進同一個 Cat 表。

這件事單獨看不重要，但它暴露了一個更深的症狀：**Cats 的型別系統內化了當初的「對話對象有角色階層」直覺，而這個直覺正是 orchestrator 設計決定的下游。**

## 2. Orchestrator 的雙重身分

在 `cats-platform` 中搜尋 orchestrator 的實際位置，可以找到兩個並存但常被混用的語意：

**Orchestrator-as-router**（`src/platform/orchestration/`）
由 planner、dispatcher、execution workflow 組成，**全 TypeScript deterministic**。它讀 mention、讀 channel state、讀 participants 結構，用規則決定這一輪由誰出聲、lane 怎麼切、audience 是誰。路由決策**不呼叫 LLM**。

**Orchestrator-as-participant**
`state.globalOrchestrator` 持有 `executionTarget = { provider, instance, model }`，當路由把 target 解析為 `participantKind === 'orchestrator'`（典型是 solo / +New Chat 模式）時，**這組 target 才會去呼叫 LLM**，但扮演的是「發話者」，不是「調度者」。

兩頂帽子共用同一個狀態 slot，在程式碼層面看起來像一個實體，但職責邏輯完全不同。使用者看到「orchestrator 回覆了」時，實際發生的是：**router（規則） → 解析到要 orchestrator 自己答 → participant（LLM）產生一段文字。**

這個二元性是目前所有混亂的根源。

## 3. 與 agent coding 時代的錯位

2025–2026 的 agentic coding — Claude Code 自身、Cursor、Aider、Cline、OpenHands — 全部採用同一個典範：

- **模型當大腦**。
- 系統只提供 **tools / MCP / 外部 CLI 的包裝**。
- Loop 在推理時發生：模型讀 context、選 tool、看結果、再選下一個。
- Planning、routing、delegation 都在 inference time 發生，**不是寫死在系統代碼中**。

對比之下，Cats 的 orchestrator-as-router 把每一個 planning / routing 決策都鎖死在我們的 TS 裡。這意味著：

- 所有「接下來該發生什麼」的智慧必須由**我們**預先編碼。
- 模型能力無論多高，都享受不到紅利。
- 使用者付費給 Anthropic/OpenAI 買一個會 reasoning 的大腦，卻被鎖在「你只能回覆我指定的那一句」。

對 Cats Chat 而言這尚可辯護 — 聊天室語意確實需要 determinism（@mention 必達、audience 有上限、參與者名單可預期）。但 Cats Code 與 Cats Work 的工作負載本質是 agentic — 需要跨步驟 reasoning、條件 delegate、動態 tool selection — 把 Code/Work 繼承 Chat 的 shared orchestrator 等同於強制它們接受鏡頭不轉身體的表演方式。

## 4. 蛻變的正確形狀：四項責任

如果我們放棄「orchestrator 決定誰說話」這個錯誤的自我定位，剩下還真正非做不可的事只有四項：

**UI 框架**
渲染 transcript、顯示頭像、接收輸入、呈現狀態。純展示層，無 agency 顧慮。

**Tool / MCP / API surface**
Agent 能呼叫的所有能力 — 內部 API（workitem、participant、channel 操作）、外部 CLI（Claude Code、Codex、Gemini）、第三方服務 MCP、本機運算資源。這是 agent 真正「做事」的觸手。

**Invariant**
硬約束：audience 上限、participant 上限、permission、破壞性動作門檻、budget cap。必須住在 **tool boundary**，而非 prompt 裡的道德勸說。

**Lifecycle scheduler**
Agent 無法為自己出生、不會自己打卡、不會自己 checkpoint。系統必須提供 session 建立、wake trigger、暫停 / 恢復、budget envelope、supervision、event stream。

**主權切分**
- 系統管：什麼時候開機關機、有沒有錢有沒有權、狀態存哪裡、事件給誰看。
- **強 agent** 管：開機後做什麼、呼哪個 tool、何時 delegate、何時收尾 — **task-level agency 在它身上**。
- **弱 model** 不在這條線上 — 它不是 agent，是 pipeline step。決策主權留在上層（rule / SOP / conductor pipeline / 呼叫它的強 agent），它只負責把某一個明確 I/O 邊界的單步動作執行好。這點在第 7 節展開。

守住這條線最危險的漏點是：**lifecycle scheduler 不該偷偷做語意決策**。它看 metadata（時間、budget、錯誤次數、signal）來排 session 生老病死，**不看訊息文字**來決定要不要重排 — 那是 router 回魂。

但注意這個界線是對 **lifecycle scheduler** 的限制，不是對整個系統的限制。Policy engine、intent classifier、workflow step（包括呼叫弱 model 做分類的那一步）當然可以讀內容 — 這就是它們的職責。差別在：

- **Lifecycle scheduler 讀內容做決策 = 禁止**（會變相 router 化、不可審計、職責污染）。
- **Tool / policy / pipeline step 讀內容做決策 = 允許**，但必須在 tool/API boundary 上、可審計、回傳結構化結果。

換句話說，限制的是「誰」讀、用途是什麼，不是「能不能」讀。

## 5. Invariant 的工學

Invariant 的正確實作是 tool adapter 層的守門 + 結構化錯誤，**絕不做 silent clipping**。

原因純粹來自 agent loop 的運作方式：agent 是根據 tool return value 做下一步 reasoning 的。如果它叫 `@add-participant(X)` 但人數已滿，系統默默不加、或清掉別人再加 — agent 的世界觀就被污染了。它以為成功了，之後的推理都建立在一個謊言上。

正確的回傳 shape 是兩類：

- 成功：`{ ok: true, result: {...} }`
- 拒絕：`{ ok: false, error: { code, message, details } }`

其中 `code` 必須是可辨識常數（`E_AUDIENCE_LIMIT_EXCEEDED`、`E_NOT_AUTHORIZED`、`E_TOOL_REQUIRES_HUMAN_CONFIRM` 等），讓 agent 自動進 recovery reasoning。強模型本來就會處理錯誤並換策略 — 我們只需要把錯誤結構化。

兩類 invariant 要分開處理：

- **數值 / 權限型**：API call 擋、丟錯即可。
- **破壞性 / 外顯動作**（刪除、公開發布、燒大筆 token）：光丟錯不夠，需要升級為 **human-in-the-loop**。Tool 回傳 `{ state: 'pending_user_confirm', requestId }`，等使用者 UI 確認才真正執行。Agent 可繼續做別的事或等待。

每個「改」的 tool 也該搭配「查」的 tool（`@get-channel-capacity`、`@list-participants`、`@describe-permissions`），讓 agent 能 pre-check，不用撞牆當探針。

## 6. Lifecycle：agent 無法為自己出生

Scheduler 最小形狀含三種 session mode，但共用同一個 runtime：

- **Interactive**：使用者訊息驅動，idle → checkpoint；user speaks → wake。
- **Background**：cron / event 驅動（每天 9 點自動摘要、webhook 觸發）。wake → 跑完 → checkpoint。
- **Delegated**：agent `@spawn-subcat(...)` 產生的 child session。分 blocking（caller 等）與 async handle（caller 拿 `childSessionId` 繼續）。

每個 session 必帶 **Budget Envelope**：單 turn token 上限、wall-time、累積日額、同 user 併發上限（防 agent 無限 fork）。

**Supervision** 偵測三類異常：同 tool 連呼 N 次同樣參數（stuck loop）、N 分鐘無進度（stall）、連續 M 次 tool 錯誤（confusion）。命中則 pause、upgrade 給使用者決定。

好消息是 `cats-runtime` + `runtime/client.ts` 已經有大部分基礎建設。需要補強的是：background session 觸發源、spawn hierarchy 的 budget 繼承、supervision 偵測層。需要搬走的是目前 planner / dispatcher 裡的**決策邏輯**（那應屬於 agent 自己）。

## 7. 弱模型的誤區

本次討論最早我提出的方案是「tier-scaled 單一框架」：弱模型也給 agent loop，只是殼厚一點 — 強制 JSON schema、預篩 tool 集、注入 few-shot。Owner 明確駁回了這個方向，理由精準：**這是在假裝弱模型有 agency。**

這個反省值得展開：

把 7B 模型當「縮水版 agent」有三個結構性缺陷：

1. 弱模型本來就做不好 multi-step reasoning。給它縮小的工具集它依然選錯；給它 schema 它依然吐壞 JSON。scaffolding 無法補足能力斷層，只是讓失敗變得不那麼明顯。
2. 實作上會長出「agent loop 裡塞規則、規則裡又掛 agent loop」的共生怪物，兩邊邏輯互相污染，debug 地獄。
3. 它假設所有問題只是程度差異 — 但從 0 到 1 的 agency（有能力推理 tool 錯誤並 recover）是斷點、不是連續 spectrum。

正確的 reframe 是：**弱模型不是退化的 agent，是非 agent 的 text worker。** 它在工作流裡的角色是「填空」、「分類」、「翻譯」、「抽取」這類明確 I/O 邊界的單步動作。決策主權留在工作流本身（即 conductor pipeline），或留在上游呼叫它的強模型 agent。

## 8. 管理風格的職場對應

Owner 點出的類比直接把上述結論翻譯成人類直覺：

- **強下屬（Opus / GPT-4）**：自主、能力好。主管職責 = 給資源、給工具、偶爾抬頭看是否走偏。**主管不必比他更聰明**。
- **弱下屬（小模型、且無法換人）**：能力有限、無法汰換。主管必須手把手教、隨時確認進度、只分配夠簡單的事。**主管的智慧成為決定性瓶頸** — 如果主管自己不能把任務切成弱下屬做得到的粒度，整組垮。

幾個推論：

- 放手 ≠ 無法無天。就算 superstar 員工也不能刷公司卡、碰 production DB。對應 invariant + budget + human-in-the-loop。
- 弱下屬偶爾在窄領域特別強（某人翻譯特快）。對應強 driver 呼叫 `@ask-weak` 把本機 7B 用在翻譯這類事。
- 檢查頻率不是美德，是能力決定的函數。對強下屬天天 status update 是羞辱；對弱下屬不盯緊就出包。

這個類比把整個架構的選擇從「技術潔癖」提升為「直覺對齊」— 大部分管理者本能就會這麼分配，我們的系統架構應與之同構。

## 9. Cats Work 的成本論

三個產品線的成本經濟學不同：

- **Chat**：低頻、高單價 OK，使用者買的是對話品質。主線 concierge + 強模型合理。
- **Code**：中頻、品質壓倒一切，高價值主線（reasoning、重構、跨檔案規劃）讓 Opus 慢慢跑值得。但 Code 的**次要 subtask** — lint、語意搜尋、摘要、boilerplate 生成、測試分類、簡單改寫、commit message 草擬 — 完全可以 offload 到便宜 / 本機模型或 deterministic tools，hybrid 在 Code 也有可觀節省空間。
- **Work**：**高頻批次、重複**。一個自動化任務一天跑 500 次，Opus ≈ $50/天，本機 7B ≈ $0。**這是數量級差距。**

這意味著：

- **Chat 主線**可以全走 concierge，Work 不行。
- **Code 主線**可走 concierge，但 subtask 同樣受惠於 hybrid。全 concierge 不會錯，只是把本來可以省的錢燒掉。
- **Work 不行** — 全走 concierge 等於貴版 Chat，全走 conductor 等於沒 AI 的 Zapier。**只有 hybrid（強 driver + 弱 workers）同時存在，Work 產品才經濟可行。**

這個觀察把 orchestrator 的雙模能力從「nice-to-have」升級為「決定 Work 能否成立的底層經濟學」。

市場比對也支持這個定位：

- AutoGPT 系：逼弱模型當 agent，燒 token 失敗。
- Claude Code / Cursor：concierge-only，太貴做不了重複工。
- Zapier / Make / n8n：conductor 經典，無 AI native。
- 企業 RPA：太重太貴，SMB 用不起。
- Langflow / Flowise：框架，不是產品。

中間的空白是「個人 / 小團隊，能跑自家硬體、混用強弱模型、有 UI 組工作流、成本可預測」— 這正是 Cats Work 可佔的位置。

## 10. 駁斥雙人格：orchestrator 只有一個

我在討論中提出的第二個自我糾錯來自 owner 的觀察：**把 orchestrator 實作成 ConciergeOrchestrator vs ConductorOrchestrator 兩個 class 會過度離散化。** 真實的主管不是換個身體變另一個人，而是同一個人對不同下屬用不同手法。

Boolean 切換會漏掉的情境：

- 同一個 session 裡強駕駛、弱副手，需要同時兩種手法。
- 同一個強模型今天做簡單事明天做複雜事，對應態度要不同。
- 弱模型偶爾某任務意外表現好，應該當場放鬆。
- 強模型偶爾連續格式出包，應該當場收緊。
- 上述每一種轉變都發生在 **同一個 session 內部、甚至同一個動作之間**。

正確形狀：**一個 orchestrator，多個 policy dials，每個決策點依當下 context 即時評估。**

核心 dials：

- `decideToolSurface(ctx)` — 這一刻暴露哪些 tool。
- `decideValidation(ctx)` — output 該多嚴。
- `decideRetry(ctx)` — 重試幾次、帶什麼 correction hint。
- `decideScaffolding(ctx)` — few-shot / grammar / prompt 詳細度。
- `decideAutonomy(ctx)` — 放手 vs 切步驟填空。

每個 dial 獨立評估，組合自由：可以 `autonomy 高 + validation 嚴 + scaffolding 少` 這種任何搭配。

Context 是向量而非 scalar，至少四個維度：

- **Capability profile**：tool-use 準確、JSON fidelity、reasoning 深度、context 長度 — 不同維度能力可能差很多，不能縮成 tier label。
- **Task profile**：複雜度、副作用、idempotency、跨系統。
- **Session history**：這顆模型這個 session 至今的成功率、格式失敗次數、tool 誤用次數（熱啟動信號）。
- **Invariants / budget state**：剩多少錢、剩多少時間、硬限制。

Policy 的範圍是「當下這個動作」，不是整個 session。強 driver 呼 `@ask-weak(...)` 那一瞬間，sub-invocation 會用 worker 的 capability context 跑一次 policy，driver 本身的 autonomy 完全不受影響。

這個 framing 同時消解：

- 「session tier 靜態預判」的粗糙。
- 「progressive fallback」的邏輯突兀（它其實就是 policy 讀了 session history 自動收緊，不是切換 mode）。
- 「強駕駛 + 弱副手」混合場景的實作困難。

## 11. 未解問題

- **Capability profile 怎麼維護？** Provider catalog 已有部分（`ProductProviderEventCapabilities`），但 tool-use 準確度、JSON fidelity 這些需要實測資料。首次跑某 provider 的 session 用什麼預設？
- **Policy 輸入要不要經過小模型 classifier？** 「task 複雜度」這個維度難以純規則判斷。一個便宜的 intent classifier 跑在 task profile 分析上是否合理？如果是，classifier 本身不就成為 agent 判斷的一環？界線在哪裡？
- **跨 session budget aggregate**：User 層級的日額 / 月額如何在多個 session 間公平分配？哪個 session 應該被 throttle？
- **長時間 background session 的 context drift**：一個跑一整天的 automation session，context window 會被新 event 淹沒。做 summary 壓縮由 agent 自己呼 `@compress-context` 還是 scheduler 強制介入？
- **多 agent 協作的 deadlock 與 priority inversion**：A spawn B 等結果，B 又 spawn A 的同一批 session pool — 如何偵測？
- **Policy 本身需不需要 version 化 / A-B 測試**：不同版本的 `decideToolSurface` 可能對不同模型不同任務有不同效果。這變成系統參數調校問題。

## 12. 結論

本次討論的最深收穫不是某一個架構決定，而是**澄清了一個錯誤的二分法**：我們本來以為 orchestrator 的選擇是「規則驅動」vs「完全放手 agent 驅動」，實際上兩者都不對。正解是：

> **Orchestrator 只負責發駕照、看規則、加油站開幾小時；駕駛是 agent，由 agent 決定油門方向盤；但路況好壞會改變限速 — 同一條路管理局會依實況調整限速，不是換一套制度。**

翻成工程語彙：**一個 orchestrator、一組 policy dials、一組不因模型或任務分裂的 invariants / lifecycle / scheduler。主權在 agent，形狀由 policy 即時塑。**

這個設計對 Cats Work 產品經濟可行性是決定性的，對 Cats Chat / Code 是能力釋放，對整體 Cats 架構則是從「陷入我們自己 orchestrator 腦袋裡」回到「作為能力殼服務比我們聰明的大腦」的哲學復位。

---

**作者後記**：本文由 Claude 於 2026-04-23 當天討論後撰寫。過程中 Claude 兩度被 owner 糾正設計方向（tier-scaled 單框架被駁回、dual orchestrator 雙人格被駁回），記錄於文中第 7、10 節。這些糾正是本文能抵達現在結論的直接原因。

**2026-04-23 review 後的修訂**：初稿提交後經 reviewer 指出四處需要收緊，本版本已吸收：

1. 第 1 節：原本把五類貓說成「同一個 Cat shape 的退化光譜」容易讓人誤以為應塞入同一個 durable registry。修改為 runtime ParticipantLike / AddressableTarget 層可共享、durable Cat registry 層不共用的兩層區分，並引入 Codex 平行研究的 identity / execution / supervision 三軸正交框架。
2. 第 4 節：原本籠統說「Agent 管開機後做什麼」與第 7 節弱模型「決策主權留在工作流」有張力。修改為明確區分 **強 agent 擁有 task-level agency** 與 **弱 model 是 pipeline step（無 agency）**。
3. 第 4 節：原本說「scheduler 不能讀訊息內容」過於絕對。修改為 **lifecycle scheduler** 不應做語意決策；policy engine / classifier / workflow step 在可審計的 tool boundary 上可以且應該讀內容。
4. 第 9 節：原本說「Chat / Code 可以全走 concierge」低估了 Code 的 hybrid 空間。修改為 Code 主線可 concierge，但 subtask（lint、搜尋、摘要、boilerplate、測試分類、簡單改寫）同樣受惠於 hybrid。
