# ADR-121: Distribute Apps Independently with Host-Owned Lifecycle

## Status

Accepted direction, 2026-09-28; the user approved organizing the planning documents.
Implementation, version changes, SDK/App publication and Market launch have not started
and are not authorized automatically by this ADR.

This decision continues the initial coordinated-shipping stage of
[ADR-114](114-separate-official-app-sources-and-coordinate-desktop-distribution.md). It
keeps that ADR's repo/SDK/Runtime split and lists independent download and lifecycle as the
next stage. It does not mean the general connectors, servers, workers and product modules
of ADR-094 are implemented.

## Context

Related track: [ADR-122](122-adopt-managed-plugins-for-upstream-capabilities.md)
separately manages optional external-capability Plugins. The Agency content pilot was
delivered on 2026-09-29; the general Plugin SDK and catalog are still to be implemented. The
two tracks coordinate the install, source and lifecycle mechanisms they share. This ADR's
renderer App scope does not grow because of that, and the general Plugin SDK being complete
is not a precondition for implementing this ADR.

Usage is already an independently versioned `.catsapp`, preinstalled with the public
Desktop. Studio already has its own package and the SDK 1.3 image-generation interface, but
it was selected only in an earlier local custom install; the default list of public Desktop
0.5.13 contains only Usage. The existing local registration and disable/remove APIs are not
a complete Market: removal does not delete the package, general repair is unfinished, and
bundled activation does not yet resolve the choice between a newer Market version and an
older bundled version.

The user confirmed two experiences: Usage can be opened from Home right after the first
install and can be restored from Home after being disabled or removed; Studio appears only
in the Market when it is not installed. Disabling either must stop App activity, and
removing either must be able to free the package's space.

## Decision

1. **One package, two shipping policies.** Usage and Studio share the package, install,
   permission, update, repair and removal mechanisms. The Desktop-owned list specifies
   `preinstall` and `homePresence` separately; an App does not declare them about itself.
   Usage is preinstalled with a fixed entry; Studio is optional with an entry after
   installation. Official identity, preinstallation and execution permission are separate.
2. **The host manages the Home entry.** The Usage placeholder needs only the host's built-in
   name, icon, description and App ID; it loads no App code, reads no live usage and starts
   no App background work. A disabled Studio remains an installed card, and disappears once
   removed. Repair, reinstall and enable are all host operations and work even when the App
   is damaged.
3. **Publication, promotion and installation are separate.** cats-apps builds and
   publishes an immutable artifact per App; GitHub Releases continue to be used at first. An
   officially signed Catalog decides which versions are available to the stable and preview
   channels; the local registry records what is actually installed. The Catalog is a
   replaceable discovery source, not an entry point for running remote web pages.
4. **Platform owns the lifecycle.** The App package, clearable cache and user data are kept
   separate. Disabling revokes the bridge and stops App activity; removal additionally
   clears the managed package. Works and settings are kept by default, and data deletion is
   confirmed separately. The shared Runtime, provider installation/login and other Apps are
   unaffected.
5. **Repair is its own action.** It fetches the original bytes of the same trusted version
   again, verifies them and atomically replaces the damaged copy, keeping data. The same
   version with different content still cannot be published. A code bug or provider problem
   cannot be claimed to be fixed by reinstalling.
6. **User choice takes priority over preinstallation.** A Desktop restart or upgrade must
   not resurrect a removed App, re-enable a disabled App, or overwrite a newer Market version
   with an older bundled one. The Usage offline recovery bundle stays in the Desktop
   resources; removing the App does not modify signed installed content, so disk
   reclamation should report this non-reclaimable copy separately.
7. **The SDK is a public contract.** The development kit provides types, documentation and
   isolated test tools; the runtime bridge stays in the host. An App uses features according
   to the compatible range and actual capabilities, embeds no second Runtime, and obtains no
   shell or credentials directly. App updates within the same SDK capabilities can be
   delivered independently; new host capabilities still require updating Desktop first.
8. **Official renderer Apps first.** The first stage opens only the trusted official catalog
   and existing renderer capabilities. A source signature does not equal `system`
   privilege; local development installs keep an explicit local-user identity. Third-party
   submissions, payment, ratings and arbitrary background program execution are planned
   separately.
9. **Upgrade data comes before publication.** The new registry, operation journal and
   source/user intent need tested upgrade and failure recovery. See SPEC-120; clearing the
   profile or downgrading to read new data is not a substitute for migration.
10. **The store and installed management each have an entry.** The Apps Marketplace is a
    separate Desktop page, entered prominently from Home, where users can explore, view
    details and install directly. Settings Apps focuses on managing installed Apps; both
    share the same lifecycle service and state, and users need not go to Settings before
    installing. Plugins use a separate Settings tab; if Home offers a Plugin management
    entry it is a small shortcut and does not apply to the Apps store entry.
11. **Management permission is verified by the host.** User-initiated install,
    enable/disable, update, repair, removal and machine-level setting changes must have a
    verifiable Desktop management context. A general browser/remote client, owner login,
    localhost or a front-end environment flag is not enough to obtain this permission; the
    App SDK also provides no package-management permission. This does not decide the web
    availability of installed Apps or general in-App preferences.

The 2026-09-29 management-entry and authorization addendum is an accepted planning
requirement; the concrete transport/verification contract and the Desktop/browser
acceptance still run from PLAN-112 M0 and do not mean this restriction is currently
implemented.

## Consequences

2026-09-29 component clarification: [ADR-125](125-own-multiple-frontends-and-backends-in-one-app.md)
applies this lifecycle to every frontend/service/worker inside an App as one
management unit. Multiple components never become separate user installations.
Current renderer delivery is the baseline; component execution remains planned.

### Positive

- Usage keeps a first-run and damage-recovery entry, and Studio shows that an App can be
  installed on demand and updated independently.
- Users can stop App activity and reclaim the installed copy without removing the whole
  Desktop.
- App publication no longer requires shipping Desktop in sync; the existing repo and Runtime
  split stays consistent.

### Costs and limits

- A signed catalog, source policy, migration, operation coordination and real disk cleanup
  are needed; adding a Market page alone is not enough.
- The recovery bundle shipped inside Desktop and the user's works are kept, so uninstalling
  does not free all related bytes.
- An unopened renderer already consumes few active resources; no fixed RAM saving or
  one-process-per-App is promised.
- The first version confirms updates manually; resource reclamation, cross-window
  revocation and failure recovery must be verified on the real host and each OS.

## Alternatives Considered

| Option | Trade-off and decision |
| --- | --- |
| Update all Apps together with Desktop | Less implementation, but Studio delivery stays tied to the host; keep the preinstall choice and add independent updates |
| Usage cannot be removed | Convenient to assume it always exists, but fails the user control/recovery requirement; not adopted |
| All Home cards disappear after removal | Simple, but Usage loses its recovery entry; adopt an explicit host Home policy |
| Treat hiding the entry as disable/remove | Cannot guarantee that work stops or disk is freed; not adopted |
| Build a full third-party store first | Listing governance and execution scope go far beyond two official Apps; deferred |

## References

- [SPEC-120](../specs/SPEC-120-app-market-and-lifecycle.md)
- [PLAN-112](../plans/PLAN-112-app-market-and-lifecycle.md)
- [Apps PLAN-004](../../../cats-apps/docs/plans/PLAN-004-independent-app-distribution.md)
- [Current package capabilities](../app-packages.md)
- [Image and work ownership](../specs/SPEC-119-app-image-generation.md)

*Last updated: 2026-09-29*
