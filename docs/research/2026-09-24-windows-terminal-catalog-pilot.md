# Windows Terminal catalog capture pilot

On 2026-09-24, an operator-authorized pilot combined desktop-ui-automation with Runtime's
provider catalog maintenance. Windows 11, native Windows PowerShell 5.1 and an unlocked RDP
session exposed the dedicated Windows Terminal window through UI Automation.

The [Runtime evidence note](../../../cats-runtime/docs/research/2026-09-24-codex-picker-pilot.md)
owns Codex 0.156.1's seven models, per-model reasoning menus, IDs/defaults, catalog changes and
redacted fixtures. No duplicate model list or production mapping was added to Platform.

## What was demonstrated

- Scoped window screenshots plus visible TextPattern ranges supplied readable TUI evidence without
  OCR or clipboard access. Screenshots were 1129 × 635 window crops on a 2560 × 1306 desktop.
- Arrow/Enter navigation opened model and advanced submenus; documented back/quit keys exited
  without confirming final efforts or sending inference prompts. The selected config hash matched
  before launch and after cleanup. This does not exclude normal CLI session/cache writes.
- A sandbox that could not see/capture windows was distinguished from the working interactive
  desktop. The host-approved executor reached it without elevating the target app to administrator.
- Window identity included exact title, process and handle. The final helper additionally binds
  one visible keyboard-focusable text surface and verifies keyboard focus inside it. Windows
  Terminal's decorative title TextPattern is excluded; split input panes are rejected.
- Cleanup closed only pilot windows after CLI exit. A shared Windows Terminal PID was not killed.

## Helper and validation limits

The canonical [Windows reference](../../skills/desktop-ui-automation/references/windows.md) links
the reusable native helper and six offline guard cases. Codex menu semantics remain in Runtime's
capture helper. A successful native traversal preceded review fixes; revised surface guards then
completed the actual exit sequence. Simulated tests verify rejection behavior separately.
Partial-input key-up cleanup is a reviewed best-effort failure path, not an induced native failure.

The first pilot's 72 stored images included exploration and helper reruns. Routine collection now
prefers text and key-menu screenshots. Neither PNG count nor file size establishes agent token
usage or a percentage of subscription allowance.

No Platform product code, Desktop build or installed model-selector acceptance was changed/run.
Frozen UI fixtures represent their historical inputs and were not refreshed as production data.
Other applications, locked sessions, integrity levels and macOS/Linux require their own validation.
