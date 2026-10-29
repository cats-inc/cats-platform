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

## Goals

- Replace proven duplicate implementations with one producer and tested consumers.
- Preserve product behavior, execution authority and profile isolation.
- Make consumer builds reproducible without a neighboring source checkout.

## Non-Goals

- Moving repositories, changing runtime protocols or publishing any package now.
- Merging Bot and Chat/Work/Code domain models, databases or Runtime instances.
- Implementing Bot #51's Hub, coordinator, rename or WSL/docker profiles.
- Forcing one renderer, one dependency bundle or one product release cadence.

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
| Web UI | `@cats-inc/platform-ui-web` | Proven reusable DOM/React controls over core/client; React peer requirements explicit; no server or Electron imports |
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
   titles retain each product's contract. A changed UX requires separate scope.
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
    capability. Setup and native-helper extraction require Desktop and Bot; client
    and Web UI slices may use Desktop/Web/Mobile according to actual dependencies.
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

## References

- [ADR-142](../decisions/142-publish-reusable-platform-packages-for-independent-products.md)
- [SPEC-013: catalog consumption](SPEC-013-provider-catalog-consumption-and-ui-seam.md)
- [SPEC-133: desktop-control contract](SPEC-133-desktop-control-session-mcp.md)
- [ADR-128: App compatibility](../decisions/128-make-the-app-sdk-version-the-sole-app-compatibility-gate.md)
- [PLAN-127](../plans/PLAN-127-shared-platform-package-extraction.md)

*Created: 2026-10-29*
