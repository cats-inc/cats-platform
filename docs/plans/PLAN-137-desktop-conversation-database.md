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
- [x] Legacy and paired offline restore engines, command routing and resumable failure/restart/concurrent-start matrix.
- [x] Coordinate authorized data reset before mutation, close connections before removal and
  resume interrupted purges before ordinary database admission, including custom/default profiles.

## Phase 3 — Product consumers and cold storage (FR-8, FR-9, FR-15)

- [ ] Connect indexed paging to message API and renderer while retaining live behavior.
  The indexed message API/client and bounded app-shell/channel/entity-subscription read
  models and mounted transcript paging/retained history are implemented. Focused scroll,
  cancellation, reconnect and optimistic rollback checks pass; manual acceptance remains pending.
- [ ] Authenticated bounded search endpoint and Desktop search consumer; redact private cards.
  The authenticated/redacted query endpoint, client and scoped/global Desktop dialog are
  implemented. Focused controls/cancellation checks pass; manual acceptance remains pending.
- [ ] Finish scoped conversation write consumers, preserving group and parallel semantics.
  Runtime dispatch writers are integrated; REST metadata/action consumers remain to be audited.
- [ ] Verified compressed JSONL archive with interrupted-operation recovery/readback.

## Phase 4 — Maintenance, host and packaging (FR-14, FR-16, FR-17, FR-19)

- [x] Killable native check/snapshot with a nonblocking reaper, including parent-kill cleanup.
- [x] Daily paired metadata snapshots and valid completed-snapshot retention.
  Starts after application recovery, checks after 30 seconds and hourly, keeps seven
  verified non-future pairs; mismatched concurrent revisions defer without blocking writers.
