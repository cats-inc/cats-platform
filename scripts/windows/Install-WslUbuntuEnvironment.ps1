<#
.SYNOPSIS
    Install or repair the Windows WSL substrate plus Ubuntu distro for Cats.

.DESCRIPTION
    Rewrites the stable WSL substrate knowledge from environment-bootstrap into
    a Cats-owned packaged setup helper. The helper keeps the existing read-only
    WSL preflight separate, but adds the first repo-owned mutation flow for:

    - enabling the WSL substrate when Windows features are missing
    - setting WSL2 as the default version
    - registering the requested Ubuntu distro without launching it

    The helper is intentionally conservative: when WSL substrate changes are
    applied, it returns `restart_required` and leaves distro installation as the
    next resumable step after reboot.

.PARAMETER CheckOnly
    Report WSL and distro readiness without mutating the machine.

.PARAMETER Apply
    Install missing WSL substrate pieces and the target Ubuntu distro.

.PARAMETER Upgrade
    Refresh the WSL substrate and ensure the target distro is present.

.PARAMETER Force
    Reinstall the target distro and reapply the WSL substrate flow.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER Distro
    Ubuntu distro to ensure. Defaults to Ubuntu.

.PARAMETER WindowsBuild
    Override the detected Windows build for deterministic tests.

.PARAMETER WslState
    Override WSL detection for deterministic tests.

.PARAMETER InstalledDistrosJson
    Override the detected distro list as a JSON array for deterministic tests.

.PARAMETER WslUserBootstrapState
    Override whether the target distro has completed its first-user bootstrap.

.PARAMETER SkipFeatureMutation
    Skip actual WSL substrate mutation. Intended for deterministic tests.

.PARAMETER SkipDistroInstall
    Skip actual distro registration. Intended for deterministic tests.
#>
param(
  [switch]$CheckOnly,
  [switch]$Apply,
  [switch]$Upgrade,
  [switch]$Force,
  [switch]$Json,
  [string]$Distro = 'Ubuntu',
  [int]$WindowsBuild = 0,
  [ValidateSet('auto', 'missing', 'installed_no_distro', 'ready')]
  [string]$WslState = 'auto',
  [string]$InstalledDistrosJson = '',
  [ValidateSet('auto', 'pending', 'completed')]
  [string]$WslUserBootstrapState = 'auto',
  [switch]$SkipFeatureMutation,
  [switch]$SkipDistroInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-StructuredResult {
  param(
    [pscustomobject]$Result,
    [int]$ExitCode
  )

  if ($Json) {
    $Result | ConvertTo-Json -Depth 10
  } else {
    Write-Host "Mode: $($Result.mode)"
    Write-Host "Status: $($Result.status)"
    Write-Host "WSL installed: $($Result.wslInstalled)"
    Write-Host "Distro installed: $($Result.distroInstalled)"
    Write-Host "Restart required: $($Result.restartRequired)"
    foreach ($action in $Result.plannedActions) {
      Write-Host "Planned action: $action"
    }
    foreach ($change in $Result.appliedChanges) {
      Write-Host "Applied change: $change"
    }
    foreach ($warning in $Result.warnings) {
      Write-Host "Warning: $warning"
    }
    foreach ($step in $Result.manualSteps) {
      Write-Host "Manual step: $step"
    }
    foreach ($interruption in $Result.interruptions) {
      Write-Host "Interruption: $($interruption.kind)"
    }
  }

  exit $ExitCode
}

function Invoke-PreflightHelper {
  $helperPath = Join-Path $PSScriptRoot 'Check-WslPrerequisites.ps1'
  if (-not (Test-Path -LiteralPath $helperPath -PathType Leaf)) {
    throw "Missing WSL preflight helper at $helperPath"
  }

  $arguments = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $helperPath,
    '-Json',
    '-Distro', $Distro
  )
  if ($WindowsBuild -gt 0) {
    $arguments += @('-WindowsBuild', $WindowsBuild.ToString())
  }
  if ($WslState -ne 'auto') {
    $arguments += @('-WslState', $WslState)
  }
  if (-not [string]::IsNullOrWhiteSpace($InstalledDistrosJson)) {
    $arguments += @('-InstalledDistrosJson', $InstalledDistrosJson)
  }
  if ($WslUserBootstrapState -ne 'auto') {
    $arguments += @('-WslUserBootstrapState', $WslUserBootstrapState)
  }

  $raw = (& powershell.exe @arguments) | Out-String
  return $raw | ConvertFrom-Json
}

