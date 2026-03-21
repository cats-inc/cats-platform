# PLAN-002: Chat Renderer Shell

## Scope

Deliver the first renderer-backed Phase 2 slice without introducing Electron.

## Tasks

1. Add React/Vite dependencies and split server/web TypeScript configs.
2. Move shared app-shell types into a shared module.
3. Build a chat renderer around `/api/app-shell`.
4. Serve built static assets from the Node server.
5. Update docs and decision records.

## Validation

- Typecheck both server and renderer configs
- Run server smoke tests
- Build the renderer successfully

## Risks

- Local dependency installation is required before full validation
- UI shell is still static until persistence lands
- Desktop host design is deferred, not eliminated

---

*Last updated: 2026-03-11*


