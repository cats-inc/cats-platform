# Cats Plugin Architecture and Packaging Strategy

## Metadata

- **Date**: 2026-03-24
- **Author**: Claude
- **Status**: Draft — pending review
- **Scope**: Feasibility of cats as a plugin platform, package split strategy, plugin contract design
- **Related**:
  - [ADR-025](../decisions/025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md) — platform host structure
  - [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md) — dependency inversion
  - [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md) — unified API contract
  - [ADR-037](../decisions/037-serve-runtime-dashboard-and-playground-from-platform-host.md) — runtime tool hosting
  - [PLAN-024](../plans/PLAN-024-platform-dependency-inversion-and-design-extraction.md) — architecture restructuring implementation plan

---

## Core Claim

After PLAN-024 is complete, the internal structure of cats already meets the
prerequisites of a plugin architecture:

- `core/` is the shared domain model, and every product reads and writes organization state through it
- `platform/` depends on interfaces rather than concrete product implementations
- `design/` is the shared visual language
- `app/` is the platform shell, which owns the product switcher and sidebar slot
- Each `products/*` is self-contained: its own routes, components, and styles

The incremental work needed to evolve cats from a "multi-product monolith" into
"host + plugins" is small. In essence it is defining a formal Plugin Contract
and adding dynamic loading.

---

## Part 1: Package Split Strategy

### Principle: the host is one package, each product is independent

Industry plugin hosts are all a single package:

- A VS Code extension depends on `vscode`
- An Obsidian plugin depends on `obsidian`
- A Figma plugin depends on `figma`

Nobody splits the host into multiple packages and makes plugins peer-depend on
each one. Splitting only creates version-alignment trouble for plugin
developers, with no benefit on the consumer side.

### Final npm package structure

```
@cats-inc/cats-platform          ← host (core + platform + design + shell in one package)
@cats-inc/chat          ← Chat plugin (built in by default, installed with the host)
@cats-inc/work          ← Work plugin (official, optional install)
@cats-inc/code          ← Code plugin (official, optional install)
@cats-inc/learn         ← future official or community plugin
@cats-inc/note          ← future
@cats-inc/play          ← future
```

### The host package still keeps its directory layering internally

```
@cats-inc/cats-platform/
  src/
    core/              ← domain model, types, store
    platform/          ← orchestration, memory, transports
    design/            ← tokens, typography, shared CSS
    app/               ← PlatformShell, plugin loader, product switcher
    shared/            ← errors, http utils, pagination
```

Directory boundaries serve internal developers, and package boundaries serve
external consumers. The two scales are independent.

### subpath exports

The host package exposes a layered API through subpath exports, so a plugin
does not need to import the whole host, only the parts it needs:

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

The plugin's import style:

```typescript
import type { CatsPlugin, PluginDependencies } from '@cats-inc/cats-platform/plugin';
import type { CoreActorRecord, CoreTaskRecord } from '@cats-inc/cats-platform/core';
import type { ApiError, NotFoundError } from '@cats-inc/cats-platform/shared';
```

### A plugin package's peer dependency

Each plugin needs only one peer dependency:

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

## Part 2: Plugin Contract Design

### CatsPlugin interface

This is the contract by which a plugin registers itself with the host:

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

Shared services the host injects into the plugin. A plugin does not import the
implementations directly; they are injected by the host:

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

The props the host passes to a plugin's React components:

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

## Part 3: Plugin Discovery and Loading

### Configuration

```typescript
// cats.config.ts
import type { CatsConfig } from '@cats-inc/cats-platform';

export default {
  plugins: [
    '@cats-inc/chat',           // official plugin, npm install
    '@cats-inc/work',           // official plugin, npm install
    './plugins/my-custom',      // local plugin (in development)
  ],

  /** The product shown by default at startup */
  defaultPlugin: 'chat',
} satisfies CatsConfig;
```

### Server-side loading

