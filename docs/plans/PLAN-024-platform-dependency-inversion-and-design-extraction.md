# PLAN-024: Platform Dependency Inversion, Design Extraction, and API Unification

> Implementation plan for [ADR-035](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md)
> and [ADR-036](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md).

## Metadata

- **Status**: Draft
- **Owner**: user
- **Assigned To**: TBD
- **Reviewer**: TBD

## Related Decisions

- [ADR-035: Invert Platform Dependency and Extract Shared Design Layer](../decisions/035-invert-platform-dependency-and-extract-shared-design-layer.md)
- [ADR-036: Unify API Contract and Namespace Endpoints by Product](../decisions/036-unify-api-contract-and-namespace-endpoints-by-product.md)

## Overview

This plan restructures `cats` in seven phases, ordered by dependency: fix the
foundation first (dependency inversion), then decompose oversized files, then
unify the API contract, then rename endpoints, then extract shared design
tokens, then add tests, and finally prepare the suite shell for the product
switcher. Each phase is independently shippable — if the effort is paused
after any phase, the codebase is in a better state than before.

## Current State Snapshot

### Dependency violations (platform → products)

Total: **16 import statements** across 6 files in `platform/` that import
from `products/chat/` or `shared/app-shell.ts` (which re-exports from
`products/chat/`).

```
platform/orchestration/dispatch.ts       → products/chat/state/store (ChatStore)
                                         → products/chat/state/companionBoxStore (CompanionBoxStore)
                                         → products/chat/state/model (buildChannelView)
                                         → products/chat/state/runtimeActions (routeChannelMessage)

platform/orchestration/planner.ts        → products/chat/state/model (buildChannelView, resolveOrchestratorDisplayName)
                                         → products/chat/state/mentionRouter (resolveMentionRoute)
                                         → products/chat/state/roomRouting (resolveRoomRoutingState)

platform/orchestration/execution.ts      → shared/app-shell (ChatChannelView, RoomWorkflow*, RoomRouting* — 12 types)
                                         → products/chat/shared/operatorLoop (ChatRunInspectorView)

platform/orchestration/contracts.ts      → shared/app-shell (ChatChannelView, RoomWorkflow*, RoomRouting* — 12 types)
                                         → products/chat/shared/operatorLoop (ChatOperatorView, ChatRunInspectorView)

platform/orchestration/toolIntent.ts     → shared/app-shell (RoomRoutingMode)

platform/memory/service.ts              → products/chat/state/model (requireChannel)
                                         → products/chat/state/companionBoxStore (CompanionBoxStore)
                                         → products/chat/state/store (ChatStore)

platform/memory/companionStore.ts        → shared/app-shell (ChatCat, ChatChannelView)
                                         → products/chat/state/companionBoxStore (CompanionBoxStore)

platform/memory/extraction.ts            → shared/app-shell (ChatChannelState)

platform/memory/runtimeMaintenance.ts    → products/chat/state/companionBoxStore (CompanionBoxStore)
```

### Oversized files

| File | Lines | Problem |
|---|---|---|
| `products/chat/renderer/styles.css` | 3,422 | All tokens + all components in one file |
| `products/chat/state/runtimeActions.ts` | 2,990 | All runtime actions in one file |
| `core/api.ts` | 1,894 | Fat controller for all core entity routes |
| `products/chat/state/store.ts` | 1,676 | Store with inlined logic |
| `core/model.ts` | 1,486 | All upsert helpers in one file |
| `products/chat/renderer/App.tsx` | 1,449 | God Component |
| `products/chat/state/companionBoxStore.ts` | 1,074 | Could be slimmer |
| `products/chat/state/model.ts` | 1,033 | Mixed concerns |

### Test files

- `cats`: **0** test files
- `cats-runtime`: **72** test files (reference standard)

---

## Phase 1: Dependency Inversion (platform → products)

> **Goal**: `platform/` has zero imports from `products/` or `shared/app-shell.ts`.

### Strategy

The types currently imported from `products/chat/` fall into two categories:

**Category A — Types that are genuinely shared concepts.**
Types like `ChatChannelView`, `RoomWorkflowShape`, `RoomRoutingMode`,
`CompanionBoxStore` are used by platform to orchestrate and manage memory.
These need to become **platform-level interfaces**.

**Category B — Functions that are Chat-specific implementations.**
Functions like `buildChannelView()`, `requireChannel()`,
`resolveRoomRoutingState()`, `routeChannelMessage()` are Chat-specific
implementations. Platform should depend on **abstract interfaces** that
Chat provides at wiring time.

### Step 1.1: Create platform-level interface files

Create the following files that define what platform needs, without
knowing how Chat (or future Work/Code) implements it.

#### `src/platform/orchestration/ports.ts` (new)

```typescript
/**
 * Interfaces that orchestration needs from the product layer.
 * Products provide concrete implementations at composition time.
 */

// Re-export types that orchestration uses internally.
// These were previously imported from shared/app-shell.ts.

export interface ChannelView {
  // Shape matching the fields that orchestration actually reads
  // from ChatChannelView. Extract from current ChatChannelView usage.
  id: string;
  title: string;
  // ... (exact fields determined by grepping orchestration's
  //      property access on ChatChannelView)
}

export interface ChannelViewProvider {
  buildChannelView(channelId: string, state: unknown): ChannelView | null;
  resolveOrchestratorDisplayName(state: unknown): string;
  resolveMentionRoute(body: string, state: unknown): MentionRouteResult;
  resolveRoomRoutingState(channelView: ChannelView, state: unknown): RoomRoutingState;
}

export interface OrchestrationStore {
  read(): Promise<unknown>;
  readCore(): Promise<import('../../core/types.js').CatsCoreState>;
  writeCore(state: import('../../core/types.js').CatsCoreState): Promise<import('../../core/types.js').CatsCoreState>;
}

export interface OperatorInspector {
  buildOperatorView(/* params */): ChatOperatorView | null;
  buildRunInspectorView(/* params */): ChatRunInspectorView | null;
}
```

