# Cursor fixed model presets

Desktop's fallback menu follows the six owner-approved Cursor CLI combinations, in order:

1. Cursor Grok 4.6 — Extra High Fast
2. Composer 2.5 — Fast
3. Claude Opus 5 — 300K High Thinking
4. GPT-5.6 Sol — 272K Medium
5. Gemini 3.8 Flash — High
6. Muse Spark 1.3 — 300K High

The owner clarified that commas in the supplied combinations only separated fields. Display
labels use spaces between parameters; the executable model strings remain unchanged.

These entries use complete parameterized Cursor model strings, retaining the specified
context and Fast values when sent to Runtime. The UI initializes from the first entry without
adding a default marker. Existing custom model input remains available, including on the
fallback menu. Each entry is one fixed combination with no separately adjustable controls.

Runtime owns the same curated shortlist and prevents live discovery or cached catalogs from
expanding it on refresh. Its evidence is recorded in the matching 2026-09-17 Cursor research
note and `cursor-2026.09.15-d2fe57e` fixtures. The installed CLI's account-resolved variant
strings were checked without running inference.

Validation: 25 provider-selection/execution-label tests and 43 selector/default/persistence/
audience tests passed. Server and test UI builds, renderer TypeScript, and test TypeScript
checks passed. No installed Desktop smoke test was performed.
