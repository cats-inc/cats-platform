# ADR-123: Expose the App SDK Contract as a Platform npm Subpath

## Status

Accepted for Stage 1, 2026-09-29. The user first asked for the npm/SDK distribution
discussion to be organized into a document, and the same day asked to start Stage 1
implementation (excluding independent npm publication). Stage 1 is implemented in Platform
with tests, but has not been released in any Platform npm version; Stage 2, version bumps
and any npm publication still need separate authorization. The
[implementation record](#stage-1-implementation-2026-09-29) lists two corrections that
differ from the original proposal.

This ADR adopts the `@cats-inc/cats-platform/app-sdk` entry name already proposed in the
Interface Direction of [ADR-094](094-adopt-cats-app-packages-as-extension-boundary.md)
(Proposed), and picks a staged delivery approach for the "independently obtainable
development contract" of [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md) FR-10 and
[PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md) M3. It does not change the App
distribution and lifecycle decisions of
[ADR-121](121-distribute-apps-independently-with-host-owned-lifecycle.md), and does not
expand what Apps can execute.

## Context

### Apps and Plugins are already distributed as artifacts

- cats-apps pushes a `<slug>-vX.Y.Z` tag per App and publishes the immutable `.catsapp` to
  GitHub Releases; Desktop selects it by the exact version, URL and SHA-256 in
  `config/desktop-apps.lock.json`.
- cats-plugins produces a canonical ZIP; the host admits it through its own fixed digest
  allowlist ([ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md)).
- Each owner has already written that npm is not used: SPEC-120 FR-07 forbids running
  `npm install` in the install path; the
  [cats-one architecture](../../../cats-one/docs/architecture.md) states that cats-apps is
  not a launcher dependency; [cats-apps AGENTS.md](../../../cats-apps/AGENTS.md) states that
  App packages are not an npm publishing target; the
  [cats-plugins deployment](../../../cats-plugins/docs/deployment.md) blocks npm publication
  with `private`.
- If npm dependencies were used instead, every new App/Plugin would require changing the
  launcher and releasing; an npm range would swap versions on re-resolution or reinstall a
  unit the user had removed, which conflicts with the host policy of ADR-121 §1, §3, §6, the
  separation of publication/promotion/installation, and user choice taking priority.

### What needs npm is the development-time contract

- Current SDK state: `packages/app-sdk` (`@cats-inc/app-sdk` 1.3.0, `private`) ships with
  the `files` of the Platform npm package and the Desktop sidecar; Platform uses it at
  runtime through the internal alias `#cats-app-package`, and `scripts/bundle-server.mjs`
  keeps that alias external.
- `packages/app-sdk/package.js` contains both the author contract and host-only code:
  - Author contract: `decodeAppPackage`, `supportsVersion`, `MAX_PACKAGE_BYTES`,
    `APP_SDK_VERSION`.
  - Host-only: `PLATFORM_VERSION` (read from `../../package.json` with `createRequire`),
    `resolveAppLock` (including the GitHub download policy), `materializeAppSelection`,
    `readBrowserSdk`.
- The validation the installer actually applies is split across two places:
  `validateRendererPackage` (`src/platform/apps/packageInstaller.ts`) first calls
  `decodeAppPackage`, then checks the manifest with `parseCatsAppManifestV1` from
  `src/shared/catsAppValidation.ts`. The manifest types and validation are `src/shared/*.ts`,
  compiled into `build/server`; `packages/app-sdk` is plain JS and `.d.ts` with no build
  step.
- The `.catsapp` format has no official encoder. The `scripts/build-app.mjs` of cats-apps
  assembles the gzip JSON envelope itself; Platform also has 6 test files that each
  hand-assemble envelopes. cats-apps CI checks out only its own repo, so artifacts are not
  validated by the host until Desktop packaging or actual installation, by which time the
  corresponding `<slug>-vX.Y.Z` Release is already immutable.
- The existing encoder is reproducible only on the same OS: Node `zlib.gzipSync` writes an
  OS byte into the gzip header, measured as 10 on local Windows. The CI and release of
  cats-apps both run on `ubuntu-latest`, so rebuilding the same version on Windows yields
  different bytes; the Linux/macOS values were not verified locally.
- cats-apps requires "use the published host contract, do not import sibling source"; with
  no published contract, the only option is to rewrite the format.

### Verified npm and import facts (2026-09-29)

- npm registry: Platform `latest` is 0.5.8, about 18.9 MB unpacked, 3,609 files; only 0.5.1
  and 0.5.8 have been published on the 0.5 line. The minimum hosts Apps declare differ:
  Usage 0.4.0 is `catsPlatform ^0.5.0` / `appSdk ^1.2.0`, Studio 0.1.0 is `^0.5.11` /
  `^1.3.0`.
- Platform `package.json` has no `exports` field, only `main` (`build/desktop/main.js`),
  `bin` and internal `imports`. [ADR-013](013-ship-cats-inc-as-an-executable-self-hosted-npm-app.md)
  §2 positions this package as application-first, and it may offer a small programmatic
  interface.
- cats-one reads the manifest with `require.resolve('@cats-inc/cats-platform/package.json')`,
  then launches Platform by file path according to `bin`; the packaging check in cats-one CI
  goes through the same path.
- cats-runtime already uses `exports` to provide the main entry, `./catalogs` and
  `./package.json` together.
- Searching the five checkouts (excluding `node_modules`, build and dist output) for the bare
  package name `'@cats-inc/cats-platform'` and `@cats-inc/cats-platform/<subpath>`: the only
  code is the `package.json` resolution above, with no import of the main entry or other
  subpaths; the rest is documentation, including `app-sdk` in ADR-094/SPEC-098, and the
  `core` planned for mobile in ADR-092/SPEC-095/PLAN-084 (mobile code does not currently use
  it).

## Decision

1. **Apps and Plugins are not installed through npm resolution (restated for the Platform
   side).** The host admits only verified artifacts, does not load an App or Plugin from
   `node_modules`, and does not require the launcher or Platform to depend on them via npm.
   npm carries only the development-time contract. The corresponding rules in other repos are
   kept by their own owners; this ADR adds no rules for them.

2. **Stage 1: Platform npm provides an `./app-sdk` subpath.** Platform declares `./app-sdk`
   in `exports`, pointing to a public entry file that re-exports only an allowlist; the host
   internals keep using the full content through `#cats-app-package`. How the file is
   physically split is an implementation detail, but it must not change how `readBrowserSdk`
   finds `browser.js` ([app-packages](../app-packages.md) records an incident where the SDK
   could not be read after `import.meta.url` was moved by bundling).
   - Public: types such as `CatsAppBrowserSdkV1` from `browser.d.ts`, the `cats.app.json`
     manifest types, the same package and manifest validation the installer applies,
     `supportsVersion`, the size-limit constants, `APP_SDK_VERSION`, and the newly added
     official `encodeAppPackage`.
   - Not public: `PLATFORM_VERSION`, `resolveAppLock`, `materializeAppSelection`,
     `readBrowserSdk`, and `browser.js` itself.
   - `browser.d.ts` is the author contract; `browser.js` is the runtime bridge injected by
     the host, and App packages must not bundle it (ADR-121 §7, SPEC-120 FR-10).
   - The public validation must be exactly the validation the installer uses, with no second
     validator; a package that passes App CI must not be rejected at install time by the
     same-version host because of format or manifest rules.
   - The public entry must not load server runtime modules (server entry, routes, store,
     etc.) or Platform runtime dependencies; it may load only the format, encoder and
     manifest validation modules. Manifest validation lives in `src/shared/*.ts` and is
     compiled into `build/server`; making it serve both the installer and the public entry
     from a single source is the main implementation work.

3. **The official encoder must be byte-deterministic across OSes.** The same input must
   produce the same bytes on Windows, macOS and Linux, so that the cats-apps rebuild check
   "same version with different content fails" and the SHA-256 pin are preserved. The encoder
   must fix the platform- or time-dependent fields in the gzip header (OS byte, mtime), or
   use an equivalent approach that guarantees identical bytes, and prove it with a cross-OS
   hash comparison test; the producer CI of cats-plugins already compares Windows, Linux and
   macOS with a similar method. Platform tests also use the same encoder to generate
   fixtures, apart from deliberately constructed invalid packages.

4. **`exports` is added compatibly; tightening it to an allowlist is the breaking step and
   ships at a minor boundary.** Declaring `exports` blocks every package path not listed, so
   Stage 1 declares at the same time:
   - `.`: equal to the original `main` (Electron main, not an importable library API).
   - `./package.json`: cats-one depends on it to find Platform.
   - `./app-sdk`: the public SDK entry.
   - `./*`: keeps previously resolvable package paths resolvable. It is only a compatibility
     measure, not a public contract; documentation promises only `./app-sdk` and
     `./package.json`.
   - Adding `exports` this way is not itself breaking, so the next Platform npm release is
     not forced to bump minor because of it. The only thing lost is CommonJS's automatic
     extension completion for extensionless deep paths; the investigation found no such
     users.
   - Removing `./*` (truly blocking unlisted paths) is breaking and goes at the next minor
     boundary, when the import investigation is redone. This ADR does not bump the version.
   - 2026-09-29 addendum: #171 set the next version as the 0.6.0 minor (ADR-124), and `./*`
     is removed with 0.6.0; `exports` keeps only `.`, `./package.json` and `./app-sdk`. No
     version containing `./*` was ever published to npm, and the redone import investigation
     still finds only `package.json` resolution.
   - `bin` and Electron's `main` are not resolved through `exports` and are unaffected.
     Consumers need `node16`, `nodenext` or `bundler` module resolution; the old `node10`
     resolution does not support subpaths.

5. **The SDK version has a single source.** The `version` of `packages/app-sdk/package.json`
   is authoritative; `APP_SDK_VERSION` derives from it, or CI asserts the two are equal. The
   SDK version the host declares, the subpath content and a later standalone package are thus
   consistent.

6. **cats-apps uses the published Platform as a development dependency.** Each App obtains
   the official encoder and validation at the minimum `catsPlatform` version it declares
   (not `latest`), checks its artifact in CI, and retires the envelope implementation in
   `build-app.mjs`. Candidate host versions are tested separately per PLAN-112 M3.
   - Only Platform versions that provide `./app-sdk` can be used this way, so it applies only
     to new App versions whose minimum host is not below that version. SPEC-120 FR-11
     already requires that Apps after 0.6.0 ship separate versions declaring the new range;
     published `^0.5` versions are not rebuilt, and the existing builder is kept until the
     switch.
   - Each App's minimum host may differ (Usage and Studio differ today), and a single
     workspace devDependency cannot satisfy all of them; handle it with a CI matrix or
     per-App installation, designed by cats-apps.
   - This is cats-apps work, planned by its owner in its own repo.

7. **Stage 2: publish `@cats-inc/app-sdk` independently.** The trigger is that third-party
   App development described in ADR-121 §8 is started separately, or a non-official author
   appears who needs a lightweight install. Then it is published from the same directory in
   cats-platform, the package version is the SDK version, using a separate tag or a manual
   workflow, without affecting the Platform npm package and Desktop. Whether to keep the
   `./app-sdk` subpath is decided by the version policy at that time; Stage 2 needs separate
   publication authorization.

8. **No separate repository.** The SDK types, the host bridge and the validator must be
   changeable in one PR and tested against the real host. Splitting is reevaluated only when
   ownership or release cadence actually separate, by the same standard as the evaluation of
   "one repo per App" in
   [cats-apps ADR-001](../../../cats-apps/docs/decisions/001-own-official-utility-apps-and-coordinate-desktop-distribution.md).

## Stage 1 implementation (2026-09-29)

- Public entry: `src/app-sdk/index.ts` compiles to `build/server/app-sdk/index.js` and
  `.d.ts`, pointed to by `exports['./app-sdk']`. It re-exports only `APP_SDK_VERSION`,
  `MAX_PACKAGE_BYTES`, `decodeAppPackage`, `supportsVersion`, `encodeAppPackage`,
  `validateRendererAppPackage`, `parseCatsAppManifestV1`, the manifest constants, and the
  manifest, browser SDK and validation-result types.
- Package format split: `packages/app-sdk/format.js` is the format shared by the host and the
  public entry (decoding, version comparison, limit constants); `packages/app-sdk/encode.js`
  is the encoder used only by the public entry; `package.js` keeps only host-only functions
  and re-exports the format. They are referenced internally through the `#cats-app-format`
  and `#cats-app-encode` aliases; the semantics of the existing `#cats-app-package` are
  unchanged, and the server execution path does not load the encoder.
- One validation: `validateRendererAppPackage` in `src/app-sdk/packageValidation.ts` is the
  installer's full check (decoding, manifest, `user-app` and reserved IDs, compatible
  versions, renderer permissions); the installer's `validateRendererPackage` now passes in
  the host version and calls it. Callers must provide `platformVersion` explicitly;
  `PLATFORM_VERSION` is not public.
