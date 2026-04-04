<#
.SYNOPSIS
    Upgrade the Windows self-hosted CLI provider baseline for Cats.

.DESCRIPTION
    Rewrites the shared Windows CLI upgrade orchestration from
    environment-bootstrap into a Cats-owned helper. This wrapper intentionally
    stays outside the packaged setup wizard, but can upgrade:

    - native Windows helpers for Claude Code, Cursor Agent, Goose, and Junie
    - the Windows npm CLI pack helper
    - the WSL CLI helper surface
    - the Docker container CLI helper surface when a container name is supplied

.PARAMETER Json
    Emit a structured JSON summary.

.PARAMETER Distro
    Target WSL distro. Defaults to Ubuntu.

.PARAMETER DockerContainer
    Optional Docker container name. When omitted, Docker-target upgrades are skipped.

.PARAMETER SkipWindowsHost
    Skip native Windows and npm host upgrades.

.PARAMETER SkipWsl
    Skip WSL-target provider upgrades.

.PARAMETER SkipDocker
    Skip Docker-target provider upgrades.

.PARAMETER AllowAdmin
    Allow elevated execution for host helpers that normally prefer user scope.
#>
param(
  [switch]$Json,
  [string]$Distro = 'Ubuntu',
  [string]$DockerContainer = '',
  [switch]$SkipWindowsHost,
  [switch]$SkipWsl,
  [switch]$SkipDocker,
  [switch]$AllowAdmin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_HiddenProcess.ps1')

function Write-StructuredResult {
  param(
    [pscustomobject]$Result,
    [int]$ExitCode
  )

  if ($Json) {
    $Result | ConvertTo-Json -Depth 10
  } else {
    Write-Host "Status: $($Result.status)"
    foreach ($phase in $Result.phases) {
      Write-Host "$($phase.name): $($phase.status)"
    }
    foreach ($warning in $Result.warnings) {
      Write-Host "Warning: $warning"
    }
  }

  exit $ExitCode
}

function Invoke-JsonHelper {
  param(
    [string]$ScriptName,
    [string[]]$Arguments = @()
  )

  $scriptPath = Join-Path $PSScriptRoot $ScriptName
  if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
    throw "Missing helper at $scriptPath"
  }

  $baseArguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $scriptPath,
    '-Json'
  ) + $Arguments
  $result = Invoke-HiddenCommand -FileName 'powershell.exe' -ArgumentList $baseArguments
  if ([string]::IsNullOrWhiteSpace($result.Output)) {
    throw "Helper $ScriptName returned no JSON payload."
  }

  return $result.Output | ConvertFrom-Json
}

$phases = [System.Collections.Generic.List[object]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$status = 'ready'

if (-not $SkipWindowsHost) {
  foreach ($helperName in @(
    'Install-ClaudeCode.ps1',
    'Install-CursorAgent.ps1',
    'Install-Goose.ps1',
    'Install-Junie.ps1'
  )) {
    $arguments = @('-Upgrade')
    if ($AllowAdmin) {
      $arguments += '-AllowAdmin'
    }
    $phaseResult = Invoke-JsonHelper -ScriptName $helperName -Arguments $arguments
    $phases.Add([pscustomobject]@{
      name = $helperName
      status = $phaseResult.status
    })
    if ($phaseResult.status -eq 'failed') {
      $status = 'failed'
    }
  }

  $nodeArguments = @('-Upgrade')
  if ($AllowAdmin) {
    $nodeArguments += '-AllowAdmin'
  }
  $nodeResult = Invoke-JsonHelper -ScriptName 'Install-NodeCliPack.ps1' -Arguments $nodeArguments
  $phases.Add([pscustomobject]@{
    name = 'Install-NodeCliPack.ps1'
    status = $nodeResult.status
  })
  if ($nodeResult.status -eq 'failed') {
    $status = 'failed'
  }
}

if (-not $SkipWsl) {
  $wslResult = Invoke-JsonHelper -ScriptName 'Install-WSLCLITools.ps1' -Arguments @('-Upgrade', '-Distro', $Distro)
  $phases.Add([pscustomobject]@{
    name = 'Install-WSLCLITools.ps1'
    status = $wslResult.status
  })
  if ($wslResult.status -eq 'failed') {
    $status = 'failed'
  }
}

if (-not $SkipDocker) {
  if ([string]::IsNullOrWhiteSpace($DockerContainer)) {
    $warnings.Add('Skipping Docker-target CLI upgrades because -DockerContainer was not supplied.')
    $phases.Add([pscustomobject]@{
      name = 'Install-DockerCLITools.ps1'
      status = 'skipped'
    })
  } else {
    $dockerResult = Invoke-JsonHelper -ScriptName 'Install-DockerCLITools.ps1' -Arguments @('-Upgrade', '-Container', $DockerContainer)
    $phases.Add([pscustomobject]@{
      name = 'Install-DockerCLITools.ps1'
      status = $dockerResult.status
    })
    if ($dockerResult.status -eq 'failed') {
      $status = 'failed'
    }
  }
}

$result = [pscustomobject]@{
  helper = 'windows-cli-upgrade'
  status = $status
  distro = $Distro
  dockerContainer = if ([string]::IsNullOrWhiteSpace($DockerContainer)) { $null } else { $DockerContainer }
  phases = $phases.ToArray()
  warnings = $warnings.ToArray()
}

Write-StructuredResult -Result $result -ExitCode $(if ($status -eq 'failed') { 1 } else { 0 })
