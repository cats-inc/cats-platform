# SPEC-134: Reusable Platform packages and consumer boundaries

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft; documentation only, no implementation authorized |
| **Owner** | Platform integration owner |
| **Reviewer** | Independent architecture reviewer and affected product owners |

## Summary

Implement [ADR-142](../decisions/142-publish-reusable-platform-packages-for-independent-products.md)
as supported, versioned libraries/resources consumed by Desktop and Bot, with a
client-safe path for Mobile. This is the prerequisite for the repository moves
in [SPEC-135](SPEC-135-independent-product-repositories-and-distribution.md).
The baseline includes merged Bot PR #51's design, not an implemented Hub.
The owner's 2026-10-29 refinement requires extracting Desktop's existing
conversation presentation for both Desktop and Bot. "Hierarchy" below means
structure inside messages, not native window layers.

## Goals

- Replace proven duplicate implementations with one producer and tested consumers.
- Preserve product behavior, execution authority and profile isolation.
- Make consumer builds reproducible without a neighboring source checkout.
- Deliver shared user/agent bubbles and internal message hierarchy with Desktop
  fidelity, including streaming, interactions and narrow Bot conversations.

## Non-Goals

- Moving repositories, changing runtime protocols or publishing any package now.
- Merging Bot and Chat/Work/Code domain models, databases or Runtime instances.
- Implementing Bot #51's Hub, coordinator, rename or WSL/docker profiles.
- Forcing one whole application renderer, React Native view implementation,
  dependency bundle or release cadence; the shared DOM conversation renderer is
  required for Desktop and Bot.
- Changing Electron to WebView2 or changing native window layering.

## Design Overview

Names below are proposed package names, not existing registry entries. A first
slice freezes only the names and exports it actually implements. The App SDK's
existing public import and compatibility contract remain supported.

| Boundary | Proposed package | Content and allowed dependencies |
|----------|------------------|----------------------------------|
| Pure core | `@cats-inc/platform-core` | Portable DTOs, schemas, pure state/projection helpers, shared locale data/tokens; no React, DOM, Node, Electron or Runtime server imports |
| Client | `@cats-inc/platform-client` | Platform HTTP/event clients over core; injected fetch/stream/auth storage adapters; no host process or profile discovery |
| Node host | `@cats-inc/platform-host` | Selected Node-only process, storage, setup and native-helper adapters over core and public Runtime contracts; resources declared per OS/arch; no Electron dependency |
| Electron host | `@cats-inc/platform-electron` | Window/tray/update/dialog/IPC mechanisms over core/host, with product-supplied policy; Electron is provided by the application |
| Web UI | `@cats-inc/platform-ui-web` | Desktop-derived conversation renderer, styles and reusable DOM/React controls over pure presentation contracts; product adapters supply data/actions; no required Platform client, server, router or Electron imports; React peers explicit |
| App SDK | Existing App SDK contract | Extension/package/permission interfaces under their existing independent version policy |

The server and optional Chat/Work/Code services compose these boundaries. The
generic packages never import those services or any product application. A
native helper that a headless Bot core needs belongs behind the Node boundary,
even if its original source lived under Desktop. Additional packages need a
measured dependency or ownership reason; this table is not a six-package first PR.

## Requirements

### Functional Requirements

1. **FR-1 — Public entries.** Every extracted package declares supported `exports`,
   type declarations and packaged assets. Consumers may not import a sibling
   checkout, private source/build path or a catch-all application barrel. Importing
   an entry performs no service launch, installation or product-state discovery.
2. **FR-2 — Dependency closure.** Pure/client packages and their emitted declarations
   must compile and bundle in browser and React Native targets without Node or
   Electron transitively. Node host imports work without Electron installed.
   Consumers must not install native/desktop dependencies just to obtain DTOs.
3. **FR-3 — Explicit host inputs.** Hosts supply product identity, data/config/log
   roots, selected Runtime entry/version, credentials, helper paths, locale,
   clocks, authorization hooks and lifecycle policy where applicable. Shared
   libraries may not default to Desktop's `~/.cats` or Bot's `~/.catsbot`.
4. **FR-4 — Provider truth.** Runtime remains authoritative for provider topology,
   catalogs, per-model controls, catalog revisions, install metadata and execution
   admission. Platform adapters may project those contracts, not maintain another
   catalog or infer an unobserved capability. Product allowlists/order remain inputs.
5. **FR-5 — Setup resources.** Extract the selected scripts and complete dependency
   closure, license and provenance into an immutable artifact. Expose a typed
   check/apply result and fixed helper/action allowlist. Keep prerequisite ordering,
   explicit user install action, concurrency exclusion, auth/restart distinction
   and rechecks. Package install/import and app startup never install a provider.
