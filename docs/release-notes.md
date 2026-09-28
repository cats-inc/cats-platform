# Release Notes

> Operator-facing behavior changes and migration notes for Cats Platform.

## 2026-09-28 — Desktop 0.5.13 standard preview (prepared)

- Packages all Platform changes through `b0c503bb877b20c341d3ba3f04c0eb4d44248dd6`,
  including App SDK 1.3 image operations and recovery of retained Grok images after
  a home-relative session-path collection failure.
- Pins Runtime 0.3.4 source to `9a35b7f4db77ed82715b229fb629f84f0115bfc5` on every OS.
  This includes the other delivery tracks' native-session path matching, provider-reported
  served models/run logs, Copilot discovered-session model fields and Kiro v1 engine fix,
  alongside bounded image generation and source-path recovery.
- Compatible Desktop patch; no persisted schema conversion or profile reset. Runtime,
  Platform npm, launcher and App publication are not part of this release.
- Uses the standard preview signing profile (`unsigned=false`); actual per-platform
  trust and published asset verification will be recorded after the workflow completes.
  From published standard preview 0.5.10, the expected update path is macOS signed to
  signed with the same Developer ID team, Windows unsigned to unsigned (no certificate),
  and Linux n/a. Final trust must be confirmed from this build; no new installed-upgrade
  acceptance is claimed by version preparation.
- The published bundle retains the exact Usage 0.4.0 archive. Studio 0.1.0 was selected
  only by the preceding local installer, and is not in the published default App lock.
  App/SDK/market architecture and Studio distribution policy are deferred to the next
  discussion; this release changes no App selection or installation policy.

Validation before version preparation: Platform CI for `b0c503bb` and Runtime release
preflight for `9a35b7f4` passed. Release-candidate CI and Desktop publication are pending.

## 2026-09-28 — Local Desktop 0.5.12 / Studio image collection fix

- Resolves Grok's home-relative session directory before validating generated image paths.
- Studio can recover a prior `invalid_image_source` result from its existing validated
  image and matching session evidence. The original Runtime receipt is backed up; the
  existing Core task/run is retained. Recovery never submits another generation.
- Local installer update only. Studio 0.1.0, Usage 0.4.0 and SDK 1.3.0 remain unchanged.
  No persisted schema changes or public release are involved.

## 2026-09-28 — Local Desktop 0.5.11 / Studio slice

- Adds compatible App SDK 1.3 image jobs, cancellation, retained image preview and
  download through Runtime. Studio 0.1.0 is a separate Home App beside Usage 0.4.0.
- Local installer only; no public Desktop/App tag, release or npm publication.
  The canonical published App selection remains unchanged. The local selection
  pins the existing published Usage archive and the new Studio archive.
- Existing Core/profile formats are preserved. Studio adds Core task/run/artifact
  metadata and app-owned image files; no reset or migration is required.
- Native Grok only, one square image per explicit submission, no automatic retries.
  Editing/video and install/remove UX are deferred. Acceptance uses isolated
  fixtures and the earlier single live-image spike; no new paid Grok call was made.

See [PLAN-111](plans/PLAN-111-app-image-generation.md) for installation evidence.

Newest dates go first. Each dated section should include behavior changes,
migration steps, and any deprecations introduced in that release.

Use this shape for new entries:

```md
## YYYY-MM-DD

### Change title

Behavior change:

Migration steps:

Deprecations:
```

## 2026-09-27 (0.5.7 preview, standard profile — publication)

Behavior change:

- Source-development agents can operate their isolated Cats Candidate through
  screenshot-bound click, text, key and scroll commands. Every action binds the
  candidate instance and a recent single-use frame, with DPI/zoom conversion and
  invalidation on navigation, resize or shutdown. Input stays in that candidate's
  main web window; it exposes no arbitrary script or OS-wide input executor.
- An input receipt confirms dispatch only. The agent must inspect a new screenshot
  to verify the effect, including after an error/timeout that may follow partial
  input. Native Windows validation covered all four actions at 125% zoom and
  actual candidate setup navigation/text entry, followed by owned-process cleanup.
- These are opt-in source-development commands. Normal installed Desktop launches
  have no candidate controller. Existing user-facing behavior is otherwise unchanged.

Migration steps:

No existing data conversion is required. This compatible patch targets Desktop
only; no npm package was published. Runtime 0.3.1 remains pinned to
`5396566012c9cf7783bf05203806df8c849e348b`, the same source as Desktop 0.5.6.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`;
its `catsPlatform` range `^0.5.0` includes 0.5.7.

The standard profile was used: verified platform trust is macOS signed +
notarized, Windows unsigned: no certificate, and Linux n/a. Self-update from
standard-profile 0.5.6 is expected to remain supported on Windows/Linux and on
macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.6 build log.
No new installed-update acceptance is claimed. The existing Windows voice input
issue remains outside this change.

Deprecations:

None.

Release verification:

The functional source `c41fa3b772ec3bd8c3c639e00a65a595abdb331e` passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36291374832):
5,155 passed, 59 skipped, zero failures. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36288093804).
The [version-candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36296685016)
also passed: 5,155 passed, 59 skipped, zero failures.

The [0.5.7 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.7)
was published from Platform `fbd4093cf5abe4ada4962049cc180477f7abe9ae`.
All seven [Desktop workflow jobs](https://github.com/cats-inc/cats-platform/actions/runs/36296711664)
passed with `unsigned=false`; all three builds recorded the pinned Runtime SHA.
The workflow-created tag resolves to that exact Platform commit.

- All ten assets are published; the release is a prerelease and appears first
  in the release feed. All three update metadata files report 0.5.7 and reference
  published assets with matching names and sizes. The metadata files' SHA-256
  digests match GitHub's asset records.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded on the build runner.
- Windows: the downloaded 145,042,055-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and SHA-256 matches GitHub's
  asset digest `78ceef7ac2bd15b06ee58eff78bdac6699c12bd0218f344efe8e8b49c0f7e57b`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No installer was executed and no installed user profile was changed.

## 2026-09-27 (0.5.6 preview, standard profile — publication)

Behavior change:

- Right-clicking in Desktop opens a native edit menu: Copy for selected text,
  and the full edit set in editable fields. Elsewhere no menu appears.
- Message copy buttons work in Desktop. The renderer now allows clipboard
  writes; clipboard reads stay denied.
- Conversation diagnostics reports also include retained UI exceptions from the
  collecting window: memory-only, at most 20 per window since page load and eight
  per report, scrubbed of common secrets and URL queries, and cleared on reload.
  They describe the page at failure time, not a proven cause.
- The collapsed Catlas "help me get started" chip is centered on the new Code
  conversation page.
- Source checkouts gain `npm run desktop:candidate` to build and open an
  independent Cats Candidate with empty private state from a development
  conversation. It is a development command; installed Desktop behavior does not
  change.
- The bundled Runtime lists GitHub Copilot's full picker for a Copilot Pro
  account (20 rows) with per-row reasoning, context and Auto tier controls, and
  Pi's full `openai-codex` channel (8 rows) with per-model thinking levels that
  default to medium. Rows without a marked default start at their first value.

Known issue:

The Windows voice input issue recorded under 0.5.5 is not fixed; only its setup
guidance changed.

Migration steps:

No existing data conversion is required.

This compatible patch publishes Desktop only; no npm package was published.
Runtime 0.3.1 is pinned to `5396566012c9cf7783bf05203806df8c849e348b`.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`; its
`catsPlatform` range `^0.5.0` includes 0.5.6.

The standard signing profile was used: verified platform trust is macOS
signed + notarized, Windows unsigned: no certificate, and Linux n/a. Self-update
from standard-profile 0.5.5 is expected to remain supported on Windows/Linux
and on macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.5 build log. No new installed-update acceptance is claimed.

Deprecations:

None.

Release verification:

Platform `9188a1104ce1f46e4f802b59e99c210a2f69987f` passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36285726614).
The later source candidate command (`dfb7c4c1`) is covered by the version
candidate's CI. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36288093804).
The [version candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36288365820)
passed with 5,148 tests passed, 59 skipped and zero failures.

The [0.5.6 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.6)
was published from Platform `27489f3668c243629bfd2b94a887a4f652491c54`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36288800513)
passed all seven jobs with `unsigned=false`; all three OS builds recorded the
same pinned Runtime SHA. The workflow created the matching preview tag.

- All ten assets are published, the release is a prerelease, and it appears first
  in the release feed. The three update metadata files report 0.5.6 and reference
  published assets with matching names and sizes.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded. This is build-runner
  evidence, not a new published-DMG inspection on a Mac.
- Windows: the downloaded 145,036,951-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and its SHA-256 matches the
  GitHub asset digest
  `d7ac4d125e278c137868c1c846f6104ee4504203e05ed8ed38b14b692e7c3b9c`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No provider inference or installed user-profile writes were performed.

## 2026-09-27 (0.5.5 preview, standard profile — publication)

Behavior change:

- The Chat and Code composers can attach a conversation diagnostics report. An
  owner or administrator chooses the conversation, previews the report, then
  attaches it as a removable text file through the normal upload and send flow.
  The report names the Platform/Runtime versions, the selected conversation and
  working directory, up to eight linked sessions, recent system errors and, when
  enabled, conversation live-trace summaries. It excludes raw provider logs,
  transcripts, tool arguments, arbitrary files and browser console output, and
  scrubs common credentials. Collecting it makes no provider request and writes
  no product data.
- The bundled Runtime includes Auggie's full 34-row 0.36.0 picker catalog in
  picker order. Opus 4.8 is the only default, because the picker marks it; no
  row has an effort control.
- The mobile client source now renders agent replies as markdown. The mobile
  client ships separately through the app stores, so this Desktop release does
  not change it.

Migration steps:

No existing data conversion is required. The diagnostics endpoint is read-only.