> **Implementation note**: The exact interface shapes must be derived by
> reading the actual property accesses in `dispatch.ts`, `planner.ts`, and
> `execution.ts`. The above is a structural template — the implementer must
> trace each usage to define the minimal interface.

#### `src/platform/memory/ports.ts` (new)

```typescript
export interface MemoryChannelProvider {
  requireChannel(channelId: string, state: unknown): ChannelState;
}

export interface CompanionStore {
  // Abstract the CompanionBoxStore interface used by memory
  read(): Promise<CompanionBoxState>;
  write(state: CompanionBoxState): Promise<void>;
}

export interface MemoryStore {
  read(): Promise<unknown>;
  readCore(): Promise<import('../../core/types.js').CatsCoreState>;
  writeCore(state: import('../../core/types.js').CatsCoreState): Promise<import('../../core/types.js').CatsCoreState>;
}
```

### Step 1.2: Move shared type definitions to platform

Types like `RoomWorkflowShape`, `RoomRoutingMode`, `RoomRoutingTrigger`,
`RoomWorkflowBranchStrategy`, `RoomWorkflowHandoffReason`, etc. are used
across both `platform/orchestration/` and `products/chat/`.

These are **domain concepts** belonging to the orchestration domain, not
Chat-specific types. They should live in `platform/orchestration/types.ts`.

- [ ] Identify all type names imported by `platform/orchestration/` from
  `shared/app-shell.ts` (currently ~12 types in `execution.ts`,
  ~12 types in `contracts.ts`, 1 type in `toolIntent.ts`)
- [ ] Move these type definitions from `products/chat/api/contracts.ts` to
  `platform/orchestration/types.ts`
- [ ] Update `products/chat/api/contracts.ts` to import from
  `platform/orchestration/types.ts` (Chat becomes the consumer, not
  the definer)
- [ ] Similarly, move `ChatChannelState` (used by `platform/memory/extraction.ts`)
  to a platform-level type in `platform/memory/types.ts`

### Step 1.3: Refactor platform files to use ports

For each of the 6 platform files with violations:

#### `platform/orchestration/dispatch.ts`

Before:
```typescript
import type { CompanionBoxStore } from '../../products/chat/state/companionBoxStore.js';
import type { ChatStore } from '../../products/chat/state/store.js';
import { buildChannelView } from '../../products/chat/state/model.js';
import { routeChannelMessage } from '../../products/chat/state/runtimeActions.js';
```

After:
```typescript
import type { OrchestrationStore, ChannelViewProvider } from './ports.js';
```

The `DispatchOrchestratorTurnInput` interface changes from importing
concrete stores to accepting the abstract ports:

```typescript
interface DispatchOrchestratorTurnInput extends OrchestratorPlanRequest {
  store: OrchestrationStore;          // was: chatStore: ChatStore
  channelViews: ChannelViewProvider;  // was: direct function imports
  runtimeClient: RuntimeClient;
  // ...
}
```

#### `platform/orchestration/planner.ts`

Before:
```typescript
import { buildChannelView, resolveOrchestratorDisplayName } from '../../products/chat/state/model.js';
import { resolveMentionRoute } from '../../products/chat/state/mentionRouter.js';
import { resolveRoomRoutingState } from '../../products/chat/state/roomRouting.js';
```

After:
```typescript
import type { ChannelViewProvider } from './ports.js';
```

`buildOrchestratorTurnPlan()` receives a `ChannelViewProvider` instead of
calling imported functions directly.

#### `platform/orchestration/contracts.ts`

Before:
```typescript
import type { ... } from '../../shared/app-shell.js';
import type { ChatOperatorView, ChatRunInspectorView } from '../../products/chat/shared/operatorLoop.js';
```

After:
```typescript
import type { ... } from './types.js';          // domain types moved here
import type { OperatorInspector } from './ports.js';  // or inline the view types in types.ts
```

#### `platform/orchestration/execution.ts`

Before:
```typescript
import type { ... } from '../../shared/app-shell.js';
import type { ChatRunInspectorView } from '../../products/chat/shared/operatorLoop.js';
```

After:
```typescript
import type { ... } from './types.js';
import type { OperatorInspector } from './ports.js';
```

#### `platform/memory/service.ts`

Before:
```typescript
import { requireChannel } from '../../products/chat/state/model.js';
import type { CompanionBoxStore } from '../../products/chat/state/companionBoxStore.js';
import type { ChatStore } from '../../products/chat/state/store.js';
```

After:
```typescript
import type { MemoryStore, CompanionStore, MemoryChannelProvider } from './ports.js';
```

#### `platform/memory/companionStore.ts`, `extraction.ts`, `runtimeMaintenance.ts`

Same pattern: replace concrete imports with `ports.ts` interfaces.

### Step 1.4: Create Chat adapter implementations

#### `src/products/chat/adapters/orchestrationAdapter.ts` (new)

```typescript
import type { OrchestrationStore, ChannelViewProvider } from '../../../platform/orchestration/ports.js';
import type { ChatStore } from '../state/store.js';
import { buildChannelView, resolveOrchestratorDisplayName } from '../state/model.js';
import { resolveMentionRoute } from '../state/mentionRouter.js';
import { resolveRoomRoutingState } from '../state/roomRouting.js';

export function createChatOrchestrationStore(chatStore: ChatStore): OrchestrationStore {
  return {
    read: () => chatStore.read(),
    readCore: () => chatStore.readCore(),
    writeCore: (state) => chatStore.writeCore(state),
  };
}

export function createChatChannelViewProvider(chatStore: ChatStore): ChannelViewProvider {
  return {
    buildChannelView: (channelId, state) => buildChannelView(state, channelId),
    resolveOrchestratorDisplayName: (state) => resolveOrchestratorDisplayName(state),
    resolveMentionRoute: (body, state) => resolveMentionRoute(body, state),
    resolveRoomRoutingState: (channelView, state) => resolveRoomRoutingState(channelView, state),
  };
}
```

#### `src/products/chat/adapters/memoryAdapter.ts` (new)

