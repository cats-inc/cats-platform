# Release Notes

> Operator-facing behavior changes and migration notes for Cats Platform.

## 2026-04-30

### Chat routing after ADR-091

Existing non-direct participant rooms changed routing behavior: a no-mention
user turn now enters the orchestrator first instead of auto-dispatching to
`defaultRecipientId`.

Direct/private lanes still route unmentioned turns to the direct participant,
and explicit `@mention` routing is unchanged. Operators with older local rooms
should mention the intended participant or choose a per-turn audience when they
want a specific Cat to answer first.

