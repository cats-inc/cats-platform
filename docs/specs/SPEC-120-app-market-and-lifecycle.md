# SPEC-120: App Market and Lifecycle

## Metadata

Component extension (2026-09-29): [SPEC-122](SPEC-122-app-components-and-private-services.md)
applies this App lifecycle to multiple frontends/services/workers as one selected
release. Its execution work shares this registry/transaction contract; no separate
backend installation, update or inventory item is introduced. Both tracks retain
their explicit implementation status.

| Field | Value |
| --- | --- |
| Status | Draft implementation contract; catalog schema v1 fixed; unreleased preview Market slice implemented (FR-09) |
| Owner | cats-platform; App artifacts and official catalog content are owned by cats-apps |
| Decision | [ADR-121](../decisions/121-distribute-apps-independently-with-host-owned-lifecycle.md) |
| Plan | [PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md) |
| Baseline | Desktop 0.5.13, SDK 1.3.0, Usage 0.4.0, Studio local package 0.1.0 |

## Summary and scope

Related track: [SPEC-121](SPEC-121-managed-plugin-capabilities.md) separately defines optional external capabilities,
Plugins, which share the applicable installation governance but do not loosen this SPEC's renderer-only / no-install-hook boundary.
The Agency content pilot has been delivered; the general Plugin SDK / catalog and this SPEC's App Market are still not implemented,
and the pilot cannot be taken as evidence that the shared lifecycle contract is complete.

Let ordinary users install, enable, disable, update, repair and remove official Apps from Cats Home / Market.
Usage is preinstalled and enabled and keeps a recovery entry point; Studio is optional, and without installation there is no Home placeholder.
The same App can publish updates independently; the resource effects of disabling and uninstalling must be verifiable.

This phase includes the official static catalog, user-confirmed updates, same-version repair, package cleanup, data retention and upgrade.
It does not include permanent data purge across owners, third-party submissions, payment / reviews, cross-device sync, automatic updates, arbitrary server / worker, video / image editing,
and it does not turn Chat / Work / Code into Apps. Existing SDK / CLI capabilities cannot be taken as evidence that these features are implemented.

## Existing implementation and gaps

| Item | Current state | Added in this phase |
| --- | --- | --- |
| Package | Independent version, digest, Platform / SDK checks, opaque iframe | Remote source verification and install-operation coordination |
| Home | Currently projects only enabled App entries | Host-fixed entries, disabled cards, a repair entry |
| Disable | Rejects later bridge calls; image jobs are asked to cancel | Cross-window active revocation, stop-completion evidence and restart recovery |
| Remove | Registry mark; `purge` only removes the registration | Real package / cache cleanup; keeping the removal intent |
| Repair | An existing version verifies existing bytes and fails when corrupt | Verified same-version re-download and atomic replacement |
| Preinstall | Keeps the disabled / uninstalled choice | Does not overwrite a newer Market version; a broken App does not block Home |
| SDK | Host-internal private package and browser types | An independently obtainable development contract / docs / test tools |
| Market | Not implemented | Official catalog, version selection, download, update and recovery UX |

The current state is based on this round's source inspection; it is not a test result for the new features.

## FR-01 — Shipping and Home Policy

The Desktop manifest provides `appId`, `preinstall`, `homePresence: pinned | installed-only`,
and the static name / icon / description used by the placeholder. The policy is not placed in permission fields that an App can modify itself.
`preinstall` applies only to the first initialization with no user choice yet; it is not a forced install on every launch.

| Scenario | Usage: preinstall / pinned | Studio: optional / installed-only |
| --- | --- | --- |
| A new profile opens Home | Installed and enabled; a click opens it directly | Not shown; can be installed from Market |
| Installed and enabled | Normal card | Normal card |
| Disabled | Keep the card + disabled; action 「啟用」 ("Enable") | Keep the card + disabled; action "Enable" |
| Removed | Placeholder + not installed; action 「重新安裝」 ("Reinstall") | Not shown; can be reinstalled from Market |
| Package corrupt / missing | The host card shows 「修復」 ("Repair") | Keep the installed card, show "Repair" |
| Incompatible with the current host | Keep the card, explain that the App / Desktop needs updating | Keep the installed card, explain the next step |

