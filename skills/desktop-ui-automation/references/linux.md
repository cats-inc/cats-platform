# Linux desktop recipe

Use only the branch matching the actual graphical session. These commands are
examples to adapt after inspection, not a script to execute in one batch.

## Readiness

```sh
uname -sm
id -u
printf 'session=%s desktop=%s wayland=%s display=%s\n' \
  "${XDG_SESSION_TYPE-}" "${XDG_CURRENT_DESKTOP-}" \
  "${WAYLAND_DISPLAY-}" "${DISPLAY-}"
command -v grim wlrctl wtype xdotool gdbus
```

Inspect the current session's `XDG_RUNTIME_DIR` and D-Bus connectivity as needed.
Do not dump the whole environment or guess another user's socket paths. `DISPLAY`
can be set under Wayland for XWayland; that does not make native Wayland windows
visible to X11 tools. If the executor is sandboxed, use its supported permission
path to access this user's session rather than inventing alternate credentials.

Missing utilities are not proof that an extension or desktop AI app is needed.
Some distributions provide these tools, others require packages. If acquiring a
helper is within the authorized task, use a trusted distribution/upstream source,
match `aarch64`/ARM64 versus x86_64, and record the location. A package extracted
into a task-specific temporary directory may work without system installation;
verify its dependencies, and do not assume an old `/tmp` helper still exists.

## Wayland with supported compositor protocols

On wlroots-based environments such as the tested labwc session, `grim` can
capture the screen, `wlrctl` can inspect/focus windows and drive a virtual pointer,
and `wtype` can send virtual keyboard input. Availability depends on the
compositor's exposed protocols. Do not assume the same commands work on all
GNOME/KDE or locked sessions; use a supported portal/desktop automation tool if
one is available, or report the missing capability.

Start with observation:

```sh
wlrctl toplevel list
umask 077
ui_evidence=$(mktemp -d "${TMPDIR:-/tmp}/cats-ui.XXXXXX")
grim -c "$ui_evidence/before.png"
```

View the actual image through the agent's image-reading capability. Use exact
current matches; combine app ID and title when needed. After setting
`ui_window_title` from that observation:

```sh
wlrctl window focus "title:$ui_window_title"
wlrctl window find "title:$ui_window_title" state:active
```

`wlrctl pointer move DX DY` is **relative**, not an absolute `(x,y)` move.
Compute a displacement from a known cursor position and matching screenshot
coordinates. On a verified single display, moving to the top-left edge and
confirming its position in a cursor-inclusive screenshot can establish an
origin; do not generalize that shortcut to multi-monitor or scaled layouts.
`grim` defaults to the highest output scale; map pixels to compositor coordinates
or choose a consistent capture scale before calculating input.

For a freshly identified, authorized target, the individual action forms are:

```sh
wlrctl pointer move "$ui_dx" "$ui_dy"
wlrctl pointer click
# Alternatively, a keyboard action after verifying focus:
wtype -M ctrl -k r -m ctrl
```

The keyboard example reloads the focused application; use it only when reload is
part of the task and unsaved work is accounted for. Capture again after each
chosen action. `wtype -k Return` does not guarantee a modal's intended button is
focused. Native update dialogs may need their own focus operation.

## Degraded paths observed on 2026-09-26

A sandboxed executor's `grim` fails with `failed to create display` even though
the Wayland socket is listed; use a host-approved executor outside the sandbox
for capture, as with the Windows sandbox lesson in the Windows reference.

When `wlrctl`/`wtype` are not installed there is no Wayland input path. The
degraded option for a TUI target is driving it through a pty with terminal-query
answers: the TUI stalls before rendering unless cursor-position (`ESC[6n`),
kitty-keyboard and device-attributes queries are answered. Screenshots taken
during a pty run then show desktop context only, not picker pixels; picker text
comes from the pty bytes instead of accessibility/UI text. Record that split in
the evidence note and label the transcription accordingly rather than claiming
screenshot-checked visible text.

## X11

If the target is actually an X11/XWayland client and `xdotool` is available,
inspect it using `xdotool search --onlyvisible --pid "$ui_target_pid"` and
`xdotool getwindowname "$ui_window_id"`. Resolve multiple matches explicitly.
Then use `windowactivate --sync`, verify `getactivewindow`, and inspect the
fresh layout before `mousemove --window "$ui_window_id" X Y` and `click 1`.
Use an existing X11-compatible screenshot tool. Do not keep trying `xdotool`
against a native Wayland window absent from the X11 window tree.

## Tray menus through D-Bus

When the app exposes StatusNotifierItem plus `com.canonical.dbusmenu`, a menu
query/action can avoid fragile panel coordinates. `gdbus` or Python with
`gi.repository.Gio` can call the session bus; Python GI is optional, not assumed.

1. Read `RegisteredStatusNotifierItems` on
   `org.kde.StatusNotifierWatcher` at `/StatusNotifierWatcher` via
   `org.freedesktop.DBus.Properties.Get`. The watcher may not exist on this desktop.
2. Resolve the listed service/object path, identify the app through its `Id`
   property on `org.kde.StatusNotifierItem`, and read its `Menu` object-path
   property. An entry without an
   explicit object path conventionally uses `/StatusNotifierItem`.
3. Call `com.canonical.dbusmenu.GetLayout` on that menu path with
   `(0, -1, ["label", "enabled", "visible"])`, signature `(iias)`. Avoid
   `Properties.GetAll` on the tray item: it can return large icon pixel arrays.
4. Locate the exact current label and usable item in the returned tree. Labels
   may be localized and include mnemonic markers; IDs and revisions change.
   If unambiguous and authorized, send `Event(id, "clicked", variant(int32 0),
   uint32 0)`, signature `(isvu)`. With Gio, the inner variant is
   `GLib.Variant('i', 0)`.
5. Verify the resulting window or application state. A bus call returning does
   not establish that an update, quit or navigation completed. Rediscover the
   service and menu after the app restarts.

These are application menu actions, not a way to control a polkit password
dialog. Leave authentication to the user and pause synthetic input meanwhile.

## Provenance and limits

The labwc/Wayland ARM64 capture, focus, pointer, keyboard and Cats tray D-Bus
path was exercised during the Linux Desktop 0.4.2 → 0.4.3 acceptance. That does
not establish X11, GNOME/KDE, multi-monitor or other agents' native support.
Detailed case evidence remains in cats-platform's
`docs/research/2026-09-23-linux-self-update-validation.md`.

Command details were checked against the distribution's `grim(1)`, `wlrctl(1)`
and `wtype(1)` manuals on 2026-09-24. Consult the installed version's help first.
Upstream references: [grim](https://wayland.emersion.fr/grim/),
[wlrctl](https://git.sr.ht/~brocellous/wlrctl),
[wtype](https://github.com/atx/wtype), and
[xdotool manual](https://github.com/jordansissel/xdotool/blob/main/xdotool.pod).