Same pattern for memory ports.

### Step 1.5: Update composition root

`src/app/server/index.ts` is the composition root. It currently imports
both platform and product modules and wires them together. After this
change, it also creates the adapters:

```typescript
// Before: platform/orchestration/dispatch imports ChatStore directly
// After: server creates adapter and passes it in

import { createChatOrchestrationStore, createChatChannelViewProvider } from '../../products/chat/adapters/orchestrationAdapter.js';

// ... when dispatching:
const store = createChatOrchestrationStore(chatStore);
const channelViews = createChatChannelViewProvider(chatStore);
const result = await dispatchOrchestratorTurn({ store, channelViews, ... });
```

### Step 1.6: Delete `shared/app-shell.ts`

After all consumers are migrated:

- [ ] Verify `shared/app-shell.ts` has zero importers (grep for `app-shell`)
- [ ] Delete the file
- [ ] Any types that were re-exported and still needed elsewhere should
  already be in `platform/orchestration/types.ts` or
  `products/chat/api/contracts.ts`

### Phase 1 Deliverables

- `platform/` has **zero imports from `products/`** or `shared/app-shell`
- `shared/app-shell.ts` deleted
- Domain types live in `platform/orchestration/types.ts`
- Product-specific implementations are in `products/chat/adapters/`
- Composition wiring is in `app/server/index.ts`
- No runtime behavior changes

### Phase 1 Verification

```bash
# Must return zero results:
grep -r "from '../../products/" cats/src/platform/ --include="*.ts"
grep -r "from '../../shared/app-shell" cats/src/platform/ --include="*.ts"

# App must still start and serve:
cd cats && npm run dev
# Manual: open browser, verify Chat still works
```

---

## Phase 2: File Decomposition

> **Goal**: No production file exceeds 400 lines (test files excluded).

### Step 2.1: Split `core/api.ts` (1,894 lines)

Current file handles all core entity CRUD in one `routeCoreApi()` function.

Create `src/core/api/` directory:

- [ ] `core/api/index.ts` — `routeCoreApi()` that delegates to sub-routers (~50 lines)
- [ ] `core/api/actorRoutes.ts` — actor list/upsert
- [ ] `core/api/conversationRoutes.ts` — conversation list/upsert
- [ ] `core/api/taskRoutes.ts` — task lifecycle, approval decisions, operator actions
- [ ] `core/api/runRoutes.ts` — run/trace/checkpoint/outcome operations
- [ ] `core/api/projectRoutes.ts` — project CRUD
- [ ] `core/api/workItemRoutes.ts` — work item CRUD
- [ ] `core/api/artifactRoutes.ts` — artifact CRUD
- [ ] `core/api/activityRoutes.ts` — activity append/query
- [ ] `core/api/memoryRoutes.ts` — durable memory operations
- [ ] `core/api/ownerRoutes.ts` — owner profile

Shared helpers (`CoreApiDependencies`, `reportCoreMemorySyncFailure`, etc.)
stay in a `core/api/shared.ts`.

The barrel `core/api/index.ts` re-exports `routeCoreApi` so external
import paths (`../../core/api.js`) continue to work during migration.
Once all consumers are updated, the old `core/api.ts` can be deleted.

### Step 2.2: Split `core/model.ts` (1,486 lines)

Create `src/core/model/` directory:

- [ ] `core/model/index.ts` — re-exports all (barrel)
- [ ] `core/model/defaults.ts` — `createDefaultCoreState()`, default helpers
- [ ] `core/model/actors.ts` — `upsertCoreActor()`, related helpers
- [ ] `core/model/conversations.ts` — `upsertCoreConversation()`
- [ ] `core/model/tasks.ts` — `upsertCoreTask()`, `writeApprovalDecision()`
- [ ] `core/model/runs.ts` — `upsertCoreRun()`, `appendCoreTrace()`
- [ ] `core/model/projects.ts` — `upsertCoreProject()`
- [ ] `core/model/workItems.ts` — `upsertCoreWorkItem()`
- [ ] `core/model/artifacts.ts` — `upsertCoreArtifact()`, `upsertCoreCheckpoint()`, `upsertCoreOutcome()`
- [ ] `core/model/approvals.ts` — `upsertCoreApprovalBinding()`, `buildApprovalQueue()`
- [ ] `core/model/activities.ts` — `appendCoreActivity()`
- [ ] `core/model/ownerProfile.ts` — `patchOwnerProfile()`

### Step 2.3: Split `products/chat/state/runtimeActions.ts` (2,990 lines)

Create `src/products/chat/state/actions/` directory. Group by action domain:

- [ ] `actions/index.ts` — barrel re-export
- [ ] `actions/sessionActions.ts` — session activation, sleep/wake, compaction
- [ ] `actions/messageActions.ts` — send/receive messages, message routing
- [ ] `actions/channelActions.ts` — create/update/archive channels
- [ ] `actions/orchestratorActions.ts` — orchestrator dispatch/response handling
- [ ] `actions/deliveryActions.ts` — delivery policy enforcement, commit/push
- [ ] `actions/companionActions.ts` — companion box updates

### Step 2.4: Split `products/chat/renderer/App.tsx` (1,449 lines)

Create focused components:

- [ ] `renderer/ChatApp.tsx` — top-level layout composition only (~50 lines)
- [ ] `renderer/ChatSidebar.tsx` — sidebar panel (channel list, cat roster, nav)
- [ ] `renderer/ChatCanvas.tsx` — main content area (chat view, empty state)
- [ ] `renderer/ChatHeader.tsx` — header bar with channel info
- [ ] `renderer/hooks/useChatState.ts` — state management hook
- [ ] `renderer/hooks/useChannelNavigation.ts` — channel selection/switching

### Phase 2 Deliverables

- No production `.ts`/`.tsx` file exceeds 400 lines
- All existing import paths continue to work via barrel re-exports
- No runtime behavior changes

### Phase 2 Verification

