# Paperclip Control Plane Analysis for Cats Inc

Status: Unreviewed notes — refiled 2026-04-02; original authoring date unknown, filename date is not authoritative

> Scope note for current `cats`: this document preserves a broader
> Paperclip-to-Cats product analysis. Sections discussing company root scope,
> org charts, goals, projects, work items, approvals, budgets, and broader
> control-plane evolution are currently not applicable to the chat-only
> `cats` product line. Keep those sections as reference notes only unless a
> future product split explicitly revives them.

## Purpose

Study the local `paperclip/` submodule and extract the product concepts,
functional seams, and migration risks that should inform the next `cats`
rewrite phases.

## Local Sources Reviewed

| Source | Why it matters |
|--------|----------------|
| `paperclip/README.md` | Product positioning, feature inventory, and boundaries |
| `paperclip/doc/PRODUCT.md` | Canonical product definition and design principles |
| `paperclip/docs/agents-runtime.md` | Runtime execution, wakeups, session continuity, and operator workflows |
| `paperclip/doc/CLI.md` | Operator and automation command surface |
| `paperclip/doc/plans/2026-03-13-workspace-product-model-and-work-product.md` | Workspace and output model evolution |
| `paperclip/doc/plugins/PLUGIN_SPEC.md` | Extension architecture and capability model |
| `paperclip/packages/db/src/schema/*.ts` | Current domain model and durable entities |
| `paperclip/server/src/routes/*` | API shape and control-plane surfaces |
| `paperclip/ui/src/pages/*` | Actual operator-facing navigation and workflow surfaces |

## Executive Summary

Paperclip is not primarily a chat shell and not primarily an agent runtime.
It is a company control plane for autonomous AI teams.

The top-level Paperclip object is the company. Under that company, the product
organizes work through goals, projects, issues, approvals, activity, costs,
heartbeats, and explicit workspace/runtime objects. Agents are treated as
employees inside an org chart. Chat-like interaction exists mainly as comments,
threads, and optional extension surfaces attached to work objects.

This is the main lesson for `cats`: the current chat-first workspace shell
is a useful module, but it is too low-level to be the whole product. The next
rewrite phases should move `cats` upward into a control plane that owns
organization, work, governance, outputs, and operator visibility while still
keeping `cats-runtime` as the only execution boundary.

## Core Product Concepts Observed in Paperclip

1. `Company` is the root scope.
   Everything else hangs off a company, including budgets, agents, projects,
   goals, issues, approvals, activity, and storage.
2. `Agent` means employee, not chat persona.
   Agents have title, role, manager, adapter type, runtime config, permissions,
   and budget state.
3. `Goal ancestry` is part of alignment.
   Work should always be explainable in terms of a parent objective.
4. `Issue/comment flow` is the built-in work conversation model.
   Chat is attached to work instead of replacing work objects.
5. `Heartbeat execution` is the control-plane scheduling primitive.
   Agents wake on timers, assignments, or manual nudges, and runs are tracked
   as explicit operational records.
6. `Governance` is first-class.
   Approvals, audit logs, and budget enforcement are part of the product, not
   side tooling.
7. `Outputs` matter more than raw transcripts.
   Paperclip explicitly moves toward previews, PRs, documents, artifacts, and
   execution workspace visibility.
8. `Plugins` are edge surfaces, not the core.
   The plugin system is large, but even Paperclip treats it as a later
   extension seam rather than the primary product abstraction.

## Functional Inventory

