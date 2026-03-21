# PLAN-001: Initial Chat Shell

## Scope

Deliver the first runnable `cats` slice that establishes the project
boundary and a minimal HTTP contract.

## Tasks

1. Replace bootstrap placeholders with `cats` project metadata.
2. Add configuration parsing for app and runtime settings.
3. Add a `cats-runtime` client for health retrieval.
4. Add HTTP handlers for `/health` and `/api/app-shell`.
5. Add smoke tests using `node:test`.
6. Align docs, services, CI, and container metadata.

## Validation

- Build with the TypeScript compiler
- Run `node:test` against the built output
- Verify docs reflect the chosen runtime boundary and default port

## Risks

- The new subproject starts without installed local dependencies
- Phase 1 runtime health still depends on `cats-runtime` and `agent-fleet`
- Frontend rendering strategy is still undecided

---

*Last updated: 2026-03-11*

