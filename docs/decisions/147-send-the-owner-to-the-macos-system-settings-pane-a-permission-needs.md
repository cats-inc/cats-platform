# ADR-147: Send the Owner to the macOS System Settings Pane a Permission Needs

## Status

Accepted — 2026-11-11, by the owner ("好，先從Desktop做，做完移植到Bot後cnr"), after a
survey of how Cats and Cats Bot handle macOS permissions. Amends
[SPEC-084](../specs/SPEC-084-composer-voice-input-via-platform-native-stt.md)
Requirement 13, [SPEC-079](../specs/SPEC-079-region-screenshot-composer-attachments.md)
Requirement 17 and [SPEC-136](../specs/SPEC-136-desktop-first-run-wizard.md) FR-31.
Cats Bot follows the same decision.

## Context

On macOS, dictation needs Microphone and Speech Recognition, region screenshots need
Screen Recording, and start at login can need the owner's approval in Login Items. Each
is a different System Settings pane. Before this record:

- A denied permission was a three-second toast with no way to the pane.
- A denied Speech Recognition was reported as a denied microphone, so the owner went to
  the wrong pane.
- The Screen Recording message said "System Settings" without naming the pane. Desktop
  refuses a capture while the status is `not-determined`
  ([PLAN-071](../plans/PLAN-071-region-screenshot-composer-rollout.md), 2026-04-28),
  so Cats never asked and was not listed there: the owner had to find the app with "+".
- macOS 13+ registers the login item through `SMAppService`. When it reports
  `requires-approval`, the "Start Cats when I sign in" checkbox showed on although Cats
  would not start.

Desktop control (SPEC-133) has no macOS helper yet, so Accessibility is not needed yet. The
macOS helper adds that pane when it is built.

## Decision

1. **The host opens a named pane, never a URL from the page.** The renderer asks for one
   of `microphone`, `speech_recognition`, `screen_recording` and `login_items`. The host
   maps the name to a constant `x-apple.systempreferences:` URL and opens it through its
   own IPC handler, which accepts only the main window. The general external-open path
   is not widened to that scheme. The preload exposes the action only on macOS
   (`systemSettingsAvailable`), and the renderer offers it only where the bridge says so.
   All four URLs were checked on macOS 27.2.
2. **A missing permission is a toast with "Open System Settings".** A toast with an action
   stays until it is used or dismissed, and the same message is not stacked twice. The message still names the pane, because
   opening it can fail and the action exists only on macOS.
3. **Speech Recognition is its own reason.** The macOS helper emits
   `speech_permission_denied` when Speech Recognition is denied or restricted.
   `permission_denied` keeps meaning the microphone, on macOS and Windows.
4. **Cats asks for Screen Recording once.** While Screen Recording is not granted, the host
   runs the speech helper it already ships with `--request-screen-capture`, which calls
   `CGRequestScreenCaptureAccess`. This happens once per run. Any refusal asks, because
   Electron reports an app macOS has never asked as `denied`: `CGPreflightScreenCaptureAccess`
   is a yes or no, so `not-determined` never appears for the screen (checked with Electron
   41.2.0 on macOS 27.2). Once macOS has an answer the request shows nothing. The call lists Cats in Screen
   & System Audio Recording and may show the system prompt. It never grants access by
   itself: macOS applies the grant after a restart. The capture is therefore still refused,
   with the action, as PLAN-071 decided. Without a helper the request is skipped. The
   result is recorded in the bounded host log.
5. **The login item's approval is checked where it is set.** On a packaged macOS app,
   Settings > Desktop reads `app.getLoginItemSettings().status`. When the owner turns
   start at login on, or opens the page with it on, a `requires-approval` status is a toast
   that opens Login Items.

## Consequences

- The owner reaches the right pane in one click, and a denied Speech Recognition no
  longer sends them to the microphone.
- On a first screenshot, Cats appears in Screen & System Audio Recording, so the owner
  only has to switch it on and restart.
- Attributing the helper's request to Cats.app rather than to the helper is still
  unverified, as for its microphone request
  ([setup guide](../setup-guide.md)). It needs a signed build and a real prompt; until
  then the toast and the named pane remain the recovery.
- The toast component gains an optional action. Toasts without one keep their
  three-second behaviour.
- Windows keeps its plain messages; its Settings deep links (`ms-settings:`) can follow
  the same pattern later.

## Alternatives Considered

- **Let the page open any `x-apple.systempreferences:` URL.** Rejected: the host would
  open whatever a compromised page asked for.
- **Capture anyway while `not-determined`.** Rejected again: `desktopCapturer` does not
  reliably trigger the prompt and produced degraded screenshots (PLAN-071).
- **Add an FFI library to Desktop for `CGRequestScreenCaptureAccess`.** Rejected: the
  speech helper is already built, signed and shipped on macOS, so a second mode costs
  no new packaging.
- **Show the login-item state inline under the checkbox.** Rejected by the Settings rule
  that only toasts give feedback (`AGENTS.md`, Settings UI Conventions).
