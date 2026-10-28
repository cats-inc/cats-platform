<#
.SYNOPSIS
    Tests input guards with simulated UI state; never sends native input or touches the clipboard.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'WindowsUi.ps1')
$target = [pscustomobject]@{ Handle=100; TextSurfaceId='pane-a' }
$script:injected = 0
function Assert-WindowsUiFocus($Target) { }
function Get-WindowsUiText($Target) { $script:screen }
function Get-WindowsUiInputState($Target) { $script:state }
function Invoke-WindowsUiKeyInput([uint16]$Code, [bool]$Control) { $script:injected++ }

function Test-InputCase($Name, $Surfaces, $Focus, $Foreground, $Screen, [bool]$Accept) {
    $script:state = [pscustomobject]@{
        SurfaceIds=@($Surfaces); FocusedAncestorIds=@($Focus); ForegroundHandle=$Foreground
    }
    $script:screen = $Screen
    $script:injected = 0
    $failed = $false
    try {
        Send-WindowsUiKey $target -Key Enter -ExpectedText '(?ms)\A(?=.*^Select Model and Effort$)(?=.*^> 1\. Model A$)'
    } catch { $failed = $true }
    if ($Accept) {
        if ($failed -or $script:injected -ne 1) { throw "$Name rejected valid input." }
    } elseif (-not $failed -or $script:injected -ne 0) { throw "$Name did not block all input." }
    Write-Output "PASS $Name"
}

$menu = "Select Model and Effort`n> 1. Model A"
Test-InputCase 'single inspected pane' @('pane-a') @('pane-a','window') 100 $menu $true
Test-InputCase 'split pane with another pane focused' @('pane-a','pane-b') @('pane-b','window') 100 $menu $false
Test-InputCase 'focus outside inspected pane' @('pane-a') @('tab-strip','window') 100 $menu $false
Test-InputCase 'replaced text surface' @('replacement') @('replacement','window') 100 $menu $false
Test-InputCase 'changed foreground' @('pane-a') @('pane-a','window') 200 $menu $false
Test-InputCase 'selected row changed' @('pane-a') @('pane-a','window') 100 "Select Model and Effort`n> 2. Model B" $false

$script:typed = ''
function Invoke-WindowsUiCharInput([char]$Character) { $script:typed += $Character }

function Test-TextCase($Name, $Text, $Focus, $Screen, [bool]$Accept) {
    $script:state = [pscustomobject]@{
        SurfaceIds=@('pane-a'); FocusedAncestorIds=@($Focus); ForegroundHandle=100
    }
    $script:screen = $Screen
    $script:typed = ''
    $failed = $false
    try { Send-WindowsUiText $target -Text $Text -ExpectedText '(?m)^> $' } catch { $failed = $true }
    if ($Accept) {
        if ($failed -or $script:typed -ne $Text) { throw "$Name rejected valid text." }
    } elseif (-not $failed -or $script:typed.Length -ne 0) { throw "$Name did not block all text." }
    Write-Output "PASS $Name"
}

$prompt = "Claude Code`n> "
Test-TextCase 'text into the inspected prompt' '/model' @('pane-a','window') $prompt $true
Test-TextCase 'text with focus outside the pane' '/model' @('tab-strip','window') $prompt $false
Test-TextCase 'text carrying its own Enter' "/model`r" @('pane-a','window') $prompt $false
Test-TextCase 'text before the prompt appears' '/model' @('pane-a','window') "Claude Code`nLoading" $false

$script:bounds = $null
$script:ownerAtPoint = 0
$script:clicks = @()
function Get-WindowsUiBounds($Target) { $script:bounds }
function Get-WindowsUiRootOwnerAt([int]$X, [int]$Y) { $script:ownerAtPoint }
function Invoke-WindowsUiPointerInput([int]$X, [int]$Y, [string]$Button, [int]$Count) {
    $script:clicks += "$Button x$Count at $X,$Y"
}