Clicking a card can open a host-managed details / recovery panel; clicking a placeholder does not silently download or run anything.
On the first normal launch, Usage needs no Market network. A placeholder does not mount the App iframe, query quota,
or keep App polling; its small amount of card data is not claimed to be zero memory.

## FR-02 — Market and Management UX

Home provides a prominent 「探索 Apps」 ("Explore Apps") that directly opens the standalone Desktop Marketplace; the store has Explore, Installed,
Updates and Details views and can install directly, without a detour through Settings. Settings Apps focuses on the installed list, permissions,
machine-level settings, enable / disable, update, repair and removal; store details can offer the applicable actions, and the two share the management service and state.
Home keeps the established App launch / recovery cards. Plugins use a separate Settings tab; their Home management shortcut,
if provided, remains a small entry and does not limit the prominent entry to the Apps store.
Details show the name, purpose, publisher, version / update notes, compatibility, feature requirements, permissions and explicit operation state.
The ordinary flow does not ask users to enter file paths, digests, CLI commands or API keys.

Installing does not mean the provider is ready. When Studio lacks Grok setup / login, the existing setup guidance is shown;
installation does not trigger image generation, change provider selection or automatically install a CLI. Reading works does not depend on the generation service being online.
Diagnostic hashes, paths, sources and cleanup details go in an expandable area; Settings operation feedback follows the existing toast rules.

### Desktop management authorization

Every user-initiated install / enable / disable / update / repair / uninstall and every machine-level setting
change must be verified against the Desktop management context at the host management service boundary; when an unauthorized request is rejected,
the registry, package files and process state must not change. It is not enough to merely hide the UI, trust the owner login, localhost, the Origin
or an environment flag passed in by the frontend. This restriction also applies when an ordinary browser / remote client calls the endpoint directly.
M0 fixes how the context is issued / delivered, its lifecycle and revocation, and the contract and fixtures for rejecting forged / replayed requests;
this document does not claim that the existing API already meets the requirement.

Desktop Marketplace, Settings and Home recovery actions use the same authorization and lifecycle service; the page path
is not an authorization condition. The App iframe / SDK does not obtain management permission. Desktop's own first bundled initialization
and restart reconciliation still run under the host policy of FR-01 / FR-08, and do not accept a browser requesting them on its behalf.
Whether an installed App can be used from an authorized web page, and ordinary in-App preferences, are decided separately from this management restriction.

## FR-03 — Versioned State and Operation Coordination

Plan registry schema 2; store at least the following information separately, and do not infer execution state from whether Home is visible:

| Information | Purpose |
| --- | --- |
| Installed content | active version / digest, verified rollback candidates, package source and artifact identity |
| User intent | enabled / disabled / uninstalled, chosen channel, whether it was ever installed / removed manually |
| Health state | ready / missing / corrupt / incompatible; a failure does not erase intent or works |
| Source evidence | bundle pin or catalog revision, publisher / key identity; must not raise permissions by itself |
| Pending operation | operation ID, kind, stage, previous / target, stop / cleanup results |
| Authorization generation | an activation epoch incremented on every disable / removal / version switch, bound to all App contexts |

A persistent operation journal together with atomic registry updates forms a recoverable protocol; it does not assume two files can commit at the same time.
Install, update, repair, removal and bundled reconciliation are serialized for the same App; multiple processes / windows also must not overwrite each other.
Resending the same operation ID returns the same progress, and does not redo the post-download publishing or the CLI generation.
After the long-running staging, intent / epoch must be re-checked before deciding whether it can commit; an install cannot overwrite a disable / removal that happened in the meantime.
Before enable, re-verify the artifact, permissions and host / SDK compatibility; a bad package is directed to repair, not just a flag flip.
Enabling again after disabling must issue a new context; even with the same version and hash, the old iframe's epoch is permanently invalid.