```bash
# Find files exceeding 400 lines (excluding tests and CSS):
find cats/src -name "*.ts" -o -name "*.tsx" | \
  xargs wc -l | sort -rn | \
  awk '$1 > 400 && !/\.test\./ && !/\.css/ { print }'

# Should return zero results (or only test files)

# App must still start:
cd cats && npm run dev
```

---

## Phase 3: API Contract Unification

> **Goal**: One error handling strategy, one response envelope, one request
> body convention, consistent status codes — across all endpoints.

This phase modifies the **internal contract** without changing any URL paths.
Path renaming happens in Phase 4.

### Step 3.1: Move error classes to `shared/errors.ts`

- [ ] Create `src/shared/errors.ts` with unified hierarchy:
  - `ApiError` (base — replaces `CoreApiError`)
  - `ValidationError` (400 — replaces `CoreValidationError`)
  - `NotFoundError` (404 — replaces `CoreNotFoundError`)
  - `ConflictError` (409 — replaces `CoreConflictError`)
- [ ] Delete `core/errors.ts`
- [ ] Update all imports from `core/errors.js` → `shared/errors.js`

### Step 3.2: Make model-layer functions throw typed errors

Replace `throw new Error('Channel not found: ...')` with
`throw new NotFoundError('Channel not found: ...', 'channel_not_found')` in:

- [ ] `products/chat/state/model.ts` — `requireChannel()`, `requireCat()`
- [ ] `products/chat/api/shared.ts` — `requireValidChatScopeId()`
- [ ] Any other model function that throws generic `Error` for
  not-found / validation scenarios

### Step 3.3: Create unified error handler in `shared/http.ts`

- [ ] Add `handleApiError(response, error)` to `shared/http.ts`:
  ```typescript
  export function handleApiError(response: ServerResponse, error: unknown): void {
    if (error instanceof ApiError) {
      sendJson(response, error.statusCode, {
        error: { code: error.code, message: error.message },
      });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(response, 400, {
        error: { code: 'invalid_json', message: 'Request body must be valid JSON' },
      });
      return;
    }
    sendJson(response, 500, {
      error: { code: 'internal_error', message: 'Internal server error' },
    });
  }
  ```

### Step 3.4: Delete redundant error handlers

- [ ] Delete `handleRestError()` from `products/chat/api/shared.ts`
- [ ] Delete `handleCanonicalCatError()` from `products/chat/api/shared.ts`
- [ ] Delete `errorStatusCode()` from `products/chat/api/shared.ts`
- [ ] Delete `sendRestError()` from `products/chat/api/shared.ts`
- [ ] Delete `sendCoreError()` from `core/api.ts` (or `core/api/shared.ts`
  after Phase 2 split)
- [ ] Delete `handleCoreError()` from `core/api.ts`
- [ ] Replace all call sites with `handleApiError(context.response, error)`

### Step 3.5: Standardize response envelope

Update all route handlers to use the `data` / `meta` envelope:

**Collection endpoints:**

Before:
```typescript
sendJson(response, 200, { actors: core.actors });
```

After:
```typescript
sendJson(response, 200, { data: core.actors, meta: { total: core.actors.length } });
```

- [ ] Update all `handleCore*` list handlers in `core/api/` files
- [ ] Update all `handleRestList*` handlers in `products/chat/api/`

**Single resource endpoints:**

Before:
```typescript
sendJson(response, 201, { project: persistedProject, created: true });
```

After:
```typescript
sendJson(response, 201, { data: persistedProject, created: true });
```

- [ ] Update all `handleCore*Write` handlers
- [ ] Update all `handleRestCreate*` / `handleRestUpdate*` handlers

**Delete endpoints:**

Before:
```typescript
sendJson(response, 200, { deleted: true, bindingId });
```

After:
```typescript
response.writeHead(204);
response.end();
```

- [ ] Update `handleDeleteBotBinding`
- [ ] Update `handleRestDeleteChannel`
- [ ] Update `handleRestDeleteCat`
- [ ] Update any other delete handlers

### Step 3.6: Standardize request body to flat format

Update Core API write handlers to read flat body instead of wrapped:

Before:
```typescript
const project = await readWrappedBody(context, 'project');
```

After:
```typescript
const body = await readObjectBody(context);
const title = readRequiredString(body.title, 'title');
```

- [ ] Update all `handleCore*Write` handlers (actors, conversations,
  tasks, runs, projects, workItems, artifacts, checkpoints, outcomes,
  activities, approvalBindings, ownerProfile)
- [ ] Delete `readWrappedBody()` from `core/api.ts` / `core/api/shared.ts`

### Step 3.7: Update renderer fetch calls

Every `fetch()` call in the renderer that reads response JSON must be
updated to unwrap from `data`:

Before:
```typescript
const { actors } = await response.json();
```

After:
```typescript
const { data: actors } = await response.json();
```

- [ ] `products/chat/renderer/api.ts`
- [ ] `products/chat/renderer/App.tsx` (or decomposed components)
- [ ] `products/work/renderer/api.ts`
- [ ] `products/code/renderer/api.ts`

Similarly, update request bodies from wrapped to flat format.

### Phase 3 Deliverables

- One error class hierarchy in `shared/errors.ts`
- One `handleApiError()` in `shared/http.ts`
- All responses use `{ data, meta }` envelope
- All request bodies are flat
- DELETE returns 204
- Zero redundant error handling functions

### Phase 3 Verification

```bash
# No old error handlers remain:
grep -rn 'handleRestError\|handleCanonicalCatError\|handleCoreError\|sendCoreError\|sendRestError' \
  cats/src/ --include="*.ts"
# Should return zero results

# No old envelope patterns:
grep -rn '{ actors:\|{ channels:\|{ project:\|{ deleted: true' \
  cats/src/ --include="*.ts" | grep -v test | grep -v '\.d\.ts'
# Should return zero results (all replaced with { data: ... })

# App must still work:
cd cats && npm run dev
# Manual: verify CRUD operations in browser
```

---

## Phase 4: Endpoint Renaming

> **Goal**: Shared resources at `/api/*`, Chat-specific at `/api/chat/*`,
> `/api/core/` prefix removed.

