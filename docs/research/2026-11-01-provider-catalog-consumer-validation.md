# 2026-11-01 provider catalog consumer validation

The owner scoped the refresh to Codex, Claude, Antigravity, Grok, Muse, Cursor and Copilot.
Runtime's single authored schema-2 factory remains the model/option source. No Platform
model table, selector implementation, package version or dependency was changed.

The Runtime candidate adds GPT-6.1 Terra (six efforts, default Low, context 500000) and
Cursor DeepSeek V4.1 Flash 1017. Counts are 8 Codex, 12 Claude, 5 Antigravity, 4 Grok,
3 Muse and 49 Cursor. Copilot retains 14 existing entries and its prior date: both its
machine list and interactive 1.0.105 CLI returned feature HTTP 403 after the owner signed in.
Other provider scopes remain unchanged. Details and fixture provenance are in Runtime's
`docs/research/2026-11-01-seven-cli-catalog-refresh.md`.

## Validation

- Server and test-UI builds passed. The initial shared dependency folder lacked the existing
  platform-ui-web dependency; isolated lockfile installation fixed it. The test-UI bundler
  emitted a missing mobile Expo base-config warning; no manifest or lockfile changed.
- Four focused suites passed, 13 tests: provider catalog normalizers, client cache/revision
  behavior, selection helpers and read-only local informational projection.
- Real basic and advanced HTTP responses from an isolated Runtime passed the built Platform
  normalizers for all seven requested providers: every entry ID/label and shared revision
  matched the factory. Revision:
  `b6c938a44667a5a9dc64e3ac28719e583b6fbb4c269816aca416d9eb7430ce30`.
- The same candidate passed Bot projections and headless Playground checks for all 95 entries,
  Terra effort/default and custom input. This is source/consumer validation, not acceptance of
  an installed Desktop update. No Cats conversation/task or provider inference was created.

Factory sourceDigest:
`b9f8c46b2b9add026804082b219a0d3350ab17f264b2c481beb00dc3cfacff64`.
Private harness/screenshots remain in Runtime's ignored `tmp/catalog-refresh-20261101/`.
No full-suite, installed-application, release or publication claim is made.
