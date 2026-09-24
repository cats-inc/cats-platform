<#
.SYNOPSIS
    Tests keyboard guards with simulated UI state; never sends native desktop input.
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