### Step 4.1: Add redirect layer

Create `src/shared/redirects.ts`:

```typescript
const REDIRECT_MAP: Record<string, string> = {
  '/api/core': '/api/state',
  '/api/core/actors': '/api/actors',
  '/api/core/conversations': '/api/conversations',
  '/api/core/projects': '/api/projects',
  '/api/core/work-items': '/api/work-items',
  '/api/core/tasks': '/api/tasks',
  '/api/core/runs': '/api/runs',
  '/api/core/traces': '/api/traces',
  '/api/core/checkpoints': '/api/checkpoints',
  '/api/core/outcomes': '/api/outcomes',
  '/api/core/artifacts': '/api/artifacts',
  '/api/core/activities': '/api/activities',
  '/api/core/approval-bindings': '/api/approval-bindings',
  '/api/core/approvals': '/api/approvals',
  '/api/core/operator-actions': '/api/operator-actions',
  '/api/core/owner-profile': '/api/owner-profile',
};

const CHAT_REDIRECT_PREFIXES = [
  { from: '/api/app-shell', to: '/api/chat/app-shell' },
  { from: '/api/views/app-shell', to: '/api/chat/views/app-shell' },
  { from: '/api/channels', to: '/api/chat/channels' },
  { from: '/api/cats', to: '/api/chat/cats' },
  { from: '/api/orchestrator', to: '/api/chat/orchestrator' },
  { from: '/api/bot-bindings', to: '/api/chat/bot-bindings' },
  { from: '/api/setup', to: '/api/chat/setup' },
  { from: '/api/preferences', to: '/api/chat/preferences' },
  { from: '/api/owner/memory', to: '/api/chat/memory' },
  { from: '/api/runtime/mcp', to: '/api/chat/runtime/mcp' },
];
```

- [ ] Create redirect file
- [ ] Insert redirect check at the top of `routeRequest()` in
  `app/server/index.ts` — before any route matching

### Step 4.2: Update route matching in `core/api/` files

- [ ] Change all `'/api/core/actors'` → `'/api/actors'` etc.
- [ ] Change `routeCoreApi` path matching

### Step 4.3: Update route matching in `products/chat/api/` files

- [ ] Add `/api/chat/` prefix to all Chat routes:
  - `shellRoutes.ts`: `/api/app-shell` → `/api/chat/app-shell`
  - `resourceRoutes.ts`: `/api/channels` → `/api/chat/channels`,
    `/api/cats` → `/api/chat/cats`, etc.
  - `orchestratorRoutes.ts`: `/api/orchestrator/*` → `/api/chat/orchestrator/*`
  - `botBindingRoutes.ts`: `/api/bot-bindings` → `/api/chat/bot-bindings`
  - `setupRoutes.ts`: `/api/setup/*` → `/api/chat/setup/*`
  - `memoryRoutes.ts`: `/api/owner/memory/*` → `/api/chat/memory/*`
  - `companionBoxRoutes.ts`: update channel sub-routes
  - `runtimeBridgeRoutes.ts`: `/api/runtime/mcp` → `/api/chat/runtime/mcp`

### Step 4.4: Update renderer API calls

- [ ] Update all fetch URLs in `products/chat/renderer/api.ts`
- [ ] Update all fetch URLs in `products/chat/renderer/App.tsx`
  (or decomposed components after Phase 2)
- [ ] Update any hardcoded API paths in shared utilities

### Step 4.5: Add basic pagination support

- [ ] Create `shared/pagination.ts`:
  ```typescript
  export interface PaginationParams {
    limit: number;
    cursor: string | null;
  }

  export interface PaginationMeta {
    total: number;
    limit?: number;
    cursor?: string | null;
    hasMore?: boolean;
  }

  export function parsePaginationParams(url: URL): PaginationParams {
    const limit = Math.min(
      Math.max(Number(url.searchParams.get('limit')) || 100, 1),
      500,
    );
    const cursor = url.searchParams.get('cursor') || null;
    return { limit, cursor };
  }
  ```
- [ ] Apply pagination to `/api/traces`, `/api/activities`,
  `/api/checkpoints`, `/api/chat/channels/:id/messages`
- [ ] Other endpoints return `meta: { total }` without cursor support

### Step 4.6: Add basic filtering support

- [ ] `/api/tasks` — `?status=`, `?assignedActorId=`
- [ ] `/api/actors` — `?kind=`
- [ ] `/api/work-items` — `?projectId=`, `?status=`
- [ ] `/api/traces` — `?runId=`, `?taskId=`
- [ ] `/api/activities` — `?projectId=`, `?conversationId=`

Invalid filter values return `400` with descriptive error.

### Phase 4 Deliverables

- `/api/core/*` prefix removed — shared resources at `/api/*`
- Chat routes under `/api/chat/*`
- Old paths return 301 redirect
- Pagination on unbounded collections
- Basic filtering on key endpoints

### Phase 4 Verification

```bash
# Old core paths redirect:
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/core/actors
# Should return 301

# New paths work:
curl -s http://localhost:3000/api/actors | jq '.data | length'
# Should return actor count

# Chat paths work:
curl -s http://localhost:3000/api/chat/channels | jq '.data | length'
# Should return channel count

# Pagination works:
curl -s 'http://localhost:3000/api/traces?limit=2' | jq '.meta'
# Should show { total: N, limit: 2, hasMore: true/false }

# Filtering works:
curl -s 'http://localhost:3000/api/tasks?status=in_progress' | jq '.data | length'

# App must still work end-to-end:
cd cats && npm run dev
# Manual: full navigation through Chat UI
```

---

## Phase 5: Design Token Extraction

> **Goal**: Shared visual identity owned at suite level, not inside Chat.

### Step 3.1: Create `src/design/` directory

- [ ] `design/tokens.css` — `:root` color variables (extracted from
  `styles.css` lines 1-21)
- [ ] `design/typography.css` — font stack, font-size scale, line-height,
  font-smoothing (extracted from `styles.css` lines 23-37)
