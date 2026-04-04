# Cats Plugin Architecture and Packaging Strategy

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: cats 作為 plugin 平台的可行性、package 拆分策略、plugin contract 設計
- **Related**:
  - [ADR-025](../decisions/025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md) — platform host 結構
  - [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md) — 依賴反轉
  - [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md) — API contract 統一
  - [ADR-037](../decisions/037-serve-runtime-dashboard-and-playground-from-platform-host.md) — runtime tool hosting
  - [PLAN-024](../plans/PLAN-024-platform-dependency-inversion-and-design-extraction.md) — 架構重整實作計畫

---

## 核心主張

PLAN-024 完成後，cats 的內部結構已經具備 plugin 架構的先決條件：

- `core/` 是共享 domain model，任何 product 都透過它讀寫組織狀態
- `platform/` 依賴 interface 而非具體 product 實作
- `design/` 是共享視覺語言
- `app/` 是 platform shell，擁有 product switcher 和 sidebar slot
- 每個 `products/*` 自包含：自己的 routes、components、styles

將 cats 從「多 product monolith」演進為「host + plugins」所需的增量工作
很小，本質上是定義一個正式的 Plugin Contract 並加上 dynamic loading。

---

## Part 1: Package 拆分策略

### 原則：host 合一包，products 各自獨立

業界的 plugin host 都是一個 package：

- VS Code extension 依賴 `vscode`
- Obsidian plugin 依賴 `obsidian`
- Figma plugin 依賴 `figma`

沒有人把 host 拆成多個 package 讓 plugin 各自 peer-depend。拆了只是給
plugin 開發者製造版本對齊的麻煩，沒有任何消費端好處。

### 最終 npm package 結構

```
@cats-inc/cats-platform          ← host（core + platform + design + shell 合一包）
@cats-inc/chat          ← Chat plugin（預設內建，隨 host 安裝）
@cats-inc/work          ← Work plugin（官方，可選安裝）
@cats-inc/code          ← Code plugin（官方，可選安裝）
@cats-inc/learn         ← 未來官方或社群 plugin
@cats-inc/note          ← 未來
@cats-inc/play          ← 未來
```

### host package 內部仍保持目錄分層

```
@cats-inc/cats-platform/
  src/
    core/              ← domain model, types, store
    platform/          ← orchestration, memory, transports
    design/            ← tokens, typography, shared CSS
    app/               ← PlatformShell, plugin loader, product switcher
    shared/            ← errors, http utils, pagination
```

目錄邊界服務內部開發者，package 邊界服務外部消費者。兩個尺度各自獨立。

### subpath exports

host package 透過 subpath exports 暴露分層 API，plugin 不需要 import
整包 host，只 import 需要的部分：

```jsonc
// @cats-inc/cats-platform/package.json
{
  "name": "@cats-inc/cats-platform",
  "exports": {
    ".":           "./dist/index.js",
    "./plugin":    "./dist/app/plugin.js",
    "./core":      "./dist/core/index.js",
    "./design":    "./dist/design/index.js",
    "./platform":  "./dist/platform/index.js",
    "./shared":    "./dist/shared/index.js"
  }
}
```

Plugin 的 import 風格：

```typescript
import type { CatsPlugin, PluginDependencies } from '@cats-inc/cats-platform/plugin';
import type { CoreActorRecord, CoreTaskRecord } from '@cats-inc/cats-platform/core';
import type { ApiError, NotFoundError } from '@cats-inc/cats-platform/shared';
```

### plugin package 的 peer dependency

每個 plugin 只需要一個 peer dependency：

```jsonc
// @cats-inc/chat/package.json
{
  "name": "@cats-inc/chat",
  "peerDependencies": {
    "@cats-inc/cats-platform": "^1.0.0"
  }
}
```

---

## Part 2: Plugin Contract 設計

### CatsPlugin interface

這是 plugin 向 host 註冊自己的 contract：

```typescript
// @cats-inc/cats-platform/plugin

export interface CatsPlugin {
  /** Unique plugin ID — used as route prefix and config key */
  id: string;

  /** Display name shown in product switcher */
  label: string;

  /** Optional icon identifier for sidebar */
  icon?: string;

  /** Route prefix — defaults to `/api/${id}` and `/${id}` */
  routePrefix?: string;

  /** Server-side: return a route handler that mounts under the plugin prefix */
  createRoutes?: (deps: PluginDependencies) => RouteHandler;

  /** Client-side: sidebar content component */
  SidebarContent: React.ComponentType<PluginRenderProps>;

  /** Client-side: main content component */
  MainContent: React.ComponentType<PluginRenderProps>;

  /** Lifecycle: called when plugin is activated */
  onActivate?: (deps: PluginDependencies) => Promise<void>;

  /** Lifecycle: called when plugin is deactivated */
  onDeactivate?: () => Promise<void>;
}
```

