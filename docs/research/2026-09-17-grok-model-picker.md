# Grok Build 1.0.34 picker

The operator supplied the Grok model and effort menus and confirmed that the
three-effort screenshot belongs to Grok 4.5. Runtime retains the evidence and
CLI token mapping in its [refresh note](../../../cats-runtime/docs/research/2026-09-17-grok-model-picker-refresh.md).

Desktop fallback now lists `Grok 4.6` then `Grok 4.5`, without default flags.
The effort picker consumes Runtime's exact labels and per-model applicability:
4.6 starts with Extra High Effort; 4.5 starts with High Effort. No synthetic
Default option or `(active)` marker appears. Initialization is persisted into
the selection so execution receives the displayed effort, while provider default
metadata remains unchanged. Saved explicit effort survives reload.

Validation: server and UI-test builds passed. The focused catalog, selection,
execution-label, model-defaults, model-fields, label-persistence, and audience
participant tests passed: 74 tests in 33.49 seconds. Renderer and test TypeScript
checks passed (`tsc --noEmit -p tsconfig.json` and `tsc --noEmit -p tsconfig.test.json`);
the server build already checked the affected server/shared inputs. Installed Desktop and live Grok execution
are outside this verification; no version bump or release requested.

Last updated: 2026-09-17.
