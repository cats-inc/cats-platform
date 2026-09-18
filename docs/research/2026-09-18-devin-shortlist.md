# Devin fixed-combination fallback

Updated 2026-09-18 from the operator's complete six-entry Cats shortlist for Devin 3000.10.31.
Runtime owns the [mapping and ACP execution evidence](../../../cats-runtime/docs/research/2026-09-18-devin-shortlist.md).
The operator separately authorized the execution change and personal curated-file addition.

Desktop fallback labels now match Runtime and Playground: Adaptive, Claude Fable 5.1 — Medium,
Gemini 3.8 Flash — Medium, GPT-6 Astra — Medium, Grok 4.6 — Medium, and Nemotron 3 Ultra — High.
Effort is encoded in each raw model UID. The obsolete `devin-default` placeholder is removed.
An empty selection starts at Adaptive without a default badge. Existing custom model-string input
and saved custom selections remain supported. The target remains agent/acp; no new backend or UI
parameter control is introduced.

Focused catalog, selection and execution-label tests pass (34 tests), covering the exact fallback
list, no default claims, first-item selection and custom-value retention. Two additional Devin API
and workspace-target tests pass (36 total); Adaptive now survives reconciliation as a real model.
Server build, UI test-artifact build and renderer TypeScript check pass. Packaged Desktop visual
testing and live inference were not performed.