## FR-04 — Disabling and Resource Stop

First persist the disabled intent and reject new work, then revoke all active iframe / SDK contexts of that App,
abort unfinished UI requests, polling, timers and subscriptions, and release blobs and the bridge.
All open windows must receive an invalidation notice; it does not count as stopped if we wait for the App's own next polling.
Usage's already-sent quota refresh must also track the work that the App owns; a shared query revokes only that App's subscription,
and must not cancel work that other consumers are still using. The needed Runtime contract is explicitly confirmed in M0.

If an App has App-specific Runtime work, persist the cancel intent and ask to stop the original work. Show
"stopped" only when termination evidence is obtained; on timeout / Runtime offline show "Disabled, work stop pending confirmation", and a restart only resumes querying / canceling,
and adds no generation. Closing the App page still follows the existing background-task contract, which is different from disabling.
It does not stop the shared Runtime, Chat / Work / Code, the CLI installation or other Apps' work.

## FR-05 — Uninstall and Disk Reclamation

Uninstall first runs FR-04, then makes the active package non-executable. Once there are no active users, it clears all of the App-managed
version copies, staging, download cache and repair quarantine copies, and keeps a small uninstalled tombstone.
A shared digest cache may be cleared only when nothing else references it. Every deletion must verify that the real path lies under the App management root,
and reject symlink / junction escapes; an arbitrary path provided by the manifest / renderer cannot be used as a deletion target.

When a file is locked or work may still be running, first revoke access, keep cleanup pending and retry safely; it must not claim that space has been freed.
A cleanup failure does not resurrect the App. Diagnostics record separately the logical bytes actually removed, bytes pending cleanup and bytes of retained data,
and do not present estimates of compression / shared blocks as an actual increase in free OS space.

The Usage recovery package bundled in Desktop resources is still kept, and the signed installation contents are not modified; its bytes are not counted as reclaimed.
The Runtime shared usage records are also kept. Usage has no page polling when it is not open anyway, so a significant CPU / RAM drop cannot be guaranteed.

## FR-06 — User Data and Deletion

Installed content and data are separate; by default, uninstall keeps settings, works and necessary history, and a reinstall with the same ID can reconnect them.
Studio works and Core task/run/artifact are managed by Platform, and Runtime receipts are managed by Runtime;
deleting `apps/data` cannot substitute for all data purging, and the Runtime directory cannot be deleted directly.
Raw provider sessions, credentials and shared telemetry are not within the scope that an App uninstall may delete.

The first version of uninstall states explicitly "keeps works and settings" and offers no executable permanent data deletion option; a reinstall must be able to reconnect.
If the management details mention data purge, they may only clearly mark it as not yet provided, and the current registry `purge` must not be packaged as it.

A full "delete App data" is listed as later scope: first establish a scoped deletion / retention contract for each data owner,
preview the account / profile, the works to be deleted and the shared / audit information to be kept, and then have the owner confirm.
Clean up only after stopping work and blocking competing writes, handle shared references and leave recoverable progress; on a partial failure show the remaining items.
Its cross-owner deletion / recovery acceptance is a later independent gate, and does not block the first version's data-retaining uninstall; it must not claim to have cleared every trace.

## FR-07 — Install, Update, Repair and Rollback

All sources go through the same staged validation / activation service, reusing the size limits, manifest, digest,
permissions and Platform / SDK compatibility checks; there is no install hook, npm install, dynamic remote code or shell.
After download, the manifest identity, version, compatibility range and permissions must be consistent with the entry verified in the catalog;
a package that first shows fewer permissions and then requests more on enable must not be allowed. When there is no compatible candidate, keep the currently usable version and explain that Desktop
must be updated or that a compatible App must be awaited; it cannot be resolved by skipping checks.

Updates are confirmed by the user. Version selection uses only exact versions that the catalog allows and that match the host / SDK; new permissions need reconfirmation,
and old grants cannot be widened automatically. While work is active, show waiting for it to end, or let the user choose to stop and then update; it must not interrupt silently.
Download can run in parallel with work, but stop / enable switching and data conversion must hold the operation lock.