- [ ] `design/spacing.css` — spacing scale (`--space-1` through `--space-8`),
  new tokens not currently in codebase
- [ ] `design/layout.css` — sidebar width, z-index scale, breakpoints
- [ ] `design/reset.css` — box-sizing, margin resets (extracted from
  `styles.css` lines 62-81)

### Step 3.2: Extract shared component styles

Identify components used across products (or will be):

- [ ] `design/components/tooltip.css` — `.tooltipPortal` styles (lines 42-60)
- [ ] `design/components/badge.css` — status badges (`.ready`, `.warm`, `.muted`
  variants used in sidebar and operator panel)
- [ ] `design/components/sidebar-chrome.css` — sidebar frame, hover/active
  states, collapse behavior (lines 120-160 + 1320-1530 approximately)
- [ ] `design/components/avatar.css` — avatar sizing, color circles

### Step 3.3: Reorganize Chat-specific styles

Split remaining Chat styles into scoped files:

- [ ] `products/chat/renderer/styles/index.css` — imports all below
- [ ] `products/chat/renderer/styles/chatView.css` — message area, bubbles,
  choices
- [ ] `products/chat/renderer/styles/chatSidebar.css` — channel list,
  cat roster (Chat-specific sidebar content, not chrome)
- [ ] `products/chat/renderer/styles/settings.css` — settings panel
  (lines 927-1070 approx)
- [ ] `products/chat/renderer/styles/companion.css` — companion box
- [ ] `products/chat/renderer/styles/operator.css` — operator loop / run
  inspector (lines 1573-1810 approx)
- [ ] `products/chat/renderer/styles/setup.css` — first-run setup wizard
- [ ] `products/chat/renderer/styles/myCats.css` — My Cats roster panel
  (lines 2829-2983)
- [ ] `products/chat/renderer/styles/catInspect.css` — cat detail/inspect
  panels (lines 3061-3420)

### Step 3.4: Update entry point

```css
/* src/renderer/styles.css — new version */
@import '../design/tokens.css';
@import '../design/typography.css';
@import '../design/spacing.css';
@import '../design/layout.css';
@import '../design/reset.css';
@import '../design/components/tooltip.css';
@import '../design/components/badge.css';
@import '../design/components/sidebar-chrome.css';
@import '../design/components/avatar.css';
```

Each product surface imports its own styles separately:

```css
/* products/chat/renderer/styles/index.css */
@import './chatView.css';
@import './chatSidebar.css';
@import './settings.css';
@import './companion.css';
@import './operator.css';
@import './setup.css';
@import './myCats.css';
@import './catInspect.css';
```

### Step 3.5: Add font-size and spacing token usage

Replace hardcoded values in all CSS files:

- [ ] `font-size: 0.72rem` → `font-size: var(--text-xs)`
- [ ] `font-size: 0.85rem` → `font-size: var(--text-sm)`
- [ ] `font-size: 1rem` → `font-size: var(--text-base)`
- [ ] `padding: 4px` → `padding: var(--space-1)`
- [ ] `padding: 8px` → `padding: var(--space-2)`
- [ ] `gap: 12px` → `gap: var(--space-3)`
- [ ] etc.

This step is mechanical but large. Prioritize shared components first,
Chat-specific styles can migrate incrementally.

### Step 3.6: Enforce token-only rule

Add a CI check (or pre-commit grep):

```bash
# Fail if any CSS file under src/ contains raw hex colors
# (except design/tokens.css where they're defined)
grep -rn '#[0-9A-Fa-f]\{3,8\}' cats/src/ --include="*.css" \
  | grep -v 'design/tokens.css' \
  | grep -v '/* raw-ok */'
```

Files that legitimately need raw values can use a `/* raw-ok */` comment.

### Phase 5 Deliverables

- `src/design/` directory with tokens, typography, spacing, reset, layout
- Shared component styles in `design/components/`
- `products/chat/renderer/styles.css` (3,422 lines) replaced by ~10 focused
  CSS files, each under 500 lines
- Suite-level `renderer/styles.css` imports `design/` only
- Product styles import their own scoped files

### Phase 5 Verification

```bash
# No CSS file should exceed 500 lines:
find cats/src -name "*.css" | xargs wc -l | sort -rn | awk '$1 > 500 { print }'

# Visual regression: open browser, navigate through all Chat views:
# - Sidebar navigation
# - Chat view (messages, choices)
# - Settings panel
# - Companion box
# - Operator panel
# - First-run setup
# Compare screenshots before/after to verify no visual changes.
```

---

## Phase 6: Testing Baseline

> **Goal**: Every file created or significantly modified in Phases 1-5 has
> a corresponding `.test.ts`. Establish the testing pattern for future work.

### Step 6.1: Core model unit tests

These are pure functions — easiest to test:

- [ ] `core/model/actors.test.ts` — test `upsertCoreActor()` create/update
- [ ] `core/model/tasks.test.ts` — test `upsertCoreTask()`, approval flows
- [ ] `core/model/runs.test.ts` — test `upsertCoreRun()`, trace append
- [ ] `core/model/approvals.test.ts` — test `buildApprovalQueue()`,
  `writeApprovalDecision()`
- [ ] `core/model/defaults.test.ts` — test `createDefaultCoreState()`

### Step 6.2: Governance unit tests

`core/governance.ts` is already pure (537 lines of builder/reader functions):

- [ ] `core/governance.test.ts` — test all `buildCore*Summary()` and
  `readCore*` functions with known inputs

### Step 6.3: Platform port adapter tests

- [ ] `products/chat/adapters/orchestrationAdapter.test.ts` — verify adapter
  correctly delegates to Chat implementations
- [ ] `products/chat/adapters/memoryAdapter.test.ts` — same pattern

### Step 6.4: Orchestration planner tests

`platform/orchestration/planner.ts` builds turn plans from state + input
(pure function):

- [ ] `platform/orchestration/planner.test.ts` — test plan building with
  mock `ChannelViewProvider`

### Step 6.5: API contract tests