6. **FR-6 — Native helper contract.** Record helper protocol/version, OS/arch,
   executable resource, source/build provenance, digests and licenses. Product
   packaging owns signing and final resource placement. Preserve bounded requests,
   timeouts, shutdown and exclusion of all product approval/control windows.
   Unsupported OS/environment fails visibly; extraction adds no new support claim.
7. **FR-7 — Bot isolation.** Core/CLI use only pure or Node-safe entries. Electron
   services stay in the Hub/shell and cross the authenticated Bot host channel.
   The Hub does not gain a core's Runtime URL/key. Shared helpers cannot turn a
   coordinator request into owner authority or allow direct cross-core access.
   Bot ADR-007/008/009/010 and SPEC-008/009 continue to own these policies.
8. **FR-8 — Product parity.** Preserve Desktop's onboarding composition and Bot's
   provider-first five-provider selection. Catalog ordering/controls, native consent,
   locale switching, updater dialogs, hidden-window restoration, layering and user
   titles retain each product's contract. FR-15 through FR-20 explicitly scope
   Bot's conversation presentation alignment; other changed UX needs separate scope.
9. **FR-9 — Mechanism versus policy.** Extract Telegram transport, process management
   or life-loop mechanics only after documenting common semantics and injected
   policies. Bot work queues/heartbeat decisions and Platform missions/managed work
   remain product modules. Similar names alone do not authorize schema unification.
10. **FR-10 — Versioned consumption.** Published libraries use semantic versions and
    immutable integrity-pinned consumer locks. Initial library slices may share a
    release train; App SDK retains its own version. Breaking 0.x contracts require
    the next minor. Products record the selected Platform libraries, Runtime and
    native resource versions independently of their application version.
11. **FR-11 — Existing contracts.** Preserve the current self-hosted Platform CLI,
    its supported package entries and App SDK imports until an explicitly versioned
    transition. App compatibility follows ADR-128: App SDK compatibility plus the
    minimum Platform-host version, independent of Desktop's application version.
12. **FR-12 — Consumer cutover.** Phase 1 names two real consumers for each extracted
    capability. Setup, native-helper and conversation-renderer extraction require
    Desktop and Bot. Other client/UI slices may use Desktop/Web/Mobile according
    to actual dependencies; those consumers cannot replace Bot for FR-15.
    Prove those consumers against the same packed artifact before deleting replaced
    source. Capture before/after behavior and failure paths. Bot must not acquire a
    Platform API/domain dependency just to satisfy this gate. Source links are for
    local iteration only; packed consumption is the release gate.
13. **FR-13 — State and rollback.** Source extraction alone preserves IDs, formats,
    profile roots and uninstall scope. A needed data-format change is a separate
    versioned slice with validation, backup, atomic replacement and failure recovery.
    Bot ADR-007's explicit clean-break exception applies only to its identity track.
    Rollback reverts code/artifact selection without silently downgrading data.
14. **FR-14 — Governance cutover.** Update import-boundary tests, member instructions,
    affected ADR status and resource provenance in the consumer implementation PR.
    Permit only the new public entries; do not remove headless/environment guards.
    This draft does not relax today's blanket Bot Platform-import prohibition.
15. **FR-15 — Required conversation renderer.** Extract from the working Desktop
    implementation identified in the source map below. Desktop and Bot consume the
    same packed renderer and stylesheet artifact through public entries. Reusing
    only React, Markdown dependencies, colors or generic controls does not satisfy
    this requirement. Preserve Desktop behavior while bringing Bot's matching
    conversation content to the same presentation contract.
16. **FR-16 — Internal hierarchy and identity.** The common presentation contract
    preserves user-turn association, agent/speaker identity, response segments
    (and lanes when actually supplied), and ordered text/tool/status blocks within
    a response. Stable IDs associate tool input/result and live/final content with
    the correct execution; repeated tool IDs in different turns must not merge.
    Keep existing grouping, indentation, expansion/detail visibility and terminal
    states from the frozen Desktop baseline. Do not flatten a structured response
    into one Markdown string or an unrelated list of tool cards. Do not invent
    speakers, child work, lanes or hidden reasoning from unstructured text.
17. **FR-17 — Product adapters and authority.** Define browser-safe presentation
    DTOs and callbacks instead of exposing Platform ChatCat/channel/workflow stores
    as the reusable API. Inject speaker/locale/theme data, link/attachment resolution,
    navigation, clipboard and action handlers. No shared component hardcodes
    `/api/channels`, product routes, `window.catsBot` or an Electron/WebView2 bridge.
    Bot uses its own core/host channel; it must not call Platform APIs to render.
    Approval, retry, cancel and other actions remain subject to the originating
    product's live state and authorization. A common card never grants authority.
    Desktop's group/parallel/compare modes remain intact; sharing their display
    primitives does not create those workflows or capabilities in Bot.
