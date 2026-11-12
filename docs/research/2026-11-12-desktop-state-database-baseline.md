# Desktop state database: Phase 0 baseline

Measured 2026-11-12 on the owner's Windows machine, against an isolated synthetic
profile. Platform source starts at `355a9469a`; governing decision [ADR-152](../decisions/152-pilot-a-state-database-in-cats-desktop-before-cats-bot.md),
execution [SPEC-144](../specs/SPEC-144-desktop-conversation-database.md) /
[PLAN-137](../plans/PLAN-137-desktop-conversation-database.md).

## Workload and commands

`npm run build:server`, then:

```text
node --import ./scripts/testing/isolate-cats-home.mjs scripts/testing/measure-desktop-state.mjs --scales=1,10,100 --samples=3 --output=build/state-baseline-node.json
```

The equivalent Electron invocation uses the locally installed Electron executable,
`ELECTRON_RUN_AS_NODE=1`, and the same preload/script/arguments. An explicit output name
keeps the report. `--memory-budget-mib` bounds the child heap; a conservative preflight
also reports insufficient capacity instead of paging out the owner's applications.
Each child has a 15-minute kill deadline. `--help` documents the interface.

At 1x: 40 conversations, 300 messages each (12,000 total), two participants per
conversation, five completed workflow turns per conversation, and ten parallel groups
of four members. Bodies are 160 characters including CJK. Normalization assertions check
that conversations, groups and turns survive. 10x/100x scale the conversation count;
this is a sparse-turn baseline, not a complete model of a year of active agent work.
Core remains JSON under the proposed split, so its growth must remain in the post-port
comparison. Current file writes also pretty-print JSON; the table's byte count is the
compact source used for initial input, not the later pretty-printed size.

## Results

The first runs below had `setupCompleteAt=null`, so the cold store read also performed
its existing first-setup repair/write. That is an initialized-profile fixture defect in the
first command revision, not pure read latency. The repaired-fixture runs explicitly seed
setup completion and assert the read leaves the exact source bytes unchanged. Both old
and corrected reports are retained, with these distinct meanings.

Single run per host/size; three mutation samples. p95 here is the largest of three,
not a well-estimated population percentile. Other work was running on this machine.

| Host | Scale / read kind | Compact source | Mutation p50 | Mutation p95 | Store read | Parse/normalize | Peak RSS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Node 26.13.0 | 1x, includes setup repair | 6,185,576 B | 1,481.72 ms | 1,656.07 ms | 1,537.62 ms | 434.12 ms | 625,344,512 B |
| Node 26.13.0 | 10x, includes setup repair | 62,081,666 B | 19,229.64 ms | 19,669.75 ms | 20,708.75 ms | 8,687.75 ms | 3,905,196,032 B |
| Electron 41.2.0 / Node 24.14.0 | 1x, includes setup repair | 6,185,576 B | 2,050.20 ms | 2,221.41 ms | 2,035.83 ms | 566.70 ms | 446,476,288 B |
| Node 26.13.0 | 1x, pure read | 6,185,598 B | 1,678.75 ms | 1,869.82 ms | 639.43 ms | 326.02 ms | 346,718,208 B |
| Electron 41.2.0 / Node 24.14.0 | 1x, pure read | 6,185,598 B | 2,757.67 ms | 2,909.10 ms | 1,012.23 ms | 662.47 ms | 341,405,696 B |

The first Node 100x attempt was cancelled after resource pressure; it produced no timing.
The bounded retry refused 100x with a 2,342 MiB available budget and a conservative
60,000 MiB extrapolated working-set allowance. This is a **capacity refusal**, not an
observed 60 GiB peak. Electron's bounded run refused 10x/100x with approximately 2,347 MiB
and 2,346 MiB budgets. Neither is a successful timing measurement. The workload and
limitations are retained in the reports, not converted to passing results.

Even the 1x input exceeds the proposed latency gate: mutation p95 >50 ms and cold read /
normalization >100 ms on both tested hosts. The file-size gate (>20 MB) is unnecessary
to justify proceeding. This establishes a local reason to design the database, not
proof that a database alone eliminates cloning/Core projection costs.

Machine-readable, content-free evidence:

- [Node corrected initialized-profile timings](desktop-state-baseline/2026-11-12-desktop-state-node-clean.json)
- [Electron corrected initialized-profile timings](desktop-state-baseline/2026-11-12-desktop-state-electron-clean.json)
- [Node timings](desktop-state-baseline/2026-11-12-desktop-state-node.json)
- [Node bounded 100x retry](desktop-state-baseline/2026-11-12-desktop-state-node-capacity.json)
- [Electron timings and capacity refusals](desktop-state-baseline/2026-11-12-desktop-state-electron.json)
- [Owner counts and read timing only](desktop-state-baseline/2026-11-12-desktop-state-owner-counts.json)

The owner's profile count was 1,789,505 bytes, one channel, 51 messages, zero parallel
groups. Only counts and observed read/parse timing were captured. Its contents and IDs
were not printed or saved in these reports, and the profile was not written. Observed
read timing is cache-dependent, not a cold-read claim. No owner mutation was attempted.

## Process and runtime inventory

| Surface | Current access | Runtime / port consequence |
| --- | --- | --- |
| Platform server (`src/index.ts`) | The sole live production constructor of `FileChatStore`; serves every product, SSE, tools and transport mutations | Packaged Desktop launches it with its own Electron executable and `ELECTRON_RUN_AS_NODE=1`; tested Node 24.14.0 / Electron 41.2.0 |
| Self-hosted/headless Platform, local dev | Same server/store, potentially another process pointed at the same configured path | Local Node 26.13.0 tested; require driver acceptance in every supported runtime and serialize coordinated mutations across processes |
| Desktop host setup completion reader | Reads `setupCompleteAt` directly from the atomic JSON profile; onboarding history is a separate file | Metadata-only and may observe the last published envelope during a handoff; must never synthesize a combined conversation/Core snapshot without recovery/locking |
| Desktop startup and shared Platform preferences | Read/write a separate platform-preferences JSON resolved from the profile's location | Do not move these into the conversation database or mistake them for writers of the chat snapshot |
| Browser/mobile, products, Boss Cats and transports | Use server APIs/stores, no independent direct profile-file writer found | Wire paging/search and scoped mutations at server-owned seams, preserving auth/redaction and product scope |
| Test/acceptance scripts constructing `FileChatStore` | Isolated fixtures and old-format regression coverage | Keep old-format behavior only as migration/baseline tooling; update live candidate scripts to the database store |
| Image ledger | Separate lazy `node:sqlite` database in the Platform process | Existing transaction precedent; independent schema/data remains unchanged |

This inventory is source-backed. It does not claim several user-installed Platform
processes were observed writing simultaneously. Concurrency acceptance must actually
start isolated processes. macOS/Linux runtimes have not been exercised locally.

## Foundation checkpoint

The initial adapter/query implementation passed 18 focused real-SQLite tests under both
local Node and Electron. Independent review then required two further fixes: do not mark
a stale search index current without rebuilding, and invalidate page cursors when message
order changes. The later count-cache, staged import, cursor, Unicode identity and coordination additions
subsequently passed **48/48** focused cases under each local host after an incremental server
build. Independent foundation review found no remaining blocking issue after the recorded
fixes. This covers the query/coordination foundation, not the live-store migration or whole
Desktop port. The prepared three-OS workflow is not evidence of a hosted pass.

## Live-store migration checkpoint

The [real-copy verification](desktop-state-baseline/2026-11-12-desktop-state-real-copy.json)
used a private temporary copy of all four admitted source files. It imported one channel and
51 messages in 858 ms, compared canonical pre/post exports byte for byte, restored the saved
legacy bytes and read them through the old-format backend. All original source hashes remained
unchanged. The matching logical digest was
`afca1579a4b19928f1ed1fbc0967dcf08a265310af1c29b1b86742cd60af9235`.

An earlier verification failed because Core re-projection advanced historical timestamps.
The importer now keeps persisted source timestamps and uses persisted deterministic fallbacks
for newly projected records; the passing result includes that correction. This is migration
and rollback evidence, not a post-port performance benchmark. The new global snapshot APIs still
materialize transcripts, and indexed/scoped product consumers remain in progress.

The verification command requires an explicit source and the isolated Cats-home preload:
`node --import ./scripts/testing/isolate-cats-home.mjs scripts/testing/verify-desktop-state-upgrade.mjs --source=<profile> --report=<report>`.
It writes temporary copies and content-free reports, and never writes the selected originals.

*Last updated: 2026-11-12*
