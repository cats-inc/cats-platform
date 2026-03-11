# Roadmap

> Long-term product milestones for `cats-inc`.

## Vision

Build the flagship cats product experience as a Node.js/TypeScript workspace
application that sits above `cats-runtime`, absorbs the useful behavior from
`agent-workspace-poc`, and grows into the long-term multi-agent chat shell.

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
- [ ] Channel creation flow with team/runtime setup
- [ ] Global orchestrator surface
- [ ] Basic `@mention` routing and participant management
- [ ] Transcript persistence designed for later ingestion

### Phase 3: Productization

- [ ] Transcript export and offline normalization hooks
- [ ] Split-view workspace canvas for chat plus live preview
- [ ] Operator-grade activity indicators and channel state
- [ ] Telegram and alternate orchestrator entrypoints

## Future Considerations

- Thin Electron host once tray/runtime lifecycle needs are concrete
- Multiple runtime backends behind `cats-runtime`
- Richer memory retrieval loops through MCP and RAG
- Multi-tenant product packaging
- Mobile and desktop product shells sharing the same workspace contract

---

*Last updated: 2026-03-11*
