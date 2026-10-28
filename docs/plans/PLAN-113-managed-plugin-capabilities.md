# PLAN-113: Managed Plugin Capabilities

## Metadata

| Field | Value |
| --- | --- |
| Status | Agency host pilot delivered with full CI 2026-09-29; general SDK and release remain separate |
| Owner | Platform integration; Runtime execution; cats-plugins Agency artifact |
| Reviewer | Product owner; cross-repo independent reviewer |
| Spec | [SPEC-121](../specs/SPEC-121-managed-plugin-capabilities.md) |
| Decision | [ADR-122](../decisions/122-adopt-managed-plugins-for-upstream-capabilities.md) |
| Related work | Apps lifecycle/catalog in [PLAN-112](PLAN-112-app-market-and-lifecycle.md) |

## Overview

2026-09-29 execution update (takes precedence over the unauthorized wording of the original
proposal below): implementation has started in independent Platform and Runtime worktrees.
The Producer's pinned 0.1.0 artifact is unchanged.

- [x] Pinned archive gate, atomic inventory/package writes, install/enable separation.
- [x] Runtime authenticated management, lease/generation and source exposure.
- [x] Settings Plugins, Cat skill profiles, impact confirmation and pending removal.
- [x] Conversation/native context prevents automatic replay from bypassing revocation; history is kept.
- [x] Cross-repo integration, isolated Candidate renderer operation and independent review.
- [x] Remote delivery and CI (does not mean a release).

Validation scope and candidate operations are recorded per the [pilot guide](../managed-plugins-pilot.md).

### 2026-09-29 validation evidence

- Platform: 28 distinct focused tests pass (Plugin state/replay 5, existing Settings/Apps 18,
  Candidate command 5); server/Desktop/renderer/test TypeScript checks pass.
- Runtime: 47 focused tests pass, covering HTTP skills, direct child close, Windows host
  start cancellation, lease/generation/native rediscovery/fork reset; Runtime typecheck passes.
- The Windows isolated Candidate `candidate-managed-plugins-20260929-03` completed the Runtime,
  Platform server, Desktop and renderer builds. Launch ID
  `ac12449e8609876484e15b7ef61f14131c646773380b0b56a33a85a4894b8f87`; Platform source digest
  `081191d4a807b8540c4d72b737671580cf3038dc2ec713f6f31b8f18a1a6da83`, Runtime source digest
  `6090aca083e794196e5eef8b8a7658fec28b31bb9dc385782c60dc9fa325fccb`. Later CI fixes
  covered initialization of an embedded/in-memory host without platformDir, and show the MIT
  license from existing metadata; they do not change the storage-backed flow or display text of
  the accepted Candidate.
- The native window confirmed a normal first-run; automated operation in an isolated Edge
  renderer against the same Candidate server completed
  upload→install→enable→Runtime catalog with two skills→Cat draft selection→disable→remove.
  `plugin-ui-report.json` shows all succeeded, renderer errors 0, model requests 0; the
  screenshots were inspected. No test Cat was saved and no real model was called. The Candidate
  and the two sidecars were confirmed drained.
- An independent read-only reviewer re-checked revocation / conversation replay / owned-process
  startup; after fixes there were no remaining actionable findings. Full remote CI and cross-OS /
  real-model acceptance are recorded separately; no release is claimed.
- The first full CI caught an initialization compatibility problem where an existing JS fixture
  omits platformDir, and a license raw-string audit; the failing version was not merged. After the
  fix, a no-storage regression was added (6 Plugin tests pass in total), all 451 tests of the
  originally failing files re-ran and passed; the server build and an independent read-only
  re-review also passed.