- Encoder (correction to how point 3 is implemented): uses the exact-pinned fflate 0.8.3
  pure-JS deflate (level 9), a fixed gzip header (mtime 0, OS byte 3), files sorted in
  path code-unit order, manifest keys sorted recursively, non-JSON values rejected, and
  self-verifies with `decodeAppPackage` before returning.
  - Trade-off evidence: recompressing the published Usage 0.4.0 (built on ubuntu) with Node
    zlib on local Windows x64, after changing the OS byte to 3, gave identical bytes; but the
    built-in Node zlib output may change with the Node version or CPU path, and arm64 cannot
    be verified here, so a pure-JS implementation that is deterministic by construction is
    used instead.
  - Cost: not byte-compatible with previously published artifacts built with Node zlib, and
    about 2% larger for the same input. Published versions are immutable, and the cats-apps
    rebuild check compares only the same output directory, so there is no functional impact.
    Upgrading fflate is equivalent to changing the bytes of all Apps, which the golden hash
    test catches.
- `exports` (correction to point 4): added compatibly, see point 4 above.
- Tests: `tests/app-sdk-public-entry.test.js` pins the public names; uses the static import
  graph to restrict the public entry to loading only the format, encoder and manifest
  validation modules; checks the SDK version is consistent in three places, the golden hash
  and header, and order independence; and confirms the public validation and the installer
  reject the same packages. `tests/package-contract.test.js` checks that every `exports`
  target is inside the npm tarball.
