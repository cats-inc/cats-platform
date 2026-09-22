# Junie 26.9.21 Desktop shortlist

The operator approved five fixed combinations plus custom model input:

- Gemini 3.7 Flash — Medium (default)
- Claude Fable 5.1 — Low
- Gemini 3.8 Flash — Medium
- GPT-5.6-SOL — Low
- Grok 4.6 — Low

Preserve exact model spelling, including GPT-5.6-SOL. Only the explicit Default
marker becomes lowercase `(default)`. The shared Desktop fallback replaces the
old eleven models. Existing custom input remains available; no effort control is
shown because Runtime owns the fixed combinations and separate `--effort` argument.

See Runtime's [evidence and implementation note](../../../cats-runtime/docs/research/2026-09-23-junie-shortlist.md).
These are the complete intended Cats shortlist, not an upstream inventory or an
account-entitlement claim. No inference or installed Desktop interaction was performed.

Validation passed:

- `npm run build:server` and `npm run build:test-ui`.
- Direct `tsc --noEmit -p tsconfig.test.json`.
- 83 tests across provider catalog/selection, execution labels, model fields,
  mounted defaults, label persistence, and audience participants, using
  `node --test --test-isolation=none` with those seven files.
- Exact old-label searches leave independent inline envelope fixtures unchanged.
  Diff whitespace and the cross-repository evidence link pass.

The mounted Junie test checks the label after Runtime metadata loads, five choices
plus custom input, emitted initial/model-switch selections, no editable effort,
exact GPT-5.6-SOL spelling, and reopening the saved selection. These are focused
checks; full CI and installed Desktop visual/inference verification were not run.
