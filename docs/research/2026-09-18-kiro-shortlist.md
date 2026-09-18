# Kiro CLI 2.22.0 Desktop shortlist

The operator selected six Kiro models, in order: `claude-opus-5`,
`claude-sonnet-5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`,
`claude-haiku-4.5`. Preserve these exact lower-case IDs as display names.

The shared Desktop fallback replaces the previous three entries and their
default claim. First-row initialization chooses `claude-opus-5`; no entry has
a provider-default marker. Existing custom input remains available. The supplied
list has no effort or context metadata, so no such controls are added.

Runtime owns the curated shortlist, normalizer, Playground and execution path;
see its [evidence and implementation note](../../../cats-runtime/docs/research/2026-09-18-kiro-shortlist.md).
The version is operator-reported and the list is a Cats shortlist, not a complete
account catalog. No authentication or inference was performed.

Validation: `npm run build:server`, `npm run build:test-ui` and direct
`tsc --noEmit -p tsconfig.test.json` pass. The catalog, selection and execution
label tests pass (36); model fields/defaults/label persistence and audience
participant tests pass (44). Exact old-ID and bundled-example searches leave
independent historical fixtures and packaging-path assertions unchanged.
Diff whitespace and the evidence link pass. These are focused checks, not a
full-suite or installed Desktop visual claim. Packaging and a paid end-to-end
Kiro turn are outside this update.