- [Platform PR #163](https://github.com/cats-inc/cats-platform/pull/163) was merged as
  `a9569f6f198a0e2c2d23bf1b4bec2d9a0f66ebab`;
  the [full CI](https://github.com/cats-inc/cats-platform/actions/runs/36465705096) passed:
  5,247 tests pass, 59 skip, 0 fail, including server/Desktop/renderer/test/mobile typecheck.
  [Runtime PR #119](https://github.com/cats-inc/cats-runtime/pull/119) was also merged, and the
  full preflight of 244 test files, build, skills validation and package dry-run passed.
  There was no bump, tag, publish or release; acceptance of the formal installed build / cross-OS /
  real models is still not claimed complete.

P0–P4 below keep the full product plan; the unchecked general SDK / provider / hooks / catalog
work is still not delivered. This round's authorization is limited to the Agency content pilot
above; experimental results do not automatically become a formal release.

## Ownership and integration seams

| Owner | Delivers | Boundary |
| --- | --- | --- |
| Platform | Plugin installer/inventory/Settings, source policy, and the management client to Runtime | Does not call providers itself, parse an upstream agent loop, or take over manually installed items |
| Runtime | Versioned registration, execution/probe/selection, process/MCP/skill lifecycle | Does not import Platform and does not keep a second Desktop install intent |
| Future cats-plugins | Upstream pins/notices, build recipe, thin bridges, per-OS artifacts/validation | Does not copy Runtime and does not rewrite an external core implementation as a Cats feature |
| cats-apps | Existing renderer Apps; compatibility validation of shared foundations | Is not forced to accept arbitrary background executors |
| cats-one | Updates workspace/release docs only after a new repo is decided | Does not act as a Plugin runtime or catalog service |

This round modifies isolated Platform and Runtime worktrees. Apps/cats-one and the existing
Plugin artifact are unchanged; neither host bumps or publishes.

## P0 — Choose the candidate and fix the contract

- [x] Record the user's direction: reuse upstream, manageable capabilities, the possibility of an independent provider, experiment separate from distribution.
- [x] Audit the current state of Apps/Runtime and the call direction of OpenChatX/C2C, with no install or outbound execution.
- [x] Pin the C2C revision and complete the [static integration evaluation](../research/2026-09-28-c2c-plugin-fit-evaluation.md):
      the full workflow waits for a usable host/upstream entry; the bridge subset is still unselected, and there is no live pilot evidence.
- [x] Complete the [Agency Agents static evaluation](../research/2026-09-28-agency-agents-plugin-fit.md):
      recommend a few roles as a skills-only pilot; the source / delivery / migration contract and actual acceptance are not yet complete.
- [x] Add the lifecycle / optional hooks / minimal SDK and the source policy for upstreams without releases (SPEC-121 FR-09/10);
      this item only records the documentation requirement as complete; the wire schema, runner, SDK, artifact and acceptance are still not delivered.
- [ ] Confirm the ADR/SPEC scope, and pick the first upstream with clear licensing and a verifiable integration/delivery surface.
- [ ] List explicitly the Plugin's external capabilities, the Cats thin bridge, and the existing Runtime transport; if core functionality would need to be rebuilt, switch candidates.
- [ ] Pick pilot evidence for MCP/skills and for a provider; they may share a repo, but MCP success cannot stand in for a provider.
- [ ] In the Runtime owner repo, fix the versioned contracts and fixtures for registration / revocation / lease / probe / skill delivery,
      and list the changes for the registry factory, provider universe, config validator, selection and catalog consumers.
- [ ] Fix the shared installer/catalog scope with PLAN-112; do not count unimplemented functionality as an existing foundation.
- [ ] Fix the manifest kind / envelope / compatibility syntax / bounded I/O, OS/arch, process permission and secrets boundaries.
- [ ] Fix desired/observed state and journal, activation generation, the lease revocation limit, crash reconciliation,
      and handling of unsupported cancel; design migration / backup / atomic recovery fixtures.
- [ ] Fix the inspect / pre-post install / pre-post uninstall / update / repair phases, step identity,
      receipts, required-action / affected-session DTOs, timeouts, and dedup / compensation / manual recovery.
- [ ] Fix the permission/resource contract between the Platform installer writer and the Runtime helper runner, the post-uninstall
      operation cache and the full set of owned execution dependencies / external prerequisites, and the minimal SDK owner; a
      hook-less skills package must work on the common lifecycle alone.
- [ ] Define re-checking of removal impact and the admission fence; a CLI/Desktop restart is not evidence of a clean context,
      and the contracts for old session resume/fork, new context and history retention are listed explicitly.
- [ ] Fix the source lock + recipe schema, full commit / content digest, submodule consistency, LFS /
      external download dependencies, toolchain / patch pins and source archiving; a Cats candidate version can be produced even without an upstream release.
- [ ] Confirm the artifact owner/repo; independently review the contract, and record the needed version boundary without bumping or publishing.

Exit: there are reviewable exact contracts, source choices and failure fixtures, with no "wrap it and it just works" assumption.
This gate does not depend on the ChatGPT Web adapter, and does not authorize live automation against a service with concerns.

## P1 — Local packaging and Runtime integration

- [ ] Obtain the exact upstream revision through the source lock, and build an artifact that does not depend on an upstream checkout,
      with notices, digest and thin bridge; skill text and sources required by the license still ship with the package.
- [ ] Validate the hook-less path with a pure-content package such as Agency; the minimal SDK / validator / fixtures and the controlled helper
      implement only the phases that are fixed and needed, unimplemented hooks are explicitly rejected, and full-lifecycle support is not claimed.
- [ ] Platform builds the Plugin kind validator / registry namespace, reusing the validation and operation mechanisms already landed.
- [ ] Runtime accepts a validated descriptor and registers an independent target / MCP / skills through a supported transport.
- [ ] Complete identity collision, compatibility, auth setup, capability truth and ROI admission.
- [ ] Verify the existing Codex / other provider settings are unchanged, and a new install is not automatically selected or does not consume model quota.
- [ ] Complete tasks / tool calls with a real pilot of clear licensing; record fixtures and upstream live evidence separately.

Exit: AC-01–AC-04, the install part of AC-13, and the AC-16 source packaging are verifiable; the SDK support matrix is listed explicitly.
If this phase has only MCP/skill success, state explicitly that the provider is incomplete,
and do not claim adapter distribution is delivered. A public catalog or a formal Desktop install is not required.

## P2 — Revocation, update and recovery

- [ ] Disabling immediately rejects admission of new work / tool / skill, and coordinates work cancellation and process / subscription ownership.
- [ ] Cover scenarios such as Runtime disconnection, lease expiry, restart, duplicate / out-of-order responses, and old generations.
- [ ] Removal revokes first and then cleans up; restrict package/cache paths, and keep settings, history, works and a tombstone.
- [ ] Verify that shared services / dependencies and manual MCP / skills are not damaged, and that file locks / junction cleanup are recoverable.
- [ ] staged update / same-version repair / confirmation of newly added permissions; active work switches only after the user explicitly stops it.
- [ ] Skill delivery is revoked by source, cancelling / marking the affected turns of existing sessions, and keeping shared providers /
      unrelated sessions; residual context cannot be treated as clean in the formal or re-enable flow.
- [ ] Verify hook response loss, retry / timeout / crash, compensation failure, and inability to confirm external side effects; stopping admission
      is not blocked by pre-uninstall failure, and the post helper can still recover from the fixed operation cache after files are cleaned.
      This includes owned execution dependencies after the main package is cleaned and restarted, missing shared prerequisites, and pending recovery.
- [ ] Verify that earlier skill context remains subject to revocation across CLI/Desktop restart and resume/fork; new context
      does not replay revoked skills, and history, manual skills, shared CLIs and unrelated sessions are kept.
- [ ] If the persisted schema changes, run validation, backup, atomic replacement, failure recovery and rerun tests.

Exit: AC-05–AC-08/AC-11, the uninstall part of AC-13, AC-14 and the Runtime part of AC-15 have fault-injection
and real-filesystem evidence; pending states have a recovery path.

## P3 — Desktop and experiment policy

- [ ] Settings Plugins inventory / details / setup / start-stop / remove / repair share the management client.
- [ ] Providers are still projected by the Runtime catalog; keep the existing picker continuity and selection contract.
- [ ] The host form presents settings, the normal flow uses plain language, and source / digest / log go in expandable diagnostics.
- [ ] Before an operation, present the affected Cats / sessions / work and the required actions, and re-check before execution; it can be cancelled or confirmed as stop
      and remove. Distinguish "setup incomplete", "stop pending confirmation", "removal pending completion" and "old conversation needs a new session".
- [ ] A required-action can at the same time require a new context, a restart of a specific owned service, or a Desktop
      restart with a reason; verified/executed by the host, and a Plugin cannot terminate shared processes itself or claim the context is cleared.
- [ ] Bind internal-experiment admission to a trusted build/profile policy, independent of the version channel.
- [ ] Verify that an experimental profile/package copied to a normal Desktop, a normal preview, or after a Runtime restart cannot escalate privileges.
- [ ] Use an isolated Desktop to check multi-window update, stop pending confirmation, Runtime offline and broken-package recovery.

Exit: AC-09/AC-10 and the UI part of AC-15 pass; local experiments can be fully managed, still without public distribution.

## P4 — Controlled catalog and release preparation

- [ ] Hook into the shared catalog trust/download mechanism, distinguishing App and Plugin schema/kind.
- [ ] Plugin pin, source / revision, license, applicability to the usage surface, OS validation and withdrawal are traceable.
- [ ] Archive the validated source, build receipt and Cats artifact; simulate the original repo/commit being unavailable and offline
      install, and forbid falling back to main. The upstream source pin, Cats Plugin version and channel are managed separately.
- [ ] Compatible version selection, manual update, source-transition confirmation and offline behavior must not widen permissions.
- [ ] Prove that the formal catalog / Desktop bundle contains no internal-experiment content and has no automatic promotion.
- [ ] Complete the mapping of all ACs and an independent review; list unverified platforms and capabilities one by one.
- [ ] Under new authorization, schedule the Runtime / Platform / Plugin artifact / catalog releases separately, recording exact versions and upgrade dependencies.

Exit: AC-12 and the full cross-OS / host acceptance have evidence, and the artifacts are ready for release review; without release authorization, stop at candidate artifacts.

## Change map

| Surface | Planned work |
| --- | --- |
| Platform `src/platform/apps/` and new Plugin management modules | Extract truly shared validation/operation foundations from delivered code; keep the App validator/executor |
| Platform Runtime client / host API / Settings | Versioned management DTOs, inventory / setup / progress and Runtime observed state |
| Runtime agent adapter registry / bootstrap / provider config | Admission of external descriptors, collision, selection, catalog and transport integration |
| Runtime managed execution / MCP / skills | Owner scope, revocation, lease/recovery and skill provenance |
| Platform operation journal / Runtime helper runner | lifecycle phases / step receipts / required actions / post-cleanup cache / compensation and recovery |
| Minimal Plugin SDK (owner to be fixed in P0) | Protocol types / validator / transport helpers / hook-less content packages and fault fixtures |
| New Plugin artifact collection | source lock / recipe / source archive / necessary thin bridges / notices / compatibility / per-OS artifacts |
| Desktop packaging / catalog consumer | internal-experiment policy, source pinning and formal list validation |

This is the work scope and does not claim that a Plugin SDK, install format or REST endpoint exists. P0 first completes each owner's
contract and the data-upgrade design, then implements with the least impact; core code is not changed in advance for the proposal.

## Testing strategy and risks

The documentation phase only validates the diff, links and consistency. The implementation phase uses contract fixtures, isolated HTTP/process,
filesystem fault injection and real-host acceptance; all test data lives in a temporary profile.
A successful artifact build does not mean the upstream is usable; a usable MCP server also does not mean a provider turn can run.

| Risk | Validation / handling |
| --- | --- |
| Integration turns into rewriting upstream | P0 lists the upstream entry and bridge differences; switch candidates if no suitable entry exists |
| Declaring a provider but offering only tools | AC-02 submits a task and result independently; do not borrow Codex to run it |
| UI closed but still executable | Runtime admission revocation, lease/recovery and stop evidence |
| Mistakenly deleting manual installs or shared services | ownership receipts, path containment, references and before/after data checks |
| Experiments flowing into the formal version | build/profile policy, catalog/artifact inventory, skill context provenance |
| Independent update incompatible with an old host | host/Runtime/protocol version cross fixtures, rejecting unknown schemas |
| Package has an open-source license but service use is of concern | record code license and service access separately; do not treat internal testing as an exemption |
| Arbitrary hooks or retries widening permissions / duplicating external side effects | validated helper, step receipts, reconcile first, unknown stays pending |
| Treating restart as skill cleared | keep exposure provenance, block old-context resume/fork, validate the new context |
| Upstream has no release, the ref drifts or disappears | full commit + content checksum + Cats-archived source and artifact, never fall back to main |

## Progress log and resume checkpoint

2026-09-28: created the ADR/SPEC/PLAN and research basis on the `docs/managed-plugins-proposal`
branch in the `cats-platform-plugins-proposal` worktree, and added the relationship to the existing proposals and the index.
No product code, manifest, user data, version or other repo changed.
No upstream install, login, provider call, build or release was run. The ACs of all newly added capabilities are still not executed.

Document validation: all 1,073 local link targets across the 16 changed/new Markdown files exist; the new documents'
LF, trailing newline, whitespace and number uniqueness pass, and `git diff --check` passes. The original Platform main
working directory and the Runtime working directory are clean. No product tests were run; document checks do not replace functional acceptance.

The independent read-only review is complete: clarified the boundary between Plugin-owned resources and the affected
turns/context of existing sessions when a skill is revoked, added AC-08 and P2, and a readback confirmed no remaining blockers. The exact schema / protocol / lease
and OS enforcement are still designs to be fixed in P0 and are not recorded as implemented.

2026-09-28 follow-up: on the user's instruction 「開始」 ("Start"), in the `cats-platform-c2c-evaluation` worktree /
`research/c2c-plugin-fit` branch, pinned C2C `9663b88753e35c76796c5bce000293e0bd22cd9e`
and completed the static source evaluation. The Platform baseline is `55445aaf` of the merged PR #160, and the Runtime
baseline is `73f9def9`. C2C currently lacks a browser host / task controller usable by Cats, and the original
skill update / global settings and process-stop semantics need managed adaptation; it is not selected as the first full-workflow pilot.
Bridge-only has a packageable entry, but its product value needs separate confirmation, and it has not been built, installed, started or validated.
Added the research and the index; no ADR/SPEC status, product code, version, user settings or other repo changed.

Validation this round: all 309 local link targets in 5 Markdown files exist; the 20 immutable
source links of the new research are valid against the paths/lines of the local pinned checkout. LF, trailing newline, whitespace and
diff checks pass. An independent read-only review confirmed that the skill Plugin / independent provider determination is not conflated and
bridge-only is not over-promised, with no remaining blockers. No product or upstream tests were run; this is document and static
source validation and does not prove build / real-host compatibility or complete the whole dependency license audit.

2026-09-28 Agency follow-up: C2C evaluation PR #161 was merged by auto-merge as `dec5af9b`,
and the required CI checks passed. Separately, in the `cats-platform-agency-evaluation` worktree /
`research/agency-plugin-fit` branch, Agency Agents was evaluated with this commit as the Platform baseline.
The user's existing reference pin is `00fb28a4`, and the current upstream `479193dc` was also taken for a static check; neither was modified.
Confirmed upstream already has a SKILL.md converter, and recommended Code Reviewer / UX Researcher as small content Plugin
candidates; the converter/installer was not run and no installable artifact was created. The Cats 33 release / 36 including preview
skills are currently Runtime-owned content; sampling shows they are not equivalent to upstream and cannot be treated as a port that can all be directly replaced.
The next contract work must list the source-boundary extension of Runtime ADR-018 / SPEC-013, collision / provenance /
revocation, and the migration principles for existing skill refs; this round did not change their accepted status and did not enter P1.

Agency document validation: all 301 local link targets in 4 Markdown files and the paths of the 9 pinned source
links of the new research are valid; LF, trailing newline, whitespace and diff checks pass. The independent read-only review is complete,
and per its advice clarified that Platform is the installer writer and removed the title's default assumption of a historical port.
This round has no product code / Runtime document changes, and did not run product tests, upstream scripts or model-quality evaluation.

2026-09-28 lifecycle/source follow-up: at the user's request, added ADR-122, SPEC-121 FR-09/10
and P0–P4 of this PLAN. Added AC-13–AC-16, listing Platform orchestration / Runtime helper execution,
bounded optional hooks, hook-less content packages, session impact confirmation / admission fence, new-context recovery,
step receipts / dedup / compensation, and retention of the full owned execution dependencies needed after uninstall.
The default source is source lock + recipe; a submodule is optional and needs consistency validation, and when upstream has no release a
full commit may be chosen, then released under a separate Cats version/channel. No cats-plugins repo,
SDK, source lock instance or artifact was created, upstream was not installed/run, and no Runtime/product code or versions were changed.

Document validation: all 265 local link targets in 5 Markdown files are valid, FR-01–FR-10/AC-01–AC-16
are unique and complete; LF, trailing newline, whitespace and diff checks pass. The gap in retaining
post-uninstall execution dependencies raised by the independent review was added to FR-09, AC-14 and P0/P2; a readback confirmed no remaining blockers.
The source-acquisition statements were checked against the official Git/GitHub documentation. Pure document changes did not run product tests/build,
and the ACs of all newly added features are still not executed.

2026-09-28 implementation authorization: the user asked to first send out this planning PR, then directly create
`cats-plugins`, initialize it through project-bootstrap, commit/push to main directly, and adopt Agency
Agents as the first MVP. The next delivery is the producer repo, pinned sources, two-role packaging, validation, docs and CI;
the exact implementation and evidence are recorded in cats-plugins' own ADR/SPEC/PLAN. Full Desktop/Runtime integration,
a new provider, model-quality acceptance and a formal release are still not delivered, and producer success is not counted as completing all of this PLAN.

*Last updated: 2026-09-28*
