# PLAN-109: Cats Self-Development and Catlas Practice

## Metadata

| Field | Value |
|-------|-------|
| Status | Native authoring accepted; scoped edits and preservation checks implemented; live knowledge evaluation/promotion and broader gates pending |
| Owner | Platform integration; member responsibilities listed below |
| Reviewer | Product owner; managed-authoring implementation and evidence independently reviewed |
| Last updated | 2026-09-26 |

## Related Spec

[SPEC-117](../specs/SPEC-117-cats-self-development-and-catlas-practice.md) defines
the requirements and pending acceptance criteria.
[ADR-118](../decisions/118-use-isolated-development-and-verified-practice-for-cats-improvement.md)
records the proposed architecture.

[PLAN-110](PLAN-110-orchestrator-knowledge-and-collaboration-rollout.md) is the
related ordinary Orchestrator consumer/operation workstream: shared role
procedures, verified tools, bounded observations and result feedback. It has its
own staged acceptance and does not close G1/G2 development or G4 practice gates.

This plan was requested together with the ADR and SPEC. The owner subsequently
authorized the initial Code knowledge-assistance work package below. Broader
architecture review and release authorization remain separate gates.

## Resume Checkpoint — native parent create-only transport (2026-09-26)

- The actual empty-skill correction is committed at `c8466ad0`, with its earlier
  **112/112** scoped checks and independent review. Next-stage owner authorization
  remains active; no new provider credential read/copy, model call or publication.
- A separate Linux command canary verified an empty, nonroot-owned private home
  outside `/tmp`; the temporary-home helper warning disappeared with complete,
  untruncated native output drainage. Both the named restricted-read command and
  ordinary read-only control failed before execution because bubblewrap could
  not create a namespace. **Native tool/read-isolation readiness did not
  pass.** Independent exit observation and exact-owned removal completed.
  Its original failed receipt retains a conservative unknown-profile matcher
  miss; offline inspection establishes only the `undefined profile` negative
  control. This does not rewrite the failed command outcome.
- The namespace error does not identify its sole enforcement layer. Pinned the
  installed Docker Engine `29.8.0` build `3ce5872b7950c63ba2ffbc5123101019ff3e6682`
  and its actual `github.com/moby/profiles/seccomp v0.2.3` dependency at
  `836ae4d37ef2ec995c77c99fc55f5b5f3af3a897` for investigation. No custom seccomp
  profile, capability, daemon setting or host policy was changed.
- A private parent transport then passed an actual create/observe/close canary
  under the unchanged container restrictions. The real Platform HTTP client was
  bundled from **13 compiled inputs**, with **65,661 bytes** and no external
  imports. The image payloads, mounted bridge/client/skill helper and private
  home were verified before import. Parent requests used authenticated,
  lease-bound stdio to the exact container; Runtime's ephemeral API key remained
  inside its process and the client used its private loopback endpoint. No host
  port was published. An attempted send was rejected before reaching Runtime;
  the retained HTTP trace contains only health/create/observe/close.
- The real logical session and request identity were bound to Runtime PID1,
  the native executable/start identity and the independently observed Docker VM
  parent/child relationship. The child disappeared after close, Runtime shut down,
  both transport pipes closed, and the container reached exit-zero/PID-zero/no-OOM
  before exact-owned removal. No unknown create, unresolved request or pending CLI
  remained. A first preparation failed the `StdinOnce` expectation before start;
  it was separately removed, and a fresh run verified the actual `true` setting.
- **9/9** separate offline child-process tests passed for authenticated replies,
  receipt persistence before resolution, denied send, lost/late/duplicate replies,
  UTF-8, invalid/oversized frames, journal failures and idempotent transport finish.
  Independent review required invocation-uncertainty records and serialized,
  durable receipts with immediate duplicate rejection; both were corrected and
  checked before native execution. These are private harness checks, not a repeat
  of the earlier application suite or a reusable production transport claim.
- This establishes **parent create-only transport**, not inference, usage/cost
  accounting, cancellation, native tool readiness, author read isolation or
  knowledge quality. Next: resolve the supported native tool boundary, then bind
  the reviewed parent send/judge/accounting/cancellation path and conduct the small
  authorized pilot. The full exercise, promotion and release remain separate.
  Private continuation records retain exact hashes, failure history and identities
  in `NATIVE-TRANSPORT-RESUME.md`; do not replay earlier canary roots.

## Previous checkpoint — actual Runtime empty-skill contract (2026-09-26)

- The pinned native image checkpoint is committed at `19158596`. A subsequent
  no-message native session exposed a real integration error: Runtime drops an
  empty skill manifest and omits its skill state, while both evaluator helpers
  and their mocks required a synthetic `skills.strict` state. Runtime source
  inspection confirmed the omitted state is its current contract, not a missing
  delivery or an API regression. Nonempty authoring skill receipts are unaffected.
- Both Catlas evaluation and the independent judge now share an assertion that
  requires hydration/inspection snapshots and rejects skill state in all three
  session/hydration/inspection projections before and after sending. The explicit
  `{ requestedSkills: [], strict: true }` request remains caller intent; absence
  is not a retained strict-delivery acknowledgement or native read-isolation proof.
  Existing fresh-session admission is essential; empty lists do not clear reuse.
- **112/112** scoped checks passed: judge/evaluator **71**, parent/freeze **38**,
  and docs/collection **3**. These include **24** new before/after consumer
  regressions for injected, null and truncated observations; post-send spend is
  retained and invalid Catlas state cannot reach the judge. Independent source,
  fixture and native-launcher review found no remaining blocker.
- A fresh, credential-free/network-disabled native canary mounted and hashed the
  actual shared assertion, then passed real Runtime create/observe/close with
  `codex/cli/native`, model `gpt-6-astra`, sandbox/read-only/default policy and no
  Runtime-delivered skills. The in-container Runtime PID, executable/child start
  identity and Docker VM PID/parent relationship were retained. The observer
  armed with the actual logical session ID before any send; no message was sent.
  The native child disappeared after close, idle Runtime shut down, and external
  observation confirmed exited/PID-zero/exit-zero/no-OOM before exact-owned
  removal. No pending CLI, unknown creation, credential copy or model call.
- Three failed preparations remain separate evidence: missing explicit native
  environment before startup; the skill-contract mismatch after create; and a
  process-name assertion (`MainThread`, not `node`) after the corrected skill
  check. Each owned container was removed. The final probe binds the Runtime VM
  PID and Codex child PPID rather than a Node display name. These are Linux/Docker
  VM identities, never Windows process IDs.
- This proves **create-only app-server containment**, not an initialized native
  thread or inference readiness. The CLI also warned that helper aliases cannot
  be created under a `/tmp` home; prepare a supported fresh private home before
  tool/model use. Next: parent-owned transport and frozen endpoint/session mapping,
  then the small authorized native pilot. The full exercise, promotion and release
  remain separate gates. Private continuation records retain all exact identities.

## Previous checkpoint — pinned native image, no inference (2026-09-26)

- Container observation is committed at `8507008d`, after **53/53** scoped checks
  and independent review. The owner's next-stage authorization remains active.
  No new provider credential read/copy, model call, installed-state write or release.
- Built a private Linux image from a digest-pinned official Node 24 base, clean
  Runtime `6afaf606` with a fresh successful build, four production dependencies,
  public assets/skills/config and Codex CLI **0.157.0**. The Linux native archive
  was resolved from the installed package's versioned alias and SHA-512 verified
  before extraction. No author/evaluator inputs entered the build context.
- The context's exact **1,622 files / 407,129,855 bytes** were independently
  reconciled; the launcher reverified the inventory and hashes after building.
  A separately mounted trusted verifier
  then hashed the **1,621 copied payload files** inside the actual image before
  executing its preflight. This binds those payloads to the context digest; base
  OS/Node identity remains separately digest-pinned. Exact image environment,
  launch settings, mounts, containment and resource limits were checked before
  start. CLI timeout/unknown-create/cleanup-failure receipts remain explicit.
- The credential-free, network-disabled native test passed: Node **24.21.0**,
  native CLI version and experimental protocol export, Runtime **0.3.1** preview
  health with matching in-container PID, and awaited idle shutdown. The external
  observer captured the running container, then two terminal observations before
  exact-owned removal. Exit was zero, with no OOM, pending CLI or cleanup failure.
  Credential absence is an audited admission fact plus a fresh-home assertion;
  idle shutdown does not establish future provider cleanup or native thread readiness.
- Private build/probe manifests and resume records retain exact digests, image and
  container identities. Next: a fresh no-network **create/observe/close-only**
  Runtime Codex canary to bind the actual logical session and app-server process
  to the container. Do not send even an empty message to force readiness: that
  starts a model turn. Parent transport, frozen native bindings and the small
  model pilot remain pending; none of these preflights are quality evidence.

## Previous checkpoint — dedicated container observation (2026-09-26)

- Runtime judge/frozen integration checkpoint is committed at `b1b98d2e`, with
  **86/86** scoped checks and independent review. Owner authorization remains valid
  for the next bounded stage; no new model call, credential copy or publication.
