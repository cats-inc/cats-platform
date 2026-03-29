<#
.SYNOPSIS
    Inspect Windows packaged setup readiness for Cats.

.DESCRIPTION
    Composes the repo-owned packaged setup helpers into one structured host-side
    readiness audit. The helper is read-only and reports whether the native CLI
    pack substrate and WSL prerequisite substrate are ready, missing, or still
    require changes before deeper provider installation flows can proceed.

.PARAMETER Json
    Emit a structured JSON result.

.PARAMETER IncludeWsl
    Include WSL prerequisite checks. Enabled by default.

.PARAMETER SkipNodeCheck
    Skip probing node/npm binaries for deterministic tests.

.PARAMETER InstalledPackagesJson
    Override the installed npm package set as a JSON array for deterministic
    tests.

.PARAMETER OutdatedPackagesJson
    Override the outdated npm package set as a JSON array for deterministic
    tests.

.PARAMETER DesiredPrefix
    Override the desired npm prefix passed to the sibling prefix helper.

.PARAMETER CurrentPrefix
    Override the current npm prefix passed to the sibling prefix helper.

.PARAMETER CurrentUserPath
    Override the current user PATH passed to the sibling prefix helper.

.PARAMETER WindowsBuild
    Override the detected Windows build for deterministic tests.

.PARAMETER WslState
    Override WSL detection for deterministic tests.

.PARAMETER InstalledDistrosJson
    Override the detected distro list as a JSON array for deterministic tests.
#>
param(
  [switch]$Json,
  [bool]$IncludeWsl = $true,
  [switch]$SkipNodeCheck,
  [string]$InstalledPackagesJson = '',
  [string]$OutdatedPackagesJson = '',
  [string]$DesiredPrefix = '',
  [string]$CurrentPrefix = '',
  [string]$CurrentUserPath = '',
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
    Write-Host "Native CLI pack: $($Result.nativeCliPack.status)"
    if ($null -ne $Result.wsl) {
      Write-Host "WSL prerequisites: $($Result.wsl.status)"
    }
    foreach ($action in $Result.plannedActions) {
      Write-Host "Planned action: $action"
    }
  }
}

function Invoke-HelperJson {
  param(
    [string]$ScriptPath,
    [string[]]$Arguments
  )

  if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) {
    throw "Missing helper at $ScriptPath"
  }

  $raw = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments) | Out-String
  return $raw | ConvertFrom-Json
}

$prefixHelperPath = Join-Path $PSScriptRoot 'Setup-NodeGlobalPrefix.ps1'
$nativeCliPackPath = Join-Path $PSScriptRoot 'Install-NodeCliPack.ps1'
$wslPreflightPath = Join-Path $PSScriptRoot 'Check-WslPrerequisites.ps1'

$nativeCliArguments = @('-CheckOnly', '-Json', '-SkipPrefixHelper')
if ($SkipNodeCheck) {
  $nativeCliArguments += '-SkipNodeCheck'
}
if (-not [string]::IsNullOrWhiteSpace($InstalledPackagesJson)) {
  $nativeCliArguments += @('-InstalledPackagesJson', $InstalledPackagesJson)
}
if (-not [string]::IsNullOrWhiteSpace($OutdatedPackagesJson)) {
  $nativeCliArguments += @('-OutdatedPackagesJson', $OutdatedPackagesJson)
}

$nativeCliPack = Invoke-HelperJson -ScriptPath $nativeCliPackPath -Arguments $nativeCliArguments
$prefixHelperArguments = @('-CheckOnly', '-Json')
if ($SkipNodeCheck) {
  $prefixHelperArguments += '-SkipNodeCheck'
}
if (-not [string]::IsNullOrWhiteSpace($DesiredPrefix)) {
  $prefixHelperArguments += @('-DesiredPrefix', $DesiredPrefix)
}
if (-not [string]::IsNullOrWhiteSpace($CurrentPrefix)) {
  $prefixHelperArguments += @('-CurrentPrefix', $CurrentPrefix)
}
if (-not [string]::IsNullOrWhiteSpace($CurrentUserPath)) {
  $prefixHelperArguments += @('-CurrentUserPath', $CurrentUserPath)
}
$prefixHelper = Invoke-HelperJson -ScriptPath $prefixHelperPath -Arguments $prefixHelperArguments

$wslResult = $null
if ($IncludeWsl) {
  $wslArguments = @('-Json')
  if ($WindowsBuild -gt 0) {
    $wslArguments += @('-WindowsBuild', $WindowsBuild.ToString())
  }
  if ($WslState -ne 'auto') {
    $wslArguments += @('-WslState', $WslState)
  }
  if (-not [string]::IsNullOrWhiteSpace($InstalledDistrosJson)) {
    $wslArguments += @('-InstalledDistrosJson', $InstalledDistrosJson)
  }
  $wslResult = Invoke-HelperJson -ScriptPath $wslPreflightPath -Arguments $wslArguments
}

$warnings = [System.Collections.Generic.List[string]]::new()
$plannedActions = [System.Collections.Generic.List[string]]::new()
$statuses = @($prefixHelper.status, $nativeCliPack.status)
if ($null -ne $wslResult) {
  $statuses += $wslResult.status
}

if ($prefixHelper.status -ne 'ready') {
  $plannedActions.Add('repair_npm_prefix')
}

if ($nativeCliPack.status -ne 'ready') {
  $plannedActions.Add('repair_native_cli_pack')
}

if ($null -ne $wslResult -and $wslResult.status -ne 'ready') {
  foreach ($action in $wslResult.plannedActions) {
    $plannedActions.Add("wsl:$action")
  }
}

foreach ($warning in $prefixHelper.warnings) {
  $warnings.Add([string]$warning)
}
foreach ($warning in $nativeCliPack.warnings) {
  $warnings.Add([string]$warning)
}
if ($null -ne $wslResult) {
  foreach ($warning in $wslResult.warnings) {
    $warnings.Add([string]$warning)
  }
}

$overallStatus = if ($statuses -contains 'failed') {
  'failed'
} elseif ($statuses -contains 'not_installed') {
  'not_installed'
} elseif ($statuses -contains 'changes_required') {
  'changes_required'
} elseif ($statuses -contains 'restart_required') {
  'restart_required'
} else {
  'ready'
}

$result = [pscustomobject]@{
  helper = 'windows-setup-readiness-audit'
  status = $overallStatus
  plannedActions = $plannedActions.ToArray()
  warnings = $warnings.ToArray()
  prefixHelper = $prefixHelper
  nativeCliPack = $nativeCliPack
  wsl = $wslResult
}

Write-StructuredResult -Result $result
