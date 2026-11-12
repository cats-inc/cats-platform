# PLAN-137: Desktop conversation database

## Metadata

| Field | Value |
| --- | --- |
| Status | In progress |
| Owner | Product owner |
| Spec | [SPEC-144](../specs/SPEC-144-desktop-conversation-database.md) |
| Decision | [ADR-152](../decisions/152-pilot-a-state-database-in-cats-desktop-before-cats-bot.md) |

The owner authorized SPEC/PLAN and the whole Desktop port on 2026-11-12. This does
not authorize a version bump or publication. Worktree: `.claude/worktrees/desktop-state-db`,
branch `feat/desktop-state-db`, initial Platform source `355a9469a`. Bot source is frozen
at tag `state-db-p1`; do not take current Bot main, which intentionally reverted the feature.

## Phase 0 — Baseline and contracts (FR-1)

- [x] Read ADR-152 and confirm the preserved Bot tag and reverted main.
- [x] Inventory snapshot store and Core projection; identify snapshot cloning as a separate
  cost that replacing JSON I/O alone does not fix.
- [x] Add isolated measurement command with 1x/10x/100x and explicit runtime identity.
- [x] Run Node and Electron baselines, record report and gate numbers, including capacity
  refusals and corrected pure-read fixtures. See the [Phase 0 report](../research/2026-11-12-desktop-state-database-baseline.md).
- [x] Complete source-backed process/runtime inventory and privacy-safe owner counts/timings.
- [x] Write scope and migration contracts in SPEC-144 and this plan.

## Phase 1 — Adapter and query store (FR-2, FR-3, FR-7–FR-9)

- [x] Port lazy driver, transaction adapter and Unicode search rewriting with attribution.
- [x] Define Platform-specific tables/application ID and metadata handoff.
- [x] Validate drivers/transactions in local Windows Node and Electron, including foreign/newer files.
  Three-OS hosted acceptance is prepared and remains pending.
- [x] Implement query-layer row-delta writes, cached-count indexed pages with order-generation
  cursors, SQL-batched chronological import and bounded multilingual FTS. Unicode-version
  changes require rebuilding; unchanged synchronization never marks a stale index current.
- [ ] Expose and integrate scoped transactional mutations through the live store.
- [ ] Tests: real SQLite, multilingual/scoped queries, million-entry bounded operations,
  cursor/order edits, rollback, durable commit and multi-process contention.

## Phase 2 — Migration and live store (FR-4–FR-6, FR-10–FR-13)

- [x] Operation-lock primitive with recoverable dead-holder/dead-reclaimer handling,
  cancelable FIFO waits and explicit deadlines. New coordinated-store integration remains.
- [ ] Enforce synchronous SQLite transactions throughout the coordinated live store.
- [ ] Version-8 metadata envelope and durable handoff recovery; Core version stays 7 in memory.
- [ ] Legacy admission, exact backup/manifest, staged import and final transactional verification.
- [ ] Switch live startup to database store; retire JSON from live execution.
- [ ] Keep Core subscriptions and lifecycle/scope/proposal/Project semantics.
- [ ] Restore command and failure/restart/concurrent-start matrix.

## Phase 3 — Product consumers and cold storage (FR-8, FR-9, FR-15)

- [ ] Connect indexed paging to message API and renderer while retaining live behavior.
- [ ] Authenticated bounded search endpoint and Desktop search consumer; redact private cards.
- [ ] Scoped conversation write consumers, preserving group and parallel semantics.
- [ ] Verified compressed JSONL archive with interrupted-operation recovery/readback.

## Phase 4 — Maintenance, host and packaging (FR-14, FR-16, FR-17, FR-19)

- [ ] Killable child check/snapshot; paired metadata and valid snapshot retention.
- [ ] Initialize before readiness; migration progress/deadline and fatal-state restart behavior.
- [ ] Close workers/connections during shutdown; offline command help and read-only behavior.
- [ ] Sidecar/bundle worker entrypoint, notices and host runtime acceptance.

## Phase 5 — Acceptance and independent review (FR-18, FR-20)

- [ ] Affected builds/typechecks and Core/Chat/Work/Code/lifecycle/startup/packaging suites.
- [ ] Node and Electron measurements after port, compared with Phase 0 under the same workload.
- [ ] Independent review; resolve findings and rerun checks affected by fixes.
- [ ] Three-platform CI on exact candidate; real-data export equality on an isolated copy.
- [ ] Isolated Desktop candidate and manual acceptance of paging/search/live/group/parallel.
- [ ] Requirement-by-requirement audit; document release boundary and restore instructions.

## Testing strategy

