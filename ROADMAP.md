# Roadmap

> Long-term product milestones for `cats-inc`.

## Vision

Build the flagship cats product experience as a Node.js/TypeScript workspace
application that sits above `cats-runtime`, absorbs the useful behavior from
`agent-workspace-poc`, and grows into the long-term multi-agent chat and
company-control-plane product shell.

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

### Phase 3: Productization

- [ ] Offline transcript normalization and ingestion handoff hooks
- [ ] Split-view workspace canvas for chat plus preview and debug surfaces
- [ ] Operator-grade activity indicators, streaming updates, and richer channel lifecycle state
- [ ] Desktop host and tray lifecycle management above the existing Node server boundary
- [ ] Telegram and alternate orchestrator entrypoints

### Phase 4: Company Control Plane Evolution (Pending Review)

- [ ] Add company, goal, project, and work-item objects above chat channels
- [ ] Add operator inbox, approval, activity, and cost surfaces
- [ ] Add explicit project workspace, execution workspace, and output models
- [ ] Keep extension and plugin seams outside the core control-plane rewrite

## Future Considerations

- Thin Electron host that manages local `cats-inc` and `cats-runtime` services
- Multiple runtime backends behind `cats-runtime`
- Richer memory retrieval loops through MCP and RAG
- Multi-tenant product packaging
- Mobile and desktop product shells sharing the same workspace contract
- Reusable company templates once the control-plane model stabilizes

---

*Last updated: 2026-03-16*
