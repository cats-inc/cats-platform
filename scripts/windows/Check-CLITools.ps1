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
    Write-Host "Platform: $($Result.platform)"
    Write-Host "Status: $($Result.status)"
    Write-Host "Ready: $($Result.ready)"
    Write-Host "Summary: present=$($Result.present) missing=$($Result.missing)"
    foreach ($phase in $Result.phases) {
      Write-Host "$($phase.label): $($phase.status) (present=$($phase.present) missing=$($phase.missing))"
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

function Add-Check {
  param(
    [System.Collections.Generic.List[object]]$Checks,
    [string]$Id,
    [string]$Label,
    [string]$Kind,
    [string]$Scope,
    [bool]$Present,
    [string]$Status
  )

  $Checks.Add([pscustomobject]@{
      id = $Id
      label = $Label
      kind = $Kind
      scope = $Scope
      present = $Present
      status = $Status
    }) | Out-Null
}

function Get-CheckCounts {
  param(
    [object[]]$CheckSet
  )

  $presentCount = @($CheckSet | Where-Object { $_.present }).Count
  $missingCount = @($CheckSet | Where-Object { -not $_.present }).Count
  return [pscustomobject]@{
    present = $presentCount
    missing = $missingCount
  }
}

function Add-PhaseSummary {
  param(
    [System.Collections.Generic.List[object]]$Phases,
    [string]$Id,
    [string]$Label,
    [string]$Status,
    [object[]]$CheckSet,
    [string]$Name = ''
  )

  $counts = Get-CheckCounts -CheckSet $CheckSet
  $phaseName = if ([string]::IsNullOrWhiteSpace($Name)) { $Id } else { $Name }
  $Phases.Add([pscustomobject]@{
      id = $Id
      name = $phaseName
      label = $Label
      status = $Status
      present = $counts.present
      missing = $counts.missing
    }) | Out-Null
}

$phases = [System.Collections.Generic.List[object]]::new()
$checks = [System.Collections.Generic.List[object]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$status = 'ready'

foreach ($helper in @(
  @{ ScriptName = 'Install-ClaudeCode.ps1'; Id = 'claude'; Label = 'Claude Code'; Kind = 'native' },
  @{ ScriptName = 'Install-CursorAgent.ps1'; Id = 'cursor'; Label = 'Cursor Agent'; Kind = 'native' },
  @{ ScriptName = 'Install-Goose.ps1'; Id = 'goose'; Label = 'Goose'; Kind = 'native' },
  @{ ScriptName = 'Install-Junie.ps1'; Id = 'junie'; Label = 'Junie'; Kind = 'native' }
)) {
  $arguments = @()
  if ($AllowAdmin) {
    $arguments += '-AllowAdmin'
  }
  $phaseResult = Invoke-JsonHelper -ScriptName $helper.ScriptName -Arguments $arguments
  Add-Check `
    -Checks $checks `
    -Id $helper.Id `
    -Label $helper.Label `
    -Kind $helper.Kind `
    -Scope 'host' `
    -Present ([bool]$phaseResult.installed) `
    -Status ([string]$phaseResult.status)
  if ($phaseResult.status -notin @('ready', 'changes_required', 'not_installed')) {
    $status = 'failed'
  } elseif ($phaseResult.status -ne 'ready' -and $status -ne 'failed') {
    $status = 'changes_required'
  }
}

Add-PhaseSummary `
  -Phases $phases `
  -Id 'host_native_provider_pack' `
  -Label 'Windows native provider pack' `
  -Status (
    if ($status -eq 'failed' -and @($checks | Where-Object { $_.scope -eq 'host' -and $_.kind -eq 'native' -and $_.status -eq 'failed' }).Count -gt 0) {
      'failed'
    } elseif (@($checks | Where-Object { $_.scope -eq 'host' -and $_.kind -eq 'native' -and $_.status -ne 'ready' }).Count -gt 0) {
      'changes_required'
    } else {
      'ready'
    }
  ) `
  -CheckSet @($checks | Where-Object { $_.scope -eq 'host' -and $_.kind -eq 'native' })

$nodeArguments = @()
if ($AllowAdmin) {
  $nodeArguments += '-AllowAdmin'
}
$nodeResult = Invoke-JsonHelper -ScriptName 'Install-NodeCliPack.ps1' -Arguments $nodeArguments
Add-Check `
  -Checks $checks `
  -Id 'node' `
  -Label 'Node.js' `
  -Kind 'core' `
  -Scope 'host' `
  -Present (-not [string]::IsNullOrWhiteSpace($nodeResult.nodeVersion)) `
  -Status (if (-not [string]::IsNullOrWhiteSpace($nodeResult.nodeVersion)) { 'ready' } else { [string]$nodeResult.status })
Add-Check `
  -Checks $checks `
  -Id 'npm' `
  -Label 'npm' `
  -Kind 'core' `
  -Scope 'host' `
  -Present (-not [string]::IsNullOrWhiteSpace($nodeResult.npmVersion)) `
  -Status (if (-not [string]::IsNullOrWhiteSpace($nodeResult.npmVersion)) { 'ready' } else { [string]$nodeResult.status })
Add-Check `
  -Checks $checks `
  -Id 'node_prefix' `
  -Label 'npm global prefix' `
  -Kind 'core' `
  -Scope 'host' `
  -Present ($null -ne $nodeResult.prefixHelper -and $nodeResult.prefixHelper.status -eq 'ready') `
  -Status (if ($null -ne $nodeResult.prefixHelper) { [string]$nodeResult.prefixHelper.status } else { 'changes_required' })

foreach ($package in $nodeResult.packages) {
  $packageStatus = if ($package.installed -and -not $package.outdated) {
    'ready'
  } else {
    'changes_required'
  }
  Add-Check `
    -Checks $checks `
    -Id $package.id `
    -Label $package.label `
    -Kind 'node' `
    -Scope 'host' `
    -Present ([bool]$package.installed) `
    -Status $packageStatus
}
if ($nodeResult.status -notin @('ready', 'changes_required', 'not_installed')) {
  $status = 'failed'
} elseif ($nodeResult.status -ne 'ready' -and $status -ne 'failed') {
  $status = 'changes_required'
}

Add-PhaseSummary `
  -Phases $phases `
  -Id 'host_node_cli_pack' `
  -Label 'Windows host npm CLI pack' `
  -Status ([string]$nodeResult.status) `
  -CheckSet @($checks | Where-Object { $_.scope -eq 'host' -and $_.kind -in @('core', 'node') })

if ($IncludeWsl) {
  $wslResult = Invoke-JsonHelper -ScriptName 'Install-WSLCLITools.ps1' -Arguments @('-Distro', $Distro)
  Add-Check `
    -Checks $checks `
    -Id 'wsl_environment' `
    -Label 'WSL environment' `
    -Kind 'substrate' `
    -Scope 'wsl' `
    -Present ($wslResult.wslEnvironment.status -notin @('missing', 'not_installed', 'prerequisite_missing')) `
    -Status ([string]$wslResult.wslEnvironment.status)
  Add-Check `
    -Checks $checks `
    -Id 'node' `
    -Label 'Node.js (WSL)' `
    -Kind 'core' `
    -Scope 'wsl' `
    -Present ([bool]$wslResult.nodeReady) `
    -Status (if ($wslResult.nodeReady) { 'ready' } else { 'changes_required' })
  foreach ($provider in $wslResult.providers) {
    Add-Check `
      -Checks $checks `
      -Id $provider.id `
      -Label ("{0} (WSL)" -f $provider.id) `
      -Kind ([string]$provider.installKind) `
      -Scope 'wsl' `
      -Present ([bool]$provider.installed) `
      -Status ([string]$provider.status)
  }
  if ($wslResult.status -notin @('ready', 'changes_required', 'not_installed', 'restart_required', 'first_wsl_boot_required')) {
    $status = 'failed'
  } elseif ($wslResult.status -ne 'ready' -and $status -ne 'failed') {
    $status = 'changes_required'
  }

  Add-PhaseSummary `
    -Phases $phases `
    -Id 'wsl_cli_pack' `
    -Label 'WSL CLI provider pack' `
    -Status ([string]$wslResult.status) `
    -CheckSet @($checks | Where-Object { $_.scope -eq 'wsl' })
}

if ($IncludeDocker) {
  if ([string]::IsNullOrWhiteSpace($DockerContainer)) {
    $warnings.Add('Skipping Docker-target audit because -DockerContainer was not supplied.')
    Add-PhaseSummary `
      -Phases $phases `
      -Id 'docker_cli_pack' `
      -Label 'Docker CLI provider pack' `
      -Status 'skipped' `
      -CheckSet @()
  } else {
    $dockerResult = Invoke-JsonHelper -ScriptName 'Install-DockerCLITools.ps1' -Arguments @('-Container', $DockerContainer)
    Add-Check `
      -Checks $checks `
      -Id 'docker_desktop' `
      -Label 'Docker Desktop' `
      -Kind 'substrate' `
      -Scope 'docker' `
      -Present ($dockerResult.dockerDesktop.status -notin @('missing', 'not_installed', 'prerequisite_missing')) `
      -Status ([string]$dockerResult.dockerDesktop.status)
    Add-Check `
      -Checks $checks `
      -Id 'container_running' `
      -Label 'Docker container running' `
      -Kind 'core' `
      -Scope 'docker' `
      -Present ([bool]$dockerResult.containerRunning) `
      -Status (if ($dockerResult.containerRunning) { 'ready' } else { 'changes_required' })
    Add-Check `
      -Checks $checks `
      -Id 'node' `
      -Label 'Node.js (Docker)' `
      -Kind 'core' `
      -Scope 'docker' `
      -Present ([bool]$dockerResult.nodeReady) `
      -Status (if ($dockerResult.nodeReady) { 'ready' } else { 'changes_required' })
    foreach ($provider in $dockerResult.providers) {
      Add-Check `
        -Checks $checks `
        -Id $provider.id `
        -Label ("{0} (Docker)" -f $provider.id) `
        -Kind ([string]$provider.installKind) `
        -Scope 'docker' `
        -Present ([bool]$provider.installed) `
        -Status ([string]$provider.status)
    }
    if ($dockerResult.status -notin @('ready', 'changes_required', 'not_installed', 'docker_warm_up_required')) {
      $status = 'failed'
    } elseif ($dockerResult.status -ne 'ready' -and $status -ne 'failed') {
      $status = 'changes_required'
    }

    Add-PhaseSummary `
      -Phases $phases `
      -Id 'docker_cli_pack' `
      -Label 'Docker CLI provider pack' `
      -Status ([string]$dockerResult.status) `
      -CheckSet @($checks | Where-Object { $_.scope -eq 'docker' })
  }
}

$allChecks = $checks.ToArray()
$allCounts = Get-CheckCounts -CheckSet $allChecks

$result = [pscustomobject]@{
  helper = 'self-hosted-cli-check'
  platform = 'windows'
  status = $status
  ready = ($status -eq 'ready')
  present = $allCounts.present
  missing = $allCounts.missing
  distro = $Distro
  dockerContainer = if ([string]::IsNullOrWhiteSpace($DockerContainer)) { $null } else { $DockerContainer }
  checks = $allChecks
  phases = $phases.ToArray()
  warnings = $warnings.ToArray()
}

Write-StructuredResult -Result $result -ExitCode 0