Use `npm run build:server` and focused `npm run test:file -- ...` for built server tests.
Use the existing test bundler for renderer tests; never execute unisolated test entrypoints.
The core change expands validation to consumers, host lifecycle, packaging and concurrency.
Only invoke a full suite when these dependencies cannot be confidently bounded, or for CI.
No fixture touches the user's running profile. Reuse checks while their inputs remain valid.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| JSON/SQLite split commit | Durable metadata handoff plus operation lock; fault injection after each step |
| Slow normalization remains | Measure separately; scoped APIs and consumers, no false constant-time claim |
| Electron filesystem crash | No tree `cpSync`/`rmSync` for non-ASCII paths; explicit platform tests |
| Multi-process lost updates | Lock entire coordinated operation; use latest-state mutation callbacks |
| Network shares/WAL | Reject unsupported network database locations with explicit recovery guidance |
| Lost unknown data | Original bytes/digests retained, complete entity JSON, deterministic export comparison |
| Long imports/checks | Progress-aware startup and killable maintenance children |

## Validation evidence and progress log

| Date | Evidence |
| --- | --- |
| 2026-11-12 | Isolated worktree at `355a9469a`; Bot source pinned to `a8c1193806fcb8934b1dd03324e0c65b85d0682c`. Phase 0 timings/capacity limits and counts-only owner observation recorded. No user data written. |
| 2026-11-12 | Foundation server build passed (`npm run build:server -- --incremental --tsBuildInfoFile ./build/server.tsbuildinfo`). `node scripts/testing/run-desktop-state-host.mjs`: **48/48 Node 26.13.0 and 48/48 Electron 41.2.0 / Node 24.14.0**, zero skipped. Includes separate processes, killed holder/reclaimer, stale indexes, order cursors, WAL read consistency, canonical export and preserved Bot Unicode cases. These are focused foundation checks, not a full application suite or live-store migration validation. |
| 2026-11-12 | Independent foundation review completed after fixes. Findings resolved: Windows import URLs, valid representative benchmark, cold-read fixture repair exclusion, content-safe failures/timeouts, license attribution, stale FTS stamps, mutable cursors, reclaimer crashes, cleanup/queue/deadline holes, mixed Unicode writes and identity/query snapshot race. No blocking foundation finding remains; the reviewer did not run tests and did not approve the unimplemented full port. |

*Created and last updated: 2026-11-12*

## Next integration checkpoint (not implemented yet)

The active goal is the entire SPEC-144 port; this foundation is not completion. Live startup
still constructs `FileChatStore` and the user's profile is untouched. Keep the worktree and
continue Phase 2, then product consumers, maintenance/archive, host packaging and acceptance.

- Database location: derive a fixed sibling `.sqlite` path from the configured profile,
  never trust an arbitrary path supplied by envelope JSON. Give each installation a UUID.
- Version 8 belongs to the **persisted storage envelope**; keep Core's in-memory version 7
  and frozen public contracts. JSON chat contains metadata/cats/preferences but no channel
  bodies/groups; hydrate those from the query store. `readCore` needs no transcript scan.
- Extend the pending handoff with `previous_digest`. In the durable row transaction set a
  new unique domain revision, exact serialized metadata digest and handoff bytes. Recovery
  admits only the previous digest or already-published target digest before replacing JSON;
  unknown concurrent/manual changes fail closed. Acknowledging handoff is not a domain change.
- Keep three digests distinct: original-file bytes (backup/source admission), exact new JSON
  envelope bytes (publication/snapshot pairing), streaming canonical logical state (loss check).
- Back up original primary, `.bak` and relevant old upgrade backups before normalization.
  Run the old-format normalizer/migrations on an isolated copy, not on the original source.
  Refuse unrecognized/future/unknown-policy data; the old reader's reset fallback must not be
  allowed to turn invalid import data into defaults. Missing primary may use a validated backup.
- Stage the database under an unfinished name. Import via `ConversationDatabase`, compare
  canonical logical exports in the last durable transaction, set the import marker, close and
  publish the database, then publish the metadata via handoff. A crash after database publication
  must resume only if the legacy source bytes still match. Existing DB + missing/corrupt metadata
  must never fall back to stale legacy JSON or reset a database.
- `JsonArray` + `canonicalJson`/`canonicalDigest` support query-backed export, so the proof does
  not require another whole transcript allocation. Export must retain Core/group/session data.
- Reuse existing lifecycle/scope/proposal/Project preservation helpers when replacing the live
  store. Retire JSON from live execution; keep its implementation only as import/baseline tooling.
- Every domain commit, including scoped writes, sets a unique revision/digest. Maintenance can
  capture JSON then VACUUM, accepting the pair only if snapshot identity/revision/digest match;
  mismatches defer/retry without holding the operation lock during long SQLite work.
- The new host acceptance helper and workflow are prepared but no hosted run is evidenced yet.
  Current local dependency setup extracted the exact vendor UI tarball into worktree node_modules;
  other local dependencies resolve from the parent checkout. CI must use the locked `npm ci`.