Repair first restores the trusted digest of the installed version; the original bytes of the same version can replace a corrupt copy, and new content is not allowed to pose as that version.
Verify the new copy first, keep limited metadata of the failure scene, clear the quarantined bytes after an atomic switch; on failure keep the data and
the repair entry. When the same version has no trusted source or has been withdrawn, explicitly switch to a compatible fixed version; the hash carried by a corrupt copy is not trusted.

Only retained, verified, compatible and non-withdrawn candidates can be used for rollback. If the data has already been upgraded, there must be a verified
consistent backup / restore path; one must not just downgrade the program version to read the new data, nor discard works added after the upgrade.
The necessary conversion of existing renderer / host-owned data slices is delivered by the data owner's host version.
New App-owned data follows SPEC-122: the App package provides trusted, versioned migration hooks limited to that App's data,
and Platform coordinates locking, backup, validation and atomic activation / recovery; an App schema update
need not publish a new host version because of this. This is a restricted data upgrade contract, and it does not open arbitrary install hooks, shell
or install-time npm build; the related execution capability is not yet implemented.

## FR-08 — Preinstall Reconciliation and Corruption Isolation

| Local state | Desktop launch / upgrade |
| --- | --- |
| No choice yet and a preinstalled App | Verify the local bundled pin, then install and enable |
| Manually removed | Keep it removed; the Usage placeholder remains |
| Disabled | Stay disabled; do not automatically update the existing installation |
| A usable version exists | Keep it; the bundled update becomes a manual update candidate and does not overwrite a newer Market version |
| Corrupt or incompatible | Isolate the App, keep intent / data; Home shows repair and does not silently downgrade |

A content error in an App bundle must fail closed for that App, but must not make the whole Home / Market unable to start.
Newly shipped artifacts must still pass the strict bundle gate; runtime recovery does not loosen release checks.
Repair / reinstall can restore a compatible Usage offline from the trusted bundled package, or choose a compatible version in Market.
Restoring from an older bundled package needs the version and data compatibility stated explicitly, and cannot pretend to be a repair of the original version.

## FR-09 — Official Catalog and Trust

Plan for cats-apps to maintain the static metadata and Platform to provide the consumer and the built-in trust root.
The catalog contains schemaVersion, an increasing revision, issuedAt / expiresAt, publisher, the App list,
exact stable / preview version selections, and per version the artifact URL / size / SHA-256, manifest identity,
compatibility range, permissions, release notes and withdrawal state. A GitHub repo-wide latest must not be used to infer App versions.

The first phase uses an Ed25519-signed envelope over fixed payload bytes (algorithm, keyId, base64 payload,
signature); verify the signature before trusting the content, and reject unknown schema / key / algorithm, duplicate IDs / versions and illegal sizes.
Transport, decoding and download all have size and time limits; before implementation, fix the bounds in contract fixtures, reusing the package's existing limits.
The host stores the highest verified revision to prevent rollback, and checks the validity period. A key change must be authorized by the existing trust root,
and a new key offered by the same unknown catalog must not be accepted; keep a path for a host update to provide an emergency root change.

The catalog / artifacts are downloaded by the host only, limited to HTTPS, allowed official endpoints and redirect destinations,
and loopback / private networks and arbitrary URL proxies are forbidden. The signature proves the catalog source and the hash binds the artifact; both must be verified.
The catalog is an official source and does not grant `system` privileges; a local-user package does not become official because it has the same ID,
and switching the source requires user confirmation and artifact verification; a download must not overwrite a local development App with the same ID.

Offline, the last verified catalog can be used as time-stamped browsing data, and installed Apps / works open as usual.
An expired catalog cannot authorize new remote installs / updates; trusted bundled offline recovery does not depend on the network catalog.
Withdrawing a version blocks new installs / updates / repairs from using it; installed copies show a notice and a replacement version, and works are not deleted remotely.
Known withdrawals equally apply to local cache / bundled recovery candidates, and offline cannot erase a known withdrawal record.
The first phase offers no forced remote kill switch; without a connection, immediate knowledge of a withdrawal also cannot be guaranteed.

