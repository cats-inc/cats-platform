# ADR-152: Pilot a State Database in Cats Desktop Before Cats Bot

> Cats Desktop tries moving its conversations from one JSON file into a SQLite database
> first, reusing what Cats Bot built and then withdrew. Cats Bot keeps its readable files
> until Desktop's pilot has been released and tested.

## Status

Proposed, 2026-11-12. Documentation only; nothing in Desktop changes yet.

- The owner decided the order and why (D1 to D3 below).
- Everything about how Desktop would do it is a proposal (P1 to P9) for the owner to accept
  or change. Phase 0 measures first, and its report goes to the owner before any design is
  written.

## Context

### Cats Bot built a state database and withdrew it

- On 2026-11-11 Cats Bot accepted
  [ADR-021](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/021-keep-each-bots-state-in-a-sqlite-database.md)
  (each bot's state in one SQLite database) and
  [ADR-022](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/022-give-each-bot-layered-memory-it-consolidates-while-asleep.md)
  (layered memory), with SPEC-014, SPEC-015 and PLAN-014.
- Over 2026-11-11 and 2026-11-12 PLAN-014 P1 was built in cats-bot #161, #163, #165, #166
  and #168 (the store beside the files), #169 (the cutover), #172 (check, snapshots,
  export), #170 (paging), #171 (search) and #173 (hardening). Each pull request had an
  independent review until none of its findings blocked, and CI on Windows, macOS and
  Linux, under Node.js 24 and inside Electron 41.