function Test-ClickCase($Name, $Snapshot, $Bounds, $Owner, [int]$X, [string]$Expected) {
    $script:bounds = $Bounds
    $script:ownerAtPoint = $Owner
    $script:clicks = @()
    $failed = $false
    try { Send-WindowsUiClick $target -Snapshot $Snapshot -X $X -Y 20 -Button Right -Count 2 } catch { $failed = $true }
    if ($Expected) {
        if ($failed -or ($script:clicks -join ';') -ne $Expected) { throw "$Name rejected a valid click." }
    } elseif (-not $failed -or $script:clicks.Count -ne 0) { throw "$Name did not block the click." }
    Write-Output "PASS $Name"
}

# A monitor left of the primary one gives the window a negative origin.
$window = [pscustomobject]@{ X=-1600; Y=200; Width=800; Height=600 }
$moved = [pscustomobject]@{ X=0; Y=200; Width=800; Height=600 }
$fresh = [pscustomobject]@{ Handle=100; CapturedAt=[DateTime]::UtcNow; Bounds=$window }
$stale = [pscustomobject]@{ Handle=100; CapturedAt=[DateTime]::UtcNow.AddMinutes(-5); Bounds=$window }
$other = [pscustomobject]@{ Handle=200; CapturedAt=[DateTime]::UtcNow; Bounds=$window }
Test-ClickCase 'click inside the captured window' $fresh $window 100 10 'Right x2 at -1590,220'
Test-ClickCase 'snapshot of another window' $other $window 100 10 $null
Test-ClickCase 'stale snapshot' $stale $window 100 10 $null
Test-ClickCase 'window moved since the snapshot' $fresh $moved 100 10 $null
Test-ClickCase 'point outside the image' $fresh $window 100 800 $null
Test-ClickCase 'another window covers the point' $fresh $window 999 10 $null

$script:clipboard = $null
$script:keepsWrites = $true
function Invoke-WindowsUiClipboardRead { $script:clipboard }
function Invoke-WindowsUiClipboardWrite([string]$Text) { if ($script:keepsWrites) { $script:clipboard = $Text } }

if ($null -ne (Get-WindowsUiClipboardText)) { throw 'Empty clipboard did not read as null.' }
Write-Output 'PASS empty clipboard'
Set-WindowsUiClipboardText -Text "line 1`nline 2"
if ((Get-WindowsUiClipboardText) -cne "line 1`nline 2") { throw 'Clipboard text did not round-trip.' }
Write-Output 'PASS clipboard round trip'
$script:keepsWrites = $false
$failed = $false
try { Set-WindowsUiClipboardText -Text 'replaced' } catch { $failed = $true }
if (-not $failed) { throw 'A clipboard write that did not stick was accepted.' }
Write-Output 'PASS clipboard replaced by another program'

$script:launched = $null
$script:titleTaken = $false
function Get-WindowsUiTitledWindows { param($Title) if ($script:titleTaken) { @('existing window') } else { @() } }
function Invoke-WindowsUiTerminalLaunch([string[]]$Arguments) { $script:launched = $Arguments }
function Get-WindowsUiTarget { param($Title, $ProcessName)
    if ($null -eq $script:launched) { throw 'No window yet.' }
    [pscustomobject]@{ Title=$Title; ProcessName=$ProcessName; Handle=300 }
}

function Test-TerminalCase($Name, [string[]]$Command, [bool]$TitleTaken, [bool]$Accept) {
    $script:launched = $null
    $script:titleTaken = $TitleTaken
    $opened = $null
    $failed = $false
    try {
        $opened = Start-WindowsUiTerminal -Title 'Catalog check' -WorkingDirectory $PSScriptRoot `
            -CommandLine $Command -TimeoutSeconds 2
    } catch { $failed = $true }
    if ($Accept) {
        if ($failed -or $opened.Title -ne 'Catalog check' -or
            ($script:launched -join ' ') -notmatch '--title "Catalog check" --suppressApplicationTitle') {
            throw "$Name rejected a valid launch."
        }
    } elseif (-not $failed -or $null -ne $script:launched) { throw "$Name launched despite a guard." }
    Write-Output "PASS $Name"
}

Test-TerminalCase 'new uniquely titled terminal' @('claude', '--safe-mode') $false $true
Test-TerminalCase 'duplicate terminal title' @('claude') $true $false
Test-TerminalCase 'wt command separator in the command' @('claude', ';', 'calc') $false $false
