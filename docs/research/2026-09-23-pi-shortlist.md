# Pi subscription model shortlist

Date: 2026-09-23. Scope: Desktop Pi fallback and model selection consumers.

The operator selected six Pi 0.87.1 models with fixed thinking `medium`, in order:
gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra, gpt-6-astra, gpt-6-luna, gpt-6-sol.
Every label preserves the explicitly requested `[openai-codex]` suffix, followed
by ` — medium`. The subscription provider remains visible when selecting a model.

The picker initializes the first entry without a default marker and retains
custom input. Runtime owns separate provider/model/thinking arguments; Desktop
sends the provider-qualified ID and exposes no editable thinking control.

[Runtime evidence and execution mapping](../../../cats-runtime/docs/research/2026-09-23-pi-shortlist.md).

Validation covers all six visible subscription labels, first emitted selection,
switching/reopening and custom input preservation. Exact old-ID searches found
only the Pi fallback row in Platform. Validation results are recorded below.

- Passed server, test-UI and host builds, plus TypeScript checking with
  `tsconfig.test.json`.
- Passed 59 focused provider catalog, selector, mounted defaults and Desktop
  selection tests. Seven initial failures in the two host selection test files
  used stale host artifacts; rebuilding and rerunning those files passed all 11
  tests without source changes. Other passing checks were reused.
- No installed Desktop binary or real Pi inference session was launched.
