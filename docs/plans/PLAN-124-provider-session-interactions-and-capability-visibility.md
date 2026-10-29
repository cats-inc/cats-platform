# PLAN-124: Provider Session Interactions and Capability Visibility

## Metadata

| Field | Value |
| --- | --- |
| Status | Implementation complete; product and Windows candidate fixtures pass, native calls compared; successful Chrome/desktop operation is limited by an upstream helper |
| Owner | Platform shared interaction, Desktop integration |
| Assigned To | Unassigned |
| Reviewer | Product owner, Runtime maintainers |
| Related spec | [SPEC-132](../specs/SPEC-132-provider-session-interactions-and-capability-visibility.md) |

## Overview

After the owner authorized auto-merge of the documentation PR on 2026-10-28, pull the latest code,
implement in slices and commit progressively. This authorization does not include a version release.
First freeze the shared contract with Runtime PLAN-049, then hook into the existing interaction
engine and each product surface. Do not copy the provider adapter into Platform; Bots PLAN-004 is a
separate independent consumer.

## Implementation Phases

### P0 — Contract and product mapping

- [x] Align capability, reply, snapshot/event, policy and receipt fixtures with Runtime P0.
- [x] Confirm the identity mapping of conversation / lane / participant / run, define how a provider interaction
  differs from a task/supervision approval, and list the close and revoke paths.
- [x] Decide the required persisted data and migration; freeze the legacy permission presentation and the no-privilege-escalation upgrade behavior.

**Exit:** the reply control path does not depend on the message turn queue; the degraded presentation for an old Runtime has test cases.

### P1 — Backend and runtime client

- [x] Consume Runtime P1/P2, adding an authenticated product response API, identity verification and a redacted projection.
- [x] Integrate waiting, cancel, expiry, resolve and reconnection of the shared interaction / run lifecycle.
- [x] Handle multi-user concurrency, provider retarget, conversation close and duplicate answers; keep the existing task approvals.

**Exit:** MemoryCoreStore / fixture Runtime tests pass the backend part of A1–A3/A7.

### P2 — Conversation interaction UI

- [x] Provide request cards/forms in the shared renderer that have been shown to be shareable, with Chat/Work/Code each wiring them up.
- [x] Support source, scope, deadline, submit/conflict states, reconnection and cancellable unsupported forms.
- [x] Implement controlled opening of external URL flows; redacted input does not enter the transcript/trace.
- [x] Check composer, scrolling, title and the approval entry with product regression and isolated Electron;
  the operation contracts of Code/Work are covered by fixtures, and it is not claimed that every product had a full native UI operation.

**Exit:** all three products have fixture-reproducible request → answer → provider resolution behavior.

### P3 — Permission and tool visibility

- [x] Consume Runtime P2/P3, separating approval and access, and showing the requested/effective difference.
- [x] Add live-session tool source / connection / partial list; the old plugin settings keep their management purpose.
- [x] Hook the helper/Chrome observation and settings entry into the existing Desktop settings; show unknown when there is no health evidence.
- [x] Add presentations for old Runtime, unsupported provider, no worker, stale cache and helper offline.

**Exit:** A4/A5 pass; policy settings in an ordinary conversation cannot widen Work's restricted jobs.

### P4 — Integration and candidate Desktop acceptance

- [x] Run the affected focused Node / renderer / shared interaction tests and the necessary build/type checks.
- [x] Use an independent candidate profile to verify native card round-trip, reload and diagnostics;
  the other contracts of A1–A5/A7 are covered by isolated fixtures, and no test conversations are written to the user's dev state.
- [x] Compare against Terminal under the same CLI/config/cwd/policy/helper conditions, recording separately the tool calls and
  visible results of controlled Chrome and desktop operation, including behavior when the helper is unavailable.
- [x] Record the identity of the adopted Runtime source/artifact and the platform limits; acceptance on other OSes, packaged builds and Mobile
  stays pending where it has not been run. Versions and release are handled separately per authorization.

**Exit:** what is completed is concrete usage paths, and a non-empty catalog or a successful window launch does not stand in for tool acceptance.

**Environment limitation:** a successful Chrome navigation / desktop button operation and helper recovery in A6 have not yet passed;
Terminal, Bot and Platform all actually called the tools and got the same upstream-unavailable error.

## Files to Create/Modify

| Area | Intended change |
| --- | --- |
| `src/runtime/client.ts` | Runtime capability, interaction and response consumer |
| `src/shared/runtimeSessionPolicy.ts` | New policy and legacy UI mapping |
| Platform/shared interaction, supervision | Identity, owner authorization, waiting/cancel projection |
| `src/products/shared/renderer`, per-product wiring | Request cards/forms and lifecycle |
| `src/app/renderer/settings`, Desktop host | Settings entry and dependency diagnostics, reusing the single settings shell |

## Testing Strategy and Risks

Prefer verification with isolated MemoryCoreStore and scripted Runtime/provider fixtures.
The biggest risks are an answer being routed to another lane, a live callback being revived as durable data, and a legacy permission upgrade widening privileges;
SPEC-132 A2–A4 correspond to these scenarios. Real UI verification uses an isolated candidate, clearly separating observation and operation evidence.
The initial documentation PR had no model turn; the current implementation has used isolated memory/file fixtures, and later candidate and real
tool acceptance are recorded separately, without counting discovery as a successful operation.

## Progress Log

