# Claude model labels and Cats default markers

Updated: 2026-09-16.

The operator supplied Claude Code 2.1.273's complete picker and requested four
version-bearing model names. Runtime owns the catalog and per-model effort data;
see the [capture and projection record](../../../cats-runtime/docs/research/2026-09-16-claude-model-picker-refresh.md).

Desktop's offline fallback now contains Opus 5 with 1M context, Fable 5.1,
Sonnet 5, and Haiku 4.5, in that order, with Opus marked default. Live catalog
labels still take precedence. The default marker is separate display metadata.

The operator allows Cats to standardize only the parenthesized default marker.
Shared model/effort selectors use lowercase ` (default)` across providers and
backends, preserving every other part of the label. An explicit false default
flag removes a stale marker; a true flag produces one lowercase marker. With no
flag, an existing `(Default)` or `(DEFAULT)` becomes `(default)` without changing
whether the label carries a marker.

Existing selection support consumes Runtime's per-entry High default for Opus,
Fable, and Sonnet; Haiku has no effort options. No execution token or shared
catalog contract changes are required.

Validation: `npm run typecheck` (including mobile), `build:server`, and `build:test-ui`
passed. The six focused provider catalog, selection, mounted selector/default,
label-persistence, and label-registry files passed all 68 tests. Total command time
was 266.6s (tests 11.4s). An isolated check passed the actual refreshed Runtime advanced
catalog into Desktop's normalizer, label formatter, and per-entry default functions;
it confirmed all four labels, High defaults, Haiku's empty controls, and matching
fallback rows. Mixed-case default markers normalize without changing model-name case.

Installed Desktop binaries were not exercised during these focused checks.
The operator subsequently authorized auto-merge PRs and a 0.2.8 unsigned preview
with Runtime 0.1.23. The release preparation integrates the newer selected-provider
bootstrap changes from `main` and runs full precommit gates before publication.

The first integrated `npm test` completed all typecheck/build gates, then reported
4,566 passing tests, 5 skips, and 5 failed assertions (864.5s total; tests 608.5s).
All five failures expected the old static `Opus 5 (1M context)` label in execution
chips and audience participants. Those two consumer test files now expect the
requested `Opus 5 with 1M context` label. Independent runtime-response fixtures
keep their deliberately supplied labels. No production-code correction was needed.

After rebuilding test bundles and verifying the corrected files (11 tests passed),
the full Node suite passed: 4,571 passed, 5 skipped, zero failures (568.3s).
The corrected test typecheck passed; the already-passing server/host builds remain valid.
The preview packages Runtime 0.1.23 at merge commit
`46982a34d6964d2eee804fb60a4274ab382ea8ff` (Runtime PR #49). npm publication succeeded,
and the actual registry tarball was checked for the refreshed Claude catalog.
