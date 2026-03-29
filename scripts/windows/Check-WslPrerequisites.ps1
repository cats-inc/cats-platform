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
#>
param(
  [switch]$Json,
  [string]$Distro = 'Ubuntu',
  [int]$WindowsBuild = 0,
  [ValidateSet('auto', 'missing', 'installed_no_distro', 'ready')]
  [string]$WslState = 'auto',
  [string]$InstalledDistrosJson = ''
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

$status = if ($plannedActions.Count -gt 0) {
  'changes_required'
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
  installedDistros = $installedDistros
  requiresElevation = $true
  plannedActions = $plannedActions.ToArray()
  warnings = $warnings.ToArray()
}

Write-StructuredResult -Result $result
