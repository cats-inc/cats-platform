# PLAN-121: Shared image service and controlled Cat generation

## Metadata

| Field | Value |
| --- | --- |
| Status | In progress — owner authorized implementation and necessary releases; acceptance pending |
| Owner | Platform integration; Apps Studio and Runtime execution owners consulted at contract gates |
| Reviewer | Owner; independent execution, authorization, delivery and Studio namespace review completed; live acceptance pending |
| Spec | [SPEC-128](../specs/SPEC-128-shared-image-service-and-controlled-cat-generation.md) |
| Decision | [ADR-136](../decisions/136-share-controlled-image-capabilities-between-cats-and-studio.md) |

## Overview

### Image service has no operating hours — 2026-10-27

- Owner correction supersedes both earlier schedule fixes below: there is no
  image-service operating window, for either manual or proactive images. Rhythm
  belongs only to proactive interaction scheduling. The image service no longer
  reads CompanionBox life state or gates accepted jobs on sleep/watch transitions.
- Removed the hours control and editable/public policy fields, window evaluator,
  outside-window refusal and schedule details from MCP availability instructions.
  Timezone only defines the daily budget bucket. Authority, trigger modes, expiry,
  quotas, interval, exact original binding and archived/disabled scope checks remain.
- Normal close of a finished chat worker revokes its MCP grant but preserves
  accepted asynchronous image work. Closing an active source turn still cancels
  its proposals; explicit cancel/delete retain their cancellation behavior.
- SQLite schema 1 is unchanged. Its old window strings are inert storage metadata,
  preserved byte-for-byte on reads; new records use neutral serialization values.
  They are neither exposed nor editable and have no execution semantics. No data
  rewrite/migration, grant revision change, budget reset or Telegram rebind is needed.
  This avoids rewriting the user's valid ledger merely to remove a service feature.
- Initial regression run against main failed six selected cases; the completed-
  worker close regression also failed before its fix. Final focused checks pass
  **281/281**: image/Telegram, rhythm/heartbeat/fanout, architecture/dependency and
  Runtime MCP suites 274; image/rhythm UI/localization 7. Server build and test
  TypeScript check pass; complete CI remains the merge gate.
- Final Windows candidate snapshot
  `f9a72e1797466d6615f598d486302182f16e7382b1c99982981db5399dcbbaed`
  with Runtime `5212fa59ee44fbee7eea0d85e7482933824ff775` builds server, renderer,
  Desktop and Runtime, reaches first-run setup and drains both services with exit
  0. All eight modified production files match the snapshot. The initial candidate
  was also drained before building the worker-close correction.
- Real native Codex uses that compiled candidate with a synthetic policy carrying
  legacy 07:00–22:00 strings and a CompanionBox reader that throws if consulted.
  An in-flight heartbeat at 22:39 actually calls image_generate; normal worker
  close preserves the one held job. After a whole Runtime and image-tool host
  restart, the same Runtime/provider session at 23:39 actually calls image_status
  for the same job without regenerating. Provider image execution and Telegram
  network delivery were not run; fixtures separately cover attachment/delivery.
  Evidence: `.image-service-hours-live-20261027/report.json`. Owned processes stopped
  and temporary provider credentials were removed.
- No real-profile writes or external Telegram test messages. Publication remains
  unauthorized; the next authorized release must use 0.11 for removal of the
  settings/API fields.

### Owner-requested tools are independent of proactive schedules — 2026-10-26

Historical intermediate correction; its retained proactive image window is
superseded by the 2026-10-27 decision above.

- Owner correction: the preceding diagnosis found why tools disappeared, but
  incorrectly accepted the implementation's coupling of manual requests to
  proactive hours. Its manual-denial instructions/assertions are superseded here.
- `manual` image tools, ledger admission, deferred dispatch, attachment and
  Telegram delivery ignore companion sleep/disabled life loop and proactive image
  hours. An existing requested job can finish while its original DM is watching.
  Autonomous images still obey rhythm, sleepUntil, proactive mode and image hours.
