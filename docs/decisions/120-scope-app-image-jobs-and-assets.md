# ADR-120: Scope App image jobs and assets

## Status

Accepted, 2026-09-28. The user authorized standalone Studio, genuine CLI generation
integration, necessary SDK/Runtime extensions and a local installed Desktop update.

## Context

SDK 1.2 only exposes Usage/navigation. A creative App needs durable jobs and binary
delivery through the verified opaque renderer. User-facing install/remove UX is future work.

## Decision

Add compatible SDK 1.3 `images` methods under `media.images`. Bind every host request to
current account, enabled verified App/version and declared permission. Host maps attempts
to existing Core task/run/artifact metadata; new retained image files live outside immutable
packages. No Core schema replacement or migration is required.

Persist request identity before dispatching to Runtime. Derive the Runtime ID from
App/account/request ID; a duplicate returns the same job. Background recovery only reads,
collects or cancels the same execution. An uncertain POST must never trigger another
generation. Cancel intent survives transient connectivity failures.

Expose bounded ArrayBuffer transfer over the existing nonce-bound MessageChannel. Permit
blob images in the iframe CSP; maintain opaque origin, no connect/network capability,
no forms, no shell and no host filesystem paths. Host owns download filenames and URLs.

Studio is an independent `.catsapp` and Home tile beside Usage. Local Desktop 0.5.11
bundles Studio 0.1.0 with published Usage 0.4.0. The canonical published selection stays
unchanged until a separate App publication/selection decision.

## Consequences

Existing SDK 1.2 Apps remain compatible; Studio requires SDK ^1.3.0 and Platform ^0.5.11.
Single-image native Grok only, finite retention, no editing/video or general App executor.
Local installation is authorized, public release/tag/npm publication is outside this task.

See [SPEC-119](../specs/SPEC-119-app-image-generation.md),
[PLAN-111](../plans/PLAN-111-app-image-generation.md), and
[Apps ADR-002](../../../cats-apps/docs/decisions/002-cli-backed-media-studio-vertical-slice.md).
