# PLAN-108: Conversation navigation cache

Status: Implemented
Date: 2026-09-18
Scope: cats-platform renderer navigation and channel subscription projection
Authorization: User requested implementation and verification of the proposed cache.
Governing contracts: ADR-075, SPEC-076, SPEC-052 execution-target isolation.

## Delivery

- [x] Narrow server channel projection; preserve canonical repairs and compare groups.
- [x] Scope/channel-keyed bounded memory cache, immediate warm render, immediate
      cold subscription, route-owned selection and stale-response guards.
- [x] Background serialized/coalesced selection persistence with automatic retry.
- [x] Conversation-specific draft and scroll retention, deletion and reset cleanup.
- [x] Targeted server/renderer regression checks and affected build/type checks.
- [x] Isolated browser smoke and timing evidence, including shell/write delays.
- [x] Independent review and regression fixes, including retryable server closes.

## Implementation

- Existing QueryClient holds at most 24 channel projections, with a 30-minute
  `gcTime`. No new service or persistent cache was added. Unsent composer drafts
  are retained separately, so projection eviction cannot silently discard them.
- The route selects visible content synchronously. A cold route immediately
  subscribes to its channel; warm routes render the retained projection while
  that subscription refreshes it. Selection writes coalesce in the background.
- Channel projection reads/repairs the channel directly without calling Runtime
  or assembling the complete app shell. Missing channels and transient read
  failures have separate close/retry semantics.
- Optimistic sends stay outside retained server projections. Delayed callbacks
  cannot overwrite another route/scope or repopulate state after an auth reset.

## Validation evidence

All fixtures used memory stores or isolated temporary directories. No writes to
the user's persisted profile, provider execution, version bump or release.

### Targeted checks

- First affected-consumer batch: 137 passing tests (cache, scroll, subscription,
  composer/send seams, app-shell merge, architecture boundaries and navigation).
- Final navigation/recovery batch: 122 passing tests, including the actual first
  send failure path, A/B/C/D execution-target isolation, scope/epoch resets,
  cross-surface handoff, channel read repair, and HTTP 503/recovery/deletion.
- Selection API integration: 3 passing tests, confirming selection does not wake
  Runtime sessions or overwrite wake requests.
- Artifact subscription and avatar-style consumers: 12 passing tests.
- Server build, renderer/test TypeScript checks, and web production build passed.
  These are overlapping focused batches, not a full local test-suite claim.

### Rendered verification

Run `node scripts/testing/conversation-navigation-smoke.mjs` to build the actual
Chat renderer in hidden Electron with a synthetic HTTP/EventSource fixture.
It creates an isolated Electron profile, then removes that profile on exit.
Results/screenshots are written to `build/conversation-navigation-smoke/`.

- Full app-shell requests delayed by 60 seconds and preference writes by 2 seconds.
  Warm channel subscription snapshots delayed by 2 seconds.
- Click-to-correct-content measurement includes two animation frames. The final
  run measured warm switches at 35–62 ms and cold fixture reads at 94–105 ms.
  These short synthetic transcripts establish absence of the delayed request
  dependency, not performance bounds for large real histories.
- Background reply retention, per-conversation drafts after New Chat, network
  reconnect and retryable server-close recovery passed with no renderer errors.
- New Chat, Group/Parallel drafts, ongoing group and direct lane rendering were
  exercised; inspected screenshots cover composer presentation, transcript
  spacing and the unobscured sidebar overflow menu.

### Delivery gates

The PR must pass the full `validate` and `nodejs (24)` CI checks before automatic
squash merge. The PR records the authoritative CI and merge result; final delivery
must confirm merged remote/local branch cleanup and a clean, updated `main`.
No preview publication or version change is authorized by this task.