- Cat/account/policy revocation, archived DM, original binding/revision, expiry,
  daily/total budgets and minimum interval still apply to both trigger modes.
  Expiry now has its own safe reason, `image_policy_expired`. Stored policy fields,
  revision and used allowance are retained; no settings rewrite or rebind needed.
- Settings label the existing window **Proactive image hours / 主動生圖時段**
  and explain that requested images are independent of sleep and those hours.
- Baseline regression run: all seven selected tests failed against main, including
  the real Telegram bridge/MCP path at 22:39 and held jobs resumed after sleep.
  Final focused checks pass **251/251**: image/Telegram suites 103, architecture/
  Runtime MCP/heartbeat/fanout 142, image UI/localization 6. Server build and test
  TypeScript check pass. Full-suite validation remains the PR CI gate.
- Windows candidate snapshot `62fbb9ddfd097c66aa53cfe00ca41f805d6b6b6647e3b5329b92061e86346bcb`
  with Runtime `5212fa59ee44fbee7eea0d85e7482933824ff775` builds server, renderer,
  Desktop and Runtime, reaches first-run selection and drains both services with
  exit 0. All five changed production files match the snapshot byte-for-byte.
- Real native Codex acceptance uses the candidate's compiled code and private
  synthetic DM/policy with the life loop disabled and future sleepUntil. At 22:39,
  outside the 07:00–22:00 proactive window, the model actually calls image_generate
  and admits one held job. After the complete Runtime and image-tool host restart,
  the same Runtime/provider session actually calls image_status at 23:39, reading
  the original job without a second generation. No provider image execution or
  Telegram network send was run; fixture integration separately proves attachment
  and delivery after sleep. Private evidence: `.cat-image-manual-live-20261026/report.json`.
  Owned processes stopped and temporary provider credentials were removed.
- Publication was not included. Release scope is governed by the current
  2026-10-27 decision above.

### Image availability diagnosis — 2026-10-26

Historical diagnostic validation; its manual scheduling behavior was rejected by
the owner and is superseded by the correction above.

- Read-only CDP inspection of installed Desktop 0.10.2 confirmed the owner's
  22:39 Asia/Taipei image request reached the existing DM/Runtime session. The
  Runtime image targets were available, the original Telegram grant still matched,
  and the daily budget was unused. The saved generation/delivery window ended at
  22:00. No new image job was admitted.
- `resolveTurn` caught `image_policy_outside_window` and returned the same null
  as an unrelated conversation. The tool wrapper also swallowed unexpected grant
  resolution errors. Both paths let the Cat infer that Platform image integration
  was missing; this is distinct from the earlier same-room binding revision bug.
- Configured but blocked turns now carry a sanitized reason and the existing
  policy window/timezone/expiry in current-turn instructions, without an MCP grant,
  budget reservation or generation. Manual and proactive policy limits remain in
  force. Each subsequent turn checks again; no implicit deferred image is promised.
- Blocked turns explicitly replace the old descriptor even after a host restart,
  revoke any in-memory bearer, preserve other contributed servers and existing
  instructions, and recover the formal image tool when admission becomes available.
  Unexpected resolver failures fail the turn instead of sending without diagnostics.
- Initial regression run against unchanged production code failed all six new
  cases plus the updated stale-binding assertion. Final focused checks pass
  **236/236** (image ledger/tools/Chat/App and Telegram delivery/relay 94;
  architecture/dependencies/Runtime MCP client 107; heartbeat/fanout 35).
  Server build and test TypeScript check pass. Full-suite validation remains the
  PR CI gate; no persisted schema, SDK or Runtime contract changes.