### PluginDependencies

Host 注入給 plugin 的共享服務。Plugin 不直接 import 實作，而是透過
host 注入：

```typescript
export interface PluginDependencies {
  /** Read/write shared core state (actors, tasks, projects, etc.) */
  coreStore: CoreStore;

  /** Memory retrieval and flush */
  memoryService: MemoryService;

  /** Access cats-runtime sessions */
  runtimeClient: RuntimeClient;

  /** Shared HTTP utilities */
  http: {
    sendJson: typeof sendJson;
    readJsonBody: typeof readJsonBody;
    handleApiError: typeof handleApiError;
  };

  /** App configuration */
  config: AppConfig;
}
```

### PluginRenderProps

Host 傳給 plugin React component 的 props：

```typescript
export interface PluginRenderProps {
  /** Current core state snapshot */
  coreState: CatsCoreState;

  /** Navigate to another route */
  navigate: (path: string) => void;

  /** Current route params within the plugin's prefix */
  routeParams: Record<string, string>;
}
```

---

## Part 3: Plugin Discovery 和 Loading

### 配置方式

```typescript
// cats.config.ts
import type { CatsConfig } from '@cats-inc/cats-platform';

export default {
  plugins: [
    '@cats-inc/chat',           // 官方 plugin，npm install
    '@cats-inc/work',           // 官方 plugin，npm install
    './plugins/my-custom',      // local plugin（開發中）
  ],

  /** 預設啟動時顯示的 product */
  defaultPlugin: 'chat',
} satisfies CatsConfig;
```

### Server-side loading

Host 啟動時 dynamic import 各 plugin，掛載 routes：

```typescript
// app/server/pluginLoader.ts
async function loadPlugins(
  config: CatsConfig,
  deps: PluginDependencies,
): Promise<LoadedPlugin[]> {
  const loaded: LoadedPlugin[] = [];

  for (const specifier of config.plugins) {
    const mod = await import(specifier);
    const plugin: CatsPlugin = mod.default;

    // Mount API routes under /api/{plugin.id}/*
    if (plugin.createRoutes) {
      const handler = plugin.createRoutes(deps);
      routeRegistry.mount(`/api/${plugin.id}`, handler);
    }

    // Lifecycle
    if (plugin.onActivate) {
      await plugin.onActivate(deps);
    }

    loaded.push({ plugin, specifier });
  }

  return loaded;
}
```

### Client-side loading

Product switcher 從 host 取得已載入的 plugin 清單，動態渲染：

```typescript
// app/renderer/PlatformShell.tsx
function PlatformShell({ plugins }: { plugins: CatsPlugin[] }) {
  const [activeId, setActiveId] = useState(defaultPluginId);
  const active = plugins.find(p => p.id === activeId);

  return (
    <div className="platformShell">
      <Sidebar>
        <ProductSwitcher plugins={plugins} activeId={activeId} onSwitch={setActiveId} />
        {active && <active.SidebarContent {...renderProps} />}
        <UserAvatar />
      </Sidebar>
      <Main>
        {active && <active.MainContent {...renderProps} />}
      </Main>
    </div>
  );
}
```

---

## Part 4: 一個 Plugin 長什麼樣

以 `@cats-inc/work` 為例：

```
packages/plugin-work/
  package.json
  src/
    index.ts                 ← export default CatsPlugin
    api/
      boardRoutes.ts         ← /api/work/boards
      warRoomRoutes.ts       ← /api/work/war-room
      index.ts               ← createRoutes()
    renderer/
      WorkSidebar.tsx         ← project list, board nav
      WorkCanvas.tsx          ← kanban board, war room
      hooks/
        useProjects.ts        ← reads from coreStore
    styles/
      work.css                ← Work-specific styles（imports @cats-inc/cats-platform/design tokens）
```

```typescript
// packages/plugin-work/src/index.ts
import type { CatsPlugin } from '@cats-inc/cats-platform/plugin';
import { WorkSidebar } from './renderer/WorkSidebar';
import { WorkCanvas } from './renderer/WorkCanvas';
import { createWorkRoutes } from './api/index';

const plugin: CatsPlugin = {
  id: 'work',
  label: 'Cats Work',
  icon: 'briefcase',
  SidebarContent: WorkSidebar,
  MainContent: WorkCanvas,
  createRoutes: (deps) => createWorkRoutes(deps),
};

export default plugin;
```

