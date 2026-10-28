# Windows desktop control helper

`cats-desktop-control-windows.exe` is the native executor behind the `cats-desktop` session MCP
([SPEC-133](../../../docs/specs/SPEC-133-desktop-control-session-mcp.md),
[PLAN-126](../../../docs/plans/PLAN-126-desktop-control-session-mcp.md)). The Platform server
starts it and speaks protocol 1 over stdio, one JSON object per line. It runs as the user,
unelevated and per-monitor DPI aware.

Phase A ops only observe: `hello`, `resolve_apps`, `list_windows`, `capture_window` (PrintWindow
with `PW_RENDERFULLCONTENT`, so covering windows never appear), `read_ui` (UI Automation through
its COM client; password values are never read), `open_app`, `state` and `cancel`. The exclusion
lists in `Exclusions.cs` are part of SPEC-133's cross-implementation contract.

Phase B ops send input: `click`, `scroll`, `type`, `key`, `invoke`, `clipboard_read` and
`clipboard_write`. Each re-checks its target first (owner idle for 3 seconds, not observe-only
or elevated, in front, unmoved, uncovered) and `cancel` stops typing between chunks; SPEC-133
"Phase B helper rules" has the details.

Build: `dotnet build -c Release`. Installers publish it self-contained per architecture through
`scripts/build-desktop-installer.mjs`, next to the voice helper.

Native check (Windows only, observe-only): `node native-check/check.mjs` opens two throwaway
windows, checks capture under a covering window, UI reading and exclusions, and closes them.
`node native-check/input-check.mjs` sends real input, but only to its own probe app
(`native-check/probe/`, built on first use), and waits for 5 quiet seconds from the owner before
each action. CI runs on Linux and never starts this helper.
