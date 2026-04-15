# Codex-Specific Instructions

> **If you are NOT Codex (OpenAI Codex CLI), please ignore this file.**

## Prerequisites

**MUST** read `AGENTS.md` first for cross-agent guidelines before reading this file.

## Role Awareness

Check the **Project Roles** table in `AGENTS.md`.
- If a **Conductor** is assigned (and it is not you), act as a Specialist: prioritize their tasks and strictly follow their architectural plans.
- If **you** are the Conductor, you are responsible for orchestration, task management, and status tracking.

## Command Aliases

| Alias | Action |
|-------|--------|
| `dyu` | **MUST** confirm you have read `AGENTS.md` and this file. **MUST** respond with exactly: "I am Codex, and I understand." |

## About This File

This file contains Codex-specific configurations and instructions that should not be applied by other AI agents (Claude, Gemini, etc.).

Only Codex should read and maintain this file.

---

## Codex-Specific Configurations

### Behavioral Guidelines

- **MUST** read AGENTS.md at the start of every session
- **MUST** follow the Development Workflow defined in AGENTS.md
- **MUST** run validation proportional to the change risk
- **MUST NOT** modify other agents' files (CLAUDE.md, GEMINI.md)
- **SHOULD** ask for clarification when requirements are ambiguous
- **SHOULD** make minimal, focused edits

### Conductor Responsibilities

If assigned as Conductor in Project Roles table:
- **MUST** maintain README.md "Current Status" section
- **MUST** create and assign tasks in `docs/plans/`
- **MUST** document major decisions in `docs/decisions/`
- **MUST NOT** make unilateral architectural decisions without documentation

### Code Modification Rules

- **MUST** prefer targeted tests or focused verification over full-suite runs
- **MUST** update tests when behavior or contracts change
- **MUST** update documentation when changing public APIs
- **MUST** follow coding conventions specified in AGENTS.md
- **MUST** respect `.editorconfig` settings (LF line endings, final newline, trim rules)
- **MUST NOT** use interactive rebase; always use non-interactive rebase commands only
- **MUST NOT** run `git commit` and `git push` simultaneously or in one
  parallelized step; finish and verify the commit first, then run a separate
  push
- **MUST NOT** run plain `git rebase --continue` in this Windows/PowerShell
  workspace, because Git may open an editor and block the session
- **MUST** continue rebases with an explicit no-editor command after conflicts
  are resolved:
  `$env:GIT_EDITOR='node -e \"process.exit(0)\"'; git rebase --continue`
- **SHOULD** use the same no-editor pattern for `git cherry-pick --continue`
  and `git merge --continue` when Git would otherwise invoke an editor
- **SHOULD** make minimal, focused changes
- **SHOULD** commit frequently with clear messages

### Testing Scope

- Default to the smallest validation that can prove the change works.
- Do **not** default to `npm test` for small or localized edits.
- Prefer file-scoped tests, targeted `node --test ...`, targeted Vitest runs,
  build checks, or a narrow manual verification of the touched flow.
- Escalate to broader suites only when touching shared contracts, cross-product
  wiring, storage layout, startup/bootstrap, or routing used by multiple
  surfaces.
- For docs-only changes, do not run code tests unless the docs depend on a
  command or behavior you re-verified.

### Runtime Smoke / Live Debug SOP

When debugging Chat live typing or session-start regressions, Codex should use a
fresh-channel probe against the already running `dev:server` and `dev:web`.
Do not trust stale UI state or older transcripts.

- Treat `direct_cat_chat` and `solo`/orchestrator as separate contracts. Probe
  both paths; a fix in one does not prove the other.
- For new-runtime-session flows, the expected UX handoff is
  `user dots -> session_started system message -> assistant dots -> first
  assistant text chunk`.
- If the final assistant reply appears without a visible assistant typing bubble,
  the handoff gate is still wrong even if the response content is correct.