This compatible patch publishes Desktop only; no npm package was published.
Runtime 0.3.1 is pinned to `3aae1a48e9d85d3d4cb903bb82cc1408882e69ed`.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`; its
`catsPlatform` range `^0.5.0` includes 0.5.5.

The standard signing profile was used: verified platform trust is macOS
signed + notarized, Windows unsigned: no certificate, and Linux n/a. Self-update
from standard-profile 0.5.4 is expected to remain supported on Windows/Linux
and on macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.4 build log. No new installed-update acceptance is claimed.

Deprecations:

None.

Release verification:

Platform `0791d2797de9f10f10627c7d52952edb8c5a283e` passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36276722578).
Two earlier main runs failed on the new diagnostics dialog test until
`ad7f9b13` bound its mock to the active document. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36277158825).
The [version candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36277477096)
passed with 5,136 tests passed, 59 skipped and zero failures.

The [0.5.5 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.5)
was published from Platform `d0da490abda2ab2a647be3071e5347a67c149faa`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36277916959)
passed all seven jobs with `unsigned=false`; all three OS builds recorded the
same pinned Runtime SHA. The workflow created the matching preview tag.

- All ten assets are published, the release is a prerelease, and it appears first
  in the release feed. The three update metadata files report 0.5.5 and reference
  published assets with matching names and sizes.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded. This is build-runner
  evidence, not a new published-DMG inspection on a Mac.
- Windows: the downloaded 145,028,094-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and its SHA-256 matches the
  GitHub asset digest
  `b0bc94f200027c09997d2dea663f5b5a2e8d3510c9762522dcd3731a4ca891b7`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No provider inference or installed user-profile writes were performed.

Post-publication known issue (reported 2026-09-27): On an installed Windows
0.5.5 Desktop app, the composer microphone showed "Voice input is not available
on this device" while Windows Online speech recognition was off. Enabling that
setting allowed the button to enter its red listening state, but no spoken text
appeared in the composer. The missing-transcript cause is still unconfirmed;
the listening indicator alone does not establish recognition or insertion.
The Windows helper's predefined dictation grammar requires Microsoft online
speech; installing a local speech pack does not make that grammar offline.
See [Composer Voice Input Permissions](./setup-guide.md#composer-voice-input-permissions).

## 2026-09-27 (0.5.4 preview, standard profile — publication)

Behavior change:

- Agent replies in Chat, Work and Code transcripts, including live streamed text,
  render as markdown: emphasis, lists, headings, quotes, code blocks, tables,
  task lists and `[text](url)` links. Single newlines stay line breaks. User,
  system and orchestrator messages remain plain text, and mobile still shows
  every message as plain text.
- Only http(s) links in agent replies are clickable and open in the system
  browser. Other targets, such as local file paths, show as inert text with the
  target as a tooltip. Raw HTML is shown as text; remote images appear as links
  instead of loading.
- Bare URLs and internal routes end at CJK and full-width punctuation, so text
  such as `)、` directly after a URL no longer becomes part of the link.
- The bundled Runtime includes Kiro's full 20-row 2.24.1 picker catalog. The ten
  rows with an effort control send it as `--effort`; with no declared default,
  selection starts at each row's first value and overrides Kiro's saved model
  defaults.

Migration steps:

No existing data conversion is required. Stored messages are unchanged; only
their display changes.

This compatible patch publishes Desktop only; no npm package was published.
Runtime 0.3.1 is pinned to `65e05d5af90182bb08b23a3d8210667abe3fd426`.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`; its
`catsPlatform` range `^0.5.0` includes 0.5.4.

The standard signing profile was used: verified platform trust is macOS
signed + notarized, Windows unsigned: no certificate, and Linux n/a. Self-update
from standard-profile 0.5.3 is expected to remain supported on Windows/Linux
and on macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.3 build log. No new installed-update acceptance is claimed.

Deprecations:

None.

Release verification:

The markdown change passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36272436338)
at `386fd2ac0a122cf2e7ebe551f8de9e8ad0c68717`. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36272184397).
The [version candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36273623470)
passed with 5,123 tests passed, 59 skipped and zero failures.

The [0.5.4 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.4)
was published from Platform `bc967980058a4a81d9258ddf44caea2ec9527cba`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36274109738)
passed all seven jobs with `unsigned=false`; all three OS builds recorded the
same pinned Runtime SHA. The workflow created the matching preview tag.

- All ten assets are published, the release is a prerelease, and it appears first
  in the release feed. The three update metadata files report 0.5.4 and reference
  published assets with matching names and sizes.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded. This is build-runner
  evidence, not a new published-DMG inspection on a Mac.
- Windows: the downloaded 145,018,283-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and its SHA-256 matches the
  GitHub asset digest
  `ba2cf7e6b98e390e0113e209dfbbbcd911394573244ea0d0bb19bc6d2401e210`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No provider inference or installed user-profile writes were performed.

## 2026-09-27 (0.5.3 preview, standard profile — publication)

Behavior change:

- Code > Artifacts > Contribute / adopt knowledge opens the minimal bilingual
  Catlas/Orchestrator editor. Save a draft, compare it, explicitly confirm review,
  then adopt locally. Revoke restores bundled content. Saving alone changes no
  consumer behavior, and adopted text remains visibly unverified. Updated
  bundles suspend stale overrides; applicability and permissions stay fixed.
- Knowledge artifact previews display bilingual draft contents as plain text.
  Page controls use the shared English and Traditional Chinese translations.
- Model controls without a declared default select their first option. The
  bundled Runtime includes Junie's full 15-model catalog and per-model effort
  choices from the accepted 26.9.22 picker capture.

Migration steps:

No existing data conversion is required. Manual contributions use an additive,
profile-local store with validation, backup and atomic replacement. The page
does not invoke a model or automatically promote knowledge into shipped bundles.

This compatible patch publishes Desktop only; no npm package was published.
Runtime 0.3.1 is pinned to `8cdde2906b5c7175672664dd2fabbe8147555ced`.
Usage 0.4.0 retains SHA-256
`7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.

The standard signing profile was used: verified platform trust is macOS
signed + notarized, Windows unsigned: no certificate, and Linux n/a. Self-update
from standard-profile 0.5.2 is expected to remain supported on Windows/Linux
and on macOS with the same Developer ID team `97JBZ3MFX5` and signing certificate,
confirmed against the 0.5.2 build log. No new installed-update acceptance is claimed.

Deprecations:

None.

Release verification:

The feature and CI repair passed
[full Platform CI](https://github.com/cats-inc/cats-platform/actions/runs/36262402507)
at `182610f237c730d0ba0438453f055da2fec9601e`. The pinned Runtime passed its
[release preflight](https://github.com/cats-inc/cats-runtime/actions/runs/36235872728).
The [version candidate CI](https://github.com/cats-inc/cats-platform/actions/runs/36263941765)
passed with 5,102 tests passed, 59 skipped and zero failures.

The [0.5.3 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.3)
was published from Platform `c2864623010e7664dfa021c726ec010dec42ff3a`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36264530657)
passed all seven jobs with `unsigned=false`; all three OS builds recorded the
same pinned Runtime SHA. The workflow created the matching preview tag.

- All ten assets are published, the release is a prerelease, and it appears first
  in the release feed. The three update metadata files report 0.5.3 and reference
  published assets with matching names and sizes.
- macOS: the app and native helper passed signature verification; notarization,
  stapling validation and Gatekeeper assessment succeeded. This is build-runner
  evidence, not a new published-DMG inspection on a Mac.
- Windows: the downloaded 144,721,160-byte installer reports Authenticode
  `NotSigned`. Its SHA-512 matches update metadata and its SHA-256 matches the
  GitHub asset digest
  `167d0c9943e75845af11ca077a8da6e64271f685cec23c2101ffc80e2098ee44`.
- Linux: n/a for signing. Every OS passed bundled App version/offline activation
  checks. No provider inference or installed user-profile writes were performed.

## 2026-09-26 (0.5.2 preview, standard profile — publication)

Behavior change:

Desktop 0.5.2 is a published compatible patch using the standard signing profile.
Runtime now prepares managed skill files for Codex in its own read-only sandboxes
without granting the provider write access. Source/worktree directories remain protected,
and strict skill delivery remains consistent during message rehydration.

The developer-only authoring host can create an attributed, unverified knowledge
draft using the normal Desktop-managed app lifecycle. Native Windows acceptance
produced one draft within its token threshold. This host/tooling is excluded from
shipping asset inventories; the preview does not add an end-user authoring button
or promote the generated knowledge. Independent content evaluation remains open.

Migration steps:

None beyond the existing 0.5.1 upgrade behavior. This change adds no persisted
format or breaking API. Existing Usage 0.4.0 and 0.5.x knowledge bundles remain
compatible. Runtime 0.3.1 is bundled from source commit
`98b6755f8698300b2c1881c8018e303c02a29c69`; its npm package and all other npm
packages are not published by this release. The Usage 0.4.0 artifact retains
SHA-256 `7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.

Self-update from the previous standard-profile Desktop 0.5.1 is expected to work
on Windows and Linux. The macOS app retains the same Developer ID team
`97JBZ3MFX5` and signing certificate as 0.5.1, confirmed in both build logs, so its
signed-to-signed update remains compatible. This release has not passed a new
installed 0.5.1-to-0.5.2 update acceptance check on any OS.

Deprecations:

None.

Release verification:

Rebased focused validation passed: Runtime 135 cases, Platform 49 cases, Runtime
TypeScript build, Platform server/host builds and the 0.5.2 version guard.
Independent integration review found no code blockers. Full CI passed before
normal auto-merge: [Runtime #97](https://github.com/cats-inc/cats-runtime/pull/97)
(2,449 passed, 5 skipped) and
[Platform #148](https://github.com/cats-inc/cats-platform/pull/148)
(4,864 passed, 59 skipped); no failed tests.

The [0.5.2 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.2)
was published from Platform `b2a56ece01f7c4ab6a662c69cef2d6307405e936`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36195340100)
passed 7/7 jobs with `unsigned=false` and the immutable Runtime SHA above, checked
out by every OS build. The workflow created the preview tag; it was not pushed.

- All ten expected assets are published. The release is a prerelease and appears
  first in the releases feed. All three update metadata files report 0.5.2 and
  reference published assets with matching names and sizes.
- macOS: signed + notarized. The app and native helper passed signature checks;
  stapling validation passed and Gatekeeper reported `source=Notarized Developer ID`.
  This is build-runner evidence; the published DMG was not rechecked on this
  Windows host.
- Windows: unsigned: no certificate. The downloaded 144,703,731-byte installer
  reports Authenticode `NotSigned`; its SHA-512 matches `latest.yml` and SHA-256
  matches the GitHub asset digest
  `0510d7218931c2ba1bfc64a32e1908293b49066cd38e3459fa1b7f523e661444`.
- Linux: n/a. All three builds passed bundled App version/offline activation
  checks and retained preview content eligibility.

No npm publish workflow or additional native provider inference was run.

## 2026-09-26 (0.5.1 preview, standard profile — publication)

Behavior change:

Desktop 0.5.1 is a preview with the
[standard signing profile](deployment.md#desktop-signing-profiles). It is a
compatible patch that bundles Runtime 0.3.1
([cats-runtime #93](https://github.com/cats-inc/cats-runtime/pull/93)):

- **Upgraded installations get current model menus again**
  ([cats-runtime #91](https://github.com/cats-inc/cats-runtime/pull/91)). Desktop
  builds from 2026-04-14 until the catalog cutover copied the factory catalog into
  the Runtime config directory. On upgrade, Runtime kept that copy as a personal
  override, so menus stayed old (for example Claude without Opus 5.5) or showed
  "Model catalog settings need attention". Runtime now backs up and removes an
  unmodified copy, or an untouched conversion of one, and uses the current factory.
  An edited file is kept as an operator override.
- **Muse effort starts at its first option** ([#143](https://github.com/cats-inc/cats-platform/pull/143)).
  The menu no longer offers a synthetic Default; it starts at `minimal` and submits
  it, matching the Muse picker policy and Playground.
- **Catalog refreshes.** Claude lists the ten explicit models from its current
  picker (including Opus 5, Fable 5, Opus 4.8, Opus 4.7, Opus 4.6 and Sonnet 4.6);
  Opus 5.5 now runs the picker's standard-context `opus`. Muse uses its CLI 1.4.0
  list.
- **Runtime fixes.** Claude sessions group by their recorded working directory, and
  native Windows Codex provider and Code Mode host launches no longer open windows.

Platform trust: macOS signed + notarized, Windows unsigned (no certificate),
Linux n/a.

Self-update into 0.5.1:

- Windows and Linux: installs of 0.4.3 through 0.5.0 self-update. 0.5.0 queries the
  feed on each check; an older install still uses its old update logic, so restart
  a Cats that has been open since before 0.5.1 shipped, then check.
- macOS: standard-profile installs such as 0.4.7 and 0.5.0 self-update, with the
  same restart advice for 0.4.x. A 0.4.6 install (unsigned override) cannot
  self-update; install the 0.5.1 DMG manually, once.

Migration steps:

The first Runtime start after the update retires an app-seeded catalog copy
automatically and keeps a byte-for-byte `.bak` beside it. A user-edited
`curated-model-catalogs.yaml` is not changed. No other data migration applies.

Platform and Desktop share version 0.5.1; the standard-profile preview is
published. Every OS bundles Runtime 0.3.1 from immutable commit
`e202eaf4037c648c73caa52c9a9d441793b2df71` and the existing
[Usage 0.4.0](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.4.0)
artifact with SHA-256 `7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.
npm `latest` now carries `@cats-inc/cats-platform@0.5.1`,
`@cats-inc/cats-runtime@0.3.1`, and launcher 0.2.0 under both
`@cats-inc/cats-one` and `cats-one`. The launcher requires Runtime `^0.3.1` and
Platform `^0.5.1`, so `npx cats-one@latest` resolves this release.

Deprecations:

None.

Release verification:

The [0.5.1 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.1)
was published from Platform `ba9417bb83170136cfc3c041f163ee4ec6c90099`.
The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36184509729)
passed 7/7 jobs with `unsigned=false` (standard profile) and
`runtime_ref=e202eaf4037c648c73caa52c9a9d441793b2df71`; every OS build checked
out that Runtime commit. The workflow created the tag; it was never pushed first.

- Assets: all ten expected assets are present, and the release is a prerelease
  (not latest). The releases feed lists 0.5.1 first. All three public update
  metadata files name 0.5.1, with asset names and sizes that match the release.
- macOS: electron-builder signed `Cats.app` with the Developer ID certificate,
  notarization succeeded, and the workflow's verification step reported
  `source=Notarized Developer ID`. This was not re-verified from the published
  DMG, because the checking host runs Windows.
- Windows: the downloaded `Cats-0.5.1-setup-x64.exe` reports Authenticode
  `NotSigned`, which is expected without a certificate.
- Linux: n/a.

npm: [Runtime](https://github.com/cats-inc/cats-runtime/actions/runs/36183579493),
[Platform](https://github.com/cats-inc/cats-platform/actions/runs/36184505061) and
[cats-one](https://github.com/cats-inc/cats-one/actions/runs/36187020990) publish
workflows passed. The logs show publication with `latest` and signed provenance.
Registry entries and tarballs were available after propagation. A fresh-cache
`npx --yes cats-one@latest --platform-only --help` installed cats-one 0.2.0,
Platform 0.5.1 and Runtime 0.3.1.

## 2026-09-25 (0.5.0 preview, standard profile — publication)

Behavior change:

Desktop 0.5.0 is a preview with the
[standard signing profile](deployment.md#desktop-signing-profiles). It moves to
the next minor because it bundles Runtime 0.3.0
([cats-runtime #86](https://github.com/cats-inc/cats-runtime/pull/86)): release
execution no longer resumes retained contexts whose release compatibility cannot
be established ([cats-runtime #85](https://github.com/cats-inc/cats-runtime/pull/85)).
It also includes:

- **Update checks answer with the current feed** ([#140](https://github.com/cats-inc/cats-platform/pull/140)).
  Check for Updates queries the feed again even after an earlier offer or
  download, instead of redisplaying the remembered version, and a download
  re-validates the offer first and fetches the newest release. This takes effect
  once 0.5.0 is running.
- **Preview-only development content** ([#139](https://github.com/cats-inc/cats-platform/pull/139)).
  Desktop previews stage the Runtime preview supplement (Cats development,
  operation and practice skills); release-profile builds exclude it. The
  knowledge-practice tooling stays developer-only.
- **Usage App 0.4.0.** It declares Platform `^0.5.0`; its content equals Usage
  0.3.0, which declares `^0.4.0` and continues to serve Desktop 0.4.x.
- **Knowledge compatibility.** Catlas and Orchestrator bundled knowledge declares
  Platform `0.5.x`, preserving model guidance after the minor upgrade. Practice
  fixtures follow the checkout version. Cancellation tests fail promptly on
  unavailable knowledge, and CI has a bounded job duration.

Expected platform trust: macOS signed + notarized, Windows unsigned (no
certificate), Linux n/a.

Self-update into 0.5.0:

- Windows and Linux: installs of 0.4.3 through 0.4.7 self-update. The installed
  build still uses its old update logic, so restart a Cats that has been open
  since before 0.5.0 shipped, then check; otherwise it can offer the older
  version it found earlier.
- macOS: standard-profile installs such as 0.4.3, 0.4.5 and 0.4.7 self-update,
  with the same restart advice. A 0.4.6 install (unsigned override) cannot
  self-update; install the 0.5.0 DMG manually, once.

Migration steps:

No data migration: existing data is retained unchanged. After updating, a
conversation whose retained context cannot be verified for release compatibility
does not resume that context; release execution continues with a fresh verified
context.

Platform and Desktop share version 0.5.0; the standard-profile preview was
published on 2026-09-25 (recorded afterwards with 0.5.1). The
[0.5.0 prerelease](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.0)
comes from Platform `524e340667b2e4b2b76e8e87c2bbdbacf7b5ef53`. Its
[Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36151491375)
passed, and macOS reported `source=Notarized Developer ID`. It bundles Runtime 0.3.0
from immutable commit `e464619644ff499cc1dc7da03b755b91aa73d7b0` and the published
[Usage 0.4.0](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.4.0)
artifact with SHA-256 `7ec944b264093dbeda9009986d5558336467851868f014258be17f60db88bcba`.
No npm publication of Platform or Runtime is part of this release.

Deprecations:

None.

## 2026-09-25 (0.4.7 preview, standard profile — publication)

Behavior change:

Desktop 0.4.7 is a preview with the
[standard signing profile](deployment.md#desktop-signing-profiles). It restores
macOS self-update after the 0.4.6 unsigned override. Product content matches
0.4.6: no Platform product code, Runtime or App changes. The build takes the main
tip at dispatch; since 0.4.6 that adds only documentation and the reworded
`unsigned` workflow input description.

Platform trust: macOS signed + notarized, Windows unsigned (no certificate),
Linux n/a.

Self-update into 0.4.7:

- Windows and Linux: installs of 0.4.3, 0.4.5 and 0.4.6 self-update.
- macOS: standard-profile installs such as 0.4.3 and 0.4.5 self-update directly
  into 0.4.7, skipping 0.4.6. A 0.4.6 install (unsigned override) cannot
  self-update; install the 0.4.7 DMG manually, once.

Migration steps:

No data migration or dependency change. Existing setup remains valid.
Platform and Desktop share version 0.4.7; the standard-profile preview is
published. Every OS bundles Runtime 0.2.1 from immutable commit
`b712da2faf233c2ec9e4ecb831566a29f6effaa7` and the existing Usage 0.3.0 artifact
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
No npm or new App publication is part of this release.

Deprecations:

None.

Release verification:

The [0.4.7 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.7)
was published from Platform `47f7f4eb212e5b17fe9b754634fea0f357adf3a8` (main tip at
dispatch). [Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/36098065565)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36098664846)
passed (7/7 jobs, `unsigned=false`, standard profile). The workflow created the
tag; it was never pushed first. All ten expected release assets are present as a
prerelease (not latest), the releases feed lists 0.4.7 first, and all three
public update metadata files name 0.4.7 with matching asset names and sizes.
Every OS build packaged Runtime `b712da2`.

Platform trust was checked on the published assets, not only in the workflow:

- macOS: the workflow reported `source=Notarized Developer ID`. In the published
  updater ZIP, both `Cats.app/Contents/MacOS/Cats` and `cats-stt-macos` carry a
  Developer ID Application signature for Team `97JBZ3MFX5` with the hardened
  runtime, and the stapled ticket is present.
- Windows: the downloaded x64 installer (144,666,125 bytes) is `NotSigned`, as
  expected without a certificate. Its SHA-512 equals the `latest.yml` value and
  its SHA-256 `b1440a25372d12123c3253b58b42241db78604290a1c9522c38dbf56e15baf2b`
  equals the GitHub asset digest.
- Linux: the arm64 `.deb` is unsigned by design.

No installed upgrade acceptance was performed in this check; that remains
pending on every OS, including the macOS 0.4.5 to 0.4.7 self-update.

## 2026-09-25 (Desktop signing profiles — correction for 0.4.5 and 0.4.6)

Behavior change:

No build or product behavior changes. Desktop signing now has named profiles,
defined in [Desktop signing profiles](deployment.md#desktop-signing-profiles).
This corrects the "signed preview" and "unsigned preview" wording in the 0.4.5
and 0.4.6 entries below:

- 0.4.5 used the **standard** profile, with the same platform trust as 0.3.6
  through 0.4.3: macOS signed + notarized, Windows unsigned (no certificate),
  Linux n/a. It did not differ from the previews before it.
- 0.4.6 used the **unsigned override** (`unsigned=true`). It differs from 0.4.5
  only on macOS, where the app is unsigned and not notarized. The 0.4.6 entry
  covers only that 0.4.6 itself cannot self-update; signed macOS installs also
  cannot self-update into 0.4.6.

Migration steps:

- Windows and Linux: installs of 0.4.3 or 0.4.5 self-update into 0.4.6 as usual.
- macOS installs of a standard-profile build such as 0.4.3 or 0.4.5:
  **Check for Update** reports 0.4.6 but fails with a signature error during
  download. Stay on the current build; it self-updates directly into the next
  standard-profile preview.
- macOS installs of 0.4.6: a manual DMG install needs a Gatekeeper bypass, and
  the result cannot self-update. Install the next standard-profile preview
  manually, once.

Deprecations:

The bare terms "signed preview" and "unsigned preview" are retired for new
records; use the profile name and each platform's trust instead.

## 2026-09-25 (0.4.6 unsigned preview — publication)

Behavior change:

Same release line as the 0.4.5 signed preview, republished unsigned per operator
request: the 0.4.4-prepared desktop automation skill updates plus Runtime 0.2.1
with the current provider model catalogs (including the Muse 1.3.0 refresh).
The build takes the main tip at dispatch, so unrelated main commits landed
after the 0.4.5 tag are included as ordinary preview content.
No new model mapping is added to Platform product code. Unsigned macOS
previews require manual installation and cannot self-update.

Migration steps:

No data migration or dependency change. Existing setup remains valid.
Platform and Desktop share version 0.4.6; the unsigned preview is published.
Every OS bundles Runtime 0.2.1 from immutable commit
`b712da2faf233c2ec9e4ecb831566a29f6effaa7` and the existing Usage 0.3.0 artifact
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
No npm or new App publication is part of this release.

Deprecations:

None.

Release verification:

The [0.4.6 unsigned preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.6)
was published from Platform `540389f0db2b203a91db5b927729236e063555fb` (main tip at
dispatch). [Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/36092558793)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36093265795)
passed (7/7 jobs, `unsigned=true`). The workflow created the tag; it was never
pushed first. All ten expected release assets are present as a prerelease (not
latest), and all three public update metadata files name 0.4.6 with matching
asset names and sizes.

The downloaded Windows x64 installer (144,666,135 bytes) matches its update
metadata and API digest: SHA-512 equals the `latest.yml` value and SHA-256 is
`07815948a064939d01594271a319f0b0b623821ee0b93721a2568a84009e6bcc`.
Unsigned macOS previews require manual installation and cannot self-update.
No signature, package-extraction, or installed upgrade acceptance was performed
in this check; that remains pending.

## 2026-09-25 (0.4.5 preview — publication)

Behavior change:

Desktop 0.4.5 preview is the first publication carrying the 0.4.4-prepared
desktop automation skill updates (Windows Terminal text capture, window/pane/
focus guards, bounded keyboard handling). No new model mapping is added to
Platform product code. The bundled Runtime also brings the current provider
model catalogs, including the Muse 1.3.0 refresh. Version 0.4.4 was prepared
but never published; Desktop skips it.

Migration steps:

No data migration or dependency change. Existing setup remains valid.
Platform and Desktop share version 0.4.5; the preview is published.
Every OS bundles Runtime 0.2.1 from immutable commit
`b712da2faf233c2ec9e4ecb831566a29f6effaa7` and the existing Usage 0.3.0 artifact
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
No npm or new App publication is part of this release.

Deprecations:

None.

Release verification:

The [0.4.5 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.5)
was published from Platform `cc5d07ad5614847ce71aae5ff8674e29d9d0a523` (main tip at
dispatch: the 0.4.5 preparation plus a later orchestrator commit).
[Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/36088332391)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36089195232)
passed (7/7 jobs, signed preview). The workflow created the tag; it was never
pushed first. All ten expected release assets are present as a prerelease (not
latest), and all three public update metadata files name 0.4.5 with matching
asset names and sizes.

The downloaded Windows x64 installer (144,612,036 bytes) matches its update
metadata: SHA-256 `8b85c28e2f6b47df61c832bf8aee8359bb33766b7896918d66f2559cb01c9aa1`
and the `latest.yml` SHA-512. No signature, package-extraction, or installed
upgrade acceptance was performed in this check; that remains pending.

## 2026-09-24 (0.4.4 — preparation)

Behavior change:

The canonical desktop automation skill now includes Windows Terminal text capture,
window/pane/focus guards and bounded keyboard handling, with native pilot evidence
and isolated guard tests. Runtime owns Codex menu traversal and catalog data; no
new model mapping is added to Platform product code. See the
[Windows Terminal pilot](research/2026-09-24-windows-terminal-catalog-pilot.md).

Migration steps:

No product API, persisted-data or App compatibility change. Platform and Desktop
share the prepared 0.4.4 version. This bump does not publish npm or a Desktop
preview; future Desktop publication must select an immutable Runtime source.

Deprecations:

None.

## 2026-09-24 (0.4.3 preview — publication)

Behavior change:

Cats Chat, Cats Work, and Cats Code shortcuts now survive normal Desktop restart
and shell refresh after setup. The old host used Node fetch without the window's
login session; the server correctly returned a minimal unauthenticated envelope,
which replaced the product list. Only setup completion previously synchronized
the authenticated renderer list, explaining why the shortcuts appeared sometimes.

The host now uses the window's Electron session, refreshes on login/logout, and
accepts shell updates from normal renderer loads and product changes. Confirmed
logout or product removal clears shortcuts; transient failures and stale responses
cannot erase a newer list. Ordinary synchronization preserves provider diagnostics.

Migration steps:

No data migration or dependency change. Existing setup remains valid.
Platform and Desktop share version 0.4.3; the preview is published.
Every OS bundles Runtime 0.2.0 from immutable commit
`edfec394951200702b9a88b4f9d76d97669b9be8` and the existing Usage 0.3.0 artifact
with SHA-256 `61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
No npm or new App publication is part of this release.

Linux ARM64 installed Desktop 0.4.2 → 0.4.3 automatic upgrade and tray acceptance
passed: the new package and native Desktop both report 0.4.3, and all three
shortcuts appear on automatic restart and survive renderer refresh. Linux
Electron 41.2.0 regression testing with a disposable profile also verified
persisted-login cold start, refresh, logout, and login again; it reproduced the
old transport returning no products.

Deprecations:

None.

Release verification:

The [0.4.3 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.3)
was published from Platform `ccfba1388374ef8913486acc5adc8fcd9645bca4`.
[Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/35912025735)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35912123788)
passed. The tag resolves to that source commit. All ten expected release assets
are present, and all three public update metadata files name 0.4.3 with matching
asset names and sizes. Each OS verified the pinned Usage 0.3.0 artifact and offline
activation. Windows x64 is unsigned; macOS x64 passed signature, notarization,
stapled-ticket and Gatekeeper checks; Linux is ARM64 `.deb`.

The downloaded Linux package's SHA-512 matches its update metadata; SHA-256 is
`3dcf3dba94cafe3fec3f36265b6d2889121f3bc19d327d209dcc32d0c63dcc60`.
Read-only extraction confirmed package/Desktop/Platform 0.4.3, Runtime 0.2.0,
and the authenticated-session tray reader in the shipped host.

The [real Linux update acceptance](research/2026-09-23-linux-self-update-validation.md#2026-09-24-follow-up-released-042-to-043)
subsequently passed through the installed 0.4.2 updater and system authentication.
The old host exited with code 0; the automatic replacement preserved UID,
arguments and NoNewPrivs 0→0. All five current configuration files and normalized
model catalogs for all 16 providers remained unchanged; real model/effort menus
and Usage 0.3.0 remained available. No manual installation or source patch was
used. The source 0.4.2 was normally cold-launched to capture stdout before this
test; this does not claim an uninterrupted chain from the prior update. Windows
and macOS native update acceptance and a future update from 0.4.3 remain untested.

## 2026-09-24 (0.4.2 preview — publication)

Behavior change:

This version-only patch retains the implementation shipped in
0.4.1 and the subsequent [Linux investigation and native acceptance record](./research/2026-09-23-linux-self-update-validation.md).
It introduces no additional updater fix. Native 0.4.1 → 0.4.2 update acceptance
now passes; the diagnostic socket inheritance follow-up remains open.

Migration steps:

No new data migration or dependency change. Desktop 0.4.2 is published as a
preview; Runtime and App versions remain independently managed. Linux acceptance
confirmed the actual installed package and restarted Desktop at 0.4.2, preserved
settings/model choices and NoNewPrivs 0→0. A subsequent update initiated by the
automatically restarted 0.4.2 host still requires a future target.

Deprecations:

None.

Release verification:

The [0.4.2 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.2)
is published from Platform `92ada3ae2377d17b38f17486100677a07eee96ab`.
[Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/35893841114)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35895597553)
passed. The release is a published GitHub prerelease with all ten expected assets;
all three update metadata files name version 0.4.2 and the matching installers.
Every OS bundled Runtime 0.2.0 from
`edfec394951200702b9a88b4f9d76d97669b9be8` and verified Usage 0.3.0 offline
activation. The Usage artifact remains pinned to SHA-256
`61395c43fc8257ffa6955c156aabe9a582fa72c903749f7684e3ed7621f5f509`.
Windows x64 is unsigned; macOS x64 passed signature, notarization, stapled-ticket
and Gatekeeper checks; Linux is ARM64 `.deb`. No npm or new App publication
occurred during publication.

Native Linux acceptance:

The installed, continuously running 0.4.1 updater completed 0.4.1 → 0.4.2 after
normal system authentication. The package and native Desktop dialog both
reported 0.4.2; the automatic replacement preserved UID, arguments and
NoNewPrivs 0→0 without a cold launch. Runtime 0.2.0 and Usage 0.3.0 remained
healthy/enabled. Seven configuration hashes, the existing migration backup and
all 16 providers' model API results were preserved; the actual model/effort
menus displayed their existing defaults. See the
[native acceptance record](./research/2026-09-23-linux-self-update-validation.md#2026-09-24-follow-up-released-041-to-042)
for timestamps, evidence and remaining gates. No manual Cats installation was
used.

## 2026-09-23 (0.4.1 preview — Linux Desktop update relaunch)

Behavior change:

Linux update/setup relaunch now preserves the host's existing privilege state.
Electron 41's native relaunch introduced NoNewPrivs and made a later `.deb`
update fail at pkexec with exit 127. The quit watchdog also starts after the
synchronous installer returns, so time spent authenticating does not cause a
successful install to be reported as a timed-out handoff. The Linux helper
preserves the existing UID, arguments and privilege restriction, waits for the
old host to exit, and retains DebUpdater's production HTTP executor.

Migration steps:

Existing restricted hosts still need a full Tray Quit and a normal cold launch;
the flag cannot be cleared in place. The source version's updater performs the
first upgrade to 0.4.1, so an automatic relaunch from 0.4.0 can still inherit the
old restriction. After installing 0.4.1, fully quit and launch normally once before
testing its repaired update/setup relaunch. Verify the actual package and running
Desktop versions; a downloaded update or host exit alone is not success.

The repaired host completed 0.4.1 → 0.4.2 with its automatic replacement preserving
NoNewPrivs=0; a subsequent update from that replacement remains pending.
Linux's official release-ready gate remains unchanged. Existing catalog upgrades
and settings must remain intact.
See the [Linux validation record](./research/2026-09-23-linux-self-update-validation.md).

Deprecations:

None. This compatible repair uses the next 0.4.x patch. Desktop bundles the same
Runtime 0.2.0 source (`edfec394951200702b9a88b4f9d76d97669b9be8`) and published
Usage 0.3.0 artifact as 0.4.0. Platform's npm version follows the shared manifest;
neither npm package is published. Source-fix CI passed before this release bump;
publication checks are recorded below, separately from native upgrade acceptance.

Release verification:

The [0.4.1 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.1)
is published from Platform `2a8a58ff9d8a77d0c912042c3950bad3019a5e0d`.
[Release-source CI](https://github.com/cats-inc/cats-platform/actions/runs/35883051347)
and the [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35883097624)
passed, including all three installers, Usage 0.3.0 offline activation, macOS
signature/notarization and validation of all ten assets. Every OS bundled the
Runtime commit above. Windows x64 is unsigned; macOS x64 is signed/notarized;
Linux is ARM64. No npm publication occurred.

On 2026-09-24 the Linux ARM64 installed updater completed 0.4.0 → 0.4.1 after
retrying an initial HTTP 500 and intermittent asset transfer. Both the package
and restarted Desktop reported 0.4.1; existing settings and model API results
were preserved. Following the required normal cold launch, the published
0.4.1 host's own relaunch preserved NoNewPrivs 0→0. The later 0.4.1 → 0.4.2
acceptance above validates that host's updater and automatic restart. The
validation record separately documents a temporary remote-debugging socket
inherited during that diagnostic
relaunch; the final normal launch omitted diagnostic arguments.

## 2026-09-23 (0.4.0 preview — existing catalog upgrades)

### Upgrade existing model settings before the first model request

Behavior change:

The preview bundles Runtime 0.2.0. On writable startup or explicit catalog reload,
Runtime validates and converts recognized schema-1 model settings to schema 2,
preserves their scopes/models/options, creates a unique raw backup and atomically
replaces the file. Current-format files and absent overrides need no migration.
Unknown mappings or write conflicts preserve the existing file and expose recovery
diagnostics. Compatible accepted settings remain usable when available.

Desktop model selectors stop indefinite loading for rejected catalog settings.
Runtime Setup & Repair shows upgrade details, the backup path and explicit retry
after correction. Successful retry refreshes the configured targets' model data.

Migration steps:

Install this preview over the previous Desktop version with the existing profile.
Recognized schema-1 catalogs upgrade automatically before model reads. Check the
model names, order, efforts and defaults, and restart to confirm no second backup
is created. If the profile was already manually converted, its schema-2 file stays
unchanged; use an isolated copy of the old backup to exercise conversion rather
than resetting the active profile. Setup & Repair reports any blocked conversion.
See the [catalog upgrade guide](https://github.com/cats-inc/cats-runtime/blob/main/docs/provider-catalog-soft-patches.md#existing-schema-1-files-and-rollback).

Deprecations:

The previously shipped schema-2 contract now uses the required 0.x minor release
boundary. Execution remains schema 2; migration is a bounded data conversion.
Runtime/Platform npm versions are prepared, with no npm publication in this task.
Usage 0.3.0 targets Desktop 0.4.x; the old Desktop 0.3.x App
artifact remains unchanged. Native installer upgrade acceptance is the purpose of
this preview and is separate from package and isolated-profile checks.

Release verification:

The [0.4.0 preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.4.0)
is published from Platform `2874dd0eba8625c1a7086f65aea47dd2a63d60ac`, bundling
Runtime `edfec394951200702b9a88b4f9d76d97669b9be8` on every OS. Runtime and Platform
CI passed. The [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/35862976809)
passed all three package builds, Usage 0.3.0 offline activation, macOS signature /
notarization checks and validation of all ten release assets. Windows x64 is
unsigned; macOS x64 is signed/notarized; Linux is arm64. This GitHub prerelease did
not publish either npm package. Linux ARM64 0.3.8 → 0.4.0 package/profile
acceptance passed on 2026-09-23, while exposing the relaunch/watchdog defects
described above. The repaired published update chain and other native upgrade
acceptance remain open.

## 2026-09-23 (0.3.8 preview — provider catalog data and local patches)

### Update one installation's model catalog without rebuilding

Behavior change:

Runtime 0.1.28 and Desktop now share the same validated catalog data for model
names, ordered controls, explicit defaults and fixed combinations. A local YAML
override replaces only its provider/backend/transport scope; other scopes inherit
factory data. Validation, digest-checked apply with backup, reload and rollback
are available through the Runtime catalog tool. Existing sessions retain their
recorded execution bindings. Desktop retains coherent observed menus during
temporary disconnections and never uses local informational labels to authorize
execution on a remote Runtime.

Migration steps:

An existing schema-1 `curated-model-catalogs.yaml` requires explicit conversion
to schema 2. The update does not rewrite personal files automatically. Before
using its model menus, use the new bundled Runtime's catalog tool to produce a
separate converted candidate, review it, then preview/apply and reload (or restart)
the same Runtime. Without valid schema-2 data or a compatible accepted snapshot,
the catalog reports unavailable. Clean profiles use factory data directly.
See the [catalog patch and conversion guide](https://github.com/cats-inc/cats-runtime/blob/main/docs/provider-catalog-soft-patches.md).

Deprecations:

Handwritten model/default/effort tables and schema-1 runtime loading are replaced
by the schema-2 data contract. The explicit converter retains evidenced legacy
mappings. Runtime and Platform npm versions are prepared only; this release
publishes Desktop preview assets and does not publish either npm package.

## 2026-09-23 (0.3.7 preview — macOS admitted to the release-ready gate)

### Recover from a rejected update download

Behavior change:

An update that downloaded but could not be installed no longer traps the
updater. Before this, a downloaded artifact could not be re-checked, a failed
install handoff returned to the same "ready to install" state, and the tray
flow showed nothing when the handoff failed -- so a rejected download was
offered on every click until Cats was restarted. Now a failed handoff is shown
once with its reason (a Squirrel.Mac signature rejection reads as "failed its
signature check" rather than "could not open the installer"), and the next
**Check for Update** re-checks first: a newer release supersedes the stale
download, and an unchanged one is offered again without re-downloading.

macOS passed the signed old-to-new self-update test (0.3.2 to 0.3.6) and is
admitted to `DESKTOP_RELEASE_READY_PLATFORMS`. This affects only official
builds, of which none exist yet; previews never went through that gate.

Migration steps:

From 0.3.6 on macOS, **Check for Update** downloads 0.3.7 and relaunches into
it; on Windows and Linux use **Check for Update** as usual. Anyone still on
the unsigned 0.3.3 DMG on macOS must install 0.3.7 manually once.

Deprecations: none.

## 2026-09-23 (0.3.6 preview — first signed macOS self-update candidate)

### Bring the update dialog to the foreground on macOS

Behavior change:

The tray-originated update dialog now activates the app before it opens. The
tray closes on click and the main window is usually hidden, so that message
box has no parent window, and macOS does not bring an app forward for a
parentless dialog: the "ready to install" prompt that follows a download opened
behind whatever was frontmost and went unseen until the next tray click.
Windows raises such a dialog on its own, which is why the two platforms looked
inconsistent.

Migration steps:

This is the first preview that can validate macOS self-update end to end.
0.3.3 was dispatched with `unsigned=true`, so Squirrel.Mac refused to apply it
over the signed 0.3.2 -- by design, as that release's notes stated; Windows and
Linux applied it because NSIS and dpkg do not verify signatures. From a signed
0.3.2 install, **Check for Update** should find 0.3.6, download it, and relaunch
into it. Anyone who installed the unsigned 0.3.3 DMG manually must install
0.3.6 manually once; self-update resumes from there.

0.3.4 and 0.3.5 were published to npm only; no desktop artifacts carry those
versions.

Deprecations: none.

## 2026-09-23 (0.3.4 npm alignment)

### Make the current Platform available to npm launchers

Behavior change:

Prepare the current Platform implementation for publication as
`@cats-inc/cats-platform@0.3.4` on npm's `latest` tag. cats-one 0.1.22 will require
Platform `^0.3.4` and Runtime `^0.1.25`, replacing its outdated dependency floor.
The existing setup and configuration ownership remains unchanged: preferences
are persisted when saved, the auth session secret is generated when needed,
and provider capability bootstrap rules remain opt-in.

Migration steps:

Publish Runtime and Platform first, then resolve cats-one's lockfile from npm
and publish the launcher. A fresh `npx @cats-inc/cats-one@latest` can then use
the aligned packages. Desktop installer publication is a separate workflow.

Deprecations: none.

## 2026-09-18 (0.3.3 unsigned preview)

### Let Cline accept short chat messages

Behavior change:

The bundled Runtime fixes Cline rejecting messages such as `晚安` or `hello`
as an unknown command before model execution. It also protects messages that
look like CLI subcommands or flags while retaining the selected provider,
model, effort and permission settings.

This preview is explicitly unsigned on all platforms at the operator's request.
The workflow now exposes an opt-in `unsigned` input for manual previews; the
default signing behavior from ADR-117 is unchanged for other runs.

Migration steps:

On Windows, use Cats Desktop **Check for Update**. Install the macOS DMG manually
for this unsigned preview; its update cannot be applied by Squirrel.Mac, including
from the signed 0.3.2 build. Linux users can install the published arm64 DEB.

The release uses Runtime commit `bf0c24880fb5045b4c2b0daaf27ce905f9b60b53`
(`0.1.24`, Runtime PR #69) and retains the locked Usage app `0.2.1`.
Dispatch `desktop-release.yml` with `tag=v0.3.3`, that exact `runtime_ref`, and
`unsigned=true`. Windows x64 NSIS, macOS x64 DMG/updater ZIP and Linux arm64
DEB remain the release artifact set.

Deprecations: none.

## 2026-09-18 (0.3.2 preview — first signed macOS preview)

### Sign and notarize macOS preview artifacts

Behavior change:

macOS preview artifacts are now signed with a Developer ID Application
certificate and notarized by Apple. A downloaded DMG installs without a
Gatekeeper bypass, and **Check for Update** works on macOS for the first time.
That was previously impossible rather than merely inconvenient: Squirrel.Mac
refuses to apply an update to an unsigned application, and macOS 15 removed the
right-click-to-open Gatekeeper bypass.

Per ADR-117 this changes artifact trust only. The build keeps its preview
release identity: it publishes as a GitHub prerelease, never becomes `latest`,
resolves to `preview_packaged`, and stays outside the release-ready platform
gate. Signing credentials are scoped per platform, so each platform starts
signing when its own certificate exists rather than waiting for the others.
Windows and Linux preview artifacts remain unsigned.

Migration steps:

**Existing macOS preview installs cannot update themselves into this release.**
Squirrel.Mac validates the signature of the *running* application before
applying an update, so the unsigned-to-signed transition is a discontinuity.
Download and install the 0.3.2 DMG manually, once; updates from 0.3.2 onward
work normally. This affects only that one transition.

On Windows, use Cats Desktop **Check for Update** as usual. Linux users can
install the published DEB.

Deprecations:

The `unsigned-preview-*` Actions artifact names are retired in favour of
`preview-*`, because a preview is no longer necessarily unsigned.

## 2026-09-18 (0.3.1 unsigned preview)

### Let first setup finish loading Catlas providers

Behavior change:

First setup can populate the Catlas provider/model picker when Runtime's initial
configuration response takes longer than 500 ms. Platform now waits within the
existing 5-second Runtime request deadline, retains the successful result and
reuses it on subsequent reads. Automatic retry and the spinner remain; no manual
recovery buttons or raw transport errors are added. Provider selection and
authentication checks retain their existing scope.

This preview also includes the separately merged ClinePass six-model shortlist
and its matching Runtime execution support. The merged macOS release target is
x64 again under ADR-117; preview artifacts remain unsigned.

Migration steps:

On Windows, use Cats Desktop **Check for Update** to install 0.3.1. Unsigned
macOS previews require downloading and installing the DMG manually; Squirrel.Mac
does not apply updates to an unsigned app. Linux users can install the published
DEB. A setup that could not finish can continue after the update; deleting local
Cats data is unnecessary.
Runtime remains 0.1.24, pinned to
`a44eb734279d5211f687d7dc3047d8207347c87c`. Usage remains 0.2.1 with the existing
immutable artifact and SHA-256 lock. Dispatch the manual Desktop workflow with
`tag=v0.3.1` and that exact `runtime_ref`. Windows x64 NSIS, macOS x64 DMG/updater
ZIP and Linux arm64 DEB publish after packaging and update-asset gates succeed.

Validation: the merged setup fix passed full CI (4,596 passed, 56 skipped,
0 failed). Read-only verification against the affected Runtime returned ten
providers in 1,497 ms cold and 23 ms warm. The paired ClinePass Platform and
Runtime commits passed their full CI. Version consistency and 47 focused release
version/asset checks passed. The version candidate requires its own
full CI plus the three-platform release workflow; verify the public update feed
after publication. Installed update/restart and setup acceptance remain with
the user.

Deprecations: none. This is an explicitly requested unsigned GitHub prerelease;
future version bumps still require a new request. The reported Devin model
execution issue is deferred and is not claimed as fixed by this release.

## 2026-09-18 (0.3.0 unsigned preview)

### Faster conversation switching and independent execution selections

Behavior change:

Previously opened conversations appear immediately from a bounded in-memory
cache while their subscriptions refresh in the background. Each conversation
retains its own provider/model/effort selection, draft, attachments and scroll
position. Delayed responses cannot switch the active conversation or overwrite
another conversation's draft. Interrupted subscriptions reconnect automatically.

This preview also includes the aligned Desktop Devin model presets, preservation
of custom model selections, and Runtime's Devin setup/model/Playground fixes.
The macOS installer and updater ZIP now use the merged universal build path.
The preview remains unsigned and does not use signing or notarization secrets.

Migration steps:

Use Cats Desktop **Check for Update** in an existing unsigned preview to install
0.3.0. Existing conversations, provider selections and user data do not require
a reset. Runtime remains 0.1.24, pinned to
`29ef46443c81d8d0e50944a052db882a18668376`. The bundled Usage App is 0.2.1,
which declares Platform 0.3.x compatibility with the same SDK 1.2 contract.
Its [immutable release](https://github.com/cats-inc/cats-apps/releases/tag/usage-v0.2.1)
comes from source `df1c57168c98a6a83fffb54f58ad298a1b769511`; the Desktop lock
pins its published SHA-256
`6b8160e548488f30c741cadd4726b55fa18f8c0a324d48ac0cbc6ea143788f24`.
Dispatch the manual Desktop workflow with `tag=v0.3.0` and that exact
`runtime_ref`. Windows x64 NSIS, macOS universal DMG/updater ZIP and Linux arm64
DEB publish only after all packaging and update-asset gates succeed.

Validation: the merged conversation-cache change passed full CI (4,588 tests,
56 skipped) and isolated renderer navigation checks. The pinned Runtime release
preflight passed. The version candidate requires full PR CI and the
three-platform unsigned release workflow. Verify public update discovery after
publication; the installed upgrade/restart remains user acceptance.

Release preparation passed 118 focused package/compatibility/release tests,
Desktop host and UI-test builds, plus independent compatibility review. Usage's
docs/tests/build release workflow passed; its downloaded digest, lock and
provenance agree. Platform fixtures use the current host version while explicit
incompatibility and caret-boundary tests retain their fixed assertions.

Deprecations: none. This remains an unsigned GitHub prerelease. This release
was explicitly requested; future version bumps still need a new request.

## 2026-09-18 (0.2.12 unsigned preview)

### Keep provider/model pickers available and recover automatically

Behavior change:

Chat, Settings and first setup's Catlas picker retain successful provider/model
data across tray idle and refresh failures. Initial loading and recovery use an
animated indicator with automatic retry. Raw timeout/auth messages, Retry and
Open Runtime Setup actions are removed from these pickers. Base and advanced
catalogs recover independently; confirmed selection/auth changes still clear
retained data. First setup also contains optional prefetch failures so recovery
does not leave an unhandled exception.

This preview includes the merged Copilot and Cursor fixed presets, OpenCode and
Kilo curated shortlists, and Runtime's corrected Muse effort menus. Existing
user-curated catalog overrides retain their normal precedence.

Migration steps:

Use Cats Desktop **Check for Update** in an existing unsigned preview to install
0.2.12. Provider selections and user data do not require a reset. Runtime remains
0.1.24, pinned to `03d3e1786b49de66b74b55a8c478db96f9721d6b`; the bundled Usage
App remains 0.2.0. Dispatch the manual Desktop workflow with `tag=v0.2.12` and
that exact `runtime_ref`. Windows x64 NSIS, macOS x64 DMG/updater ZIP and Linux
arm64 DEB publish only after all packaging and update-asset gates succeed.

Validation: provider recovery and first-setup regressions, isolated picker
visual checks, merged Platform CI and the pinned Runtime release preflight
passed. The version candidate requires full PR CI plus the three-platform
unsigned release workflow. Check public update discovery after publication;
the installed upgrade/restart remains user acceptance.

Deprecations: manual recovery actions inside provider/model pickers are removed.
This remains an unsigned GitHub prerelease. This release was explicitly
requested; future version bumps still need a new request.

## 2026-09-17 (0.2.11 unsigned preview)

### Restore Desktop onboarding cards and clean-machine preparation

Behavior change:

Desktop onboarding again uses its original classified cards and Show more,
with visible Node.js/npm preparation before any provider is selected. Node/npm,
npm prefix/PATH and GitHub CLI background checks run independently of provider
selection and retain their individual results. Installation remains explicit;
provider scans remain limited to the saved selection. Fresh helper checks find
newly installed commands and verify both Node and npm after installation.

Onboarding and Settings show short statuses and useful next actions, with
technical diagnostics and maintenance inside collapsed details. Checking one
tool no longer erases another tool's prerequisite status, including recovery.
This preview also includes the merged Grok 4.6/4.5 catalog and picker correction,
without inventing an upstream default marker.

Migration steps:

Use Cats Desktop **Check for Update** to install the 0.2.11 unsigned preview.
Existing provider selections and user data do not require a reset. Runtime
remains 0.1.24, pinned to `580f1c9be3a5158fb8967157900629062c9ea020`, with the
existing Usage 0.2.0 lock. The manual Desktop workflow uses `tag=v0.2.11` and
that exact `runtime_ref`; it publishes Windows x64, macOS x64 and Linux arm64
only after all release checks pass.

Validation: 98 focused cases, affected host/renderer builds and typechecks,
isolated onboarding/Settings browser checks, and independent review passed.
Required full PR CI and three-platform packaging/asset validation gate this
publication. Physical provider installation and sign-in remain user acceptance.

Deprecations: none. This remains an unsigned preview. The user explicitly
authorized this release; future version bumps still need a new request.

## 2026-09-17 (0.2.10 unsigned preview)

### Let first-run Catlas setup read provider catalogs before login

Behavior change:

The second setup step could show `Authentication is required.` and disable the
provider/model selectors even after Runtime setup was ready. The first Admin
session is created only at final submission, but the picker had called catalog
routes that required that session. The three catalog GET routes are now allowed
only during first setup; post-setup/repair requests and mutations retain their
authentication requirements. Runtime-selected scope still limits the results.

Migration steps:

Use **Check for Update** to install the 0.2.10 unsigned preview and reopen setup.
The fix requires no reset of provider selection or user data. Runtime remains
0.1.24 at `c1a5c0ae108a155b14867f85c344a23c9a95bdbf`, with the existing Usage
0.2.0 lock. The manual Desktop workflow uses `tag=v0.2.10` and that exact
`runtime_ref`; it publishes Windows x64, macOS x64 and Linux arm64 after all
release checks pass.

Validation: the original 401 was reproduced in an isolated HTTP test. The fix
passed 49 focused auth/setup cases and an actual browser flow through both
setup steps, provider/model selection, first-Admin creation and authenticated
catalog access. Anonymous access is denied again immediately after setup.

Deprecations: none. This remains an unsigned preview.

## 2026-09-16 (0.2.9 unsigned preview)

### Shared provider onboarding and Settings

Behavior change:

Desktop onboarding and Settings > Runtime now share the provider manager.
Checkboxes express the user's chosen scope and load the saved Runtime selection;
new installations start unchecked. Apply saves the selection and optionally
runs detection. Each selected provider supports its own Detect/Install actions,
with Upgrade/Repair/previewed Uninstall where supported. Prior detection results
remain visible after save-only changes. Ollama/OpenClaw expose endpoint editing
and explicit connection checks; command presence, sign-in and connection are
separate observations.

Saving an empty or partially ready scope completes Runtime bootstrap, so Desktop
can continue to product setup without opening another setup page. Progress stays
visible until the requested operation finishes. Installing a provider verifies
that target once, rather than scanning every selected provider.

Native Windows/macOS/Linux packaged scripts incorporate the reviewed
`environment-bootstrap` changes through `752dc13`: current-version gates,
Cursor/Kiro Windows paths, isolated vendor PowerShell, Devin sharing-lock retry,
bounded old-build cleanup, truthful observed changes, and verified npm updates.
An explicit npm-provider Upgrade also updates npm in its existing prefix; Apply
and Detect do not. Explicit custom prefixes are preserved.

Migration steps:

Use Cats Desktop **Check for Update** from an unsigned preview build. Existing
provider selections and detection history are retained; review them in Settings
> Runtime. This preview packages Runtime 0.1.24 at
`c1a5c0ae108a155b14867f85c344a23c9a95bdbf` (Runtime PR #54), with the existing
Usage 0.2.0 App lock. The
[unsigned preview](https://github.com/cats-inc/cats-platform/releases/tag/v0.2.9)
was published by [run 35098915681](https://github.com/cats-inc/cats-platform/actions/runs/35098915681)
after Windows x64 NSIS, macOS x64 DMG/updater ZIP, Linux arm64 DEB, bundled-App
checks and update metadata validation passed. The public updater feed was
verified with the actual Desktop parser and resolves 0.2.9 on all three targets.

Deprecations: the separate Desktop provider editors and save-triggered global
scan path are replaced by the shared manager. WSL/Docker variants are outside
this native onboarding rollout. Physical native installation/login remains
user acceptance; automated validation uses isolated fixtures. This remains an
unsigned GitHub prerelease.

## 2026-09-16 (0.2.8 unsigned preview)

### Updated Claude/Codex catalogs and consistent defaults

Behavior change:

Claude Code 2.1.273 appears as four version-bearing choices: Opus 5 with 1M
context (default), Fable 5.1, Sonnet 5, and Haiku 4.5. The duplicate upstream
Default/Opus row is represented once. Opus, Fable, and Sonnet offer all six
observed effort levels with High as default; Haiku has no effort selector.
Desktop and Playground fallback lists now include Fable. Model/effort menus
standardize only the status marker to lowercase `(default)`, preserving the
model name's spelling and case.

The preview also includes the merged Codex 0.154.0 five-model catalog and
per-model effort defaults, Runtime's initial session discovery fixes, and the
new provider-selection bootstrap flow. Provider inventory and ordinary selectors
follow the provider targets selected in Runtime setup.

Migration steps:

Fully quit Cats and install the 0.2.8 preview normally. Desktop packages Runtime
0.1.23 at `46982a34d6964d2eee804fb60a4274ab382ea8ff` (Runtime PR #49); the existing
Usage 0.2.0 App lock remains unchanged. User-curated catalog overrides still take
precedence over the bundled example; this operator's Claude override was explicitly
approved and synchronized separately.

After both preparation PRs merge, dispatch the unsigned preview with `tag=v0.2.8`
and `runtime_ref=46982a34d6964d2eee804fb60a4274ab382ea8ff`. The workflow creates
the tag and publishes Windows
x64 NSIS, macOS x64 DMG/updater ZIP, and Linux arm64 DEB after all packaging and
asset-validation gates pass. npm packages use the existing `next` channel.

Deprecations: none. This remains an unsigned GitHub prerelease.

## 2026-09-16 (0.2.7 unsigned preview)

### Complete setup again after resetting all data

Behavior change:

Resetting all data now clears the previous local Admin, linked identities,
memberships, browser/mobile sessions, and login throttles alongside chat/core
setup state. Previously the remaining Admin made the second setup step fail
with `already_complete` when opening Cats, whether Catlas was enabled or skipped.
The reset confirmation now describes account and session removal.

Reset and setup completion share one serialized operation. Reset still requires
an authenticated Admin and CSRF token when an account remains but the setup
timestamp is missing. An auth-reset write rejection restores the previous
chat/core snapshot, and unexpected reset failures return a safe error message.

Migration steps:

Fully quit Cats and install the 0.2.7 preview normally. Upgrading does not itself
clear accounts: an installation already stuck after a reset on an older preview
needs another authenticated reset to remove its leftover Admin.

Desktop packages Runtime 0.1.22 at
`af2793ff6d50163efac65418d0deda7ff7f7eb9f`, with the existing locked Usage 0.2.0
archive. After merge, manually dispatch the Desktop release workflow with
`tag=v0.2.7` and that exact Runtime commit. The workflow creates the preview tag
and publishes Windows x64 NSIS, macOS x64 DMG/updater ZIP, and Linux arm64 DEB
only after all packaging and asset-validation gates pass.

Deprecations: none. This remains an unsigned GitHub prerelease.

## 2026-09-15 (0.2.6 unsigned preview)

### Passive provider detection at login

Desktop accepts installed, unverified provider targets as usable and preserves
their diagnostic warnings, matching the Runtime's shared passive detection policy.
The first-run Windows Ollama audit reads file version metadata without starting
the provider. Runtime background CLI/ACP checks and discovery no longer execute
providers to inspect versions, help, or session lists.

Desktop 0.2.6 packages Runtime 0.1.22 with the corresponding fix. The preview
workflow selects its exact merged Runtime commit. No migration or global
provider settings change is required. See the
[incident and validation record](../../cats-runtime/docs/research/2026-08-27-cline-self-update-and-probe-concurrency.md).

Deprecations: none.

## 2026-09-11 (0.2.5 unsigned preview)

### Multi-CLI quota queries and the separated runtime skill library

Behavior change:

Desktop selects the published Usage 0.2.0 archive with App SDK 1.2.0 and Runtime
commit `91bba98e2e621ec3124130b7c79fdc6c3ab7ca19`. The App lock pins SHA-256
`7d5455bb6b484b731becbc69b469e649fbfc433cf015586e0022c3045974c04e`
from Apps source commit `1affcf38e427f636e1eedb45bf3d1ac4e78eeb4f`.
Alongside Codex, Usage offers explicit Copilot, Claude Code and Antigravity
(`agy`) quota queries when Runtime advertises support. It preserves native
request quantities, unlimited entitlements, unknown values, stale observations
and independent provider/instance cooldowns. Opening or polling the dashboard
does not query accounts. Runtime invokes the configured native CLI only: no
credential extraction, Cats-originated provider API requests or model turns.

Kiro remains unenabled pending authenticated success evidence. Native Windows
CLI queries were live-verified; native macOS/Linux live queries and WSL/Docker
query transports remain unverified/unsupported respectively.

This preview includes the merged skill-root alignment: Desktop stages the
Runtime product library from `runtime-skills/`, not developer `skills/`.
cats-one's developer-workspace changes are merged but are not a Desktop sidecar.

Migration steps:

Fully quit Cats and install the 0.2.5 preview normally. The host activates the
bundled Usage update offline with no separate download, extraction or file move.
Settings, conversations and App data are retained, along with explicit disabled
or uninstalled App choices. This release task does not update the operator's
installed Desktop or modify its profile.

Deprecations:

None. This is an unsigned GitHub prerelease, not a signed stable distribution.
After this preparation merges, dispatch the Desktop release workflow with
`tag=v0.2.5` and the exact Runtime commit above. Let the workflow create its tag;
do not push a Desktop tag into the signed release path. The matrix is Windows
x64 (NSIS), macOS x64 (DMG/updater ZIP) and Linux arm64 (DEB). Each build must
verify actual bundled App bytes and temporary-profile offline activation before
publication. Those gates do not claim interactive native-installer acceptance.

## 2026-09-11 (0.2.4 unsigned preview)

### Explicit Codex quota refresh in bundled Usage

Behavior change:

Desktop bundles Usage 0.1.1 with App SDK 1.1 and Runtime commit
`603afdc2f9e46b31b56b0223f6a3f0690b5af76f`. The source-controlled App lock
pins the published archive's exact version, download URL and SHA-256.
Usage adds a Codex-only **Query latest quota / 查詢最新額度** button, showing
the provider's actual window duration, remaining percentage and reset time.
Opening the dashboard and its periodic snapshot refresh remain passive.

An explicit click uses the configured native Codex CLI's App Server stdio
`account/rateLimits/read` operation. Cats does not extract local CLI credentials
or issue its own provider HTTP request, and the query does not start a model
turn. Failed queries retain the last observation, and a 60-second cooldown
prevents repeated requests. WSL/Docker transports return unsupported; native
Windows was live-verified, while native macOS/Linux live validation remains open.

Migration steps:

Fully quit Cats and install the 0.2.4 preview normally. Desktop activates its
bundled Usage package offline; no separate App download, extraction or file move
is needed. Existing settings, conversations and App data are retained, as are
explicit disabled/uninstalled App choices. This release task does not update
the operator's installed Desktop automatically.

Deprecations:

None. This is an unsigned GitHub prerelease, not a signed stable distribution.
After this preparation is merged, manually dispatch the Desktop release workflow
with `tag=v0.2.4` and the exact Runtime commit above. Let that workflow create the
preview tag; do not push a Desktop version tag into the signed release path.
The release matrix remains Windows x64 (NSIS), macOS x64 (DMG/updater ZIP), and
Linux arm64 (DEB). Each build must pass the actual-resource/offline-App verifier
before publication; these checks are not interactive native-installer acceptance.

## 2026-09-10 (0.2.3 unsigned preview)

### App renderer loading recovery

Behavior change:

Fix the Windows single-file sidecar's SDK resource lookup by preserving its
package import during bundling. Version 0.2.2 inlined that module, making a valid
installed Usage archive fail to render with HTTP 503 because the SDK was read
from the wrong directory. Add a production-bundler regression test and an
installer-resource gate for this exact failure.

App startup now has a 15-second renderer/SDK deadline and a localized retry button.
Failed initialization and late responses from disposed attempts cannot leave a
permanent loading placeholder or replace a newer attempt. This is a host change;
no Usage package reinstall is required. Desktop still pins Usage 0.1.0 and the
same Runtime commit as 0.2.2.

Migration steps:

Fully quit Cats, then install the 0.2.3 preview over the existing installation.
Settings, conversations and App data remain in the existing user profile; do not
uninstall or delete that profile. No manual App extraction or file move is needed.
The published 0.2.2 installer is unchanged. Direct installed-window acceptance is
separate from the automated package and isolated browser/Electron checks.

Deprecations:

None. Merge this version bump before manually dispatching the Desktop release
workflow with tag `v0.2.3` and Runtime commit
`0345d319cf2f97ea51a482dd6932b34576a491b3`. Let the workflow create the preview
tag; do not push it directly into the signed stable release path.

## 2026-09-10 (0.2.2 unsigned preview)

### Usage is included as a version-pinned utility

Behavior change:

Desktop includes the independently released Usage 0.1.0 package selected by an
exact version, release asset URL and SHA-256. On first launch, Platform validates
and installs the bundled package offline, enables it and shows Usage in Lobby's
Apps section. Users do not separately download, move or extract the utility.
The packaged App/config/SDK roots now agree with Electron's resource layout.
Release jobs verify the actual unpacked resources and temporary-profile offline
activation on Windows, macOS and Linux before publishing the preview.

Usage reads the bundled Runtime's cached usage snapshot. Token/currency totals,
passive Claude/Codex quota reports, freshness and offline state are available;
active account polling and persistent usage history are not. Missing reports do
not mean zero usage or a full allowance.

Migration steps:

Install Desktop normally. Existing disabled/uninstalled App choices remain in
effect. No manual App migration is required. The release matrix is Windows x64
(NSIS), macOS x64 (DMG/updater ZIP), and Linux arm64 (DEB). Automated resource and
activation checks are not full interactive native-installer acceptance tests.

Deprecations:

None. This remains an unsigned prerelease, not a signed stable distribution.
Merge the version bump before manually dispatching the Desktop release workflow
with tag `v0.2.2` and the exact merged Runtime commit. Let the workflow create the
tag; pushing that tag directly selects the signed stable workflow instead.

## 2026-09-05 (0.2.1)

### Muse appears in the provider list without a relaunch

Behavior change:

The 0.2.0 preview left Meta Muse out of the desktop provider list on hosts that
had it installed. The bundled runtime inherited a PATH captured before the muse
installer ran — the installer writes its directory into the User PATH in the
registry, which no already-running process picks up — so it could not resolve
`muse`, reported it as degraded, and the desktop filtered it out.

The runtime bundled with 0.2.1 resolves a provider from the directory its own
installer uses when PATH cannot see it, so Muse shows up as ready immediately
after install. On Windows it also runs the recorded `muse-bin-<version>.exe`
directly instead of going through the `muse.cmd` launcher, which removes a
console flash on every launch from the desktop and roughly four seconds of
launcher startup from every probe and turn.

Migration steps:

None. If you installed Muse and did not see it, this build is the fix; no
relaunch or PATH change is needed.

Deprecations:

None.

## 2026-09-05

### Meta Muse joins the provider set and Aider is removed

Behavior change:

Meta's Muse CLI (`muse`) is now a fully supported provider. Packaged setup can
install, detect, upgrade, and uninstall it on Windows, macOS, and Linux, it
appears in the onboarding CLI grid, and it is selectable as an execution target
with model and reasoning-effort controls. Sessions run headless through
`muse exec --json` and resume with their history intact.

Aider is removed. It could be installed and detected but never executed, so it
was hidden from the onboarding grid and absent from the execution catalog. Its
installers, setup assets, and packaging entry are gone.

Two limits are worth knowing before selecting Muse:

- Muse reports no token usage at all, so metering and cost surfaces stay empty
  for this provider. This is a limit of the CLI, not of the integration.
- Muse exposes no per-tool allowlist, only three capability switches (writes,
  shell, web tools). A tool allowlist that names part of one of those groups is
  refused rather than silently widened to the whole group.

Migration steps:

If you use Aider through Cats, install it yourself from
https://aider.chat/install.sh; Cats no longer manages it. Nothing else changes
for existing providers.

To use Muse, install it from packaged setup and run `muse login` once. The
credential is stored in `~/.config/muse/auth.json`; there is no API-key
environment variable that substitutes for that account sign-in.

Deprecations:

Aider is removed rather than deprecated. The `aider` provider id no longer
resolves anywhere in setup, packaging, or the execution catalog.

## 2026-09-02

### Tray update checks refresh stale results

Behavior change:

Choosing **Check for Updates** from the system tray now performs a fresh
provider query after a prior `up_to_date` or `failed` result. Previously, a
long-running Desktop process replayed the earlier informational dialog, so a
release published after that check remained invisible from the tray even
though `Settings > Desktop > App updates` found it correctly.

Migration steps:

None.

Deprecations:

None.

### The legacy `/api/setup/complete` bootstrap route is removed

Behavior change:

`POST /api/setup/complete` — the original Chat-owned onboarding route that
created a Boss Cat and set `setupCompleteAt` — is removed. It could complete
setup without creating an Admin, which was a second bootstrap path around the
first-admin invariant added earlier the same day. `POST /api/platform/setup/complete`
is now the only setup-completion route, and it always creates the first local
Admin.

`POST /api/setup/reset` is unchanged and still used by Settings.

Deprecations:

The route, its renderer client (`completeSetup` in the shared and Chat renderer
setup APIs), and its pre-auth public-route exception are gone. `completeSetup`
had no caller left in the renderer.

Migration steps:

Anything still calling `POST /api/setup/complete` must move to
`POST /api/platform/setup/complete` and send `adminIdentifier` and
`adminPassword`. Two behavior differences matter: the platform route rejects a
`bossCatName` field because the Guide Cat name is system-managed, and it does
not create a Boss Cat. Assign one afterwards through `POST /api/cats` with
`makeBoss: true`, or `PATCH /api/cats/:id` with `makeBoss: true`.

### First Admin is always local, and Google is linked from Settings

Behavior change:

Setup now requires an Admin identifier and password. `/api/platform/setup/complete`
rejects a missing or partial pair with `400 invalid_admin_credentials` before it
writes any owner, Guide Cat, setup, or auth state, so a workspace can no longer
reach `setupCompleteAt` without a local Admin. During the promotion period an
Admin password must contain 8 to 256 Unicode code points; Cats applies no
uppercase/lowercase/digit/symbol rule and accepts spaces and password-manager
output. Length is counted in code points, so an emoji counts once.

First-admin creation is serialized and rechecks "no Admin exists" inside the
same auth-state write. Two concurrent submissions now produce exactly one
Admin; the loser receives `409 already_complete` and creates nothing. Auth
state is written before the chat/core snapshot and rolled back if that snapshot
fails.

`Settings > General > Account` now reports real login-method state and owns the
Google lifecycle. Linking or unlinking Google requires re-entering the local
password: the server issues a single-use action grant, valid for five minutes
and bound to the account, browser session, and purpose, which the browser sends
in `X-Cats-Auth-Action`. A stolen session and CSRF token are no longer enough
to attach a Google identity. A verified Google email must match the account
email; an account created with a non-email handle adopts the verified address
on its first successful link. Unlinking refuses to leave the account without a
local password, and on success revokes every other browser and mobile session
for that account while keeping the device that performed it signed in.

Ordinary Google login is unchanged in intent and stricter in practice: it
resolves only an already-linked Google `sub` and no longer rewrites the Cats
account email from the provider.

Deprecations:

`POST /api/auth/google/setup` — the standalone Google-only first-admin route —
is removed along with its renderer wrapper, domain helper, and public-route
exception. It had no supported setup UX. `/api/auth/google/link` and the new
`/api/auth/google/unlink` are protected routes now, not pre-auth ones.

Migration steps:

None for existing workspaces: an already-created Admin keeps working, and a
linked Google identity is unaffected. Operators automating first-run setup must
add `adminIdentifier` and `adminPassword` to their
`/api/platform/setup/complete` request body.

## 2026-08-05

### Desktop runtime setup opens in an authenticated system browser

Behavior change:

Desktop links to Cats Runtime setup, dashboard, and playground surfaces once
again open in the user's system browser instead of replacing the current
Electron page. Before opening the browser, the authenticated Desktop renderer
requests a 30-second, single-use handoff. The platform stores only its hash,
consumes it before issuing a separate HttpOnly browser session cookie, and
redirects to the allow-listed Runtime surface. Replays, expired handoffs,
non-Runtime return paths, and open redirects are rejected. The final Runtime
URL contains no handoff credential.

Migration steps:

None. The system browser receives its own Cats session the first time a
Desktop Runtime link is opened.

Deprecations:

None.

## 2026-08-04

### Every platform entrypoint provisions its first-run auth secret

Behavior change:

Clean `cats-platform`, `cats-one`, local dev, and packaged Desktop starts no
longer require an operator-created `.env` before the first-admin setup form can
complete. When no explicit `CATS_AUTH_SESSION_SECRET` is configured, the
platform server generates a 256-bit secret, persists it in the user-local
platform config directory, and reuses it across launches. Persistence uses an
atomic no-clobber publish so concurrent hosts converge on one value;
filesystems without hard-link support use an exclusive-copy fallback, while
permission errors remain fail-closed. Invalid files are quarantined and
regenerated, and stale temporary/invalid artifacts are cleaned during
provisioning. Direct CLI users receive an actionable path on stderr; Desktop
captures the same sidecar diagnostics and keeps real I/O failures on the
retryable bootstrap page. First-admin configuration failures use a safe
`503 configuration_error`, and unexpected pre-auth setup failures no longer
return raw exception messages, including failures caught by the server-level
request handler. Platform-launched project processes and shell helpers strip the
auth secret, runtime API key, Telegram credentials, and ngrok auth tokens from
their environments. The Windows installer smoke check honors custom
Desktop/platform data roots.

Migration steps:

None. Existing explicit secrets remain authoritative and are not overwritten.
Clustered or ephemeral deployments should configure their own shared
`CATS_AUTH_SESSION_SECRET`; single-host installs can keep the generated value.

Deprecations:

None.

### Desktop runtime setup links retain the authenticated app session

Behavior change:

Desktop links that open same-origin Cats surfaces in a new window, including
`/runtime/setup`, now navigate inside the authenticated Electron window. They
no longer open the system browser without the Desktop session cookie and fail
with `E_UNAUTHENTICATED`. Different-origin HTTP(S) links continue to use the
system browser, and unsupported URL schemes remain blocked.

Migration steps:

None.

Deprecations:

None.

## 2026-05-10

### Platform auth rollout in progress

Behavior change:

PLAN-089 server-side auth foundations now include the global route gate.
Browser local login/logout/status and Cats Mobile bearer login/logout/status
routes exist, setup-complete missing/corrupt auth state enters a constrained
repair path through `POST /api/auth/repair/first-admin`, and protected
Chat/Work/Code/Core/runtime/shell/transport APIs reject unauthenticated
requests before product dispatch. Setup-complete unauthenticated app-shell
reads return only the minimal setup/auth bootstrap envelope.

Migration steps:

Set `CATS_AUTH_SESSION_SECRET` before testing first-admin local login or mobile
bearer sessions. Keep `CATS_AUTH_ALLOWED_BROWSER_ORIGINS` explicit for every
trusted browser origin that may submit setup/login/repair/Google credential
POST requests.

Do not rely on `CATS_AUTH_ENABLED=false`; it is an unsafe dev/test escape hatch
and is rejected after `setupCompleteAt` exists. When an operator forgets the
only admin credential, delete only
`<platform-state-dir>/auth-state.local.json`, restart, and complete repair from
the one-time token written to
`<platform-state-dir>/auth-recovery-token.local.txt`. Deleting the auth state
file removes accounts, identities, memberships, and sessions, but leaves
product data intact.

Bounded aggregate login cooldowns no longer require auth-state deletion for
recovery. Operators can clear throttle state through the authenticated
admin+CSRF route or the one-time recovery token.

Cats Mobile now keeps Google login separate from browser GIS. The mobile
client discovers public mobile Google client ids from `/api/mobile/auth/status`,
starts a mobile OIDC flow, posts the resulting ID token to
`/api/mobile/auth/google/login`, and receives a mobile bearer token only after
the server verifies the token against `CATS_AUTH_GOOGLE_MOBILE_AUDIENCES` and
the per-attempt nonce.

Downstream tooling may key on these pinned error codes: `E_UNAUTHENTICATED`
for `401`, `E_FORBIDDEN` for plain authorization failures, and
`E_CSRF_MISMATCH` for Cats synchronizer CSRF failures.

Deprecations:

None in this slice.

## 2026-04-30

### Chat routing after ADR-091

Behavior change:

Existing non-direct participant chats changed routing behavior: a no-mention
user turn now enters the orchestrator first instead of auto-dispatching to
`defaultRecipientId`. Direct/private lanes still route unmentioned turns to the
direct participant, and explicit `@mention` routing is unchanged.

Migration steps:

Operators with older local rooms should mention the intended participant or
choose a per-turn audience when they want a specific Cat to answer first.

Deprecations:

None.
