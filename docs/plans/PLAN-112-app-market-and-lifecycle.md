# PLAN-112: App Market and Lifecycle

## Metadata

| Field | Value |
| --- | --- |
| Status | In progress; unreleased preview Market slice (2026-10-20); M0–M4 milestones open |
| Owner | cats-platform integration; cats-apps package/catalog; Runtime scoped operations |
| Spec | [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md) |
| Decision | [ADR-121](../decisions/121-distribute-apps-independently-with-host-owned-lifecycle.md) |
| App delivery | [Apps PLAN-004](../../../cats-apps/docs/plans/PLAN-004-independent-app-distribution.md) |

## Outcome

One host upgrade completes the App lifecycle and the official Market. Usage is preinstalled
and recoverable; Studio is installed from the catalog, and later compatible App updates do
not require rebuilding Desktop. Disabling stops activity, and removing really deletes the
installed copy. The phases below are in dependency order and are not announced as separate
product completions; the first-release gate must cover the full delivery scope.

## Ownership and integration seams

[PLAN-115](PLAN-115-app-components-and-private-services.md) extends the same App
installation with multiple frontends/services/workers. Coordinate manifest,
journal, migration and lifecycle work in M0; each release activates/stops/removes
its components together. The renderer-only scope below describes this plan's
initial consumer coverage, not a permanent restriction on Apps or a reason to
install their backends separately.

[PLAN-113](PLAN-113-managed-plugin-capabilities.md) is a separate managed Plugins work item.
The Agency content pilot has shipped; the general SDK/catalog is still to be implemented.
M0 and its P0 coordinate the shareable installer/catalog/journal contracts; this plan stays
with renderer Apps, does not wait for a Plugin executor, and adds no arbitrary background
programs. This paragraph is cross-planning and adds no completed items to this plan.

| Owner | Work / contract | Out of bounds |
| --- | --- | --- |
| Platform | SDK, Catalog consumer, download, registry, journal, management/Home, Core work data | Does not parse provider CLIs or let Apps operate the host shell |
| Apps | Usage/Studio packages, metadata, compatibility evidence, build/release, official catalog promotion | Does not modify Desktop pins or grant itself preinstall/system permissions |
| Runtime | Work-termination evidence, receipt retention and necessary scoped cleanup | Does not manage Home/Market/the install registry |
| cats-one | Update the cross-repo release guide/workspace docs when needed | Does not become an App update service |

Once Platform freezes the shared DTOs, Apps can build artifact/catalog fixtures in parallel.
If Runtime needs a new stop-query or scoped-deletion contract, first read the rules in the
Runtime owner repo, add the SPEC/PLAN/ADR, then implement and integrate; this round does not
modify Runtime and does not assume these contracts are already fully provided.

## M0 — Freeze contract and upgrade fixtures

- [x] Confirm the Usage/Studio shipping and Home rules, and the data and resource boundaries.
- [x] Audit the existing gaps in registry-only uninstall, corrupt same-version repair and bundle version selection.
- [x] Sync the Apps plan: a standalone Marketplace/prominent Home entry, Settings installed
      management, and the requirement that the host verify the Desktop management context;
      this item completes only the planning sync.
- [ ] Fix the contract for issuing/passing, revoking, and anti-forgery/replay protection of
      the Desktop management context; all management entries share the authorization, the
      App SDK grants no package-management capability, and browser-rejection fixtures are built.
- [ ] Fix schema 2 / operation journal / bootstrap marker, the catalog signature envelope,
      source transition, and error/progress DTOs; set download/catalog size and timeout limits.
- [ ] Build schema 1 fixtures for enabled / disabled / uninstalled / absent / manifest-only / local Studio.
- [ ] Confirm the stop evidence and data-cleanup ownership Runtime can provide, and record the contracts that must be extended.
- [ ] Complete an independent review of the technical contract; record the next Platform minor and the App range update dependency.

Exit: no unassigned deletion owner and no shortcut that overwrites old data with the new schema.

## M1 — Local lifecycle, recovery and Home

- [ ] Implement validation / backup / atomic migration, operation lock / journal, and crash-restart recovery.
- [ ] The management service verifies the Desktop context; it rejects ordinary browser/remote
      lifecycle mutations, including owner login and localhost; a rejected operation must not
      modify the registry/package/process.
- [ ] Implement the host shipping/Home policy: Usage placeholder, Studio card after install, cross-window state sync.
- [ ] Disable: immediately revoke new-work permission, unload every active renderer, and track cancellation and pending-confirmation state.
- [ ] Remove: really clean the managed packages/cache, keep data and a tombstone, and support file-lock retry.
- [ ] Repair: same-version atomic replacement from a trusted local archive; a broken App does not block Home.
- [ ] Rewrite bundled reconciliation: first install is separate from user intent, no downgrade, and removed items are not resurrected.
- [ ] The uninstall copy explains data retention, reinstall reattaches works/settings, and no permanent data-purge action that is not yet implemented is offered.

