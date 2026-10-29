# PLAN-127: Shared Platform package extraction

## Metadata

| Field | Value |
|-------|-------|
| **Status** | Phase 4 authorized and in progress; other extraction phases remain draft |
| **Owner** | Platform integration owner |
| **Reviewer** | Independent architecture reviewer; affected Desktop/Bot owners |

## Related Spec

[SPEC-134](../specs/SPEC-134-reusable-platform-packages-and-consumer-boundaries.md),
following [ADR-142](../decisions/142-publish-reusable-platform-packages-for-independent-products.md).
The owner requested this draft plan with the ADR/SPEC package after Bot #51
merged. On 2026-10-30 the owner authorized the conversation-renderer slice in
Phase 4. Other extraction phases, repository moves and publication remain outside
this implementation request.

## Overview

Use small producer/consumer slices, beginning with setup scripts and the native
Windows helper, followed by the required Desktop-derived conversation renderer.
All three slices require Desktop and Bot as actual consumers. Other client/UI
slices name two actual consumers (such as Desktop/Web/Mobile) before extraction.
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
- [ ] 1.5: Reserve the required conversation-renderer slice and its Desktop/Bot
      owners; inventory the source map and UI-1 through UI-6 gates in SPEC-134.
      Message hierarchy means content inside a conversation, not native layers.

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

### Phase 4: Desktop-derived conversation renderer in both products

Implementation baseline: Desktop `157652085b39a0be0f68190e532e35df50208454`,
Bot `ce4ff774a852c001b9337b71f3dc6f0d37ad62ba`. The first private candidate is
`@cats-inc/platform-ui-web@0.1.0`, with root React components, a pure `contracts`
entry and `conversation.css`. Both products pin the same local tarball with
integrity; this does not publish a library or bump either application.

| Behavior | Frozen reference / intended correction | Product boundary |
|----------|-----------------------------------------|------------------|
| User/agent bubble, actions | Desktop DOM/classes, content-sized 85% maximum, user hover/focus copy, persistent agent copy | Speaker identity, clipboard and extra actions supplied by consumer |
| Response hierarchy | Ordered text/tool/status blocks inside stable execution/segment identity | No fabricated lanes/speakers from plain text; Bot remains one bot per conversation |
| Detail visibility | Desktop defaults collapse progress, preserves errors; supported tool inputs/results expand with keyboard | Sanitization before persistence and host transport; no raw metadata |
| Streaming/final/reopen | Correct both products' known retention gaps; stable IDs and no duplicate legacy/raw rows | Bot retains legacy JSONL and adds validated, backed-up atomic display sidecar; execution/approval authority stays in original stores |
| Markdown/resources | Existing Desktop Markdown layout and safe-link/image behavior | Desktop supplies mention/routes/attachments; Bot does not invent attachment support |
| Existing Desktop modes | Direct/group/parallel/compare/focus workflow behavior stays product-owned | Shared bubble, response body and action implementation only |
| Narrow layout | 340/480 CSS px, 720 px Desktop reference, Bot 260 px minimum window and smaller actual content area | Chrome differs; controls and long content must remain readable |

Before/after evidence must use isolated product profiles. Original source and
renderer build are retained in the private baseline candidate while gates run.
No gate below is complete merely because both renderer typechecks pass.

The [implementation record](../research/conversation-ui-acceptance.md) records the
shared candidate, retention contract, completed checks and outstanding acceptance
at the owner's 2026-10-30 request to close out immediately.

- [x] 4.1: Freeze exact Desktop/Bot source revisions, existing behavior and the
      source/style/locale dependency closure from SPEC-134's source map. Capture
      reference fixtures for user/agent bubbles, internal segments and ordered
      text/tool/status blocks, including supported expansion and action rules.
      Record the parity matrix before implementation; a smaller Bot window is not
      a reason to discard hierarchy or simplify the Desktop reference.
- [x] 4.2: Trace live and persisted data in both products. Identify fields lost
      between Runtime, product execution, transcript storage and renderer; specify stable
      identities/order and the product adapters that reconstruct presentation DTOs.
      Resolve any Runtime-owned contract gap separately. Design and test required
      Desktop or Bot format upgrades under FR-13 before writing the new format.
      Explicitly inventory Desktop's text-only durable concurrent reconstruction;
      separate any needed retention correction from the frozen visual/interaction
      baseline and implement that bounded data slice before UI-3 acceptance. Record
      intended live-to-final projection rules; existing data loss is not proof of
      parity. Preserve redaction and do not invent absent provider structure.
- [x] 4.3: Freeze public UI/pure-projection entries, React peers, stylesheet/assets
      exports and callback contracts. Extract from Desktop's existing implementation
      while retaining its DOM/CSS and mode behavior. Remove required router,
      application-context and `/api/channels` coupling through product adapters.
      Keep BotHostApi/channel, navigation, clipboard, resources and authorization
      outside the shared components; no Platform server is required by Bot.
- [ ] 4.4: Wire Desktop and Bot to the same locally packed renderer/style artifact.
      Adapt Bot's actual core events and durable history rather than feeding a UI
      gallery alone. Run UI-1 through UI-5, including live-to-final continuity,
      reconnect/reopen, scoped decisions, keyboard/focus and manual scroll behavior.
      Keep Desktop direct/group/parallel/concurrent modes and their actions intact.
- [ ] 4.5: Perform UI-6 in the actual isolated products at matched fonts/theme/
      locale/scale and 340/480 CSS-pixel content widths, the normal Desktop width
      and any smaller supported Bot minimum. Review long code/tables/URLs, nested
      lists, localized labels and expanded tool/decision content. Record baseline
      comparisons and all intentional product differences; fix clipping, missing
      hierarchy and lost actions before accepting the slice.
