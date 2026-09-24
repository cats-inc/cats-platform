<#
.SYNOPSIS
    Provides scoped Windows UI Automation text, capture and keyboard helpers.
.DESCRIPTION
    Dot-source in an authorized interactive Windows PowerShell session. These functions
    do not launch apps, grant access, or bypass desktop isolation. Resolve one target,
    focus it explicitly, inspect a snapshot, then use state-checked keyboard actions.
    Text/input require exactly one visible, keyboard-focusable TextPattern surface.
    Split panes are rejected. Use -ImageOnly for visual capture without TextPattern.
    Save snapshots outside Git; they can contain private screen and terminal content.
.EXAMPLE
    . ./WindowsUi.ps1
    $target = Get-WindowsUiTarget -Title 'Evidence terminal' -ProcessName WindowsTerminal
    Set-WindowsUiFocus $target
    Save-WindowsUiSnapshot $target -OutputPrefix 'C:\private-evidence\before'
#>

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

if (-not ('CatsSkillWindowsInput' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CatsSkillWindowsInput {
    [StructLayout(LayoutKind.Sequential)] public struct MouseInput {
        public int x, y;
        public uint data, flags, time;
        public UIntPtr extra;
    }
    [StructLayout(LayoutKind.Sequential)] public struct KeyInput {
        public ushort key, scan;
        public uint flags, time;
        public UIntPtr extra;
    }
    [StructLayout(LayoutKind.Explicit)] public struct InputUnion {
        [FieldOffset(0)] public MouseInput mouse;
        [FieldOffset(0)] public KeyInput keyboard;
    }
    [StructLayout(LayoutKind.Sequential)] public struct Input {
        public uint type;
        public InputUnion data;
    }
    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint SendInput(uint count, Input[] events, int size);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
    public static void Key(ushort key, bool control) {
        foreach (int modifier in new int[] { 0x10, 0x11, 0x12, 0x5B, 0x5C, key }) {
            if ((GetAsyncKeyState(modifier) & 0x8000) != 0)
                throw new InvalidOperationException("A modifier is already held; no input was sent.");
        }
        Input[] events = new Input[control ? 4 : 2];
        int i = 0;
        if (control) { events[i].type = 1; events[i++].data.keyboard.key = 0x11; }
        events[i].type = 1; events[i++].data.keyboard.key = key;
        events[i].type = 1; events[i].data.keyboard.key = key;
        events[i++].data.keyboard.flags = 2;
        if (control) {
            events[i].type = 1; events[i].data.keyboard.key = 0x11;
            events[i].data.keyboard.flags = 2;
        }
        int size = Marshal.SizeOf(typeof(Input));
        uint inserted = SendInput((uint)events.Length, events, size);
        if (inserted != events.Length) {
            // Release only keys this call may have pressed; never replay the shortcut.
            if (inserted > 0) {
                bool keyStillDown = control ? inserted == 2 : inserted == 1;
                Input[] release = new Input[(keyStillDown ? 1 : 0) + (control ? 1 : 0)];
                int r = 0;
                if (keyStillDown) {
                    release[r].type = 1;
                    release[r].data.keyboard.key = key;
                    release[r++].data.keyboard.flags = 2;
                }
                if (control) {
                    release[r].type = 1;
                    release[r].data.keyboard.key = 0x11;
                    release[r].data.keyboard.flags = 2;
                }
                SendInput((uint)release.Length, release, size); // one best-effort cleanup
            }
            throw new InvalidOperationException("Incomplete keyboard input; re-observe before retrying.");
        }
    }
}
'@
}
[void][CatsSkillWindowsInput]::SetProcessDPIAware()

function Get-WindowsUiTarget {
    param([Parameter(Mandatory)][string]$Title, [Parameter(Mandatory)][string]$ProcessName)
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $windows = $root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        [System.Windows.Automation.Condition]::TrueCondition)
    $matches = @($windows | Where-Object {
        $_.Current.Name -ceq $Title -and
        (Get-Process -Id $_.Current.ProcessId -ErrorAction Stop).ProcessName -eq $ProcessName
    })
    if ($matches.Count -ne 1) { throw "Expected one '$Title' window; found $($matches.Count)." }
    $current = $matches[0].Current
    [pscustomobject]@{
        Title = $Title; ProcessName = $ProcessName
        ProcessId = $current.ProcessId; Handle = $current.NativeWindowHandle
        TextSurfaceId = $null
    }
}

function Get-WindowsUiElement {
    param([Parameter(Mandatory)]$Target)
    $element = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$Target.Handle)
    $current = $element.Current
    if ($current.ProcessId -ne $Target.ProcessId -or $current.Name -cne $Target.Title -or
        (Get-Process -Id $current.ProcessId -ErrorAction Stop).ProcessName -ne $Target.ProcessName) {
        throw 'Window identity changed; resolve and inspect the target again.'
    }
    return $element
}

function Assert-WindowsUiFocus {
    param([Parameter(Mandatory)]$Target)
    $null = Get-WindowsUiElement $Target
    if ([CatsSkillWindowsInput]::GetForegroundWindow().ToInt64() -ne $Target.Handle) {
        throw 'Foreground changed; input stopped. Re-observe before continuing.'
    }
}

function Set-WindowsUiFocus {
    param([Parameter(Mandatory)]$Target)
    $null = Get-WindowsUiElement $Target
    [void][CatsSkillWindowsInput]::SetForegroundWindow([IntPtr]$Target.Handle)
    Start-Sleep -Milliseconds 150
    Assert-WindowsUiFocus $Target
}