- [x] Initialize before readiness; migration progress/deadline and fatal-state restart behavior.
- [x] Close connections/workers during shutdown/reset; prevent after-close maintenance spawns.
- [x] Offline command routing/help and read-only behavior.
  Check, snapshot, deterministic export and legacy/paired restore run before server/auth
  initialization, use the configured or explicit profile, reject live leases/pending reset,
  expose nonzero failures and support cancellation. Check/export never create or migrate state.
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
| 2026-11-12 | Indexed message paging/search now reach authenticated product routes with browser-safe typed clients. Actual server/database query checks passed **6/6 Node and 6/6 Electron**, including a malformed sibling, private-card redaction, unauthenticated rejection, cursor invalidation and safe storage failures. **84/84** affected query/REST/Memory-store regressions and **18/18** bundled client/auth checks passed. Memory fixture queries share the generation cursor protocol and mutation queue; no production materialized fallback was added. Independent API/client review found no blocking P1/P2. These checks do not cover mounted Desktop transcript/search controls, app-shell or entity-subscription windowing, which remain pending. |
| 2026-11-12 | Query checkpoint builds passed: server, actual web renderer (`build:web`), typed test bundling and test-fixture typecheck. The web build retains its existing large-chunk notice; it did not fail. Final client cancellation regression and its independent review preserve AbortError when an error body is interrupted. Existing server-side query DTO/error re-exports remain available. This is local Windows evidence, not hosted three-OS acceptance. |
| 2026-11-12 | Bounded initial read models now cover app-shell, channel GET and entity subscriptions without reading old/sibling transcripts. An explicit restartable application preparation pass maintains session/startup repairs before readiness and on subsequent writes, separate from import equality. Required embedder preparation failures reject readiness. Compact unresolved-choice facts preserve Catlas suggestions. Schema 3 adds guarded JSON-expression placement/rejection/time indexes; schema-1 and schema-2 paired-backup upgrades preserve logical state. |
| 2026-11-12 | Final stable-output presentation checkpoint passed **154/154 Node and 154/154 Electron**, zero skipped, including cross-page source/segmented/rejection cases, displaced live output, sealed Core-only empty history and non-monotonic timestamps. Actual query plans show indexed searches with no message scan/temp sort for placement probes. **104/104** affected server/runtime/Core/REST/Catlas/lifecycle regressions and **53/53** bundled presentation/navigation/subscription/client tests passed. Server, host, actual web, test bundling and fixture typecheck passed. These are focused local checks, not a full application suite, three-OS CI or mounted Desktop acceptance. |
| 2026-11-12 | Independent read-model review resolved required-readiness swallowing and cross-page enrichment findings (terminal/rejection proof, live tail placement, empty sealed output and persisted-position fallback for non-monotonic times). No blocking P1/P2 remains in that slice. One bundled Electron probe exceeded its existing 15-second child deadline during parallel validation (**30/31** overall); the specific actual Node/Electron bundled-worker test passed **1/1** in isolation in 1.6 seconds without code/timeout changes. Keep that timing event visible; an isolated rerun does not establish its root cause. |
| 2026-11-12 | Mounted paging/search checkpoint: **16/16** controller/DOM/scroll cases and **44/44** affected presentation/navigation/subscription/client/message-action cases passed with normal process exit. The first combined renderer run completed its assertions but hung on React 18 bundled-ESM async `act` MessageChannels; tests now use the repository's existing synchronous `act`/`waitFor` pattern. This was a harness correction, not a product-resource fix. Server build, typed test bundling and fixture typecheck passed; the first typecheck exposed missing mock parameter annotations, corrected before the passing result. |
| 2026-11-12 | History invalidation checks passed **14/14 Node and 14/14 Electron**, including old body edits, old/new Core anchors, lane-only termination, tail rejection/terminal topology, timestamp-only edits, backdated appends and a new maximum time whose former maximum lay in old non-monotonic history. Ordinary monotonic append/body streaming keeps its token. The prior checkpoint's **24/24** Node presentation/scoped cases preceded the final two timestamp/fast-path cases; counts overlap and are not additive. Independent backend and renderer slice reviews have no remaining blocking P1/P2; they did not run tests or approve the entire port. |
| 2026-11-12 | Actual isolated Windows Desktop candidate built Runtime, Platform server, host and web renderer and manually verified latest-50 entry, older-page prepend with a stable visible anchor, retained reading position through direct/group navigation, CJK search for an unloaded old message, all-conversation search and opening a group result. Also inspected default/group/parallel draft chips (including the secondary Claude branch), direct avatar, ongoing group stack, bubble copy controls and sidebar overflow placement. No provider/model execution was requested. Full live/provider, active parallel-history and cross-product navigation acceptance remains pending. |
| 2026-11-12 | Candidate receipt: private root `cats-inc/.desktop-candidates/state-db-renderer-20261112-c`, launch `93378897dd97dd966bde94c5a815c48259f455e985407b44fc4b4d575183a2d6`, instance `39fbda38534885982d38f571e4f02175`; Platform HEAD `ea4b53857` plus this dirty slice, source digest `e7de129c147b0df61ffec2abbcc5225f81b61567bbca16e70ab9c9f58169ecde`; Runtime `77d3e861aff5a8871e138e3be5ed28ce96c2ab09`. Four synthetic channels/500 messages and first Admin existed only in that private profile. Normal stop returned `drained`, both owned services stopped, exit 0; a subsequent OS query found none of its three PIDs. Installed Desktop/profile were untouched and no CDP port was opened. Earlier roots `a`/`b` failed before launch (per-process Git ownership admission, then missing main's UI dependency); worktree-only dependency links plus the exact extracted vendor package fixed setup. |
| 2026-11-12 | Daily paired snapshots now capture exact JSON under the short serving lock, then run native check/VACUUM, async bounded-memory file proofs and retention under a separate cross-process maintenance lock. A mismatched installation/revision/digest or pending handoff defers publication. Atomic directory rename publishes DB/JSON/receipt/manifest together. Only verified non-future pairs count toward seven; invalid/future/unfinished data cannot displace good backups. Interrupted publication/pruning retries safely; reset/close aborts queued captures and native work before removal. No owner profile was written. |
| 2026-11-12 | Snapshot integration checkpoint passed **39/39 Node** (17 snapshot, 14 reset, four startup and four shutdown cases) and **21/21 Electron** (17 snapshot plus four startup); the final diagnostic-sink retry regression passed in the expanded **18/18 Node and 18/18 Electron** snapshot suites. **2/2** actual bundled worker/coordinator checks passed, each running real Node and Electron child probes; server build and fixture typecheck passed. Counts overlap. Earlier **34/34** Node maintenance/reset/snapshot cases include five native timeout/cancel/parent-death checks. Hosted macOS/Linux and full-candidate CI remain pending. |
| 2026-11-12 | Independent snapshot/retention and lifecycle reviews have no blocking finding in this implemented slice. Fixed review findings: revalidate retained pairs immediately before deleting any good old pair, Windows filename aliases in cleanup, and deterministic retention of the newly returned same-timestamp forced snapshot. Fault regressions corrupt both discovered/newly published candidates before pruning. These reviews do not approve archive/offline CLI/performance work that is still unimplemented. |
| 2026-11-12 | Offline CLI now routes before server/auth provisioning: check, snapshot, streaming deterministic export and legacy/paired restore with help, explicit/configured profile selection, safe errors and nonzero failures. Paired restore preserves exact current files, stages and verifies its target, disables an older cleanup opt-in and uses a durable startup-blocking journal across WAL removal, database/receipt/metadata publication. Re-entry admits only original or already-published bytes; external edits are preserved and refused. |
| 2026-11-12 | Current backup/restore/retention matrix passed **46/46 Node and 46/46 Electron**, including every pair publication checkpoint, selected-source substitution, current-file edits, live leases, pending reset, read-only files, Windows aliases and policy opt-in preservation. Additional older-schema pair cases passed **2/2 in each host**, exercising schema-1 startup upgrade and schema-2 staged policy adjustment with complete Core equality and unchanged selected-backup bytes. The earlier combined actual-CLI/restore checkpoint passed **37/37 Node**; namespace-sensitive CLI snapshot/restore and reset cases then passed **2/2** targeted cases. A separate unsupported-host CLI regression passed **1/1**, with no private diagnostic or source mutation; its initial fault fixture intercepted CJS instead of the driver's actual `getBuiltinModule` path and was corrected. Counts overlap, not additive. |
| 2026-11-12 | Full bundled sidecar CLI passed its **1/1** acceptance, executing help/check/snapshot/restore/export under actual Node and Electron from sidecar layout with exact linked installed dependencies. Server build and fixture typecheck passed. Normal CLI startup/auth/lifecycle plus schema-upgrade regressions passed **30/30 Node**; schema checks passed **13/13 Electron**. This is local Windows evidence, not three-platform CI or a release. |
| 2026-11-12 | Independent restore and CLI reviews have no blocking finding in their implemented scope. Resolved configured-HOME selection mismatch, restore admission during pending reset, legacy lock-wait cancellation and private error formatting. Actual CLI SIGINT uses a test-only IPC preload to emit the process event on Windows after observing that child's real lock candidate, proving exit 130 while the parent still holds the lock and state remains unchanged. |
| 2026-11-12 | Fixed configured `manifest.json` collisions in snapshots, paired restore and schema-1/2 upgrade backups. New proof names append to the profile basename; metadata, DB and receipt retain their names. Earlier generic snapshot manifests remain read-only/restorable. New regressions prove canonical equality, exact metadata bytes and digest proofs for the colliding profile; old generic snapshots restore without rewriting the selected backup. |

*Created and last updated: 2026-11-12*

## Next integration checkpoint

The active goal is the entire SPEC-144 port; the live-store checkpoint is not completion.
Live startup now constructs `DatabaseChatStore`; nothing has been deployed or written to the
owner's actual profile. Keep the worktree and continue product consumers, maintenance/archive,
host packaging and acceptance. The ordinary startup deadline is 75 seconds; the first validated
state progress event extends it once to ten minutes, and subsequent events cannot renew it.

Next work: finish isolated live/active-parallel/cross-product paging/search acceptance;
remaining scoped REST consumers, and the still-unexplained Electron multi-process startup
failure (retain the new safe diagnostic evidence); explicit compressed
archives and their explicit product/operations consumers; then post-port
measurements, hosted CI and isolated Desktop acceptance.
The existing global snapshot APIs still materialize all transcripts and must not be advertised
as meeting the final performance goal. Preserve these implementation constraints as work continues:

- The mounted transcript now consumes `messagePage`/`orderRevision`, loads older pages and
  merges `displayMessages` (falling back to raw `messages` for fixture responses). Retained
  pages refresh on `historyRevision`, including old edits and moved/rejected Core output;
  monotonic tail streaming keeps the ordinary fast path. Do not write presentation-only header/window
  state through a global snapshot mutator. Audit Work/Code shell/navigation callers and remaining
  scoped REST actions before claiming the end-to-end performance goal.
- Index-backed placement proof makes display-only Core presentations unique across pages.
  Raw API `messages` remain limit-bounded; `displayMessages` is a separate view projection.
  Core stays complete in JSON under FR-4, so do not advertise generic Core work as constant-time.

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
