---
name: desktop-ui-automation
description: Inspect and operate native desktop windows, dialogs, tray menus, and input on Windows, macOS, or Linux when a task needs real UI interaction and the local session supports it. Use for desktop troubleshooting and acceptance checks; ordinary code or API tests alone do not need this skill.
---

# Desktop UI Automation

Use an available local executor and the operating system's UI interfaces to
observe and operate the user's authorized target. A ChatGPT desktop application
or browser extension is not a prerequisite. Shell access alone does not prove
that screen capture, accessibility, or input injection is available.

This is an optional developer workflow, not a requirement to automate every UI
task. It does not install software, grant permissions, or expand the user's task.
Read the owning repository's instructions, including its rules for real user data.

## Establish readiness

1. Identify the actual executor OS, architecture, user and graphical session.
   Distinguish a native desktop from SSH, WSL, a container, or a headless runner.
   Confirm the target executable/process and installed version when relevant.
2. Inventory existing tools; try a read-only window query or an authorized
   screenshot before sending input. A binary on PATH or a display environment
   variable is only a hint. A shell sandbox can hide processes or deny desktop
   sockets even when the user's application is running.
3. Establish **observation** and **control** separately. Use an available
   supported UI tool if the host provides one; otherwise read only the matching
   platform reference below. Prefer accessibility elements or a documented menu
   interface when they identify the target reliably; use visual coordinates when
   those interfaces are insufficient.
4. If a capability is missing, name the missing tool, session connection or OS
   permission. Continue useful read-only work. Use existing authorization and the
   host's execution-permission mechanism; do not repeatedly request permission
   already granted. Tool installation is a separate environment change, not an
   automatic effect of loading this skill. Do not weaken OS protections or run
   the whole target app as root/administrator to make automation work.

| Executor/session | Read when applicable |
| --- | --- |
| Linux Wayland or X11 | [Linux tools, coordinates and tray D-Bus](references/linux.md) |
| Native macOS GUI session | [macOS accessibility, AppleScript and capture](references/macos.md) |
| Native Windows interactive session, including an explicit bridge from WSL | [Windows UI Automation, input and capture](references/windows.md) |

## Observe, act, verify

- Establish the requested outcome before acting. Preserve relevant settings,
  cache and failure evidence before a restart or install when diagnosing an
  existing failure. Use private evidence outside Git for screenshots and logs;
  publish only the necessary sanitized findings.
- Resolve the current target by process plus window/control identity. Titles
  are localized and may be duplicated. Refresh window IDs, accessibility nodes
  and tray menu IDs after navigation or restart; do not reuse another session's
  PID, bus name, coordinates, or machine-specific helper path.
- For pointer/keyboard input, bring the intended window forward, verify focus,
  and inspect a fresh image. Check screen scaling, monitor origin and whether
  the tool expects relative or absolute coordinates. Focus and layout may change
  between actions, especially when a native modal opens behind the main window.
- Make one bounded action, then inspect its visible or independently observable
  result. A successful command exit or accepted `clicked` event does not prove
  the application acted. If Enter does nothing, inspect the focused control;
  do not send repeated Enter/clicks that might reach a later dialog.
- On ambiguous focus, changed layout or a failed attempt, re-observe before any
  retry. If the same readiness/permission failure remains, report it instead of
  retrying blindly or changing desktop security settings.
- When the task reaches a system authentication or security-consent dialog,
  let the user complete it locally; do not ask for passwords in chat, inject
  credentials, or read browser credential/cookie stores as a shortcut. Suspend
  synthetic input while the user interacts. Do not enable remote debugging on
  their existing browser/profile merely to gain UI access.
- For verification, do not create demo chats, tasks or other test records in
  real user state. Use disposable fixtures/profiles when such writes are needed.
  This does not prohibit data changes the user actually requested. A live
  installed-profile acceptance and an isolated fixture test prove different
  things; report which one actually ran.

For update acceptance, a download message, installer launch or old-process exit
is insufficient. Check the installed package/app version, the replacement
process and its own version UI, service health when applicable, and preservation
of the user's relevant settings and menus. Distinguish automatic update success
from manual recovery; do not require publishing a future version just to close
the current acceptance.

## Report and leave a usable desktop

Record the environment, chosen interface, actions, observed outcome and exact
limitations. Distinguish a documented platform recipe from a native test result.
Leave the app in an appropriate normal state; stop only helpers started for this
task. Preserve requested evidence and report temporary tools or pending user
steps. Do not claim that a skill being synchronized means every agent has loaded
it or every machine can execute its UI operations.
