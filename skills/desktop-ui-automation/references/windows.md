# Windows desktop recipe

This is a documented approach, not a claim of native Windows validation for this
skill. Windows includes UI Automation and Win32 input APIs; extra tools such as
AutoHotkey or Python wrappers are optional. A PowerShell/C# helper can call the
native APIs, but APIs being present is not proof that a ready CLI wrapper exists.

## Identify the executor and target session

Use native Windows tooling for the Windows desktop. A WSL shell can explicitly
call an available Windows-side helper, but Linux Wayland tools do not thereby
control native Windows windows. Check shell edition and the current session:

```powershell
$PSVersionTable.PSEdition
$uiSessionId = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
[Environment]::UserInteractive
Get-Process | Where-Object {
    $_.SessionId -eq $uiSessionId -and $_.MainWindowHandle -ne 0
} | Select-Object Id, ProcessName, MainWindowTitle, MainWindowHandle
```

Treat `UserInteractive` and window enumeration as hints, not proof that the
desktop is unlocked or can receive input. An agent running as a service, in a
container, or in another RDP/session context may not reach the user's desktop.
Identify the target's real PID, window handle and privilege level. Do not assign
to PowerShell's automatic `$PID` or `$HOME`; use task-specific variable names.

## Prefer UI Automation for exposed controls

With Windows PowerShell/.NET Framework where the assemblies are available, this
read-only query inspects top-level UI elements:

```powershell
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$uiRoot = [System.Windows.Automation.AutomationElement]::RootElement
$uiWindows = $uiRoot.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition
)
foreach ($uiWindow in $uiWindows) {
    $uiCurrent = $uiWindow.Current
    [pscustomobject]@{
        ProcessId = $uiCurrent.ProcessId
        Name = $uiCurrent.Name
        Handle = $uiCurrent.NativeWindowHandle
    }
}
```

If assembly loading fails in a particular `pwsh` host, report that limitation;
use an available native Windows PowerShell helper or COM UI Automation client.
Do not claim every PowerShell edition has identical .NET assembly support.

Scope further queries to the identified target window before traversing its
controls. Inspect `AutomationId`, name, control type, enabled state and supported
patterns; require a unique current match. Use supported patterns such as
`InvokePattern`, `SelectionItemPattern` or `ValuePattern` for authorized actions.
Avoid dumping the full desktop tree, reading password fields, or blindly taking
the first matching button. Reacquire elements after navigation or process restart.
An application may expose only part of its custom/Electron UI to accessibility.

## Visual capture and input fallback

Use an existing screen-capture tool or a small native Windows helper. One option
in a compatible Windows PowerShell host is `System.Windows.Forms.Screen` plus
`System.Drawing.Graphics.CopyFromScreen`; capture the relevant monitor/window
into a private evidence directory and dispose the graphics/bitmap objects.
Confirm a nonblank, current image through the agent's image viewer.

For actual keyboard/pointer input, a helper can P/Invoke `SendInput` from
`user32.dll`. Check the returned inserted-event count. With a C# wrapper, use the
correct `INPUT` union layout and pointer-sized fields for the executing
architecture; a copied 32-bit struct is not a portable 64-bit implementation.
Focus the intended window and verify foreground identity immediately before
input. Map screenshot pixels, DPI scaling, virtual-screen origin (possibly
negative), and SendInput's absolute/virtual-desktop coordinate convention.
Prefer a verified existing helper over rebuilding that mapping casually.

Input injection is restricted by UIPI: an ordinary process cannot inject into
a higher-integrity target. A zero SendInput result does not identify the precise
cause. Do not elevate the whole agent/target as a default workaround. Report
the specific boundary and use only an authorized appropriate helper when needed.
Ordinary input automation cannot operate the UAC secure desktop; let the user
complete that prompt locally. Do not disable UAC or switch desktops to bypass it.

Locked/disconnected sessions can prevent visual capture and real input even when
some UIA queries succeed. Report observation and input readiness separately, and
verify application state after any attempted action instead of trusting an API
return value alone.

## Sources

Reviewed 2026-09-24. Validate examples on the actual Windows host before reporting
native success.

- [Microsoft UI Automation overview](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-overview)
- [UI Automation clients](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-clientsoverview)
- [SendInput and integrity restrictions](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)
- [Mouse input coordinates](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput)
- [CopyFromScreen](https://learn.microsoft.com/en-us/dotnet/api/system.drawing.graphics.copyfromscreen)
