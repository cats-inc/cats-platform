# Cats Code User App Template

This template is the starting point for Cats Code exports that should become
local user apps in Lobby.

The export package must keep `cats.app.json` at the package root. The template
build script copies `src/renderer` to `dist/renderer`, matching the renderer
entrypoint declared in the manifest.

```bash
npm run build
```