Exit: first complete the local management paths of AC-01–AC-08, AC-11, AC-14 and AC-16 with
temporary packages; a real Grok or the public Market is not needed, and the Market-entry AC-16
acceptance is left to M2.

## M2 — Official Catalog and Market

- [ ] Implement signed Catalog verification, revision/expiry/withdrawal, and trust-root and key-rotation fixtures.
- [ ] A bounded host downloader, URL/redirect allowlist, and artifact digest/manifest/compatibility verification.
- [ ] The prominent Home entry opens a standalone Market; discover/installed/updates/details
      can install directly; integrate Home repair and Settings through the shared authorization,
      lifecycle service and state, without duplicating install logic.
- [ ] Install and manual-update UX, confirmation of newly added permissions, defer/stop choice for active work, and offline/expired-catalog prompts.
- [ ] Verify the same-ID local-user to official-source transition; it must not silently escalate permissions or overwrite a local development package.
- [ ] Integrate the Apps two-version fixture and verify download errors / interruption / same-version repair / compatible rollback.

Exit: the Market paths of AC-02/03/07–AC-10/13/15 and AC-16 succeed;
the temporary Catalog signing key is used for tests only.

## M3 — Developer SDK and independent App delivery

- [x] From the existing host-owned SDK, extract independently obtainable types, docs, examples
      and conformance fixtures; per
      [ADR-123](../decisions/123-expose-app-sdk-contract-as-platform-npm-subpath.md),
      first provide the allowlist contract and a cross-OS byte-deterministic official encoder
      through the `./app-sdk` subpath, the public entry does not load `build/server` internal
      modules, `APP_SDK_VERSION` and the `packages/app-sdk/package.json` version are kept
      consistent by a single source or a CI assertion, and Platform test fixtures use the same
      encoder. On 2026-09-29 the subpath, encoder, shared validation and version-consistency
      check were implemented, and fixture conversion, examples and conformance vectors were
      added; Platform npm 0.6.0 published this entry the same day.
- [ ] Apps depend only on the versioned development contract; the runtime bridge is not
      repackaged or widened in capability. Apps whose minimum host is not below the first
      version that provides the subpath validate their artifacts against their own declared
      minimum `catsPlatform`, provided that version is published on npm; the per-App install
      or CI matrix is designed by cats-apps.
- [ ] Build a minimum-version and real-validation matrix for Usage/Studio against the candidate Desktop's new minor.
- [ ] Apps build/release produces immutable bytes, a lock and source evidence; catalog promotion is a separate action.
- [ ] Verify that both Usage and Studio are in the catalog, Desktop preinstalls only Usage, and Studio has no default placeholder.
- [ ] Complete the Studio A→B update on a source-free host without rebuilding Desktop; pass AC-12/13.

Exit: reviewable App/Catalog/SDK candidate artifacts and validation records are complete; this
does not yet mean a public release.

## M4 — Installed acceptance and release preparation

- [ ] Cross-OS isolated install / upgrade from the existing schema 1, including Windows file locks and Unix path/permissions.
- [ ] On a real host: multi-window disable, restart during cancellation, broken-package recovery, and before/after package inventory/bytes evidence.
- [ ] Have another reviewer check data ownership, deletion containment, migration and trust boundaries.
- [ ] Complete the table mapping every SPEC AC; list unverified OSes/behaviors explicitly and do not pass off fixtures as installed acceptance.
- [ ] Prepare version / release notes / trust root / exact pins, enable the Pages endpoint
      selected in SPEC-120 FR-09 and the Actions signing; keep other teams' new changes.
- [ ] Schedule the SDK (if needed), App, Catalog and Desktop releases under a new release authorization, not reusing the 0.5.13 authorization.

## Change map

| Surface | Planned work |
| --- | --- |
| `src/platform/apps/registry.ts`, `packageInstaller.ts`, `paths.ts` | schema, operation coordination, bundle policy, repair and restricted cleanup |
| `src/platform/apps/envelope.ts`, `src/shared/catsAppManifest.ts` | state projection, source and Home policy; freeze first, then integrate |
| `src/app/server/appPackageRoutes.ts`, `src/platform/apps/images.ts` | management operations, revocation, stop tracking, data-owner integration |
| `src/app/renderer/AppRendererSurface.tsx`, `AppHostRoute.tsx` | active teardown, invalidation and host-recovery UI |
| Home / Settings Apps / new Market surface | shared management client and operation DTOs |
| `packages/app-sdk`, Desktop bundle config / packaging | obtainable development contract, trust root, Usage pins and shipping policy |
| root `package.json` `exports` | allow only `.`, `./package.json` and `./app-sdk`; the compatibility `./*` is removed with 0.6.0 (ADR-123) |
| Apps shared builder / release workflow / new catalog tooling | immutable package and independent promotion, see Apps PLAN-004; after a catalog PR is merged, Actions signs it and deploys to cats-apps Pages |

