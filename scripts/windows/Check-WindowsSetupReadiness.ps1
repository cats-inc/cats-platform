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

.PARAMETER WslUserBootstrapState
    Override whether the target WSL distro has completed first-user bootstrap.

.PARAMETER IncludeNativeProviders
    Include native Claude/Cursor readiness and auth checks. Enabled by default.

.PARAMETER ClaudeInstallState
    Override Claude Code installation detection for deterministic tests.

.PARAMETER ClaudeAuthState
    Override Claude Code authentication detection for deterministic tests.

.PARAMETER CursorInstallState
    Override Cursor Agent installation detection for deterministic tests.

.PARAMETER CursorAuthState
    Override Cursor Agent authentication detection for deterministic tests.
#>
param(
  [switch]$Json,
  [bool]$IncludeWsl = $true,
  [bool]$IncludeNativeProviders = $true,
  [switch]$SkipNodeCheck,
  [string]$InstalledPackagesJson = '',
  [string]$OutdatedPackagesJson = '',
  [string]$DesiredPrefix = '',
  [string]$CurrentPrefix = '',
  [string]$CurrentUserPath = '',
  [int]$WindowsBuild = 0,
  [ValidateSet('auto', 'missing', 'installed_no_distro', 'ready')]
  [string]$WslState = 'auto',
  [string]$InstalledDistrosJson = '',
  [ValidateSet('auto', 'pending', 'completed')]
  [string]$WslUserBootstrapState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$ClaudeInstallState = 'auto',
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$ClaudeAuthState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$CursorInstallState = 'auto',
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$CursorAuthState = 'auto'
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
$claudeHelperPath = Join-Path $PSScriptRoot 'Install-ClaudeCode.ps1'
$cursorHelperPath = Join-Path $PSScriptRoot 'Install-CursorAgent.ps1'

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
  if ($WslUserBootstrapState -ne 'auto') {
    $wslArguments += @('-WslUserBootstrapState', $WslUserBootstrapState)
  }
  $wslResult = Invoke-HelperJson -ScriptPath $wslPreflightPath -Arguments $wslArguments
}

$claudeResult = $null
$cursorResult = $null
if ($IncludeNativeProviders) {
  $claudeArguments = @('-CheckOnly', '-Json')
  if ($ClaudeInstallState -ne 'auto') {
    $claudeArguments += @('-InstallState', $ClaudeInstallState)
  }
  if ($ClaudeAuthState -ne 'auto') {
    $claudeArguments += @('-AuthState', $ClaudeAuthState)
  }
  $claudeResult = Invoke-HelperJson -ScriptPath $claudeHelperPath -Arguments $claudeArguments

  $cursorArguments = @('-CheckOnly', '-Json')
  if ($CursorInstallState -ne 'auto') {
    $cursorArguments += @('-InstallState', $CursorInstallState)
  }
  if ($CursorAuthState -ne 'auto') {
    $cursorArguments += @('-AuthState', $CursorAuthState)
  }
  $cursorResult = Invoke-HelperJson -ScriptPath $cursorHelperPath -Arguments $cursorArguments
}

$warnings = [System.Collections.Generic.List[string]]::new()
$plannedActions = [System.Collections.Generic.List[string]]::new()
$interruptions = [System.Collections.Generic.List[object]]::new()
$statuses = @($prefixHelper.status, $nativeCliPack.status)
if ($null -ne $wslResult) {
  $statuses += $wslResult.status
}
if ($null -ne $claudeResult) {
  $statuses += $claudeResult.status
}
if ($null -ne $cursorResult) {
  $statuses += $cursorResult.status
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
if ($null -ne $claudeResult) {
  if ($claudeResult.status -eq 'not_installed') {
    $plannedActions.Add('provider:install_claude_code_native')
  } elseif ($claudeResult.status -eq 'auth_required') {
    $plannedActions.Add('provider:authenticate_claude_code')
  }
}
if ($null -ne $cursorResult) {
  if ($cursorResult.status -eq 'not_installed') {
    $plannedActions.Add('provider:install_cursor_agent_native')
  } elseif ($cursorResult.status -eq 'auth_required') {
    $plannedActions.Add('provider:authenticate_cursor_agent')
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
if ($null -ne $claudeResult) {
  foreach ($warning in $claudeResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $cursorResult) {
  foreach ($warning in $cursorResult.warnings) {
    $warnings.Add([string]$warning)
  }
}

foreach ($interruption in @($wslResult.interruptions)) {
  $interruptions.Add($interruption)
}
foreach ($interruption in @($claudeResult.interruptions)) {
  $interruptions.Add($interruption)
}
foreach ($interruption in @($cursorResult.interruptions)) {
  $interruptions.Add($interruption)
}

function Test-InterruptionPresent {
  param(
    [string]$Kind
  )

  return @($interruptions) | Where-Object { $_.kind -eq $Kind } | Select-Object -First 1
}

$overallStatus = if ($statuses -contains 'failed') {
  'failed'
} elseif (Test-InterruptionPresent -Kind 'restart_required') {
  'restart_required'
} elseif (Test-InterruptionPresent -Kind 'relaunch_required') {
  'relaunch_required'
} elseif (Test-InterruptionPresent -Kind 'elevation_required') {
  'elevation_required'
} elseif (Test-InterruptionPresent -Kind 'first_wsl_boot_required') {
  'first_wsl_boot_required'
} elseif (Test-InterruptionPresent -Kind 'docker_warm_up_required') {
  'docker_warm_up_required'
} elseif (Test-InterruptionPresent -Kind 'auth_required') {
  'auth_required'
} elseif ($statuses -contains 'not_installed') {
  'not_installed'
} elseif ($statuses -contains 'changes_required') {
  'changes_required'
} else {
  'ready'
}

$result = [pscustomobject]@{
  helper = 'windows-setup-readiness-audit'
  status = $overallStatus
  plannedActions = $plannedActions.ToArray()
  warnings = $warnings.ToArray()
  interruptions = $interruptions.ToArray()
  prefixHelper = $prefixHelper
  nativeCliPack = $nativeCliPack
  wsl = $wslResult
  nativeProviders = [pscustomobject]@{
    claude = $claudeResult
    cursor = $cursorResult
  }
}

Write-StructuredResult -Result $result
