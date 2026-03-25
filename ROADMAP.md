# Roadmap

> Long-term product milestones for `Cats`.

## Vision

Build the cats suite around a shared `Cats Core v1` foundation, with
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

### Phase 3: Suite Foundation

- [x] Freeze `Cats Core v1` shared contracts for identity, actors/resources,
      permissions, conversations, bot bindings, tasks/approvals, owner profile,
      and archive metadata
- [x] Keep the full desktop suite on one `Electron + React/TypeScript` path
      while `cats` and `cats-runtime` remain Node sidecars
- [x] Define how `cats` hosts or exposes shared `Cats Core v1` services for
      both `Cats Chat` and `Cats Work`
- [x] Define the split between `cats-runtime` direct product APIs and the
      planned MCP facade for orchestrator tool use
- [x] Thin `src/app/server/index.ts` into smaller composition-root factories
      and route-registration modules while keeping one suite-owned server
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
- [x] Finish extracting shared suite shell and design primitives into a
      dedicated `src/design/` layer without pushing Chat-specific visuals into
      shared modules
- [x] Publish a product integration guide that freezes shared contracts,
      clarifies dependency-slice ownership, and defines the suite-host
      registration protocol for parallel Chat/Work/Code delivery

### Phase 4: Cats Chat Launch Track

- [ ] Offline transcript normalization and ingestion handoff hooks
- [ ] Split-view chat canvas with preview and debug surfaces
- [ ] Operator-grade activity indicators, streaming updates, and richer channel lifecycle state
- [ ] Persist solo-composer model changes immediately on selector change instead of
      only committing the pending provider/model when the next message is sent
- [ ] Add a suite-local provider catalog cache for runtime-backed model catalogs and
      advanced catalogs so repeated setup, cat-creation, and selector mounts do not
      refetch the same provider/instance metadata on every reopen
- [ ] Refine advanced provider-model UX now that runtime presets and controls are
      first-class, including an `Advanced settings` disclosure pattern that prevents
      large control sets from overwhelming the base provider/instance/model flow
- [ ] Shift cat UX to a chat-contextual `Add cat` flow while moving registry
      administration into `Settings > Cats`
- [x] Desktop host and tray lifecycle management above the existing Node server boundary
- [x] Stage cross-platform desktop packaging manifests and emit Windows NSIS
      installer artifacts through the host-owned pipeline
- [ ] Turn the current Windows NSIS-first packaging slice into a release-grade
      desktop distribution path, including signed installers, branded assets,
      and a documented release pipeline rather than test-install outputs only
- [ ] Extend the current desktop packaging contract beyond Windows staging so
      macOS and Linux also produce real installer artifacts instead of staged
      manifests only
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
- [ ] Interactive delegation, owner approval loops, and "Know Your Boss"
      profile injection before dispatch
- [x] Follow up the Chat-first task-strategy handoff slice by deduplicating
      shared planning/runtime normalization helpers and keeping additive
      runtime execution payload serialization behind one reusable bridge path
- [x] Tighten task lifecycle watcher convergence so additive
      `effectiveStrategy` and `strategyState` metadata can settle into UI/read
      models before full runtime stream teardown where observe payloads already
      provide enough signal, without regressing no-planning compatibility paths
- [x] Land product-owned companion boxes, session hydration, and Cats-owned
      canonical memory/retrieval first slices without changing visible Chat UI
- [ ] Extend Cats-owned canonical memory beyond the current cat/owner/channel
      first slice so relationship- and project-scoped durable memory can also
      participate in retrieval and later `Cats Work` flows
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
      and core activity logging for runtime-hook / deferred maintenance are now
      landed; broader downstream consumer contracts still remain.
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
- [ ] Promote the current machine-readable governance/workflow summaries into
      a fuller operator-control-plane contract, including stable approval
      actions, workflow continuation state, and runtime-delivery intent
- [ ] Consume future runtime MCP mutation tools and richer transport options as
      additive orchestrator capabilities while keeping direct product APIs as
      the primary boundary
- [ ] Turn the current delivery-policy and budget-policy skeletons into
      executable product flows, including override lifecycle, downgrade or
      reroute policy, and later Cats Work war-room aggregates
- [ ] Deepen room-workflow semantics beyond the current summary contract,
      especially richer checkpoint recommendations, converge policy, and
      longer-running branch continuation behavior
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
- [ ] Revisit a limited Chat mobile companion only after the desktop Chat
      surface is stable

### Phase 5: Cats Work Launch Track

- [ ] Add work dashboard, inbox, approvals, and activity views above
      `Cats Core v1`
- [ ] Add project and work-item navigation that reuses shared conversations,
      actors/resources, and artifact metadata
- [ ] Keep work surfaces product-owned and avoid leaking provider or runtime
      internals into the UI model
- [ ] Extend task-strategy handoff beyond the current Chat-first
      `product: 'chat'` call sites so `Cats Work` and `Cats Code` resolve
      product defaults and runtime bridge inputs through their own
      product-owned adapters

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
- Optional Chat mobile companion after the shared desktop suite stabilizes
- Product rename or repo split once the public open-source topology is ready
- Reusable company templates only after the core Chat/Work model is stable

---

*Last updated: 2026-03-26*
