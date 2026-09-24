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
