# SPEC-144: Desktop conversation database

## Metadata

| Field | Value |
| --- | --- |
| Status | Approved scope; implementation in progress |
| Owner | Product owner |
| Authorization | 2026-11-12: prepare SPEC/PLAN and complete the Desktop port from ADR-152 |
| Related decision | [ADR-152](../decisions/152-pilot-a-state-database-in-cats-desktop-before-cats-bot.md) |
| Plan | [PLAN-137](../plans/PLAN-137-desktop-conversation-database.md) |

## Summary

Move Desktop's channels, messages and parallel groups out of the whole-profile JSON
snapshot into an installation-local SQLite database. Reuse the tested pieces at Cats Bot's
`state-db-p1`, with attribution, and adapt the store to Desktop's Core projections, group
and parallel chats and multiple processes. Bot remains unchanged. Ship no release or
version bump under this implementation authorization.

## Goals

- Stop rewriting unrelated conversations when one conversation changes.
- Expose indexed conversation paging and bounded multilingual search to real consumers.
- Preserve every existing conversation, product scope, proposal, runtime/session field,
  Core relationship, cat and setting through an interruptible, recoverable upgrade.
- Keep maintenance off the serving thread and provide explicit export, restore and archive.

## Non-goals

- Moving evidence JSONL, the image ledger, Runtime state or layered memory into this database.
- Automatic history deletion, a Bot database, or a shared storage package before Bot adopts one.
- Publishing a release. This persisted-format change and bounded message-list API require
  the next minor when authorized; do not ship them as a compatible patch in the existing minor.

## Requirements

1. **FR-1 — Measure.** Before finalizing the integration, run isolated synthetic 1x, 10x and
   100x workloads (40 conversations × 300 messages at 1x), reporting file bytes, mutation
   p50/p95, cold read, normalization, runtime and sample count. Run in Node and the shipped
   Electron. Record resource failures as failures, not passes. Owner measurements contain
   counts and timings only. Inventory all profile readers/writers and runtime support.
   ADR's approximate gate is 50 ms mutation p95, 100 ms cold-read/normalization or 20 MB
   at 1x; the owner's explicit port instruction authorizes proceeding, but does not waive
   truthful reporting of this baseline or the database comparison.
2. **FR-2 — Boundary.** One database beside the configured profile. Only the persistence
   adapter loads SQLite. Test `node:sqlite`, FTS5 with `contentless_delete`, WAL, transactions,
   non-ASCII/space paths and Windows URI handling in Node and Electron on three OSes.
   Unsupported hosts fail with actionable diagnostics; do not silently keep a second backend.
3. **FR-3 — Format.** Store channel metadata, each message and parallel groups separately,
   retaining complete JSON records and explicit collection positions. Distinguish the
   Platform database from Bot and the image ledger by application ID. Version the schema;
   upgrade recognized earlier versions transactionally and refuse unknown/newer/damaged data.
4. **FR-4 — JSON metadata.** Cats, settings, preferences and Core remain in JSON. Persist a
   new version-8 storage envelope, separate from the unchanged in-memory Core version-7
   contract. Older Desktop builds already refuse this newer envelope. Conversation bodies
   and parallel groups no longer occur in its chat snapshot. Derived Core records remain
   Core-owned; their existing content is not silently removed to make the file look smaller.
5. **FR-5 — Atomicity.** Serialize coordinated profile operations across processes, not just
   instances in one process. Within one durable SQLite transaction commit all changed
   conversation rows and a pending JSON metadata handoff. Atomically write/fsync the JSON
   envelope, then acknowledge the handoff. Before any read or mutation, replay a committed
   handoff under the same lock. No observer sees half a switch; a failed write remains
   recoverable. Do not execute asynchronous callbacks inside SQLite transactions.
6. **FR-6 — Store semantics.** Keep Core subscriptions, atomic `updateSnapshot`/`updateCore`,
   lifecycle deletion receipts, monotonically raised product scopes, proposal progression,
   work-Project choices, group membership and session metadata. Preserve isolated Memory
   stores for tests. Retire the JSON store from live host execution; its old-format reader
   exists only for migration, baseline measurements and restore validation.
7. **FR-7 — Writes.** Upsert changed rows only; unchanged messages retain row IDs and FTS
   rows. A channel mutation must not rewrite another channel. Transactionally remove stale
   rows/index terms on edit/delete. Provide a scoped channel mutation path, and use it in
   live conversation writes where contracts permit, rather than hiding the old whole-state
   work behind a database. Global/Core operations may still use complete projections.