| Paperclip surface | Evidence in local source | Why it exists | Cats Inc stance |
|-------------------|--------------------------|---------------|-----------------|
| Company and multi-company scope | `README.md`, `companies.ts`, `Companies.tsx`, `CompanySwitcher.tsx` | Separate orgs, budgets, and audit trails under one instance | Adopt later; start with a single local company/workspace root |
| Agent org chart | `PRODUCT.md`, `agents.ts`, `OrgChart.tsx`, `SidebarAgents.tsx` | Model reporting lines and operational ownership | Adopt; grow current cat registry into an org roster |
| Goal, project, and issue hierarchy | `goals.ts`, `projects.ts`, `issues.ts`, `Goals.tsx`, `Projects.tsx`, `IssueDetail.tsx` | Keep execution tied to business intent | Adopt strongly; channels should attach to work, not replace it |
| Issue comments and inbox | `IssueDetail.tsx`, `Inbox.tsx`, `issue_comments` schema | Keep discussion attached to work objects | Adapt; keep chat UX, but anchor it to work items |
| Heartbeat runs and wakeups | `agents-runtime.md`, `heartbeat.ts`, `heartbeat_runs`, `agent_wakeup_requests` | Controlled autonomy with explicit operator visibility | Keep the idea, but hydrate it from `cats-runtime` rather than reimplementing Paperclip's runtime |
| Session continuity and task sessions | `agent_runtime_state.ts`, `agent_task_sessions.ts` | Preserve continuity across short runs | Adopt conceptually through product-owned execution history and memory views |
| Approvals and governance | `approvals.ts`, `Approvals.tsx`, `approvalRoutes` | Board-style decision gates and safe autonomy | Adopt after the work graph exists |
| Cost and budgets | `companies.ts`, `agents.ts`, `cost_events`, `Costs.tsx` | Prevent invisible token burn and support operator oversight | Adopt after activity and execution read models exist |
| Activity and audit trail | `activity_log.ts`, `Activity.tsx`, activity routes | Explain what changed and why | Adopt strongly |
| Project workspace vs execution workspace | `project_workspaces.ts`, `workspace_runtime_services.ts`, workspace product model plan | Separate durable codebase roots from temporary execution environments | Adopt strongly |
| Work product model | workspace product model plan, run transcript surfaces, assets/documents schemas | Make outputs first-class | Adopt strongly |
| CLI and onboarding | `CLI.md`, onboarding routes/components | Improve operator setup and automation | Delay; not a first rewrite phase |
| Plugin runtime and UI slots | `PLUGIN_SPEC.md`, `packages/plugins/*`, `PluginManager.tsx` | Add capabilities without bloating the core control plane | Delay until after the core product model stabilizes |

## What Cats Inc Should Keep

> Temporarily not applicable note: in the current chat-only `cats` scope,
> the most relevant items in this section are transcript UX, operator
> visibility, execution history, and output presentation. The broader
> control-plane recommendations are reference-only for now.

- Paperclip's control-plane framing: manage organization, work, outputs,
  costs, and approvals above the raw agent sessions.
- Goal and work ancestry: operators should be able to explain why a chat,
  action, or runtime session exists.
- Explicit operational records: activity, approvals, costs, run history,
  execution workspaces, and artifacts should all be visible.
- Output-first UX: summary first, then steps, then raw transcript or tool log.
- Progressive disclosure: top layer for operators, deeper layers for debugging.

## What Cats Inc Should Adapt

> Temporarily not applicable note: this section contains cross-product
> exploration. For the current `cats` scope, do not interpret company/org
> expansion ideas here as active roadmap commitments.

- Keep chat as a first-class module, but stop treating chat channels as the
  product root object.
- Keep `cats-runtime` as the only execution boundary. `cats` should not
  absorb Paperclip's adapter registry, heartbeat runner, or embedded runtime.
- Grow the current `workspace cat` model into a roster or org model instead of
  adopting Paperclip's agent schema directly.
- Start local-first and single-company, then add multi-company packaging later
  if it becomes product-critical.
- Keep the current inspectable local-state story initially, but introduce a
  storage abstraction before the control-plane model gets much larger.

## What Cats Inc Should Delay or Avoid

- Do not fork or skin Paperclip as the product base.
- Do not import Paperclip packages or copy its database schema into `cats`.
- Do not move adapter execution or heartbeat scheduling into `cats`.
- Do not make plugin runtime, marketplace, or template distribution a first
  rewrite milestone.
- Do not let chat become the only way operators understand work once richer
  work objects exist.

## Mapping from Paperclip to Cats Inc

> Temporarily not applicable note: this mapping reflects the broader study and
> includes concepts that exceed the current chat-only project boundary.