### First-Phase Publishing Endpoint and Signing Key (owner decision, 2026-10-20)

Use GitHub URLs first to validate Market as soon as possible; handle an owned domain after it is decided.

- Artifacts reuse the immutable GitHub Releases of each cats-apps App (`<slug>-vX.Y.Z` tags),
  and each version's artifact URL in the catalog points to that release asset.
- The catalog envelope is served by cats-apps's GitHub Pages, for example
  `https://cats-inc.github.io/cats-apps/catalog/v1/catalog.json`; the exact path is fixed along with the M0 envelope.
  Pages was enabled on 2026-10-20 with GitHub Actions as its source, and deploys only from `main`. Promotion edits the catalog source through a PR, and after merging CI signs and deploys,
  so git history is the promotion record.
- Do not put the catalog in a rolling release with a fixed tag: every promotion would have to modify a published Release, violating the release
  completion rule, and swapping assets would also leave files temporarily missing. The client does not call `api.github.com` to list releases, so it is not affected by the rate limit on unauthenticated
  requests.
- The production signing key is first stored in a cats-apps GitHub Actions secret. This only protects against tampering with Pages or transport, not against a compromised
  repo / workflow; moving to an environment needing manual approval, or to offline signing, is later hardening.
- The official endpoint is built into Desktop; if an owned domain or another host is used later, a Desktop carrying the new endpoint must be published first.

### Catalog schema v1 (fixed 2026-10-20)

The producer is cats-apps `scripts/build-catalog.mjs` ([Apps SPEC-005](../../../cats-apps/docs/specs/SPEC-005-official-app-catalog.md)),
and the consumer is `src/platform/apps/catalog.ts`. Both sides share the contract vectors in `tests/fixtures/app-catalog/`:
cats-apps reproduces the same envelope with a test-only key, and Platform must obtain the same payload after verifying the signature.

- Envelope: `{ algorithm: "ed25519", keyId, payload, signature }`. `payload` is the base64 of the UTF-8 JSON bytes,
  and `signature` is the Ed25519 signature over those bytes; the consumer does not re-serialize.
- Payload: `schemaVersion: 1`, `revision`, `issuedAt`, `expiresAt`, `publisher { name, homepage? }`, `apps[]`.
- App: `id`, `displayName`, `description`, `icon` (a string or null), `channels { stable, preview? }`, `versions[]`.
- Version: `version`, `artifact { url, size, sha256 }`, `compatibility { catsPlatform, appSdk }`, `permissions[]`,
  `publisher`, `notes` (may be an empty string), `withdrawn { reason, at }?`. The artifact URL must be a cats-apps
  `<slug>-vX.Y.Z` release asset; a channel cannot point to an unlisted or withdrawn version.
- Verification order: size limit → algorithm → trusted keyId → base64 decode (payload limit 256 KiB) → signature →
  JSON → schema → `revision` must not be lower than the highest verified value (equal is acceptable) → validity period.
- `revision` is the epoch seconds of `issuedAt`; `expiresAt = issuedAt + 30 days`. The publish workflow re-signs weekly,
  and keeps revision increasing with a concurrency group; it signs only on `main` and only when the signing inputs are still the same as `main`.
- The consumer requires `revision` to equal the `issuedAt` seconds and the validity period to be no more than 31 days, and rejects a catalog whose `issuedAt` is later than the host time
  by more than one day; otherwise a single erroneous catalog could permanently raise the rollback floor or invalidate the expiry.
- The producer is strict about source files (an unknown field fails); the consumer accepts and discards unknown fields so v1 can add optional data.
  An incompatible format uses a new `schemaVersion` and a new path (`catalog/v2/`).
- Host state is stored in `<platformDir>/apps/catalog-state.json`: the highest verified revision, the last verified envelope,
  the fetch time and the Market install source records. This is a new self-describing file and does not change the existing registry format; the signature is re-verified on every read.
  When the file is corrupt, it is first backed up as `catalog-state.json.corrupt-<time>` and then rebuilt (so the highest revision and install sources are reset);
  any other read failure, or an unknown schema written by a newer Desktop, is never overwritten, and Market shows as unavailable.