The change map is a plan; no new endpoint has been created, and no claim is made that existing
APIs support new parameters.

## Deferred data deletion

Fully and permanently deleting App data across Platform/Runtime is a later, separate work
package and is not part of the first-release gate. M0 inventories ownership, but M1 only
guarantees data-preserving uninstall/reinstall. Later, the scoped deletion/retention contract
of each data owner must be added first, and shared references, permissions, partial failure
and recovery verified, before a delete operation can be offered.

## Validation and risks

The documentation phase only checks the diff, links and requirement consistency; it does not
run App builds, Desktop installs or providers. Implementation runs unit / boundary /
integration and real-host checks per phase, with all synthetic data in an isolated profile.
Before release, run the full candidate CI per the release SOP; partial tests must not stand in
for all passing.

| Risk | Required validation / safeguard |
| --- | --- |
| Old Desktop startup after upgrade | explicit minor boundary, profile upgrade/restore guidance, no dual-run execution API |
| Independent App update overwritten by the bundle | newer Market version + older bundled version + restart / Desktop update scenarios |
| Uninstall only hides but work continues | active revoke, multi-window, fake-CLI termination evidence and pending state |
| Repair deletes works or crosses boundaries | same-version staged replacement, externalized data, symlink/junction and shared-reference tests |
| Same-ID impersonating official / catalog replay | trust root, digest identity, source transition confirmation, revision gate |
| Browser or App iframe obtaining Desktop management rights | verify context at the service boundary, reject forged/invalid/replayed, and verify no package-state side effects |
| Scope growing into a general extension host | official renderer only; a new background executor is a separate plan |

## Resume checkpoint

2026-09-28: planning document created, with no product code / manifest / version / user-data changes.
The next step starts from M0's persisted-state / operation contract and fixtures, then M1 local lifecycle.
The public Catalog endpoint, the owner for official signing-key custody/rotation, and the exact
release version are left to release preparation; these deployment choices do not block isolated
implementation and do not authorize generating an official key or uploading artifacts.

Document validation: an independent read-only review is complete, the scope contradiction between
first-release data retention and later permanent purge was fixed, and no blockers remain.
In this round the 970 local link targets across 10 Platform Markdown files exist; the Apps docs
check also passed. The diff whitespace check passed in both repos. No product tests, build,
install or provider calls were run; these results validate only the planning documents and
check no acceptance of any newly added feature.

2026-09-29: filled in the management-entry and Desktop authorization requirements of Apps PLAN-004,
added AC-15/16 and the corresponding M0–M2 work. The delivery status of the Agency Plugin pilot
was synced, but it does not exempt App Market acceptance. This change updates the plan only; it
did not implement management restrictions, change versions or publish. The independent read-only
review had no blockers; the 6 changed Markdown files across the two repos, with 35 local file/anchor
targets, passed using the matching worktrees, and Apps `npm run check:docs` passed (38 Markdown
files, 156 local targets, no skipped sibling links). `git diff --check` passed in both repos. No
product tests, build, install or provider calls were run; no newly added feature's acceptance was
marked complete.

2026-09-29: added [ADR-123](../decisions/123-expose-app-sdk-contract-as-platform-npm-subpath.md)
(Proposed), recording that the SDK development contract is first provided through the Platform npm
`./app-sdk` subpath, and `@cats-inc/app-sdk` is published separately once third-party development
starts; synced M3, the change map, SPEC-120 FR-10 and the index. Documentation changes only; did
not modify `package.json`, the SDK, versions or publishing. Findings: the npm registry shows Platform
`latest` 0.5.8 (unpacked about 18.9 MB, 3,609 files), and the 0.5 line has only 0.5.1 and 0.5.8; the
minimum hosts in the Usage and Studio manifests are `^0.5.0` and `^0.5.11`. Searching five checkouts
for the bare package name and `<subpath>` found that only cats-one's `package.json` resolves them in
code. On local Windows the `zlib.gzipSync` header OS byte is 10; Linux/macOS are unverified. The 399
local link targets (including sibling repos) in the 6 changed Markdown files exist, and
`git diff --check` passed. No product tests, build, install or provider calls were run.

2026-09-29: implemented the first phase of ADR-123 (excluding the separate npm release). Added the
`./app-sdk` exports, `packages/app-sdk/format.js`/`encode.js`, the `src/app-sdk/` public entry and
shared validation, and the installer now uses the same validation; `exports` was added in a
compatible way that keeps `.` and `./*`. No version bump or release. Local validation: `tsc --noEmit`
for server, desktop and renderer passed; the test config has only 2 `mobile/` errors caused by the
worktree not having mobile dependencies installed. After `build:server`, `build:host`, `build:web` and
`build:test-ui` completed, 17 test files, including the new tests and those for App/SDK/package/Desktop
packaging, passed with 97 cases in total. An external consumer (NodeNext) also completed type-checking
and runtime import. The full `npm test`, mobile checks and macOS were not run; fixture conversion and
the cats-apps switchover are still pending.

