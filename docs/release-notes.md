# Release Notes

> Operator-facing behavior changes and migration notes for Cats Platform.

Newest dates go first. Each dated section should include behavior changes,
migration steps, and any deprecations introduced in that release.

Use this shape for new entries:

```md
## YYYY-MM-DD

### Change title

Behavior change:

Migration steps:

Deprecations:
```

## 2026-04-30

### Chat routing after ADR-091

Behavior change:

Existing non-direct participant chats changed routing behavior: a no-mention
user turn now enters the orchestrator first instead of auto-dispatching to
`defaultRecipientId`. Direct/private lanes still route unmentioned turns to the
direct participant, and explicit `@mention` routing is unchanged.

Migration steps:

Operators with older local rooms should mention the intended participant or
choose a per-turn audience when they want a specific Cat to answer first.

Deprecations:

None.