8. **FR-8 — Paging.** Indexed keyset paging by a conversation's persisted position, bounded
   limits, exclusive cursors carrying the channel's order generation, cached message counts
   and next cursors. Body edits/tail appends preserve cursors; deletion/reorder/non-tail
   insertion invalidates them and clients explicitly reload rather than duplicate or omit
   messages. A page reads only its
   own window. Wire the API and renderer's transcript loading to the indexed path while
   preserving message choices, proposal redaction, streaming and scroll continuity.
9. **FR-9 — Search.** Reuse Bot's Unicode normalization/CJK bigram rewriting and unforgeable
   conversation scope term. Bound ranking to the newest 1,000 matches and results to a
   configured maximum. Chronological import order determines row IDs; ties are deterministic.
   Expose search through authenticated product APIs and Desktop UI. Search never grants
   access to proposal payloads or otherwise private content.
10. **FR-10 — Validate source.** Recognize supported JSON profiles and reject malformed,
    future-format, unknown-policy or unknown-lifecycle profiles without reset. Preserve
    original primary/backup bytes and relevant old migration backups before normalization.
    Missing primary with a valid known backup follows the documented recovery path.
11. **FR-11 — Migration.** Stage under a unique unfinished name; fsync a backup and manifest
    with digests. Import in bounded batches, with messages numbered by timestamp. Compare
    canonical exports against the source within the final durable import transaction, set
    an import marker, then switch the profile atomically. Archive the old source, retaining
    its original bytes. A reader cannot mistake an incomplete import for current state.
12. **FR-12 — Recovery.** Fault-injection tests cover every checkpoint, disk-write failure,
    concurrent startup and stale lock recovery. Damaged databases are never reset or
    replaced from stale JSON. Preserve a failed migration for diagnosis and allow a retry
    or explicit restore. Restore validates the manifest, file digests and target boundaries,
    backs up current data and restores the earlier minor atomically/restartably.
13. **FR-13 — Export.** A deterministic logical export from legacy JSON and the current
    database is byte-identical across migration, including message order, rich metadata,
    group membership and Core. Before release compare exports on an isolated copy of real
    data; never publish its contents. Keep this release gate visible until actually run.
14. **FR-14 — Maintenance.** Child-process `quick_check` and daily `VACUUM INTO` snapshot;
    timeout/cancellation kills the child. Verify before snapshot, publish by atomic rename
    from an unfinished name, and keep the paired JSON envelope consistent. Capture JSON
    first, then snapshot; verify the resulting database's identity, unique committed revision
    and metadata digest against those exact captured JSON bytes. A mismatch defers/retries
    the backup without publishing it or blocking writers; retain the previous good pair.
    Every domain commit, including scoped row changes, assigns a never-reused revision.
    Retain a bounded
    number of valid completed snapshots. Ignore future-dated reports/snapshots; a backward
    clock does not remove good backups. Failures do not block ordinary conversation work.
15. **FR-15 — Retention.** No automatic conversation deletion. Explicit archive writes
    compressed JSONL cold storage, verifies it and records a digest before removing hot
    content. Recover interrupted archive, support export/readback, preserve group and Core
    relationships, and distinguish archive from owner deletion.
16. **FR-16 — Host lifecycle.** Initialize/migrate before application readiness; advertise
    bounded progress without message contents. Desktop permits multi-minute migration.
    Do not repeatedly restart a process stopped by a damaged/unsupported state database.
    Close connections and maintenance children before shutdown/profile removal on Windows.
17. **FR-17 — Operations.** Document and implement offline check, snapshot, export and
    restore commands with help, correct configured profile selection and nonzero failures.
    Export/check must not create a missing database or initialize a new user profile.
18. **FR-18 — Test hygiene.** Fixtures/benchmarks and candidate Desktop use isolated roots.
    No smoke records or trial migrations touch the controlling user's profile. Regression
    coverage includes restart, concurrent processes and existing Core/Chat/Work/Code consumers.
19. **FR-19 — Packaging.** Keep lazy driver loading, type support without a new native npm
    dependency, worker entrypoint/resources in both unbundled and bundled sidecars, notices
    and the selected host runtime. Test actual built artifacts rather than source alone.
20. **FR-20 — Evidence.** Record focused tests, integration tests, both local host runtimes,
    independent review and three-platform CI. Do not equate a Windows run with other OSes
    or a prepared workflow with a green run. Pending release-only checks remain explicit.