- [ ] `shared/errors.test.ts` — verify error classes produce correct
  status codes and error shapes
- [ ] `shared/pagination.test.ts` — verify `parsePaginationParams()`
- [ ] `core/api/actorRoutes.test.ts` — verify `{ data, meta }` envelope,
  correct status codes, error responses
- [ ] `products/chat/api/resourceRoutes.test.ts` — verify Chat endpoints
  return correct envelope and handle errors via `ApiError`

### Phase 6 Deliverables

- Minimum **20 test files** covering core model, governance, adapters,
  planner, error handling, and API envelope
- Testing pattern established for future contributors
- CI can run tests on every change

### Phase 6 Verification

```bash
cd cats && npm test
# All tests pass, coverage report generated
```

---

## Phase 7: Suite Shell Preparation

> **Goal**: Sidebar chrome owned by suite shell, ready for product switcher.

### Step 7.1: Create `SuiteShell` component

- [ ] `app/renderer/SuiteShell.tsx` — renders the shared sidebar frame:
  - Logo / product name with dropdown trigger
  - Product switcher dropdown (Chat / Work / Code)
  - Sidebar body slot (receives per-product sidebar content)
  - Bottom: user avatar, settings link
- [ ] `app/renderer/SuiteSidebar.tsx` — routes the sidebar body slot to the
  active product's sidebar component

### Step 7.2: Define product surface contract

- [ ] `app/renderer/productSurface.ts` — interface:
  ```typescript
  export interface ProductSurface {
    id: SuiteSurfaceId;
    label: string;
    SidebarContent: React.ComponentType;
    MainContent: React.ComponentType;
  }
  ```
- [ ] Each product registers its surface via this interface

### Step 5.3: Refactor product renderers

- [ ] `products/chat/renderer/ChatSidebar.tsx` — (created in Phase 2)
  exports the Chat sidebar content component
- [ ] `products/chat/renderer/ChatCanvas.tsx` — (created in Phase 2)
  exports the Chat main content component
- [ ] `products/work/renderer/WorkSidebar.tsx` — placeholder sidebar
- [ ] `products/work/renderer/WorkCanvas.tsx` — placeholder main content
- [ ] `products/code/renderer/CodeSidebar.tsx` — placeholder sidebar
- [ ] `products/code/renderer/CodeCanvas.tsx` — placeholder main content

### Step 5.4: Update `SuiteApp.tsx`

Current `SuiteApp` does route-level switching to whole product apps.
After this change, it wraps each product in `SuiteShell`:

```tsx
export default function SuiteApp() {
  return (
    <SuiteShell>
      <Routes>
        <Route path="/work/*" element={<WorkSurface />} />
        <Route path="/code/*" element={<CodeSurface />} />
        <Route path="*" element={<ChatSurface />} />
      </Routes>
    </SuiteShell>
  );
}
```

### Step 5.5: Extract sidebar chrome CSS

The sidebar chrome styles (frame, collapse, footer) moved to
`design/components/sidebar-chrome.css` in Phase 5 are now used by
`SuiteShell`. Product-specific sidebar items (channel list, project list)
remain in their respective product CSS files.

### Phase 5 Deliverables

- `SuiteShell` component owns the sidebar frame and product switcher
- Each product provides `SidebarContent` and `MainContent` components
- Product switcher dropdown functional (Chat ↔ Work ↔ Code navigation)
- Work and Code show placeholder content

### Phase 7 Verification

```bash
cd cats && npm run dev
# Manual:
# 1. Open browser
# 2. Verify sidebar shows "Cats Chat ▾" at top
# 3. Click dropdown → switch to Work → verify placeholder renders
# 4. Switch to Code → verify placeholder renders
# 5. Switch back to Chat → verify full Chat UI works
# 6. Verify sidebar bottom (avatar, settings) persists across switches
```

---

## Files to Create

