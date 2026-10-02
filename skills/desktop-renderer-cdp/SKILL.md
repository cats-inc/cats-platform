---
name: desktop-renderer-cdp
description: Inspect the real Cats Desktop (Electron) renderer of the installed app through the Chrome DevTools Protocol — screenshot, page text, and JavaScript evaluation in the logged-in window with its desktop bridge. Use when a browser tab on the sidecar URL is not faithful enough (separate login, no desktop bridge, different viewport) and native window chrome is not what you need to see.
---

# Desktop Renderer CDP

Relaunch the installed Cats Desktop app with a loopback remote-debugging port, then
read its main window through CDP. This sees what the Electron renderer actually
renders: the user's logged-in session, `window.catsDesktopHost`, and the window's
real viewport. Run commands from the `cats-platform` checkout root.

## Pick the right surface

- **Browser tab on `http://127.0.0.1:8181`** — same server state, but a separate
  cookie session (login required), no desktop bridge, and a browser-sized viewport.
  Desktop-only settings and setup steps render differently there.
- **This skill** — the real renderer, readable as DOM. It does not see the native
  title bar, menus, tray, OS dialogs, or the `data:` bootstrap page shown before
  the app URL loads.
- **`desktop-ui-automation`** — native window chrome, tray and OS dialogs, via
  screenshots and accessibility. Use it for anything outside the web contents.
- **Isolated candidate control** (`npm run desktop:candidate`) — a private,
  source-built candidate with its own storage. Use it when verification needs
  writes; this skill runs against the user's real profile.

## Enable (macOS)

Restarting stops the app-managed runtime and sidecar, so in-flight runs end, and
while the port is open any local process can drive the logged-in renderer and its
desktop bridge. Tell the user both and get a yes before the first restart.

```sh
./scripts/macos/restart-desktop-with-cdp.sh            # port 9222
./scripts/macos/restart-desktop-with-cdp.sh --port 9333
```

The helper asks the app to quit through its normal path (never kills it), refuses
when the managed runtime has child processes unless `--force`, refuses an occupied
port, then waits for an Electron CDP endpoint on `127.0.0.1`. Do not pass
`--remote-debugging-address`; the default loopback bind is intended.

Windows and Linux have no helper yet. The flag is a standard Chromium switch, but
launching the app executable with it there is not validated by this repo.

## Inspect

```sh
node scripts/testing/desktop-renderer-cdp.mjs info        # url, title, bridge, viewport
node scripts/testing/desktop-renderer-cdp.mjs screenshot  # prints a private temp PNG path
node scripts/testing/desktop-renderer-cdp.mjs text
node scripts/testing/desktop-renderer-cdp.mjs eval "location.pathname"
node scripts/testing/desktop-renderer-cdp.mjs targets
```

`--port` (or `CATS_DESKTOP_CDP_PORT`) selects the port and `--target <text>` a page
whose URL contains the text. Confirm `info` reports `desktopBridge: true` before
claiming a result reflects the desktop renderer. Read the screenshot image to
view it; it is the viewport at device pixel ratio, not the window frame.

## Rules

- Stay read-only by default: screenshots, text and DOM queries. Clicking or
  navigating through `eval` is for actions the user asked for. The State Hygiene
  Policy in `AGENTS.md` applies: no demo, smoke or verification records.
- Never read or print `document.cookie`, Web Storage, IndexedDB, tokens, or use
  `Network.getAllCookies`. The renderer holds the user's session.
- Keep screenshots and page text as private evidence outside Git; share only what
  the task needs.
- A screenshot of a window hidden to the tray is not validated; if it times out,
  ask the user to show the window rather than driving it with native input.

## Finish

Return the app to normal unless the user wants to keep inspecting:

```sh
./scripts/macos/restart-desktop-with-cdp.sh --disable
```

Electron's own relaunch, for example after a self-update, keeps the debugging flag.
Report whether the port is still open when you stop.
