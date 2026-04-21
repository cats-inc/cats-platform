# Roadmap

> Long-term product milestones for `Cats`.

## Vision

Build the cats platform around a shared `Cats Core v1` foundation, with
`Cats Chat` and `Cats Work` as separate product surfaces above
`cats-runtime`. The current `cats` codebase still starts from a
Node.js/TypeScript chat shell, but the roadmap now assumes parallel product
tracks that reuse the same actors, conversations, approvals, and owner-memory
contracts.

## Milestones

### Phase 1: Foundation

- [x] Bootstrap the subproject and align docs
- [x] Establish `cats-runtime` as the runtime boundary
- [x] Ship a minimal HTTP app shell and health surface
- [x] Choose `React/Vite` as the initial renderer approach

### Phase 2: Chat Core

- [x] Multi-channel chat shell
- [x] Initial file-backed chat state
- [x] Local channel creation flow
- [x] Channel creation flow with team/runtime setup
- [x] Global orchestrator surface
- [x] Basic `@mention` routing and participant management
- [x] Transcript persistence with export designed for later ingestion

### Phase 3: Platform Foundation

- [x] Freeze `Cats Core v1` shared contracts for identity, actors/resources,
      permissions, conversations, bot bindings, tasks/approvals, owner profile,
      and archive metadata
- [x] Keep the full desktop platform on one `Electron + React/TypeScript` path
      while `cats` and `cats-runtime` remain Node sidecars
- [x] Define how `cats` hosts or exposes shared `Cats Core v1` services for
      both `Cats Chat` and `Cats Work`
- [x] Define the split between `cats-runtime` direct product APIs and the
      planned MCP facade for orchestrator tool use
- [x] Thin `src/app/server/index.ts` into smaller composition-root factories
      and route-registration modules while keeping one platform-owned server
      bootstrap surface
- [x] Land product-owned route delegates and per-product server dependency
      slices so Chat/Work/Code teams can extend their own API surfaces without
      reopening a shared host-wiring merge hotspot
- [ ] Introduce a storage abstraction so the current file-backed shell can grow
      into operational DB plus archive/RAG pipelines without a flag-day rewrite
- [x] Keep the current chat shell loadable while the shared contracts land
- [x] Add graph-based dependency enforcement on top of the existing
      architecture-boundary tests so `core/` and `platform/` regressions are
      blocked mechanically rather than only by targeted assertions
- [x] Finish extracting shared platform shell and design primitives into a
      dedicated `src/design/` layer without pushing Chat-specific visuals into
      shared modules
- [x] Land the first shared settings composition layer in
      `src/design/components/settings/`, including settings-scoped tokens and
      reusable section/header/row/action/status primitives so Settings pages
      can migrate incrementally onto one design contract
- [x] Publish a product integration guide that freezes shared contracts,
      clarifies dependency-slice ownership, and defines the platform-host
      registration protocol for parallel Chat/Work/Code delivery
- [ ] Generalize platform-owned identities into reusable `entity` and
      channel-scoped `participant` contracts so Chat, Work, and Code stop
      depending on Cat-only conversation semantics even while Cat language
      remains the product-facing default
- [ ] Add product-level `cats-runtime` availability detection and recovery UX
      so each product surface (Chat, Work, Code) can detect when the runtime
      becomes unreachable or loses providers after setup, surface actionable
      guidance, and help the user recover — this must exist independently of
      the setup wizard since the runtime can go down at any time

### Phase 4: Cats Chat Launch Track

- [x] Complete the `Cats Core v1` chat-runtime migration onto the unified
      `Container -> Conversation -> Turn -> Lane -> Segment -> Session`
      engine, including removal of remaining mode-driven dispatch
      assumptions and legacy chat-only interaction writes
- [x] Finish sequential frontier propagation so later sequential lanes inherit
      prior completed lane outputs as canonical input frontier instead of only
      the originating user message
- [x] Promote replay, repair, and recovery to rebuild from canonical
      interaction records plus transport bindings instead of heuristic
      transcript/session inference
      Completed: canonical interaction records plus transport bindings now
      drive replay, repair, retry, and startup recovery end to end.
- [x] Land concurrent group transcript delivery on stable lane identity,
      cluster-ready text barriers, and runtime multiplex semantics so
      concurrent UI shape no longer depends on connection timing
      Completed: concurrent stream attach, same-lane session reattach, hidden
      participant identity, and cluster-ready text barriers now all resolve by
      lane-native engine identity instead of connection timing.
- [x] Normalize heterogeneous runtime delivery into one product-owned event
      contract so block-streaming CLIs, text-only CLIs, and final-result-only
      runtimes can all feed the same lane/segment engine
      Completed: runtime and live consumers now normalize nested tool-result
      content arrays, tool-use aliases, and mixed delivery payloads into the
      canonical lane/segment event contract.
- [x] Finish end-to-end transport binding adoption for external entrypoints
      and direct lanes so Telegram/bot threads, product conversations, and
      runtime sessions stop sharing overloaded identity semantics
      Completed: `transportBindingId` now persists through canonical writes,
      retry/recovery, stream events, close/reconnect notices, and direct-lane
      rebuild paths, so transport identity is no longer overloaded onto
      session/transcript inference.
- [ ] Offline transcript normalization and ingestion handoff hooks
- [ ] Split-view chat canvas with preview and debug surfaces
- [ ] Operator-grade activity indicators, streaming updates, and richer channel lifecycle state
- [x] Carry stable `participantId` speaker identity end to end through channel
      stream target selection, SSE payloads, live-indicator state, and
      transcript/live-bubble visibility gating so sequential handoff and stale
      progress suppression stop relying on `senderName` /
      `executionLabelSnapshot` fallbacks when different participants can share
      the same visible label