function Get-WindowsUiTextSurfaces {
    param([Parameter(Mandatory)]$Target)
    $element = Get-WindowsUiElement $Target
    $nodes = $element.FindAll([System.Windows.Automation.TreeScope]::Descendants,
        (New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::IsTextPatternAvailableProperty, $true)))
    foreach ($node in $nodes) {
        $current = $node.Current
        if (-not $current.IsOffscreen -and $current.IsKeyboardFocusable -and
            $current.BoundingRectangle.Width -gt 0 -and $current.BoundingRectangle.Height -gt 0) {
            $node
        }
    }
}

function Get-WindowsUiText {
    param([Parameter(Mandatory)]$Target)
    $surfaces = @(Get-WindowsUiTextSurfaces $Target)
    if ($surfaces.Count -ne 1) { throw 'Expected one visible input text surface; use visual capture or a single pane.' }
    $surfaceId = $surfaces[0].GetRuntimeId() -join '.'
    if ($Target.TextSurfaceId -and $Target.TextSurfaceId -cne $surfaceId) {
        throw 'Inspected text surface changed; resolve and inspect the target again.'
    }
    $Target.TextSurfaceId = $surfaceId
    $pattern = $surfaces[0].GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    $fragments = @($pattern.GetVisibleRanges() | ForEach-Object { $_.GetText(-1) })
    if ($fragments.Count -eq 0) { throw 'Target exposes no visible TextPattern ranges; use visual capture.' }
    return ($fragments -join "`n")
}

function Get-WindowsUiInputState {
    param([Parameter(Mandatory)]$Target)
    $surfaceIds = @(Get-WindowsUiTextSurfaces $Target | ForEach-Object { $_.GetRuntimeId() -join '.' })
    $focused = [System.Windows.Automation.AutomationElement]::FocusedElement
    $ancestors = @()
    for ($i=0; $i -lt 64 -and $null -ne $focused; $i++) {
        $ancestors += ($focused.GetRuntimeId() -join '.')
        $focused = [System.Windows.Automation.TreeWalker]::RawViewWalker.GetParent($focused)
    }
    [pscustomobject]@{
        SurfaceIds=$surfaceIds; FocusedAncestorIds=$ancestors
        ForegroundHandle=[CatsSkillWindowsInput]::GetForegroundWindow().ToInt64()
    }
}

function Assert-WindowsUiInputState {
    param([Parameter(Mandatory)]$Target, [Parameter(Mandatory)]$State)
    if ($State.ForegroundHandle -ne $Target.Handle) { throw 'Foreground changed; no key was sent.' }
    if (@($State.SurfaceIds).Count -ne 1) { throw 'Multiple or missing input text surfaces; no key was sent.' }
    if (-not $Target.TextSurfaceId -or $State.SurfaceIds[0] -cne $Target.TextSurfaceId) {
        throw 'Inspected text surface changed; no key was sent.'
    }
    if ($State.FocusedAncestorIds -cnotcontains $Target.TextSurfaceId) {
        throw 'Keyboard focus is outside the inspected text surface; no key was sent.'
    }
}

function Save-WindowsUiSnapshot {
    param([Parameter(Mandatory)]$Target, [Parameter(Mandatory)][string]$OutputPrefix, [switch]$ImageOnly)
    Assert-WindowsUiFocus $Target
    $element = Get-WindowsUiElement $Target
    $bounds = $element.Current.BoundingRectangle
    if ($element.Current.IsOffscreen -or $bounds.Width -le 0 -or $bounds.Height -le 0) {
        throw 'Target is offscreen or has no capturable bounds.'
    }
    $text = if ($ImageOnly) { $null } else { Get-WindowsUiText $Target }
    $bitmap = New-Object System.Drawing.Bitmap([int]$bounds.Width, [int]$bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        Assert-WindowsUiFocus $Target
        $graphics.CopyFromScreen([int]$bounds.X, [int]$bounds.Y, 0, 0, $bitmap.Size)
        $bitmap.Save(($OutputPrefix + '.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    if (-not $ImageOnly) { $text | Set-Content -LiteralPath ($OutputPrefix + '.txt') -Encoding UTF8 }
    [pscustomobject]@{ Text = $text; Image = $OutputPrefix + '.png'; Bounds = $bounds.ToString() }
}

function Invoke-WindowsUiKeyInput([uint16]$Code, [bool]$Control) {
    [CatsSkillWindowsInput]::Key($Code, $Control)
}

function Send-WindowsUiKey {
    param(
        [Parameter(Mandatory)]$Target,
        [Parameter(Mandatory)][ValidateSet('Enter','Escape','Up','Down','Left','Right','CtrlC','CtrlD')]
        [string]$Key,
        [Parameter(Mandatory)][string]$ExpectedText
    )
    Assert-WindowsUiFocus $Target
    if ((Get-WindowsUiText $Target) -notmatch $ExpectedText) {
        throw 'Expected screen was not observed; no key was sent.'
    }
    $codes = @{ Enter=13; Escape=27; Up=38; Down=40; Left=37; Right=39; CtrlC=67; CtrlD=68 }
    Assert-WindowsUiInputState $Target (Get-WindowsUiInputState $Target)
    Invoke-WindowsUiKeyInput -Code ([uint16]$codes[$Key]) -Control ($Key.StartsWith('Ctrl'))
}

function Wait-WindowsUiText {
    param(
        [Parameter(Mandatory)]$Target, [Parameter(Mandatory)][string]$ExpectedText,
        [ValidateRange(100,10000)][int]$TimeoutMilliseconds = 3000
    )
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMilliseconds)
    do {
        Assert-WindowsUiFocus $Target
        $text = Get-WindowsUiText $Target
        if ($text -match $ExpectedText) { return $text }
        Start-Sleep -Milliseconds 120
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Expected screen did not appear within the bounded wait; do not resend the key.'
}
