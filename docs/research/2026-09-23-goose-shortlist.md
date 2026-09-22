# Goose fixed Off shortlist

Date: 2026-09-23. Scope: Desktop Goose model fallback and selection consumers.

The operator selected six ChatGPT Codex models on Goose 1.51.0, all fixed Thinking
Off, in this order: gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.6, gpt-5.5,
gpt-5.4. Desktop preserves those lowercase labels with ` — Off`, selects the first
row initially without claiming a provider default, and retains custom input.
Runtime owns provider routing and fixed Off execution; the picker sends the
provider-qualified base ID and does not expose editable effort controls.

[Runtime evidence and execution mapping](../../../cats-runtime/docs/research/2026-09-23-goose-shortlist.md).
Goose's Off can mean the upstream model's lowest supported reasoning level; no
claim of universally disabling model reasoning is made.

Focused tests cover the six labels, first emitted selection, switching/reopening,
no default or effort selector, and custom-string preservation. Exact old-ID search
found only the replaced Goose fallback rows; packaging tests use independent
curated fixtures. Validation results are recorded below.


## Validation

- `npm run build:server`: passed.
- `npm run build:test-ui`: passed; log `%TEMP%/cats-goose-catalog/platform-build-ui.log`.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.test.json`: passed.
- `node --test --test-isolation=none` on provider-catalog, provider-selection,
  execution-label, provider-model-fields, provider-model-defaults,
  provider-model-fields-label-persist and audience-participant-builder: **87 passed**,
  30.75s; log `%TEMP%/cats-goose-catalog/platform-tests.log`.
- `git diff --check`: passed. Build/typecheck elapsed times were not captured.

These are focused consumer checks, not the full suite or a packaged Desktop smoke.
Runtime's matching personal Goose catalog has been backed up and synchronized with
operator authorization. The operator subsequently authorized commit, PR, auto-merge
and branch cleanup after merge; no version bump or publication is included.