- [ ] Promote the current env-gated live trace seam into a developer-facing
      inspector above `window.__catsLiveTrace` and `GET /api/debug/live-trace`
      so transient stream attach, session-close reconnect, and bubble-visibility
      decisions can be debugged without raw devtools or ad-hoc state dumps
- [ ] Replace the current process-local server live-trace buffer before any
      multi-worker or clustered app-server deployment so
      `GET /api/debug/live-trace` can aggregate stream-target and attach events
      across workers instead of reporting only the handling process
- [x] Freeze a shared composer busy-state contract across solo, parallel, and relay flows,
      and replace the previous ad-hoc `message:*` / `concurrent:*` string protocol
      with one typed workspace busy-state model so `isComposerBusy`,
      `isComposerDispatchBusy`, `isComposerSelectionBlocked`, compare-surface locks,
      live-indicator gating, and route-entry hydration all consume one explicit
      vocabulary instead of drifting independently
- [ ] Replace the current single-workspace busy slot with a keyed busy registry or
      equivalent multi-owner model so unrelated room, settings, Cat, and product
      operations can proceed concurrently instead of remaining artificially
      serialized behind one global `WorkspaceBusyState`
- [ ] Add renderer behavior coverage for composer busy-state transitions beyond
      helper tests, including parallel send, compare relay, live-indicator stream
      gating, and route-selection / `updateSelectedChannel(...)` guards so
      future lifecycle refactors cannot silently change busy-state semantics
- [ ] Replace the current Boss-Cat-first setup bootstrap with optional
      `Guide Cat` onboarding that captures only name plus runtime target,
      keeps setup completable without any Guide Cat, and treats Guide Cat as a
      platform-level helper rather than implicitly equating it with Chat's
      `Boss Cat`
- [ ] Unify setup and in-product execution-target selectors on one truthful
      runtime-backed contract so provider/model dropdowns only show currently
      usable choices instead of product fallback catalogs
- [ ] Replace the current truthful-selector hot path with one runtime topology
      read plus one bulk runtime availability read, so setup step 2 and product
      provider pickers stop paying N sequential provider checks just to decide
      what is selectable
- [ ] Split host-local readiness audits from agent/gateway backend audits so
      local CLI and local-model setup checks stay focused on host installability,
      while providers such as OpenClaw get a separate fast gateway/backend
      reachability contract instead of being omitted from setup health entirely
- [x] Add Guide-Cat-backed entry suggestions with deterministic static
      fallbacks so Lobby and `+New chat` can render useful assist content
      without depending on a permanently awake helper
- [x] Implement `Guide Cat` as an optional surface-assist capability with
      deterministic fallback surfaces so onboarding copy and entry-surface
      guidance stop depending on hardcoded product-only helpers
- [ ] Promote the shipped Guide Cat assist v1 hydration path into true
      runtime-backed assist generation, with distinct metadata for local
      rehydration versus newly generated content and later mission/run
      provenance once the shared execution shape is ready
- [ ] Extend Guide Cat assist bundles beyond Lobby and `+New chat` greeting or
      starter chips into recap, feature guidance, composer-adjacent helper
      content, and later Work/Code empty-state adoption
- [ ] Replace the current Guide Cat assist override and personalization
      limitations with a richer product-owned contract, including partial
      curated overrides and baseline-time recipient personalization instead of
      renderer-side `"this Cat"` string replacement
- [ ] Add explicit Guide Cat assist invalidation or manual refresh UX and, once
      runtime-backed generation exists, later scheduled or wake-driven refresh
      policies without regressing offline-first entry behavior
- [ ] Finish destructive-delete UX above the landed runtime-session delete policy,
      including explicit renderer feedback for retained or failed runtime cleanup,
      clearer confirmation and busy states for chat / parallel-group / Cat delete,
      and debug-retention messaging when
      `CATS_DEBUG_KEEP_RUNTIME_SESSIONS_ON_PRODUCT_DELETE=true`
      Progress: single-conversation deletes now require an explicit confirmation,
      and conversation / parallel-group / Cat destructive confirmations now state
      that linked runtime sessions are removed too.
- [x] Refactor `ensureTargetSession(...)` so runtime session creation, lease wake state,
      and execution-target reconciliation stop living in one function now that
      session startup also persists runtime-sanitized model selections back into
      channel/global state
      Completed: reuse, wake preparation, launch, start persistence,
      execution-target reconciliation, task-execution context, and activation
      result shaping now live in separated helpers instead of one orchestration
      function.
- [ ] Persist solo-composer model changes immediately on selector change instead of
      only committing the pending provider/model when the next message is sent
- [ ] Add a platform-local cache for truthful runtime-backed selector reads,
      model catalogs, and advanced catalogs so repeated setup, cat-creation,
      and product selector mounts do not refetch the same provider/instance
      metadata on every reopen while still preserving usable-target truth and
      without reintroducing product-owned static fallback catalogs
- [ ] Stop rebuilding the full truthful selector registry in front of every
      `/api/providers/{provider}/models` and `/api/providers/{provider}/models/advanced`
      request; once a provider target is already known usable, model-catalog
      reads should reuse that truth or a short-lived shared selector cache
