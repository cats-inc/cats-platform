# Agency Agents as a Managed Skills Plugin

Date: 2026-09-28
Status: Suitable candidate for a small skills-only pilot; not installed or implemented
Related: [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md),
[SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md),
[PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md)

## Recommendation

Agency Agents 比 C2C 更適合作為第一個 **內容型 Plugin** 的候選：上游主要價值就是
角色指引、領域流程與交付範本，Cats 已有 skill validation／delivery 基礎，不需要
另造 browser controller 或上游執行引擎。建議透過 Platform 的 Plugin 管理服務分發
固定版本的上游內容，Cats 維護薄的格式／metadata／來源適配，逐步減少人工重寫、
複製維護同類角色的工作。

這裡的「引用」是 **build 時釘選並封裝 upstream bytes，使用時由 Runtime 投遞已安裝內容**。
它不是執行時讀 GitHub main、依賴開發機 sibling checkout，或將上游 installer 放進
Desktop 執行。安裝這類 Plugin 增加可選的角色／skills，不新增模型 provider、工具權限、
持久記憶或自動建立 Cat／執行任務。

後續規劃已在 [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) FR-09／10
補入通用 lifecycle、context 撤銷與 source lock＋recipe；上游無 release 不影響以固定
commit 建置 Cats 版本。Agency 預設走無 hooks 的內容路徑，Submodule 為可選開發方式。

第一個候選範圍建議是 Code Reviewer 與 UX Researcher，先與 Cats 內建 skills 並存。
不能直接把現有內建庫全部換掉：來源關係、內容範圍與使用中的 skill IDs 都尚未完成遷移盤點。
本輪只完成 source fit 評估，沒有宣稱套件已可安裝、輸出品質已提升或 Plugin lifecycle 已交付。

## Source and reproducibility