- Windows isolated source candidate builds Runtime, server, Desktop and renderer,
  reaches provider-selection setup, and drains both services with exit 0. Its
  Platform snapshot digest is `548718b1d0cb60f8ba3c99f516c18a087db2070a2dbd99e9d50f6d41e33411fe`,
  with Runtime `5212fa59ee44fbee7eea0d85e7482933824ff775`. Both changed production
  files match the snapshot byte-for-byte. This startup check alone is not the
  image regression acceptance.
- A separate real native Codex acceptance uses that candidate's compiled server
  and Runtime with private synthetic policy/DM state. The first 22:39 turn replies
  in Chinese with the actual 07:00–22:00 restriction and admits zero jobs. After a
  complete Runtime and image-tool host restart, the same Runtime/provider session
  at simulated 07:39 actually calls `cats.image_generate`, admitting one held job
  with unchanged policy revision. No image execution or external delivery is run.
  Evidence is retained privately in `.cat-image-availability-live-20261026/report.json`;
  both Runtime processes stopped and the temporary provider credential copy was
  removed. No live-profile writes or Telegram test messages were created.

### Telegram tool-delivery repair — 2026-10-24

- Installed Desktop observation: an owner Telegram image request reached the Cat,
  but its Runtime turn had no Platform image-tool instructions, no Cat image job
  was admitted and the configured allowance stayed unused. Provider-native image
  claims do not establish a managed asset or a Telegram delivery receipt.
- Root cause: the ordinary Telegram bridge calls `linkRoom` for every inbound
  message. Even when the target room was unchanged, this rotated `linkRevision`,
  invalidating the owner-confirmed image binding fingerprint before tool admission.
  The same defect could suppress an image waiting for delivery after further traffic.
- Same-room linking is now idempotent. Actual room changes, including moving away
  and back, still rotate the revision; token, policy and owner authorization checks
  remain in force. Legacy same-room mappings without `linkRevision` retain their
  original identity; no persisted schema or public contract change is required.
- Previously invalidated permissions are not silently rebound. The owner status
  reports `requiresBindingConfirmation`; the Behavior image card explains the
  changed Telegram link and enables **Save permission** without requiring an
  unrelated field edit. Explicit confirmation preserves the generation budget.
  Existing interrupted/failed/uncertain jobs retain their original policy snapshot.
- Cat tool instructions explicitly route owner image requests through
  `cats.image_generate`, rather than treating a provider-native image result as
  a managed Cat image or proof of Telegram delivery.
- Regression evidence: the new same-room revision and real Telegram
  bridge/MCP-to-image/receipt tests both failed before the fix and passed after it.
  The image ledger, Cat tools, Chat image delivery, Telegram relay and delivery
  suites pass **66/66**, including explicit stale-grant confirmation and budget
  preservation. A further real heartbeat speaker/MCP-to-image/receipt case passed.
  Renderer recovery, Telegram bridge/routes, companion heartbeat/fanout and
  architecture/dependency checks pass **181/181**; Studio/App image compatibility
  and companion settings localization pass **17/17**. Server, renderer and test
  TypeScript checks pass; test-UI bundling and the candidate production Web/Desktop
  builds pass. These are focused checks, not the full CI suite.
- Isolated Windows Desktop candidate built from Platform source digest
  `a9321a6b6ea147c212f3d558ebacb17cf904b805aa5a4a07235f7171910ec762`
  (base `b96940de`) and Runtime `2837edbb284b2a0eeca0b8111803822978ae8c32`.
  Both services became ready and the native setup screenshot was inspected.
  The exact compiled candidate passed **43/43** MCP/Chat-image/relay regressions,
  including manual and heartbeat requests. It exited with both services stopped
  and `exitCode: 0`. Private source/launch/screenshot/exit evidence is under
  `C:/Users/kenne/Source/cats-inc/.candidate-cat-image-delivery-20261024-03/`.
  Local prerequisites needed the existing mobile dependency junction, process-local
  Git ownership exception and cached Electron 41.2.0; no dependency install was made.
  This establishes built-candidate fixture behavior, not live provider/Telegram
  delivery, native recovery-card interaction, or an installed-app update. The
  user's original profile, grant, conversation and installed Desktop were not modified.