## Design overview

The database stores complete JSON per entity plus query columns, FTS terms and one pending
metadata handoff. JSON remains the metadata store; the handoff is a crash-recovery journal,
not a second ordinary metadata database. A cross-process operation lock encloses recovery,
read/modify/write and publication. SQLite transactions are synchronous and short. Large
imports and maintenance report progress or run in killable children.

Snapshot-shaped product APIs remain available for global operations during this pilot,
while conversation-specific reads/writes use the indexed adapter. They must not be cited
as constant-time operations. Cold normalization and Core projection remain measurable costs.

The query API uses `GET /api/channels/:id/messages?limit=&before=` with newest-first
windows presented chronologically, cached `total` and exclusive `nextCursor`. Invalid
input returns 400, missing channels 404, stale cursors 409 with `reload: true`, and storage
failures 503 with no raw diagnostic content. Search uses authenticated
`GET /api/conversations/messages/search?q=&channelId=&limit=` (200-character query,
at most 12 distinct words, 100 results). Both routes redact proposal-card records.
DTOs and renderer fetch/error helpers live in browser-safe modules. The Memory fixture
store tracks its own order generation; production never falls back to JSON/materialized
queries. App-shell/channel/entity-subscription read models now use indexed latest windows.
The raw page's `messages` stay within `limit`; optional `displayMessages` carries the
display-only Core projection for that window. `orderRevision` is an equality token for
invalidating retained history after order changes. `historyRevision` invalidates retained
display pages after edits or Core placement changes outside the newest window;
`windowCount` records the raw window size independently of display-only rows. The mounted
Desktop now retains scoped pages across navigation, loads older windows, merges live and
optimistic updates, and exposes scoped/global plain-text search. Scroll restoration uses
visible message anchors. Focused renderer checks pass; isolated Desktop/manual acceptance
and the remaining consumer/performance audit are still required for full FR-8/FR-9 acceptance.

The implementation keeps schema 2's separate compact channel catalog for shared root,
participant and memory projections. A scoped writer must not parse unrelated workflow JSON.
It applies known projection-field deltas to existing Core records, retaining passive fields
and unrelated active turns. Runtime dispatch views contain only their target conversation;
global snapshot APIs keep their complete-state contract. Derived participant/orchestrator
memory may commit alongside the target, while preferences, groups and arbitrary Core edits
require the global operation.

An explicit, restartable application preparation pass runs the existing session/startup/
completed-turn repairs once before bounded views become ready. It is separate from the
logical import proof, and subsequent writes maintain those invariants. Required preparation
failures reject embedder readiness. Compact unresolved-choice facts preserve Guide Cat's
read model without scanning sibling transcripts.

Schema 3 adds guarded JSON-expression indexes for global response/rejection placement and
timestamp anchors. A page never treats a response in another window as missing. Segmented
Core presentations render at their terminal/latest response placement; a genuinely Core-only
live presentation anchors to the newest window, and other Core-only snapshots use their time
anchor. Rejections in another page suppress synthetic output. The original Core records stay
intact. Schema-1, schema-2 and schema-3 profiles receive verified paired backups before upgrading.

Schema-1 database admission creates a verified recoverable backup before transactional DDL,
including exact JSON/receipt, installation/revision/digest binding and interrupted-upgrade
recovery. Native check/VACUUM runs behind a nonblocking reaper so parent death can terminate
SQLite even while its own event loop is blocked. Both worker entrypoints ship in split and
bundled artifacts. Daily paired snapshots now start after application recovery, with a first
check after 30 seconds and hourly checks thereafter. Metadata capture uses only the short
profile lock; native check/VACUUM, asynchronous file proofs and retention use a separate
cross-process maintenance lock. The worker's consistent copy must match the captured
installation/revision/digest and contain no pending handoff. A concurrent revision defers
publication. An atomic directory rename publishes the verified DB/JSON/receipt/manifest pair.
Seven verified non-future pairs are kept; retention revalidates before deletion, ignores
damaged/future candidates, and resumes after interrupted publication/pruning. Close/reset
cancels queued capture/native work, and reopening resumes scheduling. Snapshot and upgrade
proof filenames append to the profile basename, so even `manifest.json` is safe; earlier
verified generic snapshot manifests remain readable without rewriting them.

