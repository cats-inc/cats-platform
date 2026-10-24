# 2026-10-24 provider catalog consumer validation

Scope: consume the refreshed sixteen configured CLI/channel catalogs from cats-runtime and
support its additive `auggie.reasoning_effort` binding in provider/model selectors. The owner
authorized the catalog removals and Junie spelling/default changes in one grouped confirmation.
No publication, version bump, personal override, or installed Desktop replacement was requested.

Runtime owns the single authored schema-2 factory and generated JSON. Platform's basic/advanced
normalizers, per-entry controls and model fields already consume that contract without a provider
allowlist. The change therefore adds a regression rather than a second table or a new selector
branch. The test uses synthetic unknown model IDs and levels: it renders the effort choices,
sends the second selected value in modelSelection.controls, and removes the control when switching
to a model without effort. Historical UI fixtures retain their old model labels/counts.

Runtime's detailed evidence is recorded in its
`docs/research/2026-10-24-sixteen-cli-catalog-refresh.md`. New counts are 12 Claude, 7 Codex,
5 Antigravity, 4 Grok, 3 Muse, 48 Cursor, 14 Copilot, 29 OpenCode Go, 336 Kilo gateway, 6 Goose
chatgpt_codex, 7 Pi openai-codex, 37 Auggie, 20 Junie JetBrains AI, 22 Kiro, 14 ClinePass and
51 Devin family/form entries. Custom strings remain available. Junie Eco is an independent
preference whose availability depends on model/effort; the owner chose evidence-only coverage.

## Validation

- 44 focused tests passed: the new Auggie component regression plus provider catalog client,
  helpers, normalization, selection and local informational projection cases.
- Test TypeScript checking passed. The nested worktree links the existing main-checkout mobile
  dependencies in an ignored location; an initial run without that link could not resolve two
  mobile modules. No dependency files changed.
- Platform server build passed. The isolated source Candidate also compiled Runtime, Platform
  server, Desktop host and renderer, then displayed the normal initial provider-selection screen.
  This is a source build/startup/UI check, not a provider execution or installed-release test.
- Candidate catalog sourceDigest matched the updated Runtime factory:
  `4f26605237482c1c911cb8b5a887ea4bf5288bf0f1050126c97ec5cbb1329c81`.
- Candidate launch ID: `9a8c8f2bab1d2bc4de235454c2eaaa9aa3da1fdf8d415917694e164ea3bddc5f`.
  Its private source/build receipt and screenshot are retained outside both checkouts under
  `catalog-candidate-20261024`. The candidate reported drained, exitCode 0, with both sidecars
  stopped; no user profile was copied and no conversation/task was created.
- A separate isolated Runtime check passed for all sixteen actual factory basic/advanced
  responses through these Platform normalizers: 615 entry labels, per-entry controls and shared
  revisions matched. A fresh headless Playground browser passed all 615 entry choices, Auggie
  effort switching, no-effort rows and custom input, blocking every non-GET request. No user
  conversations or tasks were created. Runtime's research note records methods and limits.

Independent review found no adapter/helper defect; stale factory-backed Runtime assertions were
updated, while frozen migration/discovery fixtures were retained. No full-suite pass is claimed.