| Paperclip concept | Current Cats Inc primitive | Recommended Cats Inc target |
|-------------------|----------------------------|-----------------------------|
| Company | Workspace shell | Company or workspace root for the full control plane |
| Agent employee | Workspace cat | Roster member with org, assignment, and execution views |
| Goal | None | Initiative or goal object above projects and chats |
| Project | Channel topic plus repo metadata | Project object with durable workspace and outputs |
| Issue | Channel | Work item that can own one or more discussion threads |
| Issue comment | Channel message | Work discussion entry, optionally rendered as chat |
| Heartbeat run | Execution lease plus session status | Product-owned run or execution record hydrated from `cats-runtime` |
| Approval | None | Operator decision queue tied to work and execution |
| Cost event | Per-message usage summary | Cost ledger and budget view |
| Project workspace | `repoPath` and `workspaceCwd` | Explicit durable project workspace |
| Execution workspace | Current runtime cwd and lease state | Explicit execution workspace plus runtime services |
| Work product | Transcript export | Previews, PRs, artifacts, documents, and transcripts |
| Plugin | None | Later extension seam for non-core capabilities |

## Current State Gap Matrix (2026-03-19)

The current `cats-runtime` and `cats` comparison against `paperclip` is more
precise than a raw feature checklist.

`cats-runtime` already has a real execution runtime. `cats` already has
early product and shared-core seams. The main gaps are:

- runtime-managed skills
- orchestration-grade runtime semantics
- an executable plugin or MCP-style tool surface

| Area | Cats today | Paperclip today | True gap | Priority |
|------|------------|-----------------|----------|----------|
| Runtime execution depth | `cats-runtime` already spans `cli`, `api`, `local`, and `agent` targets with provider catalog routing, SSE/NDJSON streaming, local tool runtime support, `sessionKey` / `outputDir` / `artifacts`, and structured invocation context | Heartbeat wakeups and coalescing, task-scoped session continuity, runtime services lifecycle, execution workspaces, and optional git worktree isolation are already first-class runtime services | Cats does not mainly lack adapter breadth; it lacks orchestration-grade runtime semantics | High |
| Skill integration | `skills/` directories, sync scripts, and `skillProfile` / `mcpProfile` fields exist, but profiles currently affect prompt metadata more than execution dispatch | The Paperclip skill is the actual heartbeat operating procedure, and adapters inject Paperclip-managed skills into CLI runtime homes | Cats does not yet have runtime-managed skills or execution-time skill injection | Highest |
| MCP / plugin surface | ADR-008 defines direct product APIs plus a future MCP facade, but the first curated MCP tool set is still open work | Paperclip already ships a plugin SDK, JSON-RPC worker host, capability model, UI bridge, and agent tool registration model | Cats lacks an executable tool-extension surface; the MCP facade is still architectural intent | High |
| Control plane | `Cats Core v1` shared records and read-only APIs exist for actors, conversations, tasks, approvals, owner profile, and archive metadata | Company, org, work, approvals, activity, costs, and run history are all live operator-facing product objects | Cats still lacks a working operator control plane, but that gap belongs above the runtime boundary rather than inside `cats-runtime` | Medium-High |

### Boundary Clarifications

- Do not copy Paperclip's scheduler ownership, run-store DB model, company
  workflow semantics, or budget and approval orchestration into
  `cats-runtime`.
- Keep `cats-runtime` as the execution boundary and let `cats` own
  approvals, owner profile, conversations, and operator-facing control-plane
  state.
- Treat Paperclip's plugin SDK as a later extension seam, not the first Cats
  milestone.

### Local Evidence for the Current-State Matrix

- Runtime depth:
  [`cats-runtime/src/core/types.ts`](../../../cats-runtime/src/core/types.ts),
  [`cats-runtime/src/core/providerCatalog.ts`](../../../cats-runtime/src/core/providerCatalog.ts),
  [`paperclip/server/src/services/heartbeat.ts`](../../../paperclip/server/src/services/heartbeat.ts),
  [`paperclip/server/src/services/workspace-runtime.ts`](../../../paperclip/server/src/services/workspace-runtime.ts)
