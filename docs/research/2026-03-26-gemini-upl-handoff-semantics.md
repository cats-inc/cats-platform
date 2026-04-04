# Research Log: Gemini Unified Planning Language (UPL) Handoff Semantics

Date: 2026-03-26
Topic: Cross-Product Task Handoff via CoreTaskRecord as a Plan Exchange Format
Status: Proposal

## Overview

The Cats Platform's value proposition is "One Man Digital Company." This vision requires a seamless handoff between specialized roles. A "PM Cat" in `Cats Work` may plan a feature, but a "Dev Cat" in `Cats Code` must execute the implementation.

This document research the use of `CoreTaskRecord` (from the Paperclip-inspired task system) as a **Unified Planning Language (UPL)** to bridge different product-level strategies.

## CoreTaskRecord as the Universal Substrate

Instead of product-specific JSON structures, we treat the `CoreTaskRecord` as the canonical "Plan Exchange" medium.

- **Hierarchical Sub-tasks**: Complex plans are decomposed into a tree of tasks.
- **Cross-Strategy Status Mapping**: Standardizes status codes (e.g., `pending`, `running`, `blocked`, `done`) across different reasoning loops.
- **Strategy Metadata Preserve**: When a task moves from `Work (PDCA)` to `Code (ToT)`, the `ToT` strategy can append its specific tree-scoring data to the record without breaking the parent `PDCA` loop's awareness.

## Handoff Example: Work → Code

1. **Discovery**: User in `Cats Work` uses a `PDCA` strategy to define an "Upgrade API" project.
2. **Decomposition**: The PM Cat creates a sub-task: `Task-202: Implement OAuth2`.
3. **Affinities**: The task is marked with `suggested_product: 'code'` and `suggested_strategy: 'tot'`.
4. **Resumption**: When the user switches to `Cats Code`, the Dev Cat reads the UPL record, detects the `ToT` affinity, and initializes a思維樹執行環境 to solve the coding challenge.
5. **Upstream Sync**: Once the code is written and tests pass, the task is marked `done`. `Cats Work` receives the status update and the PM Cat proceeds to the next milestone.

## Product-Level Strategy Affinity

| Product | Preferred Strategy | Reasoning |
| :--- | :--- | :--- |
| **Cats Chat** | `ReAct` | Real-time tool agility and interactive feedback. |
| **Cats Work** | `PDCA` | Compliance, milestones, and audit-friendly planning. |
| **Cats Code** | `ToT` | Deep logic exploration, TDD cycles, and path pruning. |

## Implementation Path

1. **UPL Schema**: Enhance `cats-platform/src/shared/tasks.ts` to include `strategy_metadata` and `affinity` fields.
2. **Handoff UI**: Build "Product Transfer" indicators in the Platform-level task dashboard.
3. **Runtime Event Bus**: Ensure `cats-runtime` emits standardized `task_status_changed` events that any active strategy can consume.
