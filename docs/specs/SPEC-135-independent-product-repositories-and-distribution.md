# SPEC-135: Independent product repositories and distribution

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft; no repository or distribution cutover implemented |
| **Owner** | Platform integration owner with product and cats-one maintainers |
| **Reviewer** | Independent architecture/release reviewer |

## Summary

Move Desktop and then Mobile to product repositories after the relevant shared
contracts in [SPEC-134](SPEC-134-reusable-platform-packages-and-consumer-boundaries.md)
are proven. Keep `cats-platform` as the shared producer and self-hosted Platform
server/Web home, `cats-runtime` as execution owner, and `cats-one` as composition
tooling. Bot's independent rename/Hub work remains governed by merged PR #51.

## Goals

- Give each product a standalone source/build/release boundary.
- Retain Web/server availability and Mobile access to common product services.
- Preserve installed Desktop identities, data and update continuity during the move.

## Non-Goals

- Creating/renaming repositories or publishing/deleting releases in this docs task.
- New product UI, a cloud service, a central daemon or shared product storage.
- Changing Bot #51's decisions or implementing its unresolved product choices.
- Moving Apps/Plugins sources, changing their artifact formats or introducing `cats-web`.

## Requirements

### Functional Requirements

1. **FR-1 — Ownership inventory.** Before each move, classify source, tests,
   documentation, assets, workflows and state schemas as shared Platform,
   product-specific or historical. Assign one canonical owner and verify the
   dependency graph. Preserve traceable source history/provenance.
2. **FR-2 — Package gate.** Moved products build from declared immutable Platform
   packages/resources and a selected Runtime artifact. No sibling import, source
   copy step, checkout-required dependency or hidden local symlink is permitted
   in the reproducible build. Local workspaces remain an optional developer aid.
3. **FR-3 — Desktop destination.** `cats-desktop` owns application entry/composition,
   Desktop-specific renderer/navigation, native host policy, app identity, App
   payload lock, packaging resources and Desktop release workflows. Reusable
   Electron mechanisms and SPEC-134's shared conversation renderer remain in
   Platform packages; Desktop owns its domain/navigation/action adapters. Desktop
   imports no Bot code. The Desktop/Bot renderer gate passes before this cutover.
4. **FR-4 — Platform host continuity.** Platform retains the headless API/server,
   shared interaction engine, composable Chat/Work/Code services, App SDK/install/load
   mechanisms and a thin self-hosted Web application. Shared Web/product modules
   are consumed by both Web and Desktop. The server may not import Desktop UI or
   require Desktop's process to serve Mobile. Existing CLI/startup behavior remains
   available to cats-one; a public entry change needs an explicit version boundary.
5. **FR-5 — Mobile destination.** `cats-mobile` owns RN views, navigation, device
   adapters, auth storage and mobile build/distribution configuration. It consumes
   public core/client contracts and the authenticated Platform endpoint. Its bundle
   contains no Node/Electron/CLI implementation. An isolated Metro export and
   paired-client acceptance are required before its old source is removed.
6. **FR-6 — Mobile delivery.** Preserve the current static Expo bundle/pairing flow
   until a separate delivery change is selected. When Desktop carries a Mobile
   artifact, pin its version/digest, Platform API compatibility, Expo SDK,
   runtimeVersion and manifest/bundle protocol compatibility in Desktop's release
   input. The serving host derives its manifest from validated artifact metadata
   and rejects incompatible bundles rather than keeping independent SDK/runtime
   constants. Do not build an arbitrary sibling Mobile checkout implicitly.
   A new native-store release is not required to split the source repository.
7. **FR-7 — Bot independence.** Use `cats-bot` as the target name, but record the
   actual source/artifact identity at each stage. Bot ADR-007/PLAN-008 exclusively
   control its rename, clean break and release disposition. ADR-008/009/010 retain
   Hub/core, coordinator and execution-environment ownership. Desktop extraction
   never migrates Bot data or shares its fleet registry.
8. **FR-8 — cats-one scope.** Keep current launcher defaults, argument forwarding,
   Runtime readiness/reuse and ownership-aware shutdown. Member inventory/skills
   synchronization recognizes a new repository only when it exists and its canonical
   instructions are ready. The development manifest is neither an npm lock nor a
   product artifact lock. Products remain runnable without installing cats-one.