- Cross-OS evidence: the golden hash test passes on local Windows and in the CI (Linux) of
  PR #170; macOS is unverified, and the pure-JS implementation does not depend on the
  platform.
- Follow-up completion (same day): valid hand-assembled packages in Platform tests now use the
  encoder; deliberately constructed invalid packages and one baseline package produced by
  Node zlib stay hand-assembled, the latter ensuring the decoder still accepts previously
  published Apps. Added the `examples/app-sdk-minimal-app` example and the accept/reject
  vectors of `tests/fixtures/app-sdk-conformance-v1.json`, both run by tests. The vectors
  found that the decoder's base64 regex overflows the stack for files over about 3 MiB,
  rejecting valid 3-8 MiB files; it was changed to a linear check plus the existing round
  trip, and the accepted range is still canonical base64.
- The Desktop source bundle rebuilds the payload at the App release commit; if the
  `package.json` at that revision declares dependencies (for example the exact-pinned
  Platform App SDK), first run `npm ci --ignore-scripts` in that checkout. Revisions before
  the switch have no dependencies and are rebuilt directly as before.
- Release (same day): Platform npm 0.6.0 published this entry as `latest`; cats-apps #16 now
  builds with the exact-pinned 0.6.0, Usage 0.5.0 is the first App published with it, and the
  Desktop 0.6.0 preview selects it. The same App bytes are produced by CI (Linux) and a local
  Windows build. Stage 2 has still not started.