- [ ] Tighten the landed provider-catalog and truthful-selector stale-cache
      hygiene beyond the current stale-if-error plus error-backoff slices:
      replace the optional `cacheRefreshWarning` field with a discriminated
      fresh-vs-error-backoff entry shape so the lifecycle invariant is
      enforced by types instead of relying on "don't spread the old entry"
      convention, split the provider-catalog cache into separate typed
      `model-catalog` and `advanced-catalog` maps so
      `readProviderCatalogCacheEntry<TCatalog>` no longer needs an unsafe
      cast, retire the test-only `withMockedDateNow` module-level lock in
      favor of `node:test`'s concurrency primitives, and align the renderer
      `PROVIDER_REGISTRY_AUTO_RECHECK_COOLDOWN_MS` with the server's
      `PROVIDER_CACHE_ERROR_BACKOFF_MS` so outage recovery does not flash
      cache-refresh warnings on and off while the two retry loops race each
      other
- [ ] Refine advanced provider-model UX now that runtime presets and controls are
      first-class, including an `Advanced settings` disclosure pattern that prevents
      large control sets from overwhelming the base provider/instance/model flow
- [ ] Make unsupported provider/model reasoning-effort combinations explicit in
      the composer and reopen flow, so selectors warn before sanitize/fallback
      instead of silently reverting to the model default
- [ ] Stop duplicating provider alias normalization rules between `cats-platform`
      and `cats-runtime` by having runtime-owned model catalog APIs return a
      canonical alias/legacy-id map that selector reconciliation and session
      create flows can consume directly
- [ ] Shift cat UX to a chat-contextual `Add cat` flow while moving registry
      administration into `Settings > Cats`
- [x] Desktop host and tray lifecycle management above the existing Node server boundary
- [x] Stage cross-platform desktop packaging manifests and emit Windows NSIS
      installer artifacts through the host-owned pipeline
- [ ] Turn the current Windows NSIS-first packaging slice into a release-grade
      desktop distribution path, including signed installers, branded assets,
      and a documented release pipeline rather than test-install outputs only
- [ ] Replace the current deprecated `rcedit`-based Windows executable icon
      edit step with a supported or vendored path so release packaging does
      not depend on an unsupported npm package
- [ ] Harden the reusable desktop icon pipeline beyond the current first slice
      so one source asset can safely generate app/tray icons even when future
      SVGs use transparent backgrounds, gradients, or non-square visual
      composition, instead of relying on the current top-left-background tray
      template heuristic alone
- [x] Extend the current desktop packaging contract beyond Windows staging so
      macOS and Linux also produce real installer artifacts instead of staged
      manifests only
- [ ] Add release-facing verification for generated desktop icons beyond the
      current generator regression coverage, including packaged-app assertions
      that Windows/macOS/Linux installers and tray surfaces actually consume
      the generated assets end to end
- [ ] Strengthen the packaged host trust chain beyond the current HTTPS and
      allow-list checks, including signed update manifests, verified download
      integrity, and controlled apply/restart orchestration
- [ ] Harden desktop host persistence and readiness parsing with stricter
      machine-readable validation for host-state snapshots, readiness payloads,
      and update manifests so corrupted local files or malformed service
      responses cannot silently degrade packaged runs
- [ ] Add installed-app verification beyond the current unpacked smoke pass,
      including real Windows post-install launch checks, persisted host-state
      assertions on installed machines, and later packaging CI coverage
- [ ] Land host-owned privileged provider install/resume and remediation flows,
      including Windows elevation/UAC handling and resumable installer-first
      recovery contracts
      Progress: repo-owned helper surfaces now exist for the packaged Windows
      native/WSL/Docker baseline, for Unix self-hosted host install/check/upgrade,
      and for Windows self-hosted WSL/Docker/check/upgrade orchestration; the
      remaining gap is productizing those helper surfaces through release-grade
      wizard/remediation UX instead of only shipping them as operational scripts.
- [ ] Deduplicate the shared Unix self-hosted install and readiness substrate
      between `scripts/linux/node-cli-common.sh` and
      `scripts/macos/node-cli-common.sh` so future provider-pack, parallel-audit,
      and serial-debug changes do not require two 900+ line edits that can drift
- [ ] Extend the packaged setup/runtime-bootstrap contract beyond the current
      first slice so API-backed, local-model, and agent-backed runtime targets
      also converge on runtime-owned apply instead of only supporting provider
      paths already representable by the current bootstrap/apply contract
- [ ] Tighten the runtime-bootstrap mutation contract so packaged setup no
      longer needs a follow-up `GET /setup-state` after `POST /setup-scan` or
      `POST /setup-apply`, ideally by having runtime mutation responses return
      the updated read model in the same round-trip
- [ ] Propagate cancellation and timeout intent end-to-end through the packaged
      setup runtime-bootstrap proxy path so hung runtime setup scans or applies
      do not leave renderer and app-server requests pinned until the runtime
      client timeout expires
- [ ] Finish demoting the Electron host bootstrap page into a failure/recovery
      surface only, so the happy path stays background-first and successful
      packaged runs flow directly into `cats-platform /setup` or the current
      product entry instead of leaving end users on a host-owned blocking page
- [ ] Replace the current operator-style packaged setup copy and diagnostics-
      first layout with progressive disclosure for end users, including
      simplified prerequisite/remediation messaging plus an explicit advanced
      details/log export surface for support workflows
- [ ] Ship the real `cats-can` bootstrap/install entrypoint so npm/npx and
      desktop-first users converge on one installer-owned handoff into the
      existing product setup flow instead of learning the current
      `cats-runtime` / `cats-platform` / Electron layering by accident
- [ ] Interactive delegation, owner approval loops, and "Know Your Boss"
      profile injection before dispatch
- [x] Follow up the Chat-first task-strategy handoff slice by deduplicating
      shared planning/runtime normalization helpers and keeping additive
      runtime execution payload serialization behind one reusable bridge path
- [x] Tighten task lifecycle watcher convergence so additive
      `effectiveStrategy` and `strategyState` metadata can settle into UI/read
      models before full runtime stream teardown where observe payloads already
      provide enough signal, without regressing no-planning compatibility paths
