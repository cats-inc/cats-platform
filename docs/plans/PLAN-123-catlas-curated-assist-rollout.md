# PLAN-123: Catlas curated assist rollout

Status: Implemented; scoped validation passed, 2026-10-27.
Governing documents: [ADR-140](../decisions/140-let-catlas-curate-assist-content-and-titles-through-host-validated-output.md)
/ [SPEC-131](../specs/SPEC-131-catlas-curated-assist-and-conversation-titles.md).

1. Shared action-discriminated chips, greeting pools and protected owner-config migration.
2. Bounded snapshots, isolated prompt/navigation calls, validation, atomic units and receipts.
3. Conversation title attempts with compare-and-set and manual rename protection.
4. Chat and Lobby integration, then Code and Work generation, navigation and feedback.
5. Targeted storage/runtime/renderer/consumer checks, isolated Desktop smoke, evaluator updates.

Implementation choices: use the existing read-only sandbox posture, retain generated state
when Catlas is dismissed, and start with SPEC-131 constants. The owner subsequently
selected a 0.11.1 bump, auto-merge PR and Desktop standard preview on 2026-10-27.
Unknown-origin old planning records remain navigation-only. Known external provenance must
survive unlinking. All tests use temporary or in-memory profiles; never write to owner state.

All five slices are implemented. Prompt and navigation partitions retain their
own last-good state. Feedback persists only basis IDs, event types and timestamps;
an accepted prefill is recorded after the first-message acknowledgement, even if
the recommendation list was refreshed while the owner edited the draft. Titles
use durable bounded attempts and an atomic compare-and-set. Manual renames win.
Dismissal retains generated state for reactivation while rendering builtins and
preserved owner overrides. Data reset drains title/curation jobs and erases the
new generated files, signals and receipts.

## Validation

All checks use temporary/in-memory state or dedicated source-candidate profiles.
No owner profile or persisted owner workspace was changed.

- Server build, renderer/test TypeScript and `npm run mobile:typecheck` passed;
  the mobile boundary scan passed. `npm run build:test-ui` and `npm run build:web`
  passed. Vite retains its existing chunk-size/mixed-import warnings.
- 129 server cases passed: curation, titles, generated storage, config upgrade,
  composed read models, existing Code help, setup/reset, Core/task/graph and the
  existing Catlas evaluator. Migration tests cover exact backup bytes, restart,
  unknown/invalid preservation, backup failure, atomic replacement failure and
  post-replacement verification recovery, including old whitespace/non-expiring
  TTL behavior.
- 99 renderer cases passed: action-union chips, cross-product prefills, greeting
  pools/i18n, Chat/Code/Work draft entry copy, Code branch chips, helper visibility,
  starter suggestions and Lobby account-menu consumers.
- 20 additional affected boundary/consumer cases passed: renderer browser safety,
  draft side panels, composer dispatch/metadata and Work external binding.
- 29 REST/dispatch regression cases passed, including message retry, provider
  errors and cancellation after adding the background title hook.
- Three attention-evaluator tests passed: bounded fixtures, production inference
  and validators with fake Runtime, independent semantic-judgment evidence, and
  freezing under the unchanged 256 KiB limit without UI message catalogs.
  The separately frozen closure is 46,738 bytes with 61 recorded inputs and zero
  provider calls. Its evaluator digest is
  `5ddf2619c03f849071a731ba65b91f90c35ff4258293ba2bd65a4a04705d4fc3`.
- After removing unused old cache mutation APIs, server build and the 23 affected
  storage/read-model/curation cases passed again.
- The changed Markdown files have 1,115 valid local links; `git diff --check`
  passed.

These are scoped checks, not a full `npm test` or live-provider quality run.
The manual evaluator/fixtures are ready for live recommendation practice; actual
model relevance/ranking and packaged-release acceptance remain unverified.

## Isolated Windows Desktop smoke

Used the [source-candidate command](../deployment.md#source-candidate-command),
synthetic accounts/cats/project/messages and fixed fake Runtime envelopes.
Automatic live refresh was disabled in the test profile before launch; no model
messages were sent. Both candidates reported normal drain with exit code 0.

- `candidate-catlas-20261027-2`: Catlas off, Lobby and five builtin Chat chips;
  the pomodoro chip filled the composer and selected Code without creating a
  conversation. Screenshot `screenshot-1793058583298.png` records the prefill.
- `candidate-catlas-20261027-3`, launch
  `1a1f56e76ea3374f449b2f1b52de938af9373a0a3beb2774ee51def29b0e9366`:
  source digest `abf6dc50607860930d3d9510bf75ca0bb9b29b778f38d1b7abc536317e0116a4`,
  Runtime HEAD `5212fa59ee44fbee7eea0d85e7482933824ff775`.
  Checked generated plus builtin chips on Chat/Code/Work, greeting rotation,
  Work prefill without sending, Code open-chip navigation to a Work project,
  and a Lobby open-only row. Representative screenshots:
  `1793059256617`, `1793059307221`, `1793059598710`, `1793059616603`,
  `1793059633976`, `1793059693244` (all `screenshot-<id>.png`).
  Checked new-chat model chip, group draft model stack/popover, Parallel primary
  and secondary branches, direct-lane avatar with no helper row, ongoing group
  composer, transcript spacing/actions and sidebar overflow placement:
  screenshots `1793059747998`, `1793059767709`, `1793059811238`,
  `1793059864917`, `1793059893229`, `1793059934265`.
  Stack deletion gates also remain covered by targeted draft tests.

The candidate source snapshot predates the final config-only whitespace/TTL
compatibility fix and removal of unused old cache exports; those were verified
by the final server build and storage tests. No UI behavior changed afterward.
Receipts/screenshots remain private local candidate evidence, not tracked assets.

## Release boundary

The action-discriminated chip/greeting-pool JSON replaces the old assist response
shape. The owner explicitly selected **0.11.1**, overriding the earlier **0.12**
planning boundary for this Desktop preview; custom assist readers need updating.
Config v1 has a tested, lossless one-time upgrade. Public App SDK 1.9.0 is unchanged.
The release uses an auto-merge PR, then manual `desktop-release.yml` dispatch from
the merged source with tag `v0.11.1`, Runtime
`5212fa59ee44fbee7eea0d85e7482933824ff775` and `unsigned=false`. Usage 0.5.4 and
its exact lock hash remain unchanged. Standard trust is macOS signed + notarized,
Windows unsigned: no certificate, Linux n/a. Workflow results and download evidence
belong to the GitHub Release/Actions run; no post-publication tracking edit is needed.
Version preparation passed the tag/package/lock guard, server and Desktop host
builds, and 19 release-version/App SDK/packaged-App verification cases.
