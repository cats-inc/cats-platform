# Auggie 0.36.0 Desktop shortlist

The operator approved these six names, in order, plus custom model input:

- GPT-6 Astra
- GPT-5.6 Sol
- Claude Fable 5.1
- Claude Opus 5.5
- Grok 4.7
- Prism (Claude + GPT)

The shared Desktop fallback preserves those exact names and the CLI-observed executable IDs.
Prism uses `butler_a`; the displayed name must not become an execution token. The first entry
initializes the UI without a provider-default claim. No effort/context controls were supplied.

See Runtime's [evidence and implementation note](../../../cats-runtime/docs/research/2026-09-23-auggie-shortlist.md).
Existing custom input remains available. No installed Desktop interaction or inference was run.

Validation passed:

- `npm run build:server`, `npm run build:test-ui`, and direct
  `tsc --noEmit -p tsconfig.test.json` (exit 0).
- 85 tests across provider catalog/selection, execution labels, model fields, mounted defaults,
  label persistence and audience participants (7 files, 7.99 seconds), using
  `node --test --test-isolation=none`. Log: `%TEMP%/cats-auggie-platform-tests.log`.
- The mounted Auggie case checks the loaded six-plus-custom menu, emitted initial/model-switch
  selections, no default markers or effort control, exact Prism label and opaque ID, and reopening
  the saved selection. Selection tests also preserve a custom string through catalog refresh.
- Exact old-label searches leave unrelated provider and independent inline fixtures unchanged.
  Diff whitespace and the cross-repository evidence link pass.

These are focused checks; full CI and installed Desktop visual/inference verification were not run.