- Create fresh probe channels through the API instead of reusing existing rooms.
- For direct/cat probes, `POST /api/channels` with `entryKind: 'direct'`,
  `roomMode: 'direct_cat_chat'`, `participantCatIds`, and
  `skipBossCatGreeting: true`.
- For solo/orchestrator probes, `POST /api/channels` with `entryKind: 'solo'`,
  `composerMode: 'solo'`, `pendingProvider`, `pendingModel`, and
  `skipBossCatGreeting: true`.
- Open the exact room URL in the renderer:
  `http://127.0.0.1:5173/chat/chats/<channelId>`. Do not rely on
  `/chat/new` selection sync for smoke probes.
- Do not wait on Playwright `networkidle`; the live stream keeps connections
  open. Use `domcontentloaded` plus explicit path and selector waits.
- Sample the DOM over time for `.userTurnStatusProcessing`,
  `.typingIndicator`, the `connected to cats-runtime session` system message,
  and the first assistant reply text.
- Inspect browser trace via `globalThis.__catsLiveTrace` and server trace via
  `GET /api/debug/live-trace`. Check `GET /api/channels/:id/messages` when you
  need to distinguish UI gating bugs from missing server events.
- `GET /api/app-shell` is useful for confirming shell capabilities and whether
  live trace is enabled in the current dev session.
- For direct lanes, do not assert `.channelTopBarTitle` against the generated
  debug room title. The visible title may resolve to the cat name instead.
- Common orchestrator trap: live progress may arrive as
  `participantId: 'orchestrator'`, while the matching `session_started` system
  message only declares `targetKind: 'orchestrator'` with `targetId: null`.
  Do not gate assistant dots on `targetId` existing for orchestrator flows.
- Current dev settings matter: `CATS_RUNTIME_MAX_SESSIONS=20`,
  `CATS_DEBUG_LIVE_TRACE=true`, and
  `CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE=false`.
- When session capacity is near or exhausted, aggressively clean up probe rooms.
  `DELETE /api/channels/:id` is acceptable on this dev machine and, under the
  current debug config, should delete linked runtime sessions as well.
- `POST /api/channels/:id/deactivate` is the lighter-weight fallback when you
  want to release runtime sessions without deleting the product transcript.
- Prefer deleting and recreating probe channels over reusing polluted runtime
  state.

### Agent Skills

Codex discovers skills from `.agents/skills/<name>/SKILL.md`. The canonical source is the `skills/` directory at the project root.

To sync skills after changes:
```powershell
.\scripts\windows\Sync-AgentSkills.ps1
```

### Search and Navigation Preferences

- **SHOULD** prefer `rg` (ripgrep) for searching text content
- **SHOULD** use `fd` for finding files by name patterns
- **MAY** use `grep` or `find` as fallbacks if other tools unavailable

### Preferred Behaviors

- **Precision**: Keep edits minimal and surgical
- **Testing**: Use risk-based, targeted validation by default
- **Configuration compliance**: Always respect `.editorconfig`
- **Documentation**: Keep docs synchronized with code

### Refactor Retrospective Guardrails

The unpushed/local fix stack after the April 9, 2026 refactor pass showed a
clear pattern: most regressions were not "logic bugs" in isolation; they came
from flattening product-specific UI semantics into over-generic shared
components, over-sharing CSS without preserving Chat's DOM/class contracts, and
using overly broad state signals for routing/scroll/live behavior.

Codex MUST treat the following as hard guardrails when refactoring `cats`.

#### 1. Do not unify distinct chat modes into one generic chip/stack abstraction

- **MUST** preserve mode-specific composer semantics. These are not cosmetic;
  they encode product behavior.
- `New chat` solo draft: provider/model chip, no recipient-plus icon.
- `Group chat` draft: avatar stack, collapsed by default, hover-expand,
  delete gating remains product-specific.
- `Parallel chat` draft: every branch keeps model-aware chips/stubs; do not
  degrade secondary branches to implicit-recipient plus chips.