- [x] Close the first parent-task fan-out convergence loop inside Cats Core so
      child task terminal transitions synchronously settle `parentTaskId`
      parents without a background poller or runtime-side task graph
- [x] Land product-owned companion boxes, session hydration, and Cats-owned
      canonical memory/retrieval first slices without changing visible Chat UI
- [ ] Extend Cats-owned canonical memory beyond the current cat/owner/channel
      first slice so relationship- and project-scoped durable memory can also
      participate in retrieval and later `Cats Work` flows
      Progress: project and relationship durable-memory scopes now have
      product-owned canonical flush plus generic retrieval-context support
      inside `src/platform/memory/*`, and core-owned non-UI project/
      relationship memory routes now expose CRUD, canonical sync, and
      retrieval-context surfaces above that substrate; future work still needs
      higher-level product adapters, richer relationship identity, and
      Work-native consumption.
- [x] Complete owner durable-memory CRUD beyond the current `GET/POST`
      surface, including update/delete paths that keep canonical retrieval
      synchronized
- [x] Converge companion-source mutation sync so canonical memory flush is not
      only guaranteed by HTTP routes: direct `MemoryAwareCompanionBoxStore`
      update/delete callers should hit the same non-duplicated sync boundary
      without relying on route handlers or double-flushing canonical state
- [ ] Promote the current Team 5-ready flush payload into a fuller non-HTTP
      memory maintenance contract, including reusable source-mutation sync,
      background-safe flush invocation, and clearer downstream expectations for
      `removedRecordIds` and entry-scoped `replacementGroup` consumers
      Progress: additive flush summaries, reusable best-effort sync helpers,
      core activity logging for runtime-hook / deferred maintenance, and
      `GET` / `POST /api/core/memory-maintenance` inspection-plus-action routes
      are now landed, including core-owned manual companion/owner/project/
      relationship canonical sync replay plus additive queue/query filters for
      `trigger`, `status`, `phase`, `subjectKey`, and `limit`, while the same
      inspection seam now also facets `sourceScopeKey`, `replacementGroup`,
      and `removedRecordId` impact plus stable facet counts for downstream
      automation, and executed maintenance entries now also expose stable
      per-record impact details back through the same core-owned inspection
      route; broader downstream consumer contracts still remain.
- [x] Surface the new orchestrator execution-loop contract in product-owned
      operator rails so Chat can consume step state, next actions, approval
      gates, and recovery hints without scraping transcript text
- [ ] Implement explicit `Boss Cat` auto-helper intervention policy for
      Recents threads, including when background orchestration may silently
      assist, when it must surface itself, and how that policy differs when
      Boss is absent, backgrounded, or currently the lead cat
- [ ] Extend automatic resume beyond the landed approve/reroute and retry
      replay of stored product-owned dispatch requests so deeper workflow
      continuation and group replan paths also become a closed loop instead of
      write-only markers
      Progress: startup recovery now downgrades stranded `in_progress`
      approval/retry replay metadata to failed on boot so manual approve/retry
      can reopen the loop after restarts, startup recovery now also finalizes
      stranded room-workflow `activeTurn` snapshots into blocked terminal
      history so inspectability stays truthful after restart, additive replay lifecycle
      activities now make blocked dispatch storage plus approve/reroute/retry
      replay start/result visible in product-owned operator read models, and
      core-owned recovery routes now normalize pending dispatch, stored
      dispatch replay, workflow-continuation replay, and latest replay
      activity into one inspectable read surface with replay-state filters and
      counts, while blocked
      `max_continuations` workflow continuations now persist a
      retryable replay snapshot that `retry` can auto-resume through the same
      operator seam, and the same replay metadata path now also covers
      continuation-stage guard blocks such as `max_dispatches`,
      `max_target_visits`, and `anti_ping_pong` when the blocked step already
      had a concrete continuation source/target context, recommendation-only
      continuation blocks can now also persist retryable `no_valid_targets`
      replay snapshots when a structured handoff exists but no active
      participants currently satisfy it, while retry can now keep that replay
      `blocked` plus ready for a later retry until the target becomes active,
      automatic chat-side assignment recovery can now also resume that replay
      when a matching cat becomes active again, startup recovery now also
      re-attempts ready recommendation-based `no_valid_targets` replays when
      their targets are already active again after restart, with additive
      replay activity marking that path as `resumeReason=target_recovered`, while core
      startup recovery now also runs its polling, chat-workflow, and
      orchestrator passes in deterministic sequence so those reconciliation
      writes do not race one another during boot, while core
      recovery routes now also support `latestReplayPhase` plus
      `latestReplayPhaseCounts` so automation can facet
      `startup_recovered`, `replay_blocked`, or `replay_failed` queues
      without reopening raw activity metadata, while core recovery routes now
      also support `latestReplayTrigger` plus
      `latestReplayTriggerCounts` so automation can distinguish dispatch-,
      approval-, reroute-, and retry-driven replay notes without scraping raw
      activity metadata, while core recovery routes now also support
      `latestReplaySource` plus `latestReplaySourceCounts` so automation can
      distinguish startup recovery, general orchestrator replay, and
      workflow-continuation replay notes without scraping raw activity
      metadata, while core
      recovery routes can now also project/filter/count that normalized latest
      replay resume reason for operator automation, recommendation-driven
      `parallel` replay now also waits for every candidate target to recover
      before auto-resuming a blocked fan-out, while blocked `no_valid_targets`
      snapshots now also preserve the recommendation-owned workflow
      stage/shape instead of collapsing to `sequential`, and can
      also re-resolve stale stored continuation targets from persisted
      `workflowRecommendation` payloads when the original participant ids are
      no longer active, while startup-recovered interrupted continuation turns
      now also project back into retryable `workflowContinuationReplay`
      metadata so operator `retry` can reopen the same product-owned replay
      seam after restart, and now also emit immediate
      `workflow-continuation-replay` / `startup_recovered` activity for the
      non-UI recovery surfaces, while active-target startup-recovered
      continuation snapshots now also auto-resume during the same boot
      sequence, and startup-recovered concrete `parallel` continuation
      snapshots now also stay blocked until every preserved target recovers,
      then auto-resume through the same assignment-recovery seam instead of
      partial-dispatching a degraded fan-out, with the intermediate
      `no_valid_targets` / unresolved-target state now also written back into
      task metadata for operator read models, while startup-recovered
      single-target continuations can now also auto-resume when an already-
      assigned active target regains its session lease instead of requiring a
      remove/re-add cycle, and startup-recovered orchestrator-target
      continuations can now also auto-resume when channel activation or room-
      entry wake restores the Boss Cat session; broader group replan
      auto-resume still remains, along with first-class startup recovery for
      full concurrent fan-out checkpoints rather than only sequential and
      single-target continuation chains.