| File | Phase | Description |
|---|---|---|
| `platform/orchestration/ports.ts` | 1 | Orchestration port interfaces |
| `platform/orchestration/types.ts` | 1 | Domain types moved from `shared/app-shell` |
| `platform/memory/ports.ts` | 1 | Memory port interfaces |
| `products/chat/adapters/orchestrationAdapter.ts` | 1 | Chat implementation of orchestration ports |
| `products/chat/adapters/memoryAdapter.ts` | 1 | Chat implementation of memory ports |
| `core/api/index.ts` | 2 | Core API router (replaces `core/api.ts`) |
| `core/api/actorRoutes.ts` | 2 | Actor CRUD |
| `core/api/conversationRoutes.ts` | 2 | Conversation CRUD |
| `core/api/taskRoutes.ts` | 2 | Task lifecycle |
| `core/api/runRoutes.ts` | 2 | Run/trace/checkpoint |
| `core/api/projectRoutes.ts` | 2 | Project CRUD |
| `core/api/workItemRoutes.ts` | 2 | Work item CRUD |
| `core/api/artifactRoutes.ts` | 2 | Artifact CRUD |
| `core/api/activityRoutes.ts` | 2 | Activity operations |
| `core/api/memoryRoutes.ts` | 2 | Durable memory |
| `core/api/ownerRoutes.ts` | 2 | Owner profile |
| `core/api/shared.ts` | 2 | Shared helpers |
| `core/model/index.ts` | 2 | Model barrel |
| `core/model/defaults.ts` | 2 | Default state factory |
| `core/model/actors.ts` | 2 | Actor upsert |
| `core/model/conversations.ts` | 2 | Conversation upsert |
| `core/model/tasks.ts` | 2 | Task upsert |
| `core/model/runs.ts` | 2 | Run/trace upsert |
| `core/model/projects.ts` | 2 | Project upsert |
| `core/model/workItems.ts` | 2 | Work item upsert |
| `core/model/artifacts.ts` | 2 | Artifact/checkpoint/outcome |
| `core/model/approvals.ts` | 2 | Approval logic |
| `core/model/activities.ts` | 2 | Activity append |
| `core/model/ownerProfile.ts` | 2 | Owner profile patch |
| `products/chat/state/actions/index.ts` | 2 | Actions barrel |
| `products/chat/state/actions/sessionActions.ts` | 2 | Session actions |
| `products/chat/state/actions/messageActions.ts` | 2 | Message actions |
| `products/chat/state/actions/channelActions.ts` | 2 | Channel actions |
| `products/chat/state/actions/orchestratorActions.ts` | 2 | Orchestrator actions |
| `products/chat/state/actions/deliveryActions.ts` | 2 | Delivery actions |
| `products/chat/state/actions/companionActions.ts` | 2 | Companion actions |
| `products/chat/renderer/ChatApp.tsx` | 2 | Layout composition |
| `products/chat/renderer/ChatSidebar.tsx` | 2 | Sidebar panel |
| `products/chat/renderer/ChatCanvas.tsx` | 2 | Main content |
| `products/chat/renderer/ChatHeader.tsx` | 2 | Header bar |
| `products/chat/renderer/hooks/useChatState.ts` | 2 | State hook |
| `products/chat/renderer/hooks/useChannelNavigation.ts` | 2 | Navigation hook |
| `shared/errors.ts` | 3 | Unified API error classes |
| `shared/pagination.ts` | 4 | Pagination utilities |
| `shared/redirects.ts` | 4 | Legacy path → new path redirect map |
| `design/tokens.css` | 5 | Color tokens |
| `design/typography.css` | 5 | Font scale |
| `design/spacing.css` | 5 | Spacing scale |
| `design/layout.css` | 5 | Layout constants |
| `design/reset.css` | 5 | Base resets |
| `design/components/tooltip.css` | 5 | Tooltip styles |
| `design/components/badge.css` | 5 | Status badges |
| `design/components/sidebar-chrome.css` | 5 | Sidebar frame |
| `design/components/avatar.css` | 5 | Avatar styles |
| `products/chat/renderer/styles/index.css` | 5 | Chat styles barrel |
| `products/chat/renderer/styles/chatView.css` | 5 | Chat view |
| `products/chat/renderer/styles/chatSidebar.css` | 5 | Chat sidebar items |
| `products/chat/renderer/styles/settings.css` | 5 | Settings |
| `products/chat/renderer/styles/companion.css` | 5 | Companion box |
| `products/chat/renderer/styles/operator.css` | 5 | Operator panel |
| `products/chat/renderer/styles/setup.css` | 5 | Setup wizard |
| `products/chat/renderer/styles/myCats.css` | 5 | My Cats roster |
| `products/chat/renderer/styles/catInspect.css` | 5 | Cat inspect panel |
| 20+ test files | 6 | See Phase 6 details |
| `app/renderer/SuiteShell.tsx` | 7 | Suite shell frame |
| `app/renderer/SuiteSidebar.tsx` | 7 | Sidebar slot router |
| `app/renderer/productSurface.ts` | 7 | Surface registration |

## Files to Delete

| File | Phase | Reason |
|---|---|---|
| `shared/app-shell.ts` | 1 | Re-export barrel replaced by platform types |
| `core/api.ts` | 2 | Replaced by `core/api/` directory |
| `core/model.ts` | 2 | Replaced by `core/model/` directory |
| `core/errors.ts` | 3 | Replaced by `shared/errors.ts` |
| `products/chat/state/runtimeActions.ts` | 2 | Replaced by `state/actions/` directory |
| `products/chat/renderer/App.tsx` | 2 | Replaced by composed components |
| `products/chat/renderer/styles.css` | 5 | Replaced by `design/` + scoped CSS files |

## Risks & Mitigations

- **Import churn breaks existing code**
  - Impact: High
  - Mitigation: Use barrel re-exports (`index.ts`) at old paths during
    migration. Remove old barrels only after all consumers are updated.
    Run `npm run build` after each step to catch broken imports immediately.

- **CSS extraction introduces visual regressions**
  - Impact: Medium
  - Mitigation: Take before-screenshots of every Chat view. After each CSS
    split, compare visually. Specificity issues are the main risk — maintain
    the same import order to preserve cascade.

- **Platform interfaces are too narrow or too wide**
  - Impact: Medium
  - Mitigation: Derive interface shapes by tracing actual property access in
    current code, not by guessing. Start with the minimal interface and
    expand only when a consumer needs more.

- **Phase 1 changes conflict with in-flight feature work**
  - Impact: Medium
  - Mitigation: Complete Phase 1 in a single feature branch and merge before
    starting other work. Coordinate with any parallel contributors.

- **Response envelope change breaks renderer**
  - Impact: High
  - Mitigation: Phase 3 updates both server and renderer in the same commit
    per endpoint. Never deploy envelope changes without the corresponding
    renderer update. Use `npm run build` to catch type errors.

- **Endpoint rename breaks bookmarked URLs or external integrations**
  - Impact: Low (currently one consumer: the renderer)
  - Mitigation: 301 redirect layer in Phase 4 ensures old URLs still work.
    Redirects are kept until all consumers are verified.

## Phase Ordering & Independence

```
Phase 1 (Dependency Inversion)
    ↓
Phase 2 (File Decomposition)      ← can partially overlap with Phase 1
    ↓
Phase 3 (API Contract)            ← requires Phase 2 (split files are easier to modify)
    ↓
Phase 4 (Endpoint Renaming)       ← requires Phase 3 (unified contract first, then rename)
    ↓
Phase 5 (Design Extraction)       ← independent of Phases 3-4
    ↓
Phase 6 (Testing)                 ← can overlap with Phases 3-5
    ↓
Phase 7 (Suite Shell)             ← depends on Phase 2 (ChatSidebar) + Phase 5 (sidebar-chrome)
```

Phases 1 and 2 can be interleaved. Phases 3 and 4 must be sequential
(unify contract first, then rename — otherwise you'd rename endpoints with
inconsistent contracts). Phase 5 is independent of 3-4 and can run in
parallel. Phase 6 can overlap with 3-5 as testable targets emerge.
Phase 7 must wait for Phases 2 and 5.

---

*Created: 2026-03-24*
*Author: Claude*