2026-09-29: Valid hand-assembled packages in Platform tests now use the official encoder (invalid
packages and one zlib baseline package stay hand-assembled); added `examples/app-sdk-minimal-app` and
25 conformance vectors. The vectors found that the decoder's base64 regex overflows the stack on files
of about 3 MiB or more, which was changed to a linear check. The Desktop source package runs
`npm ci --ignore-scripts` before rebuilding the App revision of the declared dependencies. #171 set the
next version to 0.6.0, and `exports` accordingly drops the compatibility `./*`; the redone import
survey still found only the `package.json` resolution. Local validation: `tsc --noEmit` for server,
desktop and renderer passed, with the test config left with only 2 `mobile/` dependency errors; the
mobile boundary passed; after the rebuild 15 related test files passed with 121 cases in total. The
full `npm test`, mobile and macOS were not run.

2026-10-20: The owner decided the first-phase deployment choices, recorded in SPEC-120 FR-09: artifacts
keep using cats-apps GitHub Releases, the catalog goes on cats-apps GitHub Pages, and the official
signing key is stored first as an Actions secret; a custom domain and stricter key custody are left
for later. This replaces the part of the 2026-09-28 checkpoint that said "endpoint and key custody are
left to release preparation"; the key-rotation owner and the exact release version are still pending
release preparation. This change only updates documents; it did not enable Pages, generate a key, or
modify workflows or upload artifacts. Findings: `cats-inc/cats-apps` is public, and the Pages API
returned 404 (not enabled). Only the diff and `git diff --check` were checked; no product tests or
build were run.

2026-10-20: The user asked for a verifiable minimal Market first and authorized generating the
official signing key. SPEC-120 FR-09 fixes catalog schema v1 and records the preview slice and the
unfinished items; the checked items of M2 are all only partly done, so they are not ticked. cats-apps
has set `CATALOG_SIGNING_KEY` as a repo secret, and the public key for keyId
`cats-apps-catalog-2026-10` is also written into `src/platform/apps/catalogTrust.ts`. Added
`catalog.ts` (signature verification, schema, cache, anti-rollback, expiry), `catalogFetch.ts` (HTTPS,
manual redirect and host allowlist, byte cap), `market.ts` (compatibility, bundle protection, manifest
comparison, install-source record), two `/api/apps/_market` routes, the `/lobby/market` page and a Home
card. Measured on Node 24: a release asset with `redirect: 'manual'` returns 302 to
`release-assets.githubusercontent.com`; Desktop IPC builds the URL from the full path, and `?refresh=1`
is preserved. Local validation: `tsx --test` ran `app-catalog`, `app-market-routes`,
`app-component-authority` and `app-market-page`; after `npm run build:server` and
`npm run build:test-ui`, `node --test --test-isolation=none` ran `platform-lobby-apps`,
`app-market-page`, `app-catalog`, `app-market-routes`, `app-component-authority`,
`mobile-i18n-web-parity`, `app-package-routes`, `cats-app-hosting`, `platform-settings-apps`,
`settings-apps-error-i18n` and `tests/app-sdk-bundled-sidecar.test.js`, `app-components.test.js`,
`app-images.test.js`, 79 cases in total passed. `tsc --noEmit` for the server, desktop and renderer
configs passed; the test config has only the 2 existing errors from the worktree lacking mobile
dependencies. `npm run catalog:check` passed. The full `npm test`, mobile checks, macOS/Linux and the
installed Desktop were not run; real-catalog end-to-end validation waits for the push and first
release, then runs with a source candidate Desktop.

2026-10-20 independent review: the read-only reviewer pointed out that the install request was not
bound to the version the user saw (blocking), and non-blocking issues in key rotation, producer field
limits, revision/expiry bounds, workflow signing scope, bundle judgment after purge, replacement of a
non-Market copy, state-file read failure and enabled-state timing; all were fixed with tests added:
the install request carries version and permissions, `catalog_changed` 409, bundle lock judgment,
`installedSource`, time bounds, corrupt backup and unknown schema not overwritten, enabled state kept
inside the install queue, source-record write failure not affecting install, and a 45-second download
timeout. Re-running the build and the 13 test files listed above passed with 81 cases in total; the
four `tsc` configs and `catalog:check` results are the same as above. A second independent review
confirmed these fixes and found no new defects. At the user's request, GitHub Pages for cats-apps was
enabled with Actions as the source.

*Last updated: 2026-10-20*