| Evidence | Pinned observation |
| --- | --- |
| Original upstream | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)；由使用者指定本機 checkout 的 Git remote 確認 |
| Existing local reference | `../sammykenny2/one-man-digital-company/agency-agents/`，detached `00fb28a4cf60a719363dce0de67fafc6301857ce`，commit 日期 2026-07-12；保留原樣 |
| Current upstream reviewed | [`479193dcce1cf6432ce0f5aa230ab8cc739a8c6b`](https://github.com/msitarzewski/agency-agents/tree/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b)，commit 日期 2026-09-27；另 clone 至 Cats workspace 的隔離研究目錄 |
| Cats baselines | Platform `dec5af9b58939b973920d72f3d870390f501c2df`；Runtime `73f9def922e27e4b0bb3156db7a9b62026b22f5e` |

按 pinned `divisions.json` 的 18 個分類遞迴盤點，找到 279 份具 `name` frontmatter 的
Markdown agent 檔案；這是此次 source inventory，不是已驗證可用 skills 的數量。
沒有執行上游 convert／install、安裝其 Desktop app、載入其角色指令、修改使用者設定，
也沒有測模型品質。上游內容在此只作資料閱讀，不作本次代理的操作指令。

釘定版本的 [LICENSE](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/LICENSE)
為 MIT；包裝應保留原始 copyright／license 與來源。這輪沒有盤點所有角色引用的外部素材，
正式 pilot 仍需對選定 payload 做內容、引用與 notices 檢查；不是整個 repo 的發布許可審計。

## Existing Cats library and provenance limits

Cats [Runtime library README](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/runtime-skills/README.md)
明列 Agency 為 authoring/reference source，且禁止執行時依賴該 sibling repo。
Runtime [建庫提交 `03910ed`](https://github.com/cats-inc/cats-runtime/commit/03910ed048df9eb9455308208d69bb35dac43ce7)
在 2026-03-24 建立自己的 family／role taxonomy；後續 `91bba98` 才將出貨內容移到
`runtime-skills/`。目前盤點為 33 個 release packages、含 preview 共 36 個。

因此能確認的是當時採用「外部角色庫可作參考、Cats 持有最終內容」的設計；尚不能由此
證明實際逐檔移植關係。本輪沒有找到 upstream revision／轉換 recipe 的來源對照，
不能斷言全部是原樣 port，也不能否認個別
內容曾經受上游啟發。以下只作同類角色的樣本比較，不是聲稱它們有一對一衍生關係。

| Current Cats skill | Comparable upstream role | Body lines: Cats / upstream | Replacement implication |
| --- | --- | --- | --- |
| `code-reviewer` | [Code Reviewer](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/engineering/engineering-code-reviewer.md) | 10 / 68 | 都關注 review；上游另含 persona、評分標記與回覆格式，行為不等價 |
| `ux` | [UX Researcher](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/design/design-ux-researcher.md) | 10 / 321 | 現有 UX 流程指引不等於完整研究角色；需另外選用及評估 |
| `advanced-programmer-frontend` | [Frontend Developer](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/engineering/engineering-frontend-developer.md) | 10 / 217 | 上游還要求 editor extensions、WebSocket/RPC bridges 等特定工作；不列入第一批 pilot |

行數以移除第一個 frontmatter、正規化 LF 並 trim 後計算；三組 body 均不相同。
這不是品質評分。Cats 的 companion、Runtime／repo 維護、投遞政策與治理 skills 亦有自身用途，
不因新增 Agency Plugin 就轉交給外部角色庫。

## Thin integration path

```text
upstream @ fixed SHA + selected source paths + original license
  -> upstream SKILL.md conversion at build time
  -> Cats metadata / source map / digest / explicit bounded patches
  -> immutable managed Plugin artifact
  -> Runtime admits selected skills and reports source/version
  -> a Cat/session explicitly requests the installed role
```

上游 [converter](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/scripts/convert.sh)
已有 antigravity／osaurus／dsh 的 `agency-<slug>/SKILL.md` 產物形態，包含 name、description
與角色本文。可優先重用這個 build-time 步驟，不重寫角色內容。converter 的
[body helper](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/scripts/lib.sh)
會略過獨立 `---` 行，shell substitution 也影響結尾換行，所以不能僅依文件宣稱轉換後
本文 byte-identical；應封存原文並測試允許的格式正規化與內容差異。

它的 [Codex target](https://github.com/msitarzewski/agency-agents/blob/479193dcce1cf6432ce0f5aa230ab8cc739a8c6b/integrations/codex/README.md)
產生 custom-agent TOML；這不等於 Cats Runtime skill 契約。Cats 可以透過既有 Runtime
skill delivery 供 Codex 及其他已支援 provider 使用，而不以該 TOML／全域安裝路徑為前提。
不同 provider 的品質與 delivery mode 仍要各自驗證，不能由格式支援推論完全相容。

| Boundary | Proposed handling |
| --- | --- |
| Source and maintenance | Plugin recipe 固定 upstream SHA、source path、source hash、converter revision、Cats envelope revision；上游更新產生可審查的新 artifact，使用者端不自行 git pull |
| Format and identity | 沿用或適配上游 SKILL.md 輸出，補 Cats family／role／version／tags；Plugin ownership 與 skill ID 映射在 P0 固定，`agency-code-reviewer` 等只是候選 slug。不可覆蓋內建或手動同名 skill |
| Content | 原文可追溯；Cats 只加必要 metadata／宿主邊界。若需要大量改寫某角色才可用，先排除該角色，避免又變成手工 port 維護 |
| Scope and context | 先兩個角色，按 session 明確選用，不把 279 份內容全部塞進 prompt。Persona 的 memory／experience 文字不授予真實記憶或證明專業能力 |
| Ownership | Platform 的 Plugin 管理服務負責下載、安裝意圖與版本；artifact／recipe 提供釘選內容與來源；Runtime 管理驗證、投遞、provenance 與執行准入。Cats 不使用上游 installer 管理使用者全域 agent／skill 目錄 |
| Disable and uninstall | 禁止新投遞，處理帶有來源的受影響 turn／context；只移除 Plugin-owned artifact／投影。保留使用者選擇與歷史，缺少套件的引用顯示 unavailable，不默默回退成內建角色 |

## Required Cats contract changes

現在的 [Runtime catalog](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/src/core/skills/catalog.ts)
掃描選定 root 下的 SKILL.md、驗證名稱／內容並拒絕重複 ID／symlink；已有 fingerprint、
delivery 與 requested/resolved/applied 基礎，但不是已完成的 managed Plugin source registry。
將 `skillsRoot` 指向上游、把 Plugin 檔案塞進出貨庫，或全域安裝成功，都不算完成接入。

Runtime 的 accepted
[ADR-018](../../../cats-runtime/docs/decisions/018-separate-skill-library-content-from-runtime-execution-engine.md)、
[SPEC-013](../../../cats-runtime/docs/specs/SPEC-013-internal-skill-library-and-role-taxonomy.md)
及 library README 目前限定自有、本地出貨庫。P0 應明確擴充為「內建內容由 Runtime
維護，受管理外部 artifact 是另一個經准入的來源；Runtime 仍擁有投遞與執行」。
這保留 content／execution 分工，但必須在 Runtime owner repo 更新決策及精確契約，
不能悄悄忽略舊限制。本輪沒有改 accepted ADR 或實作多來源 discovery。

初期保留內建 skill IDs；新增 Agency 角色使用不同身分，讓使用者明確選用。
若之後決定淘汰某個既有 port／內建角色，需先盤點 Cat 設定、profiles、sessions、
版本／fingerprint refs、歷史與使用者客製內容。不得靜默重綁；若改持久化格式或引用要求，
依版本政策提供驗證、備份、原子替換與失敗恢復。新增可選來源本身不代表必須遷移所有資料。

## Pilot gates and next step

1. **Artifact:** 只選 Code Reviewer／UX Researcher，固定來源與 license，驗證轉換差異、
   YAML／名稱、引用檔案、大小及 digest；不跑上游 install，也不修改真實使用者 profile。
2. **Admission and delivery:** 先固定多來源註冊與撤銷契約；在隔離 Runtime profile 安裝、
   列舉、選用，記錄 requested/resolved/applied 與 upstream/plugin provenance；未安裝不能使用。
3. **Value:** 用相同模型、相同固定 review／UX 題目比較無 skill、Cats 內建及 Agency 角色；
   分別記錄 findings、誤報、格式／scope 遵循與 context 成本，不以更長回答當品質提升。
4. **Lifecycle:** 更新、停用／移除、重啟後不得重新投遞舊 generation；既有 context 不能
   靠刪檔聲稱乾淨，手動 skills 與無關 sessions 不受影響。

以上皆未執行；本輪只是確認候選的架構方向較合適。建議先完成這個 skills-only pilot，
不以它取代另一路獨立 provider 的驗證。文件與獨立 review 結果記錄於 PLAN-113。

*Last updated: 2026-09-28*
