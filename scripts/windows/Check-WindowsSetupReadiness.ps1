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
    Include native Claude/Cursor/Goose/Junie readiness and auth checks.
    Enabled by default.

.PARAMETER IncludeDocker
    Include Docker Desktop warm-state checks. Disabled by default because the
    first packaged baseline does not require Docker.

.PARAMETER IncludeLocalModels
    Include local-model runtime checks such as the repo-owned Ollama helper.
    Disabled by default because the first packaged baseline remains the API
    path, not a required local-model install.

.PARAMETER DockerState
    Override Docker Desktop detection for deterministic tests.

.PARAMETER OllamaInstallState
    Override Ollama installation detection for deterministic tests.

.PARAMETER OllamaApiState
    Override Ollama local API readiness for deterministic tests.

.PARAMETER ClaudeInstallState
    Override Claude Code installation detection for deterministic tests.

.PARAMETER ClaudeAuthState
    Override Claude Code authentication detection for deterministic tests.

.PARAMETER CursorInstallState
    Override Cursor Agent installation detection for deterministic tests.

.PARAMETER CursorAuthState
    Override Cursor Agent authentication detection for deterministic tests.

.PARAMETER GooseInstallState
    Override Goose installation detection for deterministic tests.

.PARAMETER GooseAuthState
    Override Goose authentication detection for deterministic tests.

.PARAMETER JunieInstallState
    Override Junie installation detection for deterministic tests.

.PARAMETER JunieAuthState
    Override Junie authentication detection for deterministic tests.
#>
param(
  [switch]$Json,
  [string]$IncludeWsl = 'true',
  [string]$IncludeNativeProviders = 'true',
  [string]$IncludeDocker = 'false',
  [string]$IncludeLocalModels = 'false',
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
  [string]$CursorAuthState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$GooseInstallState = 'auto',
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$GooseAuthState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$JunieInstallState = 'auto',
  [ValidateSet('auto', 'authenticated', 'auth_required')]
  [string]$JunieAuthState = 'auto',
  [ValidateSet('auto', 'missing', 'installed_engine_stopped', 'ready')]
  [string]$DockerState = 'auto',
  [ValidateSet('auto', 'installed', 'missing')]
  [string]$OllamaInstallState = 'auto',
  [ValidateSet('auto', 'reachable', 'unreachable')]
  [string]$OllamaApiState = 'auto'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '_HiddenProcess.ps1')

function Resolve-BoolArgument {
  param(
    [string]$Name,
    [string]$Value
  )

  $normalized = $Value.Trim().ToLowerInvariant()
  switch ($normalized) {
    'true' { return $true }
    '$true' { return $true }
    '1' { return $true }
    'false' { return $false }
    '$false' { return $false }
    '0' { return $false }
    default {
      throw "Invalid boolean value for -${Name}: $Value"
    }
  }
}

$includeWslEnabled = Resolve-BoolArgument -Name 'IncludeWsl' -Value $IncludeWsl
$includeNativeProvidersEnabled = Resolve-BoolArgument -Name 'IncludeNativeProviders' -Value $IncludeNativeProviders
$includeDockerEnabled = Resolve-BoolArgument -Name 'IncludeDocker' -Value $IncludeDocker
$includeLocalModelsEnabled = Resolve-BoolArgument -Name 'IncludeLocalModels' -Value $IncludeLocalModels

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

  $allArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $ScriptPath) + $Arguments
  $result = Invoke-HiddenCommand -FileName 'powershell.exe' -ArgumentList $allArgs
  return $result.Output | ConvertFrom-Json
}