## Consequences

### Positive

- `.catsapp` has a single official encoder and validation; App artifacts are checked against
  the host contract in App CI, without waiting for Desktop packaging.
- No new package name, new publish workflow or new repo is needed; the existing Platform npm
  release flow is reused.
- cats-apps tests at the declared minimum host version, covering both the `catsPlatform` and
  `appSdk` declarations at once.
- It realizes the entry already named in ADR-094, without introducing a new name.

### Negative

- Authors must install the whole Platform package (0.5.8 is about 18.9 MB, plus its runtime
  dependencies). This is acceptable for cats-apps CI but unfriendly to third-party authors;
  it is one of the triggers for Stage 2.
- The development dependency is written as a Platform version while the manifest declares an
  SDK version, so documentation must explain the mapping. When Platform bumps minor for
  reasons unrelated to the SDK, authors' dependency ranges also have to be adjusted.
- For an App to test with or use a new SDK capability at some host version, that Platform
  version must first be published to npm. npm currently lags Desktop: the 0.5 line has only
  0.5.1 and 0.5.8, and the `^0.5.11` that Studio declares has no matching version on npm.
  The first Platform version that provides the subpath, and the minimum host version each App
  later adopts, must first be published to npm before cats-apps can switch; all these
  publications need separate authorization.