- [ ] Promote the current machine-readable governance/workflow summaries into
      a fuller operator-control-plane contract, including stable approval
      actions, workflow continuation state, and runtime-delivery intent
      Progress: Chat operator/read-model assembly now lifts the latest
      normalized workflow recommendation out of checkpoint metadata into a
      first-class product view, so continuation source, candidate targets,
      branch strategy, and rationale are inspectable without scraping raw
      room-routing events, `/api/core/recovery/tasks` plus
      `/api/core/tasks/{taskId}/recovery` now expose normalized replay state
      plus action envelopes and `actionKind` filtering back to the existing
      approval and retry seams,
      `GET /api/core/tasks/{taskId}` now returns a derived inspection view
      with latest execution pointers, governance/workflow summaries, and
      immediate parent/child family topology,
      `GET /api/core/tasks/{taskId}/records` now returns grouped task-scoped
      record history, `GET /api/core/tasks/{taskId}/timeline` now returns a
      normalized chronological narrative across task, governance, execution,
      workflow, recovery, and operator events, `GET /api/core/operator-inbox`
      now exposes an actionable task list with stable next actions plus latest
      timeline context, while
      `GET /api/core/control-plane/tasks` plus
      `GET /api/core/tasks/{taskId}/control-plane` now expose stable task-
      scoped approval actions, retry/acknowledge actions, workflow
      recommendation summaries, normalized workflow continuation state,
      normalized runtime-delivery intent, family-aware wait state for parent
      tasks with active child work, and operator-attention classification,
      without forcing later consumers to parse opaque task metadata blobs or
      re-filter the full core snapshot client-side, and those non-UI list
      routes now also support additive query filters plus summary counts,
      including delivery-aware plus workflow-stage/workflow-shape-aware list
      filtering, so later operator automation can page/facet control-plane,
      inbox, and recovery surfaces without rebuilding the read model outside
      `cats`, and the recovery read model itself now lifts delivery/workflow
      context into a first-class inspectable contract instead of forcing later
      consumers to re-read raw task metadata, while control-plane/inbox
      summaries now also expose delivery/workflow facet counts for queueing and operator
      automation, and task inspection/control-plane payloads now also lift the
      latest normalized timeline item so operator consumers can read current
      context without issuing a second timeline join, while control-plane and
      inbox list routes now also support `latestTimelineCategory` /
      `latestTimelineKind` filters plus `latestTimelineCategoryCounts` /
      `latestTimelineKindCounts` for queue faceting by the newest normalized
      narrative signal, and those same list routes now also expose
      family-aware filters plus child-activity
      summary counts so queue automation can target parent/child work without
      rebuilding the task graph outside `cats`, while the recovery read model
      now also carries the same family topology plus family-aware filters,
      child-activity summary counts, and workflow-shape faceting so
      replay/retry automation does not need a separate task-detail join to
      scope parent/child recovery work, while workflow-continuation replay
      now also carries a normalized continuation `blockedReason` into recovery
      plus control-plane payloads so operator automation can distinguish which
      guard persisted a retryable replay snapshot without scraping raw
      checkpoint metadata, while recovery, control-plane, and operator-inbox
      list routes now also support `workflowContinuationBlockedReason`
      filtering plus `workflowContinuationBlockedReasonCounts` so queue
      automation can facet retryable continuation work by that persisted guard
      reason, while control-plane and operator-inbox workflow-continuation
      views now also propagate a resolved `convergeTargetId` for single-target
      review stages and support `workflowReviewRequired` plus
      `workflowConvergeTargetId` filters for reviewer-targeted queue faceting,
      while recovery, control-plane, and operator-inbox list routes now also
      support `workflowContinuationSource` plus
      `workflowContinuationSourceCounts` so queue automation can distinguish
      explicit-mention continuations from workflow-recommendation replays,
      while control-plane and operator-inbox list routes now also support
      `latestReplaySource`, `latestReplayTrigger`, `latestReplayPhase`, and
      `latestReplayResumeReason` and summarize
      `latestReplaySourceCounts` / `latestReplayTriggerCounts` /
      `latestReplayPhaseCounts` / `latestReplayResumeReasonCounts` so
      operator queues can facet replay lifecycle state without detouring
      through the dedicated recovery route,
      while control-plane and operator-inbox payloads now also lift normalized
      `planning` plus `runtimeBridge` views and support
      `executionProduct` / `requestedStrategy` filters plus summary counts, so
      bridge-aware queue automation can inspect cross-product handoff intent
      without reopening task detail first,
      while recovery, control-plane, and operator-inbox list routes now also
      support `workflowUnresolvedTarget` plus
      `hasUnresolvedWorkflowTargets` and summarize
      `withUnresolvedWorkflowTargetsCount` for missing-target queue faceting,
      while the recovery context now also carries those same reviewer-targeted
      fields and accepts the same filters for retry/resume faceting,
      and the
      task-timeline route now also supports server-side narrative filters plus
      a lightweight query summary so operator tooling can slice one task's
      chronology without hydrating the full unfiltered timeline first.
