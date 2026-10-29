# PLAN-128: Product repository extraction

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft; source and distribution ownership unchanged |
| **Owner** | Platform integration owner with product and cats-one maintainers |
| **Reviewer** | Independent architecture/release reviewer |

## Related Spec

[SPEC-135](../specs/SPEC-135-independent-product-repositories-and-distribution.md),
following [ADR-143](../decisions/143-separate-product-repositories-after-platform-contracts-stabilize.md).
This draft was requested together with its specification. Implementation,
repository provisioning and release operations remain outside the docs task.

## Overview

First prove shared dependencies through [PLAN-127](PLAN-127-shared-platform-package-extraction.md).
Move Desktop, validate Web/server continuity, then move Mobile after its client
contract stabilizes. Track source ownership and distribution handover as different
milestones. Bot's rename/Hub work is not a repository move performed by this plan.

## Implementation Phases

### Phase 1: Cutover inventory and compatibility design

- [ ] 1.1: Map every Desktop/Mobile source, test, asset, workflow and guide to a
      target owner. Identify shared Web/product modules and preserve traceable history.
- [ ] 1.2: Confirm the relevant PLAN-127 package gates: its Phase 4 Desktop/Bot
      conversation-renderer parity before Desktop extraction, and a fully packed
      Mobile client build before Mobile extraction. List unresolved source imports.
- [ ] 1.3: Specify application, Platform-host/library, Runtime and App SDK version
      sources. Define where manifests/receipts retain the actual embedded Platform
      version for App SDK and minimum-host compatibility checks.
- [ ] 1.4: Map installed Desktop feeds to the proposed publisher. Choose and test
      feed continuity/bridge behavior, signing identities, monotonic versions,
      source/artifact pins and rollback policy before distribution handover.
- [ ] 1.5: Record repository/CI/permission provisioning and the order of producer,
      consumer and workspace changes. Keep secrets outside source control.

**Exit gate:** reviewed ownership inventory, package readiness and concrete
distribution/compatibility plan. No existing release is edited or deleted.

### Phase 2: Extract Desktop source

- [ ] 2.1: Under implementation authorization, create `cats-desktop` and transfer
      the selected source with preserved history/provenance and member instructions.
- [ ] 2.2: Move Desktop composition, product-specific renderer/navigation, identity,
      App payload lock, packaging resources and Desktop CI/release configuration.
      Keep generic host modules, server/domain and shared Web modules in Platform.
- [ ] 2.3: Install only declared immutable dependencies/resources in clean product
      builds. Remove production sibling imports, implicit copy/build steps and
      hidden local workspace requirements.
- [ ] 2.4: Validate Desktop behavior and three-OS candidate packaging from the new
      checkout. Keep its product/app/signing identities and data roots unchanged.
- [ ] 2.5: Validate the remaining Platform CLI, Web renderer, headless server,
      Mobile API and App host from the original repo without Desktop source.

**Source exit gate:** independent Desktop CI passes, Platform/Web still work, and
each moved implementation has one canonical owner. This does not prove an
installed update or authorize publication.

### Phase 3: Desktop distribution and developer workspace handover

- [ ] 3.1: Test an installed previous supported Desktop through the selected
      feed/bridge to a new-repo candidate in disposable environments. Include
      interrupted update/restart, data/auth retention, rollback and uninstall scope.
- [ ] 3.2: Prepare the release trust matrix, complete-source/native-resource
      provenance and candidate validation. Put all version/pin/compatibility notes
      and source-ownership changes in the original cutover/bump changes before publication.
- [ ] 3.3: Update cats-one's tracked member inventory/template and actual skill
      ownership for `cats-desktop`; refresh generated parent guidance using its
      existing reconciled workflow. Do not hand-edit generated parent files.
- [ ] 3.4: Validate cats-one's current packed launcher with the retained Platform
      executable package. Change dependency floors only if its required contract
      changed; keep readiness/reuse/shutdown behavior.
- [ ] 3.5: Before publication, update ownership docs, source links and ADR-110's status
      for the completed Desktop source slice. Retire the old Desktop build path only
      after the new source and candidate update route have been verified; retain the
      old-feed publisher path when the transition design still needs it.
