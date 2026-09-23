# macOS desktop recipe

This is a documented approach, not a claim of native macOS validation for this
skill. Confirm the installed OS, tool behavior and permissions on the target Mac.
AppleScript/System Events and native accessibility APIs are OS capabilities;
an extra click utility is optional.

## Readiness and permissions

```sh
sw_vers
uname -m
id -u
command -v osascript screencapture
```

The executor must reach the logged-in user's graphical session. SSH access or
a working shell alone does not establish that. In System Settings > Privacy &
Security, the actual responsible application/helper may need **Accessibility**
for UI control, **Automation** for Apple events, and **Screen & System Audio
Recording** for screenshots. The responsible app might be the terminal or IDE
hosting the executor; use the identity shown by macOS, not an assumed app name.
Ask the user to grant a missing permission through the system UI when needed.
Do not modify the TCC database or disable protections. Root does not replace
these grants.

An initial process listing is read-only, though it can cause a permission prompt:

```sh
osascript <<'APPLESCRIPT'
tell application "System Events"
  get {name, unix id} of every application process whose background only is false
end tell
APPLESCRIPT
```

If this is denied, record the error and needed permission before any retry.
Do not misclassify denied accessibility as the target app being absent.

## Observe and act

Capture only after permission and task scope allow it, then inspect the image:

```sh
umask 077
ui_evidence=$(mktemp -d "${TMPDIR:-/tmp}/cats-ui.XXXXXX")
screencapture -x "$ui_evidence/before.png"
```

For accessibility inspection, resolve the exact observed PID and query that
System Events `application process` for its windows, menu bars and controls.
Prefer a unique semantic control with a current role/name over a fixed index
such as `button 1 of window 1`. Check enabled state and account for localization,
custom-rendered controls and native dialogs in a separate process.

System Events can set the selected process's `frontmost` property and `click`
an identified button/menu item. Accessibility clients can invoke the equivalent
AX action. Keyboard `keystroke`/`key code` commands target current focus, so verify
the intended app and field before sending them. Pass variable text as script
arguments or other structured data rather than interpolating it into AppleScript
source. Reinspect after each action because menu/window references can go stale.

For controls not exposed through accessibility, use an available native
CGEvent-based input helper and screenshots. Extra wrappers are optional and must
be checked for availability; do not assume Homebrew, Python, `cliclick` or an AI
desktop application is installed. Calibrate Retina screenshot pixels against
logical display coordinates and each monitor's origin before coordinate input.

If authentication, login or permission consent appears, let the user complete it
locally and suspend synthetic input. A screenshot returning black/empty content,
or a script returning without moving the expected UI, is not a successful action.
Keep GUI readiness separate from successful programmatic app scripting.

## Sources

Reviewed 2026-09-24; the archived scripting guide's old settings navigation should
not override the current System Settings UI.

- [Apple UI scripting guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/AutomatetheUserInterface.html)
- [Accessibility permission](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac)
- [Screen capture permission](https://support.apple.com/guide/mac-help/control-access-screen-system-audio-recording-mchld6aa7d23/mac)
- Use local `man osascript` and `man screencapture` for installed command options.
