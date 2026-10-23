# ADR-137: Negotiate image contract 2 by the App SDK floor

## Status

Accepted, 2026-10-23. The owner asked that Studio offer Muse, Antigravity and Codex
generation, starting with generation only. This extends
[ADR-120](120-scope-app-image-jobs-and-assets.md). Runtime's side is
[Runtime ADR-047](../../../cats-runtime/docs/decisions/047-generalize-bounded-image-generation-to-provider-profiles.md).
The cross-repository plan is
[cats-apps PLAN-006](../../../cats-apps/docs/plans/PLAN-006-studio-image-workspace.md).

## Context

Runtime image routes now speak contract 2:

- targets `<provider>/<instance>`;
- per-provider execution profiles with revisions;
- measured JPEG or PNG output with dimensions and transparency;
- the run's outcome.

The App SDK image API was schema 1: Grok instances, square JPEG. Shipped Apps declare SDK
ranges such as Usage `^1.2.0` and Studio `^1.3.0`. A host SDK 2.0.0 would fall outside every
one of those ranges, and the installer accepts only caret and `major.x` grammar. An SDK major
would therefore strand every official App.

## Decision

1. **Ship contract 2 as App SDK 1.7.0, an additive minor.** The method names stay the same.
2. **The contract follows the installed package's declared floor.**
   - An App whose `compatibility.appSdk` floor is at least 1.7.0 gets contract 2 from
     `getCapabilities`, `submit`, `list`, `cancel`, `refresh`, `read` and `export`.
   - Every other App keeps schema 1.
   - Unsupported range grammar never widens the contract.
   - One App version therefore always sees one contract, and a host never offers an App more
     than it declared.
3. **Schema 1 is a projection.**
   - Capabilities: Grok targets with a native 1:1 generation profile.
   - Requests: `{requestId, instance, prompt}` runs that instance's current native 1:1
     profile.
   - Jobs: other providers' work and PNG work stay hidden from a schema 1 App. They are kept,
     not altered, and reading them answers `image_not_found`.
4. **Core metadata.**
   - `appImage` moves to schema 2.
   - A schema 1 entry reads as its schema 2 equivalent: Grok, `grok-generate`, no recorded
     agent configuration, opaque JPEG. It is rewritten only when the job next changes.
   - Unknown schemas are ignored and left untouched.
5. **Saved originals keep their bytes and type.**
   - Files are `<job>.png` or `<job>.jpg` by measured MIME type. Existing JPEG jobs keep
     `.jpg`.
   - Read, export and the artifact record carry that type.
6. **Runtime profile refusals fail the work at once.** `image_profile_changed` and
   `image_profile_unavailable` mean Runtime did not run anything.

## Consequences

- Studio declares `appSdk: ^1.7.0` once it ships contract 2. It then installs only on hosts
  with SDK 1.7.0, so Desktop 0.9.2 keeps offering the previous Studio.
- Rolling back to a Platform without this change hides schema 2 jobs: they are ignored, not
  deleted. Upgrading again shows them.
- The proposed shared image service ([ADR-136](136-share-controlled-image-capabilities-between-cats-and-studio.md))
  extracts this contract 2 service as it now stands.
- Editing, composing, sources and options remain outside contract 2 until Runtime and Platform
  freeze them. Requests must send empty `sourceIds` and `options`.

See [SPEC-119](../specs/SPEC-119-app-image-generation.md#contract-2-sdk-170).