- Ongoing direct/private lane: single avatar, not a provider/model pill.
- Ongoing group room: avatar stack, not a single implicit provider/model pill.
- **MUST NOT** replace these mode-specific presentations with
  `ComposerRecipientChip` or other generic shared UI unless the old mode's DOM,
  interaction rules, and visual semantics are preserved exactly.
- Before extracting a shared renderer primitive, **MUST** write down which of
  the above mode contracts it is allowed to serve and which it is not.

#### 2. Chat styling is contract-sensitive; do not swap stylesheet chains casually

- **MUST NOT** replace Chat-local stylesheet entry chains with shared bundles
  unless the resulting DOM/class structure is proven equivalent for Chat.
- Chat's visual behavior depends on exact class names, stacking contexts,
  sticky offsets, hover-only controls, and negative margins. Treat those as
  behavioral contracts, not implementation details.
- **MUST** preserve:
  - transcript bubble spacing and content-based widths
  - hover-only copy/action controls
  - composer chip/stack appearance by mode
  - footer/header fixed heights when they are intentionally aligned
  - overflow menu layering above sidebar/footer/canvas chrome
  - sentinel offsets used by Chat transcript scrolling
- **MUST NOT** "simplify" z-index or sticky positioning globally when a local
  class-level adjustment will solve the problem.
- If changing shared/chat CSS used by sticky composer/footer/sidebar chrome,
  **MUST** manually check for scrollbar-dependent 1px drift.

#### 3. Routing, scroll, and live state must use narrow truth sources

- **MUST NOT** use `selectedChannel.updatedAt` as a transcript auto-scroll
  trigger. It is too broad and causes scroll bounce/regressions.
- Transcript follow state **MUST** be keyed from actual transcript signals:
  message count, last visible message identity/timestamp, and live-indicator
  visibility state.
- Routing effects **MUST NOT** depend on whole `state` objects when a smaller
  route key / fallback key will do.
- Navigation surfaces in compare/group contexts **MUST** prefer route state as
  the immediate source of truth; do not wait for lagging `selectedChannel`
  mirrors when computing prev/next/member selection.
- **MUST NOT** stack custom EventSource retry loops on top of native
  EventSource reconnection unless there is a documented reason. Duplicated retry
  policies caused noisy stream storms.

#### 4. Shared refactors must preserve runtime/session metadata, not just transcript text

- `session_started`, `cwd`, lease/session metadata, and startup recovery notes
  are part of the user-visible chat contract.
- **MUST NOT** treat runtime metadata as optional just because assistant/user
  bubbles still render.
- When touching runtime-dispatch merge/recovery/wake paths, **MUST** verify:
  - recovered stale-session retries keep `session_started` messages
  - composer cwd chips still appear for draft/direct/group flows
  - startup-recovery interruptions remain visible and truthful
  - parallel member finalization cannot clobber sibling channel state
- Read-time repair is acceptable as a safety net, but **MUST** still chase the
  write-path/root-cause when metadata is dropped.

#### 5. Shared settings shells must not wrap platform shells twice

- **MUST NOT** embed a second settings shell/menu inside a page that already
  lives under `PlatformSettingsShell`.
- `Settings > My Cats` should render the Cats canvas directly, not a nested
  shell with another General/Cats/Data rail.
- When upstreaming settings components into shared renderer space, **MUST**
  explicitly identify which layer owns navigation chrome and ensure it exists
  exactly once.

#### 6. Preserve title semantics and user-facing labels during structure changes

- **MUST NOT** rewrite channel titles during structural actions like ungroup
  unless the product explicitly wants a retitle.
- Group rename propagation and ungroup title preservation are separate
  contracts; keep both.
- For room/thread titles, labels shown in recents, footer tabs, and grouped
  states are user-facing data contracts, not disposable derived strings.

#### 7. Refactor validation must include chat-mode smoke checks, not only unit tests