- [ ] Consume future runtime MCP mutation tools and richer transport options as
      additive orchestrator capabilities while keeping direct product APIs as
      the primary boundary
- [ ] Turn the current delivery-policy and budget-policy skeletons into
      executable product flows, including override lifecycle, downgrade or
      reroute policy, and later Cats Work war-room aggregates
- [ ] Deepen room-workflow semantics beyond the current summary contract,
      especially richer checkpoint recommendations, converge policy, and
      longer-running branch continuation behavior
      Progress: direct `ChatStore`-backed routing paths now persist in-flight
      room-workflow snapshots before the full route completes, so partial
      branch and continuation status no longer waits on the terminal write,
      and structured `workflowRecommendation` payloads can now normalize into
      product-owned checkpoint metadata that drives sequential or parallel
      continuation plus single-target converge review when no explicit
      `@mention` handoff is present.
- [ ] Finish companion product surfaces above the current data/runtime seams,
      especially composer avatar inspect flows, companion preset inspection or
      editing boundaries, companion memory/debug inspector panels, and clearer
      visibility into the active companion/session context without regressing
      `My Cats` direct-lane semantics
- [x] Ship the Telegram Boss Cat inbox MVP with polling-first setup, durable
      room routing, outbound replies, and token-uniqueness safeguards
- [ ] Extend external orchestrator entrypoints beyond Telegram MVP, including
      LINE, richer escalation, and takeover support
- [ ] Evolve the current local lexical/hybrid memory retrieval seam into a
      stronger archive/vector-backed retrieval pipeline without making `cats`
      depend on `personal-rag-system`
- [ ] Broaden behavior-regression coverage for the now-modular Chat runtime,
      operator, transport, and setup flows so test depth catches product
      regressions in addition to architecture drift
- [ ] Reduce redundant `Cats Core` reads during task-aware session wake and
      checkout flows by threading an already-loaded core snapshot through the
      Chat runtime-session bridge where correctness allows
      Progress: routed wake paths now precompute one task-execution context and
      reuse it across runtime session creation plus auto-checkout, so the same
      room dispatch no longer re-reads `Cats Core` just to rebuild identical
      execution metadata before checkout, and stale-session wake retries now
      also carry the already-resolved task execution context instead of
      rereading `Cats Core` on each retry branch. Dispatch execution now also
      receives the checked-out task core snapshot from wake preparation, so the
      prompt builder no longer rereads `Cats Core` immediately after checkout
      for the same turn.
- [ ] Revisit a limited Chat mobile companion only after the desktop Chat
      surface is stable

### Phase 5: Cats Work Launch Track

- [x] Add a first work dashboard, inbox, approvals, recovery, and task-detail
      view above `Cats Core v1`
- [x] Add project and work-item navigation that reuses shared conversations,
      actors/resources, and artifact metadata
- [x] Add a first code dashboard that reuses shared tasks plus build/preview
      artifact output instead of a separate code schema
- [ ] Separate managed work, agent missions, runtime runs, and schedules
      across Work and Code so operational planning objects stay durable while
      execution attempts remain inspectable, retryable, and transport-agnostic
- [ ] Project conversational and operational agents consistently across Chat,
      Work, and Code so OpenClaw-style worker agents are managed from Work
      while direct-lane and companion cats remain chat-first surfaces
- [ ] Ship `MY CATS` as one platform-level agent home with
      `Overview / Chat / Work / Code` lenses while product surfaces render
      contextual subsets from the same registry instead of separate cat lists
- [ ] Introduce first-class `Cats Code` execution profiles for `cwd`,
      worktree, permissions, and tool/skill/memory bindings on top of the
      shared agent, mission, and transport contracts
- [ ] Add `+New code`, `+Team code`, and `+Peer code` presets as product-owned
      surfaces over the shared conversation/container engine, including
      convergence policy, automated review-share loops, and role/workflow
      templates such as single-coder, team PDCA, and peer review modes
- [x] Finish the first `+New code` renderer-ownership cleanup after the landed
      draft-shell slices, including regrouping the flat
      `WorkspaceNewChatDraftCopy` contract by concern, extracting one shared
      execution-target summary/label helper for header and side-panel surfaces,
      and consolidating the growing draft extension props into a more
      structured slot namespace before more Code-only seams are added
      Progress: per-branch draft callbacks are now grouped under the shared
      `parallelBranchActions` namespace instead of continuing to expand the
      flat `NewChatDraftProps` surface, and `WorkspaceNewChatDraftCopy` is
      grouped by composer / side panel / participants / execution / folder
      concerns instead of one flat copy object. Execution-target label/summary
      and `ProviderModelFields` selection-to-target mapping now route through
      the shared renderer `ExecutionTarget` helper instead of being reimplemented
      across draft and chat side-panel surfaces. Chat draft header/footer/surface
      presentation slots are grouped under `draftChrome`, so Code and Work no
      longer add new flat chrome props to the shared draft surface. Advanced
      draft add/hint switches are grouped under `builderControls`, keeping
      the shared chat draft prop surface from growing one toggle at a time.
      Composer/folder/side-panel copy and starter-chip behavior are now grouped
      under `draftCopy` and `starterChips`. Builder-control policy is resolved
      through one shared helper across Chat, Work, and Code wrappers.
