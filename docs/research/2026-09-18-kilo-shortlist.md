# Kilo Code 7.7.3 shortlist

Last updated: 2026-09-18.

The operator selected six Kilo entries in order, with fixed Thinking for Seed and Nano Banana.
Runtime owns the raw IDs, fixed variant resolution and native execution. See the shared-workspace
[Runtime evidence note](../../../cats-runtime/docs/research/2026-09-18-kilo-shortlist.md).

Desktop fallback names match the supplied spelling, punctuation and Thinking suffixes. The first
entry initializes the menu without a default label; all six remain available with custom input.
Existing selector components are reused. No image-generation UI or additional option controls are added.

Validation: server TypeScript build passes; 27 selection/execution-label tests pass. No installed
Desktop visual or live inference claim. Existing OpenCode work remains intact.

PR integration validation: rebased onto main at `1701d53e` (picker recovery changes), then
rebuilt server and UI test artifacts. All 76 selected model/default/label/recovery and
execution-label tests passed; full CI remains the merge gate.
