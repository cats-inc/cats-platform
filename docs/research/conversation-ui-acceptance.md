# Conversation renderer implementation record

2026-10-30, PLAN-127 Phase 4. Implemented private candidate; no application bump,
package publication, installer release, repository move or Hub delivery.

## Pins and boundary

Desktop baseline `157652085b39a0be0f68190e532e35df50208454`; Bot baseline
`ce4ff774a852c001b9337b71f3dc6f0d37ad62ba`. Both consumers pin
`platform-ui-web-0.1.0-957e4717942c.tgz` with lockfile integrity. SHA256:
`363e784f2d0571522006797b01772be55384ecec4ae0bccb254eabd7b6783501`.
The producer lives in `packages/platform-ui-web`; `npm run pack:conversation-ui`
records its normalized source digest and packs the same artifact for both repos.

Public entries are React components, `contracts`, `conversation.css` and package
metadata. The contracts entry has no React, Electron, Node or service dependency.
Desktop's bubble/body/actions/Markdown and text/tool/status grouping are extracted,
not independently reimplemented in Bot. Product adapters retain speaker, locale,
clipboard, mentions, attachments, decisions and all execution authority.

## Durable data and compatibility

Desktop keeps sanitized cumulative blocks in additive Core status metadata and
the terminal assistant message. A checkpoint has null content and cannot prove
execution completion or enter a prompt. Reconciliation is execution-scoped,
deduplicates raw/live/final content and rejects older cumulative SSE prefixes.
Final text/photo/directive transforms preserve tool input and error identity;
textless replies retain the existing canonical fallback. Failed checkpoint writes
do not abort other parallel targets.

Bot keeps existing JSONL and `transcript()` unchanged. Its version-1 presentation
sidecar adds `conversationTranscript()` and `turn.presentation`. Explicit sequence
coverage and terminal binding prevent duplicate tools/replies. Validation, valid
backup preservation, atomic replacement, corrupt-primary recovery, future-version
refusal and write failure are tested. Old text-only history stays text-only.
Rollback may ignore the sidecar, but must not delete or downgrade it. A subsequent
raw final message supersedes an older unbound projection. No profile migration is
required. Desktop-control data remains redacted before persistence/display.

## Evidence and completion

- Bot typecheck/build and full suite: **235 passed**. Final artifact boundary and
  persistence rerun: **14 passed**.
- Desktop full typecheck (including Mobile), server/host/renderer builds passed.
  Final affected regression set: **95 passed**, including grouping, final text,
  scoped persistence, write failure, older SSE, localized progress and dependency
  boundaries. Independent source review found no remaining blockers.
- The broad Desktop run executed 6,151 tests: 6,130 passed, 10 failed, 11 skipped.
  Extraction-related failures were fixed and rerun in the affected set. The
  companion route and Windows POSIX file-mode failures, and the no-repo attachment
  route failure, also reproduce on the exact frozen baseline. This is not a claim
  that the full suite is green. Final root-package validation passed all 4 tests,
  including a source-independent installed consumer. The full hosted Desktop
  [CI run](https://github.com/cats-inc/cats-platform/actions/runs/40925836421)
  subsequently passed on the unchanged implementation. No new test scope was added.
- Isolated actual Electron Desktop and Bot used private app/Runtime/provider/auth
  directories. Fixture messages traversed real Runtime streams. Original/extracted
  Desktop normal-width bubbles match; both use the same body typography. Desktop
  layered history survives reload; Bot survives reload/restart and separates two
  turns with the same tool ID.
- Actual Bot native Enter expansion, copy, approval resolution, cancellation and
  manual-scroll preservation passed. Desktop copy writes the expected fixture
  text. Existing interaction tests cover stale/wrong-conversation authority.
- Bot 260-pixel minimum and 340/480-pixel content lanes retain code/table scrolling
  and expanded localized tool content. Final-build Desktop captures at exactly
  340/480-pixel content widths confirm no body/tool horizontal overflow. Independent
  UI-6 review accepted the existing captures with no remaining blocker. Bot window
  chrome, avatar and timestamps are intentional product differences.

The conversation candidate's UI-1 through UI-6 checks are complete. PLAN-127's
broader extraction phases and any separately authorized publication remain open.
Bot's three-platform package/source contract is gated by its existing
[CI run](https://github.com/cats-inc/cats-bots/actions/runs/40925851983) and PR #59.

Retained actual-product captures: [Desktop before](conversation-ui/desktop-before.png),
[Desktop after](conversation-ui/desktop-after.png),
[Desktop 340](conversation-ui/desktop-340.png), [Desktop 480](conversation-ui/desktop-480.png),
[Bot 340](conversation-ui/bot-340.png), [Bot 480](conversation-ui/bot-480.png),
[Bot minimum](conversation-ui/bot-minimum.png).