9. **FR-9 — Version meanings.** Separate application, Platform-host/library, Runtime
   and App SDK version sources. Existing updater versions remain monotonic. App
   SDK compatibility and the minimum Platform-host floor use the actual embedded
   Platform capability version, never a newly independent Desktop version.
10. **FR-10 — Distribution handover.** Specify the repository/channel used by existing
    installed Desktop updaters, the target channel, signing identities, artifact
    names and a tested transition before enabling a new publisher. Keep old
    published releases immutable. If an old-feed bridge release is needed, it is
    a new explicitly authorized release, not an edit of old release assets.
11. **FR-11 — Installed state.** Source relocation alone preserves Desktop appId,
    profile roots, credentials, data schema and uninstall scope. Validate upgrade
    from the last supported installed Desktop and restart/failure recovery. Any
    necessary schema change follows validated, backed-up, atomic migration rules;
    Bot ADR-007's exception does not waive Desktop protection.
12. **FR-12 — Independent delivery.** Product CI builds/tests from pinned dependencies.
    A Platform change checks affected consumers; unchanged products and cats-one
    are not republished automatically. Each product release owns its exact source
    and artifact receipts, signing policy and compatibility validation.
13. **FR-13 — Scoped completion.** A repository move completes only after source,
    documentation, build, CI and ownership cutover pass. Distribution cutover is a
    separately evidenced milestone requiring release authorization. Update governing
    ADRs/instructions only for completed slices; preserve the difference between
    new repo existence, successful CI, publication and installed-upgrade evidence.

### Non-Functional Requirements

- **Security:** retain signing, permission checks, session boundaries and account
  isolation; secrets are provisioned in the destination without committing them.
- **Reproducibility:** a clean checkout of one product plus its declared artifacts
  is enough to build; integration checks record exact cross-repository revisions.
- **Maintainability:** Platform owns its shared packages, each product owns its
  selected dependencies, and no circular product import is introduced.

## Acceptance Matrix

| Gate | Required evidence |
|------|-------------------|
| Desktop source | Standalone build, product/host tests and three-OS candidate packaging; shared Web/server still build and run |
| Desktop distribution | Selected old installer updates to the authorized new candidate; identity/data retained; failure/restart recovery and rollback policy verified |
| Mobile source | Isolated dependency installation, typecheck and Metro iOS/Android export with no sibling Platform source |
| Mobile delivery | Pinned bundle serves/pairs with matching Expo SDK/runtimeVersion/manifest metadata; incompatible bundles rejected; auth, reconnection, consent and supported product surfaces work against selected Platform versions |
| cats-one | Packed launcher startup/reuse/shutdown with selected packages; workspace check/dry-run/sync and recovery cover the actual new members |
| Apps/Plugins | Existing producer artifacts still load through supported SDK/host capabilities; no unnecessary artifact rebuild |
| Governance | One source owner per moved capability; ADR/index/instruction/workspace updates match actual migration stage |

## Dependencies and Open Questions

- [PLAN-127](../plans/PLAN-127-shared-platform-package-extraction.md) provides the
  shared-package gate; completion is evaluated per capability, not inferred from
  the existence of an npm package.
- The old-to-new Desktop feed bridge, destination repository provisioning,
  application/package version-source arrangement and Mobile compatibility policy
  must be settled and tested in PLAN-128 before their respective cutovers.
- No exact release version/date is selected by this draft. Bot #51's release plan
  and open questions are neither prerequisites for drafting nor answers supplied here.

## References

- [ADR-143](../decisions/143-separate-product-repositories-after-platform-contracts-stabilize.md)
- [ADR-110](../decisions/110-keep-platform-clients-in-one-repository-with-explicit-package-boundaries.md)
- [ADR-095: static Mobile delivery](../decisions/095-distribute-mobile-as-static-expo-go-bundle-served-by-desktop.md)
- [PLAN-128](../plans/PLAN-128-product-repository-extraction.md)
- [Cross-repository release guide](https://github.com/cats-inc/cats-one/blob/main/docs/release-guide.md)

*Created: 2026-10-29*
