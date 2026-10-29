# ADR-142: Publish reusable Platform packages for independent products

## Status

Proposed — 2026-10-29. The owner requested this design package after
[Cats Bot PR #51](https://github.com/cats-inc/cats-bots/pull/51) merged at
`4fa3a395640799e9556fffca9d958b5249c3e179`. Documentation is authorized;
package extraction, dependency changes and publication have not started.
Requirements and delivery gates are in [SPEC-134](../specs/SPEC-134-reusable-platform-packages-and-consumer-boundaries.md)
and [PLAN-127](../plans/PLAN-127-shared-platform-package-extraction.md).

## Context

Platform currently combines a product server, Web renderer, Electron host,
Mobile client, shared domain code and App hosting. Its root npm export starts
at the Electron entry; the root package is not a general-purpose client library.
Mobile consumes a guarded internal source entry through relative imports.

Bot deliberately avoids the Platform application and uses Runtime directly.
At Platform `07a02f3a30b9e02f0e25e01c348af69a500b3ae6` and Bot's merged PR #51:

- all 34 vendored setup files match their Platform sources;
- ten Windows desktop-control source/project files are identical;
- tray, Telegram and life-loop code include adapted Platform implementations;
- model catalogs already come from Runtime's public catalog contract.

The first two are concrete extraction candidates. Adapted code needs a semantic
comparison before sharing: Bot lifecycle and conversation rules differ from
Platform's product policies. A shared name does not establish a shared schema.
Separate repositories can consume packages; missing package boundaries currently
make source copying the practical integration path.

Owner clarification (2026-10-29): shared UI must include Desktop's existing
user/agent bubbles and the hierarchy **inside conversation messages**. This is
not native wallpaper/desktop/topmost window layering. Bot ADR-003 aligned React
and Vite while explicitly keeping a separate implementation; sharing the stack
or a few controls did not deliver conversation presentation parity.

## Decision

1. **Keep `cats-platform` as the shared platform owner.** Do not create a
   `cats-platform-base` repository. Publish bounded libraries and host resources
   from this repository; products select the capabilities they use.
2. **Separate repository, package and process boundaries.** One repository may
   publish several libraries, native resources and an executable host. Importing
   a library does not require a Platform server, Desktop installation or shared
   Runtime process. Product hosts may still pin and launch Runtime directly.
3. **Separate execution environments physically.** Establish pure core/contracts,
   network client, Node host, Electron host and Web UI package boundaries.
   App SDK keeps its existing independent public contract. SPEC-134 defines the
   allowed dependencies. Package names are proposed until the first export review;
   create only packages backed by a concrete extraction and consumer.
4. **Expose supported exports and resources.** Consumers use versioned package
   entries, never sibling paths, private build paths or copied implementation.
   Scripts and native helpers need versioned resource/protocol manifests, OS/arch
   selection, licenses and digests as well as TypeScript APIs. Package installation
   and import must not install providers, start services or discover user profiles.
5. **Preserve authority.** Runtime owns provider execution, catalogs, interaction
   protocols and install/check metadata. Platform owns reusable host mechanisms
   and product integration. Products supply identities, roots, supported-provider
   policy, update feeds, lifecycle decisions and authorization. Sharing never
   grants a caller additional rights or unifies product data roots.
6. **Keep domain modules composable.** Chat/Work/Code's common interaction engine,
   product services and App hosting remain Platform-owned optional modules.
   Platform core and generic host modules do not import product implementations.
   Bot retains its own domain, queue, persona, heartbeat and fleet policy. A Bot
   consumer does not have to load Chat/Work/Code or use their storage schema.
7. **Preserve the Bot #51 design.** The proposed Bot Hub owns Electron services;
   each headless core owns its Runtime, tools, native helper and Bot state. A core
   may use Node-only Platform mechanisms but never Electron services directly.
   The authenticated Bot host channel, coordinator authority and native-only
   initial environment stay Bot-owned. Package adoption does not implement #51.
8. **Extract before moving product repositories.** First replace an identified
   duplicate in both Desktop and Bot and prove both consumers from packed artifacts.
   [ADR-143](143-separate-product-repositories-after-platform-contracts-stabilize.md)
   governs subsequent source moves. Existing Bot import guards and vendoring remain
   the implemented contract until the corresponding consumer change lands.
9. **Extract Desktop's conversation presentation for Desktop and Bot.** The Web UI
   slice is a required deliverable with these two consumers; other products select
   it only when appropriate. Start from Desktop's working renderer, message/block
   projections and styles. Preserve user/agent bubbles, internal message hierarchy,
   streaming and supported interactions, with a verified narrow conversation layout.
   Do not replace the reference with a reduced renderer merely to make extraction
   easier. Product adapters supply data and authorized actions without importing
   Platform application state, routes or APIs into Bot. Sharing presentation does
   not give Bot Chat/Work/Code's workflow modes or merge their domain models.
   SPEC-134 defines the hierarchy/data, parity and dual-consumer gates; PLAN-127
   gives the UI slice its own phase. This supersedes Bot ADR-003's separate-UI
   direction only when the coordinated consumer cutover is implemented. It does
   not change either Electron host or authorize a WebView2 migration.

## Consequences

### Positive

- Shared fixes have one implementation and a tested release consumed by products.
- Desktop and Bot use the same conversation renderer instead of maintaining
  progressively different bubble and message-hierarchy implementations.
- Native and mobile dependency boundaries become installable contracts.
- Bot remains independently runnable and its data remains independently owned.

### Negative

- Public exports, helper protocols and package resources become versioned obligations.
- Consumers must deliberately update pins; sharing does not update installed products.
- Prematurely combining product policies would create a less reusable platform.
- Renderer extraction must remove current router/API/domain coupling without
  losing Desktop presentation behavior. Both products need a live/durable gap
  inventory; either may need a separately validated transcript-data correction
  to satisfy the hierarchy/recovery contract. The reference is not evidence that
  Desktop already retains every live block in history.

### Neutral

- Shared modules need two real consumers, not necessarily all three products.
  The required conversation-renderer slice specifically needs Desktop and Bot;
  Desktop/Web or a component gallery cannot substitute for Bot acceptance.
- The existing application-first `@cats-inc/cats-platform` package and CLI continue
  to work. New library packages do not silently repurpose its public entry points.
- This proposal does not change App/Plugin producers, release versions or user data.

## Alternatives Considered

| Alternative | Benefit | Cost / reason not selected |
|------------|---------|----------------------------|
| Continue vendoring | No new package pipeline | Fixes and provenance refresh remain duplicated; retain only until replacement is verified |
| Import the current Platform application | Immediate access to code | Couples Bot and Mobile to application startup, state and environment dependencies |
| Add `cats-platform-base` | Leaves current repository layout untouched | Adds another owner while leaving Platform's mixed responsibilities unresolved |
| One universal renderer/domain | Maximum apparent reuse | Erases Bot policy and DOM/React Native distinctions; share only proven contracts |

## References

- [ADR-110](110-keep-platform-clients-in-one-repository-with-explicit-package-boundaries.md),
  [ADR-128: App compatibility](128-make-the-app-sdk-version-the-sole-app-compatibility-gate.md)
- [Bot ADR-006](https://github.com/cats-inc/cats-bots/blob/4fa3a395640799e9556fffca9d958b5249c3e179/docs/decisions/006-share-runtime-catalogs-and-package-provider-setup-helpers.md)
  and [Bot ADR-008](https://github.com/cats-inc/cats-bots/blob/4fa3a395640799e9556fffca9d958b5249c3e179/docs/decisions/008-run-every-bot-as-a-headless-core-under-one-hub.md)
- [Runtime ADR-013: provider install metadata](https://github.com/cats-inc/cats-runtime/blob/main/docs/decisions/013-extend-provider-manifests-with-install-and-check-metadata.md)
- [Node package entry points](https://nodejs.org/api/packages.html#package-entry-points)
  and [React Native platform-specific code](https://reactnative.dev/docs/platform-specific-code),
  consulted 2026-10-29; these support export/environment separation, not a mandate
  to split repositories.

*Proposed: 2026-10-29*
