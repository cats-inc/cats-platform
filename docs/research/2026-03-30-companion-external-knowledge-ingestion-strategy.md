# Companion External Knowledge Ingestion Strategy

## Summary

This note evaluates whether `Cats Chat` / companion flows should read external
content from provider-style connectors, sync data into `companion-box`, or mix
both approaches.

The main conclusion is:

- external systems such as Google Drive should be treated as read-only
  connector-backed sources behind `cats-runtime`
- `companion-box` should remain the product-owned store for selected references,
  derived records, and durable memory, not a mirror of an entire external
  library
- FB/IG exports are feasible as product-owned importers that serialize selected
  materials into the existing companion source model
- LINE exports are feasible as conversation-log imports plus memory extraction,
  but the first goal should be extracting high-signal memories rather than
  dumping every raw transcript into canonical memory

## Scope

- `cats-platform` companion/resource ingestion
- `cats-runtime` as the remote access boundary
- Google Drive folder-backed content access
- Google Photos viability as a primary library connector
- FB/IG export import feasibility
- LINE export memory extraction feasibility

## Reviewed Inputs

### `cats-platform`

- [`docs/api.md`](../api.md)
- [`docs/mcp-config.md`](../mcp-config.md)
- [`docs/specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md`](../specs/SPEC-029-companion-boxes-ingestion-and-response-profiles.md)
- [`docs/specs/SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md`](../specs/SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md)
- [`src/products/chat/api/runtimeBridgeRoutes.ts`](../../src/products/chat/api/runtimeBridgeRoutes.ts)
- [`src/runtime/client.ts`](../../src/runtime/client.ts)
- [`src/core/companionContracts.ts`](../../src/core/companionContracts.ts)
- [`src/products/chat/companion/sourceIngestion.ts`](../../src/products/chat/companion/sourceIngestion.ts)
- [`src/platform/memory/extraction.ts`](../../src/platform/memory/extraction.ts)

### Sibling Services

- [`personal-rag-system/docs/API.md`](../../../personal-rag-system/docs/API.md)
- [`personal-rag-system/src/personal_rag_system/api/conversations.py`](../../../personal-rag-system/src/personal_rag_system/api/conversations.py)
- [`personal-rag-system/src/personal_rag_system/api/ingest.py`](../../../personal-rag-system/src/personal_rag_system/api/ingest.py)
- [`bot-recorder/src/services/line_service.py`](../../../bot-recorder/src/services/line_service.py)

### External References

