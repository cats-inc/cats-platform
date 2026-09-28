# SPEC-119: App image generation

Status: Implemented; isolated and installed Windows Desktop acceptance passed (2026-09-28).
Decision: [ADR-120](../decisions/120-scope-app-image-jobs-and-assets.md).
Plan: [PLAN-111](../plans/PLAN-111-app-image-generation.md).

## SDK 1.3

| Method | Contract |
| --- | --- |
| `images.getCapabilities()` | Runtime capability projection; no generation or provider probe |
| `images.list()` | Current App/account's retained jobs; resumes reads/collection only |
| `images.submit({requestId, instance, prompt})` | Durable idempotent attempt; explicit user generation |
| `images.cancel(id)` | Persist cancellation and stop the same Runtime attempt |
| `images.refresh(id)` | Recheck an interrupted result; never resubmit generation |
| `images.read(id)` | Bounded JPEG ArrayBuffer plus MIME type |
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

## Acceptance

Use actual Studio archive + real host renderer/SDK/routes, fixture Runtime and temporary
registry/Core. Cover submit, blob preview/enlargement, byte-identical download, reopen,
offline saved works, cancellation, narrow layout, iframe isolation and Home return.
Host service tests additionally cover account/App isolation, revocation, concurrency,
ambiguous submission, restart and cancellation transport recovery.

The user's one live Grok image allowance was already used by the earlier spike. No new
paid generation is part of this implementation acceptance; editing/video remain deferred.
