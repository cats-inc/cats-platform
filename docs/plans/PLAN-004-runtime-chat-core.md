# PLAN-004: Runtime Chat Core

## Scope

Deliver a complete Phase 2 chat core by moving `cats` from shell-only
state into runtime-backed channel work with persisted transcripts.

## Tasks

1. Expand the shared chat contract to cover channels, chat-global cats, channel assignments, sessions, messages, and export.
2. Replace the minimal store with full file-backed chat persistence.
3. Add runtime-backed channel activation and mention-routed messaging through `cats-runtime`.
4. Extend the renderer with channel setup, global cat management, transcript, and orchestrator surfaces.
5. Update integration tests and documentation for the new chat core.

## Validation

- `npm run typecheck`
- `npm test`
- `npm run build`

## Risks

- Runtime sessions are still constrained by the phase 1 `cats-runtime` adapter
- JSON persistence is explicit and portable, but not optimized for heavy concurrency
- Basic mention routing is not yet a full delegation or workflow engine

---

*Last updated: 2026-03-13*