- Skill integration:
  [`cats-runtime/skills/README.md`](../../../cats-runtime/skills/README.md),
  [`cats-runtime/scripts/windows/Sync-AgentSkills.ps1`](../../../cats-runtime/scripts/windows/Sync-AgentSkills.ps1),
  [`paperclip/skills/paperclip/SKILL.md`](../../../paperclip/skills/paperclip/SKILL.md),
  [`paperclip/packages/adapters/codex-local/src/server/execute.ts`](../../../paperclip/packages/adapters/codex-local/src/server/execute.ts)
- MCP and plugin surface:
  [`../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md`](../decisions/008-expose-cats-runtime-via-direct-api-and-mcp-facade.md),
  [`../plans/PLAN-006-cats-core-v1-and-suite-foundation.md`](../plans/PLAN-006-cats-core-v1-and-suite-foundation.md),
  [`../../../paperclip/doc/plugins/PLUGIN_SPEC.md`](../../../paperclip/doc/plugins/PLUGIN_SPEC.md),
  [`../../../paperclip/packages/plugins/sdk/src/worker-rpc-host.ts`](../../../paperclip/packages/plugins/sdk/src/worker-rpc-host.ts)
- Product control plane:
  [`../api.md`](../api.md),
  [`../../src/shared/core.ts`](../../src/shared/core.ts)

## Recommended Rewrite Sequence

> Temporarily not applicable note: this sequence is not the active `cats`
> implementation plan while the product remains chat-only. Preserve it as
> exploratory reference only.

1. Define a product model above channels.
   Add company, goal, project, work item, activity, approval, cost, and output
   concepts without breaking the current phase-2 shell.
2. Add a compatibility layer from current chat state to the new model.
   Current channels, cats, transcripts, and leases should still load cleanly.
3. Re-anchor chat under work.
   A chat becomes one work surface attached to a project or work item instead of
   the only top-level operator object.
4. Add operator-grade control-plane surfaces.
   Inbox, approvals, activity, budget, and output views should summarize what
   the company is doing before exposing raw transcripts.
5. Add workspace and output modeling.
   Distinguish durable project workspaces from execution workspaces and link
   runtime sessions to artifacts, previews, and other outputs.
6. Add extension seams later.
   Only after the control plane is stable should `cats` grow plugin,
   alternate entrypoint, or template distribution seams.

## Current Recommended Implementation Order (2026-03-19)

This order reflects the current repo state rather than the broader long-term
rewrite sequence above.

1. Add `runtime-managed skills v0` to `cats-runtime`.
   Resolve `skillProfile` into explicit skill packages and adapter injection
   rules before expanding orchestration.
2. Connect `cats` metadata to runtime execution.
   Promote `skillProfile` and `mcpProfile` from prompt-level metadata into
   explicit runtime request and orchestration inputs.
3. Add execution workspace and runtime-services modeling to `cats-runtime`.
   Start with explicit workspace and service lifecycle ownership; keep git
   worktree support optional until the contract is stable.
4. Define the first curated MCP facade for orchestrators.
   Expose a small, product-safe tool set without bypassing product-owned
   permissions, approvals, or bot bindings.
5. Land product-side control-plane writes in `cats`.
   Add approval, activity, execution-history, and cost surfaces above the same
   runtime boundary.

## Open Questions

- What should the top-level root object be called in `cats`: company,
  workspace, studio, or something else?
- Should the next persistence step be a store abstraction over JSON, or should
  the rewrite move directly to SQLite?
- How much of Paperclip's issue model should survive as-is versus being renamed
  into Cats-specific language such as work item or mission?
- Which control-plane surfaces should land before multi-company support:
  approvals, activity, costs, or workspaces?

## Recommended Stance

Use Paperclip as a product reference, not as an implementation dependency.

The right migration is not "copy Paperclip into `cats`." The right
migration is:

- absorb its best company-control-plane concepts,
- preserve the existing `cats-runtime` execution boundary,
- keep the current chat shell as one module,
- and rewrite `cats` into its own product model incrementally.

---

*Created: 2026-03-16*
*Updated: 2026-03-19*
*Author: Codex*