- Worktree: `.claude/worktrees/fix-cat-image-tool-delivery`, branch
  `fix/cat-image-tool-delivery`. Owner subsequently selected Desktop **0.9.6
  standard-profile preview**, with an auto-merge PR and Runtime pinned to the same
  `2837edbb284b2a0eeca0b8111803822978ae8c32` source. Version fields, unchanged App
  pins, compatibility/recovery notes, signing profile and publication gates are
  recorded together in the [release notes](../release-notes.md). Hosted workflow
  results and release assets are the publication record; this does not claim live
  generation, Telegram delivery or an installed upgrade.

### Implementation checkpoint — 2026-10-23

- The owner authorized the full implementation, the necessary versions and releases, with Desktop using the standard preview;
  it was later clarified explicitly that the shared counterpart this time is Studio, and Usage is unchanged.
- Starting sources: Platform `7e94d6b1` (SDK 1.7.0), Runtime `3aabcb5b`,
  Apps `1d352fe`. Image contract 2, the enabled profiles and PNG are already delivered; the original
  schema 1 first-slice description below must be executed against this new baseline, without regressing or removing existing Studio features.
- This worktree: `cats-platform/.claude/worktrees/shared-media-golden-path`,
  branch `feat/shared-media-golden-path`. main stays in its original checkout.
- Wired in the shared `ImageExecutionService`, an App adapter that keeps the original App ID / Core records / asset location,
  the SDK 1.8 `media.images` namespace, and a separate SQLite store for Cat policy,
  reservations, request identity and delivery intents. SDK 1.7 / the old image namespace is still negotiated by the installed App's floor;
  Studio's scope is not borrowed. Usage is unchanged.
- The Cat tools are delivered through the host `cats` server in the Runtime native session MCP descriptor:
  the session bearer is fixed and a per-turn scope takes effect briefly; `image_generate` produces only one request ID per supervised action,
  and `image_status` only reads the original job / real delivery status. The tool response first saves the held
  work; it is released only on a successful turn receipt, and an unknown turn result needs the host gate plus Runtime `turnInFlight=false`
  or definite 404 evidence. The original session / pool / singleton handoff needs a minimal Runtime extension.
- Telegram uses an independent durable claim; image generation / message append / delivery are re-entrant. The generated image is shown in the original conversation through
  a managed attachment ref, and ordinary fanout skips that intent. Only an explicit API 429 gets automatic bounded backoff;
  an unknown response or an expired sending claim is uncertain, and an explicit owner resend still uses the original image. The delivery boundary
  re-checks, after the file read, the full owner / Cat / sleep / original conversation / original binding revision,
  and an old dispatcher that lost its claim must not send out. A cross-process reset fence protects in-progress / unknown sends.
- The owner/admin management entry point, the settings card (off by default), cancel and the uncertain-resend confirmation are written;
  Settings feedback uses a Toast. Still pending are the full renderer fixtures, manual UI and isolated Desktop verification.
- There is already evidence from server / renderer TypeScript, the Web production bundle, and isolated unit, MCP, Chat /
  Telegram regressions. In the broader 239-test affected run, 2 old rhythm fixtures forgot to set
  runtimeDataDir, tried the default directory and were denied by the sandbox; after moving them to the fixture temp directory, rhythm 20/20
  passed. The later 44 source-turn / claim / owner / async read authorization regressions all passed;
  the new UI and attachments passed the original 5, and after adding stop-delivery that UI suite passed 4/4 (the other 2 reuse the original evidence).
  The schema 1 read-shape regression for the old App's optional cancel-intent field was fixed, and the last App suite passed 15/15.
  Mock provider / bot tests are not counted as live acceptance. No new version has been published yet.
