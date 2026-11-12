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
- [x] Expose scoped transactional mutation/read views through the live store; integrate runtime
  intake/stream/finalization writers without loading sibling transcripts. Derived shared memory
  uses a separately persisted compact channel catalog, not JSON extraction from workflow bodies.
- [ ] Tests: real SQLite, multilingual/scoped queries, million-entry bounded operations,
  cursor/order edits, rollback, durable commit and multi-process contention.

## Phase 2 — Migration and live store (FR-4–FR-6, FR-10–FR-13)

- [x] Operation-lock primitive with recoverable dead-holder/dead-reclaimer handling,
  cancelable FIFO waits and explicit deadlines, integrated with the coordinated store.
- [x] Enforce synchronous SQLite transactions throughout the coordinated live store.
- [x] Version-8 metadata envelope and durable handoff recovery; Core version stays 7 in memory.
- [x] Legacy admission, exact backup/manifest, staged import and final transactional verification.
- [x] Switch live startup to database store; rename the JSON backend for legacy test/baseline tooling.
- [x] Keep Core subscriptions and lifecycle/scope/proposal/Project semantics.
- [x] Offline restore engine and failure/restart/concurrent-start matrix. Command routing remains Phase 4.
- [x] Coordinate authorized data reset before mutation, close connections before removal and
  resume interrupted purges before ordinary database admission, including custom/default profiles.

## Phase 3 — Product consumers and cold storage (FR-8, FR-9, FR-15)

- [ ] Connect indexed paging to message API and renderer while retaining live behavior.
- [ ] Authenticated bounded search endpoint and Desktop search consumer; redact private cards.
- [ ] Finish scoped conversation write consumers, preserving group and parallel semantics.
  Runtime dispatch writers are integrated; REST metadata/action consumers remain to be audited.
- [ ] Verified compressed JSONL archive with interrupted-operation recovery/readback.

## Phase 4 — Maintenance, host and packaging (FR-14, FR-16, FR-17, FR-19)

- [x] Killable native check/snapshot with a nonblocking reaper, including parent-kill cleanup.
- [ ] Daily paired metadata snapshots and valid completed-snapshot retention.
- [x] Initialize before readiness; migration progress/deadline and fatal-state restart behavior.
- [x] Close connections/workers during shutdown/reset; prevent after-close maintenance spawns.
- [ ] Offline command routing/help and read-only behavior.
- [x] Split/bundle reaper and native entrypoints, licensing and Node/Electron artifact acceptance.

## Phase 5 — Acceptance and independent review (FR-18, FR-20)

