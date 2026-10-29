# PLAN-127: Shared Platform package extraction

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Draft; implementation not started |
| **Owner** | Platform integration owner |
| **Reviewer** | Independent architecture reviewer; affected Desktop/Bot owners |

## Related Spec

[SPEC-134](../specs/SPEC-134-reusable-platform-packages-and-consumer-boundaries.md),
following [ADR-142](../decisions/142-publish-reusable-platform-packages-for-independent-products.md).
The owner requested this draft plan with the ADR/SPEC package after Bot #51
merged. This does not authorize executing its implementation or release steps.

## Overview

Use small producer/consumer slices, beginning with setup scripts and the native
Windows helper, whose required consumers are Desktop and Bot. For later client/UI
slices, name two actual consumers (such as Desktop/Web/Mobile) before extraction.
A producer is complete only when its named consumers use the same packed artifact
with preserved behavior. Do not add a Bot API/domain dependency to meet a reuse gate.
Establish boundaries in the current
repositories before [PLAN-128](PLAN-128-product-repository-extraction.md) moves
Desktop or Mobile. Do not add unused package skeletons just to match a diagram.

## Implementation Phases

### Phase 1: Inventory and first contract

- [ ] 1.1: Recheck exact Platform/Bot/Runtime source revisions and Bot #51's
      implementation stage. Classify exact copies, adapted mechanics and product
      policy. Name the actual consumers and existing tests for each candidate,
      including Mobile/Web when the slice concerns portable client/UI contracts.
- [ ] 1.2: Choose the first setup/resource package's final name, version, supported
      exports, Node/module targets, resource manifest and result/error contract.
      Record Runtime metadata/protocol requirements without copying their ownership.
- [ ] 1.3: Design dependency boundaries and import guards for pure, Node and Electron
      consumers. Record explicit host configuration inputs and forbid import-time work.
- [ ] 1.4: Record baseline Desktop/Bot behavior and performance for the affected
      paths. Use disposable profiles and no real user-state writes.

**Exit gate:** reviewed export/resource contract, two named consumers, affected
behavior list and package-specific validation plan. No publication is needed to
prove a locally packed candidate.

### Phase 2: Provider setup resources in both consumers

- [ ] 2.1: Move selected setup helpers, dependency closure, licenses and source
      provenance into the producer. Expose fixed helper IDs/actions and typed results;
      separate Runtime metadata from host script execution.
- [ ] 2.2: Package and install the candidate into isolated Desktop and Bot consumers.
      Preserve Desktop's setup composition and Bot's provider-first five-provider flow.
- [ ] 2.3: Exercise prerequisite failures, apply/recheck, auth/restart states,
      concurrency, PATH recovery, shutdown and rejected caller/action cases.
- [ ] 2.4: Run native acceptance for each claimed OS in disposable environments.
      Obtain concrete evidence for installer actions; mocked shell execution alone
      cannot establish native installation success.
- [ ] 2.5: With publication separately authorized, publish the reviewed producer
      artifact, pin it in both consumer locks, verify packaged resources, and delete
      only the now-replaced copies/provenance entries in their consumer PRs.

**Exit gate:** same producer artifact works in both products; license/provenance
and user-visible outcomes remain intact; previous consumer artifact selection can
be restored. Before publication, report candidate proof separately from delivered reuse.

### Phase 3: Native desktop-control helper

- [ ] 3.1: Extract the identical helper implementation/build recipe and version its
      request protocol/resources. Keep product consent and tool admission outside it.
- [ ] 3.2: Have product packaging choose the correct OS/arch artifact, preserve
      licenses and apply that product's signing policy. Validate relocated paths.
- [ ] 3.3: Run the existing native observation/input safety cases for Desktop and
      Bot, including hub/core/external-core self-exclusion, mismatched protocol,
      helper crash/restart and shutdown. Headless imports must not require Electron.
- [ ] 3.4: Pin the accepted artifact in both consumers and remove their duplicate
      implementation after conformance passes; retain product adapters/policy.

**Exit gate:** one canonical helper producer and two validated packaged consumers;
native-only support and every existing approval boundary remain unchanged.

### Phase 4: Additional mechanisms and client-safe exports

- [ ] 4.1: Compare update/dialog, window state, language and provider-control flows.
      Extract a capability only with two concrete consumers and explicit product hooks.
- [ ] 4.2: Coordinate Bot adoption with PLAN-009's host-service phase. Setup, updates,
      language and secret cipher remain Hub-owned; core helper/Runtime ownership and
      the bidirectional authenticated host channel remain Bot-owned. Do not implement
      coordinator policy or claim the Hub delivered as a side effect of extraction.
- [ ] 4.3: Publish pure/client boundaries from the existing Mobile-safe entry and
      Platform API contracts. Replace internal Mobile imports with packed consumers;
      prove browser/Metro bundles and emitted declarations contain no Node/Electron.
- [ ] 4.4: Review Telegram/process/life-loop reuse separately. Keep policy branches
      local when a common implementation would flatten product behavior. Do not
      migrate Bot storage to the Platform domain model.
- [ ] 4.5: Preserve existing root Platform and App SDK entry points; update consumer
      boundary guards and governing docs per completed slice, not globally in advance.

**Exit gate:** every claimed shared capability meets SPEC-134's matrix. Unextracted
capabilities remain explicitly product-owned or tracked with their remaining reason.

### Phase 5: Readiness for repository extraction

- [ ] 5.1: Build Desktop and Bot from declared artifacts with sibling source absent;
      record their Platform/Runtime/helper versions and resource digests.
- [ ] 5.2: Validate affected UI/lifecycle/consent cases, dependency footprint and
      failure recovery. Perform independent review of the final export graph.
- [ ] 5.3: Record Desktop and Mobile readiness separately for PLAN-128. Mobile does
      not pass merely because Desktop and Bot share a setup package.

**Deliverable:** reusable package contracts and real consumers; no repository move
or product release is implied by this plan's completion.

## Files and Owners

| Owner | Expected change in an authorized implementation slice |
|-------|-------------------------------------------------------|
| Platform | `packages/`, manifests/build/package resources, setup scripts, native helper producer, bounded exports and boundary/conformance tests |
| Desktop (currently Platform) | Host adapters, consumer pins and packaging; preserve product UX and app identity |
| Bot (`cats-bots` until ADR-007 lands) | Replace vendored resources/adapters, update exact pins and import guards; coordinate with PLAN-009 |
| Runtime | None assumed; missing public contracts require a separately scoped Runtime change |
| cats-one | Integration/workspace references only when a real new boundary requires them; no incidental dependency-minimum change |

## Testing Strategy

Use SPEC-134's acceptance matrix per slice: producer unit/contract cases, packed
consumer builds, negative environment imports, real native helper checks, isolated
product acceptance and packaging/signing verification. Reuse existing passing
checks while inputs are unchanged. A source-only link is insufficient consumer
evidence. Documentation work runs only diff/link/consistency checks.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Generic abstraction erases product behavior | Freeze relevant behavior before extraction; retain injected or product-local policy |
| Electron leaks into headless core or Mobile | Physically separate packages; test transitive imports and declarations |
| Native resources missing after packaging | Manifest/digest/resource-location checks in both products and every claimed target |
| Parallel Bot Hub work changes adapter ownership | Recheck PLAN-009 phase at each consumer PR; preserve BotHostApi/channel authority |
| Package published but consumers still copy | Separate producer publication from dual-consumer completion in the plan |

## Progress Log

| Date | Update |
|------|--------|
| 2026-10-29 | Drafted after Bot #51 merged; all implementation and acceptance gates remain open. |

*Created: 2026-10-29*
