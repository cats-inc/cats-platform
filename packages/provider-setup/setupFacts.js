/**
 * The provider/model selector's order, so a tool sits in the same place everywhere in Cats. The
 * host cannot import Platform's source, so tests/setup-wizard-view.test.js holds this to
 * PRODUCT_PROVIDER_ORDER in src/shared/providerCatalogData.ts.
 */
export const SETUP_PROVIDER_ORDER = [
  'codex', 'claude', 'antigravity', 'grok', 'muse', 'cursor', 'copilot', 'opencode',
  'kilo', 'cline', 'auggie', 'pi', 'kiro', 'junie', 'devin', 'goose', 'ollama', 'openclaw',
];

/**
 * SPEC-136 FR-16: what a row says about a step, by tool and operating system. Product text about
 * what the packaged helpers do, in both languages. What a helper reports on this computer
 * (`plannedActions`) is shown beside it, in its own words. Self-contained, so the host can embed it
 * before Platform starts.
 *
 * @param {(en: string, zh: string) => string} T
 * @param {string} id  node, npm, vc, gh, git, shell, ollama or a provider id
 * @param {{ platform: string, tool?: object, neededBy?: string[], planned?: string[], ollamaInstalled?: boolean }} context
 */
export function setupRowFacts(T, id, context) {
  if (context.change) return changeFacts(T, id, context, setupRowFacts(T, id, { ...context, change: undefined }));
  const platform = context.platform;
  const windows = platform === 'windows';
  const who = context.neededBy && context.neededBy.length ? context.neededBy.join(T(', ', '、')) : null;
  const planned = context.planned || [];
  const pathTag = windows
    ? { text: T('Changes your user PATH', '變更使用者 PATH') }
    : { text: T('Changes your shell profile', '變更 shell 設定檔') };
  const adminTags = [
    { text: T('Needs administrator rights', '需要系統管理員權限') },
    { text: T('Downloads and installs', '下載並安裝') },
    { text: T("Accepts winget's agreements for you", '替你同意 winget 的條款') },
  ];
  const installUrl = (command) => {
    const match = /https?:\/\/[^\s'")|]+/.exec(command || '');
    return match ? match[0].replace(/^https?:\/\//, '').replace(/\?.*$/, '') : null;
  };
  switch (id) {
    case 'node':
      if (windows) {
        return {
          title: T('Node.js and npm', 'Node.js 和 npm'),
          summary: who
            ? T(`${who} install and run through it. Installs the LTS version with winget, or from nodejs.org if that fails.`, `${who} 要靠它安裝和執行。用 winget 安裝 LTS 版，失敗時改從 nodejs.org 下載。`)
            : T('Installs the LTS version with winget, or from nodejs.org if that fails.', '用 winget 安裝 LTS 版，失敗時改從 nodejs.org 下載。'),
          tags: adminTags,
          manual: 'winget install --id OpenJS.NodeJS.LTS -e',
        };
      }
      return {
        title: T('Node.js and npm', 'Node.js 和 npm'),
        summary: who
          ? T(`${who} install and run through it. Installs nvm in your home folder, then the LTS version, with no administrator rights.`, `${who} 要靠它安裝和執行。把 nvm 裝到你的家目錄，再安裝 LTS 版，不需要系統管理員權限。`)
          : T('Installs nvm in your home folder, then the LTS version, with no administrator rights.', '把 nvm 裝到你的家目錄，再安裝 LTS 版，不需要系統管理員權限。'),
        tags: [{ text: T('Downloads and runs the nvm install script', '下載並執行 nvm 安裝腳本') }, pathTag],
        manual: 'nvm install --lts',
      };
    case 'npm':
      return {
        title: T('npm installation folder', 'npm 安裝位置'),
        summary: T('Installs global packages in your user folder, so they need no administrator rights.', '把全域套件裝到你的使用者資料夾，之後安裝不需要系統管理員權限。'),
        tags: [{ text: T('Changes npm settings', '變更 npm 設定') }, pathTag],
        manual: windows
          ? 'npm config set prefix "%USERPROFILE%\\.npm-global" --location=user'
          : 'npm config set prefix "$HOME/.npm-global" --location=user',
      };
    case 'vc':
      return {
        title: T('Microsoft Visual C++ runtime', 'Microsoft Visual C++ 執行階段'),
        summary: who
          ? T(`${who} link against it. Installs the 2015-2022 Redistributable (x64).`, `${who} 執行時要用到。安裝 2015-2022 Redistributable (x64)。`)
          : T('Installs the 2015-2022 Redistributable (x64).', '安裝 2015-2022 Redistributable (x64)。'),
        tags: adminTags,
        manual: 'winget install --id Microsoft.VCRedist.2015+.x64 -e',
      };
    case 'gh':
      return {
        title: 'GitHub CLI',
        summary: windows
          ? T('GitHub Copilot CLI needs it. Installs with winget.', 'GitHub Copilot CLI 需要它。用 winget 安裝。')
          : T('GitHub Copilot CLI needs it.', 'GitHub Copilot CLI 需要它。'),
        tags: windows ? adminTags : [{ text: T('Downloads and installs', '下載並安裝') }],
        manual: windows ? 'winget install --id GitHub.cli -e' : platform === 'macos' ? 'brew install gh' : null,
      };
    case 'git':
      return {
        title: 'Git',
        summary: windows
          ? T('Cats Code uses it for worktrees and branches. Installs Git for Windows with winget, or from its official installer if that fails.', 'Cats Code 要用它管理 worktree 和分支。用 winget 安裝 Git for Windows，失敗時改用官方安裝程式。')
          : T('Cats Code uses it for worktrees and branches.', 'Cats Code 要用它管理 worktree 和分支。'),
        tags: windows
          ? [{ text: T('Needs administrator rights', '需要系統管理員權限') }, { text: T('Downloads and installs', '下載並安裝') }, { text: T('Restart Cats afterwards', '裝完要重新啟動 Cats') }]
          : [{ text: T('Downloads and installs', '下載並安裝') }, { text: T('Restart Cats afterwards', '裝完要重新啟動 Cats') }],
        manual: windows ? 'winget install --id Git.Git -e' : platform === 'macos' ? 'brew install git' : null,
      };
    case 'shell':
      return {
        title: T('PowerShell scripts', 'PowerShell 指令碼'),
        summary: T('Lets you run these tools in your own PowerShell. Cats works without it; sign-in then opens in Command Prompt.', '讓你能在自己的 PowerShell 裡執行這些工具。Cats 不需要它；沒設定時，登入會改用命令提示字元開啟。'),
        tags: [{ text: T('Changes your PowerShell execution policy', '變更 PowerShell 執行原則') }, pathTag],
        manual: 'Set-ExecutionPolicy -Scope CurrentUser RemoteSigned',
      };
    case 'ollama':
      if (context.ollamaInstalled) {
        return {
          title: 'Ollama',
          summary: T('Installed, but its service is not answering. This starts it in the background and waits for it to answer.', '已經安裝，但服務沒有回應。這會在背景啟動它，並等它回應。'),
          tags: [{ text: T('Starts a background program', '在背景啟動一個程式') }],
          manual: windows ? '"%LOCALAPPDATA%\\Programs\\Ollama\\ollama app.exe"' : 'ollama serve',
        };
      }
      return {
        title: 'Ollama',
        summary: T("Downloads and runs Ollama's install script into your user folder, then starts its service.", '下載並執行 Ollama 的安裝腳本，裝到你的使用者資料夾，再啟動服務。'),
        tags: [{ text: T('Downloads and runs ollama.com/install.ps1', '下載並執行 ollama.com/install.ps1') }, { text: T('Starts a background program', '在背景啟動一個程式') }],
        manual: 'irm https://ollama.com/install.ps1 | iex',
      };
    default: {
      const tool = context.tool || {};
      const label = tool.label || id;
      if (tool.kind === 'npm') {
        return {
          title: label,
          summary: T(`Installs ${tool.pkg || label} globally with npm.`, `用 npm 全域安裝 ${tool.pkg || label}。`),
          tags: [{ text: T('Downloads from npm', '從 npm 下載') }],
          manual: tool.command || null,
        };
      }
      // The state Install-ClaudeCode calls changes_required: an old npm shim hides the native CLI.
      if (id === 'claude' && planned.includes('remove_legacy_npm_claude_shim') && !planned.includes('install_claude_code_native')) {
        return {
          title: label,
          summary: T('An old npm version of Claude Code hides the native one. This script removes it with npm uninstall -g.', '舊的 npm 版 Claude Code 蓋住了原生版。這個腳本會用 npm uninstall -g 移除它。'),
          tags: [{ text: T('Removes the npm version of Claude Code', '移除 npm 版的 Claude Code'), danger: true }],
          manual: 'npm uninstall -g @anthropic-ai/claude-code',
        };
      }
      const url = installUrl(tool.command);
      const tags = [{ text: url ? T(`Downloads and runs ${url}`, `下載並執行 ${url}`) : T('Downloads and installs', '下載並安裝') }, pathTag];
      if (id === 'claude' && windows) tags.push({ text: T('May use winget and accept its agreements', '可能用 winget 並同意它的條款') });
      if (id === 'claude' && planned.includes('remove_legacy_npm_claude_shim')) {
        tags.push({ text: T('Removes the npm version of Claude Code', '移除 npm 版的 Claude Code'), danger: true });
      }
      return {
        title: label,
        summary: T(`Downloads and runs ${label}'s official install script, into your user folder.`, `下載並執行 ${label} 的官方安裝腳本，裝到你的使用者資料夾。`),
        tags,
        manual: tool.command || null,
      };
    }
  }
}

/**
 * SPEC-137 FR-8 and FR-9: what an update, a reinstall or a removal of a ready row says. A helper
 * cannot say beforehand whether a newer release exists, so an update never promises one.
 */
function changeFacts(T, id, context, base) {
  const windows = context.platform === 'windows';
  const tool = context.tool || {};
  const admin = context.requiresElevation ? [{ text: T('Needs administrator rights', '需要系統管理員權限') }] : [];
  const kept = base.tags.filter((tag) => !tag.danger && !admin.some((entry) => entry.text === tag.text));
  if (context.change === 'uninstall') {
    return {
      title: base.title,
      summary: T('Removes it from this computer. "It will" lists what its script reported it would remove.', '從這台電腦移除。「它會」列出的是腳本回報會移除的東西。'),
      tags: [...admin, { text: T('Removes it from this computer', '從這台電腦移除'), danger: true }],
      manual: tool.kind === 'npm' && tool.pkg ? `npm uninstall -g ${tool.pkg}` : null,
    };
  }
  if (context.change === 'force') {
    return {
      title: base.title,
      summary: T('Runs its installer again over what is there, which can repair a broken install.', '重新執行安裝程式，蓋過現有的版本，可以修好壞掉的安裝。'),
      tags: [...admin, ...kept],
      manual: base.manual,
    };
  }
  const winget = { node: 'OpenJS.NodeJS.LTS', vc: 'Microsoft.VCRedist.2015+.x64', gh: 'GitHub.cli', git: 'Git.Git' }[id];
  let manual = base.manual;
  if (tool.kind === 'npm' && tool.pkg) manual = `npm install -g ${tool.pkg}@latest`;
  else if (windows && winget) manual = `winget upgrade --id ${winget} -e`;
  else if (!windows && (id === 'gh' || id === 'git') && context.platform === 'macos') manual = `brew upgrade ${id}`;
  return {
    title: base.title,
    summary: T('Installs the newest release if there is one. If this one is already the newest, nothing changes.', '有新版就安裝新版；已經是最新版的話，不會有任何變更。'),
    tags: [...admin, ...kept],
    manual,
  };
}