- The five P1s listed by the independent review are closed in source and in the matching regressions; also added: the owner
  explicitly stopping an unknown delivery, which keeps the unknown fact and removes the reset dead end caused by an invalidated binding.
  The candidate command suite passed 5/5; the Runtime profiles were originally in `src/catalogs/`, so the existing src
  snapshot is reused and the source allowlist is not widened.
- Studio 0.4.0 has switched to SDK 1.8 `media.images`; Apps 41 tests and the later preview/package 2 tests pass,
  and the required build/docs pass. A real built archive + production host SDK/routes + isolated Runtime fixtures
  verified contract 2 JPEG/PNG, cancel / delete, reopen / offline, original bytes, narrow layout and isolation, with CLI calls 0.
  The preview fixture namespace issue from the independent review is fixed and confirmed closed. Usage bytes are unchanged.
- The isolated Desktop source candidate has started, and Platform/Runtime readiness passes; first-run setup was completed and an
  ordinary (non-Boss) Cat was created, without touching the installed build or the default profile. The last renderer types and UI suite passed 4/4.
- Next: finish the ordinary Cat settings and conversation UI, the real provider / Telegram golden path, and the full hosted
  CI and the necessary version releases. The owner explicitly decided not to do real Telegram delivery this time and to use isolated receipts for acceptance.
- In the first full hosted CI run, 5794 of 5856 passed, 60 skipped, 2 failed: the Chat import of the shared transcript helper
  moved to the browser-safe `src/shared`, and the dependency graph regression passes; the file-backed Telegram
  fixture got its own platformDir, and the restart regression passes. This run is not called all green; later CI remains a gate.
- After the first real native run created a Codex source session, at the MCP descriptor recycle stage it hit a Runtime defect where the old
  worker had not fully stopped before the spawn; there was no image admission / generation. The Runtime
  0.6.1 patch adds a bounded wait for a full stop and new run / cancel / delete fences, and MCP/handoff passed 22/22;
  the second candidate and the native rerun are in progress, and the Desktop release must re-pin to the patch source that passed acceptance.
- Afterwards the Runtime MCP / lifecycle 22/22, an independent race review and the full preflight passed, with the patch
  source `ba7b05d56d909cee5bcc019b0b561f76fbebae66` (0.6.1). The real Native Runtime's
  zero-input create/replace probe confirmed that replacement happens only after a full stop; the second candidate fixed the bytes to be consistent.
  The last source turn used enough read-only permission to get past MCP setup, and the Codex endpoint returned 401,
  with no image admission / generation; native retries were stopped, and the limitation that real image generation is unverified is kept.
- Platform's corrected full CI has passed, and both the boundary and file-backed restart failures are closed.
  After the helper move, image UI / Chat passed 21/21. Studio 0.4.0's hosted archive/source/hash and the
  Ed25519 catalog are verified, and Usage stays at 0.5.4. Desktop 0.9.3 uses the standard preview, and the Runtime pin
  is updated to the 0.6.1 above; the release is verified against hosted evidence, and fixtures are not used to claim real Telegram / image generation success.

The phase list below is still used for item-by-item acceptance; for the implementation authorization and the current baseline, the checkpoint above governs.

First let the Platform image service serve both Studio and the limited Cat, then complete the durable closed loop from companion-heartbeat image generation to Telegram.
Keep the four delivered providers, profile / PNG / JPEG and the new and old App SDK contracts;
do not narrow back to Grok-only. Image editing / compositing and private-work sharing across callers remain separate later scope.

## Work ownership and scope

| Member | Work in this phase | Boundary |
| --- | --- | --- |
| Platform | The shared service, App/Cat adapters, policy / budget, assets, tool delivery, conversation and Telegram intents | Does not run native CLIs, and does not import Chat implementation into platform/core |
| Apps | Studio uses the `media.images` SDK and the necessary floor / artifact updates | There is no Studio image-generation server; Usage is unchanged; browser SDK 1.8 is injected by the host, and the public exact 0.6.0 pin of the archive encoder is unchanged |
| Runtime | Turn proof / idle handoff for the original source session, HTTP receipts and pool / singleton admission | Adds no App/Cat policy; keeps the existing profiles and output capabilities |
| Later Studio track | Image editing / compositing, cross-caller work sharing | Not part of this round's success conditions |