- [x] Add a product-owned side-panel composition seam for Code drafts together
      with render-level coverage for empty participant states, section-open
      behavior, and later execution-profile sections, so `+New code` does not
      remain blocked on internal shared-draft state or brittle static-markup
      assertions
      Progress: Chat draft side-panel mechanics now accept caller-owned copy for
      panel title, participant/execution/workspace section titles, and empty
      states. Code group/parallel drafts feed the same Code copy through that
      seam instead of inheriting Chat setup labels. Shared `ChatNewChatDraft`
      now also exposes a product-owned side-panel composition namespace with a
      section-builder seam, and Code drafts wrap the shared default builder with
      their own empty-state/title contract so future execution-profile sections
      can be inserted without editing shared Chat draft internals. Section-open
      behavior now has a pure coverage seam for the folder-browse side effect,
      including the branch-card `skipSectionAction` path. Code drafts now pass
      runtime session policy context through that builder seam and insert a
      Code-owned `Session Profile` side-panel section ahead of the workspace
      browser, with render coverage for the policy summary and permission mode.
- [x] Move `+Team code` and `+Peer code` off the current shared chat-draft
      fallback onto product-owned draft surfaces above the same shared
      primitives, so Code group/parallel entry no longer inherits chat-specific
      setup copy or side-panel framing while still reusing the shared draft
      mechanics
      Progress: Code now resolves a product-owned draft surface kind before
      rendering shared primitives, with explicit direct-lane / default / team /
      peer components and coverage proving `+Team code` and `+Peer code` no
      longer rely on an implicit shared-chat fallback dispatch.
- [x] Retire the temporary raw-HTTP `originSurface` compatibility seam once
      legacy callers have been updated, so channel and parallel-group create
      paths fail fast on missing product ownership instead of defaulting to
      `chat` beyond the rollout window
      Completed: raw `POST /api/channels` and `POST /api/concurrent-groups`
      create requests now reject missing `originSurface` with
      `origin_surface_required` instead of recording a fallback/defaulting to
      `chat`; product integration and API docs now describe the required raw
      create ownership field.
- [x] Harden the internal Chat create/model APIs around `originSurface`
      invariants after the current legacy fixtures are migrated, so typed
      product-owned create paths and lower-level state mutation helpers no
      longer diverge on whether missing ownership metadata is tolerated
      Progress: shared workspace composer-dispatch seam coverage now proves
      Work/Code product-owned draft creates preserve `originSurface` into the
      typed channel-create input, and shared parallel-draft payload helpers now
      cover the same contract for grouped fan-out. State-model characterization
      coverage now also locks the current lower-level behavior (explicit
      surfaces preserved, invalid values rejected, missing ownership rejected);
      the lower-level create helpers now require explicit ownership just like
      the raw HTTP boundary.
- [x] Replace the current stderr-only `originSurface` compatibility warning
      path with a measurable platform logging/telemetry seam, so the team can
      see how often legacy callers still omit ownership metadata and know when
      the compatibility fallback can safely be removed
      Progress: route-support unit coverage now locks explicit / missing /
      invalid origin-surface resolution semantics, and route-level server
      coverage now proves raw create requests reject missing or invalid
      `originSurface` values while explicit non-chat channel/group creates
      persist their owning surface. The compatibility fallback, stderr warning,
      fallback telemetry helper, and `/api/debug/origin-surface-compatibility`
      endpoint have been removed rather than retained as dead rollout overhead.
- [x] Wire cross-surface draft dispatch and warm navigation handoff so that
      flipping `+New chat`'s draft surface (currently chat -> code via the
      seeded Pomodoro helper chip, later more entries) actually creates a
      destination-owned conversation on the target product and lands in its
      active route instead of staying a UI-only preview.
      Completed: `targetSurface` now drives destination-owned conversation
      creation, shared cross-surface route resolution, warm product prefetch,
      and one-shot warm bootstrap across the `React.lazy` product boundary.
      Tracked by
      [ADR-073](./docs/decisions/073-use-target-surface-dispatch-and-warm-cross-surface-handoff.md),
      [SPEC-074](./docs/specs/SPEC-074-cross-surface-draft-dispatch-and-warm-product-handoff.md),
      and
      [PLAN-066](./docs/plans/PLAN-066-cross-surface-draft-dispatch-and-warm-product-handoff-rollout.md).
- [x] Add measurable warm-navigation observability above the current dev-only
      miss warnings, including hit/miss/stale counters and enough route-target
      metadata to judge whether the generic handoff seam is paying for itself
      once more consumers adopt it
      Progress: the shared cross-surface handoff store now exposes inspectable
      stage/hit/miss telemetry counters plus latest route metadata and active
      staged targets, and the renderer now mirrors that per-process snapshot to
      `window.__catsCrossSurfaceNavigationHandoffTelemetry` for browser-side
      inspection. This gives local measurable hit/miss/stale visibility; any
      future product analytics sink can subscribe through the existing observer
      seam without changing the handoff store.
- [ ] Add integration coverage for the warm-navigation seam instead of relying
      only on pure seam tests, specifically `useWorkspaceAppShellRouting`
      mount-time consume + background refresh behavior and the cross-surface
      `useComposerSubmit` dispatch flow (target stamp, prefetch timing, navigate
      gating, and staged-handoff clear behavior)
      Progress: `useWorkspaceAppShellRouting` and the Chat cross-surface submit
      seam now expose pure helper coverage for initial warm-payload consume
      gating, initial mount fetch/error races, background refresh merge rules,
      target-surface dispatch decisions, prefetch-surface resolution,
      product-surface loader handoff, targeted staged-handoff clear semantics,
      and both channel-shaped and parallel-group staged draft handoff payloads;
      full mount/integration coverage still remains.