18. **FR-18 — Data fidelity and streaming recovery.** Inventory the Runtime-to-
    product-to-view path in both consumers before freezing the renderer API. Each
    product's adapter/core must retain the identities, ordering and block data needed by
    FR-16 for live display and durable reconstruction; a live-only UI workaround
    is insufficient. Reconcile optimistic user messages, streamed segments and final
    snapshots without duplicates, lost tool results or changing speaker ownership.
    Reload, reconnect, conversation switching and reopening must restore the same
    supported hierarchy and authoritative interaction state. Plain-text-only or
    coarse providers remain truthful single-response fallbacks. A missing Runtime
    contract is tracked with Runtime; it cannot be hidden by fabricated hierarchy.
    Do not assume the Desktop reference already satisfies durable fidelity: its
    current durable concurrent projection can reconstruct a text-only block from
    the final response. Record intended live-to-final projection rules in the
    parity matrix, and specify any Desktop or Bot retention gap against this
    requirement as a bounded product data-contract correction before UI-3 passes.
    Such corrections are distinct from preserving the visual/interaction baseline;
    silently accepting lost structure as parity or redesigning unrelated UI is invalid.
    Existing text-only history uses an evidence-based fallback; an upgrade must
    never fabricate tool/status events that the old record did not retain.
    Any persisted-format change follows FR-13's validation, backup, atomic upgrade
    and recovery rules, with the Bot identity exception applied only to that track.
19. **FR-19 — Visual and interaction parity.** Freeze reference fixtures and
    screenshots from Desktop before extraction, including bubble alignment,
    content-based width, spacing, typography, avatars/labels, Markdown, internal
    groups/blocks and action visibility. At matched content widths, font, theme,
    locale, zoom and display scale, both consumers must reproduce the reference
    without unreviewed visual differences. Preserve the reference's supported
    expand/collapse, copy, keyboard/focus, streaming indicators and scroll-follow
    behavior; Bot approval/cancel controls must remain reachable and correctly
    scoped. Intentional product actions or unsupported features are enumerated in
    the parity matrix rather than silently dropped. Bot's window chrome may differ.
20. **FR-20 — Narrow layout and completion.** Validate at 340 and 480 CSS-pixel
    content widths and the recorded normal Desktop width, plus Bot's supported
    minimum if smaller. Long code, tables, URLs, nested lists, localized labels and
    expanded tool/decision content must remain readable, with no conversation-wide
    horizontal overflow or clipped controls; bounded code/table scrolling is allowed.
    Responsive wrapping must preserve hierarchy, identity and available actions.
    Required UI gates below must pass in both actual products from the same packed
    artifact before deleting either implementation or declaring this slice done.
    A gallery, screenshots alone or a Desktop/Web pair is insufficient.

### Conversation extraction source map

Baseline inventory: Platform `da391a4e45d667d238d1e934afbe788c886957c1`.
Freeze the exact implementation revisions again in PLAN-127 Phase 4; these are
extraction starting points, not public import paths or a mandate to copy entire modules.

| Existing source | Responsibility to preserve or separate |
|-----------------|----------------------------------------|
| `src/products/shared/renderer/components/conversation-view/TranscriptMessageItem.tsx`, `TranscriptMessageActions.tsx` | User/agent bubbles, speaker presentation and supported actions; separate product types and callbacks |
| `ConversationTranscriptPanel.tsx`, `ConcurrentClusterRenderer.tsx`, `LiveTranscriptIndicator.tsx` in that directory | Live/durable composition, speaker segments and ordered content blocks; retain Desktop's existing mode behavior |
| `src/products/shared/renderer/components/MessageBody.tsx`, `MessageBodyMarkdown.tsx`, `messageBodySegmenter.ts` | Body/Markdown/mention/attachment presentation; inject routing and resource resolution |
| `src/shared/liveIndicator.ts`, `src/shared/runtimeContentBlocks.ts`, `src/products/shared/renderer/components/conversation-view/concurrentTranscriptProjection.ts` | Identity, ordering and live/durable projection evidence; keep domain-specific workflow derivation in product adapters |
| Existing transcript styles, locale resources and `useTranscriptAutoScroll.ts` | Inventory the actual dependency closure; preserve CSS/DOM contracts and scroll semantics |

The Desktop source map is a working presentation baseline, not a claim that every
live block already survives finalization. In particular, inventory the text-only
reconstruction in `buildDurableClusterProjection` alongside Bot's current flattening.
Both products' required retention corrections and upgrade tests belong in Phase 4.