### Preview slice (2026-10-20, unreleased)

To validate Market first, Platform delivers the following minimal scope; the rest of this SPEC's requirements and acceptance remain incomplete:

- `GET /api/apps/_market[?refresh=1]` and `POST /api/apps/_market/install { id }`, which need Desktop management authority just like the existing install.
  A leading `_` cannot collide with any App ID, so no reserved ID or SDK change is needed.
- The `/lobby/market` page and the Home card 「探索 Apps」 ("Explore Apps") are shown only on Desktop; a browser sees only a Desktop-only notice.
- Only `channels.stable` is read; the server does not currently know Desktop's preview / stable release channel.
- The install request carries the version and permissions the user saw; if the catalog changes in the meantime, it returns 409 `catalog_changed` and installs nothing.
- Install and update reuse the existing `local-package` installer (trust tier `local-user`), checking compatibility before download,
  and after download comparing SHA-256, manifest identity, permissions, compatibility range and publisher. An update keeps the enabled state at the time of install.
- If the installed copy was not installed locally from the catalog (judged by the recorded digest), the update confirmation states explicitly that it will replace a non-Market installation.
- Apps listed in the Desktop bundle lock (`CATS_APP_BUNDLE_PATH`), and Apps in the registry that were ever installed from the bundle,
  all show 「隨 Cats Desktop 提供」 ("Provided with Cats Desktop") and cannot be installed or updated from Market, because FR-08's bundled reconciliation
  has not been rewritten yet and the next launch would overwrite the Market version.
- Not yet provided: registry schema 2 / operation journal, the defer-or-stop choice for active work, reclaiming old version directories,
  Market updates for bundled Apps, the preview channel.

## FR-10 — SDK and Compatibility

SDK types / capability definitions / docs / isolated test tools can be obtained with independent versions, so developers do not depend on sibling source.
The host still injects the only execution bridge, and App packages do not bundle another privileged implementation.
Keep the existing double verification of manifest `catsPlatform` and `appSdk`, reusing the current limited version syntax;
whether a capability is available goes separately through the Runtime projection, and provider availability is not guessed from the App version.

New capabilities are delivered in a compatible SDK minor; a breaking SDK contract needs the next major. The package compression format and the existing
SDK 1.3 image methods can be kept in this phase; the Market management API belongs to the host and is not automatically exposed to every App.
Development tools run contract fixtures against both the minimum-host and candidate-host of Usage / Studio.
Obtainable artifacts of the development SDK and npm publication are a delivery with its own release scope, and writing documents does not run publication.

Per [ADR-123](../decisions/123-expose-app-sdk-contract-as-platform-npm-subpath.md) (first stage implemented, unreleased),
the way to obtain it is staged: the first stage provides an allowlist contract through the Platform npm `@cats-inc/cats-platform/app-sdk` subpath,
including the types, the same validation the installer uses and the cross-OS byte-deterministic official encoder, and does not expose the
`browser.js` bridge and host-only functions; after third-party development starts, `@cats-inc/app-sdk` is published independently from the same directory.
With the 0.6.0 minor, `exports` allows only `.`, `./package.json` and `./app-sdk`.

## FR-11 — Upgrading Existing Profiles and Version Boundary

The registry schema 1 → 2 migration must validate, back up, replace atomically and be recoverable on failure, and must not be applied twice on restart.
The enabled / disabled / uninstalled mapping is kept, and manifest-only unverified entries must not become executable.
`purge` is no longer interpreted as deleting a tombstone; once old data has emptied the registration, past intent cannot be known,
so when upgrading an existing profile, such absent Apps are conservatively not preinstalled automatically, leaving the Usage placeholder for an explicit reinstall.
The new minor explicitly reports an old `purge=true` management request as unsupported and points to the ordinary uninstall; it does not silently clear the registration,
and does not repurpose that parameter as an undelivered permanent data deletion. This is a breaking boundary of the management API.
The first initialization of a new profile must have an identifiable, recoverable bootstrap marker.