- [Google Photos API release notes](https://developers.google.com/photos/support/release-notes)
- [Google Photos API updates](https://developers.google.com/photos/support/updates)
- [Google Photos Picker API overview](https://developers.google.com/photos/picker/guides/overview)
- [Google Photos Help: Group similar faces and search photos by face](https://support.google.com/photos/answer/6128838)
- [Google Drive labels guide](https://developers.google.com/workspace/drive/api/guides/search-labels)
- [Awesome MCP Servers list](https://github.com/PipedreamHQ/awesome-mcp-servers)

## Current Product/Runtime Posture

`cats-platform` already has a runtime MCP proxy at
[`POST /api/runtime/mcp`](../api.md) and wires that through
[`src/products/chat/api/runtimeBridgeRoutes.ts`](../../src/products/chat/api/runtimeBridgeRoutes.ts)
into [`RuntimeClient.callMcp(...)`](../../src/runtime/client.ts). That means
the platform already has a valid connector-style boundary for external read
capabilities.

At the same time, `companion-box` is clearly product-owned and Cat-scoped. Its
current source model supports:

- `note`
- `conversation_log`
- `article`
- `image`
- `video`
- `audio`
- `path_ref`

and storage modes:

- `uploaded_copy`
- `imported_copy`
- `linked_path`

That model is strong enough for selected imports, but it is not yet a full
remote-provider connector framework.

## Finding 1: Google Drive Folder Structure Is Usable

If a user already organizes content in Google Drive folders, that structure is
useful and should be consumed.

It should be treated as:

- a user-authored classification hint
- a navigation/filter surface
- a candidate source of tags such as cat identity, time period, or event type

It should not be treated as:

- perfect truth
- a reason to mirror the whole library into `companion-box`

### Recommended Pattern

Use a read-only Google Drive connector behind `cats-runtime` to:

- list folders
- list files in a folder
- read file metadata
- fetch a selected file on demand for inference

Then store only selected references in `companion-box`, for example:

- `kind = image` or `video`
- `storageMode = imported_copy` only if the user explicitly wants a local copy
- otherwise keep a provider reference in `metadata`

This should be treated as a first-slice compatibility move, not the ideal
long-term contract. The current `path_ref` / `linked_path` semantics are
local-path-oriented, so remote provider references stored only in `metadata`
remain a workaround. The more correct later direction is an explicit
`remote_ref`-style source contract, or an equivalent first-class remote
reference shape.

Suggested metadata fields for the first slice:

- `provider: "google_drive"`
- `providerFileId`
- `providerFolderIds`
- `providerPathHints`
- `webViewLink`
- `mimeType`
- `modifiedTime`
- `checksum` when available

This lets Cats benefit from Drive organization without turning the product into
an eager sync engine.

## Finding 2: Google Photos Should Not Be the Primary Library Connector

Google Photos is less attractive as the main backend for this use case.

Reasons:

- user-facing "People and pets" grouping exists in Google Photos, but it is a
  product/UI feature rather than a stable backend integration contract
- on April 1, 2025, Google restricted the Photos Library API and removed
  several read scopes, shifting the official path toward the Picker API and
  app-created-content management

Implication:

- Google Photos is acceptable for manual user selection via Picker-like flows
- Google Photos is not a strong primary assumption for full-library, read-only,
  ongoing companion ingestion

For a user with a curated Drive folder structure, Google Drive is the better
first connector target.

## Finding 3: FB/IG Export Import Is Feasible

An offline importer for selected FB/IG export material fits the current
`companion-box` model well.

Recommended mapping:

- posts / profile notes -> `article` or `note`
- photos -> `image`
- videos / reels -> `video`
- comments / message threads -> `conversation_log`

Useful metadata to preserve:

- original platform (`facebook` / `instagram`)
- original author
- original timestamp
- caption / description
- hashtags / tags
- album / thread identifiers
- permalink when available

This aligns with the current derived-record pipeline in
[`sourceIngestion.ts`](../../src/products/chat/companion/sourceIngestion.ts),
which already knows how to derive:

- `caption`
- `tags`
- `traits`
- `event`
- `relationship_note`
- `normalized_note`

### Important Limitation

Not every imported artifact should become durable memory.

Per [`SPEC-031`](../specs/SPEC-031-built-in-memory-extraction-durable-sync-and-retrieval-context.md)
and the current extraction logic in
[`src/platform/memory/extraction.ts`](../../src/platform/memory/extraction.ts),
the durable layer should emphasize:

- curated companion memory
- owner notes
- stable traits
- event records
- relationship notes
- normalized notes

Raw captions and transcripts should usually remain supporting evidence.

## Finding 4: LINE Export Memory Extraction Is Feasible

LINE import is feasible in two different senses:

1. live ingestion already exists in sibling services
2. offline export import is consistent with the current model

Existing ecosystem support:

- `bot-recorder` already supports LINE webhook ingestion via
  [`line_service.py`](../../../bot-recorder/src/services/line_service.py)
- `personal-rag-system` already supports message ingestion and automatic
  extraction via
  [`/api/v1/ingest/messages`](../../../personal-rag-system/docs/API.md) and
  [`ingest.py`](../../../personal-rag-system/src/personal_rag_system/api/ingest.py)
- `personal-rag-system` also has conversation import and conversation-level
  extraction APIs

For `cats-platform`, the better first interpretation is:

- import selected LINE transcript slices as `conversation_log`
- extract candidate facts/preferences/events/relationship cues
- promote only high-signal items into companion memory / canonical memory

Temporary direction for the first slice:

- reuse `personal-rag-system` extraction first
- keep `cats-platform` as the product-owned destination for selected memories
- migrate extraction in-tree later once the built-in Cats extraction layer is
  ready to replace that staging role

This is better than trying to make the first slice a raw archive mirror.

### Why Not Just Store the Whole Transcript?

Because the current product memory model intentionally separates:

- raw source records
- derived records
- durable memory
- retrieval context

This is not just a conceptual preference. The current extraction logic in
[`src/platform/memory/extraction.ts`](../../src/platform/memory/extraction.ts)
promotes curated companion memory plus selected derived kinds such as
`traits`, `event`, `relationship_note`, and `normalized_note`, but it does not
promote `transcript`, `summary`, `caption`, `tags`, or `metadata` into
canonical durable memory. That means a raw `conversation_log` import on its own
will mostly act as supporting evidence unless an importer or extractor also
produces higher-signal derived records or curated memory entries.

If every LINE transcript is mirrored directly into product memory, retrieval
quality will fall and source-scoped replacement semantics become harder to keep
clean.

## Recommended Architecture

### 1. Remote Access Layer

Put Google Drive access behind `cats-runtime`.

This can be implemented through:

- direct provider SDK/API integration, or
- an MCP-backed connector/tool surface

That choice is an internal runtime detail. The product boundary stays the same:
`cats-platform` talks to `cats-runtime`, not directly to Google APIs.

### 2. Product-Owned Selection Layer

Let the user browse, filter, and choose what should matter to the companion.

The chosen subset becomes `companion-box` source records with stable metadata
and lineage.

### 3. Product-Owned Memory Layer

Use the existing derived-record and canonical-memory pipeline to convert the
chosen subset into:

- supporting evidence
- curated companion memory
- durable canonical memory

### 4. Avoid Full Sync by Default

Default behavior should be:

- read-only
- on-demand fetch
- selected reference retention
- derived-memory promotion only for high-signal facts

## First-Slice Recommendation

The most pragmatic first slice is:

1. Google Drive read-only connector in `cats-runtime`
2. product UI flow in `Cats Chat` to browse folders and select files
3. selected-file serialization into existing `companion-box` source records
4. offline FB/IG exporter that maps chosen records into the same source schema
5. offline LINE importer that maps transcript snippets into `conversation_log`
   plus candidate memory extraction

This sequence fits the current architecture and avoids overcommitting to a
large sync engine before the product proves the value of external knowledge
selection.

## Open Issues

- when to formalize a first-class `remote_ref` source contract after validating
  the first-slice metadata workaround
- whether selected external assets need a stable preview/thumbnail cache inside
  `cats-platform`

## Recommendation

Proceed with a hybrid design:

- `cats-runtime` owns remote, read-only connector access
- `cats-platform` owns selection, curation, memory promotion, and retrieval

Do not choose between "connector" and "companion sync" as if they are
exclusive. The correct split is connector-first access plus selective
product-owned memory.
