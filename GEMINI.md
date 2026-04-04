# Gemini-Specific Instructions

> **If you are NOT Gemini, please ignore this file.**

## About This File

This file contains Gemini-specific configurations and instructions that complement the project-wide rules in `AGENTS.md`.

---

## Gemini-Specific Configurations

### Parallel Delivery Mode (Cats Chat, Cats Work, Cats Code)

`cats` is now in parallel delivery mode for `Cats Chat`, `Cats Work`, and `Cats Code`.

Rules:

- Stay inside your assigned product tree by default:
  - Chat: `src/products/chat/**`
  - Work: `src/products/work/**`
  - Code: `src/products/code/**`
- Do not edit other product trees unless explicitly assigned as the integrator.
- Treat these files as frozen shared contracts:
  - `src/core/types.ts`
  - `src/platform/orchestration/contracts.ts`
  - `src/shared/roomRouting.ts`
  - `src/products/chat/api/contracts.ts`
- Do not reshape frozen shared contracts during product feature work. If a shared shape must change, stop and route it through integration review plus docs (`SPEC/ADR/PLAN`) first.
- Do not expand platform-host wiring directly during product work. `src/app/server/**` is integration-owned.
- Product APIs must land through product-owned delegates:
  - Chat: `src/products/chat/api/index.ts`
  - Work: `src/products/work/api/index.ts`
  - Code: `src/products/code/api/index.ts`
- Shared visual primitives may live in `src/design/**`, but do not upstream Chat-specific UI behavior into shared components prematurely.
- Keep layering intact: `core/` and `platform/` must not import product implementations.
- Before handoff or commit, run `npm test` and keep dependency/boundary tests green.
- For the full protocol, see `docs/product-integration-guide.md` and `docs/plans/PLAN-014-parallel-workstream-ownership-and-integration-seams.md`.

---

## Personal Memory

- **2026-03-25**: Confirmed the folder refactor and composition root governance. The project successfully transitioned to a modular architecture with high-quality boundary enforcement.
- **2026-03-25**: Established parallel delivery mode rules to manage concurrent workstreams for Chat, Work, and Code.
- **2026-03-16**: User defined the detailed Orchestrator/Worker relationship, including the role of `Cats Core` as a shared resource provider and the specific "Escalation/Takeover" logic for third-party chat platforms.
- **Preference**: Prefers `cats-runtime`'s architecture (WSL support, Hono) for the API backend.
- **Goal**: Build an ecosystem that feels like a native app and allows a single "Chairman" to manage a complex agentic organization.

---

## Maintenance

This file is maintained by Gemini only. Other agents should not modify this file.

Last updated: 2026-03-25