- [ ] 4.6: Obtain independent review of the final API/dependency graph, data mapping
      and parity evidence. Prepare version/pin/compatibility and rollback inputs
      before any separately authorized package publication. Both consumer PRs pin
      the same accepted artifact; remove replaced implementations only after the
      packed-product gates pass. Coordinate Bot ADR-003/SPEC-003's cutover note and
      import guards without claiming PLAN-009's Hub or coordinator is implemented.

**Exit gate:** Desktop and Bot use the same Desktop-derived conversation renderer,
with UI-1 through UI-6 demonstrated. Same React dependencies, generic controls,
only live rendering or a Desktop/Web consumer pair cannot complete this phase.
Candidate proof and released package adoption remain separate statuses.

### Phase 5: Additional mechanisms and client-safe exports

- [ ] 5.1: Compare update/dialog, window state, language and provider-control flows.
      Extract a capability only with two concrete consumers and explicit product hooks.
- [ ] 5.2: Coordinate Bot adoption with PLAN-009's host-service phase. Setup, updates,
      language and secret cipher remain Hub-owned; core helper/Runtime ownership and
      the bidirectional authenticated host channel remain Bot-owned. Do not implement
      coordinator policy or claim the Hub delivered as a side effect of extraction.
- [ ] 5.3: Publish pure/client boundaries from the existing Mobile-safe entry and
      Platform API contracts. Replace internal Mobile imports with packed consumers;
      prove browser/Metro bundles and emitted declarations contain no Node/Electron.
- [ ] 5.4: Review Telegram/process/life-loop reuse separately. Keep policy branches
      local when a common implementation would flatten product behavior. Do not
      migrate Bot storage to the Platform domain model.
- [ ] 5.5: Preserve existing root Platform and App SDK entry points; update consumer
      boundary guards and governing docs per completed slice, not globally in advance.

**Exit gate:** every claimed shared capability meets SPEC-134's matrix. Unextracted
capabilities remain explicitly product-owned or tracked with their remaining reason.

### Phase 6: Readiness for repository extraction

- [ ] 6.1: Build Desktop and Bot from declared artifacts with sibling source absent;
      record their Platform/Runtime/helper versions and resource digests.
- [ ] 6.2: Validate affected UI/lifecycle/consent cases, dependency footprint and
      failure recovery. Require Phase 4's Desktop/Bot conversation acceptance;
      setup/helper reuse alone is insufficient. Independently review the final graph.
- [ ] 6.3: Record Desktop and Mobile readiness separately for PLAN-128. Mobile does
      not pass merely because Desktop and Bot share a setup package.

**Deliverable:** reusable package contracts and real consumers; no repository move
or product release is implied by this plan's completion.

## Files and Owners

| Owner | Expected change in an authorized implementation slice |
|-------|-------------------------------------------------------|
| Platform | `packages/`, manifests/build/resources, setup/native producers, Desktop-derived conversation renderer/styles and pure presentation contracts, bounded exports and conformance tests |
| Desktop (currently Platform) | Host/conversation adapters, required live/durable retention corrections and validated upgrades, consumer pins and packaging; preserve existing visual/interaction UX, modes and app identity |
| Bot (`cats-bots` until ADR-007 lands) | Shared renderer adoption, live/durable transcript mapping and any validated format upgrade; replace vendored resources/adapters, update pins/guards and coordinate with PLAN-009 |
| Runtime | None assumed; missing public contracts require a separately scoped Runtime change |
| cats-one | Integration/workspace references only when a real new boundary requires them; no incidental dependency-minimum change |

## Testing Strategy

Use SPEC-134's acceptance matrix per slice: producer unit/contract cases, packed
consumer builds, negative environment imports, real native helper checks, isolated
product acceptance and packaging/signing verification. Reuse existing passing
checks while inputs are unchanged. A source-only link is insufficient consumer
evidence. Documentation work runs only diff/link/consistency checks.
For Phase 4, test the same event/content corpus through both real product adapters
and compare Desktop reference, extracted Desktop and Bot at matched presentation
conditions. Include coarse and structured provider output, live/final/reconnect
transitions and scoped owner interactions; run visual and behavioral checks in
actual isolated renderers, not only a shared component harness.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Generic abstraction erases product behavior | Freeze relevant behavior before extraction; retain injected or product-local policy |
| Electron leaks into headless core or Mobile | Physically separate packages; test transitive imports and declarations |
| Native resources missing after packaging | Manifest/digest/resource-location checks in both products and every claimed target |
| Parallel Bot Hub work changes adapter ownership | Recheck PLAN-009 phase at each consumer PR; preserve BotHostApi/channel authority |
| Package published but consumers still copy | Separate producer publication from dual-consumer completion in the plan |
| Shared UI is reduced to a lookalike or generic controls | Desktop-derived extraction, required Desktop/Bot consumption and UI-1 through UI-6 exit gates |
| Either product loses hierarchy when a streamed reply becomes history | Inventory both products, including Desktop's text-only durable projection; validate bounded data corrections and test final seal/reload/reopen |
| Narrow conversations hide controls or Desktop modes regress | Matched visual fixtures, responsive content checks and existing mode/interaction regressions |

## Progress Log

| Date | Update |
|------|--------|
| 2026-10-29 | Drafted after Bot #51 merged; all implementation and acceptance gates remain open. |
| 2026-10-29 | Owner clarified message-internal hierarchy and required Desktop/Bot conversation parity; added the dedicated renderer phase and UI acceptance gates. No extraction implemented. |
| 2026-10-30 | Owner authorized Phase 4. Frozen two-product baseline and extraction boundary; implementation and acceptance are in progress. |

*Created: 2026-10-29*