- Native Windows restricted-read policy failed its synthetic test as recorded
  below. Existing Docker **29.8.0** Linux daemon and Ubuntu WSL were available.
  Pulling the official Node image failed with daemon authentication errors even
  with an empty private anonymous CLI config; user credentials were not inspected
  or changed. A pinned cached image was used solely for synthetic canaries. The
  official Node 24 base subsequently downloaded successfully from Docker's
  [public ECR mirror](https://gallery.ecr.aws/docker/), still without authentication.
- Synthetic container read isolation passed: allowed file readable, sibling and
  host-path canaries absent, bind/root writes denied, no Docker socket, nonroot
  UID, private process namespace and network disabled. A shell/background child
  were observed while running; exited/PID-zero state was retained before removing
  only that exact owned container. The failed first trial rejected an invalid
  `--pid private` argument before creation; later trials used Docker's default
  private namespace. No existing service/container was modified.
- Implemented a read-only local Docker transport and observer with pinned
  identity, exclusive container-ID claim, pre-dispatch running observation, two
  fresh terminal reads, restart/policy drift rejection and durable receipts.
  Final observer checks passed **35/35**. Independent review found and corrected
  two races: validate/latch each identity read before the next await, and bound
  read-only CLI termination even when the first signal is ignored. Pending CLI
  identities remain visible and the client stays unavailable after unconfirmed
  termination. Freeze/docs/collection verification passed **18/18**, for **53/53**
  final scoped checks. Independent final review found no remaining source blocker.
  The final native canary on the pinned official Node base captured the observer
  source digest, passed read/write checks, reported container exit complete before
  removal and incomplete after removal. No Runtime/session ownership claim is
  inferred from it; all owned canary containers were removed, with zero inference.
- Next: prepare/review a dedicated native Runtime
  image and endpoint/session-to-container mapping, then freeze all actual parent
  bindings and run the small authorized pilot. Container exit alone is not native
  inference readiness or quality evidence. No elevated Windows setup is needed
  to continue the offline preparation.

## Previous checkpoint — authorized native handlers and isolation preflight (2026-09-26)

- Owner explicitly authorized continuation (`授權, 做吧`). This supersedes the
  previous pending-authorization note for the next bounded native stage; historical
  author grants remain consumed. Stage a small pilot after technical prerequisites,
  not an implicit full 96-attempt exercise or release.
- Implemented a Runtime-backed independent judge factory with explicit target and
  reviewer identity, one fresh read-only/strict-skill session per reset, durable
  request/session/usage/cleanup evidence, late-create/send cancellation fencing,
  and exact quoted response evidence converted into validated UTF-16 spans.
  The model cannot supply its own usage. **47/47** judge/semantic tests passed,
  including cancellation during final receipt flush and a valid negative judgment.
  Independent review confirmed the correction and found no remaining helper blocker.
  The frozen parent/worker fixture now includes this actual judge with public
  transport/observer doubles, retaining a separate reviewer session and 7 of the
  total 49 fixture tokens. The complete freeze suite passed **15/15**; parent effects,
  documentation-boundary and test collection checks passed **24/24** (86 total).
- Read-only architecture review found a concrete native gap: current Runtime
  Codex bootstrap selects legacy `sandbox: 'read-only'`, while its dynamic read
  tools are not an exclusive allowlist over native tools/MCP/apps. This is not
  proof of author read isolation or grader blinding. The installed native
  App Server schema and no-inference policy canaries were checked before any
  Runtime seam change. Installed Codex **0.157.0** exposes experimental named
  permission profiles, not direct `readOnly.access` policies. With Windows sandbox
  omitted, a recognized restricted profile still read an outside synthetic file.
  With explicit `unelevated` mode and deny-by-default reads, it rejected the policy:
  `windows unelevated restricted-token sandbox cannot enforce split filesystem read
  restrictions directly; refusing to run unsandboxed`. Its legacy read-only control
  denied both synthetic files, which is not an isolation/usability pass. Both owned
  servers exited with zero model calls. The independent reviewer checked the raw
  probe evidence. This locally observed limitation is consistent with
  [official permissions guidance](https://learn.chatgpt.com/docs/permissions).
- Existing Docker Linux daemon availability was confirmed read-only. Next, use a
  synthetic container canary to assess an isolated alternative; do not infer that
  an available daemon, private home or accepted config establishes isolation.
  No elevated Windows sandbox setup, system account or firewall change occurred.
- A dedicated private Runtime with explicit process identity and independent
  observation is needed for the native pilot. Historical PID-only snapshots,
  close ACKs and current pool counts are insufficient. No inference, auth copy,
  installed-state write or publication has occurred in this new stage.

## Previous checkpoint — frozen parent/worker composition complete (2026-09-26)

- Retained-effect inspection is committed at `6d2d41f0`, with **22/22** final
  scoped checks and independent review complete. No product source changed in
  this next integration-only slice.
- Added an integrated fixture that statically freezes the parent supervisor,
  worker helper, RPC client, explicit target, rubric and baseline JSON into one
  module with `attempt` and `createSupervisor` exports. It verifies parent/worker
  byte identity with admission, removes the composition entry/JSON source tree,
  then exercises the real worker, parent callback dispatch, evaluation verifier
  and retained-effect inspector. No new freeze API or loader was introduced.
- The attempt's semantic/preservation checks pass; both ledgers record exactly
  **49 fixture tokens** and no current native cleanup claim. It runs one baseline
  attempt and stops at its limit; candidate advice and a complete comparison are
  not exercised. This public fixture cannot qualify a candidate for production.
- Final freeze suite **15/15** passed. The prior parent/engine/inspection/CLI checks
  remain applicable because this slice changes only a test and documentation.
  Independent review found no blocker; its baseline-only clarification is explicit
  in both the guide and phase/stop-reason assertions.
- Next concrete live-preparation gates: choose and independently review actual
  frozen parent Runtime/judge/observer implementations and bindings; prove native
  endpoint/process ownership and author read isolation; obtain a fresh bounded
  inference grant. No credential, installed state, provider, version or publication
  change has occurred in these overnight local checkpoints.

## Previous checkpoint — retained-effect inspection complete (2026-09-26)

- Parent effects/completion/accounting are committed at `5f8cd505`, with **89/89**
  focused checks and independent review complete. The checkpoint below is retained.
- Implemented a read-only `inspect-effects --run ... --reset ...` CLI and API.
  It checks bounded canonical records, exact effect pairing, target/digest/quotas,
  aliases/hard links, historical generation relationships and a second inventory
  and content pass. Malformed contents and arbitrary filenames are not printed.
- Invocation stays unknown for an intent without a terminal; `invoked: false`
  in pre-call intent does not prove a call never started. Conflicting terminals
  retain separate claims without double-counting; measured usage survives valid
  failed responses. Consistency and current process state remain separate.
- Final **18/18** focused tests passed, including three actual isolated Node
  parent-process exits during fake Runtime create/send and after create completion
  before sealing. Inspection preserved retained bytes without replay. Review found
  and fixed reconciliation predating seal, unsealed usage certainty, bounded
  directory enumeration and cumulative byte bounds on both read passes.
  **4/4** scoped CLI/docs/collection checks also passed, including the existing
  full 60-reset CLI fixture. Only public fixtures were used, with no network,
  credentials or provider inference.
- Independent final re-review found no remaining blocker; **22/22** final scoped
  checks passed and the diff check is clean. Records
  remain unauthenticated; current cleanup is always unobserved and replay is never
  allowed. This is recovery inspection, not automatic process recovery or new
  permission to dispatch a model. Native gates below remain open.

## Previous checkpoint — parent-owned evaluation effects complete (2026-09-26)

- Checkpoint `3d0ae0b9` completes the static closure freeze below. Work continues
  locally with no external inference, using only isolated fixtures.
- This bounded implementation moves Runtime/judge effects outside the worker's
  lifetime through an optional transferred-port bridge. The parent retains
  write-before-call intent, known session IDs and measured usage, even if the
  worker is terminated; it must fence replay and require independent cleanup.
  Late creation must trigger parent reconciliation without sending advice.
- Implemented an optional parent MessagePort supervisor with one create/send/judge
  per reset, explicit bound target/read-only grant, owned-session checks, exclusive
  intent, late usage capture and generation-bound serialized reconciliation.
  Engine seals the parent on result/abort/exit and replaces worker usage with
  parent measurements. Partial known spend is separate from unknown total usage;
  promotion verification checks the same accounting. No new model dispatch is
  permitted after the observed continuation threshold is exhausted.
- Found an additional baseline-completion defect: a known-usage but indeterminate
  baseline could previously be a low score in an otherwise passing comparison.
  Catlas now returns explicit `complete`; the engine rejects false for either
  phase while charging known spend. Complete negative semantic decisions remain
  measurable failures. Generic public evaluator modules retain additive support.
- Final parent/helper regression passed **48/48**; frozen-helper regression passed
  **14/14**. Includes actual terminated workers during create/send/judge, late
  evidence, duplicate/foreign calls, intent/result persistence failures, failed
  cleanup observers, unresolved creation, the real Runtime SDK with mocked fetch,
  and engine accounting that replaces fabricated totals while retaining partial
  measured usage. An intermediate receipt polling race was fixed only in its test
  helper; production artifact reads remain strict.
- Independent re-review found no remaining blocker after four fixes: sticky
  unresolved effects at result boundary, lost-wakeup-safe reconciliation, strict
  create/context/send capability allowlists, and positive measured advice usage.
  Final practice/promotion/preservation/docs/collection regression passed
  **27/27**, including the incomplete-baseline regression. The complete slice has
  **89 passing focused checks**, no skipped/cancelled tests and a clean diff check.
- Actual native ownership/identity, freezing parent callbacks and a parent-process
  crash remain separate gates; no journal permits model replay. Next offline work
  is bounded inspection of retained effects after the parent itself has exited,
  preserving unknown invocation/usage and never treating disk evidence as fresh
  native process proof. No new provider grant has been consumed or inferred.

## Previous checkpoint — evaluator closure freeze complete (2026-09-26)

- Local checkpoint `6241b7e6` completed the semantic helper and protected
  preparation below. Continue on `fix/knowledge-topic-preservation`, without
  reusing earlier provider grants or publishing the branch.
- Independent author-request review passed: exact normalized baseline and
  applicability preserved, recovery-only evidence scope, snapshot hashes current,
  and all protected questions absent from the author workspace. Claims are
  limited to source/local-test cancellation and draft-materialization behavior.
- Added `freeze-evaluator`: bundle trusted static JS/JSON without executing it,
  enforce physical author separation throughout the closure, reject unresolved
  executable dependencies, and retain source/compiler-byte digests and recipe.
  Found and fixed relocation of App SDK's dynamic package version lookup using
  an exact, recorded transform against the owning source/package. Output and
  verification share a 256 KiB bound and explicit complete-manifest check.
- **14/14 new tests passed**, including actual Catlas helper execution away from
  checkout after deleting its source input directory, exact knowledge-byte
  retention, frozen version metadata, source mutation, no compilation side
  effects, dynamic loader rejection, alias isolation, partial/tampered artifacts
  and the admission/verification byte boundary. esbuild needed its local compiler
  subprocess outside the sandbox after `spawn EPERM`; automatic approval allowed
  the compile/tests. No external inference or network call was involved.
- Independent implementation review found no blocker; corrected docs distinguish
  integrity against a supplied manifest from authenticated provenance, and input
  digests/lengths from retained source bytes. Existing practice/promotion and
  docs/collection regression passed **19/19**, no failures or skips, with output
  at `../.validation/knowledge-quality-20260926/freeze-regression.log`.
  No full application build/CI was repeated for this developer-only slice.
- **Next:** a bundled test is still not a native evaluator. Final native
  callbacks/immutable rubric and data must be fixed, and an out-of-worker
  session/reviewer reconciliation boundary is still required before live use.
  The independently prepared private curriculum/request remain unchanged; no
  candidate, admission, external inference, promotion, publication or user-state
  write occurred. The earlier 25 semantic-helper tests remain valid and were not
  needlessly rerun. New engine hashes make earlier admissions historical.

## Previous checkpoint — protected quality preparation (2026-09-26)

- Owner authorized continued autonomous work and checkpoints while away. Start
  from local commit `4897c122` on `fix/knowledge-topic-preservation`; prior model
  turn grants remain consumed. Do not repeat publication or native inference.
- Independent preparation completed a protected 16-case bilingual curriculum,
  semantic rubric and exact baseline outside Git at
  `../.validation/knowledge-quality-20260926/evaluator`. Future native author
  inputs belong to the disjoint sibling `author` root; do not expose holdout
  definitions/rubric in the author prompt or its workspace.
- Source inspection fixes the product boundary: actual Code-help selects all
  four topic groups, and observes only the new-Code draft/readiness/workspace/
  requested-policy fields, with effective access `not_started`. Prior cancellation
  reports belong in the user question, never invented process telemetry.
- The private evaluator contains 16 bilingual cases, six held out, three repeats
  and a proposal for 96 advice attempts. Canonical curriculum digest is
  `936c692e73e6341bce8d8243679f1803aed6fc1aa7da3f755fc1098008562e0c`;
  rubric digest is `52fc9d3acfead9f4dfa1788d93b6a25604981e8648c10b9412dbe4cf45dbc219`.
  Baseline digest is `cee16799cdbf5aae4112548e0820a36fb859e7da3565d711febbd12acb412a0f`.
  The private preparation manifest records actual policy validation and all-entry
  bilingual coverage. This is not admission or inference authorization.
- New disjoint `author/request.json` uses ID `native-recovery-v2`, scope only
  `code.recovery` linked to `test:cancelled-task-candidate`, and exact current
  baseline guidance. Its canonical digest is
  `989302f4202e7afb616ea7ab4798cd86aadf8854f283320b08b68558ba97295b`.
  Source snapshots and evidence-to-topic assertions are under sibling `sources`;
  evidence digest is `a6d82b9ad1ffe7164ffac657eca6ed6ff30477525c6e51138576d3c3425d6bfa`.
  Local private Git boundary was initialized and verified, with only minimal
  guidance and request files. No credentials, launch/start gate or candidate was
  created. Native instruction context and enforced read isolation remain pending.
- Added a developer-only Catlas evaluator helper using the actual inference seam,
  direct selection and assembled-context binding. It requires explicit trusted
  Runtime, frozen knowledge/rubric, independent semantic judge and cleanup
  callbacks; it never opens a default endpoint or copies authentication. Exact
  decisions bind to the response digest and evidence spans, with a mandatory
  critical completion check in the prepared curriculum. Indeterminate/stale
  grades fail completion; combined measured advice/judge usage survives rejection.
- Independent review corrected aggregate cleanup: Catlas close acknowledgements
  and settled judgments each require separate process evidence. Aborted creation
  fences dispatch; late session IDs and measured transport/judge spend are retained
  while the worker survives, without retroactively passing an incomplete result.
  **25/25 focused tests passed** using `node --test --test-isolation=none`, zero
  provider calls, against the existing compiled product consumers. Independent
  re-review found no blocker for this preparatory helper; docs-boundary and test
  collection checks passed **3/3**. Public doubles do not
  establish protected holdout isolation, live guidance quality or promotion.
- **Next local work:** freeze the complete executable/callback dependency closure;
  the current engine hash alone does not bind every Catlas/Runtime transitive
  import. Native use additionally needs an out-of-worker owned-session/reviewer
  observer: the existing worker is forcibly terminated after its abort grace and
  cannot finish late promises. Review the new author evidence mapping and complete
  those local preparations before requesting applicable new provider grants.
  All previous author grants remain consumed. No new PR/main/release, npm publish,
  installed-state write, live evaluation or promotion occurred.

## Previous checkpoint — bounded topic-preservation slice complete (2026-09-26)

- Owner authorized the next bounded local slice: preserve unrelated knowledge
  during authoring and prepare independent baseline/candidate evaluation. Branch
  `fix/knowledge-topic-preservation` starts from Platform main `c604970d`.
  The 0.5.2 integration/publication below is complete; do not repeat it.
- Fixed the original gaps: the host previously checked draft identity/evidence
  and bundle applicability but did not enforce the prompt's entry constraints;
  public selection fixtures checked presence rather than retained guidance.
  Host-owned scope now permits only evidence-linked edits to existing entries.
  Unrelated bilingual content/revisions, all applicability and entry order remain
  fixed; missing scope permits no edits. Product evaluation independently freezes
  scope and requires coverage of every baseline entry in both languages.
- Implemented host-owned scope and independently frozen evaluation policy;
  regressions cover topic overwrite, bilingual retention and scoped-content
  quality loss. The archived native draft with digest `6c7ce9b832a987ab` was
  rejected offline under recovery-only scope; archive unchanged, zero inference.
  New private receipt is outside both repos at
  `../.validation/knowledge-topic-preservation-20260926/historical-regression-final.json`.
  Its final engine digest is
  `1fefcf61ecf188e451f254e116bb1e955eaf09994e8f70fa13aacd7e06446330`.
- Independent review found and drove a correction for direct Catlas selection
  loss hidden by equal assembled contexts. The engine-owned critical check now
  compares both paths; the verifier recomputes it from frozen inputs. The exact
  budget-pressure regression covers both languages. Re-review found no remaining
  code blockers. The final current-input suite passed **58/58** tests across
  authoring, preservation, practice and promotion, including the 60-reset
  bilingual positive fixture, critical scoped-content failure and both consumer
  selection paths. The docs-boundary and test-collection checks passed **3/3**.
  Commands used `node --test --test-isolation=none`; the default process-isolated
  runner hit sandbox `spawn EPERM` before tests started. This matches the repo's
  normal runner mode, requires no provider and passed without escalation.
  Full application CI/native testing was not repeated for these developer-tool
  changes; existing compiled product consumers were exercised. Final output is
  retained in the private directory's `focused-tests.log`.
- No new provider call, installed-state write, promotion,
  version bump or publication is part of this local slice. Prior native model
  authorizations remain consumed. Public deterministic cases cannot establish
  protected holdout isolation or live model improvement.
- **Next work:** independently prepare a protected product curriculum and a new
  scoped author request against the current compatible baseline, review the
  evidence-to-topic mapping and semantic assertions, then obtain the applicable
  provider authorization before any native turn. Historical request/candidate
  digests remain unchanged; do not replay them. The new public fixture is only a
  regression starting point and must not be relabelled as a protected holdout.
  Catlas live quality/promotion, separate Orchestrator applicability, G1/G2/G4
  and installed combined acceptance remain open. Work remains on the local
  feature branch; no new PR, main update or release is included in this slice.

## Previous checkpoint — integrated and Desktop preview published (2026-09-26)

- Owner authorized normal auto-merge PR integration and a Desktop
  **standard-profile preview**, including its version preparation; explicitly
  **no npm publication**. No new provider inference is authorized or needed.
- Latest main was fetched. Platform `b45f5d9c` is 0.5.1 with Muse default and
  docs-only CI changes; Runtime `0a60f31` is 0.3.1 with Windows Codex hidden-host,
  catalog-upgrade, discovery and CI updates. Both feature branches rebased cleanly:
  Platform `8765f92b`, Runtime `546429d`. Native evidence below remains historical
  to its recorded revision set. Range-diff confirms all implementation commits
  were preserved unchanged. Rebased validation passed: Runtime 135 tests across
  skills/hydration/content policy, hidden Windows Codex host/launcher/guard and
  docs boundary; Platform 49 authoring/lifecycle/practice/promotion/docs-boundary
  cases; Runtime TypeScript and Platform server/host builds; 0.5.2 version guard.
  Independent integration review found no blocking code interactions.
- Published compatible Desktop/Platform **0.5.2** with Runtime's existing package
  version, Usage 0.4.0 pin and 0.5.x knowledge compatibility. No migration or new
  App/npm release was needed. Runtime merged first, then Platform through full
  CI; Desktop used the immutable Runtime merge SHA and standard profile
  (`unsigned=false`). The workflow created the preview tag.
- The authored lesson remains unverified and is not promoted. Preserve private
  native evidence before local clean-build, which deletes `build/validation`.
  A private copy now exists outside both repos at
  `../.validation/knowledge-authoring-native-20260926` (129 files, each copy
  SHA-256 verified, no provider/UI authentication or Electron browser profile).
  Its `evidence-manifest.json` SHA-256 is
  `84b89a3d7594bd90d8b3cebc26913591a591132622d8181500e79d001beab9b9`.
  No new inference ran.
- Both normal auto-merge PRs passed their full required CI and merged:
  [Runtime #97](https://github.com/cats-inc/cats-runtime/pull/97), source
  `98b6755f8698300b2c1881c8018e303c02a29c69` (2,449 tests passed, 5 skipped);
  [Platform #148](https://github.com/cats-inc/cats-platform/pull/148), source
  `b2a56ece01f7c4ab6a662c69cef2d6307405e936` (4,864 passed, 59 skipped).
  Type/build gates passed with no failed tests. The
  [Desktop workflow](https://github.com/cats-inc/cats-platform/actions/runs/36195340100)
  was manually dispatched from that Platform main with `tag=v0.5.2`, the exact
  Runtime source above and `unsigned=false`. All 7 jobs passed and
  [0.5.2 is published](https://github.com/cats-inc/cats-platform/releases/tag/v0.5.2).
  The tag points to the stated Platform source; all ten assets and three update
  metadata files were verified, including installer SHA-512/SHA-256. macOS is
  signed + notarized with the same Developer ID/certificate as 0.5.1; downloaded
  Windows installer is unsigned (no certificate); Linux trust is n/a. New
  installed 0.5.1-to-0.5.2 self-update acceptance was not performed.
  Workspace skill mirrors were synchronized and the follow-up check passed.
- **Next work:** the integration/release slice is complete. Resume the bounded
  topic-preservation and independent knowledge evaluation work described below;
  broader G1/G2/G4, Orchestrator consumption and installed combined acceptance
  remain open. Private publication logs and observations are retained outside
  Git at `../.validation/desktop-0.5.2-integration`.

## Previous checkpoint — native candidate authoring accepted (2026-09-26)

- Code heads: Platform `4f92836e` (documentation checkpoint `3d3f12d9`) and Runtime
  `4bb1495`. Branches remain `feat/desktop-knowledge-candidate` and
  `fix/readonly-sandbox-skill-delivery`. Native acceptance required no further
  production-code changes or repeated test suites.
- The owner explicitly authorized one new `gpt-6-astra` turn after profile 03's
  budget rejection. **This second authorization is now consumed.** Do not replay
  either native run. Private evidence root is
  `build/validation/knowledge-authoring-native/profile-prepared-04`.
- Owned native Windows Desktop PID 15340 managed Platform 8772 / Runtime 19116
  on loopback 59347 / 59348. Fresh ownership, lifecycle and compiled-artifact
  checks passed before opening the gate. Runtime session
  `b3eb0d63-0af6-4443-87a7-147edf3ab3bf` completed one agent turn; Core Run
  duration was 51,986 ms, within the unchanged 180-second / 24,000-token thresholds.
- The provider's project-instruction block contains only the private 375-byte author instructions
  (604 bytes with provider wrapping); the inherited Platform rules are absent.
  One read_file invocation read the delivered author skill. Two native usage
  records total **14,589 tokens** (13,305 input + 1,284 output; cached input
  6,144 is included), matching Core. This verifies the prepared instruction
  boundary on this native CLI, not a general hard token cap.
- Before/after observations and strict skill receipts agree on preview profile, exact
  cats-practice-and-distill package fingerprint, selected provider/model,
  session-bound provenance, filesystem delivery, sandbox/read_only/default and
  read/list grant. Post-run observe reports the session closed with these fields
  retained. Native output, saved draft and candidate content match exactly.
- Candidate digest:
  `6c7ce9b832a987ab91295fc1d2e3c0eec6dd65a2042ba043c2c2da2468c12ac5`.
  Core Task/Run completed and exactly one artifact
  `artifact-0c62afd2cbad997baadfe30f` is attributed to the author actor, Runtime
  session and correct Task/Run. Status is draft, disposition candidate and
  knowledge state unverified, with no verification timestamp or promotion.
- Actual Desktop task and artifact pages plus scoped Windows UIA confirm the
  completed task, linked draft, unverified summary and candidate path. The
  existing dataset detail has **no inline JSON preview**; full content inspection
  used the retained file. Evidence includes `authoring-task-completed.png`,
  `authoring-candidate-detail.png`, `candidate-ui-observation.json`,
  `native-output-observation.json`, receipts and native history.
- Independent evidence/provenance review passed. Content review found that the
  one cancellation lesson replaced guidance across all five baseline topics;
  workspace and permissions entries are now off-topic. This is a valid authored
  **unverified draft**, not evidence that it improves Catlas. Do not promote this
  complete replacement bundle without addressing topic preservation and running
  independent evaluation. Its scope is Catlas/code-help only; it establishes no
  Orchestrator knowledge consumption or supported new operation.
- Cleanup completed: Desktop exit 0, private provider auth removed, independent
  CIM/listener receipt shows no owned processes or either listener. All evidence
  remains private; no installed/user product state, released knowledge, version,
  remote branch or publication was changed.
- **Next work:** constrain author changes to evidence-relevant topics and preserve
  unrelated baseline guidance; prepare independent baseline/candidate evaluation
  with critical topic-preservation checks. Candidate contents, held-out evaluation
  and review remain separate from successful transport/materialization. Keep the
  existing release-consumer gates and separate Catlas/Orchestrator applicability.
  Local preparation can continue without owner-operated testing; another external
  model turn requires a new applicable authorization. G1/G2/G4 and combined
  installed-profile acceptance remain open.

## Previous checkpoint — managed knowledge authoring (2026-09-26)

**Historical preflight:** implementation was locally checkpointed at Platform `4f92836e`
and Runtime `4bb1495`. The single authorized native turn is consumed: strict
skill delivery worked, but 43,818 measured tokens exceeded 24,000 and no artifact
was admitted. All owned processes and temporary provider auth are gone. New
private `profile-prepared-04` is prepared with its own Git instruction boundary;
it had not launched, copied provider auth or opened its gate at that checkpoint.
The owner then replied `授權` to the second single-turn request, keeping
`gpt-6-astra` and 180 seconds / 24,000 measured tokens. Profile 04 subsequently
completed as recorded above; both authorizations are consumed. These historical
instructions do not authorize another launch or provider turn.

The owner authorized continuing the next bounded slice, maintaining checkpoints
and doing isolated validation without requiring owner-operated testing. The
target is a preview Desktop-managed agent producing an inspectable **unverified**
knowledge candidate, correlated with its existing task/run/session and evidence.
Independent product evaluation/promotion and release-consumer acceptance follow
separately. No version bump, publication or installed-profile mutation is included.

- Checkout: `cats-platform`, branch `feat/desktop-knowledge-candidate`, baseline
  `524e3406`; paired Runtime main is `e464619` (0.3.0 preparation). The earlier
  P1–P4 branches are merged (`b36571d2` / `d2d12db`); do not repeat their work or
  the consumed PLAN-110 live runs. Both original working trees were clean.
- Completed: repository/spec/ADR recovery and initial seam inventory. Existing
  candidate/evaluation/review/export tools remain developer-only. Ordinary Code
  task execution has no requested-skill input; Chat exposes only none/companion
  profiles; K3 workers deliberately request no skills. Merely packaging the
  preview supplement does not establish its delivery to a Desktop agent.
- Contract review: independently reviewed developer-only authoring host, selected
  through `CATS_DESKTOP_APP_ENTRY` in an isolated candidate Desktop. It reuses the
  normal `startApp` lifecycle and the **same** FileChatStore as the product server.
  Existing verified evidence is supplied to one fresh read-only Runtime sandbox;
  no source mutation or new K3/Chat skill profile is introduced. This implements
  a narrower managed-authoring seam; G2 source-fix and G4 learning/promotion remain
  separate gates, and native authoring acceptance is still pending.
- Implemented, validation in progress: `managedAuthoring.mjs` records admission and
  session identity before dispatch, requires actual preview skill receipts, keeps
  measured usage on rejected output, fences cancellation/late creation, and
  materializes an unverified draft through existing Code artifact declarations.
  `authoring-host.mjs` checks private paths/endpoints before startup. `src/index.ts`
  exports optional trusted in-process lifecycle hooks; normal startup has none.
- Independent review found and drove corrections for real nested Runtime
  observations, canonical Run-stop session bridging, Task cancellation, startup
  reconciliation without inference replay, exact target/artifact/provenance
  binding, and failure-safe startup/shutdown hooks. Re-review found no blockers.
  Cleanup acknowledgements are labelled `requested`, never process-exit proof.
- Validation: server/host builds and the final 17-case isolated authoring suite
  passed; all 21 lifecycle cases passed, including failing hooks
  and shutdown during startup. Earlier
  practice/promotion regression run passed 27/28; the Catlas promotion case saw
  the tool-engine digest change while an authoring file was being edited, so
  its isolated rerun passed with tool files stable. Lifecycle
  tests required outside-sandbox execution because sandbox spawn returned EPERM.
  Runtime's generated build was refreshed at this earlier checkpoint.
- Native zero-provider preflight: Windows UIA observes the private Cats window.
  Desktop PID 8924 owned Runtime 3700 and Platform 13608; their lifecycle events
  and loopback listeners (57820/57819) matched the expected roots/entries.
  Private evidence and resumable scripts: `build/validation/knowledge-authoring-native/`.
  The first private-wrapper import and readiness-wait failures were corrected
  before sidecars/inference; their logs are retained. All testing used the isolated
  profile; no installed Desktop or user product records were changed.
- External inference is **not run at the preceding checkpoint**. Automatic approval review rejected
  `start-author.mjs`: it requires explicit owner authorization to send the admitted
  candidate knowledge/evidence to the external Codex provider. Do not bypass or
  silently retry this rejection. The prepared request is one `gpt-6-astra` draft,
  read-only, maximum 180 seconds / 24,000 measured tokens (post-response threshold,
  not a provider hard cap). No provider authentication was copied and the start
  gate was never opened. The candidate Desktop shut down normally (exit 0);
  independent process/listener observation confirms all three PIDs and both
  listeners are gone. No live authored candidate/UI projection is claimed.
- Owner authorization received in chat: `授權`, explicitly responding to the
  one external Codex call above. Continue from implementation checkpoint
  `64f3b013`; the authorization covers one `gpt-6-astra` request with the unchanged
  180-second / 24,000-token threshold, supplied knowledge/evidence/author
  instructions and temporary isolated authentication. Do not ask for this again.
  New private run: `build/validation/knowledge-authoring-native/profile-authorized-01`.
  Fresh preflight passed: Desktop 17160 owns Platform 17556 / Runtime 8648 on
  loopback 60940 / 60941. The one-call gate opened at approximately 18:55 UTC
  (2026-09-25); temporary auth was copied into this private profile. This attempt
  failed in the real Platform client policy guard **before HTTP session creation**:
  read-only sessions require `permissionMode: default`, not `whitelist`.
  Core records zero inference attempts; Runtime/provider session directories and
  Runtime create/message requests are empty. Desktop exited normally and the
  temporary credential copy was removed. The single authorized inference remains
  unused. Preserve `precheck-failure.json` and the failed Run; do not rewrite it.
  The narrow correction changes creation and observed-policy assertions to
  `default`, preserving read-only access and the exact read/list tool allowlist.
  Independent source review confirms Runtime declines command/file-change approval
  requests for this combination; the dynamic read-tool grant alone does not prove
  every native provider tool is disabled. A regression through the actual CatsRuntimeClient now passes;
  the other 17 authoring cases also passed. A private fixture-only setup mistake
  (writing Core setup completion through the Chat adapter) was corrected before
  the next native launch. Continue in new `profile-authorized-02`, under the same
  unused one-call authorization; no automatic second inference is authorized.
  Profile 02 ownership preflight passed: Desktop 10996 owns Platform 17260 /
  Runtime 14884 on loopback 62439 / 62440. It failed strict Runtime skill delivery
  before provider dispatch: the legacy read-only mode lost sandbox ownership at
  the skill resolver. Core records zero inference attempts, provider history is
  empty, and only the Runtime exposure marker exists. Preserve its failed Run and
  `precheck-failure.json`. Desktop exited 0; independent CIM/listener observation
  confirms all three PIDs and both listeners gone and temporary auth removed.
  The actual Cats Code home rendered in the private window; this is not candidate
  UI acceptance. The single authorized inference remains unused.
- Runtime correction validated in `cats-runtime`, branch
  `fix/readonly-sandbox-skill-delivery`, commit `4bb1495` (base `e464619`): canonical sandbox kind
  controls Runtime-owned skill preparation, while read-only provider access stays
  unchanged. Source/worktree locations remain non-writing. Message hydration now
  preserves canonical topology. Runtime TypeScript build and 113 distinct focused
  cases passed; independent review found no blockers. See Runtime PLAN-041.
  Private preflight now records the actual Runtime revision and compiled entry,
  catalog, hydration and message-route digests, rather than a stale baseline SHA.
- Native single-turn checkpoint: Platform `4f92836e` with Runtime `4bb1495`,
  fresh `profile-authorized-03`. Desktop 9292 owned Platform 8352 / Runtime 17216
  on loopback 50767 / 50768; exact entries, revisions and compiled digests passed.
  The authorized request ran once in session
  `6aadb188-988f-43fc-8dfd-ccf800abc5ac`, approximately 19:22:54–19:23:55 UTC
  on 2026-09-25 (local date 2026-09-26). Strict preview skill delivery succeeded
  with the exact package identity, read-only sandbox, default gate and read/list
  grant. Native history confirms the agent read the delivered SKILL.md and
  checklist and returned a JSON draft. This establishes actual skill delivery
  and a provider response, not candidate admission or promotion.
- The request **failed the unchanged token threshold**: 43,818 measured tokens
  versus 24,000 allowed, with 42,455 input + 1,363 output. Three native usage
  records independently sum to the same result; 27,520 cached input tokens are
  already included, not subtracted. The Core Run records one inference attempt,
  retained usage and failure; Task is blocked and there are zero artifacts.
  This was one agent turn with two native tool rounds and four actual read_file
  invocations, not four duplicate activity events. No second request was sent.
- Context cause: placing the private sandbox below the Platform source checkout
  caused the provider to inject the unrelated Platform AGENTS block (32,747
  characters) in addition to the 6,317-character author prompt. The agent also
  attempted CODEX.md and docs/AGENT-GUIDE.md; both reads were denied as unavailable
  or outside the admitted read boundary. This explains excess context and extra
  work. Do not relax the measured-token threshold retroactively or materialize
  the rejected response as a successful candidate.
  Independent inspection confirms the instruction body is exactly the first
  32,768 bytes of Platform AGENTS, truncated mid-rule; the larger block size
  includes provider wrapping. The extra source context must be disclosed as part
  of the effective input, not described as only the supplied author request.
- Evidence retained privately: request/authoring receipts, Core Run and Task,
  native history, `native-output-observation.json`, `post-run-observe.json`, and
  `authoring-budget-rejection.png`. The actual Desktop task page showed blocked
  and no artifact. Post-run Runtime observe retained applied filesystem skill
  delivery and read-only access with session closed. Desktop exited 0; independent
  cleanup observation confirms owned processes/listeners absent and auth removed.
- Next preparation completed without inference: `profile-prepared-04` has a
  private Git root and a 375-byte author AGENTS file. Native project discovery
  starts at the project root according to
  [official Codex guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
  `preparation-observation.json` verifies the Git boundary from the session base,
  unchanged request digest `2930ddb1f269f9f06f94294bcccdafce88aa508341a15f2a78cbed6f6e9c9ed5`,
  Runtime revision `4bb1495`, and absent Desktop/auth/start gate. Helpers now check
  the boundary/instruction digest before opening a gate. This is documented
  mitigation, not proof of the next effective prompt or its token spend.
- Planned profile 04 entry, now completed above: keep `gpt-6-astra`, one agent turn,
  the same candidate/evidence and 180-second / 24,000-token post-response threshold.
  Recheck prepared ports are free (refresh launch/cookie fixture consistently if
  needed), launch profile 04, renew ownership proof and inspect actual context,
  usage and candidate/UI attribution. Do not reuse profile 03 or automatically
  run another inference. Independent evaluation/promotion remains pending.
  Earlier P1–P4 and PLAN-110 live runs need no replay.
- Compatibility: existing Core records gain optional namespaced metadata;
  no persisted format or execution API is replaced. Trusted app composition and
  the additive `startup_failed` lifecycle reason preserve this minor line.
  No version bump, release, push or publication is performed.

## Previous checkpoint — preview supplement and practice (2026-09-25)

### Desktop 0.5.0 release repair

PR #141 exposed a minor-version compatibility gap: the 0.5.0 host rejected the
bundled 0.4.x knowledge, and the Catlas cancellation test waited indefinitely for
a model call that early fallback never made. The cancelled CI run was
`36128249129`. The repair updates both reviewed product bundle ranges/revisions,
derives synthetic fixture versions from the checkout, races model startup against
early completion, releases deferred responses on cleanup, and bounds test/CI waits.
This repair stays on PR #141; it does not resume the broader development backlog.
Server/host builds and 72 focused tests passed, including early-fallback cancellation,
both bilingual consumers, the practice/promotion workflow, Desktop staging and
source-free npm/Desktop knowledge delivery. Independent review found no blockers;
CI YAML and whitespace checks passed. Full PR CI remains the merge gate before
the authorized 0.5.0 standard-profile preview publication. Private logs and the
recovery checkpoint remain under `build/validation/pr141-fix` in the repair
worktree and `build/validation/pr141-diagnosis` in the original checkout.

### Previous implementation checkpoint

The owner resumed this work after PLAN-110 acceptance and authorized preview
development skills, release exclusion, practice and knowledge distillation.
The initial delivery used independently validated feature-branch checkpoints.
The owner subsequently authorized pushing both branches, opening auto-merge PRs,
merging through the full CI gates and cleaning up merged branches/worktrees.
Direct main pushes remain outside this integration workflow.
The owner is handling publication separately. This work does not bump versions,
publish, alter an installed Desktop, or reuse consumed live-model approvals.

- Platform worktree: `../cats-platform-preview-skills`, branch
  `feat/preview-development-skills`, baseline `cf2f5169`.
- Runtime worktree: `../cats-runtime-preview-skills`, branch
  `feat/preview-content-policy`, baseline `a694104`.
- Original checkouts remain available for the owner's release work.
- Recovery order: workspace/member instructions, ADR-118, SPEC-117, this
  checkpoint, then the current branch diff. PLAN-110 retains the completed K2,
  K3 and native projection evidence; those separate runs must not be repeated
  or described as one end-to-end acceptance.
- Current slice: P0–P4 implementation and scoped validation are complete. Both
  branches were rebased without conflicts onto current main: Platform `a267b6b0`
  (Desktop 0.4.7 records) and Runtime `b712da2` (catalog refreshes). Rebased
  implementation heads are Platform `1056c412` and Runtime `758ee63`; the earlier
  slice hashes below are historical. Integration now uses paired PRs and full CI
  before auto-merge. GitHub PR checks/merge state are the authoritative delivery
  record. Preserve private evidence before removing worktrees, then synchronize
  the original main checkouts and remove only verified merged branches.
  Do not replay P1–P4 implementation or previously consumed native acceptance.
- P0 contract review passed after adding artifact-root authority, durable
  exposure-before-delivery and local revocation invalidation. Documentation
  whitespace/link checks passed. No supplement or promotion is implemented
  merely by this checkpoint. P1 independently reviewed and passed Runtime build,
  137 targeted cases, three native-create fixture cases and 197 local doc links.
  Runtime requires the next minor before strict retained-context admission ships;
  no version bump or release was performed. Details and recovery are in Runtime
  PLAN-041. P2/P3/P4 implementation and local evidence are complete below. Native,
  managed source-fix and installed acceptance remain separate open gates.

### P2 implementation and evidence

- Runtime adds `cats-inc-development`, `cats-platform-operation` and
  `cats-practice-and-distill`, with optional reference resources. Core procedures
  remain usable via inline/file instructions; resources are not hidden required
  dependencies. All 36 source packages pass Runtime metadata verification.
- Desktop direct staging and unsigned installers default to release. Explicit
  installer `--preview` derives preview content, independently of signing.
  Direct staging accepts `--content-profile release|preview`. A captured closed
  resource inventory is written with its own profile manifest; the source
  manifest is never copied as authority. The owned stage is recreated, so
  restaging preview as release removes stale supplement resources.
- Runtime four actual-library delivery/inventory tests and 23 catalog tests
  passed. Platform host/server builds and 28 staging tests passed, including
  original knowledge loading in both profiles, omitted preview resources and
  junction rejection. These checks use private fixtures only.
- Actual npm dry-run inventory: 1,255 paths, 33 ordinary skills, zero preview
  assets or source profile manifest. The reproducible developer checker
  `node tools/check-skill-distribution.mjs --runtime-root ../cats-runtime-preview-skills`
  passed against compiled Runtime modules in isolated package layouts: preview
  36 skills/41 content files; release 33 skills/35 content files. Release rejects
  a source-preview catalog override and explicit supplement resolution.
- Independent code review found no blocker. Skill text was independently
  exercised against four written scenarios; follow-ups clarified reuse of
  existing source evidence and handling unknown mutation results. This is not
  a real model run, procedural promotion or managed source-fix acceptance.
- Final checker review fixed cold env-override loading, per-skill rejection
  assertions and success-after-cleanup ordering. Its recheck passed. Documentation
  whitespace checks and 59 Platform/7 Runtime local links passed. This Platform
  slice pairs with Runtime `ce98afc`; future PR integration must preserve the pair.

### P3/P4 concrete developer workflow

P2 Platform checkpoint is `5d9bd502`. P3 adds a developer-only
`tools/knowledge-practice/` workflow. This directory is
outside npm/Desktop assets and adds no production endpoint or scheduler.

- `candidate` turns an explicitly supplied sanitized bilingual draft into an
  unverified content-addressed proposal. Existing development evidence is enough
  for drafting; no model call or new exercise is required.
- `admit` freezes an operator-supplied baseline bundle, scenario/check set,
  evaluator module, metric, budget and evaluator identity in a new private run
  root. It verifies an explicit preview Runtime artifact. The admitted author
  workspace must be physically disjoint from evaluator inputs and run state.
- An evaluator module is **trusted operator code**, not candidate code or a
  model-provided executable. Its single attempt entry receives a bounded case
  fixture and production-assembled knowledge context, with cancellation. It
  returns bounded observed data, evidence IDs and measured usage/interventions;
  it cannot supply pass/fail flags. The frozen engine computes assertions and
  comparison. An operator may bind this seam to an independently owned product
  harness; the shipped deterministic fixture tests plumbing only and does not
  prove live-provider or UI competence.
- `evaluate` captures the exact candidate and executes baseline/candidate over
  ten or more frozen scenarios (at least four held out), each with three or more
  new reset identities. Record intent before each attempt and terminal receipts
  afterward. Unknown usage, timeout, interruption or budget exhaustion stops
  continuation and remains visible; unresolved submitted attempts are never
  silently replayed. Reopening a run can inspect it but cannot resume inference
  or reset consumed budgets implicitly.
- Evidence records bind content/input digests and are authenticated with a
  private run-local key; candidate JSON or a claimed `success` field cannot mint
  evaluation success. The operator must enforce the declared actor/grant
  separation with actual Runtime/filesystem permissions. IDs, digests and local
  signatures do not sandbox an actor that can rewrite this trusted tool/key.
- P4 `review` records an explicit independent decision over the exact candidate
  and evaluation digests, including sanitization/applicability/evidence checks.
  Promotion requires complete repeated results, all critical checks, no
  correctness/policy regression and improvement in the frozen metric.
- P4 `export` emits only reviewed, compatible knowledge through the existing
  production bundle loader. It writes a new reviewable artifact, never overwrites
  an installed bundle or publishes. Local active reads check revocation on every
  selection; `revoke` preserves history and removes future local selection/export.
  Previously exported/published copies change only via a new reviewed release.

Checks must cover forged/stale evidence, self-review, changed evaluator, failed
critical checks despite an improved average, interrupted/budget-limited attempts,
private content rejection, revocation and source-free consumer loading. Passing
fixture evaluation must carry a fixture evidence label; it cannot promote a
production claim or close SPEC-117's real practice acceptance.

### P3 validation checkpoint (2026-09-25)

- Candidate/admit/evaluate/inspect and a zero-provider fixture demo were implemented
  at `0dc8bf2d`; see [the operator guide](../knowledge-practice.md). P4 commands were
  not part of that checkpoint. Candidate/evaluation artifacts cannot activate
  knowledge by themselves.
- Eleven distinct focused tests passed. The final boundary rerun proves a complete
  128 KiB candidate (including newline) can be read back and an extra byte rejects;
  it also covers non-JSON observations. Reused passing tests cover 60 clean resets,
  changed evaluator, overlapping/junction grants, release denial, self-evaluation,
  interruption/no-replay, incompatible capture, budgets, forged receipts and
  private/developer-content rejection.
- Independent review fixed usage lost on invalid/cleanup/cancelled responses,
  monotonic deadline accounting, capture intent ordering, scope admission and
  strict JSON/size boundaries. Known token usage survives failures; unknown usage
  is explicitly incomplete. Final review found no remaining P1/P2 finding.
- A real CLI fixture run against Runtime `ce98afc` completed all 60 attempts under
  `build/validation/p3-practice-20260925-01/private-run`, with fixture gates passed,
  zero provider calls and `productionEligible: false`. This private evidence is
  ignored, not exported knowledge. The fixed engine digest means P4 tool changes
  require a new admission; preserve this run as historical P3 evidence.
- Whitespace checks and 239 affected local documentation links passed. No model,
  real protected holdout, full installer, installed Desktop or other-OS acceptance
  is claimed. Source code and ordinary knowledge bundles remain on feature branches.

### P4 final checkpoint (2026-09-25)

- Implemented `review`, `export`, `revoke` and `ReviewedKnowledgeStore`. Every
  reviewed read/export verifies the authenticated evaluation against frozen
  inputs, planned attempt order/intents, unique resets, delivered context and
  recomputed gates. Review binds the exact candidate and evaluation and requires
  independent evidence/privacy/applicability/holdout attestations. IDs do not
  replace actual actor/filesystem separation.
- Export preserves baseline IDs/revisions, rejects changed entries without a
  revision increase, and uses actual Catlas/Orchestrator capabilities and both
  locales. Provenance must not change direct selection or assembled delivery for
  any frozen scenario. It creates a new knowledge-only artifact plus receipt;
  fixture evidence requires an explicit fixture audience and stays ineligible for
  publication. No installed config or release knowledge is overwritten.
- Local reviewed reads revalidate without retaining a cache. Revocation before
  export's last check prevents a receipt; revocation after that snapshot boundary
  applies to subsequent operations, even if this receipt is still flushing.
  Historical exports require a new reviewed release to change. Inspection reports
  historical gates, review, engine match and revocation separately; old-engine
  evidence cannot export but remains inspectable/revocable.
- Sixteen distinct focused P3/P4 cases passed. The combined run passed 15; one
  boundary fixture initially overflowed even before promotion, was corrected,
  and its focused rerun passed. No tool code changed between those runs. Tests
  cover 180 fixture resets, self-review, fixture-to-product denial, stale/forged
  receipts, incomplete/rejected results, baseline revision preservation, actual
  consumer compatibility, both sides of concurrent revocation, and delivery after
  author/evaluator/run directories are removed. Catlas uses its real inference
  path with a fake Runtime client; Orchestrator uses its actual role/operation
  consumer. Zero provider calls and no user product state.
- Final independent read-only review passed with no remaining P1/P2 finding.
  It confirmed the provenance-size fix, documented revocation snapshot boundary,
  separate consumer capabilities and evidence/authority limits. Whitespace and
  JavaScript syntax checks passed; 46 local links and balanced fences in the three
  affected documents also passed.
- The actual CLI against paired Runtime `ce98afc` completed a new Catlas fixture:
  60 attempts, fixture acceptance/export, and revocation. `inspect` shows the
  unchanged historical passing result, current engine, fixture review and revoked
  state. Evidence remains ignored under
  `build/validation/p4-catlas-20260925-01/`; its fixture export has
  `publicationEligible: false`. This is zero-provider protocol acceptance with
  simulated reviewer roles, not a production review or learning claim.
- Actual Platform npm dry-run inventory has 3,482 paths, both ordinary knowledge
  bundles, zero developer tools and zero private practice output. Runtime npm and
  Desktop profile inventory evidence from P2 remains valid. No shipping asset or
  version changed in P3/P4.
- Next entry point: prepare paired Platform/Runtime PRs only when integration is
  requested, retain full CI as the merge gate, and account for Runtime's next-minor
  requirement before release. Then separately admit managed preview source-fix,
  protected-holdout/model practice and installed release consumption acceptance.
  G1/G2/G4 and combined native acceptance are not closed by these fixtures. No
  paid/native replay, main mutation, version bump, or publication is authorized by
  this checkpoint alone.

### Continuous slices

1. **P0 contract/checkpoint:** record ownership, artifact authority, retained
   context policy, compatibility and independent review. Commit documentation.
2. **P1 Runtime content boundary:** filter catalog/resolution/materialization
   and instruction rebuilds; persist monotonic content provenance; reject
   unverified retained contexts at release execution boundaries. Verify catalog
   cache transitions and fresh/resumed/discovered/cleared skill cases without
   a model. Commit code, validation and checkpoint.
3. **P2 supplement/distribution:** add the three complete skill packages and
   Desktop profile selection. Verify actual release/preview and npm inventories,
   provider delivery input, and stale staged resources. Commit independently.
4. **P3 practice/candidate artifacts:** add bounded, on-demand isolated practice
   inputs, evaluator-owned receipts and knowledge candidates. Reuse existing
   operation and knowledge contracts; no new scheduler or automatic private
   transcript capture. Verify failures and interruption in private fixtures.
5. **P4 review/promotion:** validate immutable evaluation and review digests,
   export only accepted sanitized knowledge through the existing bundle loader,
   test revocation and source-free Catlas/Orchestrator consumption. Record live,
   native, installed and other-OS acceptance still outstanding.

At each commit update this checkpoint with the exact completed behavior, tests,
remaining work and next entry point. Keep failed or incomplete evidence explicit.

### Concrete implementation contract

- All three **managed product** packages (`cats-inc-development`,
  `cats-platform-operation`, `cats-practice-and-distill`) are authored together
  in Runtime's reserved `runtime-skills/preview/` subtree. This refines the
  proposed cats-one authoring assignment: cats-one continues to own workspace
  composition and its developer instructions, while the shipped supplement
  stays self-contained in the existing Runtime library. No second product
  catalog and no copying of the entire workspace developer skill inventory.
- The ordinary 33 packages and both Platform knowledge bundles remain available
  in release and preview. Classification is explicit, never inferred from
  family names such as `code` or `work`.
- The executing artifact's package-local content manifest selects `release` or
  `preview`; a caller-selected catalog/package root cannot elevate it. Missing
  manifests select release; invalid or unsupported manifests fail explicitly.
  Source
  development and preview staging carry preview eligibility; official/default
  distributable staging and the normal Runtime npm artifact are release.
  Signing/update identity remains separate. Runtime requests, model text and
  a user's nearby source checkout cannot elevate a packaged release profile.
- Release staging physically omits the reserved subtree and all its resources.
  Runtime also filters catalog/resolution and checks delivery/rebuilds; hiding
  a catalog row alone is insufficient. Cache identity includes content policy.
  Staging must replace its owned output so an earlier preview cannot leave files.
- Record the effective content profile and whether preview content has ever
  entered a context. Clearing/changing the requested skill list cannot clear
  that history. Release execution/resume/fork rejects retained preview or
  unverified native context before provider work; the remedy is a fresh context,
  with no silent transplant of excluded instructions. Discovered aliases of a
  native thread do not establish clean provenance. Existing files stay intact.
  Persist exposure intent before materialization/provider handoff; interrupted
  or failed delivery remains conservative. No crash window may leave preview
  instructions in a context recorded as release-compatible.
- Provenance is additive metadata; no destructive migration or new required
  stored-data field. Requiring verifiable provenance for previously resumable
  contexts tightens execution compatibility: before shipping that strict path,
  record/apply the required Runtime minor boundary under the release SOP. Do
  not bump versions in these implementation branches. Unknown old state is
  retained and receives a fresh-context recovery instruction.
- Eligibility is content delivery only. Skills consume the existing task's
  repository, operation, permission and budget grants. They never authorize
  source writes, publication, other-machine access, or model usage themselves.
- Practice is initially an operator-invoked developer workflow with explicit
  private fixture/output roots and bounded attempts. Candidate authors may
  propose knowledge but cannot mark it verified or edit the active evaluator.
  Freeze the scenario set, critical checks, target metric and budget before
  candidate evaluation; protect held-out inputs from the authoring context.
- Candidate, evaluation and review artifacts bind exact input/content digests
  and sanitized evidence references. Promotion requires an independent review,
  complete required results and compatibility validation through the production
  knowledge loader. An ordinary model claim of success is never evaluator
  evidence. Raw transcripts and developer instructions are not release knowledge.
- Export is build-coupled and reviewable on a branch. It does not overwrite the
  installed bundle or publish. Revocation removes the candidate from subsequent
  exports and invalidates any local active retrieval/cache; already published
  bundle changes require the normal release process. Receipt validation alone
  does not satisfy SPEC-117's ten scenarios, four held-out cases, three clean
  resets, baseline comparison and critical-check acceptance gates.

## Overview (delivery gates)

Deliver an observable local workflow before autonomous practice or broad
cross-repository automation. Reuse the existing Core/Work/Runtime contracts,
keep the preview/debug controller available, and attach evidence to each gate.
The owner's 2026-09-24 clarification splits the artifacts: preview/debug carries
the extra development/practice skills; release carries the promoted knowledge
and normal Catlas provider/model inference without those skills.

The first combined demonstration is a bounded source fix producing reviewed
knowledge, followed by a source-free release-profile candidate whose Catlas
uses that knowledge and current context to guide opening the correct Code
session. First use ordinary content injection; verified local file-reading or
retrieval tools can provide another delivery path without changing ownership.

| Gate | Deliverable | Depends on | Current state |
|------|-------------|------------|---------------|
| G0 | Reviewed profile, knowledge-delivery, ownership and acceptance contracts | Draft package | Pending |
| G1 | Profile-specific artifact selection, isolated candidate and recoverable workspace lifecycle | G0 | Pending |
| G2 | Managed single-member fix, actual skill delivery and independent validation | G1 | Pending |
| G3 | Release Catlas inference/guidance using promoted knowledge, with development skills absent | G0; G1/G2 for combined native acceptance | Code-help subset implemented; full gate pending |
| G4 | Supervised execution in supported profiles; preview/debug practice and verified knowledge promotion | G1, G2, G3 | Pending |
| G5 | Coordinated multi-repo changes and separately evidenced distribution/OS expansion | G2; G4 for learning rollout | Pending |

## Ownership and Integration

| Workstream | Owning member | Assignment boundary |
|------------|---------------|---------------------|
| Task/change-set integration, Catlas and procedure evaluation | cats-platform | Extend existing Core/Work records and product-owned delegates; coordinate frozen-contract changes |
| Desktop build profiles and candidate process control | cats-platform | Supplement inventory, release exclusion, isolated startup, state/profile identity, listeners, bounded host actions and packaged/native evidence |
| Workspace/session and provider delivery | cats-runtime | Generic primitives, access enforcement, retention hooks, profile-scoped skills/resources, normal Catlas context delivery and operation-result transport |
| Cats source composition and developer workspace guidance | cats-one | Four-member profile, managed developer instruction synchronization and Cats-specific build composition; Runtime authors the managed product supplement |
| Utility changes and procedures | cats-apps | App source/tests and built artifacts through the SDK/package boundary, only when a scenario needs them |

Assign an integration owner and a reviewer for each executable slice before
concurrent work begins. One author must not supply their own independent review.
Broader work assignments remain proposed; the initial Code-help slice was
authorized and implemented in Platform. Member-local plans should link this parent
when work begins rather than copy its lifecycle or status into competing ledgers.

Every phase that introduces persistent state must pass its applicable atomic
write, restart recovery and migration checks before closing that phase. The full
AC-12 gate in G4 does not defer those earlier data-owner obligations.

### G0 content-profile inventory checkpoint (2026-09-25)

This historical pre-P1 inventory prepared the next contract slice; the current
P1–P4 implementation is recorded in the Resume Checkpoint above. It does not mark G0
or G1 complete or add a new development grant. The inspected Platform baseline
is `c5f73f7e`, Runtime is `a694104`. PLAN-110's isolated K3 execution and native
candidate evidence can be reused at their documented scope; they do not prove
release/preview content exclusion or knowledge promotion.

| Content or boundary | Observed implementation | Consequence for the next slice |
|---------------------|-------------------------|--------------------------------|
| Normal Catlas and Orchestrator knowledge | Platform packages both curated JSON bundles; npm and Desktop inventory checks consume their contents | Keep normal role procedures and knowledge in both content profiles; distinguish them from practice/development instructions |
| Runtime product skills | The source catalog contains 33 packages: Chat 5, Code 5, orchestration 7, Work 16; all are existing general product roles/procedures | Preserve these packages. `code`, `work`, `repo-maintainer`, or the generic memory/handoff names do not identify the Cats-only supplement |
| Developer workspace skills | Member-owned developer skills are synchronized into workspace agent directories; Desktop already excludes Runtime's developer `skills/` tree | Workspace skill discovery is not delivery to a Desktop-managed product session. Do not copy the whole developer workspace inventory into release or preview |
| Cats-specific development/practice supplement | No separate managed product supplement is present in the inspected library | Author a distinct, explicitly inventoried supplement after the delivery/exclusion contract is reviewed; generic role skills alone do not satisfy G2/G4 |
| Artifact selection | Desktop copies `runtime-skills/` broadly; Runtime npm inventory includes that directory | A new supplement cannot simply be dropped into that broadly shipped root without profile-specific asset selection and transitive resource checks |
| Runtime catalog and delivery | Catalog root is resolved from package override/module location; catalog cache identity uses root/watch key and package cache uses entry file/fingerprint. Codex delivery can materialize `.agents/skills`; supported other providers use instruction delivery and unsupported delivery remains explicit | Runtime must own generic content-policy filtering and cache identity; neither current cache carries content policy. A Desktop checkbox or hidden catalog entry cannot prove exclusion from materialized files or model input |
| Resume/hydration | Explicit requested skills take precedence; otherwise persisted skill state is resolved again against the current catalog | Specify a release-compatible resume decision before enabling the supplement. Retained provider context needs rejection or a fresh context when its exclusion cannot be verified |
| Build identity | Existing preview/official flags control release/update/trust behavior; no development-content policy is selected by those flags today | Bind a separate content profile to verified build/host configuration. Preview eligibility still does not authorize a source edit or practice run |
| Candidate isolation | Platform has a dedicated candidate profile with separate roots, identity/lock handling, listeners and owned process checks; PLAN-110 records private Windows native evidence | Reuse this substrate. G1 still needs managed lifecycle/persistence and both content-profile/transition acceptance; do not repeat the old claim that no candidate isolation exists |

Source seams: [Desktop asset staging](../../desktop/host/packaging.ts),
[preview/release build entry](../../scripts/build-desktop-installer.mjs),
[candidate isolation](../../desktop/host/candidateProfile.ts),
[Runtime package inventory](../../../cats-runtime/package.json),
[catalog and provider delivery](../../../cats-runtime/src/core/skills/catalog.ts),
[session hydration](../../../cats-runtime/src/core/hydration/sessionHydration.ts),
and [product skill authoring contract](../../../cats-runtime/runtime-skills/README.md).
The source catalog was enumerated through its read-only compiled catalog API with
an explicit `runtime-skills` root. No files were materialized, packaged, or sent
to a model during this inventory.

The next reviewable contract slice should fix the exact supplement ownership,
content identifiers/resources, build-to-content-profile mapping and host policy
source. Define additive manifest/provenance and cache keys before editing
packaging, then map new/requested/resumed session rejection and fresh-context
behavior to Runtime's existing delivery seams. Record any required compatibility
boundary and tested persisted-data upgrade before implementing it; this audit
does not approve a new required state field or version bump. Acceptance must
cover physical artifacts, advertised catalogs, actual provider input and a
preview-to-release transition with stale files/state, while retaining these 33
ordinary product skills and both normal knowledge consumers.

## Implementation Phases

### Authorized first implementation: Code-entry knowledge assistance

On 2026-09-24 the owner authorized the initial knowledge-consumption work package.
Implement the independently useful G3 explain/guide subset before the G1/G2
development machinery. This does not close the combined preview-to-release gate.

- [x] Ship a curated, versioned bilingual knowledge bundle in Platform's bundled
  config assets, with a validated loader, compatibility selection and digests.
- [x] Add a Code-owned, authenticated, explicit-help endpoint. Resolve Catlas's
  model binding from Core, validate bounded draft context, and use the existing
  supervised Runtime boundary with a fresh isolated read-only session.
- [x] Inject selected knowledge contents and current observations into the model
  request. Return bounded plain-text advice plus knowledge/context receipts;
  preserve deterministic help on missing knowledge, unavailable models or errors.
- [x] Add an optional Code-entry help surface with localized copy, cancellation
  and invalidation when the selected context changes. No product actions execute.
- [x] Verify the source-free bundle, actual request contents, distinct context
  cases, cleanup/error behavior, API boundary and renderer behavior in fixtures.
  Record live-provider/native acceptance separately from these local checks.

Integration scope: Platform owns the generic knowledge reader and inference
service; Code owns observation, routing and presentation. Additive dependency
injection in the host connects them. Existing frozen Core/Chat contracts and the
deterministic assist-cache format remain unchanged. Runtime owns provider policy
enforcement; unsupported read-only execution must degrade explicitly. No developer
supplement is added in this slice, and its profile-filtering work remains pending.

Compatibility: the endpoint and packaged resource are additive within Platform
0.4.x. Existing persisted user data is unchanged, so no migration is required.
Any future breaking contract or stored-data requirement follows the shared
version/upgrade policy; this work package does not bump or publish a version.

### Phase 0: Resolve contracts and freeze a small acceptance set

- [x] Draft the ADR, SPEC and PLAN with inspected source baselines and explicit
  implemented-versus-proposed boundaries.
- [ ] Review ADR-118 and SPEC-117; record accepted changes and unresolved choices.
- [ ] Define explicit preview/debug and release content/capability profiles,
  preserving the independent artifact trust/update identity contract. Specify
  supplement selection across canonical owners, transitive resource staging,
  catalog filtering, default Runtime package inventory and resumed sessions.
- [ ] Map the conceptual change-set, candidate, attempt and promotion records to
  existing Core/Work objects. Agree schema ownership and frozen-contract changes.
- [ ] Specify candidate startup isolation, including Electron identity/lock
  ordering, data roots, Runtime selection, path validation and provider/OS write
  enforcement. Do not treat a process cwd as a security boundary.
- [ ] Reconcile workspace retention with the pending Runtime/Platform lifecycle
  review. Define run-owned output retention, stop/delete distinction, ownership
  references, recovery and explicit cleanup.
- [ ] Freeze the first operation: select a usable execution target, select the
  intended repository, and open a Code session with observable cwd/access.
  Identify the product delegates and missing adapter/result-loop pieces.
- [ ] Define the Platform knowledge-file/manifest schema and packaged location,
  evidence-to-reviewed-bundle production, normal Catlas model/context delivery,
  and compatibility/invalidation behavior. Include concepts, symptoms and
  diagnostics as well as operation steps; release must not need a practice skill.
- [ ] Specify the initial Core grants, local-delivery endpoint, budgets, and
  evaluator boundaries. Choose the single-member bug reproduction before asking
  an implementation agent to fix it.

**G0 exit:** approved scope and executable acceptance recipes; schema/migration
and public compatibility impact recorded. No release version is bumped here.

### Phase 1: Establish build-profile separation and candidate isolation

- [ ] Implement explicit artifact inventories: preview/debug selects its
  development supplement; release excludes it and its transitive resources.
  Replace broad-copy assumptions for these packages, with corresponding
  Runtime catalog, request, hydration and profile-transition checks.
- [ ] Prove release remains free of the supplement with stale preview data,
  resumed development contexts and nearby Cats source. Reject an unverifiable
  provider-context resume or start a fresh release-compatible context; changing
  metadata alone is insufficient. Preserve unrelated product features and keep
  build identity separate from task authorization.
- [ ] Add the narrow product readiness/binding surface for a Cats source
  workspace. Inventory the four members and capture baseline/dirty state without
  changing them. Show controller capabilities and missing prerequisites.
- [ ] Prepare the first task's writable worktree through Runtime-owned
  primitives. Record physical paths, common Git metadata and task ownership.
  Keep other member inputs outside the writer's grant.
- [ ] Reuse and extend the existing candidate profile for managed ownership and
  recovery, retaining separate Platform, Runtime, Desktop and Electron state,
  identity/lock scope and listeners. Verify the actual candidate build/endpoint
  in this workflow; do not adopt the controller's Runtime.
- [ ] Add bounded startup, health, stop and inspection through existing host
  boundaries. Persist ownership before launching; reconcile after interruption.
- [ ] Preserve diffs and receipts on stop/cancel/error. Make duplicate starts and
  cleanup retries idempotent. Require explicit ownership/retention disposition
  before deleting a workspace; never clean a user-selected source directory.
- [ ] Exercise path aliases, out-of-grant child-process writes, occupied ports,
  wrong endpoints, active-work cleanup, process failure and restart recovery in
  isolated fixtures, then check native controller/candidate coexistence.

**G1 exit:** AC-01, single-member AC-02, AC-03, AC-04 and AC-13 have evidence on the
initial native OS. Missing enforcement is a blocker for the affected provider,
not a reason to silently widen its permissions.

### Phase 2: Deliver one managed development task

- [ ] Author `cats-inc-development` in Runtime's reserved product preview
  subtree. Reuse existing project-memory/handoff and development/review roles.
  Include it only in the preview/debug supplement. Synchronize complete
  resources through the current workspace tool; if a
  candidate parent is used, satisfy its four-member inventory contract.
- [ ] Verify actual discovery or explicit instruction/resource delivery for the
  selected managed provider. Record requested, resolved and applied content;
  test fresh-session and re-entry behavior without exact-CLI-version allowlists.
- [ ] Bind an implementation run and independent verification run to the same
  Core task/change set. Give them separate write/evaluation scopes and clear
  file/repository assignments.
- [ ] Fix the preselected small defect, run the owning member's scoped checks,
  and build/test the candidate against the recorded dependency inputs.
- [ ] Record diff/artifact digests, tested revisions, commands, results, review
  findings and retained workspace disposition in an inspectable local receipt.
- [ ] Produce candidate knowledge files from the verified task: concepts or
  intent/symptom cues, diagnostic findings, procedure/recovery advice, affected
  versions and sanitized evidence references. Keep them unverified until the
  independent curation/validation used by G3; do not package a raw transcript.
- [ ] Repeat the lifecycle with cancellation or provider interruption and verify
  that recovery neither loses the patch nor repeats completed side effects.

**G2 exit:** AC-05 and AC-06 pass, with G1 still valid. Deliver a reviewable local
change and evidence. Push, merge, publication and installation are separate
actions under their applicable grants.

### Phase 3: Deliver knowledge-fed Catlas inference in release

- [ ] Independently verify and curate knowledge candidates from G2 into the
  first Platform-owned local bundle. Include product concepts, symptoms,
  diagnostics, prerequisites, guide steps, UI targets, action bindings,
  postconditions and recovery, with build/capability, OS/locale, revision/digest
  and provenance metadata. This manually reviewed seed precedes G4's automated
  practice/promotion machinery.
- [ ] Supply a bounded observation of the current surface, relevant workspace,
  provider readiness and permitted operations. Keep private content out of this
  projection and invalidate it when the relevant state changes.
- [ ] Implement normal Catlas context assembly: retrieve bounded relevant
  knowledge content, combine it with the user request/current observation, and
  invoke the configured provider/model. Record entry revisions and delivery
  outcome without requiring private model reasoning. Do not resolve development
  supplement skills on this release path.
- [ ] Verify actual content injection at the provider boundary. If enabling
  local file-reading/retrieval tools, prove the selected session can read the
  exact read-only files; a remote model receiving only local paths must not pass.
- [ ] Add explain and guide projections to existing optional Catlas surfaces.
  Preserve offline/disabled behavior. Validate UI targets and the actual result
  of user actions instead of assuming a displayed instruction was followed.
- [ ] Validate compatible, missing, stale and unsupported knowledge cases on an
  isolated release-profile package without source or development skills. Use
  distinct context/intent/blocker fixtures and the bound model to demonstrate
  situational guidance, diagnostic questions and truthful offline behavior.
- [ ] Complete the first combined demonstration: the G2 preview/debug task
  yields reviewed knowledge, and release Catlas uses it to help open the intended
  user Code session and verify its workspace. Confirm both artifact inventories.

**G3 exit:** AC-07, the explain/guide subset of AC-08, AC-09, AC-14 and AC-15 pass;
AC-13 still holds. Report this as contextual inference and guided assistance;
general agent-executed operations remain gated on G4.

### Phase 4: Close the operation and practice loops

- [ ] Implement the selected operation's complete agent request, authorization,
  product delegate, structured result and authoritative postcondition loop.
  Register the actual control surfaces/tools and document any public HTTP route.
- [ ] Cover pending approval, rejection, stale state, duplicate action, partial
  success, timeout and cancellation without unsafe automatic replay.
- [ ] Create reset recipes, evaluator fixtures and evidence receipts for the
  first curriculum. Freeze at least ten scenarios, at least four held out from
  authoring, budgets and target metrics before optimizing a method.
- [ ] Author `cats-platform-operation` and `cats-practice-and-distill` in the
  Runtime-owned library as preview/debug supplement entries. Verify selection,
  delivery, helper resources and release exclusion. Admit practice only in
  preview/debug and record effective input digests. Neither these skills nor
  the lesson-producing agent can approve their own knowledge promotion.
- [ ] Persist attempts and candidate lessons with failure classifications,
  counterexamples and scope. Route identified product bugs to linked existing
  development proposals without broadening the original grant.
- [ ] Evaluate candidates against the fixed baseline on clean resets and
  protected held-out cases. Require SPEC-117's critical assertions and repeated
  trials; record intervention, time and usage/cost with unavailable values clear.
- [ ] Implement reviewed, digest-bound promotion and revocation. Validate
  retrieval invalidation, privacy scope, sanitized export and crash recovery.
- [ ] Feed promoted knowledge files into the same bundle consumed by release
  Catlas and rerun source-free inference/guidance checks. Exercise rejection of
  developer instructions, private traces and incompatible/unverified lessons.
- [ ] Keep preview/debug practice on demand initially. Scheduled practice stays
  preview/debug-only after budget/interruption/stop checks pass. Opt-in Catlas
  hints can serve either profile after privacy, budget and cooldown checks.

**G4 exit:** full AC-08 and AC-10 through AC-12 pass; AC-09 and AC-13 through
AC-15 remain satisfied.
Produce one validated procedural improvement and one rejected candidate to prove
that learning is measured and selective. No claim of model-weight training.

### Phase 5: Expand repository coordination and delivery

- [ ] Add a two-member change with a frozen interface/consumer acceptance case.
  Coordinate per-repo worktrees and verify the complete revision set before
  integration. Record partial-merge recovery; never claim multi-repo Git atomicity.
- [ ] Keep Cats-specific inventory/build composition in cats-one and generic
  workspace behavior in Runtime. Add member-local specs/plans for new public
  contracts as required, linked to this parent.
- [ ] Exercise an App change only through built/versioned package and SDK
  compatibility rules. Updating an App does not implicitly update Desktop pins.
- [ ] Validate source-built, packaged and installed behavior separately, followed
  by macOS/Linux acceptance with their own provider and native UI evidence.
  Exercise preview/debug-to-release state transitions and both artifact profiles;
  release must not inherit the development supplement through caches or sessions.
- [ ] For any selected release, follow member release SOPs, validate migrations
  with backups/restart failures, and exercise the controller's normal update
  path. Document recovery when data cannot be read by an older binary.
- [ ] Evaluate independent knowledge-bundle distribution only if build-coupled
  delivery proves insufficient; define compatibility, trust, rollback and
  revocation before enabling it.

**G5 exit:** cross-member AC-02/AC-05 and applicable platform/distribution checks
pass for each claimed target. A successful source build is not an installed
upgrade result; release remains conditional on the owner's release scope.

## Expected Implementation Seams

This is an ownership map, not a commitment to create each possible new module.
Phase 0 chooses exact new files and fields after integration review.

| Existing seam | Expected work |
|---------------|---------------|
| Platform `src/core/`, `src/products/work/` | Link tasks/runs, change sets, practice attempts and receipts through existing models |
| Platform `src/platform/supervision/`, `src/platform/runtime/` | Grants, operation transport/results and evidence references |
| Platform `src/products/code/` | Source binding, actual cwd/access inspection and local delivery projection |
| Platform `src/shared/guideCatAssist*`, existing Catlas renderer components | Knowledge production/selection, bounded observations, model-context assembly and explain/guide presentation |
| Platform `desktop/host/`, packaging scripts | Profile-specific supplement/knowledge inventories, candidate identity and owned process lifecycle |
| Runtime `src/core/workspace/`, `src/core/hydration/`, `src/core/skills/`, provider adapters | Generic workspaces, effective skill delivery and enforced execution |
| cats-one workspace tooling and canonical `skills/` | Cats member composition and developer workspace procedures, separate from shipped managed product skills |
| Runtime canonical `runtime-skills/` | Preview/debug-only operation/practice packages with explicit distribution selection and validator metadata |
| Apps `apps/`, package builder and tests | Utility-owned scenarios only when selected |
| Platform control/tool registries, API docs, member guides and release SOPs | Publish the actual implemented contracts and evidence boundaries with each slice |

## Testing Strategy

| Layer | Required evidence |
|-------|-------------------|
| Contract/fixture | Physical path and ownership checks, permissions, compatibility selection, state revisions, idempotency and receipt digests |
| Lifecycle/integration | Wrong Runtime target, process death, interrupted writes, duplicate requests, retained output, recovery and scoped cleanup |
| Provider live | Actual instructions/resources, effective resumed content, complete tool/result loop, runtime-enforced outcome inspection |
| Release Catlas inference | Bound model receives selected knowledge bytes/tool results and current context without development skills; distinct user situations produce grounded guidance; local-path-only delivery is rejected as insufficient |
| Renderer/native UI | Guide steps target real controls, actual session cwd/access matches the user's choice, optional/offline behavior, controller/candidate coexistence |
| Practice evaluation | Protected held-out cases, baseline comparison, repeat trials, false-success rejection, evaluator tampering rejection and revocation |
| Distribution/data | Both artifact inventories, supplement absence in release including transitive/resumed content, promoted knowledge digests, source-free inference, native OS matrix and migration/update recovery |

Use each member's current manifest and testing guide to select the smallest
checks that cover the changed behavior and consumers. Run required CI before
integration. Do not run the entire application suite merely because these
planning files changed, or report previously existing tests as newly passed.

Initial scenario recipes must include the happy path, missing provider,
non-Git parent, duplicate create, stale knowledge/surface, interrupted task,
out-of-scope write, misleading retrieved instruction, incorrect self-reported
success and budget exhaustion. Hold out input/state variations and keep the
evaluator outside the candidate's grant. Record native/provider limits beside
the evidence, not as an inferred global pass.

Also cover a release package beside a full Cats checkout, a leftover preview
skill cache, an attempted development-session resume, an API model given only
a local path, and a reviewed knowledge entry consumed without its producing
skill. Check both real artifact contents and effective session/model inputs.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Candidate shares the controller's profile, lock or Runtime | Resolve/verify all identities before launch; test coexistence and wrong-target rejection |
| Session cleanup removes the only copy of a patch | Task-level ownership, durable references, retain on stop, explicit cleanup disposition |
| Skill appears synchronized but was never delivered | Provider-live behavior/resource probes and persisted effective delivery metadata |
| Release accidentally inherits the development supplement | Artifact inventory checks plus catalog/request/hydration and profile-transition tests |
| Local knowledge exists but the selected model never receives it | Verify transmitted entry contents or actual bounded read/tool results at the provider boundary |
| Agent bypasses tools through shell/network access | Validate provider/OS and endpoint grants together; refuse unsupported enforcement |
| Agent changes the tests or lessons to appear successful | Fixed evaluator/holdout outside its grant, independent review, digest-bound promotion |
| Source HEAD knowledge misguides an installed build | Build/capability-specific bundle selection and stale-state revalidation |
| Private experience becomes global instruction | Scoped candidates, sanitized exports, reviewed promotion and retrieval invalidation |
| Multiple repositories or memory stores drift apart | One parent plan, member-owned implementations, existing Core and evidence ownership |

## Progress Log

| Date | Update |
|------|--------|
| 2026-09-26 | Added evidence-linked authoring scope and independently frozen preservation policy. Engine-owned critical checks cover bilingual direct selection and assembled contexts; independent review caught and verified the fix for a masked Catlas selection loss. Final 58 focused knowledge tests and 3 docs/collection checks pass; the archived native overwrite is rejected offline. Public fixtures remain ineligible for product promotion. Local checkpoint only; no inference, installed-state mutation, version or publication. |
| 2026-09-25 | P1/P2 enforce artifact content policy and add three preview-only Runtime skills with release/npm exclusion. P3/P4 implement on-demand candidate/evaluation/review/export/revocation through existing knowledge consumers. The Resume Checkpoint records each branch slice, validation and remaining native/managed-practice gates; the earlier inventory below is historical. No versions, release artifacts, installed state or main branch changed. |
| 2026-09-25 | Read-only G0 inventory distinguishes 33 ordinary Runtime role/procedure packages and two normal knowledge bundles from the still-absent Cats-specific development/practice supplement. Recorded broad artifact staging, catalog cache identity, resumed-skill hydration and existing private candidate isolation. This documentation slice prepares ownership/profile contracts; no content filter, skill delivery, persisted schema, model inference, version or publication changed. G0/G1 and practice/promotion remain open. |
| 2026-09-24 | PLAN-110 K1 now shares the Platform knowledge reader with Catlas and delivers normal Orchestrator procedures inline, with source-free asset fixtures. Catlas's 13 regressions pass within the 239-test scoped batch. This does not close this plan's preview development, practice/promotion, live-provider or installed-Desktop gates. |
| 2026-09-24 | Drafted ADR-118, SPEC-117 and this plan at the owner's request. Recorded static source baselines, pending gaps, ownership, staged gates and acceptance criteria. No implementation, live-provider/native acceptance, version bump or publication is claimed. |
| 2026-09-24 | Initial draft documentation validation passed: git diff whitespace checks and a filesystem-only check of all three new documents plus their new index references (51 local links, 19 unique functional requirements mapped to 12 acceptance criteria, balanced fences, no template placeholders, UTF-8/LF). Application tests/builds were not run for this documentation-only change. |
| 2026-09-24 | Incorporated the owner's two-profile clarification: extra development/practice skills only in preview/debug; reviewed local knowledge plus current context delivered to release Catlas's bound model. Added artifact exclusion, knowledge handoff and actual model-input delivery requirements and gates. Implementation remains pending. |
| 2026-09-24 | Amended documentation validation passed: git diff whitespace checks, 54 local links, 23 unique functional requirements mapped to 15 acceptance criteria, balanced fences, no template placeholders and UTF-8/LF. Reviewed profile separation and knowledge-delivery consistency across ADR/SPEC/PLAN and their four indexes. Application tests/builds and live-provider checks were not run for this documentation-only amendment. |
| 2026-09-24 | Implemented the owner-authorized Code-entry work package: curated bilingual build-coupled knowledge, validated loader, bounded observation, Core-bound read-only Runtime inference, authenticated help API, optional localized UI, provenance receipts and cancellation/failure fallback. npm/Desktop asset inventories include the bundle. No new Core persistence, developer supplement, skill, promotion workflow, version bump or publication was introduced. |
| 2026-09-24 | Focused server/assist-store/architecture checks passed 125/125, including 13 Catlas cases and actual inline content delivery through the Runtime HTTP adapter. Renderer/Code-entry/i18n/API-path checks passed 31/31. Desktop packaging checks passed 25/25; after adding a staged knowledge-loader assertion, its focused staging test also passed. Server/Desktop builds, renderer/test typechecks, UI-test bundling and Vite production build passed (existing chunk-size warning). This is scoped validation, not a full-suite pass. |
| 2026-09-24 | An isolated headless Edge component fixture passed explicit-request, question, response, close, no-page-error and narrow-viewport checks; desktop and 390px screenshots were visually inspected. It used local fixture responses and a separate browser profile, without touching the user's application state. Live-provider behavior, installed-Desktop/native acceptance, other OSes and the combined preview-to-release demonstration remain pending. |
| 2026-09-24 | Final server-bundle build and npm dry-run package inspection passed; the npm file inventory includes the 6,800-byte knowledge asset. Documentation validation passed 59 local links, 23 functional requirements mapped to 15 acceptance criteria, UTF-8/LF and balanced fences. Full-suite CI and publication validation are separate from these scoped local checks. |
| 2026-09-24 | The first full CI run on `0f140439` passed validation/typechecking and 4,679 tests, with 59 skips and one failure: the npm package-contract test still expected the pre-knowledge file inventory. Updated that expected inventory and added an explicit packed-knowledge presence assertion. The implementation's knowledge delivery and Desktop checks passed in that run; the corrected package contract is validated separately below. |
| 2026-09-24 | The corrected npm executable/package contract passed its focused test, including a clean non-mobile server/renderer/Desktop build and actual npm dry-run inventory inspection. The new knowledge file is now asserted both in the declared package inventory and the packed file list. Full CI runs again on the correction commit. |
| 2026-09-24 | Full [CI on `e3a61434`](https://github.com/cats-inc/cats-platform/actions/runs/35940019078) passed both `validate` and `nodejs (24)`. The owner subsequently requested Orchestrator knowledge/procedure planning before wiring; ADR-119, SPEC-118 and PLAN-110 track that separate consumer/operation workstream. |

---

*Created: 2026-09-24*
*Last updated: 2026-09-25*