function Invoke-WslCommand {
  param(
    [string[]]$Arguments
  )

  & wsl.exe @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "wsl.exe $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function New-Result {
  param(
    [string]$Mode,
    [string]$Status,
    [pscustomobject]$Preflight,
    [bool]$RequiresElevation,
    [bool]$RestartRequired,
    [string[]]$PlannedActions,
    [string[]]$AppliedChanges,
    [string[]]$Warnings,
    [string[]]$ManualSteps,
    [bool]$WslInstalled,
    [bool]$DistroInstalled,
    [string[]]$InstalledDistros,
    [object[]]$Interruptions
  )

  return [pscustomobject]@{
    helper = 'windows-wsl-environment-installer'
    mode = $Mode
    status = $Status
    distro = $Distro
    windowsBuild = [int]$Preflight.windowsBuild
    minimumBuild = [int]$Preflight.minimumBuild
    wslInstalled = $WslInstalled
    distroInstalled = $DistroInstalled
    installedDistros = $InstalledDistros
    requiresElevation = $RequiresElevation
    restartRequired = $RestartRequired
    plannedActions = $PlannedActions
    appliedChanges = $AppliedChanges
    warnings = $Warnings
    manualSteps = $ManualSteps
    interruptions = $Interruptions
  }
}

if (-not $CheckOnly -and -not $Apply -and -not $Upgrade -and -not $Force) {
  $CheckOnly = $true
}

if ($CheckOnly -and ($Apply -or $Upgrade -or $Force)) {
  throw 'Install-WslUbuntuEnvironment.ps1 accepts either -CheckOnly or one mutation mode.'
}

if ($Force -and $Upgrade) {
  $Upgrade = $false
}

$executionMode = if ($CheckOnly) {
  'check'
} elseif ($Force) {
  'force'
} elseif ($Upgrade) {
  'upgrade'
} else {
  'apply'
}

$preflight = Invoke-PreflightHelper
$requiresElevation = -not [bool]$preflight.wslInstalled

