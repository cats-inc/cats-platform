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

Build: `dotnet build -c Release`. Installers publish it self-contained per architecture through
`scripts/build-desktop-installer.mjs`, next to the voice helper.

Native check (Windows only, observe-only): `node native-check/check.mjs` opens two throwaway
windows, checks capture under a covering window, UI reading and exclusions, and closes them.
CI runs on Linux and never starts this helper.