Offline `cats-platform state` commands now provide check, snapshot, deterministic streaming
export and legacy/paired restore before ordinary server/auth initialization. Configured HOME/
USERPROFILE/Platform-directory selection matches the live server; `--profile` selects an exact
file. Check/export never initialize, migrate or recover state. Commands reject live leases
and incomplete commits/resets, expose controlled errors/nonzero exits, and cancel lock waits
and native workers. Paired restore stages a verified target after backing up current bytes,
blocks startup with a durable journal, removes old WAL before atomic database replacement,
publishes receipt/metadata and validates completion before removing the journal. Resume uses
the same manifest; unknown active/staged changes fail closed. Restore cannot revive an older
automatic-deletion opt-in. The operations guide records commands and recovery behavior.

### Cold archive integration contract

FR-15 uses immutable external compressed JSONL, not a second transcript table. The codec
foundation writes a header, individual group/Core context records and complete ordered raw
messages as concatenated standard gzip members. Member ranges and compressed hashes permit
bounded cold paging; whole-file, logical JSONL and canonical message-array digests prove
complete readback and bind the catalog to the same records used by full reads/exports.
The writer verifies the entire payload before producing its manifest. It never removes hot
rows. UUID filenames are independent of the configured profile basename. Default chunks
contain at most 200 records/about 512 KiB; a single larger JSON record is retained intact up
to an explicit 64 MiB limit. Over-limit/non-JSON input fails without truncation. Manifest
size, offsets and decompression output are bounded. This codec is synchronous and belongs in
a native maintenance worker or an offline command, not a serving callback.

Schema 4 now adds cold pointers, job reservations and per-channel content revisions behind
the existing verified backup/transactional upgrade boundary. Only header/transcript changes
advance a channel's content token; collection reordering and sibling writes leave it stable.
Full logical exports/global reads hydrate cold records, and ordinary mutations reject changes
to an archived transcript without reinserting it. Automatic transcript repairs stop for archived
channels, including startup preparation and ordinary writes. Owner deletion leaves a cleanup tombstone.

Schema 5 adds an operational message/index staging table for background unarchive preparation.
The final transaction copies prepared rows/FTS terms using SQL instead of decompressing and
indexing a transcript under the serving lock. Prepared-job digests are invalidated by staging
edits; reservations notice hot-row/header changes as well as ordinary product writes. These
rows are not a second logical transcript and are excluded from export. Schema-4 cold profiles
must receive the same self-contained verified backup before transactional upgrade.

Archive/unarchive now prepare, compress and verify in a fixed native worker behind the
nonblocking maintenance reaper. Reservations bind the target content revision and parent
profile lease; native connections have their own leases. Preparation promotes verified
immutable assets outside the serving lock. The final short coordinated operation rechecks
the target, latest active execution and prepared file identities before the durable SQL/
metadata handoff removes hot messages/FTS or rehydrates verified SQL staging rows. Sibling
writes do not invalidate preparation. Cancellation, close, reset and parent death reap native
work before cleanup; stale reservations and unfinished stages are recoverable. Failed cleanup
is retried by the owner scheduler without requiring another user write. Explicit owner deletion
uses catalog tombstones and proof-bound asset removal; unknown replacement bytes are preserved.
Archive keeps channel/group/Core relationships; owner deletion removes the pointer and uses
recoverable asset cleanup, without resurrecting archived content. Full logical exports/global
snapshots must hydrate cold history; ordinary mutations must not silently reinsert it.

Immutable files live in a fixed sibling `<database>.archives` directory, derived from the
configured database path. Snapshots, schema-upgrade backups and paired restore now include
and verify referenced assets, so a backup remains usable after the original cold root is
removed. A source-asset race defers snapshot publication and preserves the last good backup.
Background manifest admission and bounded-buffer copies are asynchronous and cancellable;
Windows filename aliases share the existing profile identity rules. Restore preserves raw
current assets even when damaged, stages verified replacements and publishes them before the
database. It may atomically repair an already-backed-up original with the same archive ID;
unknown edits are refused and interruption admits only original/already-published target bytes.
Offline check validates cold evidence too. CLI archive/unarchive coordinate with live profile
users without starting server/auth/Runtime. The fixed native archive entrypoint ships beside
both split and bundled sidecars. Authenticated product actions, bounded cold transcript
readback and Desktop controls remain pending; backend/CLI checks alone do not satisfy FR-15.

## Dependencies and open validation

- Attribution: Cats Bot `state-db-p1`; no Bot dependency or changes.
- Platform's Electron 41 and the actual Platform Node process; existing auth and routing.
- Three-platform CI and isolated real-data byte comparison must be evidenced before release.

*Created and last updated: 2026-11-12*