- After `./*` is removed, a deep import that worked up to npm 0.5.8 will be blocked by Node in
  0.6.0; the investigation found no such users, and it ships with the 0.6.0 minor.

### Neutral

- Desktop and the Platform npm package still carry the full `packages/app-sdk`; the public
  subpath is only the entry to the allowlist within it.
- When the Plugin SDK/validator of ADR-122 §4 appears, the same principle applies: format and
  validation live on the owner side, and the producer is only a user; the exact location is
  decided then.
- Cross-repo follow-ups are out of scope for this ADR: PLAN-004 of cats-apps, the retirement
  of `build-app.mjs` and CI validation; the cats-one release guide explaining that the
  Platform npm package carries the SDK subpath and its relation to App compatibility
  declarations.

## Alternatives Considered

| Option | Trade-off and decision |
| --- | --- |
| Publish Apps/Plugins to npm, with cats-one depending on them | Violates SPEC-120 FR-07 and ADR-121 §1, §3, §6, and every new unit requires releasing the launcher; not adopted |
| Publish Apps/Plugins to npm for those who need them | No consumer, installation still goes through artifacts; GitHub Releases and npm would form two immutable sources; not adopted |
| Publish a standalone `@cats-inc/app-sdk` immediately | Lightweight with clear versioning, but needs the split, a new workflow and a publication order first; only official Apps exist now, deferred to Stage 2 |
| Create a separate repo for the SDK | The host and contract cannot be changed in one PR, and ownership and cadence are not separate; not adopted |
| cats-apps CI checks out Platform source to validate | Violates "do not import sibling source" and does not correspond to a published host; not adopted |
| Keep each implementing the format on its own | Format drift is found only at Desktop packaging or installation; not adopted |

## References

- [ADR-094](094-adopt-cats-app-packages-as-extension-boundary.md),
  [SPEC-098](../specs/SPEC-098-cats-app-package-and-extension-interface.md)
- [ADR-121](121-distribute-apps-independently-with-host-owned-lifecycle.md),
  [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md),
  [PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md)
- [ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md)
- [Current package capabilities](../app-packages.md)
- [cats-apps ADR-001](../../../cats-apps/docs/decisions/001-own-official-utility-apps-and-coordinate-desktop-distribution.md),
  [cats-apps PLAN-004](../../../cats-apps/docs/plans/PLAN-004-independent-app-distribution.md)
- [Cross-repository release guide](../../../cats-one/docs/release-guide.md)
- [Node.js package entry points](https://nodejs.org/api/packages.html#package-entry-points)

*Last updated: 2026-09-29*