At startup the host dynamically imports each plugin and mounts its routes:

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

The product switcher gets the list of loaded plugins from the host and renders dynamically:

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

## Part 4: What a Plugin Looks Like

Take `@cats-inc/work` as an example:

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
      work.css                ← Work-specific styles (imports @cats-inc/cats-platform/design tokens)
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

## Part 5: Monorepo Toolchain

### Recommended: pnpm workspaces

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```
cats-platform/                 ← monorepo root (public target)
  packages/
    cats-platform/             ← @cats-inc/cats-platform (host)
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
  tsconfig.base.json           ← shared TypeScript config
```

### Why pnpm rather than npm workspaces

- pnpm's strict node_modules layout prevents phantom dependencies
- If a plugin imports a dependency it did not declare, it fails immediately instead of accidentally succeeding through hoisting
- For a plugin architecture, correct dependency boundaries matter more than they do with npm workspaces

---

## Part 6: Electron Packaging

At Electron build time, plugins are **bundled**, not discovered at runtime:

```
electron-dist/
  node_modules/
    @cats-inc/cats-platform/          ← host
    @cats-inc/chat/          ← preinstalled plugin
    @cats-inc/work/          ← preinstalled plugin
  runtime-pages/             ← cats-runtime dashboard/playground (ADR-037)
```

Electron's `main.js` reads `cats.config.ts` and imports all plugins. Users do
not need to `npm install` — the preinstalled plugins are already in the bundle.

If we later want to support "users installing third-party plugins", that is a
separate research topic (involving sandboxing, permissions, auto-update) and is
out of scope for this document.

---

## Part 7: Timing and Prerequisites

### PLAN-024 is a required prerequisite

The plugin architecture needs the following PLAN-024 deliverables:

- **Phase 1 complete**: platform no longer imports products — otherwise the host package has circular dependencies internally
- **Phase 2 complete**: shared/app-shell.ts eliminated — otherwise type boundaries are unclear
- **Phases 3-4 complete**: core and chat split into small modules — otherwise the plugin contract is too coarse-grained
- **Phase 5 complete**: design extracted to the platform level — otherwise plugins have no shared design tokens
- **Phases 6-7 complete**: unified API contract + endpoint namespaces — otherwise plugin route mounting rules cannot be consistent

### Recommended timing

- **Now**: do not do it. PLAN-024 has not started.
- **After PLAN-024 completes**: evaluate. If Chat is the only product, a plugin architecture is over-engineering.
- **When development of the second product (Work) begins**: formally start. Work
  serves as the proving ground for the first non-built-in plugin, validating
  whether the Plugin Contract is sufficient.
- **After the third product ships**: stabilize the contract and publish `@cats-inc/cats-platform` v1.0.0.

### Effort estimate

Assuming PLAN-024 is complete:

- Define the `CatsPlugin` interface + `PluginDependencies`: 1-2 days
- Implement the server-side plugin loader: 2-3 days
- Implement the client-side plugin renderer: 2-3 days
- Rewrite Chat into plugin form (`@cats-inc/chat`): 3-5 days
- Set up the pnpm monorepo + build pipeline: 1-2 days
- Total: **about 2 weeks**

Most of the work is "wrapping already correctly separated code into plugin
form", not rewriting.

---

## Conclusion

The architecture restructuring in PLAN-024 does 80% of the plugin groundwork
(correct dependency direction, self-contained product boundaries, a unified API
contract, a shared design system). The remaining 20% is defining the Plugin
Contract, adding dynamic loading, and setting up the monorepo — all incremental
work, not a rewrite.

Key decisions:

- The host is one package (`@cats-inc/cats-platform`), not split into 4 packages
- Directory boundaries serve internal development, and package boundaries serve external consumers
- A plugin needs only one peer dependency: `@cats-inc/cats-platform`
- Timing: start once PLAN-024 is complete and Work development begins
