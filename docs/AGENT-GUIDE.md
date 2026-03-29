# Agent Collaboration Guide

> Detailed guide for AI agents working on this project.

## Quick Reference

1. Read `../AGENTS.md` first (required)
2. Read your agent-specific file (`CLAUDE.md`, `GEMINI.md`, or `CODEX.md`)
3. Follow this guide for detailed collaboration procedures

## Project Context

- `cats` is the current product shell and planning repo for the Cats suite
- `crew-chat-poc` is the best local reference for how upper-layer apps should
  talk to `cats-runtime`
- `Cats Core v1` is now the shared contract layer for both `Cats Chat` and
  `Cats Work`
- `Cats Chat` and `Cats Work` are parallel product tracks and should not invent
  divergent schemas for shared actors, conversations, approvals, or owner
  profile data
- The current suite desktop path is `Electron + React/TypeScript`; do not
  assume Flutter or Tauri unless a newer ADR changes that decision
- App code MUST depend on `cats-runtime`, not `agent-fleet`
- Product services should use direct `cats-runtime` APIs; MCP is a planned
  supplemental tool surface for orchestrator-style agents
- Phase 1 keeps the implementation dependency-light with built-in Node APIs
- Mobile is optional companion scope later, not the current full-product focus
- Paperclip-derived control-plane docs remain exploratory unless a newer ADR
  explicitly promotes them into the execution path

## Collaboration Layers

Use these three layers deliberately:

| Layer | Canonical Location | What belongs there |
|-------|--------------------|--------------------|
| Protocol | `docs/a2a/`, public API docs | A2A-facing discovery, auth, and request/response examples |
| Project Memory | `PROGRESS.md`, `ROADMAP.md`, `docs/research/`, `docs/decisions/`, `docs/specs/`, `docs/plans/` | Durable repo knowledge, decisions, validation evidence, status, and handoff truth |
| Skill | `skills/**/SKILL.md` | Reusable procedural instructions for how an agent should work with the first two layers |

`docs/a2a/` is not a project status log. `SKILL.md` is not a replacement for
durable repo memory.

## Same-Environment CLI Agent Rules

When multiple CLI agents work in the same repo and environment:

1. Every agent must read `AGENTS.md` first.
2. Every agent must read its own agent-specific file next.
3. Every agent must consult `docs/AGENT-GUIDE.md` before doing project work.
4. No agent may assume another agent already performed those reads on its
   behalf.
5. Durable state must be written to repo docs, not left only in chat output.

## Project Memory Write Rules

Use the narrowest durable location that matches the change:

- `docs/research/` for external facts, protocol comparisons, pilot validation
  notes, and evidence that informed a change
- `docs/decisions/` for accepted architectural or governance decisions
- `docs/specs/` for requirements, scope, and implementation-stage truth
- `docs/plans/` for execution sequencing, checklists, and progress logs
- `PROGRESS.md` only when overall project governance truth materially changed

Update indexes when adding or changing tracked artifacts:

- `docs/README.md`
- `docs/research/README.md`
- `docs/specs/README.md`
- `docs/plans/README.md`

## Common Tasks SOP

### Adding a New Feature

1. Check `requirements.md` for related requirements
2. Review `architecture.md` for design patterns
3. If the feature changes product direction, create or update an ADR first
4. Implement in `src/`
5. Add tests in `tests/`
6. Update documentation as needed
7. Follow git conventions from `AGENTS.md`

### Fixing a Bug

1. Reproduce the issue
2. Identify root cause
3. Implement fix
4. Add regression test
5. Document in commit message

### Updating Documentation

1. Identify which doc needs update
2. Follow existing format/style
3. Update `docs/README.md` index if adding new doc
4. Add "Last updated" date

## Output Standards

### Code Output

- Follow naming conventions in `AGENTS.md`
- Include appropriate comments
- Write tests for new functionality

### Documentation Output

- Use clear, concise language
- Include examples where helpful
- Keep formatting consistent
- Follow script standards in `docs/SCRIPT-STANDARDS.md`
- Log external sources in `docs/research/`

## Handoff Checklist

Before completing a task or handing off:

- [ ] Code compiles/runs without errors
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Durable state is written to repo memory docs when needed
- [ ] Commit message follows conventions
- [ ] Status in README.md updated (if applicable)

## A2A Collaboration (Pilot)

`cats` currently uses a pilot-owned A2A v1.0 example set that mirrors the
validated `cats-runtime` pilot posture.

1. Keep protocol-facing examples in `docs/a2a/` aligned with released A2A v1
   shapes, not legacy repo-local pseudo-schemas.
2. Use:
   - `agent-card.public.*.example` for public discovery examples
   - `agent-card.authenticated.*.example` for authenticated extended-card
     examples
   - `jsonrpc-*.example` files for normative JSON-RPC request/response
     examples
3. Do not reintroduce the retired generic `task.*.example` files as if they
   were authoritative A2A v1 artifacts.
4. Keep the A2A docs truthful to repo reality:
   - they may document a future suite-host or orchestrator adapter shape
   - they must not imply a live A2A endpoint if one is not implemented
5. Keep `AGENTS.md`, agent-specific files, and repo-owned collaboration skills
   consistent with the repo's actual collaboration operating model.
6. Update `docs/terminology.md` when the layering vocabulary changes.

---

*Last updated: 2026-03-29*
