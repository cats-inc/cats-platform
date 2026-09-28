# C2C Managed Plugin Fit Evaluation

Date: 2026-09-28
Status: Static assessment complete; full workflow on hold; no pilot selected
Related: [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md),
[SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md),
[PLAN-113](../plans/PLAN-113-managed-plugin-capabilities.md)

## Result

C2C 有可重用的唯讀 workspace bridge 與規劃／審查 skill，但目前不適合作為 Cats
第一個端到端 ChatGPT workflow Plugin，也不是獨立 ChatGPT provider。主因是控制流程
依賴 Codex 宿主提供的瀏覽器能力；這項能力不包含在 C2C 套件裡，Cats 目前也沒有對應契約。
將檔案打包不會補上這個依賴。若 Cats 自行實作 ChatGPT 網頁控制器，會超出薄橋接範圍。

| 評估目標 | 本輪判定 | 理由 |
| --- | --- | --- |
| 獨立於 Codex 的 ChatGPT provider | 不符合目前候選條件 | 沒有可提交模型 turn／取得結果的上游程式入口；bridge 的 MCP 是工作區資料面 |
| 在 Cats 使用 C2C 規劃／審查 workflow | 暫緩，等待可用宿主或上游入口 | skill 依賴特定 IAB API；managed update、session ownership 與 revoke 也需適配 |
| 只包裝 C2C 的唯讀 workspace bridge | 有條件的技術候選，未選為 pilot | 有 CLI／HTTP 入口與 state-dir override，但只增加 workspace 工具服務，不增加 ChatGPT 推論能力；需先確認產品價值 |

這不是 repo 品質評分。**Skill 型 Plugin 不必一律提供 HTTP／CLI 任務 API**：只要 Cats
實際提供所需宿主能力，且能管理 skill 的投遞與撤銷，就可以成立。本案缺少的是已驗證的
宿主依賴與接入路徑；不能把「我們正在使用的開發代理有瀏覽器工具」當成 Cats 啟動的
Codex CLI／app-server 也具有同一工具的證據。

## Pinned evidence and method