- On 2026-11-12, before any release, the owner withdrew it from Bot: Bot is a light product
  in which every conversation is one-to-one, and state kept in files a person can open and
  read has a value of its own there. cats-bot #174 reverted `main` to the 0.5.9 base with
  its two later fixes. Everything P1 built, with its tests and measurements, is kept at the
  tag [`state-db-p1`](https://github.com/cats-inc/cats-bot/tree/state-db-p1).

### What Desktop keeps today

Read in the code of `main` on 2026-11-12, after 0.16.0:

- One file, `chat-state.local.json` (`resolveDefaultChatStatePath` in
  `src/shared/platformPaths.ts`), holds the whole persisted snapshot: the core state, and the
  chat state with every cat, every channel with all of its messages
  (`ChatChannelState.messages` in `src/products/chat/api/contracts.ts`), the parallel chat
  groups and the preferences.
- `FileChatStore` (`src/products/chat/state/store.ts`) writes the whole snapshot again on
  every change (`writePersistedChatSnapshot`), one change at a time through its queue. Every
  read loads the whole file, and normalizing it re-projects every channel into the core; the
  store keeps the last clean text so that an unchanged file is not normalized again. Both
  costs grow with all the history kept, not with the change made.
- The chat state carries a version with upgrades in code; 0.16.0 writes version 7
  ([ADR-149](149-let-a-conversation-gain-product-scopes-and-never-lose-them.md)).
- Evidence is appended per conversation to `evidence/<conversation id>.jsonl`
  (`src/platform/persistence/evidence.ts`), as
  [SPEC-022](../specs/SPEC-022-cats-memory-layering-and-ownership.md)'s technology guidance
  suggests for append-only evidence.
- SQLite is already used once: `src/platform/multimedia/catImageLedger.ts` opens
  `node:sqlite`, loading it lazily so that older Node.js hosts keep their other App
  capabilities. It shares transactions across Platform processes and refuses a database it
  does not know or that is damaged, never resetting it.
- Desktop has group chats, parallel chats, Boss Cats that reach across conversations, and
  product scopes. These are where a database earns its weight: queries across
  conversations, and changes to one conversation that should not rewrite all the others.

### What is not known yet

- How large `chat-state.local.json` grows on real installations, and how long a change, a
  read and a normalization take at those sizes.
- Which processes read or write the file, on each host: the Desktop app, the Platform
  server, headless use.
- Which Node.js runs the Platform process on each host, and whether `node:sqlite` is
  available there. The image ledger loads it lazily for hosts where it is not.

## Decision

### Decided by the owner on 2026-11-12

- **D1.** Cats Desktop tries a state database first. Cats Bot keeps its version-1 JSON and
  JSONL files until Desktop's pilot has been released and tested, and then decides whether
  it needs one. Bot's ADR-021 names what would make it reconsider: conversations long
  enough that starting or reading them is slow, memory recall that needs more than a scan
  of the files, or a deletion or journal problem the files cannot solve.
- **D2.** The reason: Bot is light and one-to-one, and its readable files have a value of
  their own. Desktop's group and parallel chats, and its single JSON file, make it the
  product where a database pays for itself.
- **D3.** Archived conversations go to cold storage as compressed JSONL (Bot's SPEC-014
  FR-15, 2026-11-12). P7 proposes the same for Desktop.

### Proposed

- **P1. Measure before designing (Phase 0).**
  - Build chat states of one, ten and a hundred times a busy owner's year: channels, messages
    per channel, parallel groups. Time a change at the 50th and 95th percentile, a cold
    read, and a normalization, inside the Desktop app's Electron and under the Node.js the
    Platform runs on.
  - On the owner's own installation, take counts and timings only: never content.
  - List every process that reads or writes the file, and check `node:sqlite` in each
    host's runtime.
  - Gate, to be agreed with the owner: proceed to a design if, at the sizes an owner reaches
    in a year, a change takes more than about 50 ms at the 95th percentile, a read and
    normalization more than about 100 ms, or the file passes about 20 MB. Otherwise first
    try the cheaper fix: one file per conversation for its messages, the rest kept in the
    snapshot.
- **P2. What moves first.** Channels with their messages and the parallel chat groups move
  into one database per installation, under the Platform state directory. Settings, the cat
  registry, preferences and the core state stay in JSON at first. Evidence stays JSONL, as
  SPEC-022 suggests, until memory work decides otherwise.
- **P3. Engine.** `node:sqlite` behind an adapter, as in Bot and in the image ledger, with a
  driver acceptance test in every host's runtime. `better-sqlite3` only if that test fails
  somewhere.
- **P4. Reuse from `state-db-p1`.** Copy, with attribution, what fits:
  - the driver loading and its acceptance test across platforms, in Node.js and Electron
    (`src/core/store/sqliteDriver.ts`);
  - the adapter, which tells a read from a change by the statement's text, keeps durable
    transactions, notices a transaction SQLite ended after a failure, and reads big
    integers where deletes from the full-text index need them (`stateDatabase.ts`);
  - the schema with a version, upgraded in one transaction when a writer opens it and
    refused when newer (`stateSchema.ts`);
  - the full-text index: text rewritten so that Chinese, Japanese and Korean runs become
    overlapping two-character terms with their last character, a contentless FTS5 table
    with `contentless_delete`, and searches that rank only the newest 1,000 matches
    (`searchText.ts`, `stateStore.ts`);
  - the import of files into the database, checked against them inside its last durable
    transaction with a marker, and the migration around it: a copy aside with a manifest,
    the version raised only after the marker, the old files archived, a restore command
    (`version1Import.ts`, `version1Migration.ts`);
  - the check and daily snapshot in a child process (`stateMaintenance.ts`);
  - an export written the same from files and from the database, which makes "nothing was
    lost" checkable on real data (`conversationExport.ts`);
  - the measurement script and its manual workflow on the three platforms
    (`scripts/testing/measure-store-performance.mjs`).
- **P5. What Bot's build learned.** Each of these cost a review round there:
  - Electron 41's `fs.cpSync` ends the process on a directory path outside ASCII, and
    `fs.rmSync` fails on a read-only file and crashes on a path outside the ANSI code page;
    Bot copied and removed trees with its own functions.
  - A Windows path, a UNC path and a path outside ASCII each need their own `file:` URI, and
    `mode=rw` so that opening never creates a file. SQLite's write-ahead log does not work on
    a network share.
  - A full-text search that ranks every match took up to 3.4 s over a million entries: BM25
    counts every row holding each ranked word. Bounding the candidates fixed it.
  - "Newest" by row id is only newest if the import numbers rows by time. Bot's first import
    numbered them by file name.
  - A term scoping a search to one conversation must be one that no text and no query can
    produce, or another conversation's text can hide the results.
  - Paging a conversation must read only its own window, through indexes. A first version
    read every reply of the conversation on each page: 16 s for a page of a 600,000-entry
    conversation.
  - `quick_check` and `VACUUM INTO` block the thread that calls them: 16 to 17 s and 9 s on
    330 MB. A worker thread cannot be interrupted inside a SQLite call; a child process can.
  - A snapshot is taken only after the database passed its check, under a name that says it
    is unfinished until it is whole. A snapshot or a report named after a time to come must
    not be taken for the newest, and a clock set back must not remove the good ones.
  - A host that starts the core must allow for a migration that takes minutes, and must not
    start again a core that stopped on a damaged database.
  - A reader without the lock must not see a migration half done.
- **P6. A persisted-data change, with its upgrade path.** It ships in a new minor version,
  with a tested upgrade: a copy aside, a check against the source, an atomic switch, and
  recovery from a failure at each step. The previous minor must be reachable again through a
  restore, as Bot's `cats-bot restore` did. Before release, an export of a copy of real data
  before and after the migration must be equal byte for byte.
- **P7. Retention.** No automatic deletion. When conversations are archived, cold storage is
  compressed JSONL (D3).
- **P8. Shared code.** Copy into Platform now; extract a shared package
  ([ADR-142](142-publish-reusable-platform-packages-for-independent-products.md)) only once
  Bot adopts a database as well.
- **P9. How it proceeds.** Phase 0's report goes to the owner with the gate's numbers. If it
  passes, a SPEC and a PLAN follow for the owner's approval, then pull requests with an
  independent review and CI on the three platforms each.

### What Bot's build measured

For comparison in Phase 0; the conditions matter:

- On GitHub's runners on Windows, macOS and Linux, under Node.js 24 and inside Electron 41,
  with a million made-up entries (one run each): an append at the 95th percentile 0.27 to
  0.86 ms, the newest 50 entries 0.09 to 0.29 ms, a two-character Chinese query 1.7 to
  51.3 ms. One common character 0.10 to 0.26 s.
- On the owner's Windows machine inside Electron, one run with other work running: the same
  query 132 and 169 ms for the commonest words in a 600,000-entry conversation.
- Importing a million entries took 144 s, and 273 s once rows were numbered by time, with
  up to 1.2 GB of memory, on a machine shared with other work.

### What Bot never validated

- Search had no consumer yet; nothing used it.
- No soak on real data. The real-data check was one bot with one conversation of 77 lines.
- Bot runs one process per bot, the only writer of its database. Several processes
  writing one database, which Desktop may need (Phase 0 lists them), were never exercised.

## Consequences

### Positive

- The product with the heavier state tries the database first, with Bot's tested pieces and
  lessons, and on its own measurements.
- Bot stays light and readable, and gains a tested design to adopt later if it needs one.
- Phase 0 can end with the cheaper fix, if the numbers show the file is not the problem.

### Negative

- Desktop takes on a persisted-data change, with a migration and a restore to keep.
- Copying Bot's code means two copies until a shared package exists.
- Bot's memory work (ADR-022, SPEC-015) waits on Desktop's outcome for where it keeps its
  evidence.

### Neutral

- Bot's version-1 files stay as they are; its next version number is the owner's to choose
  again.
- Evidence JSONL and the image ledger's SQLite are unchanged.

## Alternatives Considered

### Alternative 1: Keep one JSON file

- **Pros**: no migration; every tool reads it.
- **Cons**: a change rewrites all history; reads and normalization grow with it.
- **Why not chosen**: kept as Phase 0's baseline, and its outcome if the gate is not passed.

### Alternative 2: One file per conversation

- **Pros**: cheaper; readable; a change rewrites one conversation. Bot's version-1 layout.
- **Cons**: queries across conversations read many files; no index for search.
- **Why not chosen**: P1's fallback when the numbers do not call for a database.

### Alternative 3: The database in Bot first

- **Pros**: built and tested.
- **Cons**: weight a light, one-to-one product does not need yet.
- **Why rejected**: the owner withdrew it (D1, D2).

### Alternative 4: Another embedded store

- **Pros**: `better-sqlite3` is mature; key-value stores are fast.
- **Cons**: native modules to build and sign on three platforms; `node:sqlite` already ships
  with Electron and is used here.
- **Why not chosen**: P3 keeps it only as the fallback.

## References

- cats-bot [ADR-021](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/021-keep-each-bots-state-in-a-sqlite-database.md),
  [ADR-022](https://github.com/cats-inc/cats-bot/blob/main/docs/decisions/022-give-each-bot-layered-memory-it-consolidates-while-asleep.md),
  [SPEC-014](https://github.com/cats-inc/cats-bot/blob/main/docs/specs/SPEC-014-bot-state-database-and-migration.md),
  [SPEC-015](https://github.com/cats-inc/cats-bot/blob/main/docs/specs/SPEC-015-bot-memory-layers-recall-and-consolidation.md),
  [PLAN-014](https://github.com/cats-inc/cats-bot/blob/main/docs/plans/PLAN-014-bot-state-database-and-memory.md)
- The code, tests and measurements: tag
  [`state-db-p1`](https://github.com/cats-inc/cats-bot/tree/state-db-p1) and its
  [`src/core/store/`](https://github.com/cats-inc/cats-bot/tree/state-db-p1/src/core/store)
- The three-platform measurement: cats-bot Actions run 43133239743
- cats-bot #161, #163, #165, #166, #168 to #173 (built), #174 (withdrawn)
- [SPEC-022](../specs/SPEC-022-cats-memory-layering-and-ownership.md),
  [SPEC-031](../specs/SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md),
  [ADR-142](142-publish-reusable-platform-packages-for-independent-products.md),
  [ADR-149](149-let-a-conversation-gain-product-scopes-and-never-lose-them.md)

---

*Decision proposed: 2026-11-12*
*Decision makers: the owner (D1 to D3); the proposals await the owner*