An existing local Studio keeps the same ID, enabled choice, version / hash and existing work / job IDs.
It is no longer managed by the default bundle list; moving it to the official update source needs a trusted identity and user confirmation,
and works must not be removed or generation resent in order to move it. An unknown schema is kept as is, with host recovery guidance provided.

Schema 2 cannot be safely read by an old host, so plan the next Platform / Desktop 0.x minor boundary
(originally set to 0.6.0 on the 0.5.13 baseline; the companion migration of #171 on 2026-09-29 already used 0.6.0,
so schema 2 becomes the next minor after 0.6.0). An old executable cannot use an upgraded profile directly.
The ^0.5 range of Usage / Studio does not accept 0.6, so an immutable App version with the correct compatibility range must be published separately;
an old artifact must not be overwritten and the compatibility check must not be skipped. At release time, re-check the actual version then and the other teams' progress.

## Acceptance matrix

| ID | Result that must be verified | Method |
| --- | --- | --- |
| AC-01 | A new profile opens Usage offline; Studio has no Home card | Real built bundles + isolated Desktop |
| AC-02 | The placeholder is correct after Usage is disabled / removed / restarted; an explicit reinstall succeeds | Home / Market integration |
| AC-03 | Studio install / disable keeps the card / removal makes it disappear / reinstall reconnects works | App package + fixture Runtime |
| AC-04 | All windows are revoked and timers / bridge / subscriptions disappear; an unknown cancel does not falsely claim completion; a restart does not resurrect an old epoch | Multi-window, quota in-flight, fake process, disconnect and restart |
| AC-05 | Packages and caches are really deleted; data and the bundled archive are kept | Before/after file lists / bytes / reference checks |
| AC-06 | A file lock, symlink / junction, and a restart during cleanup do not delete by mistake and are recoverable | Real temp filesystems on each OS |
| AC-07 | A corrupt same version can be repaired; a wrong hash is rejected; Home is still operable | Independent corruption fixtures, failed activation |
| AC-08 | An old Desktop bundle does not downgrade or resurrect an App; offline recovery states the version explicitly | Update through Market first, then upgrade Desktop |
| AC-09 | A disconnect / crash / permission increase / active work during an update are all handled correctly; install/update/repair do not overwrite a concurrent disable/uninstall | transaction fault injection |
| AC-10 | A fake signature, an expired / replayed catalog, an arbitrary URL / redirect and a withdrawn version are rejected | downloader / catalog boundary tests |
| AC-11 | schema 1→2 keeps intent and works; the original file is recoverable on failure; a rerun is safe | migration fixtures + backup hashes |
| AC-12 | The new SDK does not break existing Apps; an incompatible App is blocked before install | minimum/candidate host contract tests |
| AC-13 | A new Studio artifact can update the same host without rebuilding Desktop | source-free two-version install drill |
| AC-14 | Uninstall states that data is kept; reinstall reconnects works / settings; shared references and other accounts are unchanged; no fake data purge action is offered | owner fixtures, before/after data digest / reference checks |
| AC-15 | The prominent Home entry opens the standalone Marketplace directly; explore / details / install do not jump to Settings; after completion, Home / Settings / Market state is consistent | Isolated Desktop and shared lifecycle operation evidence |
| AC-16 | An owner browser / remote, localhost, forged environment flags, invalid / replayed contexts and the App iframe all cannot manage packages; after rejection the registry / package / process is unchanged; authorized Desktop operations still succeed | Direct API rejection fixtures, context revocation, multi-entry Desktop acceptance |

None of the above has been run. Synthetic data may only go in a temporary profile / registry; it must not pollute user state or consume Grok quota.
Measurement is based mainly on active resource and file evidence, with RAM/RSS only as a supplement, and a fixed MB figure or an immediate drop is not an acceptance gate.

*Last updated: 2026-10-20*