- [ ] Affected builds/typechecks and Core/Chat/Work/Code/lifecycle/startup/packaging suites.
- [ ] Node and Electron measurements after port, compared with Phase 0 under the same workload.
- [ ] Independent review; resolve findings and rerun checks affected by fixes.
- [x] Real-data export equality on an isolated copy, with exact source-byte preservation and rollback readback.
- [ ] Three-platform CI on exact candidate.
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
| 2026-11-12 | Live store/migration/restore implementation passed **101/101 Node and 101/101 Electron** focused cases at the integration checkpoint. Later reset regressions passed **38/38** Node store/reset cases. Full current host rerun follows the final review fixes; these counts are successive checkpoints, not additive totals. Startup/supervisor/bootstrap checks passed **52/52**, then expanded supervisor/bootstrap **37/37**, CLI **9/9**, and affected JSON/Core/reset consumers **71/71**. Server and host builds passed. |
| 2026-11-12 | The explicit real-copy command verified four source files, one channel and 51 messages: canonical exports were byte equal with digest `afca1579a4b19928f1ed1fbc0967dcf08a265310af1c29b1b86742cd60af9235`; migration 858 ms, rollback readable as version 7 and original bytes unchanged. The first attempt exposed volatile projected timestamps; source timestamps and deterministic persisted fallbacks corrected this before the passing proof. See the [report](../research/desktop-state-baseline/2026-11-12-desktop-state-real-copy.json). |
| 2026-11-12 | Independent migration/restore and startup/reset reviews have no remaining blocking P1/P2 in their implemented scope. Resolved findings include Core-shape/no-drop admission, retention opt-out, group alias preservation, dead lease-candidate reclamation, selected-buffer digest, pre-mutation offline admission, shared-operation coordination, interrupted purge recovery, custom journal ownership, Windows filename aliases/discovery/primary-last deletion, nested caller errors, actionable runtime/schema errors, fatal exit preservation and bounded progress-only startup extension. These reviews do not approve the unimplemented full port. |
| 2026-11-12 | Test bundling passed after allowing esbuild outside the Windows filesystem sandbox; the sandboxed attempt could not read ancestor directories. The test-fixture typecheck (`tsconfig.test.json`) passed after reusing main's installed mobile dependencies through a worktree-owned junction and verifying identical mobile lockfiles. Its first attempt lacked those dependencies. This is not a claim that the full `npm run typecheck` or full application suite ran. No dependency, version or release change was made. |
| 2026-11-12 | Final local live-store checkpoint: **111/111 Node and 111/111 Electron**, zero skipped on Windows; **51/51** bundled affected typed Core/Work/history/ingress/Google consumers and **11/11** reset tests passed. Windows case-alias cases cover fresh/imported reopen, recovery-artifact and upgrade-backup discovery, reset primary-last ordering and interrupted restore through another spelling. Earlier build/CLI/host results remain applicable. Hosted three-OS CI and product paging/search/archive/maintenance acceptance are still pending. |
| 2026-11-12 | Scoped writer/worker checkpoint: server and host builds passed; **137/137 Node and 137/137 Electron**, **99/99** affected runtime/Core/CLI/supervisor regressions, and **31/31** actual bundled-worker/SDK/staging tests passed. A later same/sibling-channel multi-process regression passed in the **12/12** Node scoped suite; the next full-host run includes it. These are focused checks, not the full application suite. |
| 2026-11-12 | Expanded host acceptance passed **138/138 Node**, but the first Electron run passed **137/138**: the new same/sibling-channel child writer failed during initialization with sanitized `state_unavailable`. Seventeen isolated Electron repetitions and a diagnostic full Electron rerun (**138/138**) passed without reproducing that failure. The original intermittent failure remains unexplained and is not considered resolved by reruns. Temporary diagnostics existed only in ignored built output and were removed. The test-fixture typecheck (`tsconfig.test.json`) passed again. |
| 2026-11-12 | Added content-free failure causes with an internally selected source code, SQLite result code and operation phase, preserving no original exception/message/path. The new injected-filesystem/SQLite regression passed under Node and Electron; server build passed. Independent review found no blocking P1/P2 in this diagnostic change. This improves future evidence and does not resolve the earlier intermittent failure. |
| 2026-11-12 | Schema 2 adds an independent compact catalog. Recognized schema-1 profiles are offline-admitted, backed up with exact JSON/receipt and a verified standalone database snapshot, then upgraded in one SQL transaction bound to admitted schema/installation/revision/metadata digest. Canonical logical exports agree; failure, pending handoff, source replacement, wrong receipt and close-before-worker tests pass. No format/version release was published. |
| 2026-11-12 | Independent scoped/worker reviews resolved all blocking P1/P2 in their slice: changed-record extension preservation, own `__proto__` JSON keys, hidden JSON workflow scans, native worker survival after parent death, backup-source admission races, receipt admission and close/spawn cancellation. The special-key test now starts with an existing empty metadata object to exercise the original recursive failure. Remaining product/maintenance/UI requirements are not approved by these slice reviews. |

*Created and last updated: 2026-11-12*

## Next integration checkpoint

The active goal is the entire SPEC-144 port; the live-store checkpoint is not completion.
Live startup now constructs `DatabaseChatStore`; nothing has been deployed or written to the
owner's actual profile. Keep the worktree and continue product consumers, maintenance/archive,
host packaging and acceptance. The ordinary startup deadline is 75 seconds; the first validated
state progress event extends it once to ten minutes, and subsequent events cannot renew it.

Next work: diagnose the intermittent Electron multi-process initialization failure, then indexed
API/renderer paging/search and remaining scoped REST consumers; explicit compressed
archives; daily paired snapshot publication/retention and offline CLI commands; then post-port
measurements, hosted CI and isolated Desktop acceptance.
The existing global snapshot APIs still materialize all transcripts and must not be advertised
as meeting the final performance goal. Preserve these implementation constraints as work continues:

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
  other local dependencies resolve from the parent checkout. A worktree-owned mobile node_modules
  junction points to the matching-lockfile main installation; remove that junction during final
  worktree cleanup. CI must use the locked `npm ci`.
