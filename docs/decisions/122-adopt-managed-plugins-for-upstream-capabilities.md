# ADR-122: Adopt Managed Plugins for Upstream Capabilities

## Status

Proposed, 2026-09-28。使用者已確認重用外部能力、可安裝移除、內部實驗與正式分發分開的
方向，並要求建立 worktree 提案；本 ADR 的技術設計尚待確認，沒有授權實作或發布。

## Context

Cats 需要讓外部 repo 的既有能力成為可選裝的成員。使用者可在 Desktop 看見、設定、
停用與移除套件，Platform／Runtime 則透過明確介面使用其能力。套件可以增加獨立的
provider 執行目標，也可以提供 MCP 工具或 skills，不必有可開啟的 App 主畫面。

目前 App renderer、App SDK 與受管理封裝已存在；獨立 App Market／完整生命週期仍由
[ADR-121](121-distribute-apps-independently-with-host-owned-lifecycle.md) 規劃。
Runtime 已有 CLI、API/local、external agent 邊界，但 agent transport factory 仍是內建
選擇，沒有安裝外部 Plugin 後動態註冊新 adapter 的完整機制。詳見
[研究與現況](../research/2026-09-28-managed-plugins-and-chatgpt-adapter-fit.md)。

先前 [ADR-048](048-separate-platform-products-from-installable-apps.md) 將所有可分發單位
統稱 Apps；[ADR-094](094-adopt-cats-app-packages-as-extension-boundary.md) 又提出
capability-connector 等 App 類別。新需求讓「開啟應用」與「替宿主增加能力」有必要在
使用者介面與執行契約上分開，但沒有理由重造兩套下載、來源驗證與更新機制。

## Decision

### 1. Plugins 是可管理的能力套件

| 概念 | 責任 |
| --- | --- |
| Runtime | 執行、provider、工具與 skill delivery 的共同邊界 |
| Platform／Products | Desktop 宿主、管理 UI、Chat／Work／Code 等體驗 |
| Apps | 使用者開啟來完成事情的應用，例如 Usage／Studio |
| Plugins | 可選裝的能力套件，供 Platform／Runtime 使用，可只有設定介面 |

這是生態系第四種可交付成員，不是在 Platform 與 Runtime 之間插入新的必經層。
cats-one 仍負責開發工作區／啟動編排，不屬於這四種產品能力分類。
Plugin 是分發單位；provider adapter、MCP／tool connector、skill 是它可提供的貢獻。
設定 UI 的存在不會自動把 Plugin 變成 App；一套件也不必對應一個上游 repo。

### 2. 重用上游，Cats 維護薄橋接

優先調用上游已提供的 CLI、API、MCP、SDK 或 agent protocol。Cats 維護封裝、版本釘選、
介面轉換、設定與生命週期，不將外部核心演算法、agent loop 或網頁控制流程重寫成 Cats
自有版本。必要小 patch 要有理由、測試與上游追蹤；若接入必須重造主要功能，重新選候選。

建議未來以 `cats-plugins` 維護整合 recipe、薄橋接、來源／授權證據與版本化產物；可依
授權捆綁上游 bytes，也可連接使用者已有的服務。本輪不建立新 repo，不改 workspace manifest。
Plugin 版本與 upstream revision 分開記錄；不能在使用者機器上隱性追蹤 upstream main。

#### Upstream source acquisition

`cats-plugins` 預設維護每個套件的 source lock、build recipe、內容選單、必要 patch 與
notices；source lock 固定 repository URL、完整 commit ID、來源內容校驗與依賴。
上游沒有 tag／release 也能選定 commit，經驗證後發布獨立的 Cats Plugin 版本與 channel。
build worker 取得該來源並產生可安裝 artifact；Desktop 不需要上游 Git checkout 或建置工具。

Submodule 可用於需要經常閱讀／修改上游的開發情境，但不是 Plugin 分發契約，也不要求
每個來源都以 submodule 加入。使用時 gitlink 必須與 source lock 一致，CI 不接受追蹤
branch tip 的隱性更新。大型或授權要求的 vendored snapshot 可另選用，仍保留相同來源證據。
來源封存／mirror 與 artifact retention 由 Cats 管理，不能只保留可能失去可取用性的 URL。
具體取捨及驗收見 SPEC-121 FR-10；本輪只規劃，不建立 `cats-plugins` 或下載發布產物。

### 3. 共用套件機制，保留不同執行邊界

Apps／Plugins 在 UI 分類、manifest kind 與驗證上明確區分，重用可適用的下載、來源驗證、
immutable artifact、操作 journal、資料保留與恢復機制。共用部分從具體需求提取；
不把尚未實作的 App Market 當成現成依賴，也不為此重寫已交付的 App renderer host。

現有 `.catsapp` 的 renderer 限制不因本提案放寬。Plugin archive／manifest 的精確格式在
P0 固定；不能借用 App 身分載入背景程式，也不能讓套件自行宣告 `system` 特權。
第一版採受控目錄與明確本地安裝，不開放任意第三方投稿或任意宿主內 JavaScript 載入。

### 4. 管理在 Platform，執行與能力註冊在 Runtime

Platform 擁有 Desktop 的 Plugin inventory、安裝意圖、相容檢查、設定與更新 UI。
Runtime 擁有執行能力的准入、discovery、provider selection、session、工具與 skills。
Platform 透過版本化 Runtime 管理契約交付已驗證描述；Runtime 不 import Platform source。
同一個安裝意圖只有一個 writer，Runtime 回報實際觀察／執行狀態，不形成第二個 installer。

