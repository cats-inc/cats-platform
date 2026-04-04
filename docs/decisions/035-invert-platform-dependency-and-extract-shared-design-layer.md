# ADR-035: Invert Platform Dependency and Extract Shared Design Layer

> Correct the structural debt in `cats` by inverting the platform→products
> dependency direction, decomposing oversized files, extracting a shared
> design token layer, and establishing a testing baseline — before Work and
> Code surfaces begin active development.

## Status

Proposed

## Date

2026-03-24

## Context

[ADR-025](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md)
established the target direction: `Cats Core` becomes the source of truth,
and product surfaces (Chat, Work, Code) consume projections. The directory
layout was adjusted accordingly, and `PlatformApp` in
`src/app/renderer/App.tsx` already routes to per-product React subtrees.

However, the **internal dependency graph and file decomposition** were never
corrected to match. The issues below are structural obstacles that will
compound as Work and Code surfaces grow.

### Issue 1: Platform reverse-depends on Products

The `platform/` layer — intended as shared, product-agnostic infrastructure —
imports directly from `products/chat/`:

| Platform file | Imports from products/chat/ |
|---|---|
| `platform/orchestration/dispatch.ts` | `ChatStore`, `CompanionBoxStore`, `buildChannelView`, `routeChannelMessage` |
| `platform/orchestration/planner.ts` | `buildChannelView`, `resolveOrchestratorDisplayName`, `resolveMentionRoute`, `resolveRoomRoutingState` |
| `platform/orchestration/execution.ts` | `ChatRunInspectorView` (from `products/chat/shared/operator-loop/index`) |
| `platform/memory/service.ts` | `requireChannel`, `CompanionBoxStore`, `ChatStore` |
| `platform/memory/companionStore.ts` | `CompanionBoxStore` |
| `platform/memory/runtimeMaintenance.ts` | `CompanionBoxStore` |
| `platform/transports/telegram/bridge.ts` | `ChatStore`, `CompanionBoxStore`, `appendMessage`, `createChannel`, `requireChannel`, `routeChannelMessage` |

This creates a hard coupling: any new product (Work, Code) that needs
orchestration or memory must either route through Chat's state layer, or
duplicate platform code. Neither is acceptable.

Additionally, `shared/app-shell.ts` re-exports 73 type names from
`products/chat/api/contracts.ts`, giving Chat-specific DTOs the appearance
of platform-level contracts. `platform/orchestration/execution.ts` and
`platform/orchestration/toolIntent.ts` both import from this re-export
barrel, perpetuating the illusion that Chat types are shared types.

### Issue 2: Oversized files

Current line counts for the largest files:

- `products/chat/renderer/styles.css` — **2,924 lines** (tokens + tooltip + sidebar + chat bubbles + settings + all components in one file)
- `products/chat/state/runtimeActions.ts` — **2,897 lines** (all runtime interaction logic)
- `core/api.ts` — **1,761 lines** (fat controller handling actors, conversations, tasks, runs, traces, checkpoints, outcomes, artifacts, activities, approvals, memory sync)
- `core/model.ts` — **1,376 lines** (all upsert/mutation helpers for every core entity)
- `products/chat/state/store.ts` — **1,536 lines**
- `products/chat/renderer/App.tsx` — **1,353 lines** (God Component: sidebar + canvas + routing + state wiring)
- `core/taskLifecycle.ts` — **552 lines** (task/run checkout and runtime lifecycle logic already concentrated in one file)

