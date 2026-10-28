<#
.SYNOPSIS
    Provides scoped Windows UI Automation text, capture, keyboard, pointer and clipboard helpers.
.DESCRIPTION
    Dot-source in an authorized interactive Windows PowerShell session. Only
    Start-WindowsUiTerminal launches anything, and only a new, uniquely titled Windows
    Terminal window for a command the operator authorized. The other functions do not
    launch apps. None of them grant access or bypass desktop isolation. Resolve one target, focus it
    explicitly, inspect a snapshot, then use state-checked keyboard, text or pointer actions.
    Text/input require exactly one visible, keyboard-focusable TextPattern surface.
    Split panes are rejected. Use -ImageOnly for visual capture without TextPattern.
    Clicks take pixel coordinates from a fresh snapshot of the same, unmoved window.
    Save snapshots and clipboard text outside Git; they can contain private content.
.EXAMPLE
    . ./WindowsUi.ps1
    $target = Get-WindowsUiTarget -Title 'Evidence terminal' -ProcessName WindowsTerminal
    Set-WindowsUiFocus $target
    Save-WindowsUiSnapshot $target -OutputPrefix 'C:\private-evidence\before'
.EXAMPLE
    $target = Start-WindowsUiTerminal -Title 'Catalog check claude' -WorkingDirectory $repo `
        -CommandLine @('claude', '--safe-mode')
    Send-WindowsUiText $target -Text '/model' -ExpectedText $emptyPromptPattern
    $null = Wait-WindowsUiText $target -ExpectedText $typedCommandPattern
    Send-WindowsUiKey $target -Key Enter -ExpectedText $typedCommandPattern
.EXAMPLE
    $snapshot = Save-WindowsUiSnapshot $target -OutputPrefix 'C:\private-evidence\canvas' -ImageOnly
    Send-WindowsUiClick $target -Snapshot $snapshot -X 412 -Y 88
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
    public static void Unicode(char value) {
        foreach (int modifier in new int[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }) {
            if ((GetAsyncKeyState(modifier) & 0x8000) != 0)
                throw new InvalidOperationException("A modifier is already held; no text was sent.");
        }
        Input[] events = new Input[2];
        events[0].type = 1; events[0].data.keyboard.scan = value; events[0].data.keyboard.flags = 4;
        events[1].type = 1; events[1].data.keyboard.scan = value; events[1].data.keyboard.flags = 6;
        int size = Marshal.SizeOf(typeof(Input));
        uint inserted = SendInput(2, events, size);
        if (inserted != 2) {
            if (inserted == 1) SendInput(1, new Input[] { events[1] }, size); // one best-effort key-up
            throw new InvalidOperationException("Incomplete text input; re-observe before retrying.");
        }
    }
}
'@
}
if (-not ('CatsSkillWindowsPointer' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CatsSkillWindowsPointer {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] public struct MouseInput {
        public int x, y;
        public uint data, flags, time;
        public UIntPtr extra;
    }
    // MOUSEINPUT is the largest INPUT member, so it fixes the native size without a union.
    [StructLayout(LayoutKind.Sequential)] public struct Input {
        public uint type;
        public MouseInput mouse;
    }
    [DllImport("user32.dll", SetLastError=true)]
    static extern uint SendInput(uint count, Input[] events, int size);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr handle, uint flags);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    public static long RootOwnerAt(int x, int y) {
        Point point; point.x = x; point.y = y;
        IntPtr handle = WindowFromPoint(point);
        return handle == IntPtr.Zero ? 0 : GetAncestor(handle, 3).ToInt64(); // GA_ROOTOWNER
    }
    public static void Click(int x, int y, string button, int count) {
        foreach (int key in new int[] { 0x01, 0x02, 0x04, 0x10, 0x11, 0x12, 0x5B, 0x5C }) {
            if ((GetAsyncKeyState(key) & 0x8000) != 0)
                throw new InvalidOperationException("A mouse button or modifier is already held; no click was sent.");
        }
        Point landed;
        if (!SetCursorPos(x, y) || !GetCursorPos(out landed) || landed.x != x || landed.y != y)
            throw new InvalidOperationException("Cursor did not land on the requested point; no click was sent.");
        // SendInput buttons are physical; honor the user's swapped-button setting.
        bool swapped = GetSystemMetrics(23) != 0;
        uint down, up;
        if (button == "Middle") { down = 0x20; up = 0x40; }
        else if ((button == "Left") != swapped) { down = 0x02; up = 0x04; }
        else { down = 0x08; up = 0x10; }
        Input[] events = new Input[count * 2];
        for (int i = 0; i < events.Length; i++) events[i].mouse.flags = i % 2 == 0 ? down : up;
        int size = Marshal.SizeOf(typeof(Input));
        uint inserted = SendInput((uint)events.Length, events, size);
        if (inserted != events.Length) {
            if (inserted % 2 == 1) SendInput(1, new Input[] { events[inserted] }, size); // one best-effort release
            throw new InvalidOperationException("Incomplete pointer input; re-observe before retrying.");
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

function Get-WindowsUiTitledWindows {
    param([Parameter(Mandatory)][string]$Title)
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    @($root.FindAll(
        [System.Windows.Automation.TreeScope]::Children,
        [System.Windows.Automation.Condition]::TrueCondition) | Where-Object { $_.Current.Name -ceq $Title })
}

function Invoke-WindowsUiTerminalLaunch([string[]]$Arguments) {
    Start-Process -FilePath 'wt.exe' -ArgumentList $Arguments
}

function Start-WindowsUiTerminal {
    param(
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [Parameter(Mandatory)][string[]]$CommandLine,
        [ValidateRange(1,120)][int]$TimeoutSeconds = 20
    )
    # wt.exe treats ';' as a command separator; quotes would break the argument boundaries.
    foreach ($value in @($Title, $WorkingDirectory) + $CommandLine) {
        if ($value -match '[;"]' -or $value -match '[\x00-\x1F]') {
            throw 'Terminal title, directory and command must not contain ; " or control characters.'
        }
    }
    if (-not (Test-Path -LiteralPath $WorkingDirectory -PathType Container)) {
        throw 'Working directory does not exist.'
    }
    if (@(Get-WindowsUiTitledWindows -Title $Title).Count -ne 0) {
        throw "A window titled '$Title' already exists; choose a unique title."
    }
    $quote = { param($v) if ($v -match '\s') { '"' + $v + '"' } else { $v } }
    $arguments = @('-w', 'new', 'new-tab', '--title', (& $quote $Title), '--suppressApplicationTitle',
        '-d', (& $quote $WorkingDirectory)) + @($CommandLine | ForEach-Object { & $quote $_ })
    Invoke-WindowsUiTerminalLaunch $arguments
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        Start-Sleep -Milliseconds 300
        try { return Get-WindowsUiTarget -Title $Title -ProcessName WindowsTerminal } catch { }
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Window '$Title' did not appear within $TimeoutSeconds s; inspect the desktop before retrying."
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

function Get-WindowsUiBounds {
    param([Parameter(Mandatory)]$Target)
    $element = Get-WindowsUiElement $Target
    $bounds = $element.Current.BoundingRectangle
    if ($element.Current.IsOffscreen -or $bounds.Width -le 0 -or $bounds.Height -le 0) {
        throw 'Target is offscreen or has no capturable bounds.'
    }
    [pscustomobject]@{ X=[int]$bounds.X; Y=[int]$bounds.Y; Width=[int]$bounds.Width; Height=[int]$bounds.Height }
}

function Save-WindowsUiSnapshot {
    param([Parameter(Mandatory)]$Target, [Parameter(Mandatory)][string]$OutputPrefix, [switch]$ImageOnly)
    Assert-WindowsUiFocus $Target
    $bounds = Get-WindowsUiBounds $Target
    $text = if ($ImageOnly) { $null } else { Get-WindowsUiText $Target }
    $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        Assert-WindowsUiFocus $Target
        $capturedAt = [DateTime]::UtcNow
        $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bitmap.Size)
        $bitmap.Save(($OutputPrefix + '.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    if (-not $ImageOnly) { $text | Set-Content -LiteralPath ($OutputPrefix + '.txt') -Encoding UTF8 }
    [pscustomobject]@{
        Text = $text; Image = $OutputPrefix + '.png'; Bounds = $bounds
        Handle = $Target.Handle; CapturedAt = $capturedAt
    }
}

function Invoke-WindowsUiKeyInput([uint16]$Code, [bool]$Control) {
    [CatsSkillWindowsInput]::Key($Code, $Control)
}

function Send-WindowsUiKey {
    param(
        [Parameter(Mandatory)]$Target,
        [Parameter(Mandatory)][ValidateSet('Enter','Escape','Up','Down','Left','Right','CtrlC','CtrlD','CtrlV')]
        [string]$Key,
        [Parameter(Mandatory)][string]$ExpectedText
    )
    Assert-WindowsUiFocus $Target
    if ((Get-WindowsUiText $Target) -notmatch $ExpectedText) {
        throw 'Expected screen was not observed; no key was sent.'
    }
    $codes = @{ Enter=13; Escape=27; Up=38; Down=40; Left=37; Right=39; CtrlC=67; CtrlD=68; CtrlV=86 }
    Assert-WindowsUiInputState $Target (Get-WindowsUiInputState $Target)
    Invoke-WindowsUiKeyInput -Code ([uint16]$codes[$Key]) -Control ($Key.StartsWith('Ctrl'))
}

function Invoke-WindowsUiCharInput([char]$Character) {
    [CatsSkillWindowsInput]::Unicode($Character)
}

function Send-WindowsUiText {
    param(
        [Parameter(Mandatory)]$Target,
        [Parameter(Mandatory)][ValidateLength(1,200)][string]$Text,
        [Parameter(Mandatory)][string]$ExpectedText
    )
    # Enter and other keys stay explicit Send-WindowsUiKey calls after the echo is observed.
    if ($Text -match '[\x00-\x1F\x7F]') { throw 'Text must not contain control characters; no text was sent.' }
    Assert-WindowsUiFocus $Target
    if ((Get-WindowsUiText $Target) -notmatch $ExpectedText) {
        throw 'Expected screen was not observed; no text was sent.'
    }
    Assert-WindowsUiInputState $Target (Get-WindowsUiInputState $Target)
    foreach ($character in $Text.ToCharArray()) {
        Assert-WindowsUiFocus $Target
        Invoke-WindowsUiCharInput $character
        Start-Sleep -Milliseconds 30
    }
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

function Get-WindowsUiRootOwnerAt([int]$X, [int]$Y) {
    [CatsSkillWindowsPointer]::RootOwnerAt($X, $Y)
}

function Invoke-WindowsUiPointerInput([int]$X, [int]$Y, [string]$Button, [int]$Count) {
    [CatsSkillWindowsPointer]::Click($X, $Y, $Button, $Count)
}

function Send-WindowsUiClick {
    param(
        [Parameter(Mandatory)]$Target, [Parameter(Mandatory)]$Snapshot,
        [Parameter(Mandatory)][int]$X, [Parameter(Mandatory)][int]$Y,
        [ValidateSet('Left','Right','Middle')][string]$Button = 'Left',
        [ValidateRange(1,3)][int]$Count = 1,
        [ValidateRange(1,600)][int]$MaxSnapshotAgeSeconds = 60
    )
    # X and Y are pixels in the snapshot image; they mean nothing once the window moves.
    if ($Snapshot.Handle -ne $Target.Handle) { throw 'Snapshot belongs to another window; no click was sent.' }
    if (([DateTime]::UtcNow - $Snapshot.CapturedAt).TotalSeconds -gt $MaxSnapshotAgeSeconds) {
        throw 'Snapshot is too old; capture and inspect again before clicking.'
    }
    Assert-WindowsUiFocus $Target
    $bounds = Get-WindowsUiBounds $Target
    foreach ($name in 'X','Y','Width','Height') {
        if ($bounds.$name -ne $Snapshot.Bounds.$name) { throw 'Window moved or resized since the snapshot; no click was sent.' }
    }
    if ($X -lt 0 -or $Y -lt 0 -or $X -ge $bounds.Width -or $Y -ge $bounds.Height) {
        throw 'Point is outside the captured window; no click was sent.'
    }
    $screenX = $bounds.X + $X
    $screenY = $bounds.Y + $Y
    if ((Get-WindowsUiRootOwnerAt $screenX $screenY) -ne $Target.Handle) {
        throw 'Another window covers that point; no click was sent.'
    }
    Invoke-WindowsUiPointerInput -X $screenX -Y $screenY -Button $Button -Count $Count
}

function Invoke-WindowsUiClipboardRead { Get-Clipboard -Raw }

function Invoke-WindowsUiClipboardWrite([string]$Text) { Set-Clipboard -Value $Text }

function Get-WindowsUiClipboardText {
    $text = Invoke-WindowsUiClipboardRead
    if ($null -eq $text -or $text.Length -eq 0) { return $null }
    return [string]$text
}

function Set-WindowsUiClipboardText {
    param([Parameter(Mandatory)][ValidateLength(1,100000)][string]$Text)
    # Replaces the operator's clipboard; the previous content is not restored.
    Invoke-WindowsUiClipboardWrite $Text
    if ((Invoke-WindowsUiClipboardRead) -cne $Text) {
        throw 'Clipboard did not keep the text; another program may have replaced it. Do not paste.'
    }
}