- For any refactor touching shared/chat renderer components, styles, routing,
  or room state, Codex **MUST** run targeted tests **and** perform a manual dev
  smoke check of the affected Chat surfaces before calling the refactor safe.
- Minimum smoke checklist when touching shared Chat UI:
  - `+New chat` provider/model chip
  - `+Group chat` draft avatar stack and delete rules
  - `+Parallel chat` secondary branch chips/stacks
  - direct/private lane composer avatar
  - ongoing group room composer avatar stack
  - sidebar overflow menu placement
  - transcript bubble spacing/actions

#### 8. Browser-safe helpers must stay separate from state/model server code

- Codex has already caused the same regression more than once: importing
  browser-reachable code from `src/products/chat/state/model/*` pulled
  `node:crypto.randomUUID` from `state/model/shared.ts` into the Vite client
  bundle and crashed the renderer.
- **MUST NOT** import `src/products/chat/state/model/index.ts` or other
  state/model modules from renderer/shared client code unless the full import
  chain has been verified browser-safe.
- If renderer/operator/live-indicator code only needs canonical channel
  identity helpers such as `channelId -> conversationId/containerId`, **MUST**
  place that helper in a browser-safe shared module under
  `src/products/chat/shared/` instead of reaching into state/model.
- When moving or re-exporting helpers across the client/server boundary,
  **MUST** verify both:
  - `npm run build:web`
  - `npm run build:server`
- If a helper is relocated out of `readModels.ts` or another state/model file,
  **MUST** also verify that server-side re-exports still exist so
  `dev:server` does not fail on missing named exports.
- For any refactor that changes imports used by renderer/shared code, treat
  `node:crypto`, `node:fs`, `node:path`, and runtime-session/state-store
  modules as contamination signals. If any of them become reachable from
  client code, the boundary is wrong.
  - post-send route switching
  - compare footer left/right switching
  - transcript scroll to bottom on thread switch
  - session connection metadata and cwd chip visibility
  - `Settings > My Cats` without nested shell duplication
- If manual verification is not possible in the current session, Codex **MUST**
  state that explicitly and reduce refactor scope instead of assuming visual
  parity.

#### 8. "Shared" is not a success metric by itself

- **MUST NOT** optimize for fewer files/imports at the expense of product truth.
- A refactor is only acceptable when behavior, DOM contract, and runtime state
  semantics remain intact.
- When a shared extraction forces repeated mode-specific exceptions to restore
  behavior, treat that as evidence the abstraction boundary is wrong.
- In Chat-heavy surfaces, prefer a thin shared substrate plus product-owned
  rendering branches over one universal renderer component.

#### 9. When reviewing recent product work, do not "repair" intentional new UI back to an older contract

- The latest explicit user intent for the current surface beats older local
  assumptions about what the UI "used to be."
- **MUST NOT** revert a recently introduced UI direction during review/fix work
  unless the user explicitly asks for that rollback.
- If current tests, notes in this file, or older DOM assumptions conflict with
  the user's intended current UI, update the tests/docs/guardrails instead of
  forcing the UI back to the older shape.
- For Chat draft surfaces specifically, treat workflow/routing fixes and UI
  contract changes as separate concerns. Preserve the current UI unless the
  task is explicitly about changing it.
- April 10, 2026 regression lesson: when a bug-fix request is about behavior
  behind a new UI, keep the new UI and repair the behavior underneath it.

### Project-Specific Context

- Main app port: `CATS_INC_PORT` (default `8181`)
- Renderer dev port: `5173`
- Runtime dependency: `CATS_RUNTIME_BASE_URL` (default `http://127.0.0.1:3110`)
- Core modules: `src/config.ts`, `src/runtime/client.ts`,
  `src/products/chat/state/shell.ts`, `src/app/server/index.ts`,
  `src/app/renderer/App.tsx`
- Test command: `npm test`
- Product direction: build the Node/TS platform product directly around
  `cats-runtime` as the only runtime boundary