These files are already difficult to review, test, and modify safely.
Adding Work and Code will increase pressure on the shared files (core/api,
core/model, platform/*) and create parallel oversized files per product.

### Issue 3: Design tokens locked inside Chat

All CSS custom properties (`:root` variables for colors, typography, spacing,
shadows) live in `products/chat/renderer/styles.css`. The platform-level
`renderer/styles.css` is a single line:

```css
@import '../products/chat/renderer/styles.css';
```

When Work and Code surfaces ship, they will either:

- import Chat's stylesheet and inherit Chat-specific component styles, or
- define their own tokens, creating divergent look-and-feel

The product switcher UX (sidebar top dropdown, chat-app-style layout) requires
that all surfaces share the same shell chrome, sidebar structure, typography
scale, and color palette.

### Issue 4: Tests exist, but the refactor guardrails are still inadequate

`cats` currently has **39** repo-owned test files under `tests/`. That is not
zero, but it is also not yet the architectural safety net this refactor needs.
The hotspot seams called out above still need stronger boundary, contract, and
integration coverage. `cats-runtime` remains the denser, more focused testing
reference for runtime-facing infrastructure work.

### Comparison with cats-runtime

`cats-runtime` demonstrates the target architectural quality:

- HTTP routing, runtime services, and backend adapters are separated more
  cleanly than in `cats`
- Each concern has focused files (sessionBranching, sessionCompaction, sessionMaintenance, sessionWakeup)
- Runtime-focused tests cover services and utilities more systematically
- Adapter/Strategy pattern for providers — adding a new CLI provider does not touch core

This ADR aims to bring `cats` closer to that standard.

## Decision

### 1. Introduce platform-level interfaces and inject product implementations

Platform modules will define the **interfaces** they need. Products will
provide concrete implementations at composition time (in `app/server/`).

Before (platform imports product):

```
platform/orchestration/dispatch.ts
  → import { ChatStore } from '../../products/chat/state/store.js'
  → import { buildChannelView } from '../../products/chat/state/model.js'
```

After (platform defines contract, product implements):

```
platform/orchestration/contracts.ts
  → export interface OrchestrationStore { ... }
  → export interface ChannelViewBuilder { ... }

products/chat/state/orchestrationAdapter.ts
  → implements OrchestrationStore using ChatStore

app/server/index.ts
  → wires ChatOrchestrationAdapter into dispatchOrchestratorTurn()
```

The specific interfaces to extract:

- **`OrchestrationStore`** — read/write core state, read channel views.
  Currently satisfied by `ChatStore.readCore()`, `ChatStore.read()`, and
  `buildChannelView()`.
- **`ChannelViewProvider`** — resolve a channel view for a given conversation
  or channel ID, resolve orchestrator display name, resolve mention routes,
  resolve room routing state. Currently scattered across
  `products/chat/state/model/index.ts`, `mentionRouter.ts`,
  `room-routing/index.ts`.
- **`MemoryStoreProvider`** — read/write companion box data, resolve channel
  for memory flush. Currently satisfied by `CompanionBoxStore` and
  `requireChannel()`.
- **`OperatorInspector`** — provide `ChatRunInspectorView` for execution
  monitoring. Currently in `products/chat/shared/operator-loop/index.ts`.

### 2. Retire `shared/app-shell.ts` as a re-export barrel

`shared/app-shell.ts` currently re-exports 73 Chat-specific types, giving
them false platform-level status. This file will be removed.

- Consumers inside `products/chat/` will import directly from
  `products/chat/api/contracts.ts`
- Consumers in `platform/` will import from the new platform-level
  interfaces defined in step 1
- The 4 files currently importing from `shared/app-shell.ts`
  (`platform/orchestration/execution.ts`, `platform/orchestration/toolIntent.ts`,
  `platform/memory/companionStore.ts`, `platform/memory/extraction.ts`) will
  be updated to import from platform contracts or from products directly
  where the coupling is intentional

### 3. Decompose oversized files

Target: no production file exceeds **400 lines**. Test files may be longer.

#### 3a. `core/api.ts` (1,761 lines) → domain-scoped route handlers

Split by resource domain:

- `core/api/actorRoutes.ts` — actor CRUD
- `core/api/conversationRoutes.ts` — conversation CRUD
- `core/api/taskRoutes.ts` — task lifecycle, approval decisions
- `core/api/runRoutes.ts` — run/trace/checkpoint/outcome operations
- `core/api/projectRoutes.ts` — project CRUD
- `core/api/workItemRoutes.ts` — work item CRUD
- `core/api/artifactRoutes.ts` — artifact CRUD
- `core/api/activityRoutes.ts` — activity append/query
- `products/chat/api/memory/index.ts` — chat-owned durable memory operations
- `core/api/ownerRoutes.ts` — owner profile
- `core/api/index.ts` — re-exports `routeCoreApi` that delegates to the above

#### 3b. `core/model.ts` (1,376 lines) → domain-scoped mutation helpers

Each `upsertCore*` function group moves to its own file under `core/model/`:

- `core/model/actors.ts`
- `core/model/conversations.ts`
- `core/model/tasks.ts`
- `core/model/runs.ts`
- `core/model/projects.ts`
- `core/model/workItems.ts`
- `core/model/artifacts.ts`
- `core/model/approvals.ts`
- `core/model/index.ts` — re-exports all (preserving current import paths
  via the barrel)

#### 3c. `products/chat/state/runtimeActions.ts` (2,897 lines) → action groups

Split by action domain:

- `state/actions/sessionActions.ts` — session start/stop/wake
- `state/actions/messageActions.ts` — send/receive/route messages
- `state/actions/channelActions.ts` — channel lifecycle
- `state/actions/orchestratorActions.ts` — orchestrator dispatch/response
- `state/actions/deliveryActions.ts` — delivery policy enforcement
- `state/actions/index.ts` — re-exports

#### 3d. `products/chat/renderer/App.tsx` (1,353 lines) → composed layout

- `renderer/ChatApp.tsx` — top-level layout composition (~50 lines)
- `renderer/ChatSidebar.tsx` — sidebar panel
- `renderer/ChatCanvas.tsx` — main content area
- `renderer/ChatHeader.tsx` — header bar
- `renderer/hooks/useChatState.ts` — state wiring hook
- `renderer/hooks/useChannelNavigation.ts` — channel switching logic

### 4. Extract shared design token layer

Create `src/design/` as the single source of truth for cross-product visual
identity.

#### Directory structure

```
src/design/
  tokens.css              — :root CSS custom properties (colors, shadows)
  typography.css          — font-family, font-size scale, font-weight, line-height
  spacing.css             — spacing scale (--space-1 through --space-8)
  layout.css              — sidebar width, breakpoints, z-index scale
  components/
    tooltip.css           — shared tooltip styles (currently in chat styles.css)
    badge.css             — status badges (ready/warm/muted)
    sidebar-chrome.css    — sidebar frame, hover, active states
    avatar.css            — avatar sizing and colors
```

#### Token extraction from current `styles.css`

The current `:root` block (lines 1-38 of `products/chat/renderer/styles.css`)
moves to `design/tokens.css` with additions for spacing and font-size scales:

```css
:root {
  /* ── Color tokens ── */
  --app-bg: #FAFAF7;
  --sidebar-bg: #EDE9E1;
  --canvas-bg: #FAFAF7;
  --panel: #ffffff;
  --panel-hover: #E8E4DC;
  --border: #E4DFD7;
  --text: #1A1A1A;
  --muted: #6B6560;
  --muted-soft: #8C857D;
  --accent: #C4653A;
  --accent-soft: rgba(196, 101, 58, 0.1);
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  /* ── Status tokens ── */
  --ready-bg: rgba(61, 167, 121, 0.11);
  --ready-text: #207a53;
  --warm-bg: rgba(191, 146, 73, 0.12);
  --warm-text: #8d6830;
  --muted-bg: rgba(122, 116, 108, 0.1);
  --muted-text: #756d64;

  /* ── Sidebar tokens ── */
  --sidebar-hover-bg: rgba(0, 0, 0, 0.04);
  --sidebar-active-bg: rgba(0, 0, 0, 0.06);
}
```

```css
/* design/typography.css */
:root {
  font-family: 'Aptos', system-ui, 'Segoe UI', 'Helvetica Neue', sans-serif;
  line-height: 1.6;
  font-weight: 400;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  --text-xs: 0.72rem;
  --text-sm: 0.85rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
}
```

```css
/* design/spacing.css */
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 48px;
}
```

#### Enforcement rules

- No production CSS file may contain raw hex/rgb color values; use
  `var(--token-name)` only
- No production CSS file may contain raw `font-size` pixel/rem values;
  use `var(--text-*)` tokens
- Product-specific CSS files may override tokens via scoped selectors
  (e.g., `.work-surface { --accent: #3A7EC4; }`) but must not redefine
  the token vocabulary itself

#### Entry point change

```css
/* renderer/styles.css — after */
@import '../design/tokens.css';
@import '../design/typography.css';
@import '../design/spacing.css';
@import '../design/layout.css';
@import '../design/components/tooltip.css';
@import '../design/components/badge.css';
@import '../design/components/sidebar-chrome.css';
@import '../design/components/avatar.css';
```

Each product then imports only its own styles:

```css
/* products/chat/renderer/styles.css — after */
/* No :root block. No shared component styles. Only chat-specific. */
.chatView { ... }
.chatBubble { ... }
.companionBox { ... }
```

#### `styles.css` decomposition target

The current 2,924-line file splits roughly as:

- `design/` — ~150 lines (tokens + typography + spacing + layout)
- `design/components/` — ~300 lines (tooltip, badge, sidebar chrome, avatar)
- `products/chat/renderer/styles/` — ~2,500 lines remaining, further split:
  - `chatView.css` — chat message area styles
  - `chatSidebar.css` — chat-specific sidebar items (channel list, cat list)
  - `settings.css` — settings panel
  - `companion.css` — companion box
  - `operatorUi.css` — operator loop / run inspector
  - `setup.css` — first-run setup wizard

Each file targets 200-500 lines. If any exceeds 500, it should be split
further by component.

### 5. Strengthen the testing baseline

Before or during the refactor, introduce tests for the modules being touched:

- `core/model/` — unit tests for each upsert helper (pure functions,
  easy to test)
- `core/governance.ts` — already pure, add coverage
- `platform/orchestration/planner.ts` — unit tests for plan building
  (pure function taking state + input)
- `design/` — no runtime tests needed; enforce token usage via a lint
  rule or CI grep

Target: every file created or significantly modified during this refactor
must have a corresponding `.test.ts` or automated boundary check. This
strengthens the testing culture that already exists and turns it into a real
architectural safety net for subsequent Work and Code development.

### 6. Product switcher preparation

The sidebar dropdown product switcher requires that the sidebar frame
(logo area, user avatar, dropdown trigger) is owned by the platform shell,
not by any individual product.

The current `ChatApp.tsx` owns the entire sidebar including the shell chrome.
After decomposition (step 3d), the sidebar frame moves to `app/renderer/`:

```
app/renderer/
  PlatformApp.tsx            — route switching (already exists)
  PlatformShell.tsx          — sidebar frame: logo, product switcher, user avatar
  PlatformSidebar.tsx        — sidebar slot that renders per-product sidebar content

products/chat/renderer/
  ChatSidebar.tsx         — chat-specific sidebar content (channel list, cat list)
  ChatCanvas.tsx          — chat main content

products/work/renderer/
  WorkSidebar.tsx         — work-specific sidebar content (project list, boards)
  WorkCanvas.tsx          — work main content
```

Each product exposes a `Sidebar` and a `Canvas` component. `PlatformShell`
renders the shared chrome and delegates the sidebar body and main content
to the active product's components.

## Consequences

### Positive

- `platform/` becomes genuinely product-agnostic — Work and Code can use
  orchestration and memory without routing through Chat state
- No single file exceeds 400 lines, making review, testing, and navigation
  manageable
- Design tokens are shared by definition, not by accident — adding a new
  product surface automatically inherits the correct visual identity
- The refactor strengthens the testing baseline instead of pretending the repo
  starts from zero
- The platform shell chrome (sidebar frame, product switcher) is owned at the
  correct level, not inside Chat

### Negative

- Significant import churn across `platform/`, `core/`, and
  `products/chat/` — reviewers should expect many files touched with
  mostly mechanical changes
- Introducing platform-level interfaces adds a small amount of indirection
  that did not exist before
- The CSS extraction requires verifying visual correctness across the
  full Chat UI — regression testing is manual until screenshot tests
  are introduced

### Neutral

- This ADR does not change any runtime behavior or API contract
- This ADR does not introduce new npm dependencies
- This ADR does not require changes to `cats-runtime`
- This ADR does not require Work or Code to ship — it prepares the
  ground for them
- Existing `PlatformApp` route structure is preserved

## Alternatives Considered

### Alternative 1: Defer until Work/Code development begins

- **Pros**: no immediate cost
- **Cons**: Work/Code developers will face the same coupling problems on day
  one; the refactor becomes harder with more code in place; oversized files
  continue to grow
- **Why rejected**: the cost of refactoring increases non-linearly with
  codebase size — doing it now at ~42,000 total lines is far cheaper than
  doing it at 80,000+

### Alternative 2: Adopt a CSS framework (Tailwind, Radix Themes) instead of custom tokens

- **Pros**: well-documented, widely understood, rich component set
- **Cons**: the current CSS is only ~2,900 lines and already uses custom
  properties; introducing a framework adds build complexity and learning
  overhead; the existing visual identity would need to be re-expressed in
  the framework's idiom
- **Why rejected**: the problem is token ownership and file organization,
  not missing framework features — custom properties are sufficient at
  this scale

### Alternative 3: Split each product into a separate npm package within a monorepo

- **Pros**: strong compile-time isolation; independent versioning
- **Cons**: premature packaging complexity; shared state access becomes
  cross-package imports; toolchain overhead (workspaces, build ordering)
- **Why rejected**: same reasoning as ADR-025 Alternative 2 — the platform
  benefits from one host repo and one shared composition path at current
  maturity

### Alternative 4: Skip file decomposition and only fix the dependency direction

- **Pros**: smaller diff; focuses on the most critical issue
- **Cons**: leaves 3,000-line files that are difficult to test, review,
  and extend; does not address the design token ownership problem
- **Why rejected**: dependency inversion without decomposition would
  create correct but still unwieldy interfaces — the interfaces work best
  when the underlying implementations are focused and testable

## References

- [ADR-025](./025-make-cats-inc-a-platform-host-with-core-owned-product-projections.md) — platform host structure
- [ADR-010](./010-separate-read-model-app-shell-from-restful-resource-apis.md) — API surface separation
- [ADR-007](./007-establish-cats-core-v1-for-chat-and-work.md) — Cats Core as shared domain
- [PLAN-024](../plans/PLAN-024-platform-dependency-inversion-and-design-extraction.md) — implementation plan
- `cats-runtime` architecture (reference for target quality)

---

*Proposed: 2026-03-24*
*Decision makers: user + Claude*
