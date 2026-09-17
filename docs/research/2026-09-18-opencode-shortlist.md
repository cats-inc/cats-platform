# OpenCode shortlist fallback

Updated 2026-09-18 for the operator's OpenCode 1.18.31 six-model selection.
Runtime owns the curated catalog and evidence; see
[Runtime's observation and ID mapping](../../../cats-runtime/docs/research/2026-09-18-opencode-shortlist.md).

Desktop's fallback now uses the same six exact labels and `opencode-go/` IDs in operator order:
Union Alpha Free, DeepSeek V4.1 Flash, Hy4 preview, GLM-5.3-Flash, Qwen3.8 Flash, MiniMax-M3.
Union Alpha Free's Go namespace was explicitly confirmed because enumeration also returned
an identically named entry under `opencode/`.

No row claims a provider default; the existing selector initializes to the first row.
No effort/context controls were supplied or added. Existing custom model-string input remains
available. Runtime's loaded menu and refresh use its existing curated shortlist contract.

Validation: npm run build:server passed; node --test --test-isolation=none
 tests/provider-selection.test.js tests/execution-label.test.js passed all 26 tests.
The initial sandboxed isolated Node runner failed with spawn EPERM before executing tests;
no-isolation mode completed without changing application behavior. Exact old-ID and bundled-example
consumer searches found only independent historical fixtures outside the updated fallback.
No installed Desktop visual smoke, version bump or publication was performed.
