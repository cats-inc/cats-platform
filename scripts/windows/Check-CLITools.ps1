<#
.SYNOPSIS
    Check the Windows self-hosted CLI provider baseline for Cats.

.DESCRIPTION
    Rewrites the environment-bootstrap Windows CLI diagnostic surface into a
    Cats-owned helper by aggregating the repo-owned host, WSL, and Docker
    provider helpers in check-only mode.

.PARAMETER Json
    Emit a structured JSON summary.

.PARAMETER Distro
    Target WSL distro. Defaults to Ubuntu.

.PARAMETER DockerContainer
    Optional Docker container name to audit.

.PARAMETER IncludeWsl
    Include the WSL provider baseline in the audit.

.PARAMETER IncludeDocker
    Include the Docker provider baseline in the audit.

.PARAMETER AllowAdmin
    Allow elevated execution for host helpers that normally prefer user scope.
#>
param(
  [switch]$Json,
  [string]$Distro = 'Ubuntu',
  [string]$DockerContainer = '',
  [switch]$IncludeWsl,
  [switch]$IncludeDocker,
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
    '-CheckOnly',
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

foreach ($helperName in @(
  'Install-ClaudeCode.ps1',
  'Install-CursorAgent.ps1',
  'Install-Goose.ps1',
  'Install-Junie.ps1'
)) {
  $arguments = @()
  if ($AllowAdmin) {
    $arguments += '-AllowAdmin'
  }
  $phaseResult = Invoke-JsonHelper -ScriptName $helperName -Arguments $arguments
  $phases.Add([pscustomobject]@{
    name = $helperName
    status = $phaseResult.status
  })
  if ($phaseResult.status -notin @('ready', 'changes_required', 'not_installed')) {
    $status = 'failed'
  } elseif ($phaseResult.status -ne 'ready' -and $status -ne 'failed') {
    $status = 'changes_required'
  }
}

$nodeArguments = @()
if ($AllowAdmin) {
  $nodeArguments += '-AllowAdmin'
}
$nodeResult = Invoke-JsonHelper -ScriptName 'Install-NodeCliPack.ps1' -Arguments $nodeArguments
$phases.Add([pscustomobject]@{
  name = 'Install-NodeCliPack.ps1'
  status = $nodeResult.status
})
if ($nodeResult.status -notin @('ready', 'changes_required', 'not_installed')) {
  $status = 'failed'
} elseif ($nodeResult.status -ne 'ready' -and $status -ne 'failed') {
  $status = 'changes_required'
}

if ($IncludeWsl) {
  $wslResult = Invoke-JsonHelper -ScriptName 'Install-WSLCLITools.ps1' -Arguments @('-Distro', $Distro)
  $phases.Add([pscustomobject]@{
    name = 'Install-WSLCLITools.ps1'
    status = $wslResult.status
  })
  if ($wslResult.status -notin @('ready', 'changes_required', 'not_installed', 'restart_required', 'first_wsl_boot_required')) {
    $status = 'failed'
  } elseif ($wslResult.status -ne 'ready' -and $status -ne 'failed') {
    $status = 'changes_required'
  }
}

if ($IncludeDocker) {
  if ([string]::IsNullOrWhiteSpace($DockerContainer)) {
    $warnings.Add('Skipping Docker-target audit because -DockerContainer was not supplied.')
    $phases.Add([pscustomobject]@{
      name = 'Install-DockerCLITools.ps1'
      status = 'skipped'
    })
  } else {
    $dockerResult = Invoke-JsonHelper -ScriptName 'Install-DockerCLITools.ps1' -Arguments @('-Container', $DockerContainer)
    $phases.Add([pscustomobject]@{
      name = 'Install-DockerCLITools.ps1'
      status = $dockerResult.status
    })
    if ($dockerResult.status -notin @('ready', 'changes_required', 'not_installed', 'docker_warm_up_required')) {
      $status = 'failed'
    } elseif ($dockerResult.status -ne 'ready' -and $status -ne 'failed') {
      $status = 'changes_required'
    }
  }
}

$result = [pscustomobject]@{
  helper = 'windows-cli-check'
  status = $status
  distro = $Distro
  dockerContainer = if ([string]::IsNullOrWhiteSpace($DockerContainer)) { $null } else { $DockerContainer }
  phases = $phases.ToArray()
  warnings = $warnings.ToArray()
}

Write-StructuredResult -Result $result -ExitCode 0
