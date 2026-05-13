# ADR-106: Defer Bidirectional External Work Sync

> Keep external trackers as explicit bindings until credentials, conflict
> policy, and external write approval are designed as their own capability.

## Status

Proposed

## Context

Phase 6 of PLAN-099 adds the first external tracker boundary for Cats Work:

- `externalWorkBindings` metadata records external Project / Work Item links
- `work.external.link_issue` manually links local records to external issues
  without calling remote APIs
- Work Graph summaries project valid `externalBindings[]`
- the GitHub Issues adapter spike can read one issue into a Work Item import
  draft and build future create-issue payloads with an injectable fetch boundary

This is enough to connect Cats Work to GitHub Issues, Redmine, Bugzilla, Gitea,
or similar systems as references. It is not enough to safely run automatic
bidirectional sync.

Bidirectional sync would introduce external credentials, external write
permissions, rate limits, webhook/event trust, remote deletion and close
semantics, conflict resolution, audit requirements, and owner approval rules.
Adding that behavior behind the current metadata shape would make `syncDirection`
look stronger than the product can enforce.

## Decision

Cats Work will not implement automatic bidirectional external tracker sync in
the Phase 6 tool surface.

For this phase:

- external trackers are bindings, not the Cats system of record
- `syncDirection` is stored as requested intent/metadata only
- `work.external.link_issue` remains local-state only
- adapter spikes may fetch external records into import drafts and build export
  payloads, but they must not perform remote writes
- no background job, webhook handler, runtime tool, or MCP facade may treat a
  binding as an active sync contract without a follow-up decision

Before bidirectional sync can ship, a follow-up ADR/SPEC must define:

- credential storage, rotation, scopes, and per-provider permission boundaries
- owner-visible approval for remote writes and destructive state changes
- conflict policy when Cats and the external tracker both change a field
- canonical field ownership for title, body/summary, status, labels, assignees,
  priority, comments, attachments, and close/delete semantics
- idempotency keys and retry behavior for remote creates/updates
- webhook/event validation, replay handling, and rate-limit/backoff behavior
- audit records that explain both local and remote mutations

## Consequences

### Positive

- Phase 6 stays useful without pretending to solve sync safety.
- External links and imports can be adopted incrementally by owner action.
- Future sync work has a clear checklist instead of being hidden in adapter
  implementation details.

### Negative

- Remote tracker changes will not automatically update Cats Work yet.
- Cats Work cannot automatically create or update GitHub/Redmine/Bugzilla
  records until a separate write policy exists.

### Neutral

- The `syncDirection` field remains in metadata because it captures operator
  intent and gives future sync design a migration point.
- The GitHub Issues adapter spike remains valid as a read/import and payload
  construction boundary.

## References

- [ADR-105: Adopt a Phase-Scoped Work Tool Surface](./105-adopt-phase-scoped-work-tool-surface.md)
- [SPEC-109: Phase-Scoped Work Tool Surface](../specs/SPEC-109-phase-scoped-work-tool-surface.md)
- [PLAN-099: Phase-Scoped Work Tool Surface Rollout](../plans/PLAN-099-phase-scoped-work-tool-surface-rollout.md)
- [Tool Call Registry](../tool-calls.md)

---

*Decision made: 2026-05-13*
*Decision makers: Codex, owner discussion*
