# SPEC-119: App image generation

Status: Implemented; isolated and installed Windows Desktop acceptance passed (2026-09-28).
Contract 2 (SDK 1.7.0) implemented 2026-10-23 with isolated package/host acceptance.
Decision: [ADR-120](../decisions/120-scope-app-image-jobs-and-assets.md),
[ADR-137](../decisions/137-negotiate-image-contract-2-by-app-sdk-floor.md).
Plan: [PLAN-111](../plans/PLAN-111-app-image-generation.md).

## Proposed shared-service successor

[ADR-136](../decisions/136-share-controlled-image-capabilities-between-cats-and-studio.md),
[SPEC-128](SPEC-128-shared-image-service-and-controlled-cat-generation.md) and
[PLAN-121](../plans/PLAN-121-shared-image-service-and-controlled-cat-generation.md)
propose extracting this App-scoped implementation into a shared image service.
The existing SDK adapter keeps all App/account/version/digest checks and saved
job identities. Cat callers receive separate authority and assets; they never
impersonate an installed Studio App. The proposal is documentation only, does not
enable editing or cross-caller sharing, and does not change the delivered contract below.

## Contract 2 (SDK 1.7.0)

An App whose manifest `compatibility.appSdk` floor is at least 1.7.0 sees contract 2. Every
other App sees the SDK 1.3 schema below, projected from contract 2. Unsupported range grammar
counts as below 1.7.0.

- **`images.getCapabilities()`** returns:

  ```
  { schemaVersion: 2, revision, maxPromptLength, maxImageBytes,
    targets: [{ id, provider, instanceLabel, availability: 'available' }],
    profiles: [{ id, revision, operation: 'image.generate', targetIds, agentConfigs: [{ id, model, effort }],
                 inputs: { min: 0, max: 0 }, aspectRatio: { mode: 'native', options: [ratio] } | { mode: 'service' } }] }
  ```

  Runtime decides which providers appear (enabled profile x supported configured instance).
- **`images.submit(input)`** takes exactly
  `{ requestId, targetId, profileId, profileRevision, agentConfigId, operation: 'image.generate', prompt, sourceIds: [], options: {} }`.
  Anything else is `invalid_image_request`. A stale profile or configuration fails the job
  with `image_profile_changed` (or `image_profile_unavailable`) without a run.
- **Jobs** have this shape:

  ```
  { schemaVersion: 2, id, requestId, provider, targetId, instanceLabel, operation, profileId, profileRevision,
    agentConfigId, agentModel, agentEffort, prompt, sources: [], options: {}, status, error, warnings,
    executionOutcome: 'completed' | 'stopped_after_image' | null,
    output: { mimeType: 'image/jpeg' | 'image/png', bytes, width, height, sha256, transparency: 'opaque' | 'has-transparency' } | null,
    createdAt, updatedAt }
  ```

  Jobs upgraded from schema 1 have `agentConfigId: null` and `agentEffort: null`.
- **`images.read(id)` / `images.export(id)`** return the original bytes with their measured
  type. Files are saved as `<job>.png` or `<job>.jpg`.

Under schema 1 an App sees only Grok work with JPEG or no output:

- Its `{requestId, instance, prompt}` runs that Grok instance's native 1:1 generation profile.
- Other work is kept but answers `image_not_found` to it. Hidden work still counts toward that App/account's active-job and 100-job limits; it cannot be cancelled or deleted from schema 1.

Core `appImage` metadata is schema 2. A schema 1 entry reads as Grok, `grok-generate`, opaque
JPEG, and is rewritten only when the job next changes. Unknown schemas are ignored and left
untouched.

## SDK 1.3

| Method | Contract |
| --- | --- |
| `images.getCapabilities()` | Runtime capability projection; no generation or provider probe |
| `images.list()` | Current App/account's retained jobs; resumes reads/collection only |
| `images.submit({requestId, instance, prompt})` | Durable idempotent attempt; explicit user generation |
| `images.cancel(id)` | Persist cancellation and stop the same Runtime attempt |
| `images.refresh(id)` | Recheck an interrupted result; never resubmit generation |
| `images.delete(id)` | Owner deletion of a succeeded, failed or cancelled job: Core task/run/artifact, saved original and (best effort) the Runtime receipt; active or interrupted jobs return 409 `image_not_deletable`, a job whose records are linked or referenced elsewhere in Core returns 409 `image_in_use`; the deleted request ID stays reserved (`image_request_conflict`), so deletion never leads to a second generation (added 2026-10-23 in SDK 1.6.0, first carried by Desktop 0.9.2) |
| `images.read(id)` | Bounded ArrayBuffer plus MIME type (JPEG under SDK 1.3; JPEG or PNG under contract 2) |
| `images.export(id)` | Host-managed download of the same saved bytes |

Routes use `/api/apps/:appId/images` with the exact installed version. Existing host
authentication/CSRF applies. Operations require ui.route and media.images, verify package
digest and enabled state, then bind jobs/assets to the authenticated account. App disable/
removal revokes access and requests cancellation. Jobs project no host account bookkeeping,
secrets or file paths. An App cannot choose arbitrary routes, URLs or storage locations.

## Data and failure behavior

Core task/run/artifact metadata is the host authority. Persist a new request before Runtime
POST; same requestId + payload returns its job, different payload conflicts. Limit one active
job and 100 retained jobs per App/account. Prompt ≤2000 code points, request body ≤12000
bytes, JPEG ≤8 MiB. Image metadata/digest is verified before atomic host persistence and
success/artifact publication. Runtime separately validates decoding/source.

Opening or refreshing never generates. Transient reads preserve running/collecting state;
later reads recover the same receipt/bytes. Cancellation is persistent and wins a late result.
Unknown Runtime outcomes remain explicitly interrupted. Saved images remain viewable when
Runtime is offline. Current data is additive; no existing profile reset or conversion.

After the native session-path correction, opening Studio also checks failed
`invalid_image_source` jobs through Runtime GET only. If Runtime validates and recovers
that same receipt/image, collection completes the original Core task/run and adds its
artifact. A foreign receipt or unchanged failure leaves the work failed. No new submission
or provider call is authorized by this repair.

## Acceptance

Use actual Studio archive + real host renderer/SDK/routes, fixture Runtime and temporary
registry/Core. Cover submit, blob preview/enlargement, byte-identical download, reopen,
offline saved works, cancellation, narrow layout, iframe isolation and Home return.
Host service tests additionally cover account/App isolation, revocation, concurrency,
ambiguous submission, restart and cancellation transport recovery.

The user's one live Grok image allowance was already used by the earlier spike. No new
paid generation is part of this implementation acceptance; editing/video remain deferred.
