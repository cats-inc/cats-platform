<#
.SYNOPSIS
    Inspect Windows WSL prerequisites for packaged Cats setup flows.

.DESCRIPTION
    Creates a Cats-owned structured preflight helper for the Windows WSL
    prerequisite chain. This helper does not enable Windows features or install
    a distro; it reports the current readiness state and the next host-owned
    actions needed before WSL-backed provider installers can run.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER Distro
    Target distro to check. Defaults to Ubuntu.

.PARAMETER WindowsBuild
    Override the detected Windows build for deterministic tests.

.PARAMETER WslState
    Override WSL detection for deterministic tests.
    Supported values: auto, missing, installed_no_distro, ready.

.PARAMETER InstalledDistrosJson
    Override the installed distro list as a JSON array for deterministic tests.

.PARAMETER WslUserBootstrapState
    Override whether the target distro has completed its first-user bootstrap.
#>
param(
  [switch]$Json,
  [string]$Distro = 'Ubuntu',
  [int]$WindowsBuild = 0,
  [ValidateSet('auto', 'missing', 'installed_no_distro', 'ready')]
  [string]$WslState = 'auto',
  [string]$InstalledDistrosJson = '',
  [ValidateSet('auto', 'pending', 'completed')]
  [string]$WslUserBootstrapState = 'auto'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-StructuredResult {
  param(
    [pscustomobject]$Result
  )

  if ($Json) {
    $Result | ConvertTo-Json -Depth 10
  } else {
    Write-Host "Status: $($Result.status)"
    Write-Host "Windows build: $($Result.windowsBuild)"
    Write-Host "WSL installed: $($Result.wslInstalled)"
    Write-Host "Distro installed: $($Result.distroInstalled)"
    foreach ($action in $Result.plannedActions) {
      Write-Host "Planned action: $action"
    }
  }
}

function Parse-JsonArray {
  param(
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return @()
  }

  $parsed = $Value | ConvertFrom-Json
  if ($parsed -is [System.Array]) {
    return @($parsed)
  }
  return @($parsed)
}

function Test-WslUserBootstrapComplete {
  param(
    [string]$TargetDistro
  )

  switch ($WslUserBootstrapState) {
    'pending' {
      return $false
    }
    'completed' {
      return $true
    }
  }

  try {
    & wsl.exe -d $TargetDistro -u root -- sh -lc 'getent passwd 1000 >/dev/null 2>&1' | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

$minimumBuild = 19041
$resolvedBuild = if ($WindowsBuild -gt 0) {
  $WindowsBuild
} else {
  [System.Environment]::OSVersion.Version.Build
}
$warnings = [System.Collections.Generic.List[string]]::new()
$plannedActions = [System.Collections.Generic.List[string]]::new()
$installedDistros = @()
$wslInstalled = $false
$distroInstalled = $false
$firstBootCompleted = $false
$interruptions = [System.Collections.Generic.List[object]]::new()

if (-not [string]::IsNullOrWhiteSpace($InstalledDistrosJson)) {
  $installedDistros = Parse-JsonArray -Value $InstalledDistrosJson
}

switch ($WslState) {
  'missing' {
    $wslInstalled = $false
    $distroInstalled = $false
  }
  'installed_no_distro' {
    $wslInstalled = $true
    $distroInstalled = $false
  }
  'ready' {
    $wslInstalled = $true
    $distroInstalled = $true
    if ($installedDistros.Count -eq 0) {
      $installedDistros = @($Distro)
    }
  }
  default {
    $wslCommand = Get-Command wsl -ErrorAction SilentlyContinue
    if ($null -ne $wslCommand) {
      $null = wsl --status 2>$null
      $wslInstalled = ($LASTEXITCODE -eq 0)
    }

    if ($wslInstalled) {
      if ($installedDistros.Count -eq 0) {
        $wslList = wsl --list --quiet 2>$null
        if ($wslList) {
          $normalizedDistros = $wslList | ForEach-Object { $_ -replace '\0', '' }
          $nonEmptyDistros = $normalizedDistros | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
          $installedDistros = @($nonEmptyDistros | ForEach-Object { $_.Trim() })
        }
      }
      $distroInstalled = $installedDistros -contains $Distro
    }
  }
}

if ($resolvedBuild -lt $minimumBuild) {
  $warnings.Add("Windows build $resolvedBuild is below the WSL2 minimum build $minimumBuild.")
  $plannedActions.Add('update_windows')
}

if (-not $wslInstalled) {
  $plannedActions.Add('enable_wsl_features')
  $plannedActions.Add('install_wsl_kernel')
}

if ($wslInstalled -and -not $distroInstalled) {
  $plannedActions.Add("install_distro:$Distro")
}

if ($wslInstalled -and $distroInstalled) {
  $firstBootCompleted = Test-WslUserBootstrapComplete -TargetDistro $Distro
  if (-not $firstBootCompleted) {
    $plannedActions.Add("complete_first_boot:$Distro")
    $interruptions.Add([pscustomobject]@{
        kind = 'first_wsl_boot_required'
        summary = "Launch wsl -d $Distro once to complete first-user setup before installing WSL-backed providers."
        resumable = $true
        requiresRestart = $false
        requiresElevation = $false
      })
  }
}

if (-not $wslInstalled) {
  $interruptions.Add([pscustomobject]@{
      kind = 'elevation_required'
      summary = 'Enable the WSL substrate from an elevated host step, then rerun the packaged setup check.'
      resumable = $true
      requiresRestart = $false
      requiresElevation = $true
    })
}

$status = if ($resolvedBuild -lt $minimumBuild) {
  'failed'
} elseif (-not $wslInstalled -or -not $distroInstalled) {
  'changes_required'
} elseif (-not $firstBootCompleted) {
  'first_wsl_boot_required'
} else {
  'ready'
}

$result = [pscustomobject]@{
  helper = 'windows-wsl-prerequisite-preflight'
  status = $status
  windowsBuild = $resolvedBuild
  minimumBuild = $minimumBuild
  wslInstalled = $wslInstalled
  distro = $Distro
  distroInstalled = $distroInstalled
  firstBootCompleted = $firstBootCompleted
  installedDistros = $installedDistros
  requiresElevation = $true
  plannedActions = $plannedActions.ToArray()
  warnings = $warnings.ToArray()
  interruptions = $interruptions.ToArray()
}

Write-StructuredResult -Result $result