## P0 — Freeze admission, caller and recovery contracts

- [ ] Compare against the existing App image routes/service, Companion heartbeat, session tool delivery,
      transport fanout and Runtime SPEC-033, and build baseline fixtures.
- [ ] Freeze the caller context, Cat policy, canonical request, scope, job/asset/delivery
      schema and safe errors; mark clearly the boundaries between internal types, the public SDK and the Runtime payload.
- [ ] Freeze the policy UI and owner management entry point, the finite daily / total counts, interval, time window / timezone,
      expiry and output binding; proactive image generation is off by default, and a text heartbeat implies no authorization.
- [ ] Freeze durable reservation, deduction / release evidence, cross-process locks, request dedupe, cancel, and the transaction / re-entrancy
      boundaries of message/intent, including crossing midnight and changing timezone/revision.
- [ ] Verify the different / same instance, singleton, worker pool
      and gate for the Cat/chat and image target; pick the first supportable tuple, and list the unsupported combinations and the reasons.
- [ ] If needed, create a minimal Runtime successor, recording the specific contract / resource gap and its owner;
      do not substitute raising max sessions or a prompt convention for execution/resource correctness.
- [ ] Freeze the data upgrade and compatibility matrix; keep the existing Studio public behavior and scope.
- [ ] Enter implementation only after the owner has reviewed the spec; if the frozen shared contracts need to change, complete an integration review.

**Exit**: implementable type / transaction designs, a Runtime compatibility determination and an explicit test matrix, with no
assumption that "a Cat can naturally call the SDK / tools" or that "the Runtime surely needs no change".

## P1 — Extract shared service and preserve Studio

- [ ] Extract job admission, idempotency, Runtime dispatch/read/cancel, image validation and durable storage
      into a caller-aware service; keep a single copy of the shared execution logic.
- [ ] The existing App image service/routes become the App adapter, keeping the App/account/version/digest,
      bridge / CSRF and revoke checks, and mapping the same SDK payload/response.
- [ ] Implement versioned jobs/assets / policy/delivery storage and the upgrade of old Studio data:
      full validation, a verifiable backup, atomic activation, and interruption and disk-full recovery.
- [ ] The original IDs/hash, Runtime receipt linkage and failure states are unchanged, with no regeneration, no pre-granting a Cat
      or cross-App sharing; unrecognized data is kept and reads/writes to it are refused.
- [ ] Verify existing image generation, cancel,
      reopen, offline original export and byte identity with a real built Studio archive + host SDK + fixture Runtime.

**Exit**: Studio still works normally, the existing SDK is unchanged, and the shared service exists but opens no Cat quota automatically.

## P2 — Deliver controlled image tools to Cats

- [ ] Use the existing controlled agent tool/session descriptor mechanism to provide capability, submit,
      status and cancel; the session grant is bound to account/Cat/conversation / expiry.
- [ ] Provide the owner's settings and safe readiness; Boss, a Studio installation and a prompt cannot grant authorization.
- [ ] Admission atomically saves the budget reservation, the job/request ID and the fixed Runtime ID;
      a policy update, concurrency, a process restart or a cancel cannot reset usage.
- [ ] Submit returns a durable job reference; Runtime dispatch does not wait synchronously for the image to finish inside the channel mutation gate
      or the Cat session gate, and does not block other Cats' life ticks.
- [ ] Test no Studio, with / without a grant, ordinary Cat / Boss, forged scope, guessed IDs, a revoked session,
      multi-process concurrency, and Runtime same-instance/busy/full/unknown.

**Exit**: a Cat can really call the controlled tool and obtain a unique job; completion cannot be claimed from a tool-registration test alone.

## P3 — Complete companion generation and conversation attachment