### Working Product Memory

These notes capture the current user direction for `cats`. They are
working memory for Codex, not yet a ratified product spec or ADR.

- The flagship product brand remains `Cats`, but the main platform
  host/repo/package target is now `cats-platform` under the `Cats Inc`
  umbrella brand, with a later public repo target of
  `cats-inc/cats-platform`. `cats-can` is reserved for the one-shot installer
  entrypoint.
- The first real product line is a chat product, not a narrow "one-man digital
  company" shell. It should feel like a general chat app that also supports
  agent orchestration.
- A later product line may exist as `Cats Work`, with dashboards, org views,
  backlog, finance, and other company-control-plane surfaces. That line should
  be treated as future work, not pulled into the current chat scope by default.
- `cats-runtime` is expected to be open source and remains the runtime boundary
  for the product. The app should not couple directly to lower-level runtime
  internals.
- External entrypoints such as Telegram Bot and LINE@ are part of the intended
  MVP shape. In those channels, the user expects a single bot-facing
  orchestrator surface rather than many visible workers.
- The orchestrator may itself run as a worker backed by `cats-runtime`, but in
  product terms it has elevated responsibilities: delegation, summarization,
  escalation, takeover handoff, and owner-facing option presentation before
  dispatch.
- Inside the main app, users should still be able to chat directly with
  non-orchestrator cats/resources. The "single orchestrator bot" constraint is
  mainly for external messaging transports like Telegram or LINE.
- Worker conversations, user conversations, and external transport transcripts
  should be persisted. Operational search should be available from the app, and
  archived material is expected to flow into a separate RAG/memory layer later.
- The system should eventually support "Know Your Boss" behavior: orchestrators
  and workers adapting to the owner's preferences, escalation thresholds, and
  decision style.
- Packaging and onboarding matter. The product should move toward a
  native-feeling desktop experience with simple installation and guided setup,
  especially to reduce the friction of deploying local runtime dependencies.
- For desktop packaging/startup bugs, do **not** assume a meaningful shipped
  install base or invent migration/self-heal work by default. Unless the user
  explicitly says an upgrade path or existing deployed installs matter, prefer
  direct fixes for the current package and clean-install behavior over legacy
  registry cleanup, compatibility shims, or one-off migration code.

### Parallel Product Delivery Rules

`cats` is now in parallel delivery mode for `Cats Chat`, `Cats Work`, and
`Cats Code`.

- Stay inside your assigned product tree by default:
  - Chat: `src/products/chat/**`
  - Work: `src/products/work/**`
  - Code: `src/products/code/**`
- Do not edit other product trees unless explicitly acting as the integrator.
- Treat these files as frozen shared contracts:
  - `src/core/types.ts`
  - `src/platform/orchestration/contracts.ts`
  - `src/shared/roomRouting.ts`
  - `src/products/chat/api/contracts.ts`
- Do not reshape frozen shared contracts during feature work. Shared contract
  changes must go through integration review plus docs (`SPEC/ADR/PLAN`) first.
- Do not expand platform-host wiring directly during product work.
  `src/app/server/**` is integration-owned.
- Product APIs must land through product-owned delegates:
  - Chat: `src/products/chat/api/index.ts`
  - Work: `src/products/work/api/index.ts`
  - Code: `src/products/code/api/index.ts`
- Shared visual primitives may live in `src/design/**`, but do not upstream
  Chat-specific UI behavior into shared components prematurely.
- Keep layering intact: `core/` and `platform/` must not import product
  implementations.
- Before handoff or commit, run the narrowest validation that covers the
  changed surface; only run `npm test` when the change actually warrants full
  suite coverage.
- Follow `docs/product-integration-guide.md` and
  `docs/plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md`
  when integrating product work into the platform host.

---

## Maintenance

This file is maintained by Codex only. Other agents should not modify this file.

Last updated: 2026-04-15
