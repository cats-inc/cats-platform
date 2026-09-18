# ClinePass six-model shortlist

Date: 2026-09-18.

The operator selected six fixed Medium combinations for Cline 3.0.62 / ClinePass.
Canonical evidence and execution scope live in
[Runtime's research note](../../../cats-runtime/docs/research/2026-09-18-cline-shortlist.md).

Desktop fallback offers GLM-5.3, Kimi K3, Qwen3.8 Max, DeepSeek V4 Pro,
MiniMax-M3 and MiMo-V2.5-Pro, each labeled with Medium. Qwen's friendlier display
name is an explicit operator-approved exception to ClinePass's raw-ID label.
GLM is the first UI choice; no provider default is claimed. Custom input remains
available and preserves exact model strings across catalog refresh.

Runtime owns explicit ClinePass routing and the fixed effort; Desktop submits the
selected entry and does not add an editable effort control.

Validation: server build, renderer/test TypeScript checks and UI test bundle passed.
91 focused tests passed: 35 catalog/selection/execution-label tests and 56
selector/defaults/label-persistence/audience/workspace tests. Packaged Desktop was
not visually tested.