| Component | Revision／scope |
| --- | --- |
| C2C | [`9663b88753e35c76796c5bce000293e0bd22cd9e`](https://github.com/XiaoDuoYa/codex-with-chatgpt/tree/9663b88753e35c76796c5bce000293e0bd22cd9e)，package `0.1.3`；commit 日期 2026-09-13 |
| Platform | `55445aaffd0ce3a59ecea83ccefd3ca993318eb7`，已包含 Plugin 提案 PR #160 |
| Runtime | `73f9def922e27e4b0bb3156db7a9b62026b22f5e`，本機乾淨 checkout 的唯讀觀察 |
| Evaluation | `research/c2c-plugin-fit` branch，獨立 `cats-platform-c2c-evaluation` worktree |

將上游 clone 到 workspace 的 `.research/codex-with-chatgpt`，detached checkout 到上述
SHA，檢查 CLI handlers、HTTP routes、全部 MCP tool registrations、session／process／
storage、skill、package／lockfile 與相關測試來源。沒有執行上游 CLI、安裝 dependencies、
build、跑上游 tests、啟動服務、登入 ChatGPT、建立 tunnel 或修改使用者設定。
以下「有」指 source 中存在入口，並不表示已通過實際宿主驗收或完整安全審計。

## Actual capability flow

```text
Codex + upstream skill + host-provided IAB
  ├─ browser sends INIT / EXECUTED to ChatGPT and reads PLAN / DONE / BLOCKED
  ├─ Codex executes edits/tests with its own tools
  └─ C2C CLI saves checkpoints and nominated execution records

ChatGPT ── authenticated MCP ── C2C bridge ── read-only workspace / git / records
```

上游 [CLI handlers](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/cli/index.ts)
提供 serve／start／setup／stop／restart／status／doctor、pairing、session、prefs、record、
tunnel 等管理命令。`session set` 的 handler 合併並寫入本機 JSON；它不送出 ChatGPT 訊息，
也不執行等待／結果解析。CLI 沒有 ask／plan／review 的任務呼叫入口。

[Bridge HTTP routes](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/bridge/server.ts)
除了 health、OAuth 與 `/mcp`，只有 pairing／info／tunnel／revoke／shutdown 管理操作。
[MCP server](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/mcp/server.ts)
註冊九個唯讀工具：workspace_info、list_directory、read_file、search_workspace、git_status、
git_diff、test_status、execution_summary、execution_output。沒有模型 invocation 或 workspace
寫入／shell 執行工具；test_status／execution_output 讀取紀錄，不替 Codex 跑測試。

真正的 ChatGPT 控制迴圈位於
[skill 的 coding-task workflow](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/skill/SKILL.md#L512)：
代理透過瀏覽器發送訊息、觀察 DOM、讀回文字並更新 checkpoint。協定文字及 checkpoint
對可靠續跑有幫助，但不等於可由 Runtime 呼叫的執行引擎。

## Host compatibility gate

上游 [IAB contract](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/skill/SKILL.md#L101)
要求 `control-in-app-browser`、`setupBrowserRuntime()`、`agent.browsers.get("iab")`、
tab navigation／DOM interaction、visibility、`markHandoff()`／`markDeliverable()` 等宿主能力。
這些是 skill 引用的外部能力，不是 C2C 的 npm dependency 或內建 browser implementation。

Cats 的 [browser driver contract](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/src/core/browser/driver.ts#L52)
提供 session／page 建立、導覽與關閉；現有
[Playwright driver](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/src/backends/browser/playwrightDriver.ts)
沒有向 provider 暴露上述 IAB／DOM interaction 契約。對 Runtime `src` 與 `runtime-skills`
搜尋上述宿主 API 名稱未找到對應實作。這個結論限於被檢查的 Cats baseline，不推論所有
Codex 產品或將來宿主都不支援。

即使 bridge 健康且 ChatGPT 可讀 workspace，也只證明資料面連通。要宣稱新 provider，
仍須滿足 Runtime 的
[invoke／events／cancel／close 契約](https://github.com/cats-inc/cats-runtime/blob/73f9def922e27e4b0bb3156db7a9b62026b22f5e/src/backends/agent/types.ts#L280)，
不能借既有 Codex 執行 skill 就將其標成獨立 ChatGPT adapter。

## Packaging and ownership findings

| Surface | Source evidence | Managed Plugin implication |
| --- | --- | --- |
| Build and dependency pin | [package](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/package.json) 宣告 Node ≥20、pnpm 11.24.0、TypeScript build；[lockfile](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/pnpm-lock.yaml) 固定 SDK 1.30.0、Commander 14.0.3、Express 5.2.1、ignore 7.0.6、Zod 3.25.76 | `latest` manifest 不代表無法 pin；必須保留 commit、frozen lock、build toolchain、notices，另驗證產物與 OS。尚未 build，也未證明 package 可獨立分發 |
| Upstream updates and skill install | [Skill update workflow](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/skill/SKILL.md#L197) 會 daily check、git pull／stash、install／build、複製 skill 到使用者目錄並 restart | 原版不能原封不動投遞。需將這些操作交回 Cats installer，以明列且可追蹤的 skill patch 移除上游自我更新／全域安裝 |
| Config writes | [sandbox helper](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/config/sandbox-allow.ts) 寫 Codex config 的 writable_roots；setup 及預設會 repair 的 doctor 也會呼叫 | 只改 skill 不足。managed wrapper 不能盲用 setup／doctor；需避開這些 side effects 或由上游提供受管理模式。`doctor --no-fix` 不是完整離線、無副作用保證 |
| State ownership | [paths](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/config/paths.ts) 支援 `C2C_STATE_DIR`，JSON 直接寫入並盡力 chmod | 可隔離 plugin instance state；不能接管使用者既有 C2C 目錄。Windows ACL、atomic recovery 與升級仍需驗證 |
| Process ownership | [daemon](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/process/daemon.ts) 的 start 會 reuse 或建立 detached child；CLI 有 hidden foreground `serve` | 可以評估由 Runtime 直接持有 foreground child。這是上游 internal 入口，必須 pin／測相容性，不能視為穩定公開 API；尚未驗證跨 OS process tree cleanup |
| Stop evidence | stopBridge 在 shutdown HTTP acknowledgment 後立即回 true；失敗時向 state 裡的 PID 發 SIGTERM，未先核對該 PID 的程序身分；server 回應後才非同步 shutdown | 回 true 不能投影為 stopped。wrapper 需保留自己啟動的 process handle、確認退出；無法確認則 pending，避免採用 stale PID fallback。取消遠端 ChatGPT 生成與關閉 bridge 是不同能力 |
| Session concurrency | [session state](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/session/state.ts) 每 workspace 一份 saved session／checkpoint JSON；project 模式另靠代理 thread 記住自己的 chat URL | 未證明同 workspace 多 Cats session 能安全並行。最小 pilot 須限制一個 active workflow 並測 resume／duplicate delivery；不可宣稱 task-isolated controller |
| Tunnel and credentials | [binary discovery](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/tunnel/detect.ts) 支援 `C2C_CLOUDFLARED_PATH`；[named provisioning](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/tunnel/named-provision.ts) 可建立 tunnel／DNS 並預設讀使用者 Cloudflare cert | 本機 bridge probe 不需要 tunnel。連外版需明列 executable、account／DNS 所有權及憑證注入；`C2C_STATE_DIR` 不會自動隔離所有外部工具設定 |
| Revocation and secrets | [OAuth store](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/auth/store.ts) 持久化的是 access／refresh token hash；[runtime state](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/src/bridge/runtime.ts) 另含可用的 admin token。revoke-all 可撤 OAuth／pairing | 不把所有 state 都說成明文 OAuth tokens；也不能說磁碟絕無可用 secret。與 SPEC-121 credential reference 政策仍需具體對接。OAuth revoke 不等於既有模型 turn／skill context 已取消 |

允許的薄適配可以包含 artifact pin、設定／state path、foreground process supervision、
health／error mapping、bounded skill patch。重做 ChatGPT 登入、訊息傳送、DOM parser、
等待／恢復 loop 則是在補上游未提供的控制器，不列入本案 Cats 自研範圍。

## License and service gate

釘定版本的 [LICENSE](https://github.com/XiaoDuoYa/codex-with-chatgpt/blob/9663b88753e35c76796c5bce000293e0bd22cd9e/LICENSE)
為 MIT，封裝需保留版權與授權聲明。尚未完成整個 dependency tree、Node／cloudflared
等實際捆綁 bytes 的 license／notice／漏洞盤點，不能宣稱已取得 release clearance。

程式碼授權與 ChatGPT 服務使用介面分開判斷。沿用
[先前的服務介面研究](2026-09-28-managed-plugins-and-chatgpt-adapter-fit.md#service-interface-distinction)：
本輪不對 C2C 作違約定論，也沒有新增條款許可證據。內部實驗身份不解決網頁自動化
介面是否獲允許的問題；本輪沒有進行這條 live path。

## Re-entry criteria and bounded experiment

只有以下任一路徑成立，才重新評估完整 workflow：

1. 上游提供可重用、符合服務使用條件的任務控制入口，能提交規劃／審查、識別任務、
   取得結果與明確失敗，並如實表示取消／恢復能力；或
2. Cats 確認有可投遞給實際 provider session 的相容瀏覽器宿主，由上游 skill 控制，
   Cats 無須重寫 ChatGPT browser loop；同時能限制資源所有權、skill side effects 與撤銷。

兩條路徑都還需解決上表的 update／config／process／session／secret 邊界，並確認實際
使用介面的適用性。若改評估 bridge-only，必須先將能力命名為「提供工作區唯讀工具」；
由哪個產品／外部客戶端消費，以及相較 Cats 既有工具的價值，要另行確認。

| 後續驗證 | 必須取得的證據 | 本輪狀態 |
| --- | --- | --- |
| Isolated bridge probe | fixture workspace、獨立 state、無 tunnel；build 後由受控 child 啟動，MCP auth／read／越界拒絕、退出確認、前後無使用者設定變動 | 未執行；僅能證明 bridge 子集 |
| Real workflow | Cats session 提出一次規劃／審查要求，上游執行，結果回到同一 Cats task；保留 task／instance 對應與實際結果 | 未執行；宿主／入口 gate 未過 |
| Failure and restart | bridge／tunnel／browser 中斷分別測試；resume 不重送、不重做已完成修改；不把 timeout 當成功 | 未執行 |
| Disable and uninstall | 拒絕新 work，確認 owned process／tunnel 結束；無法取消則 pending／明列限制；處理受影響 skill context，保留手動安裝及其他 session | 未執行 |
| Distribution | 固定 artifact、完整 notices／依賴盤點、各 OS 驗證與一般 profile 拒絕 internal-experiment | 未執行，沒有發布授權 |

本輪不為取得「有跑起來」的結果而跳過結構性 gate。Static assessment 已足以暫緩完整
C2C pilot；Plugin 契約本身仍可繼續用另一個具獨立入口或已支援宿主的 upstream 評估。
這項結論補充 P0 候選證據，不改 ADR／SPEC 的提案狀態，也不表示 P0 全部完成。

## Validation and resume

已核對 pinned source 的 CLI／HTTP／MCP 方向、browser host 依賴與 lifecycle 差異。
文件 diff／連結檢查與獨立唯讀 review 的結果記錄於 PLAN-113。
下一步是依上述 re-entry criteria 選擇新候選或重新界定 bridge-only 價值；
不要將此研究當成安裝 C2C、接入使用者 ChatGPT 帳戶或發布 Plugin 的執行指令。

*Last updated: 2026-09-28*