- [ ] Wire the heartbeat decision to the same tool, not directly to the chat-native image tool.
- [ ] Open proactive mode only for an active companion / a valid DM and an effective policy; the existing
      quiet, text and album-path flows do not implicitly generate images, and a model fallback cannot widen authorization.
- [ ] Save the caption / output intent when the Cat submits, so completion does not need to run another provider turn.
- [ ] Attach to the original conversation by asset ID; a repeated completion / restart creates only the same single image message.
      Avoid treating a background completion as an assistant reply to a turn the owner has in progress.
- [ ] When the image completes, re-check cancel, Cat state, policy and the sending window; if invalid, keep the image and suppress the outbound send.
- [ ] The image attachment reads the managed asset directly, without a detour through exporting to the album, and accepts no arbitrary path.

**Exit**: the source and the job are traceable, the owner's reply stays in the same Cat lane, and background work does not block the owner.

## P4 — Persist and recover Telegram delivery

- [ ] The message and the durable intent are completed in the same transaction or a recoverable idempotent command, deduped by a stable
      job/asset/conversation/binding key; not relying only on eventHub and in-process maps.
- [ ] Save the exact target binding identity/revision and the owner; re-validate before sending, and rotation,
      invalidation, conversation deletion, owner sleep or grant revocation must not redirect to the default bot.
- [ ] Judge delivery by the status of the Telegram receipt; "the call did not throw" cannot count as success.
- [ ] An explicit transient failure uses bounded backoff / retry-after and reuses the same image; an ambiguous
      result, and a sending at restart, stay uncertain and are resent only on an explicit owner retry.
- [ ] A pending/uncertain intent pins the asset; reference release on cancel / delete is consistent with the retention policy.
- [ ] Provide the state of an image generated but not delivered / uncertain, and a precise retry operation; a retry does not increase the generation count.

**Exit**: a Telegram fault affects only delivery, produces no second image, and does not falsely claim exactly-once.

## P5 — Integrated acceptance and implementation review

| Layer | Required scope |
| --- | --- |
| Service / auth | App/Cat/account isolation, valid tool delivery, scope revoke, policy changes |
| Persistence | atomic admission, budget races, dedupe, lost response, crash matrix, upgrade recovery |
| Runtime consumer | unchanged HTTP vectors, same/different instance, pool/singleton, cancel, shutdown |
| Studio | real archive + host SDK, original features and retained bytes, disable/uninstall affects only the App |
| Companion | quiet produces no image, one image when allowed, a result arriving late after sleep / revocation, owner message/session gate |
| Telegram | failed receipts, definite / unknown failures, rotation, restart, asset retention, 0 regeneration |

- [ ] For SPEC-128 AC-01 to AC-16, list the actual commands, results and untested items one by one.
- [ ] Complete the full closed loop with temp roots / memory stores / fake provider / fake Telegram,
      without writing a demo job / policy / message into the user's dev state.
- [ ] Independently review caller authority, budget transaction, resource deadlock, migration,
      cancellation and ambiguous send; author-run tests do not count as an independent review.
- [ ] If live acceptance is separately approved, record the supported Cat/image tuple, the exact source / package
      identity, the generation count and the send/receive results; first complete the evidence for real tool exposure, an installed Desktop and a real bot.
- [ ] Report fixture, real provider, real Telegram, each OS and installed acceptance separately;
      items not run stay pending, and the success of old research images is not borrowed.

**Exit**: no undelivered condition is marked complete; publication is handled separately under explicit authorization.

## P6 — Later contracts and release preparation

- [ ] Image editing / compositing / multiple providers / PNG are picked up by Apps PLAN-006 A0/A1/A2 as a successor contract;
      the new operations still reuse this plan's caller/budget/asset/delivery.
- [ ] Studio displaying or editing Cat images needs explicit sharing / source authorization and a public contract,
      and the same account or shared storage is not used as authorization.