第一版讓外部 process／服務透過已支援的版本化協定連接，必要 Cats 橋接也在受管理 process
中執行。Runtime 的一般 transport client 留在 Runtime；新套件不必為每個上游改寫內建
factory，但新協定仍須明確的 Runtime 契約工作。process 分離本身不是完整 OS sandbox。
套件不可直接 import Runtime／Platform 私有類別或任意操作 Core store。

安裝不等於登入、可用或選用；新 provider 必須遵守既有 Runtime selection／readiness
契約，不替換 Codex native 或其他目標。停用立即禁止新工作並撤銷註冊，停止與清理結果
分別確認。使用者自行安裝的 MCP／skills／CLI 與外部共享服務不被接管或刪除。

#### Host-owned lifecycle and optional hooks

先固定 manifest 宣告、生命週期協定與宿主狀態機，再提供小型 SDK／validator／fixtures。
純 skills Plugin 由宿主完成來源註冊、投遞與撤銷，不要求自行撰寫卸載程式。
需要特殊設定或外部資源處理的套件，可宣告 pre/post-install、pre/post-uninstall 等有限
hooks；由 Platform 編排，Runtime 依版本化協定執行已驗證的獨立 helper，無任意宿主內載入。

Hooks 回傳結構化進度、完成證據、失敗及必要操作；不能自行修改 installer inventory、
擴權或終止共享 provider。重試、逾時、崩潰恢復及外部副作用由 operation journal 協調，
失敗不視為成功，也不假設跨外部服務具原子 rollback。停用准入不能被失敗的 hook 擋住。

宿主負責找出受影響工作／sessions 並呈現操作影響。移除 skill 檔案、斷開 CLI、重新
啟動 Desktop 都不證明模型 context 已清除；重新載入舊 session／fork 仍須檢查來源暴露。
優先對受影響範圍建立乾淨 context，只有具體宿主限制才要求重啟自有服務或 Desktop。
完整要求與驗收列於 SPEC-121 FR-09；SDK 是協定實作輔助，不是另一套 installer。

### 5. 內部實驗與正式分發分開

允許在隔離開發 profile 中安裝有明確來源的實驗套件；實驗不自動進入官方目錄、Desktop
預裝、stable 或一般 preview。宿主的 build／profile policy 決定是否接納實驗產物，
不能只相信套件自己填的 channel。升級／複製 profile 也不能把實驗來源提升為正式來源。

原始碼授權、外部服務使用條款、內部測試適用性與正式分發各自判斷。MIT、private repo、
不 release 或第三方作者身分都不自動授權服務存取。Cats 不自研有疑慮的 ChatGPT 網頁
adapter；現有外部 repo 可列研究／測試候選，但不是因為存在就保證可用或可發布。
OpenChatX／C2C 目前僅是研究案例，沒有選作 pilot，也沒有新增 ChatGPT provider 的承諾。

### 6. 與既有決策的關係

若採納本 ADR，局部調整 ADR-048 的「所有可安裝項都叫 App」與 ADR-094／SPEC-098 的
capability-connector 公開命名及執行歸屬；保留 Products、既有 Apps、App SDK 與已交付的
renderer 契約。Product-module 的一般擴充仍延後。既有 App 資料不直接改名或自動搬遷。

ADR-121／SPEC-120／PLAN-112 繼續負責 renderer Apps，Plugins 的新增執行範圍由
[SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) 與
[PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md) 規劃。接受此提案後，才在
Runtime owner repo 固定必要的協定／狀態契約，不在 Platform 文件冒充 Runtime 已提供 API。

## Consequences

### Positive

- 可沿用外部專案能力與上游更新，減少 Cats 必須自行維護的功能。
- 使用者能理解安裝了什麼、誰提供能力、如何停止與移除。
- provider、MCP、skills 共用套件治理，又保留不同的執行與授權語意。

### Negative

- 需要跨 Platform／Runtime 的註冊、撤銷、崩潰恢復與版本契約，不能只做商店卡片。
- 上游相容性、授權與更新供應鏈成為持續維護工作；薄橋接也不是零維護。
- 受管理 native process 的權限通常比 App iframe 大，必須如實揭露且限制接納範圍。

### Neutral

- App Market 與 Plugin 工作可按里程碑共用基礎，不需要同時發布。
- schema／API 若破壞現有契約，依各 owner 的版本規則升 minor／major，並提供受測升級。
  本文件不 bump 版本、不選 release 日期，也不將未實作功能標成完成。

## Alternatives Considered

| 選項 | 取捨 |
| --- | --- |
| 一律叫 Apps 並擴大 App executor | 可沿用舊詞，但使用者難分應用與宿主能力；不作本案建議 |
| 每個外部 repo 都直接加進 Runtime core | 初次簡單，日後難選裝、獨立更新與移除；只保留通用協定 client |
| 重新實作上游功能 | 能完全控制，但偏離重用外部能力的明確方向 |
| Plugin 與 App 各自重造 installer／catalog | 邊界明顯但治理重複；共用機制、分開 executor |
| v1 接受任意宿主內程式與公開投稿 | 範圍過大；先受控來源與有限貢獻 |

## References

- [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)
- [PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md)
- [外部案例與條款研究](../research/2026-09-28-managed-plugins-and-chatgpt-adapter-fit.md)
- [App Market 契約](../specs/SPEC-120-app-market-and-lifecycle.md)
- [Runtime selection](115-bound-bootstrap-and-provider-choices-by-runtime-selection.md)
- [目前 App 封裝邊界](../app-packages.md)

*Last updated: 2026-09-28*
