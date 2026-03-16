# Roadmap

> Long-term product milestones for `cats-inc`.

## Vision

Build the cats suite around a shared `Cats Core v1` foundation, with
`Cats Chat` and `Cats Work` as separate product surfaces above
`cats-runtime`. The current `cats-inc` codebase still starts from a
Node.js/TypeScript chat shell, but the roadmap now assumes parallel product
tracks that reuse the same actors, conversations, approvals, and owner-memory
contracts.

## Milestones

### Phase 1: Foundation

- [x] Bootstrap the subproject and align docs
- [x] Establish `cats-runtime` as the runtime boundary
- [x] Ship a minimal HTTP app shell and health surface
- [x] Choose `React/Vite` as the initial renderer approach

### Phase 2: Workspace Core

- [x] Multi-channel workspace shell
- [x] Initial file-backed workspace state
- [x] Local channel creation flow
- [x] Channel creation flow with team/runtime setup
- [x] Global orchestrator surface
- [x] Basic `@mention` routing and participant management
- [x] Transcript persistence with export designed for later ingestion

### Phase 3: Suite Foundation

- [ ] Freeze `Cats Core v1` shared contracts for identity, actors/resources,
      permissions, conversations, bot bindings, tasks/approvals, owner profile,
      and archive metadata
- [ ] Define how `cats-inc` hosts or exposes shared `Cats Core v1` services for
      both `Cats Chat` and `Cats Work`
- [ ] Define the split between `cats-runtime` direct product APIs and the
      planned MCP facade for orchestrator tool use
- [ ] Introduce a storage abstraction so the current file-backed shell can grow
      into operational DB plus archive/RAG pipelines without a flag-day rewrite
- [ ] Keep the current chat shell loadable while the shared contracts land

### Phase 4: Cats Chat Launch Track

- [ ] Offline transcript normalization and ingestion handoff hooks
- [ ] Split-view workspace canvas for chat plus preview and debug surfaces
- [ ] Operator-grade activity indicators, streaming updates, and richer channel lifecycle state
- [ ] Desktop host and tray lifecycle management above the existing Node server boundary
- [ ] Interactive delegation, owner approval loops, and "Know Your Boss"
      profile injection before dispatch
- [ ] Telegram, LINE, and alternate orchestrator entrypoints with escalation
      and takeover support

### Phase 5: Cats Work Launch Track

- [ ] Add work dashboard, inbox, approvals, and activity views above
      `Cats Core v1`
- [ ] Add project and work-item navigation that reuses shared conversations,
      actors/resources, and artifact metadata
- [ ] Keep work surfaces product-owned and avoid leaking provider or runtime
      internals into the UI model

### Exploratory: Paperclip-Informed Control Plane Evolution (Pending Review)

- [ ] Add company, goal, project, and work-item objects above chat channels
- [ ] Add operator inbox, approval, activity, and cost surfaces
- [ ] Add explicit project workspace, execution workspace, and output models
- [ ] Keep extension and plugin seams outside the core control-plane rewrite

## Future Considerations

- Thin Electron host that manages local `cats-inc` and `cats-runtime` services
- Shared desktop host that can open both `Cats Chat` and `Cats Work`
- Richer memory retrieval loops through structured owner profile plus archive RAG
- Mobile wrappers or dedicated mobile shells after the shared product contracts
  stabilize
- Product rename or repo split once the public open-source topology is ready
- Reusable company templates only after the core Chat/Work model is stable

---

*Last updated: 2026-03-16*