$prefixHelperPath = Join-Path $PSScriptRoot 'Setup-NodeGlobalPrefix.ps1'
$nativeCliPackPath = Join-Path $PSScriptRoot 'Install-NodeCliPack.ps1'
$wslPreflightPath = Join-Path $PSScriptRoot 'Check-WslPrerequisites.ps1'
$claudeHelperPath = Join-Path $PSScriptRoot 'Install-ClaudeCode.ps1'
$cursorHelperPath = Join-Path $PSScriptRoot 'Install-CursorAgent.ps1'
$gooseHelperPath = Join-Path $PSScriptRoot 'Install-Goose.ps1'
$junieHelperPath = Join-Path $PSScriptRoot 'Install-Junie.ps1'
$dockerHelperPath = Join-Path $PSScriptRoot 'Install-DockerDesktop.ps1'
$ollamaHelperPath = Join-Path $PSScriptRoot 'Install-Ollama.ps1'

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
if ($includeWslEnabled) {
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
$gooseResult = $null
$junieResult = $null
$dockerResult = $null
$ollamaResult = $null
if ($includeNativeProvidersEnabled) {
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

  $gooseArguments = @('-CheckOnly', '-Json')
  if ($GooseInstallState -ne 'auto') {
    $gooseArguments += @('-InstallState', $GooseInstallState)
  }
  if ($GooseAuthState -ne 'auto') {
    $gooseArguments += @('-AuthState', $GooseAuthState)
  }
  $gooseResult = Invoke-HelperJson -ScriptPath $gooseHelperPath -Arguments $gooseArguments

  $junieArguments = @('-CheckOnly', '-Json')
  if ($JunieInstallState -ne 'auto') {
    $junieArguments += @('-InstallState', $JunieInstallState)
  }
  if ($JunieAuthState -ne 'auto') {
    $junieArguments += @('-AuthState', $JunieAuthState)
  }
  $junieResult = Invoke-HelperJson -ScriptPath $junieHelperPath -Arguments $junieArguments
}
if ($includeDockerEnabled) {
  $dockerArguments = @('-CheckOnly', '-Json')
  if ($DockerState -ne 'auto') {
    $dockerArguments += @('-DockerState', $DockerState)
  }
  $dockerResult = Invoke-HelperJson -ScriptPath $dockerHelperPath -Arguments $dockerArguments
}
if ($includeLocalModelsEnabled) {
  $ollamaArguments = @('-CheckOnly', '-Json')
  if ($OllamaInstallState -ne 'auto') {
    $ollamaArguments += @('-InstallState', $OllamaInstallState)
  }
  if ($OllamaApiState -ne 'auto') {
    $ollamaArguments += @('-ApiState', $OllamaApiState)
  }
  $ollamaResult = Invoke-HelperJson -ScriptPath $ollamaHelperPath -Arguments $ollamaArguments
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
if ($null -ne $gooseResult) {
  $statuses += $gooseResult.status
}
if ($null -ne $junieResult) {
  $statuses += $junieResult.status
}
if ($null -ne $dockerResult) {
  $statuses += $dockerResult.status
}
if ($null -ne $ollamaResult) {
  $statuses += $ollamaResult.status
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
if ($null -ne $gooseResult) {
  if ($gooseResult.status -eq 'not_installed') {
    $plannedActions.Add('provider:install_goose_native')
  } elseif ($gooseResult.status -eq 'auth_required') {
    $plannedActions.Add('provider:authenticate_goose')
  }
}
if ($null -ne $junieResult) {
  if ($junieResult.status -eq 'not_installed') {
    $plannedActions.Add('provider:install_junie_native')
  } elseif ($junieResult.status -eq 'auth_required') {
    $plannedActions.Add('provider:authenticate_junie')
  }
}
if ($null -ne $dockerResult) {
  foreach ($action in $dockerResult.plannedActions) {
    $plannedActions.Add("docker:$action")
  }
}
if ($null -ne $ollamaResult) {
  foreach ($action in $ollamaResult.plannedActions) {
    $plannedActions.Add("local_model:$action")
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
if ($null -ne $gooseResult) {
  foreach ($warning in $gooseResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $junieResult) {
  foreach ($warning in $junieResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $dockerResult) {
  foreach ($warning in $dockerResult.warnings) {
    $warnings.Add([string]$warning)
  }
}
if ($null -ne $ollamaResult) {
  foreach ($warning in $ollamaResult.warnings) {
    $warnings.Add([string]$warning)
  }
}

function Add-InterruptionsFromResult {
  param(
    [object]$HelperResult
  )

  if ($null -eq $HelperResult) {
    return
  }

  if (@($HelperResult.PSObject.Properties.Match('interruptions')).Count -eq 0) {
    return
  }

  foreach ($interruption in @($HelperResult.interruptions)) {
    if ($null -eq $interruption) {
      continue
    }
    if (@($interruption.PSObject.Properties.Match('kind')).Count -eq 0) {
      continue
    }
    $interruptions.Add($interruption)
  }
}

Add-InterruptionsFromResult -HelperResult $wslResult
Add-InterruptionsFromResult -HelperResult $claudeResult
Add-InterruptionsFromResult -HelperResult $cursorResult
Add-InterruptionsFromResult -HelperResult $gooseResult
Add-InterruptionsFromResult -HelperResult $junieResult
Add-InterruptionsFromResult -HelperResult $dockerResult
Add-InterruptionsFromResult -HelperResult $ollamaResult

function Test-InterruptionPresent {
  param(
    [string]$Kind
  )

  return @($interruptions) | Where-Object {
    $null -ne $_ -and @($_.PSObject.Properties.Match('kind')).Count -gt 0 -and $_.kind -eq $Kind
  } | Select-Object -First 1
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
    goose = $gooseResult
    junie = $junieResult
  }
  docker = $dockerResult
  localModels = [pscustomobject]@{
    ollama = $ollamaResult
  }
}

Write-StructuredResult -Result $result