```typescript
// packages/plugin-work/src/api/boardRoutes.ts
import type { PluginDependencies } from '@cats-inc/cats-platform/plugin';
import type { CoreProjectRecord } from '@cats-inc/cats-platform/core';

export function createBoardRoutes(deps: PluginDependencies) {
  return async (req, res, url) => {
    if (url.pathname === '/api/work/boards') {
      const core = await deps.coreStore.readCore();
      const projects = core.projects.filter(p => p.status === 'active');
      deps.http.sendJson(res, 200, {
        data: projects,
        meta: { total: projects.length },
      });
      return true;
    }
    return false;
  };
}
```

---

## Part 5: Monorepo 工具鏈

### 推薦 pnpm workspaces

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```
cats-platform/                 ← monorepo root（public target）
  packages/
    cats-platform/             ← @cats-inc/cats-platform（host）
      package.json
      src/
        core/
        platform/
        design/
        app/
        shared/
    plugin-chat/               ← @cats-inc/chat
      package.json
      src/
    plugin-work/               ← @cats-inc/work
      package.json
      src/
    plugin-code/               ← @cats-inc/code
      package.json
      src/
  pnpm-workspace.yaml
  tsconfig.base.json           ← 共用 TypeScript config
```

### 為什麼 pnpm 而非 npm workspaces

- pnpm 的 strict node_modules 結構防止 phantom dependencies
- plugin 如果 import 了沒宣告的 dependency 會立刻報錯，不會靠 hoisting 意外成功
- 對 plugin 架構來說，dependency 邊界正確性比 npm workspaces 更重要

---

## Part 6: Electron 打包

Plugin 在 Electron build 時是 **bundled**，不是 runtime discovered：

```
electron-dist/
  node_modules/
    @cats-inc/cats-platform/          ← host
    @cats-inc/chat/          ← 預裝 plugin
    @cats-inc/work/          ← 預裝 plugin
  runtime-pages/             ← cats-runtime dashboard/playground（ADR-037）
```

Electron 的 `main.js` 讀取 `cats.config.ts` 並 import 所有 plugins。
使用者不需要 `npm install` — 預裝的 plugins 已經在 bundle 裡。

未來如果要支援「使用者安裝第三方 plugin」，那是另一個研究題目
（涉及 sandbox、permissions、auto-update），不在本文範圍內。

---

## Part 7: 時機與前提

### PLAN-024 是必要前提

Plugin 架構需要以下 PLAN-024 的 deliverables：

- **Phase 1 完成**：platform 不再 import products — 否則 host package 內部有循環依賴
- **Phase 2 完成**：shared/app-shell.ts 消除 — 否則 type 邊界不清楚
- **Phase 3-4 完成**：core 和 chat 拆分成小模組 — 否則 plugin contract 的粒度太粗
- **Phase 5 完成**：design 提取到 platform level — 否則 plugin 沒有共享 design tokens
- **Phase 6-7 完成**：API contract 統一 + endpoint namespace — 否則 plugin 的 route 掛載規則無法一致

### 推薦時機

- **現在**：不做。PLAN-024 還沒開始。
- **PLAN-024 完成後**：評估。如果只有 Chat 一個 product，plugin 架構是 over-engineering。
- **第二個 product（Work）開始開發時**：正式啟動。Work 作為第一個非內建 plugin 的
  試驗場，驗證 Plugin Contract 是否足夠。
- **第三個 product 上線後**：穩定 contract，發布 `@cats-inc/cats-platform` v1.0.0。

### 投入估計

假設 PLAN-024 已完成：

- 定義 `CatsPlugin` interface + `PluginDependencies`：1-2 天
- 實作 server-side plugin loader：2-3 天
- 實作 client-side plugin renderer：2-3 天
- 將 Chat 改寫為 plugin 格式（`@cats-inc/chat`）：3-5 天
- 設定 pnpm monorepo + build pipeline：1-2 天
- 總計：**約 2 週**

大部分工作是「把已經正確分離的 code 包裝成 plugin 格式」，不是重寫。

---

## 結論

PLAN-024 的架構重整做的是 80% 的 plugin 基礎工作（正確的依賴方向、自包含的
product 邊界、統一的 API contract、共享的 design system）。剩下 20% 是
定義 Plugin Contract、加上 dynamic loading、設定 monorepo — 這些都是
增量工作，不是重寫。

關鍵決策：

- Host 合一包（`@cats-inc/cats-platform`），不拆成 4 個 package
- 目錄邊界服務內部開發，package 邊界服務外部消費
- Plugin 只需要一個 peer dependency：`@cats-inc/cats-platform`
- 時機：等 PLAN-024 完成 + Work 開始開發時再啟動