- [ ] If an external / persisted contract needs a breaking change, record the Platform/Runtime 0.x minor,
      the SDK major and the App compatibility boundary; do not require a new Studio for an arbitrary internal extraction.
- [ ] Fill in the exact versions/pins, notes and upgrade/signing,
      and bump / publish / select the Desktop payload, only with separate release authorization; verify per the shared release completion policy and then finish.

## Implementation starting points

| Existing surface | Expected work |
| --- | --- |
| `src/platform/apps/images.ts`, `src/app/server/appImageRoutes.ts` | Extract the common body, keeping the App identity adapter and SDK contract |
| `src/runtime/images.ts`, Runtime client methods | Reuse schema 1; new operations only at a later contract gate |
| `src/products/chat/api/companionLifeLoop.ts`, `companion/life/` | async tool decision/completion, owner presence and policy |
| Platform supervision / session tool delivery | Cat-scoped grant and real provider tool invocation |
| `src/platform/transports/fanout/`, `telegram/media.ts` | Asset references, durable delivery intent, real receipt status |
| `tests/app-images.test.js`, `companion-heartbeat.test.js`, `transport-fanout.test.js` | Protect existing behavior and extend meaningful consumer/recovery scenarios |
| Apps `apps/studio/` / Platform `scripts/testing/check-studio-app.mts` | Real-package consumption acceptance; do not change the Studio UI unless necessary |
| Runtime `ImageGenerationService` / WorkerPool tests | Support pairing and resource / cancel compatibility; modify only where there is a gap |

New files and types are decided by P0; the above are the existing entry points, and it is not claimed that this change has modified them.

## Risks and controls

| Risk | Control |
| --- | --- |
| Extracting the shared service accidentally opens cross-App/Cat works | caller-aware access, and old data is not back-filled with a sharing grant |
| Background images use up the quota out of control | durable finite reservation, re-check on revoke, no refund when unknown, and changing the policy does not reset |
| A Cat tool waits on a provider it holds itself | async submit/completion + same-instance gate; if that cannot be done, do not open it |
| Forwarding / restart generates the image twice | A fixed Runtime ID; delivery only references the already-saved image |
| An App uninstall cancels someone else's work | initiator-scoped revoke and resource references |
| The documents are confused with the existing Studio expansion | This plan fixes schema 1 first; Apps PLAN-006 owns the new operations |
| A file upgrade corrupts the original works | validate/backup/stage/atomic activate + re-entrant failure tests |

## Validation for this documentation slice

This change only writes the ADR/SPEC/PLAN, the successor note for the existing baseline, and the index.
The check scope is the diff, links, status and owning-repository boundaries; no application tests or build are needed.
2026-10-23: `git diff --check` passed in both worktrees; the changed-document check covered 17
Markdown files, 1208 relative links and LF / trailing newlines, with cross-repository targets confirmed by
mapping to this worktree. Apps `npm run check:docs` passed (55 Markdown files, 285 local targets;
63 sibling links were skipped because of the worktree layout, and the cross-repository links in the documents changed this time were
covered by the mapped check above).
The implementation / live acceptance above has not been run, and no passing application test or build is claimed.

## Progress log

| Date | Update |
| --- | --- |
| 2026-10-23 | Created, at the owner's request, the documents for shared service + controlled Cat + Studio sharing; the Runtime assessment is included in P0/P5, and API changes are decided by concrete gaps. All implementation phases are not started |

## References

- [SPEC-128](../specs/SPEC-128-shared-image-service-and-controlled-cat-generation.md)
- [Runtime SPEC-033](../../../cats-runtime/docs/specs/SPEC-033-bounded-image-generation.md)
- [Apps PLAN-006](../../../cats-apps/docs/plans/PLAN-006-studio-image-workspace.md)
- [Product integration guide](../product-integration-guide.md)

*Created: 2026-10-23. Implementation and necessary releases authorized; see the checkpoint for verified scope and pending acceptance.*