- [ ] 3.6: With separate release authorization, publish the prepared handover release,
      verify its hosted assets/feeds and perform authorized cleanup. Report the result
      and stop; do not append post-release tracking files or status-only commits.

**Distribution exit gate:** evidence identifies the source owner, active release
publisher, working installed-update route and actual workspace members. Follow
the release completion policy; hosted verification is not followed by status-only
release commits or edits to a published release.

### Phase 4: Extract Mobile source and preserve delivery

- [ ] 4.1: Freeze public client/API compatibility and pinned Mobile bundle metadata,
      including Expo SDK, runtimeVersion and manifest/bundle protocol compatibility.
      Decide which Platform hosts and Expo clients the candidate supports.
- [ ] 4.2: Create `cats-mobile` under implementation authorization; move RN views,
      routing/device adapters, native configuration, tests and build/CI ownership.
- [ ] 4.3: Replace source-relative Platform dependencies with the reviewed packages;
      typecheck and export iOS/Android bundles without sibling checkouts.
- [ ] 4.4: Produce an immutable Mobile artifact; make Desktop's selected payload
      explicit by version/digest and the compatibility metadata above. Derive the
      serving host's manifest from that validated metadata rather than independent
      SDK/runtime constants; test rejection of incompatible bundles. Preserve static
      Expo pairing until a separate native-store/delivery change replaces it.
- [ ] 4.5: Verify pairing, auth, reconnect, consent and the supported Chat/Work/Code
      surfaces against the selected Platform host. Preserve existing UX scope.
- [ ] 4.6: Update cats-one inventory/skills and relevant Platform/Desktop docs; remove
      the old Mobile source/build route after the new route is verified.

**Exit gate:** Mobile has an independent source/build owner, a supported Platform
contract and a tested artifact-delivery path. Independent source does not imply
App Store/Play Store publication.

### Phase 5: Final ownership and contract audit

- [ ] 5.1: Verify the graph has no product-to-product or Platform-to-product imports;
      each product builds from declared artifacts and retains its own state authority.
- [ ] 5.2: Verify App SDK/minimum Platform-host checks use embedded capability
      versions rather than Desktop application versions; reuse existing App artifacts.
- [ ] 5.3: Confirm Bot PR #51 implementation status separately. Record the actual
      `cats-bots`/`cats-bot` identity without assuming its rename or clean break happened.
- [ ] 5.4: Close only completed source/governance tasks, with independent review and
      corresponding evidence. Leave unauthorized/unverified release work open.

## Files and Owners

| Owner | Expected changes in an authorized implementation slice |
|-------|--------------------------------------------------------|
| Platform | Shared packages and host/Web composition, retained server/product services, removal of transferred product source, contract tests/docs |
| Desktop | New product checkout, application source, artifact locks, packaging/CI/release inputs and instructions |
| Mobile | New product checkout, RN/native/device source, client pins, bundle production and instructions |
| Bot | Its own PLAN-008/009 and shared-package consumer updates; no delegated rename/data deletion here |
| cats-one | Actual-member inventory/templates/skill ownership, existing launcher compatibility and workspace validation |

## Testing Strategy

Apply SPEC-135's acceptance matrix at each move. Reuse existing product suites
and native acceptance rather than rewriting equivalent tests for folder names.
Build with other source checkouts absent. Validate both new consumers and remaining
Platform/Web. Use isolated installed profiles for real upgrades; source/package
tests cannot substitute for updater, signing or retained-data evidence.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Old installers poll the original repository forever | Design and test feed/bridge continuity before enabling a new publisher |
| Mobile or Web loses backend code to Desktop | Ownership inventory and remaining-host tests block the source move |
| Different version numbers break Apps | Keep App SDK and embedded Platform-host version explicit in contracts/receipts |
| Workspace lists repos before they exist | Change the tracked manifest only at real source ownership cutovers |
| Bot work is mistaken for completed prerequisites | Use PR #51 as design baseline; inspect PLAN-008/009 status per integration |

## Progress Log

| Date | Update |
|------|--------|
| 2026-10-29 | Drafted after Bot #51 merged; no repositories, packages, application identities or release endpoints changed. |

*Created: 2026-10-29*