if ($CheckOnly) {
  $result = New-Result `
    -Mode 'check' `
    -Status ([string]$preflight.status) `
    -Preflight $preflight `
    -RequiresElevation $requiresElevation `
    -RestartRequired $false `
    -PlannedActions @($preflight.plannedActions) `
    -AppliedChanges @() `
    -Warnings @($preflight.warnings) `
    -ManualSteps @() `
    -WslInstalled ([bool]$preflight.wslInstalled) `
    -DistroInstalled ([bool]$preflight.distroInstalled) `
    -InstalledDistros @($preflight.installedDistros) `
    -Interruptions @($preflight.interruptions)
  Write-StructuredResult -Result $result -ExitCode 0
}

$appliedChanges = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()
$manualSteps = [System.Collections.Generic.List[string]]::new()
$plannedActions = [System.Collections.Generic.List[string]]::new()
$installedDistros = [System.Collections.Generic.List[string]]::new()
foreach ($name in @($preflight.installedDistros)) {
  $installedDistros.Add([string]$name)
}

$wslInstalled = [bool]$preflight.wslInstalled
$distroInstalled = [bool]$preflight.distroInstalled
$restartRequired = $false
$needsFeatureMutation = -not $wslInstalled
$needsDistroInstall = $Force -or -not $distroInstalled
$firstBootRequired = [string]$preflight.status -eq 'first_wsl_boot_required'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).
  IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

try {
  if ([int]$preflight.windowsBuild -lt [int]$preflight.minimumBuild) {
    $warnings.Add("Windows build $($preflight.windowsBuild) is below the supported WSL2 minimum build $($preflight.minimumBuild).")
    $result = New-Result `
      -Mode $executionMode `
      -Status 'failed' `
      -Preflight $preflight `
      -RequiresElevation $requiresElevation `
      -RestartRequired $false `
      -PlannedActions @($preflight.plannedActions) `
      -AppliedChanges @() `
      -Warnings $warnings.ToArray() `
      -ManualSteps @() `
      -WslInstalled $wslInstalled `
      -DistroInstalled $distroInstalled `
      -InstalledDistros $installedDistros.ToArray() `
      -Interruptions @()
    Write-StructuredResult -Result $result -ExitCode 1
  }

  if ($needsFeatureMutation -and -not $SkipFeatureMutation -and -not $isAdmin) {
    $warnings.Add('Enabling the WSL substrate requires an elevated host-orchestration step.')
    $result = New-Result `
      -Mode $executionMode `
      -Status 'failed' `
      -Preflight $preflight `
      -RequiresElevation $requiresElevation `
      -RestartRequired $false `
      -PlannedActions @($preflight.plannedActions) `
      -AppliedChanges @() `
      -Warnings $warnings.ToArray() `
      -ManualSteps @() `
      -WslInstalled $wslInstalled `
      -DistroInstalled $distroInstalled `
      -InstalledDistros $installedDistros.ToArray() `
      -Interruptions @(
        [pscustomobject]@{
          kind = 'elevation_required'
          summary = 'Enable the WSL substrate from an elevated host step, then rerun the helper.'
          resumable = $true
          requiresRestart = $false
          requiresElevation = $true
        }
      )
    Write-StructuredResult -Result $result -ExitCode 1
  }

  if ($needsFeatureMutation) {
    if (-not $SkipFeatureMutation) {
      Invoke-WslCommand -Arguments @('--install', '--no-distribution')
      Invoke-WslCommand -Arguments @('--set-default-version', '2')
    }
    $appliedChanges.Add('enable_wsl_features')
    $appliedChanges.Add('install_wsl_kernel')
    $appliedChanges.Add('set_default_wsl_version_2')
    $restartRequired = $true
    $wslInstalled = $true
  } elseif ($Upgrade) {
    if (-not $SkipFeatureMutation) {
      Invoke-WslCommand -Arguments @('--update')
      Invoke-WslCommand -Arguments @('--set-default-version', '2')
    }
    $appliedChanges.Add('update_wsl_kernel')
    $appliedChanges.Add('set_default_wsl_version_2')
    $warnings.Add('Ubuntu package upgrades inside the distro remain a manual follow-through in this pilot helper.')
    $manualSteps.Add("After the substrate upgrade, launch `wsl -d $Distro` and update distro packages if needed.")
  }

  if ($Force -and $distroInstalled -and -not $restartRequired) {
    if (-not $SkipDistroInstall) {
      Invoke-WslCommand -Arguments @('--unregister', $Distro)
    }
    $appliedChanges.Add("unregister_distro:$Distro")
    $distroInstalled = $false
    if ($installedDistros.Contains($Distro)) {
      $installedDistros.Remove($Distro)
    }
    $needsDistroInstall = $true
  }

  if ($restartRequired) {
    if (-not $distroInstalled) {
      $plannedActions.Add("install_distro:$Distro")
      $manualSteps.Add('Restart Windows, then rerun this helper to register the Ubuntu distro.')
    }
  } elseif ($needsDistroInstall) {
    if (-not $SkipDistroInstall) {
      Invoke-WslCommand -Arguments @('--install', '-d', $Distro, '--no-launch')
    }
    $appliedChanges.Add($(if ($Force) { "reinstall_distro:$Distro" } else { "install_distro:$Distro" }))
    $distroInstalled = $true
    $firstBootRequired = $true
    if (-not $installedDistros.Contains($Distro)) {
      $installedDistros.Add($Distro)
    }
    $manualSteps.Add("Launch `wsl -d $Distro` once to complete first-user setup before installing WSL-backed providers.")
  }

  $interruptions = [System.Collections.Generic.List[object]]::new()
  if ($restartRequired) {
    $interruptions.Add([pscustomobject]@{
        kind = 'restart_required'
        summary = 'Restart Windows, then rerun this helper to continue the WSL environment setup.'
        resumable = $true
        requiresRestart = $true
        requiresElevation = $false
      })
  } elseif ($firstBootRequired) {
    $interruptions.Add([pscustomobject]@{
        kind = 'first_wsl_boot_required'
        summary = "Launch wsl -d $Distro once to complete first-user setup before installing WSL-backed providers."
        resumable = $true
        requiresRestart = $false
        requiresElevation = $false
      })
  }

  $status = if ($restartRequired) {
    'restart_required'
  } elseif ($firstBootRequired) {
    'first_wsl_boot_required'
  } else {
    'ready'
  }
  $result = New-Result `
    -Mode $executionMode `
    -Status $status `
    -Preflight $preflight `
    -RequiresElevation $requiresElevation `
    -RestartRequired $restartRequired `
    -PlannedActions $plannedActions.ToArray() `
    -AppliedChanges $appliedChanges.ToArray() `
    -Warnings $warnings.ToArray() `
    -ManualSteps $manualSteps.ToArray() `
    -WslInstalled $wslInstalled `
    -DistroInstalled $distroInstalled `
    -InstalledDistros $installedDistros.ToArray() `
    -Interruptions $interruptions.ToArray()
  Write-StructuredResult -Result $result -ExitCode 0
} catch {
  $warnings.Add($_.Exception.Message)
  $result = New-Result `
    -Mode $executionMode `
    -Status 'failed' `
    -Preflight $preflight `
    -RequiresElevation $requiresElevation `
    -RestartRequired $restartRequired `
    -PlannedActions $plannedActions.ToArray() `
    -AppliedChanges $appliedChanges.ToArray() `
    -Warnings $warnings.ToArray() `
    -ManualSteps $manualSteps.ToArray() `
    -WslInstalled $wslInstalled `
    -DistroInstalled $distroInstalled `
    -InstalledDistros $installedDistros.ToArray() `
    -Interruptions @()
  Write-StructuredResult -Result $result -ExitCode 1
}
