# Agent Collaboration Guide

> Detailed guide for AI agents working on this project.

## Quick Reference

1. Read `../AGENTS.md` first (required)
2. Read your agent-specific file (`CLAUDE.md`, `GEMINI.md`, or `CODEX.md`)
3. Follow this guide for detailed collaboration procedures

## Project Context

- `cats` is the current product shell and planning repo for the Cats suite
- `agent-workspace-poc` is a behavior reference, not a base to keep scaling
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

## A2A Collaboration (Optional)

If this project uses Agent-to-Agent (A2A) integration:

1. Define an Agent Card in `docs/a2a/agent-card.(json|yaml).example` and keep it aligned with actual capabilities.
2. Define the task payload format in `docs/a2a/task.(json|yaml).example` and keep runtime tasks consistent.
3. Document transport, auth, and discovery details in `docs/a2a/README.md`.
4. Keep `AGENTS.md` and agent-specific files consistent with the Agent Card.
5. Update `docs/terminology.md` when new terms are introduced.

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
- [ ] Commit message follows conventions
- [ ] Status in README.md updated (if applicable)

---

*Last updated: 2026-03-16*
