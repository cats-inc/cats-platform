# Managed Plugins and ChatGPT Adapter Fit

Date: 2026-09-28
Scope: 初步文件研究與 Cats 本機 source inspection；沒有執行、安裝或審計上游全部程式。

## User direction

使用者希望 Runtime、Platform／Products、Apps 之外有可安裝／移除的 Plugins。
Plugin 可將外部能力橋接為 provider adapter、MCP、skills 或其他受限整合，在 Desktop
設定裡看見與管理。一般做法是重用上游、Cats 維護薄橋接；不重寫外部核心功能。
有疑慮的整合不由 Cats 自研，外部現成 repo 可以列內部實驗候選，是否測試／release 分別判斷。
自行安裝的 MCP／skills 維持使用者管理。

## The two repositories

下列是當日讀取 default-branch 文件的觀察；未釘定 upstream commit 或驗證 release bytes，
不可當成可重現 build／相容性／服務許可的證據。若選為 pilot，需重查精確 revision。

| Repo | 文件描述的呼叫方向 | 與獨立 Runtime provider 的差距 |
| --- | --- | --- |
| [OpenChatX](https://github.com/XiaoPuOuO/openchatx-mcp) | ChatGPT 透過 MCP／Tunnel 呼叫本機工具、其他 MCP、skills 與 agent 能力 | 提供工具給 ChatGPT，不因此提供 Cats 主動提交 ChatGPT 對話的介面 |
| [C2C](https://github.com/XiaoDuoYa/codex-with-chatgpt) | Codex 操作 ChatGPT Web 做規劃／審查；ChatGPT 經唯讀 MCP 讀取 workspace | 獨立 provider 還缺脫離 Codex 的對話控制／結果生命週期；重造此流程偏離薄橋接原則 |

來源：[OpenChatX README](https://github.com/XiaoPuOuO/openchatx-mcp/blob/main/README.md)、
[C2C architecture](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/docs/architecture.md)。
這是依文件做的適配判斷，不是 repo 品質評分，也不排除將來上游新增可用入口。

兩個主專案 LICENSE 當日皆為 MIT；保留其版權／授權聲明，捆綁依賴另行盤點。
[OpenChatX LICENSE](https://github.com/XiaoPuOuO/openchatx-mcp/blob/main/LICENSE)、
[C2C LICENSE](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/main/LICENSE)。
MIT 只處理程式碼授權，不提供第三方服務的帳戶或自動化使用許可。

## Service-interface distinction

[OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
文件描述 OpenAI 產品向私有 MCP server 呼叫工具、server 回傳結果；這條連線本身不提供
外部程式主動建立 ChatGPT 對話的能力。工具服務與模型／agent provider 需分開驗收。

當日 [個人 Terms of Use](https://openai.com/policies/terms-of-use/)（生效 2026-01-01）限制
自動／程式化擷取資料或 Output，以及繞過服務限制；
[Services Agreement](https://openai.com/policies/services-agreement/)（生效 2026-01-01）
也限制未允許的資料擷取及規避用量限制。網頁自動化 adapter 因而需要具體介面與適用條款
判讀；不能只靠「官方網頁」「MIT」「內測不發布」推定允許。此處是風險研究，不對任何
特定 repo 作違約定論，也不阻擋使用文件化、獲允許的服務介面。

## Local baseline

Platform worktree 起點 `cbca3311`；Runtime 本機起點
`3e47f46b3087e6a5543a59f0c69bf4327cd59533`。以下為唯讀觀察，非新增功能測試結果。

- [App package contract](../app-packages.md)：已交付 renderer／SDK；一般 server／worker 不在現行封裝內。
- [ADR-094](../decisions/094-adopt-cats-app-packages-as-extension-boundary.md)／
  [SPEC-098](../specs/SPEC-098-cats-app-package-and-extension-interface.md)：曾提出一種 App 覆蓋多種擴充，
  不等於 connector executor 已交付。
- [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md)／
  [PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md)：獨立 App Market、完整清理與恢復尚是規劃。
- [Runtime agent registry](../../../cats-runtime/src/backends/agent/adapters/registry.ts)：內建 switch
  選 OpenClaw、Agent SDK bridge、ACP transport；沒有從受管理 Plugin inventory 動態載入的完整流程。
- [Runtime agent contract](../../../cats-runtime/src/backends/agent/types.ts)：已有 turn invocation／events、
  probe、model／tool／session discovery、cancel／close 等介面；optional capability 需如實回報。
- [Runtime architecture](../../../cats-runtime/docs/architecture.md)：provider universe／machine detection／
  enabled config 分開；skills 由 Runtime delivery 並受 release／preview policy 約束。

## Recommendation

先設計受管理 Plugin 的來源、安裝與能力註冊契約，沿用合適的 Runtime transport，另找
具清楚許可和獨立機器入口的 upstream pilot。OpenChatX／C2C 保留為方向辨識案例，
不作首版依賴或 ChatGPT provider 支援承諾。

- [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md)
- [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md)
- [PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md)

*Last updated: 2026-09-28*