| Date | Update |
| --- | --- |
| 2026-10-28 | Created the documentation draft from Platform `595e9ca2`; P0–P4 not yet implemented, no version or data change. |
| 2026-10-28 | Integrated the Runtime PR #194 contract; added authenticated native controls, same-turn idle waiting, early Work session association / cancel anti-revival; Core format 6 migration backup and failure recovery. The first 55 focused checks pass; for details and the 0.12 release boundary see SPEC-132. |
| 2026-10-28 | P1 fully converged: Work durable claim, visible conversation admission, Golden Path budget abort, late result terminal fence, canonical session binding and current-request priority; 65 affected Node, 16 product checks and 10 Code operations regressions pass. An independent reviewer re-verified 27 focused assertions, including the actual Collaboration / Golden Path paths. |
| 2026-10-28 | P2/P3 renderer slice: six card types, same-turn typed reply, controlled URL, a pending area near the composer and the last 4 receipts; Settings keeps showing the requested/effective policy, tool sources and helper unknown. Chat/Code drafts and workspace/cwd switching keep the explicit policy, and the chip shows the requested policy. 3 bundled DOM tests and renderer/test typechecks pass, the actual hook/editor switching was verified by an independent review; server/desktop typechecks and the candidate server/host/web build pass. |
| 2026-10-28 | Isolated Windows Electron 41.2.0 candidate: setup/login, provider picker, group draft avatar, parallel branch switch, sidebar overflow, transcript spacing/copy, composer avatar; a scripted native question answer returned to the same turn. The final CSS candidate additionally verified the same interaction/session/generation/execution before and after reload, and after submitting required empty string / empty array and optional empty enum it showed empty form accepted, with receipt resolved/providerConfirmed. The last policy chip/hook forwarding was verified by source DOM/typecheck and was not rebuilt as a third Electron candidate. |
| 2026-10-28 | The native comparison used Codex 0.164.0, the same user/config/test cwd, workspace-write/offline/on-request/reviewer=user, through the real CatsRuntimeClient + Chat dispatch (MemoryChatStore), without bypassing Runtime. Found and fixed a Runtime same-cwd old-thread discovery race; after switching to the exact pack 50ef02b4686c1fff6b60819d292acc5b2e1ef773, policy was verified and configured MCP was 279/3/4. Chrome and computer use were both actually called, getting Chrome unavailable and native pipe missing respectively, the same as Terminal/Bot. Successful external operation and helper recovery still wait for a usable environment; the Electron fixture and this native product dispatch evidence are recorded separately. |
| 2026-10-28 | CI fix slice: the UTF-8 bounds / stream decoder of the shared Runtime client now uses Web APIs, timer unref is called only when supported, keeping Mobile's transitive type graph compilable. Mobile boundary/typecheck, server build and 39 client tests pass, including cross-chunk Chinese/emoji and over-limit stream cancel / UTF-8 byte limit; this is Mobile compile compatibility, and no Mobile native control feature was added. |
| 2026-10-28 | Full CI convergence: the Chat binding adapter is now injected into the shared API by the app composition, keeping the original owner/lease/turn/run checks; updated old UI expectations, and the URL fixture times from the start of each test. Added 74 en/zh-TW catalog entries for the control surface integration, without growing the raw-string allowlist. 30 control/product/client/boundary, 27 UI/i18n checks and Mobile typecheck pass; an independent review additionally verified 101 architecture checks, interpolation consistency across the two locales, a fixture TTL deferred by one hour and expiry rejection. The last source rebuilt an isolated Windows Electron candidate (Runtime main e043d5b2), confirming the Traditional Chinese native form / requested-policy chip, and that an empty-value reply gets the same turn's empty form accepted and a providerConfirmed receipt. This candidate includes the later chip/hook and translation fixes; the scope record of the earlier candidate is retained. |
| 2026-10-29 | Codex tool/App consent adoption: Runtime PR #202 (`399e63571be8188fc685ba3925ff47f80a256f27`) feeds the existing Desktop `tool_approval` host/card/control path. Added Codex negotiation and gate regressions, native neutral Allow / Decline / Cancel renderer checks, and same-execution responses across Chat/Code/Work. Localized legacy help explains that skip can suppress requests and that explicit on-request is selected in a new conversation. 63 focused checks passed; the final 40 affected product/renderer checks passed after fixture fidelity review. Standard isolated Windows candidate with real Runtime and scripted Codex wire passed actual UI accept/decline/cancel; one native turn each, post-consent fixture gate counts 1/0/0, prompts scrubbed. This does not claim real Paint capture/input or an updated installed Desktop. |

### 2026-10-29 candidate provenance

- Runtime source: clean `399e63571be8188fc685ba3925ff47f80a256f27`, source digest
  `a5f0a09895041213cda21436715a2ea63576f13fe676041be40727caae99414d`.
- Platform source: `9b5856737ca616a3a216d8665a5e4a307d46c27f` plus this change's
  localized policy help; source snapshot digest
  `d8fe6e261ba6ad6cef69d600c16b599cdaf5c911dd333c006106035ce50e4f20`.
  Later changes affect tests/docs only; the candidate includes the final product source.
- Launch receipt: `db9850f90624625998188172f6175e068bbf49a85c140fff12c4eb35bdaa5fc2`.
  Private local evidence is under workspace `tmp/candidates/desktop-consent-20261029`:
  `launch.json`, screenshots, native wire, before/after snapshots and `acceptance.json`.
  The candidate uses fresh owner/provider/profile data; no writes were made to the user's real profile.
- The provider is a scripted native-protocol fixture, not the installed Codex binary.
  Real Codex 0.165 tool/plugin consent evidence belongs to Runtime PR #202 and Bots
  PR #44. Desktop's fixture verifies its consumer and UI against that wire contract.
  Cancel's terminal receipt intentionally remains unconfirmed; native wire and the
  continuing original turn are the separate delivery evidence. See SPEC-132 for details.

*Created: 2026-10-28 / last updated: 2026-10-29*