- [ ] Exercise the generic `sourceSurface` path with at least one non-Chat
      initiator before landing the second consumer, so `work -> code`,
      `code -> work`, or equivalent cross-product dispatch proves the handoff
      bundle and routing seam are truly generic instead of only Chat-shaped
      Progress: cross-surface submit seam coverage now proves staged
      `work -> code` handoff bundles preserve `sourceSurface`; a real
      product-owned non-Chat dispatch consumer still remains to be landed.
- [ ] Reuse the same warm navigation handoff seam for later supported
      cross-surface navigation targets such as existing conversations,
      artifacts, tasks, and runs, instead of letting each deep-link or
      product-to-product jump invent a second continuity stack above routing,
      prefetch, and handoff-state consumption
      Progress: registry and handoff-store seam coverage now prove
      `conversation` targets already route and round-trip through the generic
      warm-navigation stack. Workspace conversation selection now stages
      cross-surface `navigate-conversation` handoffs for existing conversations
      whose stored `originSurface` belongs to another product, prefetching the
      target product before navigation. Artifact, task, and run consumers still
      remain.
- [x] After the first cross-surface draft submit path ships, choose and land
      the first non-draft consumer of the warm navigation seam so the generic
      investment is proven by a real follow-on path rather than remaining
      draft-only in practice; likely candidates are existing-conversation,
      artifact, or task/run deep links
      Completed: existing-conversation selection is now the first non-draft
      consumer of the same cross-surface handoff store.
- [x] Re-enable `Cats Code` recents on top of the same product-scoped
      `originSurface` filter, and only then evaluate whether Chat/Work/Code
      also need an explicit secondary cross-product `All recents` lens instead
      of one global mixed default
      Completed: Chat, Work, and Code sidebars now share the same grouped
      recents builder. Code recents show code-origin channels and compare
      groups, filter out chat-origin entries, and wire compare group
      rename/ungroup/delete actions through the workspace shell.
- [x] Keep work surfaces product-owned and avoid leaking provider or runtime
      internals into the UI model
      Completed: Work execution surfaces now route runtime bridge product,
      strategy, delivery mode, delivery actions, and correlation labels through
      a Work-owned presentation helper before rendering War Room, task detail,
      task list, intake plan review, and work-item detail UI. The remaining
      Work renderer provider/model references are explicit provider selection
      controls, not hidden runtime bridge presentation.
- [ ] Move product-scoped conversation-behavior preferences off the temporary
      `chat.conversationBehavior.{work,code}` seam and shared
      `PATCH /api/preferences` route onto Work- and Code-owned state slices
      plus product delegates, so surface behavior settings stop piggybacking
      on Chat contracts once those products have stable preference boundaries
      Progress: Settings now calls Chat-, Work-, and Code-owned renderer
      delegates for conversation behavior updates. Those delegates still use
      the shared `/api/preferences` backing route until product-owned state
      slices and server delegates land.
- [x] Extend task-strategy handoff beyond the current Chat-first
      `product: 'chat'` call sites so `Cats Work` and `Cats Code` resolve
      product defaults and runtime bridge inputs through their own
      product-owned adapters
      Completed: task runtime bridge resolution now supports a fallback product
      that does not override planning handoff metadata. Chat runtime session
      task checkout uses `fallbackProduct: 'chat'`, so Work/Code planning
      handoffs keep their product defaults instead of being forced back to
      Chat strategy semantics. Chat, Work, and Code now also expose
      product-owned task runtime request adapters; Chat and Code runtime call
      sites consume those adapters, while Work has the same adapter seam ready
      for its first owned runtime entry.

### Near-Term Migration Focus

- [x] Finish the first high-risk chat-core migration wave by moving
      sequential dispatch, continuation replay, and startup recovery fully onto
      the canonical interaction writer/reader path rather than dual-writing
      around legacy workflow assumptions
- [x] Carry stable `laneId` / `participantId` identity through concurrent
      stream delivery, replay, retry, and repair paths so same-name speakers,
      reassigned sessions, and repaired system messages no longer rely on
      best-effort name matching
- [x] Replace the remaining single-target SSE attach assumptions with true
      lane-aware multiplex delivery, including attach lifecycle, session-close
      recovery, and late-attach bootstrap for concurrent group turns
- [x] Promote canonical transport/session history into the default source for
      direct-lane and external-entrypoint recovery so Telegram/bot ingress can
      recover independently of transient transcript/workflow state
- [x] Run the first user-facing smoke checkpoint for the high-risk migration
      wave, covering sequential frontier propagation, startup recovery,
      concurrent attach ordering, and transport-bound reconnect behavior before
      the old workflow path is retired

### Exploratory: Paperclip-Informed Control Plane Evolution (Pending Review)

- [ ] Add company, goal, project, and work-item objects above chat channels
- [ ] Add operator inbox, approval, activity, and cost surfaces
- [ ] Add explicit project roots, execution roots, and output models
- [ ] Keep extension and plugin seams outside the core control-plane rewrite

## Future Considerations

- Thin Electron host that manages local `cats` and `cats-runtime` services
- Shared desktop host that can open both `Cats Chat` and `Cats Work`
- Release-grade desktop packaging, update signing, and installer recovery
  discipline across Windows/macOS/Linux
- Richer memory retrieval loops through structured owner profile plus archive RAG
- Optional Chat mobile companion after the shared desktop platform stabilizes
- Product rename or repo split once the public open-source topology is ready
- Reusable company templates only after the core Chat/Work model is stable

---

*Last updated: 2026-04-21*