The Bot baseline includes `src/renderer/note/NoteApp.tsx`, `transcript.ts`, its
bridge and `src/core/queue/turnRunner.ts` / transcript store. Mapping these to
presentation DTOs must identify current data loss, required persistence changes
and existing approval/desktop-control redaction. Raw tool secrets, screenshots or
redacted desktop input must not be recovered into shared UI fixtures or history.

### Non-Functional Requirements

- **Security:** capabilities remain scoped to the originating product/session;
  secrets and Runtime credentials never become global package state. Root-routing
  and host-API isolation do not promise an OS filesystem sandbox for native CLIs
  running under the same account; Bot ADR-010 still governs environment claims.
- **Reproducibility:** packed consumers build with sibling source directories absent;
  resource paths work after relocation and in packaged applications.
- **Performance:** measure startup/process count and loaded dependency footprint
  before/after; importing shared code must not introduce a service/process. No
  memory reduction is claimed merely because source is shared.
- **Compatibility:** validate the supported TypeScript/module targets of both
  consumers; the existing Bot Node/type-stripping workflow and Mobile Metro build
  cannot depend on unpublished Platform source transformations.

## Acceptance Matrix

| Gate | Required evidence |
|------|-------------------|
| Pure/client boundary | Packed browser and Metro builds; emitted declaration checks; negative Node/Electron dependency cases |
| Node/headless boundary | Isolated Node process without Electron; no import-time filesystem/network/process effects |
| Setup | Deterministic prerequisite/auth/restart/failure cases plus native check/install acceptance on each claimed OS in disposable environments |
| Desktop control | Existing native safety cases in both consumers; protocol mismatch; self-exclusion including externally hosted Bot cores and Hub identity |
| Product behavior | Relevant Desktop and Bot golden scenarios, including denial/cancellation/reconnect, updates, hidden-window restart and language/model persistence |
| UI-1: shared implementation | Desktop and Bot import the same packed conversation renderer/styles; both build without sibling sources, Platform API access or Node/Electron leaking into the UI package |
| UI-2: bubbles and hierarchy | Matched baseline captures and semantic assertions for user/agent bubbles, multiple response segments and ordered text/tool/status blocks; supported detail expansion and same tool ID in different turns |
| UI-3: live and durable parity | Fixture event traces through each product adapter: incremental text, interleaved tool input/result, final seal, failure/cancel, plain-text-only provider, reconnect/reload/switch/reopen; no new loss/duplicate/flattening, truthful old-text-history fallback and any required format-upgrade recovery |
| UI-4: interactions and boundaries | Actual product copy/expand/keyboard/focus/scroll behavior; pending/resolved/denied/expired decisions, stale replies and cancel; wrong Bot/conversation actions rejected, external links and redacted data remain protected |
| UI-5: narrow and Desktop regression | 340/480 CSS px, actual smaller Bot minimum if any, normal Desktop width; long/localized/expanded content and controls remain usable; Desktop direct/group/parallel/concurrent displays retain their prior contracts |
| UI-6: product acceptance | Inspect real isolated Desktop and Bot renderers with controlled fixtures and no real user-state writes; retain reference/comparison evidence and document allowed differences before final independent review |
| Packaging | Consumer tarballs/installers contain complete scripts/helpers/licenses; exact version, digest, OS/arch and signing receipt |
| Isolation | Shared API/root-routing rejects cross-product or cross-core state access/deletion and authority reuse; test with two roots/cores, never real profiles; this is not a same-account native CLI filesystem-sandbox claim |
| Cutover | Both consumers use the same producer artifact; duplicate removed only for the verified capability; rollback demonstrated |

## Dependencies and Open Questions

- [Bot #51](https://github.com/cats-inc/cats-bots/pull/51) is merged design input;
  relevant PLAN-009 implementation/acceptance remains separate. Setup extraction
  can serve the current shell first; Hub adoption waits for its host-service phase.
- Exact npm names, initial package versions, first exported signatures and native
  resource distribution format are frozen in PLAN-127 Phase 1 before publication.
- Existing Runtime contracts suffice for the first duplicate extraction. A missing
  generic execution capability requires Runtime-owned work, not a Platform fork.
- Conversation parity is required, not an optional generic-control candidate.
  Phase 4 resolves exact presentation DTOs and both products' data-retention gaps before
  cutover. Other Web UI consumers and a different native host are not prerequisites.

## References

- [ADR-142](../decisions/142-publish-reusable-platform-packages-for-independent-products.md)
- [SPEC-013: catalog consumption](SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [SPEC-133: desktop-control contract](SPEC-133-desktop-control-session-mcp.md)
- [ADR-128: App compatibility](../decisions/128-make-the-app-sdk-version-the-sole-app-compatibility-gate.md)
- [PLAN-127](../plans/PLAN-127-shared-platform-package-extraction.md)

*Created: 2026-10-29*
